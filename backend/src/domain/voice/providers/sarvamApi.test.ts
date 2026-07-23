import { describe, expect, it } from "vitest";

import { assertSafeProviderFileUrl } from "./sarvamApi.js";

describe("Sarvam provider file URLs", () => {
  it("accepts an HTTPS object-storage URL", () => {
    expect(
      assertSafeProviderFileUrl(
        "https://example.blob.core.windows.net/container/audio.m4a?sig=test",
      ).hostname,
    ).toBe("example.blob.core.windows.net");
  });

  it.each([
    "http://example.com/audio.m4a",
    "https://localhost/audio.m4a",
    "https://127.0.0.1/audio.m4a",
    "https://10.0.0.2/audio.m4a",
    "https://169.254.169.254/latest/meta-data",
    "https://user:password@example.com/audio.m4a",
  ])("rejects unsafe provider URL %s", (url) => {
    expect(() => assertSafeProviderFileUrl(url)).toThrow(
      "Unsafe provider file URL",
    );
  });
});
