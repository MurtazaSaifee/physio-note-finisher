import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("Android splash resources", () => {
  it("uses a Meridian vector mark for the modern Android splash", () => {
    const backgroundPath = fileURLToPath(
      new URL("../../android/app/src/main/res/drawable/ic_launcher_background.xml", import.meta.url),
    );
    const logoPath = fileURLToPath(
      new URL(
        "../../android/app/src/main/res/drawable-anydpi-v21/splashscreen_logo.xml",
        import.meta.url,
      ),
    );

    expect(existsSync(logoPath)).toBe(true);

    const background = readFileSync(backgroundPath, "utf8");
    const logo = readFileSync(logoPath, "utf8");

    expect(background).toContain('android:drawable="@drawable/splashscreen_logo"');
    expect(background).toContain('android:gravity="center"');
    expect(background).not.toContain('android:src="@drawable/splashscreen_logo"');
    expect(logo).toMatch(/<vector\b/);
    expect(logo).toContain('android:fillColor="#3F527A"');
    expect(logo).toContain('android:fillColor="#E8ECF6"');
  });
});
