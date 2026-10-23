import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lámina",
    short_name: "Lámina",
    description: "Presentaciones de clase con IA, revisadas por ti.",
    lang: "es",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#fbfcf8",
    theme_color: "#1b4f9c",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
