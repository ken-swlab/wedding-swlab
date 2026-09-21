"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { postJson } from "@/lib/api-client";
import { useGuestSession } from "@/hooks/useGuestSession";
import { useAdminGuests } from "@/hooks/useAdminGuests";
import { adminName } from "@/lib/names";
import { compareGuests } from "@/lib/roster";
import { themeDef } from "@/config/episodes";
import AiTestChat from "@/components/admin/AiTestChat";
import VoiceTuner from "@/components/admin/VoiceTuner";

const STORAGE_KEY = "ai-test-base-prompt";

const DEFAULT_PROMPT = `あなたは新郎です。一人称は「俺」。
明るくフランクに、友達と話すみたいに返してください。
披露宴の会場で立ち話をしている感覚です。短く軽快に。
ゲストをいじったり、照れ隠しでふざけたりするのは大歓迎です。`;

type Turn = { role: "user" | "model"; text: string };

type DebugEpisode = {
  id: string; title: string; period: string;
  theme: string; isPersonal: boolean; content: string;
};
type DebugInfo = {
  callName: string;
  tagLabels: string;
  aiMemo: string;
  episodes: DebugEpisode[];
  systemInstruction: string;
  model: string;
};

export default function AiTestPage() {
  const { user, isAdmin, loading: authLoading } = useGuestSession();
  const { rows } = useAdminGuests(isAdmin);

  const [basePrompt, setBasePrompt] = useState(DEFAULT_PROMPT);
  const [guestUid, setGuestUid] = useState("");
  const [history, setHistory] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<DebugInfo | null>(null);
  const [usage, setUsage] = useState<{ prompt: number; output: number } | null>(null);

  /**
   * AiTestChat に渡す ID トークン取得関数。
   * useGuestSession の user は Firebase の User なので getIdToken() を持つ。
   * 型が確定したら `return user.getIdToken()` に簡略化してよい。
   */
  const getIdToken = useCallback(async (): Promise<string> => {
    const u: { getIdToken?: () => Promise<string> } | null = user ?? null;
    if (!u?.getIdToken) {
      throw new Error("認証トークンを取得できませんでした。再ログインしてください。");
    }
    return u.getIdToken();
  }, [user]);
  const [showPrompt, setShowPrompt] = useState(false);

  // チューニング内容がリロードで消えないようにする
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setBasePrompt(saved);
    } catch { /* プライベートモード等では諦める */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, basePrompt); } catch { /* 同上 */ }
  }, [basePrompt]);


  const guests = useMemo(
    () => rows.filter((r) => r.tags.length > 0).sort(compareGuests),
    [rows],
  );
  const selected = useMemo(
    () => guests.find((g) => g.uid === guestUid) ?? null,
    [guests, guestUid],
  );

  /** ゲストを選んだ時点で、Gemini を叩かずに文脈だけ取りに行く */
  const loadContext = useCallback(async (uid: string, prompt: string) => {
    if (!uid) { setDebug(null); return; }
    setError(null);
    try {
      const r = await postJson<{ debug: DebugInfo }>("/api/admin/ai-test", {
        guestUid: uid, preview: true, basePrompt: prompt, message: "",
      });
      setDebug(r.debug ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "文脈を取得できませんでした");
      setDebug(null);
    }
  }, []);

  useEffect(() => {
    if (guestUid) void loadContext(guestUid, basePrompt);
    setHistory([]);
    setUsage(null);
    // basePrompt の変更では読み直さない（文脈の中身は変わらないため）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestUid, loadContext]);


  if (authLoading) {
    return <main className="min-h-screen bg-stone-50 p-8"><div className="h-32 animate-pulse rounded-2xl bg-stone-200/60" /></main>;
  }
  if (!user || !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8">
        <p className="text-sm text-stone-600">管理者専用ページです</p>
      </main>
    );
  }

  const panel = "flex min-h-0 flex-col rounded-xl border border-stone-200 bg-white";
  const panelHead = "shrink-0 border-b border-stone-100 px-3 py-2 text-xs font-semibold text-stone-500";

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-[1700px] px-4 py-6">
        <header className="mb-4">
          <Link href="/admin" className="text-xs text-stone-400 hover:text-stone-700">
            ← ゲスト管理に戻る
          </Link>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-serif text-xl text-stone-900">AI シミュレーター</h1>
              <p className="mt-1 text-sm text-stone-500">
                ベース人格とゲスト固有の文脈を掛け合わせて、当日の会話を試せます。
              </p>
            </div>
            {debug && (
              <div className="flex items-center gap-3 text-[11px] text-stone-400">
                <span className="rounded-full bg-stone-100 px-2 py-1 font-mono">{debug.model}</span>
                {usage && (
                  <span className="tabular-nums">
                    in {usage.prompt} / out {usage.output} tok
                  </span>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[300px_340px_1fr]"
             style={{ height: "calc(100dvh - 170px)" }}>

          {/* ================= 左: ベース人格 ================= */}
          <section className={panel}>
            <div className={panelHead}>ベース人格</div>
            <textarea
              value={basePrompt}
              onChange={(e) => setBasePrompt(e.target.value)}
              maxLength={4000}
              spellCheck={false}
              className="min-h-0 flex-1 resize-none bg-transparent p-3 text-xs leading-relaxed text-stone-800 outline-none text-gray-900 placeholder:text-gray-400"
            />
            <div className="shrink-0 border-t border-stone-100 p-2">
              <p className="mb-1.5 px-1 text-[10px] leading-relaxed text-stone-400">
                「作り話をしない」「範囲外の話をしない」などの制約は
                ここでは編集できません。サーバー側で固定しています。
              </p>
              <button type="button" onClick={() => setBasePrompt(DEFAULT_PROMPT)}
                className="w-full rounded-lg border border-stone-200 py-1.5 text-xs text-stone-500 hover:bg-stone-50">
                初期値に戻す
              </button>
            </div>
            {/* 3. Voice AI チューニング（声質・発音辞書。localStorage に永続化） */}
            <VoiceTuner getIdToken={getIdToken} className="mt-3" />
          </section>

          {/* ============ 中央: ゲストと文脈 ============ */}
          <section className={panel}>
            <div className={panelHead}>テスト対象のゲスト</div>
            <div className="shrink-0 border-b border-stone-100 p-3">
              <select
                value={guestUid}
                onChange={(e) => setGuestUid(e.target.value)}
                className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-sm text-gray-900 placeholder:text-gray-400"
              >
                <option value="">— 選択してください —</option>
                {guests.map((g) => (
                  <option key={g.uid} value={g.uid}>
                    {adminName(g)}
                    {g.nickname ? `（${g.nickname}）` : ""}
                  </option>
                ))}
              </select>
              {selected && debug && (
                <p className="mt-2 text-[11px] text-stone-500">
                  AI は「<span className="font-medium text-stone-800">{debug.callName}</span>」と呼びます
                  <span className="mt-0.5 block text-stone-400">{debug.tagLabels}</span>
                </p>
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              {!guestUid ? (
                <p className="p-6 text-center text-xs text-stone-400">
                  ゲストを選ぶと、AI が読み込む文脈が表示されます
                </p>
              ) : !debug ? (
                <div className="h-24 animate-pulse rounded-lg bg-stone-100" />
              ) : (
                <>
                  <div>
                    <p className="mb-1 text-[11px] font-semibold text-stone-500">AI用メモ</p>
                    <p className="whitespace-pre-wrap rounded-lg bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900">
                      {debug.aiMemo || "（未設定）"}
                    </p>
                  </div>

                  <div>
                    <p className="mb-1 flex items-baseline gap-1.5 text-[11px] font-semibold text-stone-500">
                      読み込んだエピソード
                      <span className="tabular-nums font-normal text-stone-400">
                        {debug.episodes.length} 件
                      </span>
                    </p>
                    {debug.episodes.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-stone-300 p-4 text-center text-[11px] text-stone-400">
                        このゲストに見せてよいエピソードがありません
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {debug.episodes.map((e) => (
                          <li key={e.id}
                            className={`rounded-lg border p-2 ${
                              e.isPersonal ? "border-rose-200 bg-rose-50/60" : "border-stone-200 bg-stone-50/60"
                            }`}>
                            <p className="flex items-baseline gap-1.5">
                              <span className="min-w-0 flex-1 truncate text-xs font-medium text-stone-800">
                                {e.title || "（タイトルなし）"}
                              </span>
                              {e.isPersonal && (
                                <span className="shrink-0 rounded-full bg-rose-600 px-1.5 py-px text-[9px] text-white">
                                  本人
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 text-[10px] text-stone-400">
                              {themeDef(e.theme).label}
                              {e.period ? ` ・ ${e.period}` : ""}
                            </p>
                            <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-stone-600">
                              {e.content}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <button type="button" onClick={() => setShowPrompt((v) => !v)}
                      className="text-[11px] text-stone-400 underline hover:text-stone-700">
                      {showPrompt ? "組み立て結果を隠す" : "実際に送っているプロンプトを見る"}
                    </button>
                    {showPrompt && (
                      <pre className="mt-1.5 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-stone-900 p-2.5 text-[10px] leading-relaxed text-stone-200">
                        {debug.systemInstruction}
                      </pre>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* ============ 右: チャット ============ */}
          {/* チャット列。key にゲスト UID を渡すことで、切り替え時に会話が自動リセットされる */}
          <AiTestChat
            key={guestUid}
            guestUid={guestUid}
            basePrompt={basePrompt}
            getIdToken={getIdToken}
            onDebug={(d) => setDebug(d as DebugInfo)}
            onUsage={(u) => setUsage(u)}
            className="h-full"
          />
        </div>
      </div>
    </main>
  );
}
