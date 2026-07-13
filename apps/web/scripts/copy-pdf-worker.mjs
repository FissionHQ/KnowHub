import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

const pdfjsDistPath = dirname(require.resolve("pdfjs-dist/package.json"));
const workerSrc = join(pdfjsDistPath, "build", "pdf.worker.min.mjs");
const workerDest = join(publicDir, "pdf.worker.min.mjs");

mkdirSync(publicDir, { recursive: true });
copyFileSync(workerSrc, workerDest);

console.log("Copied pdf.worker.min.mjs to public/");
