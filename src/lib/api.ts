// Chamadas à API com o token da sessão. No app Android (Capacitor) a API fica no
// endereço público definido em VITE_API_URL; no navegador, no mesmo endereço do site.
const TOKEN_KEY = "ninho.token";
const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // navegação privada: a sessão vale só enquanto a página estiver aberta
  }
}

type Listener = () => void;
const changeListeners = new Set<Listener>();
const logoutListeners = new Set<Listener>();

/** Avisa as telas abertas que os dados mudaram (recarregam). */
export function notifyChange() {
  changeListeners.forEach((l) => l());
}
export function onChange(listener: Listener) {
  changeListeners.add(listener);
  return () => void changeListeners.delete(listener);
}
export function onLogout(listener: Listener) {
  logoutListeners.add(listener);
  return () => void logoutListeners.delete(listener);
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  let response: Response;
  try {
    response = await fetch(`${BASE}/api/${path}`, {
      method,
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "Sem conexão com a internet. Confira sua rede e tente de novo.");
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    if (response.status === 401 && token) {
      setToken(null);
      logoutListeners.forEach((l) => l());
    }
    throw new ApiError(response.status, data.error ?? "Algo deu errado. Tente de novo.");
  }
  if (method !== "GET") notifyChange();
  return data as T;
}
