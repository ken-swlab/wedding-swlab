variable "firestore_location" {
  type    = string
  default = "asia-northeast1"
}
variable "web_app_display_name" {
  type    = string
  default = "Wedding SNS CTF Web"
}
resource "google_firebase_project" "default" {
  provider   = google-beta
  project    = var.project_id
  depends_on = [google_project_service.enabled]
}
resource "google_firestore_database" "default" {
  provider                    = google-beta
  project                     = var.project_id
  name                        = "(default)"
  location_id                 = var.firestore_location
  type                        = "FIRESTORE_NATIVE"
  concurrency_mode            = "OPTIMISTIC"
  app_engine_integration_mode = "DISABLED"
  delete_protection_state     = "DELETE_PROTECTION_ENABLED"
  depends_on                  = [google_firebase_project.default]
}
resource "google_firebase_web_app" "web" {
  provider        = google-beta
  project         = var.project_id
  display_name    = "${var.web_app_display_name} (${var.env})"
  deletion_policy = "DELETE"
  depends_on      = [google_firebase_project.default]
}
data "google_firebase_web_app_config" "web" {
  provider   = google-beta
  project    = var.project_id
  web_app_id = google_firebase_web_app.web.app_id
}
