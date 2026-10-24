// Turns dist/index.html into dist/artifact.html for publishing as a claude.ai artifact. The platform supplies
// the doctype, html, head, body, charset and viewport itself, so only the page's own parts are kept, in order:
// title, the claude meta, font links, styles, scripts and the root element. Usage: bun scripts/strip.ts
const src = await Bun.file("dist/index.html").text();
const take = (re: RegExp) => [...src.matchAll(re)].map((m) => m[0]);
const parts = [
  ...take(/<title>[\s\S]*?<\/title>/g),
  ...take(/<meta name="claude:[^>]*>/g),
  ...take(/<link [^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/g),
  ...take(/<style[^>]*>[\s\S]*?<\/style>/g),
  '<div id="root"></div>',
  ...take(/<script[^>]*>[\s\S]*?<\/script>/g),
];
if (!parts[0].startsWith("<title>") || !parts.some((p) => p.startsWith("<script"))) throw new Error("dist/index.html is missing its title or script");
await Bun.write("dist/artifact.html", parts.join("\n") + "\n");
console.log(`dist/artifact.html ${(Bun.file("dist/artifact.html").size / 1024).toFixed(0)} KB`);
export {};
