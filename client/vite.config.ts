import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // existing alias for client/src
      "@": path.resolve(__dirname, "./src"),
      // NEW: alias to the repo-level shared folder
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  server: {
    port: 3000,
    strictPort: false,
  },
});
