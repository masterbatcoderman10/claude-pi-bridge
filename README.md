# claude-pi-bridge

MCP server that lets **Claude Code** spawn and manage headless [**Pi**](https://pi.dev) coding agents in parallel. No terminal windows needed.

**GitHub:** [masterbatcoderman10/claude-pi-bridge](https://github.com/masterbatcoderman10/claude-pi-bridge)

---

## What This Does

Claude Code is great at orchestration. Pi is a fast, capable coding agent. This bridge connects them:

```
You (in Claude Code):
  "Spawn 3 Pi agents — one writes tests, one refactors auth, one updates docs."

Claude Code:
  [pi_spawn] agent-1 on Groq
  [pi_spawn] agent-2 on Anthropic
  [pi_spawn] agent-3 on OpenRouter
  [pi_prompt] assign tasks

Later:
  "Status?"
  [pi_get_state x3]
  "Collect results from the done ones."
  [pi_get_result x2]
```

Pi agents run **headless** in the background. Claude manages them like a project lead managing a team.

---

## Prerequisites

- **Node.js >= 20**
- **Pi CLI** installed globally: `npm install -g @earendil-works/pi-coding-agent`
- **API keys** for at least one provider (OpenRouter, Anthropic, Groq, etc.)

---

## Install

```bash
npm install -g claude-pi-bridge
```

---

## Configure

Create `~/.claude-pi-bridge/config.json`:

```json
{
  "providers": {
    "anthropic": {
      "apiKeyEnvVar": "ANTHROPIC_API_KEY",
      "defaultModel": "claude-sonnet-4"
    },
    "openrouter": {
      "apiKeyEnvVar": "OPENROUTER_API_KEY",
      "defaultModel": "moonshotai/kimi-k2.6"
    },
    "groq": {
      "apiKeyEnvVar": "GROQ_API_KEY",
      "defaultModel": "openai/gpt-oss-120b"
    }
  },
  "defaults": {
    "provider": "openrouter",
    "model": "moonshotai/kimi-k2.6",
    "thinkingLevel": "medium"
  },
  "limits": {
    "maxConcurrentAgents": 5,
    "defaultTimeoutMs": 120000
  }
}
```

Set your API keys as environment variables (e.g., in `~/.zshrc` or `~/.bashrc`):

```bash
export ANTHROPIC_API_KEY="sk-..."
export OPENROUTER_API_KEY="sk-or-..."
export GROQ_API_KEY="gsk-..."
```

**How auth works:** The bridge reads your config, resolves the provider's API key env var name, and passes it to each Pi process as an environment variable. Pi then uses that key for its LLM calls. Your keys never appear in Claude Code's context.

---

## Claude Code Setup

Add to `~/.mcp.json`:

```json
{
  "mcpServers": {
    "claude-pi-bridge": {
      "command": "claude-pi-bridge"
    }
  }
}
```

Restart Claude Code or run `/mcp` to load the server.

---

## Usage Examples

### Spawn an agent

```
You: "Spawn a Pi agent named 'backend-worker' in ~/projects/api using Anthropic's Claude."
```

Claude calls `pi_spawn` with:
- `name`: `backend-worker`
- `cwd`: `~/projects/api`
- `provider`: `anthropic`
- `model`: `claude-sonnet-4`

### Send a prompt

```
You: "Ask backend-worker to generate a FastAPI router for user CRUD."
```

Claude calls `pi_prompt` with:
- `id`: `backend-worker`
- `message`: `Generate a FastAPI router for user CRUD.`

### Get the result

```
You: "Wait for backend-worker to finish and show me the output."
```

Claude calls `pi_get_result` with:
- `id`: `backend-worker`

Returns the full text of Pi's last assistant message.

### Check status

```
You: "What's the status of all my Pi agents?"
```

Claude calls `pi_list`.

### Stop an agent

```
You: "Kill the backend-worker agent."
```

Claude calls `pi_stop` with:
- `id`: `backend-worker`

### Parallel batch

```
You: "Spawn 3 agents on Groq's cheap tier and assign them: tests for auth.ts,
      refactor db.ts, update API docs."
```

Claude spawns 3 agents, sends prompts, then you collect results as they finish.

---

## Available MCP Tools

| Tool | Description | Args |
|------|-------------|------|
| `pi_spawn` | Spawn a new Pi coding agent | `name`, `cwd`, `provider?`, `model?`, `thinkingLevel?`, `initialPrompt?` |
| `pi_prompt` | Send a message to a running agent | `id`, `message` |
| `pi_steer` | Interrupt an agent mid-task | `id`, `message` |
| `pi_get_state` | Get agent state (model, streaming, msg count) | `id` |
| `pi_get_result` | Wait for idle, return last assistant text | `id`, `timeout?` |
| `pi_list` | List all running agents | — |
| `pi_stop` | Kill a running agent | `id` |
| `pi_bash` | Run bash via the agent's shell | `id`, `command` |

---

## HTTP API (for Hermes/scripts)

Run the standalone HTTP server:

```bash
claude-pi-bridge-http
# or with a custom port
CLAUDE_PI_BRIDGE_PORT=8080 claude-pi-bridge-http
```

All endpoints accept POST with JSON body and return JSON.

### `POST /spawn`
```bash
curl -X POST http://localhost:9090/spawn \
  -H "Content-Type: application/json" \
  -d '{"name":"worker-1","cwd":"~/projects/api","provider":"groq","model":"openai/gpt-oss-120b"}'
```

### `POST /prompt`
```bash
curl -X POST http://localhost:9090/prompt \
  -H "Content-Type: application/json" \
  -d '{"id":"worker-1","message":"Refactor the auth module."}'
```

### `POST /steer`
```bash
curl -X POST http://localhost:9090/steer \
  -H "Content-Type: application/json" \
  -d '{"id":"worker-1","message":"Use JWT instead of sessions."}'
```

### `POST /state`
```bash
curl -X POST http://localhost:9090/state \
  -H "Content-Type: application/json" \
  -d '{"id":"worker-1"}'
```

### `POST /result`
```bash
curl -X POST http://localhost:9090/result \
  -H "Content-Type: application/json" \
  -d '{"id":"worker-1","timeout":60000}'
```

### `POST /list`
```bash
curl -X POST http://localhost:9090/list
```

### `POST /stop`
```bash
curl -X POST http://localhost:9090/stop \
  -H "Content-Type: application/json" \
  -d '{"id":"worker-1"}'
```

### `POST /bash`
```bash
curl -X POST http://localhost:9090/bash \
  -H "Content-Type: application/json" \
  -d '{"id":"worker-1","command":"git status"}'
```

---

## Architecture

```
┌─────────────┐   MCP stdio    ┌──────────────┐   JSONL (pipe)   ┌─────────────┐
│ Claude Code │◄──────────────►│  Bridge      │◄───────────────►│ Pi --mode   │
│  (terminal) │                │ MCP Server   │                 │   rpc       │
└─────────────┘                │              │                 └─────────────┘
                               │  ┌────────┐  │
                               │  │ HTTP   │  │◄── curl / Hermes
                               │  │ :9090  │  │
                               │  └────────┘  │
                               └──────────────┘
```

- **Pi `--mode rpc`** — Pi's built-in headless mode. JSONL over stdin/stdout.
- **Bridge** — Wraps Pi's RPC in an MCP server (for Claude) + HTTP server (for scripts).
- **Shared core** — `PiBridge` class manages agent registry, lifecycle, and auth injection.

---

## Local Development

```bash
git clone https://github.com/masterbatcoderman10/claude-pi-bridge.git
cd claude-pi-bridge
npm install
npm run dev:mcp    # MCP server via tsx
npm run dev:http   # HTTP server via tsx
```

---

## License

MIT
