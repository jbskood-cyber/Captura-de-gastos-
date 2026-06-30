import React, { useState, useRef } from "react";
import { Mic, Square, Play, RotateCcw, Sparkles } from "lucide-react";

interface AudioCaptureProps {
  onAudioCaptured: (base64Audio: string, mimeType: string) => void;
  isProcessing: boolean;
  isDarkMode?: boolean;
}

export default function AudioCapture({ onAudioCaptured, isProcessing, isDarkMode = false }: AudioCaptureProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);

        // Convert to base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          if (typeof reader.result === "string") {
            onAudioCaptured(reader.result, "audio/webm");
          }
        };

        // Stop all tracks to release mic
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setAudioUrl(null);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("No se pudo acceder al micrófono. Por favor, concede los permisos correspondientes.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const resetAudio = () => {
    setAudioUrl(null);
    setRecordingSeconds(0);
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins}:${remaining < 10 ? "0" : ""}${remaining}`;
  };

  return (
    <div id="audio-capture-container" className={`rounded-2xl p-6 flex flex-col items-center justify-center space-y-4 ${
      isDarkMode ? "bg-slate-900 border border-slate-800" : "bg-white border border-slate-100 shadow-xs"
    }`}>
      <div className="text-center">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Captura de voz</span>
        <h3 className={`text-sm mt-1 ${isDarkMode ? "text-slate-300" : "text-slate-500"}`}>
          {isRecording ? "Grabando nota de voz..." : audioUrl ? "Audio grabado" : "Presiona para grabar tu reporte"}
        </h3>
      </div>

      {isRecording && (
        <div className="flex items-center space-x-1 py-4">
          <span className="w-1.5 h-6 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
          <span className="w-1.5 h-10 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
          <span className="w-1.5 h-8 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
          <span className="w-1.5 h-12 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "450ms" }}></span>
          <span className="w-1.5 h-6 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: "600ms" }}></span>
        </div>
      )}

      <div className={`text-3xl font-mono py-1 ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>
        {formatTime(recordingSeconds)}
      </div>

      <div className="flex items-center space-x-4">
        {!isRecording && !audioUrl ? (
          <button
            id="start-recording-btn"
            onClick={startRecording}
            disabled={isProcessing}
            className="w-16 h-16 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-full flex items-center justify-center shadow-md transition-all duration-150 disabled:opacity-50"
          >
            <Mic className="w-7 h-7" />
          </button>
        ) : isRecording ? (
          <button
            id="stop-recording-btn"
            onClick={stopRecording}
            className="w-16 h-16 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-full flex items-center justify-center shadow-md transition-all duration-150"
          >
            <Square className="w-6 h-6 fill-white" />
          </button>
        ) : (
          <div className="flex items-center space-x-3">
            <button
              id="reset-audio-btn"
              onClick={resetAudio}
              className={`p-3 rounded-full transition-all ${
                isDarkMode ? "bg-slate-800 hover:bg-slate-700 text-slate-300" : "bg-slate-100 hover:bg-slate-200 text-slate-600"
              }`}
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            {audioUrl && (
              <button
                id="play-audio-btn"
                onClick={() => {
                  const audio = new Audio(audioUrl);
                  audio.play();
                }}
                className={`p-3 rounded-full transition-all ${
                  isDarkMode ? "bg-slate-800 hover:bg-slate-700 text-slate-300" : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                }`}
              >
                <Play className={`w-5 h-5 ${isDarkMode ? "fill-slate-300" : "fill-slate-600"}`} />
              </button>
            )}
            <button
              id="re-record-btn"
              onClick={startRecording}
              className="w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center shadow-sm"
            >
              <Mic className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {audioUrl && !isProcessing && (
        <div className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-full mt-2 ${
          isDarkMode ? "text-blue-400 bg-blue-950/40 border border-blue-500/20" : "text-blue-600 bg-blue-50"
        }`}>
          <Sparkles className="w-3.5 h-3.5" />
          <span>Listo para procesar con Gemini</span>
        </div>
      )}
    </div>
  );
}
