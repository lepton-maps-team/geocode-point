import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  // Cast avoids IDE type conflicts when multiple Vite type instances are present.
  plugins: [react() as unknown as PluginOption],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 3000,
  },
});
