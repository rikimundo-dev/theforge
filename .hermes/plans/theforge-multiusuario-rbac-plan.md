# Plan: The Forge Multiusuario + RBAC

## Estado actual
- Prisma User model: `id`, `email`, `mcpSecret`, `createdAt` — **sin `role`**
- JWT: hardcodea `role: ADMIN_ROLE` ("admin") para todos
- `requestUserStore`: solo almacena `userId`
- MCP secret por usuario: `mcpSecret` — **NO ROMPER**
- Frontend: SPA con LoginView, lista de proyectos, WorkshopView

## Cambios

### 1. Prisma Schema — añadir `role` a User
```prisma
model User {
  id        String    @id @default(uuid())
  email     String    @unique
  role      String    @default("developer")  // "admin" | "developer"
  name      String?
  mcpSecret String?   @unique
  createdAt DateTime  @default(now())
  projects  Project[]
  sessions  Session[]
}
```

### 2. AuthService — usar role de DB
- `verifyOtp()`: leer `user.role` de DB en vez de `ADMIN_ROLE`
- Nuevo: `ssoLogin(token, ssoUrl)` → valida contra SSO_URL/verify → upsert user → JWT con role
- Nuevo: `listUsers()` → listar todos
- Nuevo: `updateUserRole(userId, role)` → cambiar rol
- `mcpLogin()`: incluir role real del usuario en JWT

### 3. AuthController — nuevos endpoints
- `POST /auth/sso/login` (public, solo si SSO_URL configurada)
- `GET /auth/me` → devuelve user { id, email, role, name, hasMcpSecret }
- `GET /users` (admin-only) → listar usuarios
- `PATCH /users/:id/role` (admin-only) → cambiar rol

### 4. RequestUserStore — incluir role
```ts
interface RequestUserStore {
  userId: string;
  role: string;
}
```
Nuevo: `getRequestUserRole()` helper

### 5. AdminGuard — nueva guard
- `AdminGuard` o `RolesGuard` que verifica `user.role === 'admin'`
- Se usa en el DELETE de proyectos

### 6. ProjectsController — role check
- `DELETE /projects/:id`: solo admin puede borrar
- Si developer intenta borrar → 403 Forbidden

### 7. Frontend — cambios
- **LoginView**: botón SSO si VITE_SSO_URL configurado
- **apiClient**: decodificar JWT, guardar user info
- **App.tsx**: menú "Usuarios" (admin), ocultar botón "Borrar" (developer)
- **Nuevo**: diálogo de gestión de usuarios (admin)
- **MCP Secret**: ya existe McpSecretCard, mantener intacto

### 8. Migración Prisma
- `npx prisma migrate dev --name add-user-role` para generar migración
- Los usuarios existentes mantienen su rol actual (admin tras migración porque el default se aplica a nuevos, pero hacemos un backfill)

## Orden
1. Prisma schema + migración
2. AuthService + AuthController (role dinámico, SSO, users CRUD)
3. RequestUserStore + JwtStrategy (incluir role)
4. AdminGuard + ProjectsController (proteger DELETE)
5. Frontend: apiClient, login, user management, delete conditional
