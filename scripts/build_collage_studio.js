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
  '.svg': 'image/svg+xml'
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

function downloadAsDataUri(url) {
  if (!url || typeof url !== 'string') return Promise.resolve(null);
  if (url.startsWith('data:image')) return Promise.resolve(url);

  return new Promise((resolve) => {
    try {
      const headers = { 'User-Agent': 'BornTodayHollywoodBot/1.0 (contact@borntoday.com)' };
      https.get(url, { headers, timeout: 9000 }, (res) => {
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
      }).on('error', () => resolve(null));
    } catch (e) {
      resolve(null);
    }
  });
}

// 2. Fetch real high-res Wikipedia photos for the celebrity
async function fetchWikipediaPhotos(celebName) {
  const clean = encodeURIComponent(celebName.replace(/ /g, '_'));
  const urls = [];

  // Thumbnail
  try {
    const data = await fetchJson(`https://en.wikipedia.org/w/api.php?action=query&titles=${clean}&prop=pageimages&format=json&pithumbsize=1000`);
    if (data && data.query && data.query.pages) {
      for (const pid of Object.keys(data.query.pages)) {
        const thumb = data.query.pages[pid]?.thumbnail?.source;
        if (thumb) urls.push(thumb);
      }
    }
  } catch (e) {}

  // Additional images
  try {
    const data2 = await fetchJson(`https://en.wikipedia.org/w/api.php?action=query&titles=${clean}&prop=images&format=json&imlimit=15`);
    if (data2 && data2.query && data2.query.pages) {
      for (const pid of Object.keys(data2.query.pages)) {
        const images = data2.query.pages[pid]?.images || [];
        for (const img of images) {
          const title = img.title || '';
          const lower = title.toLowerCase();
          if ((lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')) &&
              !lower.includes('icon') && !lower.includes('logo') && !lower.includes('flag') && !lower.includes('symbol') && !lower.includes('stub')) {
            const infoData = await fetchJson(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json`);
            if (infoData && infoData.query && infoData.query.pages) {
              for (const ipid of Object.keys(infoData.query.pages)) {
                const iinfo = infoData.query.pages[ipid]?.imageinfo?.[0];
                const direct = iinfo?.thumburl || iinfo?.url;
                if (direct && !urls.includes(direct)) {
                  urls.push(direct);
                  if (urls.length >= 8) break;
                }
              }
            }
          }
        }
      }
    }
  } catch (e) {}

  return urls;
}

function loadPreset(gender = 'female') {
  const g = gender.toLowerCase();
  const filename = `preset_${g}.json`;
  const pPath = path.join(PRESETS_DIR, filename);
  if (fs.existsSync(pPath)) {
    return JSON.parse(fs.readFileSync(pPath, 'utf8'));
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

    // Download and verify photo data URIs in Node
    const validDataUris = [];
    for (const u of rawPhotoUrls) {
      const dataUri = await downloadAsDataUri(u);
      if (dataUri) validDataUris.push(dataUri);
    }

    // If few or zero valid photos, fetch authentic Wikipedia photos
    if (validDataUris.length < 3) {
      console.log(`    Provided URLs had ${validDataUris.length} working photos. Fetching Wikipedia photos for ${celebName}...`);
      const wikiUrls = await fetchWikipediaPhotos(celebName);
      for (const wu of wikiUrls) {
        const dUri = await downloadAsDataUri(wu);
        if (dUri) {
          validDataUris.push(dUri);
          if (validDataUris.length >= 8) break;
        }
      }
    }

    console.log(`    [✓] Successfully prepared ${validDataUris.length} active high-res photo frames.`);

    // Distribute photos across all 8 frames
    const finalFramePhotos = [];
    if (validDataUris.length > 0) {
      for (let fIdx = 0; fIdx < 8; fIdx++) {
        finalFramePhotos.push(validDataUris[fIdx % validDataUris.length]);
      }
    }

    const presetData = loadPreset(gender);

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
