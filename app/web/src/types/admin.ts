import type { Timestamp } from "firebase/firestore";
import type { DrinkLevel } from "@/config/drink";

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
 * どの招待状から回答したか（Issue #240）。friend … 友人用（/invitation）／ family … 親族用（/invitation/family）。
 * 未設定は friend として扱う。★guestPrivate に置く★（ゲストどうしで見える guests には置かない）。
 * ★URL は転送されうる★ 親族用から回答しても承認は手動。管理画面に「親族用から回答」と出し、名簿で確かめてから承認する。
 */
export const INVITATION_KINDS = ["friend", "family"] as const;
export type InvitationKind = (typeof INVITATION_KINDS)[number];

/**
 * 親族の出欠（Issue #240）。友人の attendance とは別の項目にする（会費の計算 = attendance に混ぜない）。
 * 親族の当日の流れは「親族会食 → 挙式 → 親族だけで写真 → 解散」で、友人会食・2次会には出ない。
 * ★時刻はコードに書かない★ config/invitation_family の program から組み立てる（lib/invitation-program.ts の familyChoiceNote）。
 */
export const FAMILY_ATTENDANCE_OPTIONS = [
  { value: "both",          label: "会食・挙式",  formLabel: "親族会食・挙式 両方参加" },
  { value: "meal_only",     label: "会食のみ",    formLabel: "親族会食のみ参加" },
  { value: "ceremony_only", label: "挙式のみ",    formLabel: "挙式のみ参加" },
  { value: "declined",      label: "欠席",        formLabel: "欠席" },
] as const;
export type FamilyAttendance = (typeof FAMILY_ATTENDANCE_OPTIONS)[number]["value"];

export const FAMILY_ATTENDANCE_LABEL = Object.fromEntries(
  FAMILY_ATTENDANCE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<FamilyAttendance, string>;

/**
 * 挙式へのご参加。出欠が「欠席」以外のときだけ聞く（欠席・未回答なら空文字）。
 * ★時刻はコードに書かない★ config/invitation の program から組み立てる（Issue #166。
 *   回答フォームは lib/invitation-program.ts の ceremonyChoiceNote）。
 */
export const CEREMONY_OPTIONS = [
  { value: "ceremony", label: "挙式から" },
  { value: "party",    label: "パーティーから" },
] as const;
export type Ceremony = (typeof CEREMONY_OPTIONS)[number]["value"];

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
  /** どちらの招待状から答えたか（Issue #240）。未設定は friend */
  invitationKind: InvitationKind;
  /** 友人用の出欠。★親族用の人は "unanswered" のまま★（会費の計算に混ぜない） */
  attendance: Attendance;
  /** 親族用の出欠（Issue #240）。友人用・未回答は null */
  familyAttendance: FamilyAttendance | null;
  /** 前日に泊まるか（親族用だけ。Issue #240）。友人用・欠席・未回答は null */
  stayPrevNight: boolean | null;
  /** 挙式から出るか。出欠が欠席・未回答なら "" */
  ceremony: Ceremony | "";
  /** お酒の量 0〜4（Issue #147）。欠席・未回答なら null。★他のゲストに見せない★ */
  drinkLevel: DrinkLevel | null;
  /** お車代を受け取るか（Issue #148）。欠席・未回答なら null。★他のゲストに見せない★ */
  carFare: boolean | null;
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
    /** 確認済みにしてから最初に出欠が変わる前の値（親族用の人は familyAttendance の値。Issue #240） */
    attendanceBefore: Attendance | FamilyAttendance | null;
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
