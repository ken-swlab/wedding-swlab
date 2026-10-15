/**
 * 公開バケット（wedding-media.sw-lab.net）の読み込みの制限（Issue #123）。
 *
 * Cloudflare のルールで、Referer がサイト（https://wedding.sw-lab.net/）でない読み込みを拒否する
 * （ルールの内容と切り戻し: docs/security/media-referer.md）。
 * ★これは抑止で、防御ではない★ Referer は誰でも偽装できる。URL を貼る・送る・埋め込む、を止めるだけ。
 *
 * ★サーバーからの取得にも Referer を付ける★
 *   ブラウザの <img> にはサイトの Referer が付くが、サーバーの fetch には付かない。
 *   付け忘れると、ルールを置いた瞬間に顔検出（/api/faces/detect・admin/faces/match・retry）がすべて失敗する。
 *   秘密ではない（ブラウザが送るのと同じ値）。
 * ★ルールの許可の条件（starts_with）と、この値をそろえる★ 末尾のスラッシュまで含めて一致させる。
 */
export const MEDIA_FETCH_REFERER = "https://wedding.sw-lab.net/";
