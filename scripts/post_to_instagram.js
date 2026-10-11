/**
 * scripts/post_to_instagram.js
 * 
 * Omnichannel Dedicated Instagram Auto-Poster for Born Today Hollywood.
 * Supports spaced-out publishing for the Top 3 Headliners:
 *   - Headliner 1: 5:30 PM IST (8:00 AM EDT / US Morning Commute)
 *   - Headliner 2: 10:30 PM IST (1:00 PM EDT / US Lunchtime)
 *   - Headliner 3: 3:30 AM IST (6:00 PM EDT / US Evening Primetime)
 *
 * For each headliner, publishes:
 *   1. Swipeable Multi-Photo Carousel (Master Collage #1 + 4 Career Highlights)
 *   2. Vertical 9:16 Video Reel with animated captions & neural voiceover
 *
 * Automatically deletes uploaded local reel video to keep Git repository lightweight.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = path.resolve(__dirname, '..');
const TODAY_POSTS_PATH = path.join(BASE_DIR, 'today_posts.json');

const DEFAULT_IG_ID = process.env.IG_USER_ID || '17841416842135384';
const DEFAULT_TOKEN = process.env.FB_TOKEN_BORN || process.env.FB_PAGE_TOKEN;

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
// Main Execution
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

  // Parse CLI args: --target <1|2|3|next|all>
  const args = process.argv.slice(2);
  let targetMode = 'next';
  const targetIdx = args.indexOf('--target');
  if (targetIdx !== -1 && args[targetIdx + 1]) {
    targetMode = args[targetIdx + 1].toLowerCase();
  }

  const topHeadliners = posts.slice(0, 3);
  let selectedPosts = [];

  if (targetMode === 'all') {
    selectedPosts = topHeadliners;
  } else if (['1', '2', '3'].includes(targetMode)) {
    const idx = parseInt(targetMode, 10) - 1;
    if (topHeadliners[idx]) selectedPosts = [topHeadliners[idx]];
  } else {
    // Mode 'next': Find the first unposted headliner
    const nextUnposted = topHeadliners.find(p => !p.ig_post_id || !p.ig_reel_id);
    if (!nextUnposted) {
      console.log('🎉 [i] All 3 Instagram headliners are already posted today! Nothing to do.');
      process.exit(0);
    }
    selectedPosts = [nextUnposted];
  }

  console.log(`[i] Selected ${selectedPosts.length} headliner(s) for Instagram publishing.\n`);

  for (const post of selectedPosts) {
    const celebName = post.celebrity_name;
    const safeName = (celebName || '').replace(/[^a-zA-Z0-9]/g, '_');
    console.log(`------------------------------------------------------`);
    console.log(`🌟 Processing Instagram Drop for: ${celebName}`);
    console.log(`   Window: ${post.peak_window || 'Peak Window'}`);
    console.log(`------------------------------------------------------`);

    // 1. Post Carousel Album
    if (!post.ig_post_id) {
      try {
        let igPhotos = [];
        if (post.collage_cdn_url) {
          igPhotos.push(post.collage_cdn_url);
        } else if (post.fb_collage_photo_id) {
          const cdn = await getFacebookPhotoCdnUrl(post.fb_collage_photo_id, DEFAULT_TOKEN);
          if (cdn) {
            post.collage_cdn_url = cdn;
            igPhotos.push(cdn);
          }
        }

        if (post.photo_urls && Array.isArray(post.photo_urls)) {
          igPhotos.push(...post.photo_urls.slice(0, 4));
        }

        if (igPhotos.length >= 2) {
          console.log(`[📸 IG] Publishing Photo Carousel for ${celebName} (${igPhotos.length} images)...`);
          const igCaption = `${post.caption}\n\n${(post.hashtags || []).join(' ')}`;
          const carRes = await postInstagramCarousel(DEFAULT_IG_ID, DEFAULT_TOKEN, igCaption, igPhotos);
          if (carRes.success && carRes.id) {
            post.ig_post_id = carRes.id;
            console.log(`    ✅ SUCCESS! Instagram Carousel Published! ID: ${carRes.id}`);
            fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
          } else {
            console.warn(`    [!] Carousel Error:`, carRes.error);
          }
        } else {
          console.warn(`    [!] Insufficient photos to form carousel (found ${igPhotos.length}).`);
        }
      } catch (err) {
        console.error(`    [!] Carousel Exception:`, err.message);
      }
    } else {
      console.log(`[i] Carousel already posted for ${celebName} (${post.ig_post_id}).`);
    }

    // 2. Post Vertical Reel
    let reelPath = post.reel_path ? path.resolve(BASE_DIR, post.reel_path) : '';
    if (!reelPath || !fs.existsSync(reelPath)) {
      const fallbackReel = path.join(BASE_DIR, 'reels', `${safeName}_Reel.mp4`);
      if (fs.existsSync(fallbackReel)) reelPath = fallbackReel;
    }

    if (!post.ig_reel_id && reelPath && fs.existsSync(reelPath)) {
      try {
        console.log(`[🎬 IG] Publishing Vertical Reel for ${celebName}...`);
        const reelCaption = post.reel_caption ||
          `${post.celebrity_name} turns ${post.age} today! 🎂 What is your favorite movie or role of theirs? 🎬\n\n${(post.hashtags || []).join(' ')}`;

        const reelRes = await postInstagramReel(DEFAULT_IG_ID, DEFAULT_TOKEN, reelCaption, reelPath);
        if (reelRes.success && reelRes.id) {
          post.ig_reel_id = reelRes.id;
          console.log(`    ✅ SUCCESS! Instagram Reel Published! ID: ${reelRes.id}`);

          try {
            fs.unlinkSync(reelPath);
            console.log(`    🧹 Cleaned up local reel video: ${path.basename(reelPath)}`);
          } catch (delErr) {
            console.warn(`    [!] Could not delete reel:`, delErr.message);
          }

          fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
        } else {
          console.warn(`    [!] Reel Error:`, reelRes.error);
        }
      } catch (rErr) {
        console.error(`    [!] Reel Exception:`, rErr.message);
      }
    } else if (post.ig_reel_id) {
      console.log(`[i] Reel already posted for ${celebName} (${post.ig_reel_id}).`);
    } else {
      console.log(`[i] No reel file found for ${celebName}.`);
    }
  }

  console.log('\n✨ Instagram drop processing complete!');
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
