import React, { useState } from "react";
import {
  Cloud,
  CloudOff,
  CloudLightning,
  RefreshCw,
  Check,
  ChevronDown,
  ChevronUp,
  Receipt,
  CreditCard,
  Truck,
  Image as ImageIcon
} from "lucide-react";

interface SyncNotificationProps {
  pendingCount: number;
  lastSyncedAt: string | null;
  onSyncTrigger: () => void;
  isSyncing: boolean;
  networkError: string | null;
  isDarkMode?: boolean;
  pendingQueue?: any[];
}

export default function SyncNotification({
  pendingCount,
  lastSyncedAt,
  onSyncTrigger,
  isSyncing,
  networkError,
  isDarkMode = false,
  pendingQueue = [],
}: SyncNotificationProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isOnline = navigator.onLine;

  const handleToggleExpand = () => {
    if (pendingCount > 0) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div
      id="sync-notification-banner"
      className={`rounded-[24px] border p-4 transition-all duration-300 shadow-sm ${
        pendingCount > 0
          ? networkError
            ? isDarkMode
              ? "bg-rose-950/30 border-rose-900/40 text-rose-200"
              : "bg-rose-50 border-rose-100 text-rose-800"
            : isDarkMode
            ? "bg-amber-950/30 border-amber-900/40 text-amber-200"
              : "bg-amber-50 border-amber-100 text-amber-800"
          : isDarkMode
          ? "bg-slate-900 border-slate-800 text-slate-100"
          : "bg-white border-slate-100 text-slate-800"
      }`}
    >
      <div className="flex items-center justify-between">
        <div 
          className="flex items-center gap-3 cursor-pointer select-none flex-1"
          onClick={handleToggleExpand}
        >
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              pendingCount > 0
                ? networkError
                  ? isDarkMode
                    ? "bg-rose-900/50 text-rose-400"
                    : "bg-rose-100 text-rose-600"
                  : isDarkMode
                  ? "bg-amber-900/50 text-amber-400"
                  : "bg-amber-100 text-amber-600"
                : isDarkMode
                ? "bg-blue-950/40 text-blue-400"
                : "bg-blue-50 text-blue-500"
            }`}
          >
            {pendingCount > 0 ? (
              networkError ? (
                <CloudLightning className="w-5 h-5" />
              ) : (
                <CloudOff className="w-5 h-5" />
              )
            ) : (
              <Cloud className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1">
            <div className={`text-sm font-bold tracking-tight ${isDarkMode ? "text-slate-200" : "text-[#0A1128]"} flex items-center gap-1.5`}>
              <span>
                {pendingCount > 0
                  ? `${pendingCount} Registro${pendingCount > 1 ? "s" : ""} Pendiente${pendingCount > 1 ? "s" : ""}`
                  : "Sincronización al día"}
              </span>
              {!isOnline && (
                <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 uppercase tracking-wide`}>
                  Offline
                </span>
              )}
              {pendingCount > 0 && (
                <span className="text-slate-400">
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5 inline ml-1" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-1" />}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {pendingCount > 0
                ? networkError
                  ? `Fallo: ${networkError}`
                  : "Presiona para ver cola local"
                : lastSyncedAt 
                  ? `Sincronizado: ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : "Todo guardado en Google Sheets"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSyncTrigger();
              }}
              disabled={isSyncing}
              className={`p-2.5 rounded-xl transition-all ${
                networkError
                  ? "bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
                  : "bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
              } active:scale-95 disabled:opacity-50 flex items-center justify-center`}
              title="Sincronizar ahora"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
            </button>
          )}

          {pendingCount === 0 && (
            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0">
              <Check className="w-3.5 h-3.5 stroke-[3px]" />
            </div>
          )}
        </div>
      </div>

      {/* Expandable Section displaying pending items list */}
      {isExpanded && pendingCount > 0 && pendingQueue.length > 0 && (
        <div className={`mt-3.5 pt-3.5 border-t ${isDarkMode ? "border-slate-800" : "border-slate-100"} space-y-2.5`}>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
            Cola de Sincronización Local
          </div>
          <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {pendingQueue.map((item, index) => {
              const { record, type, localMediaData } = item;
              const isGasto = type === "gasto";
              const isPago = type === "pago";
              const isViaje = type === "viaje";

              const title = isGasto 
                ? "Gasto" 
                : isPago 
                ? "Pago Recibido" 
                : "Viaje Registrado";

              const subtitle = isGasto 
                ? record.Categoría 
                : isPago 
                ? record.Cliente 
                : `${record.Material || "Material"} (${record.Origen || "Origen"} ➔ ${record.Destino || "Destino"})`;

              const amount = isGasto 
                ? record.Monto_MXN 
                : isPago 
                ? record.Monto_MXN 
                : record.Precio_cobrado_MXN || 0;

              return (
                <div
                  key={index}
                  className={`flex items-center justify-between p-2.5 rounded-xl border ${
                    isDarkMode 
                      ? "bg-slate-950/40 border-slate-800/80" 
                      : "bg-slate-50 border-slate-200/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isGasto 
                        ? "bg-rose-500/10 text-rose-500" 
                        : isPago 
                        ? "bg-emerald-500/10 text-emerald-500" 
                        : "bg-amber-500/10 text-amber-500"
                    }`}>
                      {isGasto && <Receipt className="w-4 h-4" />}
                      {isPago && <CreditCard className="w-4 h-4" />}
                      {isViaje && <Truck className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className={`text-xs font-bold truncate ${isDarkMode ? "text-slate-200" : "text-slate-800"} flex items-center gap-1.5`}>
                        <span>{title}</span>
                        {localMediaData && (
                          <span className="inline-flex items-center text-[9px] bg-blue-500/10 text-blue-400 px-1 rounded-sm gap-0.5">
                            <ImageIcon className="w-2.5 h-2.5" />
                            <span>Foto</span>
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5 font-medium">
                        {subtitle}
                      </div>
                      <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                        {record.Fecha} {record.Hora}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-xs font-bold font-mono ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
                      ${amount.toLocaleString("es-MX")}
                    </span>
                    <span className="block text-[8px] font-bold text-amber-500 mt-0.5 uppercase tracking-wide">
                      Pendiente
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={onSyncTrigger}
              disabled={isOnline === false || isSyncing}
              className={`w-full py-2 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                isOnline
                  ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              <span>
                {isOnline 
                  ? isSyncing 
                    ? "Sincronizando..." 
                    : "Reintentar Sincronizar Cola"
                  : "Sin Conexión (Reintento deshabilitado)"}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
