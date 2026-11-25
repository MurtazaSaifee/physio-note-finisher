import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerHealthRoutes } from "../../src/api/routes/health.js";
import { prisma } from "../../src/data/prismaClient.js";
import { getSqsClient } from "../../src/infrastructure/sqs/sqsClient.js";

const s3SendMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/data/prismaClient.js", () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock("../../src/infrastructure/sqs/sqsClient.js", () => ({
  getSqsClient: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", async () => {
  const actual = await vi.importActual<typeof import("@aws-sdk/client-s3")>(
    "@aws-sdk/client-s3",
  );
  return {
    ...actual,
    S3Client: vi.fn(function () { return ({ send: s3SendMock }); }),
  };
});

const originalEnv = { ...process.env };

function safePayloadText(payload: unknown): string {
  return JSON.stringify(payload);
}

function expectSafePayload(payload: unknown): void {
  const text = safePayloadText(payload);
  expect(text).not.toContain("DATABASE_URL");
  expect(text).not.toContain("S3_BUCKET");
  expect(text).not.toContain("SQS_");
  expect(text).not.toContain("JWT_");
  expect(text).not.toContain("postgresql://");
  expect(text).not.toContain("private-bucket");
  expect(text).not.toContain("amazonaws.com");
}

describe("health routes", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      APP_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@db.internal:5432/physio",
      S3_REGION: "ap-south-1",
      S3_BUCKET: "private-bucket",
      SQS_VOICE_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123/voice",
      SQS_CALENDAR_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123/calendar",
      SQS_REMINDER_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123/reminder",
      SQS_EXPORT_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123/export",
      JWT_ACCESS_SECRET: "access-secret",
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    s3SendMock.mockReset();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("returns a minimal API health payload", async () => {
    const app = Fastify();
    registerHealthRoutes(app);
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/health" });
    const payload = response.json();

    expect(response.statusCode).toBe(200);
    expect(payload).toEqual({ status: "ok" });
  });

  it("checks database readiness with a safe payload", async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([{ one: 1 }]);
    const app = Fastify();
    registerHealthRoutes(app);
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/health/db" });
    const payload = response.json();

    expect(response.statusCode).toBe(200);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith("SELECT 1");
    expect(payload).toEqual({
      status: "ok",
      component: "db",
      requestId: expect.any(String),
    });
    expectSafePayload(payload);
  });

  it("checks queue readiness without leaking queue URLs", async () => {
    const send = vi.fn().mockResolvedValue({});
    vi.mocked(getSqsClient).mockReturnValue({ send } as never);
    const app = Fastify();
    registerHealthRoutes(app);
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/health/queue" });
    const payload = response.json();

    expect(response.statusCode).toBe(200);
    expect(send).toHaveBeenCalledTimes(4);
    expect(payload).toEqual({
      status: "ok",
      component: "queue",
      requestId: expect.any(String),
    });
    expectSafePayload(payload);
  });

  it("treats the local queue as healthy without AWS queue env vars", async () => {
    process.env.APP_ENV = "local";
    delete process.env.SQS_VOICE_QUEUE_URL;
    delete process.env.SQS_CALENDAR_QUEUE_URL;
    delete process.env.SQS_REMINDER_QUEUE_URL;
    delete process.env.SQS_EXPORT_QUEUE_URL;

    const app = Fastify();
    registerHealthRoutes(app);
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/health/queue" });
    const payload = response.json();

    expect(response.statusCode).toBe(200);
    expect(getSqsClient).not.toHaveBeenCalled();
    expect(payload).toEqual({
      status: "ok",
      component: "queue",
      requestId: expect.any(String),
    });
    expectSafePayload(payload);
  });

  it("checks storage readiness without leaking bucket names", async () => {
    s3SendMock.mockResolvedValue({});
    const app = Fastify();
    registerHealthRoutes(app);
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/health/storage" });
    const payload = response.json();

    expect(response.statusCode).toBe(200);
    expect(s3SendMock).toHaveBeenCalledTimes(1);
    expect(payload).toEqual({
      status: "ok",
      component: "storage",
      requestId: expect.any(String),
    });
    expectSafePayload(payload);
  });
});
