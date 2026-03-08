import { NextRequest, NextResponse } from "next/server";

// Cache OpenRouter models for 1 hour to avoid hitting OpenRouter too often
let cachedOpenRouterModels: OpenRouterModel[] | null = null;
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

interface AzureFoundryModel {
  id?: string;
  name?: string;
  description?: string;
  context_length?: number;
  max_context_length?: number;
  capabilities?: {
    vision?: boolean;
  };
  modalities?: {
    input?: string[];
    output?: string[];
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

function transformAzureFoundryModel(model: AzureFoundryModel): TransformedModel {
  const modelId = model.id || model.name || "unknown-model";
  const displayName = model.name || model.id || "Unknown model";

  const inputModalities = model.modalities?.input || [];
  const hasVisionByModality = inputModalities.some((entry) => entry.toLowerCase().includes("image"));

  return {
    id: modelId,
    name: displayName,
    provider: "Azure Foundry",
    description: model.description,
    contextLength: model.context_length || model.max_context_length || 0,
    vision: Boolean(model.capabilities?.vision) || hasVisionByModality,
    imageGeneration: false,
    pricing: {
      prompt: 0,
      completion: 0,
    },
  };
}

function normaliseEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "");
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search") || "";
  const forceRefresh = searchParams.get("refresh") === "true";
  const provider = searchParams.get("provider") || "openrouter";

  if (provider === "azure-foundry") {
    const apiKey = request.headers.get("x-provider-api-key") || "";
    const endpoint = request.headers.get("x-provider-endpoint") || "";

    if (!apiKey || !endpoint) {
      return NextResponse.json(
        { error: "Azure Foundry API key and endpoint are required" },
        { status: 400 }
      );
    }

    try {
      const baseUrl = normaliseEndpoint(endpoint);
      const response = await fetch(`${baseUrl}/models?api-version=2024-05-01-preview`, {
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey,
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Azure Foundry models API error: ${response.status} ${body}`);
      }

      const data = await response.json();
      const sourceModels: AzureFoundryModel[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.models)
            ? data.models
            : [];

      const filtered = filterAzureFoundryModels(sourceModels, search);
      const transformed = filtered.map(transformAzureFoundryModel);
      return NextResponse.json({ models: transformed });
    } catch (error) {
      console.error("Failed to fetch Azure Foundry models:", error);
      return NextResponse.json(
        { error: "Failed to fetch models from Azure Foundry" },
        { status: 500 }
      );
    }
  }

  // Check cache
  if (!forceRefresh && cachedOpenRouterModels && Date.now() - cacheTimestamp < CACHE_DURATION) {
    const filtered = filterOpenRouterModels(cachedOpenRouterModels, search);
    const transformed = filtered.map(transformModel).filter(m => !m.imageGeneration);
    return NextResponse.json({ models: transformed });
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
  cachedOpenRouterModels = data.data as OpenRouterModel[];
    cacheTimestamp = Date.now();

  const filtered = filterOpenRouterModels(cachedOpenRouterModels, search);
    const transformed = filtered.map(transformModel).filter(m => !m.imageGeneration);
    return NextResponse.json({ models: transformed });
  } catch (error) {
    console.error("Failed to fetch models:", error);
    return NextResponse.json(
        { error: "Failed to fetch models from OpenRouter" },
      { status: 500 }
    );
  }
}

function filterOpenRouterModels(models: OpenRouterModel[], search: string): OpenRouterModel[] {
  if (!search) return models;
  
  const lowerSearch = search.toLowerCase();
  return models.filter(
    (m) =>
      m.id.toLowerCase().includes(lowerSearch) ||
      m.name.toLowerCase().includes(lowerSearch)
  );
}

function filterAzureFoundryModels(models: AzureFoundryModel[], search: string): AzureFoundryModel[] {
  if (!search) return models;

  const lowerSearch = search.toLowerCase();
  return models.filter((model) => {
    const id = (model.id || "").toLowerCase();
    const name = (model.name || "").toLowerCase();
    const description = (model.description || "").toLowerCase();
    return id.includes(lowerSearch) || name.includes(lowerSearch) || description.includes(lowerSearch);
  });
}
