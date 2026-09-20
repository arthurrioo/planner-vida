-- Milestone 10: atomic transfer creation and lifecycle operations.
--
-- The physical model already exists from M03. This migration adds explicit
-- transactional entry points for the M10 transfer use case without changing
-- frozen tables, RLS policies, or M09 transaction semantics.

create or replace function public.m10_insert_transfer_from_payload(
  p_transfer jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_amount numeric(19,4) := nullif(p_transfer ->> 'amount', '')::numeric(19,4);
  v_description text := nullif(btrim(p_transfer ->> 'description'), '');
  v_destination public.accounts%rowtype;
  v_destination_account_id uuid := nullif(p_transfer ->> 'destination_account_id', '')::uuid;
  v_inflow public.transactions%rowtype;
  v_outflow public.transactions%rowtype;
  v_source public.accounts%rowtype;
  v_source_account_id uuid := nullif(p_transfer ->> 'source_account_id', '')::uuid;
  v_transfer public.transfers%rowtype;
  v_transfer_date date := nullif(p_transfer ->> 'transfer_date', '')::date;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'm10_transfer_validation: authenticated user required';
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

  if not found or v_source.status <> 'active' then
    raise exception 'm10_transfer_validation: source account must be active';
  end if;

  select *
  into v_destination
  from public.accounts
  where id = v_destination_account_id
    and user_id = v_user_id
  for update;

  if not found or v_destination.status <> 'active' then
    raise exception 'm10_transfer_validation: destination account must be active';
  end if;

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
  returning * into v_transfer;

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
    v_transfer.id,
    'manual',
    'transfer',
    v_transfer.id,
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
    v_transfer.id,
    'manual',
    'transfer',
    v_transfer.id,
    now()
  )
  returning * into v_inflow;

  update public.transfers
  set
    inflow_transaction_id = v_inflow.id,
    outflow_transaction_id = v_outflow.id,
    updated_at = now()
  where id = v_transfer.id
    and user_id = v_user_id
  returning * into v_transfer;

  return jsonb_build_object(
    'transfer', to_jsonb(v_transfer),
    'outflow', to_jsonb(v_outflow),
    'inflow', to_jsonb(v_inflow)
  );
end;
$$;

create or replace function public.create_transfer(
  p_transfer jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  return public.m10_insert_transfer_from_payload(p_transfer);
end;
$$;

create or replace function public.reverse_transfer(
  p_transfer_id uuid,
  p_reversal_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_inflow public.transactions%rowtype;
  v_original public.transfers%rowtype;
  v_original_inflow public.transactions%rowtype;
  v_original_outflow public.transactions%rowtype;
  v_outflow public.transactions%rowtype;
  v_reason text := nullif(btrim(p_reversal_reason), '');
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'm10_transfer_validation: authenticated user required';
  end if;

  if v_reason is null or length(v_reason) < 3 then
    raise exception 'm10_transfer_validation: reversal reason is required';
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

  if v_original.status <> 'posted' or v_original.origin_type <> 'manual' then
    raise exception 'm10_transfer_conflict: only manual posted transfers can be reversed';
  end if;

  if v_original.outflow_transaction_id is null or v_original.inflow_transaction_id is null then
    raise exception 'm10_transfer_conflict: transfer financial movement linkage is incomplete';
  end if;

  select *
  into v_original_outflow
  from public.transactions
  where id = v_original.outflow_transaction_id
    and user_id = v_user_id
  for update;

  if not found or v_original_outflow.status <> 'posted' or v_original_outflow.transaction_type <> 'transfer' then
    raise exception 'm10_transfer_conflict: transfer outflow movement is not reversible';
  end if;

  select *
  into v_original_inflow
  from public.transactions
  where id = v_original.inflow_transaction_id
    and user_id = v_user_id
  for update;

  if not found or v_original_inflow.status <> 'posted' or v_original_inflow.transaction_type <> 'transfer' then
    raise exception 'm10_transfer_conflict: transfer inflow movement is not reversible';
  end if;

  perform 1
  from public.transactions
  where user_id = v_user_id
    and reversal_of_transaction_id in (v_original.outflow_transaction_id, v_original.inflow_transaction_id)
  for update;

  if found then
    raise exception 'm10_transfer_conflict: transfer already has reversal movement rows';
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
    payment_method,
    account_id,
    transfer_id,
    origin_type,
    source_type,
    source_id,
    reversed_at,
    reversal_of_transaction_id,
    reversal_reason
  )
  values (
    v_user_id,
    'transfer',
    'reversed',
    'Reversal: ' || coalesce(v_original_outflow.description, v_original_outflow.id::text),
    v_original_outflow.amount,
    v_original_outflow.currency,
    v_original_outflow.transaction_date,
    v_original_outflow.competence_date,
    v_original_outflow.competence_month,
    v_original_outflow.payment_method,
    v_original_outflow.account_id,
    v_original.id,
    'manual',
    'transfer_reversal',
    v_original.id,
    now(),
    v_original_outflow.id,
    v_reason
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
    reversed_at,
    reversal_of_transaction_id,
    reversal_reason
  )
  values (
    v_user_id,
    'transfer',
    'reversed',
    'Reversal: ' || coalesce(v_original_inflow.description, v_original_inflow.id::text),
    v_original_inflow.amount,
    v_original_inflow.currency,
    v_original_inflow.transaction_date,
    v_original_inflow.competence_date,
    v_original_inflow.competence_month,
    v_original_inflow.payment_method,
    v_original_inflow.account_id,
    v_original.id,
    'manual',
    'transfer_reversal',
    v_original.id,
    now(),
    v_original_inflow.id,
    v_reason
  )
  returning * into v_inflow;

  update public.transactions
  set
    reversed_at = now(),
    reversed_by_transaction_id = v_outflow.id,
    reversal_reason = v_reason,
    status = 'reversed',
    updated_at = now()
  where id = v_original_outflow.id
    and user_id = v_user_id
    and status = 'posted';

  update public.transactions
  set
    reversed_at = now(),
    reversed_by_transaction_id = v_inflow.id,
    reversal_reason = v_reason,
    status = 'reversed',
    updated_at = now()
  where id = v_original_inflow.id
    and user_id = v_user_id
    and status = 'posted';

  update public.transfers
  set
    status = 'reversed',
    updated_at = now()
  where id = v_original.id
    and user_id = v_user_id
    and status = 'posted'
  returning * into v_original;

  if not found then
    raise exception 'm10_transfer_conflict: transfer changed before reversal could complete';
  end if;

  return jsonb_build_object(
    'original', to_jsonb(v_original),
    'reversal_outflow', to_jsonb(v_outflow),
    'reversal_inflow', to_jsonb(v_inflow)
  );
end;
$$;

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
  v_replacement jsonb;
  v_reversal jsonb;
begin
  v_reversal := public.reverse_transfer(p_transfer_id, p_reversal_reason);
  v_replacement := public.m10_insert_transfer_from_payload(p_replacement);

  return jsonb_build_object(
    'original', v_reversal -> 'original',
    'reversal_outflow', v_reversal -> 'reversal_outflow',
    'reversal_inflow', v_reversal -> 'reversal_inflow',
    'replacement', v_replacement
  );
end;
$$;

revoke all on function public.m10_insert_transfer_from_payload(jsonb) from public;
revoke all on function public.create_transfer(jsonb) from public;
revoke all on function public.reverse_transfer(uuid, text) from public;
revoke all on function public.correct_transfer(uuid, text, jsonb) from public;

grant execute on function public.create_transfer(jsonb) to authenticated;
grant execute on function public.m10_insert_transfer_from_payload(jsonb) to authenticated;
grant execute on function public.reverse_transfer(uuid, text) to authenticated;
grant execute on function public.correct_transfer(uuid, text, jsonb) to authenticated;
