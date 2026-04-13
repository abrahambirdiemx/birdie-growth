# Deploying Birdie Supabase Infrastructure

This folder contains Edge Functions, SQL migrations, and RLS policies for the Birdie Growth Dashboard.
Run these steps **once** to enable agent integrations, webhooks, and secure data access.

---

## Prerequisites

```bash
# Install Supabase CLI
brew install supabase/tap/supabase

# Log in with your Supabase account
supabase login

# Link this repo to the Birdie project
supabase link --project-ref xjrgqborwhvyqgrczetq
```

---

## Step 1 — Run SQL Migrations

Open the [Supabase SQL Editor](https://supabase.com/dashboard/project/xjrgqborwhvyqgrczetq/sql/new) and run each file in order:

1. `migrations/001_goals_table.sql` — Creates `goals` table, seeds Q2-2026 targets
2. `migrations/002_agent_events_table.sql` — Creates `agent_events` table for Claude agent actions
3. `migrations/003_rls_policies.sql` — Enables Row Level Security on all tables

**Verify RLS is active:**
The last query in `003_rls_policies.sql` confirms `rowsecurity = true` for all 5 tables.

---

## Step 2 — Set Edge Function Secrets

Generate two random secrets before deploying:

```bash
# Generate secrets (or use any random string generator)
openssl rand -hex 32   # run twice — one for each secret

# Set them in Supabase
supabase secrets set AGENT_SECRET_KEY=<paste-your-first-secret>
supabase secrets set GRANOLA_WEBHOOK_SECRET=<paste-your-second-secret>
```

**Save these secrets somewhere safe** (e.g. 1Password, Notion private page).
- `AGENT_SECRET_KEY` → used in Claude Code agent configs as `BIRDIE_AGENT_KEY`
- `GRANOLA_WEBHOOK_SECRET` → used in Granola webhook settings

---

## Step 3 — Deploy Edge Functions

```bash
# Deploy both functions
supabase functions deploy agent-api
supabase functions deploy webhook-granola

# Verify they're live
curl -X POST https://xjrgqborwhvyqgrczetq.supabase.co/functions/v1/agent-api \
  -H "x-agent-key: YOUR_AGENT_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "ping"}'
# Expected: {"ok":true,"ts":"...","version":"1.0.0"}
```

---

## Step 4 — Configure Claude Code Agents

Add these environment variables to your Claude Code agent projects:

```bash
# ~/.bashrc or project .env (never commit to git)
export BIRDIE_AGENT_URL=https://xjrgqborwhvyqgrczetq.supabase.co/functions/v1/agent-api
export BIRDIE_AGENT_KEY=<your-AGENT_SECRET_KEY>
```

Your agents can now call:
```bash
# Example: create a deal
curl -X POST $BIRDIE_AGENT_URL \
  -H "x-agent-key: $BIRDIE_AGENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create_deal",
    "payload": {
      "opportunity_name": "ACME Corp",
      "owner": "Abraham Lopez",
      "status": "Discovery",
      "mrr": 1500,
      "acv": 18000
    }
  }'
```

---

## Step 5 — Configure Granola Webhook

In Granola: **Settings → Webhooks → Add Webhook**
- URL: `https://xjrgqborwhvyqgrczetq.supabase.co/functions/v1/webhook-granola`
- Header key: `x-webhook-secret`
- Header value: `<your-GRANOLA_WEBHOOK_SECRET>`

After a call ends, Granola will POST the summary + action items to this endpoint.
The dashboard will show a notification instantly (via Realtime WebSocket).

---

## Available Agent Actions

| Action | Description |
|--------|-------------|
| `ping` | Health check — returns `{ok: true}` |
| `get_pipeline` | Fetch deals (optional: filter by `status`, `owner`, `limit`) |
| `create_deal` | Create a new pipeline deal |
| `update_deal` | Update any fields on a deal by `id` |
| `update_stage` | Change a deal's stage (also logs an agent_event) |
| `log_activity` | Add an entry to `kpi_logs` |
| `get_goals` | Get quarterly goals: `{quarter: "2026-Q2"}` |
| `set_goal` | Set a quarterly goal value |
| `get_agent_events` | Get pending events (default: last 20 pending) |
| `create_event` | Create an event to surface in the dashboard sidebar |
| `dismiss_event` | Mark an event as dismissed |
| `mark_event_reviewed` | Mark an event as reviewed by a user |
| `search_crm` | Search CRM accounts by company name |
