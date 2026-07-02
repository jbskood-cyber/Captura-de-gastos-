import React, { useEffect, useMemo, useRef, useState } from "react";
import {
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
  Settings,
  Sparkles,
  Truck,
  Type,
  Wallet,
} from "lucide-react";
import AudioCapture from "./components/AudioCapture";
import PhotoCapture from "./components/PhotoCapture";
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
  approveRecordsInSheet,
} from "./services/googleWorkspace";
import { RecordType } from "./types";

type TabKey = "inicio" | "historial";
type InputType = "audio" | "foto" | "texto";
type SaveConfirmation = "synced" | "pending";
type RuntimeConfig = { authMode: "oauth" | "family" | string; familyMode: boolean; bridgeConfigured: boolean };
type HistoryFilter = "pendientes" | "aprobados" | "todos";

const APP_NAME = "Kargo";
const PENDING_DRIVE = "[PENDIENTE DE SUBIDA A DRIVE]";
const PENDING_APPROVAL = "pendiente_aprobacion";
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
      ["Categor\u00eda"]: "Casetas",
      Monto_MXN: 480,
      ["Cami\u00f3n"]: "Unidad 12",
      ["M\u00e9todo_pago"]: "Efectivo",
      Estado_validacion: PENDING_APPROVAL,
      Notas: "Vista previa local",
    },
    {
      _type: "pago",
      ID_pago: "PREVIEW-P-001",
      Fecha: fecha,
      Hora: hora,
      Cliente: "Cliente Bravo",
      Monto_MXN: 3500,
      ["M\u00e9todo_pago"]: "Transferencia",
      Estado_validacion: PENDING_APPROVAL,
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
      ["Cami\u00f3n"]: "Unidad 08",
      Precio_cobrado_MXN: 7200,
      Estado_validacion: PENDING_APPROVAL,
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
const fuzzyField = (item: any, patterns: string[]) => {
  const key = Object.keys(item || {}).find((candidate) => patterns.some((pattern) => candidate.toLowerCase().includes(pattern)));
  return key ? item[key] : "";
};
const getCategory = (item: any) => item["Categor\u00eda"] || item.Categoria || fuzzyField(item, ["categor"]);
const getPaymentMethod = (item: any) => item["M\u00e9todo_pago"] || item.Metodo_pago || fuzzyField(item, ["todo_pago", "metodo_pago"]);
const getTruck = (item: any) => item["Cami\u00f3n"] || item.Camion || fuzzyField(item, ["cami", "camion"]);
const getKm = (item: any) => item["Kil\u00f3metros"] || item.Kilometros || fuzzyField(item, ["kil", "km"]) || 0;
const recordId = (item: any) => item.ID_gasto || item.ID_pago || item.ID_viaje || "";
const statusLabel = (status: string) => {
  if (status === PENDING_APPROVAL) return "Pendiente de aprobaci\u00f3n";
  if (status === "aprobado" || status === "validado") return "Aprobado";
  if (status === "rechazado" || status === "descartado") return "Rechazado";
  if (status === "error_sync") return "Error de sincronizaci\u00f3n";
  if (status === "pendiente_sync") return "Pendiente de sincronizaci\u00f3n";
  return "Pendiente de aprobaci\u00f3n";
};
const makeId = (prefix: string) => `${prefix}-${Math.floor(10000 + Math.random() * 90000)}`;
const getOperatorName = () => localStorage.getItem("bravo_operator_name") || "";
const getDefaultTruck = () => localStorage.getItem("bravo_default_truck") || "";

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => window.clearTimeout(timeout) };
}

function normalizeGeminiData(result: any, fallbackType: RecordType, operatorName: string, defaultTruck: string, inputType: InputType) {
  const type = (result?.tipo_registro === "pago" || result?.tipo_registro === "viaje" || result?.tipo_registro === "gasto"
    ? result.tipo_registro
    : fallbackType) as RecordType;
  const data = result?.datos || {};
  const now = new Date();
  const base: any = {
    Fecha: now.toISOString().split("T")[0],
    Hora: now.toTimeString().split(" ")[0],
    Registrado_por: operatorName,
    Tipo_entrada: inputType,
    Estado_validacion: PENDING_APPROVAL,
    ["Estado_validaci\u00f3n"]: PENDING_APPROVAL,
    Confianza_IA: result?.confianza_ia || "media",
    Created_at: now.toISOString(),
    Updated_at: now.toISOString(),
  };

  if (type === "pago") {
    return {
      type,
      record: {
        ...base,
        ID_pago: makeId("P"),
        Cliente: data.cliente || data.Cliente || "",
        Monto_MXN: Number(data.monto_mxn || data.Monto_MXN || 0) || "",
        ["M\u00e9todo_pago"]: data.metodo_pago || data.Metodo_pago || data["M\u00e9todo_pago"] || "",
        Viaje_ID: data.viaje_id || data.Viaje_ID || "",
        Saldo_restante_MXN: Number(data.saldo_restante_mxn || data.Saldo_restante_MXN || 0) || "",
        Estado_pago: data.estado_pago || data.Estado_pago || "",
        Notas: data.notas || data.Notas || "",
      },
    };
  }

  if (type === "viaje") {
    return {
      type,
      record: {
        ...base,
        ID_viaje: makeId("V"),
        Cliente: data.cliente || data.Cliente || "",
        Origen: data.origen || data.Origen || "",
        Destino: data.destino || data.Destino || "",
        Material: data.material || data.Material || "",
        Metros_cubicos: Number(data.metros_cubicos || data.Metros_cubicos || 0) || "",
        ["Kil\u00f3metros"]: Number(data.kilometros || data.Kilometros || data["Kil\u00f3metros"] || 0) || "",
        ["Cami\u00f3n"]: data.camion || data.unidad || data.Camion || data["Cami\u00f3n"] || defaultTruck || "",
        Chofer: data.chofer || data.Chofer || "",
        Precio_cobrado_MXN: Number(data.precio_cobrado_mxn || data.Precio_cobrado_MXN || 0) || "",
        Costo_estimado_MXN: Number(data.costo_estimado_mxn || data.Costo_estimado_MXN || 0) || "",
        Observaciones: data.observaciones || data.notas || data.Observaciones || data.Notas || "",
      },
    };
  }

  return {
    type,
    record: {
      ...base,
      ID_gasto: makeId("G"),
      ["Categor\u00eda"]: data.categoria || data.Categoria || data["Categor\u00eda"] || "",
      ["Subcategor\u00eda"]: data.subcategoria || data.Subcategoria || data["Subcategor\u00eda"] || "",
      Monto_MXN: Number(data.monto_mxn || data.Monto_MXN || 0) || "",
      ["M\u00e9todo_pago"]: data.metodo_pago || data.Metodo_pago || data["M\u00e9todo_pago"] || "",
      ["Cami\u00f3n"]: data.camion || data.unidad || data.Camion || data["Cami\u00f3n"] || defaultTruck || "",
      Chofer: data.chofer || data.Chofer || "",
      Cliente: data.cliente || data.Cliente || "",
      Proveedor: data.proveedor || data.Proveedor || "",
      Notas: data.notas || data.Notas || "",
    },
  };
}

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
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>({ authMode: "oauth", familyMode: false, bridgeConfigured: false });
  const [familyCode, setFamilyCode] = useState("");
  const [familyVerified, setFamilyVerified] = useState(() => localStorage.getItem("bravo_family_verified") === "1");
  const [operatorName, setOperatorName] = useState(getOperatorName());
  const [defaultTruck, setDefaultTruck] = useState(getDefaultTruck());
  const [profileDraft, setProfileDraft] = useState({ operatorName: getOperatorName(), defaultTruck: getDefaultTruck() });
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState("");
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("pendientes");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("reset") === "1") {
      [
        "bravo_operator_name",
        "bravo_default_truck",
        "bravo_family_verified",
        "bravo_activities",
        "bravo_sync_queue",
      ].forEach((key) => localStorage.removeItem(key));
      window.history.replaceState({}, "", window.location.pathname);
      window.location.reload();
    }
  }, []);

  useEffect(() => {
    fetch("/api/runtime-config")
      .then((res) => res.json())
      .then((config) => setRuntimeConfig(config))
      .catch(() => setRuntimeConfig({ authMode: "oauth", familyMode: false, bridgeConfigured: false }));
  }, []);

  useEffect(() => {
    if (isPreviewMode) {
      setUser(previewUser);
      setToken(null);
      setNeedsAuth(false);
      return () => undefined;
    }

    if (runtimeConfig.familyMode) {
      setUser({ email: operatorName || "familia@kargo.local" });
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
  }, [operatorName, runtimeConfig.familyMode]);

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
    if (token || runtimeConfig.bridgeConfigured) loadDropdownData();
  }, [token, runtimeConfig.bridgeConfigured]);

  const saveActivitiesToLocal = (activities: any[]) => {
    setRecentActivities(activities);
    localStorage.setItem("bravo_activities", JSON.stringify(activities));
  };

  const saveQueueToLocal = (queue: any[]) => {
    setPendingSyncQueue(queue);
    localStorage.setItem("bravo_sync_queue", JSON.stringify(queue));
  };

  const loadDropdownData = async () => {
    if (!token && !runtimeConfig.bridgeConfigured) return;
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
    if (runtimeConfig.familyMode || isPreviewMode) {
      setShowSettings(true);
      return;
    }
    await logout();
    setUser(null);
    setToken(null);
    setNeedsAuth(true);
  };

  const verifyFamilyCode = async () => {
    try {
      const response = await fetch("/api/family/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: familyCode }),
      });
      if (!response.ok) throw new Error("Codigo incorrecto");
      localStorage.setItem("bravo_family_verified", "1");
      setFamilyVerified(true);
      setToast("Acceso familiar activado.");
    } catch (err: any) {
      setToast(err.message || "No pude validar el codigo.");
    }
  };

  const saveProfile = () => {
    const name = profileDraft.operatorName.trim();
    if (!name) {
      setToast("Escribe el nombre del operador.");
      return;
    }
    localStorage.setItem("bravo_operator_name", name);
    localStorage.setItem("bravo_default_truck", profileDraft.defaultTruck);
    setOperatorName(name);
    setDefaultTruck(profileDraft.defaultTruck);
    setUser((current: any) => current || { email: "familia@kargo.local" });
    setShowSettings(false);
    setToast("Perfil guardado.");
  };

  const resetLocalAccess = () => {
    ["bravo_operator_name", "bravo_default_truck", "bravo_family_verified"].forEach((key) => localStorage.removeItem(key));
    setOperatorName("");
    setDefaultTruck("");
    setProfileDraft({ operatorName: "", defaultTruck: "" });
    setFamilyVerified(false);
    setShowSettings(false);
    setToast("Acceso reiniciado.");
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
      type: "auto",
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

    const timeout = withTimeout(25000);
    try {
      const response = await fetch("/api/process-input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: timeout.signal,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errObj = await response.json();
        throw new Error(errObj.error || "Fallo al procesar con Gemini");
      }

      const result = await response.json();
      const normalized = normalizeGeminiData(result, "gasto", operatorName || user?.email || "Operador", defaultTruck, effectiveInputType);
      await handleSaveRecord(normalized.record, {
        type: normalized.type,
        inputType: effectiveInputType,
        media: effectiveMedia,
        mimeType: effectiveMimeType,
      });
    } catch (err: any) {
      console.error("Gemini Extraction Error:", err);
      const manual = normalizeGeminiData(
        {
          tipo_registro: "gasto",
          confianza_ia: "baja",
          datos: { notas: effectiveText || "Captura manual pendiente" },
        },
        "gasto",
        operatorName || user?.email || "Operador",
        defaultTruck,
        effectiveInputType
      );
      manual.record.Notas = effectiveText || "No pude procesarlo con IA. Guarde una captura manual pendiente.";
      setToast("No pude procesarlo con IA. Guarde una captura manual pendiente.");
      await handleSaveRecord(manual.record, {
        type: manual.type,
        inputType: effectiveInputType,
        media: effectiveMedia,
        mimeType: effectiveMimeType,
      });
    } finally {
      timeout.clear();
      setIsProcessing(false);
    }
  };

  const attachPendingDrivePlaceholder = (record: any, recordType: RecordType | null, mediaInputType = inputType, media = capturedMedia) => {
    if (mediaInputType !== "foto" || !media) return;
    if (recordType === "viaje") {
      record.URL_evidencia_carga = PENDING_DRIVE;
      record.URL_evidencia_descarga = PENDING_DRIVE;
      return;
    }
    record.URL_evidencia_Drive = PENDING_DRIVE;
  };

  const handleSaveRecord = async (
    finalizedRecord: any,
    options?: { type?: RecordType | null; inputType?: InputType; media?: string | null; mimeType?: string }
  ) => {
    setIsProcessing(true);
    setNetworkError(null);

    const recordType = options?.type || "gasto";
    const mediaInputType = options?.inputType || inputType;
    const media = options?.media ?? capturedMedia;
    const mimeType = options?.mimeType || mediaMimeType;
    setStatus(finalizedRecord, PENDING_APPROVAL);
    const isOnline = navigator.onLine && (token || runtimeConfig.bridgeConfigured) && !isPreviewMode;
    let confirmation: SaveConfirmation = "synced";
    if (isOnline) {
      try {
        if (mediaInputType === "foto" && media) {
          const res = await fetch(media);
          const blob = await res.blob();
          const fileName = `${(recordType || "evidencia").toUpperCase()}_${Date.now()}.jpg`;
          const driveLink = await uploadFileToDrive(token, blob, fileName, mimeType);
          if (recordType === "viaje") {
            finalizedRecord.URL_evidencia_carga = driveLink;
            finalizedRecord.URL_evidencia_descarga = driveLink;
          } else {
            finalizedRecord.URL_evidencia_Drive = driveLink;
          }
        }

        if (recordType === "gasto") await saveGastoToSheet(token, finalizedRecord);
        if (recordType === "pago") await savePagoToSheet(token, finalizedRecord);
        if (recordType === "viaje") await saveViajeToSheet(token, finalizedRecord);

        setLastSyncedAt(new Date().toISOString());
      } catch (err) {
        console.error("Fallo guardado online (Sheets/Drive):", err);
        attachPendingDrivePlaceholder(finalizedRecord, recordType, mediaInputType, media);
        setNetworkError("Guardado localmente. Se sincronizara despues.");
        confirmation = "pending";
        saveQueueToLocal([
          ...pendingSyncQueue,
          { record: finalizedRecord, type: recordType, localMediaData: media, localMediaMime: mimeType, action: "save" },
        ]);
      }
    } else {
      attachPendingDrivePlaceholder(finalizedRecord, recordType, mediaInputType, media);
      setNetworkError("Guardado localmente. Se sincronizara despues.");
      confirmation = "pending";
      saveQueueToLocal([
        ...pendingSyncQueue,
        { record: finalizedRecord, type: recordType, localMediaData: media, localMediaMime: mimeType, action: "save" },
      ]);
    }

    saveActivitiesToLocal([{ ...finalizedRecord, _type: recordType }, ...recentActivities]);
    setInputText("");
    setCapturedMedia(null);
    setMediaMimeType("");
    setIsProcessing(false);
    setSaveConfirmation(confirmation);
    setToast(confirmation === "pending" ? "Registro guardado localmente." : "Registro guardado como pendiente.");
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
      setToast("Error al cargar evidencia: " + err.message);
    } finally {
      setIsUploadingEvidence(false);
    }
  };

  const handleSyncPendingQueue = async () => {
    if ((!token && !runtimeConfig.bridgeConfigured) || pendingSyncQueue.length === 0) return;
    setIsSyncing(true);
    setNetworkError(null);

    const remainingQueue: any[] = [];
    const updatedActivities = [...recentActivities];

    for (const item of pendingSyncQueue) {
      try {
        if (item.action === "approve") {
          await approveRecordsInSheet(token, item.records, item.approvedBy, item.status || "aprobado", item.notes || "");
          continue;
        }

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
        if (activityIndex > -1) updatedActivities[activityIndex] = { ...item.record, _type: item.type };
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
      setNetworkError("Sincronizacion parcial");
    }
  };

  const applyApprovalLocally = (ids: string[], status: "aprobado" | "rechazado") => {
    const now = new Date();
    const fecha = now.toISOString().split("T")[0];
    const hora = now.toTimeString().split(" ")[0];
    const updated = recentActivities.map((item) => {
      if (!ids.includes(recordId(item))) return item;
      return {
        ...item,
        Estado_validacion: status,
        ["Estado_validaci\u00f3n"]: status,
        Aprobado_por: operatorName || user?.email || "",
        Fecha_aprobacion: fecha,
        Hora_aprobacion: hora,
      };
    });
    saveActivitiesToLocal(updated);
    if (selectedDetailItem && ids.includes(recordId(selectedDetailItem))) {
      setSelectedDetailItem(updated.find((item) => recordId(item) === recordId(selectedDetailItem)) || null);
    }
  };

  const approveRecords = async (items: any[], status: "aprobado" | "rechazado" = "aprobado") => {
    const records = items
      .map((item) => ({ id: recordId(item), type: item._type }))
      .filter((item) => item.id && item.type);
    if (records.length === 0) return;

    const ids = records.map((item) => item.id);
    applyApprovalLocally(ids, status);
    setSelectedIds([]);
    setSelectionMode(false);
    setToast(status === "aprobado" ? "Registro aprobado." : "Registro rechazado.");

    if (isPreviewMode) return;

    if (!token && !runtimeConfig.bridgeConfigured) {
      saveQueueToLocal([
        ...pendingSyncQueue,
        { action: "approve", records, approvedBy: operatorName || user?.email || "", status },
      ]);
      return;
    }

    try {
      await approveRecordsInSheet(token, records, operatorName || user?.email || "", status);
    } catch (err) {
      console.error("Approval sync failed:", err);
      saveQueueToLocal([
        ...pendingSyncQueue,
        { action: "approve", records, approvedBy: operatorName || user?.email || "", status },
      ]);
      setNetworkError("Aprobacion guardada localmente. Se sincronizara despues.");
    }
  };

  const filteredActivities = useMemo(
    () =>
      recentActivities.filter((item) => {
        if (!isThisWeek(item)) return false;
        const status = getStatus(item) || PENDING_APPROVAL;
        if (historyFilter === "pendientes" && status !== PENDING_APPROVAL && status !== "pendiente_sync") return false;
        if (historyFilter === "aprobados" && status !== "aprobado" && status !== "validado") return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return [item.Notas, item.Observaciones, item.Cliente, getTruck(item), item.Chofer, getCategory(item), item.Material, item.Origen, item.Destino]
          .filter(Boolean)
          .some((value) => text(value).toLowerCase().includes(q));
      }),
    [historyFilter, recentActivities, searchQuery]
  );

  if (runtimeConfig.familyMode && !familyVerified && !isPreviewMode) {
    return (
      <Shell>
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
          <div className="mb-8">
            <div className="mb-6 grid h-12 w-12 place-items-center rounded-2xl border border-[var(--bravo-border)] bg-[var(--bravo-surface)]">
              <Truck className="h-5 w-5 text-[var(--bravo-muted)]" />
            </div>
            <h1 className="text-[32px] font-semibold">{APP_NAME}</h1>
            <p className="mt-3 text-[15px] leading-6 text-[var(--bravo-muted)]">Ingresa el codigo familiar para activar este dispositivo.</p>
          </div>
          <div className="space-y-4">
            <input
              className="bravo-field"
              value={familyCode}
              onChange={(event) => setFamilyCode(event.target.value)}
              placeholder="Codigo familiar"
              inputMode="numeric"
            />
            <button className="bravo-primary-button" onClick={verifyFamilyCode} disabled={!familyCode.trim()}>
              Entrar
            </button>
            {toast && <KargoToast message={toast} onClose={() => setToast("")} />}
          </div>
        </main>
      </Shell>
    );
  }

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

  if (!operatorName && !isPreviewMode) {
    return (
      <Shell>
        <main className="flex min-h-screen items-center px-5 py-10">
          <ProfilePanel
            camiones={camionesList}
            draft={profileDraft}
            setDraft={setProfileDraft}
            onSave={saveProfile}
            title="Perfil familiar"
            subtitle="Configura el operador de este dispositivo."
          />
        </main>
        {toast && <KargoToast message={toast} onClose={() => setToast("")} />}
      </Shell>
    );
  }

  const navItems: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    { key: "inicio", label: "Captura", icon: <Sparkles className="h-5 w-5" /> },
    { key: "historial", label: "Historial", icon: <Clock3 className="h-5 w-5" /> },
  ];

  return (
    <div className="min-h-screen bg-[var(--bravo-bg)] text-[var(--bravo-ink)]">
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
            <button className="bravo-icon-button" onClick={runtimeConfig.familyMode || isPreviewMode ? () => setShowSettings(true) : handleLogout} aria-label="Configuracion">
              {runtimeConfig.familyMode || isPreviewMode ? <Settings className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
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
                <p>{saveConfirmation === "synced" ? "Registro guardado como pendiente" : "Guardado localmente. Se sincronizara despues."}</p>
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
                    ref={textAreaRef}
                    value={inputText}
                    onChange={(event) => {
                      setInputText(event.target.value);
                      setInputType("texto");
                    }}
                    onFocus={() => setIsKeyboardOpen(true)}
                    onBlur={() => setIsKeyboardOpen(false)}
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
                    <button
                      type="button"
                      id="input-method-text"
                      className={`bravo-write-button ${inputType === "texto" ? "is-active" : ""}`}
                      onClick={() => {
                        setInputType("texto");
                        window.setTimeout(() => {
                          textAreaRef.current?.focus();
                          textAreaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }, 120);
                      }}
                    >
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
                        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        <span>{isProcessing ? "Procesando..." : "Registrar"}</span>
                      </button>
                    )}
                  </div>
                  {isProcessing && <p className="text-sm text-[var(--bravo-muted)]">Gemini esta preparando el registro...</p>}
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

          {activeTab === "historial" && (
            <section className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-[30px] font-semibold leading-tight">Historial</h1>
                <button className="bravo-week-chip" onClick={() => setSelectionMode((value) => !value)}>
                  {selectionMode ? "Cancelar" : "Seleccionar"}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ["pendientes", "Pendientes"],
                  ["aprobados", "Aprobados"],
                  ["todos", "Todos"],
                ] as Array<[HistoryFilter, string]>).map(([key, label]) => (
                  <button
                    key={key}
                    className={`bravo-filter-chip ${historyFilter === key ? "is-active" : ""}`}
                    onClick={() => setHistoryFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {selectionMode && selectedIds.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    className="bravo-primary-button"
                    onClick={() => approveRecords(recentActivities.filter((item) => selectedIds.includes(recordId(item))), "aprobado")}
                  >
                    Aprobar seleccionados
                  </button>
                  <button
                    className="bravo-secondary-button"
                    onClick={() => approveRecords(recentActivities.filter((item) => selectedIds.includes(recordId(item))), "rechazado")}
                  >
                    Rechazar
                  </button>
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--bravo-muted)]" />
                <input className="bravo-search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar" />
              </div>
              <ActivityList
                items={filteredActivities}
                onSelect={setSelectedDetailItem}
                empty="No hay registros esta semana."
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onToggleSelect={(id) =>
                  setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))
                }
              />
            </section>
          )}
        </main>

        <nav className={`fixed bottom-0 left-0 right-0 z-40 mx-auto max-w-md border-t border-[var(--bravo-border)] bg-[var(--bravo-bg)]/88 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl transition-transform ${isKeyboardOpen ? "translate-y-full" : "translate-y-0"}`}>
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
              <span className={`bravo-status ${getStatus(selectedDetailItem) === "aprobado" || getStatus(selectedDetailItem) === "validado" ? "synced" : "pending"}`}>
                {statusLabel(getStatus(selectedDetailItem))}
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
              <div className="grid grid-cols-2 gap-3">
                <button className="bravo-secondary-button" onClick={() => setSelectedDetailItem(null)}>
                  Cerrar
                </button>
                <button className="bravo-primary-button" onClick={() => approveRecords([selectedDetailItem], "aprobado")}>
                  Aprobar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <KargoBottomSheet onClose={() => setShowSettings(false)}>
          <ProfilePanel
            camiones={camionesList}
            draft={profileDraft}
            setDraft={setProfileDraft}
            onSave={saveProfile}
            onReset={resetLocalAccess}
            title="Configuracion"
            subtitle="Ajusta el operador y la unidad principal."
          />
        </KargoBottomSheet>
      )}

      {toast && <KargoToast message={toast} onClose={() => setToast("")} />}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[var(--bravo-bg)] text-[var(--bravo-ink)]">{children}</div>;
}

function KargoBottomSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-t-[28px] border border-[var(--bravo-border)] bg-[var(--bravo-surface)] p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mb-4 flex justify-end">
          <button className="bravo-secondary-button min-h-10 px-4" onClick={onClose}>
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ProfilePanel({
  camiones,
  draft,
  setDraft,
  onSave,
  onReset,
  title,
  subtitle,
}: {
  camiones: string[];
  draft: { operatorName: string; defaultTruck: string };
  setDraft: (value: { operatorName: string; defaultTruck: string }) => void;
  onSave: () => void;
  onReset?: () => void;
  title: string;
  subtitle: string;
}) {
  const options = ["", ...camiones];
  return (
    <div className="mx-auto w-full max-w-md px-1 py-2">
      <section className="space-y-6">
        <div>
          <h1 className="text-[30px] font-semibold leading-tight">{title}</h1>
          <p className="mt-2 text-[15px] text-[var(--bravo-muted)]">{subtitle}</p>
        </div>
        <div className="bravo-form-panel space-y-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--bravo-muted)]">Operador</span>
            <input
              className="bravo-field"
              value={draft.operatorName}
              onChange={(event) => setDraft({ ...draft, operatorName: event.target.value })}
              placeholder="Nombre del operador"
            />
          </label>
          <div>
            <span className="mb-2 block text-xs font-medium text-[var(--bravo-muted)]">Unidad principal opcional</span>
            <div className="grid gap-2">
              {options.map((option) => (
                <button
                  key={option || "none"}
                  type="button"
                  className={`bravo-option-row ${draft.defaultTruck === option ? "is-active" : ""}`}
                  onClick={() => setDraft({ ...draft, defaultTruck: option })}
                >
                  {option || "Ninguna unidad principal"}
                </button>
              ))}
              {camiones.length === 0 && <p className="text-sm text-[var(--bravo-muted)]">Las unidades se cargaran cuando haya conexion.</p>}
            </div>
          </div>
          <button className="bravo-primary-button" onClick={onSave}>
            Guardar perfil
          </button>
          {onReset && (
            <button className="bravo-secondary-button" onClick={onReset}>
              Borrar perfil / reiniciar acceso
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function KargoToast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timeout = window.setTimeout(onClose, 3200);
    return () => window.clearTimeout(timeout);
  }, [onClose]);
  return (
    <div className="fixed bottom-[calc(88px+env(safe-area-inset-bottom))] left-1/2 z-[60] w-[min(360px,calc(100vw-32px))] -translate-x-1/2 rounded-2xl border border-[var(--bravo-border)] bg-[var(--bravo-surface)] px-4 py-3 text-sm text-[var(--bravo-ink)] shadow-2xl">
      {message}
    </div>
  );
}

function ActivityList({
  items,
  onSelect,
  empty,
  selectionMode = false,
  selectedIds = [],
  onToggleSelect,
}: {
  items: any[];
  onSelect: (item: any) => void;
  empty: string;
  selectionMode?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
}) {
  if (items.length === 0) {
    return <div className="bravo-empty compact">{empty}</div>;
  }

  return (
    <div className="bravo-list">
      {items.map((item, index) => {
        const status = getStatus(item);
        const id = recordId(item) || String(index);
        const selected = selectedIds.includes(id);
        return (
          <button
            key={`${id || index}`}
            className="bravo-list-row"
            onClick={() => (selectionMode && onToggleSelect ? onToggleSelect(id) : onSelect(item))}
          >
            {selectionMode && (
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${selected ? "bg-[var(--bravo-ink)] text-[var(--bravo-bg)]" : "border-[var(--bravo-border)]"}`}>
                {selected ? "OK" : ""}
              </span>
            )}
            <span className={`bravo-list-icon ${item._type}`}>{recordIcon(item._type, "h-4 w-4")}</span>
            <span className="min-w-0 flex-1 text-left">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{activityTitle(item)}</span>
                <span className={`bravo-status-dot ${status === "aprobado" || status === "validado" ? "synced" : "pending"}`} />
              </span>
              <span className="mt-1 block truncate text-xs text-[var(--bravo-muted)]">{recordLabel(item._type)} - {activityMeta(item)}</span>
            </span>
            <span className="text-right">
              <span className="block text-sm font-semibold tabular-nums">${money(activityAmount(item))}</span>
              <span className={`bravo-status ${status === "aprobado" || status === "validado" ? "synced" : "pending"}`}>{statusLabel(status)}</span>
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
