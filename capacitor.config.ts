import type { CapacitorConfig } from "@capacitor/cli";

// O APK abre o app publicado na Vercel: cada novo deploy já chega ao celular sem
// reinstalar. Se o endereço mudar, ajuste APP_URL e gere o APK de novo.
const APP_URL = process.env.APP_URL ?? "https://ninho-financas-familia.vercel.app";

const config: CapacitorConfig = {
  appId: "app.ninho.familia",
  appName: "ninho.",
  webDir: "dist",
  backgroundColor: "#0d2922",
  server: {
    url: APP_URL,
    androidScheme: "https",
    // Página local mostrada se não houver internet ao abrir o app
    errorPath: "offline.html",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    // Barras do Android: ícones escuros (o app tem fundo claro) e áreas seguras via CSS
    SystemBars: { insetsHandling: "css", initialViewportFitValueHint: "cover", style: "LIGHT" },
  },
};

export default config;
