# @unformal/cli

CLI for [Unformal](https://unformal.ai) — create and manage AI-powered conversational forms. Replace static forms with AI conversations that adapt to each respondent and extract structured data.

## Install

```bash
npm i -g @unformal/cli
# or run directly with npx
npx @unformal/cli <command>
```

## Authenticate

Get an API key from [unformal.ai/studio/settings](https://unformal.ai/studio/settings) (or via the signup API — see [SKILL.md](https://unformal.ai/SKILL.md)), then:

```bash
unformal init --key unf_YOUR_KEY
```

Or export `UNFORMAL_API_KEY=unf_...` in your shell.

## Commands

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
