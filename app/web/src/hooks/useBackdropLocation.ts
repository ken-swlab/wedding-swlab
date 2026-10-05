"use client";

import { useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { postIdFromPath } from "@/config/guestbook";

/**
 * /guestbook 以下の画面が見る URL（パスとクエリ）。
 *
 * ★投稿の詳細シートを開いている間は、開く前の URL を返し続ける★
 *   シートは history.pushState で URL だけを /guestbook/posts/{id} に変え、
 *   タイムラインの上に重ねて出す（PostDetailSheet の★参照）。素の usePathname /
 *   useSearchParams を読むと、シートの裏でタイムラインが「検索なし・詳細画面」として
 *   描き直され、展開中にカードの位置がずれたり、検索結果が消えたりする。
 *
 * 詳細画面の URL を直接開いたとき（共有・リロード）は、開く前の URL が無いので
 * 今の URL をそのまま返す。
 */
export function useBackdropLocation(): { pathname: string; params: URLSearchParams } {
  const livePath = usePathname();
  const liveQuery = useSearchParams().toString();
  const [kept, setKept] = useState({ pathname: livePath, query: liveQuery });

  const onPost = postIdFromPath(livePath) !== null;
  if (!onPost && (kept.pathname !== livePath || kept.query !== liveQuery)) {
    setKept({ pathname: livePath, query: liveQuery });
  }

  const pathname = onPost ? kept.pathname : livePath;
  const query = onPost ? kept.query : liveQuery;
  const params = useMemo(() => new URLSearchParams(query), [query]);
  return { pathname, params };
}
