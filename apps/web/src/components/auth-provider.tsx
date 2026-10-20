"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api, errorMessage } from "@nolt/api-client";
import { useQueryClient } from "@tanstack/react-query";
import type { components } from "@nolt/api-client/schema";
type Session = components["schemas"]["SessionDto"];
const AuthContext = createContext<{
  session: Session | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  signOut: (all?: boolean) => Promise<void>;
}>({
  session: null,
  loading: true,
  error: null,
  refresh: async () => {},
  signOut: async () => {},
});
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null);
  const pendingRefresh = useRef<Promise<void> | null>(null);
  const queryClient = useQueryClient();
  const cachedIdentity = useRef<string | null>(null);
  useEffect(() => {
    // Memory-only HR data must never outlive a sign-out or user switch.
    const identity = session?.id ?? null;
    if (cachedIdentity.current !== identity) {
      queryClient.clear();
      cachedIdentity.current = identity;
    }
  }, [queryClient, session?.id]);
  const refresh = useCallback((): Promise<void> => {
    if (pendingRefresh.current) return pendingRefresh.current;
    const request = (async () => {
      setLoading(true);
      try {
        const result = await api.GET("/api/v1/auth/session");
        if (result.response.status === 401) {
          setSession(null);
          setError(null);
        } else if (result.error) throw new Error(errorMessage(result.error));
        else {
          setSession(result.data ?? null);
          setError(null);
        }
      } catch {
        setSession(null);
        setError(
          "We could not verify your session. Check the connection and try again.",
        );
      } finally {
        setLoading(false);
      }
    })();
    pendingRefresh.current = request;
    void request.finally(() => {
      if (pendingRefresh.current === request) pendingRefresh.current = null;
    });
    return request;
  }, []);
  useEffect(() => {
    void refresh();
    const expire = () => {
      setSession(null);
      setError(null);
    };
    window.addEventListener("nolt:session-expired", expire);
    return () => window.removeEventListener("nolt:session-expired", expire);
  }, [refresh]);
  async function signOut(all = false) {
    if (!session) return;
    const path = all ? "/api/v1/auth/logout-all" : "/api/v1/auth/logout";
    const result = await api.POST(path, {
      headers: { "x-csrf-token": session.csrfToken },
    });
    if (result.error && result.response.status !== 401)
      throw new Error(errorMessage(result.error));
    queryClient.clear();
    setSession(null);
    setError(null);
    window.location.assign("/login");
  }
  return (
    <AuthContext.Provider value={{ session, loading, error, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
