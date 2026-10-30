import { useEffect, useRef, useState, type RefObject } from "react";

/** Tracks an element's content width with a ResizeObserver. */
export function useWidth<T extends HTMLElement>(min = 280): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(min);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(min, Math.floor(entry.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [min]);
  return [ref, width];
}

export const prefersReducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
