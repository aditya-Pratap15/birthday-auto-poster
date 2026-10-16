const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const puppeteer = require('puppeteer');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

// Support both standalone and within repo runs
const AUTO_DIR = 'C:\\Users\\prata\\OneDrive\\Desktop\\Facebook-Automations\\1-born-today-hollywood';
const ROOT_DIR = fs.existsSync(AUTO_DIR) ? AUTO_DIR : process.cwd();
const OUTPUT_DIR = path.join(ROOT_DIR, 'test_quiz_output');
const COLLAGES_DIR = path.join(ROOT_DIR, 'collages');
const REELS_DIR = path.join(ROOT_DIR, 'reels');
if (!fs.existsSync(COLLAGES_DIR)) fs.mkdirSync(COLLAGES_DIR, { recursive: true });
if (!fs.existsSync(REELS_DIR)) fs.mkdirSync(REELS_DIR, { recursive: true });
const ASSETS_AUDIO_DIR = path.join(ROOT_DIR, 'assets', 'audio');
const MUSIC_DIR = path.join(ROOT_DIR, 'music');
const PAGE_LOGO_PATH = path.join(ROOT_DIR, 'page_logo.png');
const TMDB_API_KEY = '09ad47354cf2588cd01875ba6e225d07';

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function fetchJson(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 BornTodayHollywood/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchJson(res.headers.location));
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function getCelebrityPhoto(name) {
  try {
    const s = await fetchJson(`https://api.themoviedb.org/3/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(name)}`);
    const p = s?.results?.[0]?.profile_path;
    if (p) return `https://image.tmdb.org/t/p/w780${p}`;
  } catch(e){}

  try {
    const w = await fetchJson(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(name.replace(/ /g, '_'))}&prop=pageimages&format=json&pithumbsize=1000`);
    const pages = w?.query?.pages;
    if (pages) {
      const k = Object.keys(pages)[0];
      const src = pages[k]?.thumbnail?.source;
      if (src) return src;
    }
  } catch(e){}
  return null;
}

function downloadImageAsDataUri(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    url = url.replace('https://thumb.wikimedia.org/', 'https://upload.wikimedia.org/');
    const parsed = new URL(url);
    const client = parsed.protocol === 'http:' ? require('http') : https;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 BornTodayHollywood/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadImageAsDataUri(res.headers.location));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const mime = res.headers['content-type'] || 'image/jpeg';
        resolve(`data:${mime};base64,${buf.toString('base64')}`);
      });
    }).on('error', () => resolve(null));
  });
}

async function synthesizeVoiceWithRetry(text, voiceName, destPath, retries = 3) {
  for (let a = 1; a <= retries; a++) {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const audioChunks = [];
      await new Promise((resolve, reject) => {
        const { audioStream } = tts.toStream(text);
        audioStream.on('data', chunk => audioChunks.push(chunk));
        audioStream.on('end', () => {
          fs.writeFileSync(destPath, Buffer.concat(audioChunks));
          resolve();
        });
        audioStream.on('error', reject);
      });
      return destPath;
    } catch(err) {
      if (a === retries) throw err;
      await new Promise(r => setTimeout(r, 2000 * a));
    }
  }
}

function getAudioDuration(filePath) {
  const out = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`).toString().trim();
  return parseFloat(out);
}

function getLogoDataUri() {
  if (fs.existsSync(PAGE_LOGO_PATH)) {
    return 'data:image/png;base64,' + fs.readFileSync(PAGE_LOGO_PATH).toString('base64');
  }
  return '';
}

function getBgmTrack(index = 1) {
  const defaultBgm = path.join(ROOT_DIR, 'background_music.mp3');
  if (!fs.existsSync(MUSIC_DIR)) return defaultBgm;
  const tracks = [];
  function scan(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(i => {
      const full = path.join(dir, i.name);
      if (i.isDirectory()) scan(full);
      else if (i.isFile() && i.name.toLowerCase().endsWith('.mp3')) tracks.push(full);
    });
  }
  scan(MUSIC_DIR);
  tracks.sort();
  if (tracks.length === 0) return defaultBgm;
  return tracks[(index - 1) % tracks.length];
}

async function run() {
  const args = process.argv.slice(2);
  const photo1Path = path.join(COLLAGES_DIR, 'quiz_01_Flea.jpg');
  const photo2Path = path.join(COLLAGES_DIR, 'quiz_02_Suzanne_Somers.jpg');
  const reel1Out = path.join(REELS_DIR, 'quiz_03_Caterina_Scorsone.mp4');
  const reel2Out = path.join(REELS_DIR, 'quiz_04_Barry_Corbin.mp4');
  const force = args.includes('--force') || args.includes('--all');
  console.log('======================================================');
  console.log('🎨 GENERATING REFINED CELEBRITY QUIZ POSTS & REELS (v4)');
  console.log('======================================================\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const logoUri = getLogoDataUri();
  const tempReelDir = path.join(ROOT_DIR, 'temp_reel_assets');
  if (!fs.existsSync(tempReelDir)) fs.mkdirSync(tempReelDir, { recursive: true });

  // -------------------------------------------------------------
  // 1. PHOTO QUIZ TYPE 1: FLEA (Male -> Soft Blue, Full Bleed 4:5 Image, Hand Emoji 👇)
  // -------------------------------------------------------------
  console.log('[1/4] Generating Photo Quiz Type 1 (Flea)...');
  if (fs.existsSync(photo1Path) && !force) {
    console.log('   ℹ️ Photo Quiz 1 already exists, skipping. (Use --force to rebuild)');
  } else {
  const fleaPhotoUrl = await getCelebrityPhoto('Flea (musician)') || await getCelebrityPhoto('Flea');
  const fleaDataUri = await downloadImageAsDataUri(fleaPhotoUrl);

  const photoQuiz1Html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800;900&family=Inter:wght@500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1080px; height: 1350px;
    background: radial-gradient(circle at 50% 25%, #e0f2fe 0%, #f0f9ff 45%, #dbeafe 100%);
    color: #0f172a; font-family: 'Inter', sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
    padding: 45px 45px 35px 45px; position: relative; overflow: hidden;
  }
  .header { display: flex; flex-direction: column; align-items: center; text-align: center; z-index: 2; width: 100%; }
  .badge-bar {
    display: flex; align-items: center; gap: 16px;
    background: #ffffff; border: 3px solid #38bdf8;
    padding: 10px 32px; border-radius: 50px; margin-bottom: 12px;
    box-shadow: 0 4px 18px rgba(56, 189, 248, 0.28);
  }
  .badge-bar img { width: 64px; height: 64px; border-radius: 50%; border: 2.5px solid #0284c7; }
  .badge-bar span { font-family: 'Outfit', sans-serif; font-size: 24px; font-weight: 800; letter-spacing: 2px; color: #0369a1; text-transform: uppercase; }
  
  /* Undistorted Crisp Golden Yellow with Clean Red Outline */
  .headline {
    font-family: 'Outfit', sans-serif; font-size: 54px; font-weight: 900; line-height: 1.12;
    color: #fbbf24;
    text-shadow: 
      -2.5px -2.5px 0 #dc2626,  
       2.5px -2.5px 0 #dc2626,
      -2.5px  2.5px 0 #dc2626,
       2.5px  2.5px 0 #dc2626,
      -3px  0px 0 #dc2626,
       3px  0px 0 #dc2626,
       0px -3px 0 #dc2626,
       0px  3px 0 #dc2626,
       0 8px 24px rgba(220, 38, 38, 0.45);
    letter-spacing: 0.5px;
  }
  .sub-headline { font-size: 21px; color: #0284c7; font-weight: 700; margin-top: 5px; }

  /* 4:5 Aspect Ratio Photo Box (520px x 650px) - Fills completely with NO white space */
  .photo-frame {
    width: 520px; height: 650px; border-radius: 28px; overflow: hidden; position: relative;
    border: 5px solid #ffffff;
    box-shadow: 0 18px 45px rgba(2, 132, 199, 0.22), 0 4px 20px rgba(0,0,0,0.12);
    z-index: 2; background: #0f172a;
    display: flex; align-items: center; justify-content: center;
    margin-top: 14px; margin-bottom: 14px;
  }
  .photo-frame img { width: 100%; height: 100%; object-fit: cover; object-position: center 20%; display: block; }

  /* Options Grid Positioned Directly Below Photo */
  .options-grid {
    width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; z-index: 2;
    margin-bottom: 14px;
  }
  .option-card {
    background: #ffffff; border: 3px solid #bae6fd;
    border-radius: 22px; padding: 18px 22px; display: flex; align-items: center; gap: 18px;
    box-shadow: 0 6px 20px rgba(2, 132, 199, 0.12);
  }
  .opt-letter {
    width: 54px; height: 54px; border-radius: 16px;
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    color: #78350f; font-family: 'Outfit', sans-serif; font-size: 30px; font-weight: 900;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.35); border: 2px solid #ffffff;
  }
  .opt-text { font-family: 'Outfit', sans-serif; font-size: 32px; font-weight: 800; color: #0f172a; line-height: 1.15; }

  /* Bottom Red Box with Hand Emoji 👇 + Caption Note */
  .footer-wrap { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 6px; z-index: 2; }
  .footer-cta {
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
    border: 2.5px solid #ffffff; border-radius: 18px; padding: 15px 36px; text-align: center; width: 100%;
    font-family: 'Outfit', sans-serif; font-size: 26px; font-weight: 900; color: #ffffff;
    box-shadow: 0 8px 25px rgba(220, 38, 38, 0.45); letter-spacing: 0.5px;
  }
  .caption-note {
    font-family: 'Outfit', sans-serif; font-size: 20px; font-weight: 700; color: #0369a1; letter-spacing: 0.5px;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="badge-bar">
      ${logoUri ? `<img src="${logoUri}">` : ''}
      <span>Born Today Hollywood Trivia</span>
    </div>
    <div class="headline">WHO IS THIS BIRTHDAY STAR? 🎂</div>
    <div class="sub-headline">Rock Hall of Fame Legend turns 64 today!</div>
  </div>

  <div class="photo-frame">
    <img src="${fleaDataUri}">
  </div>

  <div class="options-grid">
    <div class="option-card"><div class="opt-letter">A</div><div class="opt-text">Chad Smith</div></div>
    <div class="option-card"><div class="opt-letter">B</div><div class="opt-text">Flea</div></div>
    <div class="option-card"><div class="opt-letter">C</div><div class="opt-text">Anthony Kiedis</div></div>
    <div class="option-card"><div class="opt-letter">D</div><div class="opt-text">John Frusciante</div></div>
  </div>

  <div class="footer-wrap">
    <div class="footer-cta">WRITE YOUR ANSWER IN COMMENTS 👇</div>
    <div class="caption-note">Answer in caption</div>
  </div>
</body>
</html>`;

  const page1 = await browser.newPage();
  await page1.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
  await page1.setContent(photoQuiz1Html, { waitUntil: 'networkidle0' });
  const photo1Path = path.join(COLLAGES_DIR, 'quiz_01_Flea.jpg');
  await page1.screenshot({ path: photo1Path, type: 'jpeg', quality: 95 });
  await page1.close();
  console.log(`   ✅ Saved: ${photo1Path}`);
    try { fs.copyFileSync(photo1Path, path.join(OUTPUT_DIR, '01_Photo_Quiz_Type1_Flea.jpg')); } catch(e){}
  }

  // -------------------------------------------------------------
  // 2. PHOTO QUIZ TYPE 2: SUZANNE SOMERS (Female -> Soft Pink, Full Bleed 4:5 Images, Hand Emoji 👇)
  // -------------------------------------------------------------
  console.log('[2/4] Generating Photo Quiz Type 2 (Suzanne Somers)...');
  if (fs.existsSync(photo2Path) && !force) {
    console.log('   ℹ️ Photo Quiz 2 already exists, skipping. (Use --force to rebuild)');
  } else {
  const suzanneUri = await downloadImageAsDataUri(await getCelebrityPhoto('Suzanne Somers'));
  const joyceUri = await downloadImageAsDataUri(await getCelebrityPhoto('Joyce DeWitt'));
  const farrahUri = await downloadImageAsDataUri(await getCelebrityPhoto('Farrah Fawcett'));
  const goldieUri = await downloadImageAsDataUri(await getCelebrityPhoto('Goldie Hawn'));

  const photoQuiz2Html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800;900&family=Inter:wght@500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1080px; height: 1350px;
    background: radial-gradient(circle at 50% 20%, #fdf2f8 0%, #fce7f3 45%, #f5d0fe 100%);
    color: #0f172a; font-family: 'Inter', sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
    padding: 35px 45px 25px 45px; position: relative; overflow: hidden;
  }
  .header { display: flex; flex-direction: column; align-items: center; text-align: center; z-index: 2; width: 100%; }
  .badge-bar {
    display: flex; align-items: center; gap: 16px;
    background: #ffffff; border: 3px solid #f472b6;
    padding: 10px 32px; border-radius: 50px; margin-bottom: 8px;
    box-shadow: 0 4px 18px rgba(244, 114, 182, 0.28);
  }
  .badge-bar img { width: 64px; height: 64px; border-radius: 50%; border: 2.5px solid #db2777; }
  .badge-bar span { font-family: 'Outfit', sans-serif; font-size: 24px; font-weight: 800; letter-spacing: 2px; color: #be185d; text-transform: uppercase; }
  
  .headline-wrap { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .headline-top { font-family: 'Outfit', sans-serif; font-size: 36px; font-weight: 900; color: #831843; text-transform: uppercase; }
  
  /* Undistorted Crisp Golden Yellow with Clean Red Outline */
  .headline-name {
    font-family: 'Outfit', sans-serif; font-size: 58px; font-weight: 900; line-height: 1.1;
    color: #fbbf24;
    text-shadow: 
      -2.5px -2.5px 0 #dc2626,  
       2.5px -2.5px 0 #dc2626,
      -2.5px  2.5px 0 #dc2626,
       2.5px  2.5px 0 #dc2626,
      -3px  0px 0 #dc2626,
       3px  0px 0 #dc2626,
       0px -3px 0 #dc2626,
       0px  3px 0 #dc2626,
       0 8px 24px rgba(220, 38, 38, 0.45);
    letter-spacing: 0.5px;
  }
  .sub-headline { font-size: 20px; color: #be185d; font-weight: 700; margin-top: 3px; }

  /* 2x2 Grid with 4:5 Aspect Ratio Photo Cards (340px x 425px) - Perfectly fits 1080x1350 with zero bottom cutoff */
  .grid-2x2 {
    width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; z-index: 2;
    justify-items: center; margin-top: 10px; margin-bottom: 14px;
  }
  .photo-card {
    width: 340px; height: 425px; border-radius: 22px; overflow: hidden; position: relative;
    border: 4px solid #ffffff;
    box-shadow: 0 12px 35px rgba(190, 24, 93, 0.16), 0 4px 15px rgba(0,0,0,0.08);
    background: #0f172a;
    display: flex; align-items: center; justify-content: center;
  }
  .photo-card img { width: 100%; height: 100%; object-fit: cover; object-position: center 20%; display: block; }
  .card-badge {
    position: absolute; top: 14px; left: 14px;
    width: 50px; height: 50px; border-radius: 14px;
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    color: #78350f; font-family: 'Outfit', sans-serif; font-size: 28px; font-weight: 900;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 14px rgba(0,0,0,0.25); border: 2px solid #ffffff; z-index: 3;
  }

  /* Bottom Red Box with Hand Emoji 👇 + Caption Note */
  .footer-wrap { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 6px; z-index: 2; }
  .footer-cta {
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
    border: 2.5px solid #ffffff; border-radius: 18px; padding: 14px 36px; text-align: center; width: 100%;
    font-family: 'Outfit', sans-serif; font-size: 26px; font-weight: 900; color: #ffffff;
    box-shadow: 0 8px 25px rgba(220, 38, 38, 0.45); letter-spacing: 0.5px;
  }
  .caption-note {
    font-family: 'Outfit', sans-serif; font-size: 20px; font-weight: 700; color: #be185d; letter-spacing: 0.5px;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="badge-bar">
      ${logoUri ? `<img src="${logoUri}">` : ''}
      <span>Born Today Hollywood Face Match</span>
    </div>
    <div class="headline-wrap">
      <div class="headline-top">WHICH ONE IS</div>
      <div class="headline-name">SUZANNE SOMERS? 🎉</div>
    </div>
    <div class="sub-headline">The iconic 'Three's Company' star was born on this day!</div>
  </div>

  <div class="grid-2x2">
    <div class="photo-card"><div class="card-badge">A</div><img src="${suzanneUri}"></div>
    <div class="photo-card"><div class="card-badge">B</div><img src="${joyceUri}"></div>
    <div class="photo-card"><div class="card-badge">C</div><img src="${farrahUri}"></div>
    <div class="photo-card"><div class="card-badge">D</div><img src="${goldieUri}"></div>
  </div>

  <div class="footer-wrap">
    <div class="footer-cta">WRITE YOUR ANSWER IN COMMENTS 👇</div>
    <div class="caption-note">Answer in caption</div>
  </div>
</body>
</html>`;

  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
  await page2.setContent(photoQuiz2Html, { waitUntil: 'networkidle0' });
  const photo2Path = path.join(COLLAGES_DIR, 'quiz_02_Suzanne_Somers.jpg');
  await page2.screenshot({ path: photo2Path, type: 'jpeg', quality: 95 });
  await page2.close();
  console.log(`   ✅ Saved: ${photo2Path}`);
    try { fs.copyFileSync(photo2Path, path.join(OUTPUT_DIR, '02_Photo_Quiz_Type2_Suzanne_Somers.jpg')); } catch(e){}
  }

  // -------------------------------------------------------------
  // Helper for Luxury Outro Slide (Matching Regular Reels)
  // -------------------------------------------------------------
  function getOutroSlideHtml() {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@700;800;900&family=Inter:wght@500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1080px; height: 1920px;
    background: radial-gradient(circle at 50% 40%, #1a1e2b 0%, #080a0f 75%, #030406 100%);
    color: #ffffff; font-family: 'Outfit', sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    position: relative; overflow: hidden; gap: 32px;
  }
  .logo-box {
    width: 360px; height: 360px; border-radius: 50%;
    border: 6px solid #d4af37; box-shadow: 0 0 60px rgba(212, 175, 55, 0.5), 0 20px 50px rgba(0,0,0,0.8);
    overflow: hidden; background: #000;
  }
  .logo-box img { width: 100%; height: 100%; object-fit: cover; }
  .title {
    font-size: 64px; font-weight: 900; letter-spacing: 2px;
    background: linear-gradient(180deg, #ffffff 0%, #ffd700 80%, #d4af37 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    text-shadow: 0 6px 25px rgba(0,0,0,0.8); text-align: center;
  }
  .cta-badge {
    background: linear-gradient(135deg, #ffd700 0%, #b68c43 100%);
    color: #080b11; font-size: 38px; font-weight: 900;
    padding: 18px 48px; border-radius: 40px; box-shadow: 0 10px 30px rgba(212, 175, 55, 0.4);
    letter-spacing: 1px;
  }
  .sub-text { font-family: 'Inter', sans-serif; font-size: 30px; font-weight: 600; color: #cbd5e1; }
</style>
</head>
<body>
  <div class="logo-box">
    ${logoUri ? `<img src="${logoUri}">` : ''}
  </div>
  <div class="title">Born Today Hollywood</div>
  <div class="cta-badge">Like & Follow for Daily Updates 🎬</div>
  <div class="sub-text">Join thousands of cinema lovers every day!</div>
</body>
</html>`;
  }

  // -------------------------------------------------------------
  // 3. REEL QUIZ TYPE 1: CATERINA SCORSONE (Female -> Soft Pink, Constant Headline Size, Radiant Image Glow, Hand Emoji 👇)
  // -------------------------------------------------------------
  console.log('[3/4] Generating Reel Quiz Type 1 (Caterina Scorsone)...');
  if (fs.existsSync(reel1Out) && !force) {
    console.log('   ℹ️ Reel Quiz 1 already exists, skipping. (Use --force to rebuild)');
  } else {
  const caterinaUri = await downloadImageAsDataUri(await getCelebrityPhoto('Caterina Scorsone'));

  const r1VoiceQ = path.join(tempReelDir, 'r1_q_voice.mp3');
  const r1VoiceRev = path.join(tempReelDir, 'r1_rev_voice.mp3');

  const q1FullText = "Can you guess which beloved Hollywood star is celebrating her forty-fifth birthday today? Option A: Caterina Scorsone! Option B: Ellen Pompeo! Option C: Sarah Drew! Or Option D: Chyler Leigh! Your ten-second countdown begins right now!";
  const r1FullText = "That's right! Option A is Caterina Scorsone, turning forty-five today! Read the full story in the caption below!";

  await synthesizeVoiceWithRetry(q1FullText, 'en-US-JennyNeural', r1VoiceQ);
  await new Promise(r => setTimeout(r, 1000));
  await synthesizeVoiceWithRetry(r1FullText, 'en-US-JennyNeural', r1VoiceRev);

  const dur1Q = getAudioDuration(r1VoiceQ);
  const dur1Rev = getAudioDuration(r1VoiceRev);

  const t1_zoom = dur1Q * 0.30;
  const t1_a = dur1Q * 0.14;
  const t1_b = dur1Q * 0.14;
  const t1_c = dur1Q * 0.14;
  const t1_d = dur1Q * 0.14;
  const t1_prompt = dur1Q - (t1_zoom + t1_a + t1_b + t1_c + t1_d);

  function getReel1Html(activeOpt = null, timerNum = null, timerProgress = null, isReveal = false) {
    const dashOffset = timerProgress !== null ? (314.15 * (1 - timerProgress)).toFixed(2) : 314.15;
    
    // Image glows continuously at all times with medium speed breathing pace
    const bloom1 = (timerNum !== null && timerNum % 2 === 0) ? 42 : 32;
    const bloom2 = (timerNum !== null && timerNum % 2 === 0) ? 85 : 68;
    const imageGlowStyle = `box-shadow: 0 0 ${bloom1}px rgba(251, 191, 36, 0.85), 0 0 ${bloom2}px rgba(244, 114, 182, 0.75), 0 0 115px rgba(236, 72, 153, 0.55), 0 16px 45px rgba(0,0,0,0.22); border-color: #fef08a;`;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800;900&family=Inter:wght@500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1080px; height: 1920px;
    background: radial-gradient(circle at 50% 25%, #fdf2f8 0%, #fce7f3 45%, #fbcfe8 100%);
    color: #0f172a; font-family: 'Inter', sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
    padding: 70px 55px 40px 55px; position: relative; overflow: hidden;
  }
  .header { display: flex; flex-direction: column; align-items: center; text-align: center; z-index: 2; width: 100%; }
  .badge-bar {
    display: flex; align-items: center; gap: 16px;
    background: #ffffff; border: 3px solid #f472b6;
    padding: 10px 32px; border-radius: 50px; margin-bottom: 12px;
    box-shadow: 0 4px 18px rgba(244, 114, 182, 0.28);
  }
  .badge-bar img { width: 68px; height: 68px; border-radius: 50%; border: 2.5px solid #db2777; }
  .badge-bar span { font-family: 'Outfit', sans-serif; font-size: 26px; font-weight: 800; letter-spacing: 2px; color: #be185d; text-transform: uppercase; }
  
  /* Undistorted Crisp Golden Yellow with Clean Red Outline - Exact same size throughout */
  .headline-zoom {
    font-family: 'Outfit', sans-serif; font-size: 56px; font-weight: 900; line-height: 1.12;
    color: #fbbf24;
    text-shadow: 
      -2.5px -2.5px 0 #dc2626,  
       2.5px -2.5px 0 #dc2626,
      -2.5px  2.5px 0 #dc2626,
       2.5px  2.5px 0 #dc2626,
      -3px  0px 0 #dc2626,
       3px  0px 0 #dc2626,
       0px -3px 0 #dc2626,
       0px  3px 0 #dc2626,
       0 8px 24px rgba(220, 38, 38, 0.45);
    letter-spacing: 0.5px;
  }

  /* Circular Countdown Timer (Shifted with Little Space) */
  .timer-wrap {
    margin-top: 14px; display: flex; align-items: center; justify-content: center; position: relative; width: 120px; height: 120px;
  }
  .timer-svg { transform: rotate(-90deg); width: 120px; height: 120px; }
  .timer-bg-circle { stroke: rgba(244, 114, 182, 0.3); stroke-width: 10; fill: #ffffff; }
  .timer-progress-circle {
    stroke: #dc2626; stroke-width: 10; stroke-linecap: round; fill: none;
    stroke-dasharray: 314.15; stroke-dashoffset: ${dashOffset};
  }
  .timer-number {
    position: absolute; font-family: 'Outfit', sans-serif; font-size: 46px; font-weight: 900; color: #dc2626;
  }

  /* 4:5 Ratio Photo Box (560px x 700px) with Continuous Radiant Luminous Glow */
  .photo-frame {
    width: 560px; height: 700px; border-radius: 32px; overflow: hidden; position: relative;
    border: 5px solid #ffffff;
    ${imageGlowStyle}
    z-index: 2; background: #0f172a;
    display: flex; align-items: center; justify-content: center;
    margin-top: 14px; margin-bottom: 0px;
  }
  .photo-frame img { width: 100%; height: 100%; object-fit: cover; object-position: center 20%; display: block; }

  /* Options Container Shifted Just Below Image */
  .options-container {
    width: 100%; display: flex; flex-direction: column; gap: 16px; z-index: 2;
    margin-top: 18px;
  }
  .opt-row {
    background: #ffffff; border: 3px solid #fbcfe8;
    border-radius: 22px; padding: 20px 28px; display: flex; align-items: center; gap: 24px;
    box-shadow: 0 8px 22px rgba(219, 39, 119, 0.12);
    transition: all 0.2s ease;
  }
  .opt-row.active {
    background: #fef08a; border: 4.5px solid #eab308; transform: scale(1.035);
    box-shadow: 0 0 35px rgba(234, 179, 8, 0.95), 0 0 70px rgba(245, 158, 11, 0.7), 0 12px 35px rgba(0,0,0,0.2);
  }
  .opt-badge {
    width: 60px; height: 60px; border-radius: 18px;
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    color: #78350f; font-family: 'Outfit', sans-serif; font-size: 32px; font-weight: 900;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    box-shadow: 0 4px 14px rgba(245, 158, 11, 0.35); border: 2px solid #ffffff;
  }
  .opt-name { font-family: 'Outfit', sans-serif; font-size: 36px; font-weight: 800; color: #0f172a; letter-spacing: 0.5px; }

  /* Reveal State Placed Directly Below Image without Emojis */
  .reveal-container {
    width: 100%; display: flex; flex-direction: column; align-items: center; gap: 16px; z-index: 2;
    margin-top: 18px;
  }
  .correct-moved-card {
    background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
    border: 4.5px solid #16a34a; border-radius: 24px; padding: 22px 32px;
    display: flex; align-items: center; gap: 22px; width: 100%;
    box-shadow: 0 14px 40px rgba(22, 163, 74, 0.35);
  }
  .correct-moved-badge {
    width: 64px; height: 64px; border-radius: 18px;
    background: #16a34a; color: #ffffff; font-family: 'Outfit', sans-serif;
    font-size: 36px; font-weight: 900; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 14px rgba(22, 163, 74, 0.4); flex-shrink: 0;
  }
  .correct-moved-text { font-family: 'Outfit', sans-serif; font-size: 38px; font-weight: 900; color: #14532d; }
  
  .red-caption-box {
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
    border: 3px solid #ffffff; border-radius: 22px; padding: 20px 36px; text-align: center;
    font-family: 'Outfit', sans-serif; font-size: 28px; font-weight: 900; color: #ffffff;
    box-shadow: 0 10px 30px rgba(220, 38, 38, 0.45); letter-spacing: 0.5px; width: 100%;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="badge-bar">
      ${logoUri ? `<img src="${logoUri}">` : ''}
      <span>Born Today Hollywood Reel Quiz</span>
    </div>
    <div class="headline-zoom">WHO IS THIS BIRTHDAY STAR? 🎂</div>
    <div class="timer-wrap">
      <svg class="timer-svg" viewBox="0 0 120 120">
        <circle class="timer-bg-circle" cx="60" cy="60" r="50"></circle>
        <circle class="timer-progress-circle" cx="60" cy="60" r="50"></circle>
      </svg>
      <div class="timer-number">${timerNum !== null ? timerNum : (isReveal ? '0' : '10')}</div>
    </div>
  </div>

  <div class="photo-frame">
    <img src="${caterinaUri}">
  </div>

  ${!isReveal ? `
  <div class="options-container">
    <div class="opt-row ${activeOpt === 'A' ? 'active' : ''}">
      <div class="opt-badge">A</div>
      <div class="opt-name">Caterina Scorsone</div>
    </div>
    <div class="opt-row ${activeOpt === 'B' ? 'active' : ''}">
      <div class="opt-badge">B</div>
      <div class="opt-name">Ellen Pompeo</div>
    </div>
    <div class="opt-row ${activeOpt === 'C' ? 'active' : ''}">
      <div class="opt-badge">C</div>
      <div class="opt-name">Sarah Drew</div>
    </div>
    <div class="opt-row ${activeOpt === 'D' ? 'active' : ''}">
      <div class="opt-badge">D</div>
      <div class="opt-name">Chyler Leigh</div>
    </div>
  </div>
  ` : `
  <div class="reveal-container">
    <div class="correct-moved-card">
      <div class="correct-moved-badge">✓</div>
      <div class="correct-moved-text">Option A: Caterina Scorsone</div>
    </div>
    <div class="red-caption-box">READ FULL STORY IN CAPTION 👇</div>
  </div>
  `}
</body>
</html>`;
  }

  const pReel1 = await browser.newPage();
  await pReel1.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });

  // Render question frame (same headline size)
  await pReel1.setContent(getReel1Html('Q_INTRO', null, 0, false), { waitUntil: 'networkidle0' });
  const r1SlideQ = path.join(tempReelDir, 'r1_q.png');
  await pReel1.screenshot({ path: r1SlideQ, type: 'png' });

  // Render option highlight frames
  await pReel1.setContent(getReel1Html('A', null, 0, false), { waitUntil: 'networkidle0' });
  const r1SlideA = path.join(tempReelDir, 'r1_opt_a.png');
  await pReel1.screenshot({ path: r1SlideA, type: 'png' });

  await pReel1.setContent(getReel1Html('B', null, 0, false), { waitUntil: 'networkidle0' });
  const r1SlideB = path.join(tempReelDir, 'r1_opt_b.png');
  await pReel1.screenshot({ path: r1SlideB, type: 'png' });

  await pReel1.setContent(getReel1Html('C', null, 0, false), { waitUntil: 'networkidle0' });
  const r1SlideC = path.join(tempReelDir, 'r1_opt_c.png');
  await pReel1.screenshot({ path: r1SlideC, type: 'png' });

  await pReel1.setContent(getReel1Html('D', null, 0, false), { waitUntil: 'networkidle0' });
  const r1SlideD = path.join(tempReelDir, 'r1_opt_d.png');
  await pReel1.screenshot({ path: r1SlideD, type: 'png' });

  await pReel1.setContent(getReel1Html(null, null, 0, false), { waitUntil: 'networkidle0' });
  const r1SlidePrompt = path.join(tempReelDir, 'r1_prompt.png');
  await pReel1.screenshot({ path: r1SlidePrompt, type: 'png' });

  // Render 10 circular timer frames (options glow one by one: A, B, C, D, A, B, C, D, A, B)
  const optCycle1 = ['A', 'B', 'C', 'D'];
  for (let s = 1; s <= 10; s++) {
    const prog = s / 10;
    const currentNumber = 11 - s;
    const currentGlowOpt = optCycle1[(s - 1) % 4];
    await pReel1.setContent(getReel1Html(currentGlowOpt, currentNumber, prog, false), { waitUntil: 'networkidle0' });
    const sPath = path.join(tempReelDir, `r1_timer_${s}.png`);
    await pReel1.screenshot({ path: sPath, type: 'png' });
  }

  // Render reveal slide
  await pReel1.setContent(getReel1Html(null, null, 1.0, true), { waitUntil: 'networkidle0' });
  const r1SlideReveal = path.join(tempReelDir, 'r1_reveal.png');
  await pReel1.screenshot({ path: r1SlideReveal, type: 'png' });

  // Render outro slide
  await pReel1.setContent(getOutroSlideHtml(), { waitUntil: 'networkidle0' });
  const r1SlideOutro = path.join(tempReelDir, 'r1_outro.png');
  await pReel1.screenshot({ path: r1SlideOutro, type: 'png' });
  await pReel1.close();

  // Assemble Reel 1 Video Inputs
  const r1VidInputs = [];
  r1VidInputs.push(`-loop 1 -t ${t1_zoom.toFixed(2)} -i "${r1SlideQ}"`);
  r1VidInputs.push(`-loop 1 -t ${t1_a.toFixed(2)} -i "${r1SlideA}"`);
  r1VidInputs.push(`-loop 1 -t ${t1_b.toFixed(2)} -i "${r1SlideB}"`);
  r1VidInputs.push(`-loop 1 -t ${t1_c.toFixed(2)} -i "${r1SlideC}"`);
  r1VidInputs.push(`-loop 1 -t ${t1_d.toFixed(2)} -i "${r1SlideD}"`);
  r1VidInputs.push(`-loop 1 -t ${t1_prompt.toFixed(2)} -i "${r1SlidePrompt}"`);
  for (let s = 1; s <= 10; s++) {
    r1VidInputs.push(`-loop 1 -t 1.00 -i "${path.join(tempReelDir, `r1_timer_${s}.png`)}"`);
  }
  const r1RevealDur = (dur1Rev + 3.00).toFixed(2);
  r1VidInputs.push(`-loop 1 -t ${r1RevealDur} -i "${r1SlideReveal}"`);
  r1VidInputs.push(`-loop 1 -t 2.80 -i "${r1SlideOutro}"`);

  const numR1Slides = 6 + 10 + 1 + 1; // 18 slides
  let r1VConcat = '';
  let r1VConcatInputs = '';
  for (let k = 0; k < numR1Slides; k++) {
    r1VConcat += `[${k}:v]setsar=1[rv${k}];`;
    r1VConcatInputs += `[rv${k}]`;
  }
  r1VConcat += `${r1VConcatInputs}concat=n=${numR1Slides}:v=1:a=0[vbase];[vbase]format=yuv420p[vout];`;

  const aIdx_intro = numR1Slides;     // 18
  const aIdx_tick = numR1Slides + 1;  // 19
  const aIdx_chime = numR1Slides + 2; // 20
  const aIdx_rev = numR1Slides + 3;   // 21
  const aIdx_bgm = numR1Slides + 4;   // 22

  const tickAudio10 = path.join(ASSETS_AUDIO_DIR, 'tick_tick_10s.mp3');
  const chimeAudio = path.join(ASSETS_AUDIO_DIR, 'winner_chime.mp3');
  const bgmTrack1 = getBgmTrack(1);

  const delayTick1 = (dur1Q * 1000).toFixed(0);
  const delayChime1 = ((dur1Q + 10) * 1000).toFixed(0);
  const delayRevVoice1 = ((dur1Q + 10.3) * 1000).toFixed(0);
  const totalR1Dur = (dur1Q + 10 + parseFloat(r1RevealDur) + 2.80).toFixed(2);

  const r1FilterComplex = r1VConcat +
    `[${aIdx_intro}:a]volume=1.8[v_intro];` +
    `[${aIdx_tick}:a]adelay=${delayTick1}|${delayTick1},volume=1.2[a_tick];` +
    `[${aIdx_chime}:a]adelay=${delayChime1}|${delayChime1},volume=1.6[a_chime];` +
    `[${aIdx_rev}:a]adelay=${delayRevVoice1}|${delayRevVoice1},volume=1.8[v_rev];` +
    `[${aIdx_bgm}:a]volume=0.18[a_bgm];` +
    `[v_intro][a_tick][a_chime][v_rev][a_bgm]amix=inputs=5:duration=longest[amix];` +
    `[amix]afade=t=out:st=${(totalR1Dur - 0.7).toFixed(2)}:d=0.7[aout]`;

  const reel1Out = path.join(REELS_DIR, 'quiz_03_Caterina_Scorsone.mp4');
  const ffmpegCmd1 = `ffmpeg -y ${r1VidInputs.join(' ')} ` +
    `-i "${r1VoiceQ}" -i "${tickAudio10}" -i "${chimeAudio}" -i "${r1VoiceRev}" -stream_loop -1 -i "${bgmTrack1}" ` +
    `-filter_complex "${r1FilterComplex}" ` +
    `-map "[vout]" -map "[aout]" -t ${totalR1Dur} -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 192k "${reel1Out}"`;

  console.log('   🎬 Rendering Vertical Video Reel 1 with FFmpeg...');
  execSync(ffmpegCmd1, { stdio: 'pipe' });
  console.log(`   ✅ Saved: ${reel1Out}`);
    try { fs.copyFileSync(reel1Out, path.join(OUTPUT_DIR, '03_Reel_Quiz_Type1_Caterina_Scorsone.mp4')); } catch(e){}
  }

  // -------------------------------------------------------------
  // 4. REEL QUIZ TYPE 2: BARRY CORBIN (Male -> Soft Blue, Options Glow One By One During Timer, Hand Emoji 👇)
  // -------------------------------------------------------------
  console.log('[4/4] Generating Reel Quiz Type 2 (Barry Corbin)...');
  if (fs.existsSync(reel2Out) && !force) {
    console.log('   ℹ️ Reel Quiz 2 already exists, skipping. (Use --force to rebuild)');
  } else {
  const barryUri = await downloadImageAsDataUri(await getCelebrityPhoto('Barry Corbin'));
  const samElliottUri = await downloadImageAsDataUri(await getCelebrityPhoto('Sam Elliott'));
  const robertDuvallUri = await downloadImageAsDataUri(await getCelebrityPhoto('Robert Duvall'));
  const tommyLeeUri = await downloadImageAsDataUri(await getCelebrityPhoto('Tommy Lee Jones'));

  const r2VoiceQ = path.join(tempReelDir, 'r2_q_voice.mp3');
  const r2VoiceRev = path.join(tempReelDir, 'r2_rev_voice.mp3');
  const q2FullText = "Which of these four legendary screen stars is Barry Corbin, celebrating his eighty-sixth birthday today? Look closely at Options A, B, C, and D! Your ten-second countdown starts now!";
  const r2FullText = "That's right! Option B is Barry Corbin, turning eighty-six today! Read his full story in the caption below!";

  await new Promise(r => setTimeout(r, 1000));
  await synthesizeVoiceWithRetry(q2FullText, 'en-US-GuyNeural', r2VoiceQ);
  await new Promise(r => setTimeout(r, 1000));
  await synthesizeVoiceWithRetry(r2FullText, 'en-US-GuyNeural', r2VoiceRev);

  const dur2Q = getAudioDuration(r2VoiceQ);
  const dur2Rev = getAudioDuration(r2VoiceRev);

  function getReel2Html(timerNum = null, timerProgress = null, isReveal = false, glowingOpt = null) {
    const dashOffset = timerProgress !== null ? (314.15 * (1 - timerProgress)).toFixed(2) : 314.15;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800;900&family=Inter:wght@500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1080px; height: 1920px;
    background: radial-gradient(circle at 50% 20%, #e0f2fe 0%, #f0f9ff 45%, #dbeafe 100%);
    color: #0f172a; font-family: 'Inter', sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
    padding: 70px 55px 40px 55px; position: relative; overflow: hidden;
  }
  .header { display: flex; flex-direction: column; align-items: center; text-align: center; z-index: 2; width: 100%; }
  .badge-bar {
    display: flex; align-items: center; gap: 16px;
    background: #ffffff; border: 3px solid #38bdf8;
    padding: 10px 32px; border-radius: 50px; margin-bottom: 12px;
    box-shadow: 0 4px 18px rgba(56, 189, 248, 0.28);
  }
  .badge-bar img { width: 68px; height: 68px; border-radius: 50%; border: 2.5px solid #0284c7; }
  .badge-bar span { font-family: 'Outfit', sans-serif; font-size: 26px; font-weight: 800; letter-spacing: 2px; color: #0369a1; text-transform: uppercase; }
  
  .headline-wrap { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .headline-top { font-family: 'Outfit', sans-serif; font-size: 38px; font-weight: 900; color: #0369a1; text-transform: uppercase; }
  
  /* Undistorted Crisp Golden Yellow with Clean Red Outline */
  .headline-name {
    font-family: 'Outfit', sans-serif; font-size: 60px; font-weight: 900; line-height: 1.1;
    color: #fbbf24;
    text-shadow: 
      -2.5px -2.5px 0 #dc2626,  
       2.5px -2.5px 0 #dc2626,
      -2.5px  2.5px 0 #dc2626,
       2.5px  2.5px 0 #dc2626,
      -3px  0px 0 #dc2626,
       3px  0px 0 #dc2626,
       0px -3px 0 #dc2626,
       0px  3px 0 #dc2626,
       0 8px 24px rgba(220, 38, 38, 0.45);
    letter-spacing: 0.5px;
  }

  /* Circular Countdown Timer */
  .timer-wrap {
    margin-top: 14px; display: flex; align-items: center; justify-content: center; position: relative; width: 120px; height: 120px;
  }
  .timer-svg { transform: rotate(-90deg); width: 120px; height: 120px; }
  .timer-bg-circle { stroke: rgba(14, 165, 233, 0.25); stroke-width: 10; fill: #ffffff; }
  .timer-progress-circle {
    stroke: #dc2626; stroke-width: 10; stroke-linecap: round; fill: none;
    stroke-dasharray: 314.15; stroke-dashoffset: ${dashOffset};
  }
  .timer-number {
    position: absolute; font-family: 'Outfit', sans-serif; font-size: 46px; font-weight: 900; color: #dc2626;
  }

  /* 2x2 Grid Shifted Up Just Below Timer with 4:5 Aspect Ratio Cards (440px x 550px) - Fills completely */
  .grid-2x2 {
    width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; z-index: 2;
    justify-items: center; margin-top: 16px; margin-bottom: 0px;
  }
  .photo-card {
    width: 440px; height: 550px; border-radius: 28px; overflow: hidden; position: relative;
    border: 4.5px solid #ffffff;
    box-shadow: 0 14px 40px rgba(2, 132, 199, 0.18), 0 4px 15px rgba(0,0,0,0.1);
    background: #0f172a;
    display: flex; align-items: center; justify-content: center;
  }
  .photo-card.glow {
    border: 5px solid #38bdf8;
    box-shadow: 0 0 38px rgba(56, 189, 248, 0.95), 0 0 75px rgba(14, 165, 233, 0.7), 0 16px 40px rgba(0,0,0,0.25);
    transform: scale(1.035);
  }
  .photo-card img { width: 100%; height: 100%; object-fit: cover; object-position: center 20%; display: block; }
  .card-badge {
    position: absolute; top: 16px; left: 16px;
    width: 58px; height: 58px; border-radius: 18px;
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    color: #78350f; font-family: 'Outfit', sans-serif; font-size: 32px; font-weight: 900;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 14px rgba(0,0,0,0.25); border: 2px solid #ffffff; z-index: 3;
  }

  /* Reveal State: Winner Image Just Below Timer, Name Directly Below Image (NOT upon image), Red Box Below Name */
  .reveal-center-container {
    width: 100%; display: flex; flex-direction: column; align-items: center; gap: 16px; z-index: 2;
    margin-top: 16px;
  }
  .centered-winner-frame {
    width: 560px; height: 700px; border-radius: 32px; overflow: hidden; position: relative;
    border: 5px solid #16a34a;
    box-shadow: 0 20px 55px rgba(22, 163, 74, 0.4), 0 0 35px rgba(34, 197, 94, 0.3);
    background: #0f172a; display: flex; align-items: center; justify-content: center;
  }
  .centered-winner-frame img { width: 100%; height: 100%; object-fit: cover; object-position: center 20%; display: block; }
  .card-badge-winner {
    position: absolute; top: 18px; left: 18px;
    width: 60px; height: 60px; border-radius: 18px;
    background: #16a34a; color: #ffffff; font-family: 'Outfit', sans-serif;
    font-size: 34px; font-weight: 900; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3); border: 2px solid #ffffff; z-index: 3;
  }

  /* Name Card Placed Directly Below Image (NOT overlaying upon the image) */
  .winner-name-card {
    background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
    border: 4.5px solid #16a34a; border-radius: 22px; padding: 20px 32px; width: 100%;
    text-align: center; box-shadow: 0 10px 30px rgba(22, 163, 74, 0.35);
    font-family: 'Outfit', sans-serif; font-size: 38px; font-weight: 900; color: #14532d;
  }

  /* Red Caption Box Below Name with Hand Emoji 👇 */
  .red-caption-box {
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
    border: 3px solid #ffffff; border-radius: 22px; padding: 20px 36px; text-align: center;
    font-family: 'Outfit', sans-serif; font-size: 28px; font-weight: 900; color: #ffffff;
    box-shadow: 0 10px 30px rgba(220, 38, 38, 0.45); letter-spacing: 0.5px; width: 100%;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="badge-bar">
      ${logoUri ? `<img src="${logoUri}">` : ''}
      <span>Born Today Hollywood Reel Match</span>
    </div>
    <div class="headline-wrap">
      <div class="headline-top">WHICH ONE IS</div>
      <div class="headline-name">BARRY CORBIN? 🤠</div>
    </div>
    <div class="timer-wrap">
      <svg class="timer-svg" viewBox="0 0 120 120">
        <circle class="timer-bg-circle" cx="60" cy="60" r="50"></circle>
        <circle class="timer-progress-circle" cx="60" cy="60" r="50"></circle>
      </svg>
      <div class="timer-number">${timerNum !== null ? timerNum : (isReveal ? '0' : '10')}</div>
    </div>
  </div>

  ${!isReveal ? `
  <div class="grid-2x2">
    <div class="photo-card ${glowingOpt === 'A' ? 'glow' : ''}"><div class="card-badge">A</div><img src="${samElliottUri}"></div>
    <div class="photo-card ${glowingOpt === 'B' ? 'glow' : ''}"><div class="card-badge">B</div><img src="${barryUri}"></div>
    <div class="photo-card ${glowingOpt === 'C' ? 'glow' : ''}"><div class="card-badge">C</div><img src="${robertDuvallUri}"></div>
    <div class="photo-card ${glowingOpt === 'D' ? 'glow' : ''}"><div class="card-badge">D</div><img src="${tommyLeeUri}"></div>
  </div>
  ` : `
  <div class="reveal-center-container">
    <div class="centered-winner-frame">
      <div class="card-badge-winner">✓</div>
      <img src="${barryUri}">
    </div>
    <div class="winner-name-card">Option B: Barry Corbin (Turns 86)</div>
    <div class="red-caption-box">READ FULL STORY IN CAPTION 👇</div>
  </div>
  `}
</body>
</html>`;
  }

  const pReel2 = await browser.newPage();
  await pReel2.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });

  // Render question slide
  await pReel2.setContent(getReel2Html(null, 0, false, null), { waitUntil: 'networkidle0' });
  const r2SlideQ = path.join(tempReelDir, 'r2_q.png');
  await pReel2.screenshot({ path: r2SlideQ, type: 'png' });

  // Render 10 circular timer frames (options glow one by one: A, B, C, D, A, B, C, D, A, B)
  const optCycle = ['A', 'B', 'C', 'D'];
  for (let s = 1; s <= 10; s++) {
    const prog = s / 10;
    const currentNumber = 11 - s;
    const currentGlowOpt = optCycle[(s - 1) % 4];
    await pReel2.setContent(getReel2Html(currentNumber, prog, false, currentGlowOpt), { waitUntil: 'networkidle0' });
    const sPath = path.join(tempReelDir, `r2_timer_${s}.png`);
    await pReel2.screenshot({ path: sPath, type: 'png' });
  }

  // Render reveal slide
  await pReel2.setContent(getReel2Html(null, 1.0, true, null), { waitUntil: 'networkidle0' });
  const r2SlideReveal = path.join(tempReelDir, 'r2_reveal.png');
  await pReel2.screenshot({ path: r2SlideReveal, type: 'png' });

  // Render outro slide
  await pReel2.setContent(getOutroSlideHtml(), { waitUntil: 'networkidle0' });
  const r2SlideOutro = path.join(tempReelDir, 'r2_outro.png');
  await pReel2.screenshot({ path: r2SlideOutro, type: 'png' });
  await pReel2.close();

  // Assemble Reel 2 Video Inputs
  const r2VidInputs = [];
  r2VidInputs.push(`-loop 1 -t ${dur2Q.toFixed(2)} -i "${r2SlideQ}"`);
  for (let s = 1; s <= 10; s++) {
    r2VidInputs.push(`-loop 1 -t 1.00 -i "${path.join(tempReelDir, `r2_timer_${s}.png`)}"`);
  }
  const r2RevealDur = (dur2Rev + 3.00).toFixed(2);
  r2VidInputs.push(`-loop 1 -t ${r2RevealDur} -i "${r2SlideReveal}"`);
  r2VidInputs.push(`-loop 1 -t 2.80 -i "${r2SlideOutro}"`);

  const numR2Slides = 1 + 10 + 1 + 1; // 13 slides
  let r2VConcat = '';
  let r2VConcatInputs = '';
  for (let k = 0; k < numR2Slides; k++) {
    r2VConcat += `[${k}:v]setsar=1[r2v${k}];`;
    r2VConcatInputs += `[r2v${k}]`;
  }
  r2VConcat += `${r2VConcatInputs}concat=n=${numR2Slides}:v=1:a=0[vbase];[vbase]format=yuv420p[vout];`;

  const aIdx2_qVoice = numR2Slides;     // 13
  const aIdx2_tick = numR2Slides + 1;   // 14
  const aIdx2_chime = numR2Slides + 2;  // 15
  const aIdx2_rev = numR2Slides + 3;    // 16
  const aIdx2_bgm = numR2Slides + 4;    // 17

  const bgmTrack2 = getBgmTrack(2);
  const delayTick2 = (dur2Q * 1000).toFixed(0);
  const delayChime2 = ((dur2Q + 10) * 1000).toFixed(0);
  const delayRevVoice2 = ((dur2Q + 10.3) * 1000).toFixed(0);
  const totalR2Dur = (dur2Q + 10 + parseFloat(r2RevealDur) + 2.80).toFixed(2);

  const r2FilterComplex = r2VConcat +
    `[${aIdx2_qVoice}:a]volume=1.8[v_q];` +
    `[${aIdx2_tick}:a]adelay=${delayTick2}|${delayTick2},volume=1.2[a_tick];` +
    `[${aIdx2_chime}:a]adelay=${delayChime2}|${delayChime2},volume=1.6[a_chime];` +
    `[${aIdx2_rev}:a]adelay=${delayRevVoice2}|${delayRevVoice2},volume=1.8[v_rev];` +
    `[${aIdx2_bgm}:a]volume=0.18[a_bgm];` +
    `[v_q][a_tick][a_chime][v_rev][a_bgm]amix=inputs=5:duration=longest[amix];` +
    `[amix]afade=t=out:st=${(totalR2Dur - 0.7).toFixed(2)}:d=0.7[aout]`;

  const reel2Out = path.join(REELS_DIR, 'quiz_04_Barry_Corbin.mp4');
  const ffmpegCmd2 = `ffmpeg -y ${r2VidInputs.join(' ')} ` +
    `-i "${r2VoiceQ}" -i "${tickAudio10}" -i "${chimeAudio}" -i "${r2VoiceRev}" -stream_loop -1 -i "${bgmTrack2}" ` +
    `-filter_complex "${r2FilterComplex}" ` +
    `-map "[vout]" -map "[aout]" -t ${totalR2Dur} -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 192k "${reel2Out}"`;

  console.log('   🎬 Rendering Vertical Video Reel 2 with FFmpeg...');
  execSync(ffmpegCmd2, { stdio: 'pipe' });
  console.log(`   ✅ Saved: ${reel2Out}`);
    try { fs.copyFileSync(reel2Out, path.join(OUTPUT_DIR, '04_Reel_Quiz_Type2_Barry_Corbin.mp4')); } catch(e){}
  }

  await browser.close();
  console.log('\n======================================================');
  console.log('🎉 ALL 4 REFINED CELEBRITY QUIZ POSTS GENERATED (v4)!');
  console.log('======================================================');
}

run().catch(err => {
  console.error('[!] Error in Quiz Suite:', err);
  process.exit(1);
});
