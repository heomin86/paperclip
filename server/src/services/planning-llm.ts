import Anthropic from "@anthropic-ai/sdk";

const PLANNING_MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 2048;

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

/**
 * Lightweight LLM call for interactive planning.
 * Bypasses the full adapter/heartbeat machinery for fast, low-latency responses.
 */
export async function planningLLMCall(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt: string,
): Promise<string> {
  const client = getClient();
  const response = await client.messages.create({
    model: PLANNING_MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages,
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  return textBlock ? textBlock.text : "";
}
