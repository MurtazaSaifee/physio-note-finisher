#!/usr/bin/env node

const { execFileSync, spawnSync } = require("node:child_process");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const backendDir = path.join(rootDir, "backend");
// Same default as scripts/local-setup.cjs: the Docker Compose database only.
const DOCKER_DATABASE_URL =
  "postgresql://physio_dev:physio_dev_pass@localhost:5433/physio_note_finisher";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? rootDir,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function runCombined(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? rootDir,
    env: process.env,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    fail(combined || `${command} ${args.join(" ")} failed`);
  }

  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function section(title) {
  process.stdout.write(`\n== ${title} ==\n`);
}

function fail(message) {
  process.stderr.write(`local-doctor: ${message}\n`);
  process.exit(1);
}

function parseJavaMajor(versionLine) {
  const match = versionLine.match(/version "(\d+)(?:\.(\d+))?/);
  if (!match) {
    return null;
  }

  const first = Number(match[1]);
  if (Number.isNaN(first)) {
    return null;
  }

  if (first === 1 && match[2]) {
    const legacy = Number(match[2]);
    return Number.isNaN(legacy) ? null : legacy;
  }

  return first;
}

function redactDatabaseUrl(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.password) {
      parsed.password = "REDACTED";
    }
    if (parsed.username) {
      parsed.username = "REDACTED";
    }
    return parsed.toString();
  } catch {
    return "(redacted invalid DATABASE_URL)";
  }
}

function checkPrisma() {
  section("Prisma");

  const databaseUrl = process.env.DATABASE_URL?.trim() || DOCKER_DATABASE_URL;
  const env = { DATABASE_URL: databaseUrl };

  process.stdout.write(`DATABASE_URL=${redactDatabaseUrl(databaseUrl)}\n`);

  const validateOutput = run("npx", ["prisma", "validate"], { cwd: backendDir, env });
  if (validateOutput) {
    process.stdout.write(`${validateOutput}\n`);
  }

  // Read-only: reports pending or drifted migrations without changing the database.
  const status = spawnSync("npx", ["prisma", "migrate", "status"], {
    cwd: backendDir,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  const statusOutput = `${status.stdout ?? ""}${status.stderr ?? ""}`.trim();
  if (statusOutput) {
    process.stdout.write(`${statusOutput}\n`);
  }
  if (status.status !== 0) {
    fail("database is unreachable or has unapplied migrations. Run `npm run setup` first.");
  }
}

function checkAndroid() {
  section("Android");

  const adbPath = run("which", ["adb"]);
  const sdkmanagerPath = run("which", ["sdkmanager"]);
  const emulatorPath = run("which", ["emulator"]);
  const javaPath = run("which", ["java"]);
  const javaVersionOutput = runCombined("java", ["-version"]);
  const javaVersionLine = javaVersionOutput.split("\n")[0] ?? "";
  const javaMajor = parseJavaMajor(javaVersionLine);

  process.stdout.write(`adb=${adbPath}\n`);
  process.stdout.write(`sdkmanager=${sdkmanagerPath}\n`);
  process.stdout.write(`emulator=${emulatorPath}\n`);
  process.stdout.write(`java=${javaPath}\n`);
  process.stdout.write(`${javaVersionLine}\n`);

  if (javaMajor !== null && javaMajor > 21) {
    fail(`Java ${javaMajor} is too new for the local Android build here. Use Java 21.`);
  }

  const devicesOutput = run("adb", ["devices"]);
  process.stdout.write(`${devicesOutput}\n`);

  const deviceLines = devicesOutput
    .split("\n")
    .filter((line) => /\t(device|offline)$/.test(line));

  const deviceLine = deviceLines.find((line) => /\tdevice$/.test(line));
  if (!deviceLine) {
    fail("no ready Android device is attached");
  }

  const serial = deviceLine.split("\t")[0]?.trim();
  if (!serial) {
    fail("could not determine attached device serial");
  }

  const bootCompleted = run("adb", ["-s", serial, "shell", "getprop", "sys.boot_completed"]);
  const bootAnim = run("adb", ["-s", serial, "shell", "getprop", "init.svc.bootanim"]);

  process.stdout.write(`serial=${serial}\n`);
  process.stdout.write(`sys.boot_completed=${bootCompleted || "(empty)"}\n`);
  process.stdout.write(`init.svc.bootanim=${bootAnim || "(empty)"}\n`);

  if (bootCompleted !== "1") {
    fail(`device ${serial} is attached but not fully booted`);
  }
}

function main() {
  const mode = (process.argv[2] || "all").toLowerCase();

  if (!["all", "prisma", "android"].includes(mode)) {
    fail(`unknown mode "${mode}"`);
  }

  if (mode === "all" || mode === "prisma") {
    checkPrisma();
  }

  if (mode === "all" || mode === "android") {
    checkAndroid();
  }

  process.stdout.write("\nlocal-doctor: ok\n");
}

main();
