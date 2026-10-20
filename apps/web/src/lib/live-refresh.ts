"use client";
import { useEffect, useRef } from "react";

/** The one refresh rhythm for the whole app. Change it here and every screen follows. */
export const LIVE_REFRESH_MS = 15_000;
const MAX_BACKOFF = 4; // after repeated failures, wait up to 4 ticks (60s) between tries

/**
 * Quietly re-runs `refresh` while the tab is visible: on a fixed rhythm, and straight away
 * when the tab/window comes back. Hidden tabs never poll; failures slow it down, a success
 * resets it. `refresh` should update data in place (no spinner, no page reload).
 */
export function useLiveRefresh(refresh: () => void | Promise<unknown>, enabled = true) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    let skip = 0, failures = 0, running = false;
    const run = async (force: boolean) => {
      if (document.visibilityState !== "visible" || running) return;
      if (!force && skip > 0) { skip -= 1; return; }
      running = true;
      try { await latest.current(); failures = 0; skip = 0; }
      catch { failures = Math.min(failures + 1, MAX_BACKOFF); skip = failures; }
      finally { running = false; }
    };
    const timer = window.setInterval(() => void run(false), LIVE_REFRESH_MS);
    const onShow = () => void run(true);
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, [enabled]);
}
