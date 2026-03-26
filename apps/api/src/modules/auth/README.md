# auth

- **`POST /auth/otp/request`** — body `{ email }`. Respuesta `{ ok: true }` salvo error de servidor. Solo el correo configurado en **`EMAIL_OTP`** (preferido) o **`AUTH_ALLOWED_OTP_EMAIL`** recibe OTP; el resto obtiene la misma respuesta sin envío. **Producción (`NODE_ENV=production`):** al arranque debe existir `EMAIL_OTP` o `AUTH_ALLOWED_OTP_EMAIL` con un email válido; además exige `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`. **Desarrollo:** sin SMTP el código se registra en logs.
- **`POST /auth/otp/verify`** — body `{ email, code }`. Hace `upsert` de `User` por email y emite JWT con `sub` = `User.id`, `role: admin`. Respuesta `{ accessToken, user: { email, role: "admin" } }`. El OTP sigue en memoria hasta verificar o expirar.

Variables: `SMTP_PORT` (default 587), `SMTP_SECURE=1` solo si el servidor exige TLS directo. `SMTP_FROM` puede ser solo nombre visible; si no incluye `@`, se usa `SMTP_USER` como dirección.

**Passport:** `JwtStrategy` (`passport-jwt`) valida el Bearer; `JwtAuthGuard` extiende `AuthGuard('jwt')` y respeta `@Public()`.

Constantes en `auth.constants.ts`; JWT global vía `AuthModule`; guard global en `app.module` con `@Public()` en `/health` y `/auth/*`. El interceptor `UserContextInterceptor` guarda `userId` en `AsyncLocalStorage` para que `ProjectsService` / `SessionsService` acoten por propietario sin pasar el id en cada firma.
