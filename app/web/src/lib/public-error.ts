/**
 * ★クライアントにそのまま見せてよいエラー★
 *
 *   API の catch では、この型のエラーだけメッセージを返し、それ以外は
 *   「サーバー内部エラー」に置き換える。例外の本文には Firestore / AWS / Vertex AI の
 *   プロジェクト ID・アカウント ID・内部のパスなどが混ざることがあるため。
 *   詳細は各ルートの console.error から Sentry に残る。画面のエラーに付く
 *   「ID: xxxxxxxx」（api-client.ts）で、Sentry を request_id:xxxxxxxx* と検索できる。
 *
 *     throw new PublicError("Custom Claims が上限に達しました"); // 見せてよい
 *     return fail(safeMessage(e), 500);                          // catch 側
 */
export class PublicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicError";
  }
}

export function safeMessage(e: unknown, fallback = "サーバー内部エラー"): string {
  return e instanceof PublicError ? e.message : fallback;
}
