"use client";

import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { makePosterPlaceholder } from "@/lib/image";
import { extOf, reserveOriginalKey, uploadThumb, uploadVariants, uploadVideo } from "@/lib/media";
import { createPost } from "@/lib/posts";
import type { MediaItem } from "@/types";
import type { PostDraft, SendProgress } from "@/lib/post-draft";

/*
 * ★送信の処理は、送るときに読む★（usePostOutbox が import() する。Issue #250 の「最初の JS を小さくする」）
 *   画像の処理・アップロードの部品を、タイムラインの最初の JS に入れない。型と見た目の部品は lib/post-draft.ts。
 */

/**
 * 送る（今までの Composer の第1段・第2段と同じ処理）: 軽量版・小さい版を送る → 投稿のデータを書く。
 * ★処理の中身は変えない★ 順番・キー・バケット・下絵の扱いは Composer にあったときと同じ。
 * 途中で失敗したら投げる。progress に、そこまでに済んだ分が残る（次に呼ぶと続きから）。
 * onStep: 手順が1つ済むたびに、済んだ数を知らせる。
 */
export async function sendDraft(draft: PostDraft, progress: SendProgress, onStep: (done: number) => void): Promise<void> {
  let done = progress.media.filter(Boolean).length;
  onStep(done);

  for (const [i, p] of draft.items.entries()) {
    if (progress.media[i]) continue;
    const ext = extOf(p.file);

    if (p.isVideo) {
      // 動画は圧縮せず1段階で公開バケットへ送る（従来どおり）
      const v = await uploadVideo(p.file, ext);
      // 一覧では動画本体を読まずに1枚目の画像を出す（Issue #251。作れなければ無し）
      const poster = await (p.poster ?? Promise.resolve(null));
      const extra = poster ? await uploadVariants(v.key, { poster }) : {};
      // 下絵（Issue #253）はポスターから作る。★undefined を入れない★（Firestore は undefined の値を拒む）
      const placeholder = poster ? await makePosterPlaceholder(poster) : null;
      progress.media[i] = { type: "video", url: v.url, storagePath: v.key, alt: p.file.name, ...extra, ...(placeholder ? { placeholder } : {}) };
    } else {
      // ★軽量版は必ず canvas で作り直したものだけを送る★
      //   元の写真（p.file）は GPS 入りのことがあり、公開バケットは Worker を通らない（Issue #66）。
      if (!p.compressed) throw new Error("写真の準備ができていません。写真を選び直してください");
      // ★キーもバケットもサーバーが決める★ クライアントはパスを指定できない
      const t = await uploadThumb(p.compressed);
      // 原本は後日、非公開バケットへ送る。ここではキーだけ確保する（署名は寿命が短いので保存しない）
      const originalKey = await reserveOriginalKey(ext, p.file.type || "image/jpeg");
      // 一覧用の小さい版（Issue #251）。送れなかった版は入らず、表示は軽量版に落ちる
      const variants = p.variants ? await uploadVariants(t.key, p.variants) : {};
      progress.media[i] = {
        type: "image",
        url: t.url,
        storagePath: t.key,
        width: p.width,
        height: p.height,
        alt: p.file.name,
        originalStatus: "pending",
        ...variants,
        // 写真の下絵（Issue #253。作れなかったら入れない）
        ...(p.variants?.placeholder ? { placeholder: p.variants.placeholder } : {}),
      };
      progress.originals[i] = {
        thumbPath: t.key,
        originalPath: originalKey,
        fileName: p.file.name,
        bytes: p.file.size,
        file: p.file,
      };
    }
    onStep(++done);
  }

  // --- 投稿のデータ（これが本体）---
  // ★やり直しのときは、前回の書き込みが届いていないかを先に確かめる★
  //   応答だけが届かなかった場合、もう一度書くと「既にある投稿の上書き」になり Rules に断られる。
  if (progress.createTried && (await postExists(draft.postId))) {
    onStep(++done);
    return;
  }
  progress.createTried = true;
  await createPost({
    id: draft.postId,
    uid: draft.uid,
    displayName: draft.displayName,
    photoURL: draft.photoURL,
    text: draft.text,
    media: progress.media.filter((m): m is MediaItem => !!m),
    visibleToTags: draft.visibleToTags,
    mentioned: draft.mentioned,
  });
  onStep(++done);
}

/** 自分の投稿が書けているか。★無い投稿の get は Rules が断る★（resource != null）ので、断られたら「無い」 */
async function postExists(id: string): Promise<boolean> {
  try {
    return (await getDoc(doc(db, "posts", id))).exists();
  } catch {
    return false;
  }
}

