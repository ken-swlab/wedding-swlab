---
paths:
  - "app/web/src/lib/{media,media-url,upload-queue,image,r2-server,original-status}.ts"
  - "app/web/src/hooks/useUpload.ts"
  - "app/web/src/components/guestbook/**"
  - "app/web/src/components/screen/**"
  - "app/web/src/app/api/{uploads,hooks,faces}/**"
  - "app/web/src/config/limits.ts"
  - "app/web/next.config.ts"
  - "infra/workers/**"
---

# 写真・動画

## 二段階アップロード
1. **投稿時（軽量版）**: ブラウザで長辺 1920px・JPEG 品質 0.8・1.5MB 以下に縮める（`src/lib/image.ts`。圧縮ライブラリの Worker は `/vendor/` から自前配信し、パッケージを上げたら `cd app/web && node scripts/vendor-sync.mjs`）→ `presign {kind:"thumb"}` → 公開バケットへ PUT。原本はキーの予約だけ（`reserveOnly`）。署名付き URL は保存しない。
2. **あとから手動（原本）**: 端末の IndexedDB（`src/lib/upload-queue.ts`）に置いた原本を `presign {kind:"original"}` → 非公開バケットへ EXIF 付きのまま PUT → `attachOriginal`（トランザクション）。
3. **Worker（`infra/workers/exif-stripper`、2分ごと）**: EXIF を落として公開バケットへ複製（`Cache-Control: public, max-age=31536000, immutable`）→ webhook で `originalStatus` を `published` か `skipped` にする。

- 原本の状態: `pending | uploaded | published | skipped | failed | unavailable`。状態を足すなら `MediaGrid` の `BADGE` と `MediaLightbox` の `ORIGINAL_NOTE` を両方更新する（漏れると型エラーになる作り）。
- 原本として受け付けるのは jpeg / png / webp だけ（Worker の `formats.ts` が処理できるもの。それ以外は presign が拒否する）。Worker も HEIC・HEIF・AVIF は公開せず隔離する。
- 1投稿のメディアは最大 4 件。上限: 原本 24MiB（`MAX_ORIGINAL_BYTES`）、軽量版と動画 8MiB（`MAX_THUMB_BYTES`）。動画は圧縮せず `kind:"thumb"` で1回だけ送る。
- IndexedDB の `DB_VERSION` を上げない（ゲストの端末に残った未送信の原本がすべて消える）。原本のバイト列は Blob ではなく ArrayBuffer で持つ（WebKit の不具合対策）。

## キーとバケット
- 軽量版 `u/{uid}/t/{uuid}.{ext}`（公開バケット `wedding-media`）、原本 `u/{uid}/o/{uuid}.{ext}`（非公開バケット `wedding-originals`）。バケットはサーバーが `kind` から決め、クライアントには選ばせない。
- 原本と Worker のマーカー（`_linked/`・`_pending/`・`_failed/`・`_skipped/`）を消さない。Worker は原本を移動も削除もしない。
- 片方だけ変えない: `MAX_ORIGINAL_BYTES` ⇔ `wrangler.toml` の `MAX_BYTES`、webhook の `KEY_RE` ⇔ Worker の `ORIGINAL_KEY_RE`、Worker の `WEBHOOK_SECRET` ⇔ Vercel の `WORKER_WEBHOOK_SECRET`。

## 表示
- URL は `src/lib/media-url.ts` だけで作る: `thumbSrc`（一覧）、`bestSrc`（拡大・投影。公開済みなら原本）、`originalSrc`（`published` のときだけ）、`keyUrl`、`rehost`（旧ドメインの URL の付け替え）。Firestore の `url` / `originalUrl` を直接使わない。
- `next/image` はすべて `unoptimized`（next.config.ts）。軽くしたいときは `/_next/image` を戻さず、アップロード時に小さい版を作る方向で考える。
- `/screen` の写真は意図して `<img>`（遅延と画質のため）。
- 配信元のホストを足すときは `src/lib/csp.ts` の `img-src` / `media-src` に足す。

## 顔検出
- 投稿のあと `/api/faces/detect {postId}` を待たずに呼ぶ。サーバーは 202 を返してから Rekognition で処理する。
- 失敗時に posts へ書くのは定型文だけ（posts はゲストも読める）。詳細は `console.error` で Sentry へ。
- 照合の閾値（検出の信頼度 90 以上・類似度 80）を変えるときは、誤判定時の影響（別人に写真が紐付く）を PR に書く。
