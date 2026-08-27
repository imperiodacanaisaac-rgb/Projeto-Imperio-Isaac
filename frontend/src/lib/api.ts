// Typed fetch layer over the FastAPI backend. Base is the relative "/api" prefix.
const BASE = "/api";

export const TOKEN_KEY = "imperio_token";

export class ApiError extends Error {
  status: number;
  body: unknown;
  detalhe: string;

  constructor(status: number, body: unknown) {
    super(`request failed with ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.detalhe = extrairDetalhe(status, body);
  }
}

function extrairDetalhe(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: string } | undefined;
    if (first?.msg) return first.msg;
  }
  if (status === 0) return "Não foi possível conectar ao servidor. Tente novamente.";
  if (status === 401) return "Sessão expirada, faça login novamente";
  if (status === 403) return "Você não tem permissão para esta ação";
  if (status === 404) return "Registro não encontrado";
  return "Ocorreu um erro inesperado. Tente novamente.";
}

type JsonBody = unknown;

async function request<T>(method: string, path: string, body?: JsonBody): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, null);
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    if (res.status === 401 && !path.startsWith("/auth/login")) {
      localStorage.removeItem(TOKEN_KEY);
      if (!window.location.pathname.startsWith("/login")) {
        window.location.assign("/login?expirada=1");
      }
    }
    throw new ApiError(res.status, errBody);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body?: JsonBody) => request<T>("POST", path, body ?? null);
export const apiPut = <T>(path: string, body?: JsonBody) => request<T>("PUT", path, body ?? null);
export const apiPatch = <T>(path: string, body?: JsonBody) =>
  request<T>("PATCH", path, body ?? null);
export const apiDelete = <T>(path: string) => request<T>("DELETE", path);

export function mensagemErro(err: unknown): string {
  if (err instanceof ApiError) return err.detalhe;
  return "Ocorreu um erro inesperado. Tente novamente.";
}
