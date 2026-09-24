import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 死活監視用。認証も課金も伴わないので withGuard では包まない
 * （包むとレートリミットの Firestore 書き込みが逆に負荷になる）。
 * サービス名や開発フェーズなど、内部の情報は返さない。
 */
export function GET() {
  return NextResponse.json({ ok: true });
}
