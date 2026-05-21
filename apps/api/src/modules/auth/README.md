# auth

Auth multi-usuario con OTP por email + JWT. Cada `User` tiene su propio `mcpSecret` (API key M2M).

## Endpoints

### Públicos (`@Public()`)

- **`POST /auth/otp/request`** — body `{ email }` (requerido). Si el email **existe** en la tabla `User`, genera un OTP de 6 dígitos y lo envía por SMTP (o lo loguea en dev). Si no existe, devuelve `{ ok: true }` igualmente (anti-enumeración). Throttle: 1 envío por minuto por email.
- **`POST /auth/otp/verify`** — body `{ email, code }`. Valida el OTP contra el email, busca el `User`, asegura `mcpSecret` y emite JWT (`sub` = `User.id`, `email`, `role`).
- **`POST /auth/mcp-login`** — body `{ secret }`. Intercambia un `mcpSecret` por JWT del usuario dueño del secret. Usado por el MCP server.
- **`POST /auth/sso/login`** — body `{ token }`. Login vía SSO externo (`SSO_URL/verify`). Crea/actualiza usuario local.
- **`GET /auth/has-users`** — `{ hasUsers: boolean }`. Usado por el `SetupView` para detectar primer arranque.
- **`POST /auth/register-first-admin`** — body `{ email, name? }`. Crea el primer usuario con rol `super_admin` (solo si la tabla `User` está vacía). Genera `mcpSecret` automáticamente.

### Autenticados (JWT)

- **`GET /auth/me`** — perfil del usuario autenticado.
- **`GET /auth/mcp-secret`** — devuelve el `mcpSecret` propio (lo genera si falta).
- **`POST /auth/mcp-secret/regenerate`** — rota el `mcpSecret` propio.

### Admin-only (`/users`)

- **`GET /users`** — lista usuarios (`{ id, email, role, name, hasMcpSecret, createdAt }[]`).
- **`POST /users`** — body `{ email, name?, role? }`. Crea usuario y genera `mcpSecret`.
- **`PATCH /users/:id/role`** — body `{ role }` (`super_admin` | `admin` | `developer`). Cualquier `admin` o `super_admin` puede asignar o quitar `super_admin`. No permite degradarse a sí mismo a `developer` (`403`).
- **`DELETE /users/:id`** — elimina usuario (cascada sobre projects/sessions). No permite borrar la propia cuenta (`403`).
- **`GET /users/:id/mcp-secret`** — ver `mcpSecret` de cualquier usuario.
- **`POST /users/:id/mcp-secret/regenerate`** — rotar `mcpSecret` de cualquier usuario.

## SMTP

Variables: `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_SECURE=1` solo si TLS directo, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (puede ser solo nombre visible; si no incluye `@`, se usa `SMTP_USER`). En producción son obligatorias para `requestOtp` salvo `OTP_DEV_EXPOSE_CODE=1`.

`OTP_DEV_EXPOSE_CODE=1` (o `true`/`yes`/`on`): la respuesta de `POST /auth/otp/request` incluye `devCode` y **no** se envía correo. Con `0` u omitido: se envía por SMTP; sin SMTP la petición falla con 503.

`WEB_DOMAIN` opcional: habilita en el correo el formato iOS `@dominio #code` y un magic link `https://${dominio}/auth/magic-link?otp=...&email=...`.

## Notas

- Un administrador **no puede** eliminar su cuenta ni bajar su propio rol a `developer` por API (evita lock-out); otro admin debe hacerlo.
- `mcpSecret`: 32 bytes hex (64 chars). Único por usuario, rotable. Si un usuario lo compromete, regenerar invalida el anterior.
- **Passport:** `JwtStrategy` (`passport-jwt`) valida el Bearer; `JwtAuthGuard` global respeta `@Public()`.
- `UserContextInterceptor` + `AsyncLocalStorage` propagan `userId` y `role` por petición (`getRequestUserId`, `getRequestUserRole`).
