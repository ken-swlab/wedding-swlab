###############################################################
# Wedding SNS / CTF Platform - Phase 1 Walking Skeleton
###############################################################

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
  }

  # Phase 1 はローカル state で開始する。
  # GCS バケットを作成したらコメントを外し、
  #   terraform init -migrate-state
  # でリモート state へ移行する。
  #
  # backend "gcs" {
  #   bucket = "CHANGE_ME-tfstate"
  #   prefix = "wedding-sns-ctf/state"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

###############################################################
# Phase 1 で有効化する API 群
#   まずはここだけを apply して「Terraform が GCP に届く」ことを確認する
###############################################################
locals {
  services = [
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
    "iam.googleapis.com",

    # Firebase 本体
    "firebase.googleapis.com",
    "firebaserules.googleapis.com",

    # 認証 / データ / ストレージ
    "identitytoolkit.googleapis.com",
    "firestore.googleapis.com",
    "firebasestorage.googleapis.com",
    "storage.googleapis.com",

    # ホスティング / SSR 実行基盤
    "firebasehosting.googleapis.com",
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",

    # CTF のフラグ等を置く場所
    "secretmanager.googleapis.com",
  ]
}

resource "google_project_service" "enabled" {
  for_each = toset(local.services)

  project = var.project_id
  service = each.value

  # destroy 時に API まで無効化すると事故るので false
  disable_on_destroy = false
}

###############################################################
# Outputs
###############################################################
output "project_id" {
  description = "対象の GCP プロジェクト ID"
  value       = var.project_id
}

output "enabled_services" {
  description = "Terraform が有効化した API 一覧"
  value       = sort([for s in google_project_service.enabled : s.service])
}
