import type { FastifyReply, FastifyRequest } from "fastify";

function getClinicIdHeader(
  headerValue: string | string[] | undefined,
): string | null {
  if (Array.isArray(headerValue)) {
    return headerValue[0] ?? null;
  }

  if (typeof headerValue !== "string") {
    return null;
  }

  const normalized = headerValue.trim();
  return normalized.length > 0 ? normalized : null;
}

function getClinicIdFromObject(
  value: unknown,
  key: string,
): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate
    : null;
}

function collectRequestedClinicIds(request: FastifyRequest): string[] {
  const candidates = [
    getClinicIdHeader(request.headers["x-clinic-id"]),
    getClinicIdFromObject(request.params, "clinicId"),
    getClinicIdFromObject(request.query, "clinicId"),
    getClinicIdFromObject(request.body, "clinicId"),
  ];

  return candidates.filter((candidate): candidate is string => Boolean(candidate));
}

export async function authorizeClinic(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = request.auth;
  if (!auth) {
    await reply.code(401).send({ error: "Unauthorized" });
    return;
  }

  const requestedClinicIds = collectRequestedClinicIds(request);

  if (requestedClinicIds.some((clinicId) => clinicId !== auth.clinicId)) {
    await reply.code(403).send({ error: "Forbidden" });
  }
}
