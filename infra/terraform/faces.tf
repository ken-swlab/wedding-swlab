resource "google_firestore_index" "faces_unmatched" {
  provider   = google-beta
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "faces"

  fields {
    field_path = "matchedGuestId"
    order      = "ASCENDING"
  }
  fields {
    field_path = "createdAt"
    order      = "DESCENDING"
  }
}

resource "google_firestore_index" "posts_face_detection" {
  provider   = google-beta
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "posts"

  fields {
    field_path = "faceDetectionStatus"
    order      = "ASCENDING"
  }
  fields {
    field_path = "createdAt"
    order      = "DESCENDING"
  }
}
