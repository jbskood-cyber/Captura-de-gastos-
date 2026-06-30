import React, { useState, useEffect } from "react";
import { Gasto, Pago, Viaje, ValidationState, IAConfidence, RecordType } from "../types";
import { AlertCircle, CheckCircle2, Trash2, ArrowLeft, Landmark, Truck, Wallet, FileText, Upload, Link, Loader2 } from "lucide-react";
import { uploadFileToDrive } from "../services/googleWorkspace";

interface RecordFormProps {
  type: RecordType;
  initialData: any;
  camiones: string[];
  clientes: string[];
  userEmail: string;
  token: string | null;
  isDarkMode?: boolean;
  onSave: (updatedRecord: any) => void;
  onCancel: () => void;
}

export default function RecordForm({
  type,
  initialData,
  camiones,
  clientes,
  userEmail,
  token,
  isDarkMode = false,
  onSave,
  onCancel,
}: RecordFormProps) {
  const [formData, setFormData] = useState<any>({});
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingDescarga, setIsUploadingDescarga] = useState(false);

  useEffect(() => {
    // Generate unique IDs and timestamps if missing
    const now = new Date();
    const currentDate = now.toISOString().split("T")[0];
    const currentTime = now.toTimeString().split(" ")[0];
    const randomId = Math.floor(10000 + Math.random() * 90000);

    const defaultBase = {
      Fecha: currentDate,
      Hora: currentTime,
      Registrado_por: userEmail || "usuario@transportebravo.com",
      Notas: "",
      Created_at: now.toISOString(),
      Updated_at: now.toISOString(),
    };

    if (type === "gasto") {
      setFormData({
        ID_gasto: initialData.ID_gasto || `G-${randomId}`,
        Tipo_entrada: initialData.Tipo_entrada || "texto",
        Categoría: initialData.Categoría || "Diésel",
        Subcategoría: initialData.Subcategoría || "",
        Monto_MXN: Number(initialData.Monto_MXN) || 0,
        Método_pago: initialData.Método_pago || "Efectivo",
        Camión: initialData.Camión || (camiones[0] || ""),
        Chofer: initialData.Chofer || "",
        Cliente: initialData.Cliente || "",
        Viaje_ID: initialData.Viaje_ID || "",
        Proveedor: initialData.Proveedor || "",
        Estado_validación: "revisar",
        Confianza_IA: initialData.Confianza_IA || "media",
        URL_evidencia_Drive: initialData.URL_evidencia_Drive || "",
        ...defaultBase,
        ...initialData,
      });
    } else if (type === "pago") {
      setFormData({
        ID_pago: initialData.ID_pago || `P-${randomId}`,
        Cliente: initialData.Cliente || (clientes[0] || ""),
        Monto_MXN: Number(initialData.Monto_MXN) || 0,
        Método_pago: initialData.Método_pago || "Transferencia",
        Viaje_ID: initialData.Viaje_ID || "",
        Saldo_restante_MXN: Number(initialData.Saldo_restante_MXN) || 0,
        Estado_pago: initialData.Estado_pago || "liquidado",
        URL_evidencia_Drive: initialData.URL_evidencia_Drive || "",
        ...defaultBase,
        ...initialData,
      });
    } else if (type === "viaje") {
      setFormData({
        ID_viaje: initialData.ID_viaje || `V-${randomId}`,
        Cliente: initialData.Cliente || (clientes[0] || ""),
        Origen: initialData.Origen || "",
        Destino: initialData.Destino || "",
        Material: initialData.Material || "Arena",
        Metros_cubicos: Number(initialData.Metros_cubicos) || 7,
        Kilómetros: Number(initialData.Kilómetros) || 0,
        Camión: initialData.Camión || (camiones[0] || ""),
        Chofer: initialData.Chofer || "",
        Precio_cobrado_MXN: Number(initialData.Precio_cobrado_MXN) || 0,
        Costo_estimado_MXN: Number(initialData.Costo_estimado_MXN) || 0,
        Utilidad_estimada_MXN: Number(initialData.Utilidad_estimada_MXN) || 0,
        Estado_pago: initialData.Estado_pago || "pendiente",
        URL_evidencia_carga: initialData.URL_evidencia_carga || "",
        URL_evidencia_descarga: initialData.URL_evidencia_descarga || "",
        Observaciones: initialData.Observaciones || "",
        ...defaultBase,
        ...initialData,
      });
    }
  }, [type, initialData, camiones, clientes, userEmail]);

  // Recalculate estimated utility for voyages
  useEffect(() => {
    if (type === "viaje") {
      const cobrado = Number(formData.Precio_cobrado_MXN) || 0;
      const costo = Number(formData.Costo_estimado_MXN) || 0;
      const utilidad = Math.max(0, cobrado - costo);
      if (formData.Utilidad_estimada_MXN !== utilidad) {
        setFormData((prev: any) => ({ ...prev, Utilidad_estimada_MXN: utilidad }));
      }
    }
  }, [formData.Precio_cobrado_MXN, formData.Costo_estimado_MXN, type]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({
      ...prev,
      [name]: Number(value) || 0,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Mark validation status as validated when confirmed by user
    const finalized = {
      ...formData,
      Estado_validación: "validado" as ValidationState,
      Updated_at: new Date().toISOString(),
    };
    onSave(finalized);
  };

  const confidenceColors = {
    alta: "bg-emerald-50 text-emerald-700 border-emerald-100",
    media: "bg-amber-50 text-amber-700 border-amber-100",
    baja: "bg-rose-50 text-rose-700 border-rose-100",
  };

  const confidenceText = {
    alta: "IA detectó los campos con alta confianza. Verifica brevemente.",
    media: "Faltan algunos detalles. Revisa y completa los campos vacíos.",
    baja: "Confianza baja. Completa la mayor parte de los campos manualmente.",
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-24">
      {/* Top Header Navigation */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm font-medium transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver</span>
        </button>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100">
          ID: {type === "gasto" ? formData.ID_gasto : type === "pago" ? formData.ID_pago : formData.ID_viaje}
        </span>
      </div>

      {/* AI Confidence Banner */}
      {formData.Confianza_IA && (
        <div
          id="confidence-banner"
          className={`border rounded-xl p-4 flex gap-3 items-start ${
            confidenceColors[formData.Confianza_IA as IAConfidence] || confidenceColors.media
          }`}
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-bold uppercase tracking-wide">
              Confianza de la IA: {formData.Confianza_IA}
            </div>
            <p className="text-xs mt-0.5 opacity-90">
              {confidenceText[formData.Confianza_IA as IAConfidence] || confidenceText.media}
            </p>
          </div>
        </div>
      )}

      {/* Title */}
      <div className="flex items-center gap-2 px-1">
        {type === "gasto" ? (
          <Wallet className="w-5 h-5 text-red-500" />
        ) : type === "pago" ? (
          <Landmark className="w-5 h-5 text-emerald-500" />
        ) : (
          <Truck className="w-5 h-5 text-blue-500" />
        )}
        <h2 className="text-lg font-bold text-slate-800 capitalize">
          Revisar {type === "gasto" ? "Gasto" : type === "pago" ? "Pago" : "Viaje"}
        </h2>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs space-y-4">
        {/* Core Date & Time fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Fecha</label>
            <input
              type="date"
              name="Fecha"
              value={formData.Fecha || ""}
              onChange={handleChange}
              className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all font-mono"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Hora</label>
            <input
              type="time"
              name="Hora"
              value={formData.Hora || ""}
              onChange={handleChange}
              className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all font-mono"
              required
            />
          </div>
        </div>

        {/* --- GASTOS FIELDS --- */}
        {type === "gasto" && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Categoría</label>
                <select
                  name="Categoría"
                  value={formData.Categoría || ""}
                  onChange={handleChange}
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all"
                >
                  <option value="Diésel">Diésel</option>
                  <option value="Refacciones">Refacciones</option>
                  <option value="Casetas">Casetas (Peajes)</option>
                  <option value="Sueldo Chofer">Sueldo Chofer</option>
                  <option value="Comida">Comida / Viáticos</option>
                  <option value="Mantenimiento">Mantenimiento</option>
                  <option value="Otros">Otros</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Subcategoría</label>
                <input
                  type="text"
                  name="Subcategoría"
                  placeholder="Ej: Filtro, Llantas, Peaje"
                  value={formData.Subcategoría || ""}
                  onChange={handleChange}
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Monto (MXN)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">$</span>
                <input
                  type="number"
                  name="Monto_MXN"
                  value={formData.Monto_MXN || ""}
                  onChange={handleNumberChange}
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl pl-8 pr-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all font-semibold font-mono"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Camión</label>
                <select
                  name="Camión"
                  value={formData.Camión || ""}
                  onChange={handleChange}
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden"
                >
                  <option value="">-- Selecciona camión --</option>
                  {camiones.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Chofer</label>
                <input
                  type="text"
                  name="Chofer"
                  placeholder="Nombre de chofer"
                  value={formData.Chofer || ""}
                  onChange={handleChange}
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Método de Pago</label>
                <select
                  name="Método_pago"
                  value={formData.Método_pago || ""}
                  onChange={handleChange}
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all"
                >
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Tarjeta">Tarjeta de Crédito/Débito</option>
                  <option value="Vales">Vales Combustible</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Proveedor</label>
                <input
                  type="text"
                  name="Proveedor"
                  placeholder="Gasolinera Pemex, Oxxo, etc."
                  value={formData.Proveedor || ""}
                  onChange={handleChange}
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Cliente asociado</label>
                <select
                  name="Cliente"
                  value={formData.Cliente || ""}
                  onChange={handleChange}
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden"
                >
                  <option value="">-- Ninguno --</option>
                  {clientes.map((cl) => (
                    <option key={cl} value={cl}>{cl}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Viaje ID</label>
                <input
                  type="text"
                  name="Viaje_ID"
                  placeholder="Ej: V-1002"
                  value={formData.Viaje_ID || ""}
                  onChange={handleChange}
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all font-mono"
                />
              </div>
            </div>
          </>
        )}

        {/* --- PAGOS FIELDS --- */}
        {type === "pago" && (
          <>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Cliente</label>
              <select
                name="Cliente"
                value={formData.Cliente || ""}
                onChange={handleChange}
                className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden"
                required
              >
                <option value="">-- Selecciona Cliente --</option>
                {clientes.map((cl) => (
                  <option key={cl} value={cl}>{cl}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Monto Recibido (MXN)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">$</span>
                  <input
                    type="number"
                    name="Monto_MXN"
                    value={formData.Monto_MXN || ""}
                    onChange={handleNumberChange}
                    className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl pl-8 pr-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all font-semibold font-mono"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Saldo Restante (MXN)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">$</span>
                  <input
                    type="number"
                    name="Saldo_restante_MXN"
                    value={formData.Saldo_restante_MXN || ""}
                    onChange={handleNumberChange}
                    className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl pl-8 pr-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Método de Pago</label>
                <select
                  name="Método_pago"
                  value={formData.Método_pago || ""}
                  onChange={handleChange}
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all"
                >
                  <option value="Transferencia">Transferencia</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Tarjeta">Tarjeta</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Estado del Pago</label>
                <select
                  name="Estado_pago"
                  value={formData.Estado_pago || ""}
                  onChange={handleChange}
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all"
                >
                  <option value="liquidado">Liquidado</option>
                  <option value="parcial">Abono Parcial</option>
                  <option value="pendiente">Pendiente</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Viaje ID Asociado</label>
              <input
                type="text"
                name="Viaje_ID"
                placeholder="Ej: V-1002"
                value={formData.Viaje_ID || ""}
                onChange={handleChange}
                className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all font-mono"
              />
            </div>
          </>
        )}

        {/* --- VIAJES FIELDS --- */}
        {type === "viaje" && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Cliente</label>
                <select
                  name="Cliente"
                  value={formData.Cliente || ""}
                  onChange={handleChange}
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden"
                  required
                >
                  <option value="">-- Selecciona Cliente --</option>
                  {clientes.map((cl) => (
                    <option key={cl} value={cl}>{cl}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Material</label>
                <select
                  name="Material"
                  value={formData.Material || ""}
                  onChange={handleChange}
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all"
                >
                  <option value="Arena">Arena</option>
                  <option value="Grava">Grava</option>
                  <option value="Asfalto">Asfalto</option>
                  <option value="Piedra">Piedra / Base</option>
                  <option value="Tierra">Tierra / Tezontle</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Origen (Carga)</label>
                <input
                  type="text"
                  name="Origen"
                  placeholder="Lugar de carga"
                  value={formData.Origen || ""}
                  onChange={handleChange}
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Destino (Entrega)</label>
                <input
                  type="text"
                  name="Destino"
                  placeholder="Lugar de descarga"
                  value={formData.Destino || ""}
                  onChange={handleChange}
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Metros Cúbicos</label>
                <input
                  type="number"
                  name="Metros_cubicos"
                  value={formData.Metros_cubicos || ""}
                  onChange={handleNumberChange}
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Kilómetros</label>
                <input
                  type="number"
                  name="Kilómetros"
                  value={formData.Kilómetros || ""}
                  onChange={handleNumberChange}
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Camión</label>
                <select
                  name="Camión"
                  value={formData.Camión || ""}
                  onChange={handleChange}
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden"
                  required
                >
                  <option value="">-- Selecciona camión --</option>
                  {camiones.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Chofer</label>
                <input
                  type="text"
                  name="Chofer"
                  placeholder="Nombre de chofer"
                  value={formData.Chofer || ""}
                  onChange={handleChange}
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Precio Cobrado (MXN)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">$</span>
                  <input
                    type="number"
                    name="Precio_cobrado_MXN"
                    value={formData.Precio_cobrado_MXN || ""}
                    onChange={handleNumberChange}
                    className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl pl-8 pr-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all font-semibold font-mono"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Costo Estimado (MXN)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">$</span>
                  <input
                    type="number"
                    name="Costo_estimado_MXN"
                    value={formData.Costo_estimado_MXN || ""}
                    onChange={handleNumberChange}
                    className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl pl-8 pr-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Utilidad Est. (MXN)</span>
                <span className="text-sm font-bold text-emerald-600 font-mono">
                  ${(formData.Utilidad_estimada_MXN || 0).toLocaleString("es-MX")}
                </span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Estado de Pago</label>
                <select
                  name="Estado_pago"
                  value={formData.Estado_pago || ""}
                  onChange={handleChange}
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all"
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="parcial">Parcial</option>
                  <option value="pagado">Pagado</option>
                </select>
              </div>
            </div>
          </>
        )}

         {/* --- GOOGLE DRIVE EVIDENCE UPLOADER --- */}
        {(type === "gasto" || type === "pago") && (
          <div className="space-y-1.5">
            <label className={`block text-xs font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-500"} mb-1`}>
              Evidencia / Ticket (Google Drive)
            </label>
            {formData.URL_evidencia_Drive ? (
              <div className={`flex items-center justify-between border rounded-xl p-3 ${
                isDarkMode 
                  ? "bg-emerald-950/20 border-emerald-500/20 text-emerald-400" 
                  : "bg-emerald-50 border-emerald-100 text-emerald-700"
              }`}>
                <div className="flex items-center gap-2 truncate">
                  <Link className={`w-4 h-4 flex-shrink-0 ${isDarkMode ? "text-emerald-400" : "text-emerald-600"}`} />
                  <a
                    href={formData.URL_evidencia_Drive}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline font-medium truncate"
                  >
                    Ver evidencia en Google Drive
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData((prev: any) => ({ ...prev, URL_evidencia_Drive: "" }))}
                  className="text-red-500 hover:text-red-700 p-1 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="file"
                  id="evidence-file-upload"
                  className="hidden"
                  accept="image/*,application/pdf"
                  disabled={isUploading || !token}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setIsUploading(true);
                    try {
                      const url = await uploadFileToDrive(token || "", file, file.name, file.type);
                      setFormData((prev: any) => ({ ...prev, URL_evidencia_Drive: url }));
                    } catch (err: any) {
                      console.error("Upload error:", err);
                      alert("Error al subir archivo a Google Drive: " + err.message);
                    } finally {
                      setIsUploading(false);
                    }
                  }}
                />
                <label
                  htmlFor="evidence-file-upload"
                  className={`flex items-center justify-center gap-2 py-3 border border-dashed rounded-xl cursor-pointer text-xs font-semibold transition-all duration-150 ${
                    !token 
                      ? "opacity-50 cursor-not-allowed border-slate-300 bg-slate-100 text-slate-400"
                      : isDarkMode
                        ? "border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800"
                        : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      <span>Subiendo a Google Drive...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>{token ? "Subir Archivo o Foto a Drive" : "Inicia sesión para subir a Drive"}</span>
                    </>
                  )}
                </label>
              </div>
            )}
          </div>
        )}

        {type === "viaje" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Evidencia de Carga */}
            <div className="space-y-1.5">
              <label className={`block text-xs font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-500"} mb-1`}>
                Evidencia de Carga (Google Drive)
              </label>
              {formData.URL_evidencia_carga ? (
                <div className={`flex items-center justify-between border rounded-xl p-3 ${
                  isDarkMode 
                    ? "bg-emerald-950/20 border-emerald-500/20 text-emerald-400" 
                    : "bg-emerald-50 border-emerald-100 text-emerald-700"
                }`}>
                  <div className="flex items-center gap-2 truncate">
                    <Link className={`w-4 h-4 flex-shrink-0 ${isDarkMode ? "text-emerald-400" : "text-emerald-600"}`} />
                    <a
                      href={formData.URL_evidencia_carga}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline font-medium truncate"
                    >
                      Evidencia Carga
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData((prev: any) => ({ ...prev, URL_evidencia_carga: "" }))}
                    className="text-red-500 hover:text-red-700 p-1 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    type="file"
                    id="carga-file-upload"
                    className="hidden"
                    accept="image/*,application/pdf"
                    disabled={isUploading || !token}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsUploading(true);
                      try {
                        const url = await uploadFileToDrive(token || "", file, file.name, file.type);
                        setFormData((prev: any) => ({ ...prev, URL_evidencia_carga: url }));
                      } catch (err: any) {
                        console.error("Upload error:", err);
                        alert("Error al subir archivo de carga: " + err.message);
                      } finally {
                        setIsUploading(false);
                      }
                    }}
                  />
                  <label
                    htmlFor="carga-file-upload"
                    className={`flex items-center justify-center gap-2 py-3 border border-dashed rounded-xl cursor-pointer text-xs font-semibold transition-all duration-150 ${
                      !token 
                        ? "opacity-50 cursor-not-allowed border-slate-300 bg-slate-100 text-slate-400"
                        : isDarkMode
                          ? "border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        <span>Subiendo...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>{token ? "Evidencia Carga" : "Sin Conexión"}</span>
                      </>
                    )}
                  </label>
                </div>
              )}
            </div>

            {/* Evidencia de Descarga */}
            <div className="space-y-1.5">
              <label className={`block text-xs font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-500"} mb-1`}>
                Evidencia de Descarga (Google Drive)
              </label>
              {formData.URL_evidencia_descarga ? (
                <div className={`flex items-center justify-between border rounded-xl p-3 ${
                  isDarkMode 
                    ? "bg-emerald-950/20 border-emerald-500/20 text-emerald-400" 
                    : "bg-emerald-50 border-emerald-100 text-emerald-700"
                }`}>
                  <div className="flex items-center gap-2 truncate">
                    <Link className={`w-4 h-4 flex-shrink-0 ${isDarkMode ? "text-emerald-400" : "text-emerald-600"}`} />
                    <a
                      href={formData.URL_evidencia_descarga}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline font-medium truncate"
                    >
                      Evidencia Descarga
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData((prev: any) => ({ ...prev, URL_evidencia_descarga: "" }))}
                    className="text-red-500 hover:text-red-700 p-1 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    type="file"
                    id="descarga-file-upload"
                    className="hidden"
                    accept="image/*,application/pdf"
                    disabled={isUploadingDescarga || !token}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsUploadingDescarga(true);
                      try {
                        const url = await uploadFileToDrive(token || "", file, file.name, file.type);
                        setFormData((prev: any) => ({ ...prev, URL_evidencia_descarga: url }));
                      } catch (err: any) {
                        console.error("Upload error:", err);
                        alert("Error al subir archivo de descarga: " + err.message);
                      } finally {
                        setIsUploadingDescarga(false);
                      }
                    }}
                  />
                  <label
                    htmlFor="descarga-file-upload"
                    className={`flex items-center justify-center gap-2 py-3 border border-dashed rounded-xl cursor-pointer text-xs font-semibold transition-all duration-150 ${
                      !token 
                        ? "opacity-50 cursor-not-allowed border-slate-300 bg-slate-100 text-slate-400"
                        : isDarkMode
                          ? "border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {isUploadingDescarga ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        <span>Subiendo...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>{token ? "Evidencia Descarga" : "Sin Conexión"}</span>
                      </>
                    )}
                  </label>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notes (Shared for all categories) */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Notas / Observaciones</label>
          <textarea
            name={type === "viaje" ? "Observaciones" : "Notas"}
            value={(type === "viaje" ? formData.Observaciones : formData.Notas) || ""}
            onChange={handleChange}
            placeholder="Añade detalles o aclaraciones aquí..."
            rows={3}
            className="w-full text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-hidden transition-all resize-none"
          ></textarea>
        </div>
      </div>

      {/* Confirmation and Actions */}
      <div className="flex gap-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-sm font-semibold rounded-xl transition-all"
        >
          <Trash2 className="w-4 h-4 text-slate-500" />
          <span>Descartar</span>
        </button>
        <button
          type="submit"
          id="confirm-submit-btn"
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-sm font-semibold rounded-xl shadow-md transition-all shadow-blue-500/10"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Validar y Guardar</span>
        </button>
      </div>
    </form>
  );
}
