-- Milestone 03 - Database Physical Foundation
-- Translation of DATABASE_SCHEMA.md Frozen Phase 1 Data Contract v1.0.
-- This migration intentionally avoids financial business triggers. The only
-- trigger function below maintains technical updated_at timestamps.

set check_function_bodies = off;

create extension if not exists pgcrypto with schema extensions;

create schema if not exists migration_ops;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create type public.transaction_type as enum ('income', 'expense', 'transfer', 'investment');
create type public.transaction_status as enum ('draft', 'posted', 'voided', 'reversed');
create type public.payment_method as enum ('cash', 'debit', 'credit_card', 'pix', 'bank_transfer', 'boleto', 'benefit_food', 'benefit_meal', 'benefit_culture', 'other');
create type public.category_type as enum ('income', 'fixed_expense', 'variable_expense', 'investment', 'transfer');
create type public.account_type as enum ('checking', 'savings', 'wallet', 'cash', 'investment', 'benefit', 'other');
create type public.account_status as enum ('active', 'archived', 'closed');
create type public.credit_card_status as enum ('active', 'paused', 'archived', 'closed');
create type public.installment_plan_status as enum ('active', 'completed', 'cancelled', 'archived');
create type public.installment_status as enum ('scheduled', 'posted', 'cancelled', 'skipped');
create type public.recurrence_frequency as enum ('weekly', 'monthly', 'yearly');
create type public.recurrence_status as enum ('active', 'paused', 'ended', 'cancelled');
create type public.recurrence_target_type as enum ('transaction', 'financial_commitment', 'event', 'task', 'subscription', 'annual_obligation');
create type public.invoice_status as enum ('open', 'closed', 'due', 'overdue', 'partially_paid', 'paid', 'cancelled');
create type public.invoice_item_type as enum ('purchase', 'installment', 'fee', 'interest', 'adjustment', 'refund');
create type public.invoice_payment_status as enum ('draft', 'posted', 'reversed');
create type public.invoice_payment_type as enum ('payment', 'payment_reversal');
create type public.invoice_adjustment_type as enum ('manual_adjustment', 'interest', 'fee', 'refund', 'payment_reversal');
create type public.event_type as enum ('personal', 'financial', 'payment', 'income', 'invoice', 'annual_obligation', 'subscription', 'task', 'other');
create type public.event_status as enum ('scheduled', 'completed', 'cancelled', 'archived');
create type public.task_status as enum ('pending', 'completed', 'cancelled', 'archived');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.commitment_type as enum ('income', 'expense', 'investment', 'transfer');
create type public.commitment_status as enum ('expected', 'confirmed', 'overdue', 'realized', 'cancelled');
create type public.budget_status as enum ('draft', 'active', 'closed', 'archived');
create type public.planning_item_status as enum ('planned', 'expected', 'committed', 'realized', 'cancelled');
create type public.financial_goal_type as enum ('save', 'reduce_expense', 'increase_income', 'pay_debt', 'net_worth', 'purchase');
create type public.financial_goal_status as enum ('active', 'completed', 'paused', 'archived', 'cancelled');
create type public.simulation_status as enum ('draft', 'active', 'archived');
create type public.shopping_list_status as enum ('active', 'archived', 'deleted');
create type public.shopping_item_status as enum ('open', 'purchased', 'skipped', 'deleted');
create type public.wishlist_status as enum ('desired', 'evaluating', 'purchased', 'discarded', 'archived');
create type public.subscription_status as enum ('active', 'paused', 'cancelled', 'archived');
create type public.asset_type as enum ('cash', 'investment', 'vehicle', 'property', 'personal_item', 'other');
create type public.liability_type as enum ('credit_card', 'loan', 'financing', 'tax', 'manual', 'other');
create type public.annual_obligation_type as enum ('ipva', 'iptu', 'insurance', 'annuity', 'professional_fee', 'maintenance', 'other');
create type public.obligation_status as enum ('draft', 'active', 'partially_paid', 'paid', 'overdue', 'cancelled', 'archived');
create type public.provision_status as enum ('active', 'paused', 'completed', 'cancelled');
create type public.indicator_code as enum ('selic', 'cdi', 'ipca', 'di', 'usd_brl', 'other');
create type public.indicator_value_type as enum ('actual', 'estimated', 'assumption');
create type public.import_batch_status as enum ('uploaded', 'processing', 'parsed', 'reviewing', 'ready_to_commit', 'committed', 'failed', 'cancelled');
create type public.import_item_status as enum ('parsed', 'included', 'excluded', 'duplicate_suspected', 'committed', 'failed');
create type public.origin_type as enum ('manual', 'import', 'recurrence', 'installment', 'invoice', 'subscription', 'annual_obligation', 'event', 'task', 'simulation', 'system_job', 'migration');
create type public.audit_severity as enum ('info', 'warning', 'critical');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text not null,
  email text not null,
  default_currency text not null default 'BRL' check (default_currency ~ '^[A-Z]{3}$'),
  default_timezone text not null default 'America/Sao_Paulo',
  locale text not null default 'pt-BR',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'admin')),
  granted_by_user_id uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_roles_user_role_active_uniq unique nulls not distinct (user_id, role, revoked_at)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  type public.account_type not null,
  institution text,
  description text,
  opening_balance numeric(19,4) not null default 0,
  opening_balance_date date not null,
  overdraft_limit numeric(19,4) not null default 0 check (overdraft_limit >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  status public.account_status not null default 'active',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_user_id_id_key unique (user_id, id)
);

create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  brand text,
  credit_limit numeric(19,4) not null default 0 check (credit_limit >= 0),
  account_id uuid,
  closing_day integer not null check (closing_day between 1 and 31),
  due_day integer not null check (due_day between 1 and 31),
  description text,
  status public.credit_card_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_cards_user_id_id_key unique (user_id, id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid,
  name text not null,
  normalized_name text not null,
  type public.category_type not null,
  sort_order integer,
  color_token text,
  icon_key text,
  is_system_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_user_id_id_key unique (user_id, id)
);

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_account_id uuid not null,
  destination_account_id uuid not null,
  amount numeric(19,4) not null check (amount > 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  transfer_date date not null,
  description text not null,
  status public.transaction_status not null default 'posted',
  outflow_transaction_id uuid,
  inflow_transaction_id uuid,
  origin_type public.origin_type not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transfers_accounts_different check (source_account_id <> destination_account_id),
  constraint transfers_status_check check (status in ('posted', 'voided', 'reversed')),
  constraint transfers_user_id_id_key unique (user_id, id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  transaction_type public.transaction_type not null,
  status public.transaction_status not null default 'draft',
  description text,
  amount numeric(19,4) not null check (status <> 'posted' or amount > 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  transaction_date date not null,
  competence_date date not null,
  competence_month date not null,
  category_id uuid,
  subcategory_id uuid,
  payment_method public.payment_method not null,
  account_id uuid,
  credit_card_id uuid,
  transfer_id uuid,
  installment_id uuid,
  recurrence_occurrence_id uuid,
  invoice_id uuid,
  realized_from_commitment_id uuid,
  reversal_of_transaction_id uuid,
  reversed_by_transaction_id uuid,
  origin_type public.origin_type not null default 'manual',
  source_type text,
  source_id uuid,
  external_fingerprint text,
  notes text,
  posted_at timestamptz,
  voided_at timestamptz,
  reversed_at timestamptz,
  reversal_reason text,
  legacy_source_system text,
  legacy_table text,
  legacy_id text,
  legacy_payload_hash text,
  migration_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_competence_month_is_month check (date_trunc('month', competence_month)::date = competence_month),
  constraint transactions_posted_requires_description check (status <> 'posted' or nullif(btrim(description), '') is not null),
  constraint transactions_no_real_simulation_origin check (origin_type <> 'simulation'),
  constraint transactions_user_id_id_key unique (user_id, id)
);

create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  description text not null,
  merchant_name text,
  merchant_key text,
  total_amount numeric(19,4) not null check (total_amount > 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  total_installments integer not null check (total_installments > 0),
  first_due_date date not null,
  purchase_date date not null,
  category_id uuid,
  subcategory_id uuid,
  payment_method public.payment_method not null,
  account_id uuid,
  credit_card_id uuid,
  status public.installment_plan_status not null default 'active',
  origin_type public.origin_type not null default 'manual',
  source_type text,
  source_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint installment_plans_user_id_id_key unique (user_id, id)
);

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null,
  installment_number integer not null check (installment_number > 0),
  amount numeric(19,4) not null check (amount > 0),
  due_date date not null,
  competence_date date,
  status public.installment_status not null default 'scheduled',
  transaction_id uuid,
  financial_commitment_id uuid,
  invoice_id uuid,
  import_item_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint installments_user_id_id_key unique (user_id, id),
  constraint installments_plan_number_uniq unique (plan_id, installment_number)
);

create table public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  target_type public.recurrence_target_type not null,
  frequency public.recurrence_frequency not null,
  interval_count integer not null default 1 check (interval_count > 0),
  start_date date not null,
  end_date date,
  max_occurrences integer check (max_occurrences is null or max_occurrences > 0),
  day_of_week integer check (day_of_week is null or day_of_week between 0 and 6),
  day_of_month integer check (day_of_month is null or day_of_month between 1 and 31),
  month_of_year integer check (month_of_year is null or month_of_year between 1 and 12),
  timezone text not null default 'America/Sao_Paulo',
  template_payload jsonb not null default '{}'::jsonb,
  template_schema_version integer not null default 1 check (template_schema_version > 0),
  status public.recurrence_status not null default 'active',
  last_generated_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurrence_rules_date_range check (end_date is null or end_date >= start_date),
  constraint recurrence_rules_user_id_id_key unique (user_id, id)
);

create table public.recurrence_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  rule_id uuid not null,
  occurrence_number integer not null check (occurrence_number > 0),
  occurrence_date date not null,
  target_type public.recurrence_target_type not null,
  target_id uuid,
  status text not null default 'projected' check (status in ('projected', 'materialized', 'skipped', 'cancelled')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurrence_occurrences_rule_date_target_uniq unique (rule_id, occurrence_date, target_type),
  constraint recurrence_occurrences_user_id_id_key unique (user_id, id)
);

create table public.credit_card_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  credit_card_id uuid not null,
  reference_month date not null,
  cycle_start_date date not null,
  closing_date date not null,
  due_date date not null,
  manual_closing_adjustment_days integer not null default 0,
  manual_closing_adjustment_reason text,
  calculated_total_amount numeric(19,4) not null default 0 check (calculated_total_amount >= 0),
  manual_adjustment_amount numeric(19,4) not null default 0,
  invoice_total_amount numeric(19,4) not null default 0 check (invoice_total_amount >= 0),
  total_paid_amount numeric(19,4) not null default 0 check (total_paid_amount >= 0),
  paid_interest_amount numeric(19,4) not null default 0 check (paid_interest_amount >= 0),
  remaining_amount numeric(19,4) not null default 0 check (remaining_amount >= 0),
  status public.invoice_status not null default 'open',
  is_hidden_from_reports boolean not null default false,
  closed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_card_invoices_reference_month_is_month check (date_trunc('month', reference_month)::date = reference_month),
  constraint credit_card_invoices_normal_cycle check (closing_date <= due_date),
  constraint credit_card_invoices_adjustment_reason check (manual_closing_adjustment_days = 0 or nullif(btrim(manual_closing_adjustment_reason), '') is not null),
  constraint credit_card_invoices_card_month_uniq unique (credit_card_id, reference_month),
  constraint credit_card_invoices_user_id_id_key unique (user_id, id)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  invoice_id uuid not null,
  credit_card_id uuid not null,
  item_type public.invoice_item_type not null,
  transaction_id uuid,
  installment_id uuid,
  import_item_id uuid,
  description text not null,
  amount numeric(19,4) not null check (amount > 0),
  purchase_date date not null,
  competence_date date,
  category_id uuid,
  subcategory_id uuid,
  adjustment_type public.invoice_adjustment_type,
  adjustment_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_items_adjustment_reason check (item_type not in ('adjustment', 'fee', 'interest', 'refund') or adjustment_type is not null),
  constraint invoice_items_user_id_id_key unique (user_id, id)
);

create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  invoice_id uuid not null,
  account_id uuid not null,
  payment_transaction_id uuid,
  payment_type public.invoice_payment_type not null default 'payment',
  payment_date date not null,
  principal_amount numeric(19,4) not null default 0 check (principal_amount >= 0),
  interest_amount numeric(19,4) not null default 0 check (interest_amount >= 0),
  status public.invoice_payment_status not null default 'draft',
  reversal_of_payment_id uuid,
  reversed_by_payment_id uuid,
  reversal_transaction_id uuid,
  reversed_at timestamptz,
  reversal_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_payments_positive_amount check (principal_amount > 0 or interest_amount > 0),
  constraint invoice_payments_reversal_link check (payment_type <> 'payment_reversal' or reversal_of_payment_id is not null),
  constraint invoice_payments_user_id_id_key unique (user_id, id)
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  period_month date not null,
  status public.budget_status not null default 'draft',
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_period_month_is_month check (date_trunc('month', period_month)::date = period_month),
  constraint budgets_user_id_id_key unique (user_id, id)
);

create table public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  budget_id uuid not null,
  category_id uuid not null,
  subcategory_id uuid,
  planned_amount numeric(19,4) not null check (planned_amount >= 0),
  line_type public.category_type not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_lines_budget_category_uniq unique nulls not distinct (budget_id, category_id, subcategory_id),
  constraint budget_lines_user_id_id_key unique (user_id, id)
);

create table public.planning_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  planning_type public.transaction_type not null,
  amount numeric(19,4) not null check (amount > 0),
  period_month date not null,
  planned_date date,
  category_id uuid,
  subcategory_id uuid,
  status public.planning_item_status not null default 'planned',
  affects_forecast boolean not null default true,
  commitment_id uuid,
  transaction_id uuid,
  origin_type public.origin_type not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_items_period_month_is_month check (date_trunc('month', period_month)::date = period_month),
  constraint planning_items_no_real_simulation_origin check (origin_type <> 'simulation'),
  constraint planning_items_user_id_id_key unique (user_id, id)
);

create table public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal_type public.financial_goal_type not null,
  title text not null,
  description text,
  target_amount numeric(19,4) check (target_amount is null or target_amount >= 0),
  target_percentage numeric(12,6),
  target_date date,
  start_date date not null,
  baseline_amount numeric(19,4),
  baseline_period_start date,
  baseline_period_end date,
  current_amount_override numeric(19,4),
  category_id uuid,
  subcategory_id uuid,
  credit_card_id uuid,
  account_id uuid,
  status public.financial_goal_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint financial_goals_baseline_range check (baseline_period_end is null or baseline_period_start is null or baseline_period_end >= baseline_period_start),
  constraint financial_goals_user_id_id_key unique (user_id, id)
);

create table public.simulation_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  status public.simulation_status not null default 'draft',
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint simulation_scenarios_user_id_id_key unique (user_id, id)
);

create table public.simulation_scenario_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scenario_id uuid not null,
  version_number integer not null check (version_number > 0),
  schema_version integer not null check (schema_version > 0),
  simulation_months integer not null check (simulation_months between 1 and 12),
  base_month date not null,
  baseline_period_start date not null,
  baseline_period_end date not null,
  inputs_payload jsonb not null,
  baseline_snapshot jsonb not null,
  results_payload jsonb not null,
  assumptions_payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint simulation_versions_base_month_is_month check (date_trunc('month', base_month)::date = base_month),
  constraint simulation_versions_baseline_range check (baseline_period_end >= baseline_period_start),
  constraint simulation_versions_scenario_version_uniq unique (scenario_id, version_number),
  constraint simulation_scenario_versions_user_id_id_key unique (user_id, id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  event_type public.event_type not null default 'personal',
  status public.event_status not null default 'scheduled',
  is_all_day boolean not null default false,
  start_date date,
  end_date date,
  start_at timestamptz,
  end_at timestamptz,
  timezone text not null default 'America/Sao_Paulo',
  estimated_amount numeric(19,4) check (estimated_amount is null or estimated_amount >= 0),
  financial_impact_type public.commitment_type,
  affects_forecast boolean not null default false,
  category_id uuid,
  account_id uuid,
  credit_card_id uuid,
  recurrence_rule_id uuid,
  financial_commitment_id uuid,
  origin_type public.origin_type not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint events_date_range check (end_date is null or start_date is null or end_date >= start_date),
  constraint events_time_range check (end_at is null or start_at is null or end_at >= start_at),
  constraint events_user_id_id_key unique (user_id, id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  status public.task_status not null default 'pending',
  priority public.task_priority not null default 'medium',
  due_date date,
  due_at timestamptz,
  timezone text not null default 'America/Sao_Paulo',
  category_id uuid,
  event_id uuid,
  financial_commitment_id uuid,
  transaction_id uuid,
  recurrence_rule_id uuid,
  completed_at timestamptz,
  origin_type public.origin_type not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint tasks_user_id_id_key unique (user_id, id)
);

create table public.financial_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  commitment_type public.commitment_type not null,
  status public.commitment_status not null default 'expected',
  title text not null,
  description text,
  expected_amount numeric(19,4) not null check (expected_amount > 0),
  committed_amount numeric(19,4) check (committed_amount is null or committed_amount > 0),
  actual_amount numeric(19,4) check (actual_amount is null or actual_amount >= 0),
  variance_amount numeric(19,4),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  due_date date not null,
  competence_date date,
  category_id uuid,
  subcategory_id uuid,
  account_id uuid,
  credit_card_id uuid,
  event_id uuid,
  task_id uuid,
  installment_id uuid,
  subscription_id uuid,
  annual_obligation_id uuid,
  recurrence_occurrence_id uuid,
  invoice_id uuid,
  affects_forecast boolean not null default true,
  auto_realization_enabled boolean not null default false,
  auto_realization_rule_key text,
  matched_transaction_id uuid,
  match_confidence numeric(12,6) check (match_confidence is null or match_confidence between 0 and 1),
  match_status text check (match_status is null or match_status in ('suggested', 'accepted', 'rejected', 'auto_accepted')),
  origin_type public.origin_type not null default 'manual',
  source_type text,
  source_id uuid,
  source_occurrence_key text,
  realized_transaction_id uuid,
  realized_at timestamptz,
  cancelled_at timestamptz,
  legacy_source_system text,
  legacy_table text,
  legacy_id text,
  legacy_payload_hash text,
  migration_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_commitments_no_real_simulation_origin check (origin_type <> 'simulation'),
  constraint financial_commitments_user_id_id_key unique (user_id, id)
);

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  status public.shopping_list_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint shopping_lists_user_id_id_key unique (user_id, id)
);

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  shopping_list_id uuid not null,
  name text not null,
  description text,
  quantity numeric(19,4) check (quantity is null or quantity > 0),
  unit text,
  estimated_unit_price numeric(19,4) check (estimated_unit_price is null or estimated_unit_price >= 0),
  actual_unit_price numeric(19,4) check (actual_unit_price is null or actual_unit_price >= 0),
  estimated_total_amount numeric(19,4) check (estimated_total_amount is null or estimated_total_amount >= 0),
  status public.shopping_item_status not null default 'open',
  affects_planning boolean not null default false,
  affects_forecast boolean not null default false,
  category_id uuid,
  transaction_id uuid,
  purchased_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopping_list_items_user_id_id_key unique (user_id, id)
);

create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  estimated_price numeric(19,4) check (estimated_price is null or estimated_price >= 0),
  max_price numeric(19,4) check (max_price is null or max_price >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  priority public.task_priority not null default 'medium',
  url text,
  desired_date date,
  status public.wishlist_status not null default 'desired',
  category_id uuid,
  affects_planning boolean not null default false,
  affects_forecast boolean not null default false,
  planning_item_id uuid,
  transaction_id uuid,
  purchased_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wishlist_items_user_id_id_key unique (user_id, id)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  service_name text not null,
  description text,
  amount numeric(19,4) not null check (amount > 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  frequency public.recurrence_frequency not null,
  start_date date not null,
  end_date date,
  next_charge_date date not null,
  account_id uuid,
  credit_card_id uuid,
  category_id uuid,
  subcategory_id uuid,
  recurrence_rule_id uuid,
  status public.subscription_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint subscriptions_date_range check (end_date is null or end_date >= start_date),
  constraint subscriptions_user_id_id_key unique (user_id, id)
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  asset_type public.asset_type not null,
  description text,
  linked_account_id uuid,
  acquisition_date date,
  acquisition_amount numeric(19,4) check (acquisition_amount is null or acquisition_amount >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'active' check (status in ('active', 'sold', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint assets_user_id_id_key unique (user_id, id)
);

create table public.asset_valuations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  asset_id uuid not null,
  valuation_date date not null,
  gross_value numeric(19,4) not null check (gross_value >= 0),
  net_value numeric(19,4) check (net_value is null or net_value >= 0),
  source_type public.origin_type not null default 'manual',
  source_description text,
  created_at timestamptz not null default now(),
  constraint asset_valuations_asset_date_uniq unique (asset_id, valuation_date),
  constraint asset_valuations_user_id_id_key unique (user_id, id)
);

create table public.liabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  liability_type public.liability_type not null,
  description text,
  linked_credit_card_id uuid,
  linked_account_id uuid,
  start_date date,
  original_amount numeric(19,4) check (original_amount is null or original_amount >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'active' check (status in ('active', 'paid', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint liabilities_user_id_id_key unique (user_id, id)
);

create table public.liability_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  liability_id uuid not null,
  balance_date date not null,
  outstanding_amount numeric(19,4) not null check (outstanding_amount >= 0),
  source_type public.origin_type not null default 'manual',
  created_at timestamptz not null default now(),
  constraint liability_balances_liability_date_uniq unique (liability_id, balance_date),
  constraint liability_balances_user_id_id_key unique (user_id, id)
);

create table public.annual_obligations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  obligation_type public.annual_obligation_type not null,
  title text not null,
  description text,
  fiscal_year integer not null check (fiscal_year between 1900 and 2200),
  jurisdiction_country text not null default 'BR',
  jurisdiction_state text,
  jurisdiction_city text,
  asset_id uuid,
  assessed_base_amount numeric(19,4) check (assessed_base_amount is null or assessed_base_amount >= 0),
  rate_percentage numeric(12,6) check (rate_percentage is null or rate_percentage >= 0),
  calculated_amount numeric(19,4) check (calculated_amount is null or calculated_amount >= 0),
  manual_amount numeric(19,4) check (manual_amount is null or manual_amount >= 0),
  final_amount numeric(19,4) not null check (final_amount >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  due_date date not null,
  installment_count integer not null default 1 check (installment_count > 0),
  payment_method public.payment_method,
  account_id uuid,
  credit_card_id uuid,
  category_id uuid,
  subcategory_id uuid,
  status public.obligation_status not null default 'draft',
  provision_enabled boolean not null default false,
  recurrence_rule_id uuid,
  manual_override_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint annual_obligations_manual_reason check (manual_amount is null or nullif(btrim(manual_override_reason), '') is not null),
  constraint annual_obligations_user_id_id_key unique (user_id, id)
);

create table public.annual_obligation_installments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  annual_obligation_id uuid not null,
  installment_number integer not null check (installment_number > 0),
  amount numeric(19,4) not null check (amount > 0),
  due_date date not null,
  status public.commitment_status not null default 'expected',
  financial_commitment_id uuid,
  transaction_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_obligation_installments_number_uniq unique (annual_obligation_id, installment_number),
  constraint annual_obligation_installments_user_id_id_key unique (user_id, id)
);

create table public.provisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  annual_obligation_id uuid not null,
  provision_month date not null,
  amount numeric(19,4) not null check (amount >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  status public.provision_status not null default 'active',
  affects_economic_view boolean not null default true,
  affects_cash_view boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provisions_cash_view_false check (affects_cash_view = false),
  constraint provisions_month_is_month check (date_trunc('month', provision_month)::date = provision_month),
  constraint provisions_obligation_month_uniq unique (annual_obligation_id, provision_month),
  constraint provisions_user_id_id_key unique (user_id, id)
);

create table public.economic_indicators (
  id uuid primary key default gen_random_uuid(),
  code public.indicator_code not null unique,
  name text not null,
  source_name text not null,
  source_url text,
  frequency text not null check (frequency in ('daily', 'monthly', 'yearly')),
  unit text not null check (unit in ('percent', 'index', 'rate')),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.economic_indicator_values (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references public.economic_indicators(id) on delete cascade,
  reference_date date not null,
  reference_month date,
  value numeric(24,10) not null,
  value_type public.indicator_value_type not null,
  source_name text not null,
  source_url text,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  constraint economic_indicator_values_reference_month_is_month check (reference_month is null or date_trunc('month', reference_month)::date = reference_month),
  constraint economic_indicator_values_indicator_date_type_uniq unique (indicator_id, reference_date, value_type)
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  import_type text not null default 'credit_card_invoice_pdf' check (import_type in ('credit_card_invoice_pdf')),
  status public.import_batch_status not null default 'uploaded',
  credit_card_id uuid not null,
  invoice_id uuid,
  reference_month date not null,
  original_file_name text not null,
  file_mime_type text not null,
  file_size_bytes integer not null check (file_size_bytes > 0),
  file_sha256 text,
  storage_bucket text not null default 'invoice-imports',
  storage_path text,
  retention_policy text not null default 'retain_original' check (retention_policy in ('retain_original', 'manual_deleted')),
  storage_deleted_at timestamptz,
  storage_deleted_by_user_id uuid,
  password_provided boolean not null default false,
  parser_provider text,
  parser_model text,
  parser_schema_version integer check (parser_schema_version is null or parser_schema_version > 0),
  parsed_item_count integer not null default 0 check (parsed_item_count >= 0),
  included_item_count integer not null default 0 check (included_item_count >= 0),
  duplicate_item_count integer not null default 0 check (duplicate_item_count >= 0),
  error_message text,
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  committed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_batches_reference_month_is_month check (date_trunc('month', reference_month)::date = reference_month),
  constraint import_batches_storage_path_when_file_hash check (file_sha256 is null or storage_path is not null),
  constraint import_batches_user_id_id_key unique (user_id, id)
);

create table public.import_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  batch_id uuid not null,
  line_number integer not null check (line_number > 0),
  raw_description text not null,
  normalized_description text,
  merchant_name text,
  merchant_key text,
  transaction_date date not null,
  amount numeric(19,4) not null check (amount > 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  installment_number integer check (installment_number is null or installment_number > 0),
  total_installments integer check (total_installments is null or total_installments > 0),
  suggested_category_id uuid,
  suggested_subcategory_id uuid,
  reviewed_category_id uuid,
  reviewed_subcategory_id uuid,
  reviewed_description text,
  reviewed_amount numeric(19,4) check (reviewed_amount is null or reviewed_amount > 0),
  reviewed_transaction_date date,
  status public.import_item_status not null default 'parsed',
  dedupe_key text not null,
  line_fingerprint text not null,
  duplicate_of_transaction_id uuid,
  duplicate_of_import_item_id uuid,
  matched_commitment_id uuid,
  match_status text not null default 'not_applicable' check (match_status in ('suggested', 'accepted', 'rejected', 'not_applicable')),
  transaction_id uuid,
  installment_plan_id uuid,
  installment_id uuid,
  invoice_item_id uuid,
  parser_confidence numeric(12,6) check (parser_confidence is null or parser_confidence between 0 and 1),
  parser_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_items_batch_line_fingerprint_uniq unique (batch_id, line_fingerprint),
  constraint import_items_user_id_id_key unique (user_id, id)
);

create table public.merchant_category_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  merchant_key text not null,
  display_merchant_name text not null,
  category_id uuid not null,
  subcategory_id uuid,
  hit_count integer not null default 0 check (hit_count >= 0),
  last_used_at timestamptz,
  last_import_item_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_category_mappings_user_merchant_uniq unique (user_id, merchant_key),
  constraint merchant_category_mappings_user_id_id_key unique (user_id, id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_role text not null check (actor_role in ('user', 'admin', 'system')),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  severity public.audit_severity not null default 'info',
  success boolean not null default true,
  error_code text,
  error_message text,
  before_snapshot jsonb,
  after_snapshot jsonb,
  metadata jsonb not null default '{}'::jsonb,
  correlation_id text,
  request_id text,
  import_batch_id uuid,
  ip_address_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint audit_logs_user_id_id_key unique (user_id, id)
);

create table public.system_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  idempotency_key text not null,
  status text not null check (status in ('started', 'completed', 'failed', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  processed_count integer not null default 0 check (processed_count >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  correlation_id text,
  created_at timestamptz not null default now(),
  constraint system_job_runs_job_idempotency_uniq unique (job_name, idempotency_key)
);

create table public.admin_observability_metrics (
  id uuid primary key default gen_random_uuid(),
  metric_date date not null,
  metric_window_start_at timestamptz not null,
  metric_window_end_at timestamptz not null,
  module text not null,
  metric_name text not null,
  metric_value numeric(24,10) not null,
  metric_unit text not null,
  aggregation_type text not null check (aggregation_type in ('count', 'sum', 'min', 'max', 'avg', 'median', 'p95')),
  dimension_key text,
  dimension_value text,
  threshold_value numeric(24,10),
  is_anomaly boolean not null default false,
  source_job_run_id uuid references public.system_job_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint admin_observability_window_range check (metric_window_end_at >= metric_window_start_at)
);

comment on table public.provisions is
  'Economic accrual layer only. DATABASE_SCHEMA.md reserves origin_type=simulation away from non-hypothetical provisions; this table has no origin_type column in M03.';
comment on table public.admin_observability_metrics is
  'Aggregate operational metrics only. This table intentionally has no user_id and must not store merchant, account, card, email, transaction, or other individualized finance identifiers.';

create table migration_ops.migration_batches (
  id uuid primary key default gen_random_uuid(),
  batch_key text not null unique,
  source_system text not null default 'AFR',
  source_snapshot_id text,
  source_snapshot_hash text,
  migration_code_version text,
  status text not null check (status in ('created', 'extracting', 'transforming', 'loading', 'reconciling', 'validated', 'completed', 'failed', 'cancelled')),
  idempotency_key text not null unique,
  started_at timestamptz,
  finished_at timestamptz,
  created_count integer not null default 0 check (created_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  quarantined_count integer not null default 0 check (quarantined_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  reconciliation_status text check (reconciliation_status is null or reconciliation_status in ('not_started', 'running', 'validated', 'failed', 'waived')),
  reconciliation_summary jsonb not null default '{}'::jsonb,
  report_uri text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table migration_ops.migration_entity_map (
  id uuid primary key default gen_random_uuid(),
  migration_batch_id uuid not null references migration_ops.migration_batches(id) on delete cascade,
  source_system text not null default 'AFR',
  source_table text not null,
  source_id text not null,
  source_payload_hash text not null,
  target_schema text not null default 'public',
  target_table text not null,
  target_id uuid,
  target_user_id uuid,
  split_group_key text,
  migration_status text not null check (migration_status in ('pending', 'mapped', 'created', 'updated', 'skipped', 'quarantined', 'failed')),
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint migration_entity_map_status_check check (migration_status in ('pending', 'mapped', 'created', 'updated', 'skipped', 'quarantined', 'failed'))
);

create table migration_ops.migration_quarantine_records (
  id uuid primary key default gen_random_uuid(),
  migration_batch_id uuid not null references migration_ops.migration_batches(id) on delete cascade,
  source_table text not null,
  source_id text,
  severity text not null check (severity in ('warning', 'error', 'blocking')),
  reason_code text not null,
  reason_message text not null,
  payload_hash text,
  source_payload jsonb,
  resolution_status text not null default 'open' check (resolution_status in ('open', 'remediated', 'accepted', 'rejected')),
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table migration_ops.migration_reconciliation_reports (
  id uuid primary key default gen_random_uuid(),
  migration_batch_id uuid not null references migration_ops.migration_batches(id) on delete cascade,
  report_type text not null,
  report_status text not null check (report_status in ('draft', 'passed', 'failed', 'waived')),
  report_payload jsonb not null,
  report_uri text,
  created_at timestamptz not null default now(),
  constraint migration_reconciliation_reports_type_uniq unique (migration_batch_id, report_type)
);

-- Ownership-aware FK constraints. Composite references prevent cross-user links
-- at the database layer where both sides are owned-by-user.
alter table public.credit_cards add constraint credit_cards_account_fk foreign key (user_id, account_id) references public.accounts(user_id, id);
alter table public.categories add constraint categories_parent_fk foreign key (user_id, parent_id) references public.categories(user_id, id);
alter table public.transfers add constraint transfers_source_account_fk foreign key (user_id, source_account_id) references public.accounts(user_id, id);
alter table public.transfers add constraint transfers_destination_account_fk foreign key (user_id, destination_account_id) references public.accounts(user_id, id);
alter table public.transactions add constraint transactions_category_fk foreign key (user_id, category_id) references public.categories(user_id, id);
alter table public.transactions add constraint transactions_subcategory_fk foreign key (user_id, subcategory_id) references public.categories(user_id, id);
alter table public.transactions add constraint transactions_account_fk foreign key (user_id, account_id) references public.accounts(user_id, id);
alter table public.transactions add constraint transactions_credit_card_fk foreign key (user_id, credit_card_id) references public.credit_cards(user_id, id);
alter table public.transactions add constraint transactions_transfer_fk foreign key (user_id, transfer_id) references public.transfers(user_id, id);
alter table public.transactions add constraint transactions_installment_fk foreign key (user_id, installment_id) references public.installments(user_id, id);
alter table public.transactions add constraint transactions_recurrence_occurrence_fk foreign key (user_id, recurrence_occurrence_id) references public.recurrence_occurrences(user_id, id);
alter table public.transactions add constraint transactions_invoice_fk foreign key (user_id, invoice_id) references public.credit_card_invoices(user_id, id);
alter table public.transactions add constraint transactions_reversal_of_fk foreign key (user_id, reversal_of_transaction_id) references public.transactions(user_id, id);
alter table public.transactions add constraint transactions_reversed_by_fk foreign key (user_id, reversed_by_transaction_id) references public.transactions(user_id, id);
alter table public.installment_plans add constraint installment_plans_category_fk foreign key (user_id, category_id) references public.categories(user_id, id);
alter table public.installment_plans add constraint installment_plans_subcategory_fk foreign key (user_id, subcategory_id) references public.categories(user_id, id);
alter table public.installment_plans add constraint installment_plans_account_fk foreign key (user_id, account_id) references public.accounts(user_id, id);
alter table public.installment_plans add constraint installment_plans_credit_card_fk foreign key (user_id, credit_card_id) references public.credit_cards(user_id, id);
alter table public.installments add constraint installments_plan_fk foreign key (user_id, plan_id) references public.installment_plans(user_id, id);
alter table public.recurrence_occurrences add constraint recurrence_occurrences_rule_fk foreign key (user_id, rule_id) references public.recurrence_rules(user_id, id);
alter table public.credit_card_invoices add constraint credit_card_invoices_credit_card_fk foreign key (user_id, credit_card_id) references public.credit_cards(user_id, id);
alter table public.invoice_items add constraint invoice_items_invoice_fk foreign key (user_id, invoice_id) references public.credit_card_invoices(user_id, id);
alter table public.invoice_items add constraint invoice_items_credit_card_fk foreign key (user_id, credit_card_id) references public.credit_cards(user_id, id);
alter table public.invoice_items add constraint invoice_items_transaction_fk foreign key (user_id, transaction_id) references public.transactions(user_id, id);
alter table public.invoice_items add constraint invoice_items_installment_fk foreign key (user_id, installment_id) references public.installments(user_id, id);
alter table public.invoice_items add constraint invoice_items_category_fk foreign key (user_id, category_id) references public.categories(user_id, id);
alter table public.invoice_items add constraint invoice_items_subcategory_fk foreign key (user_id, subcategory_id) references public.categories(user_id, id);
alter table public.invoice_payments add constraint invoice_payments_invoice_fk foreign key (user_id, invoice_id) references public.credit_card_invoices(user_id, id);
alter table public.invoice_payments add constraint invoice_payments_account_fk foreign key (user_id, account_id) references public.accounts(user_id, id);
alter table public.invoice_payments add constraint invoice_payments_payment_transaction_fk foreign key (user_id, payment_transaction_id) references public.transactions(user_id, id);
alter table public.invoice_payments add constraint invoice_payments_reversal_of_fk foreign key (user_id, reversal_of_payment_id) references public.invoice_payments(user_id, id);
alter table public.invoice_payments add constraint invoice_payments_reversed_by_fk foreign key (user_id, reversed_by_payment_id) references public.invoice_payments(user_id, id);
alter table public.invoice_payments add constraint invoice_payments_reversal_transaction_fk foreign key (user_id, reversal_transaction_id) references public.transactions(user_id, id);
alter table public.budget_lines add constraint budget_lines_budget_fk foreign key (user_id, budget_id) references public.budgets(user_id, id);
alter table public.budget_lines add constraint budget_lines_category_fk foreign key (user_id, category_id) references public.categories(user_id, id);
alter table public.budget_lines add constraint budget_lines_subcategory_fk foreign key (user_id, subcategory_id) references public.categories(user_id, id);
alter table public.planning_items add constraint planning_items_category_fk foreign key (user_id, category_id) references public.categories(user_id, id);
alter table public.planning_items add constraint planning_items_subcategory_fk foreign key (user_id, subcategory_id) references public.categories(user_id, id);
alter table public.financial_goals add constraint financial_goals_category_fk foreign key (user_id, category_id) references public.categories(user_id, id);
alter table public.financial_goals add constraint financial_goals_subcategory_fk foreign key (user_id, subcategory_id) references public.categories(user_id, id);
alter table public.financial_goals add constraint financial_goals_credit_card_fk foreign key (user_id, credit_card_id) references public.credit_cards(user_id, id);
alter table public.financial_goals add constraint financial_goals_account_fk foreign key (user_id, account_id) references public.accounts(user_id, id);
alter table public.simulation_scenario_versions add constraint simulation_versions_scenario_fk foreign key (user_id, scenario_id) references public.simulation_scenarios(user_id, id);
alter table public.simulation_scenarios add constraint simulation_scenarios_current_version_fk foreign key (user_id, current_version_id) references public.simulation_scenario_versions(user_id, id) deferrable initially deferred;
alter table public.events add constraint events_category_fk foreign key (user_id, category_id) references public.categories(user_id, id);
alter table public.events add constraint events_account_fk foreign key (user_id, account_id) references public.accounts(user_id, id);
alter table public.events add constraint events_credit_card_fk foreign key (user_id, credit_card_id) references public.credit_cards(user_id, id);
alter table public.events add constraint events_recurrence_rule_fk foreign key (user_id, recurrence_rule_id) references public.recurrence_rules(user_id, id);
alter table public.tasks add constraint tasks_category_fk foreign key (user_id, category_id) references public.categories(user_id, id);
alter table public.tasks add constraint tasks_event_fk foreign key (user_id, event_id) references public.events(user_id, id);
alter table public.tasks add constraint tasks_transaction_fk foreign key (user_id, transaction_id) references public.transactions(user_id, id);
alter table public.tasks add constraint tasks_recurrence_rule_fk foreign key (user_id, recurrence_rule_id) references public.recurrence_rules(user_id, id);
alter table public.financial_commitments add constraint financial_commitments_category_fk foreign key (user_id, category_id) references public.categories(user_id, id);
alter table public.financial_commitments add constraint financial_commitments_subcategory_fk foreign key (user_id, subcategory_id) references public.categories(user_id, id);
alter table public.financial_commitments add constraint financial_commitments_account_fk foreign key (user_id, account_id) references public.accounts(user_id, id);
alter table public.financial_commitments add constraint financial_commitments_credit_card_fk foreign key (user_id, credit_card_id) references public.credit_cards(user_id, id);
alter table public.financial_commitments add constraint financial_commitments_event_fk foreign key (user_id, event_id) references public.events(user_id, id) deferrable initially deferred;
alter table public.financial_commitments add constraint financial_commitments_task_fk foreign key (user_id, task_id) references public.tasks(user_id, id) deferrable initially deferred;
alter table public.financial_commitments add constraint financial_commitments_installment_fk foreign key (user_id, installment_id) references public.installments(user_id, id);
alter table public.financial_commitments add constraint financial_commitments_recurrence_occurrence_fk foreign key (user_id, recurrence_occurrence_id) references public.recurrence_occurrences(user_id, id);
alter table public.financial_commitments add constraint financial_commitments_invoice_fk foreign key (user_id, invoice_id) references public.credit_card_invoices(user_id, id);
alter table public.financial_commitments add constraint financial_commitments_matched_transaction_fk foreign key (user_id, matched_transaction_id) references public.transactions(user_id, id);
alter table public.financial_commitments add constraint financial_commitments_realized_transaction_fk foreign key (user_id, realized_transaction_id) references public.transactions(user_id, id);
alter table public.transactions add constraint transactions_realized_from_commitment_fk foreign key (user_id, realized_from_commitment_id) references public.financial_commitments(user_id, id);
alter table public.installments add constraint installments_transaction_fk foreign key (user_id, transaction_id) references public.transactions(user_id, id);
alter table public.installments add constraint installments_financial_commitment_fk foreign key (user_id, financial_commitment_id) references public.financial_commitments(user_id, id);
alter table public.installments add constraint installments_invoice_fk foreign key (user_id, invoice_id) references public.credit_card_invoices(user_id, id);
alter table public.planning_items add constraint planning_items_commitment_fk foreign key (user_id, commitment_id) references public.financial_commitments(user_id, id);
alter table public.planning_items add constraint planning_items_transaction_fk foreign key (user_id, transaction_id) references public.transactions(user_id, id);
alter table public.events add constraint events_financial_commitment_fk foreign key (user_id, financial_commitment_id) references public.financial_commitments(user_id, id);
alter table public.tasks add constraint tasks_financial_commitment_fk foreign key (user_id, financial_commitment_id) references public.financial_commitments(user_id, id);
alter table public.shopping_list_items add constraint shopping_list_items_list_fk foreign key (user_id, shopping_list_id) references public.shopping_lists(user_id, id);
alter table public.shopping_list_items add constraint shopping_list_items_category_fk foreign key (user_id, category_id) references public.categories(user_id, id);
alter table public.shopping_list_items add constraint shopping_list_items_transaction_fk foreign key (user_id, transaction_id) references public.transactions(user_id, id);
alter table public.wishlist_items add constraint wishlist_items_category_fk foreign key (user_id, category_id) references public.categories(user_id, id);
alter table public.wishlist_items add constraint wishlist_items_planning_item_fk foreign key (user_id, planning_item_id) references public.planning_items(user_id, id);
alter table public.wishlist_items add constraint wishlist_items_transaction_fk foreign key (user_id, transaction_id) references public.transactions(user_id, id);
alter table public.subscriptions add constraint subscriptions_account_fk foreign key (user_id, account_id) references public.accounts(user_id, id);
alter table public.subscriptions add constraint subscriptions_credit_card_fk foreign key (user_id, credit_card_id) references public.credit_cards(user_id, id);
alter table public.subscriptions add constraint subscriptions_category_fk foreign key (user_id, category_id) references public.categories(user_id, id);
alter table public.subscriptions add constraint subscriptions_subcategory_fk foreign key (user_id, subcategory_id) references public.categories(user_id, id);
alter table public.subscriptions add constraint subscriptions_recurrence_rule_fk foreign key (user_id, recurrence_rule_id) references public.recurrence_rules(user_id, id);
alter table public.financial_commitments add constraint financial_commitments_subscription_fk foreign key (user_id, subscription_id) references public.subscriptions(user_id, id);
alter table public.assets add constraint assets_linked_account_fk foreign key (user_id, linked_account_id) references public.accounts(user_id, id);
alter table public.asset_valuations add constraint asset_valuations_asset_fk foreign key (user_id, asset_id) references public.assets(user_id, id);
alter table public.liabilities add constraint liabilities_linked_credit_card_fk foreign key (user_id, linked_credit_card_id) references public.credit_cards(user_id, id);
alter table public.liabilities add constraint liabilities_linked_account_fk foreign key (user_id, linked_account_id) references public.accounts(user_id, id);
alter table public.liability_balances add constraint liability_balances_liability_fk foreign key (user_id, liability_id) references public.liabilities(user_id, id);
alter table public.annual_obligations add constraint annual_obligations_asset_fk foreign key (user_id, asset_id) references public.assets(user_id, id);
alter table public.annual_obligations add constraint annual_obligations_account_fk foreign key (user_id, account_id) references public.accounts(user_id, id);
alter table public.annual_obligations add constraint annual_obligations_credit_card_fk foreign key (user_id, credit_card_id) references public.credit_cards(user_id, id);
alter table public.annual_obligations add constraint annual_obligations_category_fk foreign key (user_id, category_id) references public.categories(user_id, id);
alter table public.annual_obligations add constraint annual_obligations_subcategory_fk foreign key (user_id, subcategory_id) references public.categories(user_id, id);
alter table public.annual_obligations add constraint annual_obligations_recurrence_rule_fk foreign key (user_id, recurrence_rule_id) references public.recurrence_rules(user_id, id);
alter table public.annual_obligation_installments add constraint annual_obligation_installments_obligation_fk foreign key (user_id, annual_obligation_id) references public.annual_obligations(user_id, id);
alter table public.annual_obligation_installments add constraint annual_obligation_installments_commitment_fk foreign key (user_id, financial_commitment_id) references public.financial_commitments(user_id, id);
alter table public.annual_obligation_installments add constraint annual_obligation_installments_transaction_fk foreign key (user_id, transaction_id) references public.transactions(user_id, id);
alter table public.financial_commitments add constraint financial_commitments_annual_obligation_fk foreign key (user_id, annual_obligation_id) references public.annual_obligations(user_id, id);
alter table public.provisions add constraint provisions_obligation_fk foreign key (user_id, annual_obligation_id) references public.annual_obligations(user_id, id);
alter table public.import_batches add constraint import_batches_credit_card_fk foreign key (user_id, credit_card_id) references public.credit_cards(user_id, id);
alter table public.import_batches add constraint import_batches_invoice_fk foreign key (user_id, invoice_id) references public.credit_card_invoices(user_id, id);
alter table public.import_batches add constraint import_batches_storage_deleted_by_fk foreign key (storage_deleted_by_user_id) references public.profiles(id);
alter table public.import_batches add constraint import_batches_reviewed_by_fk foreign key (reviewed_by_user_id) references public.profiles(id);
alter table public.import_items add constraint import_items_batch_fk foreign key (user_id, batch_id) references public.import_batches(user_id, id);
alter table public.import_items add constraint import_items_suggested_category_fk foreign key (user_id, suggested_category_id) references public.categories(user_id, id);
alter table public.import_items add constraint import_items_suggested_subcategory_fk foreign key (user_id, suggested_subcategory_id) references public.categories(user_id, id);
alter table public.import_items add constraint import_items_reviewed_category_fk foreign key (user_id, reviewed_category_id) references public.categories(user_id, id);
alter table public.import_items add constraint import_items_reviewed_subcategory_fk foreign key (user_id, reviewed_subcategory_id) references public.categories(user_id, id);
alter table public.import_items add constraint import_items_duplicate_transaction_fk foreign key (user_id, duplicate_of_transaction_id) references public.transactions(user_id, id);
alter table public.import_items add constraint import_items_duplicate_import_item_fk foreign key (user_id, duplicate_of_import_item_id) references public.import_items(user_id, id);
alter table public.import_items add constraint import_items_matched_commitment_fk foreign key (user_id, matched_commitment_id) references public.financial_commitments(user_id, id);
alter table public.import_items add constraint import_items_transaction_fk foreign key (user_id, transaction_id) references public.transactions(user_id, id);
alter table public.import_items add constraint import_items_installment_plan_fk foreign key (user_id, installment_plan_id) references public.installment_plans(user_id, id);
alter table public.import_items add constraint import_items_installment_fk foreign key (user_id, installment_id) references public.installments(user_id, id);
alter table public.import_items add constraint import_items_invoice_item_fk foreign key (user_id, invoice_item_id) references public.invoice_items(user_id, id);
alter table public.invoice_items add constraint invoice_items_import_item_fk foreign key (user_id, import_item_id) references public.import_items(user_id, id) deferrable initially deferred;
alter table public.installments add constraint installments_import_item_fk foreign key (user_id, import_item_id) references public.import_items(user_id, id) deferrable initially deferred;
alter table public.merchant_category_mappings add constraint merchant_category_mappings_category_fk foreign key (user_id, category_id) references public.categories(user_id, id);
alter table public.merchant_category_mappings add constraint merchant_category_mappings_subcategory_fk foreign key (user_id, subcategory_id) references public.categories(user_id, id);
alter table public.merchant_category_mappings add constraint merchant_category_mappings_last_import_item_fk foreign key (user_id, last_import_item_id) references public.import_items(user_id, id);
alter table public.audit_logs add constraint audit_logs_import_batch_fk foreign key (user_id, import_batch_id) references public.import_batches(user_id, id);
alter table public.financial_commitments add constraint financial_commitments_realized_transaction_uniq unique (realized_transaction_id);
alter table public.transactions add constraint transactions_realized_from_commitment_uniq unique (realized_from_commitment_id);
alter table public.invoice_payments add constraint invoice_payments_payment_transaction_uniq unique (payment_transaction_id);
alter table public.transfers add constraint transfers_outflow_transaction_fk foreign key (user_id, outflow_transaction_id) references public.transactions(user_id, id) deferrable initially deferred;
alter table public.transfers add constraint transfers_inflow_transaction_fk foreign key (user_id, inflow_transaction_id) references public.transactions(user_id, id) deferrable initially deferred;

create unique index accounts_user_active_normalized_name_uniq on public.accounts (user_id, normalized_name) where archived_at is null and status = 'active';
create unique index credit_cards_user_active_normalized_name_uniq on public.credit_cards (user_id, normalized_name) where status in ('active', 'paused');
create unique index migration_entity_map_source_target_uniq on migration_ops.migration_entity_map (migration_batch_id, source_table, source_id, target_table, coalesce(split_group_key, ''));
create unique index categories_user_parent_active_normalized_name_uniq on public.categories (user_id, parent_id, normalized_name) nulls not distinct where archived_at is null;
create unique index budgets_user_active_month_uniq on public.budgets (user_id, period_month) where status = 'active';
create unique index invoice_items_invoice_transaction_uniq on public.invoice_items (invoice_id, transaction_id) where transaction_id is not null;
create unique index invoice_items_invoice_installment_uniq on public.invoice_items (invoice_id, installment_id) where installment_id is not null;
create unique index financial_commitments_source_occurrence_uniq on public.financial_commitments (user_id, source_type, source_id, source_occurrence_key) where source_type is not null and source_id is not null and source_occurrence_key is not null;

create index accounts_user_status_name_idx on public.accounts (user_id, status, name);
create index credit_cards_user_status_name_idx on public.credit_cards (user_id, status, name);
create index categories_user_parent_type_name_idx on public.categories (user_id, parent_id, type, name);
create index transactions_user_date_desc_idx on public.transactions (user_id, transaction_date desc);
create index transactions_user_date_type_idx on public.transactions (user_id, transaction_date, transaction_type);
create index transactions_user_category_date_idx on public.transactions (user_id, category_id, transaction_date);
create index transactions_user_subcategory_date_idx on public.transactions (user_id, subcategory_id, transaction_date);
create index transactions_user_account_date_idx on public.transactions (user_id, account_id, transaction_date);
create index transactions_user_credit_card_date_idx on public.transactions (user_id, credit_card_id, transaction_date);
create index transactions_user_payment_method_date_idx on public.transactions (user_id, payment_method, transaction_date);
create index transactions_user_competence_month_type_idx on public.transactions (user_id, competence_month, transaction_type);
create index events_user_start_at_idx on public.events (user_id, start_at);
create index tasks_user_due_status_idx on public.tasks (user_id, due_date, status);
create index financial_commitments_user_due_status_idx on public.financial_commitments (user_id, due_date, status);
create index credit_card_invoices_user_card_month_idx on public.credit_card_invoices (user_id, credit_card_id, reference_month);
create index credit_card_invoices_user_due_status_idx on public.credit_card_invoices (user_id, due_date, status);
create index invoice_items_user_invoice_idx on public.invoice_items (user_id, invoice_id);
create index invoice_items_user_transaction_idx on public.invoice_items (user_id, transaction_id);
create index invoice_payments_user_invoice_payment_date_idx on public.invoice_payments (user_id, invoice_id, payment_date);
create index installment_plans_user_status_first_due_idx on public.installment_plans (user_id, status, first_due_date);
create index installments_user_plan_due_idx on public.installments (user_id, plan_id, due_date);
create index installments_user_due_status_idx on public.installments (user_id, due_date, status);
create index recurrence_rules_user_status_frequency_idx on public.recurrence_rules (user_id, status, frequency);
create index recurrence_occurrences_user_date_status_idx on public.recurrence_occurrences (user_id, occurrence_date, status);
create index recurrence_occurrences_rule_date_idx on public.recurrence_occurrences (rule_id, occurrence_date);
create index budget_lines_user_budget_category_idx on public.budget_lines (user_id, budget_id, category_id);
create index planning_items_user_period_status_idx on public.planning_items (user_id, period_month, status);
create index financial_goals_user_status_target_idx on public.financial_goals (user_id, status, target_date);
create index provisions_user_month_status_idx on public.provisions (user_id, provision_month, status);
create index annual_obligations_user_due_status_idx on public.annual_obligations (user_id, due_date, status);
create index subscriptions_user_next_charge_status_idx on public.subscriptions (user_id, next_charge_date, status);
create index import_batches_user_created_desc_idx on public.import_batches (user_id, created_at desc);
create index import_batches_user_status_idx on public.import_batches (user_id, status);
create index import_items_user_batch_status_idx on public.import_items (user_id, batch_id, status);
create index import_items_user_dedupe_key_idx on public.import_items (user_id, dedupe_key);
create index merchant_category_mappings_user_merchant_idx on public.merchant_category_mappings (user_id, merchant_key);
create index economic_indicator_values_indicator_date_desc_idx on public.economic_indicator_values (indicator_id, reference_date desc);
create index economic_indicator_values_indicator_type_date_idx on public.economic_indicator_values (indicator_id, value_type, reference_date);
create index audit_logs_user_created_desc_idx on public.audit_logs (user_id, created_at desc);
create index audit_logs_actor_created_desc_idx on public.audit_logs (actor_user_id, created_at desc);
create index admin_observability_metric_idx on public.admin_observability_metrics (metric_date, module, metric_name);
create index admin_observability_anomaly_window_idx on public.admin_observability_metrics (is_anomaly, metric_window_end_at desc);
create index migration_entity_map_lookup_idx on migration_ops.migration_entity_map (source_system, source_table, source_id, source_payload_hash);
create index migration_quarantine_batch_status_idx on migration_ops.migration_quarantine_records (migration_batch_id, resolution_status, severity);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles','user_roles','accounts','credit_cards','categories','transactions','transfers',
    'installment_plans','installments','recurrence_rules','recurrence_occurrences',
    'credit_card_invoices','invoice_items','invoice_payments','budgets','budget_lines',
    'planning_items','financial_goals','simulation_scenarios','simulation_scenario_versions',
    'events','tasks','financial_commitments','shopping_lists','shopping_list_items',
    'wishlist_items','subscriptions','assets','asset_valuations','liabilities',
    'liability_balances','annual_obligations','annual_obligation_installments',
    'provisions','import_batches','import_items','merchant_category_mappings',
    'audit_logs','economic_indicators','economic_indicator_values','system_job_runs',
    'admin_observability_metrics'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounts','credit_cards','categories','transactions','transfers',
    'installment_plans','installments','recurrence_rules','recurrence_occurrences',
    'credit_card_invoices','invoice_items','invoice_payments','budgets','budget_lines',
    'planning_items','financial_goals','simulation_scenarios','simulation_scenario_versions',
    'events','tasks','financial_commitments','shopping_lists','shopping_list_items',
    'wishlist_items','subscriptions','assets','asset_valuations','liabilities',
    'liability_balances','annual_obligations','annual_obligation_installments',
    'provisions','import_batches','import_items','merchant_category_mappings'
  ]
  loop
    execute format('create policy owned_rows_select on public.%I for select to authenticated using (user_id = auth.uid())', table_name);
    execute format('create policy owned_rows_insert on public.%I for insert to authenticated with check (user_id = auth.uid())', table_name);
    execute format('create policy owned_rows_update on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', table_name);
  end loop;
end;
$$;

-- DELETE policies are intentionally explicit. DATABASE_SCHEMA.md allows normal
-- owner access, but physical deletion must remain narrower than read/write:
-- posted/auditable financial facts are corrected with status transitions,
-- reversals, voiding, archiving, or backend-only audited maintenance.

-- Class B: authenticated owner may hard-delete only objective draft/pre-effect
-- rows whose enum state is defined in the frozen contract.
create policy transactions_delete_draft_owner on public.transactions
  for delete to authenticated
  using (user_id = auth.uid() and status = 'draft');

create policy invoice_payments_delete_draft_owner on public.invoice_payments
  for delete to authenticated
  using (user_id = auth.uid() and status = 'draft');

create policy budgets_delete_draft_owner on public.budgets
  for delete to authenticated
  using (user_id = auth.uid() and status = 'draft');

create policy annual_obligations_delete_draft_owner on public.annual_obligations
  for delete to authenticated
  using (user_id = auth.uid() and status = 'draft');

-- Class C: owner hard-delete is allowed for configurable, operational, or
-- hypothetical records where the frozen contract does not require historical
-- financial retention. Existing FKs still prevent deleting referenced rows.
create policy accounts_delete_owner on public.accounts
  for delete to authenticated
  using (user_id = auth.uid());

create policy credit_cards_delete_owner on public.credit_cards
  for delete to authenticated
  using (user_id = auth.uid());

create policy categories_delete_owner on public.categories
  for delete to authenticated
  using (user_id = auth.uid());

create policy recurrence_rules_delete_owner on public.recurrence_rules
  for delete to authenticated
  using (user_id = auth.uid());

create policy budget_lines_delete_owner on public.budget_lines
  for delete to authenticated
  using (user_id = auth.uid());

create policy planning_items_delete_owner on public.planning_items
  for delete to authenticated
  using (user_id = auth.uid());

create policy financial_goals_delete_owner on public.financial_goals
  for delete to authenticated
  using (user_id = auth.uid());

create policy simulation_scenarios_delete_owner on public.simulation_scenarios
  for delete to authenticated
  using (user_id = auth.uid());

create policy simulation_scenario_versions_delete_owner on public.simulation_scenario_versions
  for delete to authenticated
  using (user_id = auth.uid());

create policy events_delete_owner on public.events
  for delete to authenticated
  using (user_id = auth.uid());

create policy tasks_delete_owner on public.tasks
  for delete to authenticated
  using (user_id = auth.uid());

create policy shopping_lists_delete_owner on public.shopping_lists
  for delete to authenticated
  using (user_id = auth.uid());

create policy shopping_list_items_delete_owner on public.shopping_list_items
  for delete to authenticated
  using (user_id = auth.uid());

create policy wishlist_items_delete_owner on public.wishlist_items
  for delete to authenticated
  using (user_id = auth.uid());

create policy subscriptions_delete_owner on public.subscriptions
  for delete to authenticated
  using (user_id = auth.uid());

create policy assets_delete_owner on public.assets
  for delete to authenticated
  using (user_id = auth.uid());

create policy liabilities_delete_owner on public.liabilities
  for delete to authenticated
  using (user_id = auth.uid());

create policy merchant_category_mappings_delete_owner on public.merchant_category_mappings
  for delete to authenticated
  using (user_id = auth.uid());

create policy profiles_self_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_self_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_self_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy user_roles_self_select on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy audit_logs_self_select on public.audit_logs for select to authenticated using (user_id = auth.uid() or actor_user_id = auth.uid());
create policy economic_indicators_authenticated_read on public.economic_indicators for select to authenticated using (true);
create policy economic_indicator_values_authenticated_read on public.economic_indicator_values for select to authenticated using (true);

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on schema migration_ops to service_role;
grant select, insert, update, delete on all tables in schema migration_ops to service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles','accounts','credit_cards','categories','transactions','transfers',
    'installment_plans','installments','recurrence_rules','recurrence_occurrences',
    'credit_card_invoices','invoice_items','invoice_payments','budgets','budget_lines',
    'planning_items','financial_goals','simulation_scenarios','events','tasks',
    'financial_commitments','shopping_lists','shopping_list_items','wishlist_items',
    'subscriptions','assets','liabilities','annual_obligations','annual_obligation_installments',
    'provisions','import_batches','import_items','merchant_category_mappings',
    'migration_batches','migration_entity_map','migration_quarantine_records'
  ]
  loop
    if table_name like 'migration_%' then
      execute format('create trigger set_updated_at before update on migration_ops.%I for each row execute function public.set_updated_at()', table_name);
    else
      execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name);
    end if;
  end loop;
end;
$$;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('invoice-imports', 'invoice-imports', false, 20971520, array['application/pdf'])
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end;
$$;

do $$
begin
  if to_regclass('storage.objects') is not null then
    create policy invoice_imports_user_select on storage.objects
      for select to authenticated
      using (bucket_id = 'invoice-imports' and (storage.foldername(name))[1] = auth.uid()::text);
    create policy invoice_imports_user_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'invoice-imports' and (storage.foldername(name))[1] = auth.uid()::text);
    create policy invoice_imports_user_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'invoice-imports' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end;
$$;
