import type { AccountRecord } from "@/domain/accounts";
import { getEnumOptions } from "@/domain/shared";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

type AccountFormProps = {
  account?: AccountRecord;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
};

export function AccountForm({
  account,
  action,
  submitLabel,
}: AccountFormProps) {
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          hint="Nome unico entre contas ativas."
          htmlFor="account-name"
          label="Nome"
        >
          <Input
            autoComplete="off"
            defaultValue={account?.name}
            id="account-name"
            name="name"
            required
          />
        </Field>
        <Field htmlFor="account-type" label="Tipo">
          <select
            className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2"
            defaultValue={account?.type ?? "checking"}
            id="account-type"
            name="type"
          >
            {getEnumOptions("account_type").map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field htmlFor="opening-balance" label="Saldo inicial">
          <Input
            defaultValue={account?.openingBalance.amount ?? "0.00"}
            id="opening-balance"
            inputMode="decimal"
            name="openingBalance"
            required
          />
        </Field>
        <Field htmlFor="opening-balance-date" label="Data-base">
          <Input
            defaultValue={account?.openingBalanceDate}
            id="opening-balance-date"
            name="openingBalanceDate"
            required
            type="date"
          />
        </Field>
        <Field
          hint="Use 0 para contas sem limite."
          htmlFor="overdraft-limit"
          label="Limite/cheque especial"
        >
          <Input
            defaultValue={account?.overdraftLimit.amount ?? "0.00"}
            id="overdraft-limit"
            inputMode="decimal"
            name="overdraftLimit"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field htmlFor="institution" label="Instituicao">
          <Input
            defaultValue={account?.institution ?? ""}
            id="institution"
            name="institution"
          />
        </Field>
        <Field htmlFor="description" label="Descricao">
          <Input
            defaultValue={account?.description ?? ""}
            id="description"
            name="description"
          />
        </Field>
      </div>

      <div>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
