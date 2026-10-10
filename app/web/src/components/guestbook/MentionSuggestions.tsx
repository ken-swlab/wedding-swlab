"use client";

import Image from "next/image";
import type { MentionSuggestionsState } from "@/hooks/useMentionInput";
import { useAuthorProfile } from "@/lib/profiles-client";
import type { MentionPerson } from "@/lib/mentions";
import { MAX_MENTIONS } from "@/config/mentions";

/** 候補の1行。ニックネームは重複できるので、アイコンも出して見分けられるようにする */
function Candidate({ person }: { person: MentionPerson }) {
  const profile = useAuthorProfile(person.uid, { name: person.name });
  return (
    <>
      <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full bg-stone-200">
        {profile.photoURL && <Image src={profile.photoURL} alt="" fill sizes="28px" className="object-cover" />}
      </span>
      <span className="truncate">@{person.name}</span>
    </>
  );
}

/**
 * @メンションの候補の一覧。入力欄を包む relative の箱の中に置く（位置は className で決める）。
 *
 * ★ボタンは pointerdown を preventDefault する★ 入力欄のフォーカスを外さずに選ぶため。
 *   フォーカスが外れると iOS はキーボードを閉じ、選んだあとに打ち続けられない。
 * ★absolute で重ねる（入力欄の高さを変えない）★ コメント欄は、キーボードが上がる間に形が変わると
 *   画面がガタつく（CommentBar の★参照）。
 */
export function MentionSuggestions({
  state,
  className,
}: {
  state: MentionSuggestionsState;
  /** 置き場所（例: "bottom-full mb-1"） */
  className: string;
}) {
  const { matches, full, mentionedUids, pick } = state;
  if (!matches) return null;

  return (
    <div
      className={`absolute inset-x-0 z-50 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-lg ${className}`}
    >
      {full && (
        <p role="status" className="border-b border-stone-100 bg-amber-50 px-4 py-2 text-xs leading-relaxed text-amber-900">
          メンションできるのは{MAX_MENTIONS}人までです。ほかの人を選ぶには、本文から @名前 を消してください。
        </p>
      )}
      {matches.length === 0 ? (
        <p className="px-4 py-3 text-sm text-stone-400">該当する人がいません</p>
      ) : (
        <ul role="listbox" aria-label="メンションの候補" className="max-h-52 overflow-y-auto overscroll-contain py-1">
          {matches.map((p) => {
            const disabled = full && !mentionedUids.includes(p.uid);
            return (
              <li key={p.uid} role="option" aria-selected={false} aria-disabled={disabled}>
                <button
                  type="button"
                  disabled={disabled}
                  onPointerDown={(e) => e.preventDefault()}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                  className="flex min-h-11 w-full touch-manipulation items-center gap-2.5 px-4 text-left text-sm text-violet-700 hover:bg-stone-50 disabled:opacity-40"
                >
                  <Candidate person={p} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
