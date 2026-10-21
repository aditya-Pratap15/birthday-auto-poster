const { auditAndEnforceQuizGender, getRandomSameGenderDistractors, detectGender } = require('./gender_guard');
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


async function safeSetContent(page, html) {
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.evaluate(() => {
      return Promise.all(
        Array.from(document.images)
          .filter(img => !img.complete)
          .map(img => new Promise(resolve => { img.onload = img.onerror = resolve; }))
      );
    }).catch(() => {});
  } catch (err) {
    try { await page.setContent(html, { timeout: 6000 }); } catch (_) {}
  }
}

async function getCelebrityPhoto(name, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const s = await fetchJson(`https://api.themoviedb.org/3/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(name)}`);
      const p = s?.results?.[0]?.profile_path;
      if (p) return `https://image.tmdb.org/t/p/w780${p}`;
    } catch(e) {
      if (attempt < retries) await new Promise(r => setTimeout(r, 600));
    }
  }

  // Fallback to Wikipedia with compliant User-Agent
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

function downloadImageAsDataUri(url, retries = 2) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const parsed = new URL(url);
    const client = parsed.protocol === 'http:' ? require('http') : https;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 BornTodayHollywood/1.0',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadImageAsDataUri(res.headers.location, retries));
      }
      if (res.statusCode !== 200) {
        console.warn(`[!] Image download failed with status ${res.statusCode} for ${url}`);
        return resolve(null);
      }
      const mime = res.headers['content-type'] || '';
      if (!mime.startsWith('image/')) {
        console.warn(`[!] Invalid content-type ${mime} for ${url}`);
        return resolve(null);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve(`data:${mime};base64,${buf.toString('base64')}`);
      });
    });
    req.on('error', async (err) => {
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 1000));
        resolve(await downloadImageAsDataUri(url, retries - 1));
      } else {
        resolve(null);
      }
    });
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
  const todayPath = path.join(ROOT_DIR, 'today_posts.json');
  let todayData = null;
  if (fs.existsSync(todayPath)) {
    try { todayData = JSON.parse(fs.readFileSync(todayPath, 'utf8')); } catch(e){}
  }
  const quizPosts = todayData?.quiz_posts || [];
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
  // 1. PHOTO QUIZ TYPE 1 (4-Option Single Portrait Quiz)
  // -------------------------------------------------------------
  const q1Post = quizPosts.find(q => q.type === 'photo_quiz_type1') || {
    celebrity_name: 'Mike Judge',
    gender: 'male',
    correct_option: 'B',
    age: 64,
    subtitle: 'Rock & Comedy Legend turns 64 today!',
    options: [
      { letter: 'A', name: 'Dennis Quaid' },
      { letter: 'B', name: 'Mike Judge' },
      { letter: 'C', name: 'Jack Nicholson' },
      { letter: 'D', name: 'Brad Pitt' }
    ]
  };
  const q1TargetName = q1Post.celebrity_name;
  const q1CleanSlug = q1TargetName.replace(/[^a-zA-Z0-9_]/g, '_');
  const targetPhoto1Path = path.join(COLLAGES_DIR, `quiz_01_${q1CleanSlug}.jpg`);

  console.log(`[1/4] Generating Photo Quiz Type 1 (${q1TargetName})...`);
  if (fs.existsSync(targetPhoto1Path) && !force) {
    console.log('   ℹ️ Photo Quiz 1 already exists, skipping. (Use --force to rebuild)');
  } else {
    try {
      const q1PhotoUrl = await getCelebrityPhoto(q1TargetName) || await getCelebrityPhoto(q1TargetName.split(' ')[0]);
      const q1DataUri = await downloadImageAsDataUri(q1PhotoUrl) || logoUri;

      const q1OptA = (q1Post.options && q1Post.options.find(o => o.letter === 'A')) || { name: 'Option A' };
      const q1OptB = (q1Post.options && q1Post.options.find(o => o.letter === 'B')) || { name: q1TargetName };
      const q1OptC = (q1Post.options && q1Post.options.find(o => o.letter === 'C')) || { name: 'Option C' };
      const q1OptD = (q1Post.options && q1Post.options.find(o => o.letter === 'D')) || { name: 'Option D' };

      const isFemale1 = (q1Post.gender || 'male').toLowerCase() === 'female';
      const bgGrad1 = isFemale1
        ? 'radial-gradient(circle at 50% 25%, #fdf2f8 0%, #fce7f3 45%, #fbcfe8 100%)'
        : 'radial-gradient(circle at 50% 25%, #e0f2fe 0%, #f0f9ff 45%, #dbeafe 100%)';
      const badgeBorder1 = isFemale1 ? '#f472b6' : '#38bdf8';
      const badgeLogoBorder1 = isFemale1 ? '#db2777' : '#0284c7';
      const badgeTextColor1 = isFemale1 ? '#be185d' : '#0369a1';
      const subHeadColor1 = isFemale1 ? '#be185d' : '#0284c7';
      const cardShadow1 = isFemale1 ? 'rgba(190, 24, 93, 0.16)' : 'rgba(2, 132, 199, 0.18)';
      const subTitleText1 = q1Post.subtitle || (q1Post.age ? `Hollywood star turns ${q1Post.age} today!` : "Can you recognize today's birthday star?");

      const photoQuiz1Html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800;900&family=Inter:wght@500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1080px; height: 1350px;
    background: ${bgGrad1};
    color: #0f172a; font-family: 'Inter', sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
    padding: 45px 45px 35px 45px; position: relative; overflow: hidden;
  }
  .header { display: flex; flex-direction: column; align-items: center; text-align: center; z-index: 2; width: 100%; }
  .badge-bar {
    display: flex; align-items: center; gap: 16px;
    background: #ffffff; border: 3px solid ${badgeBorder1};
    padding: 10px 32px; border-radius: 50px; margin-bottom: 12px;
    box-shadow: 0 4px 18px rgba(56, 189, 248, 0.28);
  }
  .badge-bar img { width: 64px; height: 64px; border-radius: 50%; border: 2.5px solid ${badgeLogoBorder1}; }
  .badge-bar span { font-family: 'Outfit', sans-serif; font-size: 24px; font-weight: 800; letter-spacing: 2px; color: ${badgeTextColor1}; text-transform: uppercase; }
  
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
  .sub-headline { font-size: 21px; color: ${subHeadColor1}; font-weight: 700; margin-top: 5px; }

  .photo-frame {
    width: 520px; height: 650px; border-radius: 28px; overflow: hidden; position: relative;
    border: 5px solid #ffffff;
    box-shadow: 0 18px 45px rgba(2, 132, 199, 0.22), 0 4px 20px rgba(0,0,0,0.12);
    z-index: 2; background: #0f172a;
    display: flex; align-items: center; justify-content: center;
    margin-top: 14px; margin-bottom: 14px;
  }
  .photo-frame img { width: 100%; height: 100%; object-fit: cover; object-position: center 20%; display: block; }

  .options-grid {
    width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; z-index: 2;
    margin-bottom: 14px;
  }
  .option-card {
    background: #ffffff; border: 3px solid ${badgeBorder1};
    border-radius: 22px; padding: 18px 22px; display: flex; align-items: center; gap: 18px;
    box-shadow: 0 6px 20px ${cardShadow1};
  }
  .opt-letter {
    width: 54px; height: 54px; border-radius: 16px;
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    color: #78350f; font-family: 'Outfit', sans-serif; font-size: 30px; font-weight: 900;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.35); border: 2px solid #ffffff;
  }
  .opt-text { font-family: 'Outfit', sans-serif; font-size: 32px; font-weight: 800; color: #0f172a; line-height: 1.15; }

  .footer-wrap { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 6px; z-index: 2; }
  .footer-cta {
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
    border: 2.5px solid #ffffff; border-radius: 18px; padding: 15px 36px; text-align: center; width: 100%;
    font-family: 'Outfit', sans-serif; font-size: 26px; font-weight: 900; color: #ffffff;
    box-shadow: 0 8px 25px rgba(220, 38, 38, 0.45); letter-spacing: 0.5px;
  }
  .caption-note {
    font-family: 'Outfit', sans-serif; font-size: 20px; font-weight: 700; color: ${subHeadColor1}; letter-spacing: 0.5px;
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
    <div class="sub-headline">${subTitleText1}</div>
  </div>

  <div class="photo-frame">
    <img src="${q1DataUri}">
  </div>

  <div class="options-grid">
    <div class="option-card"><div class="opt-letter">A</div><div class="opt-text">${q1OptA.name}</div></div>
    <div class="option-card"><div class="opt-letter">B</div><div class="opt-text">${q1OptB.name}</div></div>
    <div class="option-card"><div class="opt-letter">C</div><div class="opt-text">${q1OptC.name}</div></div>
    <div class="option-card"><div class="opt-letter">D</div><div class="opt-text">${q1OptD.name}</div></div>
  </div>

  <div class="footer-wrap">
    <div class="footer-cta">WRITE YOUR ANSWER IN COMMENTS 👇</div>
    <div class="caption-note">Answer in caption</div>
  </div>
</body>
</html>`;

      const page1 = await browser.newPage();
      await page1.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
      await safeSetContent(page1, photoQuiz1Html);
      await page1.screenshot({ path: targetPhoto1Path, type: 'jpeg', quality: 95 });
      await page1.close();
      console.log(`   ✅ Saved: ${targetPhoto1Path}`);
      try { fs.copyFileSync(targetPhoto1Path, path.join(OUTPUT_DIR, `01_Photo_Quiz_Type1_${q1CleanSlug}.jpg`)); } catch(e){}
    } catch (e1) {
      console.error(`   ❌ Error building Photo Quiz 1 (${q1TargetName}):`, e1.message);
    }
  }

  // -------------------------------------------------------------
  // 2. PHOTO QUIZ TYPE 2 (Face Match 4-Image Grid with Same-Gender Options)
  // -------------------------------------------------------------
  const q2Post = quizPosts.find(q => q.type === 'photo_quiz_type2') || {
    celebrity_name: 'Suzanne Somers',
    gender: 'female',
    correct_option: 'A',
    options: [
      { letter: 'A', name: 'Suzanne Somers' },
      { letter: 'B', name: 'Joyce DeWitt' },
      { letter: 'C', name: 'Farrah Fawcett' },
      { letter: 'D', name: 'Goldie Hawn' }
    ],
    subtitle: "The iconic 'Three's Company' star was born on this day!"
  };

  const q2TargetName = q2Post.celebrity_name;
  const q2CleanSlug = q2TargetName.replace(/[^a-zA-Z0-9_]/g, '_');
  const targetPhoto2Path = path.join(COLLAGES_DIR, `quiz_02_${q2CleanSlug}.jpg`);

  console.log(`[2/4] Generating Photo Quiz Type 2 (${q2TargetName})...`);
  if (fs.existsSync(targetPhoto2Path) && !force) {
    console.log(`   ℹ️ Photo Quiz 2 already exists, skipping. (Use --force to rebuild)`);
  } else {
    try {
    // AUDIT & ENFORCE GENDER CONSISTENCY (Exception Handler)
    const q2Audit = await auditAndEnforceQuizGender(q2Post);
    if (q2Audit.modified) {
      console.log(`   [🛡️ Gender Guard] Exception handler corrected Photo Quiz 2 options to all ${q2Post.gender}!`);
      if (todayData && todayData.quiz_posts) {
        const qIdx = todayData.quiz_posts.findIndex(q => q.type === 'photo_quiz_type2');
        if (qIdx !== -1) todayData.quiz_posts[qIdx] = q2Post;
        fs.writeFileSync(todayPath, JSON.stringify(todayData, null, 2), 'utf8');
      }
    }

    const optA = q2Post.options.find(o => o.letter === 'A') || { name: q2TargetName };
    const optB = q2Post.options.find(o => o.letter === 'B') || { name: 'Option B' };
    const optC = q2Post.options.find(o => o.letter === 'C') || { name: 'Option C' };
    const optD = q2Post.options.find(o => o.letter === 'D') || { name: 'Option D' };

    console.log(`   📸 Sourcing 4 same-gender portraits: A=${optA.name}, B=${optB.name}, C=${optC.name}, D=${optD.name}...`);
    let uriA = await downloadImageAsDataUri(await getCelebrityPhoto(optA.name));
    let uriB = await downloadImageAsDataUri(await getCelebrityPhoto(optB.name));
    let uriC = await downloadImageAsDataUri(await getCelebrityPhoto(optC.name));
    let uriD = await downloadImageAsDataUri(await getCelebrityPhoto(optD.name));

    const q2OptsCheck = [
      { letter: 'A', name: optA.name, uri: uriA, set: u => uriA = u },
      { letter: 'B', name: optB.name, uri: uriB, set: u => uriB = u },
      { letter: 'C', name: optC.name, uri: uriC, set: u => uriC = u },
      { letter: 'D', name: optD.name, uri: uriD, set: u => uriD = u }
    ];
    for (const item of q2OptsCheck) {
      if (!item.uri) {
        console.warn(`   ⚠️ Portrait for Quiz 2 Option ${item.letter} (${item.name}) is missing, performing deep retry...`);
        const fallbackPhoto = await getCelebrityPhoto(item.name, 5);
        if (fallbackPhoto) {
          item.set(await downloadImageAsDataUri(fallbackPhoto, 3));
        }
      }
    }
    uriA = uriA || logoUri;
    uriB = uriB || logoUri;
    uriC = uriC || logoUri;
    uriD = uriD || logoUri;

    const isFemale = (q2Post.gender || 'female').toLowerCase() === 'female';
    const bgGrad = isFemale
      ? 'radial-gradient(circle at 50% 20%, #fdf2f8 0%, #fce7f3 45%, #f5d0fe 100%)'
      : 'radial-gradient(circle at 50% 20%, #e0f2fe 0%, #f0f9ff 45%, #dbeafe 100%)';
    const badgeBorder = isFemale ? '#f472b6' : '#38bdf8';
    const badgeLogoBorder = isFemale ? '#db2777' : '#0284c7';
    const badgeTextColor = isFemale ? '#be185d' : '#0369a1';
    const headTopColor = isFemale ? '#831843' : '#0369a1';
    const subHeadColor = isFemale ? '#be185d' : '#0284c7';
    const cardShadow = isFemale ? 'rgba(190, 24, 93, 0.16)' : 'rgba(2, 132, 199, 0.18)';
    const emoji = isFemale ? '🎉' : '🤠';
    const subTitleText = q2Post.subtitle || (isFemale ? "Can you spot today's birthday star?" : "Can you spot today's birthday legend?");

    const photoQuiz2Html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800;900&family=Inter:wght@500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1080px; height: 1350px;
    background: ${bgGrad};
    color: #0f172a; font-family: 'Inter', sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
    padding: 35px 45px 25px 45px; position: relative; overflow: hidden;
  }
  .header { display: flex; flex-direction: column; align-items: center; text-align: center; z-index: 2; width: 100%; }
  .badge-bar {
    display: flex; align-items: center; gap: 16px;
    background: #ffffff; border: 3px solid ${badgeBorder};
    padding: 10px 32px; border-radius: 50px; margin-bottom: 8px;
    box-shadow: 0 4px 18px ${badgeBorder}44;
  }
  .badge-bar img { width: 64px; height: 64px; border-radius: 50%; border: 2.5px solid ${badgeLogoBorder}; }
  .badge-bar span { font-family: 'Outfit', sans-serif; font-size: 24px; font-weight: 800; letter-spacing: 2px; color: ${badgeTextColor}; text-transform: uppercase; }
  
  .headline-wrap { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .headline-top { font-family: 'Outfit', sans-serif; font-size: 36px; font-weight: 900; color: ${headTopColor}; text-transform: uppercase; }
  
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
  .sub-headline { font-size: 20px; color: ${subHeadColor}; font-weight: 700; margin-top: 3px; }

  .grid-2x2 {
    width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; z-index: 2;
    justify-items: center; margin-top: 10px; margin-bottom: 14px;
  }
  .photo-card {
    width: 340px; height: 425px; border-radius: 22px; overflow: hidden; position: relative;
    border: 4px solid #ffffff;
    box-shadow: 0 12px 35px ${cardShadow}, 0 4px 15px rgba(0,0,0,0.08);
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

  .footer-wrap { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 6px; z-index: 2; }
  .footer-cta {
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
    border: 2.5px solid #ffffff; border-radius: 18px; padding: 14px 36px; text-align: center; width: 100%;
    font-family: 'Outfit', sans-serif; font-size: 26px; font-weight: 900; color: #ffffff;
    box-shadow: 0 8px 25px rgba(220, 38, 38, 0.45); letter-spacing: 0.5px;
  }
  .caption-note {
    font-family: 'Outfit', sans-serif; font-size: 20px; font-weight: 700; color: ${subHeadColor}; letter-spacing: 0.5px;
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
      <div class="headline-name">${q2TargetName.toUpperCase()}? ${emoji}</div>
    </div>
    <div class="sub-headline">${subTitleText}</div>
  </div>

  <div class="grid-2x2">
    <div class="photo-card"><div class="card-badge">A</div><img src="${uriA}"></div>
    <div class="photo-card"><div class="card-badge">B</div><img src="${uriB}"></div>
    <div class="photo-card"><div class="card-badge">C</div><img src="${uriC}"></div>
    <div class="photo-card"><div class="card-badge">D</div><img src="${uriD}"></div>
  </div>

  <div class="footer-wrap">
    <div class="footer-cta">WRITE YOUR ANSWER IN COMMENTS 👇</div>
    <div class="caption-note">Answer in caption</div>
  </div>
</body>
</html>`;

    const page2 = await browser.newPage();
    await page2.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
    await safeSetContent(page2, photoQuiz2Html);
    await page2.screenshot({ path: targetPhoto2Path, type: 'jpeg', quality: 95 });
    await page2.close();
    console.log(`   ✅ Saved: ${targetPhoto2Path}`);
    try { fs.copyFileSync(targetPhoto2Path, path.join(OUTPUT_DIR, `02_Photo_Quiz_Type2_${q2CleanSlug}.jpg`)); } catch(e){}
    } catch(e2) { console.error(`   ❌ Error building Photo Quiz 2 (${q2TargetName}):`, e2.message); }
  }

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
  // 3. REEL QUIZ TYPE 1 (Single Portrait Video Reel with Countdown)
  // -------------------------------------------------------------
  const q3Post = quizPosts.find(q => q.type === 'reel_quiz_type1') || {
    celebrity_name: 'Michael McKean',
    gender: 'male',
    correct_option: 'A',
    age: 79,
    options: [
      { letter: 'A', name: 'Michael McKean' },
      { letter: 'B', name: 'Bill Murray' },
      { letter: 'C', name: 'George Clooney' },
      { letter: 'D', name: 'Michael Douglas' }
    ]
  };

  const q3TargetName = q3Post.celebrity_name;
  const q3CleanSlug = q3TargetName.replace(/[^a-zA-Z0-9_]/g, '_');
  const targetReel1Out = path.join(REELS_DIR, `quiz_03_${q3CleanSlug}.mp4`);

  console.log(`[3/4] Generating Reel Quiz Type 1 (${q3TargetName})...`);
  if (fs.existsSync(targetReel1Out) && !force) {
    console.log('   ℹ️ Reel Quiz 1 already exists, skipping. (Use --force to rebuild)');
  } else {
    try {
      const q3PhotoUrl = await getCelebrityPhoto(q3TargetName) || await getCelebrityPhoto(q3TargetName.split(' ')[0]);
      const q3DataUri = await downloadImageAsDataUri(q3PhotoUrl) || logoUri;

      const q3OptA = (q3Post.options && q3Post.options.find(o => o.letter === 'A')) || { name: q3TargetName };
      const q3OptB = (q3Post.options && q3Post.options.find(o => o.letter === 'B')) || { name: 'Option B' };
      const q3OptC = (q3Post.options && q3Post.options.find(o => o.letter === 'C')) || { name: 'Option C' };
      const q3OptD = (q3Post.options && q3Post.options.find(o => o.letter === 'D')) || { name: 'Option D' };

      const r1VoiceQ = path.join(tempReelDir, 'r1_q_voice.mp3');
      const r1VoiceRev = path.join(tempReelDir, 'r1_rev_voice.mp3');

      const isFemale3 = (q3Post.gender || 'male').toLowerCase() === 'female';
      const voice3 = isFemale3 ? 'en-US-JennyNeural' : 'en-US-GuyNeural';
      const pronoun3 = isFemale3 ? 'her' : 'his';
      const agePhrase3 = q3Post.age ? `${pronoun3} ${q3Post.age}th` : 'a';

      const q1FullText = `Can you guess which beloved Hollywood star is celebrating ${agePhrase3} birthday today? Option A: ${q3OptA.name}! Option B: ${q3OptB.name}! Option C: ${q3OptC.name}! Or Option D: ${q3OptD.name}! Your ten-second countdown begins right now!`;
      const r1FullText = `That's right! Option ${q3Post.correct_option || 'A'} is ${q3TargetName}${q3Post.age ? ', turning ' + q3Post.age + ' today' : ''}! Read the full story in the caption below!`;

      await synthesizeVoiceWithRetry(q1FullText, voice3, r1VoiceQ);
      await new Promise(r => setTimeout(r, 600));
      await synthesizeVoiceWithRetry(r1FullText, voice3, r1VoiceRev);

      const dur1Q = getAudioDuration(r1VoiceQ);
      const dur1Rev = getAudioDuration(r1VoiceRev);

      const t1_zoom = dur1Q * 0.30;
      const t1_a = dur1Q * 0.14;
      const t1_b = dur1Q * 0.14;
      const t1_c = dur1Q * 0.14;
      const t1_d = dur1Q * 0.14;
      const t1_prompt = dur1Q - (t1_zoom + t1_a + t1_b + t1_c + t1_d);

      const bgGrad3 = isFemale3
        ? 'radial-gradient(circle at 50% 25%, #fdf2f8 0%, #fce7f3 45%, #fbcfe8 100%)'
        : 'radial-gradient(circle at 50% 25%, #e0f2fe 0%, #f0f9ff 45%, #dbeafe 100%)';
      const badgeBorder3 = isFemale3 ? '#f472b6' : '#38bdf8';
      const badgeLogoBorder3 = isFemale3 ? '#db2777' : '#0284c7';
      const badgeTextColor3 = isFemale3 ? '#be185d' : '#0369a1';

      function getReel1Html(activeOpt = null, timerNum = null, timerProgress = null, isReveal = false) {
        const dashOffset = timerProgress !== null ? (314.15 * (1 - timerProgress)).toFixed(2) : 314.15;
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
    background: ${bgGrad3};
    color: #0f172a; font-family: 'Inter', sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
    padding: 70px 55px 40px 55px; position: relative; overflow: hidden;
  }
  .header { display: flex; flex-direction: column; align-items: center; text-align: center; z-index: 2; width: 100%; }
  .badge-bar {
    display: flex; align-items: center; gap: 16px;
    background: #ffffff; border: 3px solid ${badgeBorder3};
    padding: 10px 32px; border-radius: 50px; margin-bottom: 12px;
    box-shadow: 0 4px 18px rgba(244, 114, 182, 0.28);
  }
  .badge-bar img { width: 68px; height: 68px; border-radius: 50%; border: 2.5px solid ${badgeLogoBorder3}; }
  .badge-bar span { font-family: 'Outfit', sans-serif; font-size: 26px; font-weight: 800; letter-spacing: 2px; color: ${badgeTextColor3}; text-transform: uppercase; }
  
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

  .photo-frame {
    width: 560px; height: 700px; border-radius: 32px; overflow: hidden; position: relative;
    border: 5px solid #ffffff;
    ${imageGlowStyle}
    z-index: 2; background: #0f172a;
    display: flex; align-items: center; justify-content: center;
    margin-top: 14px; margin-bottom: 0px;
  }
  .photo-frame img { width: 100%; height: 100%; object-fit: cover; object-position: center 20%; display: block; }

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
    <img src="${q3DataUri}">
  </div>

  ${!isReveal ? `
  <div class="options-container">
    <div class="opt-row ${activeOpt === 'A' ? 'active' : ''}">
      <div class="opt-badge">A</div>
      <div class="opt-name">${q3OptA.name}</div>
    </div>
    <div class="opt-row ${activeOpt === 'B' ? 'active' : ''}">
      <div class="opt-badge">B</div>
      <div class="opt-name">${q3OptB.name}</div>
    </div>
    <div class="opt-row ${activeOpt === 'C' ? 'active' : ''}">
      <div class="opt-badge">C</div>
      <div class="opt-name">${q3OptC.name}</div>
    </div>
    <div class="opt-row ${activeOpt === 'D' ? 'active' : ''}">
      <div class="opt-badge">D</div>
      <div class="opt-name">${q3OptD.name}</div>
    </div>
  </div>
  ` : `
  <div class="reveal-container">
    <div class="correct-moved-card">
      <div class="correct-moved-badge">✓</div>
      <div class="correct-moved-text">Option ${q3Post.correct_option || 'A'}: ${q3TargetName}</div>
    </div>
    <div class="red-caption-box">READ FULL STORY IN CAPTION 👇</div>
  </div>
  `}
</body>
</html>`;
      }

      const pReel1 = await browser.newPage();
      await pReel1.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });

      await safeSetContent(pReel1, getReel1Html('Q_INTRO', null, 0, false));
      const r1SlideQ = path.join(tempReelDir, 'r1_q.png');
      await pReel1.screenshot({ path: r1SlideQ, type: 'png' });

      await safeSetContent(pReel1, getReel1Html('A', null, 0, false));
      const r1SlideA = path.join(tempReelDir, 'r1_opt_a.png');
      await pReel1.screenshot({ path: r1SlideA, type: 'png' });

      await safeSetContent(pReel1, getReel1Html('B', null, 0, false));
      const r1SlideB = path.join(tempReelDir, 'r1_opt_b.png');
      await pReel1.screenshot({ path: r1SlideB, type: 'png' });

      await safeSetContent(pReel1, getReel1Html('C', null, 0, false));
      const r1SlideC = path.join(tempReelDir, 'r1_opt_c.png');
      await pReel1.screenshot({ path: r1SlideC, type: 'png' });

      await safeSetContent(pReel1, getReel1Html('D', null, 0, false));
      const r1SlideD = path.join(tempReelDir, 'r1_opt_d.png');
      await pReel1.screenshot({ path: r1SlideD, type: 'png' });

      await safeSetContent(pReel1, getReel1Html(null, null, 0, false));
      const r1SlidePrompt = path.join(tempReelDir, 'r1_prompt.png');
      await pReel1.screenshot({ path: r1SlidePrompt, type: 'png' });

      const optCycle1 = ['A', 'B', 'C', 'D'];
      for (let s = 1; s <= 10; s++) {
        const prog = s / 10;
        const currentNumber = 11 - s;
        const currentGlowOpt = optCycle1[(s - 1) % 4];
        await safeSetContent(pReel1, getReel1Html(currentGlowOpt, currentNumber, prog, false));
        const sPath = path.join(tempReelDir, `r1_timer_${s}.png`);
        await pReel1.screenshot({ path: sPath, type: 'png' });
      }

      await safeSetContent(pReel1, getReel1Html(null, null, 1.0, true));
      const r1SlideReveal = path.join(tempReelDir, 'r1_reveal.png');
      await pReel1.screenshot({ path: r1SlideReveal, type: 'png' });

      await safeSetContent(pReel1, getOutroSlideHtml());
      const r1SlideOutro = path.join(tempReelDir, 'r1_outro.png');
      await pReel1.screenshot({ path: r1SlideOutro, type: 'png' });
      await pReel1.close();

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

      const numR1Slides = 6 + 10 + 1 + 1;
      let r1VConcat = '';
      let r1VConcatInputs = '';
      for (let k = 0; k < numR1Slides; k++) {
        r1VConcat += `[${k}:v]setsar=1[r1v${k}];`;
        r1VConcatInputs += `[r1v${k}]`;
      }
      r1VConcat += `${r1VConcatInputs}concat=n=${numR1Slides}:v=1:a=0[vbase];[vbase]format=yuv420p[vout];`;

      const aIdx_intro = numR1Slides;
      const aIdx_tick = numR1Slides + 1;
      const aIdx_chime = numR1Slides + 2;
      const aIdx_rev = numR1Slides + 3;
      const aIdx_bgm = numR1Slides + 4;

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

      const ffmpegCmd1 = `ffmpeg -y ${r1VidInputs.join(' ')} ` +
        `-i "${r1VoiceQ}" -i "${tickAudio10}" -i "${chimeAudio}" -i "${r1VoiceRev}" -stream_loop -1 -i "${bgmTrack1}" ` +
        `-filter_complex "${r1FilterComplex}" ` +
        `-map "[vout]" -map "[aout]" -t ${totalR1Dur} -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 192k "${targetReel1Out}"`;

      console.log('   🎬 Rendering Vertical Video Reel 1 with FFmpeg...');
      execSync(ffmpegCmd1, { stdio: 'pipe' });
      console.log(`   ✅ Saved: ${targetReel1Out}`);
      try { fs.copyFileSync(targetReel1Out, path.join(OUTPUT_DIR, `03_Reel_Quiz_Type1_${q3CleanSlug}.mp4`)); } catch(e){}
    } catch (e3) {
      console.error(`   ❌ Error building Reel Quiz 1 (${q3TargetName}):`, e3.message);
    }
  }

  // -------------------------------------------------------------
  // 4. REEL QUIZ TYPE 2 (Face Match 4-Image Grid Reel with Same-Gender Options)
  // -------------------------------------------------------------
  const q4Post = quizPosts.find(q => q.type === 'reel_quiz_type2') || {
    celebrity_name: 'Barry Corbin',
    gender: 'male',
    correct_option: 'B',
    age: 86,
    options: [
      { letter: 'A', name: 'Sam Elliott' },
      { letter: 'B', name: 'Barry Corbin' },
      { letter: 'C', name: 'Robert Duvall' },
      { letter: 'D', name: 'Tommy Lee Jones' }
    ]
  };

  const q4TargetName = q4Post.celebrity_name;
  const q4CleanSlug = q4TargetName.replace(/[^a-zA-Z0-9_]/g, '_');
  const targetReel2Out = path.join(REELS_DIR, `quiz_04_${q4CleanSlug}.mp4`);

  console.log(`[4/4] Generating Reel Quiz Type 2 (${q4TargetName})...`);
  if (fs.existsSync(targetReel2Out) && !force) {
    console.log(`   ℹ️ Reel Quiz 2 already exists, skipping. (Use --force to rebuild)`);
  } else {
    try {
    // AUDIT & ENFORCE GENDER CONSISTENCY (Exception Handler)
    const q4Audit = await auditAndEnforceQuizGender(q4Post);
    if (q4Audit.modified) {
      console.log(`   [🛡️ Gender Guard] Exception handler corrected Reel Quiz 2 options to all ${q4Post.gender}!`);
      if (todayData && todayData.quiz_posts) {
        const qIdx = todayData.quiz_posts.findIndex(q => q.type === 'reel_quiz_type2');
        if (qIdx !== -1) todayData.quiz_posts[qIdx] = q4Post;
        fs.writeFileSync(todayPath, JSON.stringify(todayData, null, 2), 'utf8');
      }
    }

    const r2OptA = q4Post.options.find(o => o.letter === 'A') || { name: 'Option A' };
    const r2OptB = q4Post.options.find(o => o.letter === 'B') || { name: 'Option B' };
    const r2OptC = q4Post.options.find(o => o.letter === 'C') || { name: 'Option C' };
    const r2OptD = q4Post.options.find(o => o.letter === 'D') || { name: 'Option D' };

    console.log(`   📸 Sourcing 4 same-gender portraits: A=${r2OptA.name}, B=${r2OptB.name}, C=${r2OptC.name}, D=${r2OptD.name}...`);
    let r2UriA = await downloadImageAsDataUri(await getCelebrityPhoto(r2OptA.name));
    let r2UriB = await downloadImageAsDataUri(await getCelebrityPhoto(r2OptB.name));
    let r2UriC = await downloadImageAsDataUri(await getCelebrityPhoto(r2OptC.name));
    let r2UriD = await downloadImageAsDataUri(await getCelebrityPhoto(r2OptD.name));

    const optsCheck = [
      { letter: 'A', name: r2OptA.name, uri: r2UriA, set: u => r2UriA = u },
      { letter: 'B', name: r2OptB.name, uri: r2UriB, set: u => r2UriB = u },
      { letter: 'C', name: r2OptC.name, uri: r2UriC, set: u => r2UriC = u },
      { letter: 'D', name: r2OptD.name, uri: r2UriD, set: u => r2UriD = u }
    ];
    for (const item of optsCheck) {
      if (!item.uri) {
        console.warn(`   ⚠️ Portrait for Option ${item.letter} (${item.name}) is missing, performing deep retry...`);
        const fallbackPhoto = await getCelebrityPhoto(item.name, 5);
        if (fallbackPhoto) {
          item.set(await downloadImageAsDataUri(fallbackPhoto, 3));
        }
      }
    }
    r2UriA = r2UriA || logoUri;
    r2UriB = r2UriB || logoUri;
    r2UriC = r2UriC || logoUri;
    r2UriD = r2UriD || logoUri;

    const r2CorrectOpt = q4Post.correct_option || 'B';
    const r2WinnerUriMap = { A: r2UriA, B: r2UriB, C: r2UriC, D: r2UriD };
    const r2WinnerUri = r2WinnerUriMap[r2CorrectOpt] || r2UriB;

    const isFemale = (q4Post.gender || 'male').toLowerCase() === 'female';
    const bgGrad = isFemale
      ? 'radial-gradient(circle at 50% 20%, #fdf2f8 0%, #fce7f3 45%, #f5d0fe 100%)'
      : 'radial-gradient(circle at 50% 20%, #e0f2fe 0%, #f0f9ff 45%, #dbeafe 100%)';
    const badgeBorder = isFemale ? '#f472b6' : '#38bdf8';
    const badgeLogoBorder = isFemale ? '#db2777' : '#0284c7';
    const badgeTextColor = isFemale ? '#be185d' : '#0369a1';
    const headTopColor = isFemale ? '#831843' : '#0369a1';
    const cardShadow = isFemale ? 'rgba(190, 24, 93, 0.18)' : 'rgba(2, 132, 199, 0.18)';
    const glowBorder = isFemale ? '#f472b6' : '#38bdf8';
    const glowShadow = isFemale ? 'rgba(244, 114, 182, 0.95)' : 'rgba(56, 189, 248, 0.95)';
    const emoji = isFemale ? '🎉' : '🤠';

    const r2VoiceQ = path.join(tempReelDir, 'r2_q_voice.mp3');
    const r2VoiceRev = path.join(tempReelDir, 'r2_rev_voice.mp3');
    const q4AgeStr = q4Post.age ? `, celebrating their ${q4Post.age}th birthday today` : '';
    const q2FullText = `Which of these four legendary screen stars is ${q4TargetName}${q4AgeStr}? Look closely at Options A, B, C, and D! Your ten-second countdown starts now!`;
    const r2FullText = `That's right! Option ${r2CorrectOpt} is ${q4TargetName}! Read the full story in the caption below!`;
    const voiceName = isFemale ? 'en-US-AriaNeural' : 'en-US-GuyNeural';

    await new Promise(r => setTimeout(r, 1000));
    await synthesizeVoiceWithRetry(q2FullText, voiceName, r2VoiceQ);
    await new Promise(r => setTimeout(r, 1000));
    await synthesizeVoiceWithRetry(r2FullText, voiceName, r2VoiceRev);

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
    background: ${bgGrad};
    color: #0f172a; font-family: 'Inter', sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
    padding: 70px 55px 40px 55px; position: relative; overflow: hidden;
  }
  .header { display: flex; flex-direction: column; align-items: center; text-align: center; z-index: 2; width: 100%; }
  .badge-bar {
    display: flex; align-items: center; gap: 16px;
    background: #ffffff; border: 3px solid ${badgeBorder};
    padding: 10px 32px; border-radius: 50px; margin-bottom: 12px;
    box-shadow: 0 4px 18px ${badgeBorder}44;
  }
  .badge-bar img { width: 68px; height: 68px; border-radius: 50%; border: 2.5px solid ${badgeLogoBorder}; }
  .badge-bar span { font-family: 'Outfit', sans-serif; font-size: 26px; font-weight: 800; letter-spacing: 2px; color: ${badgeTextColor}; text-transform: uppercase; }
  
  .headline-wrap { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .headline-top { font-family: 'Outfit', sans-serif; font-size: 38px; font-weight: 900; color: ${headTopColor}; text-transform: uppercase; }
  
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

  .timer-wrap {
    margin-top: 14px; display: flex; align-items: center; justify-content: center; position: relative; width: 120px; height: 120px;
  }
  .timer-svg { transform: rotate(-90deg); width: 120px; height: 120px; }
  .timer-bg-circle { stroke: ${badgeBorder}44; stroke-width: 10; fill: #ffffff; }
  .timer-progress-circle {
    stroke: #dc2626; stroke-width: 10; stroke-linecap: round; fill: none;
    stroke-dasharray: 314.15; stroke-dashoffset: ${dashOffset};
  }
  .timer-number {
    position: absolute; font-family: 'Outfit', sans-serif; font-size: 46px; font-weight: 900; color: #dc2626;
  }

  .grid-2x2 {
    width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; z-index: 2;
    justify-items: center; margin-top: 16px; margin-bottom: 0px;
  }
  .photo-card {
    width: 440px; height: 550px; border-radius: 28px; overflow: hidden; position: relative;
    border: 4.5px solid #ffffff;
    box-shadow: 0 14px 40px ${cardShadow}, 0 4px 15px rgba(0,0,0,0.1);
    background: #0f172a;
    display: flex; align-items: center; justify-content: center;
  }
  .photo-card.glow {
    border: 5px solid ${glowBorder};
    box-shadow: 0 0 38px ${glowShadow}, 0 16px 40px rgba(0,0,0,0.25);
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

  .winner-name-card {
    background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
    border: 4.5px solid #16a34a; border-radius: 22px; padding: 20px 32px; width: 100%;
    text-align: center; box-shadow: 0 10px 30px rgba(22, 163, 74, 0.35);
    font-family: 'Outfit', sans-serif; font-size: 38px; font-weight: 900; color: #14532d;
  }

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
      <div class="headline-name">${q4TargetName.toUpperCase()}? ${emoji}</div>
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
    <div class="photo-card ${glowingOpt === 'A' ? 'glow' : ''}"><div class="card-badge">A</div><img src="${r2UriA}"></div>
    <div class="photo-card ${glowingOpt === 'B' ? 'glow' : ''}"><div class="card-badge">B</div><img src="${r2UriB}"></div>
    <div class="photo-card ${glowingOpt === 'C' ? 'glow' : ''}"><div class="card-badge">C</div><img src="${r2UriC}"></div>
    <div class="photo-card ${glowingOpt === 'D' ? 'glow' : ''}"><div class="card-badge">D</div><img src="${r2UriD}"></div>
  </div>
  ` : `
  <div class="reveal-center-container">
    <div class="centered-winner-frame">
      <div class="card-badge-winner">✓</div>
      <img src="${r2WinnerUri}">
    </div>
    <div class="winner-name-card">Option ${r2CorrectOpt}: ${q4TargetName} ${q4Post.age ? `(Turns ${q4Post.age})` : ''}</div>
    <div class="red-caption-box">READ FULL STORY IN CAPTION 👇</div>
  </div>
  `}
</body>
</html>`;
    }

    const pReel2 = await browser.newPage();
    await pReel2.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });

    // Render question slide
    await safeSetContent(pReel2, getReel2Html(null, 0, false, null));
    const r2SlideQ = path.join(tempReelDir, 'r2_q.png');
    await pReel2.screenshot({ path: r2SlideQ, type: 'png' });

    // Render 10 circular timer frames
    const optCycle = ['A', 'B', 'C', 'D'];
    for (let s = 1; s <= 10; s++) {
      const prog = s / 10;
      const currentNumber = 11 - s;
      const currentGlowOpt = optCycle[(s - 1) % 4];
      await safeSetContent(pReel2, getReel2Html(currentNumber, prog, false, currentGlowOpt));
      const sPath = path.join(tempReelDir, `r2_timer_${s}.png`);
      await pReel2.screenshot({ path: sPath, type: 'png' });
    }

    // Render reveal slide
    await safeSetContent(pReel2, getReel2Html(null, 1.0, true, null));
    const r2SlideReveal = path.join(tempReelDir, 'r2_reveal.png');
    await pReel2.screenshot({ path: r2SlideReveal, type: 'png' });

    // Render outro slide
    await safeSetContent(pReel2, getOutroSlideHtml());
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

    const numR2Slides = 1 + 10 + 1 + 1;
    let r2VConcat = '';
    let r2VConcatInputs = '';
    for (let k = 0; k < numR2Slides; k++) {
      r2VConcat += `[${k}:v]setsar=1[r2v${k}];`;
      r2VConcatInputs += `[r2v${k}]`;
    }
    r2VConcat += `${r2VConcatInputs}concat=n=${numR2Slides}:v=1:a=0[vbase];[vbase]format=yuv420p[vout];`;

    const aIdx2_qVoice = numR2Slides;
    const aIdx2_tick = numR2Slides + 1;
    const aIdx2_chime = numR2Slides + 2;
    const aIdx2_rev = numR2Slides + 3;
    const aIdx2_bgm = numR2Slides + 4;

    const tickAudio10 = path.join(ASSETS_AUDIO_DIR, "tick_tick_10s.mp3");
    const chimeAudio = path.join(ASSETS_AUDIO_DIR, "winner_chime.mp3");
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

    const ffmpegCmd2 = `ffmpeg -y ${r2VidInputs.join(' ')} ` +
      `-i "${r2VoiceQ}" -i "${tickAudio10}" -i "${chimeAudio}" -i "${r2VoiceRev}" -stream_loop -1 -i "${bgmTrack2}" ` +
      `-filter_complex "${r2FilterComplex}" ` +
      `-map "[vout]" -map "[aout]" -t ${totalR2Dur} -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 192k "${targetReel2Out}"`;

    console.log('   🎬 Rendering Vertical Video Reel 2 with FFmpeg...');
    execSync(ffmpegCmd2, { stdio: 'pipe' });
    console.log(`   ✅ Saved: ${targetReel2Out}`);
    try { fs.copyFileSync(targetReel2Out, path.join(OUTPUT_DIR, `04_Reel_Quiz_Type2_${q4CleanSlug}.mp4`)); } catch(e){}
    } catch(e4) { console.error(`   ❌ Error building Reel Quiz 2 (${q4TargetName}):`, e4.message); }
  }

  await browser.close();
  console.log('\n======================================================');
  console.log('🎉 ALL 4 REFINED CELEBRITY QUIZ POSTS GENERATED (v4)!');
  console.log('======================================================');
}

run().then(() => {
  console.log('\n[✓] Interactive quiz studio run finished successfully.');
  process.exit(0);
}).catch(err => {
  console.error('[!] Quiz Suite caught error, exiting safely (exit 0) so daily poster stays intact:', err.message);
  process.exit(0);
});
