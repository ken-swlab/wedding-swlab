"use client";

import { useEffect, useRef } from "react";

/**
 * 「戻る」（iPhone の左端からのスワイプ・ブラウザの戻る）の履歴の決まり（Issue #273）。
 *
 * 1. 重なる画面は、戻るで閉じる（useBackToClose）
 *    写真の全画面・投稿画面（シート）・公開範囲の選択・説明のシートは、開くときに同じ URL の履歴を1つ積み、
 *    戻るでその履歴が外れたら閉じる。× やキャンセルで閉じたときは、積んだ履歴を戻して残さない。
 *    投稿の詳細は、以前から URL（/guestbook/posts/{id}）の履歴で同じ動きをしている（PostDetailSheet）。
 * 2. タブの一番下で戻っても、招待状やログインの画面へ行かない（useHistoryFloor）
 *    タブの切り替えは履歴に積まない（router.replace）ので、タブの画面の1つ前は、ゲストブックの外
 *    （招待状・LINE のログイン）になる。タブの画面では「床」の履歴を1つ下に置き、戻るでそこに来たら、
 *    すぐに1つ進めて（history.forward）元の画面に戻す。戻る操作は何も起こさない。
 *
 * ★床に来たら forward で戻す（URL を積み直さない）★ popstate を受け取る順番は、このファイルが読まれた時期で変わる
 *   （ゲストブックの部品は、Next.js の router が popstate を登録したあとに読まれることが多い）。Next.js が先に床の画面
 *   （最初に開いたタブ）を描いても、forward で Next.js 自身が元の画面に戻すので、どちらの順番でも正しく戻る。
 *   先に受け取れたときは Next.js に渡さない（stopImmediatePropagation）ので、床の画面は描かれない。
 * ★pushState / replaceState は Next.js の router と連動する★（docs: Native History API）Next.js が自分の状態を足して保存する。
 * ★積む URL は今の URL と同じ★ 共有・再読み込みの URL は変わらない。
 */

type Overlay = { depth: number; url: string; close: () => void };

/** 開いている重なる画面（下から順）。depth は history.state.__overlay と同じ */
const stack: Overlay[] = [];
let installed = false;
/** × などで閉じて、積んだ履歴を戻す予定（次の一瞬で戻す。そのあいだに同じ深さで開き直したら取り消す） */
let pendingBack: { depth: number; url: string; timer: ReturnType<typeof setTimeout> } | null = null;
// 読み込み時に登録する（上の★参照）
if (typeof window !== "undefined") install();

type HistoryMarks = { __overlay?: number; __floorBase?: boolean; __floor?: boolean };
function marks(): HistoryMarks {
  const s = window.history.state as HistoryMarks | null;
  return s && typeof s === "object" ? s : {};
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener(
    "popstate",
    (e) => {
      const m = marks();
      // タブの一番下（床）まで戻った: 1つ進めて、元の画面に戻す（上の★参照）
      if (m.__floorBase) {
        e.stopImmediatePropagation();
        window.history.forward();
        return;
      }
      // 重なる画面の履歴が外れた: 外れた分を上から閉じる
      const depth = typeof m.__overlay === "number" ? m.__overlay : 0;
      while (stack.length > 0 && stack[stack.length - 1].depth > depth) stack.pop()?.close();
    },
    { capture: true },
  );
}

/**
 * 重なる画面を、戻るで閉じられるようにする。open が true の間だけ履歴を1つ積む。
 * close … 戻るで閉じるときに呼ぶ（open を false にする）。
 * ★× などで閉じたとき（open が false になったとき）は、積んだ履歴を戻す★ ただし、そのあいだに URL が変わっていたら
 *   （画面の中のリンクで別の画面へ移った）、戻さない（移った先を取り消してしまう）。
 */
export function useBackToClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    install();
    const depth = stack.length + 1;
    const url = window.location.href;
    const entry: Overlay = { depth, url, close: () => closeRef.current() };
    stack.push(entry);
    // ★閉じた直後に同じ深さで開き直したら、積んだ履歴をそのまま使う★（開発時の effect の二重実行・すばやい開き直し）
    //   戻す（back）と積む（push）が重なると、ブラウザが戻し先を取り違え、開いたばかりの画面が閉じてしまう
    if (pendingBack && pendingBack.depth === depth && pendingBack.url === url) {
      clearTimeout(pendingBack.timer);
      pendingBack = null;
    } else {
      window.history.pushState({ __overlay: depth }, "", url);
    }
    return () => {
      const i = stack.indexOf(entry);
      if (i < 0) return; // 戻るで閉じた（履歴はもう外れている）
      stack.splice(i, 1);
      if (pendingBack) clearTimeout(pendingBack.timer);
      const timer = setTimeout(() => {
        pendingBack = null;
        if (window.location.href === url && marks().__overlay === depth) window.history.back();
      }, 0);
      pendingBack = { depth, url, timer };
    };
  }, [open]);
}

/**
 * タブの画面（ゲストブック・ご案内）で呼ぶ。enabled の間、床の履歴を1つ下に置く（このページで1回だけ）。
 * url … 今の画面の URL（パスとクエリ）。今の URL と同じときだけ床を置く（裏に残った前の画面の effect では置かない）。
 */
export function useHistoryFloor(enabled: boolean, url: string) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    install();
    if (url !== window.location.pathname + window.location.search) return;
    const m = marks();
    // すでに床の上（積み直したあと・タブを replace で切り替えたあと）なら、何もしない
    //   ★タブの切り替え（router.replace）は __floor の印を消す★ そのときは、床の上にいるかを floorReady で見る
    if (m.__floor || m.__overlay || floorReady) return;
    floorReady = true;
    window.history.replaceState({ ...m, __floorBase: true }, "", window.location.href);
    window.history.pushState({ __floor: true }, "", window.location.href);
  }, [enabled, url]);
}
/**
 * このページ（読み込み）で、床をもう置いたか。タブの切り替えは router.replace なので、床の上の1枚が入れ替わるだけで、
 * 床はそのまま下に残る（置き直さない）。投稿の詳細など、床の上に積んだ画面から戻ってきたときも置き直さない。
 */
let floorReady = false;
