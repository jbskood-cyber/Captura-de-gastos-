import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Landmark,
  Trash2,
  Truck,
  Wallet,
} from "lucide-react";
import { IAConfidence, RecordType, ValidationState } from "../types";

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

const get = (data: any, ...keys: string[]) => {
  for (const key of keys) {
    if (data?.[key] !== undefined && data?.[key] !== null && data?.[key] !== "") return data[key];
  }
  return "";
};

const numberFrom = (value: unknown) => {
  if (value === undefined || value === null || value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "";
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const confidenceCopy: Record<IAConfidence, string> = {
  alta: "Campos detectados con alta confianza.",
  media: "Revisa los campos clave antes de guardar.",
  baja: "Completa manualmente los datos esenciales.",
};

export default function RecordForm({
  type,
  initialData,
  camiones,
  clientes,
  userEmail,
  onSave,
  onCancel,
}: RecordFormProps) {
  const [formData, setFormData] = useState<any>({});
  const [showOptional, setShowOptional] = useState(false);

  useEffect(() => {
    const now = new Date();
    const currentDate = now.toISOString().split("T")[0];
    const currentTime = now.toTimeString().split(" ")[0];
    const base = {
      Fecha: get(initialData, "Fecha") || currentDate,
      Hora: get(initialData, "Hora") || currentTime,
      Registrado_por: get(initialData, "Registrado_por") || userEmail || "usuario@transportebravo.com",
      Notas: get(initialData, "Notas"),
      Created_at: get(initialData, "Created_at") || now.toISOString(),
      Updated_at: now.toISOString(),
    };

    if (type === "gasto") {
      setFormData({
        ID_gasto: get(initialData, "ID_gasto"),
        Tipo_entrada: get(initialData, "Tipo_entrada"),
        Categoría: get(initialData, "Categoría", "Categoria", "CategorÃ­a"),
        Subcategoría: get(initialData, "Subcategoría", "Subcategoria", "SubcategorÃ­a"),
        Monto_MXN: numberFrom(get(initialData, "Monto_MXN")),
        Método_pago: get(initialData, "Método_pago", "Metodo_pago", "MÃ©todo_pago"),
        Camión: get(initialData, "Camión", "Camion", "CamiÃ³n"),
        Chofer: get(initialData, "Chofer"),
        Cliente: get(initialData, "Cliente"),
        Viaje_ID: get(initialData, "Viaje_ID"),
        Proveedor: get(initialData, "Proveedor"),
        Estado_validación: "revisar",
        Confianza_IA: get(initialData, "Confianza_IA") || "media",
        URL_evidencia_Drive: get(initialData, "URL_evidencia_Drive"),
        ...base,
      });
    }

    if (type === "pago") {
      setFormData({
        ID_pago: get(initialData, "ID_pago"),
        Cliente: get(initialData, "Cliente"),
        Monto_MXN: numberFrom(get(initialData, "Monto_MXN")),
        Método_pago: get(initialData, "Método_pago", "Metodo_pago", "MÃ©todo_pago"),
        Viaje_ID: get(initialData, "Viaje_ID"),
        Saldo_restante_MXN: numberFrom(get(initialData, "Saldo_restante_MXN")),
        Estado_pago: get(initialData, "Estado_pago"),
        URL_evidencia_Drive: get(initialData, "URL_evidencia_Drive"),
        ...base,
      });
    }

    if (type === "viaje") {
      setFormData({
        ID_viaje: get(initialData, "ID_viaje"),
        Cliente: get(initialData, "Cliente"),
        Origen: get(initialData, "Origen"),
        Destino: get(initialData, "Destino"),
        Material: get(initialData, "Material"),
        Metros_cubicos: numberFrom(get(initialData, "Metros_cubicos")),
        Kilómetros: numberFrom(get(initialData, "Kilómetros", "Kilometros", "KilÃ³metros")),
        Camión: get(initialData, "Camión", "Camion", "CamiÃ³n"),
        Chofer: get(initialData, "Chofer"),
        Precio_cobrado_MXN: numberFrom(get(initialData, "Precio_cobrado_MXN")),
        Costo_estimado_MXN: numberFrom(get(initialData, "Costo_estimado_MXN")),
        Utilidad_estimada_MXN: numberFrom(get(initialData, "Utilidad_estimada_MXN")),
        Estado_pago: get(initialData, "Estado_pago"),
        URL_evidencia_carga: get(initialData, "URL_evidencia_carga"),
        URL_evidencia_descarga: get(initialData, "URL_evidencia_descarga"),
        Observaciones: get(initialData, "Observaciones", "Notas"),
        ...base,
      });
    }
  }, [camiones, clientes, initialData, type, userEmail]);

  useEffect(() => {
    if (type !== "viaje") return;
    if (formData.Precio_cobrado_MXN === "" && formData.Costo_estimado_MXN === "") return;
    const utilidad = Math.max(0, toNumber(formData.Precio_cobrado_MXN) - toNumber(formData.Costo_estimado_MXN));
    if (formData.Utilidad_estimada_MXN !== utilidad) {
      setFormData((prev: any) => ({ ...prev, Utilidad_estimada_MXN: utilidad }));
    }
  }, [formData.Costo_estimado_MXN, formData.Precio_cobrado_MXN, formData.Utilidad_estimada_MXN, type]);

  const confidence = useMemo(() => {
    const value = formData.Confianza_IA as IAConfidence;
    return value === "alta" || value === "media" || value === "baja" ? value : null;
  }, [formData.Confianza_IA]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleNumberChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((prev: any) => ({ ...prev, [name]: value === "" ? "" : Number(value) }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSave({
      ...formData,
      Estado_validación: "validado" as ValidationState,
      Estado_validacion: "validado" as ValidationState,
      Updated_at: new Date().toISOString(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onCancel} className="bravo-ghost-button">
          <ArrowLeft className="h-4 w-4" />
          <span>Volver</span>
        </button>
        {(formData.ID_gasto || formData.ID_pago || formData.ID_viaje) && (
          <span className="bravo-id-chip">{formData.ID_gasto || formData.ID_pago || formData.ID_viaje}</span>
        )}
      </div>

      <section>
        <div className="flex items-center gap-2 text-[var(--bravo-muted)]">
          {type === "gasto" && <Wallet className="h-5 w-5" />}
          {type === "pago" && <Landmark className="h-5 w-5" />}
          {type === "viaje" && <Truck className="h-5 w-5" />}
          <span className="text-sm font-medium">Captura rápida</span>
        </div>
        <h1 className="mt-3 text-[30px] font-semibold leading-tight">Revisar registro</h1>
        <p className="mt-2 text-[15px] text-[var(--bravo-muted)]">Confirma antes de guardar.</p>
      </section>

      {confidence && (
        <div className={`bravo-confidence ${confidence}`}>
          <FileText className="h-4 w-4" />
          <span>{confidenceCopy[confidence]}</span>
        </div>
      )}

      <section className="bravo-form-panel space-y-4">
        {type === "gasto" && (
          <>
            <MoneyInput label="Monto" name="Monto_MXN" value={formData.Monto_MXN} onChange={handleNumberChange} required />
            <SelectInput label="Categoría" name="Categoría" value={formData.Categoría} onChange={handleChange} options={["Diésel", "Refacciones", "Casetas", "Sueldo Chofer", "Comida", "Mantenimiento", "Otros"]} />
            <SelectInput label="Camión" name="Camión" value={formData.Camión} onChange={handleChange} options={camiones} placeholder="Selecciona camión" />
            <SelectInput label="Método de pago" name="Método_pago" value={formData.Método_pago} onChange={handleChange} options={["Efectivo", "Transferencia", "Tarjeta", "Vales"]} />
            <NoteInput name="Notas" value={formData.Notas} onChange={handleChange} />
          </>
        )}

        {type === "pago" && (
          <>
            <SelectInput label="Cliente" name="Cliente" value={formData.Cliente} onChange={handleChange} options={clientes} placeholder="Selecciona cliente" required />
            <MoneyInput label="Monto" name="Monto_MXN" value={formData.Monto_MXN} onChange={handleNumberChange} required />
            <SelectInput label="Método de pago" name="Método_pago" value={formData.Método_pago} onChange={handleChange} options={["Transferencia", "Efectivo", "Cheque", "Tarjeta"]} />
            <NoteInput name="Notas" value={formData.Notas} onChange={handleChange} />
          </>
        )}

        {type === "viaje" && (
          <>
            <SelectInput label="Cliente" name="Cliente" value={formData.Cliente} onChange={handleChange} options={clientes} placeholder="Selecciona cliente" required />
            <TextInput label="Origen" name="Origen" value={formData.Origen} onChange={handleChange} required />
            <TextInput label="Destino" name="Destino" value={formData.Destino} onChange={handleChange} required />
            <SelectInput label="Material" name="Material" value={formData.Material} onChange={handleChange} options={["Arena", "Grava", "Asfalto", "Piedra", "Tierra", "Otro"]} />
            <SelectInput label="Camión" name="Camión" value={formData.Camión} onChange={handleChange} options={camiones} placeholder="Selecciona camión" required />
            <MoneyInput label="Precio" name="Precio_cobrado_MXN" value={formData.Precio_cobrado_MXN} onChange={handleNumberChange} required />
            <NoteInput name="Observaciones" value={formData.Observaciones} onChange={handleChange} />
          </>
        )}

        <button type="button" className="bravo-disclosure" onClick={() => setShowOptional(!showOptional)}>
          <span>Detalles opcionales</span>
          {showOptional ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showOptional && (
          <div className="space-y-4 border-t border-[var(--bravo-border)] pt-4">
            <div className="grid grid-cols-2 gap-3">
              <TextInput label="Fecha" name="Fecha" type="date" value={formData.Fecha} onChange={handleChange} />
              <TextInput label="Hora" name="Hora" type="time" value={String(formData.Hora || "").slice(0, 5)} onChange={handleChange} />
            </div>

            {type === "gasto" && (
              <>
                <TextInput label="Subcategoría" name="Subcategoría" value={formData.Subcategoría} onChange={handleChange} />
                <TextInput label="Proveedor" name="Proveedor" value={formData.Proveedor} onChange={handleChange} />
                <TextInput label="Chofer" name="Chofer" value={formData.Chofer} onChange={handleChange} />
                <SelectInput label="Cliente" name="Cliente" value={formData.Cliente} onChange={handleChange} options={clientes} placeholder="Opcional" />
                <TextInput label="Viaje ID" name="Viaje_ID" value={formData.Viaje_ID} onChange={handleChange} />
              </>
            )}

            {type === "pago" && (
              <>
                <MoneyInput label="Saldo restante" name="Saldo_restante_MXN" value={formData.Saldo_restante_MXN} onChange={handleNumberChange} />
                <SelectInput label="Estado de pago" name="Estado_pago" value={formData.Estado_pago} onChange={handleChange} options={["liquidado", "parcial", "pendiente"]} />
                <TextInput label="Viaje ID" name="Viaje_ID" value={formData.Viaje_ID} onChange={handleChange} />
              </>
            )}

            {type === "viaje" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <TextInput label="M3" name="Metros_cubicos" type="number" value={formData.Metros_cubicos} onChange={handleNumberChange} />
                  <TextInput label="Km" name="Kilómetros" type="number" value={formData.Kilómetros} onChange={handleNumberChange} />
                </div>
                <TextInput label="Chofer" name="Chofer" value={formData.Chofer} onChange={handleChange} />
                <SelectInput label="Estado de pago" name="Estado_pago" value={formData.Estado_pago} onChange={handleChange} options={["pendiente", "parcial", "pagado"]} />
                <MoneyInput label="Costo estimado" name="Costo_estimado_MXN" value={formData.Costo_estimado_MXN} onChange={handleNumberChange} />
                {formData.Utilidad_estimada_MXN !== "" && (
                  <div className="rounded-2xl border border-[var(--bravo-border)] bg-white/[0.03] p-4">
                    <span className="block text-xs font-medium text-[var(--bravo-muted)]">Utilidad estimada</span>
                    <span className="mt-1 block text-lg font-semibold tabular-nums">${Number(formData.Utilidad_estimada_MXN || 0).toLocaleString("es-MX")}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onCancel} className="bravo-secondary-button">
          <Trash2 className="h-4 w-4" />
          <span>Descartar</span>
        </button>
        <button type="submit" id="confirm-submit-btn" className="bravo-primary-button">
          <CheckCircle2 className="h-4 w-4" />
          <span>Confirmar y guardar</span>
        </button>
      </div>
    </form>
  );
}

function FieldShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-[var(--bravo-muted)]">{label}</span>
      {children}
    </label>
  );
}

function TextInput(props: {
  label: string;
  name: string;
  value: any;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <FieldShell label={props.label}>
      <input className="bravo-field" name={props.name} type={props.type || "text"} value={props.value || ""} onChange={props.onChange} required={props.required} />
    </FieldShell>
  );
}

function MoneyInput(props: {
  label: string;
  name: string;
  value: any;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}) {
  return (
    <FieldShell label={props.label}>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--bravo-muted)]">$</span>
        <input className="bravo-field pl-8 tabular-nums" name={props.name} type="number" value={props.value || ""} onChange={props.onChange} required={props.required} />
      </div>
    </FieldShell>
  );
}

function SelectInput(props: {
  label: string;
  name: string;
  value: any;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <FieldShell label={props.label}>
      <select className="bravo-field" name={props.name} value={props.value || ""} onChange={props.onChange} required={props.required}>
        <option value="">{props.placeholder || "Selecciona"}</option>
        {props.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

function NoteInput(props: {
  name: string;
  value: any;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <FieldShell label="Nota">
      <textarea className="bravo-field min-h-[88px] resize-none py-3" name={props.name} value={props.value || ""} onChange={props.onChange} placeholder="Agrega una nota breve si hace falta." />
    </FieldShell>
  );
}
