import { NextResponse } from "next/server";
import { admin } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TEXT = 400;
/** コールドスタート（GPU コンテナ起動＋モデルロード）を見込んだ待ち時間 */
const TIMEOUT_MS = Number(process.env.MODAL_TTS_TIMEOUT_MS ?? 45_000);

type Body = {
  text?: unknown;
  // SBV2 ネイティブのパラメータ
  sdp_ratio?: unknown;
  noise?: unknown;
  noise_w?: unknown;
  length?: unknown;
  style_name?: unknown;
  style_weight?: unknown;
  // 旧 ElevenLabs 互換（既存の VoiceTuner が送ってくる）
  stability?: unknown;
  similarity_boost?: unknown;
  style?: unknown;
};

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * フロントエンド（VoiceTuner）は ElevenLabs 時代のパラメータ名で送ってくる。
 * フロント無改修の制約があるため、ここで SBV2 の概念へ写像する。
 *
 *   stability（高いほど安定）  → sdp_ratio（高いほど揺らぐ）ので反転して使う
 *   style（演技力）            → style_weight（スタイルの効き具合）
 *   similarity_boost           → SBV2 に対応する概念が無いため無視する
 *
 * SBV2 ネイティブ名が明示されていればそちらを優先する。
 */
function buildParams(body: Body): Record<string, number | string> {
  const stability = num(body.stability);
  const legacyStyle = typeof body.style === "number" ? body.style : null;

  const sdpRatio =
    num(body.sdp_ratio) ??
    (stability !== null ? clamp(0.6 * (1 - stability), 0, 1) : 0.2);

  const styleWeight =
    num(body.style_weight) ??
    (legacyStyle !== null ? clamp(1 + legacyStyle * 6, 0, 10) : 1);

  const styleName =
    typeof body.style_name === "string" && body.style_name
      ? body.style_name
      : typeof body.style === "string" && body.style
        ? body.style
        : "Neutral";

  return {
    sdp_ratio: sdpRatio,
    noise: clamp(num(body.noise) ?? 0.6, 0, 2),
    noise_w: clamp(num(body.noise_w) ?? 0.8, 0, 2),
    length: clamp(num(body.length) ?? 1.0, 0.5, 2),
    style_name: styleName,
    style_weight: styleWeight,
  };
}

export async function POST(req: Request) {
  try {
    const endpoint = process.env.MODAL_TTS_URL ?? "";
    if (!endpoint) {
      return fail(
        "MODAL_TTS_URL が未設定です。modal deploy の出力 URL に /tts を付けて設定してください。",
        500,
      );
    }

    // 管理者ガード。ここを外すと「誰でも叩ける GPU 課金エンドポイント」になる
    const { auth } = admin();
    const header = req.headers.get("authorization") ?? "";
    const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!idToken) return fail("認証情報がありません", 401);
    try {
      const decoded = await auth.verifyIdToken(idToken, true);
      if (decoded.admin !== true) return fail("管理者権限が必要です", 403);
    } catch {
      return fail("ログインし直してください", 401);
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return fail("リクエストが不正です", 400);
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return fail("text が空です", 400);
    if (text.length > MAX_TEXT) {
      return fail(`text が長すぎます（最大 ${MAX_TEXT} 文字）`, 400);
    }

    // フリガナ化は行わない。SBV2 は内部の pyopenjtalk で漢字かな混じり文を
    // そのまま解析でき、むしろ原文のほうがアクセント句を正しく取れる。
    // 発音辞書（クライアント側の applyDictionary）は引き続き適用済みの状態で届く。

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let upstream: Response;
    try {
      upstream = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.MODAL_TTS_TOKEN
            ? { "x-tts-token": process.env.MODAL_TTS_TOKEN }
            : {}),
        },
        body: JSON.stringify({ text, ...buildParams(body) }),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      console.error("[tts] Modal への接続に失敗", e);
      return fail(
        aborted
          ? `音声合成がタイムアウトしました（${Math.round(TIMEOUT_MS / 1000)}秒）。` +
            " GPU コンテナのコールドスタート中の可能性があります。もう一度試すか、/health を叩いて温めてください。"
          : `音声合成サーバーに接続できませんでした: ${e instanceof Error ? e.message : String(e)}`,
        aborted ? 504 : 502,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      console.error("[tts] SBV2 error", upstream.status, detail.slice(0, 500));
      return fail(
        `音声合成に失敗しました (${upstream.status}): ${detail.slice(0, 300) || "詳細不明"}`,
        upstream.status === 401 ? 500 : 502,
      );
    }

    // WAV バイナリをそのまま素通しする。クライアントの Blob → Audio 再生は変更不要。
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "audio/wav",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    console.error("[tts]", e);
    return fail(e instanceof Error ? e.message : "サーバー内部エラー", 500);
  }
}
