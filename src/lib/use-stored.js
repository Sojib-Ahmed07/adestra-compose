// src/lib/use-stored.js
"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useState that is remembered in this browser (localStorage), e.g. a tool's last settings.
 * The first render uses `initial` (same as the server), then the saved value is loaded.
 * `check(saved)` must return true for a saved value to be used — protects against old or broken data.
 */
export function useStoredState(key, initial, check = () => true) {
  const [value, setValue] = useState(initial);
  const loaded = useRef(false);
  const checkRef = useRef(check);
  checkRef.current = check;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) {
        const saved = JSON.parse(raw);
        if (checkRef.current(saved)) setValue(saved);
      }
    } catch {
      // storage blocked or broken — keep the default
    }
    loaded.current = true;
  }, [key]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore (private mode, full storage)
    }
  }, [key, value]);

  return [value, setValue];
}
