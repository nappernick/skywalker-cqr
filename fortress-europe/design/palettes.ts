// Usage: bun design/palettes.ts. Writes design/palettes.json and prints the size of the valid space.
// Route B: random role draws from Nick's Khroma favourites, filtered by the contrast rules, one per frame/block pair.
const K = ["#A2D31B","#8EB183","#9DEE77","#28591C","#4B785A","#ADF7A8","#BDE9A0","#BFDD47","#97E115","#44CE22","#2EC435",
"#C6C5D2","#CCD7D7","#484A5A","#D8DAD1","#435658","#DDD4DF","#CAD6D7",
"#F4D0EF","#691B78","#F52F85","#F8CCF8","#DC17E7","#ED2BA0",
"#E8604E","#CB2438","#E0D5D2","#F9B8C2","#D01E21","#A81917",
"#57737E","#275B57","#1594A7","#2E574F","#91D1DB","#2292B3",
"#FA9F3D","#F97428","#DED1C8","#FD8B5E","#EB8449",
"#521291","#B6A1E3","#9E48CF","#9738F0","#CAC0D4",
"#DAE41F","#E3EA8B","#DCD7BB","#0724A6","#8790AB"];
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h: string) => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const cr = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const oklab = (h: string) => {
  const [r, g, b] = rgb(h).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const dist = (a: string, b: string) => { const x = oklab(a), y = oklab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };

let total = 0; const pairs: { frame: string; block: string; n: number; draws: string[][] }[] = [];
for (const frame of K) for (const block of K) {
  if (frame === block) continue;
  const fb = cr(frame, block); if (fb < 1.25 || fb > 3.5) continue;
  const T = K.filter((c) => c !== frame && c !== block && cr(c, frame) >= 4.5 && cr(c, block) >= 4.5);
  const F = K.filter((c) => c !== frame && c !== block && cr(c, frame) >= 4.5);
  const R = K.filter((c) => c !== frame && c !== block && cr(c, block) >= 1.8);
  let n = 0; const draws: string[][] = [];
  for (const text of T) for (const text2 of T) { if (text2 === text || dist(text, text2) < 0.12) continue;
    for (const flag of F) { if (flag === text || flag === text2 || dist(flag, text) < 0.12 || dist(flag, text2) < 0.12) continue;
      for (const rule of R) { if ([text, text2, flag].includes(rule)) continue; n++; if (draws.length < 400) draws.push([text, text2, rule, flag]); } } }
  if (n) { total += n; pairs.push({ frame, block, n, draws }); }
}
// one seeded random draw per pair
let seed = 1940; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
for (let i = pairs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pairs[i], pairs[j]] = [pairs[j], pairs[i]]; }
const out = pairs.map((p, k) => { const [text, text2, rule, flag] = p.draws[Math.floor(rnd() * p.draws.length)];
  return { n: k + 1, frame: p.frame, block: p.block, text, text2, rule, flag,
    cr: { frameBlock: +cr(p.frame, p.block).toFixed(2), textFrame: +cr(text, p.frame).toFixed(2), textBlock: +cr(text, p.block).toFixed(2), text2Frame: +cr(text2, p.frame).toFixed(2), text2Block: +cr(text2, p.block).toFixed(2), flagFrame: +cr(flag, p.frame).toFixed(2), ruleBlock: +cr(rule, p.block).toFixed(2) } }; });
console.log("valid assignments", total, "frame/block pairs", pairs.length);
await Bun.write(new URL("palettes.json", import.meta.url).pathname, JSON.stringify(out, null, 1));
