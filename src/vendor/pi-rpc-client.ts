/**
 * RPC Client for programmatic access to the Pi coding agent.
 *
 * Spawns the agent in RPC mode and provides a typed API for all operations.
 * Self-contained — no imports from @earendil-works/* packages.
 */
import { spawn, type ChildProcess } from "node:child_process";
import {
  type AgentEvent,
  type AgentMessage,
  type BashResult,
  type CompactionResult,
  type ImageContent,
  type ModelInfo,
  type RpcCommand,
  type RpcResponse,
  type RpcSessionState,
  type RpcSlashCommand,
  type SessionStats,
  type ThinkingLevel,
} from "./pi-rpc-types.js";
import { attachJsonlLineReader, serializeJsonLine } from "./jsonl.js";

// ============================================================================
// Options
// ============================================================================

export interface RpcClientOptions {
  /** Path to the CLI entry point (default: searches for dist/cli.js) */
  cliPath?: string;
  /** Working directory for the agent */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Provider to use */
  provider?: string;
  /** Model ID to use */
  model?: string;
  /** Additional CLI arguments */
  args?: string[];
}

export type RpcEventListener = (event: AgentEvent) => void;

interface PendingRequest {
  resolve: (value: RpcResponse) => void;
  reject: (reason: Error) => void;
}

// ============================================================================
// RPC Client
// ============================================================================

export class RpcClient {
  private options: RpcClientOptions;
  private process: ChildProcess | null = null;
  private stopReadingStdout: (() => void) | null = null;
  private eventListeners: RpcEventListener[] = [];
  private pendingRequests = new Map<string, PendingRequest>();
  private requestId = 0;
  private stderr = "";

  constructor(options: RpcClientOptions = {}) {
    this.options = options;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start the RPC agent process.
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error("Client already started");
    }

    const cliPath = this.options.cliPath ?? "pi";
    const args = ["--mode", "rpc"];
    if (this.options.provider) {
      args.push("--provider", this.options.provider);
    }
    if (this.options.model) {
      args.push("--model", this.options.model);
    }
    if (this.options.args) {
      args.push(...this.options.args);
    }

    this.process = spawn(cliPath, args, {
      cwd: this.options.cwd,
      env: { ...process.env, ...this.options.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Collect stderr for debugging
    this.process.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      this.stderr += text;
      process.stderr.write(data);
    });

    // Set up strict JSONL reader for stdout
    this.stopReadingStdout = attachJsonlLineReader(this.process.stdout!, (line) => {
      this.handleLine(line);
    });

    // Wait a moment for process to initialize
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (this.process.exitCode !== null) {
      throw new Error(
        `Agent process exited immediately with code ${this.process.exitCode}. Stderr: ${this.stderr}`,
      );
    }
  }

  /**
   * Stop the RPC agent process.
   * Sends SIGTERM, then SIGKILL after 2 seconds if still running.
   */
  async stop(): Promise<void> {
    if (!this.process) return;

    this.stopReadingStdout?.();
    this.stopReadingStdout = null;

    this.process.kill("SIGTERM");

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.process?.kill("SIGKILL");
        resolve();
      }, 2000);

      this.process?.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.process = null;
    this.pendingRequests.clear();
  }

  // -------------------------------------------------------------------------
  // Event subscription
  // -------------------------------------------------------------------------

  /**
   * Subscribe to agent events.
   * Returns an unsubscribe function.
   */
  onEvent(listener: RpcEventListener): () => void {
    this.eventListeners.push(listener);
    return () => {
      const index = this.eventListeners.indexOf(listener);
      if (index !== -1) {
        this.eventListeners.splice(index, 1);
      }
    };
  }

  /**
   * Get collected stderr output (useful for debugging).
   */
  getStderr(): string {
    return this.stderr;
  }

  // -------------------------------------------------------------------------
  // Command methods
  // -------------------------------------------------------------------------

  /**
   * Send a prompt to the agent.
   * Returns immediately after sending; use onEvent() to receive streaming events.
   * Use waitForIdle() to wait for completion.
   */
  async prompt(message: string, images?: ImageContent[]): Promise<void> {
    await this.send({ type: "prompt", message, images });
  }

  /**
   * Queue a steering message to interrupt the agent mid-run.
   */
  async steer(message: string, images?: ImageContent[]): Promise<void> {
    await this.send({ type: "steer", message, images });
  }

  /**
   * Queue a follow-up message to be processed after the agent finishes.
   */
  async followUp(message: string, images?: ImageContent[]): Promise<void> {
    await this.send({ type: "follow_up", message, images });
  }

  /**
   * Abort current operation.
   */
  async abort(): Promise<void> {
    await this.send({ type: "abort" });
  }

  /**
   * Get current session state.
   */
  async getState(): Promise<RpcSessionState> {
    const response = await this.send({ type: "get_state" });
    return this.getData(response);
  }

  /**
   * Set model by provider and ID.
   */
  async setModel(provider: string, modelId: string): Promise<ModelInfo> {
    const response = await this.send({ type: "set_model", provider, modelId });
    return this.getData(response);
  }

  /**
   * Get list of available models.
   */
  async getAvailableModels(): Promise<ModelInfo[]> {
    const response = await this.send({ type: "get_available_models" });
    const data = this.getData<{ models: ModelInfo[] }>(response);
    return data.models;
  }

  /**
   * Set thinking level.
   */
  async setThinkingLevel(level: ThinkingLevel): Promise<void> {
    await this.send({ type: "set_thinking_level", level });
  }

  /**
   * Compact session context.
   */
  async compact(customInstructions?: string): Promise<CompactionResult> {
    const response = await this.send({ type: "compact", customInstructions });
    return this.getData(response);
  }

  /**
   * Execute a bash command.
   */
  async bash(command: string): Promise<BashResult> {
    const response = await this.send({ type: "bash", command });
    return this.getData(response);
  }

  /**
   * Get session statistics.
   */
  async getSessionStats(): Promise<SessionStats> {
    const response = await this.send({ type: "get_session_stats" });
    return this.getData(response);
  }

  /**
   * Get text of last assistant message.
   */
  async getLastAssistantText(): Promise<string | null> {
    const response = await this.send({ type: "get_last_assistant_text" });
    const data = this.getData<{ text: string | null }>(response);
    return data.text;
  }

  /**
   * Get all messages in the session.
   */
  async getMessages(): Promise<AgentMessage[]> {
    const response = await this.send({ type: "get_messages" });
    const data = this.getData<{ messages: AgentMessage[] }>(response);
    return data.messages;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Wait for agent to become idle (no streaming).
   * Resolves when agent_end event is received.
   */
  waitForIdle(timeout = 60000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(
          new Error(
            `Timeout waiting for agent to become idle. Stderr: ${this.stderr}`,
          ),
        );
      }, timeout);

      const unsubscribe = this.onEvent((event) => {
        if (event.type === "agent_end") {
          clearTimeout(timer);
          unsubscribe();
          resolve();
        }
      });
    });
  }

  /**
   * Collect events until agent becomes idle.
   */
  collectEvents(timeout = 60000): Promise<AgentEvent[]> {
    return new Promise((resolve, reject) => {
      const events: AgentEvent[] = [];
      const timer = setTimeout(() => {
        unsubscribe();
        reject(
          new Error(`Timeout collecting events. Stderr: ${this.stderr}`),
        );
      }, timeout);

      const unsubscribe = this.onEvent((event) => {
        events.push(event);
        if (event.type === "agent_end") {
          clearTimeout(timer);
          unsubscribe();
          resolve(events);
        }
      });
    });
  }

  /**
   * Send prompt and wait for completion, returning all events.
   */
  async promptAndWait(
    message: string,
    images?: ImageContent[],
    timeout = 60000,
  ): Promise<AgentEvent[]> {
    const eventsPromise = this.collectEvents(timeout);
    await this.prompt(message, images);
    return eventsPromise;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private handleLine(line: string): void {
    try {
      const data = JSON.parse(line) as RpcResponse | AgentEvent;

      // Check if it's a response to a pending request
      if (
        "type" in data &&
        data.type === "response" &&
        "id" in data &&
        data.id &&
        this.pendingRequests.has(data.id)
      ) {
        const pending = this.pendingRequests.get(data.id)!;
        this.pendingRequests.delete(data.id);
        pending.resolve(data as RpcResponse);
        return;
      }

      // Otherwise it's an event
      for (const listener of this.eventListeners) {
        listener(data as AgentEvent);
      }
    } catch {
      // Ignore non-JSON lines
    }
  }

  private async send(command: RpcCommand): Promise<RpcResponse> {
    if (!this.process?.stdin) {
      throw new Error("Client not started");
    }

    const id = `req_${++this.requestId}`;
    const fullCommand: RpcCommand = { ...command, id };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new Error(
            `Timeout waiting for response to ${command.type}. Stderr: ${this.stderr}`,
          ),
        );
      }, 30000);

      this.pendingRequests.set(id, {
        resolve: (response) => {
          clearTimeout(timeout);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      if (!this.process?.stdin) {
        throw new Error("Client not started");
      }
      this.process.stdin.write(serializeJsonLine(fullCommand));
    });
  }

  private getData<T>(response: RpcResponse): T {
    if (!response.success) {
      const err = response as Extract<RpcResponse, { success: false }>;
      throw new Error(err.error);
    }
    const ok = response as Extract<RpcResponse, { success: true; data: unknown }>;
    return ok.data as T;
  }
}
