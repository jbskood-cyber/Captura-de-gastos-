import React, { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";

interface AudioCaptureProps {
  onAudioCaptured: (base64Audio: string, mimeType: string) => void;
  isProcessing: boolean;
}

export default function AudioCapture({ onAudioCaptured, isProcessing }: AudioCaptureProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    startRecording();
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const startRecording = async () => {
    try {
      setError(null);
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        if (timerRef.current) window.clearInterval(timerRef.current);
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || "audio/mp4" });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          if (typeof reader.result === "string") onAudioCaptured(reader.result, mimeType || audioBlob.type);
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => setRecordingSeconds((prev) => prev + 1), 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("No se pudo acceder al microfono.");
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    mediaRecorderRef.current.stop();
    setIsRecording(false);
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins}:${remaining < 10 ? "0" : ""}${remaining}`;
  };

  return (
    <div id="audio-capture-container" className="rounded-2xl border border-[var(--bravo-border)] bg-white/[0.035] p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--bravo-muted)]">Audio</span>
          <h3 className="mt-1 text-base font-semibold text-[var(--bravo-ink)]">
            {isProcessing ? "Procesando audio" : isRecording ? "Grabando" : "Preparando registro"}
          </h3>
          <p className="mt-1 text-sm text-[var(--bravo-muted)]">
            {error || (isRecording ? "Toca detener para revisar el registro." : "El audio se procesara automaticamente.")}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--bravo-border)] bg-black/20 px-4 py-3 text-lg font-semibold tabular-nums text-[var(--bravo-ink)]">
          {formatTime(recordingSeconds)}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          id="stop-recording-btn"
          type="button"
          onClick={stopRecording}
          disabled={!isRecording || isProcessing}
          className="bravo-primary-button"
        >
          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
          <span>{isProcessing ? "Procesando" : "Detener y procesar"}</span>
        </button>
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[var(--bravo-border)] bg-white/[0.04] text-[var(--bravo-muted)]">
          <Mic className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
