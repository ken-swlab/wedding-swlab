#!/usr/bin/env python3
"""
個人情報コレクションの閲覧ログ（Cloud Logging の pii-access バケット）を表にする。
  --hours 168  直近7日 / --staff 管理者・SA・Google アカウントだけ / --denied 拒否だけ
  --keys  項目名と型だけ（値は出さない） / --check-minimized "<フィルタ>"  第2段階の突き合わせ
プロジェクトとリージョンは infra/terraform/terraform.tfvars から読む。
"""
import argparse
import json
import os
import re
import subprocess
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TFVARS = os.path.join(ROOT, "infra", "terraform", "terraform.tfvars")
JST = timezone(timedelta(hours=9))
DOC_RE = re.compile(r"/documents/(.+)$")


def tfvar(name):
    try:
        for line in open(TFVARS, encoding="utf-8"):
            m = re.match(r"\s*" + re.escape(name) + r'\s*=\s*"([^"]*)"', line)
            if m:
                return m.group(1)
    except OSError:
        pass
    return None


def read_logs(a, flt):
    cmd = ["gcloud", "logging", "read", flt, "--project", a.project, "--bucket", a.bucket,
           "--location", a.location, "--view", "_AllLogs", "--freshness", f"{a.hours}h",
           "--limit", str(a.limit), "--format", "json"]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except (OSError, subprocess.TimeoutExpired) as e:
        sys.exit(f"gcloud を実行できませんでした: {e}")
    if out.returncode != 0:
        sys.exit("gcloud logging read が失敗しました:\n" + out.stderr.strip()[-1500:])
    try:
        return json.loads(out.stdout or "[]")
    except json.JSONDecodeError:
        sys.exit("gcloud の出力を JSON として読めませんでした")


def jwt_payload(tp):
    stack = [tp]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            if isinstance(cur.get("payload"), dict):
                return cur["payload"]
            if "user_id" in cur or ("sub" in cur and "iss" in cur):
                return cur
            stack.extend(cur.values())
        elif isinstance(cur, list):
            stack.extend(cur)
    return None


def classify(e):
    auth = (e.get("protoPayload") or {}).get("authenticationInfo") or {}
    p = jwt_payload(auth.get("thirdPartyPrincipal"))
    if p:
        admin = p.get("admin") is True or str(p.get("admin")).lower() == "true"
        return ("ADMIN" if admin else "GUEST"), "uid:" + str(p.get("user_id") or p.get("sub") or "?")
    email = auth.get("principalEmail")
    if email:
        return ("SA" if email.endswith("gserviceaccount.com") else "USER"), email
    return "?", "(不明)"


def code(e):
    try:
        return int(((e.get("protoPayload") or {}).get("status") or {}).get("code") or 0)
    except (TypeError, ValueError):
        return -1


def targets(e):
    pp, found = e.get("protoPayload") or {}, []

    def walk(x, key=""):
        if isinstance(x, dict):
            for k, v in x.items():
                walk(v, k)
        elif isinstance(x, list):
            for v in x:
                walk(v, key)
        elif isinstance(x, str):
            m = DOC_RE.search(x)
            if m:
                found.append(m.group(1))
            elif key == "collectionId":
                found.append(x + "/*")

    walk(pp.get("request") or {})
    m = DOC_RE.search(pp.get("resourceName") or "")
    if not found and m:
        found.append(m.group(1))
    u = list(dict.fromkeys(found))
    return (", ".join(u[:3]) + (f" 他{len(u) - 3}件" if len(u) > 3 else "")) or "-"


def parse_ts(ts):
    m = re.match(r"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(\.\d+)?(Z|[+-]\d\d:\d\d)?$", ts or "")
    if not m:
        return None
    frac = (m.group(2) or "")[1:7]
    tz = m.group(3) or "Z"
    return datetime.fromisoformat(m.group(1) + ("." + frac.ljust(6, "0") if frac else "")
                                  + ("+00:00" if tz == "Z" else tz))


def row(e):
    pp = e.get("protoPayload") or {}
    kind, who = classify(e)
    ts = parse_ts(e.get("timestamp"))
    t = ts.astimezone(JST).strftime("%m-%d %H:%M:%S") if ts else str(e.get("timestamp", ""))[:19]
    method = (pp.get("methodName") or "?").rsplit(".", 1)[-1]
    ip = (pp.get("requestMetadata") or {}).get("callerIp", "-")
    c = code(e)
    return f"{t}  {kind:<5} {who[:36]:<36} {method:<18} {targets(e)[:56]:<56} ip={ip} {'OK' if c == 0 else f'DENIED({c})'}"


def flatten(x, prefix):
    if isinstance(x, dict):
        for k, v in x.items():
            yield from flatten(v, f"{prefix}.{k}")
    elif isinstance(x, list):
        yield from (flatten(x[0], prefix + "[]") if x else [(prefix, "list")])
    else:
        yield prefix, type(x).__name__


def show_keys(entries):
    seen = set()
    for e in entries:
        kind = classify(e)[0]
        if kind in seen:
            continue
        seen.add(kind)
        print(f"\n--- {kind} の記録の項目 ---")
        for path, typ in flatten(e.get("protoPayload") or {}, "protoPayload"):
            if re.match(r"protoPayload\.(authenticationInfo|status|methodName|request\b|resourceName|requestMetadata\.callerIp)", path):
                print(f"  {path}: {typ}")


def check_minimized(a, full):
    kept_entries = read_logs(a, a.check_minimized)
    kept = {e.get("insertId") for e in kept_entries}
    must = [e for e in full if not (classify(e)[0] == "GUEST" and code(e) == 0)]
    lost = [e for e in must if e.get("insertId") not in kept]
    leaked = [e for e in kept_entries if classify(e)[0] == "GUEST" and code(e) == 0]
    admins = sum(1 for e in must if classify(e)[0] == "ADMIN")
    print(f"\n残すべき記録 {len(must)} 件（うち管理者 {admins} 件）/ 捨ててよい記録 {len(full) - len(must)} 件"
          f" / 第2段階で残る記録 {len(kept_entries)} 件")
    ok = admins > 0 and not lost and not leaked
    if admins == 0:
        print("  判定保留: 管理者の記録がまだ無い。管理画面のゲスト一覧を開いてから再実行")
    for e in lost[:5]:
        print("  NG 消えてしまう: " + row(e))
    if leaked:
        print(f"  NG ゲスト本人の読み取りが {len(leaked)} 件残る")
    if ok:
        print("  PASS: 第2段階に進んでよい")
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hours", type=int, default=24)
    ap.add_argument("--limit", type=int, default=500)
    ap.add_argument("--staff", action="store_true")
    ap.add_argument("--denied", action="store_true")
    ap.add_argument("--keys", action="store_true")
    ap.add_argument("--check-minimized", metavar="FILTER")
    ap.add_argument("--project")
    ap.add_argument("--location")
    ap.add_argument("--bucket", default="pii-access")
    a = ap.parse_args()
    a.project = a.project or tfvar("project_id")
    a.location = a.location or tfvar("region") or "asia-northeast1"
    if not a.project:
        sys.exit("プロジェクトが分かりません。--project で指定してください")

    base = (f'logName="projects/{a.project}/logs/cloudaudit.googleapis.com%2Fdata_access"'
            ' AND protoPayload.serviceName="firestore.googleapis.com"')
    entries = read_logs(a, base)
    print(f"{a.project} / {a.bucket} ({a.location}) 直近{a.hours}時間: {len(entries)} 件（上限 {a.limit}）")
    if a.keys:
        return show_keys(entries)
    if a.check_minimized:
        sys.exit(0 if check_minimized(a, entries) else 2)

    kinds = Counter(classify(e)[0] for e in entries)
    print("件数: " + ", ".join(f"{k}={v}" for k, v in sorted(kinds.items()))
          + f" / 拒否 {sum(1 for e in entries if code(e) != 0)} 件")
    print("  ADMIN=管理者 GUEST=ゲスト SA=サービスアカウント USER=Google アカウント\n")
    shown = [e for e in entries
             if (not a.staff or classify(e)[0] in ("ADMIN", "SA", "USER")) and (not a.denied or code(e) != 0)]
    for e in shown:
        print(row(e))
    if not shown:
        print("（該当なし）")


if __name__ == "__main__":
    main()
