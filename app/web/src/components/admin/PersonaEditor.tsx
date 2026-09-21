"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_PERSONA,
  FIRST_PERSON_PRESETS,
  PERSONALITY_PRESETS,
  POLITENESS_OPTIONS,
  SPEAKER_OPTIONS,
  composePersonaPrompt,
  type PersonaConfig,
  type Politeness,
  type Speaker,
} from "@/config/persona";

const STORAGE_KEY = "ai-test-persona";

export default function PersonaEditor({
  value,
  onChange,
  className = "",
}: {
  value: PersonaConfig;
  onChange: (next: PersonaConfig) => void;
  className?: string;
}) {
  const [showResult, setShowResult] = useState(false);
  const firstRun = useRef(true);

  // 復元（localStorage は SSR と食い違うので必ず effect の中で読む）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const v = JSON.parse(raw) as Partial<PersonaConfig>;
      onChange({
        ...DEFAULT_PERSONA,
        ...v,
        presetIds: Array.isArray(v.presetIds) ? v.presetIds : DEFAULT_PERSONA.presetIds,
      });
    } catch {
      /* 壊れていたら既定値のまま続行 */
    }
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      /* 容量超過などは無視 */
    }
  }, [value]);

  const set = <K extends keyof PersonaConfig>(key: K, v: PersonaConfig[K]) =>
    onChange({ ...value, [key]: v });

  const togglePreset = (id: string) =>
    set(
      "presetIds",
      value.presetIds.includes(id)
        ? value.presetIds.filter((x) => x !== id)
        : [...value.presetIds, id],
    );

  const chip = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition ${
      on
        ? "bg-stone-900 text-white ring-stone-900"
        : "bg-white text-stone-500 ring-stone-200 hover:bg-stone-50"
    }`;

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {/* ---- 誰として話すか ---- */}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-stone-600">誰として話すか</p>
          <div className="flex gap-1.5">
            {SPEAKER_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => set("speaker", o.id as Speaker)}
                className={chip(value.speaker === o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] leading-tight text-stone-400">
            ゲストの呼び名を、新郎側・新婦側のどちらの設定から引くかが変わります
          </p>
        </div>

        {/* ---- 口調 ---- */}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-stone-600">口調</p>
          <div className="flex gap-1.5">
            {POLITENESS_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => set("politeness", o.id as Politeness)}
                className={chip(value.politeness === o.id)}
              >
                {o.label}
                <span className="ml-1 font-normal opacity-60">{o.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ---- 一人称 ---- */}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-stone-600">一人称</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {FIRST_PERSON_PRESETS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => set("firstPerson", f)}
                className={chip(value.firstPerson === f)}
              >
                {f}
              </button>
            ))}
            <input
              value={value.firstPerson}
              onChange={(e) => set("firstPerson", e.target.value)}
              maxLength={8}
              placeholder="自由入力"
              className="w-24 rounded-full border border-stone-300 px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-stone-500 focus:outline-none"
            />
          </div>
        </div>

        {/* ---- 性格プリセット ---- */}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-stone-600">
            性格
            <span className="ml-1 font-normal text-stone-400">複数選べます</span>
          </p>
          <div className="space-y-1.5">
            {PERSONALITY_PRESETS.map((p) => {
              const on = value.presetIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePreset(p.id)}
                  className={`w-full rounded-lg border p-2 text-left transition ${
                    on
                      ? "border-stone-900 bg-stone-900/5"
                      : "border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium text-stone-800">
                    <span
                      className={`inline-block h-3 w-3 shrink-0 rounded-sm border ${
                        on ? "border-stone-900 bg-stone-900" : "border-stone-300"
                      }`}
                    />
                    {p.label}
                  </span>
                  <span className="mt-0.5 block pl-4.5 text-[11px] leading-relaxed text-stone-500">
                    {p.text}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ---- 自由記述 ---- */}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-stone-600">
            追加の指示
            <span className="ml-1 font-normal text-stone-400">任意</span>
          </p>
          <textarea
            value={value.freeText}
            onChange={(e) => set("freeText", e.target.value)}
            rows={4}
            maxLength={1500}
            placeholder="例）大学時代の話を振られたら、少し懐かしむように話す。"
            className="w-full resize-y rounded-lg border border-stone-300 p-2 text-xs leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-stone-500 focus:outline-none"
          />
        </div>

        {/* ---- 組み立て結果 ---- */}
        <div>
          <button
            type="button"
            onClick={() => setShowResult((v) => !v)}
            className="text-[11px] text-stone-400 underline hover:text-stone-700"
          >
            {showResult ? "組み立て結果を隠す" : "組み立てられた人格を見る"}
          </button>
          {showResult && (
            <pre className="mt-1.5 whitespace-pre-wrap rounded-lg bg-stone-900 p-2.5 text-[10px] leading-relaxed text-stone-200">
              {composePersonaPrompt(value)}
            </pre>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-stone-100 p-2">
        <p className="mb-1.5 px-1 text-[10px] leading-relaxed text-stone-400">
          「作り話をしない」「来てくれた感謝を伝える」などの指示は、
          ここでは編集できません。サーバー側で固定しています。
        </p>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_PERSONA)}
          className="w-full rounded-lg border border-stone-200 py-1.5 text-xs text-stone-500 hover:bg-stone-50"
        >
          初期値に戻す
        </button>
      </div>
    </div>
  );
}
