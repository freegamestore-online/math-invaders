// Styling guard (platform#392, ADR-001): fails the build when the token mapping
// or the "no static inline styles" rule regresses. Plain node, no dependencies.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../src/", import.meta.url));
const css = readFileSync(join(src, "index.css"), "utf8");
const problems = [];

if (!/@source\s+"[^"]*@freegamestore\/games[^"]*"/.test(css)) {
  problems.push("index.css: missing @source for @freegamestore/games");
}
const theme = css.match(/@theme inline\s*\{([^}]*)\}/);
if (!theme) problems.push("index.css: missing @theme inline block");
for (const t of ["paper", "panel", "ink", "muted", "line", "accent", "success", "warning", "danger"]) {
  if (theme && !new RegExp(`--color-${t}:\\s*var\\(--${t}\\)`).test(theme[1])) {
    problems.push(`index.css: @theme inline does not map --color-${t}`);
  }
}
for (const alias of ["surface", "border", "glass", "dock", "error"]) {
  if (new RegExp(`^\\s*--${alias}\\s*:`, "m").test(css)) {
    problems.push(`index.css: banned alias --${alias} (use the tokens; --danger for errors)`);
  }
}

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(tsx|jsx)$/.test(e.name)) yield p;
  }
}
for (const file of walk(src)) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!line.includes("style={{")) return;
    const context = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
    if (!/dynamic/i.test(context)) {
      problems.push(`${file.slice(src.length)}:${i + 1}: inline style without a "dynamic" comment (use Tailwind token utilities)`);
    }
  });
}

if (problems.length) {
  console.error(`Styling check failed:\n - ${problems.join("\n - ")}`);
  process.exit(1);
}
console.log("Styling check passed");
