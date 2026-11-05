import { NextResponse } from "next/server";
import { admin } from "@/lib/firebase-admin";

/**
 * 会場の電波テストの API（Issue #256）で共通の部品。
 * ★管理者だけ★ withGuard の auth: "admin" に加えて、ハンドラでも失効チェック付きで確かめる（CLAUDE.md ルール 1）。
 */
export function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

/** 本人確認（失効チェック付き）と管理者の確認。通れば uid、だめなら応答 */
export async function requireAdmin(req: Request): Promise<{ uid: string } | NextResponse> {
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);
  try {
    const decoded = await admin().auth.verifyIdToken(idToken, true);
    if (decoded.admin !== true) return fail("管理者権限が必要です", 403);
    return { uid: decoded.uid };
  } catch {
    return fail("ログインし直してください", 401);
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
