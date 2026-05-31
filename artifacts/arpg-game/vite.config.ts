import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const port = Number(process.env.PORT) || 5171;
const basePath = process.env.BASE_PATH || "/arpg-game/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Production chunk splitting — keep main bundle slim
    rollupOptions: {
      output: {
        manualChunks: {
          'three-core': ['three'],
          'three-addons': [
            'three/examples/jsm/loaders/GLTFLoader.js',
            'three/examples/jsm/loaders/FBXLoader.js',
            'three/examples/jsm/loaders/DRACOLoader.js',
            'three/examples/jsm/utils/SkeletonUtils.js',
            'three/examples/jsm/environments/RoomEnvironment.js',
          ],
          'postprocessing': ['postprocessing'],
          'ai-yuka': ['yuka'],
          'physics': ['@dimforge/rapier3d-compat'],
          'ui-radix': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-select',
            '@radix-ui/react-slider',
          ],
        },
      },
    },
    // Raise the warning threshold — three.js core is ~700 KB and that's expected
    chunkSizeWarningLimit: 800,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
