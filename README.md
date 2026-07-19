# DO-PLATAFORMA-GAM

Plataforma de juegos interactivos en vivo para reuniones de Zoom.

## Estructura
- `/server` -> Backend (Node + Express + Socket.io + Postgres). Se despliega en **Render**. Root Directory: `server`
- `/web` -> Frontend (Next.js). Se despliega en **Vercel**. Root Directory: `web`
- `/db` -> Scripts SQL para ejecutar en **Neon** (schema.sql primero, luego migration_02_auth_images.sql)

## Variables de entorno

### Render (server)
- `DATABASE_URL` -> connection string de Neon
- `JWT_SECRET` -> cualquier texto secreto largo
- `ADMIN_BOOTSTRAP_SECRET` -> otro texto secreto (solo se usa una vez)

### Vercel (web)
- `NEXT_PUBLIC_API_URL` -> URL pública del servicio en Render (sin `/` al final)
