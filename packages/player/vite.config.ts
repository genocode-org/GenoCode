import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const src = (name: string) => fileURLToPath(new URL(`../${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  // Relative addresses, so the same build works on a web server and inside the phone app.
  base: "./",
  resolve: {
    // Use the other packages' sources directly, as the web app does.
    alias: {
      "@genocode/render/patterns": fileURLToPath(
        new URL("../render/src/patterns.ts", import.meta.url),
      ),
      "@genocode/core": src("core"),
      "@genocode/render": src("render"),
      "@genocode/music": src("music"),
      "@genocode/dance": src("dance"),
      "@genocode/stage": src("stage"),
    },
  },
  server: { fs: { allow: [repo] } },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    // three.js alone is about 500 kB.
    chunkSizeWarningLimit: 1500,
    license: { fileName: "licenses.txt" },
  },
});
