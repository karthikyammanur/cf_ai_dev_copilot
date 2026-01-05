# PROMPTS.md - AI-Generated Prompts for cf_ai_dev_copilot

This document contains all the prompts used to build the cf_ai_dev_copilot project with AI assistance (Claude Opus 4.5 via GitHub Copilot).

---

## System Architecture Prompt

I'm building an AI-powered development assistant for Cloudflare Workers called "cf_ai_dev_copilot". This will be deployed on Cloudflare's infrastructure using Workers AI (Llama 3.3), Durable Objects for state, and Pages for the frontend.

**Core Requirements:**

1. LLM: Llama 3.3 via Workers AI
2. State: Durable Objects to store conversation history and project context
3. Tools: 3 specialized functions for code analysis, error debugging, and documentation retrieval
4. UI: Next.js chat interface with code syntax highlighting

**Tech Stack:**

- Cloudflare Workers AI
- Durable Objects
- Cloudflare Pages
- TypeScript
- Next.js/React
- Tailwind CSS

Please confirm you understand the architecture before we proceed with implementation.

---

## Prompt 1: Project Initialization & Configuration

Create the initial project structure for cf_ai_dev_copilot using Cloudflare's agents starter template.

**Requirements:**

1. Initialize with: `npm create cloudflare@latest cf_ai_dev_copilot -- --template cloudflare/agents-starter`
2. Configure wrangler.toml to use Llama 3.3 model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
3. Set up the necessary bindings for:
   - Workers AI
   - Durable Objects (name it "DevCopilotAgent")
   - KV namespace for caching (optional but recommended)

Provide the complete wrangler.toml configuration file with proper bindings and compatibility settings.

**Expected Output:**

- Complete wrangler.toml file
- Brief explanation of each binding
- Any environment variables needed

---

## Prompt 2: Durable Object Class - State Management

Create a Durable Object class called "DevCopilotAgent" that manages stateful conversations for the development assistant.

**Requirements:**

1. Store conversation history (user messages + AI responses)
2. Store project context including:
   - Current Worker code being debugged
   - Error logs from previous sessions
   - Resolved issues history
3. Implement session management with timestamps
4. Add methods for:
   - `addMessage(role: string, content: string)`
   - `getConversationHistory(limit?: number)`
   - `updateProjectContext(context: ProjectContext)`
   - `getProjectContext()`
   - `clearSession()`

**TypeScript Interface for ProjectContext:**

```typescript
interface ProjectContext {
  workerCode?: string;
  errorLogs?: string[];
  resolvedIssues?: Array<{
    timestamp: string;
    issue: string;
    solution: string;
  }>;
  cloudflareServices?: string[]; // e.g., ["Workers", "KV", "D1"]
}
```

**Expected Output:**

- Complete TypeScript class extending DurableObject
- All methods with proper type definitions
- Error handling for state operations
- Comments explaining the state management strategy

---

## Prompt 3: Tool 1 - Error Analysis Function

Create a tool function called "analyzeCloudflareError" that analyzes error logs from Cloudflare Workers and provides specific debugging guidance.

**Requirements:**

1. Input: Error log string (stack trace, error message, Worker logs)
2. Pattern match common Cloudflare-specific errors:
   - CPU time limit exceeded
   - Memory limit exceeded
   - Invalid binding configuration
   - CORS issues
   - Subrequest limit exceeded
   - KV/D1/R2 binding errors
   - Fetch API errors in Workers context
3. For each error type, provide:
   - Root cause explanation
   - Specific fix with code example
   - Best practices to avoid in future
   - Links to relevant Cloudflare docs

**Expected Output:**

- Complete TypeScript function with JSDoc comments
- Error pattern matching logic (use regex or string matching)
- Structured response format:
  ```typescript
  {
    errorType: string,
    severity: "critical" | "warning" | "info",
    rootCause: string,
    suggestedFix: string,
    codeExample?: string,
    docsLink?: string
  }
  ```
- At least 8-10 common error patterns implemented

---

## Prompt 4: Tool 2 - Code Review Function

Create a tool function called "reviewWorkerCode" that analyzes Cloudflare Workers code for performance issues, security concerns, and best practices.

**Requirements:**

1. Input: Worker code string (JavaScript or TypeScript)
2. Analyze for:
   - Performance anti-patterns (blocking operations, inefficient loops)
   - Missing error handling
   - Improper use of async/await
   - Security issues (exposed secrets, XSS vulnerabilities)
   - Cloudflare-specific optimizations:
     - Cache API usage
     - Edge caching headers
     - Subrequest optimization
     - KV vs D1 vs R2 appropriate usage
3. Provide severity ratings (critical, warning, suggestion)
4. Include code snippets showing the fix

**Expected Output:**

- Complete TypeScript function with proper typing
- Array of findings with structure:
  ```typescript
  {
    line?: number,
    type: "performance" | "security" | "best-practice" | "cloudflare-specific",
    severity: "critical" | "warning" | "suggestion",
    issue: string,
    recommendation: string,
    fixedCode?: string
  }
  ```
- At least 12-15 code analysis checks
- Helper functions for parsing code (use regex or basic AST if possible)

---

## Prompt 5: Tool 3 - Documentation Search Function

Create a tool function called "searchCloudflareDocs" that intelligently retrieves relevant Cloudflare documentation based on user queries.

**Requirements:**

1. Input: User query string (e.g., "How do I use KV in Workers?", "D1 database setup")
2. Map queries to documentation topics:
   - Workers API
   - KV, D1, R2, Durable Objects
   - Pages Functions
   - Workers AI
   - Rate Limiting
   - Caching strategies
   - Bindings and environment variables
3. Return structured documentation references with:
   - Topic title
   - Brief explanation (2-3 sentences)
   - Code example
   - Documentation URL
   - Related topics

**Implementation approach:**

- Create a knowledge base (object/map) of common topics
- Use keyword matching to find relevant topics
- Rank results by relevance
- Limit to top 3 most relevant results

**Expected Output:**

- Complete TypeScript function
- Knowledge base with 20-30 common Cloudflare topics
- Response structure:
  ```typescript
  {
    results: Array<{
      title: string,
      explanation: string,
      codeExample: string,
      docsUrl: string,
      relatedTopics: string[]
    }>,
    confidence: number
  }
  ```
- Fallback message for queries with no matches

---

## Prompt 6: Agent Integration - Main Worker

Create the main Worker file that integrates all tools with Llama 3.3 and handles the agent orchestration.

**Requirements:**

1. Import the three tool functions (analyzeCloudflareError, reviewWorkerCode, searchCloudflareDocs)
2. Set up Workers AI binding to use Llama 3.3
3. Implement the agent loop:
   - Receive user message
   - Pass to Llama 3.3 with system prompt
   - If LLM requests a tool, execute it
   - Return tool results to LLM
   - Get final response
   - Store in Durable Object
4. System prompt should define the agent as:
   - Expert in Cloudflare Workers development
   - Helpful debugging assistant
   - Focuses on practical solutions
   - Uses tools proactively
5. Handle streaming responses for better UX

**System Prompt Template:**

```
"You are DevCopilot, an expert AI assistant specialized in Cloudflare Workers development. You help developers debug errors, review code, and find documentation. You have access to three tools:
1. analyzeCloudflareError - for debugging error logs
2. reviewWorkerCode - for code review and optimization
3. searchCloudflareDocs - for finding documentation

Always use tools when the user provides code or error logs. Be concise but thorough in explanations. Provide code examples when helpful."
```

**Expected Output:**

- Complete Worker TypeScript file
- Tool registration and execution logic
- Error handling for AI calls
- Streaming response implementation
- Integration with Durable Object for state persistence

---

## Prompt 7: Frontend - Chat Interface

Create a modern Next.js chat interface for DevCopilot with code syntax highlighting and a clean developer-focused UI.

**Requirements:**

1. Chat interface with:
   - Message history (user + AI messages)
   - Input box with support for multi-line code
   - Send button and Enter key support
   - Loading states during AI responses
   - Error states for failed requests
2. Code syntax highlighting using a library like Prism.js or highlight.js
3. Special UI elements:
   - Code blocks with copy button
   - Error log paste area (collapsible)
   - Project context sidebar showing:
     - Current Worker code
     - Previous issues resolved
     - Active Cloudflare services
4. Styling with Tailwind CSS:
   - Dark mode (default for developers)
   - Clean, minimal design
   - Responsive layout
   - Cloudflare orange accent colors (#F6821F)

**Components needed:**

- ChatMessage component (handles user/AI messages)
- CodeBlock component (syntax highlighted code)
- InputArea component (multi-line input with formatting)
- ProjectContext component (sidebar)
- MainChatInterface component (orchestrates everything)

**Expected Output:**

- Complete Next.js page component (app/page.tsx)
- All necessary child components
- Tailwind configuration with Cloudflare branding
- API route for communicating with Worker (/api/chat)
- TypeScript interfaces for all props
- Responsive design that works on mobile

---

## Prompt 8: API Route - Worker Communication

Create a Next.js API route that handles communication between the frontend and the Cloudflare Worker.

**Requirements:**

1. POST endpoint at /api/chat
2. Accept request body:
   ```typescript
   {
     message: string,
     sessionId: string,
     projectContext?: ProjectContext
   }
   ```
3. Forward request to Cloudflare Worker (using environment variable for Worker URL)
4. Handle streaming responses from Worker
5. Return structured response:
   ```typescript
   {
     response: string,
     toolsUsed?: string[],
     timestamp: string
   }
   ```
6. Error handling with proper HTTP status codes
7. CORS configuration for local development

**Additional features:**

- Request validation (check message length, sanitize input)
- Rate limiting (basic client-side tracking)
- Session management (generate sessionId if not provided)

**Expected Output:**

- Complete API route file (app/api/chat/route.ts)
- Type definitions for request/response
- Error handling middleware
- Environment variable usage for Worker URL
- Comments explaining the request flow

---

## Implementation Notes

These prompts were used sequentially to build the cf_ai_dev_copilot project. Each prompt builds upon the previous one, creating a complete, production-ready AI development assistant for Cloudflare Workers.

**Key Prompt Engineering Techniques Used:**

1. **Clear Structure** - Each prompt has explicit requirements and expected outputs
2. **Technical Specificity** - Exact model names, file paths, and TypeScript interfaces
3. **Incremental Complexity** - Starting from configuration, moving to components, then integration
4. **Example-Driven** - Providing code structures and response formats
5. **Cloudflare Focus** - Emphasizing platform-specific features and best practices

**Development Approach:**

- Component-by-component implementation
- Type-safe TypeScript throughout
- Cloudflare-native architecture
- Modern UI with developer experience focus
- Production-ready error handling and validation
