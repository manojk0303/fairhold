import "server-only";
import OpenAI from "openai";
import { z } from "zod/v4";

/**
 * Provider-neutral LLM layer. Every agent in Fairhold is a tool-calling loop over an
 * OpenAI-compatible Chat Completions endpoint, so it runs on free tiers:
 *   - Groq       (GROQ_API_KEY)        default model openai/gpt-oss-120b
 *   - Gemini     (GEMINI_API_KEY)      default model gemini-2.5-flash (supports images)
 *   - OpenRouter (OPENROUTER_API_KEY)  default model openai/gpt-oss-120b:free
 * Pick explicitly with LLM_PROVIDER, override the model with LLM_MODEL.
 */

type Provider = "groq" | "gemini" | "openrouter";

const PRESETS: Record<Provider, { baseURL: string; keyEnv: string; model: string; vision: boolean; maxToolChars: number }> = {
  groq: { baseURL: "https://api.groq.com/openai/v1", keyEnv: "GROQ_API_KEY", model: "openai/gpt-oss-120b", vision: false, maxToolChars: 8000 },
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    keyEnv: "GEMINI_API_KEY",
    model: "gemini-2.5-flash",
    vision: true,
    maxToolChars: 30000,
  },
  openrouter: { baseURL: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY", model: "openai/gpt-oss-120b:free", vision: false, maxToolChars: 16000 },
};

function provider(): Provider | null {
  const explicit = process.env.LLM_PROVIDER as Provider | undefined;
  if (explicit && PRESETS[explicit]) return explicit;
  return (Object.keys(PRESETS) as Provider[]).find((p) => process.env[PRESETS[p].keyEnv]) ?? null;
}

export function llmInfo() {
  const p = provider();
  if (!p) return { ready: false, provider: null, model: null, vision: false };
  const preset = PRESETS[p];
  return {
    ready: Boolean(process.env[preset.keyEnv]),
    provider: p,
    model: process.env.LLM_MODEL || preset.model,
    vision: process.env.LLM_VISION ? process.env.LLM_VISION === "1" : preset.vision,
  };
}

let _client: { key: string; client: OpenAI } | null = null;
function client() {
  const p = provider();
  if (!p) throw new Error("No LLM provider configured. Set GROQ_API_KEY, GEMINI_API_KEY or OPENROUTER_API_KEY.");
  const preset = PRESETS[p];
  const apiKey = process.env[preset.keyEnv];
  if (!apiKey) throw new Error(`${preset.keyEnv} is not set.`);
  if (!_client || _client.key !== p) {
    _client = {
      key: p,
      client: new OpenAI({
        apiKey,
        baseURL: process.env.LLM_BASE_URL || preset.baseURL,
        maxRetries: 5, // free tiers rate-limit; the SDK honours retry-after on 429
        timeout: 90_000,
        defaultHeaders: p === "openrouter" ? { "X-Title": "Fairhold" } : undefined,
      }),
    };
  }
  return { client: _client.client, preset, model: process.env.LLM_MODEL || preset.model };
}

/* ---------------- Tools ---------------- */

export type AgentTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema (object)
  run: (args: Record<string, unknown>) => Promise<string>;
};

/** Define a tool from a Zod schema; arguments are validated before `run` sees them. */
export function tool<S extends z.ZodType>(def: {
  name: string;
  description: string;
  schema: S;
  run: (args: z.infer<S>) => Promise<string> | string;
}): AgentTool {
  const json = z.toJSONSchema(def.schema, { target: "draft-7" }) as Record<string, unknown>;
  delete json.$schema;
  return {
    name: def.name,
    description: def.description,
    parameters: json,
    run: async (raw) => {
      const parsed = def.schema.safeParse(raw);
      if (!parsed.success) {
        return `ERROR: invalid arguments for ${def.name}: ${parsed.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ")}. Call the tool again with corrected arguments.`;
      }
      return def.run(parsed.data);
    },
  };
}

/* ---------------- Agent loop ---------------- */

export type AgentResult = { text: string; model: string; finished: boolean };

/**
 * Runs a tool-calling loop. If `finishTool` is given, the loop ends as soon as that tool is
 * called successfully (its `run` should capture the result). Otherwise it ends when the model
 * replies without tool calls.
 */
export async function runAgent(opts: {
  system: string;
  user: string;
  image?: { mediaType: string; base64: string } | null;
  history?: { role: "user" | "assistant"; content: string }[];
  tools: AgentTool[];
  finishTool?: string;
  maxSteps?: number;
}): Promise<AgentResult> {
  const { client: c, preset, model } = client();
  const info = llmInfo();
  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [{ type: "text", text: opts.user }];
  if (opts.image && info.vision) {
    userContent.unshift({ type: "image_url", image_url: { url: `data:${opts.image.mediaType};base64,${opts.image.base64}` } });
  }
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: opts.system },
    ...(opts.history ?? []).map((m) => ({ role: m.role, content: m.content }) as OpenAI.Chat.ChatCompletionMessageParam),
    { role: "user", content: userContent.length === 1 ? opts.user : userContent },
  ];
  const tools: OpenAI.Chat.ChatCompletionTool[] = opts.tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description.slice(0, 1000), parameters: t.parameters },
  }));
  const byName = new Map(opts.tools.map((t) => [t.name, t]));
  const maxSteps = opts.maxSteps ?? 10;
  let finished = false;
  let lastText = "";

  for (let step = 0; step < maxSteps && !finished; step++) {
    const nearlyOut = step >= maxSteps - 2;
    const tModel = Date.now();
    let res: OpenAI.Chat.ChatCompletion | null = null;
    for (let attempt = 0; attempt < 3 && !res; attempt++) {
      try {
        res = await c.chat.completions.create({
          model,
          messages,
          tools,
          // With a finish tool, insist on tool calls so the model can't drift into prose.
          tool_choice: opts.finishTool ? "required" : "auto",
          temperature: attempt === 0 ? 0 : 0.4,
        });
      } catch (e) {
        // Groq validates tool arguments server-side and rejects the whole turn on a bad call.
        // Feed the validation error back and let the model try again.
        const err = e as { status?: number; code?: string; error?: { message?: string } };
        if (err.status === 400 && err.code === "tool_use_failed" && attempt < 2) {
          messages.push({
            role: "user",
            content: `Your last tool call was rejected: ${err.error?.message ?? "invalid arguments"}. Omit optional fields instead of sending null, and call the tool again with valid arguments.`,
          });
          continue;
        }
        throw e;
      }
    }
    if (!res) throw new Error("The model could not produce a valid tool call.");
    if (process.env.LLM_DEBUG) console.log(`[llm] step ${step} model ${Date.now() - tModel}ms tokens=${res.usage?.total_tokens}`);
    const msg = res.choices[0]?.message;
    if (!msg) throw new Error("The model returned no message.");
    lastText = msg.content ?? lastText;
    const calls = (msg.tool_calls ?? []).filter((tc) => tc.type === "function");
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls.length ? calls : undefined });
    if (!calls.length) {
      if (!opts.finishTool) break;
      messages.push({ role: "user", content: `Call ${opts.finishTool} now with your final answer.` });
      continue;
    }
    for (const call of calls) {
      const t = byName.get(call.function.name);
      let out: string;
      if (!t) out = `ERROR: unknown tool ${call.function.name}`;
      else {
        let args: Record<string, unknown> = {};
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          out = "ERROR: arguments were not valid JSON. Call the tool again.";
          messages.push({ role: "tool", tool_call_id: call.id, content: out });
          continue;
        }
        try {
          const tTool = Date.now();
          out = await t.run(args);
          if (process.env.LLM_DEBUG) console.log(`[llm] tool ${call.function.name} ${Date.now() - tTool}ms`);
        } catch (e) {
          out = `ERROR: ${(e as Error).message}`;
        }
        if (opts.finishTool && call.function.name === opts.finishTool && !out.startsWith("ERROR")) finished = true;
      }
      if (out.length > preset.maxToolChars) out = out.slice(0, preset.maxToolChars) + "\n…(truncated)";
      messages.push({ role: "tool", tool_call_id: call.id, content: out });
    }
    if (nearlyOut && opts.finishTool && !finished) {
      messages.push({ role: "user", content: `You are out of steps. Call ${opts.finishTool} now with your best final answer.` });
    }
  }
  return { text: lastText.trim(), model, finished };
}
