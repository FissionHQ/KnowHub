const fs = require("fs");
const path = require("path");

const src = path.join(
  __dirname,
  "..",
  "node_modules",
  "@heroui",
  "styles",
  "dist",
  "heroui.min.css",
);
const destDir = path.join(__dirname, "..", "src", "styles");
const dest = path.join(destDir, "heroui.css");

if (!fs.existsSync(src)) {
  console.warn("HeroUI styles not found, skipping copy");
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log("Copied HeroUI styles to src/styles/heroui.css");
