import type { MediaItem, Post } from "@/types";
import { bestSrc } from "@/lib/media-url";

/** 保存の対象の写真1枚。ギャラリーの選択モードでは、投稿ではなくこの単位で並べて選ぶ */
export type PhotoEntry = {
  key: string;
  post: Post;
  media: MediaItem;
  /** 投稿の中で何枚目か（0 から） */
  index: number;
};

/**
 * 投稿の並びを写真1枚ずつの並びにする（新しい投稿が先、投稿の中は掲載順）。
 * ★写真だけを並べる★ 動画は1本が最大 8MiB と大きく、共有シートで一度に渡せる量を超えやすい。
 */
export function flattenPhotos(posts: Post[]): PhotoEntry[] {
  return posts.flatMap((post) =>
    post.media.flatMap((media, index) =>
      media.type === "image"
        ? [{ key: media.storagePath || `${post.id}-${index}`, post, media, index }]
        : [],
    ),
  );
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function fileName(e: PhotoEntry, type: string): string {
  const d = e.post.createdAt?.toDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = d
    ? `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
    : "photo";
  // 投稿 ID の頭を付けて、同じ時刻の別の投稿と名前がぶつからないようにする
  return `wedding-${stamp}-${e.post.id.slice(0, 6)}-${e.index + 1}.${EXT[type] ?? "jpg"}`;
}

/**
 * 写真を1枚読み込んで File にする。画質は拡大表示と同じ（原本が公開済みなら原本）。
 *
 * ★素の fetch で公開バケットから読む★ API ではないので api-client は通さない。
 *   公開バケット（wedding-media）は wedding.sw-lab.net からの GET に CORS を返し、
 *   CSP の connect-src にも配信元が入っている。Cookie は送らない。
 */
export async function fetchPhoto(e: PhotoEntry): Promise<File> {
  const res = await fetch(bestSrc(e.media), { mode: "cors", credentials: "omit" });
  if (!res.ok) throw new Error(`写真の取得に失敗しました（${res.status}）`);
  const blob = await res.blob();
  const type = blob.type in EXT ? blob.type : "image/jpeg";
  return new File([blob], fileName(e, type), { type });
}

/** 共有シートに画像ファイルを渡せる端末か（iOS / Android のブラウザ。PC や一部のアプリ内ブラウザは不可） */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  try {
    const probe = new File([new Uint8Array(1)], "probe.jpg", { type: "image/jpeg" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** LINE のアプリ内ブラウザか */
export function isLineBrowser(): boolean {
  return typeof navigator !== "undefined" && / Line\//i.test(navigator.userAgent);
}

/** 今のページを外部のブラウザ（Safari など）で開く URL。LINE はこのクエリで外部ブラウザに渡す */
export function externalBrowserUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.set("openExternalBrowser", "1");
  return url.toString();
}

/** 共有シートを使えない端末向け: 1枚ずつダウンロードさせる */
export async function downloadFiles(files: File[]): Promise<void> {
  for (const file of files) {
    const href = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = href;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 続けて押すとブラウザに間引かれるので、少し間を空ける。URL は読み終わってから捨てる
    await new Promise((r) => setTimeout(r, 400));
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  }
}
