const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const requiredScreenshots = [
  "clinical-ui-baseline-authentication.png",
  "clinical-ui-baseline-patient-list.png",
  "clinical-ui-baseline-patient-workspace.png",
  "clinical-ui-baseline-documentation-entry.png",
  "clinical-ui-baseline-voice-capture.png",
  "clinical-ui-baseline-transcript-review.png",
  "clinical-ui-baseline-manual-note.png",
  "clinical-ui-baseline-calendar.png",
  "clinical-ui-baseline-templates.png",
  "clinical-ui-baseline-export.png",
  "clinical-ui-baseline-profile-settings.png",
];

const directory = mkdtempSync(resolve(tmpdir(), "clinical-screenshot-baseline-"));
const forgedPng = Buffer.alloc(24);
forgedPng.writeUInt32BE(1080, 16);
forgedPng.writeUInt32BE(2400, 20);

try {
  requiredScreenshots.forEach((fileName) => writeFileSync(resolve(directory, fileName), forgedPng));
  const sha256 = createHash("sha256").update(forgedPng).digest("hex");
  writeFileSync(
    resolve(directory, "clinical-ui-baseline-manifest.json"),
    JSON.stringify({
      captureCommand: "adb exec-out screencap -p",
      device: { serial: "emulator-5554", physicalSize: "1080x2400" },
      screenshots: Object.fromEntries(requiredScreenshots.map((fileName) => [fileName, { sha256 }])),
    }),
  );
  const result = spawnSync("node", ["scripts/verify-clinical-screenshot-baseline.cjs"], {
    cwd: resolve(__dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, CLINICAL_SCREENSHOT_DIRECTORY: directory },
  });

  assert.notEqual(result.status, 0, "forged PNG bytes must not pass evidence verification");
  assert.match(result.stderr, /invalid PNG/);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
