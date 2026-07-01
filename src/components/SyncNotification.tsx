import React, { useState } from "react";
import { Check, ChevronDown, ChevronUp, Cloud, CloudOff, Image as ImageIcon, RefreshCw } from "lucide-react";

interface SyncNotificationProps {
  pendingCount: number;
  lastSyncedAt: string | null;
  onSyncTrigger: () => void;
  isSyncing: boolean;
  networkError: string | null;
  pendingQueue?: any[];
  isPreviewMode?: boolean;
}

export default function SyncNotification({
  pendingCount,
  lastSyncedAt,
  onSyncTrigger,
  isSyncing,
  networkError,
  pendingQueue = [],
  isPreviewMode = false,
}: SyncNotificationProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isOnline = navigator.onLine;
  const hasPending = pendingCount > 0;
  const title = isPreviewMode
    ? "Vista previa local"
    : hasPending
    ? "Pendiente de sincronizaci\u00f3n"
    : "Sincronizaci\u00f3n al d\u00eda";
  const subtitle = isPreviewMode
    ? "Los cambios se guardan localmente para pruebas."
    : hasPending
    ? "Hay cambios pendientes por enviar."
    : "Todo guardado en Google Sheets.";

  const handleToggleExpand = () => {
    if (hasPending) setIsExpanded((value) => !value);
  };

  return (
    <div id="sync-notification-banner" className="rounded-[24px] border border-[var(--bravo-border)] bg-white/[0.035] p-4 text-[var(--bravo-ink)]">
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={handleToggleExpand}>
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[var(--bravo-border)] bg-white/[0.045] text-[var(--bravo-muted)]">
            {hasPending ? <CloudOff className="h-5 w-5" /> : <Cloud className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-[var(--bravo-ink)]">{title}</h3>
              {!isOnline && (
                <span className="rounded-full border border-[var(--bravo-border)] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-[var(--bravo-muted)]">
                  Offline
                </span>
              )}
              {hasPending && (
                <span className="text-[var(--bravo-muted)]">
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-[var(--bravo-muted)]">{networkError && hasPending && !isPreviewMode ? networkError : subtitle}</p>
            {!isPreviewMode && !hasPending && lastSyncedAt && (
              <p className="mt-1 text-[10px] text-[var(--bravo-muted)]">
                {"\u00daltima sincronizaci\u00f3n"}: {new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        </button>

        {hasPending ? (
          <button
            type="button"
            onClick={onSyncTrigger}
            disabled={isSyncing || isPreviewMode}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[var(--bravo-border)] bg-white/[0.055] text-[var(--bravo-ink)] disabled:opacity-45"
            title={isPreviewMode ? "Vista previa local" : "Sincronizar ahora"}
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
          </button>
        ) : (
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--bravo-border)] bg-white/[0.055] text-[var(--bravo-ink)]">
            <Check className="h-4 w-4" />
          </div>
        )}
      </div>

      {isExpanded && hasPending && pendingQueue.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-[var(--bravo-border)] pt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--bravo-muted)]">Cola local</div>
          {pendingQueue.map((item, index) => {
            const { record, type, localMediaData } = item;
            const title = type === "pago" ? "Pago" : type === "viaje" ? "Viaje" : "Gasto";
            const subtitle =
              type === "gasto"
                ? record.Categoria || record["Categor\u00eda"] || "Gasto"
                : type === "pago"
                ? record.Cliente || "Pago recibido"
                : `${record.Material || "Material"} - ${record.Origen || "Origen"} a ${record.Destino || "Destino"}`;
            const amount = record.Monto_MXN || record.Precio_cobrado_MXN || 0;

            return (
              <div key={index} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--bravo-border)] bg-black/15 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--bravo-ink)]">
                    <span>{title}</span>
                    {localMediaData && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--bravo-border)] px-1.5 py-0.5 text-[10px] text-[var(--bravo-muted)]">
                        <ImageIcon className="h-3 w-3" />
                        Foto
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-[var(--bravo-muted)]">{subtitle}</p>
                </div>
                <div className="shrink-0 text-right text-xs font-semibold tabular-nums text-[var(--bravo-ink)]">
                  ${Number(amount || 0).toLocaleString("es-MX")}
                  <span className="block text-[10px] font-semibold text-[var(--bravo-muted)]">Pendiente</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
