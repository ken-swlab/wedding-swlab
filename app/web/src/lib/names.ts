export type NameFields = {
  displayName?: string;
  realName?: string;
  nickname?: string;
  lineDisplayName?: string;
};

const pick = (v?: string) => (v && v.trim() ? v.trim() : "");

export function adminName(g: NameFields): string {
  return pick(g.realName) || pick(g.displayName) || pick(g.lineDisplayName) || "（名称未設定）";
}

export function adminSubName(g: NameFields): string {
  const parts: string[] = [];
  if (pick(g.nickname)) parts.push(`「${pick(g.nickname)}」`);
  if (pick(g.lineDisplayName)) parts.push(`LINE: ${pick(g.lineDisplayName)}`);
  return parts.join(" · ");
}

export function publicName(g: NameFields): string {
  return pick(g.nickname) || pick(g.displayName) || "ゲスト";
}
