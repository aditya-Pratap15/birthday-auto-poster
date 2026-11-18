/**
 * 🎬 BORN TODAY HOLLYWOOD - REEL STUDIO ENGINE (v2.3 Master Production)
 * ---------------------------------------------------------------------
 * Automated Vertical Video Generator for Facebook Reels / Instagram Reels (1080x1920)
 *
 * Polished Capabilities:
 *  1. Background Music: Pure solo acoustic piano ("Heartwarming" by Kevin MacLeod) at 25% (+7% boost).
 *  2. Voiceover: Boosted to 180% (volume=1.8) for loud, crystal-clear narration.
 *  3. Captions:
 *     - Smooth 180ms fade-in bloom (\fad(180,60))
 *     - Correct period on numbered lists (1. and 2.) cleanly grouped with sentence
 *     - Progressive 2-line flow (Line 2 appears below Line 1)
 *     - Golden bold highlight words (&H0024D8FF&, 72pt)
 *  4. Single Unified Outro Screen (2.80s):
 *     - Black backdrop
 *     - Smooth spring pop-up for circular luxury logo (0.25s entrance)
 *     - Smooth spring pop-up for Google Fonts CTA text below logo (0.70s entrance)
 *     - Both logo and text stay permanently visible together until the video ends.
 *  5. Exact timing: slideshow stops the instant narrator finishes speaking.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { execSync } = require('child_process');
const puppeteer = require('puppeteer');
const { EdgeTTS } = require('node-edge-tts');

// Project Paths
const ROOT_DIR = path.resolve(__dirname, '..');
const TODAY_POSTS_PATH = path.join(ROOT_DIR, 'today_posts.json');
const REELS_DIR = path.join(ROOT_DIR, 'reels');
const TEMP_DIR = path.join(ROOT_DIR, 'temp_reel_assets');
const MUSIC_DIR = path.join(ROOT_DIR, 'music');
const DEFAULT_BGM_PATH = path.join(ROOT_DIR, 'background_music.mp3');

// Helper to retrieve all available background music tracks from music/
function getAvailableMusicTracks() {
  if (!fs.existsSync(MUSIC_DIR)) {
    return fs.existsSync(DEFAULT_BGM_PATH) ? [DEFAULT_BGM_PATH] : [];
  }
  const tracks = [];
  function scan(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        scan(full);
      } else if (item.isFile() && item.name.toLowerCase().endsWith('.mp3')) {
        tracks.push(full);
      }
    }
  }
  scan(MUSIC_DIR);
  tracks.sort();
  if (tracks.length === 0 && fs.existsSync(DEFAULT_BGM_PATH)) {
    tracks.push(DEFAULT_BGM_PATH);
  }
  return tracks;
}

// Selects background music dynamically so each reel in a batch gets a different track,
// rotating daily across the library so all tracks get featured evenly.
function selectBgmForReel(reelIndex = 1) {
  const tracks = getAvailableMusicTracks();
  if (tracks.length === 0) return DEFAULT_BGM_PATH;
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));
  const trackIndex = (dayOfYear * 3 + (reelIndex - 1)) % tracks.length;
  return tracks[trackIndex];
}
const PAGE_LOGO_PATH = path.join(ROOT_DIR, 'page_logo.png');

if (!fs.existsSync(REELS_DIR)) fs.mkdirSync(REELS_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function downloadFile(url, destPath, retries = 2, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    try {
      url = url.replace('https://media.themoviedb.org/', 'https://image.tmdb.org/');
      url = url.replace('https://thumb.wikimedia.org/', 'https://upload.wikimedia.org/');
      const parsed = new URL(url);
      const client = parsed.protocol === 'http:' ? http : https;
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 BornTodayHollywoodBot/1.0',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      };

      const req = client.get(url, { headers, timeout: 15000 }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
          const redirectUrl = new URL(res.headers.location, url).toString();
          return resolve(downloadFile(redirectUrl, destPath, retries, maxRedirects - 1));
        }
        if (res.statusCode === 429 && retries > 0) {
          setTimeout(() => {
            resolve(downloadFile(url, destPath, retries - 1, maxRedirects));
          }, 1500);
          return;
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`));
        }
        const stream = fs.createWriteStream(destPath);
        res.pipe(stream);
        stream.on('finish', () => stream.close(resolve));
        stream.on('error', (err) => {
          try { fs.unlinkSync(destPath); } catch (e) {}
          reject(err);
        });
      });
      req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout downloading ${url}`)); });
      req.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

function cleanMarkdown(text) {
  if (!text) return '';
  return text.replace(/\*\*(.*?)\*\*/g, '$1')
             .replace(/&/g, ' and ')
             .replace(/[<>]/g, '')
             .replace(/__(.*?)__/g, '$1')
             .replace(/[#*_~`]/g, '')
             .replace(/\s+/g, ' ')
             .trim();
}

function getAudioDuration(filePath) {
  const cmd = `ffprobe -i "${filePath}" -show_entries format=duration -v quiet -of csv="p=0"`;
  const stdout = execSync(cmd).toString().trim();
  return parseFloat(stdout) || 20;
}

/**
 * Generate a luxury circular page logo with a radiant gold border
 */
async function ensureStyledLogo() {
  const styledLogoPath = path.join(TEMP_DIR, 'styled_logo.png');
  if (fs.existsSync(styledLogoPath)) {
    try { fs.unlinkSync(styledLogoPath); } catch (e) {}
  }

  if (!fs.existsSync(PAGE_LOGO_PATH)) {
    throw new Error(`Page logo not found at: ${PAGE_LOGO_PATH}`);
  }

  console.log(`    ⭐ Rendering luxury circular logo (enlarged)...`);
  const logoBase64 = fs.readFileSync(PAGE_LOGO_PATH).toString('base64');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 440, height: 440, deviceScaleFactor: 2 });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0;
          padding: 0;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 440px;
          height: 440px;
        }
        .logo-wrap {
          width: 360px;
          height: 360px;
          border-radius: 50%;
          border: 8px solid #d4af37;
          box-shadow: 0 0 55px rgba(212, 175, 55, 0.8), 0 0 22px rgba(255, 215, 0, 0.55);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0d0f14;
        }
        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
      </style>
    </head>
    <body>
      <div class="logo-wrap">
        <img src="data:image/png;base64,${logoBase64}" />
      </div>
    </body>
    </html>
  `;

  await page.setContent(html);
  await page.screenshot({ path: styledLogoPath, omitBackground: true });
  await browser.close();
  return styledLogoPath;
}

/**
 * Generate subtle, semi-transparent circular watermark logo for top-right corner branding
 */
async function ensureWatermarkLogo() {
  const watermarkPath = path.join(TEMP_DIR, 'watermark_logo.png');
  if (fs.existsSync(watermarkPath)) {
    return watermarkPath;
  }

  if (!fs.existsSync(PAGE_LOGO_PATH)) {
    return null;
  }

  console.log('    🎨 Rendering subtle top-right watermark logo (35% opacity)...');
  const logoBase64 = fs.readFileSync(PAGE_LOGO_PATH).toString('base64');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 240, height: 240, deviceScaleFactor: 2 });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0;
          padding: 0;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 240px;
          height: 240px;
        }
        .watermark-wrap {
          width: 180px;
          height: 180px;
          border-radius: 50%;
          border: 4px solid rgba(212, 175, 55, 0.7);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.45);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(13, 15, 20, 0.45);
          opacity: 0.35;
        }
        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
      </style>
    </head>
    <body>
      <div class="watermark-wrap">
        <img src="data:image/png;base64,${logoBase64}" />
      </div>
    </body>
    </html>
  `;

  await page.setContent(html);
  await page.screenshot({ path: watermarkPath, omitBackground: true });
  await browser.close();
  return watermarkPath;
}

/**
 * Robust gender detector:
 * 1. Checks post.gender explicitly from daily scheduler payload
 * 2. Falls back to pronoun & actor/actress heuristic if missing
 */
function detectGender(post) {
  if (post && post.gender && typeof post.gender === 'string') {
    const g = post.gender.trim().toLowerCase();
    if (g === 'female' || g === 'f' || g === 'woman') return 'female';
    if (g === 'male' || g === 'm' || g === 'man') return 'male';
  }

  const text = `${post.celebrity_name || ''} ${post.caption || ''} ${post.comment || ''}`.toLowerCase();
  const femaleMatches = (text.match(/\b(she|her|hers|actress|woman|female)\b/g) || []).length;
  const maleMatches = (text.match(/\b(he|him|his|actor|man|male)\b/g) || []).length;

  return femaleMatches > maleMatches ? 'female' : 'male';
}

/**
 * Synthesize voiceover using Studio Kokoro AI (with Whisper alignment & Edge-TTS fallback)
 */

async function generateVoiceover(rawText, gender, outputPath, maxRetries = 3) {
  const text = (rawText || '').replace(/&/g, ' and ').replace(/[<>]/g, '').trim();
  const isFemale = gender && gender.toLowerCase() === 'female';
  const kokoroVoice = isFemale ? 'af_bella' : 'am_adam';
  const edgeVoice = isFemale ? 'en-US-JennyNeural' : 'en-US-ChristopherNeural';
  const voiceLabel = `${kokoroVoice} (${isFemale ? 'Female' : 'Male'})`;

  // --- ENGINE 1: Studio Kokoro AI TTS (with Faster-Whisper millisecond alignment) ---
  const kokoroScript = path.join(__dirname, 'kokoro_tts_generator.py');
  if (fs.existsSync(kokoroScript)) {
    const tempTextPath = outputPath + '.txt';
    const subJsonPath = outputPath + '.json';
    fs.writeFileSync(tempTextPath, text, 'utf8');

    const localPy = 'C:\\Users\\prata\\.gemini\\antigravity\\brain\\1a698182-b192-4cc6-87cf-43b70f184e00\\scratch\\watermark_test\\.venv\\Scripts\\python.exe';
    const pyBin = process.env.PYTHON_BIN || (fs.existsSync(localPy) ? localPy : null);

    const kokoroCommands = [
      ...(pyBin ? [`"${pyBin}" "${kokoroScript}" "${tempTextPath}" "${kokoroVoice}" "${outputPath}" "${subJsonPath}"`] : []),
      `python3 "${kokoroScript}" "${tempTextPath}" "${kokoroVoice}" "${outputPath}" "${subJsonPath}"`,
      `python "${kokoroScript}" "${tempTextPath}" "${kokoroVoice}" "${outputPath}" "${subJsonPath}"`,
      `uv run --with kokoro --with faster-whisper --with soundfile --with numpy python "${kokoroScript}" "${tempTextPath}" "${kokoroVoice}" "${outputPath}" "${subJsonPath}"`
    ];

    for (const cmd of kokoroCommands) {
      try {
        console.log(`    🎙️ Synthesizing narration with Kokoro AI [${voiceLabel}] via [${cmd.split(' ')[0]}]...`);
        execSync(cmd, { stdio: 'pipe', timeout: 120000 });
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
          let boundaries = [];
          if (fs.existsSync(subJsonPath)) {
            try {
              boundaries = JSON.parse(fs.readFileSync(subJsonPath, 'utf8'));
              fs.unlinkSync(subJsonPath);
            } catch (e) {}
          }
          try { fs.unlinkSync(tempTextPath); } catch (e) {}
          const duration = getAudioDuration(outputPath);
          console.log(`    ✅ Studio Kokoro AI Voiceover created (${duration.toFixed(1)}s, ${boundaries.length} word boundaries)`);
          return { duration, boundaries };
        }
      } catch (e) {
        // Fall through to next command
      }
    }
    try { if (fs.existsSync(tempTextPath)) fs.unlinkSync(tempTextPath); } catch (e) {}
  }

  // --- ENGINE 2: Python Edge-TTS (Fallback with automatic DRM 403 refresh & word boundaries) ---
  const pyScript = path.join(__dirname, 'edge_tts_generator.py');
  if (fs.existsSync(pyScript)) {
    const tempTextPath = outputPath + '.txt';
    const subJsonPath = outputPath + '.json';
    fs.writeFileSync(tempTextPath, text, 'utf8');

    const pyCommands = [
      `python3 "${pyScript}" "${tempTextPath}" "${edgeVoice}" "${outputPath}" "${subJsonPath}"`,
      `python "${pyScript}" "${tempTextPath}" "${edgeVoice}" "${outputPath}" "${subJsonPath}"`,
      `uv run --with edge-tts python "${pyScript}" "${tempTextPath}" "${edgeVoice}" "${outputPath}" "${subJsonPath}"`
    ];

    for (const cmd of pyCommands) {
      try {
        console.log(`    🎙️ Synthesizing narration with ${edgeVoice} via Python Edge-TTS [${cmd.split(' ')[0]}]...`);
        execSync(cmd, { stdio: 'pipe', timeout: 60000 });
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
          let boundaries = [];
          if (fs.existsSync(subJsonPath)) {
            try {
              boundaries = JSON.parse(fs.readFileSync(subJsonPath, 'utf8'));
              fs.unlinkSync(subJsonPath);
            } catch (e) {}
          }
          try { fs.unlinkSync(tempTextPath); } catch (e) {}
          const duration = getAudioDuration(outputPath);
          console.log(`    ✅ Neural Voiceover created (${duration.toFixed(1)}s, ${boundaries.length} word boundaries) [Python Engine]`);
          return { duration, boundaries };
        }
      } catch (e) {
        // Fall through to next command
      }
    }
    try { if (fs.existsSync(tempTextPath)) fs.unlinkSync(tempTextPath); } catch (e) {}
  }

  // --- ENGINE 2: Native Node.js EdgeTTS (with generous 60s timeout and retries) ---
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`    🎙️ Synthesizing narration with ${voiceLabel} via Node Engine [Attempt ${attempt}/${maxRetries}]...`);
      const tts = new EdgeTTS({
        voice: voice,
        lang: 'en-US',
        outputFormat: 'audio-24khz-96kbitrate-mono-mp3',
        saveSubtitles: true,
        timeout: 60000
      });

      await tts.ttsPromise(text, outputPath);

      const subJsonPath = outputPath + '.json';
      let boundaries = [];
      if (fs.existsSync(subJsonPath)) {
        try {
          const cues = JSON.parse(fs.readFileSync(subJsonPath, 'utf8'));
          boundaries = cues.map(c => ({
            text: (c.part || '').trim(),
            start: c.start / 1000,
            end: c.end / 1000
          })).filter(b => b.text.length > 0);
          fs.unlinkSync(subJsonPath);
        } catch (e) {}
      }

      const duration = getAudioDuration(outputPath);
      console.log(`    ✅ Neural Voiceover created (${duration.toFixed(1)}s, ${boundaries.length} word boundaries) [Node Engine]`);
      return { duration, boundaries };
    } catch (err) {
      console.warn(`    [!] Node TTS Attempt ${attempt} failed: ${err.message}`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  throw new Error(`Failed to synthesize voiceover with ${voiceLabel} after all neural engines were exhausted.`);
}

function formatAssTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Build dynamic ASS subtitles:
 *  - Middle Center alignment (Alignment 5, Y=960)
 *  - Smooth 180ms fade-in bloom (\fad(180,60))
 *  - Correct dot on numbered lists (1. and 2.) cleanly grouped with sentence
 *  - Progressive 2-line layout
 *  - Animated spring pop-up outro text on single ending screen
 */
function createSubtitlesAss(boundaries, rawComment, fullNarration, voiceDuration, outroStartTime, totalDuration, assPath, hookText = '') {
  const events = [];

  // 5-Second Viral Hook Overlay (Meta Growth Guidance: keep full hook text on screen for 5.0s)
  if (hookText && hookText.trim().length > 0) {
    const cleanHook = hookText.replace(/\n+/g, ' ').replace(/["*]/g, '').trim();
    let displayHook = cleanHook;
    // Balance across 2 lines if longer than 34 chars to stay safely within 1080px without truncation
    if (cleanHook.length > 34 && !cleanHook.includes('\\N')) {
      const words = cleanHook.split(/\s+/);
      let l1 = [], l2 = [], curLen = 0;
      const targetMid = cleanHook.length / 2;
      for (const w of words) {
        if (curLen + w.length <= targetMid + 4 || l1.length === 0) {
          l1.push(w);
          curLen += w.length + 1;
        } else {
          l2.push(w);
        }
      }
      if (l2.length > 0) displayHook = `${l1.join(' ')}\\N${l2.join(' ')}`;
    }
    events.push(
      `Dialogue: 1,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\an8\\pos(540,240)\\fad(150,300)\\b1\\fsize44\\c&H0024D8FF&}⭐ DID YOU KNOW? ⭐\\N{\\b1\\fsize36\\c&H00FFFFFF&}${displayHook}`
    );
  }

  const boldRegex = /\*\*(.*?)\*\*/g;
  const boldWordsSet = new Set();
  let match;
  while ((match = boldRegex.exec(rawComment)) !== null) {
    match[1].toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean).forEach(w => boldWordsSet.add(w));
  }

  if (boundaries && boundaries.length > 5) {
    const words = boundaries.map(b => {
      let rawWord = b.text.trim();

      // Check if this word is a list number missing its period (e.g. '1' -> '1.')
      if (/^\d+$/.test(rawWord) && (rawComment.includes(rawWord + '.') || rawComment.includes(rawWord + '. '))) {
        rawWord = rawWord + '.';
      }

      const isListNum = /^\d+\.$/.test(rawWord);
      // Punctuation break points
      const isSentenceEnd = isListNum ? false : /[.!?…]+['"”’)*_~]*$/.test(rawWord);
      const isClauseEnd = /[,;:\-—]$/.test(rawWord);

      const cleanToken = rawWord.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isBold = boldWordsSet.has(cleanToken);
      // Keep font size constant (62pt) across all words to prevent line height jumping!
      const styled = isBold
        ? `{\\b1\\c&H0024D8FF&}${rawWord}{\\c&H00FFFFFF&}`
        : `{\\b1\\c&H00FFFFFF&}${rawWord}`;

      return {
        start: b.start !== undefined ? b.start : (b.offset || 0) / 10000000,
        end: b.end !== undefined ? b.end : ((b.offset || 0) + (b.duration || 0)) / 10000000,
        raw: rawWord,
        styled,
        isSentenceEnd,
        isClauseEnd,
        isListNum
      };
    });

    // Group words into clean single-appearance chunks (2-3 words each, or ending on punctuation)
    const chunks = [];
    let i = 0;
    while (i < words.length) {
      const chunk = [];
      while (i < words.length && chunk.length < 3) {
        if (chunk.length > 0 && words[i].isListNum) break;
        chunk.push(words[i]);
        const isEnd = words[i].isSentenceEnd || (chunk.length >= 2 && words[i].isClauseEnd);
        i++;
        if (isEnd) break;
      }
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
    }

    // Emit each chunk with a locked vertical baseline at Y=1060 (an2pos(540,1060))
    // Every single line sits on the EXACT same horizontal baseline, completely preventing vertical bouncing!
    for (let c = 0; c < chunks.length; c++) {
      const curChunk = chunks[c];
      const chunkStart = curChunk[0].start;
      const lastWord = curChunk[curChunk.length - 1];

      let chunkEnd;
      if (c + 1 < chunks.length) {
        const nextStart = chunks[c + 1][0].start;
        // If this chunk ends a sentence (full stop), clear screen with a natural pause before new sentence appears
        if (lastWord.isSentenceEnd) {
          chunkEnd = Math.min(nextStart - 0.06, lastWord.end + 0.18);
        } else if (nextStart - lastWord.end > 0.35) {
          chunkEnd = lastWord.end + 0.15;
        } else {
          chunkEnd = Math.max(lastWord.end + 0.05, nextStart - 0.02);
        }
      } else {
        chunkEnd = Math.min(voiceDuration + 0.1, lastWord.end + 0.3);
      }

      if (chunkEnd <= chunkStart) chunkEnd = chunkStart + 0.3;

      const chunkText = curChunk.map(w => w.styled).join(' ');
      // Locked at \an2\pos(540,1060) with smooth 90ms fade-in, 40ms fade-out
      events.push(`Dialogue: 0,${formatAssTime(chunkStart)},${formatAssTime(chunkEnd)},Default,,0,0,0,,{\\an2\\pos(540,1060)\\fad(90,40)}${chunkText}`);
    }
  } else {
    // Robust fallback: NEVER show 3-4 lines all at once. Break on full stop or max 3 words!
    const allWords = fullNarration.split(/\s+/).filter(Boolean);
    const wordDur = voiceDuration / Math.max(1, allWords.length);
    const fallbackChunks = [];
    let cur = [];
    for (const w of allWords) {
      cur.push(w);
      const isEnd = /[.!?…]+['"”’)*_~]*$/.test(w) || cur.length >= 3;
      if (isEnd) {
        fallbackChunks.push(cur);
        cur = [];
      }
    }
    if (cur.length > 0) fallbackChunks.push(cur);

    let runningTime = 0;
    fallbackChunks.forEach((grp) => {
      const start = runningTime;
      const dur = grp.length * wordDur;
      const end = Math.min(voiceDuration, start + dur);
      runningTime = end;
      const text = grp.join(' ');
      events.push(`Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,{\\an2\\pos(540,1060)\\fad(90,40)\\b1\\c&H00FFFFFF&}${text}`);
    });
  }

  // Single Outro Screen: Text pops up smoothly at 0.70s and stays until the end of video (POSITION: Y=1160)
  const outroTextStart = outroStartTime + 0.70;
  const outroTextEnd = totalDuration + 2.0;
  events.push(
    `Dialogue: 0,${formatAssTime(outroTextStart)},${formatAssTime(outroTextEnd)},Default,,0,0,0,,` +
    `{\\an5\\pos(540,1160)\\fscx0\\fscy0\\t(0,350,\\fscx100\\fscy100)\\fad(150,0)\\b1\\fsize58\\c&H0024D8FF&}Born Today Hollywood\\N\\N{\\b1\\fsize46\\c&H00FFFFFF&}Like & Follow for daily updates 🎬`
  );

  const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,62,&H00FFFFFF,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,5,2,2,70,70,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}
`;

  fs.writeFileSync(assPath, assContent, 'utf8');
}

// -------------------------------------------------------------
// Resolve Cutout and Character Role for Cameo Slide
// -------------------------------------------------------------
function resolveCutoutAndRole(post, safeName) {
  let cutoutPath = null;
  if (post.thematic_asset && post.thematic_asset.asset_cutout_path) {
    const direct = path.resolve(ROOT_DIR, post.thematic_asset.asset_cutout_path);
    if (fs.existsSync(direct)) cutoutPath = direct;
  }
  if (!cutoutPath) {
    const direct = path.join(ROOT_DIR, 'assets', 'thematic_assets', `${safeName}_character_cutout.png`);
    if (fs.existsSync(direct)) cutoutPath = direct;
  }
  if (!cutoutPath) {
    const themDir = path.join(ROOT_DIR, 'assets', 'thematic_assets');
    if (fs.existsSync(themDir)) {
      const files = fs.readdirSync(themDir);
      const nameFirst = safeName.split('_')[0].toLowerCase();
      const match = files.find(f => f.toLowerCase().includes(safeName.toLowerCase()) || f.toLowerCase().includes(nameFirst));
      if (match) cutoutPath = path.join(themDir, match);
    }
  }
  if (!cutoutPath) {
    const cutDir = path.join(ROOT_DIR, 'assets', 'cutouts');
    if (fs.existsSync(cutDir)) {
      const files = fs.readdirSync(cutDir);
      const nameFirst = safeName.split('_')[0].toLowerCase();
      const match = files.find(f => f.toLowerCase().includes(safeName.toLowerCase()) || f.toLowerCase().includes(nameFirst));
      if (match) cutoutPath = path.join(cutDir, match);
    }
  }

  let role = 'ICONIC ROLE';
  if (post.viral_teaser && post.viral_teaser.punchline_red) {
    const pr = post.viral_teaser.punchline_red;
    role = (Array.isArray(pr) ? pr.join(' ') : String(pr)).trim();
  } else if (post.teaserCard && post.teaserCard.punchline_red) {
    const pr = post.teaserCard.punchline_red;
    role = (Array.isArray(pr) ? pr.join(' ') : String(pr)).trim();
  } else if (post.thematic_asset && post.thematic_asset.drive_file_name) {
    const nameMatch = post.thematic_asset.drive_file_name.replace(/\.[^/.]+$/, '').split('_');
    const idx2 = nameMatch.indexOf('transparent');
    if (idx2 !== -1 && nameMatch.length > 5) {
      role = nameMatch.slice(4, -1).join(' ').toUpperCase();
    }
  }
  return { cutoutPath, role };
}

// -------------------------------------------------------------
// Iconic 3D Red Vector Arrow Generator (Arbitrary Angle & Target)
// -------------------------------------------------------------
function buildIconic3DArrowSVG(angleDeg = 0, scale = 1.0) {
  // Canonical arrow pointing RIGHT (0 deg) with razor-sharp tip at (0, 0)
  const L = 220 * scale;          // total shaft length
  const headLen = 95 * scale;     // head length along pointing axis
  const headHalfW = 60 * scale;   // head half width (total 120px)
  const shaftHalfW = 24 * scale;  // shaft half width (total 48px)
  const barbRetract = 22 * scale; // hooked back barb past notch

  // Exact 7-vertex canonical path (Tip at 0, 0)
  const pathD = `M 0 0 ` +
    `L ${(-headLen).toFixed(1)} ${(-headHalfW).toFixed(1)} ` +
    `L ${(-headLen + barbRetract).toFixed(1)} ${(-shaftHalfW).toFixed(1)} ` +
    `L ${(-L).toFixed(1)} ${(-shaftHalfW).toFixed(1)} ` +
    `L ${(-L).toFixed(1)} ${(shaftHalfW).toFixed(1)} ` +
    `L ${(-headLen + barbRetract).toFixed(1)} ${(shaftHalfW).toFixed(1)} ` +
    `L ${(-headLen).toFixed(1)} ${(headHalfW).toFixed(1)} ` +
    `Z`;

  const boxSize = 360;
  const cx = boxSize / 2;
  const cy = boxSize / 2;

  // 3D Extrusion slices (stacked offsets for physical solid 3D depth)
  const depthSteps = 8;
  const stepOffset = 1.6;
  const bevelLayers = [];
  for (let i = depthSteps; i >= 1; i--) {
    const ox = (i * stepOffset).toFixed(1);
    const oy = (i * stepOffset).toFixed(1);
    const shade = i === depthSteps ? '#0a0a0a' : (i > 4 ? '#181818' : '#300a0a');
    bevelLayers.push(`<path d="${pathD}" transform="translate(${ox}, ${oy})" fill="${shade}" stroke="#0a0a0a" stroke-width="2" stroke-linejoin="round" />`);
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${boxSize} ${boxSize}" width="${boxSize}" height="${boxSize}">
      <defs>
        <filter id="arrow-depth-shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="6" dy="14" stdDeviation="10" flood-color="rgba(0,0,0,0.65)" />
        </filter>
        <linearGradient id="arrow-face-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ff3344" />
          <stop offset="60%" stop-color="#e60000" />
          <stop offset="100%" stop-color="#b80000" />
        </linearGradient>
      </defs>
      <g filter="url(#arrow-depth-shadow)">
        <g transform="translate(${cx}, ${cy}) rotate(${angleDeg})">
          <!-- 3D Extruded Block Base -->
          ${bevelLayers.join('\n          ')}
          <!-- Crisp Red Face with Dark Border -->
          <path d="${pathD}" fill="url(#arrow-face-grad)" stroke="#1a0000" stroke-width="3" stroke-linejoin="miter" stroke-miterlimit="5" />
          <!-- Inner Top-Edge Rim Highlight for 3D Specular Sheen -->
          <path d="M ${(-L).toFixed(1)} ${(-shaftHalfW + 2).toFixed(1)} L ${(-headLen + barbRetract).toFixed(1)} ${(-shaftHalfW + 2).toFixed(1)} L ${(-headLen + 4).toFixed(1)} ${(-headHalfW + 3).toFixed(1)} L 0 0" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="2" stroke-linecap="round" />
        </g>
      </g>
    </svg>
  `;

  return { svg, boxSize, cx, cy, angleDeg };
}

// -------------------------------------------------------------
// Render 4 Luxury Milestone Slide Cards via Puppeteer
// -------------------------------------------------------------
async function renderSlideCards(photos, cutoutPath, characterRole, safeName) {
  console.log('    🎨 Rendering 4 high-end slide cards via Puppeteer...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });

  let cleanCutoutB64 = null;
  let renderedCutoutPath = null;
  let renderedArrowPath = null;
  let arrowAnimConfig = null;

  if (cutoutPath && fs.existsSync(cutoutPath)) {
    const rawB64 = fs.readFileSync(cutoutPath).toString('base64');
    cleanCutoutB64 = await page.evaluate(async (b64) => {
      return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const id = ctx.getImageData(0, 0, c.width, c.height);
          const d = id.data;
          for (let y = 0; y < c.height; y++) {
            for (let x = 0; x < c.width; x++) {
              const idx = (y * c.width + x) * 4;
              // 1. Clean trapped white studio background between legs
              if (y >= 680 && y <= 940 && x >= 360 && x <= 560) {
                if (d[idx + 3] > 0 && d[idx] > 215 && d[idx + 1] > 210 && d[idx + 2] > 205) {
                  d[idx + 3] = 0;
                }
              }
              // 2. Clean floor shadow (below shoe soles y > 950, and floor shadow patch right of foot x > 685)
              if (y > 950) {
                d[idx + 3] = 0;
              }
              if (y > 910 && x > 685) {
                d[idx + 3] = 0;
              }
              if (d[idx + 3] < 60) {
                d[idx + 3] = 0;
              }
            }
          }
          ctx.putImageData(id, 0, 0);
          let minX = c.width, minY = c.height, maxX = 0, maxY = 0, found = false;
          for (let y = 0; y < c.height; y++) {
            for (let x = 0; x < c.width; x++) {
              if (d[(y * c.width + x) * 4 + 3] > 15) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                found = true;
              }
            }
          }
          if (!found) return resolve(b64);
          const cropW = maxX - minX + 1;
          const cropH = maxY - minY + 1;
          const outCanvas = document.createElement('canvas');
          outCanvas.width = cropW;
          outCanvas.height = cropH;
          outCanvas.getContext('2d').drawImage(c, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
          resolve(outCanvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''));
        };
        img.src = 'data:image/png;base64,' + b64;
      });
    }, rawB64);

    // Render standalone enlarged transparent cutout overlay (580x840)
    await page.setViewport({ width: 580, height: 840 });
    const cutoutOverlayHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body, html { width: 580px; height: 840px; margin: 0; padding: 0; background: transparent; overflow: hidden; }
          .cutout-stroke {
            position: absolute;
            left: 15px; bottom: 15px;
            width: 550px; height: 810px;
            filter: url(#white-border-filter) drop-shadow(0 20px 35px rgba(0, 0, 0, 0.85));
          }
          .cutout-stroke img {
            width: 100%; height: 100%; object-fit: contain; object-position: left bottom; display: block;
          }
        </style>
      </head>
      <body>
        <svg width="0" height="0" style="position:absolute;">
          <filter id="white-border-filter" x="-20%" y="-20%" width="140%" height="140%">
            <feMorphology in="SourceAlpha" operator="dilate" radius="4" result="dilated"/>
            <feFlood flood-color="#ffffff" flood-opacity="1" result="white"/>
            <feComposite in="white" in2="dilated" operator="in" result="stroke"/>
            <feMerge>
              <feMergeNode in="stroke"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </svg>
        <div class="cutout-stroke">
          <img src="data:image/png;base64,${cleanCutoutB64}" />
        </div>
      </body>
      </html>
    `;
    await page.setContent(cutoutOverlayHtml);
    renderedCutoutPath = path.join(TEMP_DIR, `${safeName}_cameo_cutout_clean.png`);
    await page.screenshot({ path: renderedCutoutPath, omitBackground: true });

    // Render iconic, mathematically precise 3D Red Vector Arrow overlay
    // Target: Character cutout upper body in 1080x1920 space
    // Cutout sits at x: 25, y: 1010, size: 580x840 -> target torso/chest ~ (320, 1380)
    const tx = 320;
    const ty = 1380;
    // Arrow settles with tip at (550, 1260), strictly outside the cutout
    const ax = 550;
    const ay = 1260;
    const dx = tx - ax;
    const dy = ty - ay;
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI; // Dynamic angle towards target (~152.4 deg)

    const arrow = buildIconic3DArrowSVG(angleDeg, 1.05);
    await page.setViewport({ width: arrow.boxSize, height: arrow.boxSize });
    await page.setContent(`<!DOCTYPE html><html><body style="margin:0; background:transparent; overflow:hidden;">${arrow.svg}</body></html>`);
    renderedArrowPath = path.join(TEMP_DIR, `${safeName}_arrow_clean.png`);
    await page.screenshot({ path: renderedArrowPath, omitBackground: true });
    console.log(`    🎯 Iconic 3D Red Arrow generated: ${arrow.boxSize}x${arrow.boxSize} pointing at ${angleDeg.toFixed(1)}°`);

    // In FFmpeg overlay space, since tip is at (cx, cy) inside the image:
    // overlayX = Tip_X - cx, overlayY = Tip_Y - cy
    arrowAnimConfig = {
      x0: 760 - arrow.cx, y0: 1020 - arrow.cy,
      x1: 800 - arrow.cx, y1: 1200 - arrow.cy,
      x2: ax - arrow.cx,  y2: ay - arrow.cy,
      angleDeg,
      nudgeAmp: 20
    };
  }

  // Reset viewport to 1080x1920 for base slide cards
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  const photoB64s = photos.map(p => fs.readFileSync(p).toString('base64'));

  const slidePaths = [];

  for (let i = 0; i < 4; i++) {
    const photoB64 = photoB64s[i % photoB64s.length];
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body, html {
            width: 1080px;
            height: 1920px;
            overflow: hidden;
            background: #08080c;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          }

          /* Vibrant Ambient Blurred Background (Eliminates dark black void) */
          .bg-layer {
            position: absolute;
            top: -40px; left: -40px;
            width: 1160px; height: 2000px;
            background-image: url('data:image/jpeg;base64,${photoB64}');
            background-size: cover;
            background-position: center 25%;
            filter: blur(42px) brightness(0.70) saturate(1.35);
            transform: scale(1.10);
          }

          /* Smooth Subtle Vignette Overlay for Depth & Text Readability */
          .vignette-overlay {
            position: absolute;
            top: 0; left: 0;
            width: 1080px; height: 1920px;
            background: radial-gradient(circle at 50% 50%, rgba(0,0,0,0.06) 30%, rgba(0,0,0,0.50) 100%),
                        linear-gradient(180deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 75%, rgba(0,0,0,0.75) 100%);
          }

          /* Central Golden Card Frame with Ambient Glow */
          .card-container {
            position: absolute;
            top: 160px;
            left: 55px;
            width: 970px;
            height: 1440px;
            border-radius: 32px;
            border: 3.5px solid rgba(212, 175, 55, 0.90);
            box-shadow: 0 40px 90px rgba(0, 0, 0, 0.75), 0 0 50px rgba(212, 175, 55, 0.25), inset 0 0 40px rgba(0, 0, 0, 0.45);
            overflow: hidden;
            background: #111;
          }

          .card-photo {
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center 20%;
            display: block;
          }

          .card-sheen {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            border-radius: 28px;
            box-shadow: inset 0 0 30px rgba(212, 175, 55, 0.28);
            pointer-events: none;
          }
        </style>
      </head>
      <body>
        <!-- Background -->
        <div class="bg-layer"></div>
        <div class="vignette-overlay"></div>

        <!-- Central Card Frame -->
        <div class="card-container">
          <img class="card-photo" src="data:image/jpeg;base64,${photoB64}" />
          <div class="card-sheen"></div>
        </div>
      </body>
      </html>
    `;

    await page.setContent(html);
    const dest = path.join(TEMP_DIR, `${safeName}_slide_${i + 1}.png`);
    await page.screenshot({ path: dest });
    slidePaths.push(dest);
    console.log(`    📸 Slide ${i + 1} generated -> ${dest}`);
  }

  await browser.close();
  return { slidePaths, renderedCutoutPath, renderedArrowPath, arrowAnimConfig };
}

/**
 * Main Reel Builder: Generates the Full High-End Vertical Video Reel
 */
async function buildReel(post, index = 1) {
  const celebName = post.celebrity_name || `Celebrity_${index}`;
  const safeName = celebName.replace(/[^a-zA-Z0-9]/g, '_');
  console.log(`\n======================================================`);
  console.log(`🎬 CREATING VERTICAL REEL: ${celebName}`);
  console.log(`======================================================`);

  const rawComment = post.reel_script || post.comment || post.caption || '';
  const narration = cleanMarkdown(rawComment);

  const voicePath = path.join(TEMP_DIR, `${safeName}_voice.mp3`);
  const finalVideoPath = path.join(REELS_DIR, `${safeName}_Reel.mp4`);

  // 1. Ensure Styled Circular Logo & Watermark
  const styledLogoPath = await ensureStyledLogo();
  const watermarkLogoPath = await ensureWatermarkLogo();

  // 2. Synthesize Narration Voiceover with Smart Gender Detection
  const gender = detectGender(post);
  const { duration: voiceDuration, boundaries } = await generateVoiceover(narration, gender, voicePath);

  // 3. Exact Timing Synchronization:
  // Exactly 4 Slides for the 4 Celebrity Photos:
  const slideshowContentDuration = voiceDuration + 0.15;
  const numEraSlides = 4;
  const eraSlideDuration = slideshowContentDuration / numEraSlides;
  let framesPerSlide = Math.round(eraSlideDuration * 25);

  // Single Outro Screen (2.8s total):
  const OUTRO_DURATION = 2.80;
  const outroStartTime = slideshowContentDuration;
  const totalDuration = slideshowContentDuration + OUTRO_DURATION;

  console.log(`    ⏱️ Timing Sync:`);
  console.log(`       - 4 Milestone Slides x ${eraSlideDuration.toFixed(2)}s (${framesPerSlide} frames) = ${slideshowContentDuration.toFixed(2)}s`);
  console.log(`       - Slideshow Ends at: ${slideshowContentDuration.toFixed(2)}s (Narration: ${voiceDuration.toFixed(2)}s)`);
  console.log(`       - Outro Duration: ${OUTRO_DURATION.toFixed(2)}s`);
  console.log(`       - Total Reel Duration: ${totalDuration.toFixed(2)}s`);

  // 4. Subtitles (Locked vertical baseline at Y=1060)
  const localAssPath = path.join(TEMP_DIR, 'current_subs.ass');
  let hookCandidate = '';
  if (post.viral_teaser) {
    const vt = post.viral_teaser;
    const punch = vt.punchline_red || vt.redLines || [];
    const punchStr = (Array.isArray(punch) ? punch.join(' ') : String(punch || '')).trim();
    hookCandidate = `${vt.line1 || ''} ${vt.line2 || ''} ${punchStr}`.replace(/\s+/g, ' ').trim();
  } else if (post.teaserCard) {
    const tc = post.teaserCard;
    const punch = tc.punchline_red || tc.redLines || [];
    const punchStr = (Array.isArray(punch) ? punch.join(' ') : String(punch || '')).trim();
    hookCandidate = `${tc.line1 || ''} ${tc.line2 || ''} ${punchStr}`.replace(/\s+/g, ' ').trim();
  } else if (post.reel_hook) {
    hookCandidate = post.reel_hook;
  } else {
    hookCandidate = narration.split(/[.!?]/)[0] || '';
  }
  createSubtitlesAss(boundaries, rawComment, narration, voiceDuration, outroStartTime, totalDuration, localAssPath, hookCandidate);

  // 5. Collect 4 Era Photos
  const rawUrls = post.photo_urls || [];
  const localEraImages = [];

  for (let i = 0; i < Math.min(4, rawUrls.length); i++) {
    const imgDest = path.join(TEMP_DIR, `${safeName}_photo_${i + 1}.jpg`);
    try {
      if (!fs.existsSync(imgDest) || fs.statSync(imgDest).size < 1000) {
        console.log(`    📥 Downloading fresh photo ${i + 1}...`);
        const rawDest = path.join(TEMP_DIR, `${safeName}_raw_${i + 1}`);
        await downloadFile(rawUrls[i], rawDest);
        try {
          execSync(`ffmpeg -y -v error -i "${rawDest}" -vframes 1 -q:v 2 "${imgDest}"`);
          try { fs.unlinkSync(rawDest); } catch (e) {}
        } catch (convErr) {
          fs.renameSync(rawDest, imgDest);
        }
      }
      localEraImages.push(imgDest);
    } catch (e) {
      console.warn(`    [!] Could not download photo ${i + 1}: ${e.message}`);
    }
  }
  if (localEraImages.length === 0) {
    throw new Error(`No era images available to create reel for ${celebName}`);
  }
  console.log(`    📸 Collected ${localEraImages.length} era photos for slideshow.`);

  // 6. Resolve Cutout and Role for Cameo Slide
  const { cutoutPath, role } = resolveCutoutAndRole(post, safeName);
  if (cutoutPath) {
    console.log(`    👑 Using character cutout: ${path.basename(cutoutPath)} (Role: ${role})`);
  } else {
    console.log(`    ℹ️ No character cutout found for ${celebName}; rendering classic slide cards.`);
  }

  // 7. Render 4 Milestone Slide Cards with Puppeteer
  const { slidePaths: slideCardPaths, renderedCutoutPath, renderedArrowPath, arrowAnimConfig } = await renderSlideCards(localEraImages, cutoutPath, role, safeName);

  // 8. Compose Slide Inputs with Ken Burns Motion, Animated Cameo & Smooth Transitions
  const D_trans = 0.40; // 0.40s visual crossfade transition overlap between consecutive slides
  const slideInDur = eraSlideDuration + D_trans;
  framesPerSlide = Math.round(slideInDur * 25);
  const outroInDur = OUTRO_DURATION + D_trans;

  const inputs = [];
  let filterComplex = '';

  for (let k = 0; k < numEraSlides; k++) {
    inputs.push(`-loop 1 -t ${slideInDur.toFixed(2)} -i "${slideCardPaths[k]}"`);
  }

  let cutoutInputIdx = -1;
  let arrowInputIdx = -1;
  if (renderedCutoutPath && renderedArrowPath) {
    cutoutInputIdx = inputs.length;
    inputs.push(`-loop 1 -t ${slideInDur.toFixed(2)} -i "${renderedCutoutPath}"`);
    arrowInputIdx = inputs.length;
    inputs.push(`-loop 1 -t ${slideInDur.toFixed(2)} -i "${renderedArrowPath}"`);
  }

  for (let k = 0; k < numEraSlides; k++) {
    if (k === 1) {
      filterComplex += `[${k}:v]zoompan=z='max(1.06-0.00035*on,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${framesPerSlide}:s=1080x1920:fps=25,setsar=1[slide${k}];`;
    } else if (k === 2 && cutoutInputIdx !== -1 && arrowInputIdx !== -1) {
      // Slide 2 is the Cameo Slide:
      // Base zoompan + Cameo slide-in from left + Iconic 3D Red Arrow (blinking, smooth curved swoop, and rhythmic pulse nudge)
      const cfg = arrowAnimConfig || { x0: 580, y0: 840, x1: 620, y1: 1020, x2: 370, y2: 1080, angleDeg: 152.4, nudgeAmp: 20 };
      const rad = (cfg.angleDeg * Math.PI) / 180;
      const nudgeX = (cfg.nudgeAmp * Math.cos(rad)).toFixed(2);
      const nudgeY = (cfg.nudgeAmp * Math.sin(rad)).toFixed(2);

      const xExpr = `if(lt(t,1.85), (1-(3*pow(min(1,max(0,(t-0.85)/1.0)),2)-2*pow(min(1,max(0,(t-0.85)/1.0)),3)))*(1-(3*pow(min(1,max(0,(t-0.85)/1.0)),2)-2*pow(min(1,max(0,(t-0.85)/1.0)),3)))*${cfg.x0} + 2*(1-(3*pow(min(1,max(0,(t-0.85)/1.0)),2)-2*pow(min(1,max(0,(t-0.85)/1.0)),3)))*(3*pow(min(1,max(0,(t-0.85)/1.0)),2)-2*pow(min(1,max(0,(t-0.85)/1.0)),3))*${cfg.x1} + pow(3*pow(min(1,max(0,(t-0.85)/1.0)),2)-2*pow(min(1,max(0,(t-0.85)/1.0)),3),2)*${cfg.x2}, ${cfg.x2} + (${nudgeX}) * pow(max(0, sin(3.14159 * mod(t-1.85, 0.65)/0.65)), 2))`;
      const yExpr = `if(lt(t,1.85), (1-(3*pow(min(1,max(0,(t-0.85)/1.0)),2)-2*pow(min(1,max(0,(t-0.85)/1.0)),3)))*(1-(3*pow(min(1,max(0,(t-0.85)/1.0)),2)-2*pow(min(1,max(0,(t-0.85)/1.0)),3)))*${cfg.y0} + 2*(1-(3*pow(min(1,max(0,(t-0.85)/1.0)),2)-2*pow(min(1,max(0,(t-0.85)/1.0)),3)))*(3*pow(min(1,max(0,(t-0.85)/1.0)),2)-2*pow(min(1,max(0,(t-0.85)/1.0)),3))*${cfg.y1} + pow(3*pow(min(1,max(0,(t-0.85)/1.0)),2)-2*pow(min(1,max(0,(t-0.85)/1.0)),3),2)*${cfg.y2}, ${cfg.y2} + (${nudgeY}) * pow(max(0, sin(3.14159 * mod(t-1.85, 0.65)/0.65)), 2))`;

      filterComplex += 
        `[${k}:v]zoompan=z='min(zoom+0.00035,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${framesPerSlide}:s=1080x1920:fps=25,setsar=1[base_zoom2];` +
        `[base_zoom2][${cutoutInputIdx}:v]overlay=x='if(lt(t,0.45),-580+(580+25)*(1-pow(1-t/0.45,3)),25)':y='1010':enable='gte(t,0)'[with_cameo];` +
        `[with_cameo][${arrowInputIdx}:v]overlay=x='${xExpr}':y='${yExpr}':enable='gte(t,0.45)*(if(lt(t,0.85),mod(floor((t-0.45)*10),2),1))',setsar=1[slide${k}];`;
    } else {
      filterComplex += `[${k}:v]zoompan=z='min(zoom+0.00035,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${framesPerSlide}:s=1080x1920:fps=25,setsar=1[slide${k}];`;
    }
  }

  // Single Outro Screen Inputs (Luxury Gold Particle Background)
  const outroBgIdx = inputs.length;
  const outroLogoIdx = inputs.length + 1;

  const outroBgPath = path.join(ROOT_DIR, 'backgrounds', 'outro_background.png');
  if (fs.existsSync(outroBgPath)) {
    inputs.push(`-loop 1 -t ${outroInDur.toFixed(2)} -i "${outroBgPath}"`);
    filterComplex += `[${outroBgIdx}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[outro_bg];` +
                     `[${outroLogoIdx}:v]scale=eval=frame:w='max(2, 350*(1-pow(1-min(1, max(0, (t-0.25)/0.40)), 3)))':h='max(2, 350*(1-pow(1-min(1, max(0, (t-0.25)/0.40)), 3)))'[logo_pop];` +
                     `[outro_bg][logo_pop]overlay=(W-w)/2:(H-h)/2-140:enable='gte(t, 0.25)',setsar=1[slide_outro];`;
  } else {
    inputs.push(`-f lavfi -t ${outroInDur.toFixed(2)} -i color=c=black:s=1080x1920:r=25`);
    filterComplex += `[${outroLogoIdx}:v]scale=eval=frame:w='max(2, 350*(1-pow(1-min(1, max(0, (t-0.25)/0.40)), 3)))':h='max(2, 350*(1-pow(1-min(1, max(0, (t-0.25)/0.40)), 3)))'[logo_pop];` +
                     `[${outroBgIdx}:v][logo_pop]overlay=(W-w)/2:(H-h)/2-140:enable='gte(t, 0.25)',setsar=1[slide_outro];`;
  }

  inputs.push(`-loop 1 -t ${outroInDur.toFixed(2)} -i "${styledLogoPath}"`);

  // Black lead-in input for the opening entrance transition
  const blackIntroIdx = inputs.length;
  inputs.push(`-f lavfi -t ${D_trans.toFixed(2)} -i color=c=black:s=1080x1920:r=25`);

  let watermarkIdx = -1;
  if (watermarkLogoPath && fs.existsSync(watermarkLogoPath)) {
    watermarkIdx = inputs.length;
    inputs.push(`-loop 1 -t ${totalDuration.toFixed(2)} -i "${watermarkLogoPath}"`);
  }

  // Visual Transitions from start to end using xfade:
  // - Opening Entrance: Cinematic 'circleopen' spotlight iris revealing the first image
  // - Milestone Slides: Fluid 'smoothleft' push crossfades
  // - Outro Screen: Luxury 'fade' dissolve into the gold particle explosion
  const off1 = eraSlideDuration.toFixed(2);
  const off2 = (eraSlideDuration * 2).toFixed(2);
  const off3 = (eraSlideDuration * 3).toFixed(2);
  const off4 = (eraSlideDuration * 4).toFixed(2);

  filterComplex += 
    `[${blackIntroIdx}:v][slide0]xfade=transition=circleopen:duration=${D_trans}:offset=0[x0];` +
    `[x0][slide1]xfade=transition=smoothleft:duration=${D_trans}:offset=${off1}[x1];` +
    `[x1][slide2]xfade=transition=smoothleft:duration=${D_trans}:offset=${off2}[x2];` +
    `[x2][slide3]xfade=transition=smoothleft:duration=${D_trans}:offset=${off3}[x3];` +
    `[x3][slide_outro]xfade=transition=fade:duration=${D_trans}:offset=${off4},setsar=1[vbase];`;

  const escapedAss = localAssPath.replace(/\\/g, '/').replace(/:/g, '\\:');
  if (watermarkIdx !== -1) {
    filterComplex += `[vbase]ass='${escapedAss}'[v_subs];` +
                     `[${watermarkIdx}:v]scale=120:120,setsar=1[wm];` +
                     `[v_subs][wm]overlay=W-w-50:75[vout];`;
  } else {
    filterComplex += `[vbase]ass='${escapedAss}'[vout];`;
  }

  // Dynamically select background music track for this reel
  const selectedBgmPath = selectBgmForReel(index);
  const bgmFileName = path.basename(selectedBgmPath);
  console.log(`    🎵 Background Music: ${bgmFileName} (Reel #${index})`);

  // Audio Inputs: Voiceover + Selected BGM + Procedural SFX Tracks
  const voiceInputIndex = inputs.length;
  inputs.push(`-i "${voicePath}"`);
  const bgmInputIndex = inputs.length;
  inputs.push(`-stream_loop -1 -i "${selectedBgmPath}"`);

  const AUDIO_DIR = path.join(ROOT_DIR, 'assets', 'audio');
  const sfxHookScratchPath = path.join(AUDIO_DIR, 'sfx_hook_scratch.wav');
  const sfxWhooshPath = path.join(AUDIO_DIR, 'sfx_whoosh.wav');
  const sfxCameoPopPath = path.join(AUDIO_DIR, 'sfx_cameo_pop_ding.wav');
  const sfxChimePath = path.join(AUDIO_DIR, 'winner_chime.mp3');

  const sfxHookIdx = inputs.length;
  inputs.push(`-i "${sfxHookScratchPath}"`);
  const sfxWhooshIdx = inputs.length;
  inputs.push(`-i "${sfxWhooshPath}"`);
  const sfxCameoPopIdx = inputs.length;
  inputs.push(`-i "${sfxCameoPopPath}"`);
  const sfxChimeIdx = inputs.length;
  inputs.push(`-i "${sfxChimePath}"`);

  // SFX Timing Offsets: Synced to Every Image Transition & Event
  const t_hook_ms = 0;
  const t_trans1_ms = Math.round(eraSlideDuration * 1000);
  const t_trans2_ms = Math.round(eraSlideDuration * 2 * 1000);
  const t_cameo_ms = Math.round((eraSlideDuration * 2 + 0.45) * 1000);
  const t_trans3_ms = Math.round(eraSlideDuration * 3 * 1000);
  const t_outro_ms = Math.round(eraSlideDuration * 4 * 1000);

  console.log(`    🔊 SFX Design: Scratch at 0.0s | Whoosh 1 at ${(t_trans1_ms/1000).toFixed(2)}s | Whoosh 2 at ${(t_trans2_ms/1000).toFixed(2)}s | Cameo Pop at ${(t_cameo_ms/1000).toFixed(2)}s | Whoosh 3 at ${(t_trans3_ms/1000).toFixed(2)}s | Outro Chime at ${(t_outro_ms/1000).toFixed(2)}s`);

  // Audio Filters:
  // - Voiceover boosted 1.8x (volume=1.8)
  // - BGM ducked to 18% (volume=0.18)
  // - SFX split and synced to all transitions via adelay
  // - Smooth 0.7s fade out at video end
  const fadeOutStart = Math.max(0, totalDuration - 0.7).toFixed(2);
  filterComplex += 
    `[${voiceInputIndex}:a]volume=1.8,apad=pad_dur=${OUTRO_DURATION + 1}[v_boosted];` +
    `[${bgmInputIndex}:a]volume=0.18[b_gentle];` +
    `[${sfxWhooshIdx}:a]asplit=3[w1][w2][w3];` +
    `[${sfxHookIdx}:a]adelay=${t_hook_ms}|${t_hook_ms},volume=1.0[sfx_hook];` +
    `[w1]adelay=${t_trans1_ms}|${t_trans1_ms},volume=0.85[sfx_w1];` +
    `[w2]adelay=${t_trans2_ms}|${t_trans2_ms},volume=0.85[sfx_w2];` +
    `[${sfxCameoPopIdx}:a]adelay=${t_cameo_ms}|${t_cameo_ms},volume=1.25[sfx_cameo];` +
    `[w3]adelay=${t_trans3_ms}|${t_trans3_ms},volume=0.85[sfx_w3];` +
    `[${sfxChimeIdx}:a]adelay=${t_outro_ms}|${t_outro_ms},volume=1.0[sfx_chime];` +
    `[v_boosted][b_gentle][sfx_hook][sfx_w1][sfx_w2][sfx_cameo][sfx_w3][sfx_chime]amix=inputs=8:duration=first:dropout_transition=2[amixed];` +
    `[amixed]afade=t=out:st=${fadeOutStart}:d=0.7[aout]`;

  const cmd = `ffmpeg -y -loglevel warning ${inputs.join(' ')} ` +
              `-filter_complex "${filterComplex}" ` +
              `-map "[vout]" -map "[aout]" ` +
              `-t ${totalDuration.toFixed(2)} ` +
              `-c:v libx264 -preset fast -crf 21 -pix_fmt yuv420p ` +
              `-c:a aac -b:a 192k -movflags +faststart "${finalVideoPath}"`;

  console.log(`    ⚡ Encoding vertical reel with FFmpeg...`);
  try {
    execSync(cmd, { stdio: 'pipe', maxBuffer: 100 * 1024 * 1024 });
  } catch (e) {
    console.error('    [!] FFmpeg STDERR:', e.stderr ? e.stderr.toString() : e.message);
    throw e;
  }

  try { if (fs.existsSync(localAssPath)) fs.unlinkSync(localAssPath); } catch (e) {}
  const finalSizeMb = (fs.statSync(finalVideoPath).size / (1024 * 1024)).toFixed(2);
  console.log(`    ✅ SUCCESS! Vertical Reel Generated: ${finalVideoPath} (${finalSizeMb} MB, ${totalDuration.toFixed(1)}s)`);
  return finalVideoPath;
}

async function main() {
  if (!fs.existsSync(TODAY_POSTS_PATH)) {
    console.error(`[!] today_posts.json not found at: ${TODAY_POSTS_PATH}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(TODAY_POSTS_PATH, 'utf8'));
  const posts = (data.posts && data.posts.length > 0) ? data.posts : (data.celebrities || []);

  if (posts.length === 0) {
    console.log(`[!] No posts found in today_posts.json`);
    return;
  }

  const args = process.argv.slice(2);
  const isAll = args.includes('--all') || args.includes('all') || (args.length === 0);

  if (isAll) {
    const targetPosts = posts.slice(0, 3);
    console.log(`\n======================================================`);
    console.log(`🎬 BATCH MODE: Generating Vertical Reels for ${posts.length} Celebrities`);
    console.log(`======================================================\n`);

    for (let i = 0; i < targetPosts.length; i++) {
      const p = targetPosts[i];
      try {
        const reelFile = await buildReel(p, i + 1);
        p.reel_path = path.relative(ROOT_DIR, reelFile).replace(/\\/g, '/');
        if (data.celebrities && data.celebrities[i]) {
          data.celebrities[i].reel_path = p.reel_path;
        }
        fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
      } catch (err) {
        console.error(`[!] Error building reel for ${p.celebrity_name || `Post ${i + 1}`}:`, err.message);
      }
    }
  } else {
    let targetIndex = 0;
    if (args.includes('--index')) {
      const idx = parseInt(args[args.indexOf('--index') + 1], 10);
      if (!isNaN(idx)) targetIndex = idx - 1;
    } else if (args[0] && !isNaN(parseInt(args[0], 10))) {
      targetIndex = parseInt(args[0], 10) - 1;
    }
    const targetPost = posts[targetIndex] || posts[0];
    const reelFile = await buildReel(targetPost, targetIndex + 1);
    targetPost.reel_path = path.relative(ROOT_DIR, reelFile).replace(/\\/g, '/');
    if (data.celebrities && data.celebrities[targetIndex]) {
      data.celebrities[targetIndex].reel_path = targetPost.reel_path;
    }
    fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
  }

  console.log(`\n🎉 Reel studio generation finished successfully!`);
}

main().catch(err => {
  console.error('[!] Fatal Error in Reel Maker:', err);
  process.exit(1);
});

