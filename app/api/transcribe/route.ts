import { NextRequest, NextResponse } from "next/server";
import { pipeline } from "@xenova/transformers";

// Cache the pipeline for reuse
let transcriber: Awaited<ReturnType<typeof pipeline>> | null = null;

async function getTranscriber() {
  if (!transcriber) {
    console.log("Loading Whisper model (first time may take a minute)...");
    transcriber = await pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-small", // Good balance of speed and accuracy
      { 
        progress_callback: undefined 
      }
    );
    console.log("Whisper model loaded!");
  }
  return transcriber;
}

// Parse WAV file and extract Float32Array audio data
function parseWav(buffer: ArrayBuffer): { audioData: Float32Array; sampleRate: number } {
  const view = new DataView(buffer);
  
  // Read WAV header
  const numChannels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);
  
  // Find data chunk
  const dataOffset = 44;
  const dataSize = view.getUint32(40, true);
  
  // Convert to Float32Array
  const numSamples = dataSize / (bitsPerSample / 8) / numChannels;
  const audioData = new Float32Array(numSamples);
  
  for (let i = 0; i < numSamples; i++) {
    const sampleIndex = dataOffset + i * numChannels * (bitsPerSample / 8);
    // Read first channel only (mono)
    if (bitsPerSample === 16) {
      const sample = view.getInt16(sampleIndex, true);
      audioData[i] = sample / 32768;
    } else if (bitsPerSample === 32) {
      const sample = view.getFloat32(sampleIndex, true);
      audioData[i] = sample;
    }
  }
  
  return { audioData, sampleRate };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;
    
    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }
    
    // Read audio file as ArrayBuffer
    const arrayBuffer = await audioFile.arrayBuffer();
    
    // Parse WAV file
    const { audioData, sampleRate } = parseWav(arrayBuffer);
    
    console.log(`Audio: ${audioData.length} samples at ${sampleRate}Hz`);
    
    // Get or load the transcriber
    const pipe = await getTranscriber();
    
    // Transcribe the audio - pass raw audio data directly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (pipe as any)(audioData, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: "english",
      task: "transcribe",
      sampling_rate: sampleRate,
    });
    
    // Extract text from result
    const text = typeof result === "object" && "text" in result 
      ? (result as { text: string }).text 
      : String(result);
    
    return NextResponse.json({ text: text.trim() });
  } catch (error) {
    console.error("Transcription error:", error);
    
    return NextResponse.json(
      { error: "Transcription failed", details: String(error) }, 
      { status: 500 }
    );
  }
}
