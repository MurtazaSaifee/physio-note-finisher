const REDACTED_VALUE = "[REDACTED]";

const REDACTION_KEYS = new Set([
  "password",
  "accessToken",
  "refreshToken",
  "authorization",
  "cookie",
  "clinicalText",
  "transcript",
  "transcriptText",
  "fullName",
  "dateOfBirth",
  "sex",
  "phone",
  "email",
  "addressLine",
  "clinicalNotes",
  "audioUrl",
]);

const VISIBLE_METADATA_KEYS = new Set([
  "requestId",
  "correlationId",
  "errorClass",
]);

type LogLevel = "debug" | "info" | "warn" | "error";

type LogPayload = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  const sanitized: LogPayload = {};

  for (const [key, item] of Object.entries(value)) {
    if (REDACTION_KEYS.has(key)) {
      sanitized[key] = REDACTED_VALUE;
      continue;
    }

    sanitized[key] = redactUnknown(item);
  }

  return sanitized;
}

export function redactSensitiveFields(payload: LogPayload): LogPayload {
  return redactUnknown(payload) as LogPayload;
}

function writeStructuredLog(
  level: LogLevel,
  message: string,
  payload?: LogPayload,
): void {
  const safePayload = payload ? redactSensitiveFields(payload) : {};
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...safePayload,
  };

  const serializedEntry = JSON.stringify(entry);

  if (level === "error") {
    console.error(serializedEntry);
    return;
  }

  if (level === "warn") {
    console.warn(serializedEntry);
    return;
  }

  console.log(serializedEntry);
}

export type RedactionSafeLogger = {
  debug: (message: string, payload?: LogPayload) => void;
  info: (message: string, payload?: LogPayload) => void;
  warn: (message: string, payload?: LogPayload) => void;
  error: (message: string, payload?: LogPayload) => void;
};

export function createLogger(baseMetadata: LogPayload = {}): RedactionSafeLogger {
  const safeBaseMetadata = redactSensitiveFields(baseMetadata);

  return {
    debug(message, payload) {
      writeStructuredLog("debug", message, { ...safeBaseMetadata, ...payload });
    },
    info(message, payload) {
      writeStructuredLog("info", message, { ...safeBaseMetadata, ...payload });
    },
    warn(message, payload) {
      writeStructuredLog("warn", message, { ...safeBaseMetadata, ...payload });
    },
    error(message, payload) {
      writeStructuredLog("error", message, { ...safeBaseMetadata, ...payload });
    },
  };
}

export const DEFAULT_LOGGER_METADATA_KEYS = [...VISIBLE_METADATA_KEYS];
