export const transactionTypes = [
  "income",
  "expense",
  "transfer",
  "investment",
] as const;

export const transactionStatuses = [
  "draft",
  "posted",
  "voided",
  "reversed",
] as const;

export const paymentMethods = [
  "cash",
  "debit",
  "credit_card",
  "pix",
  "bank_transfer",
  "boleto",
  "benefit_food",
  "benefit_meal",
  "benefit_culture",
  "other",
] as const;

export const categoryTypes = [
  "income",
  "fixed_expense",
  "variable_expense",
  "investment",
  "transfer",
] as const;

export const accountTypes = [
  "checking",
  "savings",
  "wallet",
  "cash",
  "investment",
  "benefit",
  "other",
] as const;

export const accountStatuses = ["active", "archived", "closed"] as const;

export const creditCardStatuses = [
  "active",
  "paused",
  "archived",
  "closed",
] as const;

export const installmentPlanStatuses = [
  "active",
  "completed",
  "cancelled",
  "archived",
] as const;

export const installmentStatuses = [
  "scheduled",
  "posted",
  "cancelled",
  "skipped",
] as const;

export const recurrenceFrequencies = ["weekly", "monthly", "yearly"] as const;

export const recurrenceStatuses = [
  "active",
  "paused",
  "ended",
  "cancelled",
] as const;

export const recurrenceTargetTypes = [
  "transaction",
  "financial_commitment",
  "event",
  "task",
  "subscription",
  "annual_obligation",
] as const;

export const invoiceStatuses = [
  "open",
  "closed",
  "due",
  "overdue",
  "partially_paid",
  "paid",
  "cancelled",
] as const;

export const invoiceItemTypes = [
  "purchase",
  "installment",
  "fee",
  "interest",
  "adjustment",
  "refund",
] as const;

export const invoicePaymentStatuses = ["draft", "posted", "reversed"] as const;

export const invoicePaymentTypes = ["payment", "payment_reversal"] as const;

export const invoiceAdjustmentTypes = [
  "manual_adjustment",
  "interest",
  "fee",
  "refund",
  "payment_reversal",
] as const;

export const eventTypes = [
  "personal",
  "financial",
  "payment",
  "income",
  "invoice",
  "annual_obligation",
  "subscription",
  "task",
  "other",
] as const;

export const eventStatuses = [
  "scheduled",
  "completed",
  "cancelled",
  "archived",
] as const;

export const taskStatuses = [
  "pending",
  "completed",
  "cancelled",
  "archived",
] as const;

export const taskPriorities = ["low", "medium", "high", "urgent"] as const;

export const commitmentTypes = [
  "income",
  "expense",
  "investment",
  "transfer",
] as const;

export const commitmentStatuses = [
  "expected",
  "confirmed",
  "overdue",
  "realized",
  "cancelled",
] as const;

export const budgetStatuses = [
  "draft",
  "active",
  "closed",
  "archived",
] as const;

export const planningItemStatuses = [
  "planned",
  "expected",
  "committed",
  "realized",
  "cancelled",
] as const;

export const financialGoalTypes = [
  "save",
  "reduce_expense",
  "increase_income",
  "pay_debt",
  "net_worth",
  "purchase",
] as const;

export const financialGoalStatuses = [
  "active",
  "completed",
  "paused",
  "archived",
  "cancelled",
] as const;

export const simulationStatuses = ["draft", "active", "archived"] as const;

export const shoppingListStatuses = ["active", "archived", "deleted"] as const;

export const shoppingItemStatuses = [
  "open",
  "purchased",
  "skipped",
  "deleted",
] as const;

export const wishlistStatuses = [
  "desired",
  "evaluating",
  "purchased",
  "discarded",
  "archived",
] as const;

export const subscriptionStatuses = [
  "active",
  "paused",
  "cancelled",
  "archived",
] as const;

export const assetTypes = [
  "cash",
  "investment",
  "vehicle",
  "property",
  "personal_item",
  "other",
] as const;

export const liabilityTypes = [
  "credit_card",
  "loan",
  "financing",
  "tax",
  "manual",
  "other",
] as const;

export const annualObligationTypes = [
  "ipva",
  "iptu",
  "insurance",
  "annuity",
  "professional_fee",
  "maintenance",
  "other",
] as const;

export const obligationStatuses = [
  "draft",
  "active",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled",
  "archived",
] as const;

export const provisionStatuses = [
  "active",
  "paused",
  "completed",
  "cancelled",
] as const;

export const indicatorCodes = [
  "selic",
  "cdi",
  "ipca",
  "di",
  "usd_brl",
  "other",
] as const;

export const indicatorValueTypes = [
  "actual",
  "estimated",
  "assumption",
] as const;

export const importBatchStatuses = [
  "uploaded",
  "processing",
  "parsed",
  "reviewing",
  "ready_to_commit",
  "committed",
  "failed",
  "cancelled",
] as const;

export const importItemStatuses = [
  "parsed",
  "included",
  "excluded",
  "duplicate_suspected",
  "committed",
  "failed",
] as const;

export const originTypes = [
  "manual",
  "import",
  "recurrence",
  "installment",
  "invoice",
  "subscription",
  "annual_obligation",
  "event",
  "task",
  "simulation",
  "system_job",
  "migration",
] as const;

export const auditSeverities = ["info", "warning", "critical"] as const;

export const canonicalEnums = {
  transaction_type: transactionTypes,
  transaction_status: transactionStatuses,
  payment_method: paymentMethods,
  category_type: categoryTypes,
  account_type: accountTypes,
  account_status: accountStatuses,
  credit_card_status: creditCardStatuses,
  installment_plan_status: installmentPlanStatuses,
  installment_status: installmentStatuses,
  recurrence_frequency: recurrenceFrequencies,
  recurrence_status: recurrenceStatuses,
  recurrence_target_type: recurrenceTargetTypes,
  invoice_status: invoiceStatuses,
  invoice_item_type: invoiceItemTypes,
  invoice_payment_status: invoicePaymentStatuses,
  invoice_payment_type: invoicePaymentTypes,
  invoice_adjustment_type: invoiceAdjustmentTypes,
  event_type: eventTypes,
  event_status: eventStatuses,
  task_status: taskStatuses,
  task_priority: taskPriorities,
  commitment_type: commitmentTypes,
  commitment_status: commitmentStatuses,
  budget_status: budgetStatuses,
  planning_item_status: planningItemStatuses,
  financial_goal_type: financialGoalTypes,
  financial_goal_status: financialGoalStatuses,
  simulation_status: simulationStatuses,
  shopping_list_status: shoppingListStatuses,
  shopping_item_status: shoppingItemStatuses,
  wishlist_status: wishlistStatuses,
  subscription_status: subscriptionStatuses,
  asset_type: assetTypes,
  liability_type: liabilityTypes,
  annual_obligation_type: annualObligationTypes,
  obligation_status: obligationStatuses,
  provision_status: provisionStatuses,
  indicator_code: indicatorCodes,
  indicator_value_type: indicatorValueTypes,
  import_batch_status: importBatchStatuses,
  import_item_status: importItemStatuses,
  origin_type: originTypes,
  audit_severity: auditSeverities,
} as const;

export type CanonicalEnumName = keyof typeof canonicalEnums;
export type CanonicalEnumValue<TName extends CanonicalEnumName> =
  (typeof canonicalEnums)[TName][number];

export type TransactionType = (typeof transactionTypes)[number];
export type TransactionStatus = (typeof transactionStatuses)[number];
export type PaymentMethod = (typeof paymentMethods)[number];
export type CategoryType = (typeof categoryTypes)[number];
export type AccountType = (typeof accountTypes)[number];
export type AccountStatus = (typeof accountStatuses)[number];
export type CreditCardStatus = (typeof creditCardStatuses)[number];
export type OriginType = (typeof originTypes)[number];
export type AuditSeverity = (typeof auditSeverities)[number];

export function assertCanonicalEnumValue<TName extends CanonicalEnumName>(
  enumName: TName,
  value: string,
): asserts value is CanonicalEnumValue<TName> {
  if (!isCanonicalEnumValue(enumName, value)) {
    throw new Error(`Invalid ${enumName} enum value: ${value}`);
  }
}

export function isCanonicalEnumValue<TName extends CanonicalEnumName>(
  enumName: TName,
  value: string,
): value is CanonicalEnumValue<TName> {
  return (canonicalEnums[enumName] as readonly string[]).includes(value);
}
