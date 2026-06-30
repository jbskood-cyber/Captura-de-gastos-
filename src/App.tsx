import React, { useState, useEffect } from "react";
import {
  googleSignIn,
  initAuth,
  logout,
  getAccessToken,
} from "./services/firebaseAuth";
import {
  saveGastoToSheet,
  savePagoToSheet,
  saveViajeToSheet,
  uploadFileToDrive,
  loadCamiones,
  loadClientes,
  writeAuditoria,
  loadSheetsActivities,
  updateEvidenceInSheet,
} from "./services/googleWorkspace";
import { Gasto, Pago, Viaje, ValidationState, IAConfidence, RecordType } from "./types";
import AudioCapture from "./components/AudioCapture";
import PhotoCapture from "./components/PhotoCapture";
import RecordForm from "./components/RecordForm";
import SyncNotification from "./components/SyncNotification";
import {
  Mic,
  Camera,
  FileText,
  Type,
  Plus,
  Clock,
  Home,
  LogOut,
  Wallet,
  Landmark,
  Truck,
  Sparkles,
  Search,
  Filter,
  Check,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Database,
  UserCheck,
  Sun,
  Moon,
  CreditCard,
  Receipt,
  Upload,
  Loader2,
} from "lucide-react";

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem("bravo_dark_mode") === "true";
  });

  useEffect(() => {
    localStorage.setItem("bravo_dark_mode", String(isDarkMode));
  }, [isDarkMode]);

  // Layout Navigation
  const [activeTab, setActiveTab] = useState<"inicio" | "captura" | "historial">("inicio");
  const [inputType, setInputType] = useState<"audio" | "foto" | "texto">("texto");

  // Input states
  const [inputText, setInputText] = useState("");
  const [capturedMedia, setCapturedMedia] = useState<string | null>(null);
  const [mediaMimeType, setMediaMimeType] = useState("");

  // Processing & Review States
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeRecord, setActiveRecord] = useState<any>(null);
  const [activeRecordType, setActiveRecordType] = useState<RecordType | null>(null);

  // Cached dropdown lists from Sheets
  const [camionesList, setCamionesList] = useState<string[]>([]);
  const [clientesList, setClientesList] = useState<string[]>([]);

  // Local persistence and Sync Queue
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [pendingSyncQueue, setPendingSyncQueue] = useState<any[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Search & Filter (History Tab)
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"todos" | "gasto" | "pago" | "viaje">("todos");
  const [filterStatus, setFilterStatus] = useState<"todos" | "pendiente_sync" | "validado">("todos");

  // Selected item detail modal (History Tab)
  const [selectedDetailItem, setSelectedDetailItem] = useState<any | null>(null);
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);

  // Initialize Auth on startup
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, currentToken) => {
        setUser(currentUser);
        setToken(currentToken);
        setNeedsAuth(false);
      },
      () => {
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // Load dropdown lists and activity logs from localStorage and Sheets
  useEffect(() => {
    // 1. Load from localStorage fallback
    const savedActivities = localStorage.getItem("bravo_activities");
    const savedQueue = localStorage.getItem("bravo_sync_queue");
    const savedCamiones = localStorage.getItem("bravo_camiones");
    const savedClientes = localStorage.getItem("bravo_clientes");

    if (savedActivities) setRecentActivities(JSON.parse(savedActivities));
    if (savedQueue) setPendingSyncQueue(JSON.parse(savedQueue));
    if (savedCamiones) setCamionesList(JSON.parse(savedCamiones));
    if (savedClientes) setClientesList(JSON.parse(savedClientes));

    // 2. Fetch fresh lists if online and token is available
    if (token) {
      loadDropdownData();
    }
  }, [token]);

  // Sync state helpers to update local storage on modification
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
      const freshCamiones = await loadCamiones(token);
      const freshClientes = await loadClientes(token);

      setCamionesList(freshCamiones);
      setClientesList(freshClientes);

      localStorage.setItem("bravo_camiones", JSON.stringify(freshCamiones));
      localStorage.setItem("bravo_clientes", JSON.stringify(freshClientes));

      // Fetch actual activities from Sheets
      const freshActivities = await loadSheetsActivities(token);
      if (freshActivities && freshActivities.length > 0) {
        saveActivitiesToLocal(freshActivities);
      }
    } catch (err) {
      console.warn("Could not load fresh data from Google Sheets. Using cached versions.", err);
    }
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const res = await googleSignIn();
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
    if (confirm("¿Estás seguro de que quieres cerrar sesión?")) {
      await logout();
      setUser(null);
      setToken(null);
      setNeedsAuth(true);
    }
  };

  // Convert image/audio or text input using server-side Gemini API
  const handleProcessInput = async () => {
    setIsProcessing(true);
    setNetworkError(null);

    const payload: any = {
      text: inputText,
      type: activeRecordType || "auto",
      camiones: camionesList,
      clientes: clientesList,
    };

    if (inputType === "foto" && capturedMedia) {
      payload.image = capturedMedia;
      payload.mimeType = mediaMimeType;
    } else if (inputType === "audio" && capturedMedia) {
      payload.audio = capturedMedia;
      payload.mimeType = mediaMimeType;
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
      const extractedData = result.datos || {};

      setActiveRecord(extractedData);
      setActiveRecordType(result.tipo_registro);
      setActiveTab("captura"); // Navigate to review screen
    } catch (err: any) {
      console.error("Gemini Extraction Error:", err);
      alert(`Error al interpretar: ${err.message}. Intentaremos una captura manual.`);
      // Fallback: load empty form for manual completion
      handleQuickAction(activeRecordType || "gasto");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickAction = (type: RecordType) => {
    setActiveRecordType(type);
    setActiveRecord({});
    setActiveTab("captura");
  };

  // Upload photo to Google Drive if present, then save row to Google Sheets
  const handleSaveRecord = async (finalizedRecord: any) => {
    setIsProcessing(true);
    setNetworkError(null);

    let driveLink = "";

    // 1. Upload photo to Google Drive if captured during "foto" mode
    if (inputType === "foto" && capturedMedia) {
      try {
        const res = await fetch(capturedMedia);
        const blob = await res.blob();
        const fileName = `${activeRecordType?.toUpperCase() || "EVIDENCIA"}_${Date.now()}.jpg`;

        if (token && navigator.onLine) {
          driveLink = await uploadFileToDrive(token, blob, fileName, mediaMimeType);
        } else {
          driveLink = "[PAGO PENDIENTE DE SUBIDA A DRIVE]";
        }
      } catch (err) {
        console.error("Error uploading evidence image to Google Drive:", err);
      }
    }

    // Embed links
    if (driveLink) {
      if (activeRecordType === "gasto") finalizedRecord.URL_evidencia_Drive = driveLink;
      else if (activeRecordType === "pago") finalizedRecord.URL_evidencia_Drive = driveLink;
      else if (activeRecordType === "viaje") {
        finalizedRecord.URL_evidencia_carga = driveLink;
        finalizedRecord.URL_evidencia_descarga = driveLink;
      }
    }

    const isOnline = navigator.onLine && token;

    if (isOnline) {
      // 2. Online: Try to append directly to Google Sheets
      try {
        if (activeRecordType === "gasto") {
          await saveGastoToSheet(token!, finalizedRecord);
        } else if (activeRecordType === "pago") {
          await savePagoToSheet(token!, finalizedRecord);
        } else if (activeRecordType === "viaje") {
          await saveViajeToSheet(token!, finalizedRecord);
        }

        // Successfully saved
        finalizedRecord.Estado_validación = "validado";
        setLastSyncedAt(new Date().toISOString());
      } catch (err: any) {
        console.error("Fallo guardado en Sheet:", err);
        // Sync failure: fall back to offline queuing
        finalizedRecord.Estado_validación = "pendiente_sync";
        setNetworkError("Guardado local (Fallo de servidor Sheets)");
        const updatedQueue = [
          ...pendingSyncQueue,
          { record: finalizedRecord, type: activeRecordType },
        ];
        saveQueueToLocal(updatedQueue);
      }
    } else {
      // 3. Offline: Save to local pending sync queue
      finalizedRecord.Estado_validación = "pendiente_sync";
      const updatedQueue = [
        ...pendingSyncQueue,
        { record: finalizedRecord, type: activeRecordType },
      ];
      saveQueueToLocal(updatedQueue);
    }

    // Save to general list
    const updatedActivities = [
      { ...finalizedRecord, _type: activeRecordType },
      ...recentActivities,
    ];
    saveActivitiesToLocal(updatedActivities);

    // Reset input fields
    setInputText("");
    setCapturedMedia(null);
    setMediaMimeType("");
    setActiveRecord(null);
    setActiveRecordType(null);
    setIsProcessing(false);

    // Return to dashboard
    setActiveTab("inicio");
  };

  // Update evidence for an existing record from the detail modal
  const handleUpdateEvidenceForDetail = async (file: File, evidenceType?: "carga" | "descarga") => {
    if (!selectedDetailItem) {
      alert("No hay ningún registro seleccionado.");
      return;
    }
    if (!token) {
      alert("Debes iniciar sesión con Google para subir archivos a Drive.");
      return;
    }

    setIsUploadingEvidence(true);

    try {
      const id = selectedDetailItem.ID_gasto || selectedDetailItem.ID_pago || selectedDetailItem.ID_viaje;
      const recordType = selectedDetailItem._type;

      // 1. Upload to Google Drive using the proxy endpoint
      const driveUrl = await uploadFileToDrive(token, file, file.name, file.type);

      // 2. Save the URL in the corresponding sheet row
      await updateEvidenceInSheet(token, id, recordType, driveUrl, evidenceType);

      // 3. Update local state
      const updatedItem = { ...selectedDetailItem };
      if (recordType === "gasto") {
        updatedItem.URL_evidencia_Drive = driveUrl;
      } else if (recordType === "pago") {
        updatedItem.URL_evidencia_Drive = driveUrl;
      } else if (recordType === "viaje") {
        if (evidenceType === "carga") {
          updatedItem.URL_evidencia_carga = driveUrl;
        } else {
          updatedItem.URL_evidencia_descarga = driveUrl;
        }
      }

      setSelectedDetailItem(updatedItem);

      // 4. Update inside general activities list
      const updatedActivities = recentActivities.map((act) => {
        const actId = act.ID_gasto || act.ID_pago || act.ID_viaje;
        if (actId === id && act._type === recordType) {
          return updatedItem;
        }
        return act;
      });
      saveActivitiesToLocal(updatedActivities);

      alert("Evidencia cargada exitosamente a Google Drive y guardada en Google Sheets.");
    } catch (err: any) {
      console.error("Error actualizando evidencia de detalle:", err);
      alert("Error al cargar la evidencia: " + err.message);
    } finally {
      setIsUploadingEvidence(false);
    }
  };

  // Sequential synchronization of pending local entries
  const handleSyncPendingQueue = async () => {
    if (!token || pendingSyncQueue.length === 0) return;
    setIsSyncing(true);
    setNetworkError(null);

    const remainingQueue: any[] = [];
    const updatedActivities = [...recentActivities];

    for (const item of pendingSyncQueue) {
      try {
        // Upload any queued evidence if applicable
        if (item.record.URL_evidencia_Drive === "[PAGO PENDIENTE DE SUBIDA A DRIVE]" && capturedMedia) {
          const res = await fetch(capturedMedia);
          const blob = await res.blob();
          const fileName = `EVIDENCIA_SYNC_${Date.now()}.jpg`;
          const driveLink = await uploadFileToDrive(token, blob, fileName, mediaMimeType);
          item.record.URL_evidencia_Drive = driveLink;
        }

        // Append to specific Sheet tab
        if (item.type === "gasto") {
          await saveGastoToSheet(token, item.record);
        } else if (item.type === "pago") {
          await savePagoToSheet(token, item.record);
        } else if (item.type === "viaje") {
          await saveViajeToSheet(token, item.record);
        }

        // Update item in activities list
        const actIndex = updatedActivities.findIndex(
          (act) =>
            (act.ID_gasto && act.ID_gasto === item.record.ID_gasto) ||
            (act.ID_pago && act.ID_pago === item.record.ID_pago) ||
            (act.ID_viaje && act.ID_viaje === item.record.ID_viaje)
        );

        if (actIndex > -1) {
          updatedActivities[actIndex].Estado_validación = "validado";
        }
      } catch (err: any) {
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
      alert("¡Sincronización completada con éxito en Google Sheets!");
      // Refresh list of activities from Google Sheets
      loadDropdownData();
    } else {
      setNetworkError("Sincronización parcial (Revisa conexión)");
    }
  };

  const handleDiscardRecord = () => {
    if (confirm("¿Descartar este registro? No se guardará en Google Sheets.")) {
      setActiveRecord(null);
      setActiveRecordType(null);
      setActiveTab("inicio");
    }
  };

  // Search & Filter computation for the "Historial" tab
  const filteredActivities = recentActivities.filter((item) => {
    // 1. Filter by category type
    if (filterType !== "todos" && item._type !== filterType) return false;

    // 2. Filter by synchronization state
    if (filterStatus !== "todos") {
      if (filterStatus === "pendiente_sync" && item.Estado_validación !== "pendiente_sync") return false;
      if (filterStatus === "validado" && item.Estado_validación !== "validado") return false;
    }

    // 3. Search query
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchNotes = (item.Notas || item.Observaciones || "").toLowerCase().includes(q);
      const matchClient = (item.Cliente || "").toLowerCase().includes(q);
      const matchTruck = (item.Camión || "").toLowerCase().includes(q);
      const matchDriver = (item.Chofer || "").toLowerCase().includes(q);
      const matchCat = (item.Categoría || "").toLowerCase().includes(q);
      return matchNotes || matchClient || matchTruck || matchDriver || matchCat;
    }

    return true;
  });

  // Render Login UI Screen
  if (needsAuth) {
    const isIframe = typeof window !== "undefined" && window.self !== window.top;

    return (
      <div id="login-container" className="min-h-screen bg-slate-900 flex flex-col justify-between px-6 py-10 text-white font-sans max-w-md mx-auto relative overflow-hidden">
        {/* Aesthetic Glowing Circles */}
        <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full bg-blue-500/10 blur-3xl"></div>
        <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full bg-emerald-500/10 blur-3xl"></div>

        <div className="flex flex-col items-center mt-12 space-y-5 relative z-10">
          {/* Logo container */}
          <div className="w-20 h-20 bg-slate-800 rounded-3xl border border-slate-700/50 flex items-center justify-center shadow-2xl p-4">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="w-full h-full text-blue-400">
              <path fill="none" stroke="currentColor" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" d="M180 80h80l40 60v60H180z" />
              <rect x="0" y="20" width="160" height="180" rx="10" fill="none" stroke="currentColor" strokeWidth="24" />
              <circle cx="60" cy="230" r="30" fill="currentColor" />
              <circle cx="240" cy="230" r="30" fill="currentColor" />
            </svg>
          </div>

          <div className="text-center space-y-2">
            <span className="text-xs font-bold text-blue-400 uppercase tracking-widest bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
              Transporte Bravo
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight mt-2 text-slate-100">
              Captura Inteligente
            </h1>
            <p className="text-sm text-slate-400 max-w-xs mx-auto">
              Registra fletes, cobros y gastos del negocio familiar en menos de 30 segundos.
            </p>
          </div>
        </div>

        <div className="space-y-4 relative z-10 my-6">
          {isIframe && (
            <div className="bg-blue-950/40 border border-blue-500/20 rounded-2xl p-4 text-center space-y-2.5">
              <p className="text-xs text-blue-200 leading-relaxed">
                💡 <strong>¿Usando la vista previa?</strong> El inicio de sesión con Google requiere abrir la aplicación en una pestaña completa fuera de este recuadro.
              </p>
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 w-full text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 py-2.5 rounded-xl transition-all duration-150 shadow-md cursor-pointer"
              >
                <span>Abrir en pestaña nueva</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {loginError && (
            <div className="bg-rose-950/40 border border-rose-500/25 rounded-2xl p-4 text-left space-y-2">
              <div className="flex gap-2 items-start text-rose-300 font-semibold text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <span>Error de inicio de sesión</span>
              </div>
              <p className="text-[11px] text-rose-200/90 leading-relaxed">
                {loginError.includes("popup-closed-by-user")
                  ? "La ventana de Google se cerró. Esto ocurre si se bloquean las ventanas emergentes en tu navegador o debido al recuadro de previsualización. Abre la aplicación en una pestaña nueva o permite las ventanas emergentes."
                  : `Detalle: ${loginError}`}
              </p>
              {!isIframe && (
                <button
                  onClick={() => window.location.reload()}
                  className="text-[10px] font-bold text-rose-300 hover:underline cursor-pointer"
                >
                  Recargar aplicación ↻
                </button>
              )}
            </div>
          )}

          <div className="bg-slate-800/40 border border-slate-700/30 rounded-2xl p-4 text-center text-xs text-slate-400">
            🔒 Los datos se guardan de forma segura en las carpetas de Google Drive y Sheets de la empresa familiar.
          </div>

          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            id="google-signin-btn"
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-800 font-semibold py-3.5 px-6 rounded-2xl active:scale-98 transition-all duration-150 shadow-xl disabled:opacity-50"
          >
            {isLoggingIn ? (
              <div className="w-5 h-5 border-2 border-slate-800 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" width="100%" height="100%">
                <path fill="#EA4335" d="M12 5.04c1.7 0 3.23.58 4.43 1.73l3.32-3.32C17.75 1.58 15.08 1 12 1 7.24 1 3.2 3.73 1.25 7.69l3.96 3.07C6.15 7.42 8.83 5.04 12 5.04z" />
                <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.34H12v4.42h6.45c-.28 1.47-1.11 2.71-2.36 3.55l3.66 2.84c2.14-1.97 3.38-4.88 3.38-8.47z" />
                <path fill="#FBBC05" d="M5.21 14.38c-.24-.72-.38-1.49-.38-2.38s.14-1.66.38-2.38L1.25 6.55C.45 8.16 0 9.97 0 12s.45 3.84 1.25 5.45l3.96-3.07z" />
                <path fill="#34A853" d="M12 23c3.24 0 5.95-1.07 7.93-2.91l-3.66-2.84c-1.01.68-2.31 1.09-4.27 1.09-3.17 0-5.85-2.38-6.79-5.72l-3.96 3.07C3.2 20.27 7.24 23 12 23z" />
              </svg>
            )}
            <span>Conectar con Google</span>
          </button>
        </div>
      </div>
    );
  }

  // Active Loading Overlay
  const LoadingOverlay = () => (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex flex-col items-center justify-center z-50 text-white p-6">
      <div className="bg-slate-800 border border-slate-700 p-8 rounded-3xl flex flex-col items-center max-w-xs text-center space-y-4 shadow-2xl">
        <div className="relative">
          <div className="w-14 h-14 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
          <Sparkles className="w-6 h-6 text-blue-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <div>
          <h3 className="font-bold text-slate-100">Gemini está analizando</h3>
          <p className="text-xs text-slate-400 mt-1">
            Procesando entrada para estructurar {activeRecordType || "el registro"}...
          </p>
        </div>
      </div>
    </div>
  );

  const bgApp = isDarkMode ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900";
  const bgHeader = isDarkMode ? "bg-slate-950" : "bg-slate-50";
  const textPrimary = isDarkMode ? "text-slate-100" : "text-slate-900";
  const textSecondary = isDarkMode ? "text-slate-400" : "text-slate-500";
  const bgCard = isDarkMode ? "bg-slate-900 border border-slate-800 shadow-md text-slate-100" : "bg-white border border-slate-100 shadow-xs text-slate-800";
  const bgInput = isDarkMode ? "bg-slate-800 border-slate-700 text-slate-100 focus:bg-slate-750" : "bg-slate-50 border-slate-100 text-slate-900 focus:bg-white";
  const bgNav = isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100";
  const hoverBtn = isDarkMode ? "hover:bg-slate-800 hover:text-white" : "hover:bg-slate-50 hover:text-slate-800";

  return (
    <div id="main-app-container" className={`min-h-screen ${bgApp} font-sans max-w-md mx-auto flex flex-col justify-between relative shadow-2xl pb-16`}>
      {isProcessing && <LoadingOverlay />}

      {/* HEADER BAR */}
      <header className={`${bgHeader} sticky top-0 z-30 px-5 py-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className={`w-5 h-5 ${isDarkMode ? "text-white fill-white" : "text-slate-950 fill-slate-950"}`} />
            <span className={`text-sm font-bold tracking-tight ${isDarkMode ? "text-white" : "text-slate-950"}`}>
              Transporte Bravo
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`p-2 rounded-xl transition-all ${isDarkMode ? 'text-amber-400 hover:bg-slate-800' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              title={isDarkMode ? "Modo Claro" : "Modo Oscuro"}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={handleLogout}
              className={`p-2 rounded-xl transition-all ${isDarkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* CONTENT AREA */}
      <main className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
        {/* --- TAB: INICIO --- */}
        {activeTab === "inicio" && (
          <>
            {/* Title Block */}
            <div className="space-y-1">
              <h1 className={`text-3xl font-extrabold tracking-tight ${isDarkMode ? "text-white" : "text-[#0A1128]"}`}>
                Captura rápida
              </h1>
              <p className={`text-sm ${isDarkMode ? "text-slate-400" : "text-slate-400 font-medium"}`}>
                Registra en segundos.
              </p>
            </div>

            {/* Segmented control for input methods */}
            <div className={`${isDarkMode ? "bg-slate-900 border border-slate-800" : "bg-[#F1F3F5]"} p-1.5 rounded-[24px] grid grid-cols-3 gap-1`}>
              <button
                id="input-method-audio"
                onClick={() => { setInputType("audio"); setCapturedMedia(null); }}
                className={`py-3 rounded-[18px] text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  inputType === "audio" 
                    ? isDarkMode 
                      ? "bg-slate-800 text-white shadow-md" 
                      : "bg-white text-[#0A1128] shadow-[0_4px_12px_rgba(0,0,0,0.05)]" 
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Mic className={`w-4 h-4 ${inputType === "audio" ? "text-blue-600" : "text-slate-500"}`} />
                <span>Audio</span>
              </button>
              <button
                id="input-method-photo"
                onClick={() => { setInputType("foto"); setCapturedMedia(null); }}
                className={`py-3 rounded-[18px] text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  inputType === "foto" 
                    ? isDarkMode 
                      ? "bg-slate-800 text-white shadow-md" 
                      : "bg-white text-[#0A1128] shadow-[0_4px_12px_rgba(0,0,0,0.05)]" 
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Camera className={`w-4 h-4 ${inputType === "foto" ? "text-blue-600" : "text-slate-500"}`} />
                <span>Foto</span>
              </button>
              <button
                id="input-method-text"
                onClick={() => { setInputType("texto"); setCapturedMedia(null); }}
                className={`py-3 rounded-[18px] text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  inputType === "texto" 
                    ? isDarkMode 
                      ? "bg-slate-800 text-white shadow-md" 
                      : "bg-white text-[#0A1128] shadow-[0_4px_12px_rgba(0,0,0,0.05)]" 
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Type className={`w-4 h-4 ${inputType === "texto" ? "text-blue-600" : "text-slate-500"}`} />
                <span>Texto</span>
              </button>
            </div>

            {/* Active Input Method Card */}
            <div className="space-y-4">
              {inputType === "texto" && (
                <div id="text-capture-card" className={`${bgCard} rounded-2xl p-5 space-y-4`}>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Dicta o escribe qué ocurrió
                    </label>
                    <textarea
                      id="text-capture-input"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Ej: Gasté 850 de diésel para el rojo Freightliner..."
                      rows={3}
                      className={`w-full text-sm rounded-xl px-4 py-3 outline-hidden transition-all resize-none ${
                        isDarkMode
                          ? "bg-slate-800 border border-slate-700 text-slate-100 focus:bg-slate-750 focus:ring-1 focus:ring-blue-500"
                          : "bg-slate-50 border border-slate-100 text-slate-900 focus:bg-white focus:ring-1 focus:ring-blue-500"
                      }`}
                    ></textarea>
                  </div>
                  <button
                    onClick={handleProcessInput}
                    disabled={isProcessing || !inputText.trim()}
                    id="text-interpret-btn"
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white py-3 rounded-xl font-bold text-xs shadow-md shadow-blue-500/10 transition-all disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Interpretar con IA</span>
                  </button>
                </div>
              )}

              {inputType === "foto" && (
                <div className="space-y-4">
                  <PhotoCapture
                    onPhotoCaptured={(base64, mime) => {
                      setCapturedMedia(base64);
                      setMediaMimeType(mime);
                    }}
                    isProcessing={isProcessing}
                    isDarkMode={isDarkMode}
                  />
                  {capturedMedia && (
                    <button
                      onClick={handleProcessInput}
                      id="photo-interpret-btn"
                      disabled={isProcessing}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white py-3 rounded-xl font-bold text-xs shadow-md shadow-blue-500/10 transition-all"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Analizar Recibo con IA</span>
                    </button>
                  )}
                </div>
              )}

              {inputType === "audio" && (
                <div className="space-y-4">
                  <AudioCapture
                    onAudioCaptured={(base64, mime) => {
                      setCapturedMedia(base64);
                      setMediaMimeType(mime);
                    }}
                    isProcessing={isProcessing}
                    isDarkMode={isDarkMode}
                  />
                  {capturedMedia && (
                    <button
                      onClick={handleProcessInput}
                      id="audio-interpret-btn"
                      disabled={isProcessing}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white py-3 rounded-xl font-bold text-xs shadow-md shadow-blue-500/10 transition-all"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Escuchar e Interpretar con IA</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Quick Manual Entry buttons */}
            <div className="space-y-3 pt-2">
              <button
                id="action-gasto"
                onClick={() => handleQuickAction("gasto")}
                className={`w-full ${bgCard} p-5 rounded-[24px] flex items-center justify-between hover:shadow-md transition-all active:scale-[0.99] group cursor-pointer`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    isDarkMode ? "bg-slate-800 text-slate-300" : "bg-slate-100/70 text-slate-800"
                  }`}>
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <h4 className={`text-base font-bold tracking-tight ${isDarkMode ? "text-white" : "text-[#0A1128]"}`}>
                      Gasto
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Diésel, refacciones, comida...
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:translate-x-0.5 transition-all" />
              </button>

              <button
                id="action-pago"
                onClick={() => handleQuickAction("pago")}
                className={`w-full ${bgCard} p-5 rounded-[24px] flex items-center justify-between hover:shadow-md transition-all active:scale-[0.99] group cursor-pointer`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    isDarkMode ? "bg-slate-800 text-slate-300" : "bg-slate-100/70 text-slate-800"
                  }`}>
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <h4 className={`text-base font-bold tracking-tight ${isDarkMode ? "text-white" : "text-[#0A1128]"}`}>
                      Pago
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Cliente, monto, método
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:translate-x-0.5 transition-all" />
              </button>

              <button
                id="action-viaje"
                onClick={() => handleQuickAction("viaje")}
                className={`w-full ${bgCard} p-5 rounded-[24px] flex items-center justify-between hover:shadow-md transition-all active:scale-[0.99] group cursor-pointer`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    isDarkMode ? "bg-slate-800 text-slate-300" : "bg-slate-100/70 text-slate-800"
                  }`}>
                    <Truck className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <h4 className={`text-base font-bold tracking-tight ${isDarkMode ? "text-white" : "text-[#0A1128]"}`}>
                      Viaje
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Origen, destino, material
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:translate-x-0.5 transition-all" />
              </button>
            </div>

            {/* Recent Activity List preview */}
            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <span className={`text-xs font-bold ${isDarkMode ? "text-slate-400" : "text-[#0A1128]"} uppercase tracking-widest`}>
                  Actividad reciente
                </span>
                {recentActivities.length > 0 && (
                  <button
                    onClick={() => setActiveTab("historial")}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800"
                  >
                    Ver todo
                  </button>
                )}
              </div>

              {recentActivities.length === 0 ? (
                <div className={`${bgCard} rounded-[24px] p-6 text-center text-xs text-slate-400`}>
                  Aún no hay registros cargados. Tus capturas aparecerán aquí.
                </div>
              ) : (
                <div className={`rounded-[24px] border ${isDarkMode ? "bg-slate-900 border-slate-800 divide-y divide-slate-800" : "bg-white border-slate-100 divide-y divide-slate-100"} overflow-hidden shadow-xs`}>
                  {recentActivities.slice(0, 3).map((item, index) => {
                    const isGasto = item._type === "gasto";
                    const isPago = item._type === "pago";

                    return (
                      <div
                        key={index}
                        onClick={() => setSelectedDetailItem(item)}
                        className={`p-4 flex items-center justify-between hover:bg-slate-50/40 dark:hover:bg-slate-800/20 transition-all cursor-pointer group`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              isGasto
                                ? isDarkMode ? "bg-slate-800 text-slate-300" : "bg-slate-100/70 text-slate-800"
                                : isPago
                                ? isDarkMode ? "bg-slate-800 text-slate-300" : "bg-slate-100/70 text-slate-800"
                                : isDarkMode ? "bg-slate-800 text-slate-300" : "bg-slate-100/70 text-slate-800"
                            }`}
                          >
                            {isGasto ? (
                              <Receipt className="w-4 h-4" />
                            ) : isPago ? (
                              <CreditCard className="w-4 h-4" />
                            ) : (
                              <Truck className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <div className={`text-xs font-bold ${isDarkMode ? "text-slate-200" : "text-slate-800"} flex items-center gap-1.5 capitalize`}>
                              <span>
                                {isGasto ? "Gasto" : isPago ? "Pago" : "Viaje"}
                              </span>
                              <span className="text-slate-300 font-normal">•</span>
                              <span className="text-slate-400 font-normal">
                                {isGasto ? item.Categoría : isPago ? item.Cliente : item.Material}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                              {item.Fecha} a las {item.Hora ? item.Hora.slice(0, 5) : ""}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold font-mono ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
                            ${(item.Monto_MXN || item.Precio_cobrado_MXN || 0).toLocaleString("es-MX")}
                          </span>
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              isGasto
                                ? "bg-emerald-500"
                                : isPago
                                ? "bg-blue-500"
                                : "bg-amber-500"
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sync Status Widget at the bottom */}
            <SyncNotification
              pendingCount={pendingSyncQueue.length}
              lastSyncedAt={lastSyncedAt}
              onSyncTrigger={handleSyncPendingQueue}
              isSyncing={isSyncing}
              networkError={networkError}
              isDarkMode={isDarkMode}
            />
          </>
        )}

        {/* --- TAB: CAPTURA (REVIEW SCREEN) --- */}
        {activeTab === "captura" && activeRecord && activeRecordType && (
          <RecordForm
            type={activeRecordType}
            initialData={activeRecord}
            camiones={camionesList}
            clientes={clientesList}
            userEmail={user?.email || ""}
            token={token}
            isDarkMode={isDarkMode}
            onSave={handleSaveRecord}
            onCancel={handleDiscardRecord}
          />
        )}

        {activeTab === "captura" && (!activeRecord || !activeRecordType) && (
          <div className="bg-white rounded-3xl p-8 border border-slate-100 text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-slate-300 mx-auto" />
            <div className="space-y-1">
              <h3 className="font-bold text-slate-800">Ningún registro activo</h3>
              <p className="text-xs text-slate-400">
                Selecciona un método de captura o haz clic en una acción manual rápida.
              </p>
            </div>
            <button
              onClick={() => setActiveTab("inicio")}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
            >
              Ir a Inicio
            </button>
          </div>
        )}

        {/* --- TAB: HISTORIAL --- */}
        {activeTab === "historial" && (
          <div className="space-y-6">
            <div className="space-y-1">
              <h1 className={`text-3xl font-extrabold tracking-tight ${isDarkMode ? "text-white" : "text-slate-950"}`}>
                Historial
              </h1>
              <p className={`text-sm ${textSecondary}`}>
                Busca y filtra todos los registros del negocio.
              </p>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar notas, clientes, choferes o camiones..."
                className={`w-full text-xs rounded-xl pl-10 pr-4 py-3 focus:ring-1 focus:ring-blue-500 outline-hidden transition-all ${
                  isDarkMode
                    ? "bg-slate-900 border border-slate-800 text-slate-100"
                    : "bg-white border border-slate-100 text-slate-800 shadow-xs"
                }`}
              />
            </div>

            {/* Filters selectors */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                <Filter className="w-3.5 h-3.5" />
                <span>Filtrar por categoría</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { value: "todos", label: "Todos" },
                  { value: "gasto", label: "Gastos" },
                  { value: "pago", label: "Pagos" },
                  { value: "viaje", label: "Viajes" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setFilterType(opt.value as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      filterType === opt.value
                        ? isDarkMode
                          ? "bg-white border-white text-slate-950"
                          : "bg-slate-900 border-slate-900 text-white shadow-xs"
                        : isDarkMode
                        ? "bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800"
                        : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter by status */}
            <div className="flex gap-2">
              {[
                { value: "todos", label: "Cualquier Estado" },
                { value: "pendiente_sync", label: "Pendientes Sync" },
                { value: "validado", label: "Guardado en Sheets" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFilterStatus(opt.value as any)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all text-center ${
                    filterStatus === opt.value
                      ? "bg-blue-600 border-blue-600 text-white shadow-xs"
                      : isDarkMode
                      ? "bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800"
                      : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* History Results list */}
            {filteredActivities.length === 0 ? (
              <div className={`${bgCard} rounded-3xl p-8 text-center space-y-2`}>
                <FileText className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="text-xs font-semibold text-slate-500">No se encontraron registros</h4>
                <p className="text-[11px] text-slate-400">
                  Prueba cambiando los filtros o la consulta de búsqueda.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredActivities.map((item, idx) => {
                  const isGasto = item._type === "gasto";
                  const isPago = item._type === "pago";

                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedDetailItem(item)}
                      className={`${bgCard} p-4 rounded-2xl flex items-center justify-between hover:border-slate-500/20 transition-all cursor-pointer group`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div
                          className={`p-2.5 rounded-xl ${
                            isGasto
                              ? isDarkMode ? "bg-red-950/40 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600"
                              : isPago
                              ? isDarkMode ? "bg-emerald-950/40 text-emerald-400 border border-emerald-500/20" : "bg-emerald-50 text-emerald-600"
                              : isDarkMode ? "bg-blue-950/40 text-blue-400 border border-blue-500/20" : "bg-blue-50 text-blue-600"
                          }`}
                        >
                          {isGasto ? (
                            <Wallet className="w-4.5 h-4.5" />
                          ) : isPago ? (
                            <Landmark className="w-4.5 h-4.5" />
                          ) : (
                            <Truck className="w-4.5 h-4.5" />
                          )}
                        </div>
                        <div>
                          <div className={`text-xs font-bold ${isDarkMode ? "text-slate-200" : "text-slate-800"} flex items-center gap-1.5 capitalize`}>
                            <span>
                              {isGasto ? "Gasto" : isPago ? "Pago" : "Viaje"}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className="text-slate-400 font-normal">
                              {isGasto ? item.Categoría : isPago ? item.Cliente : item.Material}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-0.5 block font-mono">
                            {item.Fecha} a las {item.Hora}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className={`text-xs font-bold font-mono ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
                            ${(item.Monto_MXN || item.Precio_cobrado_MXN || 0).toLocaleString("es-MX")}
                          </div>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wide inline-block mt-0.5 border ${
                              item.Estado_validación === "pendiente_sync"
                                ? isDarkMode ? "bg-amber-950/40 text-amber-400 border-amber-500/20" : "bg-amber-100 text-amber-800 border-amber-100"
                                : isDarkMode ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/20" : "bg-emerald-100 text-emerald-800 border-emerald-100"
                            }`}
                          >
                            {item.Estado_validación === "pendiente_sync" ? "Pendiente" : "Sincronizado"}
                          </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* DETAIL MODAL EXPANSION */}
      {selectedDetailItem && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-end sm:items-center justify-center z-40 p-4">
          <div className={`rounded-t-3xl sm:rounded-3xl border w-full max-w-sm overflow-hidden shadow-2xl flex flex-col max-h-[85vh] ${
            isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
          }`}>
            {/* Modal Header */}
            <div className={`p-5 border-b flex justify-between items-center ${
              isDarkMode ? "bg-slate-900/50 border-slate-800" : "bg-slate-50 border-slate-100"
            }`}>
              <div>
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block">
                  Detalles del registro
                </span>
                <h3 className={`font-bold capitalize ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                  {selectedDetailItem._type === "gasto"
                    ? "Gasto Registrado"
                    : selectedDetailItem._type === "pago"
                    ? "Pago Registrado"
                    : "Viaje Registrado"}
                </h3>
              </div>
              <span className={`text-[10px] font-mono border px-2.5 py-1 rounded-full ${
                isDarkMode ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-white border-slate-100 text-slate-500"
              }`}>
                {selectedDetailItem.ID_gasto || selectedDetailItem.ID_pago || selectedDetailItem.ID_viaje}
              </span>
            </div>

            {/* Modal Scrollable Contents */}
            <div className="p-5 overflow-y-auto space-y-4">
              <div className={`grid grid-cols-2 gap-3.5 pb-3 border-b ${isDarkMode ? "border-slate-800" : "border-slate-50"}`}>
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Fecha</span>
                  <span className={`text-xs font-medium font-mono ${isDarkMode ? "text-slate-200" : "text-slate-800"}`}>{selectedDetailItem.Fecha}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Hora</span>
                  <span className={`text-xs font-medium font-mono ${isDarkMode ? "text-slate-200" : "text-slate-800"}`}>{selectedDetailItem.Hora}</span>
                </div>
              </div>

              {/* Gasto Details */}
              {selectedDetailItem._type === "gasto" && (
                <div className={`space-y-3 text-xs ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                  <div className={`flex justify-between py-1 border-b ${isDarkMode ? "border-slate-800/60" : "border-slate-50"}`}>
                    <span className="text-slate-400">Categoría</span>
                    <span className={`font-bold ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>{selectedDetailItem.Categoría}</span>
                  </div>
                  {selectedDetailItem.Subcategoría && (
                    <div className={`flex justify-between py-1 border-b ${isDarkMode ? "border-slate-800/60" : "border-slate-50"}`}>
                      <span className="text-slate-400">Subcategoría</span>
                      <span className="font-medium">{selectedDetailItem.Subcategoría}</span>
                    </div>
                  )}
                  <div className={`flex justify-between py-1 border-b ${isDarkMode ? "border-slate-800/60" : "border-slate-50"}`}>
                    <span className="text-slate-400">Monto</span>
                    <span className="font-extrabold text-red-500 font-mono">${selectedDetailItem.Monto_MXN.toLocaleString("es-MX")} MXN</span>
                  </div>
                  {selectedDetailItem.Camión && (
                    <div className={`flex justify-between py-1 border-b ${isDarkMode ? "border-slate-800/60" : "border-slate-50"}`}>
                      <span className="text-slate-400">Camión</span>
                      <span className="font-medium">{selectedDetailItem.Camión}</span>
                    </div>
                  )}
                  {selectedDetailItem.Chofer && (
                    <div className={`flex justify-between py-1 border-b ${isDarkMode ? "border-slate-800/60" : "border-slate-50"}`}>
                      <span className="text-slate-400">Chofer</span>
                      <span className="font-medium">{selectedDetailItem.Chofer}</span>
                    </div>
                  )}
                  <div className={`flex justify-between py-1 border-b ${isDarkMode ? "border-slate-800/60" : "border-slate-50"}`}>
                    <span className="text-slate-400">Método de Pago</span>
                    <span>{selectedDetailItem.Método_pago}</span>
                  </div>
                </div>
              )}

              {/* Pago Details */}
              {selectedDetailItem._type === "pago" && (
                <div className={`space-y-3 text-xs ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                  <div className={`flex justify-between py-1 border-b ${isDarkMode ? "border-slate-800/60" : "border-slate-50"}`}>
                    <span className="text-slate-400">Cliente</span>
                    <span className={`font-bold ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>{selectedDetailItem.Cliente}</span>
                  </div>
                  <div className={`flex justify-between py-1 border-b ${isDarkMode ? "border-slate-800/60" : "border-slate-50"}`}>
                    <span className="text-slate-400">Monto Recibido</span>
                    <span className="font-extrabold text-emerald-500 font-mono">${selectedDetailItem.Monto_MXN.toLocaleString("es-MX")} MXN</span>
                  </div>
                  <div className={`flex justify-between py-1 border-b ${isDarkMode ? "border-slate-800/60" : "border-slate-50"}`}>
                    <span className="text-slate-400">Saldo Restante</span>
                    <span className={`font-bold font-mono ${isDarkMode ? "text-slate-200" : "text-slate-800"}`}>${(selectedDetailItem.Saldo_restante_MXN || 0).toLocaleString("es-MX")} MXN</span>
                  </div>
                  <div className={`flex justify-between py-1 border-b ${isDarkMode ? "border-slate-800/60" : "border-slate-50"}`}>
                    <span className="text-slate-400">Método de Pago</span>
                    <span>{selectedDetailItem.Método_pago}</span>
                  </div>
                  <div className={`flex justify-between py-1 border-b ${isDarkMode ? "border-slate-800/60" : "border-slate-50"}`}>
                    <span className="text-slate-400">Estado</span>
                    <span className="capitalize font-semibold">{selectedDetailItem.Estado_pago}</span>
                  </div>
                </div>
              )}

              {/* Viaje Details */}
              {selectedDetailItem._type === "viaje" && (
                <div className={`space-y-3 text-xs ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                  <div className={`flex justify-between py-1 border-b ${isDarkMode ? "border-slate-800/60" : "border-slate-50"}`}>
                    <span className="text-slate-400">Cliente</span>
                    <span className={`font-bold ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>{selectedDetailItem.Cliente}</span>
                  </div>
                  <div className={`flex justify-between py-1 border-b ${isDarkMode ? "border-slate-800/60" : "border-slate-50"}`}>
                    <span className="text-slate-400">Material</span>
                    <span className="font-semibold">{selectedDetailItem.Material}</span>
                  </div>
                  <div className={`flex justify-between py-1 border-b ${isDarkMode ? "border-slate-800/60" : "border-slate-50"}`}>
                    <span className="text-slate-400">Ruta</span>
                    <span className="font-medium text-right">{selectedDetailItem.Origen} ➔ {selectedDetailItem.Destino}</span>
                  </div>
                  <div className={`flex justify-between py-1 border-b ${isDarkMode ? "border-slate-800/60" : "border-slate-50"}`}>
                    <span className="text-slate-400 font-mono">Metros cúbicos / Km</span>
                    <span className="font-mono">{selectedDetailItem.Metros_cubicos} m³ / {selectedDetailItem.Kilómetros || 0} km</span>
                  </div>
                  <div className={`flex justify-between py-1 border-b ${isDarkMode ? "border-slate-800/60" : "border-slate-50"}`}>
                    <span className="text-slate-400">Camión / Chofer</span>
                    <span className="text-right">{selectedDetailItem.Camión} • {selectedDetailItem.Chofer}</span>
                  </div>
                  <div className={`flex justify-between py-1 border-b ${isDarkMode ? "border-slate-800/60" : "border-slate-50"}`}>
                    <span className="text-slate-400">Precio Cobrado</span>
                    <span className={`font-bold font-mono ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>${selectedDetailItem.Precio_cobrado_MXN.toLocaleString("es-MX")} MXN</span>
                  </div>
                  <div className={`flex justify-between py-1 border-b ${isDarkMode ? "border-slate-800/60" : "border-slate-50"}`}>
                    <span className="text-slate-400">Costo Estimado</span>
                    <span className={`font-medium font-mono ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>${(selectedDetailItem.Costo_estimado_MXN || 0).toLocaleString("es-MX")} MXN</span>
                  </div>
                  <div className={`flex justify-between py-1 border-b ${isDarkMode ? "border-slate-800/60" : "border-slate-50"}`}>
                    <span className="text-slate-400">Utilidad Estimada</span>
                    <span className="font-extrabold text-emerald-500 font-mono">${(selectedDetailItem.Utilidad_estimada_MXN || 0).toLocaleString("es-MX")} MXN</span>
                  </div>
                </div>
              )}

              {/* Shared Evidence / Drive Links & User details */}
              <div className={`rounded-xl p-3 text-[11px] space-y-2 ${
                isDarkMode ? "bg-slate-950/40 text-slate-400" : "bg-slate-50 text-slate-500"
              }`}>
                <div className="flex justify-between">
                  <span>Registrado por:</span>
                  <span className="font-mono">{selectedDetailItem.Registrado_por}</span>
                </div>

                {/* Evidence Link & Uploader Manager */}
                {(selectedDetailItem._type === "gasto" || selectedDetailItem._type === "pago") && (
                  <div className={`pt-2 border-t ${isDarkMode ? "border-slate-800" : "border-slate-200"} space-y-2`}>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-[10px] uppercase tracking-wider text-slate-400">Evidencia (Google Drive)</span>
                      {selectedDetailItem.URL_evidencia_Drive && (
                        <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold uppercase">Cargado</span>
                      )}
                    </div>

                    {selectedDetailItem.URL_evidencia_Drive ? (
                      <div className="flex flex-col gap-1.5">
                        <a
                          href={selectedDetailItem.URL_evidencia_Drive}
                          target="_blank"
                          referrerPolicy="no-referrer"
                          className="flex items-center gap-1.5 text-blue-500 hover:text-blue-400 font-bold hover:underline py-0.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">Ver Ticket / Evidencia en Drive</span>
                        </a>

                        <label className="inline-flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-300 cursor-pointer font-semibold mt-1">
                          {isUploadingEvidence ? (
                            <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                          ) : (
                            <Upload className="w-3 h-3 text-slate-400" />
                          )}
                          <span>Reemplazar Evidencia</span>
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*,application/pdf"
                            disabled={isUploadingEvidence}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUpdateEvidenceForDetail(file);
                            }}
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="pt-1">
                        <label className={`flex flex-col items-center justify-center p-3.5 border border-dashed rounded-xl cursor-pointer hover:bg-slate-800/20 transition-all ${
                          isUploadingEvidence ? "opacity-50 pointer-events-none" : ""
                        }`}>
                          {isUploadingEvidence ? (
                            <Loader2 className="w-4 h-4 animate-spin text-blue-500 mb-1" />
                          ) : (
                            <Upload className="w-4 h-4 text-blue-500 mb-1" />
                          )}
                          <span className="font-bold text-[10px] text-blue-500">Cargar Ticket / Recibo</span>
                          <span className="text-[8px] text-slate-400 mt-0.5">Sube imagen o PDF a Drive</span>
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*,application/pdf"
                            disabled={isUploadingEvidence}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUpdateEvidenceForDetail(file);
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}

                {selectedDetailItem._type === "viaje" && (
                  <div className={`pt-2 border-t ${isDarkMode ? "border-slate-800" : "border-slate-200"} space-y-3`}>
                    {/* Evidencia de Carga */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-[10px] uppercase tracking-wider text-slate-400">Evidencia de Carga</span>
                        {selectedDetailItem.URL_evidencia_carga && (
                          <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold uppercase">Cargado</span>
                        )}
                      </div>

                      {selectedDetailItem.URL_evidencia_carga ? (
                        <div className="flex flex-col gap-1">
                          <a
                            href={selectedDetailItem.URL_evidencia_carga}
                            target="_blank"
                            referrerPolicy="no-referrer"
                            className="flex items-center gap-1.5 text-blue-500 hover:text-blue-400 font-bold hover:underline py-0.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">Ver Evidencia Carga</span>
                          </a>

                          <label className="inline-flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-300 cursor-pointer font-semibold">
                            {isUploadingEvidence ? (
                              <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                            ) : (
                              <Upload className="w-3 h-3 text-slate-400" />
                            )}
                            <span>Reemplazar Evidencia Carga</span>
                            <input
                              type="file"
                              className="hidden"
                              accept="image/*,application/pdf"
                              disabled={isUploadingEvidence}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUpdateEvidenceForDetail(file, "carga");
                              }}
                            />
                          </label>
                        </div>
                      ) : (
                        <label className={`flex flex-col items-center justify-center py-2.5 border border-dashed rounded-xl cursor-pointer hover:bg-slate-800/20 transition-all ${
                          isUploadingEvidence ? "opacity-50 pointer-events-none" : ""
                        }`}>
                          {isUploadingEvidence ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 mb-0.5" />
                          ) : (
                            <Upload className="w-3.5 h-3.5 text-blue-500 mb-0.5" />
                          )}
                          <span className="font-bold text-[10px] text-blue-500">Subir Evidencia Carga</span>
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*,application/pdf"
                            disabled={isUploadingEvidence}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUpdateEvidenceForDetail(file, "carga");
                            }}
                          />
                        </label>
                      )}
                    </div>

                    {/* Evidencia de Descarga */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-800/20">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-[10px] uppercase tracking-wider text-slate-400">Evidencia de Descarga</span>
                        {selectedDetailItem.URL_evidencia_descarga && (
                          <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold uppercase">Cargado</span>
                        )}
                      </div>

                      {selectedDetailItem.URL_evidencia_descarga ? (
                        <div className="flex flex-col gap-1">
                          <a
                            href={selectedDetailItem.URL_evidencia_descarga}
                            target="_blank"
                            referrerPolicy="no-referrer"
                            className="flex items-center gap-1.5 text-blue-500 hover:text-blue-400 font-bold hover:underline py-0.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">Ver Evidencia Descarga</span>
                          </a>

                          <label className="inline-flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-300 cursor-pointer font-semibold">
                            {isUploadingEvidence ? (
                              <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                            ) : (
                              <Upload className="w-3 h-3 text-slate-400" />
                            )}
                            <span>Reemplazar Evidencia Descarga</span>
                            <input
                              type="file"
                              className="hidden"
                              accept="image/*,application/pdf"
                              disabled={isUploadingEvidence}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUpdateEvidenceForDetail(file, "descarga");
                              }}
                            />
                          </label>
                        </div>
                      ) : (
                        <label className={`flex flex-col items-center justify-center py-2.5 border border-dashed rounded-xl cursor-pointer hover:bg-slate-800/20 transition-all ${
                          isUploadingEvidence ? "opacity-50 pointer-events-none" : ""
                        }`}>
                          {isUploadingEvidence ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 mb-0.5" />
                          ) : (
                            <Upload className="w-3.5 h-3.5 text-blue-500 mb-0.5" />
                          )}
                          <span className="font-bold text-[10px] text-blue-500">Subir Evidencia Descarga</span>
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*,application/pdf"
                            disabled={isUploadingEvidence}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUpdateEvidenceForDetail(file, "descarga");
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes box */}
                {(selectedDetailItem.Notas || selectedDetailItem.Observaciones) && (
                  <div className={`pt-1.5 border-t ${isDarkMode ? "border-slate-800" : "border-slate-200"}`}>
                    <span className="block font-semibold text-[10px]">Notas:</span>
                    <p className={`mt-0.5 italic ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
                      "{selectedDetailItem.Notas || selectedDetailItem.Observaciones}"
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className={`p-4 border-t ${
              isDarkMode ? "bg-slate-900/50 border-slate-800" : "bg-slate-50 border-slate-100"
            }`}>
              <button
                onClick={() => setSelectedDetailItem(null)}
                className={`w-full py-3 font-bold rounded-2xl text-xs active:scale-98 transition-all ${
                  isDarkMode ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-slate-900 text-white hover:bg-slate-950"
                }`}
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING NAVIGATION BOTTOM BAR */}
      <nav className={`fixed bottom-0 left-0 right-0 max-w-md mx-auto grid grid-cols-3 py-2 px-1 z-30 shadow-lg border-t ${
        isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
      }`}>
        <button
          onClick={() => setActiveTab("inicio")}
          className={`flex flex-col items-center justify-center py-1 transition-all ${
            activeTab === "inicio" ? "text-blue-500 font-bold" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] font-bold mt-1">Inicio</span>
        </button>

        {/* Big Capture button */}
        <button
          onClick={() => {
            setActiveRecordType("gasto");
            setActiveRecord({});
            setActiveTab("captura");
          }}
          className="flex flex-col items-center justify-center relative -top-4"
        >
          <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg hover:bg-blue-700 active:scale-95 transition-all shadow-blue-500/20">
            <Plus className="w-6 h-6 stroke-[3px]" />
          </div>
          <span className="text-[10px] font-extrabold text-blue-500 mt-1">Captura</span>
        </button>

        <button
          onClick={() => setActiveTab("historial")}
          className={`flex flex-col items-center justify-center py-1 transition-all ${
            activeTab === "historial" ? "text-blue-500 font-bold" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <Clock className="w-5 h-5" />
          <span className="text-[10px] font-bold mt-1">Historial</span>
        </button>
      </nav>
    </div>
  );
}
