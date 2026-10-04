"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getJson } from "@/lib/api-client";
import {
  setTtsAuth,
  setTtsOptions,
  speakSentence,
  stopTts,
  unlockAudio,
  type PronunciationEntry,
} from "@/lib/tts";

/** ElevenLabs 時代の値が混ざらないよう、保存キーごと分ける */
const STORAGE_KEY = "ai-test-voice-tuning-sbv2";
/** お気に入りパターン。現在値とは別に、名前付きで複数持つ */
const PRESETS_KEY = "ai-test-voice-presets";

type VoiceParams = {
  sdp_ratio: number;
  noise: number;
  noise_w: number;
  length: number;
  style_weight: number;
};

const DEFAULT_PARAMS: VoiceParams = {
  sdp_ratio: 0.2,
  noise: 0.6,
  noise_w: 0.8,
  length: 1.0,
  style_weight: 1.0,
};

const SLIDERS: {
  key: keyof VoiceParams;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
}[] = [
  {
    key: "length",
    label: "Length（話速・間）",
    min: 0.5,
    max: 2,
    step: 0.05,
    hint: "★大きいほどゆっくり★ 披露宴の「間」はここで作る",
  },
  {
    key: "sdp_ratio",
    label: "SDP Ratio（抑揚の揺らぎ）",
    min: 0,
    max: 1,
    step: 0.05,
    hint: "上げるほど人間らしく揺れる。上げすぎると読みが崩れる",
  },
  {
    key: "noise_w",
    label: "Noise W（テンポの揺らぎ）",
    min: 0,
    max: 2,
    step: 0.05,
    hint: "音素の長さのばらつき。棒読み感を減らす",
  },
  {
    key: "noise",
    label: "Noise（声のゆらぎ）",
    min: 0,
    max: 2,
    step: 0.05,
    hint: "上げるほど表情が出るが、ざらつきも増える",
  },
  {
    key: "style_weight",
    label: "Style Weight（スタイルの強さ）",
    min: 0,
    max: 10,
    step: 0.5,
    hint: "選んだスタイルをどれだけ強く当てるか",
  },
];

type VoicePreset = {
  id: string;
  name: string;
  params: VoiceParams;
  styleName: string;
  createdAt: number;
};

type Stored = {
  params: Partial<VoiceParams>;
  styleName: string;
  dictionary: PronunciationEntry[];
};

export default function VoiceTuner({
  getIdToken,
  className = "",
}: {
  getIdToken?: () => Promise<string>;
  className?: string;
}) {
  const [params, setParams] = useState<VoiceParams>(DEFAULT_PARAMS);
  const [styleName, setStyleName] = useState("Neutral");
  const [styles, setStyles] = useState<string[]>([]);
  const [stylesError, setStylesError] = useState("");
  const [dictionary, setDictionary] = useState<PronunciationEntry[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sample, setSample] = useState("はじめまして！今日は来てくれてありがとう。");
  const [note, setNote] = useState("");
  const [presets, setPresets] = useState<VoicePreset[]>([]);
  const [presetId, setPresetId] = useState("");
  const [naming, setNaming] = useState(false);
  const [presetName, setPresetName] = useState("");
  const firstRun = useRef(true);

  // 復元（localStorage は SSR と食い違うので必ず effect の中で読む）
  // ★ここの setState は意図したもの★ useState の初期化関数で読むと、
  //   サーバーの HTML（既定値）と食い違ってハイドレーションエラーになる。
  //   マウント後に1回だけ、外部（localStorage）の値を取り込む。
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const v = JSON.parse(raw) as Partial<Stored>;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 上の★のとおり
      if (v.params) setParams({ ...DEFAULT_PARAMS, ...v.params });
      if (typeof v.styleName === "string" && v.styleName) setStyleName(v.styleName);
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

  // お気に入りパターンの復元
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      if (!raw) return;
      const v = JSON.parse(raw) as VoicePreset[];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 上の復元と同じ理由
      if (Array.isArray(v)) setPresets(v.filter((p) => p && p.id && p.name));
    } catch {
      /* 壊れていたら無視 */
    }
  }, []);

  const writePresets = useCallback((next: VoicePreset[]) => {
    setPresets(next);
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    } catch {
      /* 容量超過などは無視 */
    }
  }, []);

  const savePreset = useCallback(() => {
    const name = presetName.trim();
    if (!name) {
      setNote("パターン名を入力してください");
      return;
    }
    const entry: VoicePreset = {
      id: crypto.randomUUID(),
      name,
      params,
      styleName,
      createdAt: Date.now(),
    };
    // 同名は上書きする（試行錯誤中に増えすぎないように）
    writePresets([...presets.filter((p) => p.name !== name), entry]);
    setPresetId(entry.id);
    setPresetName("");
    setNaming(false);
    setNote("");
  }, [presetName, params, styleName, presets, writePresets]);

  const applyPreset = useCallback(
    (id: string) => {
      setPresetId(id);
      const p = presets.find((x) => x.id === id);
      if (!p) return;
      setParams({ ...DEFAULT_PARAMS, ...p.params });
      if (p.styleName) setStyleName(p.styleName);
    },
    [presets],
  );

  const deletePreset = useCallback(() => {
    if (!presetId) return;
    writePresets(presets.filter((p) => p.id !== presetId));
    setPresetId("");
  }, [presetId, presets, writePresets]);

  // モデルが持つスタイル一覧を取りに行く
  const fetchStyles = useCallback(
    () =>
      getJson<{ styles: string[] }>("/api/admin/tts").then((r) =>
        Array.isArray(r.styles) && r.styles.length > 0 ? r.styles : ["Neutral"],
      ),
    [],
  );
  const stylesErrorText = (e: unknown) =>
    e instanceof Error ? e.message : "スタイル一覧を取得できませんでした";

  // 再読み込みボタン用。前回のエラー表示を消してから取り直す
  const loadStyles = useCallback(async () => {
    setStylesError("");
    try {
      setStyles(await fetchStyles());
    } catch (e) {
      setStyles(["Neutral"]);
      setStylesError(stylesErrorText(e));
    }
  }, [fetchStyles]);

  // 最初の読み込み。結果の反映は応答が来てからだけ行う
  useEffect(() => {
    let alive = true;
    fetchStyles()
      .then((list) => alive && setStyles(list))
      .catch((e) => {
        if (!alive) return;
        setStyles(["Neutral"]);
        setStylesError(stylesErrorText(e));
      });
    return () => {
      alive = false;
    };
  }, [fetchStyles]);

  // 変更のたびに TTS へ反映し、localStorage に永続化する
  useEffect(() => {
    setTtsOptions({ params: { ...params, style_name: styleName }, dictionary });
    if (firstRun.current) {
      // 初回描画では保存しない（復元前の既定値で上書きしないため）
      firstRun.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ params, styleName, dictionary }));
    } catch {
      /* 容量超過などは無視 */
    }
  }, [params, styleName, dictionary]);

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
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-stone-900">3. Voice AI チューニング</h2>
        <button
          type="button"
          onClick={() => setParams(DEFAULT_PARAMS)}
          className="text-[10px] text-stone-400 hover:text-stone-700"
        >
          既定値に戻す
        </button>
      </div>

      {/* ---- お気に入りパターン ---- */}
      <div className="mb-3 rounded-lg bg-stone-50 p-2">
        <p className="mb-1 text-[11px] font-semibold text-stone-600">お気に入りパターン</p>
        <div className="flex gap-1">
          <select
            value={presetId}
            onChange={(e) => applyPreset(e.target.value)}
            className="min-w-0 flex-1 rounded border border-stone-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-stone-500 focus:outline-none"
          >
            <option value="">— 呼び出す —</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setNaming((v) => !v);
              setNote("");
            }}
            className="shrink-0 rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-600 hover:bg-stone-100"
          >
            ＋保存
          </button>
          {presetId && (
            <button
              type="button"
              onClick={deletePreset}
              aria-label="このパターンを削除"
              className="shrink-0 rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-400 hover:bg-rose-50 hover:text-rose-600"
            >
              ×
            </button>
          )}
        </div>
        {naming && (
          <div className="mt-1.5 flex gap-1">
            <input
              autoFocus
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  savePreset();
                }
              }}
              maxLength={20}
              placeholder="例）落ち着いた挨拶用"
              className={inputCls}
            />
            <button
              type="button"
              onClick={savePreset}
              className="shrink-0 rounded bg-stone-900 px-2 py-1 text-xs font-medium text-white hover:bg-stone-700"
            >
              保存
            </button>
          </div>
        )}
      </div>

      {/* ---- スタイル ---- */}
      <div className="mb-3">
        <label htmlFor="voice-style" className="text-xs font-medium text-stone-700">
          Style（スタイル）
        </label>
        <select
          id="voice-style"
          value={styleName}
          onChange={(e) => setStyleName(e.target.value)}
          className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-stone-500 focus:outline-none"
        >
          {(styles.includes(styleName) ? styles : [styleName, ...styles]).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {stylesError ? (
          <p className="mt-1 text-[10px] leading-tight text-amber-700">
            {stylesError}
            <button
              type="button"
              onClick={() => void loadStyles()}
              className="ml-1 underline hover:text-amber-900"
            >
              再取得
            </button>
          </p>
        ) : (
          <p className="mt-0.5 text-[11px] leading-tight text-stone-500">
            学習時に定義したスタイルから選びます
          </p>
        )}
      </div>

      {/* ---- スライダー ---- */}
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
              min={s.min}
              max={s.max}
              step={s.step}
              value={params[s.key]}
              onChange={(e) => setParam(s.key, Number(e.target.value))}
              className="mt-1 w-full accent-stone-700"
            />
            <p className="text-[11px] leading-tight text-stone-500">{s.hint}</p>
          </div>
        ))}
      </div>

      {/* ---- 発音辞書 ---- */}
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

      {/* ---- 試聴 ---- */}
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
