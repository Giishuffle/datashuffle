/**
 * Token Validator — Run this FIRST to check your Meta API connection
 * Usage: node lib/validate-token.js
 */
import 'dotenv/config';
import axios from 'axios';

const TOKEN = process.env.META_ACCESS_TOKEN;
const ACCOUNT = process.env.META_AD_ACCOUNT_ID;
const VERSION = process.env.META_API_VERSION || 'v24.0';
const BASE = `https://graph.facebook.com/${VERSION}`;

async function validate() {
  console.log('\n🔍 Validating Meta API connection...\n');

  // Check env vars exist
  if (!TOKEN || TOKEN === 'paste_your_system_user_token_here') {
    console.error('❌ META_ACCESS_TOKEN is missing. Copy .env.example to .env and paste your token.');
    process.exit(1);
  }
  if (!ACCOUNT || !ACCOUNT.startsWith('act_')) {
    console.error('❌ META_AD_ACCOUNT_ID must start with act_ (e.g., act_1306148567054215)');
    process.exit(1);
  }

  // Test 1: Token validity
  console.log('1️⃣  Checking token...');
  try {
    const me = await axios.get(`${BASE}/me`, { params: { access_token: TOKEN } });
    console.log(`   ✅ Token valid. User: ${me.data.name || me.data.id}`);
  } catch (e) {
    const err = e.response?.data?.error || {};
    console.error(`   ❌ Token invalid: ${err.message || e.message}`);
    if (err.code === 190) console.error('   → Token expired. Generate a new one in Business Settings.');
    process.exit(1);
  }

  // Test 2: Ad account access
  console.log(`2️⃣  Checking ad account ${ACCOUNT}...`);
  try {
    const acct = await axios.get(`${BASE}/${ACCOUNT}`, {
      params: { access_token: TOKEN, fields: 'name,account_status,currency,amount_spent,balance' }
    });
    const status = { 1: 'Active', 2: 'Disabled', 3: 'Unsettled', 7: 'Pending Review' };
    console.log(`   ✅ Account: "${acct.data.name}"`);
    console.log(`   ✅ Status: ${status[acct.data.account_status] || acct.data.account_status}`);
    console.log(`   ✅ Currency: ${acct.data.currency}`);
    console.log(`   ✅ Total spent: ${acct.data.amount_spent} (lifetime, in ${acct.data.currency} cents)`);
  } catch (e) {
    const err = e.response?.data?.error || {};
    console.error(`   ❌ Cannot access account: ${err.message || e.message}`);
    console.error('   → Check that the system user has access to this ad account.');
    process.exit(1);
  }

  // Test 3: Delivery estimate endpoint (the one we need for Script #1)
  console.log('3️⃣  Testing delivery_estimate endpoint...');
  try {
    const targeting = JSON.stringify({
      geo_locations: { countries: ['US'] },
      age_min: 18, age_max: 65
    });
    const est = await axios.get(`${BASE}/${ACCOUNT}/delivery_estimate`, {
      params: { access_token: TOKEN, targeting_spec: targeting, optimization_goal: 'LINK_CLICKS' }
    });
    const data = est.data?.data?.[0];
    if (data) {
      console.log(`   ✅ Delivery estimate works!`);
      console.log(`   ✅ US audience size: ~${(data.estimate_dau || 0).toLocaleString()} DAU`);
      const curve = data.daily_outcomes_curve || [];
      console.log(`   ✅ Curve data points: ${curve.length}`);
      if (curve.length === 0) {
        console.log('   ⚠️  Curve is empty — account may need more spending history.');
        console.log('      The estimate puller will still work but will return NULL metrics.');
      }
    }
  } catch (e) {
    const err = e.response?.data?.error || {};
    console.error(`   ❌ Delivery estimate failed: ${err.message || e.message}`);
    console.error('   → This usually means the ad account needs ads_read permission.');
  }

  // Test 4: Insights endpoint (the one we need for Script #2)
  console.log('4️⃣  Testing insights endpoint...');
  try {
    const ins = await axios.get(`${BASE}/${ACCOUNT}/insights`, {
      params: {
        access_token: TOKEN,
        fields: 'campaign_name,impressions,reach,spend,cpm,cpc,ctr',
        date_preset: 'last_7d',
        level: 'campaign',
        limit: 3
      }
    });
    const rows = ins.data?.data || [];
    if (rows.length > 0) {
      console.log(`   ✅ Insights works! Found ${rows.length} campaigns with data.`);
      console.log(`   ✅ Sample: "${rows[0].campaign_name}" — $${rows[0].spend} spent`);
    } else {
      console.log('   ⚠️  Insights returned 0 rows. No campaigns spent money in the last 7 days.');
      console.log('      Script #2 will work once campaigns have spending data.');
    }
  } catch (e) {
    const err = e.response?.data?.error || {};
    console.error(`   ❌ Insights failed: ${err.message || e.message}`);
    console.error('   → Check read_insights permission on the token.');
  }

  console.log('\n✅ Validation complete!\n');
}

validate().catch(e => console.error('Fatal:', e.message));
