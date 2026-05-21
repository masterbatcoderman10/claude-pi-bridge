import { RpcClient } from "./vendor/pi-rpc-client.js";
import type { SpawnOptions, AgentInfo } from "./types.js";
import type { RpcSessionState, ThinkingLevel } from "./vendor/pi-rpc-types.js";
import type { BridgeConfig } from "./config.js";
import { resolveAuthEnv } from "./config.js";

interface AgentHandle {
  client: RpcClient;
  info: AgentInfo;
}

export class PiBridge {
  private agents = new Map<string, AgentHandle>();
  private config: BridgeConfig;

  constructor(config: BridgeConfig) {
    this.config = config;
  }

  async spawn(id: string, options: SpawnOptions): Promise<void> {
    if (this.agents.has(id)) throw new Error(`Agent ${id} already exists`);
    if (this.agents.size >= this.config.limits.maxConcurrentAgents) {
      throw new Error(`Max concurrent agents (${this.config.limits.maxConcurrentAgents}) reached`);
    }

    const provider = options.provider ?? this.config.defaults.provider ?? "openrouter";
    const model = options.model ?? this.config.defaults.model;
    const thinkingLevel = options.thinkingLevel ?? this.config.defaults.thinkingLevel ?? "medium";
    const authEnv = resolveAuthEnv(provider, this.config);

    const client = new RpcClient({
      cliPath: options.cliPath,
      cwd: options.cwd,
      provider,
      model,
      args: options.extraArgs,
      env: authEnv,
    });

    await client.start();

    if (thinkingLevel) {
      try { await client.setThinkingLevel(thinkingLevel); } catch { /* model may not support */ }
    }

    const info: AgentInfo = {
      id, cwd: options.cwd, provider, model, thinkingLevel,
      status: "idle", startTime: new Date(), lastActivity: new Date(),
    };

    client.onEvent((event) => {
      if (event.type === "agent_start") info.status = "streaming";
      if (event.type === "agent_end") info.status = "idle";
      info.lastActivity = new Date();
    });

    this.agents.set(id, { client, info });

    if (options.initialPrompt) {
      info.status = "streaming";
      await client.prompt(options.initialPrompt);
    }
  }

  async prompt(id: string, message: string): Promise<void> {
    const agent = this.getAgent(id);
    agent.info.status = "streaming";
    await agent.client.prompt(message);
  }

  async steer(id: string, message: string): Promise<void> {
    const agent = this.getAgent(id);
    await agent.client.steer(message);
  }

  async getState(id: string): Promise<RpcSessionState> {
    return this.getAgent(id).client.getState();
  }

  async getResult(id: string, timeout?: number): Promise<string> {
    const agent = this.getAgent(id);
    await agent.client.waitForIdle(timeout ?? this.config.limits.defaultTimeoutMs);
    return (await agent.client.getLastAssistantText()) ?? "";
  }

  async getEvents(id: string, timeout?: number): Promise<Record<string, unknown>[]> {
    return this.getAgent(id).client.collectEvents(timeout ?? this.config.limits.defaultTimeoutMs);
  }

  async bash(id: string, command: string): Promise<unknown> {
    return this.getAgent(id).client.bash(command);
  }

  async compact(id: string, customInstructions?: string): Promise<unknown> {
    return this.getAgent(id).client.compact(customInstructions);
  }

  list(): AgentInfo[] {
    return Array.from(this.agents.values()).map((a) => ({ ...a.info }));
  }

  get(id: string): AgentInfo | undefined {
    return this.agents.get(id)?.info;
  }

  async stop(id: string): Promise<void> {
    const agent = this.agents.get(id);
    if (agent) {
      await agent.client.stop();
      agent.info.status = "stopped";
      this.agents.delete(id);
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all(Array.from(this.agents.keys()).map((id) => this.stop(id)));
  }

  private getAgent(id: string): AgentHandle {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`Agent ${id} not found`);
    return agent;
  }
}
