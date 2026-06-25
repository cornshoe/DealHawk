import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "";
export const API_BASE = `${BACKEND_URL}/api`;

const TOKEN_KEY = "dealhawk_token";

export async function saveToken(token: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.localStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function loadToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") return window.localStorage.getItem(TOKEN_KEY);
    return null;
  }
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken() {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.localStorage.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  const t = token ?? (await loadToken());
  if (t) headers["Authorization"] = `Bearer ${t}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = typeof body === "object" && body?.detail ? body.detail : `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body as T;
}
