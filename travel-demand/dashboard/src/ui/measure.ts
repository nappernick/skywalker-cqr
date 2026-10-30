import { FONT_FAMILY } from "./theme";

let ctx: CanvasRenderingContext2D | null = null;

/** Width of `text` in px at the given size and weight, measured on an offscreen canvas. */
export function textWidth(text: string, size = 12, weight = 400): number {
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * size * 0.55;
  ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
  return ctx.measureText(text).width;
}

/** Truncates with an ellipsis so the text fits in `max` px. */
export function fitText(text: string, max: number, size = 12, weight = 400): string {
  if (textWidth(text, size, weight) <= max) return text;
  let s = text;
  while (s.length > 1 && textWidth(`${s}…`, size, weight) > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}
