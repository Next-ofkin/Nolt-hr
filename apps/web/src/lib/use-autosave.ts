"use client";
import { useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved" | "failed";

/**
 * Calls `save` once the person has stopped typing for `delayMs`. `version` goes up on
 * every edit; a new edit restarts the wait. A failed save is retried on the next edit
 * or after a short pause, and never interrupts what the person is doing.
 */
export function useAutosave({
  enabled,
  dirty,
  version,
  save,
  delayMs = 2000,
}: {
  enabled: boolean;
  dirty: boolean;
  version: number;
  save: () => Promise<void>;
  delayMs?: number;
}): AutosaveStatus {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const latest = useRef(save);
  latest.current = save;
  useEffect(() => {
    if (!enabled || !dirty) return;
    const wait = status === "failed" ? Math.max(delayMs, 8000) : delayMs;
    const t = setTimeout(async () => {
      setStatus("saving");
      try {
        await latest.current();
        setStatus("saved");
      } catch {
        setStatus("failed");
      }
    }, wait);
    return () => clearTimeout(t);
    // status is read only to lengthen the wait after a failure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, dirty, version, delayMs]);
  return status;
}
