import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

/** サインイン直後に1回だけ呼ぶ。Rules の create 条件とキーを揃えてある。 */
export async function ensureGuestDoc(uid: string, displayName: string) {
  const ref = doc(db, "guests", uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  await setDoc(ref, {
    displayName: displayName.slice(0, 40),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
