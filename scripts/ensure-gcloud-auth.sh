#!/bin/bash
set -euo pipefail

echo "🔍 Google Cloud (GCP) の認証状態をチェックしています..."

# アクセストークンが正常に取得できるかテスト
if gcloud auth print-access-token >/dev/null 2>&1 && gcloud auth application-default print-access-token >/dev/null 2>&1; then
  echo "✅ GCP 認証は有効です。"
  exit 0
fi

echo ""
echo "========================================================"
echo "⚠️  GCP (Google Cloud) のログイン認証期限が切れています！"
echo "========================================================"
echo "Terraform や GCP API を実行するために再認証が必要です。"
echo ""
echo "👉 自動で再ログイン処理を開始します。"
echo "画面に表示される URL をクリック/コピーしてブラウザで開いて認証を完了してください。"
echo "========================================================"
echo ""

# CLI用ログイン
echo "1/2: CLI認証を開始します..."
gcloud auth login --no-launch-browser || gcloud auth login

echo ""
echo "2/2: Application Default Credentials (ADC) 認証を開始します..."
gcloud auth application-default login --no-launch-browser || gcloud auth application-default login

echo ""
echo "🎉 再認証が完了しました！処理を続行できます。"
