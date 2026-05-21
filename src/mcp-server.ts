#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { PiBridge } from "./bridge.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const bridge = new PiBridge(config);

const server = new McpServer(
  {
    name: "claude-pi-bridge",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

function makeErrorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

function makeSuccessResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

// ---------------------------------------------------------------------------
// 1. pi_spawn
// ---------------------------------------------------------------------------
server.registerTool(
  "pi_spawn",
  {
    description: "Spawn a new Pi coding agent.",
    inputSchema: {
      name: z.string().describe("Unique agent identifier"),
      cwd: z.string().describe("Working directory for the agent"),
      provider: z.string().optional().describe("LLM provider (default from config)"),
      model: z.string().optional().describe("Model ID (default from config)"),
      thinkingLevel: z.enum(["off", "minimal", "low", "medium", "high", "xhigh"]).optional().describe("Thinking level"),
      initialPrompt: z.string().optional().describe("Optional initial prompt to send after spawning"),
    },
  },
  async (args) => {
    try {
      await bridge.spawn(args.name, {
        cwd: args.cwd,
        provider: args.provider,
        model: args.model,
        thinkingLevel: args.thinkingLevel,
        initialPrompt: args.initialPrompt,
      });
      return makeSuccessResult(`Agent "${args.name}" spawned successfully.`);
    } catch (err) {
      return makeErrorResult(err instanceof Error ? err.message : String(err));
    }
  },
);

// ---------------------------------------------------------------------------
// 2. pi_prompt
// ---------------------------------------------------------------------------
server.registerTool(
  "pi_prompt",
  {
    description: "Send a prompt message to a running Pi agent.",
    inputSchema: {
      id: z.string().describe("Agent identifier"),
      message: z.string().describe("Message to send"),
    },
  },
  async (args) => {
    try {
      await bridge.prompt(args.id, args.message);
      return makeSuccessResult(`Prompt sent to agent "${args.id}".`);
    } catch (err) {
      return makeErrorResult(err instanceof Error ? err.message : String(err));
    }
  },
);

// ---------------------------------------------------------------------------
// 3. pi_steer
// ---------------------------------------------------------------------------
server.registerTool(
  "pi_steer",
  {
    description: "Interrupt a Pi agent mid-task with a steering message.",
    inputSchema: {
      id: z.string().describe("Agent identifier"),
      message: z.string().describe("Steering message"),
    },
  },
  async (args) => {
    try {
      await bridge.steer(args.id, args.message);
      return makeSuccessResult(`Steer message sent to agent "${args.id}".`);
    } catch (err) {
      return makeErrorResult(err instanceof Error ? err.message : String(err));
    }
  },
);

// ---------------------------------------------------------------------------
// 4. pi_get_state
// ---------------------------------------------------------------------------
server.registerTool(
  "pi_get_state",
  {
    description: "Get the current state of a Pi agent.",
    inputSchema: {
      id: z.string().describe("Agent identifier"),
    },
  },
  async (args) => {
    try {
      const state = await bridge.getState(args.id);
      return makeSuccessResult(JSON.stringify(state, null, 2));
    } catch (err) {
      return makeErrorResult(err instanceof Error ? err.message : String(err));
    }
  },
);

// ---------------------------------------------------------------------------
// 5. pi_get_result
// ---------------------------------------------------------------------------
server.registerTool(
  "pi_get_result",
  {
    description: "Wait for the agent to become idle and return the last assistant text.",
    inputSchema: {
      id: z.string().describe("Agent identifier"),
      timeout: z.number().optional().describe("Timeout in milliseconds"),
    },
  },
  async (args) => {
    try {
      const result = await bridge.getResult(args.id, args.timeout);
      return makeSuccessResult(result);
    } catch (err) {
      return makeErrorResult(err instanceof Error ? err.message : String(err));
    }
  },
);

// ---------------------------------------------------------------------------
// 6. pi_list
// ---------------------------------------------------------------------------
server.registerTool(
  "pi_list",
  {
    description: "List all running Pi agents.",
    inputSchema: {},
  },
  async () => {
    try {
      const agents = bridge.list();
      return makeSuccessResult(JSON.stringify(agents, null, 2));
    } catch (err) {
      return makeErrorResult(err instanceof Error ? err.message : String(err));
    }
  },
);

// ---------------------------------------------------------------------------
// 7. pi_stop
// ---------------------------------------------------------------------------
server.registerTool(
  "pi_stop",
  {
    description: "Kill a running Pi agent.",
    inputSchema: {
      id: z.string().describe("Agent identifier"),
    },
  },
  async (args) => {
    try {
      await bridge.stop(args.id);
      return makeSuccessResult(`Agent "${args.id}" stopped.`);
    } catch (err) {
      return makeErrorResult(err instanceof Error ? err.message : String(err));
    }
  },
);

// ---------------------------------------------------------------------------
// 8. pi_bash
// ---------------------------------------------------------------------------
server.registerTool(
  "pi_bash",
  {
    description: "Run a bash command via a Pi agent.",
    inputSchema: {
      id: z.string().describe("Agent identifier"),
      command: z.string().describe("Bash command to execute"),
    },
  },
  async (args) => {
    try {
      const result = await bridge.bash(args.id, args.command);
      return makeSuccessResult(JSON.stringify(result, null, 2));
    } catch (err) {
      return makeErrorResult(err instanceof Error ? err.message : String(err));
    }
  },
);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("claude-pi-bridge MCP server running on stdio");
}

process.on("SIGINT", async () => {
  await bridge.stopAll();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await bridge.stopAll();
  process.exit(0);
});

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
