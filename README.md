# Unformal Agent Skills

Official [Agent Skills](https://agentskills.io) for [Unformal](https://unformal.ai) — the conversation-first input platform.

## What is Unformal?

Replace forms with AI-powered conversations. Create a Pulse, share a link, an AI agent has a real conversation with the respondent, you get structured insights back.

## Available Skills

### `unformal-api`

Create and manage conversational Pulses via the Unformal REST API.

**Install with ClawHub:**
```bash
npx clawhub install unformal-api
```

**Or copy the skill directory** into your agent's skills folder.

### `unformal-notifications`

Get real-time desktop notifications and in-session alerts when someone completes a Pulse. Includes a shell listener that connects to Unformal's SSE stream and a Claude skill that reads the inbox.

**Install with ClawHub:**
```bash
npx clawhub install unformal-notifications
```

**Or copy the `unformal-notifications/` directory** into your agent's skills folder.

**Quick install of the listener only:**
```bash
mkdir -p ~/bin
curl -fsS https://unformal.ai/unformal-listen.sh > ~/bin/unformal-listen
chmod +x ~/bin/unformal-listen
unformal-listen <pulse_id>
```

## Quick Start

```bash
# Sign up (no browser needed)
curl -X POST "https://unformal.ai/api/v1/signup" \
  -H "Content-Type: application/json" \
  -d '{"email": "your@email.com"}'

# Create a Pulse
curl -X POST "https://unformal.ai/api/v1/pulses" \
  -H "Authorization: Bearer unf_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"intention": "Understand what a new client needs"}'

# → Returns shareable URL immediately
```

## Links

- **Product:** https://unformal.ai
- **API Docs:** https://unformal.ai/docs/api
- **ClawHub:** `npx clawhub install unformal-api`
- **Agent Skills Spec:** https://agentskills.io

## Publishing updates

Maintainers only. The helper script publishes each skill in this repo to
ClawHub if its local version (from `SKILL.md` frontmatter) is ahead of the
registry. Scoped strictly to this repo — it will not pick up skills that
live elsewhere on your machine.

```bash
# One-time: authenticate locally (stores token outside this repo)
npx clawhub login

# Preview what would be published
scripts/publish-to-clawhub.sh --dry-run

# Interactive — prompts per skill and asks for a changelog
scripts/publish-to-clawhub.sh

# Non-interactive
scripts/publish-to-clawhub.sh --yes --changelog "Release notes..."
```

Bump the `version:` field in `<skill>/SKILL.md` frontmatter before running.

## License

MIT
