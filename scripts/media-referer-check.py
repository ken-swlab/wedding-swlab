#!/usr/bin/env python3
"""
公開バケットの Referer の制限を、外側から確かめる（読み取りのみ。Issue #123）。

  python3 scripts/media-referer-check.py <写真の URL>
  python3 scripts/media-referer-check.py <写真の URL> --expect off      ルールを置く前（すべて通る）
  python3 scripts/media-referer-check.py <写真の URL> --expect strict   空の Referer も拒否する案（既定）
  python3 scripts/media-referer-check.py <写真の URL> --expect lenient  空の Referer は通す案

  ★URL は引数で渡す。リポジトリに書かない★（公開リポジトリ。本物のゲストの写真の URL が残る）
    テスト用のゲストで投稿した写真の URL を使う。

  同じ URL を、Referer の付け方を変えて 4 回 GET し、ステータスを比べる:
    サイトから          Referer: https://wedding.sw-lab.net/        → 通る（200）
    サイトのページから  Referer: https://wedding.sw-lab.net/guestbook → 通る（200）
    Referer なし        （アドレス欄に貼る・アプリで開く）          → strict は拒否（403）、lenient は通る
    ほかのサイトから    Referer: https://example.com/               → 拒否（403）

  ★キャッシュを避けるため、URL にクエリ（?referer-check=時刻）を付ける★
    Cloudflare のルール（WAF）はキャッシュより前に効くので、付けなくても判定は同じ。
    付けるのは、ブラウザやプロキシのキャッシュに惑わされないため。
"""
import argparse
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = "wedding-swlab-referer-check/1.0"
SITE = "https://wedding.sw-lab.net/"
MEDIA_HOSTS = {"wedding-media.sw-lab.net", "media.wedding.sw-lab.net"}

CASES = [
    # (名前, Referer, strict で通るか, lenient で通るか)
    ("サイトから", SITE, True, True),
    ("サイトのページから", SITE + "guestbook", True, True),
    ("Referer なし", None, False, True),
    ("ほかのサイトから", "https://example.com/", False, False),
]


def status_of(url, referer):
    headers = {"User-Agent": UA, "Cache-Control": "no-cache"}
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            res.read(1024)
            return res.status
    except urllib.error.HTTPError as e:
        return e.code
    except (urllib.error.URLError, OSError):
        return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url", help="公開バケットの写真の URL（テスト用のゲストのもの）")
    ap.add_argument("--expect", choices=["strict", "lenient", "off"], default="strict")
    args = ap.parse_args()

    parsed = urllib.parse.urlparse(args.url)
    if parsed.scheme != "https" or parsed.hostname not in MEDIA_HOSTS:
        print(f"公開バケットの https の URL を渡してください（{' / '.join(sorted(MEDIA_HOSTS))}）")
        return 2
    sep = "&" if parsed.query else "?"
    url = f"{args.url}{sep}referer-check={int(time.time())}"

    failed = 0
    for name, referer, strict_ok, lenient_ok in CASES:
        code = status_of(url, referer)
        should_pass = {"strict": strict_ok, "lenient": lenient_ok, "off": True}[args.expect]
        passed = code == 200
        if code == 0:
            mark, failed = "NG", failed + 1
            note = "接続できない"
        elif code == 404:
            mark, failed = "NG", failed + 1
            note = "写真が無い（URL を確かめる。消した投稿の写真は 404 になる）"
        elif passed == should_pass:
            mark = "OK"
            note = "通る" if passed else "拒否"
        else:
            mark, failed = "NG", failed + 1
            note = f"{'通る' if should_pass else '拒否'}はずが{'通った' if passed else '拒否された'}"
        print(f"[{mark}] {name:<12} HTTP {code}  {note}")

    print()
    if failed:
        print(f"期待（{args.expect}）と違う結果が {failed} 件あります")
        if args.expect != "off":
            print("サイトからの読み込みまで拒否されていたら、すぐにルールを無効にする（docs/security/media-referer.md §4）")
        return 1
    print(f"期待（{args.expect}）どおりです")
    return 0


if __name__ == "__main__":
    sys.exit(main())
