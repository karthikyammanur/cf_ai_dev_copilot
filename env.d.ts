/* eslint-disable */
// cf_ai_dev_copilot - Environment Type Definitions
// Regenerate with: wrangler types env.d.ts --include-runtime false

declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./src/server");
		durableNamespaces: "DevCopilotAgent";
	}
	interface Env {
		// Workers AI Binding - Llama 3.3 70B
		AI: Ai;
		
		// Durable Object for conversation/project state
		COPILOT_AGENT: DurableObjectNamespace<import("./src/server").DevCopilotAgent>;
		
		// KV Namespace for caching
		CACHE: KVNamespace;
		
		// Environment variables from wrangler.toml
		AI_MODEL: string;
		APP_NAME: string;
		MAX_CONVERSATION_HISTORY: string;
		MAX_TOKENS: string;
		
		// Optional: OpenAI API key for fallback/comparison
		OPENAI_API_KEY?: string;
	}
}

interface Env extends Cloudflare.Env {}

type StringifyValues<EnvType extends Record<string, unknown>> = {
	[Binding in keyof EnvType]: EnvType[Binding] extends string ? EnvType[Binding] : string;
};

declare namespace NodeJS {
	interface ProcessEnv extends StringifyValues<Pick<Cloudflare.Env, "AI_MODEL" | "APP_NAME">> {}
}
