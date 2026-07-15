import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stylesDir = join(root, "src/styles");

mkdirSync(stylesDir, { recursive: true });
copyFileSync(
  join(root, "node_modules/@heroui/styles/dist/heroui.min.css"),
  join(stylesDir, "heroui.css"),
);
