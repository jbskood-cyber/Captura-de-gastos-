# Kargo - AI Studio PWA handoff

## Objetivo

Usar esta rama como reemplazo de la version actual en AI Studio, conservando el backend Express, Gemini, Google Sheets, Google Drive, Firebase/OAuth, cola offline y configuracion PWA.

Rama de trabajo: `feature/kargo-ai-studio-pwa-integration`

Checkpoint que no debe tocarse: `checkpoint/kargo-approved-ui-v1`

## Archivos que deben copiarse a AI Studio

Copiar el proyecto completo cuando sea posible. Si AI Studio requiere sustitucion selectiva, estos archivos son obligatorios:

- `package.json`
- `index.html`
- `server.ts`
- `vite.config.ts`
- `tsconfig.json`
- `firebase-applet-config.json`
- `public/manifest.json`
- `public/sw.js`
- `public/icon.svg`
- `public/icon-192.png`
- `public/icon-512.png`
- `public/apple-touch-icon.png`
- `src/**`

No omitir:

- `src/services/firebaseAuth.ts`
- `src/services/googleWorkspace.ts`
- `src/App.tsx`
- `src/components/**`
- `src/types.ts`
- `src/index.css`

## Variables y secretos necesarios

`GEMINI_API_KEY` es obligatorio en el entorno del servidor. En AI Studio debe venir desde Secrets.

`.env.example` documenta:

```env
GEMINI_API_KEY="MY_GEMINI_API_KEY"
APP_URL="MY_APP_URL"
```

Actualmente el codigo solo consume directamente `GEMINI_API_KEY`. `APP_URL` puede existir en AI Studio sin romper nada, pero no es requerida por el runtime actual.

## Configuracion que no debe perderse

- `firebase-applet-config.json`: contiene el proyecto Firebase/OAuth que usa la app.
- Scopes OAuth en `src/services/firebaseAuth.ts`:
  - `https://www.googleapis.com/auth/spreadsheets`
  - `https://www.googleapis.com/auth/drive.file`
- IDs del backend en `server.ts`:
  - `SPREADSHEET_ID`
  - `DRIVE_FOLDER_ID`
- Endpoints Express:
  - `POST /api/process-input`
  - `GET /api/sheets/dropdowns`
  - `GET /api/sheets/activities`
  - `POST /api/sheets/gasto`
  - `POST /api/sheets/pago`
  - `POST /api/sheets/viaje`
  - `POST /api/sheets/auditoria`
  - `POST /api/drive/upload`
  - `POST /api/sheets/update-evidence`
- PWA routes explícitas:
  - `GET /sw.js`
  - `GET /manifest.json`

## PWA

`public/manifest.json` queda configurado para Kargo:

- `name`: `Kargo`
- `short_name`: `Kargo`
- `display`: `standalone`
- `start_url`: `/`
- `theme_color`: `#090b0f`
- `background_color`: `#090b0f`
- iconos PNG para Android y `apple-touch-icon.png` para iPhone

`index.html` incluye:

- viewport con `viewport-fit=cover`
- `apple-mobile-web-app-capable=yes`
- `apple-mobile-web-app-status-bar-style=black-translucent`
- `apple-mobile-web-app-title=Kargo`
- `apple-touch-icon`
- registro de `sw.js`

La UI usa safe area en la navegacion inferior para evitar corte con el home indicator.

## Modo preview

`?preview=1` solo funciona si `import.meta.env.DEV === true`.

En produccion no debe saltarse Firebase porque Vite compila `import.meta.env.DEV` como falso.

URL local esperada:

```text
http://192.168.1.70:3000?preview=1
```

## Como probar en telefono

1. En la computadora, ejecutar:

```bash
npm run dev -- --host 0.0.0.0
```

2. Conectar el telefono a la misma red Wi-Fi.
3. Abrir:

```text
http://192.168.1.70:3000?preview=1
```

4. Confirmar que entra directo a Kargo sin login y muestra `Vista previa local`.

## Instalacion como PWA en Android

1. Abrir la URL en Chrome Android.
2. Esperar a que cargue Kargo.
3. Abrir menu de Chrome.
4. Tocar `Instalar app` o `Agregar a pantalla principal`.
5. Abrir desde el icono instalado y confirmar que inicia standalone.

## Instalacion como PWA en iPhone

1. Abrir la URL en Safari iOS.
2. Tocar compartir.
3. Tocar `Agregar a pantalla de inicio`.
4. Confirmar nombre `Kargo`.
5. Abrir desde el icono instalado y validar que no se corta la navegacion inferior.

## Riesgos conocidos

- OAuth real en telefono requiere que el dominio final de AI Studio/Firebase este autorizado en Firebase Auth.
- `?preview=1` no sirve en produccion; es intencional.
- Las pruebas locales de Sheets/Drive/OAuth requieren un dominio autorizado y sesion real de Google.
- El service worker puede cachear assets antiguos durante pruebas; si se ve una version vieja, borrar datos del sitio o cambiar el cache name.
