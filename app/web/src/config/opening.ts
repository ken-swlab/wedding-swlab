/**
 * オープニング演出「招集」の決まりごと（Issue #131）。クライアントとサーバーの両方で使う。
 * ★新郎新婦の名前・日付・会場はここに書かない★ サーバーが Firestore の config/invitation から読み、
 *   パスコードを通った人にだけ GET /api/guest/invitation で返す。
 *
 * タイミングはすべてここに集める（単位は ms）。動きは docs/prototypes/opening_prototype.html と、
 * 切り替わりの演出（Issue #165）の試作 docs/prototypes/transitions_prototype.html が元。
 */
export const OPENING_TIMING = {
  // ---- パスコード → 招集（Issue #165。動きは docs/prototypes/transitions_prototype.html の 1） ----
  /** 「確認しています…」を出しておく最短の時間（API がもっと遅ければ、その応答まで） */
  passcodeCheckMin: 500,
  /** 見出しが消え、4つの枠が縮んで1本の線になる */
  boxesCollapse: 650,
  /** 線が画面の中央やや上（CALL_LINE_Y）へ動く。ここで「招集のお知らせ」の区切り線になる */
  lineMove: 500,
  /** 見返し（パスコードなし）のとき、区切り線が中央から伸びる */
  lineDraw: 500,
  /** 叩きつける前の溜め */
  slamWindup: 250,
  /** 「招集」を叩きつける（拡大 2.6 倍・ぼかし 6px → 0.94 倍 → 1 倍） */
  slam: 260,
  /** 叩きつけの開始から、揺れ・線の伸び・波紋を出すまで */
  slamImpact: 190,
  /** 画面を小さく揺らす */
  shake: 240,
  /** 区切り線を横に伸ばす（幅 1 → 2.2 → 1.6 倍） */
  ruleStretch: 380,
  /** 水の波紋のような輪を広げる（0.6 → 7 倍、薄く消える） */
  ripple: 900,
  /** 揺れなどを出してから「のお知らせ」を出すまで */
  slamSubDelay: 260,
  /** 「のお知らせ」を出す */
  slamSub: 300,
  /** 「のお知らせ」のあと、日付を1文字ずつ出すまで */
  afterSlamSub: 450,

  /** 招集: 最初の文字を出すまでの間（見返しで線を伸ばす前） */
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
  /**
   * 「長押しで構える」を出してから、一度も指を置かないまま待つ時間（Issue #157 A-2）。
   * idleEmphasis を過ぎたら丸を大きく脈打たせて案内の文字を大きくし、idleSkip を過ぎたら
   * 「スキップして招待状へ」を下に大きめに出す。一度でも指を置いたら、どちらも出さない。
   */
  idleEmphasis: 5000,
  idleSkip: 10_000,
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

  // ---- 飛び込み → 招待状（Issue #165 の 2。水面から顔を出す） ----
  /** タイムを消す */
  timeFadeOut: 300,
  /** タイムを消し始めてから、水が引き始めるまで */
  revealGap: 200,
  /** 水が下へ引いていく */
  waterRecede: 1300,
  /** 水の下の招待状のぼかし（7px）と拡大（1.04 倍）が戻る */
  inviteUnblur: 1100,
  /** 水が引ききってから、画面下の「エントリーする」を出すまで */
  entryBarAfterReveal: 400,

  // ---- 承認待ち → タイムライン（Issue #165 の 3。幕が開く） ----
  /** 承認待ちの文字を消す */
  approvedBodyFade: 400,
  /** 黒い画面のまま「承認されました」を出す */
  approvedMessageFade: 500,
  /** 「承認されました」を止めて見せる */
  approvedHold: 1300,
  /** 黒い画面が上へ開く幕のように動き、タイムラインが現れる */
  curtainOpen: 1100,
} as const;

/** 区切り線の高さ（画面の高さに対する割合）。パスコードの線はここへ動き、招集はここから組み立てる */
export const CALL_LINE_Y = 0.47;

/** 「承認されました」の文字の上端（画面の高さに対する位置）。承認待ちの画面と、幕（ScreenFade）で同じにする */
export const APPROVED_MESSAGE_TOP = "45%";

/** 幕が開く動きの緩急（Issue #165） */
export const CURTAIN_EASING = "cubic-bezier(.7,0,.2,1)";

/** 承認されてから、次の画面（ゲストブック）へ進めるまで (ms)。承認待ちの文字を消し →「承認されました」を出して止める */
export const APPROVED_REVEAL_MS = OPENING_TIMING.approvedBodyFade + OPENING_TIMING.approvedMessageFade + OPENING_TIMING.approvedHold;

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
  /** 招集: 落ち着いた背景と文字。★入口（LINE ログイン）とパスコードも同じ色★（Issue #165。切り替わりで地の色を変えない） */
  calm: "#ece4d8",
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

/**
 * 送信完了（エントリー完了）から承認待ちへ、自動で進むまでの時間 (ms。Issue #156)。
 * 演出（EVENT 1 ENTRY → FINISH → 名前 → 本文）が出そろってから数える。画面をタップすれば、すぐ進む。
 * prefers-reduced-motion でも同じ時間で進む（画面下の線の動きだけ省く）。
 */
export const ENTRY_AUTO_ADVANCE_MS = 3000;

/**
 * 承認待ちで、承認が届いてから自動で先へ進めないまま待つ時間 (ms。Issue #156)。
 * これを過ぎるか、ID トークンの取り直しが失敗したときだけ、「画面が切り替わらない場合はこちら」を出す。
 */
export const APPROVAL_STALE_MS = 10_000;
