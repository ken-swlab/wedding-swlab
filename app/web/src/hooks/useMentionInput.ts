"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useGuestDirectory } from "@/hooks/useGuestDirectory";
import {
  activeMentions,
  findMentionDraft,
  suggestMentions,
  type MentionPerson,
} from "@/lib/mentions";
import { MAX_MENTIONS } from "@/config/mentions";

/**
 * 入力欄の @メンション（Issue #92）。`@` を打つと候補を出し、選ぶと `@ニックネーム ` を入れる。
 *
 * visibleToTags: その投稿・コメントが見える所属タグ（投稿は選んでいる公開範囲、コメントは親の投稿の範囲）。
 *   候補はこのタグを1つ以上持つ人だけにする（見えない人をメンションしても通知は届かない）。
 *
 * ★選んだ相手は uid で持つ★ ニックネームは重複でき、空白や記号も入るので、本文の文字列だけでは相手を特定できない。
 *   送るのは、本文に `@ニックネーム` が残っている人だけ（mentioned）。
 * ★ゲストの一覧は、入力欄に初めてフォーカスしたときから購読する★（useGuestDirectory。最大 200 件）
 *   入力のたびに Firestore へ問い合わせない。同じクエリの購読は SDK が1本にまとめる。
 * ★候補のボタンは pointerdown を preventDefault する★（呼び出し側の MentionSuggestions）
 *   入力欄のフォーカスが外れると、iOS はキーボードを閉じてしまう。
 */
export function useMentionInput({
  text,
  setText,
  input,
  selfUid,
  visibleToTags,
}: {
  text: string;
  setText: (value: string) => void;
  input: RefObject<HTMLTextAreaElement | null>;
  selfUid: string;
  visibleToTags: readonly string[];
}) {
  const [armed, setArmed] = useState(false);
  const [caret, setCaret] = useState(0);
  const [picked, setPicked] = useState<MentionPerson[]>([]);
  // 閉じた候補（Esc や外側のタップ）。同じ `@` の位置では、文字を打ち足すまで出し直さない
  const [dismissed, setDismissed] = useState<string | null>(null);
  // 候補を入れた直後に置くカーソルの位置（描き直しのあとで反映する）
  const nextCaret = useRef<number | null>(null);

  const directory = useGuestDirectory(armed);
  const tagKey = [...visibleToTags].sort().join("|");
  const candidates = useMemo<MentionPerson[]>(() => {
    const scope = new Set(tagKey ? tagKey.split("|") : []);
    return directory.people
      .filter((p) => p.uid !== selfUid && p.tags.some((t) => scope.has(t)))
      .map((p) => ({ uid: p.uid, name: p.name }));
  }, [directory.people, selfUid, tagKey]);

  const mentioned = useMemo(() => activeMentions(text, picked), [text, picked]);
  const full = mentioned.length >= MAX_MENTIONS;

  const draft = armed ? findMentionDraft(text, Math.min(caret, text.length), picked) : null;
  const draftKey = draft ? `${draft.at}:${draft.query}` : null;
  const matches = draft && draftKey !== dismissed && !directory.loading ? suggestMentions(candidates, draft.query) : null;

  useLayoutEffect(() => {
    if (nextCaret.current === null) return;
    const pos = nextCaret.current;
    nextCaret.current = null;
    const el = input.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(pos, pos);
  }, [text, input]);

  /** 入力欄の onChange / onSelect / onFocus から呼ぶ（カーソルの位置を控える） */
  const track = useCallback((el: HTMLTextAreaElement) => {
    setArmed(true);
    setCaret(el.selectionStart ?? el.value.length);
  }, []);

  function pick(person: MentionPerson) {
    if (!draft) return;
    if (full && !mentioned.some((m) => m.uid === person.uid)) return;
    const head = text.slice(0, draft.at);
    const tail = text.slice(Math.min(caret, text.length));
    const inserted = `@${person.name} `;
    nextCaret.current = head.length + inserted.length;
    setCaret(nextCaret.current);
    // 同じ人を選び直したときは、名前（選んだ時点のニックネーム）を新しいほうに差し替える
    setPicked((list) => [...list.filter((p) => p.uid !== person.uid), person]);
    setText(head + inserted + tail.replace(/^ /, ""));
  }

  /** 送信が済んだら呼ぶ */
  const reset = useCallback(() => {
    setPicked([]);
    setDismissed(null);
    setCaret(0);
  }, []);

  return {
    /** 送信するメンションの相手（本文に残っている人だけ） */
    mentioned,
    /** 候補の一覧に渡す。matches が null のときは一覧を出さない */
    suggestions: { matches, full, mentionedUids: mentioned.map((m) => m.uid), pick, close: () => setDismissed(draftKey) },
    track,
    reset,
  };
}

export type MentionSuggestionsState = ReturnType<typeof useMentionInput>["suggestions"];
