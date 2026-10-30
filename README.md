# Mis gastos

Aplicación web progresiva (PWA), adaptable a móviles y en español para registrar gastos personales. La interfaz incluye:

- Gastos y secciones con emojis sugeridos, guardados localmente en el navegador.
- Vistas por día, semana, mes y año, con navegación y detalle por día.
- Filtro por sección, modo claro/oscuro y saludo según la hora.
- Confirmaciones propias al eliminar gastos o secciones.
- Instalación en el teléfono y caché de la aplicación para abrirla sin conexión.

## Requisitos

- Node.js 20.19+ o 22.12+.
- npm.

## Ejecutar en local

```sh
npm install
npm run dev
```

Para comprobar la versión de producción:

```sh
npm run build
npm run preview
```

## Supabase

El esquema de base de datos se encuentra en [`supabase/schema.sql`](./supabase/schema.sql). Ejecútalo una sola vez desde **SQL Editor** en tu proyecto Supabase. Crea perfiles y secciones iniciales al registrar una cuenta, aplica RLS por usuario y valida las fechas de los gastos.

Para el desarrollo local, copia [`.env.example`](./.env.example) a `.env` y completa la URL del proyecto y su clave pública `anon`/publishable. No uses ni publiques la clave `service_role`; `.env` está excluido de Git.

La aplicación todavía usa `localStorage`; el cliente Supabase está preparado, pero el inicio de sesión con Google y la sincronización de datos se conectarán en el siguiente paso. Para Google OAuth también habrá que habilitar Google como proveedor en Supabase y configurar las credenciales de OAuth y las URL autorizadas.

## Publicar

Genera la carpeta `dist/` con `npm run build` y publícala en Vercel o Netlify. Configura allí `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`; agrega el dominio de producción a las **Redirect URLs** de Supabase cuando se habilite OAuth.
