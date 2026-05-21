# Claude Code Setup Guide

Step-by-step instructions to connect `claude-pi-bridge` to Claude Code.

## Step 1: Install

```bash
npm install -g claude-pi-bridge
```

Verify:
```bash
which claude-pi-bridge
which claude-pi-bridge-http
```

Both should print a path. If not, ensure your npm global bin directory is in `$PATH`.

## Step 2: Configure Providers

Create the config directory and file:

```bash
mkdir -p ~/.claude-pi-bridge
```

Write `~/.claude-pi-bridge/config.json`:

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

Set API keys in your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export ANTHROPIC_API_KEY="sk-..."
export OPENROUTER_API_KEY="sk-..."
```

Then reload:
```bash
source ~/.zshrc   # or ~/.bashrc
```

## Step 3: Add to `~/.mcp.json`

Create or edit `~/.mcp.json`:

```json
{
  "mcpServers": {
    "claude-pi-bridge": {
      "command": "claude-pi-bridge"
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
      "command": "claude-pi-bridge"
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
