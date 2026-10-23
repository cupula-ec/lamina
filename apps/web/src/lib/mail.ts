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

const C = { paper: "#f6f0e1", card: "#fffdf6", ink: "#17140f", ink2: "#4a4234", rule: "#cdbf9f", rust: "#8c2f1b", mark: "#f0cf7a" };
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "'Atkinson Hyperlegible',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function welcomeMailParts(to: string, name: string, tempPassword: string, appUrl: string) {
  const url = appUrl.replace(/\/$/, "");
  const login = `${url}/login`;
  const first = name.trim().split(/\s+/)[0] || name;
  const steps = [
    ["Entra y crea tu contraseña", "La primera vez te pediremos reemplazar la temporal por una tuya."],
    ["Cuéntale el tema", "Indica tema, nivel y objetivo. Si tienes apuntes o un PDF, súbelos como fuente."],
    ["Revisa y aprueba", "Lámina arma fórmulas, gráficas y diapositivas; tú apruebas cada etapa antes de proyectar."],
  ];
  const text = `Hola ${first},

Ya tienes acceso a Lámina: presentaciones de clase con fórmulas, gráficas y fuentes, revisadas y aprobadas por ti.

TU ACCESO
  Dirección: ${login}
  Correo: ${to}
  Contraseña temporal: ${tempPassword}

QUÉ SIGUE
${steps.map(([t, d], n) => `  ${n + 1}. ${t}. ${d}`).join("\n")}

También puedes entrar con tu cuenta de Google si usa este mismo correo.
Si no esperabas este mensaje, ignóralo: sin entrar, la cuenta no hace nada.

— Equipo Lámina
Lámina es software libre de Cúpula Systems · ${url}`;

  const stepRows = steps.map(([t, d], n) => `<tr><td width="40" valign="top" style="padding:0 0 16px"><div style="width:28px;height:28px;line-height:28px;text-align:center;border:2px solid ${C.ink};border-radius:50%;font:700 14px ${SANS};color:${C.ink};background:${C.mark}">${n + 1}</div></td><td valign="top" style="padding:2px 0 16px;font:15px/1.5 ${SANS};color:${C.ink2}"><strong style="color:${C.ink}">${t}.</strong> ${d}</td></tr>`).join("");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Tu acceso a Lámina</title></head>
<body style="margin:0;padding:0;background:${C.paper};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">Tu cuenta está lista. Entra con tu contraseña temporal y empieza tu primera presentación.&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px">
<tr><td style="padding:0 4px 18px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td valign="middle"><img src="${esc(url)}/icon-192.png" width="40" height="40" alt="" style="display:block;border:0;border-radius:9px"></td>
<td valign="middle" style="padding-left:12px;font:600 26px ${SERIF};letter-spacing:-.02em;color:${C.ink}"><span style="background:linear-gradient(transparent 60%,${C.mark} 60%,${C.mark} 92%,transparent 92%)">Lámina</span></td>
</tr></table></td></tr>
<tr><td style="background:${C.card};border:2px solid ${C.ink};border-radius:8px;box-shadow:6px 6px 0 ${C.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:36px 36px 8px">
<div style="font:700 12px ${SANS};letter-spacing:.14em;text-transform:uppercase;color:${C.rust}">Bienvenido/a</div>
<h1 style="margin:10px 0 14px;font:600 32px/1.15 ${SERIF};letter-spacing:-.02em;color:${C.ink}">${esc(first)}, tu aula ya tiene <span style="background:${C.mark};padding:0 .12em">presentación</span></h1>
<p style="margin:0 0 22px;font:16px/1.6 ${SANS};color:${C.ink2}">Lámina crea presentaciones de clase con fórmulas, gráficas y fuentes. Tú las revisas y apruebas antes de proyectar: nada sale sin tu visto bueno.</p>
</td></tr>
<tr><td style="padding:0 36px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};border:2px dashed ${C.rule};border-radius:6px"><tr><td style="padding:18px 20px">
<div style="font:700 12px ${SANS};letter-spacing:.14em;text-transform:uppercase;color:${C.ink2};margin-bottom:10px">Tu acceso</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font:15px/1.5 ${SANS};color:${C.ink}">
<tr><td style="padding:3px 0;color:${C.ink2};width:150px">Correo</td><td style="padding:3px 0;word-break:break-all"><strong>${esc(to)}</strong></td></tr>
<tr><td style="padding:3px 0;color:${C.ink2}">Contraseña temporal</td><td style="padding:3px 0"><span style="font:700 17px 'SFMono-Regular',Consolas,'Courier New',monospace;background:${C.mark};padding:2px 8px;border-radius:4px;letter-spacing:.04em">${esc(tempPassword)}</span></td></tr>
</table></td></tr></table></td></tr>
<tr><td align="center" style="padding:24px 36px 8px"><a href="${esc(login)}" style="display:inline-block;background:${C.ink};color:${C.card};font:700 16px ${SANS};text-decoration:none;padding:14px 28px;border-radius:6px;border:2px solid ${C.ink}">Entrar a Lámina &rarr;</a>
<div style="margin-top:10px;font:13px ${SANS};color:${C.ink2}">o abre <a href="${esc(login)}" style="color:${C.rust}">${esc(login.replace(/^https?:\/\//, ""))}</a></div></td></tr>
<tr><td style="padding:28px 36px 12px"><div style="font:600 20px ${SERIF};color:${C.ink};margin-bottom:14px">Qué sigue</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${stepRows}</table></td></tr>
<tr><td style="padding:0 36px 32px"><p style="margin:0;padding-top:16px;border-top:1px solid ${C.rule};font:14px/1.55 ${SANS};color:${C.ink2}">También puedes entrar con tu cuenta de Google si usa este mismo correo. Si no esperabas este mensaje, ignóralo: sin entrar, la cuenta no hace nada.</p></td></tr>
</table></td></tr>
<tr><td align="center" style="padding:22px 12px 0;font:13px/1.6 ${SANS};color:${C.ink2}">Equipo Lámina<br><span style="color:#7a705e">Lámina es software libre de <a href="https://systems.cupula.com.ec" style="color:#7a705e">Cúpula Systems</a></span></td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}

export async function sendWelcomeMail(to: string, name: string, tempPassword: string) {
  const { text, html } = welcomeMailParts(to, name, tempPassword, env().APP_URL);
  return sendMail(to, "Tu acceso a Lámina", text, html);
}
