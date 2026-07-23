import Fastify, { type FastifyInstance } from "fastify";

import {
  createInMemoryAuthRepository,
  registerAuthRoutes,
} from "./api/routes/auth.js";
import type { AuthRepository } from "./domain/auth/authRepository.js";
import { PrismaAuthRepository } from "./domain/auth/prismaAuthRepository.js";
import { registerAppointmentRoutes } from "./api/routes/appointments.js";
import { registerDashboardRoutes } from "./api/routes/dashboard.js";
import { registerNoteRoutes } from "./api/routes/notes.js";
import { registerPatientRoutes } from "./api/routes/patients.js";
import { registerSessionRoutes } from "./api/routes/sessions.js";
import { registerUserRoutes } from "./api/routes/users.js";
import { registerVoiceRoutes } from "./api/routes/voice.js";
import { registerVoiceJobRoutes } from "./api/routes/voiceJobs.js";
import {
  createLocalStageQueue,
  type StageQueue,
} from "./workers/voiceWorker.js";
import { registerTranscriptRoutes } from "./api/routes/transcripts.js";
import { registerSoapGenerationRoutes } from "./api/routes/soapGeneration.js";
import { registerPatientSummaryRoutes } from "./api/routes/patientSummary.js";
import { registerNotificationPreferenceRoutes } from "./api/routes/notificationPreferences.js";
import { registerExportRoutes } from "./api/routes/exports.js";
import { registerAuditRoutes } from "./api/routes/audit.js";
import { registerHealthRoutes } from "./api/routes/health.js";
import { registerStorageRoutes } from "./api/routes/storage.js";
import { createVoiceJobStore, PrismaVoiceJobStore } from "./domain/voice/voiceJobService.js";
import type { VoiceProviders } from "./domain/voice/providers/providerRegistry.js";
import { createLocalVoiceProviders } from "./domain/voice/providers/localVoiceProviders.js";
import { prisma } from "./data/prismaClient.js";
import { type ExportQueue } from "./domain/exports/exportRecordService.js";
import { createLocalExportQueue } from "./workers/exportWorker.js";
import { assertRuntimeEnvConsistency, parseAppEnv } from "./config/env.js";

type BuildServerOptions = {
  repository?: AuthRepository;
  nodeEnv?: string;
  queue?: StageQueue;
  exportQueue?: ExportQueue;
  voiceProviders?: VoiceProviders | undefined;
};

function shouldBlockInsecureTransport(
  protocol: string,
  nodeEnv: string,
): boolean {
  return nodeEnv === "production" && protocol !== "https";
}

export async function buildServer(
  options: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ trustProxy: process.env.TRUST_PROXY === "true" });
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const appEnv = parseAppEnv();
  assertRuntimeEnvConsistency({ ...process.env, NODE_ENV: nodeEnv, APP_ENV: appEnv });
  const localRuntime = appEnv === "local" && nodeEnv !== "production" && nodeEnv !== "staging";
  const persistentRuntime = nodeEnv === "production" || nodeEnv === "staging";
  if (appEnv !== "local" && !persistentRuntime) {
    throw new Error(
      "APP_ENV staging/production requires NODE_ENV staging or production.",
    );
  }
  const authRepository =
    options.repository ??
    (persistentRuntime || process.env.DATABASE_URL?.trim()
      ? new PrismaAuthRepository()
      : createInMemoryAuthRepository());
  app.decorate("authRepository", authRepository);

  app.addHook("onRequest", async (request, reply) => {
    if (shouldBlockInsecureTransport(request.protocol, nodeEnv)) {
      await reply.code(403).send({ error: "HTTPS required" });
      return;
    }
  });

  const voiceJobStore =
    (persistentRuntime || process.env.DATABASE_URL?.trim())
    ? new PrismaVoiceJobStore(prisma)
    : createVoiceJobStore();

  const voiceProviders = options.voiceProviders ?? createLocalVoiceProviders();

  registerHealthRoutes(app);
  registerStorageRoutes(app);
  registerAuthRoutes(app, authRepository);
  registerUserRoutes(app, authRepository);
  registerPatientRoutes(app);
  registerSessionRoutes(app);
  registerDashboardRoutes(app);

  const queue =
    options.queue ??
    createLocalStageQueue({
      store: voiceJobStore,
      voiceProviders,
    });

  registerNoteRoutes(app);
  registerAppointmentRoutes(app);
  registerVoiceRoutes(app, queue, voiceJobStore);
  registerVoiceJobRoutes(app, queue, voiceJobStore);
  registerTranscriptRoutes(app, voiceJobStore);
  registerSoapGenerationRoutes(app, voiceProviders?.clinicalNoteProvider);
  registerPatientSummaryRoutes(app, voiceProviders?.patientSummaryProvider);

  const exportQueue = options.exportQueue ?? createLocalExportQueue();

  registerNotificationPreferenceRoutes(app);
  registerExportRoutes(app, exportQueue);
  registerAuditRoutes(app);

  await app.ready();
  return app;
}
