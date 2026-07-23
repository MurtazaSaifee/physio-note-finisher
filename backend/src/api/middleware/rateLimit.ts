import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { parseSecurityEnv } from "../../config/env.js";

type RateLimitState = {
  windowStartMs: number;
  requestCount: number;
};

type RateLimitOptions = {
  keyPrefix: string;
  maxRequestsPerMinute: number;
  now?: () => number;
};

export type RateLimitPreHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<void>;

const WINDOW_DURATION_MS = 60_000;
const CLEANUP_INTERVAL_MS = WINDOW_DURATION_MS;
const MAX_RATE_COUNTER_ENTRIES = 10_000;

function createRateLimitPreHandler(options: RateLimitOptions): {
  preHandler: RateLimitPreHandler;
  dispose: () => void;
} {
  const rateCounters = new Map<string, RateLimitState>();
  const getNow = options.now ?? Date.now;
  let isDisposed = false;

  const cleanupExpiredEntries = () => {
    const nowMs = getNow();

    for (const [key, state] of rateCounters) {
      if (nowMs - state.windowStartMs >= WINDOW_DURATION_MS) {
        rateCounters.delete(key);
      }
    }
  };

  const cleanupInterval = setInterval(
    cleanupExpiredEntries,
    CLEANUP_INTERVAL_MS,
  ) as ReturnType<typeof setInterval> & { unref?: () => void };
  if (typeof cleanupInterval.unref === "function") {
    cleanupInterval.unref();
  }

  const preHandler: RateLimitPreHandler = async (request, reply) => {
    const key = `${options.keyPrefix}:${request.ip}`;
    const nowMs = getNow();
    const current = rateCounters.get(key);

    if (!current || nowMs - current.windowStartMs >= WINDOW_DURATION_MS) {
      if (rateCounters.size >= MAX_RATE_COUNTER_ENTRIES) {
        const oldestKey = rateCounters.keys().next().value;
        if (oldestKey) {
          rateCounters.delete(oldestKey);
        }
      }
      rateCounters.set(key, {
        windowStartMs: nowMs,
        requestCount: 1,
      });
      return;
    }

    if (current.requestCount >= options.maxRequestsPerMinute) {
      await reply.code(429).send({ error: "Too many requests" });
      return;
    }

    current.requestCount += 1;
  };

  return {
    preHandler,
    dispose() {
      if (isDisposed) {
        return;
      }

      isDisposed = true;
      clearInterval(cleanupInterval);
    },
  };
}

function createRateLimiter(options: RateLimitOptions): {
  preHandler: RateLimitPreHandler;
  dispose: () => void;
} {
  return createRateLimitPreHandler(options);
}

export function createAuthRateLimitMiddleware(): {
  loginRateLimit: RateLimitPreHandler;
  refreshRateLimit: RateLimitPreHandler;
  llmGenerateRateLimit: RateLimitPreHandler;
  llmRegenerateRateLimit: RateLimitPreHandler;
};

export function createAuthRateLimitMiddleware(
  app: FastifyInstance,
): {
  loginRateLimit: RateLimitPreHandler;
  refreshRateLimit: RateLimitPreHandler;
  llmGenerateRateLimit: RateLimitPreHandler;
  llmRegenerateRateLimit: RateLimitPreHandler;
};

export function createAuthRateLimitMiddleware(
  app?: FastifyInstance,
): {
  loginRateLimit: RateLimitPreHandler;
  refreshRateLimit: RateLimitPreHandler;
  llmGenerateRateLimit: RateLimitPreHandler;
  llmRegenerateRateLimit: RateLimitPreHandler;
} {
  const env = parseSecurityEnv();

  const loginRateLimit = createRateLimiter({
    keyPrefix: "auth-login",
    maxRequestsPerMinute: env.authLoginRateLimitPerMinute,
  });
  const refreshRateLimit = createRateLimiter({
    keyPrefix: "auth-refresh",
    maxRequestsPerMinute: env.authRefreshRateLimitPerMinute,
  });
  const llmGenerateRateLimit = createRateLimiter({
    keyPrefix: "llm-generate",
    maxRequestsPerMinute: 10,
  });
  const llmRegenerateRateLimit = createRateLimiter({
    keyPrefix: "llm-regenerate",
    maxRequestsPerMinute: 5,
  });

  if (app) {
    app.addHook("onClose", async () => {
      loginRateLimit.dispose();
      refreshRateLimit.dispose();
      llmGenerateRateLimit.dispose();
      llmRegenerateRateLimit.dispose();
    });
  }

  return {
    loginRateLimit: loginRateLimit.preHandler,
    refreshRateLimit: refreshRateLimit.preHandler,
    llmGenerateRateLimit: llmGenerateRateLimit.preHandler,
    llmRegenerateRateLimit: llmRegenerateRateLimit.preHandler,
  };
}
