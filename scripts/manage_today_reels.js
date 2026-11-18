const https = require('https');

const VERIFIED_TOKEN = 'EAAWxAIZCUlZCgBSpd25dCcaBZBrbR8Kxr3rPhEglK6z1YLSM9UN91Gtb5d1ZCVcZAjxVGeBzc17es7XWIwX0yfznnO2HkxaZAeXYHy6NJQONWqhIiwevCjZAcabAKwqvwQHJ1nFCmAs9RPF3XNVHLmc3nUw4PdB2E2YaMYqgXPBLbhUO3EfWTcZAfVFdIEHMwa1E8L5ToS43';
const PAGE_ID = '1345901645276194';
const IG_ID = '17841416842135384';

function apiCall(path, method = 'GET') {
  return new Promise((resolve) => {
    const sep = path.includes('?') ? '&' : '?';
    const fullPath = `${path}${sep}access_token=${VERIFIED_TOKEN}`;
    const req = https.request({
      hostname: 'graph.facebook.com',
      port: 443,
      path: fullPath,
      method: method
    }, (res) => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { resolve({ error: d }); }
      });
    });
    req.on('error', err => resolve({ error: err.message }));
    req.end();
  });
}

async function run() {
  console.log('=== Checking Facebook Video Reels ===');
  const fbReels = await apiCall(`/v26.0/${PAGE_ID}/video_reels?fields=id,description,created_time`);
  console.log('FB Reels count:', fbReels.data ? fbReels.data.length : fbReels);
  if (fbReels.data) {
    for (const r of fbReels.data) {
      console.log(`- Reel ID: ${r.id}, Created: ${r.created_time}, Desc: ${(r.description || '').slice(0, 40)}...`);
      // Delete if created today (2026-11-18)
      if (r.created_time && r.created_time.startsWith('2026-11-18')) {
        console.log(`  Deleting FB Reel ${r.id}...`);
        const delRes = await apiCall(`/v26.0/${r.id}`, 'DELETE');
        console.log(`  Result:`, delRes);
      }
    }
  }

  console.log('\n=== Checking Instagram Media ===');
  const igMedia = await apiCall(`/v26.0/${IG_ID}/media?fields=id,caption,media_type,timestamp,permalink`);
  if (igMedia.data) {
    for (const m of igMedia.data) {
      if (m.media_type === 'VIDEO' || m.media_type === 'REELS') {
        console.log(`- IG Reel ID: ${m.id}, Created: ${m.timestamp}, Caption: ${(m.caption || '').slice(0, 40)}...`);
        if (m.timestamp && m.timestamp.startsWith('2026-11-18')) {
          console.log(`  Attempting DELETE IG Reel ${m.id}...`);
          const delRes = await apiCall(`/v26.0/${m.id}`, 'DELETE');
          console.log(`  Result:`, delRes);
        }
      }
    }
  }
}

run();
