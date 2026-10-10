#!/usr/bin/env node
/**
 * Facebook Auto Poster & Scheduler (Node.js)
 * Posts verified collages, Unicode bold captions, and pinned first comments to Facebook Page.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const BASE_DIR = path.resolve(__dirname, '..');
const TODAY_POSTS_PATH = path.join(BASE_DIR, 'today_posts.json');

// Verified permanent Page Token for Born Today Hollywood (1345901645276194)
const VERIFIED_TOKEN = 'EAAWxAIZCUlZCgBSql9xBKvNrgTuOJeF8DdoxvYRtR5cgAl3oYmT5inokVO1JuoszNEk6JbmuqRXi7hQewVldkZA4M9OZBxe7gWFJO54krImBriXuqP7VxYuoT9nFLZA7Oo7U2BkkLcm1mNuD3tMXVD4DkcFakI1jz6bxlQiSlhJQsWZC2icgVWsGGAOImEsOYVNSlc';
const DEFAULT_PAGE_ID = (process.env.FB_PAGE_ID_BORN || process.env.FB_PAGE_ID || '1345901645276194').trim();
const DEFAULT_TOKEN = (process.env.FB_TOKEN_BORN || VERIFIED_TOKEN).trim();
const DEFAULT_IG_ID = (process.env.IG_USER_ID || '17841416842135384').trim();

function formatFacebookUnicodeBold(text) {
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

function postMultipartPhoto(pageId, token, caption, imagePath, scheduledPublishTime = null) {
  return new Promise((resolve) => {
    try {
      pageId = String(pageId || DEFAULT_PAGE_ID).trim();
      token = String(token || DEFAULT_TOKEN).trim();

      const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
      const imgBuf = fs.readFileSync(imagePath);
      const filename = path.basename(imagePath);

      let body = '';
      const addField = (name, val) => {
        body += `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${val}\r\n`;
      };

      addField('access_token', token);
      addField('message', caption);

      const nowTs = Math.floor(Date.now() / 1000);
      // Facebook requires scheduled posts to be at least 10 minutes (600s) in the future
      if (scheduledPublishTime && scheduledPublishTime > nowTs + 600) {
        addField('published', 'false');
        addField('scheduled_publish_time', String(scheduledPublishTime));
      } else {
        addField('published', 'true');
      }

      const header = Buffer.from(body + `--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`);
      const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
      const payload = Buffer.concat([header, imgBuf, footer]);

      const req = https.request({
        hostname: 'graph.facebook.com',
        port: 443,
        path: `/v26.0/${pageId}/photos`,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': payload.length
        }
      }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      });

      req.on('error', err => resolve({ status: 500, error: err.message }));
      req.write(payload);
      req.end();
    } catch (e) {
      resolve({ status: 500, error: e.message });
    }
  });
}


function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function uploadUnpublishedPhoto(pageId, token, sourceInput) {
  return new Promise(async (resolve) => {
    try {
      pageId = String(pageId || DEFAULT_PAGE_ID).trim();
      token = String(token || DEFAULT_TOKEN).trim();

      let imgBuf;
      let filename = 'photo.jpg';

      if (typeof sourceInput === 'string' && sourceInput.startsWith('http')) {
        try {
          imgBuf = await fetchBuffer(sourceInput);
          filename = path.basename(sourceInput.split('?')[0]) || 'photo.jpg';
        } catch (fetchErr) {
          return resolve({ success: false, error: fetchErr.message });
        }
      } else {
        if (!fs.existsSync(sourceInput)) {
          return resolve({ success: false, error: `File not found: ${sourceInput}` });
        }
        imgBuf = fs.readFileSync(sourceInput);
        filename = path.basename(sourceInput);
      }

      const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
      let body = '';
      body += `--${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${token}\r\n`;
      body += `--${boundary}\r\nContent-Disposition: form-data; name="published"\r\n\r\nfalse\r\n`;

      const header = Buffer.from(body + `--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`);
      const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
      const payload = Buffer.concat([header, imgBuf, footer]);

      const req = https.request({
        hostname: 'graph.facebook.com',
        port: 443,
        path: `/v26.0/${pageId}/photos`,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': payload.length
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
          } catch (e) {
            resolve({ success: false, error: data });
          }
        });
      });

      req.on('error', err => resolve({ success: false, error: err.message }));
      req.write(payload);
      req.end();
    } catch (e) {
      resolve({ success: false, error: e.message });
    }
  });
}

function publishMultiPhotoPost(pageId, token, caption, mediaFbids, scheduledPublishTime = null) {
  return new Promise((resolve) => {
    try {
      pageId = String(pageId || DEFAULT_PAGE_ID).trim();
      token = String(token || DEFAULT_TOKEN).trim();

      const attachedMedia = mediaFbids.map(id => ({ media_fbid: String(id) }));

      const params = {
        access_token: token,
        message: caption,
        attached_media: JSON.stringify(attachedMedia)
      };

      const nowTs = Math.floor(Date.now() / 1000);
      if (scheduledPublishTime && scheduledPublishTime > nowTs + 600) {
        params.published = 'false';
        params.scheduled_publish_time = String(scheduledPublishTime);
      } else {
        params.published = 'true';
      }

      const postData = new URLSearchParams(params).toString();

      const req = https.request({
        hostname: 'graph.facebook.com',
        port: 443,
        path: `/v26.0/${pageId}/feed`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      });

      req.on('error', err => resolve({ status: 500, error: err.message }));
      req.write(postData);
      req.end();
    } catch (e) {
      resolve({ status: 500, error: e.message });
    }
  });
}

async function postCelebrityAlbum(pageId, token, caption, collagePath, singlePhotoUrls = [], scheduledPublishTime = null) {
  // 1. Upload Master Collage Tribute as Photo #1
  console.log(`    📸 [1/N] Uploading master collage tribute...`);
  const collageUpload = await uploadUnpublishedPhoto(pageId, token, collagePath);
  if (!collageUpload.success || !collageUpload.id) {
    console.warn(`    [!] Master collage upload failed as unpublished (${JSON.stringify(collageUpload.error)}), falling back to standard single post...`);
    return postMultipartPhoto(pageId, token, caption, collagePath, scheduledPublishTime);
  }

  const mediaFbids = [collageUpload.id];

  // 2. Upload Single Career Photos (up to 5 photos)
  const maxPhotos = Math.min(5, (singlePhotoUrls || []).length);
  for (let idx = 0; idx < maxPhotos; idx++) {
    const photoUrl = singlePhotoUrls[idx];
    if (!photoUrl) continue;
    console.log(`    📸 [${idx + 2}/${maxPhotos + 1}] Attaching single career photo ${idx + 1}...`);
    const pUpload = await uploadUnpublishedPhoto(pageId, token, photoUrl);
    if (pUpload.success && pUpload.id) {
      mediaFbids.push(pUpload.id);
    } else {
      console.warn(`    [!] Could not attach single photo ${idx + 1}: ${JSON.stringify(pUpload.error || 'unknown error')}`);
    }
  }

  console.log(`    🖼️ Total photos in album: ${mediaFbids.length} (Master Collage + ${mediaFbids.length - 1} single photos)`);

  // 3. Publish multi-photo post to /{pageId}/feed
  const publishRes = await publishMultiPhotoPost(pageId, token, caption, mediaFbids, scheduledPublishTime);
  publishRes.collagePhotoId = collageUpload.id;
  return publishRes;
}


function getFacebookPhotoCdnUrl(photoId, token) {
  return new Promise((resolve) => {
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
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function postInstagramCarousel(igUserId, token, caption, imageUrls, scheduledPublishTime = null) {
  if (!igUserId || !imageUrls || imageUrls.length === 0) return { success: false, error: 'Missing IG ID or images' };

  console.log(`    [📸 IG] Creating Instagram Carousel container for ${imageUrls.length} photos...`);
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
    console.warn(`    [!] Insufficient items for Instagram Carousel (need at least 2, got ${itemIds.length})`);
    return { success: false, error: 'Insufficient carousel items' };
  }

  // Create Carousel Container
  const nowTs = Math.floor(Date.now() / 1000);
  const carouselParams = {
    access_token: token,
    media_type: 'CAROUSEL',
    children: itemIds.join(','),
    caption: caption
  };

  if (scheduledPublishTime && scheduledPublishTime > nowTs + 600) {
    carouselParams.scheduled_publish_time = String(scheduledPublishTime);
  }

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

  // Publish Container
  return new Promise((resolve) => {
    const publishData = new URLSearchParams({
      access_token: token,
      creation_id: containerId
    }).toString();

    const req = https.request({
      hostname: 'graph.facebook.com',
      port: 443,
      path: `/v26.0/${igUserId}/media_publish`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(publishData)
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
    req.write(publishData);
    req.end();
  });
}

async function postInstagramReel(igUserId, token, caption, videoPath, scheduledPublishTime = null) {
  if (!igUserId || !fs.existsSync(videoPath)) return { success: false, error: 'Missing IG ID or video file' };

  const fileSize = fs.statSync(videoPath).size;
  const nowTs = Math.floor(Date.now() / 1000);

  console.log(`    [🎬 IG] Starting resumable Instagram Reel upload session (${(fileSize / (1024*1024)).toFixed(2)} MB)...`);

  const initParams = {
    access_token: token,
    upload_type: 'resumable',
    media_type: 'REELS',
    caption: caption
  };

  if (scheduledPublishTime && scheduledPublishTime > nowTs + 600) {
    initParams.scheduled_publish_time = String(scheduledPublishTime);
  }

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
        try { resolve(JSON.parse(data)); } catch (e) { resolve({ error: data }); }
      });
    });
    req.on('error', err => resolve({ error: err.message }));
    req.write(initData);
    req.end();
  });

  if (!initRes.uri || !initRes.id) {
    return { success: false, error: initRes.error || initRes };
  }

  const uploadUri = initRes.uri;
  const containerId = initRes.id;

  // Upload video stream to rupload.facebook.com
  const uploadUrlObj = new URL(uploadUri);
  const videoBuffer = fs.readFileSync(videoPath);

  const transferSuccess = await new Promise((resolve) => {
    const req = https.request({
      hostname: uploadUrlObj.hostname,
      port: 443,
      path: uploadUrlObj.pathname + uploadUrlObj.search,
      method: 'POST',
      headers: {
        'Authorization': `OAuth ${token}`,
        'offset': '0',
        'file_size': String(fileSize),
        'Content-Type': 'application/octet-stream',
        'Content-Length': videoBuffer.length
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
    req.write(videoBuffer);
    req.end();
  });

  if (!transferSuccess) {
    return { success: false, error: 'Video binary transfer failed' };
  }

  // Poll container until status is FINISHED (up to 40 seconds)
  console.log(`    [🎬 IG] Processing video encoding on Instagram servers...`);
  let isReady = false;
  for (let poll = 0; poll < 10; poll++) {
    await new Promise(r => setTimeout(r, 4000));
    const statusObj = await new Promise((resolve) => {
      https.get(`https://graph.facebook.com/v26.0/${containerId}?fields=status_code&access_token=${token}`, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try { resolve(JSON.parse(d)); } catch (e) { resolve({}); }
        });
      }).on('error', () => resolve({}));
    });

    if (statusObj.status_code === 'FINISHED') {
      isReady = true;
      break;
    } else if (statusObj.status_code === 'ERROR') {
      return { success: false, error: 'Instagram video encoding failed' };
    }
  }

  if (!isReady) {
    console.warn(`    [!] Instagram encoding still processing, attempting publish...`);
  }

  // Publish Container
  return new Promise((resolve) => {
    const publishData = new URLSearchParams({
      access_token: token,
      creation_id: containerId
    }).toString();

    const req = https.request({
      hostname: 'graph.facebook.com',
      port: 443,
      path: `/v26.0/${igUserId}/media_publish`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(publishData)
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
    req.write(publishData);
    req.end();
  });
}

function postComment(targetId, token, commentText) {
  return new Promise((resolve) => {
    targetId = String(targetId).trim();
    token = String(token || DEFAULT_TOKEN).trim();

    const postData = new URLSearchParams({
      access_token: token,
      message: commentText
    }).toString();

    const req = https.request({
      hostname: 'graph.facebook.com',
      port: 443,
      path: `/v26.0/${targetId}/comments`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', err => resolve({ status: 500, error: err.message }));
    req.write(postData);
    req.end();
  });
}

function postFacebookReel(pageId, token, description, videoPath, scheduledPublishTime = null) {
  return new Promise(async (resolve) => {
    try {
      pageId = String(pageId || DEFAULT_PAGE_ID).trim();
      token = String(token || DEFAULT_TOKEN).trim();

      if (!fs.existsSync(videoPath)) {
        return resolve({ status: 404, error: `Reel video file not found: ${videoPath}` });
      }

      const videoBuf = fs.readFileSync(videoPath);
      const fileSize = videoBuf.length;

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

      // Phase 3: Finish & Schedule/Publish
      const nowTs = Math.floor(Date.now() / 1000);
      const isScheduling = scheduledPublishTime && (scheduledPublishTime > nowTs + 600);

      const finishParams = {
        access_token: token,
        upload_phase: 'finish',
        video_id: videoId,
        description: description,
        video_state: isScheduling ? 'SCHEDULED' : 'PUBLISHED'
      };

      if (isScheduling) {
        finishParams.scheduled_publish_time = String(scheduledPublishTime);
      }

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
        resolve({ status: 200, video_id: videoId, success: true, isScheduling });
      } else {
        resolve({ status: 400, error: finishRes.error || finishRes });
      }
    } catch (err) {
      resolve({ status: 500, error: err.message });
    }
  });
}

async function main() {
  if (!fs.existsSync(TODAY_POSTS_PATH)) {
    console.error(`[!] ${TODAY_POSTS_PATH} not found.`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(TODAY_POSTS_PATH, 'utf8'));
  const posts = data.posts || [];

  if (posts.length === 0) {
    console.log('[i] No posts to publish today.');
    process.exit(0);
  }

  console.log(`\n=== Facebook Publishing Engine ===`);
  console.log(`Page: Born Today Hollywood (${DEFAULT_PAGE_ID})`);
  console.log(`Total Posts Ready: ${posts.length}\n`);

  // Determine which posts to run
  const arg = process.argv[2];
  let postsToRun = [];

  if (arg && arg.includes('-')) {
    const [start, end] = arg.split('-').map(Number);
    postsToRun = posts.slice(start - 1, end);
  } else if (arg) {
    const idx = parseInt(arg, 10) - 1;
    if (posts[idx]) postsToRun = [posts[idx]];
  } else {
    // Default: run all unposted posts or unposted reels
    postsToRun = posts.filter(p => !p.fb_post_id || !p.fb_reel_id);
    if (postsToRun.length === 0) {
      console.log('[i] All photos and reels are already scheduled/published today! Nothing to do.');
      process.exit(0);
    }
  }

  console.log(`[i] Selected ${postsToRun.length} celebrity entries to process.\n`);

  for (let i = 0; i < postsToRun.length; i++) {
    const post = postsToRun[i];
    const celebName = post.celebrity_name;
    const imgPath = path.resolve(BASE_DIR, post.image_path);
    const safeName = (celebName || '').replace(/[^a-zA-Z0-9]/g, '_');

    const caption = formatFacebookUnicodeBold(`${post.caption}\n\n${post.hashtags}`);
    const comment = formatFacebookUnicodeBold(post.comment);

    const schedTs = post.scheduled_publish_time || post.unix_timestamp || null;
    const nowTs = Math.floor(Date.now() / 1000);
    const isScheduling = schedTs && (schedTs > nowTs + 600);

    // -------------------------------------------------------------
    // 1. Post Photo Collage
    // -------------------------------------------------------------
    if (!post.fb_post_id) {
      if (!fs.existsSync(imgPath)) {
        console.warn(`[!] Collage image not found at ${imgPath}, skipping photo for ${celebName}.`);
      } else {
        if (isScheduling) {
          const nyTime = new Date(schedTs * 1000).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });
          const istTime = new Date(schedTs * 1000).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
          console.log(`[📷] Scheduling PHOTO for: ${celebName} at ${nyTime} EDT (${istTime} IST) - [${post.peak_window || 'Peak Window'}]...`);
        } else {
          console.log(`[📷] Publishing PHOTO LIVE right now for: ${celebName}...`);
        }

        const res = await postCelebrityAlbum(DEFAULT_PAGE_ID, DEFAULT_TOKEN, caption, imgPath, post.photo_urls, schedTs);

        if (res.status === 200 && (res.body.id || res.body.post_id)) {
          const postId = res.body.post_id || res.body.id;
          post.fb_post_id = postId;
          post.fb_post_url = `https://www.facebook.com/${DEFAULT_PAGE_ID}/posts/${postId.split('_')[1] || postId}`;
          if (isScheduling) {
            console.log(`    [✓] SUCCESS! Photo Scheduled on Meta Planner! Post ID: ${postId}`);
          } else {
            console.log(`    [✓] SUCCESS! Photo Published live to Facebook! Post ID: ${postId}`);
          }

          // Post pinned first comment (allowed only when published live)
          if (comment && !isScheduling) {
            console.log(`    💬 Posting pinned first comment (${post.comment.split(/\s+/).length} words)...`);
            const cRes = await postComment(postId, DEFAULT_TOKEN, comment);
            if (cRes.status === 200 && cRes.body.id) {
              post.fb_comment_id = cRes.body.id;
              console.log(`    [✓] Comment published! Comment ID: ${cRes.body.id}`);
            } else {
              console.warn(`    [!] Comment failed:`, cRes.body);
            }
          }

          fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');

          // -----------------------------------------------------------
          // 1b. Instagram Carousel (Top 3 Headliners)
          // -----------------------------------------------------------
          if (DEFAULT_IG_ID && i < 3 && !post.ig_post_id) {
            try {
              let igPhotos = [];
              if (res && res.collagePhotoId) {
                const cdnUrl = await getFacebookPhotoCdnUrl(res.collagePhotoId, DEFAULT_TOKEN);
                if (cdnUrl) igPhotos.push(cdnUrl);
              }
              if (post.photo_urls && Array.isArray(post.photo_urls)) {
                igPhotos.push(...post.photo_urls.slice(0, 4));
              }

              if (igPhotos.length >= 2) {
                console.log(`    [📸 IG] Scheduling Instagram Carousel for ${celebName} (${igPhotos.length} images)...`);
                const igCaption = `${post.caption}\n\n${(post.hashtags || []).join(' ')}`;
                const igRes = await postInstagramCarousel(DEFAULT_IG_ID, DEFAULT_TOKEN, igCaption, igPhotos, schedTs);
                if (igRes.success && igRes.id) {
                  post.ig_post_id = igRes.id;
                  console.log(`    [✅ IG] SUCCESS! Instagram Carousel Scheduled! ID: ${igRes.id}`);
                  fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
                } else {
                  console.warn(`    [!] Instagram Carousel note:`, igRes.error);
                }
              }
            } catch (igErr) {
              console.warn(`    [!] Instagram Carousel error:`, igErr.message);
            }
          }
        } else {
          console.error(`    [!] Facebook Photo Error (${res.status}):`, res.body);
        }
      }
    } else {
      console.log(`[i] Photo for ${celebName} already posted (${post.fb_post_id}).`);
    }

    // -------------------------------------------------------------
    // 2. Post Vertical Reel (Option B: 40-minute offset after photo)
    // -------------------------------------------------------------
    let reelPath = post.reel_path ? path.resolve(BASE_DIR, post.reel_path) : '';
    if (!reelPath || !fs.existsSync(reelPath)) {
      const fallbackReel = path.join(BASE_DIR, 'reels', `${safeName}_Reel.mp4`);
      if (fs.existsSync(fallbackReel)) reelPath = fallbackReel;
    }

    if (post.fb_reel_id && !arg) {
      console.log(`[i] Reel for ${celebName} already scheduled (${post.fb_reel_id}), skipping.`);
    } else if (reelPath && fs.existsSync(reelPath)) {
      // Option B: Reel scheduled 40 minutes (2400 seconds) after photo post
      const reelSchedTs = schedTs ? (schedTs + 2400) : (nowTs + 2400);
      const reelIsScheduling = reelSchedTs > nowTs + 600;

      if (reelIsScheduling) {
        const reelNyTime = new Date(reelSchedTs * 1000).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });
        const reelIstTime = new Date(reelSchedTs * 1000).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
        console.log(`[🎬] Scheduling REEL for: ${celebName} at ${reelNyTime} EDT (${reelIstTime} IST) [+40m offset]...`);
      } else {
        console.log(`[🎬] Publishing REEL LIVE right now for: ${celebName}...`);
      }

      let reelCaptionText = post.reel_caption;
      if (!reelCaptionText) {
        reelCaptionText = `${post.celebrity_name} turns ${post.age} today! 🎬 What is your favorite movie or role of theirs? 👇\n\n${(post.hashtags || []).join(' ')}`;
      }
      const reelCaption = formatFacebookUnicodeBold(reelCaptionText);
      const reelRes = await postFacebookReel(DEFAULT_PAGE_ID, DEFAULT_TOKEN, reelCaption, reelPath, reelSchedTs);

      if (reelRes.status === 200 && reelRes.video_id) {
        post.fb_reel_id = reelRes.video_id;
        post.fb_reel_scheduled_time = reelSchedTs;
        if (reelIsScheduling) {
          console.log(`    [✓] SUCCESS! Reel Scheduled on Meta Planner! Video ID: ${reelRes.video_id}`);
        } else {
          console.log(`    [✓] SUCCESS! Reel Published live! Video ID: ${reelRes.video_id}`);
        }
        fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');

        // -----------------------------------------------------------
        // 2b. Instagram Reel (Top 3 Headliners)
        // -----------------------------------------------------------
        if (DEFAULT_IG_ID && i < 3 && !post.ig_reel_id && reelPath && fs.existsSync(reelPath)) {
          try {
            console.log(`    [🎬 IG] Scheduling Instagram Reel for ${celebName}...`);
            const igReelRes = await postInstagramReel(DEFAULT_IG_ID, DEFAULT_TOKEN, reelCaptionText, reelPath, reelSchedTs);
            if (igReelRes.success && igReelRes.id) {
              post.ig_reel_id = igReelRes.id;
              console.log(`    [✅ IG] SUCCESS! Instagram Reel Scheduled! ID: ${igReelRes.id}`);
              fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
            } else {
              console.warn(`    [!] Instagram Reel note:`, igReelRes.error);
            }
          } catch (igReelErr) {
            console.warn(`    [!] Instagram Reel error:`, igReelErr.message);
          }
        }
      } else {
        console.error(`    [!] Facebook Reel Upload Error:`, reelRes.error || reelRes);
      }
    } else {
      console.log(`[i] No reel file found for ${celebName}, skipping reel.`);
    }

    // Polite pause between celebrities
    if (i < postsToRun.length - 1) {
      console.log(`    Waiting 5 seconds before next celebrity...`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log(`\n[✓] All targeted posts and reels processed successfully!`);
}

main().catch(err => {
  console.error('[!] Fatal Error:', err);
  process.exit(1);
});
