locals {
  fb = data.google_firebase_web_app_config.web
  firebase_config = {
    apiKey            = local.fb.api_key
    authDomain        = local.fb.auth_domain
    projectId         = var.project_id
    appId             = google_firebase_web_app.web.app_id
    storageBucket     = local.fb.storage_bucket == null ? "" : local.fb.storage_bucket
    messagingSenderId = local.fb.messaging_sender_id == null ? "" : local.fb.messaging_sender_id
    measurementId     = local.fb.measurement_id == null ? "" : local.fb.measurement_id
  }
}
output "firebase_config" {
  value = local.firebase_config
}
output "firebase_web_app_id" {
  value = google_firebase_web_app.web.app_id
}
output "firestore_location_id" {
  value = google_firestore_database.default.location_id
}
output "vercel_env" {
  value = <<-EOT
    NEXT_PUBLIC_FIREBASE_API_KEY=${local.firebase_config.apiKey}
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${local.firebase_config.authDomain}
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=${local.firebase_config.projectId}
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${local.firebase_config.storageBucket}
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${local.firebase_config.messagingSenderId}
    NEXT_PUBLIC_FIREBASE_APP_ID=${local.firebase_config.appId}
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=${local.firebase_config.measurementId}
  EOT
}
