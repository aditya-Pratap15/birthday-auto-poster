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
            resolve(parsed.id || null);
          } catch (e) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
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
        'file_size': fileSize.toString()
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

  // Parse CLI args: --target <1|2|3|auto> --type <carousel|reel|auto>
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
    // Auto Discovery: Scans headliners 1 -> 2 -> 3
    for (let idx = 0; idx < topHeadliners.length; idx++) {
      const p = topHeadliners[idx];
      if (!p.ig_post_id && (typeArg === 'auto' || typeArg === 'carousel')) {
        targetPost = p;
        actionType = 'carousel';
        break;
      }
      if (!p.ig_reel_id && (typeArg === 'auto' || typeArg === 'reel')) {
        targetPost = p;
        actionType = 'reel';
        break;
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

  // ACTION A: Publish Carousel
  if (actionType === 'carousel') {
    if (targetPost.ig_post_id) {
      console.log(`[i] Carousel already published for ${celebName} (${targetPost.ig_post_id}).`);
      process.exit(0);
    }

    let igPhotos = [];
    if (targetPost.collage_cdn_url) {
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
      const igCaption = formatUnicodeBold(`${targetPost.caption}\n\n${(targetPost.hashtags || []).join(' ')}`);
      const carRes = await postInstagramCarousel(DEFAULT_IG_ID, DEFAULT_TOKEN, igCaption, igPhotos);
      if (carRes.success && carRes.id) {
        targetPost.ig_post_id = carRes.id;
        console.log(`    ✅ SUCCESS! Instagram Carousel Published! ID: ${carRes.id}`);
        fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
      } else {
        console.error(`    [!] Carousel Error:`, carRes.error);
        process.exit(1);
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
      const fallbackReel = path.join(BASE_DIR, 'reels', `${safeName}_Reel.mp4`);
      if (fs.existsSync(fallbackReel)) reelPath = fallbackReel;
    }

    if (!reelPath || !fs.existsSync(reelPath)) {
      console.error(`[!] Reel file not found for ${celebName}: ${reelPath}`);
      process.exit(1);
    }

    console.log(`[🎬 IG] Publishing Vertical Reel for ${celebName}...`);
    const rawReelCaption = targetPost.reel_caption ||
      `${targetPost.celebrity_name} turns ${targetPost.age} today! 🎂 What is your favorite movie or role of theirs? 🎬\n\n${(targetPost.hashtags || []).join(' ')}`;

    const reelCaption = formatUnicodeBold(rawReelCaption);
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
      process.exit(1);
    }
  }

  console.log('\n✨ Instagram scheduled drop completed successfully!');
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
