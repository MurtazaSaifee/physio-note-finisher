#!/usr/bin/env node
/**
 * Dependency audit gate used by CI.
 *
 * Fails on any high or critical advisory unless the affected package is listed
 * in scripts/audit-exceptions.json with a reason and an expiry date. Expired
 * exceptions fail the gate too, so accepted risk is re-reviewed, not forgotten.
 */
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const exceptions = require("./audit-exceptions.json");
const BLOCKING = new Set(["high", "critical"]);

function runAudit() {
  try {
    return execFileSync("npm", ["audit", "--json"], { cwd: rootDir, encoding: "utf8" });
  } catch (error) {
    // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
    if (error.stdout) {
      return error.stdout;
    }
    throw error;
  }
}

const report = JSON.parse(runAudit());
const today = new Date().toISOString().slice(0, 10);
const byName = new Map(exceptions.map((entry) => [entry.package, entry]));
const failures = [];
const accepted = [];

for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  if (!BLOCKING.has(vuln.severity)) {
    continue;
  }
  const exception = byName.get(name);
  if (!exception) {
    failures.push(`${vuln.severity.padEnd(8)} ${name} (no exception)`);
  } else if (exception.expires < today) {
    failures.push(`${vuln.severity.padEnd(8)} ${name} (exception expired ${exception.expires})`);
  } else {
    accepted.push(`${vuln.severity.padEnd(8)} ${name}: ${exception.reason}`);
  }
}

const totals = report.metadata?.vulnerabilities ?? {};
process.stdout.write(
  `npm audit: ${totals.critical ?? 0} critical, ${totals.high ?? 0} high, ` +
    `${totals.moderate ?? 0} moderate, ${totals.low ?? 0} low\n`,
);
if (accepted.length > 0) {
  process.stdout.write(`\nAccepted (see scripts/audit-exceptions.json):\n  ${accepted.join("\n  ")}\n`);
}
if (failures.length > 0) {
  process.stderr.write(`\nBlocking advisories:\n  ${failures.join("\n  ")}\n`);
  process.exit(1);
}
process.stdout.write("\naudit gate: ok\n");
