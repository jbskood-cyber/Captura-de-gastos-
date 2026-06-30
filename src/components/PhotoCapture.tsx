import React, { useState, useRef } from "react";
import { Camera, Image, X, Sparkles } from "lucide-react";

interface PhotoCaptureProps {
  onPhotoCaptured: (base64Image: string, mimeType: string) => void;
  isProcessing: boolean;
  isDarkMode?: boolean;
}

export default function PhotoCapture({ onPhotoCaptured, isProcessing, isDarkMode = false }: PhotoCaptureProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Por favor selecciona un archivo de imagen válido.");
      return;
    }

    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        onPhotoCaptured(reader.result, file.type);
      }
    };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const clearPhoto = () => {
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div
      id="photo-capture-container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-2xl p-6 border transition-all duration-150 flex flex-col items-center justify-center min-h-[220px] ${
        isDragOver
          ? "border-blue-500 bg-blue-50/30"
          : isDarkMode
          ? "bg-slate-900 border-slate-800"
          : "bg-white border-slate-100 shadow-xs"
      }`}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
        id="camera-file-input"
      />

      {previewUrl ? (
        <div className="relative w-full max-w-[240px] aspect-3/4 rounded-xl overflow-hidden bg-slate-100 group">
          <img src={previewUrl} alt="Vista previa de evidencia" className="w-full h-full object-cover" />
          <button
            onClick={clearPhoto}
            type="button"
            className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-all"
          >
            <X className="w-4 h-4" />
          </button>
          {!isProcessing && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-white flex items-center gap-1 bg-blue-600/90 backdrop-blur-xs px-2.5 py-1 rounded-full whitespace-nowrap shadow-sm">
              <Sparkles className="w-3 h-3 animate-pulse" />
              <span>Listo para analizar con Gemini</span>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center flex flex-col items-center space-y-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center border text-slate-400 ${
            isDarkMode ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-slate-100"
          }`}>
            <Camera className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h4 className={`text-sm font-medium ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>Toma una foto de tu ticket/evidencia</h4>
            <p className="text-xs text-slate-400">Suelta tu imagen aquí o haz clic en un botón</p>
          </div>

          <div className="flex items-center space-x-3 w-full">
            <button
              type="button"
              id="camera-capture-trigger"
              disabled={isProcessing}
              onClick={() => {
                if (fileInputRef.current) {
                  // capture="environment" tells mobile phones to trigger camera directly
                  fileInputRef.current.setAttribute("capture", "environment");
                  fileInputRef.current.click();
                }
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-semibold rounded-xl transition-all disabled:opacity-50 shadow-sm"
            >
              <Camera className="w-4 h-4" />
              <span>Abrir Cámara</span>
            </button>
            <button
              type="button"
              id="gallery-trigger"
              disabled={isProcessing}
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.removeAttribute("capture");
                  fileInputRef.current.click();
                }
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 active:scale-95 text-xs font-semibold rounded-xl transition-all ${
                isDarkMode ? "bg-slate-800 hover:bg-slate-700 text-slate-300" : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              <Image className={`w-4 h-4 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`} />
              <span>Galería/Archivo</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
