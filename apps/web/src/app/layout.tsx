import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/Toaster";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "https://lamina.cupula.com.ec"),
  title: { default: "Lámina — presentaciones de clase con IA", template: "%s · Lámina" },
  description: "Lámina ayuda a docentes a crear presentaciones educativas con fórmulas, gráficas y fuentes, revisadas y aprobadas por ti. Código abierto, gratis para docentes ecuatorianos.",
  applicationName: "Lámina",
  authors: [{ name: "Cúpula Systems" }],
  openGraph: { type: "website", siteName: "Lámina", locale: "es_EC" },
  twitter: { card: "summary_large_image" },
};
export const viewport: Viewport = { themeColor: "#fbfaf6", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh">{children}<Toaster /></body>
    </html>
  );
}
