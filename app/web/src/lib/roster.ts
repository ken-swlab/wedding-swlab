import { DEFAULT_INVITATION, NEW_GUEST_NAME, toInvitationStatus, toTag, type InvitationStatus } from "@/config/roster";
import { adminName } from "@/lib/names";
import { tagDef } from "@/config/tags";
import type { GuestRow } from "@/types/admin";

export type RosterEntry = { displayName: string; kana: string; tags: string[]; invitationStatus: InvitationStatus; };
/** hiddenTags: 言葉は当たったが、隠したタグ（Issue #248）なので付けないタグ。プレビューで知らせる */
export type ParsedRow = RosterEntry & { line: number; duplicate: boolean; hiddenTags: string[] };

export function normalizeName(raw: string): string { return raw.normalize("NFKC").replace(/\s+/g, "").toLowerCase(); }
function looksLikeKana(s: string): boolean { return /^[ぁ-んァ-ヶーｦ-ﾟ\s]+$/u.test(s) || /^[A-Za-z\s.'-]+$/u.test(s); }

export function parseRoster(text: string, existingNames: Set<string>): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const seen = new Set<string>();

  text.split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line) return;
    const cells = line.split(/[,\t，、]/).map((c) => c.trim()).filter(Boolean);
    if (cells.length === 0) return;
    if (i === 0 && /^(名前|氏名|お名前|name)$/i.test(cells[0])) return;
    const displayName = cells[0];
    if (!displayName) return;

    let kana = ""; let invitationStatus: InvitationStatus | null = null; const tags: string[] = []; const hiddenTags: string[] = [];
    for (const cell of cells.slice(1)) {
      if (!invitationStatus) {
        const s = toInvitationStatus(cell);
        if (s) { invitationStatus = s; continue; }
      }
      const t = toTag(cell);
      // ★隠したタグは付けない★（Issue #248）プレビューに「このタグは隠されています」と出す
      if (t && tagDef(t).archived) { if (!hiddenTags.includes(t)) hiddenTags.push(t); continue; }
      if (t) { if (!tags.includes(t)) tags.push(t); continue; }
      if (!kana && looksLikeKana(cell)) { kana = cell; continue; }
    }

    const key = normalizeName(displayName);
    rows.push({ line: i + 1, displayName, kana, tags, hiddenTags, invitationStatus: invitationStatus ?? DEFAULT_INVITATION, duplicate: existingNames.has(key) || seen.has(key) });
    seen.add(key);
  });
  return rows;
}

export function guestSortKey(g: { kana?: string; realName?: string; nickname?: string; displayName: string; }): string {
  return (g.kana || g.realName || g.nickname || g.displayName).normalize("NFKC");
}
export function compareGuests(
  a: { kana?: string; realName?: string; nickname?: string; displayName: string },
  b: { kana?: string; realName?: string; nickname?: string; displayName: string }
): number {
  return guestSortKey(a).localeCompare(guestSortKey(b), "ja");
}

/**
 * 紐付けの候補（仮ゲスト）に出す名前（Issue #203）。「＋ 個別追加」のまま名前を保存していない行は、
 * 「新しいゲスト」が並んで見分けられないので「名前が未入力」と添える。
 */
export function rosterCandidateLabel(g: GuestRow): string {
  const name = adminName(g);
  if (g.displayName.trim() === NEW_GUEST_NAME) return `${name}（名前が未入力）`;
  return g.kana ? `${name}（${g.kana}）` : name;
}
