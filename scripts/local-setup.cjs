#!/usr/bin/env node
/**
 * One-command local setup:
 *   1. create backend/.env and mobile/.env from the examples if they are missing
 *   2. start Postgres in Docker and wait until it is healthy
 *   3. apply Prisma migrations
 *   4. load the synthetic demo clinic (clinician@example.com / password123)
 *
 * Always targets the Docker database below, never whatever DATABASE_URL your
 * own backend/.env points at, so it cannot touch another local database.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const DOCKER_DATABASE_URL =
  "postgresql://physio_dev:physio_dev_pass@localhost:5433/physio_note_finisher";
const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";
const npx = isWindows ? "npx.cmd" : "npx";

function step(message) {
  process.stdout.write(`\n▸ ${message}\n`);
}

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      console.error(`\n✖ '${command}' was not found. Is it installed and on your PATH?`);
    }
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function copyIfMissing(example, target) {
  const examplePath = path.join(rootDir, example);
  const targetPath = path.join(rootDir, target);
  if (fs.existsSync(targetPath)) {
    process.stdout.write(`  ${target} already exists, leaving it alone\n`);
    return;
  }
  fs.copyFileSync(examplePath, targetPath);
  process.stdout.write(`  created ${target} from ${example}\n`);
}

step("Environment files");
copyIfMissing("backend/.env.example", "backend/.env");
copyIfMissing("mobile/.env.example", "mobile/.env");

step("Starting Postgres (Docker) and waiting for it to be healthy");
run("docker", ["compose", "up", "-d", "--wait", "db"]);

step("Generating the Prisma client");
run(npm, ["--workspace", "backend", "run", "prisma:generate"], { DATABASE_URL: DOCKER_DATABASE_URL });

step("Applying database migrations");
run(
  npx,
  ["prisma", "migrate", "deploy", "--config", "backend/prisma.config.ts", "--schema", "backend/prisma/schema.prisma"],
  { DATABASE_URL: DOCKER_DATABASE_URL },
);

step("Loading synthetic demo data");
run(npm, ["--workspace", "backend", "run", "db:seed"], { DATABASE_URL: DOCKER_DATABASE_URL });

process.stdout.write("\n✔ Database ready. Next: `npm run dev` (API) and `npm run android` (app).\n");
