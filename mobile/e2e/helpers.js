const { execSync } = require("child_process");
const path = require("path");

const SCRIPTS_DIR = process.env.ANDROID_EMULATOR_SCRIPTS_DIR || path.resolve(__dirname, "../../.agents/skills/android-emulator-skill/scripts");

function runScript(scriptName, args = [], retries = 3) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const cmd = `python3 "${scriptPath}" ${args.join(" ")}`;
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const output = execSync(cmd, { encoding: "utf-8", stdio: "pipe", timeout: 15000 });
      return output.trim();
    } catch (error) {
      lastError = error;
      if (i < retries - 1) {
        execSync("sleep 1");
      }
    }
  }
  throw new Error(
    `Script ${scriptName} failed after ${retries} retries: ${lastError.stderr || lastError.message}`
  );
}

const APP_PACKAGE = "com.murtazasaifee.physionotefinisher.debug";
const APP_ACTIVITY = "com.murtazasaifee.physionotefinisher.MainActivity";

function launchApp(packageName = APP_PACKAGE) {
  try {
    execSync(`adb shell am force-stop ${packageName}`, { encoding: "utf-8", stdio: "pipe" });
  } catch {
    // ignore
  }
  try {
    execSync(`adb shell am start -n ${packageName}/${APP_ACTIVITY}`, { encoding: "utf-8", stdio: "pipe" });
  } catch {
    // ignore
  }
  return `Launched ${packageName}`;
}

function terminateApp(packageName = APP_PACKAGE) {
  execSync(`adb shell am force-stop ${packageName}`, { encoding: "utf-8", stdio: "pipe" });
  return `Terminated ${packageName}`;
}

function tapElementByTestId(testId) {
  return runScript("navigator.py", [`--find-id`, testId, `--tap`]);
}

function tapElementByText(text, index = 0) {
  return runScript("navigator.py", [
    `--find-text`,
    `"${text}"`,
    `--index`,
    String(index),
    `--tap`,
  ]);
}

function tapElementById(id) {
  return runScript("navigator.py", [`--find-id`, id, `--tap`]);
}

function enterTextByType(type, text) {
  return runScript("navigator.py", [
    `--find-type`,
    type,
    `--enter-text`,
    `"${text}"`,
  ]);
}

function enterTextById(id, text) {
  return runScript("navigator.py", [
    `--find-id`,
    id,
    `--enter-text`,
    `"${text}"`,
  ]);
}

function mapScreen() {
  return runScript("screen_mapper.py", [`--json`]);
}

function tapElementByContentDesc(desc) {
  const screen = runScript("screen_mapper.py", [`--json`]);
  const elements = JSON.parse(screen).all_elements || [];
  const match = elements.find(
    (el) => (el["content-desc"] || "").toLowerCase() === desc.toLowerCase()
  );
  if (!match) {
    throw new Error(`Element with content-desc "${desc}" not found`);
  }
  const cx = match.bounds?.center_x ?? match.bounds?.x + match.bounds?.width / 2;
  const cy = match.bounds?.center_y ?? match.bounds?.y + match.bounds?.height / 2;
  const cmd = `adb shell input tap ${Math.round(cx)} ${Math.round(cy)}`;
  execSync(cmd, { encoding: "utf-8", stdio: "pipe" });
  return `Tapped ${desc} at ${Math.round(cx)},${Math.round(cy)}`;
}

function pressKey(key) {
  return runScript("keyboard.py", [`--key`, key]);
}

function typeText(text) {
  return runScript("keyboard.py", [`--text`, `"${text}"`]);
}

function assertElementExists(text, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const screen = mapScreen();
      if (screen.includes(text)) return;
    } catch {
      // ignore
    }
    execSync("sleep 0.5");
  }
  throw new Error(`Element with text "${text}" not found within ${timeoutMs}ms`);
}

function waitFor(ms) {
  execSync(`sleep ${ms / 1000}`);
}

module.exports = {
  launchApp,
  terminateApp,
  tapElementByTestId,
  tapElementByText,
  tapElementById,
  tapElementByContentDesc,
  enterTextByType,
  enterTextById,
  mapScreen,
  pressKey,
  typeText,
  assertElementExists,
  waitFor,
};
