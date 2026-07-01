# Configuración del Modo Familiar en Kargo 🚛

El **Modo Familiar** es una alternativa sumamente robusta que permite a tu familia utilizar la aplicación **Kargo** sin necesidad de iniciar sesión con cuentas individuales de Google en el navegador (evitando problemas de políticas de seguridad, pestañas iframe de IA Studio, o la molesta pantalla de error 403 de Google Auth).

En este modo, toda la comunicación con **Google Sheets** y **Google Drive** se realiza a través de un puente seguro (**Google Apps Script Web App**), que se ejecuta con los permisos de tu cuenta propietaria de Google de forma transparente.

---

## 1. Crear el Apps Script Puente en Google Sheets

Sigue estos pasos sencillos para habilitar el puente en tu hoja de cálculo:

1. Abre tu hoja de cálculo de Google Sheets registrada en el proyecto:
   - SPREADSHEET_ID actual: `1sR2fTa2TQiIliqqdzwTNKZRnYUdIhYg4Jlyo8TiCkhc`
2. En el menú superior, haz clic en **Extensiones** ➡️ **Apps Script**.
3. Se abrirá una pestaña del editor de Apps Script. Borra cualquier código existente en el archivo `Código.gs`.
4. Abre el archivo local `google-apps-script/KargoBridge.gs` en este repositorio, copia todo su contenido y pégalo en el editor de Apps Script.
5. Edita las constantes al inicio del archivo si es necesario:
   - `SPREADSHEET_ID`: Ya viene configurada la tuya.
   - `DRIVE_FOLDER_ID`: Ya viene configurada la de tu carpeta de evidencias en Drive.
   - `KARGO_BRIDGE_SECRET`: Define una frase o clave secreta de tu preferencia (ej: `BravoFletesSecreto2026`). **Apunta esta clave**, la utilizaremos en el paso 3.
6. Haz clic en el ícono de **Guardar** (el disquete) en la barra de herramientas.

---

## 2. Desplegar como Aplicación Web (Web App)

Para que Kargo pueda conectarse a este puente, debes publicarlo de la siguiente manera:

1. En la parte superior derecha del editor de Apps Script, haz clic en el botón azul **Desplegar** ➡️ **Nuevo despliegue**.
2. En la ventana emergente, haz clic en el ícono de engranaje ⚙️ (al lado de "Seleccionar tipo") y elige **Aplicación web**.
3. Configura los siguientes campos exactamente así:
   - **Descripción**: `Kargo Bridge v1`
   - **Ejecutar como**: **"Yo"** (tu cuenta de correo, de esta forma el script guardará en Sheets y Drive usando tus permisos, sin pedírselos al usuario final).
   - **Quién tiene acceso**: **"Cualquiera"** (esto es crucial para que el backend de Kargo se comunique con él, no te preocupes ya que las peticiones se protegen internamente con tu clave `KARGO_BRIDGE_SECRET`).
4. Haz clic en el botón **Desplegar**.
5. Google te pedirá **Autorizar acceso**. Haz clic en el botón correspondiente, selecciona tu cuenta de Google, haz clic en *Configuración Avanzada* (en la parte inferior izquierda) y luego haz clic en *Ir a Proyecto Sin Título (no seguro)* o *Ir a KargoBridge*. Acepta los permisos de Sheets y Drive.
6. Una vez completado el despliegue, verás una sección que dice **URL de la aplicación web**. Copia esa URL completa. Se ve algo como esto:
   `https://script.google.com/macros/s/AKfycb.../exec`

---

## 3. Configurar los Secretos (Secrets) en Google AI Studio

Vuelve a la consola de **Google AI Studio** y ve al menú de **Settings / Secrets** o agrega las siguientes variables de entorno en tu entorno de hosting:

| Nombre del Secreto | Valor de ejemplo / Descripción |
| :--- | :--- |
| `AUTH_MODE` | `family` (Activa el Modo Familiar y deshabilita Firebase Auth) |
| `KARGO_FAMILY_ACCESS_CODE` | `1234` (Código simple de acceso que tu familia escribirá al abrir la app para identificarse. Opcional, déjalo vacío si no deseas pedir código). |
| `KARGO_BRIDGE_SECRET` | La clave que configuraste en el paso 1 (ej: `BravoFletesSecreto2026`) |
| `KARGO_APPS_SCRIPT_URL` | La URL de la Web App que copiaste en el paso 2 (`https://script.google.com/macros/s/.../exec`) |
| `GEMINI_API_KEY` | Tu API Key de Gemini para el procesamiento inteligente de voz, texto y fotos. |
| `SPREADSHEET_ID` | `1sR2fTa2TQiIliqqdzwTNKZRnYUdIhYg4Jlyo8TiCkhc` |
| `DRIVE_FOLDER_ID` | `1Y2c0D1hvQ6t4pgbsVg88A6nNcBgP6NmA` |

---

## 4. Probando la Aplicación en Modo Familiar

Una vez configuradas las variables y reiniciado el servidor, abre la aplicación (con o sin el parámetro `?preview=1`):

### 4.1. Acceso y Personalización del Operador
Al abrir Kargo por primera vez:
- Si configuraste un `KARGO_FAMILY_ACCESS_CODE` (ej: `1234`), la aplicación mostrará una pantalla de acceso limpia pidiendo el código.
- Al ingresar el código correcto, la app preguntará: **"¿Quién eres?"** o **"Nombre del Operador"**.
- El usuario puede seleccionar o escribir su nombre (ej: "Papá", "Josue", "Hermano", "Raúl").
- Este nombre se guardará localmente en el dispositivo y rellenará de forma automática el campo **"Registrado_por"** en cada flete, gasto o pago que realicen.

### 4.2. Flujo Completo de Operación
1. **Captura Inteligente**: Escribe un texto, graba un audio (ej: *"Cargué 14 metros de arena para el cliente Raúl Bravo en el camión Kenworth"*) o toma una foto del recibo de diésel.
2. **Interpretación por Gemini**: Nuestra Inteligencia Artificial procesará tu entrada y estructurará los datos (monto, tipo de flete, combustible, camión, etc.) perfectamente en segundos.
3. **Revisión**: Revisa el borrador visual. Puedes corregir cualquier campo directamente en pantalla.
4. **Guardar en Google Sheets**: Haz clic en **Confirmar y Guardar**. El backend de Express enviará los datos al Apps Script, el cual añadirá la fila al documento oficial de inmediato.
5. **Fotos de Evidencia**: Toma o sube la foto del ticket. El sistema la convertirá a Base64 en segundo plano, la subirá a tu Google Drive a través del puente y ligará el enlace directo de la imagen en la celda correspondiente de Sheets.
6. **Cola Offline / Sincronización Automática**: Si tu papá o choferes andan en carretera sin señal:
   - Kargo almacenará el registro en una cola local inteligente dentro del celular.
   - Cuando recuperen señal de internet, la app mostrará un aviso discreto y les permitirá sincronizar todos los registros pendientes con un solo botón.

---

## 5. Cómo Instalar como PWA (Aplicación de Pantalla Completa)

Dado que Kargo es una PWA certificada, puedes instalarla en los teléfonos para que funcione como una app de verdad, sin barra de direcciones y con acceso offline.

### 📱 En Android (Chrome / Samsung Internet)
1. Abre la URL directa de tu aplicación en el navegador Chrome del celular:
   `https://ais-dev-2rl5amfubo7le35vf23ho3-389495706939.us-east1.run.app`
2. Verás un banner inferior o un ícono de instalación (una pantalla con flecha hacia abajo) en la barra de direcciones.
3. Si no aparece, presiona los tres puntos verticales **(⋮)** en la esquina superior derecha.
4. Selecciona **Instalar aplicación** o **Añadir a la pantalla de inicio**.
5. ¡Listo! Kargo aparecerá en tu cajón de aplicaciones con su ícono y diseño de camión correspondiente.

### 🍏 En iPhone / iPad (Safari)
1. Abre la URL directa de la aplicación en el navegador **Safari** de tu dispositivo iOS.
2. En la barra de herramientas inferior, haz clic en el ícono de **Compartir** (un cuadrado con una flecha hacia arriba).
3. Desplázate hacia abajo por el menú de compartir y selecciona **Añadir a la pantalla de inicio** (Add to Home Screen).
4. Dale el nombre "Kargo" y confirma.
5. La aplicación se colocará en tu pantalla de inicio y se abrirá en pantalla completa sin la interfaz del navegador Safari.
