/**
 * CodeBlock - Syntax highlighted code block with copy functionality
 *
 * Features:
 * - Syntax highlighting using a simple highlight approach
 * - Copy to clipboard button
 * - Language detection/display
 * - Line numbers (optional)
 * - Dark mode support with Cloudflare colors
 *
 * @module components/code-block
 */

import { useState, useCallback, useMemo } from "react";
import { CopyIcon, CheckIcon } from "@phosphor-icons/react";

// =============================================================================
// Types
// =============================================================================

export interface CodeBlockProps {
  /** The code content to display */
  code: string;
  /** Programming language for syntax highlighting */
  language?: string;
  /** Whether to show line numbers */
  showLineNumbers?: boolean;
  /** Optional title/filename to display */
  title?: string;
  /** Additional CSS classes */
  className?: string;
  /** Maximum height before scrolling (default: 400px) */
  maxHeight?: string;
}

// =============================================================================
// Syntax Highlighting Patterns
// =============================================================================

interface HighlightRule {
  pattern: RegExp;
  className: string;
}

const HIGHLIGHT_RULES: Record<string, HighlightRule[]> = {
  javascript: [
    // Comments
    { pattern: /(\/\/.*$)/gm, className: "text-neutral-500" },
    { pattern: /(\/\*[\s\S]*?\*\/)/g, className: "text-neutral-500" },
    // Strings
    {
      pattern: /(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g,
      className: "text-green-400"
    },
    // Keywords
    {
      pattern:
        /\b(const|let|var|function|async|await|return|if|else|for|while|try|catch|throw|new|class|extends|import|export|from|default|type|interface)\b/g,
      className: "text-purple-400"
    },
    // Built-ins
    {
      pattern:
        /\b(console|Promise|Response|Request|Headers|fetch|JSON|Object|Array|String|Number|Boolean|null|undefined|true|false)\b/g,
      className: "text-blue-400"
    },
    // Functions
    {
      pattern: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g,
      className: "text-yellow-400"
    },
    // Numbers
    { pattern: /\b(\d+\.?\d*)\b/g, className: "text-orange-400" },
    // Properties after dot
    { pattern: /\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g, className: "text-cyan-400" }
  ],
  typescript: [], // Will be populated from javascript
  python: [
    { pattern: /(#.*$)/gm, className: "text-neutral-500" },
    {
      pattern: /('''[\s\S]*?'''|"""[\s\S]*?""")/g,
      className: "text-neutral-500"
    },
    {
      pattern: /(['"])((?:\\.|(?!\1)[^\\])*?)\1/g,
      className: "text-green-400"
    },
    {
      pattern:
        /\b(def|class|if|elif|else|for|while|try|except|finally|with|as|import|from|return|yield|lambda|async|await|True|False|None)\b/g,
      className: "text-purple-400"
    },
    {
      pattern:
        /\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance)\b/g,
      className: "text-blue-400"
    },
    {
      pattern: /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g,
      className: "text-yellow-400"
    },
    { pattern: /\b(\d+\.?\d*)\b/g, className: "text-orange-400" }
  ],
  json: [
    { pattern: /("(?:[^"\\]|\\.)*")\s*:/g, className: "text-cyan-400" },
    { pattern: /:\s*("(?:[^"\\]|\\.)*")/g, className: "text-green-400" },
    { pattern: /\b(true|false|null)\b/g, className: "text-purple-400" },
    { pattern: /\b(-?\d+\.?\d*)\b/g, className: "text-orange-400" }
  ],
  sql: [
    { pattern: /(--.*$)/gm, className: "text-neutral-500" },
    {
      pattern: /(['"])((?:\\.|(?!\1)[^\\])*?)\1/g,
      className: "text-green-400"
    },
    {
      pattern:
        /\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP|INDEX|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|NOT|NULL|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|DEFAULT|CONSTRAINT|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|DISTINCT|COUNT|SUM|AVG|MAX|MIN|LIKE|IN|BETWEEN|EXISTS|CASE|WHEN|THEN|ELSE|END)\b/gi,
      className: "text-purple-400"
    },
    {
      pattern:
        /\b(INTEGER|TEXT|REAL|BLOB|VARCHAR|CHAR|BOOLEAN|DATE|DATETIME|TIMESTAMP)\b/gi,
      className: "text-blue-400"
    },
    { pattern: /\b(\d+\.?\d*)\b/g, className: "text-orange-400" }
  ],
  toml: [
    { pattern: /(#.*$)/gm, className: "text-neutral-500" },
    { pattern: /^\s*\[([^\]]+)\]/gm, className: "text-cyan-400 font-semibold" },
    {
      pattern: /^(\s*[a-zA-Z_][a-zA-Z0-9_]*)\s*=/gm,
      className: "text-purple-400"
    },
    { pattern: /=\s*("(?:[^"\\]|\\.)*")/g, className: "text-green-400" },
    { pattern: /\b(true|false)\b/g, className: "text-orange-400" },
    { pattern: /\b(\d+\.?\d*)\b/g, className: "text-orange-400" }
  ],
  bash: [
    { pattern: /(#.*$)/gm, className: "text-neutral-500" },
    {
      pattern: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
      className: "text-green-400"
    },
    { pattern: /\$\{?[a-zA-Z_][a-zA-Z0-9_]*\}?/g, className: "text-cyan-400" },
    {
      pattern:
        /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|exit|export|source|cd|ls|rm|cp|mv|mkdir|echo|cat|grep|sed|awk|npm|npx|wrangler|node|git)\b/g,
      className: "text-purple-400"
    }
  ]
};

// TypeScript uses JavaScript rules
HIGHLIGHT_RULES.typescript = HIGHLIGHT_RULES.javascript;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Apply syntax highlighting to code
 */
function highlightCode(code: string, language: string): string {
  const rules =
    HIGHLIGHT_RULES[language.toLowerCase()] || HIGHLIGHT_RULES.javascript;
  let highlighted = escapeHtml(code);

  // Apply each rule (order matters for some patterns)
  for (const rule of rules) {
    highlighted = highlighted.replace(rule.pattern, (match) => {
      return `<span class="${rule.className}">${match}</span>`;
    });
  }

  return highlighted;
}

/**
 * Escape HTML entities to prevent XSS
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Detect language from code content if not specified
 */
function detectLanguage(code: string): string {
  // Check for common patterns
  if (
    code.includes("async function") ||
    code.includes("export default") ||
    code.includes("=>")
  ) {
    return code.includes(": ") &&
      (code.includes("<") || code.includes("interface"))
      ? "typescript"
      : "javascript";
  }
  if (
    code.includes("def ") ||
    (code.includes("import ") && code.includes("from "))
  ) {
    return "python";
  }
  if (code.startsWith("{") || code.startsWith("[")) {
    try {
      JSON.parse(code);
      return "json";
    } catch {
      // Not JSON
    }
  }
  if (code.includes("SELECT") || code.includes("CREATE TABLE")) {
    return "sql";
  }
  if (code.includes("[") && code.includes("]") && code.includes("=")) {
    return "toml";
  }
  if (
    code.includes("npm ") ||
    code.includes("wrangler ") ||
    code.startsWith("#!")
  ) {
    return "bash";
  }

  return "javascript";
}

// =============================================================================
// Component
// =============================================================================

export function CodeBlock({
  code,
  language,
  showLineNumbers = false,
  title,
  className = "",
  maxHeight = "400px"
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  // Auto-detect language if not provided
  const detectedLanguage = useMemo(() => {
    return language || detectLanguage(code);
  }, [code, language]);

  // Apply syntax highlighting
  const highlightedCode = useMemo(() => {
    return highlightCode(code, detectedLanguage);
  }, [code, detectedLanguage]);

  // Split into lines for line numbers
  const lines = useMemo(() => {
    return highlightedCode.split("\n");
  }, [highlightedCode]);

  // Copy to clipboard handler
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [code]);

  return (
    <div
      className={`relative group rounded-lg overflow-hidden border border-neutral-700 bg-neutral-900 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-neutral-800 border-b border-neutral-700">
        <div className="flex items-center gap-2">
          {/* Language badge */}
          <span className="text-xs font-mono text-neutral-400 bg-neutral-700 px-2 py-0.5 rounded">
            {detectedLanguage}
          </span>
          {title && (
            <span className="text-sm text-neutral-300 font-medium">
              {title}
            </span>
          )}
        </div>

        {/* Copy button */}
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-neutral-400 hover:text-white bg-neutral-700 hover:bg-neutral-600 rounded transition-colors"
          aria-label={copied ? "Copied!" : "Copy code"}
        >
          {copied ? (
            <>
              <CheckIcon size={14} className="text-green-400" />
              <span className="text-green-400">Copied!</span>
            </>
          ) : (
            <>
              <CopyIcon size={14} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <div
        className="overflow-auto p-4 font-mono text-sm leading-relaxed"
        style={{ maxHeight }}
      >
        {showLineNumbers ? (
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((line, index) => (
                <tr key={index} className="hover:bg-neutral-800/50">
                  <td className="text-neutral-500 text-right pr-4 select-none w-10 align-top">
                    {index + 1}
                  </td>
                  <td className="text-neutral-100">
                    <span
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized content
                      dangerouslySetInnerHTML={{ __html: line || "&nbsp;" }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <pre className="text-neutral-100 whitespace-pre-wrap break-words">
            <code
              // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized content
              dangerouslySetInnerHTML={{ __html: highlightedCode }}
            />
          </pre>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Inline Code Component
// =============================================================================

export interface InlineCodeProps {
  children: React.ReactNode;
  className?: string;
}

export function InlineCode({ children, className = "" }: InlineCodeProps) {
  return (
    <code
      className={`px-1.5 py-0.5 rounded bg-neutral-800 text-[#F6821F] font-mono text-sm ${className}`}
    >
      {children}
    </code>
  );
}

export default CodeBlock;
