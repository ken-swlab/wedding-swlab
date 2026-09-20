"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { streamAiTest, type AiTestUsage, type ChatTurn } from "@/lib/ai-stream";
import {
  createSentenceBuffer,
  setTtsAuth,
  speakSentence,
  stopTts,
  unlockAudio,
} from "@/lib/tts";

const MAX_HISTORY = 20;

type Props = {
  guestUid: string;
  basePrompt: string;
  /** 呼び出し側から ID トークン取得をもらう（このコンポーネントは Firebase に依存しない） */
  getIdToken: () => Promise<string>;
  onDebug?: (debug: unknown) => void;
  onUsage?: (usage: AiTestUsage) => void;
  className?: string;
};

export default function AiTestChat({
  guestUid,
  basePrompt,
  getIdToken,
  onDebug,
  onUsage,
  className = "",
}: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ttsOn, setTtsOn] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, streaming]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      stopTts();
    },
    [],
  );

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || busy) return;
    if (!guestUid) {
      setError("テスト対象のゲストを選択してください");
      return;
    }

    const history = turns.slice(-MAX_HISTORY);
    setTurns((prev) => [...prev, { role: "user", text: message }]);
    setDraft("");
    setError("");
    setStreaming("");
    setWaiting(true);
    setBusy(true);

    // ── Voice AI: 前回の読み上げを止めてから新しいバッファを作る ──
    stopTts();
    const tts = createSentenceBuffer(speakSentence);
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const idToken = await getIdToken();
      setTtsAuth(idToken);
      const { text, usage } = await streamAiTest({
        idToken,
        guestUid,
        message,
        basePrompt,
        history,
        signal: ac.signal,
        onMeta: ({ debug }) => onDebug?.(debug),
        onChunk: (chunk, full) => {
          // 最初の1文字が来た時点でローディング解除
          setWaiting(false);
          setStreaming(full);
          // TODO(Voice AI): ここが TTS への流し込み地点。
          // tts.push() が句点まで溜めてから ttsSink に渡す。
          if (ttsOn) tts.push(chunk);
        },
      });
      if (ttsOn) tts.flush();
      onUsage?.(usage);
      setTurns((prev) => [...prev, { role: "model", text }]);
    } catch (e) {
      if (!ac.signal.aborted) {
        setError(e instanceof Error ? e.message : String(e));
      }
      // 失敗したらユーザー発話を巻き戻して入力欄に戻す
      setTurns((prev) => prev.slice(0, -1));
      setDraft(message);
      tts.reset();
      stopTts();
    } finally {
      setStreaming("");
      setWaiting(false);
      setBusy(false);
      abortRef.current = null;
    }
  }, [draft, busy, guestUid, turns, basePrompt, getIdToken, onDebug, onUsage, ttsOn]);

  return (
    <div className={`flex h-full min-h-0 flex-col rounded-xl border border-gray-200 bg-[#7c9fbe] ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-black/10 bg-white/85 px-3 py-2">
        <span className="text-sm font-semibold text-gray-900">ミニ新郎AI</span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={ttsOn}
              onChange={(e) => {
                const on = e.target.checked;
                setTtsOn(on);
                // 自動再生制限の解除は「ユーザー操作の中」でしかできない
                if (on) void unlockAudio();
                else stopTts();
              }}
              className="h-3.5 w-3.5"
            />
            音声で読み上げ
          </label>
          <button
            type="button"
            onClick={() => {
              abortRef.current?.abort();
              stopTts();
              setTurns([]);
              setStreaming("");
              setError("");
            }}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            クリア
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {turns.length === 0 && !streaming && !waiting && (
          <p className="mt-8 text-center text-xs text-white/90">
            話しかけてみてください
          </p>
        )}

        {turns.map((t, i) => (
          <Bubble key={`${i}-${t.role}`} role={t.role} text={t.text} />
        ))}

        {streaming && <Bubble role="model" text={streaming} streaming />}

        {waiting && (
          <div className="flex justify-start">
            <div className="flex gap-1 rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-end gap-2 border-t border-black/10 bg-white/85 p-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder="メッセージを入力（⌘/Ctrl + Enter で送信）"
          className="min-h-[46px] flex-1 resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !draft.trim()}
          className="h-[46px] shrink-0 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-40"
        >
          送信
        </button>
      </div>
    </div>
  );
}

function Bubble({
  role,
  text,
  streaming = false,
}: {
  role: "user" | "model";
  text: string;
  streaming?: boolean;
}) {
  const mine = role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed text-gray-900 shadow ${
          mine ? "rounded-tr-sm bg-[#8de055]" : "rounded-tl-sm bg-white"
        }`}
      >
        {text}
        {streaming && (
          <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-[3px] animate-pulse bg-gray-500" />
        )}
      </div>
    </div>
  );
}
