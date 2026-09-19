"use client";

export function PendingApproval({
  nickname,
  approvedButStale,
  onEdit,
  onRefresh,
}: {
  nickname: string;
  /** 承認済みだが ID トークンにタグがまだ乗っていない過渡状態 */
  approvedButStale: boolean;
  onEdit: () => void;
  onRefresh: () => void;
}) {
  if (approvedButStale) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <p className="font-medium text-emerald-900">承認されました</p>
        <p className="mt-2 text-sm leading-relaxed text-emerald-800">
          まもなくゲストブックが開きます。
          <br />
          切り替わらない場合は下のボタンを押してください。
        </p>
        <button
          type="button"
          onClick={onRefresh}
          className="mt-5 rounded-full bg-emerald-700 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          読み込み直す
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
      <div
        aria-hidden
        className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-stone-700"
      />
      <p className="mt-6 font-medium text-stone-800">新郎新婦の承認をお待ちください</p>
      <p className="mt-2 text-sm leading-relaxed text-stone-500">
        {nickname ? `${nickname} 様の` : ""}ご回答を受け付けました。
        <br />
        承認されるとこの画面が自動で切り替わります。
      </p>
      <button
        type="button"
        onClick={onEdit}
        className="mt-6 text-sm text-stone-400 underline hover:text-stone-700"
      >
        入力内容を変更する
      </button>
    </div>
  );
}
