import "server-only";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { AgentTool } from "./llm";

/**
 * Bridges PayPal's official Agent Toolkit (@paypal/agent-toolkit) into Fairhold's agent tools.
 * The toolkit exposes PayPal operations (orders, invoices, disputes, transactions, refunds…) as
 * agent tools; we convert each one to an OpenAI-style function tool so any model can call PayPal.
 */

type ToolkitTool = {
  description?: string;
  parameters: Parameters<typeof zodToJsonSchema>[0];
  execute: (args: unknown, opts?: unknown) => Promise<unknown>;
};

/** Drop zod-to-json-schema artefacts ({"not":{}} branches, one-element anyOf) that some providers reject. */
function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== "object") return node;
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) o[k] = clean(v);
  if (Array.isArray(o.anyOf)) {
    const branches = (o.anyOf as Record<string, unknown>[]).filter(
      (b) => !(b && typeof b === "object" && "not" in b && Object.keys(b).length === 1),
    );
    if (branches.length === 1) {
      const { anyOf: _drop, ...rest } = o; // eslint-disable-line @typescript-eslint/no-unused-vars
      return { ...rest, ...(branches[0] as object) };
    }
    o.anyOf = branches;
  }
  return o;
}

export type ToolkitActions = Record<string, Record<string, boolean>>;

export async function paypalToolkitTools(
  actions: ToolkitActions,
  onCall?: (name: string, args: unknown) => void | Promise<void>,
): Promise<AgentTool[]> {
  const { PayPalAgentToolkit } = await import("@paypal/agent-toolkit/ai-sdk");
  const toolkit = new PayPalAgentToolkit({
    clientId: process.env.PAYPAL_CLIENT_ID!,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
    configuration: { actions, context: { sandbox: true } },
  });
  const tools = toolkit.getTools() as unknown as Record<string, ToolkitTool>;

  return Object.entries(tools).map(([name, t]) => {
    const schema = clean(zodToJsonSchema(t.parameters, { target: "jsonSchema7", $refStrategy: "none" })) as Record<string, unknown>;
    delete schema.$schema;
    if (schema.type !== "object") Object.assign(schema, { type: "object", properties: {} });
    return {
      name: `paypal_${name}`,
      description: `[PayPal Agent Toolkit] ${(t.description ?? name).trim().slice(0, 900)}`,
      parameters: schema,
      run: async (args) => {
        await onCall?.(name, args);
        try {
          const out = await t.execute(args, { toolCallId: name, messages: [] });
          return typeof out === "string" ? out : JSON.stringify(out);
        } catch (e) {
          return `ERROR calling PayPal: ${(e as Error).message}`;
        }
      },
    };
  });
}
