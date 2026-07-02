import React, { useRef, useState } from "react";
import { Camera, Image, Loader2, X } from "lucide-react";

interface PhotoCaptureProps {
  onPhotoCaptured: (base64Image: string, mimeType: string) => void;
  onProcess: (description: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  isProcessing: boolean;
}

export default function PhotoCapture({
  onPhotoCaptured,
  onProcess,
  description,
  onDescriptionChange,
  isProcessing,
}: PhotoCaptureProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Selecciona una imagen valida.");
      return;
    }

    setError("");
    setPreviewUrl(URL.createObjectURL(file));
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        setHasPhoto(true);
        onPhotoCaptured(reader.result, file.type);
      }
    };
  };

  const clearPhoto = () => {
    setPreviewUrl(null);
    setHasPhoto(false);
    onDescriptionChange("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openCamera = () => {
    fileInputRef.current?.setAttribute("capture", "environment");
    fileInputRef.current?.click();
  };

  const openGallery = () => {
    fileInputRef.current?.removeAttribute("capture");
    fileInputRef.current?.click();
  };

  return (
    <div id="photo-capture-container" className="rounded-2xl border border-[var(--bravo-border)] bg-white/[0.035] p-5">
      <input
        type="file"
        ref={fileInputRef}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) processFile(file);
        }}
        accept="image/*"
        className="hidden"
        id="camera-file-input"
      />

      {previewUrl ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-2xl border border-[var(--bravo-border)] bg-black/20">
              <img src={previewUrl} alt="Vista previa" className="h-full w-full object-cover" />
              <button
                onClick={clearPhoto}
                type="button"
                className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/65 text-white"
                aria-label="Quitar foto"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--bravo-muted)]">Foto</span>
              <h3 className="mt-1 text-base font-semibold text-[var(--bravo-ink)]">Lista para procesar</h3>
              <p className="mt-1 text-sm text-[var(--bravo-muted)]">Agrega contexto si ayuda a Gemini.</p>
            </div>
          </div>

          <input
            className="bravo-field"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="Agregar descripcion (opcional)"
          />

          <div className="grid gap-3">
            <button type="button" className="bravo-primary-button" disabled={!hasPhoto || isProcessing} onClick={() => onProcess(description)}>
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              <span>Procesar foto</span>
            </button>
            <button type="button" className="bravo-secondary-button" disabled={!hasPhoto || isProcessing} onClick={() => onProcess("")}>
              Omitir y procesar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-[var(--bravo-border)] bg-white/[0.04] text-[var(--bravo-muted)]">
            <Camera className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--bravo-ink)]">Capturar foto</h3>
            <p className="mt-1 text-sm text-[var(--bravo-muted)]">Toma una foto o elige una imagen.</p>
            {error && <p className="mt-2 text-sm text-[var(--bravo-muted)]">{error}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" id="camera-capture-trigger" className="bravo-primary-button" disabled={isProcessing} onClick={openCamera}>
              <Camera className="h-4 w-4" />
              <span>Camara</span>
            </button>
            <button type="button" id="gallery-trigger" className="bravo-secondary-button" disabled={isProcessing} onClick={openGallery}>
              <Image className="h-4 w-4" />
              <span>Galeria</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
