#!/usr/bin/env bash
# wedding-swlab: Cloudflare Workers -> Vercel webhook 経路の検証（読み取り専用）
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
WORKER_DIR="$ROOT/infra/workers/exif-stripper"
TOML="$WORKER_DIR/wrangler.toml"
VERCEL_CWD="${VERCEL_CWD:-$ROOT/app/web}"

APEX="${APEX:-sw-lab.net}"
APP_HOST="${APP_HOST:-wedding.sw-lab.net}"
MEDIA_HOST="${MEDIA_HOST:-media.wedding.sw-lab.net}"
HOOK_PATH="${HOOK_PATH:-/api/hooks/original-published}"

REQUIRED_ENV=(
  WORKER_WEBHOOK_SECRET
  R2_PUBLIC_BASE
  R2_ACCOUNT_ID
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
)

ok()  { printf '  \033[32mOK  \033[0m %s\n' "$*"; }
ng()  { printf '  \033[31mNG  \033[0m %s\n' "$*"; }
wn()  { printf '  \033[33mWARN\033[0m %s\n' "$*"; }
nfo() { printf '       %s\n' "$*"; }
sec() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

sec "1. wrangler.toml"
WEBHOOK_URL=""
PUBLIC_BASE=""
if [ ! -f "$TOML" ]; then
  ng "not found: $TOML"
else
  WEBHOOK_URL="$(sed -n 's/^[[:space:]]*WEBHOOK_URL[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$TOML" | head -n1)"
  PUBLIC_BASE="$(sed -n 's/^[[:space:]]*PUBLIC_BASE[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$TOML" | head -n1)"
  nfo "WEBHOOK_URL = ${WEBHOOK_URL:-(未設定)}"
  nfo "PUBLIC_BASE = ${PUBLIC_BASE:-(未設定)}"

  H="${WEBHOOK_URL#*://}"; H="${H%%/*}"
  case "$H" in
    "")            ng "WEBHOOK_URL が読み取れない" ;;
    *-git-*.vercel.app)
      wn "ブランチ追従URL($H)。ブランチ名が変わると壊れる。暫定利用のみ可" ;;
    *.vercel.app)
      if printf '%s' "$H" | grep -Eq -- '-[a-z0-9]{9}-[a-z0-9-]+\.vercel\.app$'; then
        ng "個別デプロイURL($H)。デプロイのたびに古いコードへPOSTし続ける。今すぐ変更すること"
      else
        wn "Production alias($H)。動作はするが最終的に $APP_HOST へ戻すこと"
      fi ;;
    "$APP_HOST")   ok "カスタムドメイン($H)" ;;
    *)             wn "想定外のホスト($H)" ;;
  esac

  if [ -n "$WEBHOOK_URL" ] && [ "${WEBHOOK_URL%"$HOOK_PATH"}" = "$WEBHOOK_URL" ]; then
    wn "WEBHOOK_URL の末尾が $HOOK_PATH ではない"
  fi
  case "$WEBHOOK_URL" in */) wn "末尾スラッシュあり。Next.js が 308 を返して余計な往復が発生する" ;; esac
fi

sec "2. どの層で止まっているか（x-vercel-id 判定）"
probe() {
  local url="$1" hdr code vid cfray loc
  hdr="$(mktemp)"
  code="$(curl -sS --max-time 20 -o /dev/null -D "$hdr" \
    -X POST "$url" \
    -H 'content-type: application/json' \
    -H 'user-agent: Wedding-Worker/1.0' \
    -H 'x-worker-secret: __probe_invalid_secret__' \
    -d '{"key":"u/probe/o/00000000-0000-0000-0000-000000000000.jpg","bytes":1}' \
    -w '%{http_code}' 2>/dev/null)" || code="000"

  vid="$(grep -i '^x-vercel-id:' "$hdr" 2>/dev/null | tail -n1 | tr -d '\r')"
  cfray="$(grep -i '^cf-ray:' "$hdr" 2>/dev/null | tail -n1 | tr -d '\r')"
  loc="$(grep -i '^location:' "$hdr" 2>/dev/null | tail -n1 | tr -d '\r')"
  rm -f "$hdr"

  nfo "POST $url -> HTTP $code"
  [ -n "$cfray" ] && nfo "$cfray"
  [ -n "$vid" ]   && nfo "$vid"
  [ -n "$loc" ]   && ng "$loc  ← POST がリダイレクトされている（301/302 なら body が消える）"

  if [ "$code" = "000" ]; then
    ng "接続できない。DNS 未解決またはネットワーク遮断（1016 相当）"
  elif [ -z "$vid" ]; then
    ng "x-vercel-id なし = Vercel に到達していない。Cloudflare / DNS / WAF 層の問題"
  else
    case "$code" in
      401|403) ok "ルート到達かつシークレット検証が動作（意図的に不正な値を送っている）" ;;
      404)     ng "Vercel 到達済みだがルートが無い。main にマージ済みか / 本番デプロイ済みかを確認" ;;
      500)     ng "ルートは存在するが 500。WORKER_WEBHOOK_SECRET が Production 未設定の可能性" ;;
      202)     wn "202 が返った（シークレット検証を通過？ 検証ロジックを確認）" ;;
      *)       wn "想定外のステータス $code" ;;
    esac
  fi
}
[ -n "$WEBHOOK_URL" ] && probe "$WEBHOOK_URL"
[ "${WEBHOOK_URL:-}" != "https://${APP_HOST}${HOOK_PATH}" ] && probe "https://${APP_HOST}${HOOK_PATH}"

sec "3. DNS 委譲（$APEX -> Cloudflare）"
resolve() {
  if command -v dig >/dev/null 2>&1; then
    dig +short "$2" "$1" @1.1.1.1 2>/dev/null
  else
    curl -sS --max-time 10 -H 'accept: application/dns-json' \
      "https://cloudflare-dns.com/dns-query?name=$1&type=$2" 2>/dev/null \
      | python3 -c 'import sys,json;d=json.load(sys.stdin);[print(a.get("data","")) for a in d.get("Answer",[])+d.get("Authority",[])]' 2>/dev/null
  fi
}
check_ns() {
  local name="$1" ns
  ns="$(resolve "$name" NS)"
  if [ -z "$ns" ]; then
    nfo "$name NS: (なし = 親ゾーンに含まれる)"
  elif printf '%s' "$ns" | grep -qi 'ns\.cloudflare\.com'; then
    ok "$name は Cloudflare ゾーン: $(printf '%s' "$ns" | tr '\n' ' ')"
  else
    wn "$name は Cloudflare 以外: $(printf '%s' "$ns" | tr '\n' ' ')"
  fi
}
check_ns "$APEX"
check_ns "wedding.$APEX"
nfo "$APP_HOST   A/CNAME: $(resolve "$APP_HOST" A | tr '\n' ' ')$(resolve "$APP_HOST" CNAME | tr '\n' ' ')"
nfo "$MEDIA_HOST A/CNAME: $(resolve "$MEDIA_HOST" A | tr '\n' ' ')$(resolve "$MEDIA_HOST" CNAME | tr '\n' ' ')"
MEDIA_CODE="$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "https://$MEDIA_HOST/" 2>/dev/null)" || MEDIA_CODE="000"
if [ "$MEDIA_CODE" = "000" ]; then
  ng "$MEDIA_HOST に接続できない"
else
  ok "$MEDIA_HOST 応答あり (HTTP $MEDIA_CODE / R2 カスタムドメインは 404 が正常)"
fi

sec "4. Vercel Production 環境変数"
VCOPT=(--cwd "$VERCEL_CWD")
[ -n "${VERCEL_TOKEN:-}" ] && VCOPT+=(--token "$VERCEL_TOKEN")
[ -n "${VERCEL_SCOPE:-}" ] && VCOPT+=(--scope "$VERCEL_SCOPE")
ENVOUT="$(npx --yes vercel@latest env ls production "${VCOPT[@]}" 2>&1)"
if printf '%s' "$ENVOUT" | grep -qiE 'not authenticated|no existing credentials|Error:'; then
  ng "vercel CLI が認証されていない / プロジェクト未リンク"
  nfo "$(printf '%s' "$ENVOUT" | head -n3)"
  nfo "対処: VERCEL_TOKEN=xxxx を export するか  npx vercel link --cwd \"$VERCEL_CWD\""
else
  for k in "${REQUIRED_ENV[@]}"; do
    if printf '%s' "$ENVOUT" | grep -Eq "(^|[[:space:]])${k}([[:space:]]|$)"; then
      ok "$k"
    else
      ng "$k が Production に存在しない"
    fi
  done
  nfo "※ Firebase Admin 用の変数名はプロジェクト固有。REQUIRED_ENV に追記して再実行"
  nfo "※ 追加しただけでは既存デプロイに反映されない。必ず再デプロイすること"
fi

sec "5. Worker の現況"
npx --yes wrangler@latest secret list --config "$TOML" 2>&1 | head -n 20
npx --yes wrangler@latest deployments list --config "$TOML" 2>&1 | head -n 20

printf '\n\033[1m-- 完了 --\033[0m\n'

sec "3. DNS 委譲（$APEX -> Cloudflare）"
resolve() {
  if command -v dig >/dev/null 2>&1; then
    dig +short "$2" "$1" @1.1.1.1 2>/dev/null
  else
    curl -sS --max-time 10 -H 'accept: application/dns-json' \
      "https://cloudflare-dns.com/dns-query?name=$1&type=$2" 2>/dev/null \
      | python3 -c 'import sys,json;d=json.load(sys.stdin);[print(a.get("data","")) for a in d.get("Answer",[])+d.get("Authority",[])]' 2>/dev/null
  fi
}
check_ns() {
  local name="$1" ns
  ns="$(resolve "$name" NS)"
  if [ -z "$ns" ]; then
    nfo "$name NS: (なし = 親ゾーンに含まれる)"
  elif printf '%s' "$ns" | grep -qi 'ns\.cloudflare\.com'; then
    ok "$name は Cloudflare ゾーン: $(printf '%s' "$ns" | tr '\n' ' ')"
  else
    wn "$name は Cloudflare 以外: $(printf '%s' "$ns" | tr '\n' ' ')"
  fi
}
check_ns "$APEX"
check_ns "wedding.$APEX"
nfo "$APP_HOST   A/CNAME: $(resolve "$APP_HOST" A | tr '\n' ' ')$(resolve "$APP_HOST" CNAME | tr '\n' ' ')"
nfo "$MEDIA_HOST A/CNAME: $(resolve "$MEDIA_HOST" A | tr '\n' ' ')$(resolve "$MEDIA_HOST" CNAME | tr '\n' ' ')"
MEDIA_CODE="$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "https://$MEDIA_HOST/" 2>/dev/null)" || MEDIA_CODE="000"
if [ "$MEDIA_CODE" = "000" ]; then
  ng "$MEDIA_HOST に接続できない"
else
  ok "$MEDIA_HOST 応答あり (HTTP $MEDIA_CODE / R2 カスタムドメインは 404 が正常)"
fi

sec "4. Vercel Production 環境変数"
VCOPT=(--cwd "$VERCEL_CWD")
[ -n "${VERCEL_TOKEN:-}" ] && VCOPT+=(--token "$VERCEL_TOKEN")
[ -n "${VERCEL_SCOPE:-}" ] && VCOPT+=(--scope "$VERCEL_SCOPE")
ENVOUT="$(npx --yes vercel@latest env ls production "${VCOPT[@]}" 2>&1)"
if printf '%s' "$ENVOUT" | grep -qiE 'not authenticated|no existing credentials|Error:'; then
  ng "vercel CLI が認証されていない / プロジェクト未リンク"
  nfo "$(printf '%s' "$ENVOUT" | head -n3)"
  nfo "対処: VERCEL_TOKEN=xxxx を export するか  npx vercel link --cwd \"$VERCEL_CWD\""
else
  for k in "${REQUIRED_ENV[@]}"; do
    if printf '%s' "$ENVOUT" | grep -Eq "(^|[[:space:]])${k}([[:space:]]|$)"; then
      ok "$k"
    else
      ng "$k が Production に存在しない"
    fi
  done
  nfo "※ Firebase Admin 用の変数名はプロジェクト固有。REQUIRED_ENV に追記して再実行"
  nfo "※ 追加しただけでは既存デプロイに反映されない。必ず再デプロイすること"
fi

sec "5. Worker の現況"
npx --yes wrangler@latest secret list --config "$TOML" 2>&1 | head -n 20
npx --yes wrangler@latest deployments list --config "$TOML" 2>&1 | head -n 20

printf '\n\033[1m-- 完了 --\033[0m\n'
