import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("android release signing", () => {
  it("gives debug builds a distinct application identifier", () => {
    const buildGradlePath = fileURLToPath(new URL("../../android/app/build.gradle", import.meta.url));
    const buildGradle = readFileSync(buildGradlePath, "utf8");

    const buildTypesStart = buildGradle.indexOf("    buildTypes {");
    const debugBlockStart = buildGradle.indexOf("        debug {", buildTypesStart);
    const debugBlockEnd = buildGradle.indexOf("        release {", debugBlockStart);
    expect(debugBlockStart).toBeGreaterThan(-1);
    expect(debugBlockEnd).toBeGreaterThan(debugBlockStart);

    const debugBlock = buildGradle.slice(debugBlockStart, debugBlockEnd);
    expect(buildGradle).toContain("applicationId 'com.murtazasaifee.physionotefinisher'");
    expect(debugBlock).toContain('applicationIdSuffix ".debug"');

    const releaseBlockStart = buildGradle.indexOf("        release {", buildTypesStart);
    const releaseBlockEnd = buildGradle.indexOf("    }\n    packagingOptions {", releaseBlockStart);
    const releaseBlock = buildGradle.slice(releaseBlockStart, releaseBlockEnd);
    expect(releaseBlock).not.toContain("applicationIdSuffix");
  });

  it("keeps local development tooling on the debug package", () => {
    const emulatorUpScriptPath = fileURLToPath(new URL("../../../scripts/emulator-dev-up.sh", import.meta.url));
    const emulatorDownScriptPath = fileURLToPath(new URL("../../../scripts/emulator-dev-down.sh", import.meta.url));
    const phoneUpScriptPath = fileURLToPath(new URL("../../../scripts/phone-wireless-dev-up.sh", import.meta.url));
    const phoneDownScriptPath = fileURLToPath(new URL("../../../scripts/phone-wireless-dev-down.sh", import.meta.url));
    const e2eRunnerPath = fileURLToPath(new URL("../../e2e/run-e2e.sh", import.meta.url));
    const e2eHelpersPath = fileURLToPath(new URL("../../e2e/helpers.js", import.meta.url));
    const packageJsonPath = fileURLToPath(new URL("../../../package.json", import.meta.url));
    const debugPackage = "com.murtazasaifee.physionotefinisher.debug";

    // The wireless-phone scripts are private tooling and are not in the public export.
    const phoneScripts = [phoneUpScriptPath, phoneDownScriptPath].filter((scriptPath) => existsSync(scriptPath));
    for (const scriptPath of [emulatorUpScriptPath, emulatorDownScriptPath, ...phoneScripts]) {
      expect(readFileSync(scriptPath, "utf8")).toContain(`APP_ID="${'${APP_ID:-'}${debugPackage}}"`);
    }

    expect(readFileSync(e2eRunnerPath, "utf8")).toContain(`APP_PACKAGE="${debugPackage}"`);

    const e2eHelpers = readFileSync(e2eHelpersPath, "utf8");
    expect(e2eHelpers).toContain(`const APP_PACKAGE = "${debugPackage}";`);
    expect(e2eHelpers).toContain('const APP_ACTIVITY = "com.murtazasaifee.physionotefinisher.MainActivity";');
    expect(e2eHelpers).toContain("${packageName}/${APP_ACTIVITY}");

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { scripts: Record<string, string> };
    expect(packageJson.scripts["e2e:android:local"]).toContain(`APP_ID=${'${APP_ID:-'}${debugPackage}}`);
  });

  it("uses a dedicated release signing config instead of the debug keystore", () => {
    const buildGradlePath = fileURLToPath(new URL("../../android/app/build.gradle", import.meta.url));
    const buildGradle = readFileSync(buildGradlePath, "utf8");

    const buildTypesStart = buildGradle.indexOf("    buildTypes {");
    const releaseBlockStart = buildGradle.indexOf("        release {", buildTypesStart);
    const releaseBlockEnd = buildGradle.indexOf("    }\n    packagingOptions {", releaseBlockStart);
    expect(buildTypesStart).toBeGreaterThan(-1);
    expect(releaseBlockStart).toBeGreaterThan(-1);
    expect(releaseBlockEnd).toBeGreaterThan(releaseBlockStart);
    const releaseBlock = buildGradle.slice(releaseBlockStart, releaseBlockEnd);

    expect(releaseBlock).toContain("signingConfig signingConfigs.release");
    expect(releaseBlock).not.toContain("signingConfig signingConfigs.debug");
    expect(buildGradle).toContain("releaseBuildRequested");
    expect(buildGradle).toContain("if (releaseBuildRequested && !releaseSigningConfigured)");
    expect(buildGradle).toContain("ANDROID_RELEASE_STORE_FILE");
    expect(buildGradle).toContain("ANDROID_RELEASE_STORE_PASSWORD");
    expect(buildGradle).toContain("ANDROID_RELEASE_KEY_ALIAS");
    expect(buildGradle).toContain("ANDROID_RELEASE_KEY_PASSWORD");
  });

  it("keeps release cleartext disabled by default and only enables it for local HTTP builds", () => {
    const buildGradlePath = fileURLToPath(new URL("../../android/app/build.gradle", import.meta.url));
    const manifestPath = fileURLToPath(new URL("../../android/app/src/main/AndroidManifest.xml", import.meta.url));
    const buildGradle = readFileSync(buildGradlePath, "utf8");
    const manifest = readFileSync(manifestPath, "utf8");

    expect(manifest).toContain('android:usesCleartextTraffic="${releaseCleartextTrafficPermitted}"');
    expect(manifest).not.toContain('android:usesCleartextTraffic="true"');
    expect(buildGradle).toContain('def releaseApiBaseUrl = System.getenv("EXPO_PUBLIC_API_BASE_URL")?.trim()');
    expect(buildGradle).toContain('def isPrivateNetworkHost = { host ->');
    expect(buildGradle).toContain('host ==~ /^192\\.168\\..*/');
    expect(buildGradle).toContain('return isPrivateNetworkHost(host)');
    expect(buildGradle).toContain('releaseCleartextTrafficPermitted: "false"');
    expect(buildGradle).toContain('releaseCleartextTrafficPermitted: shouldAllowLocalReleaseCleartext() ? "true" : "false"');
  });

});
