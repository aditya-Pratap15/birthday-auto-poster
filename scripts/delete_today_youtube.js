#!/usr/bin/env node
/**
 * YouTube Specific Celebrity Deletion Tool
 * Finds and permanently deletes videos for specified celebrities on the authenticated channel.
 * Queries BOTH search.list (forMine=true, capturing private & scheduled videos)
 * and playlistItems.list (capturing all uploads).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

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

function httpsGetJson(url, accessToken) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
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
        const ok = res.statusCode === 204 || res.statusCode === 200;
        console.log(`[🗑️] Delete HTTP status for ${videoId}: ${res.statusCode} (${ok ? 'SUCCESS' : 'FAILED'})`);
        resolve(ok);
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function getAllUploads(accessToken) {
  const videoMap = new Map();

  // 1. Search for all videos belonging to authenticated channel (includes public, unlisted, private, scheduled)
  try {
    console.log('[i] Querying search.list (forMine=true)...');
    let nextPageToken = '';
    do {
      const pageUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&order=date&maxResults=50${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
      const searchData = await httpsGetJson(pageUrl, accessToken);
      if (searchData && searchData.items) {
        for (const item of searchData.items) {
          const vId = item.id?.videoId;
          if (vId && !videoMap.has(vId)) {
            videoMap.set(vId, {
              videoId: vId,
              title: item.snippet?.title || '',
              publishedAt: item.snippet?.publishedAt || ''
            });
          }
        }
        nextPageToken = searchData.nextPageToken || '';
      } else {
        nextPageToken = '';
      }
    } while (nextPageToken && videoMap.size < 100);
  } catch (err) {
    console.warn('[!] Search API warning:', err.message);
  }

  // 2. Also query uploads playlist to ensure no public/unlisted uploads were missed
  try {
    const channelData = await httpsGetJson('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true', accessToken);
    if (channelData && channelData.items && channelData.items.length > 0) {
      const uploadPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;
      console.log(`[i] Querying uploads playlist (${uploadPlaylistId})...`);
      let nextPageToken = '';
      do {
        const pUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,status&playlistId=${uploadPlaylistId}&maxResults=50${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
        const playlistData = await httpsGetJson(pUrl, accessToken);
        if (playlistData && playlistData.items) {
          for (const item of playlistData.items) {
            const vId = item.snippet?.resourceId?.videoId;
            if (vId && !videoMap.has(vId)) {
              videoMap.set(vId, {
                videoId: vId,
                title: item.snippet?.title || '',
                publishedAt: item.snippet?.publishedAt || ''
              });
            }
          }
          nextPageToken = playlistData.nextPageToken || '';
        } else {
          nextPageToken = '';
        }
      } while (nextPageToken && videoMap.size < 100);
    }
  } catch (err) {
    console.warn('[!] Uploads playlist warning:', err.message);
  }

  return Array.from(videoMap.values());
}

async function main() {
  console.log('=== YouTube Specific Video Deletion ===');
  if (!DEFAULT_CLIENT_ID || !DEFAULT_CLIENT_SECRET || !DEFAULT_REFRESH_TOKEN) {
    console.error('[!] Missing YouTube credentials in environment.');
    process.exit(1);
  }

  const targets = [
    'ming-na wen', 'joel mchale', 'sean young',
    'andrea riseborough', 'bo derek', 'jeremy jordan', 'nadine velazquez'
  ];
  const targetIds = ['Fr5cycMNHIg', 'IoS-VuESm2w', 'mph_5AC0Lz0'];
  console.log('Target celebrities to remove from YouTube:', targets);
  console.log('Target video IDs to delete:', targetIds);

  const accessToken = await getYouTubeAccessToken(DEFAULT_CLIENT_ID, DEFAULT_CLIENT_SECRET, DEFAULT_REFRESH_TOKEN);
  console.log('[✓] YouTube Access Token refreshed successfully.');

  let deletedCount = 0;

  // 1. Directly delete known target video IDs
  for (const id of targetIds) {
    try {
      console.log(`[🎯 TARGET ID] Deleting video ${id}...`);
      const ok = await deleteVideo(accessToken, id);
      if (ok) {
        deletedCount++;
        console.log(`   [✅] Deleted ID: ${id}`);
      }
    } catch (e) {
      console.warn(`   [!] Could not delete ID ${id}:`, e.message);
    }
  }

  // 2. Scan channel for any remaining videos matching target celebrities
  const videos = await getAllUploads(accessToken);
  console.log(`[i] Retrieved total ${videos.length} videos from channel.\n`);

  for (const v of videos) {
    if (!v.videoId) continue;
    if (targetIds.includes(v.videoId)) continue; // already handled
    const titleLower = v.title.toLowerCase();
    const isTarget = targets.some(t => titleLower.includes(t));

    if (isTarget) {
      console.log(`[🎯 TARGET FOUND] Video ID: ${v.videoId} | Title: "${v.title}"`);
      console.log(`   Deleting from YouTube...`);
      const success = await deleteVideo(accessToken, v.videoId);
      if (success) {
        deletedCount++;
        console.log(`   [✅] Deleted: ${v.videoId}`);
      } else {
        console.error(`   [❌] Failed to delete: ${v.videoId}`);
      }
    } else {
      console.log(` - Preserving: ${v.videoId} | "${v.title}"`);
    }
  }

  console.log(`\n[✓] Done! Deleted ${deletedCount} targeted YouTube Short(s).`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = [
      '# YouTube Targeted Deletion Report',
      `- Total videos retrieved: ${videos.length}`,
      `- Total targeted deletions: ${deletedCount}`,
      ...videos.map(v => {
        const titleLower = v.title.toLowerCase();
        const isTarget = targets.some(t => titleLower.includes(t));
        return `- [${isTarget ? 'DELETED' : 'PRESERVED'}] ${v.videoId} - ${v.title}`;
      })
    ].join('\n');
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n', 'utf8');
    } catch(e) {}
  }
}

main().catch(err => {
  console.error('[!] Fatal deletion error:', err.message || err);
  process.exit(1);
});
