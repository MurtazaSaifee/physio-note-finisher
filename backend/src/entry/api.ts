import "dotenv/config";

import { parseAppEnv, parseSecurityEnv } from "../config/env.js";
import { applyManagedSecrets } from "../config/secrets.js";
import { createLogger } from "../observability/logger.js";

const logger = createLogger({ component: "apiEntry" });

async function main(): Promise<void> {
  const appEnv = parseAppEnv();
  await applyManagedSecrets(appEnv);
  parseSecurityEnv();
  const [{ resolveVoiceProviders }, { buildServer }] = await Promise.all([
    import("../domain/voice/providers/providerRegistry.js"),
    import("../server.js"),
  ]);
  const voiceProviders = resolveVoiceProviders();

  const nodeEnv = process.env.NODE_ENV;
  const app = await buildServer({
    ...(nodeEnv ? { nodeEnv } : {}),
    voiceProviders,
  });
  const port = Number(process.env.PORT?.trim() || "3000");

  await app.listen({ host: "127.0.0.1", port });
  logger.info("physio.api.started", { host: "127.0.0.1", port });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("physio.api.stopping", { signal });
    await app.close();
    logger.info("physio.api.stopped", { signal });
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

main().catch((error) => {
  logger.error("physio.api.start_failed", {
    reason: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
