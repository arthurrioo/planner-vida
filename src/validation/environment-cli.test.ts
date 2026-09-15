import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const scriptPath = path.join(repoRoot, "scripts", "validate-env.mjs");

function runValidator(target: string, env: Record<string, string | undefined>) {
  try {
    const output = execFileSync(process.execPath, [scriptPath, target], {
      cwd: repoRoot,
      encoding: "utf8",
      env: env as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    return {
      status: 0,
      output,
    };
  } catch (error) {
    const commandError = error as {
      status?: number;
      stdout?: Buffer | string;
      stderr?: Buffer | string;
    };

    return {
      status: commandError.status ?? 1,
      output: `${commandError.stdout ?? ""}${commandError.stderr ?? ""}`,
    };
  }
}

describe("environment validation CLI", () => {
  it("reports missing preview variables clearly", () => {
    const result = runValidator("preview", {
      PATH: process.env.PATH,
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "Missing required environment variable 'NEXT_PUBLIC_APP_ENV' for 'preview'",
    );
    expect(result.output).toContain(
      "Missing required environment variable 'NEXT_PUBLIC_SUPABASE_URL' for 'preview'",
    );
  });

  it("passes the CI contract with synthetic values", () => {
    const result = runValidator("ci", {
      APP_VERSION: "test",
      NEXT_PUBLIC_APP_ENV: "test",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      PATH: process.env.PATH,
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain("Environment validation passed for 'ci'.");
  });

  it("blocks secret-looking public variable names", () => {
    const result = runValidator("ci", {
      APP_VERSION: "test",
      NEXT_PUBLIC_APP_ENV: "test",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SERVICE_ROLE_KEY: "not-allowed",
      PATH: process.env.PATH,
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "Public environment variable 'NEXT_PUBLIC_SERVICE_ROLE_KEY' looks secret-bearing",
    );
  });
});
