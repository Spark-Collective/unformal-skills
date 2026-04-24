#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { join } from "node:path";

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

// ── Config ────────────────────────────────────────────────────────────────────

const API_BASE = "https://unformal.ai/api/v1";
const CONFIG_DIR = join(homedir(), ".unformal");
const CONFIG_FILE = join(CONFIG_DIR, "config");
const VERSION_CACHE_FILE = join(CONFIG_DIR, "version-check.json");
const VERSION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

// Read version from package.json at runtime so it always matches the
// published npm tag without us hand-syncing a string literal. We're built
// as ESM so __dirname isn't defined — resolve via import.meta.url.
let PKG_VERSION = "unknown";
try {
  const pkgUrl = new URL("../package.json", import.meta.url);
  PKG_VERSION = JSON.parse(readFileSync(pkgUrl, "utf-8")).version ?? "unknown";
} catch {
  /* best effort — fallback is "unknown" which always triggers the warning */
}

// ── Freshness check ───────────────────────────────────────────────────────────
// On invocation, compare our version against the server's /api/v1/version
// endpoint. Print a one-line warning if we're behind. Cached 24h so the
// check runs at most once per day per machine.

interface VersionInfo {
  cli: { latest: string; upgrade: string };
  skill: { latest: string; install: string };
  minimums?: { cliForAllFeatures?: string; skillForAllFeatures?: string };
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1;
  }
  return 0;
}

async function maybeWarnIfStale(): Promise<void> {
  // Skip if user explicitly muted the check or we're in a CI-like env.
  if (process.env.UNFORMAL_NO_UPDATE_CHECK === "1") return;
  if (process.env.CI === "true") return;

  // Use cache if it's fresh.
  try {
    if (existsSync(VERSION_CACHE_FILE)) {
      const cached = JSON.parse(readFileSync(VERSION_CACHE_FILE, "utf-8"));
      if (cached.checkedAt && Date.now() - cached.checkedAt < VERSION_CHECK_INTERVAL_MS) {
        emitWarning(cached.info);
        return;
      }
    }
  } catch {
    /* bad cache, refetch */
  }

  // Fetch with a tight timeout so a slow network never blocks the user's
  // actual command. 1.5s is plenty for a cache-hit JSON response; longer
  // and we skip silently.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${API_BASE}/version`, {
      signal: controller.signal,
      headers: { "user-agent": `@unformal/cli@${PKG_VERSION}` },
    });
    clearTimeout(timeout);
    if (!res.ok) return;
    const info: VersionInfo = await res.json();
    try {
      mkdirSync(CONFIG_DIR, { recursive: true });
      writeFileSync(
        VERSION_CACHE_FILE,
        JSON.stringify({ checkedAt: Date.now(), info }, null, 2)
      );
    } catch {
      /* best effort */
    }
    emitWarning(info);
  } catch {
    /* silent — network failures don't interrupt the user */
  }
}

function emitWarning(info: VersionInfo): void {
  if (!info?.cli?.latest) return;
  const cmp = compareSemver(PKG_VERSION, info.cli.latest);
  if (cmp >= 0) return; // up to date

  // Distinguish "behind a feature line" (missing newer flags) from a
  // minor-patch drift. The former is what bit Josh — agent didn't know
  // about persona / welcomeTitle / allowResearch because its CLI was too
  // old, and a silent stale warning wouldn't have stood out.
  const minCli = info.minimums?.cliForAllFeatures;
  const behindFeatures = minCli && compareSemver(PKG_VERSION, minCli) < 0;
  if (behindFeatures) {
    console.warn(
      red(bold("\n⚠ Your @unformal/cli is missing features.")) +
        ` You're on ${PKG_VERSION}; ${info.cli.latest} adds flags the API now supports (persona, welcome copy, research, topics).`
    );
    console.warn(`  Update: ${bold(info.cli.upgrade)}`);
    console.warn(
      `  Refresh skill: ${bold(info.skill.install)}` +
        dim(" (so your agent knows about the new fields)\n")
    );
  } else {
    console.warn(
      dim(
        `\n⚠ @unformal/cli ${info.cli.latest} is available (you have ${PKG_VERSION}). Run: ${info.cli.upgrade}\n`
      )
    );
  }
}

function getApiKey(): string {
  if (process.env.UNFORMAL_API_KEY) {
    return process.env.UNFORMAL_API_KEY;
  }
  if (existsSync(CONFIG_FILE)) {
    const content = readFileSync(CONFIG_FILE, "utf-8").trim();
    if (content) return content;
  }
  console.error(red("Error: No API key found."));
  console.error(
    dim("Set UNFORMAL_API_KEY or run `unformal init` to configure.")
  );
  process.exit(1);
}

function saveApiKey(key: string): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, key, { mode: 0o600 });
}

// ── API helpers ───────────────────────────────────────────────────────────────

interface ApiResponse<T = unknown> {
  data: T;
}

async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const key = getApiKey();
  const url = `${API_BASE}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    let message: string;
    try {
      const parsed = JSON.parse(body);
      message = parsed.error?.message || parsed.message || body;
    } catch {
      message = body;
    }
    console.error(red(`Error ${res.status}: ${message}`));
    process.exit(1);
  }

  const json = (await res.json()) as ApiResponse<T>;
  return json.data;
}

// Unauthenticated API call (signup / verify / resend-verification).
// These endpoints don't require a Bearer token.
async function publicApi<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    let message: string;
    try {
      const parsed = JSON.parse(body);
      message = parsed.error?.message || parsed.message || body;
    } catch {
      message = body;
    }
    console.error(red(`Error ${res.status}: ${message}`));
    process.exit(1);
  }

  const json = (await res.json()) as ApiResponse<T>;
  return json.data;
}

// Read a line from stdin synchronously-ish (for interactive prompts).
async function prompt(label: string): Promise<string> {
  process.stdout.write(bold(label));
  return new Promise<string>((resolve) => {
    let input = "";
    process.stdin.setEncoding("utf-8");
    const onData = (chunk: string) => {
      input += chunk;
      if (input.includes("\n")) {
        process.stdin.pause();
        process.stdin.off("data", onData);
        resolve(input.trim());
      }
    };
    process.stdin.on("data", onData);
    process.stdin.resume();
  });
}

// ── Table helpers ─────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "\u2026";
}

function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] || "").length))
  );

  const sep = widths.map((w) => "\u2500".repeat(w + 2)).join("\u253c");
  const formatRow = (row: string[]) =>
    row.map((cell, i) => ` ${(cell || "").padEnd(widths[i])} `).join("\u2502");

  console.log(bold(formatRow(headers)));
  console.log(dim(sep));
  for (const row of rows) {
    console.log(formatRow(row));
  }
}

// ── Field parser ──────────────────────────────────────────────────────────────

interface OutputField {
  name: string;
  type: string;
  description: string;
}

function parseFields(raw: string): OutputField[] {
  return raw.split(",").map((entry) => {
    const parts = entry.trim().split(":");
    return {
      name: parts[0] || "",
      type: parts[1] || "text",
      description: parts[2] || "",
    };
  });
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("unformal")
  .description("CLI for Unformal — create and manage AI-powered conversational forms")
  .version(PKG_VERSION);

// ── init ──────────────────────────────────────────────────────────────────────

program
  .command("init")
  .description("Configure your Unformal API key")
  .option("-k, --key <key>", "API key")
  .action(async (opts: { key?: string }) => {
    let key = opts.key;

    if (!key) {
      process.stdout.write(bold("Enter your API key: "));
      key = await new Promise<string>((resolve) => {
        let input = "";
        process.stdin.setEncoding("utf-8");
        process.stdin.on("data", (chunk: string) => {
          input += chunk;
          if (input.includes("\n")) {
            process.stdin.pause();
            resolve(input.trim());
          }
        });
        process.stdin.resume();
      });
    }

    if (!key) {
      console.error(red("Error: No API key provided."));
      process.exit(1);
    }

    // Validate by hitting /usage
    process.env.UNFORMAL_API_KEY = key;
    try {
      await api("/usage");
    } catch {
      console.error(red("Error: Invalid API key."));
      process.exit(1);
    }

    saveApiKey(key);
    console.log(green("API key saved to ~/.unformal/config"));
  });

// ── signup ────────────────────────────────────────────────────────────────────
// Agent-ready account creation. Email in, API key out, 6-digit code hits inbox.
// Run `unformal verify --email <> --code <>` to activate the key.

interface SignupResponse {
  api_key: string;
  workspace_id: string;
  email: string;
  credits: number;
  bonus_credits?: number;
  promo_code?: string | null;
  status: string;
  message?: string;
}

program
  .command("signup")
  .description("Create an Unformal account — email in, inactive API key out, 6-digit code to inbox")
  .requiredOption("-e, --email <email>", "Email address for the account")
  .option("-p, --promo <code>", "Promo/referral code (adds bonus credits)")
  .option("--save", "Save the returned API key to ~/.unformal/config (takes effect after verify)", false)
  .option("--json", "Output raw JSON instead of pretty log", false)
  .action(async (opts: { email: string; promo?: string; save: boolean; json: boolean }) => {
    const body: Record<string, string> = { email: opts.email };
    if (opts.promo) body.promoCode = opts.promo;

    const result = await publicApi<SignupResponse>("/signup", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(green("Account created."));
      console.log(`${bold("Email:")}        ${result.email}`);
      console.log(`${bold("Workspace:")}    ${result.workspace_id}`);
      console.log(`${bold("Credits:")}      ${result.credits}${result.bonus_credits ? dim(` (+${result.bonus_credits} from ${result.promo_code})`) : ""}`);
      console.log(`${bold("API key:")}      ${result.api_key} ${dim("(inactive until verified)")}`);
      console.log("");
      console.log(dim("A 6-digit code was sent to your inbox. Activate with:"));
      console.log(`  ${bold(`unformal verify --email ${result.email} --code <code>`)}`);
    }

    if (opts.save) {
      saveApiKey(result.api_key);
      console.log(dim("API key saved to ~/.unformal/config (will work after verification)."));
    }
  });

// ── verify ────────────────────────────────────────────────────────────────────

program
  .command("verify")
  .description("Verify the 6-digit code sent to your inbox and activate the API key")
  .requiredOption("-e, --email <email>", "Email used at signup")
  .option("-c, --code <code>", "6-digit verification code (prompted if omitted)")
  .action(async (opts: { email: string; code?: string }) => {
    let code = opts.code;
    if (!code) {
      code = await prompt("Enter the 6-digit code from your email: ");
    }
    if (!code) {
      console.error(red("Error: No code provided."));
      process.exit(1);
    }

    await publicApi("/verify", {
      method: "POST",
      body: JSON.stringify({ email: opts.email, code }),
    });

    console.log(green("Email verified. Your API key is now active."));
    console.log(dim("Run `unformal init --key <your-key>` to save it locally, or set UNFORMAL_API_KEY."));
  });

// ── login ─────────────────────────────────────────────────────────────────────
// For existing users who don't have their API key saved locally. Hits a
// separate 6-digit flow that mints a fresh active key on the user's default
// workspace (we only store hashes, so we can never reveal a previously-issued
// key — the right thing is to issue a new one).

interface LoginVerifyResponse {
  api_key: string;
  workspace_id: string;
  email: string;
  status: string;
  message?: string;
}

program
  .command("login")
  .description("Get a fresh API key for an existing verified account (6-digit email code)")
  .requiredOption("-e, --email <email>", "Email of your existing Unformal account")
  .option("-c, --code <code>", "If provided, verify the code and return the API key in one step")
  .option("--save", "Save the returned API key to ~/.unformal/config after verification", false)
  .option("--json", "Output raw JSON instead of pretty log", false)
  .action(async (opts: { email: string; code?: string; save: boolean; json: boolean }) => {
    // Step 1: request a code if one wasn't already provided.
    if (!opts.code) {
      await publicApi("/login", {
        method: "POST",
        body: JSON.stringify({ email: opts.email }),
      });
      console.log(green("Login code sent."));
      console.log(dim("If an account exists for " + opts.email + ", a 6-digit code was emailed. It expires in 15 minutes."));
      console.log("");
      console.log(dim("Once you have the code, run:"));
      console.log(`  ${bold(`unformal login --email ${opts.email} --code <code>${opts.save ? " --save" : ""}`)}`);
      return;
    }

    // Step 2: verify + receive API key.
    const result = await publicApi<LoginVerifyResponse>("/login/verify", {
      method: "POST",
      body: JSON.stringify({ email: opts.email, code: opts.code }),
    });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(green("Logged in."));
      console.log(`${bold("Email:")}       ${result.email}`);
      console.log(`${bold("Workspace:")}   ${result.workspace_id}`);
      console.log(`${bold("API key:")}     ${result.api_key}`);
    }

    if (opts.save) {
      saveApiKey(result.api_key);
      console.log(dim("API key saved to ~/.unformal/config."));
    } else if (!opts.json) {
      console.log("");
      console.log(dim("To save locally: unformal init --key " + result.api_key));
    }
  });

// ── resend-verification ───────────────────────────────────────────────────────

program
  .command("resend-verification")
  .description("Resend the 6-digit verification code to your inbox")
  .requiredOption("-e, --email <email>", "Email used at signup")
  .action(async (opts: { email: string }) => {
    await publicApi("/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email: opts.email }),
    });
    console.log(green("Verification code sent. Check your inbox."));
  });

// ── create ────────────────────────────────────────────────────────────────────

program
  .command("create")
  .description("Create a new conversational pulse")
  .requiredOption("--intention <text>", "What the pulse is trying to learn")
  .option("--name <name>", "Display name")
  .option("--slug <slug>", "URL slug")
  .option("--mode <mode>", "Conversation mode")
  .option("--tone <tone>", "Conversation tone")
  .option("--persona <persona>", "AI persona description")
  .option("--context <context>", "Additional context for the AI")
  .option("--research", "Enable research mode", false)
  .option("--insights", "Enable insights generation", false)
  .option("--max-questions <n>", "Maximum number of questions", parseInt)
  .option("--webhook <url>", "Webhook URL for notifications")
  .option("--welcome-title <text>", "Welcome screen title")
  .option("--welcome-description <text>", "Welcome screen description")
  .option("--fields <fields>", "Output fields: name:type:desc,name:type:desc")
  .option("--completion-priority <priority>", "Completion priority")
  .action(async (opts) => {
    const body: Record<string, unknown> = {
      intention: opts.intention,
    };

    if (opts.name) body.name = opts.name;
    if (opts.slug) body.slug = opts.slug;
    if (opts.mode) body.mode = opts.mode;
    if (opts.tone) body.tone = opts.tone;
    if (opts.persona) body.persona = opts.persona;
    if (opts.context) body.context = opts.context;
    if (opts.research) body.research = true;
    if (opts.insights) body.insights = true;
    if (opts.maxQuestions) body.maxQuestions = opts.maxQuestions;
    if (opts.webhook) body.webhook = opts.webhook;
    if (opts.welcomeTitle) body.welcomeTitle = opts.welcomeTitle;
    if (opts.welcomeDescription) body.welcomeDescription = opts.welcomeDescription;
    if (opts.fields) body.outputFields = parseFields(opts.fields);
    if (opts.completionPriority) body.completionPriority = opts.completionPriority;

    const pulse = await api<Record<string, unknown>>("/pulses", {
      method: "POST",
      body: JSON.stringify(body),
    });

    console.log(green("Pulse created successfully!"));
    console.log(`${bold("ID:")}    ${pulse.id}`);
    console.log(`${bold("Name:")}  ${pulse.name || dim("(unnamed)")}`);
    console.log(`${bold("Slug:")}  ${pulse.slug}`);
    console.log(`${bold("URL:")}   ${green(`https://unformal.ai/p/${pulse.slug}`)}`);
  });

// ── list ──────────────────────────────────────────────────────────────────────

program
  .command("list")
  .description("List all pulses")
  .action(async () => {
    const pulses = await api<Record<string, unknown>[]>("/pulses");

    if (!pulses.length) {
      console.log(dim("No pulses found. Create one with `unformal create`."));
      return;
    }

    const headers = ["Name", "Slug", "Mode", "Status", "Convos", "URL"];
    const rows = pulses.map((p) => [
      truncate(String(p.name || "(unnamed)"), 30),
      truncate(String(p.slug || ""), 20),
      String(p.mode || ""),
      String(p.status || ""),
      String(p.conversationCount ?? p.conversations ?? "0"),
      green(`https://unformal.ai/p/${p.slug}`),
    ]);

    printTable(headers, rows);
  });

// ── get ───────────────────────────────────────────────────────────────────────

program
  .command("get <id>")
  .description("Get full details of a pulse")
  .action(async (id: string) => {
    const pulse = await api(`/pulses/${id}`);
    console.log(JSON.stringify(pulse, null, 2));
  });

// ── update ────────────────────────────────────────────────────────────────────

program
  .command("update <id>")
  .description("Update an existing pulse")
  .option("--intention <text>", "What the pulse is trying to learn")
  .option("--name <name>", "Display name")
  .option("--slug <slug>", "URL slug")
  .option("--mode <mode>", "Conversation mode")
  .option("--tone <tone>", "Conversation tone")
  .option("--persona <persona>", "AI persona description")
  .option("--context <context>", "Additional context for the AI")
  .option("--research", "Enable research mode")
  .option("--no-research", "Disable research mode")
  .option("--insights", "Enable insights generation")
  .option("--no-insights", "Disable insights generation")
  .option("--max-questions <n>", "Maximum number of questions", parseInt)
  .option("--webhook <url>", "Webhook URL for notifications")
  .option("--welcome-title <text>", "Welcome screen title")
  .option("--welcome-description <text>", "Welcome screen description")
  .option("--fields <fields>", "Output fields: name:type:desc,name:type:desc")
  .option("--completion-priority <priority>", "Completion priority")
  .action(async (id: string, opts) => {
    const body: Record<string, unknown> = {};

    if (opts.intention) body.intention = opts.intention;
    if (opts.name) body.name = opts.name;
    if (opts.slug) body.slug = opts.slug;
    if (opts.mode) body.mode = opts.mode;
    if (opts.tone) body.tone = opts.tone;
    if (opts.persona) body.persona = opts.persona;
    if (opts.context) body.context = opts.context;
    if (opts.research !== undefined) body.research = opts.research;
    if (opts.insights !== undefined) body.insights = opts.insights;
    if (opts.maxQuestions) body.maxQuestions = opts.maxQuestions;
    if (opts.webhook) body.webhook = opts.webhook;
    if (opts.welcomeTitle) body.welcomeTitle = opts.welcomeTitle;
    if (opts.welcomeDescription) body.welcomeDescription = opts.welcomeDescription;
    if (opts.fields) body.outputFields = parseFields(opts.fields);
    if (opts.completionPriority) body.completionPriority = opts.completionPriority;

    if (Object.keys(body).length === 0) {
      console.error(red("Error: No fields to update. Provide at least one option."));
      process.exit(1);
    }

    const pulse = await api<Record<string, unknown>>(`/pulses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    console.log(green("Pulse updated successfully!"));
    console.log(`${bold("ID:")}   ${pulse.id}`);
    console.log(`${bold("Name:")} ${pulse.name || dim("(unnamed)")}`);
  });

// ── conversations ─────────────────────────────────────────────────────────────

program
  .command("conversations <pulse-id>")
  .description("List conversations for a pulse")
  .action(async (pulseId: string) => {
    const conversations = await api<Record<string, unknown>[]>(
      `/pulses/${pulseId}/conversations`
    );

    if (!conversations.length) {
      console.log(dim("No conversations yet."));
      return;
    }

    const headers = ["ID", "Status", "Messages", "Started", "Completed"];
    const rows = conversations.map((c) => [
      truncate(String(c.id || ""), 24),
      String(c.status || ""),
      String(c.messageCount ?? c.messages ?? "0"),
      String(c.createdAt || c.startedAt || ""),
      String(c.completedAt || dim("-")),
    ]);

    printTable(headers, rows);
  });

// ── conversation (single, full detail) ─────────────────────────────────────────

interface TranscriptMsg {
  role: "assistant" | "user";
  content: string;
  timestamp?: number;
  responseData?: { type: string; data: any };
  uiHint?: { type: string; config?: any };
}

interface ConversationFull {
  id: string;
  pulseId: string;
  status: string;
  transcript: TranscriptMsg[];
  echo?: {
    fields?: Record<string, any>;
    summary?: string;
    keyQuotes?: string[];
    subtext?: string;
    sentimentScore?: number;
  };
  metadata?: Record<string, any>;
  completedAt?: number;
  createdAt?: number;
}

program
  .command("conversation <conversation-id>")
  .description("Show a single conversation with full transcript, structured answers, and echo")
  .option("--json", "Output raw JSON (full conversation object)")
  .action(async (conversationId: string, opts: { json?: boolean }) => {
    const c = await api<ConversationFull>(`/conversations/${conversationId}`);

    if (opts.json) {
      console.log(JSON.stringify(c, null, 2));
      return;
    }

    console.log(bold(`\nConversation ${c.id}`));
    console.log(dim(`  status=${c.status}  messages=${c.transcript?.length ?? 0}`));
    if (c.completedAt) {
      console.log(dim(`  completed: ${new Date(c.completedAt).toISOString()}`));
    }
    console.log();

    // Structured answers (from responseData)
    const structured = (c.transcript ?? []).filter((m) => m.role === "user" && m.responseData);
    if (structured.length) {
      console.log(bold("Structured answers"));
      for (const m of structured) {
        const rd = m.responseData!;
        const val =
          rd.data?.selected !== undefined
            ? Array.isArray(rd.data.selected)
              ? rd.data.selected.join(", ")
              : String(rd.data.selected)
            : rd.data?.value !== undefined
            ? String(rd.data.value)
            : rd.data?.order !== undefined
            ? (rd.data.order as string[]).map((o, i) => `${i + 1}. ${o}`).join("  ")
            : JSON.stringify(rd.data);
        console.log(`  ${dim(`[${rd.type}]`)}  ${val}`);
      }
      console.log();
    }

    // Echo structured output
    if (c.echo?.fields && Object.keys(c.echo.fields).length) {
      console.log(bold("Extracted fields (echo)"));
      for (const [k, v] of Object.entries(c.echo.fields)) {
        const valStr = typeof v === "string" ? v : JSON.stringify(v);
        console.log(`  ${bold(k + ":")}  ${truncate(valStr, 140)}`);
      }
      console.log();
    }

    if (c.echo?.summary) {
      console.log(bold("Summary"));
      console.log(`  ${c.echo.summary}\n`);
    }

    if (c.echo?.keyQuotes?.length) {
      console.log(bold("Key quotes"));
      for (const q of c.echo.keyQuotes) console.log(dim(`  "${truncate(q, 160)}"`));
      console.log();
    }

    // Transcript
    console.log(bold("Transcript"));
    for (const m of c.transcript ?? []) {
      const who = m.role === "assistant" ? green("AI ") : bold("You");
      const content = truncate(String(m.content ?? "").replace(/\s+/g, " "), 200);
      console.log(`  ${who}  ${content}`);
    }
    console.log();
  });

// ── export (bulk raw responses) ────────────────────────────────────────────────

program
  .command("export <pulse-id>")
  .description("Export all conversations (transcripts + echoes) as JSON or CSV")
  .option("--format <fmt>", "json or csv", "json")
  .option("--output <path>", "Write to file instead of stdout")
  .action(async (pulseId: string, opts: { format: string; output?: string }) => {
    const key = getApiKey();
    const format = opts.format === "csv" ? "csv" : "json";
    const url = `${API_BASE}/pulses/${pulseId}/export?format=${format}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      console.error(red(`Error ${res.status}: ${await res.text()}`));
      process.exit(1);
    }

    const body = await res.text();

    if (opts.output) {
      const outPath = resolve(opts.output);
      writeFileSync(outPath, body);
      // Friendly summary
      if (format === "json") {
        try {
          const parsed = JSON.parse(body);
          const n = parsed.conversations?.length ?? 0;
          console.log(green(`✓ Wrote ${n} conversations to ${outPath}`));
        } catch {
          console.log(green(`✓ Wrote ${body.length} bytes to ${outPath}`));
        }
      } else {
        const rows = body.split("\n").length - 1;
        console.log(green(`✓ Wrote ${rows} rows to ${outPath}`));
      }
    } else {
      process.stdout.write(body);
    }
  });

// ── resonance ─────────────────────────────────────────────────────────────────

interface ResonanceStatsNps {
  score: number;
  promoters: number;
  passives: number;
  detractors: number;
}

interface ResonanceQuestionAggregate {
  questionIndex: number;
  question: string;
  type: string;
  stats: {
    n?: number;
    mean?: number;
    median?: number;
    min?: number;
    max?: number;
    nps?: ResonanceStatsNps;
    options?: { label: string; count: number; percentage: number }[];
    items?: { label: string; avgRank: number; topCount: number }[];
  };
}

interface ResonanceOpenEnded {
  fieldName: string;
  label?: string;
  description?: string;
  values: string[];
}

interface ResonancePayload {
  available: boolean;
  reason?: string;
  pulseId?: string;
  totalConversations?: number;
  autoSummary?: string;
  themes?: { theme: string; frequency: number; sentiment?: string }[];
  consensusPoints?: string[];
  divergencePoints?: string[];
  recommendedActions?: string[];
  sentimentDistribution?: { positive: number; neutral: number; negative: number };
  questionAggregates?: ResonanceQuestionAggregate[];
  openEndedHighlights?: ResonanceOpenEnded[];
  featuredQuotes?: string[];
}

program
  .command("resonance <pulse-id>")
  .description("Show aggregate insights: themes, NPS, per-question stats, quotes")
  .option("--json", "Output raw JSON (good for piping into another agent)")
  .action(async (pulseId: string, opts: { json?: boolean }) => {
    const r = await api<ResonancePayload>(`/pulses/${pulseId}/resonance`);

    if (opts.json) {
      console.log(JSON.stringify(r, null, 2));
      return;
    }

    if (!r.available) {
      console.log(dim(r.reason || "Resonance not available yet."));
      return;
    }

    console.log(
      bold(`\nResonance — ${r.totalConversations} conversations\n`)
    );

    if (r.autoSummary) {
      console.log(bold("Summary"));
      console.log(r.autoSummary + "\n");
    }

    if (r.sentimentDistribution) {
      const s = r.sentimentDistribution;
      console.log(
        bold("Sentiment: ") +
          green(`+${s.positive}%`) +
          dim(` · ${s.neutral}% neutral · `) +
          red(`-${s.negative}%`) +
          "\n"
      );
    }

    if (r.consensusPoints && r.consensusPoints.length) {
      console.log(bold("Consensus"));
      for (const p of r.consensusPoints) console.log(`  ${green("✓")} ${p}`);
      console.log();
    }

    if (r.divergencePoints && r.divergencePoints.length) {
      console.log(bold("Divergence"));
      for (const p of r.divergencePoints) console.log(`  ⇔ ${p}`);
      console.log();
    }

    if (r.recommendedActions && r.recommendedActions.length) {
      console.log(bold("Recommended actions"));
      r.recommendedActions.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
      console.log();
    }

    if (r.questionAggregates && r.questionAggregates.length) {
      console.log(bold("Results by question"));
      for (const agg of r.questionAggregates) {
        const s = agg.stats || {};
        const header = `  Q${agg.questionIndex + 1} [${agg.type}] ${truncate(agg.question, 70)}`;
        console.log(header);
        if (agg.type === "slider") {
          let line = `     n=${s.n} mean=${s.mean} median=${s.median} range=${s.min}–${s.max}`;
          if (s.nps) {
            line += `  ${bold("NPS=" + s.nps.score)} (P=${s.nps.promoters} Pa=${s.nps.passives} D=${s.nps.detractors})`;
          }
          console.log(dim(line));
        } else if (agg.type === "ranking" && s.items) {
          for (const it of s.items.slice(0, 5)) {
            console.log(dim(`     avg#${it.avgRank}  ${it.label}`));
          }
        } else if (s.options) {
          for (const o of s.options.slice(0, 6)) {
            console.log(dim(`     ${String(o.count).padStart(3)}  ${String(o.percentage).padStart(5)}%  ${o.label}`));
          }
        }
      }
      console.log();
    }

    if (r.openEndedHighlights && r.openEndedHighlights.length) {
      console.log(bold("Open-ended highlights"));
      for (const section of r.openEndedHighlights) {
        console.log(`  ${bold(section.label || section.fieldName)}  ${dim(`(${section.values.length} responses)`)}`);
        for (const v of section.values.slice(0, 3)) {
          console.log(dim(`    • ${truncate(v, 100)}`));
        }
        if (section.values.length > 3) {
          console.log(dim(`    … and ${section.values.length - 3} more (use --json for all)`));
        }
      }
      console.log();
    }

    if (r.featuredQuotes && r.featuredQuotes.length) {
      console.log(bold("Voices"));
      for (const q of r.featuredQuotes.slice(0, 5)) {
        console.log(dim(`  "${truncate(q, 140)}"`));
      }
      console.log();
    }
  });

// ── analytics ─────────────────────────────────────────────────────────────────

interface AnalyticsPayload {
  available: boolean;
  analytics: {
    completionRate?: number;
    completedConversations?: number;
    abandonmentRate?: number;
    commonAbandonmentPoint?: number | null;
    avgDuration?: number;
    avgFieldCoverage?: number;
    avgSentiment?: number;
    avgMessageCount?: number;
    avgResponseLength?: number;
    fieldFillRates?: Record<string, number>;
  } | null;
}

program
  .command("analytics <pulse-id>")
  .description("Show completion rate, duration, field coverage, sentiment, abandonment")
  .option("--json", "Output raw JSON")
  .action(async (pulseId: string, opts: { json?: boolean }) => {
    const r = await api<AnalyticsPayload>(`/pulses/${pulseId}/analytics`);

    if (opts.json) {
      console.log(JSON.stringify(r, null, 2));
      return;
    }

    if (!r.available || !r.analytics) {
      console.log(dim("Analytics not available yet — no completed conversations."));
      return;
    }

    const a = r.analytics;
    const pct = (v?: number) =>
      v == null ? "—" : `${(v * 100).toFixed(1)}%`;
    const sec = (v?: number) =>
      v == null ? "—" : v > 60 ? `${Math.round(v / 60)}m ${Math.round(v % 60)}s` : `${Math.round(v)}s`;

    console.log(bold("\nAnalytics\n"));
    console.log(`${bold("Completion rate:")}        ${pct(a.completionRate)}   ${dim(`(${a.completedConversations ?? "—"} completed)`)}`);
    console.log(`${bold("Abandonment rate:")}       ${pct(a.abandonmentRate)}   ${dim(`(drop-off around Q${a.commonAbandonmentPoint ?? "—"})`)}`);
    console.log(`${bold("Avg duration:")}           ${sec(a.avgDuration)}`);
    console.log(`${bold("Avg field coverage:")}     ${pct(a.avgFieldCoverage)}`);
    console.log(`${bold("Avg sentiment:")}          ${a.avgSentiment != null ? a.avgSentiment.toFixed(1) + "/10" : "—"}`);
    console.log(`${bold("Avg messages / convo:")}   ${a.avgMessageCount != null ? a.avgMessageCount.toFixed(1) : "—"}`);
    console.log(`${bold("Avg response length:")}    ${a.avgResponseLength != null ? Math.round(a.avgResponseLength) + " chars" : "—"}`);

    if (a.fieldFillRates && Object.keys(a.fieldFillRates).length) {
      console.log(`\n${bold("Field fill rates")}`);
      const entries = Object.entries(a.fieldFillRates).sort((x, y) => y[1] - x[1]);
      for (const [name, rate] of entries) {
        console.log(`  ${pct(rate).padStart(6)}  ${name}`);
      }
    }
    console.log();
  });

// ── usage ─────────────────────────────────────────────────────────────────────

program
  .command("usage")
  .description("Show account usage and credits")
  .action(async () => {
    const usage = await api<{
      creditBalance: number;
      totalConversations: number;
      totalCreditsUsed: number;
    }>("/usage");

    console.log(bold("\nAccount Usage\n"));
    console.log(`${bold("Credits remaining:")}    ${green(String(usage.creditBalance))}`);
    console.log(`${bold("Credits used:")}         ${usage.totalCreditsUsed}`);
    console.log(`${bold("Total conversations:")}  ${usage.totalConversations}`);
    console.log();
  });

// ── Run ───────────────────────────────────────────────────────────────────────

// Briefly await the stale-version check so the warning reaches stderr
// even on fast commands like --help and --version. Hard-capped at 1s so
// we never noticeably slow a user's actual command. On cache-hit the
// check is synchronous and returns immediately; only the first run per
// day (or after cache expiry) pays the network round-trip.
await Promise.race([
  maybeWarnIfStale(),
  new Promise<void>((resolve) => setTimeout(resolve, 1000)),
]);
program.parse();
