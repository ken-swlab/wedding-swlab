import type { Timestamp } from "firebase/firestore";

/**
 * 出欠。label は管理画面の短い表記、formLabel は回答フォームの表記（Issue #74 で4択に変更）。
 * 1次会 = 披露宴（パーティー）、2次会 = 二次会。
 */
export const ATTENDANCE_OPTIONS = [
  { value: "unanswered",  label: "未回答",    formLabel: "未回答" },
  { value: "both",        label: "両方参加",  formLabel: "1次会・2次会 両方参加" },
  { value: "first_only",  label: "1次会のみ", formLabel: "1次会のみ参加" },
  { value: "second_only", label: "2次会のみ", formLabel: "2次会のみ参加" },
  { value: "declined",    label: "欠席",      formLabel: "欠席" },
] as const;
export type Attendance = (typeof ATTENDANCE_OPTIONS)[number]["value"];

/**
 * 挙式へのご参加。出欠が「欠席」以外のときだけ聞く（欠席・未回答なら空文字）。
 * 挙式は自由参加。時刻は回答フォームの説明文にも出している（CEREMONY_NOTE）。
 */
export const CEREMONY_OPTIONS = [
  { value: "ceremony", label: "挙式から",       formLabel: "挙式（15:00〜）から参加する" },
  { value: "party",    label: "パーティーから", formLabel: "パーティーから参加する" },
] as const;
export type Ceremony = (typeof CEREMONY_OPTIONS)[number]["value"];
export const CEREMONY_NOTE = "15:00からの挙式は自由参加となっております。";

export const CEREMONY_LABEL = Object.fromEntries(
  CEREMONY_OPTIONS.map((o) => [o.value, o.label]),
) as Record<Ceremony, string>;

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
  /** 挙式から出るか。出欠が欠席・未回答なら "" */
  ceremony: Ceremony | "";
  /** 食物アレルギーの有無。false なら allergy は空。未回答（登録前・名簿のみ）は null */
  hasAllergy: boolean | null;
  /** ★健康情報★ 公開プロフィールには絶対に置かない */
  allergy: string;
  /** 備考・連絡事項（ゲスト本人が書く。健康情報が混じりうるので allergy と同じ扱い） */
  note: string;
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
   *   realName         ゲスト本人が登録フォームで入力した本名（「姓 名」をつないだもの）
   *   lastName / firstName / lastKana / firstKana  フォームの姓・名と、そのふりがな（Issue #74）
   *   kana             ふりがな（本名の読みなので本名と同じ扱い）
   *   lineDisplayName  LINE の表示名。本名を設定している人が多い
   *
   *   いずれも guests に置くと、LINE ログインを通しただけの
   *   未承認ユーザーが全ゲストぶんを list できてしまう。
   */
  displayName: string;
  realName: string;
  kana: string;
  lastName: string;
  firstName: string;
  lastKana: string;
  firstKana: string;
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
  /** パスコードを間違え続けて永久ロックされている（/api/guest/passcode が書く） */
  passcodeBlocked: boolean;
  /**
   * 登録後にゲストが出欠・アレルギーを変えた（管理者がまだ確認していない）。
   * 書くのは /api/guest/questionnaire と /api/guest/register、消すのは update-guest の ackAnswerChange。
   */
  answerChange: {
    fields: ("attendance" | "allergy")[];
    at: Timestamp | null;
    /** 確認済みにしてから最初に出欠が変わる前の値 */
    attendanceBefore: Attendance | null;
  } | null;
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
  /** true で「回答の変更」を確認済みにする（guestAdmin の answerChange* を消す） */
  ackAnswerChange?: boolean;
};
