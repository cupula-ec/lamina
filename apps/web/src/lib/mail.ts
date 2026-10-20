import nodemailer from "nodemailer";
import { env } from "./env";

let tx: nodemailer.Transporter | undefined;
function transport() {
  const e = env();
  if (!e.SMTP_HOST) return null;
  tx ??= nodemailer.createTransport({
    host: e.SMTP_HOST, port: e.SMTP_PORT, secure: false, requireTLS: false, ignoreTLS: true,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
    connectionTimeout: 10_000, socketTimeout: 20_000,
  });
  return tx;
}

export async function sendMail(to: string, subject: string, text: string, html: string) {
  const t = transport();
  if (!t) {
    if (env().NODE_ENV === "production") throw new Error("SMTP no configurado");
    console.log(`[mail:dev] → ${to}: ${subject}\n${text}`);
    return { dev: true };
  }
  return t.sendMail({ from: env().MAIL_FROM, to, subject, text, html });
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function sendWelcomeMail(to: string, name: string, tempPassword: string) {
  const url = env().APP_URL;
  const text = `Hola ${name},\n\nTe damos la bienvenida a Lámina, la herramienta de Cúpula Systems para crear presentaciones de clase con IA.\n\nTu acceso:\n  Dirección: ${url}/login\n  Correo: ${to}\n  Contraseña temporal: ${tempPassword}\n\nAl ingresar por primera vez te pediremos crear una contraseña propia. También puedes entrar con tu cuenta de Google si usa este mismo correo.\n\nSi no esperabas este mensaje, ignóralo.\n\n— Equipo Lámina · Cúpula Systems`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#14181f"><h2 style="font-family:Georgia,serif;margin:0 0 12px">Bienvenido/a a Lámina</h2><p>Hola ${esc(name)},</p><p>Ya tienes acceso a <strong>Lámina</strong>, la herramienta de Cúpula Systems para crear presentaciones de clase con IA.</p><table style="background:#f3efe3;border-radius:8px;padding:14px 18px;margin:16px 0"><tr><td>Dirección</td><td><a href="${esc(url)}/login">${esc(url)}/login</a></td></tr><tr><td>Correo</td><td>${esc(to)}</td></tr><tr><td>Contraseña temporal</td><td><code style="font-size:16px;background:#fff;padding:2px 6px;border-radius:4px">${esc(tempPassword)}</code></td></tr></table><p>Al ingresar por primera vez te pediremos crear una contraseña propia. También puedes entrar con tu cuenta de Google si usa este mismo correo.</p><p style="color:#46505e;font-size:13px">Si no esperabas este mensaje, ignóralo. — Equipo Lámina · Cúpula Systems</p></div>`;
  return sendMail(to, "Tu acceso a Lámina", text, html);
}
