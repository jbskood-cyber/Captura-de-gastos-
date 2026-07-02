export type ValidationState =
  | "borrador"
  | "revisar"
  | "validado"
  | "pendiente_aprobacion"
  | "aprobado"
  | "rechazado"
  | "pendiente_sync"
  | "error_sync"
  | "descartado";
export type IAConfidence = "alta" | "media" | "baja";
export type RecordType = "gasto" | "pago" | "viaje";

export interface Gasto {
  ID_gasto: string;
  Fecha: string;
  Hora: string;
  Registrado_por: string;
  Tipo_entrada: "audio" | "foto" | "texto";
  Categoría: string;
  Subcategoría: string;
  Monto_MXN: number;
  Método_pago: string;
  Camión: string;
  Chofer: string;
  Cliente: string;
  Viaje_ID: string;
  Proveedor: string;
  Estado_validación: ValidationState;
  Estado_validacion?: ValidationState;
  Confianza_IA: IAConfidence;
  URL_evidencia_Drive: string;
  Notas: string;
  Created_at: string;
  Updated_at: string;
}

export interface Pago {
  ID_pago: string;
  Fecha: string;
  Hora: string;
  Registrado_por: string;
  Cliente: string;
  Monto_MXN: number;
  Método_pago: string;
  Viaje_ID: string;
  Saldo_restante_MXN: number;
  Estado_pago: string;
  URL_evidencia_Drive: string;
  Notas: string;
  Created_at: string;
  Updated_at: string;
}

export interface Viaje {
  ID_viaje: string;
  Fecha: string;
  Hora: string;
  Registrado_por: string;
  Cliente: string;
  Origen: string;
  Destino: string;
  Material: string;
  Metros_cubicos: number;
  Kilómetros: number;
  Camión: string;
  Chofer: string;
  Precio_cobrado_MXN: number;
  Costo_estimado_MXN: number;
  Utilidad_estimada_MXN: number;
  Estado_pago: string;
  URL_evidencia_carga: string;
  URL_evidencia_descarga: string;
  Observaciones: string;
  Created_at: string;
  Updated_at: string;
}

export interface Auditoria {
  ID_auditoria: string;
  Fecha: string;
  Hora: string;
  Usuario: string;
  Accion: string;
  Detalles: string;
}

export interface AppState {
  camiones: string[];
  clientes: string[];
  viajesActivos: string[];
}
