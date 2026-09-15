import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const scriptPath = path.join(repoRoot, "scripts", "check-secrets.mjs");
const tempRepos: string[] = [];

function createTempRepo(files: Record<string, string>) {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "planner-secrets-"));
  tempRepos.push(repoPath);

  execFileSync("git", ["init", "--quiet"], {
    cwd: repoPath,
    stdio: "ignore",
  });

  for (const [filePath, content] of Object.entries(files)) {
    const absolutePath = path.join(repoPath, filePath);

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf8");
  }

  return repoPath;
}

function runSecretCheck(files: Record<string, string>) {
  const repoPath = createTempRepo(files);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: repoPath,
    encoding: "utf8",
  });

  return {
    status: result.status ?? 1,
    output: `${result.stdout}${result.stderr}`,
  };
}

function fakeJwt() {
  return [
    "eyJhbGciOiJIUzI1NiI",
    "cGF5bG9hZF9maXh0dXJl",
    "c2lnbmF0dXJlX2ZpeHR1cmU",
  ].join(".");
}

function fakeAwsAccessKeyId() {
  return ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
}

function fakeOpenAiKey() {
  return ["sk-", "a".repeat(24)].join("");
}

function fakeGitHubToken() {
  return ["ghp_", "a".repeat(24)].join("");
}

function fakePrivateKeyBlock() {
  return ["-----BEGIN ", "PRIVATE KEY-----"].join("");
}

afterEach(() => {
  for (const repoPath of tempRepos.splice(0)) {
    fs.rmSync(repoPath, { force: true, recursive: true });
  }
});

describe("secret hygiene CLI", () => {
  it("passes a clean file", () => {
    const result = runSecretCheck({
      "README.md": "Planner Vida environment documentation.\n",
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain("Secret hygiene check passed.");
  });

  it("detects existing secret patterns", () => {
    const result = runSecretCheck({
      ".env.local": [
        `NEUTRAL_OPENAI_VALUE=${fakeOpenAiKey()}`,
        `NEUTRAL_GITHUB_VALUE=${fakeGitHubToken()}`,
        fakePrivateKeyBlock(),
        "SERVER_SECRET=synthetic-value",
      ].join("\n"),
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain("possible OpenAI-style API key");
    expect(result.output).toContain("possible GitHub token");
    expect(result.output).toContain("possible private key block");
    expect(result.output).toContain(
      "possible non-empty server secret assignment",
    );
  });

  it("detects a JWT by format under a neutral variable name", () => {
    const result = runSecretCheck({
      ".env.local": `NEUTRAL_VALUE=${fakeJwt()}\n`,
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain("possible JWT");
  });

  it("detects an AWS access key ID by format under a neutral variable name", () => {
    const result = runSecretCheck({
      ".env.local": `NEUTRAL_VALUE=${fakeAwsAccessKeyId()}\n`,
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain("possible AWS Access Key ID");
  });

  it("allows safe placeholders and examples", () => {
    const result = runSecretCheck({
      ".env.example": [
        "SERVER_SECRET=",
        "SERVICE_ROLE_KEY=<server-only-service-role-key>",
        "PRIVATE_KEY=your-private-key",
        "API_TOKEN=example-token",
        "PASSWORD=changeme",
        "NEUTRAL_VALUE=eyJ.placeholder.example",
        "AWS_ACCESS_KEY_ID=AKIAEXAMPLE",
      ].join("\n"),
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain("Secret hygiene check passed.");
  });

  it("returns a failing exit code when any finding is present", () => {
    const result = runSecretCheck({
      ".env.local": `SERVER_TOKEN=${fakeJwt()}\n`,
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain("Secret hygiene check failed:");
  });
});
