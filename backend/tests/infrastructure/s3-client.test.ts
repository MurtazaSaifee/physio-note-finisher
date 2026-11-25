import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { extractS3Key, resetS3Client } from "../../src/infrastructure/s3/s3Client.js";

describe("extractS3Key", () => {
  const originalBucket = process.env.S3_BUCKET;

  beforeEach(() => {
    process.env.S3_BUCKET = "my-test-bucket";
  });

  afterEach(() => {
    process.env.S3_BUCKET = originalBucket;
    resetS3Client();
  });

  it("parses virtual-hosted style URLs", () => {
    const url = "https://my-test-bucket.s3.ap-south-1.amazonaws.com/recordings/session-1/audio.mp3";
    expect(extractS3Key(url)).toBe("recordings/session-1/audio.mp3");
  });

  it("parses path-style URLs", () => {
    const url = "https://s3.ap-south-1.amazonaws.com/my-test-bucket/recordings/session-1/audio.mp3";
    expect(extractS3Key(url)).toBe("recordings/session-1/audio.mp3");
  });

  it("returns raw key when input is not a URL", () => {
    expect(extractS3Key("recordings/session-1/audio.mp3")).toBe("recordings/session-1/audio.mp3");
  });

  it("decodes URL-encoded characters", () => {
    const url = "https://my-test-bucket.s3.ap-south-1.amazonaws.com/recordings/session%201/audio.mp3";
    expect(extractS3Key(url)).toBe("recordings/session 1/audio.mp3");
  });

  it("strips the bucket prefix from path-style URLs", () => {
    const url = "https://s3.ap-south-1.amazonaws.com/my-test-bucket/recordings/audio.mp3";
    expect(extractS3Key(url)).toBe("recordings/audio.mp3");
  });

  it("does not strip bucket name from virtual-hosted URLs", () => {
    const url = "https://my-test-bucket.s3.ap-south-1.amazonaws.com/my-test-bucket/audio.mp3";
    expect(extractS3Key(url)).toBe("my-test-bucket/audio.mp3");
  });
});
