import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createInMemoryAuthRepository } from "../../src/api/routes/auth.js";
import Fastify from "fastify";

import { buildServer, registerErrorHandler } from "../../src/server.js";

const savedEnv = { ...process.env };

describe("error responses", () => {
  beforeEach(() => {
    Object.assign(process.env, {
      APP_ENV: "local",
      NODE_ENV: "test",
      JWT_ACCESS_SECRET: "test-access-secret",
      JWT_REFRESH_SECRET: "test-refresh-secret",
      ACCESS_TOKEN_TTL_SECONDS: "900",
      REFRESH_TOKEN_TTL_SECONDS: "604800",
      BCRYPT_COST_FACTOR: "8",
      AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: "100",
      AUTH_REFRESH_RATE_LIMIT_PER_MINUTE: "100",
    });
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("never echoes internal error text on a 500", async () => {
    const app = Fastify();
    registerErrorHandler(app);
    app.get("/__test/boom", async () => {
      throw new Error('relation "Patient" does not exist; password=hunter2');
    });
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/__test/boom" });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "Internal Server Error" });
    expect(response.body).not.toContain("hunter2");
    await app.close();
  });

  it("keeps Fastify's safe message for client errors such as malformed JSON", async () => {
    const app = await buildServer({ repository: createInMemoryAuthRepository() });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty("error");
    await app.close();
  });
});
