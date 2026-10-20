"use client";
import { useEffect, useRef } from "react";

/**
 * Calls `refresh` when the tab becomes visible again and, if `everyMs` is given,
 * on an interval while the tab is visible. Hidden tabs never poll.
 */
export function useVisibleRefresh(refresh: () => void | Promise<unknown>, everyMs?: number, enabled = true) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    const run = () => {
      if (document.visibilityState === "visible") void Promise.resolve(latest.current()).catch(() => {});
    };
    const timer = everyMs ? window.setInterval(run, everyMs) : undefined;
    document.addEventListener("visibilitychange", run);
    return () => {
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
    };
  }, [everyMs, enabled]);
}
