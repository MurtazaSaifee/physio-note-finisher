const { createHash } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const expectedSize = [1080, 2400];
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
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

const screenshotDirectory = process.env.CLINICAL_SCREENSHOT_DIRECTORY
  ? resolve(process.env.CLINICAL_SCREENSHOT_DIRECTORY)
  : resolve(__dirname, "../mobile/releases");
const manifestPath = resolve(screenshotDirectory, "clinical-ui-baseline-manifest.json");
const failures = [];

if (!existsSync(manifestPath)) {
  failures.push("clinical-ui-baseline-manifest.json: missing");
}

let manifest = null;
if (failures.length === 0) {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    failures.push("clinical-ui-baseline-manifest.json: unreadable");
  }
}

if (
  manifest &&
  (manifest.device?.serial !== "emulator-5554" ||
    manifest.device?.physicalSize !== expectedSize.join("x") ||
    manifest.captureCommand !== "adb exec-out screencap -p")
) {
  failures.push("clinical-ui-baseline-manifest.json: invalid emulator provenance");
}

failures.push(...requiredScreenshots.flatMap((fileName) => {
  const filePath = resolve(screenshotDirectory, fileName);
  if (!existsSync(filePath)) {
    return `${fileName}: missing`;
  }

  const png = readFileSync(filePath);
  if (
    png.length < 24 ||
    !png.subarray(0, 8).equals(pngSignature) ||
    png.toString("ascii", 12, 16) !== "IHDR"
  ) {
    return `${fileName}: invalid PNG`;
  }

  const size = [png.readUInt32BE(16), png.readUInt32BE(20)];
  if (size[0] !== expectedSize[0] || size[1] !== expectedSize[1]) {
    return `${fileName}: expected ${expectedSize.join("x")}, received ${size.join("x")}`;
  }

  const expectedHash = manifest?.screenshots?.[fileName]?.sha256;
  const actualHash = createHash("sha256").update(png).digest("hex");
  return expectedHash === actualHash ? [] : `${fileName}: manifest hash mismatch`;
}));

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Verified ${requiredScreenshots.length} phone-scale screenshot files at ${expectedSize.join("x")}.`);
