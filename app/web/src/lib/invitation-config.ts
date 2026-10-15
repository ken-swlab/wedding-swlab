import { NAME_STYLES, type CoupleNames } from "./opening-names.ts";
import type { InvitationConfig } from "@/types/invitation";

/**
 * Firestore の config/invitation の形の確認（Issue #131）。
 * サーバー（lib/invitation-server.ts）と、値を入れる運用スクリプト（scripts/ops.mjs invitation）の両方が使う。
 *
 * ★このファイルは型以外を `@/` で import しない★ scripts/ops.mjs と tests/ が Node でそのまま読み込む
 *   （`import type` は実行時に消える。値の import は拡張子つきの相対パスで書く）。
 * ★値をログやエラーに出さない★ 返すのは、だめだった項目の名前だけ。
 */

/** 1項目の長さの上限。壊れた値や貼り間違いをそのまま画面に流さないため */
const MAX_TEXT = 200;
const MAX_GREETING_LINES = 20;
/** 挙式の時刻の形（例: 15:15） */
const TIME_RE = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

function text(v: unknown, allowEmpty = false): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s.length > MAX_TEXT || (!allowEmpty && !s)) return null;
  return s;
}

/** 形を確かめて取り出す。だめなら、だめだった項目の名前を返す */
export function parseInvitationConfig(data: unknown): { ok: true; value: InvitationConfig } | { ok: false; field: string } {
  if (!data || typeof data !== "object") return { ok: false, field: "(全体)" };
  const d = data as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of ["groom", "bride", "dateLabel", "receptionAt", "venueName", "venueAddress"] as const) {
    const v = text(d[key]);
    if (v === null) return { ok: false, field: key };
    out[key] = v;
  }
  const venueMapUrl = text(d.venueMapUrl ?? "", true);
  // 地図のリンクは https だけ（画面が href にそのまま入れる）
  if (venueMapUrl === null || (venueMapUrl && !/^https:\/\//.test(venueMapUrl))) return { ok: false, field: "venueMapUrl" };

  if (!Array.isArray(d.greeting) || d.greeting.length === 0 || d.greeting.length > MAX_GREETING_LINES) return { ok: false, field: "greeting" };
  const greeting: string[] = [];
  for (const line of d.greeting) {
    const v = text(line);
    if (v === null) return { ok: false, field: "greeting" };
    greeting.push(v);
  }

  // 挙式（Issue #146）は任意。あるときは開始の時刻が要る
  let ceremony: InvitationConfig["ceremony"];
  if (d.ceremony !== undefined) {
    const c = d.ceremony as Record<string, unknown> | null;
    if (!c || typeof c !== "object") return { ok: false, field: "ceremony" };
    const startAt = text(c.startAt);
    const gatherAt = text(c.gatherAt ?? "", true);
    const note = text(c.note ?? "", true);
    if (startAt === null || !TIME_RE.test(startAt)) return { ok: false, field: "ceremony.startAt" };
    if (gatherAt === null || (gatherAt && !TIME_RE.test(gatherAt))) return { ok: false, field: "ceremony.gatherAt" };
    if (note === null) return { ok: false, field: "ceremony.note" };
    ceremony = { startAt, gatherAt, note };
  }

  // 承認待ちの画面に出す、確認までの目安（Issue #157 B-4）。任意。空なら出さない
  const approvalNote = text(d.approvalNote ?? "", true);
  if (approvalNote === null) return { ok: false, field: "approvalNote" };

  const o = d.opening as Record<string, unknown> | undefined;
  if (!o || typeof o !== "object") return { ok: false, field: "opening" };
  const date = text(o.date);
  const venue = text(o.venue);
  if (date === null) return { ok: false, field: "opening.date" };
  if (venue === null) return { ok: false, field: "opening.venue" };
  const rawNames = o.names as Record<string, unknown> | undefined;
  if (!rawNames || typeof rawNames !== "object") return { ok: false, field: "opening.names" };
  const names = {} as Record<(typeof NAME_STYLES)[number], readonly [string, string]>;
  for (const style of NAME_STYLES) {
    const pair = rawNames[style];
    const groom = Array.isArray(pair) ? text(pair[0]) : null;
    const bride = Array.isArray(pair) ? text(pair[1]) : null;
    if (!Array.isArray(pair) || pair.length !== 2 || groom === null || bride === null) return { ok: false, field: `opening.names.${style}` };
    names[style] = [groom, bride];
  }

  return {
    ok: true,
    value: {
      groom: out.groom,
      bride: out.bride,
      dateLabel: out.dateLabel,
      receptionAt: out.receptionAt,
      venueName: out.venueName,
      venueAddress: out.venueAddress,
      venueMapUrl,
      greeting,
      ...(ceremony ? { ceremony } : {}),
      ...(approvalNote ? { approvalNote } : {}),
      opening: { date, venue, names: names as CoupleNames },
    },
  };
}
