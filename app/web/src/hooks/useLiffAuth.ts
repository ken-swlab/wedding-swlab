"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signInWithCustomToken, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";

export type LiffPhase =
  | "booting"     // Firebase の永続セッション復元待ち
  | "liff-init"   // liff.init() 実行中
  | "line-login"  // LINE のログイン画面へリダイレクト中
  | "exchanging"  // カスタムトークン交換中
  | "ready"
  | "error";

const LOGIN_ATTEMPT_KEY = "liff_login_attempted";

// プライベートモード等で throw することがあるので必ず包む
function session(op: "get" | "set" | "clear"): string | null {
  try {
    if (op === "get") return sessionStorage.getItem(LOGIN_ATTEMPT_KEY);
    if (op === "set") sessionStorage.setItem(LOGIN_ATTEMPT_KEY, "1");
    if (op === "clear") sessionStorage.removeItem(LOGIN_ATTEMPT_KEY);
  } catch {
    /* 使えない環境ではループ防止を諦める */
  }
  return null;
}

export function useLiffAuth() {
  const [phase, setPhase] = useState<LiffPhase>("booting");
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  const runLiffFlow = useCallback(async () => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      setMessage("NEXT_PUBLIC_LIFF_ID が設定されていません");
      setPhase("error");
      return;
    }

    try {
      setPhase("liff-init");

      // ★SSR で評価されないよう動的 import する★
      const liff = (await import("@line/liff")).default;
      await liff.init({ liffId });

      if (!liff.isLoggedIn()) {
        // ★無限リダイレクト対策★
        // Cookie がブロックされている等で戻ってきても未ログインのままの場合、
        // 2回目はリダイレクトせずエラーを見せる。
        if (session("get")) {
          session("clear");
          setMessage(
            "LINE ログインを完了できませんでした。LINE アプリ内から開き直すか、ブラウザの Cookie 設定をご確認ください。",
          );
          setPhase("error");
          return;
        }
        session("set");
        setPhase("line-login");
        liff.login({ redirectUri: window.location.href });
        return; // ここでページごと遷移する
      }

      session("clear");

      const idToken = liff.getIDToken();
      if (!idToken) {
        // ほぼ確実に LIFF アプリの openid スコープ漏れ
        setMessage(
          "LINE の ID トークンを取得できませんでした。LIFF アプリのスコープに openid が含まれているかご確認ください。",
        );
        setPhase("error");
        return;
      }

      setPhase("exchanging");
      const res = await fetch("/api/auth/line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const data = (await res.json()) as { ok?: boolean; customToken?: string; message?: string };

      if (!res.ok || !data.ok || !data.customToken) {
        setMessage(data.message ?? "ログインに失敗しました");
        setPhase("error");
        return;
      }

      // 成功すると onAuthStateChanged が発火して phase が ready になる
      await signInWithCustomToken(auth, data.customToken);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "初期化に失敗しました");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);

      if (u) {
        // 既にセッションが残っていれば LIFF を経由せず即座に入れる
        setPhase("ready");
        return;
      }
      if (started.current) return;
      started.current = true;
      void runLiffFlow();
    });
  }, [runLiffFlow]);

  const retry = useCallback(() => {
    setMessage(null);
    setPhase("booting");
    void runLiffFlow();
  }, [runLiffFlow]);

  return { phase, user, message, retry };
}
