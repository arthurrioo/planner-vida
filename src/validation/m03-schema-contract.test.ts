import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const scriptPath = path.join(repoRoot, "scripts", "verify-m03-schema.mjs");

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
});
