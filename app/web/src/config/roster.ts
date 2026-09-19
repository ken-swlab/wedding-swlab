export const GUEST_CATEGORIES = [
  { id: "groom_friend", label: "新郎友人", className: "bg-sky-50 text-sky-700 ring-sky-200",
    aliases: ["新郎友人", "新郎の友人", "新郎友達", "新郎", "groom", "groom_friend"] },
  { id: "bride_friend", label: "新婦友人", className: "bg-violet-50 text-violet-700 ring-violet-200",
    aliases: ["新婦友人", "新婦の友人", "新婦友達", "新婦", "bride", "bride_friend"] },
  { id: "family", label: "親族", className: "bg-rose-50 text-rose-700 ring-rose-200",
    aliases: ["親族", "家族", "身内", "family"] },
  { id: "colleague", label: "会社関係", className: "bg-amber-50 text-amber-700 ring-amber-200",
    aliases: ["会社関係", "会社", "職場", "同僚", "上司", "colleague", "work"] },
  { id: "other", label: "その他", className: "bg-stone-100 text-stone-600 ring-stone-200",
    aliases: ["その他", "other", "-"] },
] as const;

export type GuestCategory = (typeof GUEST_CATEGORIES)[number]["id"];

export const INVITATION_STATUSES = [
  { id: "unsent", label: "未送付", className: "bg-stone-100 text-stone-600",
    aliases: ["未送付", "未送信", "未", "unsent"] },
  { id: "sent", label: "送付済", className: "bg-sky-50 text-sky-700",
    aliases: ["送付済", "送付済み", "送信済", "済", "sent"] },
  { id: "attending", label: "出席", className: "bg-emerald-50 text-emerald-700",
    aliases: ["出席", "参加", "○", "◯", "attending", "yes"] },
  { id: "declined", label: "欠席", className: "bg-rose-50 text-rose-700",
    aliases: ["欠席", "不参加", "×", "✕", "declined", "no"] },
] as const;

export type InvitationStatus = (typeof INVITATION_STATUSES)[number]["id"];

export const DEFAULT_CATEGORY: GuestCategory = "other";
export const DEFAULT_INVITATION: InvitationStatus = "unsent";

const CATEGORY_MAP = new Map<string, GuestCategory>();
for (const c of GUEST_CATEGORIES) {
  CATEGORY_MAP.set(c.id, c.id);
  for (const a of c.aliases) CATEGORY_MAP.set(a, c.id);
}

const STATUS_MAP = new Map<string, InvitationStatus>();
for (const s of INVITATION_STATUSES) {
  STATUS_MAP.set(s.id, s.id);
  for (const a of s.aliases) STATUS_MAP.set(a, s.id);
}

export function categoryDef(id: string) {
  return GUEST_CATEGORIES.find((c) => c.id === id) ?? GUEST_CATEGORIES[4];
}
export function invitationDef(id: string) {
  return INVITATION_STATUSES.find((s) => s.id === id) ?? INVITATION_STATUSES[0];
}
export function toCategory(raw: string): GuestCategory | null {
  return CATEGORY_MAP.get(raw.trim()) ?? null;
}
export function toInvitationStatus(raw: string): InvitationStatus | null {
  return STATUS_MAP.get(raw.trim()) ?? null;
}
export const isPreRegisteredUid = (uid: string) => uid.startsWith("pre_");
