import { Gasto, Pago, Viaje } from "../types";

// Fallbacks in case Google Sheet reading fails or lists are empty
const FALLBACK_CAMIONES: string[] = [];

const FALLBACK_CLIENTES: string[] = [];

function getHeaders(accessToken: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  if (accessToken === "family") {
    const familyCode = localStorage.getItem("bravo_family_code") || "";
    headers["X-Family-Access-Code"] = familyCode;
  } else {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  
  return headers;
}

/**
 * Loads Camiones dropdown list from server proxy
 */
export async function loadCamiones(accessToken: string): Promise<string[]> {
  try {
    const response = await fetch("/api/sheets/dropdowns", {
      headers: getHeaders(accessToken),
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
      headers: getHeaders(accessToken),
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
    headers: getHeaders(accessToken),
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
  entidad: string = "",
  entidad_id: string = "",
  campo_modificado: string = "",
  valor_anterior: string = "",
  valor_nuevo: string = "",
  notas: string = ""
): Promise<void> {
  try {
    const response = await fetch("/api/sheets/auditoria", {
      method: "POST",
      headers: getHeaders(accessToken),
      body: JSON.stringify({
        userEmail,
        accion,
        entidad,
        entidad_id,
        campo_modificado,
        valor_anterior,
        valor_nuevo,
        notas,
      }),
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
  const isFamily = accessToken === "family";
  const url = isFamily ? "/api/family/gasto" : "/api/sheets/gasto";
  
  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(accessToken),
    body: JSON.stringify({ gasto }),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Error guardando Gasto: ${response.statusText} (${txt})`);
  }
}

/**
 * Save Pago record to Google Sheets via server proxy
 */
export async function savePagoToSheet(accessToken: string, pago: Pago): Promise<void> {
  const isFamily = accessToken === "family";
  const url = isFamily ? "/api/family/pago" : "/api/sheets/pago";

  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(accessToken),
    body: JSON.stringify({ pago }),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Error guardando Pago: ${response.statusText} (${txt})`);
  }
}

/**
 * Save Viaje record to Google Sheets via server proxy
 */
export async function saveViajeToSheet(accessToken: string, viaje: Viaje): Promise<void> {
  const isFamily = accessToken === "family";
  const url = isFamily ? "/api/family/viaje" : "/api/sheets/viaje";

  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(accessToken),
    body: JSON.stringify({ viaje }),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Error guardando Viaje: ${response.statusText} (${txt})`);
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

  const isFamily = accessToken === "family";
  const url = isFamily ? "/api/family/upload" : "/api/drive/upload";

  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(accessToken),
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
    headers: getHeaders(accessToken),
    body: JSON.stringify({ id, type, evidenceUrl, evidenceType }),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Error actualizando evidencia en Sheets: ${response.statusText} (${txt})`);
  }
}

