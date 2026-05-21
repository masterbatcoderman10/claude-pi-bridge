import type { ThinkingLevel } from "./vendor/pi-rpc-types.js";

export interface SpawnOptions {
  cwd: string;
  provider?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  initialPrompt?: string;
  cliPath?: string;
  extraArgs?: string[];
}

export interface AgentInfo {
  id: string;
  cwd: string;
  provider: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  status: "idle" | "streaming" | "error" | "stopped";
  startTime: Date;
  lastActivity: Date;
}
