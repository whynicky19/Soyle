"use client";

import { useEffect } from "react";

// A different account/device can change the shared practice while this tab is away.
export function useRefreshOnReturn(refresh: () => unknown, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let pending = false;
    let lastRun = -Infinity;
    const onReturn = () => {
      if (document.visibilityState === "hidden" || pending || Date.now() - lastRun < 250) return;
      lastRun = Date.now(); pending = true;
      Promise.resolve().then(() => { if (active) return refresh(); }).catch(() => { /* The caller displays request errors. */ }).finally(() => { pending = false; });
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      active = false;
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [refresh, enabled]);
}
