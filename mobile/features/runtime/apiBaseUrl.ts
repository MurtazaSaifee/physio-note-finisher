import Constants from "expo-constants";

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1";
}

function sanitizeUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function resolveExpoHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri?.trim();
  if (!hostUri) {
    return null;
  }

  const host = hostUri.split(":")[0] ?? "";
  return host.length > 0 ? host : null;
}

function isPrivateNetworkHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "10.0.2.2" ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

export function resolveApiBaseUrl(): string {
  const envBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (envBaseUrl) {
    const sanitizedEnvBaseUrl = sanitizeUrl(envBaseUrl);
    try {
      const parsed = new URL(sanitizedEnvBaseUrl);
      const expoHost = resolveExpoHost();
      if (
        process.env.EXPO_OS === "android" &&
        isLoopbackHost(parsed.hostname) &&
        expoHost &&
        !isLoopbackHost(expoHost)
      ) {
        parsed.hostname = expoHost;
        return sanitizeUrl(parsed.toString());
      }
    } catch {
      return sanitizedEnvBaseUrl;
    }
    return sanitizedEnvBaseUrl;
  }

  const expoHost = resolveExpoHost();
  if (expoHost) {
    if (
      process.env.EXPO_OS === "android" &&
      isLoopbackHost(expoHost)
    ) {
      return "http://10.0.2.2:3000";
    }
    return `http://${expoHost}:3000`;
  }

  if (process.env.EXPO_OS === "android") {
    return "http://10.0.2.2:3000";
  }

  return "http://127.0.0.1:3000";
}

export function describeBackendConnection(apiBaseUrl: string): string {
  try {
    const hostname = new URL(apiBaseUrl).hostname.trim().toLowerCase();
    if (!hostname) {
      return "backend";
    }

    if (isPrivateNetworkHost(hostname)) {
      return "local backend";
    }

    if (hostname.includes("staging")) {
      return "staging backend";
    }

    return `${hostname} backend`;
  } catch {
    return "backend";
  }
}
