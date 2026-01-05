# 🚀 DevCopilot - AI-Powered Cloudflare Workers Assistant

**Your intelligent companion for building, debugging, and optimizing Cloudflare Workers.**

## 🌐 Live Demo

**Try it now:** https://cf-ai-dev-copilot.karthikyam2006.workers.dev

### Quick Test

1. Click "Try Example" → CPU Limit Error
2. Watch the AI analyze and provide solutions
3. Ask: "How do I optimize my Worker?"

---

DevCopilot is an AI-powered development assistant built entirely on Cloudflare's edge infrastructure. It helps developers debug errors, review code, and navigate Cloudflare's extensive documentation—all through a natural conversation interface powered by Llama 3.3 70B.

## Key Features

- **Smart Error Analysis** - Paste error logs and get instant explanations with actionable fixes
- **Code Review** - Get best practices, security checks, and performance recommendations
- **Documentation Search** - Natural language queries for Workers, KV, D1, R2, Durable Objects, and more
- **Stateful Memory** - Conversation context persists across sessions using Durable Objects
- **Modern UI** - Clean, responsive chat interface with dark/light mode and syntax highlighting
- **Edge-Native** - Runs entirely on Cloudflare's global network with sub-100ms latency

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Browser                                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              React Chat UI (Vite + Tailwind)                │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼ HTTPS
┌─────────────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers Edge                          │
│  ┌────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │  Main Worker   │───▶│  Durable Object │    │    Workers AI   │  │
│  │  (server.ts)   │    │ (DevCopilotAgent)│    │  (Llama 3.3)   │  │
│  └────────────────┘    └─────────────────┘    └─────────────────┘  │
│          │                     │                       │            │
│          ▼                     ▼                       │            │
│  ┌────────────────┐    ┌─────────────────┐            │            │
│  │  Tool System   │    │  SQLite Storage │◀───────────┘            │
│  │ (analyze/review│    │ (conversation   │                         │
│  │  /search)      │    │  history)       │                         │
│  └────────────────┘    └─────────────────┘                         │
│          │                                                          │
│          ▼                                                          │
│  ┌────────────────┐                                                │
│  │  KV Namespace  │                                                │
│  │  (caching)     │                                                │
│  └────────────────┘                                                │
└─────────────────────────────────────────────────────────────────────┘
```

### Components

| Component            | Technology                     | Purpose                                       |
| -------------------- | ------------------------------ | --------------------------------------------- |
| **Frontend**         | React 19, Vite, Tailwind CSS 4 | Chat interface with syntax highlighting       |
| **API Layer**        | Cloudflare Workers             | Request routing and orchestration             |
| **AI Engine**        | Workers AI (Llama 3.3 70B FP8) | Natural language understanding and generation |
| **State Management** | Durable Objects + SQLite       | Persistent conversation history per session   |
| **Caching**          | KV Namespace                   | Documentation and response caching            |
| **Tools**            | Zod-validated functions        | Error analysis, code review, doc search       |

---

## Features in Detail

### Error Analysis

Paste any Cloudflare Worker error and get instant diagnosis:

```
User: "Error: Worker exceeded CPU time limit at handleRequest (worker.js:42)"

DevCopilot: This is a CPU_TIME_EXCEEDED error. Your Worker is taking too long
to execute. Here's how to fix it:

1. Move heavy computation to a background queue (Queues)
2. Use streaming responses instead of buffering
3. Cache expensive operations with KV
4. Consider breaking into multiple Workers with Service Bindings
```

**Supported Error Types:** CPU limits, memory issues, KV errors, D1 query failures, R2 operations, Durable Object limits, and 12+ more patterns.

### Code Review

Submit your Worker code for comprehensive analysis:

```javascript
// Your code
export default {
  async fetch(request, env) {
    const data = await env.DB.prepare("SELECT * FROM users").all();
    return new Response(JSON.stringify(data));
  }
};

// DevCopilot identifies:
// Missing error handling for database query
// No Content-Type header set
// Consider pagination for large result sets
// Suggestion: Add try/catch and proper headers
```

### Documentation Search

Ask questions in natural language:

- "How do Durable Objects differ from KV?"
- "What's the best way to handle file uploads with R2?"
- "Explain WebSocket hibernation in Workers"

DevCopilot searches across 30+ documentation topics and returns relevant, contextualized answers.

---

## Setup Instructions

### Prerequisites

- **Node.js** 22.12+ (recommended) or 20.x
- **Cloudflare Account** with Workers paid plan (for AI access)
- **Wrangler CLI** 4.x+ (`npm install -g wrangler`)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/karthikyammanur/cf_ai_dev_copilot.git
   cd cf_ai_dev_copilot
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Authenticate with Cloudflare**

   ```bash
   wrangler login
   ```

4. **Create KV Namespace** (if not already created)

   ```bash
   wrangler kv namespace create "CACHE"
   # Copy the ID and update wrangler.toml
   ```

5. **Configure environment** (optional for local dev)

   ```bash
   cp .dev.vars.example .dev.vars
   # Edit .dev.vars if needed
   ```

6. **Run locally**

   ```bash
   npm run dev
   ```

   Open [http://localhost:5173](http://localhost:5173)

7. **Deploy to Cloudflare**
   ```bash
   npm run deploy
   ```

### Environment Variables

| Variable        | Required   | Description                                      |
| --------------- | ---------- | ------------------------------------------------ |
| `AI`            | Auto-bound | Workers AI binding (configured in wrangler.toml) |
| `CACHE`         | Auto-bound | KV namespace for caching                         |
| `COPILOT_AGENT` | Auto-bound | Durable Object binding                           |

---

## Usage Examples

### Debugging an Error

```
You: I'm getting this error in my Worker:
"TypeError: Cannot read properties of undefined (reading 'get')"
at line 15 in my KV access code

DevCopilot: This error occurs when your KV namespace binding is undefined.
Common causes:
1. KV namespace not bound in wrangler.toml
2. Typo in the binding name
3. Missing await on KV.get()

Here's the fix:
```

```javascript
// Ensure binding exists in wrangler.toml
[[kv_namespaces]];
binding = "MY_KV";
id = "your-namespace-id";

// In your code, always check the binding
if (!env.MY_KV) {
  return new Response("KV not configured", { status: 500 });
}
const value = await env.MY_KV.get("key");
```

### Reviewing Worker Code

```
You: Review this code for security issues:

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    const file = url.searchParams.get("file");
    return env.BUCKET.get(file);
  }
}

DevCopilot: Critical: Path traversal vulnerability detected!
An attacker could access any file: ?file=../../../etc/passwd

Fix with path validation:
```

```javascript
const safePath = file.replace(/\.\./g, "").replace(/^\//, "");
if (!safePath || safePath.includes("/")) {
  return new Response("Invalid path", { status: 400 });
}
```

---

## Technical Details

### Llama 3.3 70B Integration

DevCopilot uses `@cf/meta/llama-3.3-70b-instruct-fp8-fast` via Workers AI:

```typescript
const response = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
  messages: conversationHistory,
  max_tokens: 2048,
  temperature: 0.7
});
```

The model runs on Cloudflare's GPU infrastructure with:

- **FP8 quantization** for fast inference
- **~50-200ms latency** from edge
- **No cold starts** - always warm

### Durable Objects State Management

Each user session gets a dedicated Durable Object instance with SQLite storage:

```typescript
class DevCopilotAgent extends DurableObject {
  sql: SqlStorage;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS messages (...)`);
  }
}
```

### Tool Calling Architecture

Tools are defined with Zod schemas for type-safe validation:

```typescript
const analyzeError = tool({
  description: "Analyze Cloudflare Worker error logs",
  parameters: z.object({
    errorMessage: z.string(),
    errorType: z.string().optional(),
    stackTrace: z.string().optional()
  }),
  execute: async ({ errorMessage }) => {
    // Pattern matching against 12+ error types
    return { diagnosis, suggestions, codeExample };
  }
});
```

---

## Development

### Local Development

```bash
# Start dev server with hot reload
npm run dev

# Run type checking
npm run check

# Run tests
npm run test

# Format code
npm run format
```

### Project Structure

```
src/
├── server.ts              # Main Worker entry point
├── client.tsx             # React app entry
├── app-devcopilot.tsx     # Chat UI component
├── durable-objects/
│   └── DevCopilotAgent.ts # Stateful agent with SQLite
├── tools/
│   ├── analyzeCloudflareError.ts
│   ├── reviewWorkerCode.ts
│   └── searchCloudflareDocs.ts
└── components/
    ├── code-block/        # Syntax highlighting
    ├── project-context/   # Sidebar state display
    └── error-log-input/   # Error paste UI
```

### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## Future Improvements

- [ ] **Multi-file project context** - Analyze entire Worker projects
- [ ] **Wrangler CLI integration** - Direct deployment commands from chat
- [ ] **GitHub integration** - Link repos and auto-review PRs
- [ ] **Custom knowledge base** - Upload your own documentation
- [ ] **Team workspaces** - Shared conversation history
- [ ] **Voice input** - Speak your questions
- [ ] **VS Code extension** - Inline assistance in your editor

---

## Built With

This project uses Cloudflare's [Agents Starter Kit](https://github.com/cloudflare/agents-starter) as the foundation and extends it with custom AI tools and UI components designed specifically for Cloudflare Workers development assistance.

All code was developed with AI assistance using **Claude Opus 4.5** via GitHub Copilot. See [PROMPTS.md](PROMPTS.md) for the complete development process and prompts used.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

Built with Cloudflare Workers

---

<p align="center">
  <strong>Powered by</strong><br>
  <a href="https://workers.cloudflare.com/">Cloudflare Workers</a> • 
  <a href="https://developers.cloudflare.com/workers-ai/">Workers AI</a> • 
  <a href="https://developers.cloudflare.com/durable-objects/">Durable Objects</a>
</p>
