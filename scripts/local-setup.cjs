const { spawnSync } = require("node:child_process");

const localDatabaseUrl =
  "postgresql://physio_dev:physio_dev_pass@localhost:5432/physio_note_finisher";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const dockerCommand = process.platform === "win32" ? "docker.exe" : "docker";
const env = { ...process.env, DATABASE_URL: localDatabaseUrl };

function run(command, args) {
  const result = spawnSync(command, args, { env, stdio: "inherit" });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(dockerCommand, ["compose", "up", "-d"]);
run(process.execPath, ["scripts/wait-for-db.cjs"]);
run(npmCommand, ["--workspace", "backend", "run", "prisma:migrate:deploy"]);
run(npmCommand, ["--workspace", "backend", "run", "prisma:seed"]);
