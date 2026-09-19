import {
  type CanonicalEnumName,
  type CanonicalEnumValue,
  canonicalEnums,
} from "./enums";

const labels = {
  transaction_type: {
    income: "Receita",
    expense: "Despesa",
    transfer: "Transferencia",
    investment: "Investimento",
  },
  transaction_status: {
    draft: "Rascunho",
    posted: "Postada",
    voided: "Anulada",
    reversed: "Revertida",
  },
  payment_method: {
    cash: "Dinheiro",
    debit: "Debito",
    credit_card: "Cartao de credito",
    pix: "Pix",
    bank_transfer: "Transferencia bancaria",
    boleto: "Boleto",
    benefit_food: "Vale-alimentacao",
    benefit_meal: "Vale-refeicao",
    benefit_culture: "Vale-cultura",
    other: "Outro",
  },
  category_type: {
    income: "Receita",
    fixed_expense: "Despesa fixa",
    variable_expense: "Despesa variavel",
    investment: "Investimento",
    transfer: "Transferencia",
  },
  account_type: {
    checking: "Conta corrente",
    savings: "Poupanca",
    wallet: "Carteira",
    cash: "Dinheiro",
    investment: "Investimento",
    benefit: "Beneficio",
    other: "Outra",
  },
  account_status: {
    active: "Ativa",
    archived: "Arquivada",
    closed: "Encerrada",
  },
  credit_card_status: {
    active: "Ativo",
    paused: "Pausado",
    archived: "Arquivado",
    closed: "Encerrado",
  },
  audit_severity: {
    info: "Informacao",
    warning: "Atencao",
    critical: "Critico",
  },
} satisfies Partial<{
  [TName in CanonicalEnumName]: Record<CanonicalEnumValue<TName>, string>;
}>;

export function getEnumLabel<TName extends CanonicalEnumName>(
  enumName: TName,
  value: CanonicalEnumValue<TName>,
) {
  const enumLabels = (
    labels as Partial<Record<CanonicalEnumName, Record<string, string>>>
  )[enumName];

  return enumLabels?.[value] ?? value.replaceAll("_", " ");
}

export function getEnumOptions<TName extends CanonicalEnumName>(
  enumName: TName,
) {
  return canonicalEnums[enumName].map((value) => ({
    value,
    label: getEnumLabel(enumName, value),
  }));
}
