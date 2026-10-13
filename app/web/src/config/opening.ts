/**
 * オープニング演出「招集」の決まりごと（Issue #131）。クライアントとサーバーの両方で使う。
 * ★新郎新婦の名前・日付・会場はここに書かない★ サーバーが Firestore の config/invitation から読み、
 *   パスコードを通った人にだけ GET /api/guest/invitation で返す。
 *
 * タイミングはすべてここに集める（単位は ms）。動きは docs/prototypes/opening_prototype.html が元。
 */
export const OPENING_TIMING = {
  /** 招集: 最初の文字を出すまでの間 */
  callLeadIn: 500,
  /** 招集: 1文字の間隔（日本語） */
  callCharJa: 90,
  /** 招集: 1文字の間隔（英数字） */
  callCharAscii: 70,
  /** 招集: 区切り線のあと */
  callAfterRule: 250,
  /** 招集: 出し切ったあとの読む時間 */
  callRead: 1600,
  /** レーン表への切り替え */
  laneEnter: 650,
  /** 名前: 大きく出す（フェードイン） */
  nameFadeIn: 260,
  /** 名前: 大きく出したまま止める（新郎新婦） */
  nameHoldCouple: 950,
  /** 名前: 大きく出したまま止める（ゲスト） */
  nameHoldGuest: 1300,
  /** 名前: レーンに収まる動き */
  nameSettle: 520,
  /** レーンに収まったあとの間（新郎新婦） */
  afterSettleCouple: 420,
  /** レーンに収まったあとの間（ゲストのあと） */
  afterSettleGuest: 1200,
  /** レーン表を消す */
  laneExit: 450,
  /** Take のあと */
  afterTake: 200,
  /** your のあと */
  afterYour: 100,
  /** marks のあと、長押しの案内まで */
  afterMarks: 800,
  /** 指を置いてから「構え」（画面が少し寄る）まで。これより前に離したら静かに戻す */
  stance: 250,
  /** 指を置いてから START まで（この範囲のランダム。毎回変える） */
  startDelayMin: 1100,
  startDelayMax: 1900,
  /** START の光と文字を出している時間 */
  startFlash: 650,
  /** START から反応なしとみなすまで */
  noReaction: 3000,
  /** 「フライング！」を出している時間 */
  foulShow: 1500,
  /** 指を離してからタイムを出すまで（その間は水しぶきだけ） */
  timeDelay: 500,
  /** タイムの出し入れ（フェード） */
  timeFade: 250,
  /** 水が満ちる */
  waterFill: 900,
  /** 水が満ちてからタイムを出している時間 */
  timeShow: 1500,
} as const;

/**
 * リアクションタイムとして記録する範囲 (ms)。
 * ★サーバー（/api/guest/reaction）も同じ値で確かめる★ 範囲の外は 400。
 *   下限より速い反応は、合図を予測したものとみなしてフライングにする（競泳の 0.10 秒）。
 *   上限は「反応なし」とみなす時間と同じ。
 */
export const REACTION_MIN_MS = 100;
export const REACTION_MAX_MS = OPENING_TIMING.noReaction;

/** レーンの数と、新郎・ゲスト・新婦のレーン */
export const LANE_COUNT = 8;
export const LANE_GROOM = 3;
export const LANE_GUEST = 4;
export const LANE_BRIDE = 5;

/** 大きく出す名前の拡大の上限（レーンの文字の何倍まで）と、画面の左右に残す余白 (px) */
export const NAME_SCALE_MAX = 2.4;
export const NAME_SIDE_MARGIN_PX = 20;
/** レーンの名前の文字の大きさ (px) と、長い名前を縮めるときの下限 */
export const LANE_FONT_PX = 19;
export const LANE_FONT_MIN_PX = 10;

/** オープニングを見たことを端末に覚えておく鍵（localStorage）。読めなければ「見ていない」として流す */
export const OPENING_SEEN_KEY = "wedding:opening-seen";

/**
 * オープニングの色。競泳の電光掲示板と水を模した専用の場面なので、テーマ（stone など）には従わせない
 * （/screen と同じく、ここだけ独立した配色）。
 */
export const OPENING_COLORS = {
  /** 招集: 落ち着いた背景と文字 */
  calm: "#efe9df",
  calmInk: "#3d3a34",
  /** レーン表: 黒背景の上の文字・暗い文字・罫線 */
  ink: "#f5f3ee",
  dim: "#5b5852",
  laneNo: "#333333",
  laneLine: "#1f1f1f",
  /** 電光掲示板のオレンジ（ゲストの名前・レーン番号・フライング） */
  led: "#ff9a3c",
  /** 水 */
  water1: "#2b8a96",
  water2: "#0f4c5c",
  drop: "rgba(220,245,250,0.9)",
} as const;

/** 水しぶきの粒と泡の数 */
export const SPLASH_DROPS = 26;
export const DIVE_BUBBLES = 18;
