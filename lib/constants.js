/**
 * Shared constants and country/industry definitions
 */

// 50 countries organized by tier
export const COUNTRIES = {
  US: { name: 'United States', iso3: 'USA', tier: 1 },
  GB: { name: 'United Kingdom', iso3: 'GBR', tier: 1 },
  DE: { name: 'Germany', iso3: 'DEU', tier: 1 },
  FR: { name: 'France', iso3: 'FRA', tier: 1 },
  JP: { name: 'Japan', iso3: 'JPN', tier: 1 },
  CA: { name: 'Canada', iso3: 'CAN', tier: 1 },
  AU: { name: 'Australia', iso3: 'AUS', tier: 1 },
  IT: { name: 'Italy', iso3: 'ITA', tier: 1 },
  ES: { name: 'Spain', iso3: 'ESP', tier: 1 },
  BR: { name: 'Brazil', iso3: 'BRA', tier: 1 },
  NL: { name: 'Netherlands', iso3: 'NLD', tier: 2 },
  SE: { name: 'Sweden', iso3: 'SWE', tier: 2 },
  CH: { name: 'Switzerland', iso3: 'CHE', tier: 2 },
  BE: { name: 'Belgium', iso3: 'BEL', tier: 2 },
  AT: { name: 'Austria', iso3: 'AUT', tier: 2 },
  PL: { name: 'Poland', iso3: 'POL', tier: 2 },
  MX: { name: 'Mexico', iso3: 'MEX', tier: 2 },
  KR: { name: 'South Korea', iso3: 'KOR', tier: 2 },
  IN: { name: 'India', iso3: 'IND', tier: 2 },
  SG: { name: 'Singapore', iso3: 'SGP', tier: 2 },
  AE: { name: 'UAE', iso3: 'ARE', tier: 2 },
  SA: { name: 'Saudi Arabia', iso3: 'SAU', tier: 2 },
  IL: { name: 'Israel', iso3: 'ISR', tier: 2 },
  NO: { name: 'Norway', iso3: 'NOR', tier: 2 },
  DK: { name: 'Denmark', iso3: 'DNK', tier: 2 },
  FI: { name: 'Finland', iso3: 'FIN', tier: 2 },
  IE: { name: 'Ireland', iso3: 'IRL', tier: 2 },
  NZ: { name: 'New Zealand', iso3: 'NZL', tier: 2 },
  PT: { name: 'Portugal', iso3: 'PRT', tier: 2 },
  ID: { name: 'Indonesia', iso3: 'IDN', tier: 2 },
  AR: { name: 'Argentina', iso3: 'ARG', tier: 3 },
  CL: { name: 'Chile', iso3: 'CHL', tier: 3 },
  CO: { name: 'Colombia', iso3: 'COL', tier: 3 },
  PE: { name: 'Peru', iso3: 'PER', tier: 3 },
  ZA: { name: 'South Africa', iso3: 'ZAF', tier: 3 },
  EG: { name: 'Egypt', iso3: 'EGY', tier: 3 },
  PH: { name: 'Philippines', iso3: 'PHL', tier: 3 },
  MY: { name: 'Malaysia', iso3: 'MYS', tier: 3 },
  TH: { name: 'Thailand', iso3: 'THA', tier: 3 },
  VN: { name: 'Vietnam', iso3: 'VNM', tier: 3 },
  TR: { name: 'Turkey', iso3: 'TUR', tier: 3 },
  CZ: { name: 'Czech Republic', iso3: 'CZE', tier: 3 },
  RO: { name: 'Romania', iso3: 'ROU', tier: 3 },
  HU: { name: 'Hungary', iso3: 'HUN', tier: 3 },
  GR: { name: 'Greece', iso3: 'GRC', tier: 3 },
  BD: { name: 'Bangladesh', iso3: 'BGD', tier: 3 },
  PK: { name: 'Pakistan', iso3: 'PAK', tier: 3 },
  KW: { name: 'Kuwait', iso3: 'KWT', tier: 3 },
  QA: { name: 'Qatar', iso3: 'QAT', tier: 3 },
  KZ: { name: 'Kazakhstan', iso3: 'KAZ', tier: 3 },
};

// 5 starting industries with Meta interest targeting IDs
export const INDUSTRIES = {
  RTL: {
    name: 'Retail',
    iab: 'IAB22',
    interests: [
      { id: '6003346592981', name: 'Online shopping' },
      { id: '6849890049601', name: 'Online shopping websites' },
    ],
  },
  TRV: {
    name: 'Travel',
    iab: 'IAB20',
    interests: [
      { id: '6004160395895', name: 'Travel' },
      { id: '6003211401886', name: 'Air travel' },
      { id: '6002868021822', name: 'Adventure travel' },
    ],
  },
  PET: {
    name: 'Pets',
    iab: 'IAB452',
    interests: [
      { id: '6004037726009', name: 'Pets' },
      { id: '6003430816269', name: 'Pets at Home' },
    ],
  },
  FIN: {
    name: 'Finance',
    iab: 'IAB3',
    interests: [
      { id: '6003388314512', name: 'Investment' },
      { id: '6003063638807', name: 'Investment banking' },
      { id: '6003293787730', name: 'Investment management' },
    ],
  },
  TEC: {
    name: 'Technology',
    iab: 'IAB19',
    interests: [
      { id: '6003985771306', name: 'Technology' },
      { id: '6003164535634', name: 'Information technology' },
    ],
  },
};

// Utility: get all country ISO-2 codes
export function getAllCountryCodes() {
  return Object.keys(COUNTRIES);
}

// Utility: get countries by tier
export function getCountriesByTier(tier) {
  return Object.entries(COUNTRIES)
    .filter(([, c]) => c.tier === tier)
    .map(([iso2]) => iso2);
}

// Utility: sleep helper for rate limiting
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Utility: format timestamp for logging
export function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
