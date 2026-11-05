"use client";

import { useEffect } from "react";
import { signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { LINE_CHECK_DELAY_MS } from "@/config/startup";

/**
 * ログインの残っている人の、LINE のアカウントの確認を後ろで行う（Issue #250）。
 *
 * ★起動では LINE の確認（liff.init）を待たない★ Firebase のログインが端末に残っていれば、ゲストの画面はすぐ出す
 *   （(guest)/layout は Firebase のログインだけを見る。liff.init と独自トークンの取り直しは、最初の画面のあとに回す）。
 * ★ずれていたら、今の流れでログインし直す★ LINE アプリの中で開いていて、LINE のアカウント（ID トークンの sub）が
 *   ログイン中の uid（line:<sub>）と違えば、サインアウトする。(guest)/layout が招待状（/invitation）へ移し、そこから
 *   いつもどおり LINE でログインし直す（別の LINE アカウントで開いた端末で、前の人のまま使い続けないように）。
 * ★LINE アプリの中で開いたときだけ★ ふつうのブラウザでは LINE の SDK を読まない（読み込みを増やさない）。
 *   開発用ログイン（uid が line: で始まらない）にも何もしない。確かめられなかったとき（通信の失敗・LIFF の範囲外）は
 *   何もしない（サインアウトしない）。
 */
export function useLineAccountCheck(user: User | null) {
  useEffect(() => {
    if (!user || !user.uid.startsWith("line:")) return;
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId || !/\bLine\//i.test(navigator.userAgent)) return;
    let cancelled = false;
    // 最初の画面（投稿・写真）の読み込みと取り合わないよう、少し待ってから
    const timer = window.setTimeout(async () => {
      try {
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId });
        if (cancelled || !liff.isLoggedIn()) return;
        const sub = liff.getDecodedIDToken()?.sub;
        if (sub && `line:${sub}` !== user.uid && auth.currentUser?.uid === user.uid) {
          console.warn("[line-check] LINE のアカウントがログイン中の人と違うため、ログインし直します");
          await signOut(auth);
        }
      } catch (e) {
        console.warn("[line-check] LINE のアカウントを確かめられませんでした（このまま続けます）", e);
      }
    }, LINE_CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [user]);
}
