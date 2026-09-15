import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const scriptPath = path.join(repoRoot, "scripts", "verify-m03-schema.mjs");
const migrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260915000100_m03_database_physical_foundation.sql",
);
const seedPath = path.join(repoRoot, "supabase", "seed.sql");

async function runVerifier(migrationSql: string) {
  const { verifyM03Schema } = await import(pathToFileURL(scriptPath).href);

  return verifyM03Schema({
    migrationSql,
    seedSql: fs.readFileSync(seedPath, "utf8"),
  });
}

describe("Milestone 03 schema contract verification", () => {
  it("covers the frozen enums, tables, RLS skeleton, indexes, storage, seeds, and guardrails", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    expect(`${result.stdout}${result.stderr}`).toContain(
      "M03 schema verification passed.",
    );
    expect(result.status).toBe(0);
  });

  it("rejects a reintroduced blanket authenticated owner DELETE policy", async () => {
    const migrationSql = `${fs.readFileSync(migrationPath, "utf8")}
execute format('create policy owned_rows_delete on public.%I for delete to authenticated using (user_id = auth.uid())', table_name);
`;

    await expect(runVerifier(migrationSql)).resolves.toContain(
      "Blanket owned_rows_delete policy name detected; DELETE policies must remain explicit by table/class.",
    );
  });

  it("rejects removal of the draft-only transaction DELETE guardrail", async () => {
    const migrationSql = fs
      .readFileSync(migrationPath, "utf8")
      .replace(
        /create policy transactions_delete_draft_owner[\s\S]*?using \(user_id = auth\.uid\(\) and status = 'draft'\);/,
        "create policy transactions_delete_owner on public.transactions\n  for delete to authenticated\n  using (user_id = auth.uid());",
      );

    await expect(runVerifier(migrationSql)).resolves.toContain(
      "Missing conditional draft-only authenticated DELETE policy for transactions.",
    );
  });

  it("rejects relaxing the annual obligation installment positive amount constraint", async () => {
    const migrationSql = fs
      .readFileSync(migrationPath, "utf8")
      .replace(
        "amount numeric(19,4) not null check (amount > 0),\n  due_date date not null,\n  status public.commitment_status",
        "amount numeric(19,4) not null check (amount >= 0),\n  due_date date not null,\n  status public.commitment_status",
      );

    await expect(runVerifier(migrationSql)).resolves.toContain(
      "annual_obligation_installments.amount must reject zero-value installments.",
    );
  });

  it("rejects moving the posted transaction amount rule away from transactions", async () => {
    const migrationSql = fs
      .readFileSync(migrationPath, "utf8")
      .replace(
        "amount numeric(19,4) not null check (status <> 'posted' or amount > 0),",
        "amount numeric(19,4) not null check (amount > 0),",
      );

    await expect(runVerifier(migrationSql)).resolves.toContain(
      "transactions.amount must enforce > 0 specifically for posted transactions.",
    );
  });
});
