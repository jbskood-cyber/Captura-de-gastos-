import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;
const AUTH_MODE = process.env.AUTH_MODE || "oauth";
const FAMILY_ACCESS_CODE = process.env.KARGO_FAMILY_ACCESS_CODE || "";
const KARGO_BRIDGE_SECRET = process.env.KARGO_BRIDGE_SECRET || "";
const KARGO_APPS_SCRIPT_URL = process.env.KARGO_APPS_SCRIPT_URL || "";

// Increase payload limits for base64 images and audio
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Lazy init Gemini SDK
let aiClient: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("Warning: GEMINI_API_KEY is not defined in the environment variables!");
    }
    aiClient = new GoogleGenAI({ apiKey: key || "" });
  }
  return aiClient;
}

function hasBridgeConfig() {
  return Boolean(KARGO_APPS_SCRIPT_URL && KARGO_BRIDGE_SECRET);
}

async function callKargoBridge(action: string, payload: Record<string, unknown>) {
  if (!hasBridgeConfig()) {
    throw new Error("Kargo Bridge no esta configurado.");
  }

  const response = await fetch(KARGO_APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: KARGO_BRIDGE_SECRET,
      action,
      payload,
    }),
  });

  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok || data?.ok === false || data?.success === false) {
    throw new Error(`Kargo Bridge ${action} failed: ${response.status} ${text}`);
  }

  return data;
}

app.get("/api/runtime-config", (_req: express.Request, res: express.Response) => {
  res.json({
    authMode: AUTH_MODE,
    familyMode: AUTH_MODE === "family",
    bridgeConfigured: hasBridgeConfig(),
  });
});

app.post("/api/family/verify-code", (req: express.Request, res: express.Response) => {
  if (AUTH_MODE !== "family") {
    return res.json({ ok: true });
  }

  const { code } = req.body || {};
  if (!FAMILY_ACCESS_CODE) {
    return res.status(500).json({ error: "KARGO_FAMILY_ACCESS_CODE no esta configurado." });
  }

  if (String(code || "").trim() !== FAMILY_ACCESS_CODE) {
    return res.status(401).json({ error: "Codigo familiar incorrecto." });
  }

  return res.json({ ok: true });
});

// AI Endpoint to parse text, image, or audio input
app.post("/api/process-input", async (req: express.Request, res: express.Response) => {
  try {
    const { text, type, image, audio, mimeType, camiones, clientes } = req.body;

    const ai = getGeminiClient();
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Falta la API Key de Gemini en el servidor. Configurala en el panel de secretos.",
      });
    }

    // Prepare content parts for Gemini
    const contents: any[] = [];

    // System prompt instructing Gemini
    const systemPrompt = `
Eres la Inteligencia Artificial de "Kargo", una app familiar para registrar gastos, pagos y viajes de camiones de carga en Mexico.
Tu tarea es analizar la entrada provista (texto, foto o audio) y estructurar los datos en un formato JSON limpio y preciso de acuerdo con la clasificacion solicitada.

Categorias y sus respectivos esquemas de salida:

1. Gasto (gasto): Registrar compras de combustible, refacciones, alimentos, casetas, sueldos de choferes, etc.
   Campos JSON esperados:
   - categoria: Tipo de gasto (ej. "Diesel", "Refacciones", "Casetas", "Sueldo Chofer", "Comida", "Otro"). Debe coincidir razonablemente con estos valores.
   - subcategoria: Detalle del gasto (ej. "Llantas", "Filtro", "Peaje", "Almuerzo", etc.).
   - monto_mxn: Monto total en pesos mexicanos (numero).
   - metodo_pago: Metodo utilizado (ej. "Efectivo", "Transferencia", "Tarjeta").
   - camion: El camion asociado. Revisa la lista de camiones validos provista abajo para ver si coincide alguno.
   - chofer: Nombre del chofer asociado (si se menciona).
   - cliente: Cliente asociado (si se menciona).
   - proveedor: Negocio donde se hizo el gasto (ej. "Gasolinera Pemex", "Refaccionaria El Rojo").
   - notas: Detalles adicionales o aclaraciones extraidas de la entrada.

2. Pago (pago): Abono o liquidacion que hace un cliente por un viaje.
   Campos JSON esperados:
   - cliente: Nombre del cliente. Intenta que coincida con la lista de clientes validos.
   - monto_mxn: Monto recibido en pesos mexicanos (numero).
   - metodo_pago: Metodo utilizado (ej. "Efectivo", "Transferencia", "Tarjeta").
   - viaje_id: ID del viaje si se menciona (ej. V-1002).
   - saldo_restante_mxn: Saldo que resta por pagar (si se menciona, numero, o nulo si no se menciona).
   - estado_pago: "pendiente", "parcial" o "liquidado" (basado en el contexto).
   - notas: Notas adicionales.

3. Viaje (viaje): Registro de un flete o viaje realizado por un camion.
   Campos JSON esperados:
   - cliente: Nombre del cliente. Intenta que coincida con la lista de clientes validos.
   - origen: Lugar donde carga el material.
   - destino: Lugar de entrega.
   - material: Tipo de material (ej. "Arena", "Grava", "Asfalto", "Piedra", "Tierra").
   - metros_cubicos: Volumen en metros cubicos (numero, si se menciona).
   - kilometros: Distancia recorrida (numero, si se menciona).
   - camion: Camion que hizo el viaje. Revisa la lista de camiones validos abajo.
   - chofer: Chofer que manejo.
   - precio_cobrado_mxn: Cuanto se le cobra al cliente por el flete (numero).
   - costo_estimado_mxn: Costo del diesel y casetas estimado para este viaje (si se menciona, numero).
   - observaciones: Notas u observaciones adicionales.

LISTA DE CAMIONES REGISTRADOS EN EL SISTEMA:
${camiones && camiones.length > 0 ? camiones.join(", ") : "Ninguno registrado aun (asigna el que mencione el usuario)"}

LISTA DE CLIENTES REGISTRADOS EN EL SISTEMA:
${clientes && clientes.length > 0 ? clientes.join(", ") : "Ninguno registrado aun (asigna el que mencione el usuario)"}

REGLAS DE INTERPRETACION:
- Se inteligente extrayendo montos numericos. "ochocientos cincuenta" es 850. "tres mil quinientos" es 3500.
- Si el usuario NO especifico explicitamente el tipo de registro (gasto, pago, viaje), detectalo automaticamente analizando el texto, la imagen o el audio.
- Calcula un nivel de confianza_ia: "alta" (si la informacion es clara y completa), "media" (si faltan varios datos y se requiere revisar), o "baja" (si la entrada es confusa, ruidosa o incomprensible).
- Responde UNICAMENTE con un objeto JSON valido con la siguiente estructura exacta:
{
  "tipo_registro": "gasto" | "pago" | "viaje",
  "confianza_ia": "alta" | "media" | "baja",
  "datos": { ...campos especificos de la categoria seleccionada... }
}
`;

    // 1. Add instructions as the prompt
    contents.push({
      role: "user",
      parts: [
        { text: systemPrompt },
        { text: `Entrada provista por el usuario para interpretar:${text ? `\nTexto: "${text}"` : ""}\nTipo de registro pre-seleccionado por usuario: ${type || "auto"}` }
      ]
    });

    // 2. Handle Multimodal Image if present
    if (image) {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      contents[0].parts.push({
        inlineData: {
          mimeType: mimeType || "image/jpeg",
          data: base64Data
        }
      });
      contents[0].parts.push({
        text: "Analiza tambien esta imagen adjunta (recibo, factura o evidencia) para extraer los datos."
      });
    }

    // 3. Handle Multimodal Audio if present
    if (audio) {
      const base64Data = audio.replace(/^data:audio\/\w+;base64,/, "");
      contents[0].parts.push({
        inlineData: {
          mimeType: mimeType || "audio/webm",
          data: base64Data
        }
      });
      contents[0].parts.push({
        text: "Escucha este archivo de audio grabado por el usuario que contiene el registro de voz y extrae la informacion dictada."
      });
    }

    // Generate content using gemini-2.5-flash
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        responseMimeType: "application/json",
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("No response received from Gemini");
    }

    // Parse output
    const resultJson = JSON.parse(responseText.trim());
    return res.json(resultJson);

  } catch (error: any) {
    console.error("Error processing input with Gemini:", error);
    return res.status(500).json({
      error: "Ocurrio un error al procesar la informacion con Inteligencia Artificial.",
      details: error.message
    });
  }
});

// --- GOOGLE WORKSPACE SERVER-SIDE PROXY ---
const SPREADSHEET_ID = "1sR2fTa2TQiIliqqdzwTNKZRnYUdIhYg4Jlyo8TiCkhc";
const DRIVE_FOLDER_ID = "1Y2c0D1hvQ6t4pgbsVg88A6nNcBgP6NmA";

function getGoogleToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  return authHeader.replace(/^Bearer\s+/i, "");
}

async function getSheetValues(accessToken: string, range: string): Promise<any[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sheets fetch range ${range} failed: ${response.statusText} (${errorText})`);
  }
  const data: any = await response.json();
  return data.values || [];
}

async function appendSheetValues(accessToken: string, range: string, values: any[][]): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sheets append range ${range} failed: ${response.statusText} (${errorText})`);
  }
}

async function updateSheetValues(accessToken: string, range: string, values: any[][]): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sheets update range ${range} failed: ${response.statusText} (${errorText})`);
  }
}

async function findRowById(accessToken: string, sheetName: string, id: string): Promise<number> {
  const rows = await getSheetValues(accessToken, `${sheetName}!A1:A3000`);
  const rowIndex = rows.findIndex((row) => row?.[0] === id);
  return rowIndex === -1 ? -1 : rowIndex + 1;
}

async function writeAuditoriaOnServer(
  accessToken: string,
  userEmail: string,
  accion: string,
  entidad: string,
  entidadId: string,
  campoModificado: string,
  valorAnterior: string,
  valorNuevo: string,
  notas: string
): Promise<void> {
  try {
    const now = new Date();
    const fechaHora = now.toISOString().replace("T", " ").substring(0, 19);
    const id_evento = "AUD-" + Math.floor(100000 + Math.random() * 900000);
    const fuente = "Captura Bravo PWA";

    const row = [
      id_evento,
      fechaHora,
      userEmail || "",
      accion || "",
      entidad || "",
      entidadId || "",
      campoModificado || "",
      valorAnterior || "",
      valorNuevo || "",
      fuente,
      notas || ""
    ];
    await appendSheetValues(accessToken, "Auditor\u00eda", [row]);
  } catch (err) {
    console.error("Auditoria write failed on server:", err);
  }
}

// 1. Dropdowns Endpoint (Camiones and Clientes)
app.get("/api/sheets/dropdowns", async (req: express.Request, res: express.Response) => {
  const token = getGoogleToken(req);
  if (!token && hasBridgeConfig()) {
    try {
      const data = await callKargoBridge("getDropdowns", {});
      return res.json({
        camiones: data.camiones || data.payload?.camiones || [],
        clientes: data.clientes || data.payload?.clientes || [],
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Fallo al cargar catalogos desde Kargo Bridge", details: err.message });
    }
  }
  if (!token) {
    return res.status(401).json({ error: "No se proporciono token de autorizacion." });
  }

  try {
    const [camionesRows, clientesRows] = await Promise.all([
      getSheetValues(token, "Camiones!A2:B100").catch(() => []),
      getSheetValues(token, "Clientes!A2:B100").catch(() => [])
    ]);

    const camiones = camionesRows
      .map((row) => {
        const id = row[0] ? String(row[0]).trim() : "";
        const nombre = row[1] ? String(row[1]).trim() : "";
        if (id && nombre) {
          return `${id} - ${nombre}`;
        }
        return id;
      })
      .filter(Boolean);

    const clientes = clientesRows
      .map((row) => {
        const id = row[0] ? String(row[0]).trim() : "";
        const nombre = row[1] ? String(row[1]).trim() : "";
        if (id && nombre) {
          return `${id} - ${nombre}`;
        }
        return id;
      })
      .filter(Boolean);

    return res.json({ camiones, clientes });
  } catch (err: any) {
    console.error("Error loading dropdown data on server:", err);
    return res.status(500).json({ error: "Fallo al cargar camiones/clientes del servidor", details: err.message });
  }
});

// 2. Read All Activities (Gastos, Pagos, Viajes)
app.get("/api/sheets/activities", async (req: express.Request, res: express.Response) => {
  const token = getGoogleToken(req);
  if (!token && hasBridgeConfig()) {
    try {
      const data = await callKargoBridge("getActivities", {});
      return res.json({ activities: data.activities || data.payload?.activities || [] });
    } catch (err: any) {
      return res.status(500).json({ error: "Fallo al obtener registros desde Kargo Bridge", details: err.message });
    }
  }
  if (!token) {
    return res.status(401).json({ error: "No se proporciono token de autorizacion." });
  }

  try {
    const [gastosRows, pagosRows, viajesRows] = await Promise.all([
      getSheetValues(token, "Gastos!A2:X2000").catch(() => []),
      getSheetValues(token, "Pagos!A2:S2000").catch(() => []),
      getSheetValues(token, "Viajes!A2:Z2000").catch(() => [])
    ]);

    const gastos = gastosRows.map((row) => ({
      ID_gasto: row[0] || "",
      Fecha: row[1] || "",
      Hora: row[2] || "",
      Registrado_por: row[3] || "",
      Tipo_entrada: row[4] || "texto",
      ["Categor\u00eda"]: row[5] || "",
      Categoria: row[5] || "",
      ["Subcategor\u00eda"]: row[6] || "",
      Subcategoria: row[6] || "",
      Monto_MXN: Number(row[7]) || 0,
      ["M\u00e9todo_pago"]: row[8] || "",
      Metodo_pago: row[8] || "",
      ["Cami\u00f3n"]: row[9] || "",
      Camion: row[9] || "",
      Chofer: row[10] || "",
      Cliente: row[11] || "",
      Viaje_ID: row[12] || "",
      Proveedor: row[13] || "",
      Estado_validacion: row[14] || "pendiente_aprobacion",
      ["Estado_validaci\u00f3n"]: row[14] || "pendiente_aprobacion",
      Confianza_IA: row[15] || "alta",
      URL_evidencia_Drive: row[16] || "",
      Notas: row[17] || "",
      Created_at: row[18] || "",
      Updated_at: row[19] || "",
      Aprobado_por: row[20] || "",
      Fecha_aprobacion: row[21] || "",
      Hora_aprobacion: row[22] || "",
      Notas_aprobacion: row[23] || "",
      _type: "gasto"
    })).filter((g) => g.ID_gasto);

    const pagos = pagosRows.map((row) => ({
      ID_pago: row[0] || "",
      Fecha: row[1] || "",
      Hora: row[2] || "",
      Registrado_por: row[3] || "",
      Cliente: row[4] || "",
      Monto_MXN: Number(row[5]) || 0,
      ["M\u00e9todo_pago"]: row[6] || "",
      Metodo_pago: row[6] || "",
      Viaje_ID: row[7] || "",
      Saldo_restante_MXN: Number(row[8]) || 0,
      Estado_pago: row[9] || "",
      URL_evidencia_Drive: row[10] || "",
      Notas: row[11] || "",
      Created_at: row[12] || "",
      Updated_at: row[13] || "",
      Estado_validacion: row[14] || "pendiente_aprobacion",
      ["Estado_validaci\u00f3n"]: row[14] || "pendiente_aprobacion",
      Aprobado_por: row[15] || "",
      Fecha_aprobacion: row[16] || "",
      Hora_aprobacion: row[17] || "",
      Notas_aprobacion: row[18] || "",
      _type: "pago"
    })).filter((p) => p.ID_pago);

    const viajes = viajesRows.map((row) => ({
      ID_viaje: row[0] || "",
      Fecha: row[1] || "",
      Hora: row[2] || "",
      Registrado_por: row[3] || "",
      Cliente: row[4] || "",
      Origen: row[5] || "",
      Destino: row[6] || "",
      Material: row[7] || "",
      Metros_cubicos: Number(row[8]) || 0,
      ["Kil\u00f3metros"]: Number(row[9]) || 0,
      Kilometros: Number(row[9]) || 0,
      ["Cami\u00f3n"]: row[10] || "",
      Camion: row[10] || "",
      Chofer: row[11] || "",
      Precio_cobrado_MXN: Number(row[12]) || 0,
      Costo_estimado_MXN: Number(row[13]) || 0,
      Utilidad_estimada_MXN: Number(row[14]) || 0,
      Estado_pago: row[15] || "",
      URL_evidencia_carga: row[16] || "",
      URL_evidencia_descarga: row[17] || "",
      Observaciones: row[18] || "",
      Created_at: row[19] || "",
      Updated_at: row[20] || "",
      Estado_validacion: row[21] || "pendiente_aprobacion",
      ["Estado_validaci\u00f3n"]: row[21] || "pendiente_aprobacion",
      Aprobado_por: row[22] || "",
      Fecha_aprobacion: row[23] || "",
      Hora_aprobacion: row[24] || "",
      Notas_aprobacion: row[25] || "",
      _type: "viaje"
    })).filter((v) => v.ID_viaje);

    const activities = [...gastos, ...pagos, ...viajes];

    // Sort descending by Created_at or Date/Time
    activities.sort((a, b) => {
      const dateA = a.Created_at || `${a.Fecha}T${a.Hora}`;
      const dateB = b.Created_at || `${b.Fecha}T${b.Hora}`;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return res.json({ activities });
  } catch (err: any) {
    console.error("Error fetching activities from sheets on server:", err);
    return res.status(500).json({ error: "Fallo al obtener registros de Google Sheets", details: err.message });
  }
});

// 3. Save Gasto
app.post("/api/sheets/gasto", async (req: express.Request, res: express.Response) => {
  const token = getGoogleToken(req);
  const { gasto } = req.body;
  if (!gasto) return res.status(400).json({ error: "Falta el registro del gasto" });
  if (!token && hasBridgeConfig()) {
    try {
      await callKargoBridge("saveGasto", { gasto });
      return res.json({ success: true, bridge: true });
    } catch (err: any) {
      return res.status(500).json({ error: "Fallo al guardar gasto por Kargo Bridge", details: err.message });
    }
  }
  if (!token) return res.status(401).json({ error: "No autorizado" });

  try {
    const row = [
      gasto.ID_gasto,
      gasto.Fecha,
      gasto.Hora,
      gasto.Registrado_por,
      gasto.Tipo_entrada,
      gasto["Categor\u00eda"] || gasto.Categoria || "",
      gasto["Subcategor\u00eda"] || gasto.Subcategoria || "",
      gasto.Monto_MXN,
      gasto["M\u00e9todo_pago"] || gasto.Metodo_pago || "",
      gasto["Cami\u00f3n"] || gasto.Camion || "",
      gasto.Chofer,
      gasto.Cliente,
      gasto.Viaje_ID,
      gasto.Proveedor,
      gasto.Estado_validacion || gasto["Estado_validaci\u00f3n"] || "pendiente_aprobacion",
      gasto.Confianza_IA,
      gasto.URL_evidencia_Drive,
      gasto.Notas,
      gasto.Created_at,
      gasto.Updated_at,
      gasto.Aprobado_por || "",
      gasto.Fecha_aprobacion || gasto["Fecha_aprobaci\u00f3n"] || "",
      gasto.Hora_aprobacion || gasto["Hora_aprobaci\u00f3n"] || "",
      gasto.Notas_aprobacion || gasto["Notas_aprobaci\u00f3n"] || "",
    ];
    await appendSheetValues(token, "Gastos", [row]);
    await writeAuditoriaOnServer(
      token,
      gasto.Registrado_por,
      "CREAR_GASTO",
      "gasto",
      gasto.ID_gasto,
      "",
      "",
      JSON.stringify({ Monto_MXN: gasto.Monto_MXN, Categoria: gasto["Categor\u00eda"] || gasto.Categoria || "" }),
      `Gasto de $${gasto.Monto_MXN} guardado en Sheets.`
    );
    return res.json({ success: true });
  } catch (err: any) {
    console.error("Error saving gasto on server:", err);
    return res.status(500).json({ error: "Fallo al guardar gasto", details: err.message });
  }
});

// 4. Save Pago
app.post("/api/sheets/pago", async (req: express.Request, res: express.Response) => {
  const token = getGoogleToken(req);
  const { pago } = req.body;
  if (!pago) return res.status(400).json({ error: "Falta el registro del pago" });
  if (!token && hasBridgeConfig()) {
    try {
      await callKargoBridge("savePago", { pago });
      return res.json({ success: true, bridge: true });
    } catch (err: any) {
      return res.status(500).json({ error: "Fallo al guardar pago por Kargo Bridge", details: err.message });
    }
  }
  if (!token) return res.status(401).json({ error: "No autorizado" });

  try {
    const row = [
      pago.ID_pago,
      pago.Fecha,
      pago.Hora,
      pago.Registrado_por,
      pago.Cliente,
      pago.Monto_MXN,
      pago["M\u00e9todo_pago"] || pago.Metodo_pago || "",
      pago.Viaje_ID,
      pago.Saldo_restante_MXN,
      pago.Estado_pago,
      pago.URL_evidencia_Drive,
      pago.Notas,
      pago.Created_at,
      pago.Updated_at,
      pago.Estado_validacion || pago["Estado_validaci\u00f3n"] || "pendiente_aprobacion",
      pago.Aprobado_por || "",
      pago.Fecha_aprobacion || pago["Fecha_aprobaci\u00f3n"] || "",
      pago.Hora_aprobacion || pago["Hora_aprobaci\u00f3n"] || "",
      pago.Notas_aprobacion || pago["Notas_aprobaci\u00f3n"] || "",
    ];
    await appendSheetValues(token, "Pagos", [row]);
    await writeAuditoriaOnServer(
      token,
      pago.Registrado_por,
      "CREAR_PAGO",
      "pago",
      pago.ID_pago,
      "",
      "",
      JSON.stringify({ Monto_MXN: pago.Monto_MXN, Cliente: pago.Cliente }),
      `Pago de $${pago.Monto_MXN} por cliente ${pago.Cliente} guardado.`
    );
    return res.json({ success: true });
  } catch (err: any) {
    console.error("Error saving pago on server:", err);
    return res.status(500).json({ error: "Fallo al guardar pago", details: err.message });
  }
});

// 5. Save Viaje
app.post("/api/sheets/viaje", async (req: express.Request, res: express.Response) => {
  const token = getGoogleToken(req);
  const { viaje } = req.body;
  if (!viaje) return res.status(400).json({ error: "Falta el flete o viaje" });
  if (!token && hasBridgeConfig()) {
    try {
      await callKargoBridge("saveViaje", { viaje });
      return res.json({ success: true, bridge: true });
    } catch (err: any) {
      return res.status(500).json({ error: "Fallo al guardar viaje por Kargo Bridge", details: err.message });
    }
  }
  if (!token) return res.status(401).json({ error: "No autorizado" });

  try {
    const row = [
      viaje.ID_viaje,
      viaje.Fecha,
      viaje.Hora,
      viaje.Registrado_por,
      viaje.Cliente,
      viaje.Origen,
      viaje.Destino,
      viaje.Material,
      viaje.Metros_cubicos,
      viaje["Kil\u00f3metros"] || viaje.Kilometros || 0,
      viaje["Cami\u00f3n"] || viaje.Camion || "",
      viaje.Chofer,
      viaje.Precio_cobrado_MXN,
      viaje.Costo_estimado_MXN,
      viaje.Utilidad_estimada_MXN,
      viaje.Estado_pago,
      viaje.URL_evidencia_carga,
      viaje.URL_evidencia_descarga,
      viaje.Observaciones,
      viaje.Created_at,
      viaje.Updated_at,
      viaje.Estado_validacion || viaje["Estado_validaci\u00f3n"] || "pendiente_aprobacion",
      viaje.Aprobado_por || "",
      viaje.Fecha_aprobacion || viaje["Fecha_aprobaci\u00f3n"] || "",
      viaje.Hora_aprobacion || viaje["Hora_aprobaci\u00f3n"] || "",
      viaje.Notas_aprobacion || viaje["Notas_aprobaci\u00f3n"] || "",
    ];
    await appendSheetValues(token, "Viajes", [row]);
    await writeAuditoriaOnServer(
      token,
      viaje.Registrado_por,
      "CREAR_VIAJE",
      "viaje",
      viaje.ID_viaje,
      "",
      "",
      JSON.stringify({ Cliente: viaje.Cliente, Camion: viaje["Cami\u00f3n"] || viaje.Camion || "", Origen: viaje.Origen, Destino: viaje.Destino }),
      `Viaje para ${viaje.Cliente} (Camion: ${viaje["Cami\u00f3n"] || viaje.Camion || ""}) guardado.`
    );
    return res.json({ success: true });
  } catch (err: any) {
    console.error("Error saving viaje on server:", err);
    return res.status(500).json({ error: "Fallo al guardar viaje", details: err.message });
  }
});

// 6. Write Auditoria
app.post("/api/sheets/auditoria", async (req: express.Request, res: express.Response) => {
  const token = getGoogleToken(req);
  if (!token) return res.status(401).json({ error: "No autorizado" });
  const { userEmail, accion, detalles, entidad, entidad_id, campo_modificado, valor_anterior, valor_nuevo, notas } = req.body;
  try {
    await writeAuditoriaOnServer(
      token,
      userEmail || "anonimo",
      accion || "LOG",
      entidad || "",
      entidad_id || "",
      campo_modificado || "",
      valor_anterior || "",
      valor_nuevo || "",
      notas || detalles || ""
    );
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: "Error de auditoria", details: err.message });
  }
});

app.post("/api/sheets/approve", async (req: express.Request, res: express.Response) => {
  const token = getGoogleToken(req);
  const { records, approvedBy, status = "aprobado", notes = "" } = req.body || {};
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: "Faltan registros para aprobar." });
  }

  const now = new Date();
  const fecha = now.toISOString().split("T")[0];
  const hora = now.toTimeString().split(" ")[0];

  if (!token && hasBridgeConfig()) {
    try {
      await callKargoBridge("approveRecords", { records, approvedBy, status, notes, fecha, hora });
      return res.json({ success: true, bridge: true });
    } catch (err: any) {
      return res.status(500).json({ error: "Fallo al aprobar por Kargo Bridge", details: err.message });
    }
  }
  if (!token) return res.status(401).json({ error: "No autorizado" });

  const columnMap: Record<string, { sheet: string; range: (row: number) => string }> = {
    gasto: { sheet: "Gastos", range: (row) => `Gastos!O${row}:X${row}` },
    pago: { sheet: "Pagos", range: (row) => `Pagos!O${row}:S${row}` },
    viaje: { sheet: "Viajes", range: (row) => `Viajes!V${row}:Z${row}` },
  };

  try {
    for (const item of records) {
      const type = String(item.type || "");
      const id = String(item.id || "");
      const config = columnMap[type];
      if (!config || !id) continue;

      const row = await findRowById(token, config.sheet, id);
      if (row === -1) {
        throw new Error(`No se encontro ${id} en ${config.sheet}`);
      }

      const values =
        type === "gasto"
          ? [[status, "", "", "", "", "", approvedBy || "", fecha, hora, notes || ""]]
          : [[status, approvedBy || "", fecha, hora, notes || ""]];

      await updateSheetValues(token, config.range(row), values);
      await writeAuditoriaOnServer(
        token,
        approvedBy || "sistema",
        status === "aprobado" ? "APROBAR_REGISTRO" : "RECHAZAR_REGISTRO",
        type,
        id,
        "Estado_validacion",
        "pendiente_aprobacion",
        status,
        notes || ""
      );
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error("Error approving records:", err);
    return res.status(500).json({ error: "Fallo al aprobar registros", details: err.message });
  }
});

// 7. Upload to Google Drive Proxy
app.post("/api/drive/upload", async (req: express.Request, res: express.Response) => {
  const token = getGoogleToken(req);
  const { base64File, fileName, mimeType } = req.body;
  if (!base64File) return res.status(400).json({ error: "Archivo faltante" });
  if (!token && hasBridgeConfig()) {
    try {
      const data = await callKargoBridge("uploadFile", { base64File, fileName, mimeType });
      return res.json({ url: data.url || data.payload?.url || data.webViewLink || "" });
    } catch (err: any) {
      return res.status(500).json({ error: "Fallo al subir archivo por Kargo Bridge", details: err.message });
    }
  }
  if (!token) return res.status(401).json({ error: "No autorizado" });

  try {
    const base64Data = base64File.replace(/^data:.*;base64,/, "");
    const metadata = {
      name: fileName || "upload.jpg",
      mimeType: mimeType || "image/jpeg",
      parents: [DRIVE_FOLDER_ID],
    };

    const boundary = "-------314159265358979323846";
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartRequestBody = Buffer.concat([
      Buffer.from(
        delimiter +
          "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
          JSON.stringify(metadata) +
          delimiter
      ),
      Buffer.from(`Content-Type: ${mimeType || "image/jpeg"}\r\nContent-Transfer-Encoding: base64\r\n\r\n`),
      Buffer.from(base64Data),
      Buffer.from(closeDelimiter),
    ]);

    const url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Drive API error: ${response.statusText} (${errText})`);
    }

    const result: any = await response.json();
    const fileId = result.id;

    const webViewLink = result.webViewLink || `https://drive.google.com/open?id=${fileId}`;
    return res.json({ url: webViewLink });
  } catch (err: any) {
    console.error("Error uploading to Google Drive on server:", err);
    return res.status(500).json({ error: "Fallo al subir a Google Drive", details: err.message });
  }
});

// 8. Update evidence URL in existing Google Sheet row matching its ID
app.post("/api/sheets/update-evidence", async (req: express.Request, res: express.Response) => {
  const token = getGoogleToken(req);
  if (!token) return res.status(401).json({ error: "No autorizado" });
  
  const { id, type, evidenceUrl, evidenceType } = req.body;
  if (!id || !type || !evidenceUrl) {
    return res.status(400).json({ error: "Faltan parametros requeridos (id, type, evidenceUrl)" });
  }

  try {
    let sheetName = "";
    let colRange = "";
    let cellColLetter = "";

    if (type === "gasto") {
      sheetName = "Gastos";
      colRange = "Gastos!A1:A2000";
      cellColLetter = "Q"; // Column Q is URL_evidencia_Drive
    } else if (type === "pago") {
      sheetName = "Pagos";
      colRange = "Pagos!A1:A2000";
      cellColLetter = "K"; // Column K is URL_evidencia_Drive
    } else if (type === "viaje") {
      sheetName = "Viajes";
      colRange = "Viajes!A1:A2000";
      cellColLetter = evidenceType === "carga" ? "Q" : "R"; // Column Q is Carga, Column R is Descarga
    } else {
      return res.status(400).json({ error: "Tipo de registro no valido." });
    }

    // Find the row containing the unique ID in Column A
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(colRange)}`;
    const findResponse = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!findResponse.ok) {
      const errorText = await findResponse.text();
      throw new Error(`Sheets fetch failed: ${findResponse.statusText} (${errorText})`);
    }
    const data: any = await findResponse.json();
    const rows = data.values || [];

    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i][0] === id) {
        rowIndex = i + 1; // Convert 0-indexed to 1-based sheet row index
        break;
      }
    }

    if (rowIndex === -1) {
      return res.status(404).json({ error: `No se encontro el registro con ID ${id} en la hoja ${sheetName}.` });
    }

    // Update the cell value
    const updateRange = `${sheetName}!${cellColLetter}${rowIndex}`;
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(updateRange)}?valueInputOption=USER_ENTERED`;
    const updateResponse = await fetch(updateUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [[evidenceUrl]]
      }),
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Sheets cell update failed: ${updateResponse.statusText} (${errorText})`);
    }

    await writeAuditoriaOnServer(
      token,
      "sistema",
      "ACTUALIZAR_EVIDENCIA",
      type,
      id,
      evidenceType === "carga" ? "URL_evidencia_carga" : (evidenceType === "descarga" ? "URL_evidencia_descarga" : "URL_evidencia_Drive"),
      "",
      evidenceUrl,
      `Evidencia actualizada para ${type} ID ${id} en fila ${rowIndex}, columna ${cellColLetter}.`
    );

    return res.json({ success: true, rowIndex });
  } catch (err: any) {
    console.error("Error updating sheet evidence cell:", err);
    return res.status(500).json({ error: "Fallo al actualizar evidencia en Google Sheets", details: err.message });
  }
});


// Explicit routes for PWA assets to guarantee correct Content-Type headers in all environments
app.get("/sw.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.sendFile(path.join(process.cwd(), "public", "sw.js"));
});

app.get("/manifest.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.sendFile(path.join(process.cwd(), "public", "manifest.json"));
});

// Serve Vite or Static files depending on Environment
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
