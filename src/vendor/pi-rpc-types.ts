/**
 * Minimal RPC protocol types for headless Pi operation.
 *
 * Self-contained — no imports from @earendil-works/* packages.
 */

// ---------------------------------------------------------------------------
// Re-exported / vendored core types
// ---------------------------------------------------------------------------

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface ModelInfo {
  provider: string;
  id: string;
  contextWindow: number;
  reasoning: boolean;
}

// ---------------------------------------------------------------------------
// AgentEvent (subset used by the bridge)
// ---------------------------------------------------------------------------

export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AssistantMessage {
  role: "assistant";
  content: (TextContent | { type: "thinking"; thinking: string } | ToolCall)[];
  usage?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    cost: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      total: number;
    };
  };
  stopReason?: "stop" | "length" | "toolUse" | "error" | "aborted";
  errorMessage?: string;
  timestamp: number;
}

export interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}

export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: unknown;
  isError: boolean;
  timestamp: number;
}

export type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage;

export type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
  | { type: "message_start"; message: AgentMessage }
  | {
      type: "message_update";
      message: AgentMessage;
      assistantMessageEvent: unknown;
    }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: unknown; partialResult: unknown }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: unknown; isError: boolean };

// ---------------------------------------------------------------------------
// RPC Commands
// ---------------------------------------------------------------------------

export type RpcCommand =
  | { id?: string; type: "prompt"; message: string; images?: ImageContent[]; streamingBehavior?: "steer" | "followUp" }
  | { id?: string; type: "steer"; message: string; images?: ImageContent[] }
  | { id?: string; type: "follow_up"; message: string; images?: ImageContent[] }
  | { id?: string; type: "abort" }
  | { id?: string; type: "new_session"; parentSession?: string }
  | { id?: string; type: "get_state" }
  | { id?: string; type: "set_model"; provider: string; modelId: string }
  | { id?: string; type: "cycle_model" }
  | { id?: string; type: "get_available_models" }
  | { id?: string; type: "set_thinking_level"; level: ThinkingLevel }
  | { id?: string; type: "cycle_thinking_level" }
  | { id?: string; type: "set_steering_mode"; mode: "all" | "one-at-a-time" }
  | { id?: string; type: "set_follow_up_mode"; mode: "all" | "one-at-a-time" }
  | { id?: string; type: "compact"; customInstructions?: string }
  | { id?: string; type: "set_auto_compaction"; enabled: boolean }
  | { id?: string; type: "set_auto_retry"; enabled: boolean }
  | { id?: string; type: "abort_retry" }
  | { id?: string; type: "bash"; command: string }
  | { id?: string; type: "abort_bash" }
  | { id?: string; type: "get_session_stats" }
  | { id?: string; type: "export_html"; outputPath?: string }
  | { id?: string; type: "switch_session"; sessionPath: string }
  | { id?: string; type: "fork"; entryId: string }
  | { id?: string; type: "clone" }
  | { id?: string; type: "get_fork_messages" }
  | { id?: string; type: "get_last_assistant_text" }
  | { id?: string; type: "set_session_name"; name: string }
  | { id?: string; type: "get_messages" }
  | { id?: string; type: "get_commands" };

// ---------------------------------------------------------------------------
// RPC Session State
// ---------------------------------------------------------------------------

export interface RpcSessionState {
  model?: ModelInfo;
  thinkingLevel: ThinkingLevel;
  isStreaming: boolean;
  isCompacting: boolean;
  steeringMode: "all" | "one-at-a-time";
  followUpMode: "all" | "one-at-a-time";
  sessionFile?: string;
  sessionId: string;
  sessionName?: string;
  autoCompactionEnabled: boolean;
  messageCount: number;
  pendingMessageCount: number;
}

// ---------------------------------------------------------------------------
// RPC Response
// ---------------------------------------------------------------------------

export interface BashResult {
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
}

export interface CompactionResult {
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  details?: unknown;
}

export interface SessionStats {
  sessionFile: string | undefined;
  sessionId: string;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  totalMessages: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
}

export interface RpcSlashCommand {
  name: string;
  description?: string;
  source: "extension" | "prompt" | "skill";
  sourceInfo: {
    path: string;
    source: string;
    scope: "user" | "project" | "temporary";
    origin: "package" | "top-level";
    baseDir?: string;
  };
}

export type RpcResponse =
  | { id?: string; type: "response"; command: "prompt"; success: true }
  | { id?: string; type: "response"; command: "steer"; success: true }
  | { id?: string; type: "response"; command: "follow_up"; success: true }
  | { id?: string; type: "response"; command: "abort"; success: true }
  | { id?: string; type: "response"; command: "new_session"; success: true; data: { cancelled: boolean } }
  | { id?: string; type: "response"; command: "get_state"; success: true; data: RpcSessionState }
  | { id?: string; type: "response"; command: "set_model"; success: true; data: ModelInfo }
  | { id?: string; type: "response"; command: "cycle_model"; success: true; data: { model: ModelInfo; thinkingLevel: ThinkingLevel; isScoped: boolean } | null }
  | { id?: string; type: "response"; command: "get_available_models"; success: true; data: { models: ModelInfo[] } }
  | { id?: string; type: "response"; command: "set_thinking_level"; success: true }
  | { id?: string; type: "response"; command: "cycle_thinking_level"; success: true; data: { level: ThinkingLevel } | null }
  | { id?: string; type: "response"; command: "set_steering_mode"; success: true }
  | { id?: string; type: "response"; command: "set_follow_up_mode"; success: true }
  | { id?: string; type: "response"; command: "compact"; success: true; data: CompactionResult }
  | { id?: string; type: "response"; command: "set_auto_compaction"; success: true }
  | { id?: string; type: "response"; command: "set_auto_retry"; success: true }
  | { id?: string; type: "response"; command: "abort_retry"; success: true }
  | { id?: string; type: "response"; command: "bash"; success: true; data: BashResult }
  | { id?: string; type: "response"; command: "abort_bash"; success: true }
  | { id?: string; type: "response"; command: "get_session_stats"; success: true; data: SessionStats }
  | { id?: string; type: "response"; command: "export_html"; success: true; data: { path: string } }
  | { id?: string; type: "response"; command: "switch_session"; success: true; data: { cancelled: boolean } }
  | { id?: string; type: "response"; command: "fork"; success: true; data: { text: string; cancelled: boolean } }
  | { id?: string; type: "response"; command: "clone"; success: true; data: { cancelled: boolean } }
  | { id?: string; type: "response"; command: "get_fork_messages"; success: true; data: { messages: Array<{ entryId: string; text: string }> } }
  | { id?: string; type: "response"; command: "get_last_assistant_text"; success: true; data: { text: string | null } }
  | { id?: string; type: "response"; command: "set_session_name"; success: true }
  | { id?: string; type: "response"; command: "get_messages"; success: true; data: { messages: AgentMessage[] } }
  | { id?: string; type: "response"; command: "get_commands"; success: true; data: { commands: RpcSlashCommand[] } }
  | { id?: string; type: "response"; command: string; success: false; error: string };
