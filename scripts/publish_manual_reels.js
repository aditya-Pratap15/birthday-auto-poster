#!/usr/bin/env node
/**
 * Manual Omnichannel Reel Publisher
 * Publishes the 3 generated vertical reels to:
 * 1. Facebook Reels (Meta Graph API)
 * 2. Instagram Reels (Meta Graph API)
 * 3. Prepares and triggers YouTube Shorts via GitHub Actions
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = path.resolve(__dirname, '..');
const TODAY_POSTS_PATH = path.join(BASE_DIR, 'today_posts.json');

const VERIFIED_TOKEN = 'EAAWxAIZCUlZCgBSpd25dCcaBZBrbR8Kxr3rPhEglK6z1YLSM9UN91Gtb5d1ZCVcZAjxVGeBzc17es7XWIwX0yfznnO2HkxaZAeXYHy6NJQONWqhIiwevCjZAcabAKwqvwQHJ1nFCmAs9RPF3XNVHLmc3nUw4PdB2E2YaMYqgXPBLbhUO3EfWTcZAfVFdIEHMwa1E8L5ToS43';
const DEFAULT_PAGE_ID = (process.env.FB_PAGE_ID_BORN || process.env.FB_PAGE_ID || '1345901645276194').trim();
const DEFAULT_TOKEN = (process.env.FB_TOKEN_BORN || VERIFIED_TOKEN).trim();
const DEFAULT_IG_ID = (process.env.IG_USER_ID || '17841416842135384').trim();

function formatUnicodeBold(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\*\*(.+?)\*\*/g, (_, s) => {
    return Array.from(s).map(c => {
      const code = c.charCodeAt(0);
      if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D5D4 + code - 65);   // A-Z
      if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D5EE + code - 97);  // a-z
      if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7EC + code - 48);   // 0-9
      return c;
    }).join('');
  });
}

function cleanCaptionBeats(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\*\*Beat\s*\d+\s*[:\-–—]?\*\*\s*[:\-–—]?\s*/gi, '')
    .replace(/\*Beat\s*\d+\s*[:\-–—]?\*\s*[:\-–—]?\s*/gi, '')
    .replace(/\bBeat\s*\d+\s*[:\-–—]\s*/gi, '')
    .trim();
}

function formatCaption(text, hashtags = '') {
  let hashtagStr = '';
  if (Array.isArray(hashtags)) {
    hashtagStr = hashtags.slice(0, 3).join(' ').trim();
  } else if (typeof hashtags === 'string') {
    const matches = hashtags.match(/#[A-Za-z0-9_]+/g);
    if (matches && matches.length > 0) {
      hashtagStr = matches.slice(0, 3).join(' ').trim();
    } else {
      hashtagStr = hashtags.split(/\s+/).slice(0, 3).join(' ').trim();
    }
  }

  const formattedTags = hashtagStr ? `\n\n${hashtagStr}` : '';
  const cleanedText = cleanCaptionBeats(text || '');
  const formatted = formatUnicodeBold(cleanedText);
  return formatted + formattedTags;
}

// -------------------------------------------------------------
// 1. Facebook Reel Resumable Publishing
// -------------------------------------------------------------
function postFacebookReel(pageId, token, description, videoPath) {
  return new Promise(async (resolve) => {
    try {
      if (!fs.existsSync(videoPath)) {
        return resolve({ status: 404, error: `Reel video file not found: ${videoPath}` });
      }

      const videoBuf = fs.readFileSync(videoPath);
      const fileSize = videoBuf.length;

      console.log(`    [📤 FB] Initializing Facebook Reel session (${(fileSize / (1024*1024)).toFixed(2)} MB)...`);

      // Phase 1: Initialize Reel Session
      const startData = new URLSearchParams({
        access_token: token,
        upload_phase: 'start'
      }).toString();

      const startRes = await new Promise((resP, rejP) => {
        const req = https.request({
          hostname: 'graph.facebook.com',
          port: 443,
          path: `/v26.0/${pageId}/video_reels`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(startData)
          }
        }, r => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => {
            try { resP(JSON.parse(d)); } catch (e) { rejP(new Error('Invalid start JSON: ' + d)); }
          });
        });
        req.on('error', rejP);
        req.write(startData);
        req.end();
      });

      if (!startRes.video_id || !startRes.upload_url) {
        return resolve({ status: 500, error: 'Failed to initialize reel upload', details: startRes });
      }

      const videoId = startRes.video_id;
      const uploadUrl = new URL(startRes.upload_url);

      // Phase 2: Upload Video Binary to rupload
      console.log(`    [📤 FB] Uploading Reel video binary to Facebook rupload CDN...`);
      await new Promise((resP, rejP) => {
        const req = https.request({
          hostname: uploadUrl.hostname,
          port: 443,
          path: uploadUrl.pathname + uploadUrl.search,
          method: 'POST',
          headers: {
            'Authorization': `OAuth ${token}`,
            'offset': '0',
            'file_size': String(fileSize),
            'Content-Type': 'application/octet-stream',
            'Content-Length': fileSize
          }
        }, r => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => resP(d));
        });
        req.on('error', rejP);
        req.write(videoBuf);
        req.end();
      });

      // Phase 3: Finish & Publish Live
      console.log(`    [🚀 FB] Finalizing Reel publication...`);
      const finishParams = {
        access_token: token,
        upload_phase: 'finish',
        video_id: videoId,
        description: description,
        video_state: 'PUBLISHED'
      };

      const finishData = new URLSearchParams(finishParams).toString();
      const finishRes = await new Promise((resP, rejP) => {
        const req = https.request({
          hostname: 'graph.facebook.com',
          port: 443,
          path: `/v26.0/${pageId}/video_reels`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(finishData)
          }
        }, r => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => {
            try { resP(JSON.parse(d)); } catch (e) { rejP(new Error('Invalid finish JSON: ' + d)); }
          });
        });
        req.on('error', rejP);
        req.write(finishData);
        req.end();
      });

      if (finishRes.success) {
        resolve({ status: 200, video_id: videoId, success: true });
      } else {
        resolve({ status: 400, error: finishRes.error || finishRes });
      }
    } catch (err) {
      resolve({ status: 500, error: err.message });
    }
  });
}

// -------------------------------------------------------------
// 2. Instagram Reel Resumable Publishing
// -------------------------------------------------------------
async function postInstagramReel(igUserId, token, caption, videoPath) {
  if (!igUserId || !fs.existsSync(videoPath)) return { success: false, error: 'Missing IG ID or video file' };

  const fileSize = fs.statSync(videoPath).size;
  console.log(`    [🎬 IG] Starting resumable Instagram Reel upload session (${(fileSize / (1024*1024)).toFixed(2)} MB)...`);

  const initParams = {
    access_token: token,
    upload_type: 'resumable',
    media_type: 'REELS',
    caption: caption
  };

  const initData = new URLSearchParams(initParams).toString();
  const initRes = await new Promise((resolve) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      port: 443,
      path: `/v26.0/${igUserId}/media`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(initData)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) { resolve({ error: data }); }
      });
    });
    req.on('error', err => resolve({ error: err.message }));
    req.write(initData);
    req.end();
  });

  if (!initRes || !initRes.id || !initRes.uri) {
    return { success: false, error: initRes ? initRes.error : 'Failed to init reel container' };
  }

  const containerId = initRes.id;
  const uploadUrl = new URL(initRes.uri);

  console.log(`    [📤 IG] Uploading Reel video binary to Meta CDN...`);
  const uploadSuccess = await new Promise((resolve) => {
    const fileStream = fs.createReadStream(videoPath);
    const req = https.request({
      hostname: uploadUrl.hostname,
      port: 443,
      path: uploadUrl.pathname + uploadUrl.search,
      method: 'POST',
      headers: {
        'Authorization': `OAuth ${token}`,
        'offset': '0',
        'file_size': fileSize.toString(),
        'Content-Length': fileSize.toString(),
        'X-Entity-Length': fileSize.toString(),
        'Content-Type': 'application/octet-stream'
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.success !== false);
        } catch (e) { resolve(true); }
      });
    });
    req.on('error', () => resolve(false));
    fileStream.pipe(req);
  });

  if (!uploadSuccess) {
    return { success: false, error: 'Binary upload stream failed' };
  }

  // Poll video processing status (up to 120s)
  console.log(`    [⏳ IG] Polling Meta video encoding engine for container ${containerId}...`);
  let isReady = false;
  let attempts = 0;
  while (!isReady && attempts < 24) {
    await new Promise(r => setTimeout(r, 5000));
    attempts++;
    const statusRes = await new Promise((resolve) => {
      https.get(`https://graph.facebook.com/v26.0/${containerId}?fields=status_code&access_token=${token}`, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { resolve({}); }
        });
      }).on('error', () => resolve({}));
    });

    if (statusRes.status_code === 'FINISHED') {
      isReady = true;
      break;
    } else if (statusRes.status_code === 'ERROR') {
      return { success: false, error: 'Video processing returned ERROR from Meta' };
    }
  }

  if (!isReady) {
    return { success: false, error: 'Video processing timed out after 120 seconds' };
  }

  // Publish Reel
  console.log(`    [🚀 IG] Publishing processed Reel container...`);
  const pubParams = {
    access_token: token,
    creation_id: containerId
  };
  const pubData = new URLSearchParams(pubParams).toString();

  const finalPublish = await new Promise((resolve) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      port: 443,
      path: `/v26.0/${igUserId}/media_publish`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(pubData)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.id) {
            resolve({ success: true, id: parsed.id });
          } else {
            resolve({ success: false, error: parsed });
          }
        } catch (e) { resolve({ success: false, error: data }); }
      });
    });
    req.on('error', err => resolve({ success: false, error: err.message }));
    req.write(pubData);
    req.end();
  });

  return finalPublish;
}

// -------------------------------------------------------------
// Main Execution
// -------------------------------------------------------------
async function main() {
  if (!fs.existsSync(TODAY_POSTS_PATH)) {
    console.error(`[!] today_posts.json not found.`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(TODAY_POSTS_PATH, 'utf8'));
  const posts = (data.posts || []).slice(0, 3);

  console.log('======================================================');
  console.log('🚀 MANUAL OMNICHANNEL REEL PUBLISHER (FB + IG + YT)');
  console.log('======================================================');
  console.log(`Page: Born Today Hollywood (${DEFAULT_PAGE_ID})`);
  console.log(`Instagram: @borntodayhollywood (${DEFAULT_IG_ID})`);
  console.log(`Reels Target Count: ${posts.length}\n`);

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const celebName = post.celebrity_name;
    const safeName = (celebName || '').replace(/[^a-zA-Z0-9]/g, '_');
    const reelPath = path.join(BASE_DIR, 'reels', `${safeName}_Reel.mp4`);

    console.log(`\n------------------------------------------------------`);
    console.log(`[#${i + 1}] Processing: ${celebName}`);
    console.log(`Reel File: ${reelPath}`);
    console.log(`------------------------------------------------------`);

    if (!fs.existsSync(reelPath)) {
      console.error(`[!] File not found: ${reelPath}, skipping.`);
      continue;
    }

    const caption = formatCaption(post.reel_caption || `${celebName} turns ${post.age} today! 🎬 What is your favorite movie or role of theirs? 👇`, post.hashtags);

    // 1. Publish to Facebook Reels
    console.log(`\n[1/2] 📘 Publishing to Facebook Reels...`);
    try {
      const fbRes = await postFacebookReel(DEFAULT_PAGE_ID, DEFAULT_TOKEN, caption, reelPath);
      if (fbRes.success && fbRes.video_id) {
        post.fb_reel_id = fbRes.video_id;
        post.fb_reel_url = `https://www.facebook.com/reel/${fbRes.video_id}`;
        console.log(`    ✅ SUCCESS! Facebook Reel Live! ID: ${fbRes.video_id}`);
        console.log(`    🔗 Link: ${post.fb_reel_url}`);
      } else {
        console.error(`    ❌ Facebook Reel Error:`, fbRes.error || fbRes);
      }
    } catch (fbErr) {
      console.error(`    ❌ Facebook Reel Exception:`, fbErr.message);
    }

    // 2. Publish to Instagram Reels
    console.log(`\n[2/2] 📸 Publishing to Instagram Reels...`);
    try {
      const igRes = await postInstagramReel(DEFAULT_IG_ID, DEFAULT_TOKEN, caption, reelPath);
      if (igRes.success && igRes.id) {
        post.ig_reel_id = igRes.id;
        console.log(`    ✅ SUCCESS! Instagram Reel Live! ID: ${igRes.id}`);
      } else {
        console.error(`    ❌ Instagram Reel Error:`, igRes.error || igRes);
      }
    } catch (igErr) {
      console.error(`    ❌ Instagram Reel Exception:`, igErr.message);
    }

    // Save updated today_posts.json immediately
    fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');

    if (i < posts.length - 1) {
      console.log(`\nWaiting 8 seconds before next star...`);
      await new Promise(r => setTimeout(r, 8000));
    }
  }

  console.log('\n======================================================');
  console.log('✅ Facebook & Instagram publishing finished!');
  console.log('======================================================');
}

main().catch(err => {
  console.error('[!] Fatal Error:', err);
  process.exit(1);
});
