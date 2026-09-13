const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function getToken() {
  return localStorage.getItem("admin_token");
}

export type AdminRole = "owner" | "chatter";

export function getRole(): AdminRole | null {
  return (localStorage.getItem("admin_role") as AdminRole | null) ?? null;
}

export function isOwner(): boolean {
  return getRole() === "owner";
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error("Login fallito");
  const data = await res.json();
  localStorage.setItem("admin_token", data.token);
  localStorage.setItem("admin_role", data.role ?? "owner");
  return data;
}

export async function logout() {
  // Revoca il token lato server (vedi services/tokenBlacklist.ts) prima di scartarlo
  // localmente: senza questa chiamata il token restava valido fino a scadenza (12h)
  // anche dopo il "logout" nel browser.
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } catch {
    /* anche se la revoca server fallisce, rimuoviamo comunque il token locale */
  }
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_role");
}

export function isLoggedIn() {
  return !!getToken();
}
