#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const steps = [
  { label: "Lint", command: npmCmd, args: ["run", "lint"] },
  { label: "Typecheck", command: npmCmd, args: ["run", "typecheck"] },
  { label: "Tests", command: npmCmd, args: ["run", "test"] },
];

function main() {
  for (const [index, step] of steps.entries()) {
    process.stdout.write(
      `\n== [${index + 1}/${steps.length}] ${step.label} ==\n`,
    );
    execFileSync(step.command, step.args, {
      cwd: rootDir,
      env: process.env,
      stdio: "inherit",
    });
  }

  process.stdout.write("\nverify:local: ok\n");
}

main();
