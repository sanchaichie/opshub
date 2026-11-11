# Launch checklist

Everything needed to take OpsHub from "works locally" to "live with a public demo", in order. Each integration also lists the **live check** that is still pending, because it could only be tested locally with signed test payloads.

Never paste a key into a chat, an issue or a commit. Keys go into the three places named below: Vercel env vars, GitHub secrets, or the Supabase dashboard.

## 1. Supabase (database, auth)
1. Create a project at https://supabase.com/dashboard. Use the free plan, region **East US**, and save the database password.
2. Add **GitHub secrets** (repo → Settings → Secrets and variables → Actions):
   | Secret | Where it comes from |
   |---|---|
   | `SUPABASE_PROJECT_REF` | Project Settings → General → Project ID |
   | `SUPABASE_DB_PASSWORD` | the password from step 1 |
   | `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens |
   | `SUPABASE_URL` | Project Settings → Data API → Project URL (keep-alive workflow) |
   | `SUPABASE_SECRET_KEY` | Project Settings → API Keys → secret key (keep-alive workflow) |
3. In GitHub → Actions, open the waiting **Deploy migrations** run and **approve** it. This applies every migration to production. ✅ *Live check: the run is green, and the demo org exists.*
4. **Auth settings** (Authentication → URL Configuration): set Site URL to your Vercel URL, and add `<site>/confirm` to the redirect URLs.
5. **Custom SMTP** (Authentication → Emails → SMTP), e.g. Resend. Supabase's built-in email is heavily rate-limited.

## 2. Vercel (hosting)
1. Import `sanchaichie/opshub` at https://vercel.com/new.
2. Add **environment variables** (Project → Settings → Environment Variables):
   | Variable | Value |
   |---|---|
   | `NUXT_PUBLIC_SITE_URL` | `https://<your-project>.vercel.app` |
   | `NUXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NUXT_PUBLIC_SUPABASE_KEY` | Supabase **publishable** key |
   | `NUXT_SUPABASE_SECRET_KEY` | Supabase **secret** key |
   | `CRON_SECRET` | `openssl rand -hex 32` |
   | `NUXT_DEMO_EMAIL_ALLOWLIST` | your own inbox (demo email only ever goes here) |
3. Deploy. ✅ *Live check: `curl <site>/api/health` returns `"db":"ok"`; **Try the demo** works.*
4. **Point the queue worker at the deploy.** pg_cron calls it every minute. Run in the Supabase SQL editor:
   ```sql
   select vault.create_secret('https://<your-project>.vercel.app/api/jobs/run', 'opshub_worker_url');
   select vault.create_secret('<the same CRON_SECRET>', 'opshub_cron_secret');
   ```
5. **Keep-alive:** in GitHub → Actions → Keep-alive, click **Run workflow** once. ✅ *Live check: `/api/health` shows both a `github-actions` and (after the daily cron) a `vercel-cron` heartbeat.*

## 3. Integrations (all test mode)
Add each one's keys to Vercel and redeploy. The Connections page shows the webhook URLs to register.

| Integration | Create | Env vars | Live check still pending |
|---|---|---|---|
| **Stripe** | Test-mode API key; webhook endpoint `<site>/api/webhooks/stripe` for `payment_intent.succeeded` | `NUXT_STRIPE_SECRET_KEY`, `NUXT_STRIPE_WEBHOOK_SECRET` | **Simulate order** creates a real test PaymentIntent and its webhook creates the order; a **Test Checkout** with card `4242 4242 4242 4242` creates an order |
| **EasyPost** | Test API key (`EZTK…`); webhook `<site>/api/webhooks/easypost` with an HMAC secret | `NUXT_EASYPOST_API_KEY`, `NUXT_EASYPOST_WEBHOOK_SECRET` | a paid order gets a test label, and the test tracker walks it to delivered |
| **Slack** | Slack app: redirect URL `<site>/api/oauth/slack/callback`, scope `incoming-webhook` | `NUXT_SLACK_CLIENT_ID`, `NUXT_SLACK_CLIENT_SECRET` | **Connect Slack** on your own org, then shipped and delivered messages arrive |
| **HubSpot** | Developer account + test portal + app: redirect URL `<site>/api/oauth/hubspot/callback` | `NUXT_HUBSPOT_CLIENT_ID`, `NUXT_HUBSPOT_CLIENT_SECRET` | after connecting, a paid order creates a contact + deal; the deal link opens it |
| **Google** | A Google Cloud OAuth client (**separate** from Sign in with Google): redirect URI `<site>/api/oauth/google/callback`; enable the Gmail + Calendar APIs; add yourself as a test user | `NUXT_GOOGLE_CLIENT_ID`, `NUXT_GOOGLE_CLIENT_SECRET` | a delivered order sends one follow-up email; **Book call** creates an event with a Meet link |
| **Claude** | API key at https://platform.claude.com, with a monthly spend limit | `NUXT_ANTHROPIC_API_KEY`; optional `NUXT_ANTHROPIC_MODEL` (default `claude-opus-5-5`; `claude-haiku-5-5` costs ~40× less), `NUXT_AI_DAILY_TOKEN_CAP` | **Summarize order** and **Draft reply** return text |
| **Discord** | Nothing on the server: an org pastes a channel webhook URL | none | paste a webhook on your own org, then messages arrive |

## 4. Sign in with Google (optional)
Google Cloud → a *second* OAuth client with redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`. Then Supabase → Authentication → Providers → Google, and paste its ID and secret.

## 5. Connect the public demo
The demo org has no owner account (visitors are throwaway accounts, ADR 0007), so its connections are set by you. Use the SQL at the bottom of each script, in the Supabase SQL editor:
- **Slack:** `scripts/connect-demo-slack.sh` (an incoming-webhook URL for a channel you own)
- **Google:** `scripts/connect-demo-google.sh` (a refresh token for your test user)

Stripe, EasyPost and Claude need nothing extra: they're platform integrations and use the env keys above.

## 6. Final checks
- [ ] **Try the demo** in a private window. Simulate an order and watch it move live through the dashboard.
- [ ] The nightly reset ran: next morning the demo is back to its 5-order baseline.
- [ ] `pnpm test:e2e` against the production URL: `BASE_URL=https://… pnpm test:e2e`.
- [ ] Update the README status line and the [build plan](plan/README.md).
