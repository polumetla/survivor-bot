import { useEffect, useState } from 'react';

export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return initial;
      const parsed = JSON.parse(raw);
      // Merge objects so settings added in newer versions get their defaults.
      const isObj = (v: unknown) => v && typeof v === 'object' && !Array.isArray(v);
      return isObj(initial) && isObj(parsed) ? { ...initial, ...parsed } : parsed;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage unavailable (private mode); state still works for the session
    }
  }, [key, value]);
  return [value, setValue] as const;
}
