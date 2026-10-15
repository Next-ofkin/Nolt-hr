import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const target = new URL("../apps/web/.generated/", import.meta.url);
mkdirSync(target, { recursive: true });
const markdown = readFileSync(
  new URL("../docs/TRACKER.md", import.meta.url),
  "utf8",
);
writeFileSync(new URL("tracker.json", target), JSON.stringify(markdown));
console.log("Frontend tracker snapshot prepared for deployment.");
