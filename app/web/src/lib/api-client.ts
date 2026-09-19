import { auth } from "@/lib/firebase";

type ApiResult = { ok?: boolean; message?: string };

/**
 * 管理 API を叩く共通処理。
 *
 * ★res.json() を素で呼ばないこと★
 *   サーバーが 500 を返すと本文が空または HTML になり、
 *   "Unexpected end of JSON input" という原因不明のエラーになる。
 *   ここでテキストとして受けてから解析する。
 */
async function request<T = Record<string, unknown>>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T & ApiResult> {
  const current = auth.currentUser;
  if (!current) throw new Error("ログインし直してください");

  const res = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${await current.getIdToken()}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });

  const text = await res.text();
  let data: (T & ApiResult) | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T & ApiResult;
    } catch {
      data = null;
    }
  }

  if (!res.ok && res.status !== 202) {
    throw new Error(data?.message ?? `サーバーエラー (${res.status})`);
  }
  if (data && data.ok === false) {
    throw new Error(data.message ?? "操作に失敗しました");
  }
  return (data ?? ({} as T & ApiResult)) as T & ApiResult;
}

export function getJson<T = Record<string, unknown>>(path: string) {
  return request<T>(path, "GET");
}
export function postJson<T = Record<string, unknown>>(path: string, body: unknown) {
  return request<T>(path, "POST", body);
}
export function putJson<T = Record<string, unknown>>(path: string, body: unknown) {
  return request<T>(path, "PUT", body);
}
