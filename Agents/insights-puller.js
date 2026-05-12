/**
 * SCRIPT #2 — Campaign Insights Puller
 * 
 * Pulls real campaign performance data from your ad account.
 * Gets ALL campaigns with spend (active, paused, completed, archived).
 * Saves to Supabase campaign_insights table.
 * 
 * Usage:
 *   node agents/insights-puller.js                   # last 7 days, all campaigns
 *   node agents/insights-puller.js --dry-run         # preview, don't save
 *   node agents/insights-puller.js --days 30         # last 30 days
 *   node agents/insights-puller.js --days 1          # today only
 */
import 'dotenv/config';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { timestamp, sleep } from '../lib/constants.js';

const TOKEN = process.env.META_ACCESS_TOKEN;
const ACCOUNT = process.env.META_AD_ACCOUNT_ID;
const VERSION = process.env.META_API_VERSION || 'v24.0';
const BASE = `https://graph.facebook.com/${VERSION}`;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const DAYS = args.includes('--days') ? parseInt(args[args.indexOf('--days') + 1]) : 7;

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  console.log(`\n📈 Campaign Insights Puller — ${timestamp()}`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`   Date range: ${daysAgo(DAYS)} to ${today()} (${DAYS} days)\n`);

  // Pull insights at the ACCOUNT level with campaign breakdown
  // This gets ALL campaigns that had any delivery, regardless of status
  console.log('   Fetching account-level insights with campaign breakdown...');

  const results = [];
  let url = `${BASE}/${ACCOUNT}/insights`;
  let params = {
    access_token: TOKEN,
    fields: [
      'campaign_id', 'campaign_name',
      'adset_id', 'adset_name',
      'impressions', 'reach', 'clicks',
      'inline_link_clicks',
      'spend', 'cpm', 'cpc', 'ctr',
      'frequency',
      'date_start', 'date_stop',
      'objective',
    ].join(','),
    time_range: JSON.stringify({ since: daysAgo(DAYS), until: today() }),
    level: 'campaign',
    limit: 500,
  };

  try {
    // Paginate through all results
    while (url) {
      const response = await axios.get(url, { params });
      const data = response.data;
      const rows = data.data || [];

      for (const row of rows) {
        const insight = {
          campaign_id: row.campaign_id || null,
          campaign_name: row.campaign_name || null,
          adset_id: null, // campaign level doesn't return this
          adset_name: null,
          date_start: row.date_start || null,
          date_stop: row.date_stop || null,
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
          status: null, // not available at insights level
        };

        const spendStr = `$${insight.spend_usd.toFixed(2)}`;
        const impsStr = insight.impressions.toLocaleString();
        const cpmStr = insight.cpm ? `$${insight.cpm.toFixed(2)}` : 'N/A';
        const cpcStr = insight.cpc ? `$${insight.cpc.toFixed(2)}` : 'N/A';

        console.log(`   ✅ ${insight.campaign_name}: Spend=${spendStr} Imps=${impsStr} CPM=${cpmStr} CPC=${cpcStr}`);
        results.push(insight);
      }

      // Check for next page
      if (data.paging?.next) {
        url = data.paging.next;
        params = {}; // next URL has all params built in
        await sleep(500);
      } else {
        url = null;
      }
    }
  } catch (e) {
    const errData = e.response?.data?.error || {};
    const msg = errData.message || e.message;
    console.error(`   ❌ API error: ${msg}`);

    if (e.response?.status === 401 || errData.code === 190) {
      console.error('   🔴 Token expired. Generate a new one.');
      process.exit(1);
    }
  }

  if (results.length === 0) {
    console.log(`   ℹ️  No campaigns with spend found in the last ${DAYS} days.`);
    console.log(`   This is normal if your ad account had no active campaigns recently.`);
  }

  // Save to Supabase
  if (!DRY_RUN && results.length > 0) {
    console.log(`\n💾 Saving ${results.length} campaign rows to Supabase...`);
    for (let i = 0; i < results.length; i += 50) {
      const batch = results.slice(i, i + 50);
      const { error } = await supabase.from('campaign_insights').insert(batch);
      if (error) {
        console.error(`   ❌ Insert error: ${error.message}`);
      } else {
        console.log(`   ✅ Batch ${Math.floor(i/50)+1} saved (${batch.length} rows)`);
      }
    }
  }

  // Summary
  console.log(`\n─── Summary ───`);
  console.log(`   📋 Campaigns found: ${results.length}`);
  if (results.length > 0) {
    const totalSpend = results.reduce((s, r) => s + r.spend_usd, 0);
    const totalImps = results.reduce((s, r) => s + r.impressions, 0);
    const totalClicks = results.reduce((s, r) => s + r.link_clicks, 0);
    console.log(`   💰 Total spend: $${totalSpend.toFixed(2)}`);
    console.log(`   👁️  Total impressions: ${totalImps.toLocaleString()}`);
    console.log(`   🖱️  Total link clicks: ${totalClicks.toLocaleString()}`);
    if (totalImps > 0) {
      console.log(`   📊 Blended CPM: $${((totalSpend / totalImps) * 1000).toFixed(2)}`);
    }
  }
  console.log(`   🕐 Done at ${timestamp()}\n`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
