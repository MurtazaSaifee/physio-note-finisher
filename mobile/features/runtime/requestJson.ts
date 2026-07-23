type JsonResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

export async function requestJson<T>(response: JsonResponse): Promise<T> {
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    let details: Record<string, unknown> | undefined;
    try {
      const body = await response.json();
      if (body && typeof body === "object") {
        details = body as Record<string, unknown>;
        const errorBody = body as { error?: unknown };
        if (typeof errorBody.error === "string") {
          message = errorBody.error;
        }
      }
    } catch {
      // Ignore JSON parse errors on non-OK responses so the real HTTP error surfaces
    }
    const error = new Error(message);
    (
      error as Error & {
        status?: number;
        details?: Record<string, unknown>;
      }
    ).status = response.status;
    if (details) {
      (
        error as Error & {
          details?: Record<string, unknown>;
        }
      ).details = details;
    }
    throw error;
  }
  return response.json() as Promise<T>;
}
