/**
 * ProjectContext - Sidebar showing current project state
 *
 * Displays:
 * - Current Worker code (collapsible)
 * - Previous issues resolved
 * - Active Cloudflare services
 * - Session info
 *
 * @module components/project-context
 */

import { useState, useEffect, useCallback } from "react";
import {
  CaretDownIcon,
  CaretRightIcon,
  CodeIcon,
  CheckCircleIcon,
  CloudIcon,
  ClockIcon,
  ArrowClockwiseIcon,
  WarningIcon,
  XIcon,
  SidebarIcon
} from "@phosphor-icons/react";
import { CodeBlock } from "@/components/code-block";

// =============================================================================
// Types
// =============================================================================

export interface ProjectContextData {
  workerCode?: string;
  errorLogs?: string[];
  resolvedIssues?: ResolvedIssue[];
  cloudflareServices?: string[];
  projectName?: string;
  sessionInfo?: SessionInfo;
}

export interface ResolvedIssue {
  id: string;
  timestamp: string;
  issue: string;
  resolution: string;
  confidence?: number;
}

export interface SessionInfo {
  sessionId: string;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
  isActive: boolean;
}

export interface ProjectContextProps {
  /** Whether the sidebar is expanded */
  isOpen: boolean;
  /** Toggle sidebar visibility */
  onToggle: () => void;
  /** API endpoint to fetch context from */
  contextEndpoint?: string;
  /** Initial context data (optional) */
  initialData?: ProjectContextData;
  /** Callback when context is updated */
  onContextUpdate?: (data: ProjectContextData) => void;
}

// =============================================================================
// Service Icons Mapping
// =============================================================================

const SERVICE_COLORS: Record<string, string> = {
  "Workers AI": "#F6821F",
  KV: "#4B8BF4",
  D1: "#10B981",
  R2: "#8B5CF6",
  "Durable Objects": "#EC4899",
  Queues: "#F59E0B",
  Pages: "#6366F1",
  Analytics: "#06B6D4"
};

// =============================================================================
// Collapsible Section Component
// =============================================================================

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  badge?: number | string;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  badge,
  children
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-neutral-700 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-neutral-800/50 transition-colors text-left"
      >
        <span className="text-neutral-400">
          {isOpen ? <CaretDownIcon size={14} /> : <CaretRightIcon size={14} />}
        </span>
        <span className="text-neutral-400">{icon}</span>
        <span className="text-sm font-medium text-neutral-200 flex-1">
          {title}
        </span>
        {badge !== undefined && (
          <span className="text-xs bg-neutral-700 text-neutral-300 px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </button>
      {isOpen && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ProjectContext({
  isOpen,
  onToggle,
  contextEndpoint = "/api/state/context",
  initialData,
  onContextUpdate
}: ProjectContextProps) {
  const [data, setData] = useState<ProjectContextData>(initialData || {});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch context from API
  const fetchContext = useCallback(async () => {
    if (!contextEndpoint) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(contextEndpoint);
      if (!response.ok) {
        throw new Error(`Failed to fetch context: ${response.status}`);
      }
      const contextData = (await response.json()) as ProjectContextData;
      setData(contextData);
      onContextUpdate?.(contextData);
    } catch (err) {
      console.error("Error fetching project context:", err);
      setError(err instanceof Error ? err.message : "Failed to load context");
    } finally {
      setLoading(false);
    }
  }, [contextEndpoint, onContextUpdate]);

  // Fetch on mount
  useEffect(() => {
    if (isOpen && !initialData) {
      fetchContext();
    }
  }, [isOpen, initialData, fetchContext]);

  // Render nothing if closed (mobile-friendly)
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="fixed top-4 right-4 z-50 p-2 bg-neutral-800 border border-neutral-700 rounded-lg hover:bg-neutral-700 transition-colors md:hidden"
        aria-label="Open project context"
      >
        <SidebarIcon size={20} className="text-neutral-300" />
      </button>
    );
  }

  return (
    <aside className="w-80 h-full bg-neutral-900 border-l border-neutral-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700 bg-neutral-850">
        <div className="flex items-center gap-2">
          <CloudIcon size={18} className="text-[#F6821F]" />
          <h2 className="text-sm font-semibold text-neutral-100">
            {data.projectName || "Project Context"}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={fetchContext}
            disabled={loading}
            className="p-1.5 hover:bg-neutral-700 rounded transition-colors disabled:opacity-50"
            aria-label="Refresh context"
          >
            <ArrowClockwiseIcon
              size={16}
              className={`text-neutral-400 ${loading ? "animate-spin" : ""}`}
            />
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="p-1.5 hover:bg-neutral-700 rounded transition-colors"
            aria-label="Close sidebar"
          >
            <XIcon size={16} className="text-neutral-400" />
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-900/30 border border-red-700 rounded-lg flex items-start gap-2">
          <WarningIcon size={16} className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-red-400">{error}</p>
            <button
              type="button"
              onClick={fetchContext}
              className="text-xs text-red-300 hover:text-red-200 underline mt-1"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Worker Code Section */}
        <CollapsibleSection
          title="Worker Code"
          icon={<CodeIcon size={16} />}
          defaultOpen={false}
        >
          {data.workerCode ? (
            <CodeBlock
              code={data.workerCode}
              language="typescript"
              maxHeight="200px"
              showLineNumbers
            />
          ) : (
            <p className="text-sm text-neutral-500 italic">
              No worker code loaded. Paste your code in the chat to get started.
            </p>
          )}
        </CollapsibleSection>

        {/* Error Logs Section */}
        {data.errorLogs && data.errorLogs.length > 0 && (
          <CollapsibleSection
            title="Recent Errors"
            icon={<WarningIcon size={16} />}
            badge={data.errorLogs.length}
          >
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {data.errorLogs.slice(-5).map((log, index) => (
                <div
                  key={index}
                  className="p-2 bg-red-900/20 border border-red-800/50 rounded text-xs font-mono text-red-300 break-all"
                >
                  {log.slice(0, 200)}
                  {log.length > 200 && "..."}
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Resolved Issues Section */}
        <CollapsibleSection
          title="Resolved Issues"
          icon={<CheckCircleIcon size={16} />}
          badge={data.resolvedIssues?.length || 0}
          defaultOpen={false}
        >
          {data.resolvedIssues && data.resolvedIssues.length > 0 ? (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {data.resolvedIssues.map((issue) => (
                <div
                  key={issue.id}
                  className="p-3 bg-neutral-800/50 rounded-lg border border-neutral-700"
                >
                  <div className="flex items-start gap-2">
                    <CheckCircleIcon
                      size={16}
                      className="text-green-400 mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-neutral-200 font-medium truncate">
                        {issue.issue}
                      </p>
                      <p className="text-xs text-neutral-400 mt-1">
                        {issue.resolution}
                      </p>
                      <p className="text-xs text-neutral-500 mt-2">
                        {new Date(issue.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500 italic">
              Issues you resolve will appear here.
            </p>
          )}
        </CollapsibleSection>

        {/* Cloudflare Services Section */}
        <CollapsibleSection
          title="Active Services"
          icon={<CloudIcon size={16} />}
          badge={data.cloudflareServices?.length || 0}
          defaultOpen
        >
          {data.cloudflareServices && data.cloudflareServices.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {data.cloudflareServices.map((service) => (
                <span
                  key={service}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-800 border border-neutral-700"
                  style={{
                    color: SERVICE_COLORS[service] || "#F6821F",
                    borderColor: `${SERVICE_COLORS[service] || "#F6821F"}40`
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: SERVICE_COLORS[service] || "#F6821F"
                    }}
                  />
                  {service}
                </span>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-neutral-500 italic mb-3">
                Detected services will appear here.
              </p>
              {/* Default services hint */}
              <div className="flex flex-wrap gap-2 opacity-50">
                {["Workers AI", "KV", "D1"].map((service) => (
                  <span
                    key={service}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-800/50 border border-neutral-700/50 text-neutral-500"
                  >
                    <span className="w-2 h-2 rounded-full bg-neutral-600" />
                    {service}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CollapsibleSection>

        {/* Session Info Section */}
        {data.sessionInfo && (
          <CollapsibleSection
            title="Session Info"
            icon={<ClockIcon size={16} />}
          >
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">Messages</span>
                <span className="text-neutral-200">
                  {data.sessionInfo.messageCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Started</span>
                <span className="text-neutral-200">
                  {new Date(data.sessionInfo.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Last Activity</span>
                <span className="text-neutral-200">
                  {new Date(
                    data.sessionInfo.lastActivityAt
                  ).toLocaleTimeString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Status</span>
                <span
                  className={
                    data.sessionInfo.isActive
                      ? "text-green-400"
                      : "text-neutral-400"
                  }
                >
                  {data.sessionInfo.isActive ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          </CollapsibleSection>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-neutral-700 bg-neutral-850">
        <p className="text-xs text-neutral-500 text-center">
          Powered by{" "}
          <span className="text-[#F6821F] font-medium">
            Cloudflare Workers AI
          </span>
        </p>
      </div>
    </aside>
  );
}

export default ProjectContext;
