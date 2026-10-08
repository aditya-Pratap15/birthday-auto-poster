#!/usr/bin/env node
/**
 * Studio Reel Maker Engine (Node.js + FFmpeg + EdgeTTS)
 * Automatically converts daily celebrity birthday packages into vertical (9:16 - 1080x1920)
 * cinematic Facebook Reels with AI voiceover (male/female matched), blurred backdrops, and captions.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const BASE_DIR = path.resolve(__dirname, '..', 'Facebook-Automations', '1-born-today-hollywood');
const { EdgeTTS, Constants } = require(path.join(BASE_DIR, 'node_modules', '@andresaya', 'edge-tts'));
const TODAY_POSTS_PATH = path.join(BASE_DIR, 'today_posts.json');
const REELS_DIR = path.join(BASE_DIR, 'reels');
const TEMP_DIR = path.join(BASE_DIR, 'temp_reel_assets');

if (!fs.existsSync(REELS_DIR)) fs.mkdirSync(REELS_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'BirthdayReelMaker/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadFile(res.headers.location, destPath));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`));
      }
      const stream = fs.createWriteStream(destPath);
      res.pipe(stream);
      stream.on('finish', () => stream.close(resolve));
    }).on('error', reject);
  });
}

function cleanMarkdown(text) {
  if (!text) return '';
  return text.replace(/\*\*(.*?)\*\*/g, '$1')
             .replace(/__(.*?)__/g, '$1')
             .replace(/[#*_~`]/g, '')
             .trim();
}

function getAudioDuration(filePath) {
  const cmd = `ffprobe -i "${filePath}" -show_entries format=duration -v quiet -of csv="p=0"`;
  const stdout = execSync(cmd).toString().trim();
  return parseFloat(stdout) || 20;
}

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
  console.log(`    [✓] Voiceover created (${duration.toFixed(1)}s)`);
  return { duration, boundaries: tts.getWordBoundaries() };
}

function formatAssTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function createSubtitlesAss(boundaries, fullText, totalDuration, assPath) {
  const events = [];
  if (boundaries && boundaries.length > 5) {
    const words = boundaries.map(b => ({
      start: (b.offset || 0) / 10000000,
      end: ((b.offset || 0) + (b.duration || 0)) / 10000000,
      text: b.text
    }));

    let phrase = [];
    for (let i = 0; i < words.length; i++) {
      phrase.push(words[i]);
      if (phrase.length >= 4 || i === words.length - 1 || words[i].text.endsWith('.') || words[i].text.endsWith('?')) {
        const start = phrase[0].start;
        const end = Math.min(totalDuration, phrase[phrase.length - 1].end + 0.3);
        const text = phrase.map(w => w.text).join(' ');
        events.push(`Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,{\\b1}${text}{\\b0}`);
        phrase = [];
      }
    }
  } else {
    const sentences = fullText.split(/(?<=[.?!])\s+/);
    const chunkDur = totalDuration / Math.max(1, sentences.length);
    sentences.forEach((s, idx) => {
      const start = idx * chunkDur;
      const end = (idx + 1) * chunkDur;
      events.push(`Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,{\\b1}${s}{\\b0}`);
    });
  }

  const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,60,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,0,2,80,80,320,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}
`;

  fs.writeFileSync(assPath, assContent, 'utf8');
}

async function buildReel(post, index = 1) {
  const celebName = post.celebrity_name || `Celebrity_${index}`;
  const safeName = celebName.replace(/[^a-zA-Z0-9]/g, '_');
  console.log(`\n======================================================`);
  console.log(`🎬 CREATING VERTICAL REEL: ${celebName}`);
  console.log(`======================================================`);

  const narrationRaw = post.comment || post.teaser_card?.line3_climax || post.caption || '';
  const narration = cleanMarkdown(narrationRaw);

  const voicePath = path.join(TEMP_DIR, `${safeName}_voice.mp3`);
  const assPath = path.join(TEMP_DIR, `${safeName}_subs.ass`);
  const finalVideoPath = path.join(REELS_DIR, `${safeName}_Reel.mp4`);

  // 1. Generate Voiceover
  const { duration: voiceDuration, boundaries } = await generateVoiceover(narration, post.gender, voicePath);
  const totalDuration = voiceDuration + 1.0;

  const localAssPath = path.join(process.cwd(), 'current_subs.ass');
  createSubtitlesAss(boundaries, narration, totalDuration, localAssPath);

  // 3. Collect Images
  const rawUrls = post.photo_urls || [];
  const localImages = [];

  for (let i = 0; i < Math.min(5, rawUrls.length); i++) {
    const imgDest = path.join(TEMP_DIR, `${safeName}_photo_${i + 1}.jpg`);
    try {
      if (!fs.existsSync(imgDest)) {
        console.log(`    ⬇️ Downloading Photo ${i + 1}...`);
        await downloadFile(rawUrls[i], imgDest);
      }
      localImages.push(imgDest);
    } catch (e) {
      console.warn(`    [!] Could not download photo ${i + 1}: ${e.message}`);
    }
  }

  if (localImages.length === 0) {
    throw new Error(`No images available to create reel for ${celebName}`);
  }

  const slideDuration = totalDuration / localImages.length;
  console.log(`    🖼️ ${localImages.length} photos collected. Duration per slide: ${slideDuration.toFixed(2)}s`);

  let filterComplex = '';
  const inputs = [];

  localImages.forEach((img, i) => {
    inputs.push(`-loop 1 -t ${slideDuration} -i "${img}"`);
    filterComplex += `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:5[bg${i}];` +
                     `[${i}:v]scale=1000:1400:force_original_aspect_ratio=decrease[fg${i}];` +
                     `[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2-60,setsar=1[slide${i}];`;
  });

  const concatInputs = localImages.map((_, i) => `[slide${i}]`).join('');
  filterComplex += `${concatInputs}concat=n=${localImages.length}:v=1:a=0[vbase];` +
                   `[vbase]ass=current_subs.ass[vout]`;

  const cmd = `ffmpeg -y ${inputs.join(' ')} -i "${voicePath}" ` +
              `-filter_complex "${filterComplex}" ` +
              `-map "[vout]" -map ${localImages.length}:a ` +
              `-c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p ` +
              `-c:a aac -b:a 192k -shortest "${finalVideoPath}"`;

  console.log(`    ⚙️ Encoding 1080x1920 vertical video with FFmpeg...`);
  try {
    execSync(cmd, { stdio: 'pipe' });
  } catch (e) {
    console.error('    [!] FFmpeg STDERR:', e.stderr ? e.stderr.toString() : e.message);
    throw e;
  }

  console.log(`    [✓] SUCCESS! Reel created: ${finalVideoPath}`);
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
  console.log(`\n🎉 Prototype Reel generation completed successfully!`);
}

main().catch(err => {
  console.error('[!] Fatal Error in Reel Maker:', err);
  process.exit(1);
});
