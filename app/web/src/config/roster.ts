import { TAG_DEFS } from "@/config/tags";

export const INVITATION_STATUSES = [
  { id: "unsent", label: "未送付", className: "bg-stone-100 text-stone-600", aliases: ["未送付", "未送信", "未", "unsent"] },
  { id: "sent", label: "送付済", className: "bg-sky-50 text-sky-700", aliases: ["送付済", "送付済み", "送信済", "済", "sent"] },
  { id: "attending", label: "出席", className: "bg-emerald-50 text-emerald-700", aliases: ["出席", "参加", "○", "◯", "attending", "yes"] },
  { id: "declined", label: "欠席", className: "bg-rose-50 text-rose-700", aliases: ["欠席", "不参加", "×", "✕", "declined", "no"] },
] as const;

export type InvitationStatus = (typeof INVITATION_STATUSES)[number]["id"];
export const DEFAULT_INVITATION: InvitationStatus = "unsent";

const EXTRA_TAG_ALIASES: Record<string, string> = {
  "新郎友人": "friends_groom", "新郎の友人": "friends_groom", "新郎友達": "friends_groom", "新郎": "friends_groom",
  "新婦友人": "friends_bride", "新婦の友人": "friends_bride", "新婦友達": "friends_bride", "新婦": "friends_bride",
  "親族": "family", "家族": "family", "身内": "family", "親戚": "family",
  "会社": "colleagues", "会社関係": "colleagues", "職場": "colleagues", "同僚": "colleagues", "上司": "colleagues", "仕事": "colleagues",
  "挙式": "ceremony", "挙式参列": "ceremony", "式": "ceremony",
  "二次会": "after_party", "2次会": "after_party",
  "新郎新婦": "couple", "本人": "couple",
};

const TAG_MAP = new Map<string, string>();
for (const t of TAG_DEFS) { TAG_MAP.set(t.id, t.id); TAG_MAP.set(t.label, t.id); }
for (const [alias, id] of Object.entries(EXTRA_TAG_ALIASES)) TAG_MAP.set(alias, id);

const STATUS_MAP = new Map<string, InvitationStatus>();
for (const s of INVITATION_STATUSES) {
  STATUS_MAP.set(s.id, s.id);
  for (const a of s.aliases) STATUS_MAP.set(a, s.id);
}

export function invitationDef(id: string) { return INVITATION_STATUSES.find((s) => s.id === id) ?? INVITATION_STATUSES[0]; }
export function toTag(raw: string): string | null { return TAG_MAP.get(raw.trim()) ?? null; }
export function toInvitationStatus(raw: string): InvitationStatus | null { return STATUS_MAP.get(raw.trim()) ?? null; }
export const isPreRegisteredUid = (uid: string) => uid.startsWith("pre_");
