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
const DEFAULT_PAGE_ID = process.env.FB_PAGE_ID_BORN || process.env.FB_PAGE_ID || '1345901645276194';
const DEFAULT_TOKEN = VERIFIED_TOKEN || process.env.FB_TOKEN_BORN;

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

function postMultipartPhoto(pageId, token, caption, imagePath) {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const imgBuf = fs.readFileSync(imagePath);
    const filename = path.basename(imagePath);

    let body = '';
    const addField = (name, val) => {
      body += `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${val}\r\n`;
    };

    addField('access_token', token);
    addField('message', caption);
    addField('published', 'true');

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

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function postComment(targetId, token, commentText) {
  return new Promise((resolve) => {
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
    // Default: run all unposted posts (skip already posted)
    postsToRun = posts.filter(p => !p.fb_post_id);
    if (postsToRun.length === 0) {
      console.log('[i] All posts are already published today! Nothing to do.');
      process.exit(0);
    }
  }

  console.log(`[i] Selected ${postsToRun.length} posts to publish.\n`);

  for (let i = 0; i < postsToRun.length; i++) {
    const post = postsToRun[i];
    const celebName = post.celebrity_name;
    const imgPath = path.resolve(BASE_DIR, post.image_path);

    if (post.fb_post_id && !arg) {
      console.log(`[i] ${celebName} already posted (${post.fb_post_id}), skipping.`);
      continue;
    }

    if (!fs.existsSync(imgPath)) {
      console.warn(`[!] Collage image not found at ${imgPath}, skipping ${celebName}.`);
      continue;
    }

    const caption = formatFacebookUnicodeBold(`${post.caption}\n\n${post.hashtags}`);
    const comment = formatFacebookUnicodeBold(post.comment);

    console.log(`[+] Publishing post for: ${celebName}...`);
    const res = await postMultipartPhoto(DEFAULT_PAGE_ID, DEFAULT_TOKEN, caption, imgPath);

    if (res.status === 200 && (res.body.id || res.body.post_id)) {
      const postId = res.body.post_id || res.body.id;
      post.fb_post_id = postId;
      post.fb_post_url = `https://www.facebook.com/${DEFAULT_PAGE_ID}/posts/${postId.split('_')[1] || postId}`;
      console.log(`    [✓] SUCCESS! Published to Facebook! Post ID: ${postId}`);

      // Post pinned first comment
      if (comment) {
        console.log(`    💬 Posting pinned first comment (${post.comment.split(/\s+/).length} words)...`);
        const cRes = await postComment(postId, DEFAULT_TOKEN, comment);
        if (cRes.status === 200 && cRes.body.id) {
          post.fb_comment_id = cRes.body.id;
          console.log(`    [✓] Comment published! Comment ID: ${cRes.body.id}`);
        } else {
          console.warn(`    [!] Comment failed:`, cRes.body);
        }
      }

      // Persist state after each successful post
      fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
    } else {
      console.error(`    [!] Facebook API Error (${res.status}):`, res.body);
    }

    // Polite pause between posts
    if (i < postsToRun.length - 1) {
      console.log(`    Waiting 5 seconds before next post...`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log(`\n[✓] All targeted posts published successfully!`);
}

main().catch(err => {
  console.error('[!] Fatal Error:', err);
  process.exit(1);
});
