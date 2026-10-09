# Internal agency pilot

This fork supports an internal shared workspace, manual client profiles, Reddit
collection through Apify, Google search through DataForSEO, and Cloudflare AI
(Llama 3.3 70B for both structured scoring and text generation). No paid API calls are necessary to run the tests.

## Accounts and secrets

Keep `.env`, `.dev.vars`, and API keys out of source control and chat.

- Clerk: create an application for sign-in. Set its existing publishable/secret keys.
- PostgreSQL: use an external database with TLS for deployment. Run all migrations,
  including `0040_flawless_makkari.sql`, using `npm run db:migrate` with DATABASE_URL.
- Apify: get a token from the free account. The adapter is specifically for
  `trudax/reddit-scraper-lite`; changing an Actor requires checking its schema.
- DataForSEO: use API login and API password, which may differ from website credentials.
- Cloudflare: a Worker with the `AI` binding (configured in `wrangler.jsonc`). No AI API token is needed. The configured `@cf/meta/llama-3.3-70b-instruct-fp8-fast` model uses Workers AI; confirm access and usage billing in your account.

Set these alongside the existing Clerk keys, DATABASE_URL, APP_URL, and
APP_ENCRYPTION_KEY:

```dotenv
SELF_HOSTED=true
AGENCY_MODE=true
AGENCY_ALLOWED_EMAILS=you@example.com,boss@example.com
AGENCY_WORKSPACE_ID=internal-agency
DATA_PROVIDER=apify
APIFY_TOKEN=
DATAFORSEO_LOGIN=
DATAFORSEO_PASSWORD=
AI_PROVIDER=cloudflare
HOUSE_DATA_CAP_USD_PER_DAY=0.50
HOUSE_LLM_CAP_USD_PER_DAY=1
DATA_MONTHLY_CAP_USD=5
PROJECT_DATA_MONTHLY_CAP_USD=2
APIFY_MAX_ITEMS=20
APIFY_MAX_RUN_USD=0.10
REDDIT_CALLS_IN_FLIGHT=1
REDDIT_CALLS_PER_SECOND=1
X_LEADS=false
SCHEDULER_SEED=false
```

Only verified, allowlisted Clerk emails can enter. Both accounts act for a dedicated
workspace owner, so client projects and settings are shared. Existing personal
projects are not automatically adopted. Keep AGENCY_WORKSPACE_ID stable. This is an
internal shared-admin workspace, not a customer portal with roles or per-person audit
history. Read-only API/MCP bearer keys are disabled in agency mode. Email digest
channels must explicitly name a recipient because the shared owner has no personal email.

## First scan

For Cloudflare AI, use `npm run cf:preview` with configured secrets in `.dev.vars` and a Cloudflare login (`npx wrangler login`). The remote AI binding uses real inference and may incur charges. Plain `next dev` has no AI binding; use the Worker preview for this provider. Scheduled scans run through the Worker cron handler. Local preview enables Wrangler’s scheduled-event test endpoint. With `SCANS_ENABLED=true` in `.dev.vars`, run `curl "http://localhost:8787/__scheduled?cron=*/5%20*%20*%20*%20*"` in a second terminal. Each request processes one queued job and can spend provider credits. Let it finish; trigger it again to process the backfill queued by initial discovery. Local preview does not automatically run the five-minute cron.
Create a client with name, services, customer problem, target customers, and location.
Website is optional. Manual details take precedence; the Apify mode does not scrape
arbitrary business websites or refresh profiles from them. Edit the profile manually.

Apify pilot scans are deliberately small: four Reddit searches, one result batch each,
20 records per Actor run by default, and three Google discovery searches. They do not
promise complete subreddit coverage. Missing author avatars and community promotion
rules remain unknown instead of being invented. Check community rules yourself before
replying. X is disabled even if X_LEADS was left on. When deployed with SCANS_ENABLED=true, the cron repairs missing schedules and runs
one recurring scan per project every 24 hours, even without a recent sign-in.
The initial sweep finishes first. Existing projects are enrolled automatically on
the next cron tick. Scan now can request an earlier scan; subsequent scans are
scheduled 24 hours after completion. Provider spending limits still apply.

The first live validation should use one real client and confirm Actor output, Cloudflare
model responses, and DataForSEO results before demonstrating to customers. No live provider
validation is implied by mocked tests or a successful build.

## Spending

The provider_budget table reserves each Apify run's maximum charge, or $0.01 for a
10-result DataForSEO search, under a transaction lock before calling the provider.
It enforces global monthly, per-client monthly, and daily limits across processes.
Successful responses settle to reported cost. Apify responses without cost conservatively
retain the maximum. Unknown network failures retain their reservation: inspect the provider
run before adjusting it, since a timed-out start may still have spent money. Reservations
are not deleted when a client is deleted, so deleting a project cannot reset global spend.

Apify receives both maxItems and maxTotalChargeUsd; verify the selected Actor's pricing
and cap behavior on the first live run. Dataset reads and external provider pricing changes
can add costs beyond the run's reported amount. DataForSEO's reservation is a conservative
estimate, not a provider-enforced price ceiling. Configure provider-side spend limits too.
Cloudflare token costs are estimated from the configured per-million rates. Free credits are not subtracted from the app's usage estimates.

## Cloudflare Workers

`wrangler.jsonc` deploys an OpenNext Worker, not a static Pages site.

1. Set APP_URL, AGENCY_ALLOWED_EMAILS and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY for your
   production environment. The public Clerk key must also be present during the build.
2. Store DATABASE_URL, APP_ENCRYPTION_KEY, CLERK_SECRET_KEY, APIFY_TOKEN,
   DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD with `wrangler secret put NAME`.
   The AI binding supplies inference access; no AI token or account ID secret is needed.
   Deployment still requires access to the Cloudflare account (for example, Wrangler login).
3. Run migrations from a trusted local/CI connection before deployment.
4. Run `npm run cf:build` and preview before `npm run cf:deploy`.
5. SCANS_ENABLED defaults to false. Set it to true after credentials, budgets, and the
   first project are ready, then redeploy. Cron claims one queued job every five minutes.
   RUN_SCHEDULER must remain false on Workers: no background Node timer is started.

Each scheduled handler awaits its job; no scan runs in an HTTP request's short waitUntil
window. PostgreSQL leases prevent duplicate job claims. Request/job database connections
are scoped and closed instead of sharing sockets across Workers invocations. Long scans
must fit Cloudflare's scheduled-event limits; the pilot is bounded, but actual duration
still needs a live measurement. Production-scale scans may need durable per-stage jobs.

Original Docker/AnyAPI/OpenRouter behavior remains available with agency mode off and the
original provider settings. The new spend-reservation limits apply only to the new providers.

## Recovering an interrupted pilot

Timed-out, aborted, or failed Apify runs can contain usable records. The adapter
keeps these records and reports partial coverage. An empty failed run remains an
error. A recovery never launches another Actor run or books its charge twice.

To save an existing run already recorded against a project:

```sh
node --env-file=.dev.vars --import tsx scripts/recover-apify.ts PROJECT_ID RUN_ID
```

With Cloudflare Workers AI access available, evaluate the
saved Google evidence and recovered posts, and generate shorter search phrases:

```sh
node --env-file=.dev.vars --import tsx scripts/review-recovered.ts PROJECT_ID RUN_ID
```

The second command uses your Wrangler login and AI binding. It spends on AI,
but makes no new Google search or Reddit scrape. Stored post IDs and source
links are deduplicated and existing post evaluations are reused.

The Cloudflare scoring path now uses Llama rather than Jev. It returns validated
JSON for the same questions, but its numeric confidence estimates are not Jev's
calibrated probabilities. Review the first results manually before relying on
existing scoring thresholds. The original Gateway/OpenRouter Jev path remains
available only when AI_PROVIDER is not cloudflare.
