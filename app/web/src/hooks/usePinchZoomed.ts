"use client";

import { useEffect, useState } from "react";
import { PINCH_ZOOMED_SCALE } from "@/config/guestbook";

/**
 * ブラウザのピンチで拡大しているか（visualViewport.scale）。Issue #302。
 * visualViewport の resize（倍率が変わると来る）で読み直す。visualViewport の無いブラウザは常に false。
 */
export function usePinchZoomed(): boolean {
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setZoomed(vv.scale > PINCH_ZOOMED_SCALE);
    update();
    vv.addEventListener("resize", update);
    return () => vv.removeEventListener("resize", update);
  }, []);
  return zoomed;
}
