// Minimal env validator — no external libs
type Env = {
  NODE_ENV?: string;
  OPENAI_API_KEY: string;
  AVIATIONSTACK_API_KEY?: string;
  DATABASE_URL?: string;
  MONGODB_URI?: string;
  JWT_SECRET?: string;
  DEBUG_UNIFIED_PROMPT?: string; // "1" to console.log the built prompt
  DEBUG_WRITE_PROMPT?: string;   // "1" to also write logs/prompt-<id>.json
};

const REQUIRED: (keyof Env)[] = ["OPENAI_API_KEY"];

function load(): Env {
  const e = process.env as unknown as Env;
  for (const k of REQUIRED) {
    if (!e[k]) throw new Error(`Missing required env var: ${k}`);
  }
  return e;
}

export const env = load();

export const isPromptDebugOn =
  (env.DEBUG_UNIFIED_PROMPT ?? "") === "1" || (env.DEBUG_WRITE_PROMPT ?? "") === "1";

feat(config): add env.ts with minimal validator
