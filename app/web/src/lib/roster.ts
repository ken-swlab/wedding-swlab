import { DEFAULT_INVITATION, toInvitationStatus, toTag, type InvitationStatus } from "@/config/roster";

export type RosterEntry = { displayName: string; kana: string; tags: string[]; invitationStatus: InvitationStatus; };
export type ParsedRow = RosterEntry & { line: number; duplicate: boolean; };

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

    let kana = ""; let invitationStatus: InvitationStatus | null = null; const tags: string[] = [];
    for (const cell of cells.slice(1)) {
      if (!invitationStatus) {
        const s = toInvitationStatus(cell);
        if (s) { invitationStatus = s; continue; }
      }
      const t = toTag(cell);
      if (t) { if (!tags.includes(t)) tags.push(t); continue; }
      if (!kana && looksLikeKana(cell)) { kana = cell; continue; }
    }

    const key = normalizeName(displayName);
    rows.push({ line: i + 1, displayName, kana, tags, invitationStatus: invitationStatus ?? DEFAULT_INVITATION, duplicate: existingNames.has(key) || seen.has(key) });
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
