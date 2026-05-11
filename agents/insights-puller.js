/**
 * SCRIPT #2 — Insights Puller
 * 
 * Pulls real campaign performance data from your active ad account.
 * Reads impressions, reach, spend, CPM, CPC, CTR for every campaign.
 * Saves results to Supabase campaign_insights table.
 * 
 * Usage:
 *   node agents/insights-puller.js                   # pull last 7 days
 *   node agents/insights-puller.js --dry-run         # print results, don't save
 *   node agents/insights-puller.js --days 30         # pull last 30 days
 *   node agents/insights-puller.js --campaign-id 123 # single campaign only
 */
import 'dotenv/config';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { timestamp, sleep } from '../lib/constants.js';

// ─── Config ───────────────────────────────────────────────
const TOKEN = process.env.META_ACCESS_TOKEN;
const ACCOUNT = process.env.META_AD_ACCOUNT_ID;
const VERSION = process.env.META_API_VERSION || 'v24.0';
const BASE = `https://graph.facebook.com/${VERSION}`;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ─── Parse CLI args ───────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const DAYS = args.includes('--days') ? parseInt(args[args.indexOf('--days') + 1]) : 7;
const SINGLE_CAMPAIGN = args.includes('--campaign-id') ? args[args.indexOf('--campaign-id') + 1] : null;

// ─── Date helpers ─────────────────────────────────────────
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Fetch campaign list ──────────────────────────────────
async function fetchCampaigns() {
  const campaigns = [];
  let url = `${BASE}/${ACCOUNT}/campaigns`;
  let params = {
    access_token: TOKEN,
    fields: 'id,name,objective,status,created_time',
    limit: 100,
    filtering: JSON.stringify([
      { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED'] }
    ]),
  };

  // Paginate through all campaigns
  while (url) {
    const response = await axios.get(url, { params });
    const data = response.data;
    campaigns.push(...(data.data || []));

    // Next page
    url = data.paging?.next || null;
    params = {}; // next URL includes all params
  }

  return campaigns;
}

// ─── Fetch insights for one campaign ──────────────────────
async function fetchCampaignInsights(campaignId, campaignName, since, until) {
  try {
    const response = await axios.get(`${BASE}/${campaignId}/insights`, {
      params: {
        access_token: TOKEN,
        fields: [
          'campaign_id', 'campaign_name',
          'impressions', 'reach', 'clicks',
          'inline_link_clicks',
          'spend', 'cpm', 'cpc', 'ctr',
          'frequency',
          'date_start', 'date_stop',
          'objective',
        ].join(','),
        time_range: JSON.stringify({ since, until }),
        level: 'campaign',
      },
    });

    // Check rate limit
    const usage = response.headers['x-ad-account-usage'];
    if (usage) {
      try {
        const pct = JSON.parse(usage).acc_id_util_pct || 0;
        if (pct > 75) {
          console.log(`   ⚠️  Account usage ${pct}% — pausing 5 min`);
          await sleep(300_000);
        } else if (pct > 50) {
          await sleep(2000);
        }
      } catch (_) { /* ignore */ }
    }

    const rows = response.data?.data || [];
    if (rows.length === 0) return null;

    const row = rows[0]; // campaign-level = 1 row per time range
    return {
      campaign_id: row.campaign_id || campaignId,
      campaign_name: row.campaign_name || campaignName,
      date_start: row.date_start,
      date_stop: row.date_stop,
      impressions: parseInt(row.impressions || 0),
      reach: parseInt(row.reach || 0),
      clicks: parseInt(row.clicks || 0),
      link_clicks: parseInt(row.inline_link_clicks || 0),
      spend_usd: parseFloat(row.spend || 0),
      cpm: row.cpm ? parseFloat(row.cpm) : null,
      cpc: row.cpc ? parseFloat(row.cpc) : null,
      ctr: row.ctr ? parseFloat(row.ctr) : null,
      frequency: row.frequency ? parseFloat(row.frequency) : null,
      objective: row.objective || null,
    };
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message;
    console.log(`   ⚠️  ${campaignName}: ${msg}`);
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────
async function main() {
  console.log(`\n📈 Wershuffle Insights Puller — ${timestamp()}`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no saves)' : 'LIVE (saving to Supabase)'}`);
  console.log(`   Date range: ${daysAgo(DAYS)} to ${today()} (${DAYS} days)\n`);

  // Step 1: Get campaign list
  let campaigns;
  if (SINGLE_CAMPAIGN) {
    campaigns = [{ id: SINGLE_CAMPAIGN, name: `Campaign ${SINGLE_CAMPAIGN}`, status: 'ACTIVE' }];
  } else {
    console.log('   Fetching campaign list...');
    campaigns = await fetchCampaigns();
    console.log(`   Found ${campaigns.length} campaigns\n`);
  }

  if (campaigns.length === 0) {
    console.log('   No campaigns found. Check your ad account has active or recently paused campaigns.');
    return;
  }

  // Step 2: Pull insights for each campaign
  const results = [];
  const since = daysAgo(DAYS);
  const until = today();

  for (let i = 0; i < campaigns.length; i++) {
    const campaign = campaigns[i];
    const label = `[${i + 1}/${campaigns.length}] ${campaign.name}`;

    const insight = await fetchCampaignInsights(campaign.id, campaign.name, since, until);

    if (!insight) {
      console.log(`   ⏭️  ${label}: no data in range`);
      continue;
    }

    // Add campaign status
    insight.status = campaign.status;

    const spendStr = `$${insight.spend_usd.toFixed(2)}`;
    const impsStr = insight.impressions.toLocaleString();
    const cpmStr = insight.cpm ? `$${insight.cpm.toFixed(2)}` : 'N/A';
    const cpcStr = insight.cpc ? `$${insight.cpc.toFixed(2)}` : 'N/A';
    const ctrStr = insight.ctr ? `${insight.ctr}%` : 'N/A';

    console.log(`   ✅ ${label}: Spend=${spendStr} Imps=${impsStr} CPM=${cpmStr} CPC=${cpcStr} CTR=${ctrStr}`);
    results.push(insight);

    // Small delay between calls to be polite
    await sleep(300);
  }

  // Step 3: Save to Supabase
  if (!DRY_RUN && results.length > 0) {
    console.log(`\n💾 Saving ${results.length} campaign rows to Supabase...`);

    for (let i = 0; i < results.length; i += 50) {
      const batch = results.slice(i, i + 50);
      const { error } = await supabase.from('campaign_insights').insert(batch);
      if (error) {
        console.error(`   ❌ Insert error: ${error.message}`);
      } else {
        console.log(`   ✅ Saved batch ${Math.floor(i / 50) + 1} (${batch.length} rows)`);
      }
    }
  }

  // Step 4: Summary
  console.log(`\n─── Summary ───`);
  console.log(`   📋 Campaigns checked: ${campaigns.length}`);
  console.log(`   📊 With data: ${results.length}`);
  if (results.length > 0) {
    const totalSpend = results.reduce((s, r) => s + r.spend_usd, 0);
    const totalImps = results.reduce((s, r) => s + r.impressions, 0);
    const totalClicks = results.reduce((s, r) => s + r.link_clicks, 0);
    const avgCpm = totalImps > 0 ? (totalSpend / totalImps) * 1000 : 0;
    const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

    console.log(`   💰 Total spend: $${totalSpend.toFixed(2)}`);
    console.log(`   👁️  Total impressions: ${totalImps.toLocaleString()}`);
    console.log(`   🖱️  Total link clicks: ${totalClicks.toLocaleString()}`);
    console.log(`   📊 Blended CPM: $${avgCpm.toFixed(2)}`);
    console.log(`   📊 Blended CPC: $${avgCpc.toFixed(2)}`);
  }
  console.log(`   🕐 Completed at ${timestamp()}\n`);
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
