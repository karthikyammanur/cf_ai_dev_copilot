/**
 * DevCopilot - AI-Powered Cloudflare Workers Development Assistant
 *
 * Main chat interface with:
 * - Syntax-highlighted code blocks
 * - Error log analysis
 * - Project context sidebar
 * - Cloudflare-branded dark mode UI
 *
 * @module app
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useAgent } from "agents/react";
import { isStaticToolUIPart } from "ai";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { UIMessage } from "@ai-sdk/react";
import type { tools } from "./tools";

// Component imports
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Avatar } from "@/components/avatar/Avatar";
import { Toggle } from "@/components/toggle/Toggle";
import { Textarea } from "@/components/textarea/Textarea";
import { MemoizedMarkdown } from "@/components/memoized-markdown";
import { ToolInvocationCard } from "@/components/tool-invocation-card/ToolInvocationCard";
import {
  ProjectContext,
  type ProjectContextData
} from "@/components/project-context";
import { ErrorLogInput } from "@/components/error-log-input";

// Icon imports
import {
  BugIcon,
  MoonIcon,
  SunIcon,
  TrashIcon,
  PaperPlaneTiltIcon,
  StopIcon,
  CodeIcon,
  WarningCircleIcon,
  BookOpenIcon,
  SidebarIcon,
  LightningIcon,
  RobotIcon,
  CloudIcon,
  TerminalIcon
} from "@phosphor-icons/react";

// =============================================================================
// Constants
// =============================================================================

// List of tools that require human confirmation
const toolsRequiringConfirmation: (keyof typeof tools)[] = [
  "getWeatherInformation"
];

// Quick action prompts
const QUICK_ACTIONS = [
  {
    icon: <WarningCircleIcon size={16} />,
    label: "Analyze Error",
    prompt: "Please analyze this error log I'm seeing in my Cloudflare Worker:",
    color: "#EF4444"
  },
  {
    icon: <CodeIcon size={16} />,
    label: "Review Code",
    prompt:
      "Please review this Cloudflare Worker code for performance, security, and best practices:",
    color: "#8B5CF6"
  },
  {
    icon: <BookOpenIcon size={16} />,
    label: "Find Docs",
    prompt: "How do I use ",
    color: "#10B981"
  },
  {
    icon: <LightningIcon size={16} />,
    label: "Optimize",
    prompt: "How can I optimize my Worker for better performance?",
    color: "#F6821F"
  }
];

// =============================================================================
// DevCopilot Logo Component
// =============================================================================

function DevCopilotLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 79"
      className="text-[#F6821F]"
    >
      <title>DevCopilot</title>
      <path
        fill="currentColor"
        d="M69.3 39.7c-3.1 0-5.8 2.1-6.7 5H48.3V34h4.6l4.5-2.5c1.1.8 2.5 1.2 3.9 1.2 3.8 0 7-3.1 7-7s-3.1-7-7-7-7 3.1-7 7c0 .9.2 1.8.5 2.6L51.9 30h-3.5V18.8h-.1c-1.3-1-2.9-1.6-4.5-1.9h-.2c-1.9-.3-3.9-.1-5.8.6-.4.1-.8.3-1.2.5h-.1c-.1.1-.2.1-.3.2-1.7 1-3 2.4-4 4 0 .1-.1.2-.1.2l-.3.6c0 .1-.1.1-.1.2v.1h-.6c-2.9 0-5.7 1.2-7.7 3.2-2.1 2-3.2 4.8-3.2 7.7 0 .7.1 1.4.2 2.1-1.3.9-2.4 2.1-3.2 3.5s-1.2 2.9-1.4 4.5c-.1 1.6.1 3.2.7 4.7s1.5 2.9 2.6 4c-.8 1.8-1.2 3.7-1.1 5.6 0 1.9.5 3.8 1.4 5.6s2.1 3.2 3.6 4.4c1.3 1 2.7 1.7 4.3 2.2v-.1q2.25.75 4.8.6h.1c0 .1.1.1.1.1.9 1.7 2.3 3 4 4 .1.1.2.1.3.2h.1c.4.2.8.4 1.2.5 1.4.6 3 .8 4.5.7.4 0 .8-.1 1.3-.1h.1c1.6-.3 3.1-.9 4.5-1.9V62.9h3.5l3.1 1.7c-.3.8-.5 1.7-.5 2.6 0 3.8 3.1 7 7 7s7-3.1 7-7-3.1-7-7-7c-1.5 0-2.8.5-3.9 1.2l-4.6-2.5h-4.6V48.7h14.3c.9 2.9 3.5 5 6.7 5 3.8 0 7-3.1 7-7s-3.1-7-7-7m-7.9-16.9c1.6 0 3 1.3 3 3s-1.3 3-3 3-3-1.3-3-3 1.4-3 3-3m0 41.4c1.6 0 3 1.3 3 3s-1.3 3-3 3-3-1.3-3-3 1.4-3 3-3M44.3 72c-.4.2-.7.3-1.1.3-.2 0-.4.1-.5.1h-.2c-.9.1-1.7 0-2.6-.3-1-.3-1.9-.9-2.7-1.7-.7-.8-1.3-1.7-1.6-2.7l-.3-1.5v-.7q0-.75.3-1.5c.1-.2.1-.4.2-.7s.3-.6.5-.9c0-.1.1-.1.1-.2.1-.1.1-.2.2-.3s.1-.2.2-.3c0 0 0-.1.1-.1l.6-.6-2.7-3.5c-1.3 1.1-2.3 2.4-2.9 3.9-.2.4-.4.9-.5 1.3v.1c-.1.2-.1.4-.1.6-.3 1.1-.4 2.3-.3 3.4-.3 0-.7 0-1-.1-2.2-.4-4.2-1.5-5.5-3.2-1.4-1.7-2-3.9-1.8-6.1q.15-1.2.6-2.4l.3-.6c.1-.2.2-.4.3-.5 0 0 0-.1.1-.1.4-.7.9-1.3 1.5-1.9 1.6-1.5 3.8-2.3 6-2.3q1.05 0 2.1.3v-4.5c-.7-.1-1.4-.2-2.1-.2-1.8 0-3.5.4-5.2 1.1-.7.3-1.3.6-1.9 1s-1.1.8-1.7 1.3c-.3.2-.5.5-.8.8-.6-.8-1-1.6-1.3-2.6-.2-1-.2-2 0-2.9.2-1 .6-1.9 1.3-2.6.6-.8 1.4-1.4 2.3-1.8l1.8-.9-.7-1.9c-.4-1-.5-2.1-.4-3.1s.5-2.1 1.1-2.9q.9-1.35 2.4-2.1c.9-.5 2-.8 3-.7.5 0 1 .1 1.5.2 1 .2 1.8.7 2.6 1.3s1.4 1.4 1.8 2.3l4.1-1.5c-.9-2-2.3-3.7-4.2-4.9q-.6-.3-.9-.6c.4-.7 1-1.4 1.6-1.9.8-.7 1.8-1.1 2.9-1.3.9-.2 1.7-.1 2.6 0 .4.1.7.2 1.1.3V72zm25-22.3c-1.6 0-3-1.3-3-3 0-1.6 1.3-3 3-3s3 1.3 3 3c0 1.6-1.3 3-3 3"
      />
    </svg>
  );
}

// =============================================================================
// Welcome Card Component
// =============================================================================

interface WelcomeCardProps {
  onQuickAction: (prompt: string) => void;
}

function WelcomeCard({ onQuickAction }: WelcomeCardProps) {
  return (
    <div className="h-full flex items-center justify-center p-4">
      <Card className="p-8 max-w-lg mx-auto bg-neutral-900 border-neutral-700">
        <div className="text-center space-y-6">
          {/* Logo */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F6821F]/20 to-[#F6821F]/5 border border-[#F6821F]/20">
            <DevCopilotLogo size={36} />
          </div>

          {/* Title */}
          <div>
            <h1 className="text-2xl font-bold text-neutral-100 mb-2">
              Welcome to DevCopilot
            </h1>
            <p className="text-neutral-400 text-sm">
              Your AI assistant for Cloudflare Workers development. I can help
              you debug errors, review code, and find documentation.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="pt-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-3">
              Quick Actions
            </p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => onQuickAction(action.prompt)}
                  className="flex items-center gap-2 px-4 py-3 rounded-lg bg-neutral-800 border border-neutral-700 hover:border-neutral-600 hover:bg-neutral-750 transition-all text-left group"
                >
                  <span
                    className="p-1.5 rounded-md"
                    style={{ backgroundColor: `${action.color}20` }}
                  >
                    <span style={{ color: action.color }}>{action.icon}</span>
                  </span>
                  <span className="text-sm text-neutral-300 group-hover:text-neutral-100 transition-colors">
                    {action.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Features */}
          <div className="pt-4 border-t border-neutral-800">
            <div className="flex items-center justify-center gap-6 text-xs text-neutral-500">
              <span className="flex items-center gap-1.5">
                <CloudIcon size={14} className="text-[#F6821F]" />
                Workers AI
              </span>
              <span className="flex items-center gap-1.5">
                <TerminalIcon size={14} className="text-[#F6821F]" />
                Llama 3.3 70B
              </span>
              <span className="flex items-center gap-1.5">
                <LightningIcon size={14} className="text-[#F6821F]" />
                Edge-Powered
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// =============================================================================
// Chat Message Component with Enhanced Code Support
// =============================================================================

interface ChatMessageProps {
  message: UIMessage;
  isUser: boolean;
  showAvatar: boolean;
  showDebug: boolean;
  toolsRequiringConfirmation: string[];
  onAddToolResult: (toolCallId: string, result: string) => void;
  addToolResult: (tool: string, toolCallId: string, output: string) => void;
}

function ChatMessage({
  message,
  isUser,
  showAvatar,
  showDebug,
  toolsRequiringConfirmation,
  onAddToolResult,
  addToolResult
}: ChatMessageProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div>
      {showDebug && (
        <pre className="text-xs text-neutral-500 overflow-scroll mb-2 p-2 bg-neutral-900 rounded border border-neutral-800">
          {JSON.stringify(message, null, 2)}
        </pre>
      )}
      <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
        <div
          className={`flex gap-2 max-w-[85%] ${
            isUser ? "flex-row-reverse" : "flex-row"
          }`}
        >
          {showAvatar && !isUser ? (
            <div className="shrink-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#F6821F] to-[#E5720E] flex items-center justify-center">
                <RobotIcon size={16} className="text-white" />
              </div>
            </div>
          ) : (
            !isUser && <div className="w-8" />
          )}

          {showAvatar && isUser && (
            <Avatar username="You" className="shrink-0" />
          )}

          <div className="space-y-2">
            {message.parts?.map((part, i) => {
              if (part.type === "text") {
                return (
                  <div key={i}>
                    <Card
                      className={`p-3 rounded-lg ${
                        isUser
                          ? "bg-[#F6821F] text-white rounded-br-none border-[#E5720E]"
                          : "bg-neutral-800 border-neutral-700 rounded-bl-none"
                      } ${
                        part.text.startsWith("scheduled message")
                          ? "border-yellow-500/50"
                          : ""
                      }`}
                    >
                      {part.text.startsWith("scheduled message") && (
                        <span className="absolute -top-3 -left-2 text-base">
                          🕒
                        </span>
                      )}
                      <div className={isUser ? "text-white" : ""}>
                        <MemoizedMarkdown
                          id={`${message.id}-${i}`}
                          content={part.text.replace(
                            /^scheduled message: /,
                            ""
                          )}
                        />
                      </div>
                    </Card>
                    <p
                      className={`text-xs text-neutral-500 mt-1 ${
                        isUser ? "text-right" : "text-left"
                      }`}
                    >
                      {formatTime(
                        (message.metadata as { createdAt?: string })?.createdAt
                          ? new Date(
                              (message.metadata as { createdAt: string })
                                .createdAt
                            )
                          : new Date()
                      )}
                    </p>
                  </div>
                );
              }

              if (isStaticToolUIPart(part) && message.role === "assistant") {
                const toolCallId = part.toolCallId;
                const toolName = part.type.replace("tool-", "");
                const needsConfirmation =
                  toolsRequiringConfirmation.includes(toolName);

                return (
                  <ToolInvocationCard
                    key={`${toolCallId}-${i}`}
                    toolUIPart={part}
                    toolCallId={toolCallId}
                    needsConfirmation={needsConfirmation}
                    onSubmit={({ toolCallId, result }) => {
                      onAddToolResult(toolCallId, result);
                    }}
                    addToolResult={(toolCallId, result) => {
                      addToolResult(
                        part.type.replace("tool-", ""),
                        toolCallId,
                        result
                      );
                    }}
                  />
                );
              }
              return null;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main DevCopilot App Component
// =============================================================================

export default function DevCopilotApp() {
  // Theme state
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const savedTheme = localStorage.getItem("theme");
    return (savedTheme as "dark" | "light") || "dark";
  });

  // UI state
  const [showDebug, setShowDebug] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState("auto");
  const [projectContext, setProjectContext] = useState<ProjectContextData>({});

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Theme effect
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Initial scroll
  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  // Agent setup
  const agent = useAgent({
    agent: "chat"
  });

  const [agentInput, setAgentInput] = useState("");

  const handleAgentInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setAgentInput(e.target.value);
  };

  const {
    messages: agentMessages,
    addToolResult,
    clearHistory,
    status,
    sendMessage,
    stop
  } = useAgentChat<unknown, UIMessage<{ createdAt: string }>>({
    agent
  });

  // Handle message submit
  const handleAgentSubmit = async (
    e: React.FormEvent,
    extraData: Record<string, unknown> = {}
  ) => {
    e.preventDefault();
    if (!agentInput.trim()) return;

    const message = agentInput;
    setAgentInput("");
    setTextareaHeight("auto");

    await sendMessage(
      {
        role: "user",
        parts: [{ type: "text", text: message }]
      },
      {
        body: extraData
      }
    );
  };

  // Handle quick action click
  const handleQuickAction = (prompt: string) => {
    setAgentInput(prompt);
  };

  // Handle error log analysis
  const handleAnalyzeError = async (errorLog: string) => {
    const message = `Please analyze this error log from my Cloudflare Worker:\n\n\`\`\`\n${errorLog}\n\`\`\``;
    setAgentInput("");

    await sendMessage(
      {
        role: "user",
        parts: [{ type: "text", text: message }]
      },
      {}
    );
  };

  // Scroll on new messages
  useEffect(() => {
    if (agentMessages.length > 0) {
      scrollToBottom();
    }
  }, [agentMessages, scrollToBottom]);

  // Check for pending confirmations
  const pendingToolCallConfirmation = agentMessages.some((m: UIMessage) =>
    m.parts?.some(
      (part) =>
        isStaticToolUIPart(part) &&
        part.state === "input-available" &&
        toolsRequiringConfirmation.includes(
          part.type.replace("tool-", "") as keyof typeof tools
        )
    )
  );

  return (
    <div className="h-screen w-full flex bg-neutral-950">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="px-4 py-3 border-b border-neutral-800 flex items-center gap-3 bg-neutral-900">
          <DevCopilotLogo size={28} />

          <div className="flex-1">
            <h1 className="font-semibold text-base text-neutral-100">
              DevCopilot
            </h1>
            <p className="text-xs text-neutral-500">
              Cloudflare Workers AI Assistant
            </p>
          </div>

          {/* Status indicator */}
          {status === "streaming" && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#F6821F]/20 text-[#F6821F] text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F6821F] animate-pulse" />
              Thinking...
            </div>
          )}

          {/* Header actions */}
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-2 mr-2 border-r border-neutral-700 pr-3">
              <BugIcon size={14} className="text-neutral-500" />
              <Toggle
                toggled={showDebug}
                aria-label="Toggle debug mode"
                onClick={() => setShowDebug((prev) => !prev)}
              />
            </div>

            <Button
              variant="ghost"
              size="md"
              shape="square"
              className="rounded-full h-9 w-9"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <SunIcon size={18} />
              ) : (
                <MoonIcon size={18} />
              )}
            </Button>

            <Button
              variant="ghost"
              size="md"
              shape="square"
              className="rounded-full h-9 w-9"
              onClick={() => setShowSidebar(!showSidebar)}
              aria-label="Toggle sidebar"
            >
              <SidebarIcon size={18} />
            </Button>

            <Button
              variant="ghost"
              size="md"
              shape="square"
              className="rounded-full h-9 w-9 text-red-400 hover:text-red-300"
              onClick={clearHistory}
              aria-label="Clear chat history"
            >
              <TrashIcon size={18} />
            </Button>
          </div>
        </header>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto">
          {agentMessages.length === 0 ? (
            <WelcomeCard onQuickAction={handleQuickAction} />
          ) : (
            <div className="p-4 space-y-4 pb-48">
              {agentMessages.map((m, index) => {
                const isUser = m.role === "user";
                const showAvatar =
                  index === 0 || agentMessages[index - 1]?.role !== m.role;

                return (
                  <ChatMessage
                    key={m.id}
                    message={m}
                    isUser={isUser}
                    showAvatar={showAvatar}
                    showDebug={showDebug}
                    toolsRequiringConfirmation={
                      toolsRequiringConfirmation as string[]
                    }
                    onAddToolResult={(toolCallId, result) => {
                      const part = m.parts?.find(
                        (p) =>
                          isStaticToolUIPart(p) && p.toolCallId === toolCallId
                      );
                      if (part && isStaticToolUIPart(part)) {
                        addToolResult({
                          tool: part.type.replace("tool-", ""),
                          toolCallId,
                          output: result
                        });
                      }
                    }}
                    addToolResult={(tool, toolCallId, output) => {
                      addToolResult({ tool, toolCallId, output });
                    }}
                  />
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div
          className="absolute bottom-0 left-0 bg-gradient-to-t from-neutral-950 via-neutral-950 to-transparent pt-8 pb-4 px-4"
          style={{ right: showSidebar ? "320px" : "0" }}
        >
          {/* Error Log Input (Collapsible) */}
          <div className="max-w-3xl mx-auto mb-3">
            <ErrorLogInput
              onAnalyze={handleAnalyzeError}
              isAnalyzing={status === "streaming"}
            />
          </div>

          {/* Main Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAgentSubmit(e, {});
            }}
            className="max-w-3xl mx-auto"
          >
            <div className="relative bg-neutral-900 rounded-2xl border border-neutral-700 focus-within:border-[#F6821F] focus-within:ring-1 focus-within:ring-[#F6821F]/50 transition-all">
              <Textarea
                disabled={pendingToolCallConfirmation}
                placeholder={
                  pendingToolCallConfirmation
                    ? "Please respond to the tool confirmation above..."
                    : "Ask about Workers, paste code, or describe an error..."
                }
                className="w-full px-4 py-3 bg-transparent border-0 text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-0 resize-none text-base min-h-[52px] max-h-[200px] pr-24"
                value={agentInput}
                onChange={(e) => {
                  handleAgentInputChange(e);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                  setTextareaHeight(
                    `${Math.min(e.target.scrollHeight, 200)}px`
                  );
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    handleAgentSubmit(e as unknown as React.FormEvent);
                  }
                }}
                rows={1}
                style={{ height: textareaHeight }}
              />

              {/* Action Buttons */}
              <div className="absolute bottom-2 right-2 flex items-center gap-1">
                {status === "submitted" || status === "streaming" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    shape="circular"
                    onClick={stop}
                    className="h-8 w-8 bg-red-500/20 hover:bg-red-500/30 text-red-400"
                    aria-label="Stop generation"
                  >
                    <StopIcon size={16} />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    shape="circular"
                    disabled={pendingToolCallConfirmation || !agentInput.trim()}
                    className="h-8 w-8 bg-[#F6821F] hover:bg-[#E5720E] border-[#F6821F] disabled:opacity-50"
                    aria-label="Send message"
                  >
                    <PaperPlaneTiltIcon size={16} className="text-white" />
                  </Button>
                )}
              </div>
            </div>

            {/* Helper Text */}
            <p className="text-xs text-neutral-600 text-center mt-2">
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 text-[10px]">
                Enter
              </kbd>{" "}
              to send •{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 text-[10px]">
                Shift + Enter
              </kbd>{" "}
              for new line
            </p>
          </form>
        </div>
      </div>

      {/* Project Context Sidebar */}
      {showSidebar && (
        <ProjectContext
          isOpen={showSidebar}
          onToggle={() => setShowSidebar(false)}
          initialData={projectContext}
          onContextUpdate={setProjectContext}
        />
      )}
    </div>
  );
}
