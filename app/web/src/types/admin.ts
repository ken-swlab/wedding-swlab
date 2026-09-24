import type { Timestamp } from "firebase/firestore";

export const ATTENDANCE_OPTIONS = [
  { value: "unanswered", label: "未回答" },
  { value: "attending",  label: "出席" },
  { value: "declined",   label: "欠席" },
] as const;
export type Attendance = (typeof ATTENDANCE_OPTIONS)[number]["value"];

export const PAYMENT_OPTIONS = [
  { value: "none",      label: "未" },
  { value: "remitted",  label: "送金報告済" },
  { value: "confirmed", label: "受領確認済" },
] as const;
export type PaymentStatus = (typeof PAYMENT_OPTIONS)[number]["value"];

export const ATTENDANCE_LABEL = Object.fromEntries(
  ATTENDANCE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<Attendance, string>;

export const PAYMENT_LABEL = Object.fromEntries(
  PAYMENT_OPTIONS.map((o) => [o.value, o.label]),
) as Record<PaymentStatus, string>;

/**
 * /guests/{uid} : サインイン済みのゲストなら読める公開プロフィール。
 *
 * ★氏名系のフィールドをここに置いてはいけない★
 *   Rules は get / list をゲストに開いている（@メンションの候補を
 *   引くため）。realName・kana・displayName・lineDisplayName は
 *   いずれも本名そのものか、本名に直結する。全部 guestPrivate に置く。
 *   ここに残してよいのは「他のゲストに見せてよい情報」だけ。
 */
export type GuestPublic = {
  uid: string;
  nickname: string;
  photoURL?: string;
  tags: string[];
  isApproved: boolean;
  isRegistered: boolean;
  invitationStatus: string;
  isPreRegistered: boolean;
  mergedInto: string;
  isArchived: boolean;
};

/** /guestPrivate/{uid} : 本人と管理者だけが読める */
export type GuestPrivate = {
  uid: string;
  attendance: Attendance;
  /** ★健康情報★ 公開プロフィールには絶対に置かない */
  allergy: string;
  paymentStatus: PaymentStatus;
  submittedAt: Timestamp | null;
  /**
   * ★アクセス停止（Ban）★ 未設定＝有効。
   *   guests ではなくここに置くのは、guests がサインイン済み全員に
   *   get を許しているため（firestore.rules)。「誰が停止されたか」を
   *   他のゲストに見せない。
   *   実際の締め出しはこのフラグではなく、tags を空にすることと
   *   revokeRefreshTokens が行う。このフラグは運用上の記録と、
   *   承認待ちキューから外すための目印。
   */
  isActive: boolean;
  bannedReason: string;

  /**
   * ★氏名系は全部ここ★
   *   displayName      名簿（CSV取込・管理画面）で管理者が入れる氏名
   *   realName         ゲスト本人が登録フォームで入力した本名
   *   kana             ふりがな（本名の読みなので本名と同じ扱い）
   *   lineDisplayName  LINE の表示名。本名を設定している人が多い
   *
   *   いずれも guests に置くと、LINE ログインを通しただけの
   *   未承認ユーザーが全ゲストぶんを list できてしまう。
   */
  displayName: string;
  realName: string;
  kana: string;
  lineDisplayName: string;
};

/** /guestAdmin/{uid} : 管理者だけが読める運営メモ */
export type GuestAdmin = {
  uid: string;
  lineUserId: string;
  inviteCode: string;
  inviteLabel: string;
  isAnonymous: boolean;
  aiMemo: string;
  /**
   * ★呼び名は guestAdmin に置く★
   *   /guests は全ゲストが読める領域。「新郎から見た呼び名」は
   *   本人にも他のゲストにも見せる必要がない運営情報なので、
   *   aiMemo と同じ管理者専用の場所に置く。Rules の変更も不要。
   */
  callNameGroom: string;
  callNameBride: string;
  firstLoginAt: Timestamp | null;
  /** 参照顔写真。実際の保存先はここ（guestAdmin）で、guests ではない */
  referencePhotoUrl: string;
  referencePhotoPath: string;
};

/** ダッシュボードの1行（3つを uid で結合したもの） */
export type GuestRow = GuestPublic &
  Omit<GuestPrivate, "uid"> &
  Omit<GuestAdmin, "uid">;

/** ゲストが自分で送る初回登録の内容 */
export type RegisterPayload = {
  nickname: string;
  attendance: Attendance;
  allergy: string;
};

/** 管理者が送る更新内容。isApproved はここでしか変えられない */
export type UpdateGuestPayload = {
  referencePhotoUrl?: string | null;
  referencePhotoPath?: string | null;
  uid: string;
  nickname?: string;
  tags?: string[];
  isApproved?: boolean;
  attendance?: Attendance;
  allergy?: string;
  paymentStatus?: PaymentStatus;
  aiMemo?: string;
  callNameGroom?: string;
  callNameBride?: string;
  /** false でアクセス停止。tags を空にし、リフレッシュトークンも失効させる */
  isActive?: boolean;
  bannedReason?: string;
};
