import { NextRequest, NextResponse } from "next/server";

// Cache models for 1 hour to avoid hitting OpenRouter too often
let cachedModels: OpenRouterModel[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
    image?: string;
  };
  top_provider?: {
    is_moderated: boolean;
  };
  architecture?: {
    modality: string;
    tokenizer: string;
    instruct_type?: string;
  };
}

interface TransformedModel {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextLength: number;
  vision: boolean;
  imageGeneration: boolean;
  pricing: {
    prompt: number;
    completion: number;
  };
}

function transformModel(model: OpenRouterModel): TransformedModel {
  // Extract provider from model ID (e.g., "openai/gpt-4" -> "OpenAI")
  const providerMap: Record<string, string> = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "google": "Google",
    "meta-llama": "Meta",
    "mistralai": "Mistral",
    "deepseek": "DeepSeek",
    "cohere": "Cohere",
    "perplexity": "Perplexity",
    "x-ai": "xAI",
    "nousresearch": "Nous Research",
    "01-ai": "01.AI",
    "qwen": "Qwen",
    "microsoft": "Microsoft",
    "amazon": "Amazon",
    "nvidia": "NVIDIA",
    "databricks": "Databricks",
    "inflection": "Inflection",
    "neversleep": "NeverSleep",
    "sao10k": "Sao10k",
    "aetherwiing": "Aetherwiing",
    "pygmalionai": "PygmalionAI",
    "stability": "Stability AI",
    "black-forest-labs": "Black Forest Labs",
    "ideogram": "Ideogram",
    "recraft": "Recraft",
  };

  const providerId = model.id.split("/")[0];
  const provider = providerMap[providerId] || providerId;

  // Strip provider prefix from name if present (e.g., "Google: Gemini 3.1" -> "Gemini 3.1")
  let cleanName = model.name;
  // Check for "Provider: Model" or "Provider : Model" pattern
  const colonIndex = cleanName.indexOf(":");
  if (colonIndex !== -1 && colonIndex < 20) {
    cleanName = cleanName.substring(colonIndex + 1).trim();
  }

  // Check modality for vision/image generation support
  // Modality examples:
  // - "text->text" = text only
  // - "text+image->text" = vision (can see images)
  // - "text->image" = image generation
  // - "image" = image generation only
  const modality = model.architecture?.modality || "";
  
  // Vision: can accept image input (image appears BEFORE the arrow, like "text+image->text")
  // Look for "image->" pattern but NOT "->image" which is output
  const arrowIndex = modality.indexOf("->");
  const inputPart = arrowIndex !== -1 ? modality.substring(0, arrowIndex) : modality;
  const outputPart = arrowIndex !== -1 ? modality.substring(arrowIndex + 2) : "";
  
  const hasVision = inputPart.includes("image");
  
  // Image generation: produces images (image appears AFTER the arrow)
  const isImageGen = outputPart.includes("image") || modality === "image";

  return {
    id: model.id,
    name: cleanName,
    provider,
    description: model.description,
    contextLength: model.context_length,
    vision: hasVision,
    imageGeneration: isImageGen,
    pricing: {
      prompt: parseFloat(model.pricing.prompt) || 0,
      completion: parseFloat(model.pricing.completion) || 0,
    },
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search") || "";
  const forceRefresh = searchParams.get("refresh") === "true";

  // Check cache
  if (!forceRefresh && cachedModels && Date.now() - cacheTimestamp < CACHE_DURATION) {
    const filtered = filterModels(cachedModels, search);
    return NextResponse.json({ models: filtered.map(transformModel) });
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    cachedModels = data.data as OpenRouterModel[];
    cacheTimestamp = Date.now();

    const filtered = filterModels(cachedModels, search);
    return NextResponse.json({ models: filtered.map(transformModel) });
  } catch (error) {
    console.error("Failed to fetch models:", error);
    return NextResponse.json(
      { error: "Failed to fetch models from OpenRouter" },
      { status: 500 }
    );
  }
}

function filterModels(models: OpenRouterModel[], search: string): OpenRouterModel[] {
  if (!search) return models;
  
  const lowerSearch = search.toLowerCase();
  return models.filter(
    (m) =>
      m.id.toLowerCase().includes(lowerSearch) ||
      m.name.toLowerCase().includes(lowerSearch)
  );
}
