-- Milestone 10 review remediation.
--
-- M09 corrective hardening discovered during M10 review: ordinary M09 RPC
-- lifecycle entry points must reject transfer-owned transaction rows at the DB
-- boundary. This migration also aligns M10 correction with the frozen M09
-- historical-reference precedent for archived/closed unchanged accounts.

create or replace function public.correct_transfer(
  p_transfer_id uuid,
  p_reversal_reason text,
  p_replacement jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_amount numeric(19,4) := nullif(p_replacement ->> 'amount', '')::numeric(19,4);
  v_description text := nullif(btrim(p_replacement ->> 'description'), '');
  v_destination public.accounts%rowtype;
  v_destination_account_id uuid := nullif(p_replacement ->> 'destination_account_id', '')::uuid;
  v_inflow public.transactions%rowtype;
  v_original public.transfers%rowtype;
  v_outflow public.transactions%rowtype;
  v_replacement public.transfers%rowtype;
  v_reversal jsonb;
  v_source public.accounts%rowtype;
  v_source_account_id uuid := nullif(p_replacement ->> 'source_account_id', '')::uuid;
  v_transfer_date date := nullif(p_replacement ->> 'transfer_date', '')::date;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'm10_transfer_validation: authenticated user required';
  end if;

  select *
  into v_original
  from public.transfers
  where id = p_transfer_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'm10_transfer_conflict: transfer not found or inaccessible';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'm10_transfer_validation: transfer amount must be positive';
  end if;

  if v_description is null then
    raise exception 'm10_transfer_validation: transfer description is required';
  end if;

  if v_transfer_date is null then
    raise exception 'm10_transfer_validation: transfer date is required';
  end if;

  if v_source_account_id is null or v_destination_account_id is null then
    raise exception 'm10_transfer_validation: transfer accounts are required';
  end if;

  if v_source_account_id = v_destination_account_id then
    raise exception 'm10_transfer_validation: transfer accounts must differ';
  end if;

  select *
  into v_source
  from public.accounts
  where id = v_source_account_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'm10_transfer_validation: source account is invalid';
  end if;

  if v_source.status <> 'active' and v_source_account_id is distinct from v_original.source_account_id then
    raise exception 'm10_transfer_validation: source account must be active when changed';
  end if;

  select *
  into v_destination
  from public.accounts
  where id = v_destination_account_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'm10_transfer_validation: destination account is invalid';
  end if;

  if v_destination.status <> 'active' and v_destination_account_id is distinct from v_original.destination_account_id then
    raise exception 'm10_transfer_validation: destination account must be active when changed';
  end if;

  v_reversal := public.reverse_transfer(p_transfer_id, p_reversal_reason);

  insert into public.transfers (
    user_id,
    source_account_id,
    destination_account_id,
    amount,
    currency,
    transfer_date,
    description,
    status,
    origin_type
  )
  values (
    v_user_id,
    v_source_account_id,
    v_destination_account_id,
    v_amount,
    'BRL',
    v_transfer_date,
    v_description,
    'posted',
    'manual'
  )
  returning * into v_replacement;

  insert into public.transactions (
    user_id,
    transaction_type,
    status,
    description,
    amount,
    currency,
    transaction_date,
    competence_date,
    competence_month,
    payment_method,
    account_id,
    transfer_id,
    origin_type,
    source_type,
    source_id,
    posted_at
  )
  values (
    v_user_id,
    'transfer',
    'posted',
    'Transfer out: ' || v_description,
    v_amount,
    'BRL',
    v_transfer_date,
    v_transfer_date,
    date_trunc('month', v_transfer_date)::date,
    'bank_transfer',
    v_source_account_id,
    v_replacement.id,
    'manual',
    'transfer',
    v_replacement.id,
    now()
  )
  returning * into v_outflow;

  insert into public.transactions (
    user_id,
    transaction_type,
    status,
    description,
    amount,
    currency,
    transaction_date,
    competence_date,
    competence_month,
    payment_method,
    account_id,
    transfer_id,
    origin_type,
    source_type,
    source_id,
    posted_at
  )
  values (
    v_user_id,
    'transfer',
    'posted',
    'Transfer in: ' || v_description,
    v_amount,
    'BRL',
    v_transfer_date,
    v_transfer_date,
    date_trunc('month', v_transfer_date)::date,
    'bank_transfer',
    v_destination_account_id,
    v_replacement.id,
    'manual',
    'transfer',
    v_replacement.id,
    now()
  )
  returning * into v_inflow;

  update public.transfers
  set
    inflow_transaction_id = v_inflow.id,
    outflow_transaction_id = v_outflow.id,
    updated_at = now()
  where id = v_replacement.id
    and user_id = v_user_id
  returning * into v_replacement;

  return jsonb_build_object(
    'original', v_reversal -> 'original',
    'reversal_outflow', v_reversal -> 'reversal_outflow',
    'reversal_inflow', v_reversal -> 'reversal_inflow',
    'replacement', jsonb_build_object(
      'transfer', to_jsonb(v_replacement),
      'outflow', to_jsonb(v_outflow),
      'inflow', to_jsonb(v_inflow)
    )
  );
end;
$$;

create or replace function public.reverse_transaction(
  p_transaction_id uuid,
  p_reversal_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_original public.transactions%rowtype;
  v_reversal public.transactions%rowtype;
  v_reason text := nullif(btrim(p_reversal_reason), '');
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'm09_transaction_validation: authenticated user required';
  end if;

  if v_reason is null or length(v_reason) < 3 then
    raise exception 'm09_transaction_validation: reversal reason is required';
  end if;

  select *
  into v_original
  from public.transactions
  where id = p_transaction_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'm09_transaction_conflict: transaction not found or inaccessible';
  end if;

  if v_original.transaction_type = 'transfer' or v_original.transfer_id is not null then
    raise exception 'm09_transaction_conflict: transfer-owned transactions must use transfer lifecycle';
  end if;

  if v_original.status <> 'posted' or v_original.origin_type <> 'manual' then
    raise exception 'm09_transaction_conflict: only manual posted transactions can be reversed';
  end if;

  perform 1
  from public.transactions
  where user_id = v_user_id
    and reversal_of_transaction_id = p_transaction_id
  for update;

  if found then
    raise exception 'm09_transaction_conflict: transaction already has a reversal';
  end if;

  insert into public.transactions (
    user_id,
    transaction_type,
    status,
    description,
    amount,
    currency,
    transaction_date,
    competence_date,
    competence_month,
    category_id,
    subcategory_id,
    payment_method,
    account_id,
    credit_card_id,
    origin_type,
    source_type,
    source_id,
    external_fingerprint,
    notes,
    reversed_at,
    reversal_of_transaction_id,
    reversal_reason
  )
  values (
    v_original.user_id,
    v_original.transaction_type,
    'reversed',
    'Reversal: ' || coalesce(v_original.description, v_original.id::text),
    v_original.amount,
    v_original.currency,
    v_original.transaction_date,
    v_original.competence_date,
    v_original.competence_month,
    v_original.category_id,
    v_original.subcategory_id,
    v_original.payment_method,
    v_original.account_id,
    v_original.credit_card_id,
    'manual',
    'manual_reversal',
    null,
    null,
    v_original.notes,
    now(),
    v_original.id,
    v_reason
  )
  returning * into v_reversal;

  update public.transactions
  set
    reversed_at = now(),
    reversed_by_transaction_id = v_reversal.id,
    reversal_reason = v_reason,
    status = 'reversed',
    updated_at = now()
  where id = v_original.id
    and user_id = v_user_id
    and status = 'posted'
    and origin_type = 'manual'
    and transaction_type <> 'transfer'
    and transfer_id is null
  returning * into v_original;

  if not found then
    raise exception 'm09_transaction_conflict: transaction changed before reversal could complete';
  end if;

  return jsonb_build_object(
    'original', to_jsonb(v_original),
    'reversal', to_jsonb(v_reversal)
  );
end;
$$;

create or replace function public.correct_transaction(
  p_transaction_id uuid,
  p_reversal_reason text,
  p_replacement jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
  v_category public.categories%rowtype;
  v_credit_card public.credit_cards%rowtype;
  v_original public.transactions%rowtype;
  v_replacement public.transactions%rowtype;
  v_reversal public.transactions%rowtype;
  v_root_category public.categories%rowtype;
  v_subcategory public.categories%rowtype;
  v_account_id uuid := nullif(p_replacement ->> 'account_id', '')::uuid;
  v_amount numeric(19,4) := nullif(p_replacement ->> 'amount', '')::numeric(19,4);
  v_category_id uuid := nullif(p_replacement ->> 'category_id', '')::uuid;
  v_competence_date date := nullif(p_replacement ->> 'competence_date', '')::date;
  v_competence_month date := nullif(p_replacement ->> 'competence_month', '')::date;
  v_credit_card_id uuid := nullif(p_replacement ->> 'credit_card_id', '')::uuid;
  v_description text := nullif(btrim(p_replacement ->> 'description'), '');
  v_notes text := nullif(btrim(p_replacement ->> 'notes'), '');
  v_payment_method public.payment_method := (p_replacement ->> 'payment_method')::public.payment_method;
  v_reason text := nullif(btrim(p_reversal_reason), '');
  v_subcategory_id uuid := nullif(p_replacement ->> 'subcategory_id', '')::uuid;
  v_transaction_date date := nullif(p_replacement ->> 'transaction_date', '')::date;
  v_transaction_type public.transaction_type := (p_replacement ->> 'transaction_type')::public.transaction_type;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'm09_transaction_validation: authenticated user required';
  end if;

  if v_reason is null or length(v_reason) < 3 then
    raise exception 'm09_transaction_validation: reversal reason is required';
  end if;

  if v_transaction_type = 'transfer' then
    raise exception 'm09_transaction_validation: transfers are reserved for M10';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'm09_transaction_validation: posted amount must be positive';
  end if;

  if v_description is null then
    raise exception 'm09_transaction_validation: posted description is required';
  end if;

  if v_transaction_date is null or v_competence_date is null or v_competence_month is null then
    raise exception 'm09_transaction_validation: local dates are required';
  end if;

  if date_trunc('month', v_competence_month)::date <> v_competence_month then
    raise exception 'm09_transaction_validation: competence_month must be first day of month';
  end if;

  select *
  into v_original
  from public.transactions
  where id = p_transaction_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'm09_transaction_conflict: transaction not found or inaccessible';
  end if;

  if v_original.transaction_type = 'transfer' or v_original.transfer_id is not null then
    raise exception 'm09_transaction_conflict: transfer-owned transactions must use transfer lifecycle';
  end if;

  if v_original.status <> 'posted' or v_original.origin_type <> 'manual' then
    raise exception 'm09_transaction_conflict: only manual posted transactions can be corrected';
  end if;

  perform 1
  from public.transactions
  where user_id = v_user_id
    and reversal_of_transaction_id = p_transaction_id
  for update;

  if found then
    raise exception 'm09_transaction_conflict: transaction already has a reversal';
  end if;

  if v_category_id is null then
    raise exception 'm09_transaction_validation: category is required';
  end if;

  select *
  into v_root_category
  from public.categories
  where id = v_category_id
    and user_id = v_user_id;

  if not found or v_root_category.parent_id is not null then
    raise exception 'm09_transaction_validation: root category is invalid';
  end if;

  if v_root_category.archived_at is not null and v_category_id is distinct from v_original.category_id then
    raise exception 'm09_transaction_validation: category must be active when changed';
  end if;

  v_category := v_root_category;

  if v_subcategory_id is not null then
    select *
    into v_subcategory
    from public.categories
    where id = v_subcategory_id
      and user_id = v_user_id;

    if not found or v_subcategory.parent_id is distinct from v_category_id then
      raise exception 'm09_transaction_validation: subcategory is invalid';
    end if;

    if v_subcategory.archived_at is not null and v_subcategory_id is distinct from v_original.subcategory_id then
      raise exception 'm09_transaction_validation: subcategory must be active when changed';
    end if;

    v_category := v_subcategory;
  end if;

  if v_transaction_type = 'income' and (v_root_category.type <> 'income' or v_category.type <> 'income') then
    raise exception 'm09_transaction_validation: income category mismatch';
  end if;

  if v_transaction_type = 'investment' and (v_root_category.type <> 'investment' or v_category.type <> 'investment') then
    raise exception 'm09_transaction_validation: investment category mismatch';
  end if;

  if v_transaction_type = 'expense' and (
    v_root_category.type not in ('fixed_expense', 'variable_expense')
    or v_category.type not in ('fixed_expense', 'variable_expense')
  ) then
    raise exception 'm09_transaction_validation: expense category mismatch';
  end if;

  if v_payment_method = 'credit_card' then
    if v_account_id is not null or v_credit_card_id is null then
      raise exception 'm09_transaction_validation: credit card payment target is invalid';
    end if;

    if v_transaction_type = 'income' then
      raise exception 'm09_transaction_validation: income cannot use credit card payment';
    end if;

    select *
    into v_credit_card
    from public.credit_cards
    where id = v_credit_card_id
      and user_id = v_user_id;

    if not found or v_credit_card.status <> 'active' then
      raise exception 'm09_transaction_validation: credit card must be active';
    end if;
  else
    if v_account_id is null or v_credit_card_id is not null then
      raise exception 'm09_transaction_validation: account payment target is invalid';
    end if;

    select *
    into v_account
    from public.accounts
    where id = v_account_id
      and user_id = v_user_id;

    if not found then
      raise exception 'm09_transaction_validation: account is invalid';
    end if;

    if v_account.status <> 'active' and v_account_id is distinct from v_original.account_id then
      raise exception 'm09_transaction_validation: account must be active when changed';
    end if;

    if v_payment_method in ('benefit_food', 'benefit_meal', 'benefit_culture') and v_account.type <> 'benefit' then
      raise exception 'm09_transaction_validation: benefit methods require benefit account';
    end if;
  end if;

  insert into public.transactions (
    user_id,
    transaction_type,
    status,
    description,
    amount,
    currency,
    transaction_date,
    competence_date,
    competence_month,
    category_id,
    subcategory_id,
    payment_method,
    account_id,
    credit_card_id,
    origin_type,
    source_type,
    source_id,
    external_fingerprint,
    notes,
    reversed_at,
    reversal_of_transaction_id,
    reversal_reason
  )
  values (
    v_original.user_id,
    v_original.transaction_type,
    'reversed',
    'Reversal: ' || coalesce(v_original.description, v_original.id::text),
    v_original.amount,
    v_original.currency,
    v_original.transaction_date,
    v_original.competence_date,
    v_original.competence_month,
    v_original.category_id,
    v_original.subcategory_id,
    v_original.payment_method,
    v_original.account_id,
    v_original.credit_card_id,
    'manual',
    'manual_reversal',
    null,
    null,
    v_original.notes,
    now(),
    v_original.id,
    v_reason
  )
  returning * into v_reversal;

  update public.transactions
  set
    reversed_at = now(),
    reversed_by_transaction_id = v_reversal.id,
    reversal_reason = v_reason,
    status = 'reversed',
    updated_at = now()
  where id = v_original.id
    and user_id = v_user_id
    and status = 'posted'
    and origin_type = 'manual'
    and transaction_type <> 'transfer'
    and transfer_id is null
  returning * into v_original;

  if not found then
    raise exception 'm09_transaction_conflict: transaction changed before correction could complete';
  end if;

  insert into public.transactions (
    user_id,
    transaction_type,
    status,
    description,
    amount,
    currency,
    transaction_date,
    competence_date,
    competence_month,
    category_id,
    subcategory_id,
    payment_method,
    account_id,
    credit_card_id,
    origin_type,
    source_type,
    source_id,
    external_fingerprint,
    notes,
    posted_at
  )
  values (
    v_user_id,
    v_transaction_type,
    'posted',
    v_description,
    v_amount,
    'BRL',
    v_transaction_date,
    v_competence_date,
    v_competence_month,
    v_category_id,
    v_subcategory_id,
    v_payment_method,
    v_account_id,
    v_credit_card_id,
    'manual',
    'manual',
    null,
    null,
    v_notes,
    now()
  )
  returning * into v_replacement;

  return jsonb_build_object(
    'original', to_jsonb(v_original),
    'replacement', to_jsonb(v_replacement),
    'reversal', to_jsonb(v_reversal)
  );
end;
$$;

revoke execute on function public.m10_insert_transfer_from_payload(jsonb) from anon;
revoke execute on function public.create_transfer(jsonb) from anon;
revoke execute on function public.reverse_transfer(uuid, text) from anon;
revoke execute on function public.correct_transfer(uuid, text, jsonb) from anon;
revoke execute on function public.reverse_transaction(uuid, text) from anon;
revoke execute on function public.correct_transaction(uuid, text, jsonb) from anon;

grant execute on function public.create_transfer(jsonb) to authenticated;
grant execute on function public.reverse_transfer(uuid, text) to authenticated;
grant execute on function public.correct_transfer(uuid, text, jsonb) to authenticated;
grant execute on function public.reverse_transaction(uuid, text) to authenticated;
grant execute on function public.correct_transaction(uuid, text, jsonb) to authenticated;
