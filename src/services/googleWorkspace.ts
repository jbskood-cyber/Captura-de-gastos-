import { Gasto, Pago, Viaje } from "../types";

// Fallbacks in case Google Sheet reading fails or lists are empty
const FALLBACK_CAMIONES = [
  "Rojo Freightliner (Camion 01)",
  "Azul Kenworth (Camion 02)",
  "Blanco Volvo (Camion 03)",
  "Gris Peterbilt (Camion 04)",
  "Verde Mack (Camion 05)"
];

const FALLBACK_CLIENTES = [
  "Cemex S.A.",
  "Constructora Pérez",
  "Materiales Tolteca",
  "Urbanizadora Pozos",
  "Gobierno Municipal"
];

/**
 * Loads Camiones dropdown list from server proxy
 */
export async function loadCamiones(accessToken: string): Promise<string[]> {
  try {
    const response = await fetch("/api/sheets/dropdowns", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error("Server dropdowns fetch failed");
    const data = await response.json();
    return data.camiones && data.camiones.length > 0 ? data.camiones : FALLBACK_CAMIONES;
  } catch (err) {
    console.error("Error loading camiones, using fallback:", err);
    return FALLBACK_CAMIONES;
  }
}

/**
 * Loads Clientes dropdown list from server proxy
 */
export async function loadClientes(accessToken: string): Promise<string[]> {
  try {
    const response = await fetch("/api/sheets/dropdowns", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error("Server dropdowns fetch failed");
    const data = await response.json();
    return data.clientes && data.clientes.length > 0 ? data.clientes : FALLBACK_CLIENTES;
  } catch (err) {
    console.error("Error loading clientes, using fallback:", err);
    return FALLBACK_CLIENTES;
  }
}

/**
 * Loads all activities (Gastos, Pagos, Viajes) from Google Sheets via server proxy
 */
export async function loadSheetsActivities(accessToken: string): Promise<any[]> {
  const response = await fetch("/api/sheets/activities", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Server activities fetch failed: ${response.statusText}`);
  }
  const data = await response.json();
  return data.activities || [];
}

/**
 * Logs an action to the Auditoría sheet via server proxy
 */
export async function writeAuditoria(
  accessToken: string,
  userEmail: string,
  accion: string,
  detalles: string
): Promise<void> {
  try {
    const response = await fetch("/api/sheets/auditoria", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userEmail, accion, detalles }),
    });
    if (!response.ok) {
      console.warn("Audit log server endpoint returned error");
    }
  } catch (err) {
    console.error("Auditoria write failed via server proxy:", err);
  }
}

/**
 * Save Gasto record to Google Sheets via server proxy
 */
export async function saveGastoToSheet(accessToken: string, gasto: Gasto): Promise<void> {
  const response = await fetch("/api/sheets/gasto", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ gasto }),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Error guardando Gasto via proxy: ${response.statusText} (${txt})`);
  }
}

/**
 * Save Pago record to Google Sheets via server proxy
 */
export async function savePagoToSheet(accessToken: string, pago: Pago): Promise<void> {
  const response = await fetch("/api/sheets/pago", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pago }),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Error guardando Pago via proxy: ${response.statusText} (${txt})`);
  }
}

/**
 * Save Viaje record to Google Sheets via server proxy
 */
export async function saveViajeToSheet(accessToken: string, viaje: Viaje): Promise<void> {
  const response = await fetch("/api/sheets/viaje", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ viaje }),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Error guardando Viaje via proxy: ${response.statusText} (${txt})`);
  }
}

/**
 * Upload receipt photo to Google Drive via server proxy
 */
export async function uploadFileToDrive(
  accessToken: string,
  fileBlob: Blob,
  fileName: string,
  mimeType: string
): Promise<string> {
  // Convert Blob to base64
  const base64File = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(fileBlob);
  });

  const response = await fetch("/api/drive/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ base64File, fileName, mimeType }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Drive proxy upload failed: ${response.statusText} (${errText})`);
  }

  const result = await response.json();
  return result.url;
}

/**
 * Update evidence URL of an existing Google Sheet row matching its ID
 */
export async function updateEvidenceInSheet(
  accessToken: string,
  id: string,
  type: string,
  evidenceUrl: string,
  evidenceType?: "carga" | "descarga"
): Promise<void> {
  const response = await fetch("/api/sheets/update-evidence", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id, type, evidenceUrl, evidenceType }),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Error actualizando evidencia en Sheets: ${response.statusText} (${txt})`);
  }
}

