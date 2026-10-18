#!/usr/bin/env node
/**
 * Facebook Interactive Celebrity Quiz Publisher & Scheduler
 * Publishes/Schedules the 4 daily quizzes (2 Photos + 2 Reels) to Facebook Page Planner.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = path.resolve(__dirname, '..');
const TODAY_POSTS_PATH = path.join(BASE_DIR, 'today_posts.json');

const VERIFIED_TOKEN = 'EAAWxAIZCUlZCgBSpd25dCcaBZBrbR8Kxr3rPhEglK6z1YLSM9UN91Gtb5d1ZCVcZAjxVGeBzc17es7XWIwX0yfznnO2HkxaZAeXYHy6NJQONWqhIiwevCjZAcabAKwqvwQHJ1nFCmAs9RPF3XNVHLmc3nUw4PdB2E2YaMYqgXPBLbhUO3EfWTcZAfVFdIEHMwa1E8L5ToS43';
const DEFAULT_PAGE_ID = (process.env.FB_PAGE_ID_BORN || process.env.FB_PAGE_ID || '1345901645276194').trim();
const DEFAULT_TOKEN = (process.env.FB_TOKEN_BORN || VERIFIED_TOKEN).trim();

function formatFacebookUnicodeBold(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\*\*(.+?)\*\*/g, (_, s) => {
    return Array.from(s).map(c => {
      const code = c.charCodeAt(0);
      if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D5D4 + code - 65);
      if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D5EE + code - 97);
      if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7EC + code - 48);
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
          r.on('end', () => {
            try { resP(JSON.parse(d)); } catch (e) { resP({ success: true, raw: d }); }
          });
        });
        req.on('error', rejP);
        req.write(videoBuf);
        req.end();
      });

      const nowTs = Math.floor(Date.now() / 1000);
      const isScheduling = scheduledPublishTime && scheduledPublishTime > nowTs + 600;

      const finishParams = {
        access_token: token,
        upload_phase: 'finish',
        video_id: videoId,
        video_state: isScheduling ? 'SCHEDULED' : 'PUBLISHED',
        description: description
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
          r.on( 'end', () => {
            try { resP(JSON.parse(d)); } catch (e) { resP({
              raw: d
            }); }
          });
        });
        req.on('error', rejP);
        req.write(finishData);
        req.end();
      });

      if (finishRes.success || finishRes.id) {
        resolve({ status: 200, video_id: videoId, details: finishRes });
      } else {
        resolve({ status: 400, error: finishRes.error || finishRes });
      }
    } catch (err) {
      resolve({ status: 500, error: err.message });
    }
  });
}
function fetchScheduledPosts(pageId, token) {
  return new Promise((resolve) => {
    https.get('https://graph.facebook.com/v26.0/' + pageId + '/scheduled_posts?fields=id,message,scheduled_publish_time&limit=50&access_token=' + token, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(d);
          resolve(p.data || []);
        } catch (e) { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

async function main() {
  if (!fs.existsSync(TODAY_POSTS_PATH)) {
    console.error(`[!] ${TODAY_POSTS_PATH} not found.`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(TODAY_POSTS_PATH, 'utf8'));
  const quizPosts = data.quiz_posts || [];

  if (quizPosts.length === 0) {
    console.log('[i] No interactive quiz posts found in today_posts.json.');
    process.exit(0);
  }

  console.log(`\n === Interactive Celebrity Quiz Publisher ===`);
  console.log(`Page: Born Today Hollywood (${DEFAULT_PAGE_ID})`);
  console.log(`Total Quizzes Ready: ${quizPosts.length}\n`);

  const nowTs = Math.floor(Date.now() / 1000);

  for (let idx = 0; idx < quizPosts.length; idx++) {
    const q = quizPosts[idx];
    const qName = q.celebrity_name;
    const qSchedTs = q.scheduled_publish_time || null;
    const isSched = qSchedTs && (qSchedTs > nowTs + 600);

    const caption = formatFacebookUnicodeBold(`${q.caption}\n\n${q.hashtags || ''}`);

    // 1. Photo Quizzes
    if (q.type && q.type.startsWith('photo_')) {
      if (!q.fb_post_id) {
        const imgPath = path.resolve(BASE_DIR, q.image_path);
        if (!fs.existsSync(imgPath)) {
          console.warn(`[!] Quiz photo file not found at ${path.basename(imgPath)}, skipping.`);
        } else {
          if (isSched) {
            const nyTime = new Date(qSchedTs * 1000).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });
            const istTime = new Date(qSchedTs * 1000).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
            console.log(`[photo] Scheduling QUIZ PHOTO for: ${qName} at ${nyTime} EDT (${istTime} IST) - [${q.peak_window || 'Trivia'}]...`);
          } else {
            console.log(`[photo] Publishing QUIZ LIVE for[ ${qName}]...`);
          }

          const res = await postMultipartPhoto(DEFAULT_PAGE_ID, DEFAULT_TOKEN, caption, imgPath, qSchedTs);
          if (res.status === 200 && (res.body.id || res.body.post_id)) {
            const postId = res.body.post_id || res.body.id;
            q.fb_post_id = postId;
            q.fb_post_url = `https://www.facebook.com/${DEFAULT_PAGE_ID}/posts/${postId.split('_')[1] || postId}`;
            console.log(`    [SUCCESS] Quiz Photo Post ID: ${postId}`);
            fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
          } else {
            console.error(`    [ERROR] Facebook Quiz Photo Error:`, res.body || res.error);
          }
        }
      } else {
        console.log(`[i] Quiz photo for ${qName} already processed (${q.fb_post_id}).`);
      }
    }

    // 2. Reel Quizzes
    if (q.type && q.type.startsWith('reel_')) {
      if (!q.fb_reel_id) {
        const reelPath = path.resolve(BASE_DIR, q.reel_path);
        if (!fs.existsSync(reelPath)) {
          console.warn(`[!] Quiz reel file not found at ${path.basename(reelPath)}, skipping.`);
        } else {
          if (isSched) {
            const nyTime = new Date(qSchedTs * 1000).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });
            const istTime = new Date(qSchedTs * 1000).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
            console.log(`[reel] Scheduling QUIZ REEL for: ${qName} at ${nyTime} EDT (${istTime} IST) - [${q.peak_window || 'Trivia'}]...`);
          } else {
            console.log(`[reel] Publishing QUIZ REEL LIVE for[ ${qName}]...`);
          }

          const reelRes = await postFacebookReel(DEFAULT_PAGE_ID, DEFAULT_TOKEN, caption, reelPath, qSchedTs);
          if (reelRes.status === 200 && reelRes.video_id) {
            q.fb_reel_id = reelRes.video_id;
            console.log(`    [SUCCESS] Quiz Reel Video ID: ${reelRes.video_id}`);
            fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
          } else {
            console.error(`    [ERROR] Facebook Quiz Reel Error:`, reelRes.error || reelRes);
          }
        }
      } else {
        console.log(`[i] Quiz reel for ${qName} already processed (${q.fb_reel_id}).`);
      }
      }

    if (idx < quizPosts.length - 1) {
      await new Promise(r => setTimeout(r, 4000));
    }
  }

  console.log(`\n[Success] All interactive quizzes processed successfully!\n`);
}


main().catch(err => {
  console.error('[!] Fatal Error in Quiz Publisher:', err);
  process.exit(1);
});
