# ADR-007 — Autenticación y altas

- **Alta solo desde el panel admin** (correo + contraseña temporal generada y enviada por SMTP). `emailAndPassword.disableSignUp = true`; un hook `user.create.before` rechaza cualquier creación que no venga de la acción de admin (AsyncLocalStorage) salvo los correos de `ADMIN_EMAILS`.
- **Cambio obligatorio** de contraseña en el primer ingreso (`must_change_password`) y **consentimiento** de privacidad (`consent_at`) antes de usar la app (también al subir materiales).
- **Google**: `disableSignUp: true` + vinculación por correo verificado: solo entra quien ya fue dado de alta.
- **Admin**: `esteban.morocho@cupula.com.ec` por Keycloak (OIDC, cliente `lamina`, PKCE). Rol `admin` asignado por correo en `ADMIN_EMAILS`.
- Rate limit de Better Auth en BD (6 intentos/min en login) + `limit_req` en nginx. Sesiones 14 días, cookie `SameSite=Lax`, `Secure` en producción.
