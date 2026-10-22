import { redirect } from "next/navigation";

// La página vive ahora en /conectar; se conserva este enlace por compatibilidad (metadatos OAuth, documentación).
export default function ConectarLegacy() {
  redirect("/conectar");
}
