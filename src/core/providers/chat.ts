import type { Provider } from "../../contracts/state.js";

export type ProviderChatRole = "system" | "user" | "assistant";

export interface ProviderChatMessage {
  role: ProviderChatRole;
  content: string;
}

export interface ProviderChatRequest {
  provider: Provider;
  modelId: string;
  apiKey: string;
  messages: ProviderChatMessage[];
  maxOutputTokens?: number;
}

function parseOpenAiText(choice: unknown): string {
  const message = (choice as { message?: { content?: unknown } })?.message;
  const content = message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        return (part as { text?: string })?.text ?? "";
      })
      .join("\n")
      .trim();
    return joined;
  }

  return "";
}

async function readErrorBody(res: Response): Promise<string> {
  const body = await res.text();
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.slice(0, 240);
}

async function generateOpenAiChat(request: ProviderChatRequest): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.modelId,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      max_completion_tokens: request.maxOutputTokens ?? 900,
    }),
  });

  if (!res.ok) {
    const body = await readErrorBody(res);
    throw new Error(`OpenAI chat request failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  };

  const text = parseOpenAiText(json.choices?.[0]);
  if (!text) {
    throw new Error("OpenAI response did not include text output.");
  }
  return text;
}

async function generateGoogleChat(request: ProviderChatRequest): Promise<string> {
  const modelPath = request.modelId.startsWith("models/") ? request.modelId : `models/${request.modelId}`;
  const systemMessage = request.messages.find((message) => message.role === "system")?.content ?? "";
  const conversation = request.messages.filter((message) => message.role !== "system");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(request.apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: systemMessage ? { parts: [{ text: systemMessage }] } : undefined,
        contents: conversation.map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        })),
        generationConfig: {
          maxOutputTokens: request.maxOutputTokens ?? 900,
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await readErrorBody(res);
    throw new Error(`Google chat request failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text =
    json.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("\n")
      .trim() ?? "";

  if (!text) {
    throw new Error("Google response did not include text output.");
  }

  return text;
}

async function generateAnthropicChat(request: ProviderChatRequest): Promise<string> {
  const systemMessage = request.messages.find((message) => message.role === "system")?.content ?? "";
  const conversation = request.messages.filter((message) => message.role !== "system");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": request.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: request.modelId,
      max_tokens: request.maxOutputTokens ?? 900,
      system: systemMessage,
      messages: conversation.map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      })),
    }),
  });

  if (!res.ok) {
    const body = await readErrorBody(res);
    throw new Error(`Anthropic chat request failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as {
    content?: Array<{
      type: string;
      text?: string;
    }>;
  };

  const text =
    json.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n")
      .trim() ?? "";

  if (!text) {
    throw new Error("Anthropic response did not include text output.");
  }

  return text;
}

export async function generateProviderChatCompletion(request: ProviderChatRequest): Promise<string> {
  if (request.provider === "openai") {
    return generateOpenAiChat(request);
  }

  if (request.provider === "google") {
    return generateGoogleChat(request);
  }

  return generateAnthropicChat(request);
}
