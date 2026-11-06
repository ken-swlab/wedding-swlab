"use client";

import { takeFiles } from "@/lib/file-input";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBackToClose } from "@/hooks/useHistoryOverlay";
import {
  clearComposerDraft,
  readComposerText,
  readDraftFiles,
  removeDraftFile,
  saveComposerText,
  saveDraftFile,
} from "@/lib/composer-draft";
import { createPortal } from "react-dom";
import type { User } from "firebase/auth";
import { ALL_TAG, scopeForDisplay, toggleScope } from "@/lib/visibility-scope";
import { COUPLE_TAG, displayVisibleTags, isTagPending, tagDef, withoutSystemTags } from "@/config/tags";
import { useTags } from "@/lib/tags-client";
import { EPISODE_THEMES, themeDef } from "@/config/episodes";
import { compressForTimeline, makeImageVariants, makeVideoPoster, type ImageVariants } from "@/lib/image";
import { MAX_MEDIA_PER_POST, MAX_ORIGINAL_BYTES, isStorageConfigured } from "@/lib/media";
import { newPostId, type PostDraft } from "@/lib/post-draft";
import type { ReencodedJpeg } from "@/lib/thumb-guard";
import { useMentionInput } from "@/hooks/useMentionInput";
import { useAuthorName } from "./AuthorNameProvider";
import { MentionSuggestions } from "./MentionSuggestions";
import { useGuestSessionContext } from "./GuestSessionContext";
import { TagChips } from "./TagChips";
import { COMPOSER_HINT_MS, DRAFT_SAVE_DELAY_MS } from "@/config/guestbook";
import { CameraIcon } from "@/components/icons";

type Picked = {
  id: string;
  file: File;
  previewUrl: string;
  isVideo: boolean;
  compressing: boolean;
  error?: string;
  compressed?: ReencodedJpeg;
  width?: number;
  height?: number;
  /** 一覧用の小さい版（Issue #251）。圧縮と一緒に作っておく */
  variants?: ImageVariants;
  /** 動画の1枚目の画像（Issue #251）。選んだ直後から作り始め、投稿するときに待つ */
  poster?: Promise<ReencodedJpeg | null>;
};

const DEFAULT_PLACEHOLDER = "おふたりへのメッセージや、当日の写真をどうぞ 🌿";

/** 投稿したあとの知らせ。投稿画面は閉じるので、タイムラインのトーストで出す（ComposerSheet） */
export type ComposerNotice = { kind: "upload" | "episode" | "couple" | "error"; text: string; sub?: string; ms?: number };

/**
 * お題のラベルをハッシュタグとして末尾に足す。
 * 既に書かれていれば何もしない。全角の ＃ も NFKC で吸収する。
 * 「その他」はタグにしても意味がないので付けない。
 */
function withThemeHashtag(raw: string, themeId: string): string {
  if (!themeId || themeId === "other") return raw;

  const label = themeDef(themeId).label;
  const flat = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");
  if (flat(raw).includes(`#${flat(label)}`)) return raw;

  const body = raw.trimEnd();
  return body ? `${body}\n\n#${label}` : `#${label}`;
}

/**
 * 投稿画面（Issue #224）。全画面のシート（ComposerSheet）の中身として出す。
 *
 * ★見た目と置き場所だけを変えた。送信の処理は変えない★（軽量版の送信 → createPost → メンションの通知 →
 *   顔検出 → 高画質版のキュー → エピソード）。
 * ★上のバーに「キャンセル・新しい投稿・投稿する」を固定する★ 「投稿する」がフォームの一番下にあると、
 *   ボタンに見えず、キーボードにも隠れた。バーはスクロールする箱の外に置き、キーボードが出ても動かない
 *   （シートの枠は useVisualViewportFrame で見えている範囲に合わせる）。
 * ★「投稿する」は押せないときも押せる★ 灰色のまま押されたら、何が足りないかを下に短く出す
 *   （disabled にすると、押しても何も起きず理由が分からない）。
 * ★写真を主役にする★ 上から「写真・動画を選ぶ（大きな枠）」→「一言」→「公開範囲（1行）」→「思い出エピソード」。
 *   公開範囲のチップは、1行を押したときだけ下からのシートで出す（チップが一番目立っていた）。
 * ★「投稿する」で onSubmitDraft に渡し、すぐ onPosted を呼ぶ（呼び出し側が閉じる）★（Issue #254）
 *   送信とその知らせ（高画質版・エピソード・新郎新婦あて）は、送信の列（usePostOutbox）が受け持つ。
 */
export function Composer({
  user,
  tags,
  onSubmitDraft,
  onClose = () => {},
  onPosted = () => {},
}: {
  user: User;
  tags: string[];
  /** 「投稿する」。押した時点の投稿を渡す（送信は呼び出し側が続ける。Issue #254） */
  onSubmitDraft: (draft: PostDraft) => void;
  /** 「キャンセル」。書きかけなら確認してから呼ぶ */
  onClose?: () => void;
  /** 投稿が成立した（フォームは片付け済み） */
  onPosted?: () => void;
}) {
  /**
   * ★書きかけを端末に残す★（Issue #273。lib/composer-draft.ts）閉じて開き直しても、続きから書ける。
   *   本文・公開範囲・エピソードは開いたときに戻し、写真は端末から読み直して、選んだときと同じ処理（圧縮など）をし直す。
   *   投稿したら・「下書きを捨てますか？」で捨てたら消す。
   */
  const [saved] = useState(() => readComposerText(user.uid));
  const [restored, setRestored] = useState(() => saved !== null);
  const [text, setText] = useState(saved?.text ?? "");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * 灰色の「投稿する」を押したときの、足りないものの知らせ。
   * 出したときの入力（key）と一緒に持ち、入力が変わったら（理由が変わりうるので）描画時に出さない。
   */
  const [hint, setHint] = useState<{ text: string; key: string } | null>(null);
  /** 公開範囲を選ぶシート */
  const [scopeOpen, setScopeOpen] = useState(false);
  // 公開範囲のシートも、戻る（左端のスワイプ）で閉じる（Issue #273）
  const closeScope = useCallback(() => setScopeOpen(false), []);
  useBackToClose(scopeOpen, closeScope);
  const fileRef = useRef<HTMLInputElement>(null);

  // --- 思い出エピソード ---
  const [episodeOn, setEpisodeOn] = useState(saved?.episodeOn ?? false);
  const [theme, setTheme] = useState<string>(saved?.theme ?? "");

  /**
   * ★「新郎新婦」は、自分がそのタグを持っていなくても選べる★（新郎新婦あての投稿。Issue #97）
   *   ほかのタグは、自分が持っているものだけ（Rules の tagsInMyScope と同じ）。
   */
  // ★カスタムタグも選べる★（「酒豪」など。Issue #147）。選べるかは管理画面のタグ管理（selectable）で決め、アーカイブ済みは出さない
  const { allTags } = useTags();
  const available = useMemo(
    // ★仕組み用のタグ（「承認済」）は選択肢に出さない★（Issue #204）見える人は「全員」と同じ
    () => allTags.filter((t) => t.selectable && !t.archived && !t.system && (tags.includes(t.id) || t.id === COUPLE_TAG)),
    [allTags, tags],
  );
  // 書きかけの公開範囲は、今も選べるタグだけを戻す（無くなったタグ・外れたタグは使わない）
  const [selected, setSelected] = useState<string[]>(() => {
    const keep = (saved?.selected ?? []).filter((t) => t === COUPLE_TAG || tags.includes(t));
    if (keep.length > 0) return keep;
    return tags.includes("all") ? ["all"] : withoutSystemTags(tags).slice(0, 1);
  });

  // 本文・公開範囲・エピソードを残す（打つたびに書かず、少し待ってから）
  useEffect(() => {
    const t = setTimeout(() => saveComposerText(user.uid, { text, selected, episodeOn, theme }), DRAFT_SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [user.uid, text, selected, episodeOn, theme]);


  // @メンションの候補は、選んでいる公開範囲が見える人だけ（範囲を変えると候補も変わる）
  const textInput = useRef<HTMLTextAreaElement>(null);
  const mention = useMentionInput({ text, setText, input: textInput, selfUid: user.uid, visibleToTags: selected });

  const storageReady = isStorageConfigured();
  const name = useAuthorName();
  // アイコンは本人が設定したもの（guests.photoURL）。Auth の photoURL は LINE の画像のまま
  const photoURL = useGuestSessionContext().profile?.photoURL || user.photoURL;

  // プレビュー用の objectURL を確実に解放する
  useEffect(() => {
    return () => picked.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ★先に取り出してから入力欄を空にする★（Issue #278。lib/file-input.ts の takeFiles）
  async function onPick(files: FileList | null) {
    const list = takeFiles(files, fileRef.current);
    if (list.length === 0) return;
    await addFiles(list);
  }

  /** ids … 端末に残した書きかけから戻すとき、その ID（もう残してあるので、残し直さない） */
  async function addFiles(files: File[], ids?: string[]) {
    setError(null);

    const room = MAX_MEDIA_PER_POST - picked.length;
    const incoming = files.slice(0, room);

    const drafts: Picked[] = incoming.map((file, i) => ({
      id: ids?.[i] ?? crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      isVideo: file.type.startsWith("video/"),
      compressing: !file.type.startsWith("video/"),
      poster: file.type.startsWith("video/") && file.size <= MAX_ORIGINAL_BYTES ? makeVideoPoster(file).catch(() => null) : undefined,
    }));
    setPicked((p) => [...p, ...drafts]);
    // 書きかけとして端末に残す（戻したものは残してあるので、新しく選んだものだけ）
    if (!ids) drafts.forEach((d, i) => void saveDraftFile(user.uid, d.id, Date.now() + i, d.file));

    // 選んだ直後に圧縮まで済ませておく。投稿ボタンを押した時点で
    // 待ち時間がほぼゼロになり「送れた感」が出る。
    for (const d of drafts) {
      if (d.isVideo) {
        if (d.file.size > MAX_ORIGINAL_BYTES) {
          setPicked((p) => p.map((x) => x.id === d.id
            ? { ...x, compressing: false, error: "動画は60MBまでです" } : x));
        }
        continue;
      }
      try {
        const { blob, width, height } = await compressForTimeline(d.file);
        // 一覧用の小さい版は作り直した軽量版から描く（失敗しても投稿は止めない）
        const variants = await makeImageVariants(blob);
        setPicked((p) => p.map((x) => x.id === d.id
          ? { ...x, compressing: false, compressed: blob, width, height, variants } : x));
      } catch {
        setPicked((p) => p.map((x) => x.id === d.id
          ? { ...x, compressing: false, error: "画像を処理できませんでした" } : x));
      }
    }
  }

  function remove(id: string) {
    setPicked((p) => {
      const target = p.find((x) => x.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return p.filter((x) => x.id !== id);
    });
    void removeDraftFile(id);
  }

  // 残した写真・動画を読み直す（開いたときに1回だけ）
  useEffect(() => {
    let cancelled = false;
    void readDraftFiles(user.uid).then((files) => {
      if (cancelled || files.length === 0) return;
      setRestored(true);
      void addFiles(files.map((f) => f.file), files.map((f) => f.id));
    });
    return () => {
      cancelled = true;
    };
    // 開いたときに1回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 書きかけを消して、空の投稿画面にする（「書きかけを消す」） */
  function discardDraft() {
    picked.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPicked([]);
    setText("");
    setEpisodeOn(false);
    setTheme("");
    setRestored(false);
    void clearComposerDraft(user.uid);
  }

  /**
   * ★「全員」と個別のタグは切り替え★（Issue #272。lib/visibility-scope.ts の toggleScope）
   *   個別のタグを選ぶと「全員」が外れ、「全員」を選ぶと個別のタグが外れ、個別のタグを全部外すと「全員」に戻る。
   * ★「新郎新婦」は単独でだけ選べる★ 選ぶとほかのタグが外れ、ほかのタグを選ぶと「新郎新婦」が外れる。
   *   混ぜると、そのタグの人にも見えてしまう。Rules も ['couple'] ちょうどでない組み合わせを拒む。
   */
  const canAll = available.some((t) => t.id === ALL_TAG);
  function toggleTag(id: string) {
    setSelected((s) => toggleScope(s, id, canAll));
  }
  const coupleOnly = selected.length === 1 && selected[0] === COUPLE_TAG;

  const preparing = picked.some((p) => p.compressing);
  const hasError = picked.some((p) => p.error);
  const needsThemeText = episodeOn && !text.trim();
  const canSubmit =
    !busy && !preparing && !hasError && selected.length > 0 &&
    (!episodeOn || (Boolean(theme) && !needsThemeText)) &&
    (text.trim().length > 0 || picked.length > 0);

  const placeholder = episodeOn && theme ? themeDef(theme).prompt : DEFAULT_PLACEHOLDER;
  const hasDraft = text.trim().length > 0 || picked.length > 0 || episodeOn;

  /** 投稿できない理由（押せる状態なら null） */
  function blockedReason(): string | null {
    if (busy) return null;
    if (text.trim().length === 0 && picked.length === 0) return "写真か一言を入れると投稿できます";
    if (preparing) return "写真を準備しています。少しお待ちください";
    if (hasError) return "処理できなかった写真を外してください";
    if (selected.length === 0) return "公開範囲を1つ以上選んでください";
    if (episodeOn && !theme) return "思い出エピソードのお題を選んでください";
    if (needsThemeText) return "エピソードには一言が必要です（写真だけでは登録できません）";
    return null;
  }

  // 知らせは少しで消す。入力が変わったら出さない（hint の★参照）
  const inputKey = `${text}|${picked.length}|${selected.join(",")}|${episodeOn}|${theme}|${preparing}|${hasError}`;
  const shownHint = hint && hint.key === inputKey ? hint.text : null;
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), COMPOSER_HINT_MS);
    return () => clearTimeout(t);
  }, [hint]);

  function onSubmitTap() {
    if (busy) return;
    const reason = blockedReason();
    if (reason) {
      setHint({ text: reason, key: inputKey });
      return;
    }
    void onSubmit();
  }

  function onCancel() {
    if (busy) return;
    if (hasDraft && !confirm("下書きを捨てますか？")) return;
    void clearComposerDraft(user.uid);
    onClose();
  }

  const scopeLabel = coupleOnly
    ? "新郎新婦だけ"
    : selected.length > 0
      ? scopeNames(selected)
      : "未選択";

  /**
   * 「投稿する」（Issue #254）。★送信は待たない★ 押した時点の投稿（PostDraft）を送信の列に渡し、すぐ閉じる。
   *   送信（軽量版 → createPost → メンションの通知 → 顔検出 → 高画質版の列 → エピソード）は usePostOutbox が続ける。
   *   処理の中身は今までと同じ（lib/post-send.ts に移しただけ）。
   * ★端末の写真の URL（previewUrl）は解放しない★ 送信中の投稿の表示に使う。解放は列が入れ替えのあとに行う。
   */
  function onSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setHint(null);
    // お題を選んでいればハッシュタグを付ける。投稿本文とエピソード本文で同じテキストを使う
    const finalText = episodeOn ? withThemeHashtag(text, theme) : text;
    const draft: PostDraft = {
      postId: newPostId(),
      uid: user.uid,
      displayName: name,
      photoURL,
      text: finalText,
      visibleToTags: selected,
      mentioned: mention.mentioned,
      coupleOnly,
      items: picked.map((p) => ({
        id: p.id, file: p.file, previewUrl: p.previewUrl, isVideo: p.isVideo,
        compressed: p.compressed, width: p.width, height: p.height, variants: p.variants, poster: p.poster,
      })),
      episode: episodeOn ? { theme } : null,
    };
    onSubmitDraft(draft);
    // 送信の列に渡したので、端末の書きかけは消す（送れなかったときは列が「もう一度送る」を出す）
    void clearComposerDraft(user.uid);

    // フォームを片付ける（写真の URL は列に渡したので解放しない）
    setText("");
    mention.reset();
    setPicked([]);
    setEpisodeOn(false);
    setTheme("");
    setBusy(false);
    // 呼び出し側が画面を閉じ、タイムラインの一番上（送信中の投稿）を見せる
    onPosted();
  }

  const ready = blockedReason() === null && !busy;
  const pickDisabled = busy || !storageReady || picked.length >= MAX_MEDIA_PER_POST;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* ---- 上のバー（固定）。スクロールする箱の外に置く ---- */}
      <div className="shrink-0 border-b border-stone-200/80 bg-white pt-[env(safe-area-inset-top)]">
        <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center px-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-[var(--inv-tap)] justify-self-start touch-manipulation rounded-full px-3 text-sm text-stone-600 disabled:opacity-40"
          >
            キャンセル
          </button>
          {/* 操作のバーの見出しはゴシック（Issue #227。押す部品と並ぶため）。強弱は太さで付ける */}
          <h2 className="text-[length:calc(16px*var(--inv-scale))] font-semibold text-stone-900">新しい投稿</h2>
          <button
            type="button"
            onClick={onSubmitTap}
            aria-disabled={!ready}
            className={`min-h-[var(--inv-tap)] justify-self-end touch-manipulation rounded-full px-4 text-sm font-medium transition ${
              // ★押せるときは押す場所の色（テラコッタ・sub）★（Issue #236）
              ready ? "bg-sub-600 text-white hover:bg-sub-700" : "bg-stone-100 text-stone-400"
            }`}
          >
            {busy ? "送信中…" : preparing ? "準備中…" : "投稿する"}
          </button>
        </div>
        {shownHint && (
          <p role="status" className="px-4 pb-2 text-right text-xs text-stone-500">
            {shownHint}
          </p>
        )}
      </div>

      {/* ---- 本体（ここだけスクロールする） ---- */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
        {/* 前回の書きかけを戻したとき（Issue #273） */}
        {restored && hasDraft && (
          <div role="status" className="mb-3 flex items-center justify-between gap-3 border-b border-stone-200 pb-2">
            <p className="text-xs text-stone-500">書きかけがあります。続きから書けます。</p>
            <button type="button" onClick={discardDraft} className="min-h-[var(--inv-tap)] shrink-0 touch-manipulation px-1 text-xs text-stone-500 underline underline-offset-4">
              書きかけを消す
            </button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => void onPick(e.target.files)}
        />

        {/* 1. 写真・動画（主役）。選ぶ前は幅いっぱいの大きな枠、選んだあとはサムネイルと「＋ 追加」 */}
        {picked.length === 0 ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pickDisabled}
            title={storageReady ? undefined : "Storage バケットが未設定です"}
            className="flex h-40 w-full touch-manipulation flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 text-stone-600 transition hover:bg-stone-100 disabled:opacity-40"
          >
            <CameraIcon className="h-8 w-8" />
            <span className="text-sm font-medium">写真・動画を選ぶ</span>
            <span className="text-[length:calc(11px*var(--inv-scale))] text-stone-400">{MAX_MEDIA_PER_POST}枚まで</span>
          </button>
        ) : (
          <div>
            <div className="grid grid-cols-3 gap-2">
              {picked.map((p) => (
                <div key={p.id} className="group relative aspect-square overflow-hidden rounded-xl bg-stone-100">
                  {p.isVideo ? (
                    <video src={p.previewUrl} muted playsInline className="h-full w-full object-cover" />
                  ) : (
                    // 端末の中の画像（blob:）のプレビュー。next/image を通す意味がないので <img> を使う
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
                  )}

                  {p.compressing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
                    </div>
                  )}
                  {p.error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-rose-50/90 p-1 text-center text-[length:calc(10px*var(--inv-scale))] leading-tight text-rose-700">
                      {p.error}
                    </div>
                  )}

                  {/* 24px だと指で外しやすく「反応しない」と感じられるため、
                      見た目は据え置きで当たり判定だけ広げる */}
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    disabled={busy}
                    aria-label="この写真を外す"
                    className="absolute right-0 top-0 flex h-11 w-11 touch-manipulation items-center justify-center text-white"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-xs transition active:bg-black/80">
                      ×
                    </span>
                  </button>
                </div>
              ))}
              {picked.length < MAX_MEDIA_PER_POST && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={pickDisabled}
                  className="flex aspect-square touch-manipulation flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-40"
                >
                  <span aria-hidden className="text-xl leading-none">＋</span>
                  追加
                </button>
              )}
            </div>
            <p className="mt-1.5 text-right text-[length:calc(11px*var(--inv-scale))] tabular-nums text-stone-400">
              {picked.length}/{MAX_MEDIA_PER_POST}
            </p>
          </div>
        )}

        {/* 2. 一言 */}
        <div className="relative mt-4">
          <textarea
            ref={textInput}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              mention.track(e.currentTarget);
            }}
            onSelect={(e) => mention.track(e.currentTarget)}
            onFocus={(e) => mention.track(e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === "Escape") mention.suggestions.close();
            }}
            rows={episodeOn ? 5 : 3}
            maxLength={2000}
            placeholder={placeholder}
            aria-label="一言"
            // ★文字は 16px 以上★ iOS は 16px 未満の入力欄にフォーカスすると画面を拡大する
            className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50/50 p-3 text-base leading-relaxed text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-300 focus:bg-white"
          />
          {/* 候補は入力欄のすぐ下に重ねる（キーボードには隠れない） */}
          <MentionSuggestions state={mention.suggestions} className="top-full" />
        </div>

        {/* 3. 公開範囲（1行にたたむ。押すとタグを選ぶシート） */}
        <button
          type="button"
          onClick={() => setScopeOpen(true)}
          disabled={busy}
          className="mt-4 flex min-h-[max(3rem,var(--inv-tap))] w-full touch-manipulation items-center gap-3 rounded-xl border border-stone-200 px-3 text-left hover:bg-stone-50 disabled:opacity-40"
        >
          <span className="shrink-0 text-sm text-stone-500">公開範囲</span>
          <span className={`min-w-0 flex-1 truncate text-right text-sm font-medium ${selected.length > 0 ? "text-stone-900" : "text-amber-700"}`}>
            {scopeLabel}
          </span>
          <span aria-hidden className="shrink-0 text-stone-400">›</span>
        </button>

        {/* 4. 思い出エピソード（チェックしたときに、お題と説明を開く） */}
        <div className={`mt-4 rounded-xl border transition ${
          // 無彩色（Issue #236。ピンクはいいねにだけ使う）
          episodeOn ? "border-stone-300 bg-stone-50" : "border-stone-200 bg-stone-50/40"
        }`}>
          <label className="flex cursor-pointer items-start gap-2.5 p-3">
            <input
              type="checkbox"
              checked={episodeOn}
              onChange={(e) => {
                setEpisodeOn(e.target.checked);
                if (!e.target.checked) setTheme("");
              }}
              className="mt-0.5 h-4 w-4 shrink-0 accent-stone-900"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-stone-800">
                思い出エピソードも投稿する
              </span>
              <span className="block text-[length:calc(11px*var(--inv-scale))] leading-relaxed text-stone-500">
                おふたりが確認したうえで、当日のムービーや
                おもてなしAIの会話に使わせていただきます。
              </span>
            </span>
          </label>

          {episodeOn && (
            <div className="border-t border-stone-200 p-3">
              <p className="mb-1.5 text-xs font-medium text-stone-600">
                お題を選んでください
              </p>
              <div className="flex flex-wrap gap-1.5">
                {EPISODE_THEMES.map((t) => {
                  const on = theme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTheme(t.id)}
                      aria-pressed={on}
                      className={`min-h-9 touch-manipulation rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${
                        // お題のチップも無彩色（Issue #236）。選んでいるものは墨の枠と文字
                        on ? "bg-white font-semibold text-stone-900 ring-stone-900" : "bg-white text-stone-400 ring-tagline hover:bg-stone-50"
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {theme && (
                <p className="mt-2 text-[length:calc(11px*var(--inv-scale))] leading-relaxed text-stone-500">
                  {themeDef(theme).prompt}
                  {theme !== "other" && (
                    <span className="mt-0.5 block text-stone-400">
                      投稿時に <span className="text-sky-600">#{themeDef(theme).label}</span> が付きます
                    </span>
                  )}
                </p>
              )}

              {needsThemeText && (
                <p className="mt-2 text-[length:calc(11px*var(--inv-scale))] text-amber-700">
                  エピソードには本文が必要です。写真だけでは登録できません。
                </p>
              )}
              <p className="mt-2 text-[length:calc(11px*var(--inv-scale))] leading-relaxed text-stone-400">
                エピソードも公開範囲（{scopeLabel}）の方にだけ使われます。
              </p>
            </div>
          )}
        </div>

        {error && <p role="alert" className="mt-4 text-sm text-rose-600">{error}</p>}
      </div>

      {scopeOpen && (
        <ScopeSheet
          options={available}
          selected={selected}
          coupleOnly={coupleOnly}
          onSelect={toggleTag}
          onClose={() => setScopeOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * 公開範囲を選ぶシート（投稿画面の上に、下から出す）。チップは今までと同じ TagChips（ランキングと共通）。
 * 選び方（「新郎新婦」は単独だけ）は Composer の toggleTag のまま。
 */
function ScopeSheet({
  options,
  selected,
  coupleOnly,
  onSelect,
  onClose,
}: {
  options: Parameters<typeof TagChips>[0]["options"];
  selected: string[];
  coupleOnly: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="composer-scope-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40"
    >
      <div
        className="composer-sheet-in w-full max-w-xl rounded-t-2xl bg-white px-4 pt-2 shadow-xl"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between">
          <p id="composer-scope-title" className="text-[length:calc(16px*var(--inv-scale))] font-semibold text-stone-900">公開範囲</p>
          <button type="button" onClick={onClose} className="min-h-[var(--inv-tap)] touch-manipulation px-2 text-sm font-medium text-stone-900">
            完了
          </button>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-stone-500">
          {coupleOnly
            ? "あなたと新郎新婦だけに表示されます"
            : selected.length > 0
              ? `${scopeNames(selected)} に表示されます`
              : "1つ以上選んでください"}
        </p>
        {/* チップの見た目と操作は、ランキングのグループの切り替えと共通（TagChips の★参照） */}
        <TagChips options={options} selected={selected} onSelect={onSelect} label="公開範囲" />
      </div>
    </div>,
    document.body,
  );
}

/**
 * 公開範囲の名前（「全員・新郎友人」）。★名前がまだ分からないカスタムタグは ID を出さず「…」にする★（Issue #231）
 *   Composer は useTags を呼んでいるので、辞書が届いたら描き直されて名前になる。
 */
function scopeNames(selected: readonly string[]): string {
  return scopeForDisplay(displayVisibleTags(selected)).map((t) => (isTagPending(t) ? "…" : tagDef(t).label)).join("・");
}
