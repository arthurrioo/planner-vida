import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CATEGORY_DEPENDENCY_REFERENCES } from "./supabase-category-repository";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260915000100_m03_database_physical_foundation.sql",
);

describe("CATEGORY_DEPENDENCY_REFERENCES", () => {
  it("covers every Frozen M03 foreign key that points to categories", () => {
    const migration = fs.readFileSync(migrationPath, "utf8");
    const categoryForeignKeys = [
      ...migration.matchAll(
        /alter table public\.([a-z_]+) add constraint [a-z_]+ foreign key \(user_id, ([a-z_]+)\) references public\.categories\(user_id, id\);/g,
      ),
    ].map((match) => ({
      column: match[2],
      table: match[1],
    }));

    expect(CATEGORY_DEPENDENCY_REFERENCES).toEqual(
      categoryForeignKeys.sort(byTableAndColumn),
    );
    expect(CATEGORY_DEPENDENCY_REFERENCES).toContainEqual({
      column: "parent_id",
      table: "categories",
    });
    expect(CATEGORY_DEPENDENCY_REFERENCES).toContainEqual({
      column: "subcategory_id",
      table: "transactions",
    });
    expect(CATEGORY_DEPENDENCY_REFERENCES).toContainEqual({
      column: "reviewed_subcategory_id",
      table: "import_items",
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
