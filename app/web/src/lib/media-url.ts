import type { MediaItem } from "@/types";
import { displayStatus } from "@/lib/original-status";

/**
 * ★メディアURLの単一の出どころ★
 *
 *   Firestore には投稿時点の絶対URL（url / originalUrl）が焼き込まれている。
 *   そのまま読むと、配信ドメインを変えた瞬間に過去の投稿が全部壊れる。
 *
 *   幸い storagePath / originalPath にオブジェクトキーが残っているので、
 *   「キーがあればキーから組み立て、無い古いデータだけ保存済みURLに落ちる」
 *   という読み方にすれば、Firestore を一切書き換えずにドメインを移行できる。
 *   次にドメインが変わっても環境変数1つで終わる。
 *
 *   NEXT_PUBLIC_MEDIA_BASE はブラウザに出るが、ホスト名は <img src> で
 *   どのみち見えるので秘匿性は落ちない。アクセス制御は推測不可能な
 *   UUID キーとバケットの公開/非公開分離が担っている。
 */
const BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE ?? "").replace(/\/+$/, "");

/**
 * 旧ドメイン。ここに挙げたホストの URL だけ rehost() の対象にする。
 * Firebase Storage の URL（reference_faces など）を巻き込まないための安全弁。
 */
const LEGACY_HOSTS = new Set(
  (process.env.NEXT_PUBLIC_MEDIA_LEGACY_HOSTS ?? "media.wedding.sw-lab.net")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

/** オブジェクトキーから配信URLを組み立てる。BASE 未設定なら null */
export function keyUrl(key?: string | null): string | null {
  if (!BASE || !key) return null;
  return `${BASE}/${String(key).replace(/^\/+/, "")}`;
}

/** 軽量版（サムネ・動画本体）の src */
export function thumbSrc(m: Pick<MediaItem, "storagePath" | "url">): string {
  return keyUrl(m.storagePath) ?? m.url;
}

/**
 * タイムライン・投稿の詳細の一覧用の写真（長辺 828px。Issue #251）。小さい版の無い古い投稿・動画は軽量版。
 * ★一覧の写真はここだけで決める★ 全画面（MediaLightbox・PostLightbox）は thumbSrc / bestSrc のまま。
 */
export function feedSrc(m: Pick<MediaItem, "type" | "storagePath" | "url" | "feedPath" | "feedUrl">): string {
  if (m.type === "image") {
    const v = keyUrl(m.feedPath) ?? (m.feedUrl || null);
    if (v) return v;
  }
  return thumbSrc(m);
}

/** ギャラリーの格子・小さいサムネイル用の写真（長辺 400px。Issue #251）。無ければ feed、それも無ければ軽量版 */
export function gridSrc(m: Pick<MediaItem, "type" | "storagePath" | "url" | "feedPath" | "feedUrl" | "gridPath" | "gridUrl">): string {
  if (m.type === "image") {
    const v = keyUrl(m.gridPath) ?? (m.gridUrl || null);
    if (v) return v;
  }
  return feedSrc(m);
}

/**
 * 動画の1枚目の画像（Issue #251）。無ければ null（一覧は今までどおり動画を preload="metadata" で出す）。
 * ★一覧では動画本体を読まない★ これがあるときは <video> を置かず、画像と再生の印だけを出す（押すとビューアで再生）。
 */
export function posterSrc(m: Pick<MediaItem, "type" | "posterPath" | "posterUrl">): string | null {
  if (m.type !== "video") return null;
  return keyUrl(m.posterPath) ?? (m.posterUrl || null);
}

/**
 * 原本の src。公開が完了しているときだけ返す。
 *
 * ★originalPath があるだけでは原本は存在しない★
 *   originalPath はアップロード「予約」の時点で書かれる。
 *   Worker が EXIF を落として公開バケットへ置くまでは 404 になるので、
 *   displayStatus が published になってから初めて使う。
 */
export function originalSrc(m: MediaItem): string | null {
  const ds = displayStatus(m);
  // originalStatus を持たない最初期のデータは originalUrl の有無で判断する
  const ready = ds === "published" || (!m.originalStatus && !!m.originalUrl);
  if (!ready) return null;
  return keyUrl(m.originalPath) ?? m.originalUrl ?? null;
}

/** 原本があれば原本、無ければ軽量版。拡大表示・プロジェクター投影用 */
export function bestSrc(m: MediaItem): string {
  return originalSrc(m) ?? thumbSrc(m);
}

/**
 * キーを持たない保存済みURL（faces.imageUrl など）のホスト部だけ差し替える。
 * 旧メディアドメイン以外はそのまま返す。
 */
export function rehost(url?: string | null): string {
  if (!url) return "";
  if (!BASE) return url;
  try {
    const u = new URL(url);
    if (!LEGACY_HOSTS.has(u.hostname)) return url;
    return `${BASE}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}
