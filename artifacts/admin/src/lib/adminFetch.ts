import { getAdminToken } from "./auth";

/**
 * Raw fetch helper for admin endpoints that aren't in the OpenAPI spec
 * (most notably /api/assets/*). Always sends the bearer token from
 * localStorage when one is present.
 */
export async function adminFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getAdminToken();
  const headers = new Headers(init.headers ?? {});
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }
  if (
    init.body != null &&
    typeof init.body === "string" &&
    !headers.has("content-type")
  ) {
    headers.set("content-type", "application/json");
  }
  const url = path.startsWith("/") ? `/api${path}` : path;
  const response = await fetch(url, { ...init, headers });
  const text = await response.text();
  let data: unknown = null;
  if (text.trim() !== "") {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const message =
      (typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof (data as { error: unknown }).error === "string" &&
        (data as { error: string }).error) ||
      `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return data as T;
}
