"use client";

import { collection, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ImageVariants } from "@/lib/image";
import type { MentionPerson } from "@/lib/mentions";
import type { ReencodedJpeg } from "@/lib/thumb-guard";
import type { EnqueueItem } from "@/hooks/useUpload";
import type { MediaItem, Post } from "@/types";

/**
 * 「投稿する」を押した時点の投稿（Issue #254）。投稿画面はこれを送信の列（usePostOutbox）に渡して、すぐ閉じる。
 * ★写真は投稿画面で準備が済んでいる★（軽量版の圧縮・小さい版・下絵・動画のポスター）。ここでは送るだけ。
 * ★投稿の ID は送る前に決める★（newPostId）。送信中の投稿と、購読で届いた本物の投稿を、この ID で突き合わせる。
 */
export type DraftItem = {
  id: string;
  file: File;
  /** 端末の中の写真（URL.createObjectURL）。送信中の投稿の表示に使い、入れ替えが済んだら解放する */
  previewUrl: string;
  isVideo: boolean;
  /** 作り直した軽量版（写真だけ。送るのはこれだけ。元の写真 file は GPS 入りのことがある） */
  compressed?: ReencodedJpeg;
  width?: number;
  height?: number;
  variants?: ImageVariants;
  poster?: Promise<ReencodedJpeg | null>;
};

export type PostDraft = {
  postId: string;
  uid: string;
  displayName: string;
  photoURL?: string | null;
  text: string;
  visibleToTags: string[];
  mentioned: MentionPerson[];
  /** 新郎新婦あて（自分のタイムラインには出ない） */
  coupleOnly: boolean;
  items: DraftItem[];
  /** 思い出エピソード（投稿のあとに送る） */
  episode: { theme: string } | null;
};

/** 送信の途中経過。★やり直しのとき、送り終わった写真は送り直さない★（同じ写真が二重に公開バケットに残る） */
export type SendProgress = {
  media: (MediaItem | undefined)[];
  originals: (Omit<EnqueueItem, "postId"> | undefined)[];
  /** createPost を一度でも呼んだか（呼んだなら、やり直しの前に書けていないかを確かめる） */
  createTried: boolean;
};

export function newPostId(): string {
  return doc(collection(db, "posts")).id;
}

export function emptyProgress(draft: PostDraft): SendProgress {
  return { media: draft.items.map(() => undefined), originals: draft.items.map(() => undefined), createTried: false };
}

/** 全体の手順の数（写真・動画ごとに1つ + 投稿のデータの書き込み）。進み具合の線に使う */
export function stepCount(draft: PostDraft): number {
  return draft.items.length + 1;
}

/**
 * 送信中の投稿の見た目（Issue #254）。普通の投稿と同じカードで出すための Post。
 * 写真は端末の中のもの（previewUrl）。storagePath は空なので、表示（media-url.ts）は url をそのまま使う。
 */
export function previewPost(draft: PostDraft): Post {
  return {
    id: draft.postId,
    authorUid: draft.uid,
    authorName: draft.displayName,
    authorPhotoURL: draft.photoURL ?? undefined,
    text: draft.text.trim(),
    media: draft.items.map((p) =>
      p.isVideo
        ? { type: "video", url: p.previewUrl, storagePath: "", alt: p.file.name }
        : {
            type: "image", url: p.previewUrl, storagePath: "", width: p.width, height: p.height, alt: p.file.name,
            ...(p.variants?.placeholder ? { placeholder: p.variants.placeholder } : {}),
          },
    ),
    visibleToTags: draft.visibleToTags,
    hashtags: [],
    mentions: draft.mentioned.map((m) => m.name),
    mentionUids: [],
    status: "visible",
    editedAt: null,
    reactionCount: 0,
    commentCount: 0,
    createdAt: null,
    updatedAt: null,
  };
}
