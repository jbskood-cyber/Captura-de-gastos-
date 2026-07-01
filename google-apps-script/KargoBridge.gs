/**
 * KargoBridge.gs
 * Google Apps Script Web App que actúa como puente para Kargo en Modo Familiar.
 * 
 * Configuración:
 * 1. Abre tu hoja de cálculo de Google Sheets.
 * 2. Ve a Extensiones -> Apps Script.
 * 3. Copia y pega este código en el editor (reemplaza cualquier contenido existente).
 * 4. Configura las variables SPREADSHEET_ID, DRIVE_FOLDER_ID y KARGO_BRIDGE_SECRET abajo.
 * 5. Haz clic en "Desplegar" -> "Nuevo despliegue".
 * 6. Tipo: "Aplicación web".
 * 7. Ejecutar como: "Yo" (tu cuenta de Google).
 * 8. Quién tiene acceso: "Cualquiera".
 * 9. Haz clic en "Desplegar" y autoriza los permisos necesarios.
 * 10. Copia la URL de la aplicación web obtenida y configúrala como KARGO_APPS_SCRIPT_URL en los secretos de IA Studio.
 */

const SPREADSHEET_ID = "1sR2fTa2TQiIliqqdzwTNKZRnYUdIhYg4Jlyo8TiCkhc";
const DRIVE_FOLDER_ID = "1Y2c0D1hvQ6t4pgbsVg88A6nNcBgP6NmA";
const KARGO_BRIDGE_SECRET = "TU_SECRETO_COMPARTIDO_AQUI"; // Cámbialo por un secreto seguro en tus Secrets

function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    
    // Validar secreto
    if (!postData.secret || postData.secret !== KARGO_BRIDGE_SECRET) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "No autorizado. Secreto incorrecto en KargoBridge."
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const action = postData.action;
    const data = postData.data;
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    let responseData = {};
    
    if (action === "getDropdowns") {
      responseData = getDropdowns(spreadsheet);
    } else if (action === "getActivities") {
      responseData = getActivities(spreadsheet);
    } else if (action === "saveGasto") {
      responseData = saveRow(spreadsheet, "Gastos", data.row, data.gastoId, data.registradoPor, data.monto, data.categoria);
    } else if (action === "savePago") {
      responseData = saveRow(spreadsheet, "Pagos", data.row, data.pagoId, data.registradoPor, data.monto, data.cliente);
    } else if (action === "saveViaje") {
      responseData = saveRow(spreadsheet, "Viajes", data.row, data.viajeId, data.registradoPor, data.monto, data.cliente);
    } else if (action === "saveAuditoria") {
      responseData = saveAuditoria(spreadsheet, data.row);
    } else if (action === "uploadDrive") {
      responseData = uploadDrive(data.base64File, data.fileName, data.mimeType);
    } else if (action === "updateEvidence") {
      responseData = updateEvidence(spreadsheet, data.id, data.type, data.evidenceUrl, data.evidenceType);
    } else {
      throw new Error("Acción desconocida: " + action);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      data: responseData
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput("Kargo Bridge está activo. Usa POST para interactuar.");
}

function getDropdowns(spreadsheet) {
  const camionesSheet = spreadsheet.getSheetByName("Camiones");
  const clientesSheet = spreadsheet.getSheetByName("Clientes");
  
  const camiones = [];
  if (camionesSheet) {
    const values = camionesSheet.getRange("A2:B100").getValues();
    for (let i = 0; i < values.length; i++) {
      const id = String(values[i][0]).trim();
      const nombre = String(values[i][1]).trim();
      if (id && nombre) {
        camiones.push(id + " — " + nombre);
      } else if (id) {
        camiones.push(id);
      }
    }
  }
  
  const clientes = [];
  if (clientesSheet) {
    const values = clientesSheet.getRange("A2:B100").getValues();
    for (let i = 0; i < values.length; i++) {
      const id = String(values[i][0]).trim();
      const nombre = String(values[i][1]).trim();
      if (id && nombre) {
        clientes.push(id + " — " + nombre);
      } else if (id) {
        clientes.push(id);
      }
    }
  }
  
  return { camiones, clientes };
}

function getActivities(spreadsheet) {
  const gastosSheet = spreadsheet.getSheetByName("Gastos");
  const pagosSheet = spreadsheet.getSheetByName("Pagos");
  const viajesSheet = spreadsheet.getSheetByName("Viajes");
  
  const gastos = [];
  if (gastosSheet) {
    const values = gastosSheet.getRange("A2:T2000").getValues();
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (row[0]) {
        gastos.push({
          ID_gasto: row[0],
          Fecha: row[1],
          Hora: row[2],
          Registrado_por: row[3],
          Tipo_entrada: row[4] || "texto",
          Categoría: row[5],
          Subcategoría: row[6],
          Monto_MXN: Number(row[7]) || 0,
          Método_pago: row[8],
          Camión: row[9],
          Chofer: row[10],
          Cliente: row[11],
          Viaje_ID: row[12],
          Proveedor: row[13],
          Estado_validación: row[14] || "validado",
          Confianza_IA: row[15] || "alta",
          URL_evidencia_Drive: row[16],
          Notas: row[17],
          Created_at: row[18],
          Updated_at: row[19],
          _type: "gasto"
        });
      }
    }
  }
  
  const pagos = [];
  if (pagosSheet) {
    const values = pagosSheet.getRange("A2:N2000").getValues();
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (row[0]) {
        pagos.push({
          ID_pago: row[0],
          Fecha: row[1],
          Hora: row[2],
          Registrado_por: row[3],
          Cliente: row[4],
          Monto_MXN: Number(row[5]) || 0,
          Método_pago: row[6],
          Viaje_ID: row[7],
          Saldo_restante_MXN: Number(row[8]) || 0,
          Estado_pago: row[9],
          URL_evidencia_Drive: row[10],
          Notas: row[11],
          Created_at: row[12],
          Updated_at: row[13],
          _type: "pago"
        });
      }
    }
  }
  
  const viajes = [];
  if (viajesSheet) {
    const values = viajesSheet.getRange("A2:U2000").getValues();
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (row[0]) {
        viajes.push({
          ID_viaje: row[0],
          Fecha: row[1],
          Hora: row[2],
          Registrado_por: row[3],
          Cliente: row[4],
          Origen: row[5],
          Destino: row[6],
          Material: row[7],
          Metros_cubicos: Number(row[8]) || 0,
          Kilómetros: Number(row[9]) || 0,
          Camión: row[10],
          Chofer: row[11],
          Precio_cobrado_MXN: Number(row[12]) || 0,
          Costo_estimado_MXN: Number(row[13]) || 0,
          Utilidad_estimada_MXN: Number(row[14]) || 0,
          Estado_pago: row[15],
          URL_evidencia_carga: row[16],
          URL_evidencia_descarga: row[17],
          Observaciones: row[18],
          Created_at: row[19],
          Updated_at: row[20],
          _type: "viaje"
        });
      }
    }
  }
  
  const activities = [...gastos, ...pagos, ...viajes];
  activities.sort((a, b) => {
    const dateA = a.Created_at || (a.Fecha + "T" + a.Hora);
    const dateB = b.Created_at || (b.Fecha + "T" + b.Hora);
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });
  
  return { activities };
}

function saveRow(spreadsheet, sheetName, rowData, id, registradoPor, monto, detalle) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error("No existe la hoja " + sheetName);
  sheet.appendRow(rowData);
  
  // Escribir auditoría directamente
  try {
    const audSheet = spreadsheet.getSheetByName("Auditoría");
    if (audSheet) {
      const now = new Date();
      const fechaHora = now.toISOString().replace("T", " ").substring(0, 19);
      const idEvento = "AUD-" + Math.floor(100000 + Math.random() * 900000);
      const row = [
        idEvento,
        fechaHora,
        registradoPor || "sistema",
        "CREAR_" + sheetName.slice(0, -1).toUpperCase(),
        sheetName.slice(0, -1).toLowerCase(),
        id,
        "",
        "",
        JSON.stringify({ Monto: monto, Detalle: detalle }),
        "Kargo Bridge (Modo Familiar)",
        "Registro guardado vía Apps Script Web App."
      ];
      audSheet.appendRow(row);
    }
  } catch (err) {
    // Ignorar fallos de auditoría no críticos
  }
  
  return { success: true };
}

function saveAuditoria(spreadsheet, rowData) {
  const sheet = spreadsheet.getSheetByName("Auditoría");
  if (!sheet) throw new Error("No existe la hoja de Auditoría");
  sheet.appendRow(rowData);
  return { success: true };
}

function uploadDrive(base64File, fileName, mimeType) {
  const cleanBase64 = base64File.replace(/^data:.*;base64,/, "");
  const decoded = Utilities.base64Decode(cleanBase64);
  const blob = Utilities.newBlob(decoded, mimeType || "image/jpeg", fileName || "upload.jpg");
  
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  return {
    url: file.getUrl()
  };
}

function updateEvidence(spreadsheet, id, type, evidenceUrl, evidenceType) {
  let sheetName = "";
  let colRange = "";
  let cellColLetter = "";
  let cellColIndex = -1;

  if (type === "gasto") {
    sheetName = "Gastos";
    colRange = "A1:A2000";
    cellColLetter = "Q"; // Column Q is URL_evidencia_Drive
    cellColIndex = 17; // 17 is column Q (1-based)
  } else if (type === "pago") {
    sheetName = "Pagos";
    colRange = "A1:A2000";
    cellColLetter = "K"; // Column K is URL_evidencia_Drive
    cellColIndex = 11; // 11 is column K
  } else if (type === "viaje") {
    sheetName = "Viajes";
    colRange = "A1:A2000";
    cellColLetter = evidenceType === "carga" ? "Q" : "R";
    cellColIndex = evidenceType === "carga" ? 17 : 18;
  } else {
    throw new Error("Tipo de registro no válido para actualizar evidencia");
  }

  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error("No existe la hoja " + sheetName);

  const values = sheet.getRange(colRange).getValues();
  let rowIndex = -1;
  for (let i = 0; i < values.length; i++) {
    if (values[i] && String(values[i][0]).trim() === id) {
      rowIndex = i + 1; // 1-based index
      break;
    }
  }

  if (rowIndex === -1) {
    throw new Error("No se encontró el registro con ID " + id + " en la hoja " + sheetName);
  }

  // Actualizar celda específica
  sheet.getRange(rowIndex, cellColIndex).setValue(evidenceUrl);

  // Intentar auditoría
  try {
    const audSheet = spreadsheet.getSheetByName("Auditoría");
    if (audSheet) {
      const now = new Date();
      const fechaHora = now.toISOString().replace("T", " ").substring(0, 19);
      const idEvento = "AUD-" + Math.floor(100000 + Math.random() * 900000);
      const row = [
        idEvento,
        fechaHora,
        "sistema",
        "ACTUALIZAR_EVIDENCIA",
        type,
        id,
        evidenceType === "carga" ? "URL_evidencia_carga" : (evidenceType === "descarga" ? "URL_evidencia_descarga" : "URL_evidencia_Drive"),
        "",
        evidenceUrl,
        "Kargo Bridge (Modo Familiar)",
        "Evidencia actualizada vía Apps Script."
      ];
      audSheet.appendRow(row);
    }
  } catch (err) {
    // Ignorar fallos de auditoría
  }

  return { success: true, rowIndex };
}
