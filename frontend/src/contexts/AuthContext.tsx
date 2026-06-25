import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { apiFetch, saveToken, loadToken, clearToken } from "@/src/api/client";

export type User = {
  user_id: string;
  email: string;
  name?: string | null;
  picture?: string | null;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const me = await apiFetch<User>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
      await clearToken();
    }
  }, []);

  const processSessionId = useCallback(async (sessionId: string) => {
    // Exchange session_id with Emergent to get session_token + email
    const resp = await fetch(
      "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
      { headers: { "X-Session-ID": sessionId } }
    );
    if (!resp.ok) throw new Error("Failed to verify Google session");
    const data = await resp.json();
    const sessionToken: string = data.session_token;
    const result = await apiFetch<{ token: string; user: User }>("/auth/google/session", {
      method: "POST",
      body: JSON.stringify({ session_token: sessionToken }),
    });
    await saveToken(result.token);
    setUser(result.user);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // Web: check URL for session_id hash/query
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const url = new URL(window.location.href);
          const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
          const params = new URLSearchParams(hash || url.search);
          const sid = params.get("session_id");
          if (sid) {
            await processSessionId(sid);
            window.history.replaceState(null, "", url.pathname);
            setLoading(false);
            return;
          }
        }
        const token = await loadToken();
        if (token) {
          await fetchMe();
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchMe, processSessionId]);

  const signup = async (email: string, password: string, name?: string) => {
    const r = await apiFetch<{ token: string; user: User }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    });
    await saveToken(r.token);
    setUser(r.user);
  };

  const login = async (email: string, password: string) => {
    const r = await apiFetch<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await saveToken(r.token);
    setUser(r.user);
  };

  const loginWithGoogle = async () => {
    const redirectUrl =
      Platform.OS === "web"
        ? typeof window !== "undefined"
          ? window.location.origin + "/"
          : ""
        : Linking.createURL("auth");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.location.href = authUrl;
      return;
    }
    const res = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (res.type !== "success" || !res.url) return;
    const u = new URL(res.url);
    const hash = u.hash.startsWith("#") ? u.hash.slice(1) : u.hash;
    const params = new URLSearchParams(hash || u.search);
    const sid = params.get("session_id");
    if (!sid) throw new Error("No session_id in redirect");
    await processSessionId(sid);
  };

  const logout = async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {}
    await clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, loginWithGoogle, logout, refresh: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
};
