import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Increase payload limits for base64 images and audio
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Lazy init Gemini SDK
let aiClient: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("⚠️ Warning: GEMINI_API_KEY is not defined in the environment variables!");
    }
    aiClient = new GoogleGenAI({ apiKey: key || "" });
  }
  return aiClient;
}

// AI Endpoint to parse text, image, or audio input
app.post("/api/process-input", async (req: express.Request, res: express.Response) => {
  try {
    const { text, type, image, audio, mimeType, camiones, clientes } = req.body;

    const ai = getGeminiClient();
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Falta la API Key de Gemini en el servidor. Configúrala en el panel de secretos.",
      });
    }

    // Prepare content parts for Gemini
    const contents: any[] = [];

    // System prompt instructing Gemini
    const systemPrompt = `
Eres la Inteligencia Artificial de "Transporte Bravo", un negocio familiar de camiones de carga de materiales en México.
Tu tarea es analizar la entrada provista (que puede ser texto escrito por el usuario, una imagen/foto de un recibo o evidencia, o un archivo de audio grabado por voz) y estructurar los datos en un formato JSON limpio y preciso de acuerdo con la clasificación solicitada.

Categorías y sus respectivos esquemas de salida:

1. Gasto (gasto): Registrar compras de combustible, refacciones, alimentos, casetas, sueldos de choferes, etc.
   Campos JSON esperados:
   - categoria: Tipo de gasto (ej. "Diésel", "Refacciones", "Casetas", "Sueldo Chofer", "Comida", "Otro"). Debe coincidir razonablemente con estos valores.
   - subcategoria: Detalle del gasto (ej. "Llantas", "Filtro", "Peaje", "Almuerzo", etc.).
   - monto_mxn: Monto total en pesos mexicanos (número).
   - metodo_pago: Método utilizado (ej. "Efectivo", "Transferencia", "Tarjeta").
   - camion: El camión asociado. Revisa la lista de camiones válidos provista abajo para ver si coincide alguno.
   - chofer: Nombre del chofer asociado (si se menciona).
   - cliente: Cliente asociado (si se menciona).
   - proveedor: Negocio donde se hizo el gasto (ej. "Gasolinera Pemex", "Refaccionaria El Rojo").
   - notas: Detalles adicionales o aclaraciones extraídas de la entrada.

2. Pago (pago): Abono o liquidación que hace un cliente por un viaje.
   Campos JSON esperados:
   - cliente: Nombre del cliente. Intenta que coincida con la lista de clientes válidos.
   - monto_mxn: Monto recibido en pesos mexicanos (número).
   - metodo_pago: Método utilizado (ej. "Efectivo", "Transferencia", "Tarjeta").
   - viaje_id: ID del viaje si se menciona (ej. V-1002).
   - saldo_restante_mxn: Saldo que resta por pagar (si se menciona, número, o nulo si no se menciona).
   - estado_pago: "pendiente", "parcial" o "liquidado" (basado en el contexto).
   - notas: Notas adicionales.

3. Viaje (viaje): Registro de un flete o viaje realizado por un camión.
   Campos JSON esperados:
   - cliente: Nombre del cliente. Intenta que coincida con la lista de clientes válidos.
   - origen: Lugar donde carga el material.
   - destino: Lugar de entrega.
   - material: Tipo de material (ej. "Arena", "Grava", "Asfalto", "Piedra", "Tierra").
   - metros_cubicos: Volumen en metros cúbicos (número, si se menciona).
   - kilometros: Distancia recorrida (número, si se menciona).
   - camion: Camión que hizo el viaje. Revisa la lista de camiones válidos abajo.
   - chofer: Chofer que manejó.
   - precio_cobrado_mxn: Cuánto se le cobra al cliente por el flete (número).
   - costo_estimado_mxn: Costo del diésel y casetas estimado para este viaje (si se menciona, número).
   - observaciones: Notas u observaciones adicionales.

LISTA DE CAMIONES REGISTRADOS EN EL SISTEMA:
${camiones && camiones.length > 0 ? camiones.join(", ") : "Ninguno registrado aún (asigna el que mencione el usuario)"}

LISTA DE CLIENTES REGISTRADOS EN EL SISTEMA:
${clientes && clientes.length > 0 ? clientes.join(", ") : "Ninguno registrado aún (asigna el que mencione el usuario)"}

REGLAS DE INTERPRETACIÓN:
- Sé inteligente extrayendo montos numéricos. "ochocientos cincuenta" es 850. "tres mil quinientos" es 3500.
- Si el usuario NO especificó explícitamente el tipo de registro (gasto, pago, viaje), detéctalo automáticamente analizando el texto, la imagen o el audio.
- Calcula un nivel de confianza_ia: "alta" (si la información es clara y completa), "media" (si faltan varios datos y se requiere revisar), o "baja" (si la entrada es confusa, ruidosa o incomprensible).
- Responde ÚNICAMENTE con un objeto JSON válido con la siguiente estructura exacta:
{
  "tipo_registro": "gasto" | "pago" | "viaje",
  "confianza_ia": "alta" | "media" | "baja",
  "datos": { ...campos específicos de la categoría seleccionada... }
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
        text: "Analiza también esta imagen adjunta (recibo, factura o evidencia) para extraer los datos."
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
        text: "Escucha este archivo de audio grabado por el usuario que contiene el registro de voz y extrae la información dictada."
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
      error: "Ocurrió un error al procesar la información con Inteligencia Artificial.",
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

// Helper to communicate with Google Apps Script bridge in family mode
async function callKargoBridge(action: string, data: any): Promise<any> {
  const bridgeUrl = process.env.KARGO_APPS_SCRIPT_URL;
  const bridgeSecret = process.env.KARGO_BRIDGE_SECRET;

  if (!bridgeUrl) {
    throw new Error("La variable de entorno KARGO_APPS_SCRIPT_URL no está configurada.");
  }
  if (!bridgeSecret) {
    throw new Error("La variable de entorno KARGO_BRIDGE_SECRET no está configurada.");
  }

  const response = await fetch(bridgeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      secret: bridgeSecret,
      action: action,
      data: data,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kargo Bridge HTTP Error: ${response.statusText} (${errorText})`);
  }

  const json: any = await response.json();
  if (!json.success) {
    throw new Error(`Kargo Bridge Error: ${json.error || "Error desconocido"}`);
  }

  return json.data;
}

// Middleware to check family access code if configured
function validateFamilyAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (process.env.AUTH_MODE === "family" && process.env.KARGO_FAMILY_ACCESS_CODE) {
    const clientCode = req.headers["x-family-access-code"] || req.query.family_access_code;
    if (clientCode !== process.env.KARGO_FAMILY_ACCESS_CODE) {
      return res.status(403).json({ error: "Código de acceso familiar incorrecto o ausente." });
    }
  }
  next();
}

// Family configuration and verification endpoints
app.get("/api/family/config", (req: express.Request, res: express.Response) => {
  return res.json({
    authMode: process.env.AUTH_MODE || "google",
    requireAccessCode: !!process.env.KARGO_FAMILY_ACCESS_CODE
  });
});

app.post("/api/family/verify-code", (req: express.Request, res: express.Response) => {
  const { code } = req.body;
  const correctCode = process.env.KARGO_FAMILY_ACCESS_CODE;
  if (!correctCode) {
    return res.json({ success: true });
  }
  if (code === correctCode) {
    return res.json({ success: true });
  }
  return res.json({ success: false, error: "Código de acceso familiar incorrecto." });
});

// Family-specific API endpoints to process Gastos, Pagos, Viajes, Upload and Sync
app.post("/api/family/gasto", validateFamilyAccess, async (req: express.Request, res: express.Response) => {
  try {
    const { gasto } = req.body;
    if (!gasto) return res.status(400).json({ error: "Falta el registro del gasto" });
    const row = [
      gasto.ID_gasto,
      gasto.Fecha,
      gasto.Hora,
      gasto.Registrado_por,
      gasto.Tipo_entrada,
      gasto.Categoría,
      gasto.Subcategoría,
      gasto.Monto_MXN,
      gasto.Método_pago,
      gasto.Camión,
      gasto.Chofer,
      gasto.Cliente,
      gasto.Viaje_ID,
      gasto.Proveedor,
      gasto.Estado_validación,
      gasto.Confianza_IA,
      gasto.URL_evidencia_Drive,
      gasto.Notas,
      gasto.Created_at,
      gasto.Updated_at,
    ];
    await callKargoBridge("saveGasto", {
      row,
      gastoId: gasto.ID_gasto,
      registradoPor: gasto.Registrado_por,
      monto: gasto.Monto_MXN,
      categoria: gasto.Categoría
    });
    return res.json({ success: true });
  } catch (err: any) {
    console.error("Error in /api/family/gasto:", err);
    return res.status(500).json({ error: "Fallo al guardar gasto familiar", details: err.message });
  }
});

app.post("/api/family/pago", validateFamilyAccess, async (req: express.Request, res: express.Response) => {
  try {
    const { pago } = req.body;
    if (!pago) return res.status(400).json({ error: "Falta el registro del pago" });
    const row = [
      pago.ID_pago,
      pago.Fecha,
      pago.Hora,
      pago.Registrado_por,
      pago.Cliente,
      pago.Monto_MXN,
      pago.Método_pago,
      pago.Viaje_ID,
      pago.Saldo_restante_MXN,
      pago.Estado_pago,
      pago.URL_evidencia_Drive,
      pago.Notas,
      pago.Created_at,
      pago.Updated_at,
    ];
    await callKargoBridge("savePago", {
      row,
      pagoId: pago.ID_pago,
      registradoPor: pago.Registrado_por,
      monto: pago.Monto_MXN,
      cliente: pago.Cliente
    });
    return res.json({ success: true });
  } catch (err: any) {
    console.error("Error in /api/family/pago:", err);
    return res.status(500).json({ error: "Fallo al guardar pago familiar", details: err.message });
  }
});

app.post("/api/family/viaje", validateFamilyAccess, async (req: express.Request, res: express.Response) => {
  try {
    const { viaje } = req.body;
    if (!viaje) return res.status(400).json({ error: "Falta el flete o viaje" });
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
      viaje.Kilómetros,
      viaje.Camión,
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
    ];
    await callKargoBridge("saveViaje", {
      row,
      viajeId: viaje.ID_viaje,
      registradoPor: viaje.Registrado_por,
      monto: viaje.Precio_cobrado_MXN,
      cliente: viaje.Cliente
    });
    return res.json({ success: true });
  } catch (err: any) {
    console.error("Error in /api/family/viaje:", err);
    return res.status(500).json({ error: "Fallo al guardar viaje familiar", details: err.message });
  }
});

app.post("/api/family/upload", validateFamilyAccess, async (req: express.Request, res: express.Response) => {
  try {
    const { base64File, fileName, mimeType } = req.body;
    if (!base64File) return res.status(400).json({ error: "Archivo faltante" });
    const result = await callKargoBridge("uploadDrive", {
      base64File,
      fileName,
      mimeType
    });
    return res.json({ url: result.url });
  } catch (err: any) {
    console.error("Error in /api/family/upload:", err);
    return res.status(500).json({ error: "Fallo al subir evidencia familiar", details: err.message });
  }
});

app.post("/api/family/sync", validateFamilyAccess, async (req: express.Request, res: express.Response) => {
  try {
    const { queue } = req.body;
    if (!queue || !Array.isArray(queue)) {
      return res.status(400).json({ error: "Falta la cola de sincronización" });
    }

    const results = [];
    for (const item of queue) {
      try {
        if (item._type === "gasto") {
          const row = [
            item.ID_gasto, item.Fecha, item.Hora, item.Registrado_por, item.Tipo_entrada,
            item.Categoría, item.Subcategoría, item.Monto_MXN, item.Método_pago, item.Camión,
            item.Chofer, item.Cliente, item.Viaje_ID, item.Proveedor, item.Estado_validación,
            item.Confianza_IA, item.URL_evidencia_Drive, item.Notas, item.Created_at, item.Updated_at
          ];
          await callKargoBridge("saveGasto", {
            row, gastoId: item.ID_gasto, registradoPor: item.Registrado_por,
            monto: item.Monto_MXN, categoria: item.Categoría
          });
        } else if (item._type === "pago") {
          const row = [
            item.ID_pago, item.Fecha, item.Hora, item.Registrado_por, item.Cliente,
            item.Monto_MXN, item.Método_pago, item.Viaje_ID, item.Saldo_restante_MXN,
            item.Estado_pago, item.URL_evidencia_Drive, item.Notas, item.Created_at, item.Updated_at
          ];
          await callKargoBridge("savePago", {
            row, pagoId: item.ID_pago, registradoPor: item.Registrado_por,
            monto: item.Monto_MXN, cliente: item.Cliente
          });
        } else if (item._type === "viaje") {
          const row = [
            item.ID_viaje, item.Fecha, item.Hora, item.Registrado_por, item.Cliente,
            item.Origen, item.Destino, item.Material, item.Metros_cubicos, item.Kilómetros,
            item.Camión, item.Chofer, item.Precio_cobrado_MXN, item.Costo_estimado_MXN,
            item.Utilidad_estimada_MXN, item.Estado_pago, item.URL_evidencia_carga,
            item.URL_evidencia_descarga, item.Observaciones, item.Created_at, item.Updated_at
          ];
          await callKargoBridge("saveViaje", {
            row, viajeId: item.ID_viaje, registradoPor: item.Registrado_por,
            monto: item.Precio_cobrado_MXN, cliente: item.Cliente
          });
        }
        results.push({ id: item.ID_gasto || item.ID_pago || item.ID_viaje, success: true });
      } catch (err: any) {
        results.push({ id: item.ID_gasto || item.ID_pago || item.ID_viaje, success: false, error: err.message });
      }
    }

    return res.json({ success: true, results });
  } catch (err: any) {
    console.error("Error in /api/family/sync:", err);
    return res.status(500).json({ error: "Fallo general al sincronizar cola", details: err.message });
  }
});

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
    await appendSheetValues(accessToken, "Auditoría", [row]);
  } catch (err) {
    console.error("Auditoria write failed on server:", err);
  }
}

// 1. Dropdowns Endpoint (Camiones and Clientes)
app.get("/api/sheets/dropdowns", validateFamilyAccess, async (req: express.Request, res: express.Response) => {
  if (process.env.AUTH_MODE === "family") {
    try {
      const result = await callKargoBridge("getDropdowns", {});
      return res.json(result);
    } catch (err: any) {
      console.error("Error loading dropdowns via bridge:", err);
      return res.status(500).json({ error: "Fallo al cargar camiones/clientes del puente de Apps Script", details: err.message });
    }
  }

  const token = getGoogleToken(req);
  if (!token) {
    return res.status(401).json({ error: "No se proporcionó token de autorización." });
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
          return `${id} — ${nombre}`;
        }
        return id;
      })
      .filter(Boolean);

    const clientes = clientesRows
      .map((row) => {
        const id = row[0] ? String(row[0]).trim() : "";
        const nombre = row[1] ? String(row[1]).trim() : "";
        if (id && nombre) {
          return `${id} — ${nombre}`;
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
app.get("/api/sheets/activities", validateFamilyAccess, async (req: express.Request, res: express.Response) => {
  if (process.env.AUTH_MODE === "family") {
    try {
      const result = await callKargoBridge("getActivities", {});
      return res.json(result);
    } catch (err: any) {
      console.error("Error loading activities via bridge:", err);
      return res.status(500).json({ error: "Fallo al obtener registros vía Apps Script Puente.", details: err.message });
    }
  }

  const token = getGoogleToken(req);
  if (!token) {
    return res.status(401).json({ error: "No se proporcionó token de autorización." });
  }

  try {
    const [gastosRows, pagosRows, viajesRows] = await Promise.all([
      getSheetValues(token, "Gastos!A2:T2000").catch(() => []),
      getSheetValues(token, "Pagos!A2:N2000").catch(() => []),
      getSheetValues(token, "Viajes!A2:U2000").catch(() => [])
    ]);

    const gastos = gastosRows.map((row) => ({
      ID_gasto: row[0] || "",
      Fecha: row[1] || "",
      Hora: row[2] || "",
      Registrado_por: row[3] || "",
      Tipo_entrada: row[4] || "texto",
      Categoría: row[5] || "",
      Subcategoría: row[6] || "",
      Monto_MXN: Number(row[7]) || 0,
      Método_pago: row[8] || "",
      Camión: row[9] || "",
      Chofer: row[10] || "",
      Cliente: row[11] || "",
      Viaje_ID: row[12] || "",
      Proveedor: row[13] || "",
      Estado_validación: row[14] || "validado",
      Confianza_IA: row[15] || "alta",
      URL_evidencia_Drive: row[16] || "",
      Notas: row[17] || "",
      Created_at: row[18] || "",
      Updated_at: row[19] || "",
      _type: "gasto"
    })).filter((g) => g.ID_gasto);

    const pagos = pagosRows.map((row) => ({
      ID_pago: row[0] || "",
      Fecha: row[1] || "",
      Hora: row[2] || "",
      Registrado_por: row[3] || "",
      Cliente: row[4] || "",
      Monto_MXN: Number(row[5]) || 0,
      Método_pago: row[6] || "",
      Viaje_ID: row[7] || "",
      Saldo_restante_MXN: Number(row[8]) || 0,
      Estado_pago: row[9] || "",
      URL_evidencia_Drive: row[10] || "",
      Notas: row[11] || "",
      Created_at: row[12] || "",
      Updated_at: row[13] || "",
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
      Kilómetros: Number(row[9]) || 0,
      Camión: row[10] || "",
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
app.post("/api/sheets/gasto", validateFamilyAccess, async (req: express.Request, res: express.Response) => {
  const { gasto } = req.body;
  if (!gasto) return res.status(400).json({ error: "Falta el registro del gasto" });

  if (process.env.AUTH_MODE === "family") {
    try {
      const row = [
        gasto.ID_gasto,
        gasto.Fecha,
        gasto.Hora,
        gasto.Registrado_por,
        gasto.Tipo_entrada,
        gasto.Categoría,
        gasto.Subcategoría,
        gasto.Monto_MXN,
        gasto.Método_pago,
        gasto.Camión,
        gasto.Chofer,
        gasto.Cliente,
        gasto.Viaje_ID,
        gasto.Proveedor,
        gasto.Estado_validación,
        gasto.Confianza_IA,
        gasto.URL_evidencia_Drive,
        gasto.Notas,
        gasto.Created_at,
        gasto.Updated_at,
      ];
      await callKargoBridge("saveGasto", {
        row,
        gastoId: gasto.ID_gasto,
        registradoPor: gasto.Registrado_por,
        monto: gasto.Monto_MXN,
        categoria: gasto.Categoría
      });
      return res.json({ success: true });
    } catch (err: any) {
      console.error("Error saving gasto via bridge:", err);
      return res.status(500).json({ error: "Fallo al guardar gasto vía Apps Script Puente.", details: err.message });
    }
  }

  const token = getGoogleToken(req);
  if (!token) return res.status(401).json({ error: "No autorizado" });

  try {
    const row = [
      gasto.ID_gasto,
      gasto.Fecha,
      gasto.Hora,
      gasto.Registrado_por,
      gasto.Tipo_entrada,
      gasto.Categoría,
      gasto.Subcategoría,
      gasto.Monto_MXN,
      gasto.Método_pago,
      gasto.Camión,
      gasto.Chofer,
      gasto.Cliente,
      gasto.Viaje_ID,
      gasto.Proveedor,
      gasto.Estado_validación,
      gasto.Confianza_IA,
      gasto.URL_evidencia_Drive,
      gasto.Notas,
      gasto.Created_at,
      gasto.Updated_at,
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
      JSON.stringify({ Monto_MXN: gasto.Monto_MXN, Categoría: gasto.Categoría }),
      `Gasto de $${gasto.Monto_MXN} guardado en Sheets.`
    );
    return res.json({ success: true });
  } catch (err: any) {
    console.error("Error saving gasto on server:", err);
    return res.status(500).json({ error: "Fallo al guardar gasto", details: err.message });
  }
});

// 4. Save Pago
app.post("/api/sheets/pago", validateFamilyAccess, async (req: express.Request, res: express.Response) => {
  const { pago } = req.body;
  if (!pago) return res.status(400).json({ error: "Falta el registro del pago" });

  if (process.env.AUTH_MODE === "family") {
    try {
      const row = [
        pago.ID_pago,
        pago.Fecha,
        pago.Hora,
        pago.Registrado_por,
        pago.Cliente,
        pago.Monto_MXN,
        pago.Método_pago,
        pago.Viaje_ID,
        pago.Saldo_restante_MXN,
        pago.Estado_pago,
        pago.URL_evidencia_Drive,
        pago.Notas,
        pago.Created_at,
        pago.Updated_at,
      ];
      await callKargoBridge("savePago", {
        row,
        pagoId: pago.ID_pago,
        registradoPor: pago.Registrado_por,
        monto: pago.Monto_MXN,
        cliente: pago.Cliente
      });
      return res.json({ success: true });
    } catch (err: any) {
      console.error("Error saving pago via bridge:", err);
      return res.status(500).json({ error: "Fallo al guardar pago vía Apps Script Puente.", details: err.message });
    }
  }

  const token = getGoogleToken(req);
  if (!token) return res.status(401).json({ error: "No autorizado" });

  try {
    const row = [
      pago.ID_pago,
      pago.Fecha,
      pago.Hora,
      pago.Registrado_por,
      pago.Cliente,
      pago.Monto_MXN,
      pago.Método_pago,
      pago.Viaje_ID,
      pago.Saldo_restante_MXN,
      pago.Estado_pago,
      pago.URL_evidencia_Drive,
      pago.Notas,
      pago.Created_at,
      pago.Updated_at,
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
app.post("/api/sheets/viaje", validateFamilyAccess, async (req: express.Request, res: express.Response) => {
  const { viaje } = req.body;
  if (!viaje) return res.status(400).json({ error: "Falta el flete o viaje" });

  if (process.env.AUTH_MODE === "family") {
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
        viaje.Kilómetros,
        viaje.Camión,
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
      ];
      await callKargoBridge("saveViaje", {
        row,
        viajeId: viaje.ID_viaje,
        registradoPor: viaje.Registrado_por,
        monto: viaje.Precio_cobrado_MXN,
        cliente: viaje.Cliente
      });
      return res.json({ success: true });
    } catch (err: any) {
      console.error("Error saving viaje via bridge:", err);
      return res.status(500).json({ error: "Fallo al guardar flete vía Apps Script Puente.", details: err.message });
    }
  }

  const token = getGoogleToken(req);
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
      viaje.Kilómetros,
      viaje.Camión,
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
      JSON.stringify({ Cliente: viaje.Cliente, Camión: viaje.Camión, Origen: viaje.Origen, Destino: viaje.Destino }),
      `Viaje para ${viaje.Cliente} (Camión: ${viaje.Camión}) guardado.`
    );
    return res.json({ success: true });
  } catch (err: any) {
    console.error("Error saving viaje on server:", err);
    return res.status(500).json({ error: "Fallo al guardar viaje", details: err.message });
  }
});

// 6. Write Auditoria
app.post("/api/sheets/auditoria", validateFamilyAccess, async (req: express.Request, res: express.Response) => {
  const { userEmail, accion, detalles, entidad, entidad_id, campo_modificado, valor_anterior, valor_nuevo, notas } = req.body;

  if (process.env.AUTH_MODE === "family") {
    try {
      const now = new Date();
      const fechaHora = now.toISOString().replace("T", " ").substring(0, 19);
      const id_evento = "AUD-" + Math.floor(100000 + Math.random() * 900000);
      const fuente = "Captura Bravo PWA (Familiar)";
      const row = [
        id_evento,
        fechaHora,
        userEmail || "familia",
        accion || "LOG",
        entidad || "",
        entidad_id || "",
        campo_modificado || "",
        valor_anterior || "",
        valor_nuevo || "",
        fuente,
        notas || detalles || ""
      ];
      await callKargoBridge("saveAuditoria", { row });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: "Error de auditoría vía puente", details: err.message });
    }
  }

  const token = getGoogleToken(req);
  if (!token) return res.status(401).json({ error: "No autorizado" });

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
    return res.status(500).json({ error: "Error de auditoría", details: err.message });
  }
});

// 7. Upload to Google Drive Proxy
app.post("/api/drive/upload", validateFamilyAccess, async (req: express.Request, res: express.Response) => {
  const { base64File, fileName, mimeType } = req.body;
  if (!base64File) return res.status(400).json({ error: "Archivo faltante" });

  if (process.env.AUTH_MODE === "family") {
    try {
      const result = await callKargoBridge("uploadDrive", {
        base64File,
        fileName,
        mimeType
      });
      return res.json({ url: result.url });
    } catch (err: any) {
      console.error("Error uploading via bridge:", err);
      return res.status(500).json({ error: "Fallo al subir a Google Drive vía Apps Script Puente.", details: err.message });
    }
  }

  const token = getGoogleToken(req);
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
app.post("/api/sheets/update-evidence", validateFamilyAccess, async (req: express.Request, res: express.Response) => {
  const { id, type, evidenceUrl, evidenceType } = req.body;
  if (!id || !type || !evidenceUrl) {
    return res.status(400).json({ error: "Faltan parámetros requeridos (id, type, evidenceUrl)" });
  }

  if (process.env.AUTH_MODE === "family") {
    try {
      const result = await callKargoBridge("updateEvidence", {
        id,
        type,
        evidenceUrl,
        evidenceType
      });
      return res.json({ success: true, rowIndex: result.rowIndex });
    } catch (err: any) {
      console.error("Error updating evidence via bridge:", err);
      return res.status(500).json({ error: "Fallo al actualizar evidencia vía Apps Script Puente.", details: err.message });
    }
  }

  const token = getGoogleToken(req);
  if (!token) return res.status(401).json({ error: "No autorizado" });

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
      return res.status(400).json({ error: "Tipo de registro no válido." });
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
      return res.status(404).json({ error: `No se encontró el registro con ID ${id} en la hoja ${sheetName}.` });
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
