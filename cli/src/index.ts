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
  .version("0.2.0");

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

program.parse();
