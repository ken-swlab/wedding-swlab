"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  setTtsAuth,
  setTtsOptions,
  speakSentence,
  stopTts,
  unlockAudio,
  type PronunciationEntry,
} from "@/lib/tts";

const STORAGE_KEY = "ai-test-voice-tuning";

type VoiceParams = {
  stability: number;
  style: number;
  similarity_boost: number;
};

const DEFAULT_PARAMS: VoiceParams = {
  stability: 0.45,
  style: 0.15,
  similarity_boost: 0.8,
};

const SLIDERS: { key: keyof VoiceParams; label: string; hint: string }[] = [
  {
    key: "stability",
    label: "Stability（安定性）",
    hint: "下げるほど抑揚が大きく感情的に。上げるほど淡々と安定",
  },
  {
    key: "style",
    label: "Style（演技力）",
    hint: "元の話し方の癖を強調。上げすぎると読み崩れやすい",
  },
  {
    key: "similarity_boost",
    label: "Similarity（類似度）",
    hint: "クローン元の声への忠実度。上げすぎると録音のノイズも再現される",
  },
];

type Stored = { params: Partial<VoiceParams>; dictionary: PronunciationEntry[] };

export default function VoiceTuner({
  getIdToken,
  className = "",
}: {
  getIdToken?: () => Promise<string>;
  className?: string;
}) {
  const [params, setParams] = useState<VoiceParams>(DEFAULT_PARAMS);
  const [dictionary, setDictionary] = useState<PronunciationEntry[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sample, setSample] = useState("はじめまして！今日は来てくれてありがとう。");
  const [note, setNote] = useState("");
  const firstRun = useRef(true);

  // 復元（localStorage は SSR と食い違うので必ず effect の中で読む）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const v = JSON.parse(raw) as Partial<Stored>;
      if (v.params) setParams({ ...DEFAULT_PARAMS, ...v.params });
      if (Array.isArray(v.dictionary)) {
        setDictionary(
          v.dictionary.filter(
            (e): e is PronunciationEntry =>
              !!e && typeof e.from === "string" && typeof e.to === "string" && !!e.from,
          ),
        );
      }
    } catch {
      /* 壊れていたら既定値のまま続行 */
    }
  }, []);

  // 変更のたびに TTS へ反映し、localStorage に永続化する
  useEffect(() => {
    setTtsOptions({ params, dictionary });
    if (firstRun.current) {
      // 初回描画では保存しない（復元前の既定値で上書きしないため）
      firstRun.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ params, dictionary }));
    } catch {
      /* 容量超過などは無視 */
    }
  }, [params, dictionary]);

  const setParam = useCallback((key: keyof VoiceParams, value: number) => {
    setParams((prev) => {
      const next = { ...prev };
      next[key] = value;
      return next;
    });
  }, []);

  const addEntry = useCallback(() => {
    const f = from.trim();
    const t = to.trim();
    if (!f) {
      setNote("変換前を入力してください");
      return;
    }
    if (!t) {
      setNote("変換後（読み）を入力してください");
      return;
    }
    setDictionary((prev) => [...prev.filter((e) => e.from !== f), { from: f, to: t }]);
    setFrom("");
    setTo("");
    setNote("");
  }, [from, to]);

  const removeEntry = useCallback((f: string) => {
    setDictionary((prev) => prev.filter((e) => e.from !== f));
  }, []);

  const preview = useCallback(async () => {
    const text = sample.trim();
    if (!text) return;
    setNote("");
    try {
      stopTts();
      void unlockAudio();
      if (getIdToken) setTtsAuth(await getIdToken());
      speakSentence(text);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "試聴に失敗しました");
    }
  }, [sample, getIdToken]);

  const inputCls =
    "w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs text-gray-900 placeholder:text-gray-400 focus:border-stone-500 focus:outline-none";

  return (
    <section className={`rounded-xl border border-stone-200 bg-white p-3 ${className}`}>
      <h2 className="mb-2 text-sm font-semibold text-stone-900">
        3. Voice AI チューニング
      </h2>

      <div className="space-y-3">
        {SLIDERS.map((s) => (
          <div key={s.key}>
            <div className="flex items-baseline justify-between">
              <label htmlFor={`voice-${s.key}`} className="text-xs font-medium text-stone-700">
                {s.label}
              </label>
              <span className="font-mono text-xs text-stone-500">
                {params[s.key].toFixed(2)}
              </span>
            </div>
            <input
              id={`voice-${s.key}`}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={params[s.key]}
              onChange={(e) => setParam(s.key, Number(e.target.value))}
              className="mt-1 w-full accent-stone-700"
            />
            <p className="text-[11px] leading-tight text-stone-500">{s.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-stone-200 pt-3">
        <p className="mb-1 text-xs font-medium text-stone-700">発音辞書</p>
        <p className="mb-2 text-[11px] leading-tight text-stone-500">
          読み上げ時だけ置換します。画面の吹き出しの文字は変わりません。
        </p>

        <div className="flex gap-1">
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addEntry();
              }
            }}
            placeholder="大智"
            className={inputCls}
          />
          <span className="self-center text-xs text-stone-400">→</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addEntry();
              }
            }}
            placeholder="さとし"
            className={inputCls}
          />
          <button
            type="button"
            onClick={addEntry}
            className="shrink-0 rounded bg-stone-900 px-2 py-1 text-xs font-medium text-white hover:bg-stone-700"
          >
            追加
          </button>
        </div>

        {dictionary.length > 0 && (
          <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto">
            {dictionary.map((e) => (
              <li
                key={e.from}
                className="flex items-center justify-between rounded bg-stone-50 px-2 py-1 text-xs text-stone-800"
              >
                <span className="truncate">
                  {e.from} <span className="text-stone-400">→</span> {e.to}
                </span>
                <button
                  type="button"
                  onClick={() => removeEntry(e.from)}
                  aria-label={`${e.from} を削除`}
                  className="ml-2 shrink-0 rounded px-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 border-t border-stone-200 pt-3">
        <p className="mb-1 text-xs font-medium text-stone-700">試聴</p>
        <div className="flex gap-1">
          <input
            value={sample}
            onChange={(e) => setSample(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void preview();
              }
            }}
            placeholder="読ませたい文"
            className={inputCls}
          />
          <button
            type="button"
            onClick={() => void preview()}
            className="shrink-0 rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-700 hover:bg-stone-50"
          >
            ▶ 再生
          </button>
        </div>
        {note && <p className="mt-1 text-[11px] text-red-600">{note}</p>}
      </div>
    </section>
  );
}
