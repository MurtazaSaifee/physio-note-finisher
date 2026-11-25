export const GENERIC_UNEXPECTED_ERROR_TITLE = "Something went wrong";
export const GENERIC_UNEXPECTED_ERROR_MESSAGE =
  "Something went wrong. Please try again.";

const SAFE_ERROR_MESSAGES = new Set([
  "Email already registered",
  "Invalid credentials",
  "Invalid verification code",
]);

function extractErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    const message = error.message.trim();
    return message.length > 0 ? message : null;
  }

  if (typeof error === "string") {
    const message = error.trim();
    return message.length > 0 ? message : null;
  }

  if (error && typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim().length > 0) {
      return maybeMessage.trim();
    }
  }

  return null;
}

export function getUserSafeErrorMessage(
  error: unknown,
  fallback = GENERIC_UNEXPECTED_ERROR_MESSAGE,
): string {
  const message = extractErrorMessage(error);
  if (message && SAFE_ERROR_MESSAGES.has(message)) {
    return message;
  }

  return fallback;
}

export function getUserSafeAlertCopy(
  error: unknown,
  fallbackMessage = "Please try again.",
): { title: string; message: string } {
  const message = extractErrorMessage(error);
  return {
    title: GENERIC_UNEXPECTED_ERROR_TITLE,
    message: message && SAFE_ERROR_MESSAGES.has(message) ? message : fallbackMessage,
  };
}
