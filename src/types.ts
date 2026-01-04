/**
 * Type definitions for cf_ai_dev_copilot
 * Shared interfaces for conversation and project context management
 */

/**
 * Represents a single message in the conversation
 */
export interface ConversationMessage {
  /** Unique identifier for the message */
  id: string;
  /** Role of the message sender */
  role: "user" | "assistant" | "system";
  /** Message content */
  content: string;
  /** ISO timestamp when the message was created */
  timestamp: string;
  /** Optional metadata for tool calls, code blocks, etc. */
  metadata?: MessageMetadata;
}

/**
 * Metadata attached to messages for additional context
 */
export interface MessageMetadata {
  /** Tool that was invoked (if applicable) */
  toolName?: string;
  /** Tool execution result */
  toolResult?: unknown;
  /** Code language for syntax highlighting */
  codeLanguage?: string;
  /** Whether this message contains code */
  hasCode?: boolean;
  /** Processing time in milliseconds */
  processingTime?: number;
}

/**
 * Represents a resolved issue from a debugging session
 */
export interface ResolvedIssue {
  /** ISO timestamp when the issue was resolved */
  timestamp: string;
  /** Description of the issue */
  issue: string;
  /** Solution that was applied */
  solution: string;
  /** Optional: related error codes */
  errorCodes?: string[];
  /** Optional: files that were affected */
  affectedFiles?: string[];
}

/**
 * Project context for the current debugging/development session
 */
export interface ProjectContext {
  /** Current Worker code being analyzed/debugged */
  workerCode?: string;
  /** Error logs from current or previous sessions */
  errorLogs?: string[];
  /** History of resolved issues for learning */
  resolvedIssues?: ResolvedIssue[];
  /** Cloudflare services being used in the project */
  cloudflareServices?: CloudflareService[];
  /** Worker name or project identifier */
  projectName?: string;
  /** Last updated timestamp */
  lastUpdated?: string;
}

/**
 * Supported Cloudflare services for context awareness
 */
export type CloudflareService =
  | "Workers"
  | "KV"
  | "D1"
  | "R2"
  | "Durable Objects"
  | "Queues"
  | "Vectorize"
  | "Workers AI"
  | "Pages"
  | "Hyperdrive"
  | "Browser Rendering"
  | "Email Workers";

/**
 * Session information for state management
 */
export interface SessionInfo {
  /** Unique session identifier */
  sessionId: string;
  /** ISO timestamp when session was created */
  createdAt: string;
  /** ISO timestamp of last activity */
  lastActivityAt: string;
  /** Total number of messages in session */
  messageCount: number;
  /** Whether the session is still active */
  isActive: boolean;
}

/**
 * Complete state stored in the Durable Object
 */
export interface DevCopilotState {
  /** Session metadata */
  session: SessionInfo;
  /** Conversation history */
  messages: ConversationMessage[];
  /** Project context for debugging assistance */
  projectContext: ProjectContext;
}

/**
 * Options for retrieving conversation history
 */
export interface GetHistoryOptions {
  /** Maximum number of messages to return */
  limit?: number;
  /** Filter by role */
  role?: "user" | "assistant" | "system";
  /** Return messages after this timestamp */
  after?: string;
  /** Return messages before this timestamp */
  before?: string;
}

/**
 * Result of state operations
 */
export interface StateOperationResult {
  success: boolean;
  error?: string;
  data?: unknown;
}
