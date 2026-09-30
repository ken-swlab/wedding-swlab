#!/usr/bin/env python3
"""
本番の CSP を外側から確かめる（読み取りのみ）。

  python3 scripts/csp-verify.py                                 いまの状態を判定
  python3 scripts/csp-verify.py --expect report-only --wait 900 新しいデプロイを待ってから判定
  python3 scripts/csp-verify.py --expect enforce --wait 900

  見ること:
    - ページの CSP が期待どおりのモード（Report-Only / 強制）で、nonce を含む
    - HTML の <script> がすべて同じ nonce を持つ（付いていないものがあれば、強制した瞬間に止まる）
    - リクエストごとに nonce が変わる（静的に固定されていない）
    - /api には固定の厳しい CSP、ページには X-Robots-Tag
    - 画像圧縮ライブラリが自前で配信されている
"""
import argparse
import os
import re
import sys
import time
import urllib.error
import urllib.request

UA = "wedding-swlab-csp-verify/1.0"
PAGES = ["/invitation", "/admin"]
SCRIPT_TAG = re.compile(r"<script\b[^>]*>", re.I)
NONCE_ATTR = re.compile(r'\bnonce="([^"]*)"', re.I)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Cache-Control": "no-cache"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, res.headers, res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.headers, ""
    except (urllib.error.URLError, OSError) as e:
        return 0, {}, str(e)


def page_policy(headers):
    """(モード, ポリシー) を返す"""
    enforce = headers.get("content-security-policy") if headers else None
    report = headers.get("content-security-policy-report-only") if headers else None
    if enforce:
        return "enforce", enforce
    if report:
        return "report-only", report
    return "none", ""


def nonce_of(policy):
    m = re.search(r"script-src[^;]*'nonce-([A-Za-z0-9+/=_-]+)'", policy)
    return m.group(1) if m else None


def check(base, expect):
    results = []

    def add(ok, msg):
        results.append(ok)
        print(("  PASS " if ok else "  FAIL ") + msg)

    for path in PAGES:
        url = base + path
        print(f"\n[{path}]")
        s1, h1, body1 = get(url)
        s2, h2, _ = get(url)
        add(s1 == 200, f"HTTP {s1}")
        mode, policy = page_policy(h1)
        add(mode == expect, f"CSP のモード: {mode}（期待: {expect}）")
        n1 = nonce_of(policy)
        n2 = nonce_of(page_policy(h2)[1])
        add(bool(n1), "script-src に nonce がある")
        add(bool(n1 and n2 and n1 != n2), "リクエストごとに nonce が変わる（動的レンダリング）")
        add("'strict-dynamic'" in policy, "'strict-dynamic' を含む")
        tags = SCRIPT_TAG.findall(body1)
        missing = [t[:90] for t in tags if (NONCE_ATTR.search(t) or [None, None])[1] != n1]
        add(bool(tags) and not missing, f"<script> {len(tags)} 個すべてに同じ nonce が付いている")
        for t in missing[:3]:
            print("         nonce なし/不一致: " + t)
        if expect == "enforce":
            add("frame-ancestors 'none'" in policy, "frame-ancestors 'none'（強制時のみ）")
        add("report-uri" in policy, "違反の報告先（report-uri）がある")
        add(bool(h1 and "noindex" in (h1.get("x-robots-tag") or "")), "X-Robots-Tag: noindex")
        print("  INFO Cloudflare 経由: " + ("はい（cf-ray あり）" if h1 and h1.get("cf-ray") else "いいえ（DNS のみ）")
              + " / x-vercel-id: " + ((h1.get("x-vercel-id") if h1 else None) or "-"))

    print("\n[/api/health]")
    s, h, _ = get(base + "/api/health")
    api_csp = (h.get("content-security-policy") if h else "") or ""
    add(s == 200, f"HTTP {s}")
    add(api_csp.startswith("default-src 'none'"), "API に固定の CSP（default-src 'none'）")
    add(not (h and h.get("content-security-policy-report-only")), "API に Report-Only が残っていない")

    print("\n[/vendor/browser-image-compression.js]")
    s, h, body = get(base + "/vendor/browser-image-compression.js")
    add(s == 200 and "javascript" in ((h.get("content-type") if h else "") or ""), f"HTTP {s} / JavaScript として配信")
    add("imageCompression" in body, "中身が browser-image-compression")

    return all(results)


def main():
    ap = argparse.ArgumentParser()
    # Preview のURLを確かめるときは CSP_VERIFY_BASE=https://xxxx.vercel.app を付けて実行する
    ap.add_argument("--base", default=os.environ.get("CSP_VERIFY_BASE", "https://wedding.sw-lab.net"))
    ap.add_argument("--expect", choices=["report-only", "enforce"], default=None)
    ap.add_argument("--wait", type=int, default=0, help="新しいデプロイを最大この秒数だけ待つ")
    args = ap.parse_args()
    base = args.base.rstrip("/")

    expect = args.expect
    if args.wait and expect:
        deadline = time.time() + args.wait
        print(f"{expect} の nonce 版 CSP が出るまで待機します（最大 {args.wait} 秒）", flush=True)
        while True:
            _, h, _ = get(base + PAGES[0])
            mode, policy = page_policy(h)
            if mode == expect and nonce_of(policy):
                print("新しいデプロイを確認しました")
                break
            if time.time() > deadline:
                print("時間切れ。Vercel のデプロイ状況を確認してください")
                break
            time.sleep(15)
    if expect is None:
        _, h, _ = get(base + PAGES[0])
        expect = page_policy(h)[0]
        print(f"現在のモード: {expect}")

    ok = check(base, expect)
    print("\n判定: " + ("すべて PASS" if ok else "FAIL あり（出力を共有してください）"))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
