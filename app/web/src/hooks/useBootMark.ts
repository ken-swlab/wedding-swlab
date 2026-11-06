"use client";

import { useEffect } from "react";
import { bootMark, type BootStage } from "@/lib/boot-timing";

/** when が true になった最初の描画のあとで、起動の段階を記録する（Issue #277。lib/boot-timing.ts。1回だけ） */
export function useBootMark(stage: BootStage, when: boolean) {
  useEffect(() => {
    if (when) bootMark(stage);
  }, [stage, when]);
}
