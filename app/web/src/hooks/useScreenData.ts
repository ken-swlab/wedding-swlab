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
import { bestSrc } from "@/lib/media-url";

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
      src: bestSrc(m),
      authorName: post.authorName,
      slot: -1,
    }));
}

/**
 * removed で届いたドキュメントが、「新しいものに押し出されて購読の窓（createdAt の新しい順に limit 件）から
 * 外れただけ」か。そうでなければ、削除された・条件から外れた（非表示など）ということ。
 *
 * ★窓から押し出されるのは、いつも残っているどれよりも古いもの★
 *   残っている中に自分より古いものが1件でもあれば、押し出されたのではなく消えている。
 *   窓が埋まっていない（残りが limit 件に満たない）ときも、押し出しは起きないので消えている。
 *   removed の時点では status などの中身は消える前のままなので、中身では削除を見分けられない。
 */
function pushedOut(
  removed: QueryDocumentSnapshot<DocumentData>,
  remaining: readonly QueryDocumentSnapshot<DocumentData>[],
  windowSize: number,
): boolean {
  const at = (d: QueryDocumentSnapshot<DocumentData>) =>
    (d.data().createdAt as { toMillis?: () => number } | null)?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
  const mine = at(removed);
  return remaining.length >= windowSize && remaining.every((d) => at(d) >= mine);
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

  /** 非表示にされた投稿を、背景・待ち行列・スポットライト・流れている文字から取り除く */
  const hidePost = useCallback(
    (postId: string) => {
      setCells((c) => c.map((x) => (x && x.postId === postId ? null : x)));
      setQueue((q) => q.filter((x) => x.postId !== postId));
      setSpotlight((s) => (s && s.postId === postId ? null : s));
      retireMessage(`p:${postId}`);
    },
    [retireMessage],
  );

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
          } else if (ch.type === "removed" && (post.status === "hidden" || !pushedOut(ch.doc, snap.docs, POST_WINDOW))) {
            // ★管理者が非表示にした投稿・本人が削除した投稿は、すでに映っている分も消す★
            //   （/api/admin/posts/visibility、/api/posts/[id]。Issue #94）
            //   古くなって POST_WINDOW から外れただけの投稿も removed で届くので、見分ける（pushedOut の★参照）。
            hidePost(post.id);
          } else if (ch.type === "modified") {
            // 原本のアップロード完了で src が高画質に差し替わる
            const byId = new Map(photos.map((p) => [p.id, p.src]));
            // ★本人が編集で外した写真は、すでに映っている分も消す★（Issue #94）
            const gone = (x: ScreenPhoto | null) => !!x && x.postId === post.id && !byId.has(x.id);
            setCells((c) =>
              c.map((x) => (gone(x) ? null : x && byId.has(x.id) ? { ...x, src: byId.get(x.id)! } : x)),
            );
            setQueue((q0) => q0.filter((x) => !gone(x)));
            setSpotlight((sp) => (gone(sp) ? null : sp));
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
  }, [pushMessage, hidePost]);

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
          // 親の投稿を非表示にすると、コメントは visibleToTags が空になってクエリから外れる。流れている分も消す
          // 投稿ごと削除されたコメントも同じ（Issue #94）。古くなって窓から外れただけのものは流したままにする
          if (ch.type === "removed" && (ch.doc.data().hidden === true || !pushedOut(ch.doc, snap.docs, COMMENT_WINDOW))) {
            retireMessage(`c:${ch.doc.id}`);
            continue;
          }
          if (ch.type !== "added") continue;
          const d = ch.doc.data();
          pushMessage(`c:${ch.doc.id}`, d.text ?? "", d.authorName ?? "ゲスト", "comment");
        }
      },
      setError,
    );
  }, [pushMessage, retireMessage]);

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
