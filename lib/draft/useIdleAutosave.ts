"use client";

import { useEffect, useRef } from "react";

export const AUTOSAVE_IDLE_MS = 60_000;

/**
 * Fire `onIdle(value)` after `idleMs` of no `value` changes (AI-50 auto-save).
 *
 * The first non-null value the hook sees is the hydration baseline and never
 * fires — reopening the app with a restored draft must not re-save it (a save
 * without a draft id would create a duplicate server draft per visit). After
 * a fire, the saved value becomes the new baseline, so an unchanged draft is
 * saved at most once per change-burst.
 */
export function useIdleAutosave<T>({
  value,
  onIdle,
  idleMs = AUTOSAVE_IDLE_MS,
  enabled = true,
}: {
  value: T;
  onIdle: (value: T) => void;
  idleMs?: number;
  enabled?: boolean;
}): void {
  const onIdleRef = useRef(onIdle);
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  // Serialized form of the last saved (or baseline) value. Drafts are new
  // object identities on every keystroke, so compare by content, not ref.
  const lastSavedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || value == null) return;
    const serialized = JSON.stringify(value);
    if (lastSavedRef.current === null) {
      lastSavedRef.current = serialized; // hydration baseline — never saved
      return;
    }
    if (serialized === lastSavedRef.current) return;
    const timer = setTimeout(() => {
      lastSavedRef.current = serialized;
      onIdleRef.current(value);
    }, idleMs);
    return () => clearTimeout(timer);
  }, [value, enabled, idleMs]);
}
