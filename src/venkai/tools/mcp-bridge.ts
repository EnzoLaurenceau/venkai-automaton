/**
 * Venkai MCP Bridge — expose any MCP server's tools (e.g. Trading Lab, 43 tools) as AutomatonTools.
 * Generic JSON-RPC over HTTP (tools/list, tools/call). No SDK dependency.
 */

import type { AutomatonTool, ToolContext, RiskLevel } from "../../types.js";

export interface McpToolSpec {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpClient {
  listTools(): Promise<McpToolSpec[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

/** Minimal MCP HTTP client (JSON-RPC 2.0, streamable-http compatible endpoint). */
export function createMcpClient(endpoint: string, fetcher: typeof fetch = fetch, headers: Record<string, string> = {}): McpClient {
  let nextId = 1;
  async function rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    const res = await fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    });
    if (!res.ok) throw new Error(`mcp ${method}: HTTP ${res.status}`);
    const text = await res.text();
    // tolerate SSE framing
    const jsonLine = text.split("\n").find((l) => l.trim().startsWith("{"));
    const json = JSON.parse(jsonLine ?? text) as { result?: unknown; error?: { message?: string } };
    if (json.error) throw new Error(`mcp ${method}: ${json.error.message ?? "error"}`);
    return json.result;
  }
  return {
    async listTools() {
      const result = (await rpc("tools/list", {})) as { tools?: McpToolSpec[] };
      return result.tools ?? [];
    },
    async callTool(name, args) {
      return rpc("tools/call", { name, arguments: args });
    },
  };
}

/** Build AutomatonTools from an MCP server (async because tools/list is remote). */
export async function loadMcpBridgeTools(
  client: McpClient,
  options: { category?: AutomatonTool["category"]; riskLevel?: RiskLevel; namePrefix?: string } = {},
): Promise<AutomatonTool[]> {
  const specs = await client.listTools();
  const prefix = options.namePrefix ?? "";
  return specs.map((spec) => ({
    name: `${prefix}${spec.name}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64),
    description: spec.description ?? `MCP tool ${spec.name}`,
    parameters: spec.inputSchema ?? { type: "object", properties: {} },
    riskLevel: options.riskLevel ?? "caution",
    category: options.category ?? "conway",
    execute: async (args: Record<string, unknown>, _context: ToolContext): Promise<string> => {
      const result = await client.callTool(spec.name, args);
      return typeof result === "string" ? result : JSON.stringify(result);
    },
  }));
}

/** Trading Lab preset: uses VENKAI_TRADINGLAB_MCP_URL (e.g. https://tl.venkai.fr/mcp). */
export function tradingLabClient(fetcher: typeof fetch = fetch): McpClient | null {
  const endpoint = process.env.VENKAI_TRADINGLAB_MCP_URL;
  if (!endpoint) return null;
  const headers: Record<string, string> = process.env.VENKAI_TRADINGLAB_TOKEN ? { Authorization: `Bearer ${process.env.VENKAI_TRADINGLAB_TOKEN}` } : {};
  return createMcpClient(endpoint, fetcher, headers);
}
