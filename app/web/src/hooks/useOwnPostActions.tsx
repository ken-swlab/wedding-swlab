"use client";

import { useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import type { Post } from "@/types";
import { useGuestbookData, useGuestbookUpload } from "@/components/guestbook/GuestbookDataProvider";
import { PostOwnerMenu } from "@/components/guestbook/PostOwnerMenu";
import { PostEditor } from "@/components/guestbook/PostEditor";

/**
 * 自分の投稿の「⋯」（編集・削除）を、タイムラインと投稿の詳細に出す（Issue #202）。マイページと同じ動き。
 *
 *   actionsFor(post) … PostCard の actions に渡す。★自分の投稿（authorUid === user.uid）で、表示中のものにだけ★
 *                      「⋯」を返す。他人の投稿・非表示の投稿には何も出さない（管理者が他人の投稿を消すのは管理画面）。
 *   editor           … 編集画面。★PostCard の外（一覧の兄弟）に置く★ PostEditor は Portal で出すが、React の木では
 *                      置いた場所の親へイベントが伝わる。カードの中に置くと、編集画面のタップでカードの詳細が開く。
 *
 * 削除のあと: 送信待ちに残っている高画質版はもう送らない（upload.discard）。一覧は購読で消えるが、
 *   「もっと見る」で読んだ分は残るので syncPost で外す。onDeleted は呼び出し側の後始末（詳細なら閉じる）。
 */
export function useOwnPostActions(user: User, onDeleted?: (post: Post) => void): {
  actionsFor: (post: Post) => ReactNode | undefined;
  editor: ReactNode;
} {
  const upload = useGuestbookUpload();
  const { syncPost } = useGuestbookData();
  const [editing, setEditing] = useState<Post | null>(null);

  const actionsFor = (post: Post) =>
    post.authorUid === user.uid && post.status === "visible" ? (
      <PostOwnerMenu
        post={post}
        onEdit={() => setEditing(post)}
        onDeleted={() => {
          void upload.discard(post.id);
          void syncPost(post.id);
          onDeleted?.(post);
        }}
      />
    ) : undefined;

  const editor = editing ? (
    <PostEditor
      key={editing.id}
      post={editing}
      user={user}
      onClose={() => setEditing(null)}
      onSaved={() => void syncPost(editing.id)}
    />
  ) : null;

  return { actionsFor, editor };
}
