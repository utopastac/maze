import { defineConfig } from "vite";

// Custom domain (mazespire.f-90.co.uk) serves from site root.
export default defineConfig({
  base: "/",
  server: {
    port: 5173,
  },
});
