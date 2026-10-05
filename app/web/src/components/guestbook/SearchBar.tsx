"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useBackdropLocation } from "@/hooks/useBackdropLocation";
import { useGuestbookData } from "./GuestbookDataProvider";
import { applyHashtag, hashtagDraft, suggestHashtags } from "@/lib/search";
import {
  GUESTBOOK_PATHS,
  GUESTBOOK_QUERY_PARAM,
  MAX_HASHTAG_SUGGESTIONS,
  SEARCH_DEBOUNCE_MS,
} from "@/config/guestbook";

/**
 * ヘッダーの検索欄。検索語は /guestbook?q= に置く（戻る操作や再読み込みでも残る）。
 *
 * ★Firestore には問い合わせない★ 絞り込みも候補も、読み込み済みの投稿から作る（lib/search.ts）。
 *   入力のたびに URL を書き換えると一覧の再描画が重なるので、入力が止まってから反映する。
 * ★/guestbook 以外の画面では、入力中に勝手に移動しない★
 *   詳細画面で文字を打った途端にタイムラインへ飛ぶと読みかけが失われる。
 *   確定（検索キー）か候補の選択で /guestbook へ移る。
 */
export function SearchBar() {
  const router = useRouter();
  // 詳細シートの表示中も、シートを開く前の検索語を出し続ける（useBackdropLocation の★参照）
  const { pathname, params } = useBackdropLocation();
  const { posts } = useGuestbookData();
  const onHome = pathname === GUESTBOOK_PATHS.home;
  const q = onHome ? (params.get(GUESTBOOK_QUERY_PARAM) ?? "") : "";

  const [draft, setDraft] = useState(q);
  const [focused, setFocused] = useState(false);
  // 自分で書き込んだ値と、最後に見た URL の値。戻る操作などで URL が外から変わったときだけ入力欄に写す
  const [sentQ, setSentQ] = useState<string | null>(null);
  const [seenQ, setSeenQ] = useState(q);
  if (q !== seenQ) {
    setSeenQ(q);
    if (q !== sentQ) setDraft(q);
  }

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function urlFor(value: string): string {
    // 表示中のビュー（?view=）は残し、検索語だけを差し替える
    const next = new URLSearchParams(onHome ? params.toString() : "");
    if (value) next.set(GUESTBOOK_QUERY_PARAM, value);
    else next.delete(GUESTBOOK_QUERY_PARAM);
    const s = next.toString();
    return s ? `${GUESTBOOK_PATHS.home}?${s}` : GUESTBOOK_PATHS.home;
  }

  function apply(value: string, navigate: boolean) {
    if (timer.current) clearTimeout(timer.current);
    const v = value.trim();
    if (onHome) {
      setSentQ(v);
      router.replace(urlFor(v), { scroll: false });
    } else if (navigate && v) {
      router.push(urlFor(v));
    }
  }

  function onChange(value: string) {
    setDraft(value);
    if (!onHome) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => apply(value, false), SEARCH_DEBOUNCE_MS);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    apply(draft, true);
    // キーボードを閉じて結果を見せる
    (document.activeElement as HTMLElement | null)?.blur();
  }

  function pick(tag: string) {
    const v = applyHashtag(draft, tag);
    setDraft(v);
    apply(v, true);
  }

  function clear() {
    setDraft("");
    apply("", false);
  }

  const tagPrefix = hashtagDraft(draft);
  const suggestions = useMemo(
    () => (tagPrefix === null ? [] : suggestHashtags(posts, tagPrefix, MAX_HASHTAG_SUGGESTIONS)),
    [posts, tagPrefix],
  );
  const showSuggestions = focused && suggestions.length > 0;

  return (
    <form role="search" className="relative min-w-0 flex-1" onSubmit={onSubmit}>
      <label className="flex h-10 items-center gap-2 rounded-full border border-stone-200 bg-stone-100 px-3 text-stone-400 focus-within:border-stone-300 focus-within:bg-white">
        <span aria-hidden className="text-sm">⌕</span>
        {/* iOS は 16px 未満の入力欄でフォーカス時に拡大するので text-base にする */}
        <input
          type="text"
          role="combobox"
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="投稿を検索　#タグ"
          aria-label="投稿を検索"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls="hashtag-suggestions"
          enterKeyHint="search"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-base text-stone-800 outline-none placeholder:text-stone-400"
        />
        {draft && (
          <button
            type="button"
            onClick={clear}
            aria-label="検索語を消す"
            className="-mr-1 flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full text-stone-400 hover:bg-stone-200"
          >
            <span aria-hidden>×</span>
          </button>
        )}
      </label>

      {showSuggestions && (
        <ul
          id="hashtag-suggestions"
          role="listbox"
          aria-label="ハッシュタグの候補"
          className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-2xl border border-stone-200/80 bg-white py-1 shadow-lg"
        >
          {suggestions.map((tag) => (
            <li key={tag} role="option" aria-selected={false}>
              <button
                type="button"
                // blur より先に選べるよう、mousedown でフォーカスを外さない
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(tag)}
                className="flex min-h-11 w-full touch-manipulation items-center px-4 text-left text-sm text-sky-700 hover:bg-stone-50"
              >
                #{tag}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
