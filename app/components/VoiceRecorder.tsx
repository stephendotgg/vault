"use client";

import { useState, useRef, useEffect } from "react";

interface VoiceRecorderProps {
  onTranscription: (text: string) => void;
  disabled?: boolean;
}

const AZURE_SPEECH_KEY_STORAGE_KEY = "vault-azure-speech-key";
const LEGACY_AZURE_SPEECH_KEY_STORAGE_KEY = "mothership-azure-speech-key";
const AZURE_SPEECH_REGION_STORAGE_KEY = "vault-azure-speech-region";
const LEGACY_AZURE_SPEECH_REGION_STORAGE_KEY = "mothership-azure-speech-region";
const AZURE_SPEECH_LANGUAGE_STORAGE_KEY = "vault-azure-speech-language";
const LEGACY_AZURE_SPEECH_LANGUAGE_STORAGE_KEY = "mothership-azure-speech-language";

type RecordingState = "idle" | "recording" | "processing";

// Convert audio blob to WAV format for server-side processing
async function convertToWav(audioBlob: Blob): Promise<Blob> {
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  // Get audio data as Float32Array
  const channelData = audioBuffer.getChannelData(0);
  
  // Convert to 16-bit PCM WAV
  const wavBuffer = encodeWav(channelData, 16000);
  
  await audioContext.close();
  
  return new Blob([wavBuffer], { type: "audio/wav" });
}

// Encode Float32Array to WAV format
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  
  // WAV header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true); // AudioFormat (PCM)
  view.setUint16(22, 1, true); // NumChannels
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  
  // Write audio data
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  
  return buffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export function VoiceRecorder({ onTranscription, disabled }: VoiceRecorderProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const getAzureSpeechConfig = () => {
    const key =
      localStorage.getItem(AZURE_SPEECH_KEY_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_AZURE_SPEECH_KEY_STORAGE_KEY) ||
      "";
    const region =
      localStorage.getItem(AZURE_SPEECH_REGION_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_AZURE_SPEECH_REGION_STORAGE_KEY) ||
      "";
    const language =
      localStorage.getItem(AZURE_SPEECH_LANGUAGE_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_AZURE_SPEECH_LANGUAGE_STORAGE_KEY) ||
      "en-US";

    return { key, region, language };
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const togglePlayback = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      // Clear previous recording
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        } 
      });
      
      streamRef.current = stream;
      chunksRef.current = [];
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") 
          ? "audio/webm;codecs=opus" 
          : "audio/webm"
      });
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        
        if (chunksRef.current.length === 0) {
          setError("No audio recorded");
          setState("idle");
          return;
        }
        
        setState("processing");
        
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        
        // Create URL for playback
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        
        try {
          const azureSpeech = getAzureSpeechConfig();
          if (!azureSpeech.key || !azureSpeech.region) {
            throw new Error("Azure Speech key/region missing. Set them in Settings > API Keys.");
          }

          // Convert to WAV format for server-side processing
          const wavBlob = await convertToWav(audioBlob);
          
          const formData = new FormData();
          formData.append("audio", wavBlob, "recording.wav");
          
          const response = await fetch("/api/transcribe", {
            method: "POST",
            headers: {
              "x-vault-azure-speech-key": azureSpeech.key,
              "x-vault-azure-speech-region": azureSpeech.region,
              "x-vault-azure-speech-language": azureSpeech.language,
            },
            body: formData,
          });
          
          if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || "Transcription failed");
          }
          
          const { text } = await response.json();
          
          if (text && text.trim()) {
            onTranscription(text.trim());
          } else {
            setError("No speech detected");
          }
        } catch (err) {
          console.error("Transcription error:", err);
          setError(err instanceof Error ? err.message : "Transcription failed");
        }
        
        setState("idle");
        setDuration(0);
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms
      setState("recording");
      setDuration(0);
      
      // Start duration timer
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
      
    } catch (err) {
      console.error("Microphone error:", err);
      setError("Could not access microphone");
      setState("idle");
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (mediaRecorderRef.current && state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Main record button */}
      <button
        onClick={state === "recording" ? stopRecording : startRecording}
        disabled={disabled || state === "processing"}
        className={`
          relative w-20 h-20 rounded-full flex items-center justify-center transition-all
          ${state === "recording" 
            ? "bg-red-500 hover:bg-red-600 animate-pulse" 
            : state === "processing"
            ? "bg-[#4f4f4f] cursor-wait"
            : "bg-[#3f3f3f] hover:bg-[#4f4f4f]"
          }
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        {state === "recording" ? (
          // Stop icon
          <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : state === "processing" ? (
          // Spinner
          <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          // Mic icon
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        )}
      </button>

      {/* Status text */}
      <div className="text-center">
        {state === "recording" && (
          <div className="text-red-400 text-sm font-medium">
            Recording... {formatDuration(duration)}
          </div>
        )}
        {state === "processing" && (
          <div className="text-[#9b9b9b] text-sm">
            Transcribing...
          </div>
        )}
        {state === "idle" && !error && !audioUrl && (
          <div className="text-[#6b6b6b] text-sm">
            Tap to record
          </div>
        )}
        {error && (
          <div className="text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Audio playback */}
      {audioUrl && state === "idle" && (
        <div className="flex items-center gap-3 bg-[#1a1a1a] px-4 py-2 rounded-lg">
          <audio 
            ref={audioRef} 
            src={audioUrl} 
            onEnded={() => setIsPlaying(false)}
            className="hidden"
          />
          <button
            onClick={togglePlayback}
            className="w-10 h-10 flex items-center justify-center bg-[#3f3f3f] hover:bg-[#4f4f4f] rounded-full text-white"
          >
            {isPlaying ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <span className="text-xs text-[#9b9b9b]">Play recording</span>
        </div>
      )}
    </div>
  );
}
