// Renders every palette in palettes.json as a numbered miniature of the play screen.
// Usage: bun design/gallery.ts → design/gallery.html (self-contained; fonts from Google Fonts).
const P: { n: number; frame: string; block: string; text: string; text2: string; rule: string; flag: string; cr: Record<string, number> }[] =
  await Bun.file(new URL("palettes.json", import.meta.url).pathname).json();

// A rough Europe for the miniature: the shapes only suggest the map; the game draws the real one.
const lands = [
  "M8,40 L22,34 L30,44 L24,58 L10,56 Z", "M30,30 L42,28 L46,40 L36,46 L30,44 Z", "M42,22 L58,20 L62,34 L46,40 Z",
  "M58,20 L80,16 L92,30 L72,40 L62,34 Z", "M36,46 L46,40 L56,48 L50,62 L40,58 Z", "M56,48 L72,40 L78,54 L64,62 Z",
  "M40,6 L52,4 L50,20 L42,22 Z", "M62,4 L74,6 L72,16 L60,18 Z",
];
const tile = (p: (typeof P)[number]) => {
  const fills = [`color-mix(in oklab, ${p.text} 22%, ${p.block})`, `color-mix(in oklab, ${p.flag} 45%, ${p.block})`, p.text,
    `color-mix(in oklab, ${p.text} 22%, ${p.block})`, `color-mix(in oklab, ${p.flag} 80%, ${p.block})`, `color-mix(in oklab, ${p.text} 35%, ${p.block})`,
    `color-mix(in oklab, ${p.text} 22%, ${p.block})`, `color-mix(in oklab, ${p.frame} 70%, ${p.block})`];
  return `<figure class="t" id="p${p.n}">
  <div class="mini" style="background:${p.frame};color:${p.text}">
    <div class="top"><span class="yr">1943</span><span class="inf" style="color:${p.text2}">INFLUENCE 22</span></div>
    <div class="cols">
      <div class="col" style="border-right:2px solid ${p.rule}">
        <b style="color:${p.text}">A HUNDRED FOR ONE</b>
        <i style="background:${p.text2}"></i><i style="background:${p.text2};width:70%"></i><i style="background:${p.text2};width:85%"></i>
        <span class="btn" style="background:${p.flag};color:${p.frame}">END YEAR</span>
      </div>
      <div class="map" style="background:${p.block};outline:2px solid ${p.rule}">
        <svg viewBox="0 0 100 70" aria-hidden="true">${lands.map((d, k) => `<path d="${d}" fill="${fills[k]}" stroke="${p.block}" stroke-width="0.8"/>`).join("")}
        <path d="M56,48 L72,40 L78,54 L64,62 Z" fill="none" stroke="${p.flag}" stroke-width="1.6" stroke-dasharray="2 1.5"/></svg>
      </div>
    </div>
  </div>
  <figcaption><span class="num">${p.n}</span>
    ${[["frame", p.frame], ["block", p.block], ["text", p.text], ["text-2", p.text2], ["rule", p.rule], ["flag", p.flag]].map(([r, h]) => `<span class="sw"><i style="background:${h}"></i>${r} ${h}</span>`).join("")}
    <span class="cr">frame/block ${p.cr.frameBlock} · text ${p.cr.textFrame}/${p.cr.textBlock} · flag ${p.cr.flagFrame}</span>
  </figcaption>
</figure>`;
};

const html = `<title>Fortress Europe Palettes</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chivo:wght@400;700;900&display=swap">
<style>
/* Gallery chrome in two profile neutrals; each miniature carries its own palette. Single look, by choice. */
:root { --page: #D8DAD1; --ink: #484A5A; color-scheme: light; }
body { background: var(--page); color: var(--ink); font-family: "Chivo", "Helvetica Neue", Arial, sans-serif; margin: 0; }
.wrap { max-width: 1400px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 28px 48px; }
h1 { font-weight: 900; font-size: clamp(2.2rem, 6vw, 4.5rem); text-transform: uppercase; line-height: 0.95; margin: 0 0 12px; letter-spacing: -0.01em; }
.lede { max-width: 70ch; margin: 0 0 24px; line-height: 1.5; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 22px 16px; }
.t { margin: 0; min-width: 0; }
.mini { padding: 8px; aspect-ratio: 4 / 3; display: grid; grid-template-rows: auto 1fr; gap: 6px; max-width: 100%; }
.top { display: flex; justify-content: space-between; align-items: baseline; }
.yr { font-weight: 900; font-size: 40px; line-height: 0.85; letter-spacing: -0.02em; }
.inf { font-weight: 700; font-size: 9px; letter-spacing: 0.06em; }
.cols { display: grid; grid-template-columns: 38% 1fr; gap: 6px; min-height: 0; }
.col { display: grid; align-content: start; gap: 4px; padding-right: 6px; }
.col b { font-weight: 900; font-size: 9px; line-height: 1; }
.col i { display: block; height: 3px; width: 100%; }
.btn { margin-top: 4px; font-weight: 900; font-size: 9px; padding: 4px 5px; justify-self: start; }
.map { min-height: 0; display: grid; }
.map svg { width: 100%; height: 100%; display: block; }
figcaption { display: flex; flex-wrap: wrap; gap: 2px 8px; font-size: 10.5px; margin-top: 6px; align-items: center; font-variant-numeric: tabular-nums; }
.num { font-weight: 900; font-size: 22px; line-height: 1; margin-right: 4px; flex-basis: 100%; }
.sw { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
.sw i { width: 10px; height: 10px; display: inline-block; outline: 1px solid rgba(72,74,90,0.35); }
.cr { flex-basis: 100%; opacity: 0.85; }
</style>
<div class="wrap">
<h1>Fortress Europe palettes</h1>
<p class="lede">Every palette here is drawn from your Khroma favourites (route B). The rules: frame and block 1.25–3.5:1; text and text-2 at least 4.5:1 on both; flag at least 4.5:1 on the frame; rule at least 1.8:1 on the block, used as decoration only; text, text-2 and flag at least 0.12 apart in OKLab. ${(968312).toLocaleString("en-US")} assignments pass, across ${P.length} frame and block pairs. Each miniature below shows one random draw from a different pair, laid out as the game's play screen. Pick by number; several picks become a theme switcher.</p>
<div class="grid">${P.map(tile).join("\n")}</div>
</div>`;
await Bun.write(new URL("gallery.html", import.meta.url).pathname, html);
console.log("gallery.html", (html.length / 1024).toFixed(0), "KB,", P.length, "palettes");
