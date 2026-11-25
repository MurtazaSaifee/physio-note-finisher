#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const mobileDir = path.join(rootDir, "mobile");
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";

function fail(message) {
  process.stderr.write(`react-doctor: ${message}\n`);
  process.exit(1);
}

function runExpoDoctor() {
  try {
    return execFileSync(npxCmd, ["--yes", "expo-doctor", "--verbose"], {
      cwd: mobileDir,
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stdout = typeof error.stdout === "string" ? error.stdout : "";
    const stderr = typeof error.stderr === "string" ? error.stderr : "";

    if (stdout) {
      process.stdout.write(stdout);
      if (!stdout.endsWith("\n")) {
        process.stdout.write("\n");
      }
    }

    if (stderr) {
      process.stderr.write(stderr);
      if (!stderr.endsWith("\n")) {
        process.stderr.write("\n");
      }
    }

    fail("Expo Doctor failed");
  }
}

function main() {
  const output = runExpoDoctor();
  const trimmed = output.trim();

  if (trimmed) {
    process.stdout.write(`${trimmed}\n`);
  }

  const summary = trimmed.match(/(\d+)\/(\d+)\s+checks passed/i);
  if (!summary) {
    fail("Expo Doctor did not report a checks-passed summary");
  }

  const passed = Number(summary[1]);
  const total = Number(summary[2]);
  if (passed !== total) {
    fail(`Expo Doctor goal not met: ${passed}/${total} checks passed`);
  }

  process.stdout.write(`react-doctor: ${passed}/${total} checks passed\n`);
}

main();
