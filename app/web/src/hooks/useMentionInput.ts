"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useGuestDirectory } from "@/hooks/useGuestDirectory";
import {
  activeMentions,
  findMentionDraft,
  suggestMentions,
  typedMentions,
  type MentionPerson,
} from "@/lib/mentions";
import { isCouple } from "@/lib/visibility";
import { MAX_MENTIONS } from "@/config/mentions";

/**
 * 入力欄の @メンション（Issue #92）。`@` を打つと候補を出し、選ぶと `@ニックネーム ` を入れる。
 *
 * visibleToTags: その投稿・コメントが見える所属タグ（投稿は選んでいる公開範囲、コメントは親の投稿の範囲）。
 *   候補はこのタグを1つ以上持つ人と、新郎新婦（couple タグ）にする。
 *   新郎新婦は管理者で、公開範囲に関係なくすべての投稿が見える（Rules の canRead）ので、いつも候補に出す。
 *   それ以外の、投稿が見えない人は出さない（メンションしても通知は届かない）。
 *
 * ★選んだ相手は uid で持つ★ ニックネームは重複でき、空白や記号も入るので、本文の文字列だけでは相手を特定できない。
 *   送るのは、本文に `@ニックネーム` が残っている人だけ（mentioned）。
 * ★候補から選ばずに手で打った `@ニックネーム` も、相手が1人に決まるときだけ拾う★（lib/mentions.ts の typedMentions）
 *   同じニックネームが2人以上いるときは拾わない（候補から選んだ人だけに届く）。
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
  alwaysUids,
}: {
  text: string;
  setText: (value: string) => void;
  input: RefObject<HTMLTextAreaElement | null>;
  selfUid: string;
  visibleToTags: readonly string[];
  /** タグが重ならなくても候補に出す人（コメント欄での、親の投稿の作者。自分の投稿は必ず読める） */
  alwaysUids?: readonly string[];
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
  const alwaysKey = [...(alwaysUids ?? [])].sort().join("|");
  const candidates = useMemo<MentionPerson[]>(() => {
    const scope = new Set(tagKey ? tagKey.split("|") : []);
    const always = new Set(alwaysKey ? alwaysKey.split("|") : []);
    return directory.people
      .filter((p) => p.uid !== selfUid && (isCouple(p) || always.has(p.uid) || p.tags.some((t) => scope.has(t))))
      .map((p) => ({ uid: p.uid, name: p.name }));
  }, [directory.people, selfUid, tagKey, alwaysKey]);

  const mentioned = useMemo(() => {
    const chosen = activeMentions(text, picked);
    const uids = new Set(chosen.map((m) => m.uid));
    // 選んだ人を先に数え、残りの枠に手で打った分を入れる
    const typed = typedMentions(text, candidates).filter((m) => !uids.has(m.uid));
    return [...chosen, ...typed].slice(0, MAX_MENTIONS);
  }, [text, picked, candidates]);
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
