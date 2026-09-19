import type { AccountWithBalance } from "@/domain/accounts";
import { getEnumLabel, type AccountStatus } from "@/domain/shared";
import { formatBRL } from "@/lib/ui/formatters";

type AccountSelectorProps = {
  accounts: AccountWithBalance[];
  defaultValue?: string;
  id: string;
  includeStatuses?: readonly AccountStatus[];
  label?: string;
  name: string;
  required?: boolean;
};

export function AccountSelector({
  accounts,
  defaultValue,
  id,
  includeStatuses = ["active"],
  label = "Conta",
  name,
  required,
}: AccountSelectorProps) {
  const selectableAccounts = accounts.filter((account) =>
    includeStatuses.includes(account.status),
  );

  return (
    <label className="grid gap-2 text-sm font-medium" htmlFor={id}>
      {label}
      <select
        className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2"
        defaultValue={defaultValue ?? ""}
        id={id}
        name={name}
        required={required}
      >
        <option value="">Selecione</option>
        {selectableAccounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name} - {getEnumLabel("account_type", account.type)} -{" "}
            {formatBRL(account.balance.amount)}
          </option>
        ))}
      </select>
    </label>
  );
}
