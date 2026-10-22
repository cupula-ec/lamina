import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/Toaster";

export const metadata: Metadata = {
  title: { default: "Lámina — presentaciones de clase con IA", template: "%s · Lámina" },
  description: "Lámina ayuda a docentes a crear presentaciones educativas con fórmulas, gráficas y fuentes, revisadas y aprobadas por ti. Código abierto, gratis para docentes ecuatorianos.",
  applicationName: "Lámina",
  authors: [{ name: "Cúpula Systems" }],
};
export const viewport: Viewport = { themeColor: "#fbfaf6", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh">{children}<Toaster /></body>
    </html>
  );
}
