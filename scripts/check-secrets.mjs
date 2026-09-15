import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const trackedFiles = execFileSync("git", ["ls-files"], {
  cwd: repoRoot,
  encoding: "utf8",
})
  .split(/\r?\n/)
  .filter(Boolean);
const untrackedFiles = execFileSync(
  "git",
  ["ls-files", "--others", "--exclude-standard"],
  {
    cwd: repoRoot,
    encoding: "utf8",
  },
)
  .split(/\r?\n/)
  .filter(Boolean);
const candidateFiles = [...new Set([...trackedFiles, ...untrackedFiles])];

const suspiciousPatterns = [
  {
    label: "OpenAI-style API key",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/,
  },
  {
    label: "GitHub token",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  },
  {
    label: "JWT",
    pattern: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    label: "AWS Access Key ID",
    pattern: /\bAKIA[A-Z0-9]{16}\b/,
  },
  {
    label: "private key block",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  },
  {
    label: "non-empty server secret assignment",
    pattern:
      /^(?![^\S\r\n]*#)[^\S\r\n]*(?:[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PRIVATE_KEY|PASSWORD|TOKEN)[A-Z0-9_]*)[^\S\r\n]*=[^\S\r\n]*(?!$|#|<|your-|example|changeme)/im,
  },
];

const findings = [];

for (const file of candidateFiles) {
  const absolutePath = path.join(repoRoot, file);

  if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
    continue;
  }

  const content = fs.readFileSync(absolutePath, "utf8");

  for (const { label, pattern } of suspiciousPatterns) {
    if (pattern.test(content)) {
      findings.push(`${file}: possible ${label}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Secret hygiene check failed:");

  for (const finding of findings) {
    console.error(`- ${finding}`);
  }

  process.exitCode = 1;
} else {
  console.log("Secret hygiene check passed.");
}
