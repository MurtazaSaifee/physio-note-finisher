import {
  CALENDAR_QUEUE,
  requireQueueUrl,
  sendPointerMessage,
} from "../../infrastructure/sqs/sqsQueues.js";

export type GoogleCalendarQueue = {
  add(
    name: string,
    data: unknown,
    opts?: {
      attempts?: number;
      backoff?: { type: "exponential" | "fixed"; delay: number };
      jobId?: string;
    },
  ): Promise<{ id: string | undefined }>;
};

export function createSqsGoogleCalendarQueue(
  queueUrl = CALENDAR_QUEUE,
): GoogleCalendarQueue {
  return {
    async add(name, data, opts) {
      const targetQueueUrl = requireQueueUrl(queueUrl, "SQS_CALENDAR_QUEUE_URL");
      const jobId = getCalendarJobId(name, data, opts?.jobId);
      const result = await sendPointerMessage(targetQueueUrl, { jobType: name, jobId });
      return { id: result.id ?? jobId };
    },
  };
}

export function createInMemoryGoogleCalendarQueue(): GoogleCalendarQueue {
  return {
    async add(_name, _data, opts) {
      return { id: opts?.jobId ?? "mock-job-id" };
    },
  };
}

export async function enqueuePush(
  queue: GoogleCalendarQueue,
  clinicId: string,
  userId: string,
  appointmentId: string,
): Promise<{ id: string | undefined }> {
  return queue.add("push", { clinicId, userId, appointmentId });
}

export async function enqueueIncrementalSync(
  queue: GoogleCalendarQueue,
  clinicId: string,
  userId: string,
): Promise<{ id: string | undefined }> {
  return queue.add("incremental_sync", { clinicId, userId });
}

export async function enqueueFullSync(
  queue: GoogleCalendarQueue,
  clinicId: string,
  userId: string,
): Promise<{ id: string | undefined }> {
  return queue.add("full_sync", { clinicId, userId });
}

export function parseCalendarJobId(jobId: string): {
  clinicId: string;
  userId: string;
  appointmentId: string | undefined;
} {
  const [clinicId, userId, appointmentId] = jobId.split(":");
  if (!clinicId || !userId) {
    throw new Error("Invalid calendar SQS jobId");
  }
  return { clinicId, userId, appointmentId: appointmentId || undefined };
}

function getCalendarJobId(
  name: string,
  data: unknown,
  fallback?: string,
): string {
  if (fallback?.trim()) {
    return fallback;
  }
  if (!data || typeof data !== "object") {
    throw new Error("calendar SQS queue data is required");
  }
  const payload = data as {
    clinicId?: unknown;
    userId?: unknown;
    appointmentId?: unknown;
  };
  if (typeof payload.clinicId !== "string" || typeof payload.userId !== "string") {
    throw new Error("clinicId and userId are required for calendar SQS queue messages");
  }
  return [
    payload.clinicId,
    payload.userId,
    name === "push" && typeof payload.appointmentId === "string"
      ? payload.appointmentId
      : "",
  ].join(":");
}
