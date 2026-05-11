# Wershuffle Probes

Two scripts that pull Meta advertising data **automatically twice a day**:

1. **Estimate Puller** — delivery predictions for 50 countries × 5 industries (free, no ad spend)
2. **Insights Puller** — real campaign performance data from your active ad account

All data saves to your Supabase database. Runs on GitHub Actions — no terminal needed.

---

## Setup guide (all done in your browser, ~30 minutes)

### STEP 1: Create your Supabase database

1. Go to **https://supabase.com** → sign up (free)
2. Click **"New Project"** → name it `wershuffle-probes`, pick a region, set a password
3. Wait ~2 minutes for setup
4. Go to **Settings → API** (left sidebar)
5. **Write down** (or keep this tab open):
   - The **Project URL** (looks like `https://abc123.supabase.co`)
   - The **anon public** key (long string starting with `eyJ...`)

### STEP 2: Create the database tables

1. In your Supabase dashboard, click **SQL Editor** (left sidebar)
2. Click **"New Query"**
3. Paste this entire block and click **Run**:

```sql
CREATE TABLE IF NOT EXISTS probe_estimates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  estimated_at TIMESTAMPTZ DEFAULT now(),
  country_iso2 CHAR(2) NOT NULL,
  country_name VARCHAR(100),
  industry_code CHAR(3) NOT NULL,
  industry_name VARCHAR(100),
  optimization_goal VARCHAR(50) DEFAULT 'LINK_CLICKS',
  est_cpm NUMERIC(10,4),
  est_cpc NUMERIC(10,4),
  est_ctr NUMERIC(8,4),
  audience_dau BIGINT,
  audience_mau BIGINT,
  curve_data_points INT DEFAULT 0,
  confidence VARCHAR(20),
  error_message TEXT,
  raw_curve JSONB
);

CREATE TABLE IF NOT EXISTS campaign_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pulled_at TIMESTAMPTZ DEFAULT now(),
  campaign_id VARCHAR(50),
  campaign_name VARCHAR(255),
  adset_id VARCHAR(50),
  adset_name VARCHAR(255),
  date_start DATE,
  date_stop DATE,
  impressions BIGINT DEFAULT 0,
  reach BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  link_clicks BIGINT DEFAULT 0,
  spend_usd NUMERIC(10,2) DEFAULT 0,
  cpm NUMERIC(10,4),
  cpc NUMERIC(10,4),
  ctr NUMERIC(8,4),
  frequency NUMERIC(8,4),
  objective VARCHAR(100),
  status VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_estimates_country ON probe_estimates(country_iso2, industry_code);
CREATE INDEX IF NOT EXISTS idx_estimates_date ON probe_estimates(estimated_at);
CREATE INDEX IF NOT EXISTS idx_insights_campaign ON campaign_insights(campaign_id);
CREATE INDEX IF NOT EXISTS idx_insights_date ON campaign_insights(pulled_at);
```

4. You should see **"Success"**. Click **Table Editor** to verify both tables exist.

### STEP 3: Generate your Meta token

1. Go to **business.facebook.com** → **Business Settings**
2. In the left sidebar: **Users → System Users**
3. If you don't have one yet:
   - Click **Add** → name it `ProbeBot` → role: **Admin** → Create
   - Click on `ProbeBot` → **Add Assets** → select all your ad accounts → Save
4. Click on your system user → **Generate New Token**
5. Select your Meta App from the dropdown
6. **Check these 4 permissions:**
   - ☑ `ads_management`
   - ☑ `ads_read`
   - ☑ `read_insights`
   - ☑ `business_management`
7. Click **Generate Token**
8. **Copy the token** (you'll need it in Step 5)

### STEP 4: Upload this project to GitHub

1. Go to **https://github.com** → sign in (or create a free account)
2. Click the **"+"** button (top right) → **"New repository"**
3. Name: `wershuffle-probes`, set to **Private**, click **Create repository**
4. On the next page, click **"uploading an existing file"**
5. **Drag and drop ALL the files from this zip** into the upload area
   - Make sure you include the `.github` folder (it contains the automation)
6. Click **"Commit changes"**

### STEP 5: Add your secrets to GitHub

This is how GitHub securely stores your credentials. The scripts read from these.

1. In your GitHub repo, go to **Settings** (tab at the top)
2. Left sidebar: **Secrets and variables → Actions**
3. Click **"New repository secret"** and add these one at a time:

| Secret name | What to paste |
|-------------|---------------|
| `META_ACCESS_TOKEN` | The token you generated in Step 3 |
| `META_AD_ACCOUNT_ID` | Your ad account ID (e.g., `act_1306148567054215`) |
| `SUPABASE_URL` | Your Supabase Project URL from Step 1 |
| `SUPABASE_KEY` | Your Supabase anon public key from Step 1 |

You should have **4 secrets** when done.

### STEP 6: Test it!

1. In your GitHub repo, click the **Actions** tab
2. On the left, click **"Pull Meta Data"**
3. Click **"Run workflow"** (blue button on the right)
4. Set:
   - Script: **`validate-only`**
   - Dry run: **checked**
5. Click the green **"Run workflow"** button
6. Click on the running job to see the logs
7. You should see ✅ for token, ad account, delivery estimate, and insights

**If all 4 pass:** Run it again with script = `both` and dry run = `checked` to preview the full data pull without saving.

**If it passes dry run:** Run one more time with script = `both` and dry run = **unchecked** to save real data to Supabase.

---

## How it works after setup

Once Step 6 succeeds, **you're done**. The scripts run automatically:

- **Every day at 06:00 UTC** — both scripts pull fresh data
- **Every day at 18:00 UTC** — both scripts pull again

You can also trigger a run manually anytime from the **Actions** tab.

### Viewing your data

Go to your **Supabase dashboard → Table Editor**:

- **`probe_estimates`** — Meta's predicted CPM/CPC/CTR for 250 country×industry combos
- **`campaign_insights`** — Real spend, impressions, reach, CPM, CPC from your campaigns

You can filter, sort, and **export to CSV** from there.

### Running options (manual trigger)

From the Actions tab, click "Run workflow" with these options:

| Option | What it does |
|--------|-------------|
| `both` | Runs both scripts (default for scheduled runs) |
| `estimates-only` | Only the 50-country prediction pull |
| `insights-only` | Only the real campaign data pull |
| `estimates-tier1-only` | Predictions for 10 Tier-1 countries only (faster) |
| `validate-only` | Tests your token and connections |

---

## Troubleshooting

**"Token expired" error in Actions log:**
Your Meta token expired. Generate a new one (Step 3) and update the `META_ACCESS_TOKEN` secret in GitHub (Step 5).

**"Empty response" for some countries:**
Normal. Meta can't predict costs for very small audiences. The script saves NULL for those — they won't break anything.

**"0 campaigns found" in insights puller:**
Your ad account has no active or recently paused campaigns. Script #2 needs at least one campaign with spend data.

**Supabase shows no data after a run:**
Check the Actions log for errors. Most likely: a secret was pasted with extra spaces, or the Supabase tables weren't created yet.
