import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const base = env.VITE_BASE_PATH || "/";

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        manifest: {
          name: "Mis gastos",
          short_name: "Mis gastos",
          description: "Una forma sencilla y clara de llevar el control de tus gastos.",
          lang: "es-CL",
          start_url: base,
          scope: base,
          display: "standalone",
          background_color: "#f2eee8",
          theme_color: "#f2eee8",
          icons: [
            {
              src: `${base}icon.svg`,
              sizes: "any",
              type: "image/svg+xml",
              purpose: "any",
            },
          ],
        },
      }),
    ],
  };
});
