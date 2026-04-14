#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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
  .version("0.1.0");

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

program.parse();
