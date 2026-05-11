/**
 * SCRIPT #1 — Estimate Puller
 * 
 * Pulls Meta delivery_estimate predictions for 50 countries × 5 industries.
 * No money spent. Uses the same API your nextrack25 code used.
 * Saves results to Supabase probe_estimates table.
 * 
 * Usage:
 *   node agents/estimate-puller.js                  # full run, all 250 combos
 *   node agents/estimate-puller.js --dry-run        # print results, don't save
 *   node agents/estimate-puller.js --country US     # single country only
 *   node agents/estimate-puller.js --industry RTL   # single industry only
 *   node agents/estimate-puller.js --tier 1         # only Tier 1 countries
 */
import 'dotenv/config';
import axios from 'axios';
import Bottleneck from 'bottleneck';
import { createClient } from '@supabase/supabase-js';
import { COUNTRIES, INDUSTRIES, getAllCountryCodes, sleep, timestamp } from '../lib/constants.js';

// ─── Config ───────────────────────────────────────────────
const TOKEN = process.env.META_ACCESS_TOKEN;
const ACCOUNT = process.env.META_AD_ACCOUNT_ID;
const VERSION = process.env.META_API_VERSION || 'v24.0';
const BASE = `https://graph.facebook.com/${VERSION}`;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Rate limiter: max 200/hour, 1 request per 500ms
const limiter = new Bottleneck({
  reservoir: 200,
  reservoirRefreshAmount: 200,
  reservoirRefreshInterval: 60 * 60 * 1000,
  maxConcurrent: 1,
  minTime: 500,
});

// ─── Parse CLI args ───────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SINGLE_COUNTRY = args.includes('--country') ? args[args.indexOf('--country') + 1] : null;
const SINGLE_INDUSTRY = args.includes('--industry') ? args[args.indexOf('--industry') + 1] : null;
const TIER_FILTER = args.includes('--tier') ? parseInt(args[args.indexOf('--tier') + 1]) : null;

// ─── Build targeting spec ─────────────────────────────────
function buildTargetingSpec(countryIso2, interests) {
  const spec = {
    geo_locations: { countries: [countryIso2] },
    age_min: 18,
    age_max: 65,
  };
  if (interests && interests.length > 0) {
    spec.flexible_spec = [{
      interests: interests.map(i => ({ id: String(i.id), name: i.name })),
    }];
  }
  return spec;
}

// ─── Fetch one delivery estimate ──────────────────────────
async function fetchEstimate(countryIso2, industryCode) {
  const country = COUNTRIES[countryIso2];
  const industry = INDUSTRIES[industryCode];

  const targeting = buildTargetingSpec(countryIso2, industry.interests);

  const response = await limiter.schedule(() =>
    axios.get(`${BASE}/${ACCOUNT}/delivery_estimate`, {
      params: {
        access_token: TOKEN,
        targeting_spec: JSON.stringify(targeting),
        optimization_goal: 'LINK_CLICKS',
      },
    })
  );

  // Check rate limit header
  const usage = response.headers['x-ad-account-usage'];
  if (usage) {
    try {
      const pct = JSON.parse(usage).acc_id_util_pct || 0;
      if (pct > 75) {
        console.log(`   ⚠️  Account usage at ${pct}% — pausing 5 minutes...`);
        await sleep(300_000);
      } else if (pct > 50) {
        console.log(`   ℹ️  Account usage at ${pct}% — adding 3s delay`);
        await sleep(3000);
      }
    } catch (_) { /* ignore parse errors */ }
  }

  const data = response.data?.data?.[0];
  if (!data) {
    return { country: countryIso2, industry: industryCode, error: 'Empty response' };
  }

  // Parse the curve
  const curve = data.daily_outcomes_curve || [];
  let estCpm = null, estCpc = null, estCtr = null;

  if (curve.length >= 2) {
    // Use mid-range points for more stable estimates
    const midPoints = curve.filter(p => {
      const spend = (p.spend || 0) / 100; // cents to dollars
      return spend >= 5 && spend <= 100 && (p.impressions || 0) > 0;
    });

    const points = midPoints.length >= 2 ? midPoints : curve.filter(p => (p.impressions || 0) > 0);

    if (points.length >= 2) {
      const first = points[0];
      const last = points[points.length - 1];
      const dSpend = (last.spend - first.spend) / 100; // cents to dollars
      const dImps = last.impressions - first.impressions;
      const dActions = (last.actions || 0) - (first.actions || 0);

      if (dImps > 0) {
        estCpm = (dSpend / dImps) * 1000;
        estCtr = dActions > 0 ? (dActions / dImps) * 100 : null;
      }
      if (dActions > 0) {
        estCpc = dSpend / dActions;
      }
    }
  }

  // Determine confidence
  let confidence = 'none';
  if (estCpm !== null && estCpc !== null && estCtr !== null) confidence = 'high';
  else if (estCpm !== null) confidence = 'medium';
  else if (curve.length > 0) confidence = 'low';

  return {
    country_iso2: countryIso2,
    country_name: country.name,
    industry_code: industryCode,
    industry_name: industry.name,
    optimization_goal: 'LINK_CLICKS',
    est_cpm: estCpm ? Math.round(estCpm * 100) / 100 : null,
    est_cpc: estCpc ? Math.round(estCpc * 100) / 100 : null,
    est_ctr: estCtr ? Math.round(estCtr * 1000) / 1000 : null,
    audience_dau: data.estimate_dau || null,
    audience_mau: data.estimate_mau || null,
    curve_data_points: curve.length,
    confidence,
    error_message: null,
    raw_curve: curve.length > 0 ? curve : null,
  };
}

// ─── Main ─────────────────────────────────────────────────
async function main() {
  console.log(`\n📊 Wershuffle Estimate Puller — ${timestamp()}`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no saves)' : 'LIVE (saving to Supabase)'}`);

  // Determine which countries + industries to run
  let countries = getAllCountryCodes();
  if (SINGLE_COUNTRY) countries = [SINGLE_COUNTRY.toUpperCase()];
  if (TIER_FILTER) countries = countries.filter(c => COUNTRIES[c].tier === TIER_FILTER);

  let industries = Object.keys(INDUSTRIES);
  if (SINGLE_INDUSTRY) industries = [SINGLE_INDUSTRY.toUpperCase()];

  const totalCombos = countries.length * industries.length;
  console.log(`   Countries: ${countries.length} | Industries: ${industries.length} | Total: ${totalCombos}\n`);

  const results = [];
  const errors = [];
  let count = 0;

  for (const countryCode of countries) {
    for (const industryCode of industries) {
      count++;
      const label = `[${count}/${totalCombos}] ${COUNTRIES[countryCode].name} × ${INDUSTRIES[industryCode].name}`;

      try {
        const result = await fetchEstimate(countryCode, industryCode);

        if (result.error) {
          console.log(`   ⚠️  ${label}: ${result.error}`);
          errors.push({ country: countryCode, industry: industryCode, error: result.error });
          continue;
        }

        const cpmStr = result.est_cpm !== null ? `$${result.est_cpm}` : 'N/A';
        const cpcStr = result.est_cpc !== null ? `$${result.est_cpc}` : 'N/A';
        const ctrStr = result.est_ctr !== null ? `${result.est_ctr}%` : 'N/A';
        const dauStr = result.audience_dau ? result.audience_dau.toLocaleString() : 'N/A';

        console.log(`   ✅ ${label}: CPM=${cpmStr} CPC=${cpcStr} CTR=${ctrStr} DAU=${dauStr} [${result.confidence}]`);
        results.push(result);

      } catch (e) {
        const msg = e.response?.data?.error?.message || e.message;
        console.log(`   ❌ ${label}: ${msg}`);
        errors.push({ country: countryCode, industry: industryCode, error: msg });

        // If auth error, stop everything
        if (e.response?.status === 401 || e.response?.data?.error?.code === 190) {
          console.error('\n🔴 Token expired or invalid. Stopping.');
          process.exit(1);
        }

        // If rate limited, wait and retry
        if (e.response?.status === 429 || e.response?.data?.error?.code === 17) {
          console.log('   ⏳ Rate limited — waiting 10 minutes...');
          await sleep(600_000);
        }
      }
    }
  }

  // Save to Supabase
  if (!DRY_RUN && results.length > 0) {
    console.log(`\n💾 Saving ${results.length} estimates to Supabase...`);

    // Insert in batches of 50
    for (let i = 0; i < results.length; i += 50) {
      const batch = results.slice(i, i + 50);
      const { error } = await supabase.from('probe_estimates').insert(batch);
      if (error) {
        console.error(`   ❌ Batch insert error: ${error.message}`);
      } else {
        console.log(`   ✅ Saved batch ${Math.floor(i / 50) + 1} (${batch.length} rows)`);
      }
    }
  }

  // Summary
  console.log(`\n─── Summary ───`);
  console.log(`   ✅ Successful: ${results.length}`);
  console.log(`   ❌ Errors: ${errors.length}`);
  if (results.length > 0) {
    const withCpm = results.filter(r => r.est_cpm !== null);
    if (withCpm.length > 0) {
      const avgCpm = withCpm.reduce((sum, r) => sum + r.est_cpm, 0) / withCpm.length;
      console.log(`   📊 Average CPM: $${avgCpm.toFixed(2)} (across ${withCpm.length} estimates with data)`);
    }
  }
  console.log(`   🕐 Completed at ${timestamp()}\n`);
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
