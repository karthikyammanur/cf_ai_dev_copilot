/**
 * ErrorLogInput - Collapsible area for pasting error logs
 *
 * Features:
 * - Expandable text area for multi-line error logs
 * - Analyze button that triggers error analysis
 * - Syntax highlighting for error text
 * - Clear and paste from clipboard buttons
 *
 * @module components/error-log-input
 */

import { useState, useCallback, useRef } from "react";
import {
  CaretDownIcon,
  CaretRightIcon,
  WarningCircleIcon,
  MagicWandIcon,
  TrashIcon,
  ClipboardTextIcon
} from "@phosphor-icons/react";
import { Button } from "@/components/button/Button";

// =============================================================================
// Types
// =============================================================================

export interface ErrorLogInputProps {
  /** Callback when user requests error analysis */
  onAnalyze: (errorLog: string) => void;
  /** Whether analysis is in progress */
  isAnalyzing?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Additional CSS classes */
  className?: string;
  /** Default collapsed state */
  defaultCollapsed?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function ErrorLogInput({
  onAnalyze,
  isAnalyzing = false,
  placeholder = "Paste your Cloudflare Worker error log here...\n\nExample:\nError: Worker exceeded CPU time limit\n    at handleRequest (worker.js:42:15)\n    at async Object.fetch (worker.js:12:3)",
  className = "",
  defaultCollapsed = true
}: ErrorLogInputProps) {
  const [isExpanded, setIsExpanded] = useState(!defaultCollapsed);
  const [errorLog, setErrorLog] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Paste from clipboard
  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setErrorLog(text);
      if (!isExpanded) setIsExpanded(true);
    } catch (err) {
      console.error("Failed to read clipboard:", err);
    }
  }, [isExpanded]);

  // Clear input
  const handleClear = useCallback(() => {
    setErrorLog("");
    textareaRef.current?.focus();
  }, []);

  // Submit for analysis
  const handleAnalyze = useCallback(() => {
    if (errorLog.trim()) {
      onAnalyze(errorLog.trim());
    }
  }, [errorLog, onAnalyze]);

  return (
    <div
      className={`rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-850 overflow-hidden ${className}`}
    >
      {/* Header - Always visible */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-colors text-left"
      >
        <span className="text-neutral-500 dark:text-neutral-400">
          {isExpanded ? (
            <CaretDownIcon size={14} />
          ) : (
            <CaretRightIcon size={14} />
          )}
        </span>
        <WarningCircleIcon
          size={18}
          className="text-red-500 dark:text-red-400"
        />
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200 flex-1">
          Paste Error Log
        </span>
        {errorLog && !isExpanded && (
          <span className="text-xs bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300 px-2 py-0.5 rounded">
            Has content
          </span>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Quick actions */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handlePaste}
              className="text-xs gap-1"
            >
              <ClipboardTextIcon size={14} />
              Paste from Clipboard
            </Button>
            {errorLog && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="text-xs gap-1 text-red-400 hover:text-red-300"
              >
                <TrashIcon size={14} />
                Clear
              </Button>
            )}
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={errorLog}
            onChange={(e) => setErrorLog(e.target.value)}
            placeholder={placeholder}
            className="w-full h-40 px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm font-mono text-red-600 dark:text-red-300 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 resize-none focus:outline-none focus:ring-1 focus:ring-[#F6821F] focus:border-[#F6821F]"
            spellCheck={false}
          />

          {/* Analyze button */}
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleAnalyze}
            disabled={!errorLog.trim() || isAnalyzing}
            className="w-full gap-2 bg-[#F6821F] hover:bg-[#E5720E] border-[#F6821F] text-white"
          >
            <MagicWandIcon
              size={16}
              className={isAnalyzing ? "animate-pulse" : ""}
            />
            {isAnalyzing ? "Analyzing..." : "Analyze Error"}
          </Button>

          {/* Helper text */}
          <p className="text-xs text-neutral-500 text-center">
            DevCopilot will identify the error type and suggest fixes
          </p>
        </div>
      )}
    </div>
  );
}

export default ErrorLogInput;
