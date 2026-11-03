#!/usr/bin/env node
/**
 * Daily Status Checker & Idempotency Guard
 * Verifies whether today's celebrity posts and reels have already been generated
 * and scheduled on Facebook and Instagram for the current IST date.
 */

const fs = require('fs');
const path = require('path');

const TODAY_POSTS_PATH = path.resolve(__dirname, '..', 'today_posts.json');

function checkDailyStatus() {
  const forceRun = process.env.FORCE_RUN === 'true' || process.argv.includes('--force');

  // Compute current date in Indian Standard Time (IST, UTC+5:30)
  const istDateStr = Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const istTimeStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });

  console.log('=======================================================');
  console.log(`[DAILY STATUS CHECKER] ${istTimeStr} (IST)`);
  console.log(`Target IST Date: ${istDateStr}`);
  console.log('=======================================================');

  if (forceRun) {
    console.log('[DAILY STATUS CHECKER] FORCE_RUN flag detected! Forcing execution.');
    setOutput(false, true, istDateStr);
    return false;
  }

  if (!fs.existsSync(TODAY_POSTS_PATH)) {
    console.log(`[DAILY STATUS CHECKER] ${TODAY_POSTS_PATH} not found. Needs full run.`);
    setOutput(false, true, istDateStr);
    return false;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(TODAY_POSTS_PATH, 'utf8'));
  } catch (err) {
    console.error(`[DAILY STATUS CHECKER] Failed to parse ${TODAY_POSTS_PATH}:`, err.message);
    setOutput(false, true, istDateStr);
    return false;
  }

  console.log(`today_posts.json Recorded Date: ${data.date}`);
  const isToday = (data.date === istDateStr);
  const posts = Array.isArray(data.posts) ? data.posts : [];
  console.log(`Celebrity Posts in payload: ${posts.length}`);

  const allScheduled = posts.length >= 3 && posts.every(p => {
    return Boolean(p.fb_post_id || p.post_id || p.scheduled_status === 'scheduled' || p.scheduled_status === 'published');
  });

  if (posts.length > 0) {
    posts.forEach((p, idx) => {
      const fbPost = p.fb_post_id ? `FB Post: ${p.fb_post_id}` : 'FB Post: PENDING';
      const fbReel = p.fb_reel_id ? `Reel: ${p.fb_reel_id}` : 'Reel: PENDING';
      console.log(`  ${idx + 1}. ${p.celebrity_name || 'Unknown'} -> ${fbPost} | ${fbReel}`);
    });
  }

  const isCompleted = isToday && allScheduled;

  if (isCompleted) {
    console.log('-------------------------------------------------------');
    console.log(`STATUS: ✅ COMPLETED`);
    console.log(`-> Today's posts (${istDateStr}) are already scheduled & active.`);
    console.log(`-> Skipping redundant build to prevent duplicate posting.`);
    console.log('=======================================================');
    setOutput(true, false, istDateStr);
    return true;
  } else {
    console.log('-------------------------------------------------------');
    console.log(`STATUS: ⚠️ PENDING / NOT_COMPLETED`);
    if (!isToday) {
      console.log(`-> Stored date (${data.date}) does not match current IST date (${istDateStr}).`);
    } else {
      console.log(`-> Posts exist for today (${istDateStr}) but Facebook scheduling is incomplete.`);
    }
    console.log(`-> Triggering daily automation pipeline now.`);
    console.log('=======================================================');
    setOutput(false, true, istDateStr);
    return false;
  }
}

function setOutput(alreadyDone, shouldRun, targetDate) {
  if (process.env.GITHUB_OUTPUT) {
    try {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `already_done=${alreadyDone}\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `should_run=${shouldRun}\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `target_date=${targetDate}\n`);
    } catch (e) {
      console.error('Failed writing to GITHUB_OUTPUT:', e.message);
    }
  }
}

if (require.main === module) {
  checkDailyStatus();
}

module.exports = { checkDailyStatus };
