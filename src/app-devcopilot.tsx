/**
 * DevCopilot - AI-Powered Cloudflare Workers Development Assistant
 *
 * Full-featured chat interface with:
 * - Syntax-highlighted code blocks
 * - Error log analysis
 * - Project context sidebar
 * - Cloudflare-branded dark mode UI
 * - Direct API integration (no agents framework)
 * - Try Example buttons with demo content
 * - Toast notifications for feedback
 *
 * @module app-devcopilot
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/button/Button";
import { Textarea } from "@/components/textarea/Textarea";
import { Loader } from "@/components/loader/Loader";
import {
  ProjectContext,
  type ProjectContextData
} from "@/components/project-context";
import { ErrorLogInput } from "@/components/error-log-input";
import { CodeBlock } from "@/components/code-block";
import { ToastProvider } from "@/components/toast";
import { SAMPLE_ERRORS, SAMPLE_CODE } from "@/demo";
import {
  PaperPlaneTiltIcon,
  TrashIcon,
  SidebarIcon,
  MoonIcon,
  SunIcon,
  CloudIcon,
  CodeIcon,
  BugIcon,
  BookOpenIcon,
  LightningIcon,
  RobotIcon,
  TerminalIcon,
  WarningCircleIcon,
  CopyIcon,
  CheckIcon,
  PlayIcon,
  ShieldCheckIcon,
  RocketIcon
} from "@phosphor-icons/react";

// =============================================================================
// Types
// =============================================================================

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  isError?: boolean;
  toolsUsed?: string[];
}

interface QuickAction {
  icon: React.ReactNode;
  title: string;
  description: string;
  prompt: string;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Demo examples for "Try Example" buttons
 */
interface DemoExample {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  category: "error" | "code" | "docs";
  prompt: string;
  badge?: string;
}

const DEMO_EXAMPLES: DemoExample[] = [
  {
    id: "cpu-error",
    icon: <BugIcon size={20} />,
    title: "CPU Time Exceeded",
    description: "Analyze a Worker timeout error",
    category: "error",
    badge: "Error",
    prompt: `Please analyze this error log from my Cloudflare Worker:\n\n\`\`\`\n${SAMPLE_ERRORS[0].log}\n\`\`\``
  },
  {
    id: "kv-error",
    icon: <BugIcon size={20} />,
    title: "KV Binding Error",
    description: "Debug missing namespace binding",
    category: "error",
    badge: "Error",
    prompt: `Please analyze this error log from my Cloudflare Worker:\n\n\`\`\`\n${SAMPLE_ERRORS[1].log}\n\`\`\``
  },
  {
    id: "security-review",
    icon: <ShieldCheckIcon size={20} />,
    title: "Security Vulnerabilities",
    description: "Review code for security issues",
    category: "code",
    badge: "Code Review",
    prompt: `Please review this Cloudflare Worker code for security vulnerabilities:\n\n\`\`\`typescript\n${SAMPLE_CODE[1].code}\n\`\`\``
  },
  {
    id: "best-practices",
    icon: <RocketIcon size={20} />,
    title: "Best Practices Example",
    description: "See a well-written Worker",
    category: "code",
    badge: "Code Review",
    prompt: `Can you explain the security best practices used in this Cloudflare Worker code?\n\n\`\`\`typescript\n${SAMPLE_CODE[2].code}\n\`\`\``
  },
  {
    id: "durable-objects",
    icon: <BookOpenIcon size={20} />,
    title: "Durable Objects Guide",
    description: "Learn when to use DO vs KV",
    category: "docs",
    badge: "Learn",
    prompt:
      "Can you explain how Durable Objects work and when I should use them instead of KV? Include a practical example."
  },
  {
    id: "cors-setup",
    icon: <BookOpenIcon size={20} />,
    title: "CORS Configuration",
    description: "Set up CORS headers properly",
    category: "docs",
    badge: "Learn",
    prompt:
      "How do I properly configure CORS headers in a Cloudflare Worker? Show me a complete example with preflight handling."
  }
];

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: <CodeIcon size={24} />,
    title: "Review Worker Code",
    description: "Get best practices and optimization tips",
    prompt:
      "Please review my Cloudflare Worker code for best practices, performance, and security issues."
  },
  {
    icon: <BugIcon size={24} />,
    title: "Debug an Error",
    description: "Analyze error logs and get solutions",
    prompt: "I have an error in my Cloudflare Worker. Can you help me debug it?"
  },
  {
    icon: <BookOpenIcon size={24} />,
    title: "Explain Concepts",
    description: "Learn about Durable Objects, KV, R2",
    prompt:
      "Can you explain how Durable Objects work and when I should use them instead of KV?"
  },
  {
    icon: <LightningIcon size={24} />,
    title: "Optimize Performance",
    description: "Speed up your Worker execution",
    prompt:
      "How can I optimize my Cloudflare Worker for better performance and lower latency?"
  }
];

// =============================================================================
// Utility Functions
// =============================================================================

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function parseMessageContent(content: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content))) {
    // Add text before code block
    if (match.index > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`} className="whitespace-pre-wrap">
          {content.slice(lastIndex, match.index)}
        </span>
      );
    }

    // Add code block
    const language = match[1] || "javascript";
    const code = match[2].trim();
    parts.push(
      <CodeBlock key={`code-${match.index}`} code={code} language={language} />
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(
      <span key={`text-${lastIndex}`} className="whitespace-pre-wrap">
        {content.slice(lastIndex)}
      </span>
    );
  }

  return parts.length > 0 ? parts : [content];
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * DevCopilot Logo Component
 */
function DevCopilotLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <CloudIcon size={40} className="text-[#F6821F]" weight="duotone" />
        <RobotIcon
          size={20}
          className="absolute -bottom-1 -right-1 text-[#F6821F]"
          weight="fill"
        />
      </div>
      <div>
        <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
          DevCopilot
        </h1>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Powered by Workers AI • Llama 3.3
        </p>
      </div>
    </div>
  );
}

/**
 * Welcome Card with Quick Actions
 */
function WelcomeCard({
  onQuickAction
}: {
  onQuickAction: (prompt: string) => void;
}) {
  const [activeCategory, setActiveCategory] = useState<
    "all" | "error" | "code" | "docs"
  >("all");

  const filteredExamples =
    activeCategory === "all"
      ? DEMO_EXAMPLES
      : DEMO_EXAMPLES.filter((ex) => ex.category === activeCategory);

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4">
      {/* Hero Section */}
      <div className="mb-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="relative animate-float">
            <CloudIcon size={64} className="text-[#F6821F]" weight="duotone" />
            <RobotIcon
              size={32}
              className="absolute -bottom-2 -right-2 text-[#F6821F]"
              weight="fill"
            />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
          Welcome to DevCopilot
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400 max-w-md">
          Your AI-powered assistant for building Cloudflare Workers. Ask me
          anything about Workers, Durable Objects, KV, R2, D1, and more!
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl w-full mb-8">
        {QUICK_ACTIONS.map((action, index) => (
          <button
            key={index}
            onClick={() => onQuickAction(action.prompt)}
            className="flex items-start gap-3 p-4 rounded-lg bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-300 dark:border-neutral-700 hover:border-[#F6821F] hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-all text-left group"
          >
            <div className="text-[#F6821F] group-hover:scale-110 transition-transform">
              {action.icon}
            </div>
            <div>
              <h3 className="font-semibold text-neutral-900 dark:text-white text-sm">
                {action.title}
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {action.description}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Try Example Section */}
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
            <PlayIcon size={20} className="text-[#F6821F]" />
            Try Examples
          </h3>
          <div className="flex gap-2">
            {(["all", "error", "code", "docs"] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1 text-xs rounded-full transition-all ${
                  activeCategory === cat
                    ? "bg-[#F6821F] text-white"
                    : "bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600"
                }`}
              >
                {cat === "all"
                  ? "All"
                  : cat === "error"
                    ? "Errors"
                    : cat === "code"
                      ? "Code"
                      : "Docs"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredExamples.map((example) => (
            <button
              key={example.id}
              onClick={() => onQuickAction(example.prompt)}
              className="group relative flex flex-col gap-2 p-4 rounded-lg bg-gradient-to-br from-neutral-100 to-neutral-50 dark:from-neutral-800 dark:to-neutral-900 border border-neutral-300 dark:border-neutral-700 hover:border-[#F6821F] hover:shadow-lg hover:shadow-orange-500/10 transition-all text-left"
            >
              {/* Badge */}
              {example.badge && (
                <span className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-medium rounded-full bg-[#F6821F]/10 text-[#F6821F]">
                  {example.badge}
                </span>
              )}

              <div className="flex items-center gap-2">
                <span className="text-[#F6821F] group-hover:scale-110 transition-transform">
                  {example.icon}
                </span>
                <span className="font-medium text-sm text-neutral-900 dark:text-white">
                  {example.title}
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {example.description}
              </p>

              {/* Hover effect */}
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#F6821F]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Chat Message Component
 */
function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} mb-4`}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#F6821F] flex items-center justify-center">
          <RobotIcon size={18} className="text-white" weight="fill" />
        </div>
      )}

      <div
        className={`max-w-[80%] ${
          isUser
            ? "bg-[#F6821F] text-white rounded-2xl rounded-br-md"
            : "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-2xl rounded-bl-md"
        } ${message.isError ? "border border-red-500 bg-red-100 dark:bg-red-900/20" : ""}`}
      >
        <div className="p-4">
          {message.isError && (
            <div className="flex items-center gap-2 text-red-400 text-sm mb-2">
              <WarningCircleIcon size={16} />
              <span>Error</span>
            </div>
          )}
          <div className="text-sm leading-relaxed">
            {parseMessageContent(message.content)}
          </div>
          {message.toolsUsed && message.toolsUsed.length > 0 && (
            <div className="mt-3 pt-3 border-t border-neutral-300 dark:border-neutral-700">
              <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <TerminalIcon size={12} />
                <span>Tools used: {message.toolsUsed.join(", ")}</span>
              </div>
            </div>
          )}
        </div>

        {!isUser && (
          <div className="px-4 pb-2 flex justify-end">
            <button
              onClick={copyToClipboard}
              className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
              title="Copy message"
            >
              {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            </button>
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-neutral-300 dark:bg-neutral-700 flex items-center justify-center">
          <span className="text-sm font-medium text-neutral-700 dark:text-white">
            You
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Typing Indicator
 */
function TypingIndicator() {
  return (
    <div className="flex gap-3 mb-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#F6821F] flex items-center justify-center">
        <RobotIcon size={18} className="text-white" weight="fill" />
      </div>
      <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl rounded-bl-md p-4">
        <div className="flex items-center gap-2">
          <Loader className="w-4 h-4" />
          <span className="text-sm text-neutral-600 dark:text-neutral-400">
            DevCopilot is thinking...
          </span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main App Component
// =============================================================================

export default function App() {
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showErrorInput, setShowErrorInput] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [projectContext, setProjectContext] = useState<ProjectContextData>({
    workerCode: "",
    errorLogs: [],
    resolvedIssues: [],
    cloudflareServices: ["Workers AI", "KV Namespace"],
    sessionInfo: {
      sessionId: generateId(),
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      messageCount: 0,
      isActive: true
    }
  });

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Update session info when messages change
  useEffect(() => {
    setProjectContext((prev) => {
      if (!prev.sessionInfo) return prev;
      return {
        ...prev,
        sessionInfo: {
          ...prev.sessionInfo,
          messageCount: messages.length,
          lastActivityAt: new Date().toISOString()
        }
      };
    });
  }, [messages.length]);

  // Apply theme
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  /**
   * Send message to DevCopilot API
   */
  const sendMessage = useCallback(
    async (messageText?: string) => {
      const text = messageText || input.trim();
      if (!text) return;

      setError(null);
      setInput("");

      // Add user message
      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content: text,
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, userMessage]);
      setLoading(true);

      try {
        // Prepare message history for API
        const messageHistory = messages.map((m) => ({
          role: m.role,
          content: m.content
        }));

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...messageHistory, { role: "user", content: text }]
          })
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = (await response.json()) as {
          response?: string;
          toolsUsed?: string[];
        };

        // Add AI response
        const aiMessage: Message = {
          id: generateId(),
          role: "assistant",
          content: data.response || "No response received",
          timestamp: new Date(),
          toolsUsed: data.toolsUsed
        };
        setMessages((prev) => [...prev, aiMessage]);
      } catch (err) {
        console.error("Chat error:", err);
        const errorMessage: Message = {
          id: generateId(),
          role: "assistant",
          content:
            err instanceof Error
              ? `Failed to get response: ${err.message}`
              : "An unexpected error occurred",
          timestamp: new Date(),
          isError: true
        };
        setMessages((prev) => [...prev, errorMessage]);
        setError(err instanceof Error ? err.message : "Failed to send message");
      } finally {
        setLoading(false);
      }
    },
    [input, messages]
  );

  /**
   * Handle form submit
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage();
  };

  /**
   * Handle keyboard shortcuts
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /**
   * Handle quick action click
   */
  const handleQuickAction = (prompt: string) => {
    sendMessage(prompt);
  };

  /**
   * Handle error log analysis
   */
  const handleAnalyzeError = (errorLog: string) => {
    // Add to project context
    setProjectContext((prev) => ({
      ...prev,
      errorLogs: [...(prev.errorLogs || []), errorLog].slice(-10)
    }));

    // Send as message
    sendMessage(
      `Please analyze this error log from my Cloudflare Worker:\n\n\`\`\`\n${errorLog}\n\`\`\``
    );
    setShowErrorInput(false);
  };

  /**
   * Clear chat history
   */
  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  /**
   * Toggle theme
   */
  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <ToastProvider>
      <div className="flex h-screen bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
        {/* Sidebar */}
        <ProjectContext
          isOpen={showSidebar}
          onToggle={() => setShowSidebar(!showSidebar)}
          initialData={projectContext}
          onContextUpdate={(data) => setProjectContext(data)}
        />

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
                title="Toggle sidebar"
              >
                <SidebarIcon
                  size={20}
                  className="text-neutral-500 dark:text-neutral-400"
                />
              </button>
              <DevCopilotLogo />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowErrorInput(!showErrorInput)}
                className={`p-2 rounded-lg transition-colors ${
                  showErrorInput
                    ? "bg-[#F6821F] text-white"
                    : "hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
                }`}
                title="Paste error log"
              >
                <BugIcon size={20} />
              </button>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors text-neutral-500 dark:text-neutral-400"
                title="Toggle theme"
              >
                {theme === "dark" ? (
                  <SunIcon size={20} />
                ) : (
                  <MoonIcon size={20} />
                )}
              </button>
              <button
                onClick={clearChat}
                className="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors text-neutral-500 dark:text-neutral-400"
                title="Clear chat"
              >
                <TrashIcon size={20} />
              </button>
            </div>
          </header>

          {/* Error Input (Collapsible) */}
          {showErrorInput && (
            <div className="flex-shrink-0 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-100/50 dark:bg-neutral-900/50">
              <ErrorLogInput
                onAnalyze={handleAnalyzeError}
                isAnalyzing={loading}
                defaultCollapsed={false}
              />
            </div>
          )}

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <WelcomeCard onQuickAction={handleQuickAction} />
            ) : (
              <>
                {messages.map((message) => (
                  <ChatMessage key={message.id} message={message} />
                ))}
                {loading && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Error Banner */}
          {error && (
            <div className="flex-shrink-0 px-4 py-2 bg-red-100 dark:bg-red-900/20 border-t border-red-300 dark:border-red-800">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                <WarningCircleIcon size={16} />
                <span>{error}</span>
                <button
                  onClick={() => setError(null)}
                  className="ml-auto text-red-500 dark:text-red-300 hover:text-red-700 dark:hover:text-red-100"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="flex-shrink-0 p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
            <form onSubmit={handleSubmit} className="flex gap-3">
              <div className="flex-1 relative">
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask DevCopilot about Cloudflare Workers... (Shift+Enter for new line)"
                  className="w-full resize-none bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 focus:border-[#F6821F] text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 min-h-[52px] max-h-[200px]"
                  disabled={loading}
                  rows={1}
                />
              </div>
              <Button
                type="submit"
                disabled={loading || !input.trim()}
                className="flex-shrink-0 bg-[#F6821F] hover:bg-[#E5721A] disabled:bg-neutral-700 disabled:text-neutral-500 h-[52px] px-6"
              >
                {loading ? (
                  <Loader className="w-5 h-5" />
                ) : (
                  <PaperPlaneTiltIcon size={20} weight="fill" />
                )}
              </Button>
            </form>
            <div className="mt-2 text-xs text-neutral-400 dark:text-neutral-500 text-center">
              DevCopilot uses Llama 3.3 70B via Workers AI • Your code stays
              private
            </div>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
