"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection, limit, onSnapshot, query, type FirestoreError,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  Attendance, GuestAdmin, GuestPrivate, GuestPublic, GuestRow, PaymentStatus,
} from "@/types/admin";

const PAGE = 500;

/**
 * guests / guestPrivate / guestAdmin の3つを購読して uid で結合する。
 * ★orderBy は使わない★ 対象フィールドを持たないドキュメントが
 * クエリ結果から丸ごと除外されるため、並べ替えは JS 側で行う。
 */
export function useAdminGuests(enabled: boolean) {
  const [pub, setPub] = useState<Record<string, GuestPublic>>({});
  const [priv, setPriv] = useState<Record<string, GuestPrivate>>({});
  const [adm, setAdm] = useState<Record<string, GuestAdmin>>({});
  const [error, setError] = useState<FirestoreError | null>(null);
  const [ready, setReady] = useState({ pub: false, priv: false, adm: false });

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(query(collection(db, "guests"), limit(PAGE)), (snap) => {
      const next: Record<string, GuestPublic> = {};
      for (const d of snap.docs) {
        const v = d.data();
        next[d.id] = {
          uid: d.id,
          displayName: v.displayName ?? "(不明)",
          nickname: v.nickname ?? "",
          photoURL: v.photoURL,
          tags: Array.isArray(v.tags) ? [...v.tags].sort() : [],
          isApproved: v.isApproved === true,
          isRegistered: v.isRegistered === true,
          realName: v.realName ?? "",
          lineDisplayName: v.lineDisplayName ?? "",
          kana: v.kana ?? "",
          invitationStatus: v.invitationStatus ?? "unsent",
          isPreRegistered: v.isPreRegistered === true || d.id.startsWith("pre_"),
          mergedInto: v.mergedInto ?? "",
          isArchived: v.isArchived === true,
        };
      }
      setPub(next);
      setReady((s) => ({ ...s, pub: true }));
    }, setError);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(query(collection(db, "guestPrivate"), limit(PAGE)), (snap) => {
      const next: Record<string, GuestPrivate> = {};
      for (const d of snap.docs) {
        const v = d.data();
        next[d.id] = {
          uid: d.id,
          attendance: (v.attendance ?? "unanswered") as Attendance,
          allergy: v.allergy ?? "",
          paymentStatus: (v.paymentStatus ?? "none") as PaymentStatus,
          submittedAt: v.submittedAt ?? null,
          // 未設定は有効。明示的に false のときだけ停止扱い
          isActive: v.isActive !== false,
          bannedReason: v.bannedReason ?? "",
        };
      }
      setPriv(next);
      setReady((s) => ({ ...s, priv: true }));
    }, setError);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(query(collection(db, "guestAdmin"), limit(PAGE)), (snap) => {
      const next: Record<string, GuestAdmin> = {};
      for (const d of snap.docs) {
        const v = d.data();
        next[d.id] = {
          uid: d.id,
          lineUserId: v.lineUserId ?? "",
          inviteCode: v.inviteCode ?? "",
          inviteLabel: v.inviteLabel ?? "",
          isAnonymous: v.isAnonymous === true,
          aiMemo: v.aiMemo ?? "",
          // 呼び名は guestAdmin に置いている（/guests は全ゲストが読めるため）
          callNameGroom: v.callNameGroom ?? "",
          callNameBride: v.callNameBride ?? "",
          firstLoginAt: v.firstLoginAt ?? null,
        };
      }
      setAdm(next);
      setReady((s) => ({ ...s, adm: true }));
    }, setError);
  }, [enabled]);

  const rows = useMemo<GuestRow[]>(
    () =>
      Object.values(pub)
        .filter((p) => !p.isArchived && !p.mergedInto)
        .map((p) => {
        const v = priv[p.uid];
        const a = adm[p.uid];
        return {
          ...p,
          attendance: v?.attendance ?? "unanswered",
          allergy: v?.allergy ?? "",
          paymentStatus: v?.paymentStatus ?? "none",
          submittedAt: v?.submittedAt ?? null,
          /**
           * ★既定は「有効」★
           *   guestPrivate を持たないゲスト（仮登録 pre_xxx、および
           *   ログインしただけで未登録のユーザー）は v が undefined になる。
           *   ここで ?? false や素の v?.isActive にすると undefined が
           *   falsy 判定され、全員がアクセス停止扱いになる。
           *   明示的に false のときだけ停止とする。
           */
          isActive: v?.isActive !== false,
          bannedReason: v?.bannedReason ?? "",
          lineUserId: a?.lineUserId ?? "",
          inviteCode: a?.inviteCode ?? "",
          inviteLabel: a?.inviteLabel ?? "",
          isAnonymous: a?.isAnonymous ?? false,
          aiMemo: a?.aiMemo ?? "",
          callNameGroom: a?.callNameGroom ?? "",
          callNameBride: a?.callNameBride ?? "",
          firstLoginAt: a?.firstLoginAt ?? null,
        };
      }),
    [pub, priv, adm],
  );

  return { rows, loading: enabled && !(ready.pub && ready.priv && ready.adm), error };
}
