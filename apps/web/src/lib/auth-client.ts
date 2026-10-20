"use client";
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({ plugins: [adminClient()] });

/** Inicio de sesión con Keycloak (CUPULA SSO): en Better Auth 1.7 el plugin genericOAuth se registra como proveedor social. */
export async function signInKeycloak() {
  await authClient.signIn.social({ provider: "keycloak", callbackURL: "/dashboard", errorCallbackURL: "/login" });
}
