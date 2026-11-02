#!/usr/bin/env node
/**
 * Viral 4:5 Portrait Master Poster Engine (1080 x 1350 Native)
 * Replaces the legacy collage maker with the high-CTR viral photo post template.
 *
 * Pipeline:
 * 1. Automated Background Removal (BRIA RMBG-1.4 with local caching in assets/cutouts/)
 * 2. 1:1 Thematic Asset Integration (pointing target for viral arrow)
 * 3. Right-Aligned Viral Teaser Headline (black setup + stacked red punchline words)
 * 4. Grounded Celebrity Cutout with slim white border and contour drop shadow
 * 5. Celebrity Name Badge at corner above footer with fixed red vertical bar
 * 6. Clean footer with Bebas Neue CTA & Red Laurel Star Logo
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const puppeteer = require('puppeteer');

const BASE_DIR = path.resolve(__dirname, '..');
const TODAY_POSTS_PATH = path.join(BASE_DIR, 'today_posts.json');
const COLLAGES_DIR = path.join(BASE_DIR, 'collages');
const CUTOUTS_DIR = path.join(BASE_DIR, 'assets/cutouts');
const THEMATIC_ASSETS_DIR = path.join(BASE_DIR, 'assets/thematic_assets');
const LOGO_PATH = path.join(BASE_DIR, 'collage-maker/red_laurel_logo.png');

if (!fs.existsSync(COLLAGES_DIR)) fs.mkdirSync(COLLAGES_DIR, { recursive: true });
if (!fs.existsSync(CUTOUTS_DIR)) fs.mkdirSync(CUTOUTS_DIR, { recursive: true });
if (!fs.existsSync(THEMATIC_ASSETS_DIR)) fs.mkdirSync(THEMATIC_ASSETS_DIR, { recursive: true });

// Read Red Laurel Logo base64
let logoBase64 = '';
if (fs.existsSync(LOGO_PATH)) {
  logoBase64 = fs.readFileSync(LOGO_PATH).toString('base64');
}

// -------------------------------------------------------------
// 1. HTTP Helpers for BRIA Background Removal API
// -------------------------------------------------------------
function postJSON(urlStr, data) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const body = JSON.stringify(data);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let resData = '';
      res.on('data', c => resData += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(resData) });
        } catch(e) {
          resolve({ status: res.statusCode, raw: resData });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function getSSEResult(sseUrl) {
  return new Promise((resolve, reject) => {
    https.get(sseUrl, res => {
      let buffer = '';
      res.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.replace('data:', '').trim());
              if (Array.isArray(data) && data[1] && data[1].url) {
                res.destroy();
                return resolve(data[1].url);
              }
            } catch (e) {}
          }
        }
      });
      res.on('end', () => resolve(null));
    }).on('error', reject);
  });
}

function downloadBinary(urlStr, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(urlStr, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBinary(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

// Ensure transparent cutout exists (download & call BRIA if needed)
async function ensureCutout(post, cleanSlug) {
  const localCutout = path.join(CUTOUTS_DIR, `${cleanSlug}_cutout.png`);
  if (fs.existsSync(localCutout) && fs.statSync(localCutout).size > 1000) {
    console.log(`    [✓] Using cached cutout: ${path.basename(localCutout)}`);
    return fs.readFileSync(localCutout).toString('base64');
  }

  // Also check numbered fallback in CUTOUTS_DIR
  const files = fs.readdirSync(CUTOUTS_DIR);
  const match = files.find(f => f.toLowerCase().includes(cleanSlug.toLowerCase().split('_')[0]) && f.endsWith('_cutout.png'));
  if (match) {
    const p = path.join(CUTOUTS_DIR, match);
    console.log(`    [✓] Using existing cutout match: ${match}`);
    return fs.readFileSync(p).toString('base64');
  }

  const photoUrl = (post.photo_urls && post.photo_urls[0]) || null;
  if (!photoUrl) {
    console.warn(`    [!] No photo URL available for background removal.`);
    return null;
  }

  console.log(`    ✂️ Invoking BRIA RMBG-1.4 background removal for ${post.celebrity_name}...`);
  try {
    const payload = {
      data: [{ path: photoUrl, url: photoUrl, orig_name: `${cleanSlug}.jpg`, meta: { _type: 'gradio.FileData' } }]
    };
    const res = await postJSON('https://briaai-bria-rmbg-1-4.hf.space/gradio_api/call/run', payload);
    if (res.body && res.body.event_id) {
      const resultUrl = await getSSEResult(`https://briaai-bria-rmbg-1-4.hf.space/gradio_api/call/run/${res.body.event_id}`);
      if (resultUrl) {
        await downloadBinary(resultUrl, localCutout);
        console.log(`    ✅ Background removed & saved to ${localCutout}`);
        return fs.readFileSync(localCutout).toString('base64');
      }
    }
  } catch (err) {
    console.warn(`    [!] BRIA background removal error (${err.message}). Trying local Python ML fallback.`);
  }

  // Fallback to local Python rembg
  const tempInput = path.join(BASE_DIR, 'assets', `${cleanSlug}_temp.jpg`);
  try {
    await downloadBinary(photoUrl, tempInput);
    const { execSync } = require('child_process');
    execSync(`python scripts/remove_background.py "${tempInput}" "${localCutout}"`, { stdio: 'inherit' });
    if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
    if (fs.existsSync(localCutout)) {
      console.log(`    ✅ Local ML cutout generated: ${localCutout}`);
      return fs.readFileSync(localCutout).toString('base64');
    }
  } catch (fallbackErr) {
    console.warn(`    [!] Local ML fallback failed (${fallbackErr.message}).`);
    if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
  }

  return null;
}

// -------------------------------------------------------------
// 2. Thematic Asset Resolver
// -------------------------------------------------------------
function getThematicAssetBase64(cleanSlug, post = {}) {
  // 1. If direct base64 was passed
  if (post.thematic_asset && post.thematic_asset.asset_b64) {
    return post.thematic_asset.asset_b64;
  }

  // 2. If dedicated asset_cutout_path was generated during Drive sync
  if (post.thematic_asset && post.thematic_asset.asset_cutout_path) {
    const directPath = path.resolve(BASE_DIR, post.thematic_asset.asset_cutout_path);
    if (fs.existsSync(directPath)) {
      console.log(`    [★] Using Drive-sourced character cutout: ${path.basename(directPath)}`);
      return fs.readFileSync(directPath).toString('base64');
    }
  }

  // 3. Direct downloaded cutout matches
  const directCutout = path.join(THEMATIC_ASSETS_DIR, `${cleanSlug}_character_cutout.png`);
  if (fs.existsSync(directCutout)) {
    return fs.readFileSync(directCutout).toString('base64');
  }

  // 4. If specific asset_filename is specified in post payload
  if (post.thematic_asset && post.thematic_asset.asset_filename) {
    const customPath = path.join(THEMATIC_ASSETS_DIR, post.thematic_asset.asset_filename);
    if (fs.existsSync(customPath)) {
      return fs.readFileSync(customPath).toString('base64');
    }
  }

  const s = cleanSlug.toLowerCase();
  let assetFile = null;

  if (s.includes('peter') || s.includes('jackson')) {
    assetFile = 'peter_gollum_cutout.png';
  } else if (s.includes('letitia') || s.includes('wright')) {
    assetFile = 'letitia_shuri_cutout.png';
  } else if (s.includes('john') || s.includes('candy')) {
    assetFile = 'john_del_griffith_cutout.png';
  } else if (s.includes('winona')) {
    assetFile = 'winona_handcuffs_cutout.png';
  } else if (s.includes('richard') || s.includes('dreyfuss')) {
    assetFile = 'richard_book_cutout.png';
  } else if (s.includes('tracee') || s.includes('ross')) {
    assetFile = 'tracee_mic_cutout.png';
  } else if (s.includes('david') || s.includes('schwimmer')) {
    assetFile = 'david_ross_geller_cutout.png';
  } else if (s.includes('shah') || s.includes('khan')) {
    assetFile = 'shah_rukh_raj_cutout.png';
  } else if (s.includes('marisol') || s.includes('nichols')) {
    assetFile = 'marisol_hermione_cutout.png';
  } else {
    // Check if any matching asset exists in directory
    const files = fs.readdirSync(THEMATIC_ASSETS_DIR);
    assetFile = files.find(f => f.toLowerCase().includes(s.split('_')[0])) || files[0] || null;
  }

  if (assetFile) {
    const p = path.join(THEMATIC_ASSETS_DIR, assetFile);
    if (fs.existsSync(p)) {
      return fs.readFileSync(p).toString('base64');
    }
  }
  return null;
}

// -------------------------------------------------------------
// 3. Teaser Headline Content Formatter
// -------------------------------------------------------------
function getTeaserLines(post) {
  let line1 = '';
  let line2 = '';
  let redLines = [];

  if (post.viral_teaser) {
    const vt = post.viral_teaser;
    const punch = vt.punchline_red || vt.redLines || [];
    line1 = (vt.line1 || '').toUpperCase();
    line2 = (vt.line2 || '').toUpperCase();
    redLines = (Array.isArray(punch) ? punch : [punch]).map(w => String(w).toUpperCase());
  } else {
    const name = (post.celebrity_name || '').toLowerCase();
    if (name.includes('winona')) {
      line1 = 'BEVERLY HILLS';
      line2 = 'PEAK OF FAME';
      redLines = ['SHOCKING', 'ARREST'];
    } else if (name.includes('richard')) {
      line1 = 'BRANDED';
      line2 = 'DUMB DOG';
      redLines = ['SECRET DYSLEXIA'];
    } else if (name.includes('tracee')) {
      line1 = 'DROPPED REAL NAME';
      line2 = 'SECRET AUDITIONS';
      redLines = ['HIDING', 'DIANA ROSS'];
    } else {
      const tc = post.teaserCard || {};
      line1 = (tc.line1 || 'HOLLYWOOD LEGEND').replace(/[,.]/g, '').toUpperCase().slice(0, 22);
      line2 = (tc.line2 || 'RISING ICON').replace(/[,.]/g, '').toUpperCase().slice(0, 22);
      const punch = (tc.line3Highlight || tc.line2Highlight || 'TRUE STORY').replace(/[,.]/g, '').toUpperCase();
      redLines = [punch.slice(0, 18)];
    }
  }

  // DYNAMIC TEXT AUTO-REDUCTION RULE:
  // Auto-scale font size and vertical layout so long headlines stay 100% inside canvas
  const allLines = [line1, line2, ...redLines].filter(Boolean);
  const maxLineLength = Math.max(...allLines.map(l => l.length), 0);

  let fontSize = 116;
  if (maxLineLength > 24) {
    fontSize = 70;
  } else if (maxLineLength > 21) {
    fontSize = 78;
  } else if (maxLineLength > 18) {
    fontSize = 86;
  } else if (maxLineLength > 15) {
    fontSize = 96;
  } else if (maxLineLength > 13) {
    fontSize = 106;
  }

  // Calculate dynamic vertical positions based on font size and line count
  const totalLines = 2 + redLines.length;
  const lineSpacing = fontSize * 0.94;
  const textBlockHeight = totalLines * lineSpacing;
  const bottomOfText = 48 + textBlockHeight;

  // Arrow sits cleanly below text
  const arrowTop = Math.round(bottomOfText + 14);
  const arrowLeft = Math.round(Math.min(620, 1080 - 48 - (fontSize * 3.8)));

  // Thematic asset sits directly below arrow
  const assetTop = Math.round(arrowTop + 130);
  const assetRight = 56;
  const assetSize = Math.round(Math.min(370, 1246 - assetTop - 80));

  return {
    line1,
    line2,
    redLines,
    fontSize,
    arrowTop,
    arrowLeft,
    assetTop,
    assetRight,
    assetSize: Math.max(260, assetSize)
  };
}

// -------------------------------------------------------------
// 4. Native 1080 x 1350 HTML Generator
// -------------------------------------------------------------
function buildNativePosterHtml({ celebName, age, cutoutB64, assetB64, logoB64, teaser }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1080px;
      height: 1350px;
      background: #ffffff;
      overflow: hidden;
      margin: 0;
      padding: 0;
    }

    .master-poster {
      width: 1080px;
      height: 1350px;
      background: #ffffff;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .stage {
      flex: 1;
      width: 100%;
      height: 1246px;
      background: #ffffff;
      position: relative;
    }

    /* RIGHT-ALIGNED VIRAL TEASER BLOCK */
    .teaser-right-block {
      position: absolute;
      top: 48px;
      right: 48px;
      z-index: 5;
      font-family: 'Anton', 'Bebas Neue', sans-serif;
      text-transform: uppercase;
      text-align: right;
      max-width: 880px;
      user-select: none;
    }
    .teaser-line-black {
      font-size: ${teaser.fontSize || 116}px;
      line-height: 0.94;
      color: #181818;
      letter-spacing: 1px;
      white-space: nowrap;
    }
    .teaser-line-red {
      font-size: ${teaser.fontSize || 116}px;
      line-height: 0.94;
      color: #d32020;
      letter-spacing: 1px;
      white-space: nowrap;
    }

    /* VIRAL BENT DOWN-ARROW (-15% SIZE: 220px x 166px) */
    .arrow-container {
      position: absolute;
      top: ${teaser.arrowTop}px;
      left: ${teaser.arrowLeft}px;
      z-index: 7;
      pointer-events: none;
    }
    .viral-arrow-svg {
      width: 220px;
      height: 166px;
      display: block;
    }

    /* THEMATIC ASSET CUTOUT: Grounded to footer top, enlarged */
    .thematic-asset-container {
      position: absolute;
      top: ${teaser.assetTop}px;
      bottom: 0px;
      right: 16px;
      width: 580px;
      z-index: 8;
      display: flex;
      align-items: flex-end;
      justify-content: flex-end;
      filter: drop-shadow(0 24px 48px rgba(0, 0, 0, 0.28));
      pointer-events: none;
    }
    .thematic-asset-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: right bottom;
      display: block;
    }

    /* CELEBRITY CUTOUT: Grounded bottom-left with slim 6px white contour + 32px drop shadow */
    .celebrity-shadow-wrapper {
      position: absolute;
      left: 0px;
      bottom: 0px;
      width: 622px;
      height: 932px;
      z-index: 10;
      filter: drop-shadow(0 0 32px rgba(0, 0, 0, 0.62));
    }
    .celebrity-white-stroke {
      width: 100%;
      height: 100%;
      filter: url(#white-border-filter);
      -webkit-mask-image: linear-gradient(to right, rgba(0,0,0,1) 95%, rgba(0,0,0,0) 100%);
      mask-image: linear-gradient(to right, rgba(0,0,0,1) 95%, rgba(0,0,0,0) 100%);
    }
    .celebrity-white-stroke img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: contain;
      object-position: left bottom;
    }

    /* BIRTHDAY BANNER STRIP: Centered white-to-beige gradient directly above footer */
    .birthday-banner-strip {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 15;
      background: linear-gradient(90deg, #ffffff 0%, #fcf9f5 15%, #f4ede2 50%, #fcf9f5 85%, #ffffff 100%);
      border-top: 1.5px solid rgba(197, 160, 89, 0.35);
      box-shadow: 0 -4px 18px rgba(0, 0, 0, 0.05);
      padding: 10px 24px 12px 24px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      user-select: none;
    }
    .banner-hb-text {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 28px;
      line-height: 1.1;
      letter-spacing: 3px;
      color: #d32020;
      font-weight: 700;
      text-transform: uppercase;
    }
    .banner-turns-text {
      font-family: 'Bebas Neue', 'Anton', sans-serif;
      font-size: 48px;
      line-height: 1.05;
      letter-spacing: 2px;
      color: #111111;
      font-weight: 700;
      text-transform: uppercase;
      max-width: 1000px;
      white-space: nowrap;
    }

    /* FOOTER BAR: Clean 104px height, centered Bebas Neue CTA */
    .footer-bar {
      height: 104px;
      width: 100%;
      background: #ffffff;
      display: flex;
      align-items: center;
      padding-left: 48px;
      padding-right: 48px;
      position: relative;
      z-index: 20;
    }
    .cta-text {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 40px;
      color: #000000;
      letter-spacing: 1.6px;
      word-spacing: 8px;
      line-height: 1;
    }

    /* RED LAUREL STAR LOGO */
    .corner-overlay-logo {
      position: absolute;
      right: 28px;
      bottom: 4px;
      width: 122px;
      height: 122px;
      opacity: 0.95;
      z-index: 50;
      pointer-events: none;
    }
    .corner-overlay-logo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  </style>
</head>
<body>

  <svg width="0" height="0" style="position:absolute;">
    <filter id="white-border-filter" x="-20%" y="-20%" width="140%" height="140%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="6" result="dilated"/>
      <feFlood flood-color="#ffffff" flood-opacity="1" result="white"/>
      <feComposite in="white" in2="dilated" operator="in" result="stroke"/>
      <feMerge>
        <feMergeNode in="stroke"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </svg>

  <div class="master-poster">
    <div class="stage">
      
      <!-- Right-Aligned Teaser Block -->
      <div class="teaser-right-block">
        <div class="teaser-line-black">${teaser.line1}</div>
        <div class="teaser-line-black">${teaser.line2}</div>
        <div>
          ${teaser.redLines.map(w => `<div class="teaser-line-red">${w}</div>`).join('')}
        </div>
      </div>

      <!-- Viral Bent Down-Arrow (-15% Size, pointy back) -->
      <div class="arrow-container">
        <svg class="viral-arrow-svg" viewBox="0 0 160 120">
          <path d="M 15,18 
                   C 45,22 75,42 92,72 
                   L 80,82 
                   L 142,100 
                   L 132,45 
                   L 115,62 
                   C 98,35 68,18 30,12 
                   Z" 
                fill="#d32020" 
                filter="drop-shadow(0 6px 16px rgba(0,0,0,0.22))" />
        </svg>
      </div>

      <!-- 1:1 Thematic Asset Cutout -->
      ${assetB64 ? `
      <div class="thematic-asset-container">
        <img class="thematic-asset-img" src="data:image/png;base64,${assetB64}" alt="Asset">
      </div>` : ''}

      <!-- Celebrity Cutout -->
      ${cutoutB64 ? `
      <div class="celebrity-shadow-wrapper">
        <div class="celebrity-white-stroke">
          <img src="data:image/png;base64,${cutoutB64}" alt="Celebrity">
        </div>
      </div>` : ''}

      <!-- Birthday Banner Strip: Centered white-to-beige gradient directly above footer -->
      <div class="birthday-banner-strip">
        <div class="banner-hb-text">HAPPY BIRTHDAY !</div>
        <div class="banner-turns-text">${celebName} TURNS ${age} TODAY</div>
      </div>

    </div>

    <footer class="footer-bar">
      <span class="cta-text">READ FULL STORY IN CAPTION  →</span>
    </footer>

    ${logoB64 ? `
    <div class="corner-overlay-logo">
      <img src="data:image/png;base64,${logoB64}" alt="Red Laurel Logo">
    </div>` : ''}
  </div>

</body>
</html>`;
}

// -------------------------------------------------------------
// -------------------------------------------------------------
// Auto-trim transparent margins so cutouts scale to full height
// -------------------------------------------------------------
async function autoTrimTransparent(page, b64) {
  if (!b64) return null;
  return await page.evaluate(async (rawB64) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let minX = c.width, minY = c.height, maxX = 0, maxY = 0;
        let found = false;

        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            if (d[(y * c.width + x) * 4 + 3] > 12) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
              found = true;
            }
          }
        }

        if (!found) {
          resolve(rawB64);
          return;
        }

        const cropWidth = maxX - minX + 1;
        const cropHeight = maxY - minY + 1;

        const outCanvas = document.createElement('canvas');
        outCanvas.width = cropWidth;
        outCanvas.height = cropHeight;
        const outCtx = outCanvas.getContext('2d');
        outCtx.drawImage(c, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

        const dataUrl = outCanvas.toDataURL('image/png');
        resolve(dataUrl.replace(/^data:image\/png;base64,/, ''));
      };
      img.src = 'data:image/png;base64,' + rawB64;
    });
  }, b64);
}

// 5. Main Execution Loop
// -------------------------------------------------------------
async function main() {
  if (!fs.existsSync(TODAY_POSTS_PATH)) {
    console.error(`[!] today_posts.json not found: ${TODAY_POSTS_PATH}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(TODAY_POSTS_PATH, 'utf8');
  const data = JSON.parse(rawData);
  const posts = data.posts || [];

  if (posts.length === 0) {
    console.log(`[i] today_posts.json is empty (0 posts). Clean slate.`);
    process.exit(0);
  }

  console.log(`\n======================================================`);
  console.log(`🚀 VIRAL 4:5 POSTER ENGINE (1080x1350 NATIVE)`);
  console.log(`   Processing ${posts.length} daily celebrity photo posts...`);
  console.log(`======================================================\n`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });

  for (let idx = 0; idx < posts.length; idx++) {
    const post = posts[idx];
    const celebName = post.celebrity_name || post.name || `Celebrity_${idx + 1}`;
    const cleanSlug = celebName.replace(/[^a-zA-Z0-9_]/g, '_');
    const imagePath = `collages/${cleanSlug}_Page_${idx + 1}_Tribute.jpg`;
    const destPath = path.join(BASE_DIR, imagePath);

    console.log(`[+] Post #${idx + 1}: ${celebName} -> ${imagePath}`);

    // 1. Ensure Background Cutout
    const cutoutB64 = await ensureCutout(post, cleanSlug);

    // 2. Ensure 1:1 Thematic Asset
    const rawAssetB64 = getThematicAssetBase64(cleanSlug, post);
    const assetB64 = await autoTrimTransparent(page, rawAssetB64);

    // 3. Resolve Teaser Lines
    const teaser = getTeaserLines(post);

    // 4. Build Native 1080 x 1350 HTML
    const html = buildNativePosterHtml({
      celebName: celebName.toUpperCase(),
      age: post.age || '',
      cutoutB64,
      assetB64,
      logoB64: logoBase64,
      teaser
    });

    await page.setContent(html, { waitUntil: 'networkidle0' });

    // 5. Screenshot full 1080 x 1350 poster
    const posterEl = await page.$('.master-poster');
    if (posterEl) {
      await posterEl.screenshot({
        path: destPath,
        type: 'jpeg',
        quality: 95
      });
      console.log(`    ✅ Rendered native 1080x1350 poster: ${destPath}`);
      post.image_path = imagePath;
    } else {
      console.error(`    [!] Could not locate .master-poster element for ${celebName}`);
    }
  }

  await browser.close();

  // Save synchronized JSON
  fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\n[✓] All ${posts.length} photo posts rendered & synchronized in today_posts.json!`);
}

main().catch(err => {
  console.error('[!] Fatal Error in Poster Engine:', err);
  process.exit(1);
});
