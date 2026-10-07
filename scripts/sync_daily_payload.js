#!/usr/bin/env node
/**
 * Daily Payload Synchronizer
 * Fetches the 6 Elite Celebrity Birthday packages from:
 * 1. GitHub repository_dispatch client_payload (if triggered by Apps Script webhook)
 * 2. OR Google Apps Script Web App URL (if running on schedule or workflow_dispatch)
 * Normalizes the payload into today_posts.json using the preset_viral_teaser template.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = path.resolve(__dirname, '..');
const TODAY_POSTS_PATH = path.join(BASE_DIR, 'today_posts.json');
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx7i_FHyxyLfpP3lETPAeWberFu6Q4oW5OCJBzpTy8XHu9FYSFjBkqkYth-yHXLoHECQg/exec';

function fetchUrlWithRedirects(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));

    https.get(url, { headers: { 'User-Agent': 'BirthdayAutoPoster/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrlWithRedirects(res.headers.location, maxRedirects - 1));
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', reject);
  });
}

async function getRawPayload() {
  // 1. Check if passed via command line argument or file
  const argFile = process.argv[2];
  if (argFile && fs.existsSync(argFile)) {
    console.log(`[i] Loading payload from provided file: ${argFile}`);
    return JSON.parse(fs.readFileSync(argFile, 'utf8'));
  }

  // 2. Check if passed via environment variable (from repository_dispatch)
  if (process.env.DISPATCH_PAYLOAD) {
    try {
      console.log('[i] Loading payload from DISPATCH_PAYLOAD environment variable');
      return JSON.parse(process.env.DISPATCH_PAYLOAD);
    } catch (e) {
      console.warn('[!] Failed to parse DISPATCH_PAYLOAD JSON, falling back to Web App');
    }
  }

  // 3. Fetch from Google Apps Script Web App
  console.log(`[i] Fetching latest daily payload from Google Apps Script Web App...`);
  try {
    const data = await fetchUrlWithRedirects(APPS_SCRIPT_URL);
    if (data && (data.celebrities || data.posts)) {
      console.log('[✓] Successfully fetched payload from Google Apps Script!');
      return data;
    } else {
      console.log('[!] Web App returned empty or invalid data:', data);
    }
  } catch (err) {
    console.warn('[!] Error fetching from Google Apps Script:', err.message);
  }

  return null;
}

function normalizePayload(raw) {
  if (!raw) return null;

  const dateStr = raw.date || new Date().toISOString().split('T')[0];
  const celebs = raw.celebrities || raw.celebs || [];

  if (celebs.length === 0 && raw.posts && raw.posts.length > 0) {
    console.log('[i] Payload already contains posts array.');
    return raw;
  }

  const posts = [];

  // Pages to distribute across:
  // Post 1 -> FB_PAGE_ID_BORN / FB_TOKEN_BORN
  // Post 2 -> FB_PAGE_ID_STAR / FB_TOKEN_STAR
  // Post 3 -> FB_PAGE_ID_VAULT / FB_TOKEN_VAULT
  const pageConfigs = [
    { page_name: 'Born Today Hollywood', page_id_env: 'FB_PAGE_ID_BORN', token_env: 'FB_TOKEN_BORN' },
    { page_name: 'StarBorn Tribute', page_id_env: 'FB_PAGE_ID_STAR', token_env: 'FB_TOKEN_STAR' },
    { page_name: 'Hollywood Vault Legends', page_id_env: 'FB_PAGE_ID_VAULT', token_env: 'FB_TOKEN_VAULT' }
  ];

  celebs.forEach((c, idx) => {
    const celebName = c.celebrity_name || c.name || `Celebrity_${idx + 1}`;
    const cleanSlug = celebName.replace(/[^a-zA-Z0-9_]/g, '_');
    const pageCfg = pageConfigs[idx % pageConfigs.length];

    const rawTeaser = c.teaser_card || c.teaserCard || {};
    const teaserCard = {
      enabled: true,
      x: 45,
      y: 1010,
      width: 990,
      height: 185,
      bgColor: '#0d0f14',
      borderColor: '#b68c43',
      borderWidth: 2,
      cornerRadius: 14,
      badgeIcon: rawTeaser.badge_icon || rawTeaser.badgeIcon || 'crown',
      line1: rawTeaser.line1 || `At just young age,`,
      line2: rawTeaser.line2 || `journey started with`,
      line2Highlight: rawTeaser.line2_highlight || rawTeaser.line2Highlight || `legendary talent`,
      line3Highlight: rawTeaser.line3_climax || rawTeaser.line3Highlight || `${celebName}...`,
      ctaText: rawTeaser.cta_text || rawTeaser.ctaText || 'Read the full story in caption →'
    };

    posts.push({
      id: `${dateStr}_${String(idx + 1).padStart(2, '0')}_${cleanSlug}`,
      celebrity_name: celebName,
      birth_year: c.birth_year || (c.birth_date ? parseInt(c.birth_date.split('-')[0]) : 1975),
      age: c.age || '',
      gender: c.gender || 'male',
      country: c.country || 'USA',
      preset: 'preset_viral_teaser',
      teaserCard: teaserCard,
      photo_urls: c.photo_urls || c.photos || [],
      caption: c.caption || '',
      comment: c.comment || '',
      hashtags: c.hashtags || `#${celebName.replace(/\s+/g, '')} #BornToday #${dateStr}`,
      image_path: `collages/${cleanSlug}_Page_${idx + 1}_Tribute.jpg`,
      page_name: pageCfg.page_name,
      page_id_env: pageCfg.page_id_env,
      token_env: pageCfg.token_env
    });
  });

  return {
    date: dateStr,
    generated_at: raw.generated_at || new Date().toISOString(),
    posts: posts
  };
}

async function main() {
  console.log('=== Daily Payload Synchronizer ===');
  const raw = await getRawPayload();

  if (!raw) {
    console.log('[i] No incoming payload fetched. Preserving existing today_posts.json.');
    process.exit(0);
  }

  const normalized = normalizePayload(raw);
  if (normalized && normalized.posts && normalized.posts.length > 0) {
    fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(normalized, null, 2), 'utf8');
    console.log(`[✓] Successfully updated today_posts.json with ${normalized.posts.length} celebrity posts!`);
  } else {
    console.log('[!] Payload was empty or invalid. today_posts.json left unchanged.');
  }
}

main().catch(err => {
  console.error('[!] Fatal error in sync_daily_payload:', err);
  process.exit(1);
});
