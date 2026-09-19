import "server-only"; // ★招待コードがクライアントに漏れないようにする★

export type InviteFeatures = {
  /** ご祝儀・送金リンクを表示するか（将来のゲスト管理用） */
  showGiftLink?: boolean;
  /** 出欠回答を必須にするか */
  requireRsvp?: boolean;
};

export type InviteDef = {
  /** 管理画面やログで使うグループ名 */
  label: string;
  /** 付与するタグ。config/tags.ts の id と一致させること */
  tags: string[];
  welcomeMessage: string;
  features?: InviteFeatures;
};

/**
 * 入力ゆらぎの吸収。空白とハイフンだけ除去し、アンダースコアは残す。
 * （FAMILY_SECRET のような可読性のある形をキーに使えるようにするため）
 */
export function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, "");
}

const DEFAULT_INVITES: Record<string, InviteDef> = {
  WEDDING2026: {
    label: "一般ゲスト",
    tags: ["all", "ceremony"],
    welcomeMessage: "ようこそ！ おふたりへのメッセージをぜひ残してください 🌿",
  },
  FAMILY_SECRET: {
    label: "親族",
    tags: ["all", "ceremony", "family"],
    welcomeMessage: "ご親族のみなさま、本日はありがとうございます。",
    features: { showGiftLink: true, requireRsvp: true },
  },
  GROOM_FRIENDS: {
    label: "新郎友人",
    tags: ["all", "ceremony", "friends_groom"],
    welcomeMessage: "新郎の友人のみなさま、盛り上げていきましょう！",
  },
  BRIDE_FRIENDS: {
    label: "新婦友人",
    tags: ["all", "ceremony", "friends_bride"],
    welcomeMessage: "新婦の友人のみなさま、今日はよろしくお願いします！",
  },
  AFTER_PARTY: {
    label: "二次会のみ",
    tags: ["all", "after_party"],
    welcomeMessage: "二次会からの参加、ありがとうございます 🥂",
  },
};

/**
 * 本番ではコードをリポジトリに置かず、環境変数で丸ごと差し替える。
 *   INVITE_CODES_JSON='{"XXXX":{"label":"...","tags":["all"],"welcomeMessage":"..."}}'
 * 設定されていればこちらが優先（マージではなく置換）。
 */
function inviteTable(): Record<string, InviteDef> {
  const raw = process.env.INVITE_CODES_JSON;
  if (!raw) return DEFAULT_INVITES;
  try {
    return JSON.parse(raw) as Record<string, InviteDef>;
  } catch {
    console.error("[invites] INVITE_CODES_JSON のパースに失敗。既定値を使用します");
    return DEFAULT_INVITES;
  }
}

export function lookupInvite(input: string): (InviteDef & { code: string }) | null {
  const code = normalizeCode(input);
  const found = inviteTable()[code];
  return found ? { ...found, code } : null;
}
