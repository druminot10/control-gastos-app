# Mis gastos

Aplicación web progresiva (PWA), adaptable a móviles y en español para registrar gastos personales. La interfaz incluye:

- Inicio de sesión Google con Supabase y datos por usuario protegidos mediante RLS.
- Gastos y secciones sincronizados con Supabase, con emojis sugeridos.
- Sección “Mis gastos” con totales y calendarios por día, semana, mes y año; el año resume cada mes, cada mes desglosa los días, y al seleccionar un día se abre su tabla de gastos.
- Filtro por sección, modo claro/oscuro y saludo según la hora.
- Confirmaciones propias al eliminar gastos y archivo/restauración de secciones sin borrar el historial asociado.
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

El esquema de base de datos se encuentra en [`supabase/schema.sql`](./supabase/schema.sql). Ejecútalo desde **SQL Editor** en tu proyecto Supabase. Crea perfiles y secciones iniciales al registrar una cuenta, aplica RLS por usuario y valida las fechas de los gastos. Si la base de datos ya está creada, ejecuta las migraciones de [`supabase/migrations/`](./supabase/migrations/) en orden: `202611020001_add_expense_time.sql` y `202611030001_archive_categories.sql`. Los gastos antiguos recibirán la hora local en que se aplique la primera migración; su hora original no está disponible.

Al archivar una sección, deja de ofrecerse para gastos nuevos, pero conserva su nombre y todos sus gastos históricos. Se puede restaurar desde la administración de secciones. La base de datos también impide borrar secciones y asignar nuevos gastos a una sección archivada.

Para el desarrollo local, copia [`.env.example`](./.env.example) a `.env` y completa la URL del proyecto y su clave pública `anon`/publishable. No uses ni publiques la clave `service_role`; `.env` está excluido de Git. La aplicación no recurre silenciosamente a almacenamiento local cuando falla la conexión.

Para Google OAuth, habilita Google como proveedor en Supabase, registra allí el ID y un secreto OAuth válido, y agrega en Google Cloud el callback que muestra Supabase. En Supabase, permite `https://druminot10.github.io/control-gastos-app/` para la PWA y `cl.druminot10.controlgastos://login-callback` para Android como URL de retorno; añade también las cuentas que probarán la app si el consentimiento está en modo de prueba. No compartas secretos por chat. La hora se almacena como hora local de Chile en `expenses.spent_at`; si el esquema ya se creó, aplica primero la migración indicada arriba.

## Publicar

Genera la carpeta `dist/` con `npm run build`. Para publicar gratis en GitHub Pages, configura `VITE_SUPABASE_ANON_KEY` como secreto en **Settings > Secrets and variables > Actions** y ejecuta el workflow **Deploy PWA to GitHub Pages** desde la pestaña **Actions**. La URL de Supabase ya está configurada en el workflow. La clave `anon`/publishable está diseñada para estar en el cliente, pero nunca configures una clave `service_role`.

El sitio de Pages se publica en `https://druminot10.github.io/control-gastos-app/`. Cuando se habilite OAuth, añade esa dirección en las URL autorizadas de retorno de Supabase.

## Instalar en Android

La app puede instalarse como PWA desde una URL HTTPS publicada: abre el sitio en Chrome para Android y elige **Instalar aplicación** o **Añadir a pantalla de inicio**. Esta opción no requiere generar ni compartir un APK.

También se puede empaquetar como app Android con Capacitor. Requiere Android Studio con Android SDK y Java 21; la primera compilación requiere aceptar las licencias oficiales de Android SDK:

1. Ejecuta `npm run android:add` una sola vez para crear el proyecto Android.
2. Ejecuta `npm run android:sync` después de cada cambio web; este comando compila con rutas locales para que los recursos funcionen dentro de Android.
3. En Android Studio, instala la plataforma y herramientas Android necesarias y acepta sus licencias.
4. Ejecuta `npm run android:apk` para compilar el APK de depuración. Se genera en `android/app/build/outputs/apk/debug/app-debug.apk`. También puedes abrir el proyecto con `npm run android:open`.

El APK incluye el código y los recursos de la app, pero no la base de datos. Los gastos continúan guardándose en Supabase. Para iniciar sesión desde el APK, agrega `cl.druminot10.controlgastos://login-callback` a las URL de retorno permitidas en Supabase. El código de la app abre el flujo de Google en el navegador y recibe de vuelta la sesión mediante ese enlace.

En Android 15 y posteriores, Capacitor ajusta automáticamente los márgenes de la app para que el contenido no quede debajo de la barra de estado ni de la navegación del sistema.
