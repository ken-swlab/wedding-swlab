/**
 * ファイルの入力欄（<input type="file">）から選ばれたファイルを取り出し、入力欄を空にする（Issue #278）。
 *
 * ★先に取り出してから空にする★ input.files（FileList）は入力欄とつながっていて、value = "" で中身も空になる。
 *   空にしてから Array.from(files) すると0件になり、選んだ写真が投稿画面に載らなかった（#276 で入れた不具合）。
 * ★空にするのは、同じ写真をもう一度選んでも change が来るようにするため★
 * ★このファイルは `@/` で値を import しない★（tests/ が Node でそのまま読み込む）
 */
export function takeFiles(files: ArrayLike<File> | null | undefined, input: { value: string } | null | undefined): File[] {
  const list = files ? Array.from(files) : [];
  if (input) input.value = "";
  return list;
}
