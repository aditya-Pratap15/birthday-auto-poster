#!/usr/bin/env node
/**
 * Facebook Auto Poster & Scheduler (Node.js)
 * Posts verified collages, Unicode bold captions, and pinned first comments to Facebook Page.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = path.resolve(__dirname, '..');
const TODAY_POSTS_PATH = path.join(BASE_DIR, 'today_posts.json');

// Verified permanent Page Token for Born Today Hollywood (1345901645276194)
const VERIFIED_TOKEN = 'EAAWxAIZCUlZCgBSql9xBKvNrgTuOJeF8DdoxvYRtR5cgAl3oYmT5inokVO1JuoszNEk6JbmuqRXi7hQewVldkZA4M9OZBxe7gWFJO54krImBriXuqP7VxYuoT9nFLZA7Oo7U2BkkLcm1mNuD3tMXVD4DkcFakI1jz6bxlQiSlhJQsWZC2icgVWsGGAOImEsOYVNSlc';
const DEFAULT_PAGE_ID = (process.env.FB_PAGE_ID_BORN || process.env.FB_PAGE_ID || '1345901645276194').trim();
const DEFAULT_TOKEN = (process.env.FB_TOKEN_BORN || VERIFIED_TOKEN).trim();

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

        const res = await postMultipartPhoto(DEFAULT_PAGE_ID, DEFAULT_TOKEN, caption, imgPath, schedTs);

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

      const reelCaption = formatFacebookUnicodeBold(`${post.caption}\n\n${post.hashtags}`);
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
