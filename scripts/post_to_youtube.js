#!/usr/bin/env node
/**
 * YouTube Shorts Auto Poster & Scheduler (Node.js)
 * Automatically uploads top daily headliner vertical reels to YouTube Shorts
 * via YouTube Data API v3 Resumable Upload protocol.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = path.resolve(__dirname, '..');
const TODAY_POSTS_PATH = path.join(BASE_DIR, 'today_posts.json');

// Verified OAuth credentials (configurable via GitHub Secrets)
const DEFAULT_CLIENT_ID = (process.env.YOUTUBE_CLIENT_ID || '').trim();
const DEFAULT_CLIENT_SECRET = (process.env.YOUTUBE_CLIENT_SECRET || '').trim();
const DEFAULT_REFRESH_TOKEN = (process.env.YOUTUBE_REFRESH_TOKEN || '').trim();

/**
 * Exchange refresh token for fresh OAuth access token
 */
async function getYouTubeAccessToken(clientId, clientSecret, refreshToken) {
  const postData = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      port: 443,
      path: '/token',
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
          const parsed = JSON.parse(data);
          if (parsed.access_token) {
            resolve(parsed.access_token);
          } else {
            reject(new Error(`Failed to refresh token: ${data}`));
          }
        } catch (e) {
          reject(new Error(`Invalid JSON in token refresh response: ${data}`));
        }
      });
    });

    req.on('error', err => reject(err));
    req.write(postData);
    req.end();
  });
}

/**
 * Upload video to YouTube using Resumable Upload
 */
async function uploadYouTubeShort(accessToken, videoPath, metadata, scheduledPublishTime = null) {
  if (!fs.existsSync(videoPath)) {
    return { success: false, error: `Video file not found at ${videoPath}` };
  }

  const fileSize = fs.statSync(videoPath).size;
  const nowTs = Math.floor(Date.now() / 1000);

  // 1. Prepare video resource metadata
  const isScheduled = scheduledPublishTime && (scheduledPublishTime > nowTs + 600);
  const statusObj = {
    privacyStatus: isScheduled ? 'private' : 'public',
    selfDeclaredMadeForKids: false
  };

  if (isScheduled) {
    statusObj.publishAt = new Date(scheduledPublishTime * 1000).toISOString();
  }

  const resourceBody = JSON.stringify({
    snippet: {
      title: metadata.title.slice(0, 100),
      description: metadata.description,
      tags: metadata.tags || ['shorts', 'borntoday', 'hollywood', 'celebrity'],
      categoryId: '24' // Entertainment
    },
    status: statusObj
  });

  // 2. Initialize Resumable Upload session
  const uploadUrl = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.googleapis.com',
      port: 443,
      path: '/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(fileSize),
        'X-Upload-Content-Type': 'video/mp4'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const location = res.headers['location'];
        if (location) {
          resolve(location);
        } else {
          reject(new Error(`Upload init failed (${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', err => reject(err));
    req.write(resourceBody);
    req.end();
  });

  // 3. Upload binary video stream
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(uploadUrl);
    const videoStream = fs.createReadStream(videoPath);

    const req = https.request({
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'PUT',
      headers: {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const video = JSON.parse(data);
          if (video.id) {
            resolve({
              success: true,
              id: video.id,
              url: `https://www.youtube.com/shorts/${video.id}`,
              isScheduled: isScheduled
            });
          } else {
            resolve({ success: false, error: data });
          }
        } catch (e) {
          resolve({ success: false, error: data });
        }
      });
    });

    req.on('error', err => resolve({ success: false, error: err.message }));
    videoStream.pipe(req);
  });
}

async function main() {
  console.log('======================================================');
  console.log('🎬 YouTube Shorts Auto Poster - Born Today Hollywood');
  console.log('======================================================\n');

  if (!fs.existsSync(TODAY_POSTS_PATH)) {
    console.error(`[!] today_posts.json not found at ${TODAY_POSTS_PATH}`);
    process.exit(1);
  }

    if (!DEFAULT_CLIENT_ID || !DEFAULT_CLIENT_SECRET || !DEFAULT_REFRESH_TOKEN) {
    console.error('[!] Missing YouTube credentials. Please set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN in environment / GitHub Secrets.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(TODAY_POSTS_PATH, 'utf8'));
  const posts = data.posts || [];

  if (posts.length === 0) {
    console.log('[i] No posts found for today in today_posts.json.');
    process.exit(0);
  }

  console.log('[🔑] Refreshing Google OAuth Access Token...');
  let accessToken;
  try {
    accessToken = await getYouTubeAccessToken(DEFAULT_CLIENT_ID, DEFAULT_CLIENT_SECRET, DEFAULT_REFRESH_TOKEN);
    console.log('[✅] Google OAuth Access Token refreshed successfully!\n');
  } catch (err) {
    console.error(`[!] Failed to authenticate with YouTube:`, err.message);
    process.exit(1);
  }

  // Top 3 headliners only for YouTube Shorts to prevent algorithm cannibalization
  const topHeadliners = posts.slice(0, 3);
  console.log(`[i] Processing top ${topHeadliners.length} headliners for YouTube Shorts...\n`);

  for (let i = 0; i < topHeadliners.length; i++) {
    const post = topHeadliners[i];
    const celebName = post.celebrity_name;
    const safeName = (celebName || '').replace(/[^a-zA-Z0-9]/g, '_');

    if (post.youtube_video_id) {
      console.log(`[i] YouTube Short for ${celebName} already uploaded (${post.youtube_video_id}), skipping.`);
      continue;
    }

    let reelPath = post.reel_path ? path.resolve(BASE_DIR, post.reel_path) : '';
    if (!reelPath || !fs.existsSync(reelPath)) {
      const fallbackReel = path.join(BASE_DIR, 'reels', `${safeName}_Reel.mp4`);
      if (fs.existsSync(fallbackReel)) reelPath = fallbackReel;
    }

    if (!reelPath || !fs.existsSync(reelPath)) {
      console.log(`[i] No vertical reel found for ${celebName}, skipping YouTube Short.`);
      continue;
    }

    // Scheduling: 60 minutes after Facebook photo (20 min after Instagram Reel)
    const nowTs = Math.floor(Date.now() / 1000);
    const schedTs = post.scheduled_publish_time || post.unix_timestamp || null;
    const ytSchedTs = schedTs ? (schedTs + 3600) : (nowTs + 3600);

    const title = `${celebName} Turns ${post.age} Today! 🎬 #shorts #borntoday`.slice(0, 95);
    const description = `Happy Birthday to ${celebName}! 🎂 Celebrating their ${post.age}th birthday today!\n\n` +
      `🎬 Notable roles & career highlights:\n${post.caption || ''}\n\n` +
      `❓ What is your favorite movie or performance of ${celebName}? Tell us in the comments! 👇\n\n` +
      `📲 Join our VIP WhatsApp Channel: https://whatsapp.com/channel/0029VbEFci9BFLgQsxeUm533\n\n` +
      `#shorts #borntoday #${safeName.toLowerCase()} #celebritybirthdays #hollywood #actor #cinema`;

    const tags = ['shorts', 'borntoday', 'celebrity birthdays', 'hollywood', celebName, 'entertainment'];

    console.log(`[📤] Uploading YouTube Short for: ${celebName}...`);
    const uploadRes = await uploadYouTubeShort(accessToken, reelPath, {
      title,
      description,
      tags
    }, ytSchedTs);

    if (uploadRes.success && uploadRes.id) {
      post.youtube_video_id = uploadRes.id;
      post.youtube_url = uploadRes.url;
      if (uploadRes.isScheduled) {
        console.log(`    [✅] SUCCESS! Short Scheduled on YouTube! ID: ${uploadRes.id}`);
        console.log(`    [🔗] Short Link: ${uploadRes.url}`);
      } else {
        console.log(`    [✅] SUCCESS! Short Published live to YouTube! ID: ${uploadRes.id}`);
        console.log(`    [🔗] Short Link: ${uploadRes.url}`);
      }

      fs.writeFileSync(TODAY_POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
    } else {
      console.error(`    [!] YouTube Upload Error:`, uploadRes.error || uploadRes);
    }

    // Polite 5s delay between YouTube uploads
    if (i < topHeadliners.length - 1) {
      console.log(`    Waiting 5 seconds before next upload...`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log('\n[🎉] YouTube Shorts processing complete!');
}

main().catch(err => {
  console.error('[!] Fatal YouTube Script Error:', err);
  process.exit(1);
});
