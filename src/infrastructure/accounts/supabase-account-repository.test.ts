import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ACCOUNT_DEPENDENCY_REFERENCES } from "./supabase-account-repository";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260915000100_m03_database_physical_foundation.sql",
);

describe("ACCOUNT_DEPENDENCY_REFERENCES", () => {
  it("covers every Frozen M03 foreign key that points to accounts", () => {
    const migration = fs.readFileSync(migrationPath, "utf8");
    const accountForeignKeys = [
      ...migration.matchAll(
        /alter table public\.([a-z_]+) add constraint [a-z_]+ foreign key \(user_id, ([a-z_]+)\) references public\.accounts\(user_id, id\);/g,
      ),
    ].map((match) => ({
      column: match[2],
      table: match[1],
    }));

    expect(ACCOUNT_DEPENDENCY_REFERENCES).toEqual(
      accountForeignKeys.sort(byTableAndColumn),
    );
    expect(ACCOUNT_DEPENDENCY_REFERENCES).toContainEqual({
      column: "account_id",
      table: "subscriptions",
    });
    expect(ACCOUNT_DEPENDENCY_REFERENCES).toContainEqual({
      column: "linked_account_id",
      table: "assets",
    });
    expect(ACCOUNT_DEPENDENCY_REFERENCES).toContainEqual({
      column: "linked_account_id",
      table: "liabilities",
    });
    expect(ACCOUNT_DEPENDENCY_REFERENCES).toContainEqual({
      column: "account_id",
      table: "annual_obligations",
    });
  });
});

function byTableAndColumn(
  left: Readonly<{ column: string; table: string }>,
  right: Readonly<{ column: string; table: string }>,
) {
  return `${left.table}.${left.column}`.localeCompare(
    `${right.table}.${right.column}`,
  );
}
