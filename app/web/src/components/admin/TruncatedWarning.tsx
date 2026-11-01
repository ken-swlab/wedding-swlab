import { ADMIN_GUESTS_LIMIT } from "@/hooks/useAdminGuests";

/**
 * ゲストの読み込みが上限（ADMIN_GUESTS_LIMIT 件）に届いたときの警告（Issue #203）。
 * guests / guestPrivate / guestAdmin を別々に読んで uid で突き合わせているので、取りこぼすと
 * 名前が空の行・紐付けの候補に出ない行ができる。気づけるように、管理画面の上に出す。
 */
export function TruncatedWarning() {
  return (
    <div role="alert" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
      ゲストの読み込みが上限（{ADMIN_GUESTS_LIMIT} 件）に達しました。一部のゲストが表示されていない、または名前が空で表示されている可能性があります。上限を引き上げる必要があります（hooks/useAdminGuests.ts）。
    </div>
  );
}
