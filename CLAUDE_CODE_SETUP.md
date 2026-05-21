# Claude Code Setup Guide

Step-by-step instructions to connect `claude-pi-bridge` to Claude Code.

## Step 1: Prerequisites

- **Node.js >= 20**
- **Pi CLI** installed: `npm install -g @earendil-works/pi-coding-agent`
- **API keys** set as env vars (e.g., `OPENROUTER_API_KEY`) or in `~/.pi/agent/auth.json`

No need to install `claude-pi-bridge` — Claude Code will download it automatically via `npx`.

## Step 2: Configure (Optional)

If Pi already works on your machine, you probably don't need a config file.

Create `~/.claude-pi-bridge/config.json` only if you want defaults:

```json
{
  "defaults": {
    "provider": "openrouter",
    "model": "moonshotai/kimi-k2.6"
  }
}
```

Or a fuller config:

```json
{
  "providers": {
    "openrouter": {
      "apiKeyEnvVar": "OPENROUTER_API_KEY",
      "defaultModel": "moonshotai/kimi-k2.6"
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

## Step 3: Add to `~/.mcp.json`

Create or edit `~/.mcp.json`:

```json
{
  "mcpServers": {
    "claude-pi-bridge": {
      "command": "npx",
      "args": ["-y", "claude-pi-bridge"]
    }
  }
}
```

On Windows:

```json
{
  "mcpServers": {
    "claude-pi-bridge": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "claude-pi-bridge"]
    }
  }
}
```

If you already have other MCP servers, merge them:

```json
{
  "mcpServers": {
    "existing-server": { ... },
    "claude-pi-bridge": {
      "command": "npx",
      "args": ["-y", "claude-pi-bridge"]
    }
  }
}
```

## Step 4: Verify

1. Restart Claude Code or run `/mcp` in the chat.
2. Ask:
   ```
   List available MCP tools.
   ```
3. Confirm you see the `pi_*` tools (`pi_spawn`, `pi_prompt`, `pi_list`, etc.).

## Step 5: Example Workflow

Spawn an agent and assign it a task:

```
Spawn a Pi agent named "refactor-bot" in ~/projects/myapp and ask it to refactor the utils.py file to use dataclasses.
```

Claude Code will:
1. Call `pi_spawn` with `name=refactor-bot`, `cwd=~/projects/myapp`, and your default provider/model.
2. Call `pi_prompt` with the refactoring request.
3. Call `pi_get_result` to return the final output.

Check on it later:

```
Show me the state of refactor-bot.
```

Claude Code calls `pi_get_state` with `id=refactor-bot`.

Clean up:

```
Stop refactor-bot.
```

Claude Code calls `pi_stop` with `id=refactor-bot`.
