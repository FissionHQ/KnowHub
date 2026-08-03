import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, "..");

const src = require.resolve("pptx-react-viewer/styles.css");
const destDir = join(webRoot, "public/vendor");
const dest = join(destDir, "pptx-viewer.css");

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
if (!existsSync(dest)) {
  console.error("Failed to sync pptx-viewer.css");
  process.exit(1);
}
console.log(`Synced pptx-viewer.css → ${dest}`);
