"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection, collectionGroup, limit, onSnapshot, orderBy, query, where,
  type FirestoreError, type QueryDocumentSnapshot, type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toPost } from "@/lib/posts";
import {
  COMMENT_LANES, COMMENT_WINDOW, MAX_FLOWING, MOSAIC_SIZE,
  POST_WINDOW, SCREEN_TAGS,
} from "@/config/screen";
import type { Post } from "@/types";

export type ScreenPhoto = {
  id: string;
  postId: string;
  src: string;
  authorName: string;
  /** 背景モザイクのセル番号 */
  slot: number;
};

export type ScreenMessage = {
  id: string;
  text: string;
  authorName: string;
  kind: "post" | "comment";
  lane: number;
};

function photosOf(post: Post): ScreenPhoto[] {
  return post.media
    .filter((m) => m.type === "image")
    .map((m, i) => ({
      id: `${post.id}:${i}`,
      postId: post.id,
      // ★原本があればそちらを投影する★ 二段階アップロードの狙いがここ
      src: m.originalUrl ?? m.url,
      authorName: post.authorName,
      slot: -1,
    }));
}

export function useScreenData() {
  const [cells, setCells] = useState<(ScreenPhoto | null)[]>(() =>
    Array(MOSAIC_SIZE).fill(null),
  );
  const [queue, setQueue] = useState<ScreenPhoto[]>([]);
  const [spotlight, setSpotlight] = useState<ScreenPhoto | null>(null);
  const [messages, setMessages] = useState<ScreenMessage[]>([]);
  const [error, setError] = useState<FirestoreError | null>(null);
  const [ready, setReady] = useState(false);

  const seen = useRef(new Set<string>());
  const cursor = useRef(0);
  const lastLane = useRef(-1);

  const pushMessage = useCallback(
    (id: string, text: string, authorName: string, kind: ScreenMessage["kind"]) => {
      const body = text.trim();
      if (!body) return;

      // 直前と同じレーンを避けてランダムに割り当てる
      let lane = Math.floor(Math.random() * COMMENT_LANES);
      if (lane === lastLane.current) lane = (lane + 1) % COMMENT_LANES;
      lastLane.current = lane;

      setMessages((m) =>
        [...m, { id, text: body.slice(0, 60), authorName, kind, lane }].slice(-MAX_FLOWING),
      );
    },
    [],
  );

  const retireMessage = useCallback((id: string) => {
    setMessages((m) => m.filter((x) => x.id !== id));
  }, []);

  // ---- 投稿の購読 -------------------------------------------
  useEffect(() => {
    if (SCREEN_TAGS.length === 0) return;

    const q = query(
      collection(db, "posts"),
      where("status", "==", "visible"),
      where("visibleToTags", "array-contains-any", SCREEN_TAGS),
      orderBy("createdAt", "desc"),
      limit(POST_WINDOW),
    );

    let first = true;

    return onSnapshot(
      q,
      (snap) => {
        const fresh: ScreenPhoto[] = [];

        for (const ch of snap.docChanges()) {
          const post = toPost(ch.doc as QueryDocumentSnapshot<DocumentData>);
          const photos = photosOf(post);

          if (ch.type === "added") {
            for (const p of photos) {
              // 再接続時の再配信で同じ写真が飛んでこないようにする
              if (seen.current.has(p.id)) continue;
              seen.current.add(p.id);
              fresh.push(p);
            }
            if (!first) pushMessage(`p:${post.id}`, post.text, post.authorName, "post");
          } else if (ch.type === "modified") {
            // 原本のアップロード完了で src が高画質に差し替わる
            const byId = new Map(photos.map((p) => [p.id, p.src]));
            setCells((c) =>
              c.map((x) => (x && byId.has(x.id) ? { ...x, src: byId.get(x.id)! } : x)),
            );
          }
        }

        if (first) {
          first = false;
          // 初回ロードはアニメーションさせず、そのまま背景に敷き詰める
          const initial = fresh.slice(0, MOSAIC_SIZE).reverse();
          const next: (ScreenPhoto | null)[] = Array(MOSAIC_SIZE).fill(null);
          initial.forEach((p, i) => {
            next[i] = { ...p, slot: i };
          });
          cursor.current = initial.length;
          setCells(next);
          setReady(true);
          return;
        }

        if (fresh.length > 0) setQueue((q0) => [...q0, ...fresh]);
      },
      setError,
    );
  }, [pushMessage]);

  // ---- コメントの購読（全投稿横断） --------------------------
  useEffect(() => {
    if (SCREEN_TAGS.length === 0) return;

    const q = query(
      collectionGroup(db, "comments"),
      where("visibleToTags", "array-contains-any", SCREEN_TAGS),
      orderBy("createdAt", "desc"),
      limit(COMMENT_WINDOW),
    );

    let first = true;

    return onSnapshot(
      q,
      (snap) => {
        if (first) {
          // 過去のコメントが一斉に流れ出すのを防ぐ
          first = false;
          return;
        }
        for (const ch of snap.docChanges()) {
          if (ch.type !== "added") continue;
          const d = ch.doc.data();
          pushMessage(`c:${ch.doc.id}`, d.text ?? "", d.authorName ?? "ゲスト", "comment");
        }
      },
      setError,
    );
  }, [pushMessage]);

  // ---- スポットライトの順送り --------------------------------
  useEffect(() => {
    if (spotlight || queue.length === 0) return;

    const [next, ...rest] = queue;
    // 着地先のセルをこの時点で予約する（飛んでいく先が確定していないと
    // アニメーションの終点を計算できないため）
    const slot = cursor.current % MOSAIC_SIZE;
    cursor.current += 1;

    setSpotlight({ ...next, slot });
    setQueue(rest);
  }, [spotlight, queue]);

  /** ヒーローのアニメーションが終わったら呼ぶ */
  const settle = useCallback(() => {
    setSpotlight((cur) => {
      if (cur) {
        setCells((c) => {
          const n = [...c];
          n[cur.slot] = cur;
          return n;
        });
      }
      return null;
    });
  }, []);

  return { cells, spotlight, settle, messages, retireMessage, ready, error, queued: queue.length };
}
