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
const TMDB_API_KEY = (process.env.TMDB_API_KEY || '09ad47354cf2588cd01875ba6e225d07').trim();

function fetchJsonWithRetry(url, retries = 3) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 BornTodayHollywoodBot/1.0' }, timeout: 10000 }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
      });
    });
    req.on('timeout', () => { req.destroy(); if (retries > 0) setTimeout(() => resolve(fetchJsonWithRetry(url, retries - 1)), 400); else resolve(null); });
    req.on('error', () => { if (retries > 0) setTimeout(() => resolve(fetchJsonWithRetry(url, retries - 1)), 400); else resolve(null); });
  });
}

async function fetchTMDbSoloPhotos(celebName, birthDate = null) {
  if (!TMDB_API_KEY) return [];
  try {
    const searchUrl = `https://api.themoviedb.org/3/search/person?query=${encodeURIComponent(celebName)}&api_key=${TMDB_API_KEY}`;
    const searchRes = await fetchJsonWithRetry(searchUrl);
    if (!searchRes?.results || searchRes.results.length === 0) return [];

    let targetPerson = null;
    const monthDay = birthDate ? (birthDate.length === 10 ? birthDate.substring(5) : birthDate) : null;

    // Filter by Hollywood profession
    const candidates = searchRes.results.filter(p => 
      p.known_for_department === 'Acting' || p.known_for_department === 'Directing'
    );
    const pool = candidates.length > 0 ? candidates : searchRes.results;

    // Verify by birthday MM-DD
    if (monthDay) {
      for (const p of pool.slice(0, 3)) {
        await new Promise(r => setTimeout(r, 200));
        const detail = await fetchJsonWithRetry(`https://api.themoviedb.org/3/person/${p.id}?api_key=${TMDB_API_KEY}`);
        if (detail?.birthday && detail.birthday.endsWith(monthDay)) {
          targetPerson = p;
          console.log(`    🎯 [TMDb Match] 100% Verified ${celebName} by birthday: ${detail.birthday} (ID: ${p.id})`);
          break;
        }
      }
    }

    if (!targetPerson) {
      targetPerson = pool[0];
    }

    if (!targetPerson || !targetPerson.id) return [];

    await new Promise(r => setTimeout(r, 200));
    const imgUrl = `https://api.themoviedb.org/3/person/${targetPerson.id}/images?api_key=${TMDB_API_KEY}`;
    const imgRes = await fetchJsonWithRetry(imgUrl);
    if (!imgRes?.profiles || imgRes.profiles.length === 0) return [];

    return imgRes.profiles.map(p => `https://image.tmdb.org/t/p/original${p.file_path}`);
  } catch (e) {
    return [];
  }
}

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

async function normalizePayload(raw) {
  if (!raw) return null;

  const dateStr = raw.date || new Date().toISOString().split('T')[0];
  const celebs = raw.celebrities || raw.celebs || [];

  if (celebs.length === 0 && raw.posts && raw.posts.length > 0) {
    console.log('[i] Payload already contains posts array.');
    return raw;
  }

  const posts = [];

  // Target Page: All posts go to Born Today Hollywood
  const pageConfigs = [
    { page_name: 'Born Today Hollywood', page_id_env: 'FB_PAGE_ID_BORN', token_env: 'FB_TOKEN_BORN' }
  ];

  // 6 Optimal Tier 1 (US Eastern) Peak Engagement Windows across the day
  const PEAK_HOURS_UTC = [
    { hour: 12, minute: 0, label: 'US Morning Commute (8:00 AM EDT / 5:30 PM IST)' },
    { hour: 14, minute: 30, label: 'US Mid-Morning Break (10:30 AM EDT / 8:00 PM IST)' },
    { hour: 17, minute: 0, label: 'US Lunchtime Peak (1:00 PM EDT / 10:30 PM IST)' },
    { hour: 19, minute: 30, label: 'US Afternoon Lull (3:30 PM EDT / 1:00 AM IST +1)' },
    { hour: 22, minute: 30, label: 'US Prime Time (6:30 PM EDT / 4:00 AM IST +1)' },
    { hour: 1, minute: 0, nextDay: true, label: 'US Late Night Bedtime (9:00 PM EDT / 6:30 AM IST +1)' }
  ];

  function getScheduledPeakTime(dStr, slotIdx) {
    const slot = PEAK_HOURS_UTC[slotIdx % PEAK_HOURS_UTC.length];
    const [y, m, d] = dStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, slot.hour, slot.minute, 0));
    if (slot.nextDay) {
      dt.setUTCDate(dt.getUTCDate() + 1);
    }
    return {
      timestamp: Math.floor(dt.getTime() / 1000),
      iso: dt.toISOString(),
      label: slot.label
    };
  }

  // Hot Standby Failover Pool Handling:
  // If celebrities array contains 8 items (or backups marked with is_backup), select the 6 active celebrities
  let selectedCelebs = [];
  const primaryCelebs = celebs.filter(c => !c.is_backup);
  const backupCelebs = celebs.filter(c => c.is_backup);

  selectedCelebs = primaryCelebs.slice(0, 6);
  if (selectedCelebs.length < 6 && backupCelebs.length > 0) {
    const needed = 6 - selectedCelebs.length;
    console.log(`[i] Promoting ${needed} standby backup celebrity(ies) into active schedule.`);
    selectedCelebs.push(...backupCelebs.slice(0, needed));
  }
  if (selectedCelebs.length === 0) selectedCelebs = celebs.slice(0, 6);

  // Read existing posts if available to preserve already scheduled IDs
  const existingMap = {};
  if (fs.existsSync(TODAY_POSTS_PATH)) {
    try {
      const existingData = JSON.parse(fs.readFileSync(TODAY_POSTS_PATH, 'utf8'));
      if (existingData && existingData.posts) {
        for (const ep of existingData.posts) {
          if (ep.celebrity_name) existingMap[ep.celebrity_name.toLowerCase()] = ep;
          if (ep.id) existingMap[ep.id] = ep;
        }
      }
    } catch (e) {}
  }

  for (let idx = 0; idx < selectedCelebs.length; idx++) {
    const c = selectedCelebs[idx];
    const celebName = c.celebrity_name || c.name || `Celebrity_${idx + 1}`;
    const cleanSlug = celebName.replace(/[^a-zA-Z0-9_]/g, '_');
    const pageCfg = pageConfigs[idx % pageConfigs.length];
    const schedInfo = getScheduledPeakTime(dateStr, idx);
    const existing = existingMap[celebName.toLowerCase()] || existingMap[`${dateStr}_${String(idx + 1).padStart(2, '0')}_${cleanSlug}`];

    // 1. Fetch TMDb Studio Portraits with 3-point verification (Name + Date + Profession)
    const birthDateStr = c.birth_date || (c.birth_year ? `${c.birth_year}-${dateStr.substring(5)}` : dateStr.substring(5));
    const tmdbPhotos = await fetchTMDbSoloPhotos(celebName, birthDateStr);
    let finalPhotos = [...tmdbPhotos];

    // 2. Supplement up to 5 photos using incoming Wikimedia URLs
    const incomingPhotos = c.photo_urls || c.photos || [];
    for (const u of incomingPhotos) {
      if (finalPhotos.length >= 5) break;
      if (!finalPhotos.includes(u)) {
        finalPhotos.push(u);
      }
    }
    if (tmdbPhotos.length > 0) {
      console.log(`    🎬 [TMDb] Sourced ${tmdbPhotos.length} studio portraits for ${celebName} (Total: ${finalPhotos.length})`);
    }

    const rawTeaser = c.teaser_card || c.teaserCard || {};
    const teaserCard = {
      enabled: true,
      x: rawTeaser.x !== undefined ? rawTeaser.x : 45,
      y: rawTeaser.y !== undefined ? rawTeaser.y : 1161,
      width: rawTeaser.width !== undefined ? rawTeaser.width : 990,
      height: rawTeaser.height !== undefined ? rawTeaser.height : 200,
      bgColor: rawTeaser.bgColor || '#0d0f14',
      borderColor: rawTeaser.borderColor || '#b68c43',
      borderWidth: rawTeaser.borderWidth !== undefined ? rawTeaser.borderWidth : 2,
      cornerRadius: rawTeaser.cornerRadius !== undefined ? rawTeaser.cornerRadius : 14,
      badgeIcon: rawTeaser.badge_icon || rawTeaser.badgeIcon || 'crown',
      line1: rawTeaser.line1 || `At just young age,`,
      line2: rawTeaser.line2 || `journey started with`,
      line2Highlight: rawTeaser.line2_highlight || rawTeaser.line2Highlight || `legendary talent`,
      line3Highlight: rawTeaser.line3_climax || rawTeaser.line3Highlight || `${celebName}...`,
      ctaText: rawTeaser.cta_text || rawTeaser.ctaText || 'Read the full story in caption →'
    };

    const postObj = {
      id: `${dateStr}_${String(idx + 1).padStart(2, '0')}_${cleanSlug}`,
      celebrity_name: celebName,
      birth_year: c.birth_year || (c.birth_date ? parseInt(c.birth_date.split('-')[0]) : 1975),
      age: c.age || '',
      gender: c.gender || 'male',
      country: c.country || 'USA',
      preset: 'preset_viral_teaser',
      teaserCard: teaserCard,
      photo_urls: finalPhotos.length > 0 ? finalPhotos : incomingPhotos,
      caption: c.caption || '',
      comment: c.comment || '',
      reel_script: c.reel_script || '',
      reel_caption: c.reel_caption || '',
      hashtags: c.hashtags || `#${celebName.replace(/\s+/g, '')} #BornToday #${dateStr}`,
      image_path: (existing && existing.image_path) || `collages/${cleanSlug}_Page_${idx + 1}_Tribute.jpg`,
      scheduled_publish_time: c.scheduled_publish_time || c.unix_timestamp || schedInfo.timestamp,
      scheduled_time_utc: c.scheduled_time_utc || schedInfo.iso,
      peak_window: schedInfo.label,
      page_name: pageCfg.page_name,
      page_id_env: pageCfg.page_id_env,
      token_env: pageCfg.token_env
    };

    if (existing) {
      if (existing.fb_post_id) postObj.fb_post_id = existing.fb_post_id;
      if (existing.fb_post_url) postObj.fb_post_url = existing.fb_post_url;
      if (existing.fb_comment_id) postObj.fb_comment_id = existing.fb_comment_id;
      if (existing.fb_reel_id) postObj.fb_reel_id = existing.fb_reel_id;
      if (existing.fb_reel_scheduled_time) postObj.fb_reel_scheduled_time = existing.fb_reel_scheduled_time;
      if (existing.reel_path) postObj.reel_path = existing.reel_path;
    }

    posts.push(postObj);
  }

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

  const normalized = await normalizePayload(raw);
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
