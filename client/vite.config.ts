import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // This makes "@/..." point to client/src
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,       // ok to change
    strictPort: false // ok to leave
  },
});
