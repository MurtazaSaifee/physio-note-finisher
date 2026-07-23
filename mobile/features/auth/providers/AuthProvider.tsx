import React, {
  createContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  use,
  type ReactNode,
} from "react";

import {
  type SecureStoreLike,
  setSecureStoreImplementation,
} from "../storage/refreshTokenStore";

export type AuthProviderStatus = "loading" | "authenticated" | "unauthenticated";

export type ProviderSessionManager = {
  signIn(email: string, password: string): Promise<void>;
  applyTokens(tokens: { accessToken: string; refreshToken: string }): Promise<void>;
  signOut(): Promise<void>;
  restoreSession(): Promise<"authenticated" | "unauthenticated">;
  runAuthenticatedRequest<TResult>(
    request: (accessToken: string) => Promise<TResult>,
  ): Promise<TResult>;
};

export class AuthStateController {
  private status: AuthProviderStatus = "loading";
  private onStatusChange?: (status: AuthProviderStatus) => void;
  private readonly sessionManager: ProviderSessionManager;

  constructor(sessionManager: ProviderSessionManager) {
    this.sessionManager = sessionManager;
  }

  getStatus(): AuthProviderStatus {
    return this.status;
  }

  setOnStatusChange(handler: (status: AuthProviderStatus) => void): void {
    this.onStatusChange = handler;
  }

  async bootstrap(): Promise<AuthProviderStatus> {
    this.setStatus("loading");
    const restoredStatus = await this.sessionManager.restoreSession();
    this.setStatus(restoredStatus);
    return this.status;
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.sessionManager.signIn(email, password);
    this.setStatus("authenticated");
  }

  async applyTokens(tokens: { accessToken: string; refreshToken: string }): Promise<void> {
    await this.sessionManager.applyTokens(tokens);
    this.setStatus("authenticated");
  }

  async signOut(): Promise<void> {
    await this.sessionManager.signOut();
    this.setStatus("unauthenticated");
  }

  async runProtectedAction<TResult>(
    request: (accessToken: string) => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await this.sessionManager.runAuthenticatedRequest(request);
    } catch (error) {
      if (error instanceof Error && /Unauthenticated/i.test(error.message)) {
        this.setStatus("unauthenticated");
      }
      throw error;
    }
  }

  private setStatus(nextStatus: AuthProviderStatus): void {
    this.status = nextStatus;
    if (this.onStatusChange) {
      this.onStatusChange(nextStatus);
    }
  }
}

type AuthContextValue = {
  status: AuthProviderStatus;
  signIn(email: string, password: string): Promise<void>;
  applyTokens(tokens: { accessToken: string; refreshToken: string }): Promise<void>;
  signOut(): Promise<void>;
  restoreSession(): Promise<AuthProviderStatus>;
  runProtectedAction<TResult>(
    request: (accessToken: string) => Promise<TResult>,
  ): Promise<TResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
  sessionManager: ProviderSessionManager;
  secureStore?: SecureStoreLike;
  children: ReactNode;
};

export function AuthProvider({
  sessionManager,
  secureStore,
  children,
}: AuthProviderProps): React.JSX.Element {
  const controllerRef = useRef<AuthStateController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new AuthStateController(sessionManager);
  }
  const [status, setStatus] = useState<AuthProviderStatus>(() =>
    controllerRef.current?.getStatus() ?? "loading",
  );

  function getController(): AuthStateController {
    const controller = controllerRef.current;
    if (!controller) {
      throw new Error("Auth controller unavailable");
    }
    return controller;
  }

  useEffect(() => {
    // Initialize secure storage before bootstrapping session.
    if (secureStore) {
      try {
        setSecureStoreImplementation(secureStore);
      } catch {
        // eslint-disable-next-line no-console
        console.warn(
          "[AuthProvider] SecureStore failed to initialize. Falling back to in-memory storage. Session persistence is degraded.",
        );
        setSecureStoreImplementation(createInMemoryFallbackAdapter());
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        "[AuthProvider] No secure store provided. Session persistence is degraded.",
      );
      setSecureStoreImplementation(createInMemoryFallbackAdapter());
    }

    controllerRef.current = new AuthStateController(sessionManager);
    controllerRef.current.setOnStatusChange(setStatus);
    // Startup session restore attempts refresh before unauthenticated fallback.
    void controllerRef.current.bootstrap();
  }, [sessionManager, secureStore]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      status,
      signIn: (email, password) => getController().signIn(email, password),
      applyTokens: (tokens) => getController().applyTokens(tokens),
      signOut: () => getController().signOut(),
      restoreSession: () => getController().bootstrap(),
      runProtectedAction: (request) =>
        getController().runProtectedAction(request),
    }),
    [status],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = use(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}

function createInMemoryFallbackAdapter(): SecureStoreLike {
  const store = new Map<string, string>();
  return {
    async setItemAsync(key, value) {
      store.set(key, value);
    },
    async getItemAsync(key) {
      return store.get(key) ?? null;
    },
    async deleteItemAsync(key) {
      store.delete(key);
    },
  };
}
