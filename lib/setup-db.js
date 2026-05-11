/**
 * Database Setup — Creates all tables in Supabase
 * Usage: node lib/setup-db.js
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const TABLES_SQL = `
-- Delivery estimate predictions (Script #1 output)
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

-- Live campaign insights (Script #2 output)
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

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_estimates_country ON probe_estimates(country_iso2, industry_code);
CREATE INDEX IF NOT EXISTS idx_estimates_date ON probe_estimates(estimated_at);
CREATE INDEX IF NOT EXISTS idx_insights_campaign ON campaign_insights(campaign_id);
CREATE INDEX IF NOT EXISTS idx_insights_date ON campaign_insights(pulled_at);
`;

async function setup() {
  console.log('🗄️  Setting up Supabase tables...\n');

  if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('your-project')) {
    console.error('❌ SUPABASE_URL not configured. Update your .env file.');
    console.error('   Get it from: supabase.com → your project → Settings → API');
    process.exit(1);
  }

  // Supabase JS client can't run raw DDL directly.
  // User needs to paste the SQL in Supabase dashboard.
  console.log('Supabase requires you to run the table creation SQL in the dashboard.');
  console.log('Here\'s what to do:\n');
  console.log('1. Go to your Supabase project dashboard');
  console.log('2. Click "SQL Editor" in the left sidebar');
  console.log('3. Click "New Query"');
  console.log('4. Paste the following SQL and click "Run":\n');
  console.log('─'.repeat(60));
  console.log(TABLES_SQL);
  console.log('─'.repeat(60));

  // Test the connection at least
  console.log('\n🔌 Testing Supabase connection...');
  try {
    const { data, error } = await supabase.from('probe_estimates').select('id').limit(1);
    if (error && error.code === '42P01') {
      console.log('⚠️  Tables don\'t exist yet. Paste the SQL above into the dashboard.');
    } else if (error) {
      console.error(`❌ Supabase error: ${error.message}`);
    } else {
      console.log('✅ Connection works and probe_estimates table exists!');
    }
  } catch (e) {
    console.error(`❌ Connection failed: ${e.message}`);
  }
}

setup();
