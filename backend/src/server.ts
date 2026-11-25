import Fastify, { type FastifyError, type FastifyInstance } from "fastify";

import { createLogger } from "./observability/logger.js";

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
  createInMemoryStageQueue,
  createLocalStageQueue,
  createSqsStageQueue,
  type StageQueue,
} from "./workers/voiceWorker.js";
import {
  createInMemoryGoogleCalendarQueue,
  createSqsGoogleCalendarQueue,
  type GoogleCalendarQueue,
} from "./domain/google-calendar/googleCalendarQueue.js";
import { registerTranscriptRoutes } from "./api/routes/transcripts.js";
import { registerSoapGenerationRoutes } from "./api/routes/soapGeneration.js";
import { registerPatientSummaryRoutes } from "./api/routes/patientSummary.js";
import { registerGoogleCalendarRoutes } from "./api/routes/googleCalendar.js";
import { registerGoogleCalendarWebhookRoutes } from "./api/routes/webhooks/googleCalendar.js";
import { registerNotificationPreferenceRoutes } from "./api/routes/notificationPreferences.js";
import { registerDevicePushTokenRoutes } from "./api/routes/devicePushTokens.js";
import { registerExportRoutes } from "./api/routes/exports.js";
import { registerAuditRoutes } from "./api/routes/audit.js";
import { registerHealthRoutes } from "./api/routes/health.js";
import { registerStorageRoutes } from "./api/routes/storage.js";
import { isLocalStorageMode } from "./infrastructure/s3/s3Client.js";
import { createVoiceJobStore, PrismaVoiceJobStore } from "./domain/voice/voiceJobService.js";
import type { VoiceProviders } from "./domain/voice/providers/providerRegistry.js";
import { createLocalVoiceProviders } from "./domain/voice/providers/localVoiceProviders.js";
import { prisma } from "./data/prismaClient.js";
import { type ExportQueue } from "./domain/exports/exportRecordService.js";
import { createLocalExportQueue } from "./workers/exportWorker.js";
import { assertRuntimeEnvConsistency, parseAppEnv } from "./config/env.js";
import {
  setLocalGoogleCalendarMode,
} from "./domain/google-calendar/googleCalendarRuntime.js";
import { resetLocalGoogleCalendarConnections } from "./domain/google-calendar/googleCalendarLocalStore.js";
import { createSqsExportQueue } from "./workers/exportWorker.js";

const serverLogger = createLogger({ component: "server" });

/**
 * Never echo internal error text (database errors, provider messages) to
 * clients. 4xx errors raised by Fastify itself (bad JSON, body too large) keep
 * their safe built-in message; everything else becomes a generic 500.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    const statusCode =
      typeof error.statusCode === "number" && error.statusCode >= 400 ? error.statusCode : 500;
    if (statusCode >= 500) {
      serverLogger.error("http.unhandled_error", {
        requestId: request.id,
        method: request.method,
        route: request.routeOptions?.url,
        errorClass: error.name,
        errorCode: error.code,
      });
      return reply.code(500).send({ error: "Internal Server Error" });
    }
    return reply.code(statusCode).send({ error: error.message });
  });
}

type BuildServerOptions = {
  repository?: AuthRepository;
  nodeEnv?: string;
  queue?: StageQueue;
  googleCalendarQueue?: GoogleCalendarQueue;
  exportQueue?: ExportQueue;
  voiceProviders?: VoiceProviders | undefined;
};

function shouldBlockInsecureTransport(
  protocol: string,
  nodeEnv: string,
): boolean {
  return (nodeEnv === "production" || nodeEnv === "staging") && protocol !== "https";
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
  registerErrorHandler(app);

  const authRepository =
    options.repository ??
    (persistentRuntime
      ? new PrismaAuthRepository()
      : createInMemoryAuthRepository());
  app.decorate("authRepository", authRepository);

  setLocalGoogleCalendarMode(localRuntime);
  app.addHook("onClose", async () => {
    setLocalGoogleCalendarMode(false);
    resetLocalGoogleCalendarConnections();
  });

  app.addHook("onRequest", async (request, reply) => {
    if (shouldBlockInsecureTransport(request.protocol, nodeEnv)) {
      await reply.code(403).send({ error: "HTTPS required" });
      return;
    }
  });

  const voiceJobStore =
    persistentRuntime && process.env.DATABASE_URL?.trim()
    ? new PrismaVoiceJobStore(prisma)
    : createVoiceJobStore();

  const voiceProviders = localRuntime
    ? createLocalVoiceProviders()
    : options.voiceProviders;

  registerHealthRoutes(app);
  registerAuthRoutes(app, authRepository);
  registerUserRoutes(app, authRepository);
  registerPatientRoutes(app);
  registerSessionRoutes(app);
  registerDashboardRoutes(app);
  const queue =
    options.queue ??
    (persistentRuntime
      ? createSqsStageQueue()
      : localRuntime
        ? createLocalStageQueue({
            store: voiceJobStore,
            voiceProviders,
          })
        : createInMemoryStageQueue());

  registerNoteRoutes(app);
  registerAppointmentRoutes(app);
  registerVoiceRoutes(app, queue, voiceJobStore);
  registerVoiceJobRoutes(app, queue, voiceJobStore);
  registerTranscriptRoutes(app, voiceJobStore);
  registerSoapGenerationRoutes(app, voiceProviders?.clinicalNoteProvider);
  registerPatientSummaryRoutes(app, voiceProviders?.patientSummaryProvider);
  registerGoogleCalendarRoutes(app);

  const googleCalendarQueue =
    options.googleCalendarQueue ??
    (persistentRuntime
      ? createSqsGoogleCalendarQueue()
      : createInMemoryGoogleCalendarQueue());
  registerGoogleCalendarWebhookRoutes(app, googleCalendarQueue);

  const exportQueue =
    options.exportQueue ??
    (persistentRuntime
      ? createSqsExportQueue()
      : localRuntime
        ? createLocalExportQueue()
        : undefined);

  registerNotificationPreferenceRoutes(app);
  registerDevicePushTokenRoutes(app);
  registerExportRoutes(app, exportQueue);
  registerAuditRoutes(app);
  if (isLocalStorageMode()) {
    registerStorageRoutes(app);
  }

  await app.ready();
  return app;
}
