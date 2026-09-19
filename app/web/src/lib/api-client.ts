import { auth } from "@/lib/firebase";

export async function postJson<T = Record<string, unknown>>(
  path: string,
  body: unknown,
): Promise<T & { ok?: boolean; message?: string }> {
  const current = auth.currentUser;
  if (!current) throw new Error("ログインし直してください");

  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await current.getIdToken()}` },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: (T & { ok?: boolean; message?: string }) | null = null;
  if (text) {
    try { data = JSON.parse(text) as T & { ok?: boolean; message?: string }; } catch { data = null; }
  }

  if (!res.ok && res.status !== 202) throw new Error(data?.message ?? `サーバーエラー (${res.status})`);
  if (data && data.ok === false) throw new Error(data.message ?? "操作に失敗しました");
  return (data ?? ({} as T & { ok?: boolean })) as T & { ok?: boolean; message?: string };
}
