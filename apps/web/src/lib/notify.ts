"use client";
/** Notificaciones de fin de trabajo: Notification API (si hay permiso) y título de la pestaña. Nunca lanza. */

export async function askNotifyPermission() {
  try { if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); } catch { /* navegador sin soporte */ }
}

export function notifyDone(title: string, body: string, href: string) {
  try {
    if (document.hidden) {
      const base = document.title.replace(/^● /, "");
      document.title = `● ${title}`;
      const restore = () => { if (!document.hidden) { document.title = base; document.removeEventListener("visibilitychange", restore); } };
      document.addEventListener("visibilitychange", restore);
      if ("Notification" in window && Notification.permission === "granted") {
        const n = new Notification(title, { body, tag: href });
        n.onclick = () => { window.focus(); window.location.href = href; n.close(); };
      }
    }
  } catch { /* sin soporte */ }
}
