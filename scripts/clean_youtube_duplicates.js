#!/usr/bin/env node
/**
 * YouTube Duplicate Cleanup Engine
 * Finds and removes duplicate scheduled/private YouTube Shorts on the channel.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = path.resolve(__dirname, '..');
const TODAY_POSTS_PATH = path.join(BASE_DIR, 'today_posts.json');

const DEFAULT_CLIENT_ID = (process.env.YOUTUBE_CLIENT_ID || '').trim();
const DEFAULT_CLIENT_SECRET = (process.env.YOUTUBE_CLIENT_SECRET || '').trim();
const DEFAULT_REFRESH_TOKEN = (process.env.YOUTUBE_REFRESH_TOKEN || '').trim();

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
          if (parsed.access_token) resolve(parsed.access_token);
          else reject(new Error(`Failed to refresh token: ${data}`));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', err => reject(err));
    req.write(postData);
    req.end();
  });
}

function searchMyRecentVideos(accessToken) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'www.googleapis.com',
      port: 443,
      path: '/youtube/v3/search?part=snippet&forMine=true&type=video&order=date&maxResults=25',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.items || []);
        } catch (e) { resolve([]); }
      });
    }).on('error', reject);
  });
}

function deleteVideo(accessToken, videoId) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.googleapis.com',
      port: 443,
      path: `/youtube/v3/videos?id=${videoId}`,
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`[🗑️] Delete result for ${videoId}: status ${res.statusCode}`);
        resolve(res.statusCode === 204 || res.statusCode === 200);
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('=== YouTube Duplicate Cleanup Engine ===');
  if (!DEFAULT_CLIENT_ID || !DEFAULT_CLIENT_SECRET || !DEFAULT_REFRESH_TOKEN) {
    console.error('[!] Missing YouTube credentials in environment.');
    process.exit(1);
  }

  const accessToken = await getYouTubeAccessToken(DEFAULT_CLIENT_ID, DEFAULT_CLIENT_SECRET, DEFAULT_REFRESH_TOKEN);
  console.log('[✓] Access token obtained.');

  const videos = await searchMyRecentVideos(accessToken);
  console.log(`[i] Found ${videos.length} recent videos on channel.\n`);

  let keptIds = [];
  if (fs.existsSync(TODAY_POSTS_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(TODAY_POSTS_PATH, 'utf8'));
      (data.posts || []).forEach(p => { if (p.youtube_video_id) keptIds.push(p.youtube_video_id); });
      (data.quiz_posts || []).forEach(q => { if (q.youtube_video_id) keptIds.push(q.youtube_video_id); });
    } catch(e) {}
  }
  console.log('[i] Video IDs to preserve (from today_posts.json):', keptIds, '\n');

  const seenTitles = new Map();
  for (const item of videos) {
    if (!item.id || !item.id.videoId) continue;
    const vId = item.id.videoId;
    const title = (item.snippet && item.snippet.title) || '';
    console.log(` - Video: ${vId} | Published: ${item.snippet.publishedAt} | Title: ${title}`);

    // Clean title for comparison
    const normTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (!seenTitles.has(normTitle)) {
      seenTitles.set(normTitle, vId);
    } else {
      // DUPLICATE DETECTED!
      const originalId = seenTitles.get(normTitle);
      const deleteId = (keptIds.includes(vId) && !keptIds.includes(originalId)) ? originalId : vId;
      console.log(`[⚠️ DUPLICATE FOUND] "${title}"`);
      console.log(`   Keeping: ${deleteId === vId ? originalId : vId}`);
      console.log(`   Deleting duplicate: ${deleteId}`);
      await deleteVideo(accessToken, deleteId);
    }
  }

  console.log('\n[✓] YouTube duplicate cleanup finished!');
}

main().catch(err => {
  console.error('[!] Error in cleanup:', err);
  process.exit(1);
});