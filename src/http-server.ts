#!/usr/bin/env node
import { createServer, IncomingMessage } from "node:http";
import { PiBridge } from "./bridge.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const bridge = new PiBridge(config);
const PORT = parseInt(process.env.CLAUDE_PI_BRIDGE_PORT ?? "9090", 10);

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: string) => { data += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  try {
    const body = await readBody(req);
    switch (url.pathname) {
      case "/spawn": {
        const { name, cwd, provider, model, thinkingLevel, initialPrompt } = body;
        await bridge.spawn(String(name), {
          cwd: String(cwd),
          provider: provider ? String(provider) : undefined,
          model: model ? String(model) : undefined,
          thinkingLevel: thinkingLevel as any,
          initialPrompt: initialPrompt ? String(initialPrompt) : undefined,
        });
        res.end(JSON.stringify({ ok: true }));
        break;
      }
      case "/prompt": {
        await bridge.prompt(String(body.id), String(body.message));
        res.end(JSON.stringify({ ok: true }));
        break;
      }
      case "/steer": {
        await bridge.steer(String(body.id), String(body.message));
        res.end(JSON.stringify({ ok: true }));
        break;
      }
      case "/state": {
        const state = await bridge.getState(String(body.id));
        res.end(JSON.stringify({ ok: true, state }));
        break;
      }
      case "/result": {
        const result = await bridge.getResult(String(body.id), body.timeout ? Number(body.timeout) : undefined);
        res.end(JSON.stringify({ ok: true, result }));
        break;
      }
      case "/list": {
        res.end(JSON.stringify({ ok: true, agents: bridge.list() }));
        break;
      }
      case "/stop": {
        await bridge.stop(String(body.id));
        res.end(JSON.stringify({ ok: true }));
        break;
      }
      case "/bash": {
        const result = await bridge.bash(String(body.id), String(body.command));
        res.end(JSON.stringify({ ok: true, result }));
        break;
      }
      default:
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Not found" }));
    }
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  }
});

server.listen(PORT, () => console.error(`HTTP server on http://localhost:${PORT}`));
process.on("SIGINT", async () => { await bridge.stopAll(); process.exit(0); });
process.on("SIGTERM", async () => { await bridge.stopAll(); process.exit(0); });
