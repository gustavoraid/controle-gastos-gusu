import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  // Caminhos relativos: o app funciona em qualquer subpasta/host estático.
  base: "./",
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    rollupOptions: {
      // nova-despesa.html: mesma app, com manifesto/ícone próprios para o atalho "+ Casa".
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        casa: fileURLToPath(new URL("./nova-despesa.html", import.meta.url)),
      },
    },
  },
});
