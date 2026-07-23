export const GENERIC_UNEXPECTED_ERROR_TITLE = "Something went wrong";
export const GENERIC_UNEXPECTED_ERROR_MESSAGE =
  "Something went wrong. Please try again.";
export const SARVAM_NOT_CONFIGURED_MESSAGE =
  "Sarvam AI key is not configured on the backend. Manual note entry is fully available.";

const SAFE_ERROR_MESSAGES = new Set([
  "Email already registered",
  "Invalid credentials",
  "Invalid verification code",
]);

export function isSarvamNotConfiguredError(error: unknown): boolean {
  if (!error) return false;

  if (typeof error === "object" && error !== null) {
    const errObj = error as any;
    if (errObj.status === 503) return true;
    if (errObj.code === "sarvam_not_configured") return true;
    if (errObj.details) {
      const details = errObj.details;
      if (
        details === "sarvam_not_configured" ||
        details.code === "sarvam_not_configured" ||
        details.error === "sarvam_not_configured" ||
        details.error?.code === "sarvam_not_configured"
      ) {
        return true;
      }
    }
    if (typeof errObj.message === "string" && errObj.message.includes("sarvam_not_configured")) {
      return true;
    }
  }

  if (typeof error === "string" && error.includes("sarvam_not_configured")) {
    return true;
  }

  return false;
}

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
  if (isSarvamNotConfiguredError(error)) {
    return SARVAM_NOT_CONFIGURED_MESSAGE;
  }

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
  if (isSarvamNotConfiguredError(error)) {
    return {
      title: "Sarvam AI Not Configured",
      message: SARVAM_NOT_CONFIGURED_MESSAGE,
    };
  }

  const message = extractErrorMessage(error);
  return {
    title: GENERIC_UNEXPECTED_ERROR_TITLE,
    message: message && SAFE_ERROR_MESSAGES.has(message) ? message : fallbackMessage,
  };
}
