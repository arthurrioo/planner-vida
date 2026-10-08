-- Milestone 12: installments domain entry points.
--
-- The physical tables were introduced in M03. This migration adds the frozen
-- M12 database maximum and explicit atomic RPCs for plan creation, realization,
-- and cancellation/reversal without hidden triggers.

alter table public.installment_plans
  add constraint installment_plans_total_installments_max_60
  check (total_installments between 1 and 60);

alter table public.installments
  add constraint installments_number_max_60
  check (installment_number between 1 and 60);

create or replace function public.m12_installment_plan_response(
  p_plan_id uuid,
  p_user_id uuid
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'plan', to_jsonb(p),
    'installments', coalesce(
      (
        select jsonb_agg(to_jsonb(i) order by i.installment_number)
        from public.installments i
        where i.user_id = p_user_id
          and i.plan_id = p_plan_id
      ),
      '[]'::jsonb
    )
  )
  from public.installment_plans p
  where p.user_id = p_user_id
    and p.id = p_plan_id
$$;

create or replace function public.create_installment_plan(
  p_plan jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
  v_account_id uuid := nullif(p_plan ->> 'account_id', '')::uuid;
  v_category public.categories%rowtype;
  v_category_id uuid := nullif(p_plan ->> 'category_id', '')::uuid;
  v_credit_card public.credit_cards%rowtype;
  v_credit_card_id uuid := nullif(p_plan ->> 'credit_card_id', '')::uuid;
  v_description text := nullif(btrim(p_plan ->> 'description'), '');
  v_first_due_date date := nullif(p_plan ->> 'first_due_date', '')::date;
  v_installment jsonb;
  v_installment_row public.installments%rowtype;
  v_installments jsonb := coalesce(p_plan -> 'installments', '[]'::jsonb);
  v_merchant_key text := nullif(btrim(p_plan ->> 'merchant_key'), '');
  v_merchant_name text := nullif(btrim(p_plan ->> 'merchant_name'), '');
  v_payment_method public.payment_method := (p_plan ->> 'payment_method')::public.payment_method;
  v_plan public.installment_plans%rowtype;
  v_purchase_date date := nullif(p_plan ->> 'purchase_date', '')::date;
  v_root_category public.categories%rowtype;
  v_source_id uuid := nullif(p_plan ->> 'source_id', '')::uuid;
  v_source_type text := nullif(btrim(p_plan ->> 'source_type'), '');
  v_subcategory public.categories%rowtype;
  v_subcategory_id uuid := nullif(p_plan ->> 'subcategory_id', '')::uuid;
  v_total_amount numeric(19,4) := nullif(p_plan ->> 'total_amount', '')::numeric(19,4);
  v_total_installments integer := nullif(p_plan ->> 'total_installments', '')::integer;
  v_user_id uuid := auth.uid();
  v_expected_number integer := 1;
  v_expected_amount numeric(19,4);
  v_expected_due_date date;
  v_month_start date;
  v_residual_minor bigint;
  v_running_total numeric(19,4) := 0;
  v_total_minor bigint;
begin
  if v_user_id is null then
    raise exception 'm12_installment_validation: authenticated user required';
  end if;

  if v_description is null then
    raise exception 'm12_installment_validation: description is required';
  end if;

  if v_total_amount is null or v_total_amount <= 0 then
    raise exception 'm12_installment_validation: total amount must be positive';
  end if;

  if trunc(v_total_amount * 100) <> v_total_amount * 100 then
    raise exception 'm12_installment_validation: BRL installment total must use cent precision';
  end if;

  if v_total_installments is null or v_total_installments < 1 or v_total_installments > 60 then
    raise exception 'm12_installment_validation: total installments must be between 1 and 60';
  end if;

  if jsonb_typeof(v_installments) <> 'array' or jsonb_array_length(v_installments) <> v_total_installments then
    raise exception 'm12_installment_validation: installment schedule must match total installments';
  end if;

  if v_purchase_date is null or v_first_due_date is null then
    raise exception 'm12_installment_validation: purchase and first due dates are required';
  end if;

  v_total_minor := (v_total_amount * 100)::bigint;
  v_residual_minor := v_total_minor % v_total_installments;

  select *
  into v_category
  from public.categories
  where id = coalesce(v_subcategory_id, v_category_id)
    and user_id = v_user_id
  for update;

  if not found or v_category.archived_at is not null then
    raise exception 'm12_installment_validation: category must be active';
  end if;

  if v_category.parent_id is null then
    v_root_category := v_category;
  else
    v_subcategory := v_category;

    select *
    into v_root_category
    from public.categories
    where id = v_subcategory.parent_id
      and user_id = v_user_id
    for update;

    if not found or v_root_category.archived_at is not null then
      raise exception 'm12_installment_validation: root category must be active';
    end if;
  end if;

  if v_root_category.type not in ('fixed_expense', 'variable_expense') or v_category.type <> v_root_category.type then
    raise exception 'm12_installment_validation: installment category must be an expense category';
  end if;

  if v_payment_method = 'credit_card' then
    if v_credit_card_id is null or v_account_id is not null then
      raise exception 'm12_installment_validation: credit-card installments require only credit_card_id';
    end if;

    select *
    into v_credit_card
    from public.credit_cards
    where id = v_credit_card_id
      and user_id = v_user_id
    for update;

    if not found or v_credit_card.status <> 'active' then
      raise exception 'm12_installment_validation: credit card must be active';
    end if;
  else
    if v_account_id is null or v_credit_card_id is not null then
      raise exception 'm12_installment_validation: account installments require only account_id';
    end if;

    select *
    into v_account
    from public.accounts
    where id = v_account_id
      and user_id = v_user_id
    for update;

    if not found or v_account.status <> 'active' then
      raise exception 'm12_installment_validation: account must be active';
    end if;

    if v_payment_method in ('benefit_food', 'benefit_meal', 'benefit_culture') and v_account.type <> 'benefit' then
      raise exception 'm12_installment_validation: benefit methods require benefit account';
    end if;
  end if;

  insert into public.installment_plans (
    user_id,
    description,
    merchant_name,
    merchant_key,
    total_amount,
    currency,
    total_installments,
    first_due_date,
    purchase_date,
    category_id,
    subcategory_id,
    payment_method,
    account_id,
    credit_card_id,
    status,
    origin_type,
    source_type,
    source_id
  )
  values (
    v_user_id,
    v_description,
    v_merchant_name,
    v_merchant_key,
    v_total_amount,
    'BRL',
    v_total_installments,
    v_first_due_date,
    v_purchase_date,
    v_root_category.id,
    case when v_category.parent_id is null then null else v_category.id end,
    v_payment_method,
    v_account_id,
    v_credit_card_id,
    'active',
    'manual',
    coalesce(v_source_type, 'manual'),
    v_source_id
  )
  returning * into v_plan;

  for v_installment in
    select value from jsonb_array_elements(v_installments)
  loop
    if nullif(v_installment ->> 'installment_number', '')::integer <> v_expected_number then
      raise exception 'm12_installment_validation: installment numbers must be sequential';
    end if;

    if nullif(v_installment ->> 'amount', '')::numeric(19,4) <= 0 then
      raise exception 'm12_installment_validation: installment amount must be positive';
    end if;

    v_expected_amount := (
      (v_total_minor / v_total_installments) +
      case when v_expected_number <= v_residual_minor then 1 else 0 end
    )::numeric / 100;
    v_month_start := (
      date_trunc('month', v_first_due_date)::date +
      make_interval(months => v_expected_number - 1)
    )::date;
    v_expected_due_date := v_month_start + least(
      extract(day from v_first_due_date)::integer - 1,
      extract(day from (v_month_start + interval '1 month - 1 day'))::integer - 1
    );

    if nullif(v_installment ->> 'amount', '')::numeric(19,4) <> v_expected_amount then
      raise exception 'm12_installment_validation: installment rounding must be deterministic';
    end if;

    if nullif(v_installment ->> 'due_date', '')::date is distinct from v_expected_due_date then
      raise exception 'm12_installment_validation: installment due dates must follow the monthly schedule';
    end if;

    if nullif(v_installment ->> 'competence_date', '')::date is distinct from v_expected_due_date then
      raise exception 'm12_installment_validation: installment competence must match its scheduled due date';
    end if;

    v_running_total := v_running_total + nullif(v_installment ->> 'amount', '')::numeric(19,4);

    insert into public.installments (
      user_id,
      plan_id,
      installment_number,
      amount,
      due_date,
      competence_date,
      status
    )
    values (
      v_user_id,
      v_plan.id,
      v_expected_number,
      nullif(v_installment ->> 'amount', '')::numeric(19,4),
      nullif(v_installment ->> 'due_date', '')::date,
      coalesce(
        nullif(v_installment ->> 'competence_date', '')::date,
        nullif(v_installment ->> 'due_date', '')::date
      ),
      'scheduled'
    )
    returning * into v_installment_row;

    insert into public.financial_commitments (
      user_id,
      commitment_type,
      status,
      title,
      description,
      expected_amount,
      currency,
      due_date,
      competence_date,
      category_id,
      subcategory_id,
      account_id,
      credit_card_id,
      installment_id,
      affects_forecast,
      origin_type,
      source_type,
      source_id,
      source_occurrence_key
    )
    values (
      v_user_id,
      'expense',
      'expected',
      v_description || ' (' || v_expected_number || '/' || v_total_installments || ')',
      v_description,
      v_installment_row.amount,
      'BRL',
      v_installment_row.due_date,
      v_installment_row.competence_date,
      v_plan.category_id,
      v_plan.subcategory_id,
      v_plan.account_id,
      v_plan.credit_card_id,
      v_installment_row.id,
      true,
      'installment',
      'installment_plan',
      v_plan.id,
      v_expected_number::text
    );

    update public.installments
    set
      financial_commitment_id = (
        select fc.id
        from public.financial_commitments fc
        where fc.user_id = v_user_id
          and fc.installment_id = v_installment_row.id
      ),
      updated_at = now()
    where id = v_installment_row.id
      and user_id = v_user_id;

    v_expected_number := v_expected_number + 1;
  end loop;

  if v_running_total <> v_total_amount then
    raise exception 'm12_installment_validation: installment sum must equal plan total';
  end if;

  return public.m12_installment_plan_response(v_plan.id, v_user_id);
end;
$$;

create or replace function public.realize_installment(
  p_installment_id uuid,
  p_transaction_date date default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_installment public.installments%rowtype;
  v_plan public.installment_plans%rowtype;
  v_transaction public.transactions%rowtype;
  v_transaction_date date := coalesce(p_transaction_date, current_date);
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'm12_installment_validation: authenticated user required';
  end if;

  select *
  into v_installment
  from public.installments
  where id = p_installment_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'm12_installment_conflict: installment not found or inaccessible';
  end if;

  if v_installment.status <> 'scheduled' or v_installment.transaction_id is not null then
    raise exception 'm12_installment_conflict: only scheduled installments can be realized';
  end if;

  select *
  into v_plan
  from public.installment_plans
  where id = v_installment.plan_id
    and user_id = v_user_id
  for update;

  if not found or v_plan.status <> 'active' then
    raise exception 'm12_installment_conflict: installment plan must be active';
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
    installment_id,
    realized_from_commitment_id,
    origin_type,
    source_type,
    source_id,
    posted_at
  )
  values (
    v_user_id,
    'expense',
    'posted',
    v_plan.description || ' (' || v_installment.installment_number || '/' || v_plan.total_installments || ')',
    v_installment.amount,
    'BRL',
    v_transaction_date,
    coalesce(v_installment.competence_date, v_installment.due_date),
    date_trunc('month', coalesce(v_installment.competence_date, v_installment.due_date))::date,
    v_plan.category_id,
    v_plan.subcategory_id,
    v_plan.payment_method,
    v_plan.account_id,
    v_plan.credit_card_id,
    v_installment.id,
    v_installment.financial_commitment_id,
    'installment',
    'installment',
    v_installment.id,
    now()
  )
  returning * into v_transaction;

  update public.installments
  set
    status = 'posted',
    transaction_id = v_transaction.id,
    updated_at = now()
  where id = v_installment.id
    and user_id = v_user_id;

  update public.financial_commitments
  set
    status = 'realized',
    actual_amount = v_installment.amount,
    variance_amount = 0,
    realized_transaction_id = v_transaction.id,
    realized_at = now(),
    updated_at = now()
  where id = v_installment.financial_commitment_id
    and user_id = v_user_id;

  if not exists (
    select 1
    from public.installments
    where user_id = v_user_id
      and plan_id = v_plan.id
      and status = 'scheduled'
  ) then
    update public.installment_plans
    set status = 'completed', updated_at = now()
    where id = v_plan.id
      and user_id = v_user_id;
  end if;

  return public.m12_installment_plan_response(v_plan.id, v_user_id);
end;
$$;

create or replace function public.cancel_installment_plan(
  p_plan_id uuid,
  p_reversal_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_installment public.installments%rowtype;
  v_original public.transactions%rowtype;
  v_reason text := nullif(btrim(p_reversal_reason), '');
  v_reversal public.transactions%rowtype;
  v_plan public.installment_plans%rowtype;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'm12_installment_validation: authenticated user required';
  end if;

  if v_reason is null or length(v_reason) < 3 then
    raise exception 'm12_installment_validation: cancellation reason is required';
  end if;

  select *
  into v_plan
  from public.installment_plans
  where id = p_plan_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'm12_installment_conflict: plan not found or inaccessible';
  end if;

  if v_plan.status = 'cancelled' then
    return public.m12_installment_plan_response(v_plan.id, v_user_id);
  end if;

  for v_installment in
    select *
    from public.installments
    where user_id = v_user_id
      and plan_id = v_plan.id
    order by installment_number
    for update
  loop
    if v_installment.status = 'posted' and v_installment.transaction_id is not null then
      select *
      into v_original
      from public.transactions
      where id = v_installment.transaction_id
        and user_id = v_user_id
      for update;

      if not found or v_original.status <> 'posted' or v_original.origin_type <> 'installment' then
        raise exception 'm12_installment_conflict: posted installment transaction cannot be reversed';
      end if;

      if v_original.reversed_by_transaction_id is null then
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
          installment_id,
          origin_type,
          source_type,
          source_id,
          notes,
          reversed_at,
          reversal_of_transaction_id,
          reversal_reason
        )
        values (
          v_user_id,
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
          v_installment.id,
          'installment',
          'installment_reversal',
          v_installment.id,
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
          and status = 'posted';
      end if;
    end if;

    update public.installments
    set status = 'cancelled', updated_at = now()
    where id = v_installment.id
      and user_id = v_user_id;

    update public.financial_commitments
    set status = 'cancelled', cancelled_at = now(), updated_at = now()
    where id = v_installment.financial_commitment_id
      and user_id = v_user_id
      and status <> 'cancelled';
  end loop;

  update public.installment_plans
  set status = 'cancelled', updated_at = now()
  where id = v_plan.id
    and user_id = v_user_id;

  return public.m12_installment_plan_response(v_plan.id, v_user_id);
end;
$$;
