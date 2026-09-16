import type React from "react";

import { cn } from "@/lib/utils";

type Column<Row> = {
  header: string;
  key: keyof Row & string;
  render?: (row: Row) => React.ReactNode;
};

type ResponsiveTableProps<Row extends Record<string, React.ReactNode>> = {
  columns: Column<Row>[];
  getRowKey: (row: Row) => string;
  rows: Row[];
};

export function ResponsiveTable<Row extends Record<string, React.ReactNode>>({
  columns,
  getRowKey,
  rows,
}: ResponsiveTableProps<Row>) {
  return (
    <div>
      <div className="border-border hidden overflow-hidden rounded-lg border md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-muted text-muted-foreground text-xs tracking-wide uppercase">
            <tr>
              {columns.map((column) => (
                <th className="px-4 py-3 font-semibold" key={column.key}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-border bg-surface divide-y">
            {rows.map((row) => (
              <tr key={getRowKey(row)}>
                {columns.map((column) => (
                  <td className="px-4 py-3 align-top" key={column.key}>
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <article
            className="border-border bg-surface rounded-lg border p-4"
            key={getRowKey(row)}
          >
            <dl className="grid gap-3">
              {columns.map((column) => (
                <div className="grid gap-1" key={column.key}>
                  <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    {column.header}
                  </dt>
                  <dd className={cn("text-foreground text-sm")}>
                    {column.render ? column.render(row) : row[column.key]}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}
