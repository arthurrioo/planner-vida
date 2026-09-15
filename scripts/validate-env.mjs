import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const contractPath = path.join(repoRoot, "config", "environment-contract.json");

const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const values = {};
  const content = fs.readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function readEnvironment(target) {
  const fileCandidates =
    target === "ci" ? [] : [".env", `.env.${target}`, ".env.local"];
  const ciDefaults =
    target === "ci"
      ? {
          APP_VERSION: "ci",
          NEXT_PUBLIC_APP_ENV: "test",
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        }
      : {};
  const fileValues = fileCandidates.reduce(
    (accumulator, fileName) => ({
      ...accumulator,
      ...parseEnvFile(path.join(repoRoot, fileName)),
    }),
    {},
  );

  return {
    ...ciDefaults,
    ...fileValues,
    ...process.env,
  };
}

function formatList(values) {
  return values.map((value) => `'${value}'`).join(", ");
}

function validatePublicSecretNaming(environment) {
  return Object.keys(environment)
    .filter((key) => key.startsWith("NEXT_PUBLIC_"))
    .filter((key) => /(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|TOKEN)/i.test(key))
    .map(
      (key) =>
        `Public environment variable '${key}' looks secret-bearing. Server-only secrets must not use NEXT_PUBLIC_.`,
    );
}

function validateEnvironment(target, environment) {
  const environmentContract = contract.environments[target];

  if (!environmentContract) {
    const knownTargets = Object.keys(contract.environments).join(", ");
    return {
      ok: false,
      errors: [
        `Unknown environment target '${target}'. Use one of: ${knownTargets}.`,
      ],
    };
  }

  const errors = [];

  for (const key of environmentContract.required) {
    if (!environment[key]) {
      const variable = contract.variables[key];
      errors.push(
        `Missing required environment variable '${key}' for '${target}': ${variable.description}`,
      );
    }
  }

  for (const [key, expectedValues] of Object.entries(
    environmentContract.expectedValues ?? {},
  )) {
    const actualValue = environment[key];

    if (actualValue && !expectedValues.includes(actualValue)) {
      errors.push(
        `Invalid value for '${key}' in '${target}': got '${actualValue}', expected ${formatList(
          expectedValues,
        )}.`,
      );
    }
  }

  errors.push(...validatePublicSecretNaming(environment));

  return {
    ok: errors.length === 0,
    errors,
  };
}

function printResult(target, result) {
  if (result.ok) {
    console.log(`Environment validation passed for '${target}'.`);
    return;
  }

  console.error(`Environment validation failed for '${target}':`);

  for (const error of result.errors) {
    console.error(`- ${error}`);
  }
}

const target = process.argv[2] ?? "local";
const result = validateEnvironment(target, readEnvironment(target));

printResult(target, result);

if (!result.ok) {
  process.exitCode = 1;
}

export { parseEnvFile, validateEnvironment };
