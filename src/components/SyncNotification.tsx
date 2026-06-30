import React from "react";
import { Cloud, CloudOff, CloudLightning, RefreshCw, AlertTriangle, CheckCircle, Check } from "lucide-react";

interface SyncNotificationProps {
  pendingCount: number;
  lastSyncedAt: string | null;
  onSyncTrigger: () => void;
  isSyncing: boolean;
  networkError: string | null;
  isDarkMode?: boolean;
}

export default function SyncNotification({
  pendingCount,
  lastSyncedAt,
  onSyncTrigger,
  isSyncing,
  networkError,
  isDarkMode = false,
}: SyncNotificationProps) {
  const isOnline = navigator.onLine;

  return (
    <div
      id="sync-notification-banner"
      className={`rounded-[24px] border p-4 transition-all duration-150 shadow-xs ${
        pendingCount > 0
          ? networkError
            ? isDarkMode
              ? "bg-rose-950/30 border-rose-900/50 text-rose-200"
              : "bg-rose-50 border-rose-100 text-rose-800"
            : isDarkMode
            ? "bg-amber-950/30 border-amber-900/50 text-amber-200"
              : "bg-amber-50 border-amber-100 text-amber-800"
          : isDarkMode
          ? "bg-slate-900 border-slate-800 text-slate-100"
          : "bg-white border-slate-100 text-slate-800"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center ${
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
          <div>
            <div className={`text-sm font-bold tracking-tight ${isDarkMode ? "text-slate-200" : "text-[#0A1128]"} flex items-center gap-1.5`}>
              <span>
                {pendingCount > 0
                  ? `${pendingCount} Registro${pendingCount > 1 ? "s" : ""} Pendiente${pendingCount > 1 ? "s" : ""}`
                  : "Sincronización al día"}
              </span>
              {!isOnline && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase ${
                  isDarkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-600"
                }`}>
                  Sin Internet
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {pendingCount > 0
                ? networkError
                  ? `Fallo: ${networkError}`
                  : "Guardado localmente. Esperando sincronización."
                : "Todo en orden"}
            </p>
          </div>
        </div>

        {pendingCount > 0 && (
          <button
            onClick={onSyncTrigger}
            disabled={isSyncing}
            className={`p-2 rounded-xl transition-all ${
              networkError
                ? "bg-rose-600 hover:bg-rose-700 text-white"
                : "bg-amber-600 hover:bg-amber-700 text-white"
            } active:scale-95 disabled:opacity-50 flex items-center justify-center`}
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
  );
}
