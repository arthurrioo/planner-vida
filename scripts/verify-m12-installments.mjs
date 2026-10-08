import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260926000100_m12_installments_atomic_rpc.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

const requiredPatterns = [
  [/check \(total_installments between 1 and 60\)/i, "domain maximum 60"],
  [
    /create or replace function public\.create_installment_plan\(/i,
    "atomic plan creation RPC",
  ],
  [
    /create or replace function public\.realize_installment\(/i,
    "atomic realization RPC",
  ],
  [
    /create or replace function public\.cancel_installment_plan\(/i,
    "atomic cancellation RPC",
  ],
  [/security invoker/gi, "SECURITY INVOKER boundary"],
  [/m12_installment_validation/g, "database validation markers"],
  [/m12_installment_conflict/g, "database conflict markers"],
  [/origin_type[\s\S]*?'installment'/i, "installment-owned transaction origin"],
];

for (const [pattern, label] of requiredPatterns) {
  const matches = sql.match(pattern);
  if (
    !matches ||
    (label === "SECURITY INVOKER boundary" && matches.length < 4)
  ) {
    throw new Error(`M12 verifier missing ${label}.`);
  }
}

if (/security definer/i.test(sql)) {
  throw new Error("M12 RPCs must not use SECURITY DEFINER.");
}

if (/create\s+trigger/i.test(sql)) {
  throw new Error("M12 must not introduce hidden financial triggers.");
}

console.log("M12 installments migration verification passed.");
