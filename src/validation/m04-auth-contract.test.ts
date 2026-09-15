import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const migrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260915000200_m04_auth_profiles_authorization_rls.sql",
);

function read(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function listSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return listSourceFiles(fullPath);
    }

    return fullPath;
  });
}

describe("Milestone 04 auth contract", () => {
  it("creates profile lifecycle, role helper, and admin aggregate-only policies", () => {
    const migration = read(migrationPath);

    expect(migration).toContain("function public.handle_new_auth_user()");
    expect(migration).toContain("trigger on_auth_user_created");
    expect(migration).toContain("function public.current_user_has_role");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("prevent_profile_identity_mutation");
    expect(migration).toContain("admin_observability_metrics_admin_select");
    expect(migration).toContain("system_job_runs_admin_select");
  });

  it("does not add a human-admin bypass to owned financial tables", () => {
    const migration = read(migrationPath);

    expect(migration).not.toMatch(/accounts_admin/i);
    expect(migration).not.toMatch(/transactions_admin/i);
    expect(migration).not.toMatch(/user_id\s*=\s*auth\.uid\(\)\s+or/i);
    expect(migration).not.toContain("owned_rows_delete");
  });

  it("keeps service role credentials out of browser-facing source", () => {
    const sourceFiles = ["app", "components", "lib"]
      .flatMap((directory) =>
        listSourceFiles(path.join(repoRoot, "src", directory)),
      )
      .filter((filePath) => /\.(ts|tsx)$/.test(filePath));

    const forbiddenReferences = sourceFiles
      .map((filePath) => ({
        filePath,
        source: read(filePath),
      }))
      .filter(({ source }) =>
        /SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(source),
      );

    expect(forbiddenReferences).toEqual([]);
  });
});
