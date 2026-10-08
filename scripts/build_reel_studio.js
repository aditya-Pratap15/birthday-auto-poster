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
const { execSync } = require('child_process');
const puppeteer = require('puppeteer');
const { EdgeTTS, Constants } = require('@andresaya/edge-tts');

// Project Paths
const ROOT_DIR = path.resolve(__dirname, '..');
const TODAY_POSTS_PATH = path.join(ROOT_DIR, 'today_posts.json');
const REELS_DIR = path.join(ROOT_DIR, 'reels');
const TEMP_DIR = path.join(ROOT_DIR, 'temp_reel_assets');
const BGM_PATH = path.join(ROOT_DIR, 'background_music.mp3');
const PAGE_LOGO_PATH = path.join(ROOT_DIR, 'page_logo.png');

if (!fs.existsSync(REELS_DIR)) fs.mkdirSync(REELS_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function downloadFile(url, destPath, retries = 2) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 BornTodayBot/2.0'
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadFile(res.headers.location, destPath, retries));
      }
      if (res.statusCode === 429 && retries > 0) {
        setTimeout(() => {
          resolve(downloadFile(url, destPath, retries - 1));
        }, 1500);
        return;
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`));
      }
      const stream = fs.createWriteStream(destPath);
      res.pipe(stream);
      stream.on('finish', () => stream.close(resolve));
    });
    req.on('error', reject);
  });
}

function cleanMarkdown(text) {
  if (!text) return '';
  return text.replace(/\*\*(.*?)\*\*/g, '$1')
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
  if (fs.existsSync(styledLogoPath)) return styledLogoPath;

  if (!fs.existsSync(PAGE_LOGO_PATH)) {
    throw new Error(`Page logo not found at: ${PAGE_LOGO_PATH}`);
  }

  console.log(`    🎨 Rendering luxury circular logo...`);
  const logoBase64 = fs.readFileSync(PAGE_LOGO_PATH).toString('base64');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 360, deviceScaleFactor: 2 });

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
          width: 360px;
          height: 360px;
        }
        .logo-wrap {
          width: 270px;
          height: 270px;
          border-radius: 50%;
          border: 6px solid #d4af37;
          box-shadow: 0 0 45px rgba(212, 175, 55, 0.75), 0 0 18px rgba(255, 215, 0, 0.5);
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
 * Synthesize voiceover using Microsoft Edge Neural TTS
 */
async function generateVoiceover(text, gender, outputPath) {
  const tts = new EdgeTTS();
  const voice = (gender && gender.toLowerCase() === 'female') 
    ? 'en-US-JennyNeural' 
    : 'en-US-ChristopherNeural';

  console.log(`    🎙️ Synthesizing narration with ${voice}...`);
  await tts.synthesize(text, voice, {
    outputFormat: Constants.OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3
  });

  const buffer = tts.toBuffer();
  fs.writeFileSync(outputPath, buffer);
  const duration = getAudioDuration(outputPath);
  console.log(`    ✅ Voiceover created (${duration.toFixed(1)}s)`);
  return { duration, boundaries: tts.getWordBoundaries() };
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
function createSubtitlesAss(boundaries, rawComment, fullNarration, voiceDuration, outroStartTime, totalDuration, assPath) {
  const events = [];

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
      // List numbers are NOT sentence ends
      const isSentenceEnd = isListNum ? false : /[.!?…]+$/.test(rawWord);

      const cleanToken = rawWord.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isBold = boldWordsSet.has(cleanToken);
      const styled = isBold
        ? `{\\b1\\fsize72\\c&H0024D8FF&}${rawWord}{\\b0\\fsize60\\c&H00FFFFFF&}`
        : `{\\b1\\fsize60\\c&H00FFFFFF&}${rawWord}`;

      return {
        start: (b.offset || 0) / 10000000,
        end: ((b.offset || 0) + (b.duration || 0)) / 10000000,
        raw: rawWord,
        styled,
        isSentenceEnd,
        isListNum
      };
    });

    let i = 0;
    while (i < words.length) {
      const line1 = [];
      while (line1.length < 3 && i < words.length) {
        if (line1.length > 0 && words[i].isListNum) break;
        line1.push(words[i]);
        const isEnd = words[i].isSentenceEnd;
        i++;
        if (isEnd) break;
      }

      const line2 = [];
      if (line1.length > 0 && !line1[line1.length - 1].isSentenceEnd && i < words.length && !words[i].isListNum) {
        while (line2.length < 3 && i < words.length) {
          if (line2.length > 0 && words[i].isListNum) break;
          line2.push(words[i]);
          const isEnd = words[i].isSentenceEnd;
          i++;
          if (isEnd) break;
        }
      }

      const line1Text = line1.map(w => w.styled).join(' ');
      const line1Start = line1[0].start;

      if (line2.length > 0) {
        const line2Start = line2[0].start;
        const line2End = Math.min(voiceDuration + 0.1, line2[line2.length - 1].end + 0.35);
        const line2Text = line2.map(w => w.styled).join(' ');

        // Event 1: Line 1 appears first with smooth fade-in bloom
        events.push(`Dialogue: 0,${formatAssTime(line1Start)},${formatAssTime(line2Start)},Default,,0,0,0,,{\\fad(180,60)}${line1Text}`);
        // Event 2: Line 2 appears strictly BELOW Line 1 with smooth fade-in bloom
        events.push(`Dialogue: 0,${formatAssTime(line2Start)},${formatAssTime(line2End)},Default,,0,0,0,,{\\fad(180,60)}${line1Text}\\N${line2Text}`);
      } else {
        const line1End = Math.min(voiceDuration + 0.1, line1[line1.length - 1].end + 0.35);
        events.push(`Dialogue: 0,${formatAssTime(line1Start)},${formatAssTime(line1End)},Default,,0,0,0,,{\\fad(180,60)}${line1Text}`);
      }
    }
  } else {
    const sentences = fullNarration.split(/(?<=[.?!])\s+/);
    const chunkDur = voiceDuration / Math.max(1, sentences.length);
    sentences.forEach((s, idx) => {
      const start = idx * chunkDur;
      const end = (idx + 1) * chunkDur;
      events.push(`Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,{\\fad(180,60)\\b1\\fsize60\\c&H00FFFFFF&}${s}`);
    });
  }

  // Single Outro Screen: Text pops up smoothly at 0.70s and stays until the end of video
  const outroTextStart = outroStartTime + 0.70;
  const outroTextEnd = totalDuration + 2.0; // Stays permanently visible together with logo
  events.push(
    `Dialogue: 0,${formatAssTime(outroTextStart)},${formatAssTime(outroTextEnd)},Default,,0,0,0,,` +
    `{\\an5\\pos(540,1160)\\fscx0\\fscy0\\t(0,350,\\fscx100\\fscy100)\\fad(150,0)\\b1\\fsize58\\c&H0024D8FF&}Born Today Hollywood\\N\\N{\\b1\\fsize46\\c&H00FFFFFF&}Like & Follow for daily updates ✨`
  );

  const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,60,&H00FFFFFF,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,5,2,5,70,70,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}
`;

  fs.writeFileSync(assPath, assContent, 'utf8');
}

/**
 * Main Reel Builder
 */
async function buildReel(post, index = 1) {
  const celebName = post.celebrity_name || `Celebrity_${index}`;
  const safeName = celebName.replace(/[^a-zA-Z0-9]/g, '_');
  console.log(`\n======================================================`);
  console.log(`🎬 CREATING VERTICAL REEL: ${celebName}`);
  console.log(`======================================================`);

  const rawComment = post.comment || post.caption || '';
  const narration = cleanMarkdown(rawComment);

  const voicePath = path.join(TEMP_DIR, `${safeName}_voice.mp3`);
  const finalVideoPath = path.join(REELS_DIR, `${safeName}_Reel.mp4`);

  // 1. Ensure Styled Circular Logo
  const styledLogoPath = await ensureStyledLogo();

  // 2. Synthesize Narration Voiceover
  const { duration: voiceDuration, boundaries } = await generateVoiceover(narration, post.gender, voicePath);

  // 3. Exact Timing Synchronization:
  // Slideshow stops EXACTLY when the narration ends (+ 0.15s natural breath).
  const COLLAGE_SLIDE_DURATION = 3.5;
  const slideshowContentDuration = voiceDuration + 0.15;
  const remainingEraDuration = Math.max(3.0, slideshowContentDuration - COLLAGE_SLIDE_DURATION);

  const targetPerSlide = 3.0;
  const numEraSlides = Math.max(1, Math.round(remainingEraDuration / targetPerSlide));
  const eraSlideDuration = remainingEraDuration / numEraSlides;

  // Single Outro Screen (2.8s total):
  //  - Logo pops up at center with smooth cubic easing (from 0.25s)
  //  - Text pops up smoothly below the logo (from 0.70s)
  //  - Both stay together continuously until video ends
  const OUTRO_DURATION = 2.80;
  const outroStartTime = slideshowContentDuration;
  const totalDuration = slideshowContentDuration + OUTRO_DURATION;

  console.log(`    ⏱️ Timing Sync:`);
  console.log(`       - Collage Slide: ${COLLAGE_SLIDE_DURATION.toFixed(2)}s`);
  console.log(`       - Era Slideshow: ${numEraSlides} slides x ${eraSlideDuration.toFixed(2)}s = ${remainingEraDuration.toFixed(2)}s`);
  console.log(`       - Slideshow Ends at: ${slideshowContentDuration.toFixed(2)}s (Narration: ${voiceDuration.toFixed(2)}s)`);
  console.log(`       - Outro Duration: ${OUTRO_DURATION.toFixed(2)}s`);
  console.log(`       - Total Reel Duration: ${totalDuration.toFixed(2)}s`);

  // 4. Subtitles (Middle-centered with smooth fade-in bloom)
  const localAssPath = path.join(process.cwd(), 'current_subs.ass');
  createSubtitlesAss(boundaries, rawComment, narration, voiceDuration, outroStartTime, totalDuration, localAssPath);

  // 5. Collect Collage Image
  let collagePath = post.image_path ? path.resolve(ROOT_DIR, post.image_path) : '';
  if (!collagePath || !fs.existsSync(collagePath)) {
    const fallback = path.join(ROOT_DIR, 'collages', `${safeName}_Page_${index}_Tribute.jpg`);
    if (fs.existsSync(fallback)) collagePath = fallback;
  }
  if (!collagePath || !fs.existsSync(collagePath)) {
    throw new Error(`Collage image not found for ${celebName}. Run build_collage_studio.js first.`);
  }
  console.log(`    🖼️ Slide 1: Master Collage found (${path.basename(collagePath)})`);

  // 6. Collect the 5 Era Photos
  const rawUrls = post.photo_urls || [];
  const localEraImages = [];

  for (let i = 0; i < Math.min(5, rawUrls.length); i++) {
    const imgDest = path.join(TEMP_DIR, `${safeName}_photo_${i + 1}.jpg`);
    try {
      if (!fs.existsSync(imgDest)) {
        console.log(`    📥 Downloading Photo ${i + 1}...`);
        await downloadFile(rawUrls[i], imgDest);
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

  // 7. Compose Slide Inputs:
  // Slide 0: Collage (3.5s)
  // Slides 1..numEraSlides: Era photos (eraSlideDuration each)
  // Slide Outro: Single unified animated end screen (2.8s)
  const inputs = [];
  let filterComplex = '';

  // Input 0: Collage
  inputs.push(`-loop 1 -t ${COLLAGE_SLIDE_DURATION.toFixed(2)} -i "${collagePath}"`);
  filterComplex += `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:5[bg0];` +
                   `[0:v]scale=1080:1440:force_original_aspect_ratio=decrease[fg0];` +
                   `[bg0][fg0]overlay=(W-w)/2:(H-h)/2,setsar=1[slide0];`;

  // Inputs 1..numEraSlides: Era Photos
  for (let k = 0; k < numEraSlides; k++) {
    const eraImg = localEraImages[k % localEraImages.length];
    const idx = k + 1;
    inputs.push(`-loop 1 -t ${eraSlideDuration.toFixed(2)} -i "${eraImg}"`);
    filterComplex += `[${idx}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:5[bg${idx}];` +
                     `[${idx}:v]scale=1000:1450:force_original_aspect_ratio=decrease[fg${idx}];` +
                     `[bg${idx}][fg${idx}]overlay=(W-w)/2:(H-h)/2-40,setsar=1[slide${idx}];`;
  }

  // Single Outro Screen Inputs
  const outroBgIdx = numEraSlides + 1;
  const outroLogoIdx = numEraSlides + 2;

  inputs.push(`-f lavfi -t ${OUTRO_DURATION.toFixed(2)} -i color=c=black:s=1080x1920:r=25`);
  inputs.push(`-loop 1 -t ${OUTRO_DURATION.toFixed(2)} -i "${styledLogoPath}"`);

  // Animate logo popping in smoothly with cubic easing on the single black end screen
  filterComplex += `[${outroLogoIdx}:v]scale=eval=frame:w='max(2, 280*(1-pow(1-min(1, max(0, (t-0.25)/0.40)), 3)))':h='max(2, 280*(1-pow(1-min(1, max(0, (t-0.25)/0.40)), 3)))'[logo_pop];` +
                   `[${outroBgIdx}:v][logo_pop]overlay=(W-w)/2:(H-h)/2-140:enable='gte(t, 0.25)',setsar=1[slide${outroBgIdx}];`;

  // Concatenate Slides (Slideshow + Single Outro Screen)
  const totalSlidesCount = outroBgIdx + 1;
  const concatInputs = [];
  for (let s = 0; s < totalSlidesCount; s++) {
    concatInputs.push(`[slide${s}]`);
  }
  filterComplex += `${concatInputs.join('')}concat=n=${totalSlidesCount}:v=1:a=0[vbase];` +
                   `[vbase]ass=current_subs.ass[vout];`;

  // Audio Inputs: Voiceover + Gentle Solo Piano BGM
  const voiceInputIndex = outroLogoIdx + 1;
  const bgmInputIndex = outroLogoIdx + 2;
  inputs.push(`-i "${voicePath}"`);
  inputs.push(`-stream_loop -1 -i "${BGM_PATH}"`);

  // Audio Filters:
  // - Voiceover boosted by 80% (volume=1.8)
  // - Gentle solo piano BGM set to 25% (+7% increase from 18%)
  // - Smooth fade out at the end of the video
  const fadeOutStart = Math.max(0, totalDuration - 0.7).toFixed(2);
  filterComplex += `[${voiceInputIndex}:a]volume=1.8,apad=pad_dur=${OUTRO_DURATION + 1}[v_boosted];` +
                   `[${bgmInputIndex}:a]volume=0.25[b_gentle];` +
                   `[v_boosted][b_gentle]amix=inputs=2:duration=first:dropout_transition=2[amixed];` +
                   `[amixed]afade=t=out:st=${fadeOutStart}:d=0.7[aout]`;

  const cmd = `ffmpeg -y ${inputs.join(' ')} ` +
              `-filter_complex "${filterComplex}" ` +
              `-map "[vout]" -map "[aout]" ` +
              `-t ${totalDuration.toFixed(2)} ` +
              `-c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p ` +
              `-c:a aac -b:a 192k "${finalVideoPath}"`;

  console.log(`    ⚡ Encoding vertical reel with FFmpeg...`);
  try {
    execSync(cmd, { stdio: 'pipe' });
  } catch (e) {
    console.error('    [!] FFmpeg STDERR:', e.stderr ? e.stderr.toString() : e.message);
    throw e;
  }

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
  const posts = data.celebrities || data.posts || [];

  if (posts.length === 0) {
    console.log(`[!] No posts found in today_posts.json`);
    return;
  }

  const targetIndex = process.argv[2] ? parseInt(process.argv[2], 10) - 1 : 0;
  const targetPost = posts[targetIndex] || posts[0];

  await buildReel(targetPost, targetIndex + 1);
  console.log(`\n🎉 Reel studio generation finished successfully!`);
}

main().catch(err => {
  console.error('[!] Fatal Error in Reel Maker:', err);
  process.exit(1);
});
