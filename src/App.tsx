import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Landmark,
  Loader2,
  LogOut,
  Mic,
  Search,
  Sparkles,
  Truck,
  Type,
  Wallet,
} from "lucide-react";
import AudioCapture from "./components/AudioCapture";
import PhotoCapture from "./components/PhotoCapture";
import RecordForm from "./components/RecordForm";
import SyncNotification from "./components/SyncNotification";
import { googleSignIn, initAuth, logout } from "./services/firebaseAuth";
import {
  loadCamiones,
  loadClientes,
  loadSheetsActivities,
  saveGastoToSheet,
  savePagoToSheet,
  saveViajeToSheet,
  updateEvidenceInSheet,
  uploadFileToDrive,
} from "./services/googleWorkspace";
import { RecordType } from "./types";

type TabKey = "inicio" | "captura" | "historial";
type InputType = "audio" | "foto" | "texto";
type SaveConfirmation = "synced" | "pending";

const APP_NAME = "Kargo";
const PENDING_DRIVE = "[PENDIENTE DE SUBIDA A DRIVE]";
const isPreviewMode =
  (import.meta as any).env?.DEV === true &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("preview") === "1";
const previewUser = { email: "preview@capturabravo.local" };

function previewActivities() {
  const now = new Date();
  const fecha = now.toISOString().split("T")[0];
  const hora = now.toTimeString().split(" ")[0];
  return [
    {
      _type: "gasto",
      ID_gasto: "PREVIEW-G-001",
      Fecha: fecha,
      Hora: hora,
      Categoría: "Casetas",
      Monto_MXN: 480,
      Camión: "Unidad 12",
      Método_pago: "Efectivo",
      Estado_validacion: "pendiente_sync",
      Notas: "Vista previa local",
    },
    {
      _type: "pago",
      ID_pago: "PREVIEW-P-001",
      Fecha: fecha,
      Hora: hora,
      Cliente: "Cliente Bravo",
      Monto_MXN: 3500,
      Método_pago: "Transferencia",
      Estado_validacion: "pendiente_sync",
      Notas: "Pago de ejemplo",
    },
    {
      _type: "viaje",
      ID_viaje: "PREVIEW-V-001",
      Fecha: fecha,
      Hora: hora,
      Cliente: "Obra Norte",
      Origen: "Patio",
      Destino: "Fraccionamiento",
      Material: "Grava",
      Camión: "Unidad 08",
      Precio_cobrado_MXN: 7200,
      Estado_validacion: "pendiente_sync",
      Observaciones: "Viaje de ejemplo",
    },
  ];
}

const text = (value: unknown) => String(value ?? "");
const money = (value: unknown) => Number(value || 0).toLocaleString("es-MX");
const getStatus = (item: any) => item.Estado_validacion || item["Estado_validaci\u00f3n"];
const setStatus = (item: any, value: string) => {
  item["Estado_validaci\u00f3n"] = value;
  item.Estado_validacion = value;
};
const getCategory = (item: any) => item["Categor\u00eda"] || item.Categoria || "";
const getPaymentMethod = (item: any) => item["M\u00e9todo_pago"] || item.Metodo_pago || "";
const getTruck = (item: any) => item["Cami\u00f3n"] || item.Camion || "";
const getKm = (item: any) => item["Kil\u00f3metros"] || item.Kilometros || 0;

function isMobileAuthContext() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function recordLabel(type?: RecordType) {
  if (type === "pago") return "Pago";
  if (type === "viaje") return "Viaje";
  return "Gasto";
}

function recordIcon(type?: RecordType, className = "h-4 w-4") {
  if (type === "pago") return <Landmark className={className} />;
  if (type === "viaje") return <Truck className={className} />;
  return <Wallet className={className} />;
}

function activityTitle(item: any) {
  if (item._type === "gasto") return getCategory(item) || "Gasto";
  if (item._type === "pago") return item.Cliente || "Pago";
  return item.Cliente || item.Material || "Viaje";
}

function activityMeta(item: any) {
  if (item._type === "gasto") return getTruck(item) || getPaymentMethod(item) || "Sin camion";
  if (item._type === "pago") return getPaymentMethod(item) || item.Viaje_ID || "Pago recibido";
  return getTruck(item) || `${item.Origen || "Origen"} -> ${item.Destino || "Destino"}`;
}

function activityAmount(item: any) {
  return item.Monto_MXN || item.Precio_cobrado_MXN || 0;
}

function isThisWeek(item: any) {
  if (!item.Fecha) return false;
  const date = new Date(`${item.Fecha}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return date >= start && date < end;
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("inicio");
  const [inputType, setInputType] = useState<InputType>("texto");
  const [inputText, setInputText] = useState("");
  const [capturedMedia, setCapturedMedia] = useState<string | null>(null);
  const [mediaMimeType, setMediaMimeType] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeRecord, setActiveRecord] = useState<any>(null);
  const [activeRecordType, setActiveRecordType] = useState<RecordType | null>(null);
  const [saveConfirmation, setSaveConfirmation] = useState<SaveConfirmation | null>(null);

  const [camionesList, setCamionesList] = useState<string[]>([]);
  const [clientesList, setClientesList] = useState<string[]>([]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [pendingSyncQueue, setPendingSyncQueue] = useState<any[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDetailItem, setSelectedDetailItem] = useState<any | null>(null);
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);

  useEffect(() => {
    if (isPreviewMode) {
      setUser(previewUser);
      setToken(null);
      setNeedsAuth(false);
      return () => undefined;
    }

    const unsubscribe = initAuth(
      (currentUser, currentToken) => {
        setUser(currentUser);
        setToken(currentToken);
        setNeedsAuth(false);
      },
      () => setNeedsAuth(true)
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const savedActivities = localStorage.getItem("bravo_activities");
    const savedQueue = localStorage.getItem("bravo_sync_queue");
    const savedCamiones = localStorage.getItem("bravo_camiones");
    const savedClientes = localStorage.getItem("bravo_clientes");

    const localActivities = savedActivities ? JSON.parse(savedActivities) : [];
    if (localActivities.length > 0) setRecentActivities(localActivities);
    if (localActivities.length === 0 && isPreviewMode) {
      const mockActivities = previewActivities();
      setRecentActivities(mockActivities);
      localStorage.setItem("bravo_activities", JSON.stringify(mockActivities));
    }
    if (savedQueue) setPendingSyncQueue(JSON.parse(savedQueue));
    if (savedCamiones) setCamionesList(JSON.parse(savedCamiones));
    if (!savedCamiones && isPreviewMode) {
      const mockCamiones = ["Unidad 08", "Unidad 12", "Unidad 21"];
      setCamionesList(mockCamiones);
      localStorage.setItem("bravo_camiones", JSON.stringify(mockCamiones));
    }
    if (savedClientes) setClientesList(JSON.parse(savedClientes));
    if (!savedClientes && isPreviewMode) {
      const mockClientes = ["Cliente Bravo", "Obra Norte", "Constructora Local"];
      setClientesList(mockClientes);
      localStorage.setItem("bravo_clientes", JSON.stringify(mockClientes));
    }
    if (token) loadDropdownData();
  }, [token]);

  const saveActivitiesToLocal = (activities: any[]) => {
    setRecentActivities(activities);
    localStorage.setItem("bravo_activities", JSON.stringify(activities));
  };

  const saveQueueToLocal = (queue: any[]) => {
    setPendingSyncQueue(queue);
    localStorage.setItem("bravo_sync_queue", JSON.stringify(queue));
  };

  const loadDropdownData = async () => {
    if (!token) return;
    try {
      const [freshCamiones, freshClientes] = await Promise.all([loadCamiones(token), loadClientes(token)]);
      setCamionesList(freshCamiones);
      setClientesList(freshClientes);
      localStorage.setItem("bravo_camiones", JSON.stringify(freshCamiones));
      localStorage.setItem("bravo_clientes", JSON.stringify(freshClientes));

      const freshActivities = await loadSheetsActivities(token);
      if (freshActivities?.length > 0) saveActivitiesToLocal(freshActivities);
    } catch (err) {
      console.warn("Could not load fresh data from Google Sheets. Using cached versions.", err);
    }
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const isIframe = typeof window !== "undefined" && window.self !== window.top;
      const res = await googleSignIn(isMobileAuthContext() || isIframe);
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        setNeedsAuth(false);
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      setLoginError(err?.message || String(err));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (confirm("Cerrar sesion?")) {
      await logout();
      setUser(null);
      setToken(null);
      setNeedsAuth(true);
    }
  };

  const handleProcessInput = async (override?: { inputType?: InputType; media?: string | null; mimeType?: string; text?: string }) => {
    setSaveConfirmation(null);
    setIsProcessing(true);
    setNetworkError(null);
    const effectiveInputType = override?.inputType || inputType;
    const effectiveMedia = override?.media ?? capturedMedia;
    const effectiveMimeType = override?.mimeType || mediaMimeType;
    const effectiveText = override?.text ?? inputText;

    const payload: any = {
      text: effectiveText,
      type: activeRecordType || "auto",
      camiones: camionesList,
      clientes: clientesList,
    };

    if (effectiveInputType === "foto" && effectiveMedia) {
      payload.image = effectiveMedia;
      payload.mimeType = effectiveMimeType;
    } else if (effectiveInputType === "audio" && effectiveMedia) {
      payload.audio = effectiveMedia;
      payload.mimeType = effectiveMimeType;
    }

    try {
      const response = await fetch("/api/process-input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errObj = await response.json();
        throw new Error(errObj.error || "Fallo al procesar con Gemini");
      }

      const result = await response.json();
      setActiveRecord(result.datos || {});
      setActiveRecordType(result.tipo_registro);
      setActiveTab("captura");
    } catch (err: any) {
      console.error("Gemini Extraction Error:", err);
      alert(`No se pudo interpretar: ${err.message}. Abriremos captura manual.`);
      setActiveRecordType(activeRecordType || "gasto");
      setActiveRecord({});
      setActiveTab("captura");
    } finally {
      setIsProcessing(false);
    }
  };

  const attachPendingDrivePlaceholder = (record: any) => {
    if (inputType !== "foto" || !capturedMedia) return;
    if (activeRecordType === "viaje") {
      record.URL_evidencia_carga = PENDING_DRIVE;
      record.URL_evidencia_descarga = PENDING_DRIVE;
      return;
    }
    record.URL_evidencia_Drive = PENDING_DRIVE;
  };

  const handleSaveRecord = async (finalizedRecord: any) => {
    setIsProcessing(true);
    setNetworkError(null);

    const isOnline = navigator.onLine && token;
    let confirmation: SaveConfirmation = "synced";
    if (isOnline) {
      try {
        if (inputType === "foto" && capturedMedia) {
          const res = await fetch(capturedMedia);
          const blob = await res.blob();
          const fileName = `${(activeRecordType || "evidencia").toUpperCase()}_${Date.now()}.jpg`;
          const driveLink = await uploadFileToDrive(token, blob, fileName, mediaMimeType);
          if (activeRecordType === "viaje") {
            finalizedRecord.URL_evidencia_carga = driveLink;
            finalizedRecord.URL_evidencia_descarga = driveLink;
          } else {
            finalizedRecord.URL_evidencia_Drive = driveLink;
          }
        }

        if (activeRecordType === "gasto") await saveGastoToSheet(token, finalizedRecord);
        if (activeRecordType === "pago") await savePagoToSheet(token, finalizedRecord);
        if (activeRecordType === "viaje") await saveViajeToSheet(token, finalizedRecord);

        setStatus(finalizedRecord, "validado");
        setLastSyncedAt(new Date().toISOString());
      } catch (err) {
        console.error("Fallo guardado online (Sheets/Drive):", err);
        setStatus(finalizedRecord, "pendiente_sync");
        attachPendingDrivePlaceholder(finalizedRecord);
        setNetworkError("Guardado local; se sincronizar\u00e1 despues");
        confirmation = "pending";
        saveQueueToLocal([
          ...pendingSyncQueue,
          { record: finalizedRecord, type: activeRecordType, localMediaData: capturedMedia, localMediaMime: mediaMimeType },
        ]);
      }
    } else {
      setStatus(finalizedRecord, "pendiente_sync");
      attachPendingDrivePlaceholder(finalizedRecord);
      setNetworkError("Sin conexi\u00f3n; guardado en cola local");
      confirmation = "pending";
      saveQueueToLocal([
        ...pendingSyncQueue,
        { record: finalizedRecord, type: activeRecordType, localMediaData: capturedMedia, localMediaMime: mediaMimeType },
      ]);
    }

    saveActivitiesToLocal([{ ...finalizedRecord, _type: activeRecordType }, ...recentActivities]);
    setInputText("");
    setCapturedMedia(null);
    setMediaMimeType("");
    setActiveRecord(null);
    setActiveRecordType(null);
    setIsProcessing(false);
    setSaveConfirmation(confirmation);
    setActiveTab("inicio");
  };

  const handleUpdateEvidenceForDetail = async (file: File, evidenceType?: "carga" | "descarga") => {
    if (!selectedDetailItem || !token) return;
    setIsUploadingEvidence(true);
    try {
      const id = selectedDetailItem.ID_gasto || selectedDetailItem.ID_pago || selectedDetailItem.ID_viaje;
      const driveUrl = await uploadFileToDrive(token, file, file.name, file.type);
      await updateEvidenceInSheet(token, id, selectedDetailItem._type, driveUrl, evidenceType);
      const updatedItem = { ...selectedDetailItem };
      if (selectedDetailItem._type === "viaje") {
        if (evidenceType === "carga") updatedItem.URL_evidencia_carga = driveUrl;
        else updatedItem.URL_evidencia_descarga = driveUrl;
      } else {
        updatedItem.URL_evidencia_Drive = driveUrl;
      }
      setSelectedDetailItem(updatedItem);
      saveActivitiesToLocal(
        recentActivities.map((item) => {
          const itemId = item.ID_gasto || item.ID_pago || item.ID_viaje;
          return itemId === id && item._type === selectedDetailItem._type ? updatedItem : item;
        })
      );
    } catch (err: any) {
      alert("Error al cargar evidencia: " + err.message);
    } finally {
      setIsUploadingEvidence(false);
    }
  };

  const handleSyncPendingQueue = async () => {
    if (!token || pendingSyncQueue.length === 0) return;
    setIsSyncing(true);
    setNetworkError(null);

    const remainingQueue: any[] = [];
    const updatedActivities = [...recentActivities];

    for (const item of pendingSyncQueue) {
      try {
        const hasPendingMedia =
          item.record.URL_evidencia_Drive === PENDING_DRIVE ||
          item.record.URL_evidencia_carga === PENDING_DRIVE ||
          item.record.URL_evidencia_descarga === PENDING_DRIVE;

        if (hasPendingMedia && item.localMediaData) {
          const res = await fetch(item.localMediaData);
          const blob = await res.blob();
          const driveLink = await uploadFileToDrive(token, blob, `EVIDENCIA_SYNC_${Date.now()}.jpg`, item.localMediaMime || "image/jpeg");
          if (item.record.URL_evidencia_Drive === PENDING_DRIVE) item.record.URL_evidencia_Drive = driveLink;
          if (item.record.URL_evidencia_carga === PENDING_DRIVE) item.record.URL_evidencia_carga = driveLink;
          if (item.record.URL_evidencia_descarga === PENDING_DRIVE) item.record.URL_evidencia_descarga = driveLink;
        }

        if (item.type === "gasto") await saveGastoToSheet(token, item.record);
        if (item.type === "pago") await savePagoToSheet(token, item.record);
        if (item.type === "viaje") await saveViajeToSheet(token, item.record);

        const id = item.record.ID_gasto || item.record.ID_pago || item.record.ID_viaje;
        const activityIndex = updatedActivities.findIndex((act) => (act.ID_gasto || act.ID_pago || act.ID_viaje) === id);
        if (activityIndex > -1) updatedActivities[activityIndex] = { ...item.record, _type: item.type, ["Estado_validaci\u00f3n"]: "validado" };
      } catch (err) {
        console.error("Could not sync item:", item, err);
        remainingQueue.push(item);
      }
    }

    saveActivitiesToLocal(updatedActivities);
    saveQueueToLocal(remainingQueue);
    setIsSyncing(false);

    if (remainingQueue.length === 0) {
      setLastSyncedAt(new Date().toISOString());
      setNetworkError(null);
      loadDropdownData();
    } else {
      setNetworkError("Sincronizaci\u00f3n parcial");
    }
  };

  const handleDiscardRecord = () => {
    if (confirm("Descartar este registro?")) {
      setActiveRecord(null);
      setActiveRecordType(null);
      setSaveConfirmation(null);
      setActiveTab("inicio");
    }
  };

  const filteredActivities = useMemo(
    () =>
      recentActivities.filter((item) => {
        if (!isThisWeek(item)) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return [item.Notas, item.Observaciones, item.Cliente, getTruck(item), item.Chofer, getCategory(item), item.Material, item.Origen, item.Destino]
          .filter(Boolean)
          .some((value) => text(value).toLowerCase().includes(q));
      }),
    [recentActivities, searchQuery]
  );

  if (needsAuth) {
    return (
      <div className="min-h-screen bg-[var(--bravo-bg)] text-[var(--bravo-ink)]">
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-between px-6 py-10">
          <div className="pt-24 text-center">
            <div className="mx-auto mb-7 grid h-12 w-12 place-items-center rounded-2xl border border-[var(--bravo-border)] bg-[var(--bravo-surface)]">
              <Truck className="h-5 w-5 text-[var(--bravo-muted)]" />
            </div>
            <h1 className="text-[28px] font-semibold">{APP_NAME}</h1>
            <p className="mx-auto mt-3 max-w-[230px] text-[15px] leading-6 text-[var(--bravo-muted)]">
              Registra gastos, pagos y viajes.
            </p>
          </div>

          <div className="space-y-4 pb-7">
            {loginError && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">{loginError}</div>}
            <button
              id="google-signin-btn"
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-[var(--bravo-border)] bg-[var(--bravo-surface)] text-[15px] font-semibold text-[var(--bravo-ink)] transition active:scale-[0.99] disabled:opacity-60"
            >
              {isLoggingIn ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="grid h-5 w-5 place-items-center rounded-full border border-[var(--bravo-border)] text-[11px] font-bold">G</span>}
              <span>Continuar con Google</span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  const navItems: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    { key: "inicio", label: "Captura", icon: <Sparkles className="h-5 w-5" /> },
    { key: "historial", label: "Historial", icon: <Clock3 className="h-5 w-5" /> },
  ];

  return (
    <div className="min-h-screen bg-[var(--bravo-bg)] text-[var(--bravo-ink)]">
      {isProcessing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-[260px] rounded-3xl border border-[var(--bravo-border)] bg-[var(--bravo-surface)] p-6 text-center shadow-2xl">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--bravo-muted)]" />
            <h3 className="mt-4 text-base font-semibold">Procesando captura</h3>
            <p className="mt-1 text-sm text-[var(--bravo-muted)]">Gemini prepara el registro.</p>
          </div>
        </div>
      )}

      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col pb-24">
        <header className="sticky top-0 z-30 border-b border-[var(--bravo-border)] bg-[var(--bravo-bg)]/90 px-5 py-4 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-xl bg-[var(--bravo-soft)] text-[var(--bravo-ink)]">
                <Truck className="h-3.5 w-3.5" />
              </div>
              <span className="text-[13px] font-semibold">{APP_NAME}</span>
              {isPreviewMode && (
                <span className="rounded-full border border-[var(--bravo-border)] bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-[var(--bravo-muted)]">
                  Vista previa local
                </span>
              )}
            </div>
            <button className="bravo-icon-button" onClick={handleLogout} aria-label="Cerrar sesion">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 space-y-7 px-5 py-6">
          {activeTab === "inicio" && (
            saveConfirmation ? (
              <section className="bravo-confirmation">
                <div className="bravo-confirmation-mark">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h1>Registro guardado</h1>
                <p>{saveConfirmation === "synced" ? "Se sincroniz\u00f3 correctamente" : "Guardado pendiente de sincronizaci\u00f3n"}</p>
                <div className="mt-7 grid gap-3">
                  <button className="bravo-primary-button" onClick={() => setSaveConfirmation(null)}>
                    Nuevo registro
                  </button>
                  <button
                    className="bravo-secondary-button"
                    onClick={() => {
                      setSaveConfirmation(null);
                      setActiveTab("historial");
                    }}
                  >
                    Ver historial
                  </button>
                </div>
              </section>
            ) : (
            <>
              <section>
                <h1 className="text-[34px] font-semibold leading-[1.05]">Captura</h1>
              </section>

              <section className="space-y-4">
                <div className="bravo-chat-card">
                  <textarea
                    id="text-capture-input"
                    value={inputText}
                    onChange={(event) => {
                      setInputText(event.target.value);
                      setInputType("texto");
                    }}
                    placeholder={"Cu\u00e9ntame o captura lo que pas\u00f3..."}
                    rows={4}
                    className="bravo-chat-input"
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      id="input-method-audio"
                      className={`bravo-capture-button ${inputType === "audio" ? "is-active" : ""}`}
                      onClick={() => {
                        setInputType("audio");
                        setCapturedMedia(null);
                        setInputText("");
                      }}
                    >
                      <Mic className="h-5 w-5" />
                      <span>Audio</span>
                    </button>
                    <button
                      type="button"
                      id="input-method-photo"
                      className={`bravo-capture-button ${inputType === "foto" ? "is-active" : ""}`}
                      onClick={() => {
                        setInputType("foto");
                        setCapturedMedia(null);
                        setInputText("");
                      }}
                    >
                      <Camera className="h-5 w-5" />
                      <span>{"C\u00e1mara"}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <button type="button" id="input-method-text" className={`bravo-write-button ${inputType === "texto" ? "is-active" : ""}`} onClick={() => setInputType("texto")}>
                      <Type className="h-4 w-4" />
                      <span>Escribir</span>
                    </button>
                    {inputType === "texto" && (
                      <button
                        id="text-interpret-btn"
                        className="bravo-primary-button max-w-[152px]"
                        disabled={isProcessing || !inputText.trim()}
                        onClick={() => handleProcessInput()}
                      >
                        <Sparkles className="h-4 w-4" />
                        <span>Revisar</span>
                      </button>
                    )}
                  </div>
                </div>

                {inputType === "foto" && (
                  <PhotoCapture
                    description={inputText}
                    onDescriptionChange={setInputText}
                    onPhotoCaptured={(base64, mime) => {
                      setCapturedMedia(base64);
                      setMediaMimeType(mime);
                    }}
                    onProcess={(description) => handleProcessInput({ inputType: "foto", text: description })}
                    isProcessing={isProcessing}
                  />
                )}

                {inputType === "audio" && (
                  <AudioCapture
                    onAudioCaptured={(base64, mime) => {
                      setCapturedMedia(base64);
                      setMediaMimeType(mime);
                      handleProcessInput({ inputType: "audio", media: base64, mimeType: mime, text: "" });
                    }}
                    isProcessing={isProcessing}
                  />
                )}
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Registros recientes</h2>
                  {recentActivities.length > 0 && (
                    <button className="text-sm font-medium text-[var(--bravo-muted)]" onClick={() => setActiveTab("historial")}>
                      Ver todo
                    </button>
                  )}
                </div>
                <ActivityList items={recentActivities.slice(0, 4)} onSelect={setSelectedDetailItem} empty={"Los registros recientes aparecer\u00e1n aqu\u00ed."} />
              </section>

              <SyncNotification
                pendingCount={pendingSyncQueue.length}
                lastSyncedAt={lastSyncedAt}
                onSyncTrigger={handleSyncPendingQueue}
                isSyncing={isSyncing}
                networkError={networkError}
                pendingQueue={pendingSyncQueue}
                isPreviewMode={isPreviewMode}
              />
            </>
            )
          )}

          {activeTab === "captura" && activeRecord && activeRecordType && (
            <RecordForm
              type={activeRecordType}
              initialData={activeRecord}
              camiones={camionesList}
              clientes={clientesList}
              userEmail={user?.email || ""}
              token={token}
              onSave={handleSaveRecord}
              onCancel={handleDiscardRecord}
            />
          )}

          {activeTab === "captura" && (!activeRecord || !activeRecordType) && (
            <div className="bravo-empty">
              <AlertCircle className="mx-auto h-8 w-8 text-[var(--bravo-muted)]" />
              <h2 className="mt-3 text-base font-semibold">Sin registro activo</h2>
              <button className="bravo-primary-button mt-5" onClick={() => setActiveTab("inicio")}>
                Ir a Captura
              </button>
            </div>
          )}

          {activeTab === "historial" && (
            <section className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-[30px] font-semibold leading-tight">Historial</h1>
                <span className="bravo-week-chip">Esta semana</span>
              </div>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--bravo-muted)]" />
                <input className="bravo-search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar" />
              </div>
              <ActivityList items={filteredActivities} onSelect={setSelectedDetailItem} empty="No hay registros esta semana." />
            </section>
          )}
        </main>

        <nav className="fixed bottom-0 left-0 right-0 z-40 mx-auto max-w-md border-t border-[var(--bravo-border)] bg-[var(--bravo-bg)]/88 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
          <div className="grid grid-cols-2 gap-1">
            {navItems.map((item) => (
              <button key={item.key} className={`bravo-nav-item ${activeTab === item.key ? "is-active" : ""}`} onClick={() => setActiveTab(item.key)}>
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>

      {selectedDetailItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="max-h-[82vh] w-full max-w-md overflow-hidden rounded-t-[28px] border border-[var(--bravo-border)] bg-[var(--bravo-surface)] shadow-2xl sm:rounded-[28px]">
            <div className="flex items-start justify-between border-b border-[var(--bravo-border)] p-5">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--bravo-muted)]">
                  {recordIcon(selectedDetailItem._type)}
                  <span>{recordLabel(selectedDetailItem._type)}</span>
                </div>
                <h2 className="mt-2 text-xl font-semibold">{activityTitle(selectedDetailItem)}</h2>
                <p className="mt-1 text-sm text-[var(--bravo-muted)]">{selectedDetailItem.Fecha} - {text(selectedDetailItem.Hora).slice(0, 5)}</p>
              </div>
              <span className={`bravo-status ${getStatus(selectedDetailItem) === "pendiente_sync" ? "pending" : "synced"}`}>
                {getStatus(selectedDetailItem) === "pendiente_sync" ? "Pendiente" : "Sincronizado"}
              </span>
            </div>
            <div className="max-h-[52vh] overflow-y-auto p-5">
              <dl className="bravo-detail-list">
                <Detail label="Monto" value={`$${money(activityAmount(selectedDetailItem))} MXN`} />
                <Detail label="Cliente" value={selectedDetailItem.Cliente} />
                <Detail label="Camion" value={getTruck(selectedDetailItem)} />
                <Detail label="Metodo" value={getPaymentMethod(selectedDetailItem)} />
                <Detail label="Ruta" value={selectedDetailItem.Origen || selectedDetailItem.Destino ? `${selectedDetailItem.Origen || "Origen"} -> ${selectedDetailItem.Destino || "Destino"}` : ""} />
                <Detail label="Material" value={selectedDetailItem.Material} />
                <Detail label="Km" value={getKm(selectedDetailItem)} />
                <Detail label="Nota" value={selectedDetailItem.Notas || selectedDetailItem.Observaciones} />
              </dl>
              <EvidenceUpload item={selectedDetailItem} isUploading={isUploadingEvidence} onUpload={handleUpdateEvidenceForDetail} />
            </div>
            <div className="border-t border-[var(--bravo-border)] p-4">
              <button className="bravo-secondary-button w-full" onClick={() => setSelectedDetailItem(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityList({ items, onSelect, empty }: { items: any[]; onSelect: (item: any) => void; empty: string }) {
  if (items.length === 0) {
    return <div className="bravo-empty compact">{empty}</div>;
  }

  return (
    <div className="bravo-list">
      {items.map((item, index) => {
        const status = getStatus(item);
        return (
          <button key={`${item.ID_gasto || item.ID_pago || item.ID_viaje || index}`} className="bravo-list-row" onClick={() => onSelect(item)}>
            <span className={`bravo-list-icon ${item._type}`}>{recordIcon(item._type, "h-4 w-4")}</span>
            <span className="min-w-0 flex-1 text-left">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{activityTitle(item)}</span>
                <span className={`bravo-status-dot ${status === "pendiente_sync" ? "pending" : "synced"}`} />
              </span>
              <span className="mt-1 block truncate text-xs text-[var(--bravo-muted)]">{recordLabel(item._type)} - {activityMeta(item)}</span>
            </span>
            <span className="text-right">
              <span className="block text-sm font-semibold tabular-nums">${money(activityAmount(item))}</span>
              <span className={`bravo-status ${status === "pendiente_sync" ? "pending" : "synced"}`}>{status === "pendiente_sync" ? "Pendiente" : "OK"}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{String(value)}</dd>
    </div>
  );
}

function EvidenceUpload({
  item,
  isUploading,
  onUpload,
}: {
  item: any;
  isUploading: boolean;
  onUpload: (file: File, evidenceType?: "carga" | "descarga") => void;
}) {
  const slots = item._type === "viaje"
    ? [
        { label: "Evidencia carga", value: item.URL_evidencia_carga, type: "carga" as const },
        { label: "Evidencia descarga", value: item.URL_evidencia_descarga, type: "descarga" as const },
      ]
    : [{ label: "Evidencia", value: item.URL_evidencia_Drive, type: undefined }];

  return (
    <div className="mt-5 space-y-3">
      {slots.map((slot) => (
        <div key={slot.label} className="rounded-2xl border border-[var(--bravo-border)] p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-[var(--bravo-muted)]">{slot.label}</span>
            {slot.value && slot.value !== PENDING_DRIVE ? (
              <a className="text-xs font-semibold text-[var(--bravo-ink)]" href={slot.value} target="_blank" rel="noreferrer">
                Ver en Drive
              </a>
            ) : (
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-[var(--bravo-ink)]">
                {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                <span>Subir</span>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf"
                  disabled={isUploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onUpload(file, slot.type);
                  }}
                />
              </label>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
