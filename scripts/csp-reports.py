#!/usr/bin/env python3
"""
Sentry に届いている CSP 違反レポートを一覧にする（読み取りのみ）。

  python3 scripts/csp-reports.py               直近14日
  python3 scripts/csp-reports.py --hours 24    直近24時間に発生したものだけ
  python3 scripts/csp-reports.py --hours 24 --after-nonce
                                               nonce 版 CSP を入れた後の判定（出てはいけないものを要確認にする）

  必要なもの: Sentry の Personal Token（権限は event:read だけでよい）
    Sentry → User Settings → Personal Tokens → Create New Token
    実行時に入力を求める（画面に表示しない）。環境変数 SENTRY_READ_TOKEN でも渡せる。

  組織 ID とプロジェクト ID は DSN から取る。DSN は NEXT_PUBLIC_SENTRY_DSN →
  app/web/.env.local → 本番の CSP ヘッダ（report-uri）の順に探す。
"""
import argparse
import getpass
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JST = timezone(timedelta(hours=9))
UA = "wedding-swlab-csp-reports/1.0"

# 既知の違反と扱い: (含まれる語, nonce 導入前の説明, nonce 導入後の説明)
#   導入後にも出るものは、設定漏れの兆候なので要確認に倒す
KNOWN = [
    (("csp-test.invalid",), "P6-FIX2 の疎通テスト。無視してよい", "P6-FIX2 の疎通テスト。無視してよい"),
    (("apis.google.com",), "Firebase Auth が読む gapi。nonce + strict-dynamic で許可される",
     "★要確認★ strict-dynamic 下では出ないはず"),
    (("cdn.jsdelivr.net",), "画像圧縮ワーカーの CDN 読み込み。自前配信に切り替えて解消",
     "★要確認★ /vendor の配信か libURL を確認"),
    (("media", "data"), "無音 WAV（unlockAudio）。media-src に data: を追加して解消",
     "★要確認★ media-src を確認"),
    (("inline", "script"), "Next.js のインラインスクリプト。nonce で解消",
     "★要確認★ nonce の付いていないページがある（静的生成に戻っていないか）"),
    (("vercel.live",), "Vercel ツールバー（ログイン中の本人のみ）。無視してよい",
     "Vercel ツールバー（ログイン中の本人のみ）。無視してよい"),
    (("extension",), "ブラウザ拡張機能。無視してよい", "ブラウザ拡張機能。無視してよい"),
    (("eval",), "★要確認★ eval の使用（開発サーバー以外で出ていれば）",
     "★要確認★ eval の使用（開発サーバー以外で出ていれば）"),
]


def find_dsn(site):
    dsn = os.environ.get("NEXT_PUBLIC_SENTRY_DSN")
    if dsn:
        return dsn, "環境変数"
    env_local = os.path.join(ROOT, "app", "web", ".env.local")
    try:
        with open(env_local, encoding="utf-8") as f:
            for line in f:
                m = re.match(r"\s*NEXT_PUBLIC_SENTRY_DSN\s*=\s*[\"']?([^\"'\s]+)", line)
                if m:
                    return m.group(1), "app/web/.env.local"
    except OSError:
        pass
    try:
        req = urllib.request.Request(site, method="GET", headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=20) as res:
            for name in ("content-security-policy", "content-security-policy-report-only"):
                value = res.headers.get(name) or ""
                m = re.search(r"report-uri\s+(\S+)", value)
                if m:
                    return m.group(1).rstrip(";"), f"本番ヘッダ({name})"
    except (urllib.error.URLError, OSError):
        pass
    return None, None


def parse_ids(dsn):
    """DSN / report-uri から (API のベースURL, 組織ID, プロジェクトID) を取り出す"""
    u = urllib.parse.urlparse(dsn)
    host = u.hostname or ""
    m_org = re.match(r"o(\d+)\.", host)
    m_prj = re.search(r"/api/(\d+)/", u.path) or re.match(r"/(\d+)/?$", u.path)
    if not (m_org and m_prj):
        return None
    base = os.environ.get("SENTRY_API_BASE") or ("https://de.sentry.io" if ".de." in host else "https://sentry.io")
    return base.rstrip("/"), m_org.group(1), m_prj.group(1)


def fetch_issues(base, org, project, token, query):
    params = urllib.parse.urlencode({"query": query, "statsPeriod": "14d", "limit": 100})
    url = f"{base}/api/0/projects/{org}/{project}/issues/?{params}"
    out = []
    for _ in range(5):
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                out.extend(json.loads(res.read().decode("utf-8") or "[]"))
                link = res.headers.get("Link") or ""
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                sys.exit(f"Sentry が {e.code} を返しました。トークンの権限（event:read）を確認してください")
            print(f"  （検索式 {query!r} は {e.code} で失敗。次の式を試します）")
            return out
        m = re.search(r'<([^>]+)>;\s*rel="next";\s*results="true"', link)
        if not m:
            break
        url = m.group(1)
    return out


def note_for(text, after_nonce):
    t = text.lower()
    for keys, before, after in KNOWN:
        if all(k in t for k in keys):
            return after if after_nonce else before
    return "★要確認★"


def parse_ts(ts):
    m = re.match(r"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(\.\d+)?(Z|[+-]\d\d:\d\d)?$", str(ts or ""))
    if not m:
        return None
    frac = (m.group(2) or "")[1:7]
    tz = m.group(3) or "Z"
    return datetime.fromisoformat(m.group(1) + ("." + frac.ljust(6, "0") if frac else "")
                                  + ("+00:00" if tz == "Z" else tz))


def jst(ts):
    t = parse_ts(ts)
    return t.astimezone(JST).strftime("%m-%d %H:%M") if t else str(ts)[:16]


def main():
    ap = argparse.ArgumentParser(description="Sentry の CSP 違反を一覧にする")
    ap.add_argument("--hours", type=int, default=24 * 14)
    ap.add_argument("--site", default="https://wedding.sw-lab.net/invitation")
    ap.add_argument("--after-nonce", action="store_true", help="nonce 版の CSP を入れた後のレポートとして判定する")
    args = ap.parse_args()

    dsn, source = find_dsn(args.site)
    if not dsn:
        sys.exit("Sentry の DSN が見つかりません（NEXT_PUBLIC_SENTRY_DSN を設定して再実行）")
    ids = parse_ids(dsn)
    if not ids:
        sys.exit("DSN から組織 ID / プロジェクト ID を読み取れませんでした")
    base, org, project = ids
    print(f"DSN の取得元: {source} / 組織ID={org} プロジェクトID={project} / API={base}")

    token = os.environ.get("SENTRY_READ_TOKEN", "").strip()
    for _ in range(3):
        if token:
            break
        token = getpass.getpass("Sentry Personal Token（入力は表示されません）: ").strip()
    if not token:
        sys.exit("トークンが空です")

    issues = {}
    for q in ("event.type:csp", "logger:csp"):
        for it in fetch_issues(base, org, project, token, q):
            issues[it.get("id")] = it

    since = datetime.now(timezone.utc) - timedelta(hours=args.hours)
    rows = []
    for it in issues.values():
        last = parse_ts(it.get("lastSeen"))
        if last and last < since:
            continue
        md = it.get("metadata") or {}
        text = " ".join(str(x) for x in (it.get("title"), it.get("culprit"), md.get("directive"), md.get("uri"), md.get("message")) if x)
        rows.append((it.get("lastSeen", ""), it, md, note_for(text, args.after_nonce)))
    rows.sort(key=lambda r: r[0], reverse=True)

    print(f"\n直近{args.hours}時間に発生した CSP 違反: {len(rows)} 種類\n")
    for last, it, md, note in rows:
        print(f"{jst(last)}  {str(it.get('count', '?')):>6}回 {str(it.get('userCount', '?')):>4}人  "
              f"[{it.get('status', '?')}] {it.get('title', '')}")
        detail = " / ".join(x for x in (md.get("directive"), md.get("uri")) if x)
        if detail:
            print(f"                 {detail}")
        print(f"                 → {note}")
    if not rows:
        print("（該当なし）")
    unknown = sum(1 for r in rows if r[3].startswith("★要確認★"))
    print(f"\n要確認: {unknown} 種類" + ("（この出力を共有してください）" if unknown else ""))


if __name__ == "__main__":
    main()
