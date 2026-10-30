import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Mis gastos",
        short_name: "Mis gastos",
        description: "Una forma sencilla y clara de llevar el control de tus gastos.",
        lang: "es-CL",
        start_url: "/",
        display: "standalone",
        background_color: "#f5f6f2",
        theme_color: "#f5f6f2",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
    }),
  ],
});
