/**
 * scripts/post_to_instagram.js
 * 
 * Omnichannel Dedicated Instagram Auto-Poster for Born Today Hollywood.
 * Supports spaced-out publishing for the Top 3 Headliners with 45-minute offset between Photo and Reel:
 * 
 *   - Drop 1 (US Morning Commute):
 *       5:30 PM IST (12:00 UTC) -> Headliner 1: Photo Carousel
 *       6:15 PM IST (12:45 UTC) -> Headliner 1: Vertical Reel [+45m offset]
 * 
 *   - Drop 2 (US Lunchtime):
 *       10:30 PM IST (17:00 UTC) -> Headliner 2: Photo Carousel
 *       11:15 PM IST (17:45 UTC) -> Headliner 2: Vertical Reel [+45m offset]
 * 
 *   - Drop 3 (US Evening Primetime):
 *       3:30 AM IST (22:00 UTC) -> Headliner 3: Photo Carousel
 *       4:15 AM IST (22:45 UTC) -> Headliner 3: Vertical Reel [+45m offset]
 * 
 * Automatically discovers the next pending item (Carousel or Reel), executes it,
 * records the post ID, and deletes uploaded local reel video to keep Git repository lightweight.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = path.resolve(__dirname, '..');
const TODAY_POSTS_PATH = path.join(BASE_DIR, 'today_posts.json');

const VERIFIED_TOKEN = 'EAAWxAIZCUlZCgBSpd25dCcaBZBrbR8Kxr3rPhEglK6z1YLSM9UN91Gtb5d1ZCVcZAjxVGeBzc17es7XWIwX0yfznnO2HkxaZAeXYHy6NJQONWqhIiwevCjZAcabAKwqvwQHJ1nFCmAs9RPF3XNVHLmc3nUw4PdB2E2YaMYqgXPBLbhUO3EfWTcZAfVFdIEHMwa1E8L5ToS43';
const DEFAULT_IG_ID = (process.env.IG_USER_ID || '17841416842135384').trim();
const DEFAULT_TOKEN = (process.env.FB_TOKEN_BORN || process.env.FB_PAGE_TOKEN || VERIFIED_TOKEN).trim();

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

/**
 * Ensures Instagram captions strictly comply with Meta's 2,200 character limit.
 * Formats Markdown bolding first, then cleanly truncates body text at sentence/paragraph
 * breaks before attaching hashtags to guarantee safety under 2,100 chars.
 */
function formatInstagramCaption(text, hashtags = '') {
  let hashtagStr = '';
  if (Array.isArray(hashtags)) {
    hashtagStr = hashtags.join(' ').trim();
  } else if (typeof hashtags === 'string') {
    hashtagStr = hashtags.trim();
  }

  const formattedTags = hashtagStr ? `\n\n${hashtagStr}` : '';
  const MAX_LIMIT = 2100; // Instagram hard ceiling is 2,200 UTF-16 code units

  let formatted = formatUnicodeBold(text || '');

  if (formatted.length + formattedTags.length > MAX_LIMIT) {
    const maxBodyLen = MAX_LIMIT - formattedTags.length;
    let cut = formatted.slice(0, maxBodyLen);
    // Surrogate pair safety: do not cut in between high and low surrogates
    if (cut.length > 0 && cut.charCodeAt(cut.length - 1) >= 0xD800 && cut.charCodeAt(cut.length - 1) <= 0xDBFF) {
      cut = cut.slice(0, -1);
    }
    const lastBreak = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('. '));
    if (lastBreak > maxBodyLen * 0.65) {
      cut = cut.slice(0, lastBreak + 1);
    }
    formatted = cut.trim();
  }

  return formatted + formattedTags;
}



// -------------------------------------------------------------
// Helper: Resolve Meta CDN URL for Facebook Photo
// -------------------------------------------------------------
function getFacebookPhotoCdnUrl(photoId, token) {
  return new Promise((resolve) => {
    if (!photoId) return resolve(null);
    https.get(`https://graph.facebook.com/v26.0/${photoId}?fields=images&access_token=${token}`, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.images && parsed.images.length > 0) {
            resolve(parsed.images[0].source);
          } else {
            resolve(null);
          }
        } catch (e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

// -------------------------------------------------------------

// -------------------------------------------------------------
// Helper: Audit Live Instagram Profile (Anti-Duplication Guard)
// -------------------------------------------------------------
function findLiveInstagramPost(igUserId, token, celebName, actionType) {
  return new Promise(resolve => {
    https.get(`https://graph.facebook.com/v26.0/${igUserId}/media?fields=id,caption,media_type,timestamp&limit=25&access_token=${token}`, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (!j.data) return resolve(null);
          const targetType = actionType === 'reel' ? 'VIDEO' : (actionType === 'photo' ? 'IMAGE' : 'CAROUSEL_ALBUM');
          const cleanTarget = celebName.toLowerCase().replace(/[^a-z0-9]/g, '');

          // Look within last 36 hours
          const cutoff = Date.now() - (36 * 3600 * 1000);

          for (const item of j.data) {
            if (targetType && item.media_type !== targetType) continue;
            const itemTs = new Date(item.timestamp).getTime();
            if (itemTs < cutoff) continue;

            const cleanCaption = (item.caption || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleanCaption.includes(cleanTarget)) {
              return resolve({ id: item.id, timestamp: item.timestamp, media_type: item.media_type });
            }
          }
          resolve(null);
        } catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

// 1. Instagram Carousel Publishing
// -------------------------------------------------------------
async function postInstagramCarousel(igUserId, token, caption, imageUrls) {
  if (!igUserId || !imageUrls || imageUrls.length < 2) {
    return { success: false, error: 'Need IG User ID and at least 2 images for carousel' };
  }

  console.log(`    [📸 IG] Creating carousel item containers (${imageUrls.length} images)...`);
  const itemIds = [];

  for (let idx = 0; idx < Math.min(10, imageUrls.length); idx++) {
    const imgUrl = imageUrls[idx];
    if (!imgUrl) continue;

    const itemId = await new Promise((resolve) => {
      const postData = new URLSearchParams({
        access_token: token,
        image_url: imgUrl,
        is_carousel_item: 'true'
      }).toString();

      const req = https.request({
        hostname: 'graph.facebook.com',
        port: 443,
        path: `/v26.0/${igUserId}/media`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.id) {
              console.log(`      [✓ IG Slide ${idx + 1}] Container created: ${parsed.id} (${imgUrl.slice(0, 60)}...)`);
              resolve(parsed.id);
            } else {
              console.error(`      [!] IG Slide ${idx + 1} Container Error:`, parsed.error ? parsed.error.message : data);
              resolve(null);
            }
          } catch (e) {
            console.error(`      [!] IG Slide ${idx + 1} Parse Error:`, e.message);
            resolve(null);
          }
        });
      });
      req.on('error', err => {
        console.error(`      [!] IG Slide ${idx + 1} Request Error:`, err.message);
        resolve(null);
      });
      req.write(postData);
      req.end();
    });

    if (itemId) itemIds.push(itemId);
  }

  if (itemIds.length < 2) {
    return { success: false, error: `Insufficient valid carousel items (got ${itemIds.length})` };
  }

  // Create Carousel Container
  const carouselParams = {
    access_token: token,
    media_type: 'CAROUSEL',
    children: itemIds.join(','),
    caption: caption
  };

  const carouselPostData = new URLSearchParams(carouselParams).toString();

  const containerId = await new Promise((resolve) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      port: 443,
      path: `/v26.0/${igUserId}/media`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(carouselPostData)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.id || null);
        } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(carouselPostData);
    req.end();
  });

  if (!containerId) {
    return { success: false, error: 'Failed to create carousel container' };
  }

  // Poll carousel processing readiness (Meta requires 4-10s to assemble and transcode multi-slide carousels)
  console.log(`    [⏳ IG] Polling Meta carousel readiness for container ${containerId}...`);
  let isReady = false;
  let attempts = 0;
  while (!isReady && attempts < 15) {
    await new Promise(r => setTimeout(r, 3000));
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
      console.log(`    [✓ IG] Carousel container is FINISHED and ready for publishing.`);
      break;
    } else if (statusRes.status_code === 'ERROR') {
      return { success: false, error: 'Carousel processing returned ERROR from Meta' };
    }
  }

  // Publish Carousel
  console.log(`    [🚀 IG] Publishing carousel container (ID: ${containerId})...`);
  const pubParams = {
    access_token: token,
    creation_id: containerId
  };
  const pubPostData = new URLSearchParams(pubParams).toString();

  const publishRes = await new Promise((resolve) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      port: 443,
      path: `/v26.0/${igUserId}/media_publish`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(pubPostData)
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
    req.write(pubPostData);
    req.end();
  });

  return publishRes;
}

// -------------------------------------------------------------
// 1b. Instagram Single Photo Publishing (for Quizzes & Spotlights)
// -------------------------------------------------------------
async function postInstagramSinglePhoto(igUserId, token, caption, imageUrl) {
  if (!igUserId || !imageUrl) return { success: false, error: 'Missing IG ID or image URL' };

  console.log(`    [📸 IG] Creating single photo container: ${imageUrl.slice(0, 70)}...`);
  const postParams = {
    access_token: token,
    image_url: imageUrl,
    caption: caption
  };
  const postData = new URLSearchParams(postParams).toString();

  const containerRes = await new Promise((resolve) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      port: 443,
      path: `/v26.0/${igUserId}/media`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
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
            console.error('    [!] Meta Graph API error in single photo container:', parsed.error || data);
            resolve({ success: false, error: parsed.error ? parsed.error.message : data });
          }
        } catch (e) { resolve({ success: false, error: data }); }
      });
    });
    req.on('error', (err) => resolve({ success: false, error: err.message }));
    req.write(postData);
    req.end();
  });

  if (!containerRes.success || !containerRes.id) {
    return { success: false, error: containerRes.error || 'Failed to create single photo container' };
  }

  const containerId = containerRes.id;

  // Poll container readiness
  let isReady = false;
  let attempts = 0;
  while (!isReady && attempts < 10) {
    await new Promise(r => setTimeout(r, 2000));
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

    if (statusRes.status_code === 'FINISHED' || !statusRes.status_code) {
      isReady = true;
      break;
    } else if (statusRes.status_code === 'ERROR') {
      return { success: false, error: 'Single photo processing returned ERROR from Meta' };
    }
  }

  // Publish Photo
  console.log(`    [🚀 IG] Publishing single photo container (ID: ${containerId})...`);
  const pubParams = {
    access_token: token,
    creation_id: containerId
  };
  const pubPostData = new URLSearchParams(pubParams).toString();

  const publishRes = await new Promise((resolve) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      port: 443,
      path: `/v26.0/${igUserId}/media_publish`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(pubPostData)
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
    req.write(pubPostData);
    req.end();
  });

  return publishRes;
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
// Main Execution with 45-Minute Offset Auto-Discovery
// -------------------------------------------------------------
async function main() {
  console.log('======================================================');
  console.log('📸 Instagram Scheduled Auto-Poster - Born Today Hollywood');
  console.log('======================================================\n');

  if (!fs.existsSync(TODAY_POSTS_PATH)) {
    console.error(`[!] today_posts.json not found at ${TODAY_POSTS_PATH}`);
    process.exit(1);
  }

  if (!DEFAULT_TOKEN) {
    console.error('[!] Missing Meta API token (FB_TOKEN_BORN). Exiting.');
    process.exit(1);
  }

  const rawData = fs.readFileSync(TODAY_POSTS_PATH, 'utf8');
  const data = JSON.parse(rawData);
  const posts = data.posts || [];

  if (posts.length === 0) {
    console.log('[i] No posts found in today_posts.json.');
    process.exit(0);
  }

  // Parse CLI args: --target <1|2|3|quiz_photo_1|quiz_reel_1|quiz_photo_2|quiz_reel_2|auto> --type <carousel|reel|photo|auto>
  const args = process.argv.slice(2);
  let targetArg = 'auto';
  const targetIdx = args.indexOf('--target');
  if (targetIdx !== -1 && args[targetIdx + 1]) {
    targetArg = args[targetIdx + 1].toLowerCase();
  }

  let typeArg = 'auto';
  const typeIdx = args.indexOf('--type');
  if (typeIdx !== -1 && args[typeIdx + 1]) {
    typeArg = args[typeIdx + 1].toLowerCase();
  }

  const quizPosts = data.quiz_posts || [];

  async function executeQuizDrop(targetQuiz, quizAction, data) {
    const celebName = targetQuiz.celebrity_name;
    console.log(`------------------------------------------------------`);
    console.log(`🎯 Executing Instagram Action: [QUIZ ${quizAction.toUpperCase()}] for ${celebName} (${targetQuiz.type})`);
    console.log(`   Window: ${targetQuiz.peak_window || 'Trivia Drop'}`);
    console.log(`------------------------------------------------------\n`);

    // Anti-duplicate check on live Instagram profile
    const livePost = await findLiveInstagramPost(DEFAULT_IG_ID, DEFAULT_TOKEN, celebName, quizAction === 'reel' ? 'reel' : 'photo');
    if (livePost) {
      console.log(`[🛡️ Anti-Duplicate Guard] Found live post on Instagram for ${celebName} (ID: ${livePost.id}). Skipping re-publish!`);
      if (quizAction === 'photo') targetQuiz.ig_post_id = livePost.id;
      if (quizAction === 'reel') targetQuiz.ig_reel_id = livePost.id;
      fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
      process.exit(0);
    }

    const igCaption = formatInstagramCaption(targetQuiz.caption, targetQuiz.hashtags);

    if (quizAction === 'photo') {
      if (targetQuiz.ig_post_id) {
        console.log(`[i] Quiz photo already published for ${celebName} (${targetQuiz.ig_post_id}).`);
        process.exit(0);
      }
      const rawGithubImg = targetQuiz.image_path
        ? `https://raw.githubusercontent.com/aditya-Pratap15/birthday-auto-poster/main/${targetQuiz.image_path.replace(/\\/g, '/')}`
        : null;

      if (!rawGithubImg) {
        console.error(`[!] No image path found for quiz photo (${targetQuiz.id}).`);
        process.exit(1);
      }

      console.log(`[📸 IG] Publishing Quiz Photo for ${celebName}...`);
      const photoRes = await postInstagramSinglePhoto(DEFAULT_IG_ID, DEFAULT_TOKEN, igCaption, rawGithubImg);
      if (photoRes.success && photoRes.id) {
        targetQuiz.ig_post_id = photoRes.id;
        console.log(`    ✅ SUCCESS! Instagram Quiz Photo Published! ID: ${photoRes.id}`);
        fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
      } else {
        console.error(`    [!] Quiz Photo Error:`, photoRes.error);
        const verifyPost = await findLiveInstagramPost(DEFAULT_IG_ID, DEFAULT_TOKEN, celebName, 'photo');
        if (verifyPost) {
          targetQuiz.ig_post_id = verifyPost.id;
          fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
        } else {
          process.exit(1);
        }
      }
    } else if (quizAction === 'reel') {
      if (targetQuiz.ig_reel_id) {
        console.log(`[i] Quiz reel already published for ${celebName} (${targetQuiz.ig_reel_id}).`);
        process.exit(0);
      }
      let reelPath = targetQuiz.reel_path ? path.resolve(BASE_DIR, targetQuiz.reel_path) : '';
      if (!reelPath || !fs.existsSync(reelPath)) {
        console.error(`[!] Quiz reel video not found at ${reelPath}.`);
        process.exit(1);
      }

      console.log(`[🎬 IG] Publishing Quiz Vertical Reel for ${celebName}...`);
      const reelRes = await postInstagramReel(DEFAULT_IG_ID, DEFAULT_TOKEN, igCaption, reelPath);
      if (reelRes.success && reelRes.id) {
        targetQuiz.ig_reel_id = reelRes.id;
        console.log(`    ✅ SUCCESS! Instagram Quiz Reel Published! ID: ${reelRes.id}`);
        fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
      } else {
        console.error(`    [!] Quiz Reel Error:`, reelRes.error);
        const verifyReel = await findLiveInstagramPost(DEFAULT_IG_ID, DEFAULT_TOKEN, celebName, 'reel');
        if (verifyReel) {
          targetQuiz.ig_reel_id = verifyReel.id;
          fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
        } else {
          process.exit(1);
        }
      }
    }

    console.log('\n[🎉] Instagram Quiz Drop completed successfully!');
    process.exit(0);
  }

  // Handle Explicit Quiz Target Drops
  if (targetArg.startsWith('quiz')) {
    let targetQuiz = null;
    let quizAction = 'photo';

    if (targetArg === 'quiz_photo_1' || targetArg === 'quiz_1') {
      targetQuiz = quizPosts.find(q => q.type === 'photo_quiz_type1') || quizPosts[0];
      quizAction = 'photo';
    } else if (targetArg === 'quiz_reel_1' || targetArg === 'quiz_2') {
      targetQuiz = quizPosts.find(q => q.type === 'reel_quiz_type1') || quizPosts[2];
      quizAction = 'reel';
    } else if (targetArg === 'quiz_photo_2' || targetArg === 'quiz_3') {
      targetQuiz = quizPosts.find(q => q.type === 'photo_quiz_type2') || quizPosts[1];
      quizAction = 'photo';
    } else if (targetArg === 'quiz_reel_2' || targetArg === 'quiz_4') {
      targetQuiz = quizPosts.find(q => q.type === 'reel_quiz_type2') || quizPosts[3];
      quizAction = 'reel';
    } else {
      // Generic --target quiz: pick next unpublished quiz
      if (typeArg === 'photo') {
        targetQuiz = quizPosts.find(q => q.type && q.type.startsWith('photo_') && !q.ig_post_id);
        quizAction = 'photo';
      } else if (typeArg === 'reel') {
        targetQuiz = quizPosts.find(q => q.type && q.type.startsWith('reel_') && !q.ig_reel_id);
        quizAction = 'reel';
      } else {
        targetQuiz = quizPosts.find(q => (q.type && q.type.startsWith('photo_') && !q.ig_post_id) || (q.type && q.type.startsWith('reel_') && !q.ig_reel_id));
        quizAction = targetQuiz && targetQuiz.type.startsWith('photo_') ? 'photo' : 'reel';
      }
    }

    if (!targetQuiz) {
      console.log(`[i] Target quiz (${targetArg}) already published or not found in today_posts.json. Nothing to do.`);
      process.exit(0);
    }

    await executeQuizDrop(targetQuiz, quizAction, data);
  }

  const topHeadliners = posts.slice(0, 3);
  let targetPost = null;
  let actionType = null; // 'carousel' or 'reel'

  if (['1', '2', '3'].includes(targetArg)) {
    const idx = parseInt(targetArg, 10) - 1;
    targetPost = topHeadliners[idx];
    if (!targetPost) {
      console.error(`[!] Target headliner index ${targetArg} not found.`);
      process.exit(1);
    }
    if (typeArg === 'carousel' || typeArg === 'reel') {
      actionType = typeArg;
    } else {
      actionType = !targetPost.ig_post_id ? 'carousel' : 'reel';
    }
  } else {
    // Auto Discovery: Scans chronological daily timeline:
    // 1. Headliner 1 (Carousel -> Reel)
    // 2. Quiz 1 Photo (Dylan McDermott)
    // 3. Quiz 2 Reel (Keith Urban)
    // 4. Headliner 2 (Carousel -> Reel)
    // 5. Quiz 3 Photo (Jon Heder)
    // 6. Quiz 4 Reel (James Pickens Jr)
    // 7. Headliner 3 (Carousel -> Reel)

    // Check Headliner 1
    const p1 = topHeadliners[0];
    if (p1) {
      if (!p1.ig_post_id && (typeArg === 'auto' || typeArg === 'carousel')) { targetPost = p1; actionType = 'carousel'; }
      else if (!p1.ig_reel_id && (typeArg === 'auto' || typeArg === 'reel')) { targetPost = p1; actionType = 'reel'; }
    }

    // Check Quiz 1 (Photo) & Quiz 2 (Reel)
    if (!targetPost && (typeArg === 'auto' || typeArg === 'photo')) {
      const q1 = quizPosts.find(q => q.type === 'photo_quiz_type1' || (q.id && q.id.includes('quiz_01')));
      if (q1 && !q1.ig_post_id) {
        await executeQuizDrop(q1, 'photo', data);
      }
    }
    if (!targetPost && (typeArg === 'auto' || typeArg === 'reel')) {
      const q2 = quizPosts.find(q => q.type === 'reel_quiz_type1' || (q.id && q.id.includes('quiz_03')));
      if (q2 && !q2.ig_reel_id) {
        await executeQuizDrop(q2, 'reel', data);
      }
    }

    // Check Headliner 2
    if (!targetPost) {
      const p2 = topHeadliners[1];
      if (p2) {
        if (!p2.ig_post_id && (typeArg === 'auto' || typeArg === 'carousel')) { targetPost = p2; actionType = 'carousel'; }
        else if (!p2.ig_reel_id && (typeArg === 'auto' || typeArg === 'reel')) { targetPost = p2; actionType = 'reel'; }
      }
    }

    // Check Quiz 3 (Photo) & Quiz 4 (Reel)
    if (!targetPost && (typeArg === 'auto' || typeArg === 'photo')) {
      const q3 = quizPosts.find(q => q.type === 'photo_quiz_type2' || (q.id && q.id.includes('quiz_02')));
      if (q3 && !q3.ig_post_id) {
        await executeQuizDrop(q3, 'photo', data);
      }
    }
    if (!targetPost && (typeArg === 'auto' || typeArg === 'reel')) {
      const q4 = quizPosts.find(q => q.type === 'reel_quiz_type2' || (q.id && q.id.includes('quiz_04')));
      if (q4 && !q4.ig_reel_id) {
        await executeQuizDrop(q4, 'reel', data);
      }
    }

    // Check Headliner 3
    if (!targetPost) {
      const p3 = topHeadliners[2];
      if (p3) {
        if (!p3.ig_post_id && (typeArg === 'auto' || typeArg === 'carousel')) { targetPost = p3; actionType = 'carousel'; }
        else if (!p3.ig_reel_id && (typeArg === 'auto' || typeArg === 'reel')) { targetPost = p3; actionType = 'reel'; }
      }
    }
  }

  if (!targetPost || !actionType) {
    console.log('🎉 [i] All 3 Instagram headliners (both Carousels & Reels) are already published today! Nothing to do.');
    process.exit(0);
  }

  const celebName = targetPost.celebrity_name;
  const safeName = (celebName || '').replace(/[^a-zA-Z0-9]/g, '_');
  console.log(`------------------------------------------------------`);
  console.log(`🌟 Executing Instagram Action: [${actionType.toUpperCase()}] for ${celebName}`);
  console.log(`   Window: ${targetPost.peak_window || 'Peak Window'}`);
  console.log(`------------------------------------------------------\n`);

  // -------------------------------------------------------------
  // Pre-Flight Live Instagram Audit: Prevent Duplicate Re-Posting
  // -------------------------------------------------------------
  const livePost = await findLiveInstagramPost(DEFAULT_IG_ID, DEFAULT_TOKEN, celebName, actionType);
  if (livePost) {
    console.log(`[🛡️ Anti-Duplicate Guard] Found live post on Instagram for ${celebName} (ID: ${livePost.id}) published at ${livePost.timestamp}.`);
    console.log(`   ⏭️ Skipping re-publish to prevent duplicate posts on feed!`);
    if (actionType === 'carousel') targetPost.ig_post_id = livePost.id;
    if (actionType === 'reel') targetPost.ig_reel_id = livePost.id;
    fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
    process.exit(0);
  }


  // ACTION A: Publish Carousel
  if (actionType === 'carousel') {
    if (targetPost.ig_post_id) {
      console.log(`[i] Carousel already published for ${celebName} (${targetPost.ig_post_id}).`);
      process.exit(0);
    }

    let igPhotos = [];

    // Permanent Raw GitHub CDN URL for the master collage (never expires, 100% reliable)
    const rawGithubCollage = targetPost.image_path
      ? `https://raw.githubusercontent.com/aditya-Pratap15/birthday-auto-poster/main/${targetPost.image_path.replace(/\\/g, '/')}`
      : null;

    if (rawGithubCollage) {
      console.log(`    [🎨 Primary Collage] Using permanent GitHub Raw CDN: ${rawGithubCollage}`);
      igPhotos.push(rawGithubCollage);
    } else if (targetPost.collage_cdn_url) {
      console.log(`    [🎨 Fallback Collage] Using Meta CDN URL: ${targetPost.collage_cdn_url.slice(0, 60)}...`);
      igPhotos.push(targetPost.collage_cdn_url);
    } else if (targetPost.fb_collage_photo_id) {
      const cdn = await getFacebookPhotoCdnUrl(targetPost.fb_collage_photo_id, DEFAULT_TOKEN);
      if (cdn) {
        targetPost.collage_cdn_url = cdn;
        igPhotos.push(cdn);
      }
    }

    if (targetPost.photo_urls && Array.isArray(targetPost.photo_urls)) {
      igPhotos.push(...targetPost.photo_urls.slice(0, 4));
    }

    if (igPhotos.length >= 2) {
      console.log(`[📸 IG] Publishing Photo Carousel for ${celebName} (${igPhotos.length} images)...`);
      const igCaption = formatInstagramCaption(targetPost.caption, targetPost.hashtags);
      const carRes = await postInstagramCarousel(DEFAULT_IG_ID, DEFAULT_TOKEN, igCaption, igPhotos);
      if (carRes.success && carRes.id) {
        targetPost.ig_post_id = carRes.id;
        console.log(`    ✅ SUCCESS! Instagram Carousel Published! ID: ${carRes.id}`);
        fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');

        // Clean up local collage once successfully published to Instagram (Meta has already downloaded & permanently stored it)
        try {
          if (targetPost.image_path) {
            const colPath = path.resolve(BASE_DIR, targetPost.image_path);
            if (fs.existsSync(colPath)) {
              fs.unlinkSync(colPath);
              console.log(`    🧹 Cleaned up local collage: ${path.basename(colPath)}`);
            }
          }
        } catch (colErr) {
          console.warn(`    [!] Could not unlink local collage:`, colErr.message);
        }
      } else {
        console.error(`    [!] Carousel Error:`, carRes.error);
        const verifyPost = await findLiveInstagramPost(DEFAULT_IG_ID, DEFAULT_TOKEN, celebName, 'carousel');
        if (verifyPost) {
          targetPost.ig_post_id = verifyPost.id;
          console.log(`    [🛡️ Verified Live] Instagram actually published container: ID ${verifyPost.id}`);
          fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
        } else {
          process.exit(1);
        }
      }
    } else {
      console.error(`    [!] Insufficient photos for carousel (found ${igPhotos.length}).`);
      process.exit(1);
    }
  }

  // ACTION B: Publish Vertical Reel
  if (actionType === 'reel') {
    if (targetPost.ig_reel_id) {
      console.log(`[i] Reel already published for ${celebName} (${targetPost.ig_reel_id}).`);
      process.exit(0);
    }

    let reelPath = targetPost.reel_path ? path.resolve(BASE_DIR, targetPost.reel_path) : '';
    if (!reelPath || !fs.existsSync(reelPath)) {
      const fallbackReel = path.join(BASE_DIR, 'reels', safeName + '_Reel.mp4');
      if (fs.existsSync(fallbackReel)) reelPath = fallbackReel;
    }

    if (!reelPath || !fs.existsSync(reelPath)) {
      console.log('  [i] Reel video not found locally on runner. Building on demand for ' + celebName + '...');
      try {
        const { buildReel } = require('./build_reel_studio');
        const targetIdx = topHeadliners.indexOf(targetPost);
        const generatedPath = await buildReel(targetPost, (targetIdx >= 0 ? targetIdx : 0) + 1);
        if (generatedPath && fs.existsSync(generatedPath)) {
          reelPath = generatedPath;
          targetPost.reel_path = path.relative(BASE_DIR, reelPath).replace(/\\/g, '/');
        }
      } catch (buildErr) {
        console.error('  [!] On-demand build failed:', buildErr.message);
      }
    }

    if (!reelPath || !fs.existsSync(reelPath)) {
      console.error('  [!] Reel file not found for ' + celebName + ': ' + reelPath);
      process.exit(1);
    }

    console.log(`[🎬 IG] Publishing Vertical Reel for ${celebName}...`);
    const rawReelCaption = targetPost.reel_caption ||
      `${targetPost.celebrity_name} turns ${targetPost.age} today! 🎂 What is your favorite movie or role of theirs? 🎬\n\n${(targetPost.hashtags || []).join(' ')}`;

    const reelCaption = formatInstagramCaption(rawReelCaption);
    const reelRes = await postInstagramReel(DEFAULT_IG_ID, DEFAULT_TOKEN, reelCaption, reelPath);
    if (reelRes.success && reelRes.id) {
      targetPost.ig_reel_id = reelRes.id;
      console.log(`    ✅ SUCCESS! Instagram Reel Published! ID: ${reelRes.id}`);

      try {
        fs.unlinkSync(reelPath);
        console.log(`    🧹 Cleaned up local reel video: ${path.basename(reelPath)}`);
      } catch (delErr) {
        console.warn(`    [!] Could not delete reel:`, delErr.message);
      }

      fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
    } else {
      console.error(`    [!] Reel Error:`, reelRes.error);
      const verifyReel = await findLiveInstagramPost(DEFAULT_IG_ID, DEFAULT_TOKEN, celebName, 'reel');
      if (verifyReel) {
        targetPost.ig_reel_id = verifyReel.id;
        console.log(`    [🛡️ Verified Live] Instagram actually published Reel: ID ${verifyReel.id}`);
        fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
      } else {
        process.exit(1);
      }
    }
  }

  console.log('\n✨ Instagram scheduled drop completed successfully!');
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
