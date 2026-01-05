#!/usr/bin/env node

/**
 * Environment Verification Script for cf_ai_dev_copilot
 *
 * Checks that all required configuration is in place before deployment.
 * Run with: npm run verify
 */

import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  dim: "\x1b[2m"
};

const check = `${colors.green}✓${colors.reset}`;
const cross = `${colors.red}✗${colors.reset}`;
const warn = `${colors.yellow}⚠${colors.reset}`;

console.log(
  "\n" +
    colors.blue +
    "═══════════════════════════════════════════════════════════" +
    colors.reset
);
console.log(
  colors.blue + "  cf_ai_dev_copilot - Environment Verification" + colors.reset
);
console.log(
  colors.blue +
    "═══════════════════════════════════════════════════════════" +
    colors.reset +
    "\n"
);

let hasErrors = false;
let hasWarnings = false;

// =============================================================================
// Check Node.js Version
// =============================================================================

console.log(colors.dim + "── Node.js ──" + colors.reset);

const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split(".")[0]);
const minorVersion = parseInt(nodeVersion.slice(1).split(".")[1]);

if (majorVersion >= 22 && minorVersion >= 12) {
  console.log(`${check} Node.js version: ${nodeVersion}`);
} else if (majorVersion >= 20) {
  console.log(`${warn} Node.js version: ${nodeVersion} (22.12+ recommended)`);
  hasWarnings = true;
} else {
  console.log(
    `${cross} Node.js version: ${nodeVersion} (requires 20.x or higher)`
  );
  hasErrors = true;
}

// =============================================================================
// Check Wrangler Authentication
// =============================================================================

console.log("\n" + colors.dim + "── Wrangler CLI ──" + colors.reset);

try {
  const whoami = execSync("wrangler whoami 2>&1", { encoding: "utf-8" });
  if (whoami.includes("You are logged in")) {
    const email = whoami.match(/email: (.+)/)?.[1] || "authenticated";
    console.log(`${check} Wrangler authenticated: ${email.trim()}`);
  } else {
    console.log(`${cross} Wrangler not authenticated`);
    console.log(`   Run: wrangler login`);
    hasErrors = true;
  }
} catch (error) {
  console.log(`${cross} Wrangler CLI not found or not authenticated`);
  console.log(`   Run: npm install -g wrangler && wrangler login`);
  hasErrors = true;
}

// =============================================================================
// Check wrangler.toml Configuration
// =============================================================================

console.log("\n" + colors.dim + "── wrangler.toml ──" + colors.reset);

if (existsSync("wrangler.toml")) {
  console.log(`${check} wrangler.toml exists`);

  const wranglerConfig = readFileSync("wrangler.toml", "utf-8");

  // Check AI binding
  if (
    wranglerConfig.includes("[ai]") &&
    wranglerConfig.includes('binding = "AI"')
  ) {
    console.log(`${check} Workers AI binding configured`);
  } else {
    console.log(`${cross} Workers AI binding missing`);
    console.log(`   Add: [ai]\\n   binding = "AI"`);
    hasErrors = true;
  }

  // Check Durable Objects
  if (wranglerConfig.includes("DevCopilotAgent")) {
    console.log(`${check} Durable Object configured (DevCopilotAgent)`);
  } else {
    console.log(`${cross} Durable Object not configured`);
    hasErrors = true;
  }

  // Check KV namespace
  const kvMatch = wranglerConfig.match(
    /\[\[kv_namespaces\]\][\s\S]*?id\s*=\s*"([^"]+)"/
  );
  if (kvMatch && kvMatch[1] && kvMatch[1] !== "YOUR_KV_NAMESPACE_ID") {
    console.log(
      `${check} KV namespace configured: ${kvMatch[1].slice(0, 8)}...`
    );
  } else {
    console.log(`${warn} KV namespace not configured or has placeholder ID`);
    console.log(`   Run: wrangler kv namespace create "CACHE"`);
    hasWarnings = true;
  }

  // Check migrations
  if (
    wranglerConfig.includes("[[migrations]]") &&
    wranglerConfig.includes("new_sqlite_classes")
  ) {
    console.log(`${check} SQLite migration configured`);
  } else {
    console.log(`${warn} SQLite migration not found`);
    hasWarnings = true;
  }
} else {
  console.log(`${cross} wrangler.toml not found`);
  hasErrors = true;
}

// =============================================================================
// Check Required Files
// =============================================================================

console.log("\n" + colors.dim + "── Required Files ──" + colors.reset);

const requiredFiles = [
  { path: "src/server.ts", name: "Main Worker" },
  { path: "src/durable-objects/DevCopilotAgent.ts", name: "Durable Object" },
  { path: "src/tools/analyzeCloudflareError.ts", name: "Error Analysis Tool" },
  { path: "src/tools/reviewWorkerCode.ts", name: "Code Review Tool" },
  { path: "src/tools/searchCloudflareDocs.ts", name: "Docs Search Tool" },
  { path: "src/app-devcopilot.tsx", name: "Chat UI" },
  { path: "src/client.tsx", name: "React Entry" }
];

for (const file of requiredFiles) {
  if (existsSync(file.path)) {
    console.log(`${check} ${file.name}: ${file.path}`);
  } else {
    console.log(`${cross} ${file.name} missing: ${file.path}`);
    hasErrors = true;
  }
}

// =============================================================================
// Check TypeScript Compilation
// =============================================================================

console.log("\n" + colors.dim + "── TypeScript ──" + colors.reset);

try {
  execSync("npx tsc --noEmit 2>&1", { encoding: "utf-8" });
  console.log(`${check} TypeScript compilation successful`);
} catch (error) {
  const output = error.stdout || error.message;
  const errorCount = (output.match(/error TS/g) || []).length;
  console.log(`${cross} TypeScript errors: ${errorCount} error(s)`);
  console.log(`   Run: npm run check`);
  hasErrors = true;
}

// =============================================================================
// Check Dependencies
// =============================================================================

console.log("\n" + colors.dim + "── Dependencies ──" + colors.reset);

if (existsSync("node_modules")) {
  console.log(`${check} node_modules exists`);

  const criticalDeps = [
    "wrangler",
    "vite",
    "react",
    "tailwindcss",
    "@cloudflare/vite-plugin"
  ];

  for (const dep of criticalDeps) {
    if (existsSync(`node_modules/${dep}`)) {
      console.log(`${check} ${dep} installed`);
    } else {
      console.log(`${cross} ${dep} missing`);
      hasErrors = true;
    }
  }
} else {
  console.log(`${cross} node_modules not found`);
  console.log(`   Run: npm install`);
  hasErrors = true;
}

// =============================================================================
// Check .dev.vars (optional)
// =============================================================================

console.log("\n" + colors.dim + "── Local Development ──" + colors.reset);

if (existsSync(".dev.vars")) {
  console.log(`${check} .dev.vars exists (local secrets)`);
} else if (existsSync(".dev.vars.example")) {
  console.log(`${warn} .dev.vars not found, but example exists`);
  console.log(`   Run: cp .dev.vars.example .dev.vars`);
  hasWarnings = true;
} else {
  console.log(`${warn} .dev.vars not found (may not be needed)`);
}

// =============================================================================
// Summary
// =============================================================================

console.log(
  "\n" +
    colors.blue +
    "═══════════════════════════════════════════════════════════" +
    colors.reset
);

if (hasErrors) {
  console.log(
    `${cross} ${colors.red}Verification FAILED${colors.reset} - Fix errors above before deploying`
  );
  process.exit(1);
} else if (hasWarnings) {
  console.log(
    `${warn} ${colors.yellow}Verification passed with warnings${colors.reset}`
  );
  console.log(`   You can deploy, but consider fixing warnings first`);
  console.log(`\n   Deploy: ${colors.blue}npm run deploy${colors.reset}`);
  process.exit(0);
} else {
  console.log(`${check} ${colors.green}All checks passed!${colors.reset}`);
  console.log(`\n   Deploy: ${colors.blue}npm run deploy${colors.reset}`);
  console.log(`   Dev:    ${colors.blue}npm run dev${colors.reset}`);
  process.exit(0);
}

console.log("\n");
