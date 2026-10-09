import { NextResponse } from "next/server";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { emulatorServerReady } from "@/lib/emulator-server";
import { safeMessage } from "@/lib/public-error";
import { DEV_ACCOUNTS } from "@/config/emulator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

/**
 * 開発用ログイン（Issue #83）。テスト用アカウントのカスタムトークンを返す。
 *
 * ★エミュレーターで動かしているときだけ開く（emulatorServerReady の★参照）★
 *   それ以外では、ルートが無いのと同じ 404 を返す。withGuard の available で、レート制限や
 *   監査ログ（本番の Firestore）に触れる前に返す。ハンドラの中でも念のため確かめる。
 * ★トークンを出すのは DEV_ACCOUNTS の uid だけ★ 本文で uid を受け取らない。
 * ★ここではクレームも Firestore も変えない★
 *   テスト用アカウントとその admin・tags は scripts/emulator-seed.mjs が作る（CLAUDE.md のルール 7）。
 */
async function _POST(req: Request) {
  if (!emulatorServerReady()) return fail("Not Found", 404);
  try {
    return await handle(req);
  } catch (e) {
    console.error("[auth/dev] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

async function handle(req: Request) {
  let account: unknown;
  try {
    ({ account } = (await req.json()) as { account?: unknown });
  } catch {
    return fail("リクエストが不正です", 400);
  }
  const target = DEV_ACCOUNTS.find((a) => a.key === account);
  if (!target) return fail("テスト用アカウントがありません", 400);

  const { auth } = admin();
  try {
    await auth.getUser(target.uid);
  } catch (e) {
    if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
    return fail("テスト用アカウントの初期データがありません。npm run dev:emulator で起動し直してください", 409);
  }

  const customToken = await auth.createCustomToken(target.uid);
  return NextResponse.json({ ok: true, customToken, home: target.home });
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
export const POST = withGuard(
  {
    name: "auth.dev",
    available: emulatorServerReady,
    auth: "none",
    maintenanceExempt: true,
    rateLimit: { key: "ip", limit: 30, windowSec: 60 },
    audit: { action: "auth.dev", target: (b) => b.account },
  },
  _POST,
);
