const fs = require('fs');
const path = require('path');

const BASE_DIR = path.resolve(__dirname, '..');
const TODAY_POSTS = path.join(BASE_DIR, 'today_posts.json');

if (!fs.existsSync(TODAY_POSTS)) {
  console.log('[clean] today_posts.json not found, skipping media cleanup.');
  process.exit(0);
}

try {
  const data = JSON.parse(fs.readFileSync(TODAY_POSTS, 'utf8'));
  const top3Names = (data.posts || []).slice(0, 3).map(p => (p.celebrity_name || '').replace(/[^a-zA-Z0-9]/g, '_'));

  const collagesDir = path.join(BASE_DIR, 'collages');
  if (fs.existsSync(collagesDir)) {
    fs.readdirSync(collagesDir).forEach(f => {
      if (f === '.gitkeep') return;
      const isTop3 = top3Names.some(name => f.startsWith(name));
      if (!isTop3 && !f.startsWith('quiz_')) {
        try {
          fs.unlinkSync(path.join(collagesDir, f));
          console.log('[clean] Cleaned non-headliner collage:', f);
        } catch (e) {}
      }
    });
  }

  const reelsDir = path.join(BASE_DIR, 'reels');
  if (fs.existsSync(reelsDir)) {
    fs.readdirSync(reelsDir).forEach(f => {
      if (f === '.gitkeep') return;
      const isTop3 = top3Names.some(name => f.startsWith(name));
      if (!isTop3 && !f.startsWith('quiz_')) {
        try {
          fs.unlinkSync(path.join(reelsDir, f));
          console.log('[clean] Cleaned non-headliner reel:', f);
        } catch (e) {}
      }
    });
  }
  console.log('[clean] Headliner media staged successfully.');
} catch (err) {
  console.error('[clean] Error during media cleanup:', err.message);
}