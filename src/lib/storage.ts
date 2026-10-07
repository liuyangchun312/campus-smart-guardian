import { useCallback, useEffect, useRef, useState } from "react";

export function useStoredState<T>(
  key: string,
  initial: T,
  validate: (value: unknown) => value is T,
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
      return validate(saved) ? saved : initial;
    } catch {
      return initial;
    }
  });
  const [storageError, setStorageError] = useState(false);
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [key, value, dirty]);
  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      dirty.current = true;
      setValue((previous) => {
        const result =
          typeof next === "function" ? (next as (v: T) => T)(previous) : next;
        return result;
      });
    },
    [dirty],
  );
  return [value, update, storageError] as const;
}

export function formatDate(value: string, withTime = false) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(new Date(value));
}
