"use client";
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({ plugins: [adminClient()] });

/** Inicio de sesión con Keycloak (CUPULA SSO) vía el endpoint genérico OAuth2 de Better Auth. */
export async function signInKeycloak() {
  const res = await fetch("/api/auth/sign-in/oauth2", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ providerId: "keycloak", callbackURL: "/dashboard", errorCallbackURL: "/login" }),
  });
  const j = (await res.json().catch(() => ({}))) as { url?: string };
  if (j.url) window.location.href = j.url;
}
