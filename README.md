# Captura Bravo 🚚💨
> Aplicación Móvil (PWA) de Captura Rápida e Inteligente para el Negocio Familiar de Transporte de Carga.

**Captura Bravo** es una aplicación web progresiva (PWA) de alto rendimiento diseñada específicamente para facilitar y acelerar el registro de fletes, cobros y gastos de un negocio familiar de camiones de carga de materiales en México.

La aplicación permite registrar transacciones en menos de 30 segundos utilizando comandos de voz o imágenes de tickets, interpretados inteligentemente por la API de **Gemini 2.5 Flash**, y almacenados directamente de forma segura en hojas de cálculo de **Google Sheets** y archivos de **Google Drive**.

---

## 🌟 Características Principales

### 1. 🎙️ Dictado de Voz Inteligente e Interpretación de Imágenes
*   **Dictado por voz**: Graba notas de voz (ej. *"Cargué 1,500 de diésel para el camión CAM-001 en la gasolinera Pemex y pagué en efectivo"*) y deja que la IA de Gemini extraiga de manera exacta el monto, método de pago, camión, proveedor y categoría.
*   **Captura de tickets / imágenes**: Toma fotos de notas o recibos desde la cámara o súbelas desde la galería. La IA analizará la imagen del ticket de forma multimodal para auto-completar el formulario de gastos.

### 2. 📁 Integración Directa con Google Workspace
*   **Google Sheets (Base de Datos)**: Todos los datos recolectados se sincronizan en tiempo real con la "Base Maestra" en la nube en las pestañas `Gastos`, `Pagos` y `Viajes`.
*   **Google Drive (Evidencias)**: Las fotos tomadas para fletes (carga/descarga) y tickets de gastos se suben automáticamente a carpetas privadas designadas de Google Drive, vinculando sus enlaces a las filas correspondientes de Google Sheets.
*   **Catálogos Dinámicos**: Los dropdowns de Camiones (`Camiones!A2:B100`) y Clientes (`Clientes!A2:B100`) se cargan dinámicamente desde el Google Sheet maestro, mostrando nombres formales combinados como `"ID — Nombre"`.

### 3. 🛡️ Auditoría Rigurosa y Seguridad
*   **Pestaña Auditoría**: Cada registro o modificación dispara un evento de auditoría que se escribe de forma estructurada en la Base Maestra con 11 columnas específicas:
    `id_evento`, `fecha_hora`, `usuario`, `accion`, `entidad`, `entidad_id`, `campo_modificado`, `valor_anterior`, `valor_nuevo`, `fuente`, `notas`.
*   **Privacidad por Defecto**: Todos los archivos cargados a Google Drive conservan sus permisos privados por defecto para evitar fugas de información.

### 4. 📲 Experiencia PWA Confiable
*   **Instalación nativa**: Se puede agregar a la pantalla de inicio en dispositivos iOS y Android para funcionar a pantalla completa con aspecto de aplicación nativa.
*   **Optimización Offline (Cola de Sincronización)**: Si el chofer o administrador se encuentra en un tramo de carretera sin señal, los registros se encolan localmente en el navegador (`localStorage`). Al recuperar la conexión a internet, la aplicación alerta al usuario para sincronizar de forma masiva con un solo toque.

---

## 🛠️ Stack Tecnológico

*   **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons, Framer Motion.
*   **Backend**: Node.js, Express (servidor proxy robusto para APIs de Google Workspace y Gemini).
*   **IA**: SDK `@google/genai` utilizando el modelo `gemini-2.5-flash` para interpretación multimodal de voz, imágenes y texto.
*   **Autenticación y Workspace**: OAuth2 de Google para autorización de lectura/escritura segura directamente en el ecosistema Workspace del usuario.

---

## 📊 Estructura de Datos (Google Sheets)

### 📈 Pestaña: Gastos
| Columna | Campo | Descripción |
| :--- | :--- | :--- |
| **A** | ID_gasto | Identificador único (`G-XXXXX`) |
| **F** | Categoría | Tipo de gasto (Diésel, Refacciones, Casetas, Sueldos, etc.) |
| **H** | Monto_MXN | Valor numérico del gasto |
| **J** | Camión | Camión asociado (ID y nombre de unidad) |
| **Q** | URL_evidencia_Drive | Enlace privado al ticket subido a Google Drive |

### 📈 Pestaña: Viajes
| Columna | Campo | Descripción |
| :--- | :--- | :--- |
| **A** | ID_viaje | Identificador único (`V-XXXXX`) |
| **E** | Cliente | Cliente asociado al flete |
| **F** | Origen | Lugar de origen de carga |
| **G** | Destino | Lugar de entrega |
| **K** | Camión | Camión asignado al flete |
| **M** | Precio_cobrado_MXN | Cuánto se le cobra al cliente por el servicio |
| **Q** | URL_evidencia_carga | Enlace privado al comprobante de carga |
| **R** | URL_evidencia_descarga | Enlace privado al comprobante de descarga |

### 📈 Pestaña: Pagos
| Columna | Campo | Descripción |
| :--- | :--- | :--- |
| **A** | ID_pago | Identificador único (`P-XXXXX`) |
| **E** | Cliente | Cliente que realiza el pago |
| **F** | Monto_MXN | Importe del abono/pago |
| **K** | URL_evidencia_Drive | Enlace privado al comprobante de pago/transferencia |

### 📈 Pestaña: Auditoría
Conserva exactamente el siguiente esquema estructurado de 11 columnas en la Base Maestra:
1.  `id_evento` (ID de auditoría aleatorio `AUD-XXXXXX`)
2.  `fecha_hora` (Marca de tiempo combinada `YYYY-MM-DD HH:MM:SS`)
3.  `usuario` (Email del usuario registrado que realizó la acción)
4.  `accion` (Acción ejecutada: ej. `CREAR_GASTO`, `ACTUALIZAR_EVIDENCIA`, etc.)
5.  `entidad` (Entidad afectada: `gasto`, `pago`, `viaje`)
6.  `entidad_id` (ID del registro afectado)
7.  `campo_modificado` (Nombre del campo alterado si aplica)
8.  `valor_anterior` (Valor previo si aplica)
9.  `valor_nuevo` (Valor insertado o actualizado si aplica)
10. `fuente` (Origen: `"Captura Bravo PWA"`)
11. `notas` (Detalles adicionales aclaratorios legibles por humanos)

---

## ⚙️ Configuración del Entorno (`.env`)

Para ejecutar o compilar el proyecto localmente, es necesario configurar las siguientes variables de entorno:

```env
# API Key de Google Gemini para procesamiento inteligente de voz/texto/imagen
GEMINI_API_KEY=tu_api_key_de_gemini
```

---

## 🚀 Instalación y Desarrollo

1. Instalar las dependencias de Node.js:
   ```bash
   npm install
   ```
2. Iniciar el servidor de desarrollo en modo local (servidor Express proxy en puerto 3000):
   ```bash
   npm run dev
   ```
3. Construir para producción (compila el frontend a `/dist` y el backend en un bundle robusto `/dist/server.cjs`):
   ```bash
   npm run build
   ```
4. Iniciar el servidor en producción:
   ```bash
   npm run start
   ```
