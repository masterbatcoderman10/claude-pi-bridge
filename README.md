# claude-pi-bridge

MCP server that lets Claude Code spawn and manage headless Pi coding agents.

## Install

```bash
npm install -g claude-pi-bridge
```

Requires Node.js >= 20 and the `pi` CLI installed globally.

## Configure

Create `~/.claude-pi-bridge/config.json`:

```json
{
  "providers": {
    "anthropic": {
      "apiKeyEnvVar": "ANTHROPIC_API_KEY",
      "defaultModel": "claude-sonnet-4-20250514"
    },
    "openrouter": {
      "apiKeyEnvVar": "OPENROUTER_API_KEY",
      "defaultModel": "anthropic/claude-sonnet-4"
    },
    "groq": {
      "apiKeyEnvVar": "GROQ_API_KEY",
      "defaultModel": "llama-3.3-70b-versatile"
    }
  },
  "defaults": {
    "provider": "openrouter",
    "model": "anthropic/claude-sonnet-4",
    "thinkingLevel": "medium"
  },
  "limits": {
    "maxConcurrentAgents": 5,
    "defaultTimeoutMs": 120000
  }
}
```

Set your API keys as environment variables (e.g., in `~/.zshrc`):

```bash
export ANTHROPIC_API_KEY="sk-..."
export OPENROUTER_API_KEY="sk-..."
```

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

## Usage Examples

### Spawn an agent

```
Spawn a Pi agent named "backend-worker" in ~/projects/api with provider anthropic and model claude-sonnet-4.
```

Claude Code calls `pi_spawn` with:
- `name`: `backend-worker`
- `cwd`: `~/projects/api`
- `provider`: `anthropic`
- `model`: `claude-sonnet-4`

### Send a prompt

```
Ask backend-worker to generate a FastAPI router for user CRUD.
```

Claude Code calls `pi_prompt` with:
- `id`: `backend-worker`
- `message`: `Generate a FastAPI router for user CRUD.`

### Get the result

```
Wait for backend-worker to finish and show me the output.
```

Claude Code calls `pi_get_result` with:
- `id`: `backend-worker`

### List running agents

```
Show me all running Pi agents.
```

Claude Code calls `pi_list`.

### Stop an agent

```
Kill the backend-worker agent.
```

Claude Code calls `pi_stop` with:
- `id`: `backend-worker`

## HTTP API

Run the standalone HTTP server:

```bash
claude-pi-bridge-http
# or with a custom port
CLAUDE_PI_BRIDGE_PORT=8080 claude-pi-bridge-http
```

Endpoints (all POST, JSON body):

### `POST /spawn`
```bash
curl -X POST http://localhost:9090/spawn \
  -H "Content-Type: application/json" \
  -d '{"name":"worker-1","cwd":"~/projects/api","provider":"anthropic","model":"claude-sonnet-4"}'
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

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `pi_spawn` | Spawn a new Pi coding agent. Args: `name`, `cwd`, optional `provider`, `model`, `thinkingLevel`, `initialPrompt` |
| `pi_prompt` | Send a message to a running agent. Args: `id`, `message` |
| `pi_steer` | Interrupt an agent mid-task with a steering message. Args: `id`, `message` |
| `pi_get_state` | Get the current state of an agent. Args: `id` |
| `pi_get_result` | Wait for agent to become idle and return the last assistant text. Args: `id`, optional `timeout` |
| `pi_list` | List all running agents. No args. |
| `pi_stop` | Kill a running agent. Args: `id` |
| `pi_bash` | Run a bash command via an agent. Args: `id`, `command` |
