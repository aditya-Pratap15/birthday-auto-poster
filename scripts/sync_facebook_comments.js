#!/usr/bin/env node
/**
 * scripts/sync_facebook_comments.js
 * 
 * Option B Auto-Comment Syncer for Born Today Hollywood.
 * Runs on every scheduled drop window.
 * Discovers live posts on Facebook that are pending their pinned trivia first comment,
 * publishes the comment to the photo object, and records the comment ID in today_posts.json.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = path.resolve(__dirname, '..');
const TODAY_POSTS_PATH = path.join(BASE_DIR, 'today_posts.json');

// Permanent verified Page Access Token (never expires, full engagement permissions)
const VERIFIED_TOKEN = 'EAAWxAIZCUlZCgBSpd25dCcaBZBrbR8Kxr3rPhEglK6z1YLSM9UN91Gtb5d1ZCVcZAjxVGeBzc17es7XWIwX0yfznnO2HkxaZAeXYHy6NJQONWqhIiwevCjZAcabAKwqvwQHJ1nFCmAs9RPF3XNVHLmc3nUw4PdB2E2YaMYqgXPBLbhUO3EfWTcZAfVFdIEHMwa1E8L5ToS43';
const DEFAULT_TOKEN = (process.env.FB_TOKEN_BORN || process.env.FB_PAGE_TOKEN || VERIFIED_TOKEN).trim();
const DEFAULT_PAGE_ID = (process.env.FB_PAGE_ID_BORN || process.env.FB_PAGE_ID || '1345901645276194').trim();

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

async function syncLiveComments() {
  console.log('======================================================');
  console.log('💬 Facebook Pinned Comment Syncer - Born Today Hollywood');
  console.log('======================================================\n');

  if (!fs.existsSync(TODAY_POSTS_PATH)) {
    console.error(`[!] ${TODAY_POSTS_PATH} not found.`);
    process.exit(1);
  }

  const raw = fs.readFileSync(TODAY_POSTS_PATH, 'utf8');
  const data = JSON.parse(raw);
  const posts = data.posts || [];
  const nowTs = Math.floor(Date.now() / 1000);

  let updatedCount = 0;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const celebName = post.celebrity_name;
    const schedTs = post.scheduled_publish_time || post.unix_timestamp || 0;

    // Check if post has already been posted to FB
    if (!post.fb_post_id && !post.fb_collage_photo_id) {
      continue;
    }

    // Check if comment already exists
    if (post.fb_comment_id) {
      console.log(`[i] ${celebName}: Comment already synced (ID: ${post.fb_comment_id}).`);
      continue;
    }

    // Check if post is live now (either unscheduled or schedule time has passed)
    const isLive = !schedTs || schedTs <= nowTs;
    if (!isLive) {
      const waitMins = Math.round((schedTs - nowTs) / 60);
      console.log(`[⏳] ${celebName}: Post scheduled in future (goes live in ~${waitMins} min). Skipping comment for now.`);
      continue;
    }

    if (!post.comment) {
      console.log(`[i] ${celebName}: No comment text configured.`);
      continue;
    }

    // Target the master collage photo ID (guarantees photo comment placement like Molly Quinn)
    const targetId = post.fb_collage_photo_id || (post.fb_post_id ? post.fb_post_id.split('_')[1] : null) || post.fb_post_id;
    const formattedComment = formatFacebookUnicodeBold(post.comment);

    console.log(`[🚀] Publishing pinned trivia comment for ${celebName} on object ${targetId}...`);
    const cRes = await postComment(targetId, DEFAULT_TOKEN, formattedComment);

    if (cRes.status === 200 && cRes.body && cRes.body.id) {
      post.fb_comment_id = cRes.body.id;
      console.log(`    ✅ SUCCESS! Comment published! Comment ID: ${cRes.body.id}`);
      updatedCount++;
    } else {
      console.warn(`    [!] Comment failed for ${celebName}:`, cRes.body);
    }

    // Brief polite pause
    await new Promise(r => setTimeout(r, 2000));
  }

  if (updatedCount > 0) {
    fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
    console.log(`\n✅ Synced ${updatedCount} comment(s) to today_posts.json.`);
  } else {
    console.log('\n[i] All currently live posts have their comments synced.');
  }
}

if (require.main === module) {
  syncLiveComments().catch(err => {
    console.error('[!] Fatal Error:', err);
    process.exit(1);
  });
}

module.exports = { syncLiveComments };
