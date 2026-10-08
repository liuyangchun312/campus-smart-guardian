export type Account = { id: string; username: string; name: string; role: "user" | "admin"; disabled: boolean; createdAt: string };
let activeUserId = "";
export const setActiveAccount = (user: Account | null) => { activeUserId = user?.id ?? ""; };
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export function apiFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (activeUserId) headers.set("X-Guardian-User", activeUserId);
  if (options.method && options.method !== "GET") headers.set("X-Guardian-Request", "1");
  return fetch(path, { ...options, headers, credentials: "same-origin", signal: options.signal ?? AbortSignal.timeout(55000) });
}
export async function api<T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  const response = await apiFetch(path, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => ({ error: "服务未返回有效数据，请检查服务连接后重试。" }));
  if (!response.ok) throw new ApiError(data.error || "请求失败，请稍后重试。", response.status);
  return data as T;
}
