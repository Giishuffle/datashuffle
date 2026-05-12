/**
 * SCRIPT #1 — Reservation Estimate Puller
 * 
 * Pulls Meta Reach & Frequency reservation predictions
 * for 50 countries × 5 industries.
 * No money spent — these are prediction requests only.
 * 
 * API: /act_{id}/reachfrequencypredictions
 * 
 * Usage:
 *   node agents/estimate-puller.js                  # full run
 *   node agents/estimate-puller.js --dry-run        # preview only
 *   node agents/estimate-puller.js --country US     # single country
 *   node agents/estimate-puller.js --industry RTL   # single industry
 *   node agents/estimate-puller.js --tier 1         # Tier 1 only
 */
import 'dotenv/config';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { COUNTRIES, INDUSTRIES, getAllCountryCodes, sleep, timestamp } from '../lib/constants.js';

const TOKEN = process.env.META_ACCESS_TOKEN;
const ACCOUNT = process.env.META_AD_ACCOUNT_ID;
const VERSION = process.env.META_API_VERSION || 'v24.0';
const BASE = `https://graph.facebook.com/${VERSION}`;
const PREDICTION_BUDGET = 50000; // $500 in cents
const PREDICTION_DAYS = 7;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SINGLE_COUNTRY = args.includes('--country') ? args[args.indexOf('--country') + 1] : null;
const SINGLE_INDUSTRY = args.includes('--industry') ? args[args.indexOf('--industry') + 1] : null;
const TIER_FILTER = args.includes('--tier') ? parseInt(args[args.indexOf('--tier') + 1]) : null;

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

async function fetchReservation(countryIso2, industryCode) {
  const country = COUNTRIES[countryIso2];
  const industry = INDUSTRIES[industryCode];
  const targeting = buildTargetingSpec(countryIso2, industry.interests);

  const startTime = new Date();
  startTime.setDate(startTime.getDate() + 1);
  startTime.setHours(0, 0, 0, 0);
  const startUnix = Math.floor(startTime.getTime() / 1000);
  const endUnix = startUnix + (PREDICTION_DAYS * 24 * 60 * 60);

  try {
    const response = await axios.post(`${BASE}/${ACCOUNT}/reachfrequencypredictions`, null, {
      params: {
        access_token: TOKEN,
        target_spec: JSON.stringify(targeting),
        budget: PREDICTION_BUDGET,
        start_time: startUnix,
        end_time: endUnix,
        frequency_cap: 2,
        interval_frequency_cap_reset_period: 7,
        prediction_mode: 0,
        objective: 'REACH',
      }
    });

    // Rate limit check
    const usage = response.headers['x-ad-account-usage'];
    if (usage) {
      try {
        const pct = JSON.parse(usage).acc_id_util_pct || 0;
        if (pct > 75) {
          console.log(`   ⚠️  Usage ${pct}% — pausing 5 min`);
          await sleep(300_000);
        } else if (pct > 50) {
          await sleep(3000);
        }
      } catch (_) {}
    }

    const data = response.data;
    const reach = data.reach || data.estimate_reach || null;
    const impressions = data.impressions || data.estimate_impressions || null;

    let estCpm = null;
    if (impressions && impressions > 0) {
      estCpm = (PREDICTION_BUDGET / 100) / impressions * 1000;
    }
    if (!estCpm && data.cpm) {
      estCpm = typeof data.cpm === 'number' ? data.cpm / 100 : null;
    }

    return {
      country_iso2: countryIso2,
      country_name: country.name,
      industry_code: industryCode,
      industry_name: industry.name,
      optimization_goal: 'RESERVATION_REACH',
      est_cpm: estCpm ? Math.round(estCpm * 100) / 100 : null,
      est_cpc: null,
      est_ctr: null,
      audience_dau: data.estimate_dau || data.target_audience_size || null,
      audience_mau: data.estimate_mau || null,
      curve_data_points: reach ? 1 : 0,
      confidence: estCpm ? 'high' : reach ? 'medium' : 'none',
      error_message: null,
      raw_curve: data,
    };

  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message;

    // Auth errors — stop everything
    if (e.response?.status === 401 || e.response?.data?.error?.code === 190) {
      console.error(`\n🔴 Token expired or invalid. Stopping.`);
      process.exit(1);
    }

    return {
      country_iso2: countryIso2,
      country_name: country.name,
      industry_code: industryCode,
      industry_name: industry.name,
      optimization_goal: 'RESERVATION_REACH',
      est_cpm: null, est_cpc: null, est_ctr: null,
      audience_dau: null, audience_mau: null,
      curve_data_points: 0,
      confidence: 'none',
      error_message: msg.substring(0, 500),
      raw_curve: null,
    };
  }
}

async function main() {
  console.log(`\n📊 Reservation Estimate Puller — ${timestamp()}`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`   Budget: $${(PREDICTION_BUDGET / 100)} over ${PREDICTION_DAYS} days\n`);

  let countries = getAllCountryCodes();
  if (SINGLE_COUNTRY) countries = [SINGLE_COUNTRY.toUpperCase()];
  if (TIER_FILTER) countries = countries.filter(c => COUNTRIES[c].tier === TIER_FILTER);

  let industries = Object.keys(INDUSTRIES);
  if (SINGLE_INDUSTRY) industries = [SINGLE_INDUSTRY.toUpperCase()];

  const total = countries.length * industries.length;
  console.log(`   Combos: ${countries.length} countries × ${industries.length} industries = ${total}\n`);

  const results = [];
  let count = 0;

  for (const cc of countries) {
    for (const ic of industries) {
      count++;
      const label = `[${count}/${total}] ${COUNTRIES[cc].name} × ${INDUSTRIES[ic].name}`;
      const result = await fetchReservation(cc, ic);

      if (result.error_message) {
        console.log(`   ⚠️  ${label}: ${result.error_message.substring(0, 80)}`);
      } else {
        const cpm = result.est_cpm !== null ? `$${result.est_cpm}` : 'N/A';
        const dau = result.audience_dau ? result.audience_dau.toLocaleString() : 'N/A';
        console.log(`   ✅ ${label}: CPM=${cpm} DAU=${dau}`);
      }
      results.push(result);
      await sleep(2000); // 2s between calls
    }
  }

  if (!DRY_RUN && results.length > 0) {
    console.log(`\n💾 Saving ${results.length} rows to Supabase...`);
    for (let i = 0; i < results.length; i += 50) {
      const batch = results.slice(i, i + 50);
      const { error } = await supabase.from('probe_estimates').insert(batch);
      if (error) {
        console.error(`   ❌ Insert error: ${error.message}`);
      } else {
        console.log(`   ✅ Batch ${Math.floor(i/50)+1} saved (${batch.length} rows)`);
      }
    }
  }

  const ok = results.filter(r => !r.error_message);
  const errs = results.filter(r => r.error_message);
  console.log(`\n─── Summary ───`);
  console.log(`   ✅ ${ok.length} successful | ⚠️  ${errs.length} errors`);
  if (ok.filter(r => r.est_cpm).length > 0) {
    const avg = ok.filter(r => r.est_cpm).reduce((s,r) => s + r.est_cpm, 0) / ok.filter(r => r.est_cpm).length;
    console.log(`   📊 Avg reservation CPM: $${avg.toFixed(2)}`);
  }
  console.log(`   🕐 Done at ${timestamp()}\n`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
