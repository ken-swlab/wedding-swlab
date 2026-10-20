import { NAME_STYLES, type CoupleNames } from "./opening-names.ts";
import { PASSCODE_MAX_ATTEMPTS } from "../config/passcode.ts";
import type {
  InvitationAfterParty,
  InvitationConfig,
  InvitationFromUs,
  InvitationHeroPhoto,
  InvitationHighlight,
  InvitationHighlightKey,
  ProgramItem,
  ProgramRole,
} from "@/types/invitation";

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
/** 当日の流れの時刻の形（例: 15:15） */
const TIME_RE = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
/** 当日の流れの行数の上限（Issue #166） */
const MAX_PROGRAM_ROWS = 12;
/** 当日の流れの行の役目（types/invitation.ts の ProgramRole と同じ） */
const PROGRAM_ROLES: readonly ProgramRole[] = ["gather", "ceremony", "reception", "party"];
/** ふたりからのカードの枚数の上限（新郎・新婦。Issue #173） */
const MAX_FROM_US = 2;
/** 当日のおたのしみのカードの枚数の上限（Issue #173） */
const MAX_HIGHLIGHTS = 6;
/** 当日のおたのしみのアイコンの種類（types/invitation.ts の InvitationHighlightKey と同じ） */
const HIGHLIGHT_KEYS: readonly InvitationHighlightKey[] = ["food", "drink", "game"];
/**
 * 招待状の写真の URL の形（Issue #173）。
 * ★仮の画像は public/placeholders/invitation/ の下だけ★ 本物の写真は public/ に置かない（公開リポジトリ）。
 * ★本物の写真は https だけ★ 画面が img の src にそのまま入れる。配信元は CSP の img-src（公開バケット）に合わせる。
 */
const PLACEHOLDER_URL_RE = /^\/placeholders\/invitation\/[a-z0-9-]+\.(svg|png|jpg|webp)$/;
const PHOTO_URL_RE = /^https:\/\/[a-z0-9.-]+\/[A-Za-z0-9._/-]+$/;

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
  for (const key of ["groom", "bride", "dateLabel", "venueName", "venueAddress"] as const) {
    const v = text(d[key]);
    if (v === null) return { ok: false, field: key };
    out[key] = v;
  }
  const venueMapUrl = text(d.venueMapUrl ?? "", true);
  // 地図のリンクは https だけ（画面が href にそのまま入れる）
  if (venueMapUrl === null || (venueMapUrl && !/^https:\/\//.test(venueMapUrl))) return { ok: false, field: "venueMapUrl" };

  // 2次会の会場。任意（以前の config/invitation もそのまま通す）
  const afterParty = parseAfterParty(d.afterParty);
  if (!afterParty.ok) return { ok: false, field: afterParty.field };

  if (!Array.isArray(d.greeting) || d.greeting.length === 0 || d.greeting.length > MAX_GREETING_LINES) return { ok: false, field: "greeting" };
  const greeting: string[] = [];
  for (const line of d.greeting) {
    const v = text(line);
    if (v === null) return { ok: false, field: "greeting" };
    greeting.push(v);
  }

  // 当日の流れ（Issue #166）。1行以上。以前の receptionAt・ceremony（Issue #146）は読まない（残っていても捨てる）
  const program = parseProgram(d.program);
  if (!program.ok) return { ok: false, field: program.field };

  // 承認待ちの画面に出す、確認までの目安（Issue #157 B-4）。任意。空なら出さない
  const approvalNote = text(d.approvalNote ?? "", true);
  if (approvalNote === null) return { ok: false, field: "approvalNote" };

  // パスコードを間違えたときのヒント（Issue #181）。任意。空なら出さない
  const passcodeHint = text(d.passcodeHint ?? "", true);
  if (passcodeHint === null) return { ok: false, field: "passcodeHint" };
  // 何回目の間違いから出すか。任意（省略なら PASSCODE_HINT_FROM_DEFAULT）。ロックより後は出せないので上限は PASSCODE_MAX_ATTEMPTS - 1
  const passcodeHintFrom = d.passcodeHintFrom;
  if (
    passcodeHintFrom !== undefined &&
    (typeof passcodeHintFrom !== "number" || !Number.isInteger(passcodeHintFrom) || passcodeHintFrom < 1 || passcodeHintFrom >= PASSCODE_MAX_ATTEMPTS)
  ) {
    return { ok: false, field: "passcodeHintFrom" };
  }

  // 写真・ふたりから・当日のおたのしみ（Issue #173）。どれも任意（以前の config/invitation もそのまま通す）
  const extras = parseExtras(d);
  if (!extras.ok) return { ok: false, field: extras.field };

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
      venueName: out.venueName,
      venueAddress: out.venueAddress,
      venueMapUrl,
      ...(afterParty.value ? { afterParty: afterParty.value } : {}),
      greeting,
      program: program.value,
      ...(approvalNote ? { approvalNote } : {}),
      ...(passcodeHint ? { passcodeHint } : {}),
      ...(passcodeHintFrom !== undefined ? { passcodeHintFrom } : {}),
      ...(extras.value.hero ? { photos: { hero: extras.value.hero } } : {}),
      fromUs: extras.value.fromUs,
      highlights: extras.value.highlights,
      showGreeting: extras.value.showGreeting,
      opening: { date, venue, names: names as CoupleNames },
    },
  };
}

/** 2次会の会場の形を確かめる。未設定なら value は undefined */
function parseAfterParty(v: unknown): { ok: true; value: InvitationAfterParty | undefined } | { ok: false; field: string } {
  if (v === undefined) return { ok: true, value: undefined };
  if (!v || typeof v !== "object") return { ok: false, field: "afterParty" };
  const r = v as Record<string, unknown>;
  const venueName = text(r.venueName);
  if (venueName === null) return { ok: false, field: "afterParty.venueName" };
  const venueAddress = text(r.venueAddress ?? "", true);
  if (venueAddress === null) return { ok: false, field: "afterParty.venueAddress" };
  const venueMapUrl = text(r.venueMapUrl ?? "", true);
  // 地図のリンクは https だけ（画面が href にそのまま入れる）
  if (venueMapUrl === null || (venueMapUrl && !/^https:\/\//.test(venueMapUrl))) return { ok: false, field: "afterParty.venueMapUrl" };
  return { ok: true, value: { venueName, venueAddress, venueMapUrl } };
}

/** 当日の流れの形を確かめる。だめなら、だめだった項目の名前（例: program.2.time）を返す */
function parseProgram(v: unknown): { ok: true; value: ProgramItem[] } | { ok: false; field: string } {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_PROGRAM_ROWS) return { ok: false, field: "program" };
  const rows: ProgramItem[] = [];
  const roles = new Set<ProgramRole>();
  for (const [i, raw] of v.entries()) {
    const at = `program.${i}`;
    if (!raw || typeof raw !== "object") return { ok: false, field: at };
    const r = raw as Record<string, unknown>;
    const time = text(r.time ?? "", true);
    if (time === null || (time && !TIME_RE.test(time))) return { ok: false, field: `${at}.time` };
    const title = text(r.title);
    if (title === null) return { ok: false, field: `${at}.title` };
    const note = text(r.note ?? "", true);
    if (note === null) return { ok: false, field: `${at}.note` };
    if (r.highlight !== undefined && typeof r.highlight !== "boolean") return { ok: false, field: `${at}.highlight` };
    const row: ProgramItem = { time, title, note, highlight: r.highlight === true };
    if (r.role !== undefined) {
      const role = PROGRAM_ROLES.find((x) => x === r.role);
      // ★同じ役目は1行だけ★ 挙式の選択肢の時刻が、どの行のものか分からなくなる
      if (!role || roles.has(role)) return { ok: false, field: `${at}.role` };
      roles.add(role);
      row.role = role;
    }
    rows.push(row);
  }
  return { ok: true, value: rows };
}

/** 写真の URL。空は未設定。形が違えば null */
function photoUrl(v: unknown): string | null {
  const s = text(v ?? "", true);
  if (s === null) return null;
  return !s || PLACEHOLDER_URL_RE.test(s) || PHOTO_URL_RE.test(s) ? s : null;
}

type Extras = {
  hero?: InvitationHeroPhoto;
  fromUs: InvitationFromUs[];
  highlights: InvitationHighlight[];
  showGreeting: boolean;
};

/** Issue #173 で足した項目。だめなら、だめだった項目の名前（例: fromUs.1.alt）を返す */
function parseExtras(d: Record<string, unknown>): { ok: true; value: Extras } | { ok: false; field: string } {
  let hero: InvitationHeroPhoto | undefined;
  if (d.photos !== undefined) {
    const p = d.photos as Record<string, unknown> | null;
    if (!p || typeof p !== "object") return { ok: false, field: "photos" };
    if (p.hero !== undefined) {
      const h = p.hero as Record<string, unknown> | null;
      if (!h || typeof h !== "object") return { ok: false, field: "photos.hero" };
      const url = photoUrl(h.url);
      if (url === null) return { ok: false, field: "photos.hero.url" };
      // ★alt は必須★ 写真が未設定でも先に入れておく（photo set は URL だけを書き換える）
      const alt = text(h.alt);
      if (alt === null) return { ok: false, field: "photos.hero.alt" };
      const overlayDate = text(h.overlayDate ?? "", true);
      if (overlayDate === null) return { ok: false, field: "photos.hero.overlayDate" };
      const overlayText = text(h.overlayText ?? "", true);
      if (overlayText === null) return { ok: false, field: "photos.hero.overlayText" };
      // 重ねる文字の色（Issue #178）。省略なら黒
      const overlayColor = h.overlayColor ?? "black";
      if (overlayColor !== "white" && overlayColor !== "black") return { ok: false, field: "photos.hero.overlayColor" };
      hero = { url, alt, overlayDate, overlayText, overlayColor };
    }
  }

  const fromUs: InvitationFromUs[] = [];
  if (d.fromUs !== undefined) {
    if (!Array.isArray(d.fromUs) || d.fromUs.length > MAX_FROM_US) return { ok: false, field: "fromUs" };
    for (const [i, raw] of d.fromUs.entries()) {
      const at = `fromUs.${i}`;
      if (!raw || typeof raw !== "object") return { ok: false, field: at };
      const r = raw as Record<string, unknown>;
      const name = text(r.name);
      if (name === null) return { ok: false, field: `${at}.name` };
      const url = photoUrl(r.photoUrl);
      if (url === null) return { ok: false, field: `${at}.photoUrl` };
      const alt = text(r.alt);
      if (alt === null) return { ok: false, field: `${at}.alt` };
      const message = text(r.message);
      if (message === null) return { ok: false, field: `${at}.message` };
      fromUs.push({ name, photoUrl: url, alt, message });
    }
  }

  const highlights: InvitationHighlight[] = [];
  if (d.highlights !== undefined) {
    if (!Array.isArray(d.highlights) || d.highlights.length > MAX_HIGHLIGHTS) return { ok: false, field: "highlights" };
    for (const [i, raw] of d.highlights.entries()) {
      const at = `highlights.${i}`;
      if (!raw || typeof raw !== "object") return { ok: false, field: at };
      const r = raw as Record<string, unknown>;
      const key = HIGHLIGHT_KEYS.find((k) => k === r.key);
      if (!key) return { ok: false, field: `${at}.key` };
      const title = text(r.title);
      if (title === null) return { ok: false, field: `${at}.title` };
      const body = text(r.body);
      if (body === null) return { ok: false, field: `${at}.body` };
      highlights.push({ key, title, body });
    }
  }

  // ★未設定ならご挨拶は出さない★（Issue #173。ふたりからに置き換えた）
  if (d.showGreeting !== undefined && typeof d.showGreeting !== "boolean") return { ok: false, field: "showGreeting" };

  return { ok: true, value: { hero, fromUs, highlights, showGreeting: d.showGreeting === true } };
}
