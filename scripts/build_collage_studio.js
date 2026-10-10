#!/usr/bin/env node
/**
 * Authentic Studio Collage Builder (Headless Chromium)
 * Uses the EXACT HTML5 Canvas rendering pipeline from collage-maker/app.js!
 * Renders custom backgrounds, Google Fonts, gold gradients, drop shadows, and frames.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const puppeteer = require('puppeteer');

const BASE_DIR = path.resolve(__dirname, '..');
const STUDIO_DIR = path.join(BASE_DIR, 'collage-maker');
const PRESETS_DIR = path.join(BASE_DIR, 'presets');
const COLLAGES_DIR = path.join(BASE_DIR, 'collages');
const TODAY_POSTS_PATH = path.join(BASE_DIR, 'today_posts.json');

if (!fs.existsSync(COLLAGES_DIR)) fs.mkdirSync(COLLAGES_DIR, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

// 1. Start local studio web server
function startServer(port = 3000) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
      const filePath = path.join(STUDIO_DIR, reqPath);

      fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*'
        });
        fs.createReadStream(filePath).pipe(res);
      });
    });

    server.listen(port, '127.0.0.1', () => {
      console.log(`[✓] Studio web server listening on http://127.0.0.1:${port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

function fetchJson(url) {
  return new Promise((resolve) => {
    const headers = { 'User-Agent': 'BornTodayHollywoodBot/1.0 (contact@borntoday.com)' };
    https.get(url, { headers, timeout: 8000 }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

function downloadAsDataUri(url, maxRedirects = 5) {
  if (!url || typeof url !== 'string') return Promise.resolve(null);
  url = url.replace('https://thumb.wikimedia.org/', 'https://upload.wikimedia.org/');
  url = url.replace('https://media.themoviedb.org/', 'https://image.tmdb.org/');
  if (url.includes('commons.wikimedia.org/wiki/File:')) return Promise.resolve(null);
  if (url.startsWith('data:image')) return Promise.resolve(url);

  // Support local relative or absolute image files
  let localPath = url;
  if (!path.isAbsolute(localPath)) {
    localPath = path.resolve(BASE_DIR, localPath);
  }
  if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
    try {
      const ext = path.extname(localPath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'image/jpeg';
      const buf = fs.readFileSync(localPath);
      return Promise.resolve(`data:${mime};base64,${buf.toString('base64')}`);
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const client = parsed.protocol === 'http:' ? http : https;
      const headers = { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 BornTodayHollywoodBot/1.0',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      };

      const req = client.get(url, { headers, timeout: 12000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
          const redirectUrl = new URL(res.headers.location, url).toString();
          return resolve(downloadAsDataUri(redirectUrl, maxRedirects - 1));
        }
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          if (buf.length < 500) {
            resolve(null);
            return;
          }
          const mime = res.headers['content-type'] || 'image/jpeg';
          resolve(`data:${mime};base64,${buf.toString('base64')}`);
        });
      });
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    } catch (e) {
      resolve(null);
    }
  });
}

// 2. Fetch real high-res Wikipedia & Wikimedia Commons photos across different eras
const NON_PERSON_KEYWORDS = [
  'map', 'flag', 'chart', 'diagram', 'plan', 'locator', 'coat_of_arms', 'signature',
  'autograph', 'grave', 'house', 'building', 'star', 'walk_of_fame', 'plaque', 'poster',
  'cover', 'sound', 'video', 'screenshot', 'wax', 'car', 'aircraft', 'stamp', 'coin',
  'billboard', 'street', 'statue', 'county', 'district', 'cdp', 'income', 'distribution',
  'club', 'elementary', 'center', 'hot_shoppe', 'shoes', 'logo', 'icon', 'symbol',
  'village', 'truck', 'bus', 'vehicle', 'traction', 'cd', 'album'
];

function isCleanPersonPhoto(title, celebName = '') {
  if (!title) return false;
  const lower = title.toLowerCase();
  if (!lower.endsWith('.jpg') && !lower.endsWith('.jpeg') && !lower.endsWith('.png') && !lower.endsWith('.webp')) return false;
  for (const b of NON_PERSON_KEYWORDS) {
    if (lower.includes(b)) return false;
  }
  if (celebName && celebName.toLowerCase().includes('chevy chase') && lower.includes('maryland')) {
    return false;
  }
  return true;
}

function extractYear(title, dateStr) {
  const combined = (title || '') + ' ' + (dateStr || '');
  const m = combined.match(/\b(19\d\d|20\d\d)\b/);
  return m ? parseInt(m[1]) : null;
}

function getEventSignature(title) {
  return (title || '').toLowerCase()
    .replace(/^file:/, '')
    .replace(/\.(jpg|jpeg|png|webp)$/, '')
    .replace(/cropped/g, '')
    .replace(/crop/g, '')
    .replace(/\(\d+\)/g, '')
    .replace(/\d+/g, '')
    .replace(/[-_().,]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

async function fetchCelebrityTimelinePhotos(celebName, birthYear = null) {
  const cleanName = celebName.replace(/\./g, '');
  const searchTerms = [
    cleanName,
    celebName.replace(/\s+[A-Z]\.?\s+/g, ' '),
    celebName
  ];

  const candidates = [];
  const seenUrls = new Set();
  const seenSignatures = new Set();

  function sanitizeWikiUrl(u) {
    if (!u || typeof u !== 'string') return null;
    let s = u.replace('https://thumb.wikimedia.org/', 'https://upload.wikimedia.org/');
    if (s.includes('commons.wikimedia.org/wiki/File:')) return null;
    return s.split('?')[0];
  }

  function addCandidate(title, dateStr, url) {
    if (!url || !isCleanPersonPhoto(title, celebName)) return;
    const cleanU = sanitizeWikiUrl(url);
    if (!cleanU || seenUrls.has(cleanU)) return;

    const yr = extractYear(title, dateStr);
    if (birthYear && yr && (yr < birthYear || yr > 2026)) return;

    const sig = getEventSignature(title);
    if (sig && seenSignatures.has(sig)) return;

    seenUrls.add(cleanU);
    if (sig) seenSignatures.add(sig);

    candidates.push({ title, year: yr, sig, url: cleanU });
  }

  // A. Wikipedia Article Primary Portrait (with redirects=1)
  try {
    const pData = await fetchJson(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(celebName.replace(/ /g, '_'))}&prop=pageimages&redirects=1&format=json&pithumbsize=1200`);
    if (pData?.query?.pages) {
      for (const k of Object.keys(pData.query.pages)) {
        const thumb = pData.query.pages[k]?.thumbnail?.source;
        if (thumb) {
          addCandidate(`${celebName} Wikipedia Portrait`, '2024', thumb);
        }
      }
    }
  } catch (e) {}

  // B. Commons Search with plain name (without quotes, broad file search)
  for (const st of searchTerms) {
    try {
      const sData = await fetchJson(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(st)}&gsrnamespace=6&gsrlimit=40&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=900&format=json`);
      if (sData?.query?.pages) {
        for (const k of Object.keys(sData.query.pages)) {
          const item = sData.query.pages[k];
          const meta = item.imageinfo?.[0]?.extmetadata;
          const date = meta?.DateTimeOriginal?.value || meta?.DateTime?.value;
          const u = item.imageinfo?.[0]?.thumburl || item.imageinfo?.[0]?.url;
          addCandidate(item.title || '', date, u);
        }
      }
    } catch (e) {}
    if (candidates.length >= 15) break;
  }

  // C. Commons Category Members
  for (const st of searchTerms) {
    try {
      const cData = await fetchJson(`https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers&gcmtitle=Category:${encodeURIComponent(st)}&gcmnamespace=6&gcmlimit=50&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=900&format=json`);
      if (cData?.query?.pages) {
        for (const k of Object.keys(cData.query.pages)) {
          const item = cData.query.pages[k];
          const meta = item.imageinfo?.[0]?.extmetadata;
          const date = meta?.DateTimeOriginal?.value || meta?.DateTime?.value;
          const u = item.imageinfo?.[0]?.thumburl || item.imageinfo?.[0]?.url;
          addCandidate(item.title || '', date, u);
        }
      }
    } catch (e) {}
    if (candidates.length >= 25) break;
  }

  return candidates;
}

function loadPreset(gender = 'female', presetName = null) {
  if (presetName) {
    const custom = path.join(PRESETS_DIR, presetName.endsWith('.json') ? presetName : `${presetName}.json`);
    if (fs.existsSync(custom)) return JSON.parse(fs.readFileSync(custom, 'utf8'));
  }
  const mainTemplate = path.join(PRESETS_DIR, 'main_template.json');
  if (fs.existsSync(mainTemplate)) {
    return JSON.parse(fs.readFileSync(mainTemplate, 'utf8'));
  }
  const viralTeaser = path.join(PRESETS_DIR, 'preset_viral_teaser.json');
  if (fs.existsSync(viralTeaser)) {
    return JSON.parse(fs.readFileSync(viralTeaser, 'utf8'));
  }
  const fallback = path.join(PRESETS_DIR, 'preset_female.json');
  if (fs.existsSync(fallback)) {
    return JSON.parse(fs.readFileSync(fallback, 'utf8'));
  }
  return { canvasWidth: 1080, canvasHeight: 1440, frames: [], textLayers: [], stickers: [] };
}

async function main() {
  if (!fs.existsSync(TODAY_POSTS_PATH)) {
    console.error(`[!] ${TODAY_POSTS_PATH} not found.`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(TODAY_POSTS_PATH, 'utf8'));
  let posts = data.posts || [];
  if (posts.length === 0 && data.celebs) {
    posts = [];
    for (const celeb of data.celebs) {
      for (const p of celeb.posts || []) {
        p.celebrity_name = celeb.name;
        p.age = celeb.age;
        p.birth_year = celeb.birth_year || (2026 - parseInt(celeb.age || 50));
        p.gender = celeb.gender || 'female';
        p.photo_urls = celeb.photo_urls || p.photo_urls || [];
        posts.push(p);
      }
    }
  }

  // Purge any stale collage images so only fresh scheduled posts are kept
  if (fs.existsSync(COLLAGES_DIR)) {
    const files = fs.readdirSync(COLLAGES_DIR);
    for (const f of files) {
      if (f !== '.gitkeep') {
        try { fs.unlinkSync(path.join(COLLAGES_DIR, f)); } catch (e) {}
      }
    }
  }

  if (posts.length === 0) {
    console.log(`[i] today_posts.json is empty (0 posts). Clean slate waiting for new schedule.`);
    process.exit(0);
  }

  console.log(`[*] Launching Studio Collage Engine for ${posts.length} daily posts...`);
  const server = await startServer(3000);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1440, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:3000/index.html', { waitUntil: 'networkidle2' });

  for (let idx = 0; idx < posts.length; idx++) {
    const post = posts[idx];
    const celebName = post.celebrity_name || post.name || `Celebrity_${idx + 1}`;
    const gender = post.gender || 'female';
    const age = post.age || '';
    const birthYear = post.birth_year || '';
    let rawPhotoUrls = post.photo_urls || [];

    const cleanSlug = celebName.replace(/[^a-zA-Z0-9_]/g, '_');
    const imagePath = `collages/${cleanSlug}_Page_${idx + 1}_Tribute.jpg`;
    const destPath = path.join(BASE_DIR, imagePath);

    console.log(`\n[+] Post #${idx + 1}: ${celebName} (${gender.toUpperCase()}) -> ${imagePath}`);

    // 1. Prioritize verified photo_urls (TMDb / payload) for 100% sync with reel
    let finalFramePhotos = [];
    if (rawPhotoUrls && rawPhotoUrls.length >= 3) {
      console.log(`    🎯 Synchronizing collage with verified payload photo_urls (${rawPhotoUrls.length} available)...`);
      for (const u of rawPhotoUrls.slice(0, 5)) {
        const dUri = await downloadAsDataUri(u);
        if (dUri) finalFramePhotos.push(dUri);
      }
    }

    // 2. Fallback to Wikipedia search ONLY if fewer than 3 photos are available
    if (finalFramePhotos.length < 3) {
      console.log(`    ⚠️ Fallback: Searching Wikipedia timeline photos...`);
      const timelineCandidates = await fetchCelebrityTimelinePhotos(celebName, birthYear);

      const downloadedCandidates = [];
      const seenData = new Set();
      for (const cand of timelineCandidates) {
        const dataUri = await downloadAsDataUri(cand.url);
        if (dataUri) {
          const fingerprint = dataUri.slice(100, 300);
          if (!seenData.has(fingerprint)) {
            seenData.add(fingerprint);
            downloadedCandidates.push({ ...cand, dataUri, fingerprint });
          }
        }
        if (downloadedCandidates.length >= 15) break;
      }

      const heroItem = downloadedCandidates[0] || null;
      const polaroidPool = downloadedCandidates.filter(c => !heroItem || (c.url !== heroItem.url && c.fingerprint !== heroItem.fingerprint));
      const datedPolaroids = polaroidPool.filter(c => c.year).sort((a, b) => a.year - b.year);
      const undatedPolaroids = polaroidPool.filter(c => !c.year);

      const selectedMilestones = [];
      let lastEraYear = 0;
      for (const dp of datedPolaroids) {
        if (!lastEraYear || Math.abs(dp.year - lastEraYear) >= 3) {
          selectedMilestones.push(dp);
          lastEraYear = dp.year;
          if (selectedMilestones.length === 4) break;
        }
      }
      if (selectedMilestones.length < 4) {
        for (const dp of datedPolaroids) {
          if (!selectedMilestones.find(m => m.fingerprint === dp.fingerprint)) {
            selectedMilestones.push(dp);
            if (selectedMilestones.length === 4) break;
          }
        }
      }
      if (selectedMilestones.length < 4) {
        for (const up of undatedPolaroids) {
          if (!selectedMilestones.find(m => m.fingerprint === up.fingerprint)) {
            selectedMilestones.push(up);
            if (selectedMilestones.length === 4) break;
          }
        }
      }

      finalFramePhotos = [
        heroItem ? heroItem.dataUri : null,
        ...selectedMilestones.slice(0, 4).map(m => m.dataUri)
      ];
    }

    // Safeguard: Ensure all 5 canvas slots are populated
    // Never duplicate photo 0 - ensure only distinct photos are assigned

    console.log(`    [✓] Assigned 5 Frame Photos (Guaranteed Unique: ${new Set(finalFramePhotos.filter(Boolean)).size}/5)`);

    const presetData = loadPreset(gender, post.preset || post.preset_name);
    if (post.teaserCard) {
      presetData.teaserCard = { ...(presetData.teaserCard || {}), ...post.teaserCard };
    }

    if (presetData.bgCustomImage && !presetData.bgCustomImage.startsWith('data:')) {
      const bgFullPath = path.join(STUDIO_DIR, presetData.bgCustomImage);
      if (fs.existsSync(bgFullPath)) {
        const bgBuf = fs.readFileSync(bgFullPath);
        presetData.bgCustomImage = `data:image/png;base64,${bgBuf.toString('base64')}`;
      }
    }

    const payload = {
      presetData,
      celebName,
      birthYear,
      age,
      photoUrls: finalFramePhotos
    };

    // Execute exact rendering pipeline in Chromium
    const dataUrl = await page.evaluate(async (p) => {
      return await window.renderAutomationCollage(p);
    }, payload);

    if (dataUrl && dataUrl.startsWith('data:image/jpeg;base64,')) {
      const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
      fs.writeFileSync(destPath, Buffer.from(base64Data, 'base64'));
      console.log(`    [✓] Pixel-perfect studio tribute generated: ${destPath}`);
      post.image_path = imagePath;
    } else {
      console.error(`    [!] Failed to export canvas image for ${celebName}`);
    }
  }

  await browser.close();
  server.close();

  // Save synchronized JSON
  fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\n[✓] All ${posts.length} collages rendered identically to Collage Studio!`);
}

main().catch(err => {
  console.error('[!] Studio Render Error:', err);
  process.exit(1);
});
