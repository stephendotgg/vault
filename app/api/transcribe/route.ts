import { NextRequest, NextResponse } from "next/server";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

let transcribeRequestCount = 0;

function debugLog(message: string, payload?: unknown) {
  const stamp = new Date().toISOString();
  const details = payload === undefined ? "" : ` ${typeof payload === "string" ? payload : JSON.stringify(payload)}`;
  const line = `[TRANSCRIBE ${stamp}] ${message}${details}`;
  console.log(line);

  try {
    const baseDir = process.env.MOTHERSHIP_DATA_DIR || join(process.cwd(), "data", "temp");
    mkdirSync(baseDir, { recursive: true });
    appendFileSync(join(baseDir, "calls-debug.log"), `${line}\n`, "utf8");
  } catch {
    // Ignore file logging failures
  }
}

function getAzureSpeechConfig(request: NextRequest): { key: string; region: string; language: string } {
  const key =
    request.headers.get("x-vault-azure-speech-key")?.trim() ||
    process.env.AZURE_SPEECH_KEY?.trim() ||
    "";
  const region =
    request.headers.get("x-vault-azure-speech-region")?.trim() ||
    process.env.AZURE_SPEECH_REGION?.trim() ||
    "";
  const language =
    request.headers.get("x-vault-azure-speech-language")?.trim() ||
    process.env.AZURE_SPEECH_LANGUAGE?.trim() ||
    "en-US";

  return { key, region, language };
}

async function transcribeWithAzureSpeech(params: {
  audioBuffer: Buffer;
  key: string;
  region: string;
  language: string;
  requestId: number;
}) {
  const { audioBuffer, key, region, language, requestId } = params;
  const endpoint = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(language)}&format=simple`;

  debugLog("azure transcription request", {
    requestId,
    region,
    language,
    bytes: audioBuffer.byteLength,
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
      Accept: "application/json",
    },
    body: new Uint8Array(audioBuffer),
  });

  const raw = await response.text();
  let parsed: { DisplayText?: string; RecognitionStatus?: string; error?: { message?: string } } | null = null;

  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const details = parsed?.error?.message || raw || `Azure Speech error (${response.status})`;
    throw new Error(details);
  }

  const recognitionStatus = parsed?.RecognitionStatus || "Unknown";
  const displayText = (parsed?.DisplayText || "").trim();

  debugLog("azure transcription response", {
    requestId,
    recognitionStatus,
    textLength: displayText.length,
  });

  if (recognitionStatus !== "Success") {
    return "";
  }

  return displayText;
}

export async function POST(request: NextRequest) {
  const requestId = ++transcribeRequestCount;
  try {
    debugLog("request received", { requestId });
    const { key, region, language } = getAzureSpeechConfig(request);
    if (!key || !region) {
      return NextResponse.json(
        { error: "Azure Speech credentials missing. Set key and region in Settings → API Keys." },
        { status: 400 }
      );
    }

    const contentType = request.headers.get("content-type") || "";
    let nodeBuffer: Buffer;

    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      const wavBase64 = typeof body?.wavBase64 === "string" ? body.wavBase64 : "";

      if (!wavBase64) {
        debugLog("missing wavBase64 in JSON payload", { requestId });
        return NextResponse.json({ error: "No wavBase64 provided" }, { status: 400 });
      }

      nodeBuffer = Buffer.from(wavBase64, "base64");
      debugLog("decoded JSON wav payload", { requestId, bytes: nodeBuffer.byteLength, source: body?.source || "unknown" });
    } else {
      const formData = await request.formData();
      const audioFile = formData.get("audio") as File;

      if (!audioFile) {
        debugLog("missing audio file", { requestId });
        return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
      }

      debugLog("audio file size", { requestId, bytes: audioFile.size });
      nodeBuffer = Buffer.from(await audioFile.arrayBuffer());
      debugLog("read arrayBuffer", { requestId, bytes: nodeBuffer.byteLength });
    }

    const text = await transcribeWithAzureSpeech({
      audioBuffer: nodeBuffer,
      key,
      region,
      language,
      requestId,
    });

    debugLog("transcription result", { requestId, textLength: text.length });
    
    return NextResponse.json({ text });
  } catch (error) {
    debugLog("transcription error", { requestId, error: String(error) });
    
    return NextResponse.json(
      { error: "Transcription failed", details: String(error) }, 
      { status: 500 }
    );
  }
}
