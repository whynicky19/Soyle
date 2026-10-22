import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Söyle — общение и практика",
    short_name: "Söyle",
    description: "Игровые занятия и домашняя практика для поддержки общения",
    lang: "ru",
    start_url: "/app",
    display: "standalone",
    background_color: "#FFF8ED",
    theme_color: "#078C91",
    icons: [
      {
        src: "/branding/pwa-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/branding/pwa-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
