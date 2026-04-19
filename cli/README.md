# @unformal/cli

CLI for [Unformal](https://unformal.ai) — create and manage AI-powered conversational forms. Replace static forms with AI conversations that adapt to each respondent and extract structured data.

## Install

```bash
npm i -g @unformal/cli
# or run directly with npx
npx @unformal/cli <command>
```

## Authenticate

### Option A: agent-ready signup (no browser)

Create an account straight from the terminal. The key comes back immediately; a 6-digit code hits your inbox to activate it.

```bash
unformal signup --email you@example.com
# -> API key printed, inactive until verified
unformal verify --email you@example.com --code 123456
# -> key is now active
unformal init --key unf_...
```

Intended for AI agents: two API calls, one human action (reading six digits). No password, no OAuth dance.

### Option B: existing key

If you already have an API key (from [unformal.ai/studio/settings](https://unformal.ai/studio/settings) or a previous signup), just run:

```bash
unformal init --key unf_YOUR_KEY
```

Or export `UNFORMAL_API_KEY=unf_...` in your shell.

## Commands

### Auth (no API key required)
```bash
unformal signup --email you@example.com       # Create account, get inactive key + email code
unformal verify --email you@example.com --code 123456    # Activate key
unformal resend-verification --email you@example.com     # New code if the first expired
```

### Create and manage Pulses
```bash
unformal create --intention "Qualify leads for our enterprise plan" --mode interview
unformal list
unformal get PULSE_ID
unformal update PULSE_ID --max-questions 10
```

### Read responses
```bash
unformal conversations PULSE_ID            # Summary table of all conversations
unformal conversation CONV_ID              # Full transcript + structured answers + echo
unformal export PULSE_ID --format json --output all.json   # Bulk dump
unformal export PULSE_ID --format csv --output all.csv
```

### Aggregate insights
```bash
unformal resonance PULSE_ID                # Themes, NPS, per-question stats, quotes, open-ended highlights
unformal analytics PULSE_ID                # Completion rate, duration, field coverage, sentiment
```

### Account
```bash
unformal usage                             # Credit balance + totals
```

Every command supports `--json` for piping structured output to another agent.

## API

Everything the CLI does is available on the HTTP API. See [unformal.ai/SKILL.md](https://unformal.ai/SKILL.md) for the full reference including curl examples, response shapes, and the list of ui_hint types.

## License

MIT
