import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: { "/api": `http://localhost:${process.env.API_PORT ?? 8787}` },
  },
  build: { target: "es2022", sourcemap: false },
  // Momento da publicação: aparece em Configurações → App ("App atualizado em …")
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
});
