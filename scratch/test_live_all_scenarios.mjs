import fs from 'node:fs';
import crypto from 'node:crypto';

const BASE_URL = 'https://local-video-clip-editor-worker.varmaabhishek97.workers.dev';

async function uploadSampleVideoToB2(authHeaders, videoBuffer, label = 'test') {
  const targetRes = await fetch(`${BASE_URL}/api/instagram/b2/upload-url`, {
    method: 'POST',
    headers: authHeaders
  });
  const target = await targetRes.json();
  if (!target.uploadUrl) {
    throw new Error(`Failed to get B2 target: ${JSON.stringify(target)}`);
  }

  const tempFileName = `social_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${label}_clip.mp4`;
  const sha1 = crypto.createHash('sha1').update(videoBuffer).digest('hex');

  const b2UploadRes = await fetch(target.uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': target.authorizationToken,
      'X-Bz-File-Name': encodeURIComponent(tempFileName),
      'Content-Type': 'video/mp4',
      'Content-Length': String(videoBuffer.length),
      'X-Bz-Content-Sha1': sha1
    },
    body: videoBuffer
  });

  const b2Data = await b2UploadRes.json();
  if (!b2Data.fileId) {
    throw new Error(`B2 upload failed: ${JSON.stringify(b2Data)}`);
  }

  return {
    fileId: b2Data.fileId,
    fileName: b2Data.fileName
  };
}

async function runAllLiveTests() {
  const results = {
    auth: null,
    youtube: { direct: null, scheduled: null },
    facebook: { direct: null, scheduled: null },
    instagram: { direct: null, scheduled: null },
    dualPublish: { facebook: null, instagram: null }
  };

  console.log('====================================================');
  console.log(' STEP 1: AUTHENTICATION (abhiwithpooja0768@gmail.com)');
  console.log('====================================================');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'abhiwithpooja0768@gmail.com',
      password: 'Admin@123'
    })
  });
  const loginData = await loginRes.json();
  if (!loginData.token) {
    throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
  }
  const token = loginData.token;
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  results.auth = { user: loginData.user?.email, success: true };
  console.log('✓ Logged in as:', loginData.user?.email);

  console.log('\n====================================================');
  console.log(' STEP 2: VERIFY CONNECTED ACCOUNTS');
  console.log('====================================================');
  const [fbAccRes, igAccRes, ytAccRes] = await Promise.all([
    fetch(`${BASE_URL}/api/facebook/account`, { headers: authHeaders }),
    fetch(`${BASE_URL}/api/instagram/account`, { headers: authHeaders }),
    fetch(`${BASE_URL}/api/youtube/account`, { headers: authHeaders })
  ]);
  const fbAcc = await fbAccRes.json();
  const igAcc = await igAccRes.json();
  const ytAcc = await ytAccRes.json();
  console.log('Facebook Account:', fbAcc?.connected ? `✓ Page: ${fbAcc.page_name} (${fbAcc.page_id})` : '✗ Not connected');
  console.log('Instagram Account:', igAcc?.connected ? `✓ User: ${igAcc.ig_username} (${igAcc.ig_user_id})` : '✗ Not connected');
  console.log('YouTube Account:', ytAcc?.connected ? `✓ Channel: ${ytAcc.channel_title} (${ytAcc.channel_id})` : '✗ Not connected');

  console.log('\n====================================================');
  console.log(' STEP 3: FETCH SAMPLE MP4 VIDEO');
  console.log('====================================================');
  const vidRes = await fetch('https://www.w3schools.com/html/mov_bbb.mp4');
  const videoBuffer = Buffer.from(await vidRes.arrayBuffer());
  console.log(`✓ Sample MP4 downloaded (${videoBuffer.length} bytes)`);

  // ----------------------------------------------------
  // SCENARIO 1: YOUTUBE DIRECT & SCHEDULED SESSION TESTS
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(' SCENARIO 1: YOUTUBE DIRECT & SCHEDULED PIPELINE');
  console.log('====================================================');
  if (ytAcc?.connected) {
    try {
      console.log('[YouTube Direct] Requesting direct upload session...');
      const ytDirectRes = await fetch(`${BASE_URL}/api/uploads/metadata`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          title: `Demo Video Clip - Direct Publish [${Date.now()}]`,
          description: 'Automated test direct upload from Local Video Clip Editor #shorts #test',
          tags: ['shorts', 'test', 'demo'],
          visibility: 'private',
          partNumber: 1,
          movieName: 'Demo Video Clip',
          fileSize: videoBuffer.length,
          mimeType: 'video/mp4'
        })
      });
      const ytDirectData = await ytDirectRes.json();
      console.log('YouTube Direct Session response:', ytDirectData.success ? '✓ SUCCESS (Upload URL created)' : ytDirectData);
      results.youtube.direct = ytDirectData;

      console.log('[YouTube Scheduled] Requesting scheduled upload session...');
      const futureSchedule = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const ytSchedRes = await fetch(`${BASE_URL}/api/uploads/metadata`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          title: `Demo Video Clip - Scheduled [${Date.now()}]`,
          description: 'Automated test scheduled upload from Local Video Clip Editor #shorts #test',
          tags: ['shorts', 'scheduled', 'demo'],
          visibility: 'private',
          scheduledAt: futureSchedule,
          partNumber: 2,
          movieName: 'Demo Video Clip',
          fileSize: videoBuffer.length,
          mimeType: 'video/mp4'
        })
      });
      const ytSchedData = await ytSchedRes.json();
      console.log('YouTube Scheduled Session response:', ytSchedData.success ? `✓ SUCCESS (Scheduled for ${futureSchedule})` : ytSchedData);
      results.youtube.scheduled = ytSchedData;
    } catch (ytErr) {
      console.error('YouTube test error:', ytErr.message);
      results.youtube.error = ytErr.message;
    }
  } else {
    console.log('Skipping YouTube tests (no account connected).');
  }

  // ----------------------------------------------------
  // SCENARIO 2: FACEBOOK & INSTAGRAM SCHEDULED UPLOADS
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(' SCENARIO 2: FACEBOOK & INSTAGRAM SCHEDULED UPLOADS');
  console.log('====================================================');
  const schedTime = new Date(Date.now() + 3 * 3600 * 1000).toISOString(); // +3 hours
  console.log(`Uploading test clip to B2 for scheduled tests...`);
  const b2SchedAsset = await uploadSampleVideoToB2(authHeaders, videoBuffer, 'sched');
  console.log(`✓ Uploaded to B2: ${b2SchedAsset.fileName}`);

  // Schedule Facebook
  if (fbAcc?.connected) {
    console.log(`[FB Schedule] Scheduling for ${schedTime}...`);
    const fbSchedRes = await fetch(`${BASE_URL}/api/facebook/publish`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        contentType: 'reel',
        b2FileId: b2SchedAsset.fileId,
        b2FileName: b2SchedAsset.fileName,
        caption: 'Demo Reel Scheduled on Facebook #reels #demo',
        title: 'Demo Reel Scheduled',
        scheduledAt: schedTime,
        pageId: fbAcc.page_id
      })
    });
    const fbSchedData = await fbSchedRes.json();
    console.log('Facebook Schedule result:', fbSchedData.success ? `✓ SUCCESS (Job ID: ${fbSchedData.job_id})` : fbSchedData);
    results.facebook.scheduled = fbSchedData;
  }

  // Schedule Instagram
  if (igAcc?.connected) {
    console.log(`[IG Schedule] Scheduling for ${schedTime}...`);
    const igSchedRes = await fetch(`${BASE_URL}/api/instagram/publish`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        contentType: 'reel',
        b2FileId: b2SchedAsset.fileId,
        b2FileName: b2SchedAsset.fileName,
        caption: 'Demo Reel Scheduled on Instagram #reels #demo',
        title: 'Demo Reel Scheduled',
        scheduledAt: schedTime,
        igUserId: igAcc.ig_user_id
      })
    });
    const igSchedData = await igSchedRes.json();
    console.log('Instagram Schedule result:', igSchedData.success ? `✓ SUCCESS (Job ID: ${igSchedData.job_id})` : igSchedData);
    results.instagram.scheduled = igSchedData;
  }

  // Verify they appear in /api/social/scheduled
  const schedCheckRes = await fetch(`${BASE_URL}/api/social/scheduled`, { headers: authHeaders });
  const schedList = await schedCheckRes.json();
  console.log(`✓ Active scheduled social jobs count in D1: ${Array.isArray(schedList) ? schedList.length : 0}`);

  // ----------------------------------------------------
  // SCENARIO 3: DUAL FACEBOOK + INSTAGRAM DIRECT PUBLISH
  // (CRITICAL: Verifies that FB publish does NOT delete B2 file, so IG publishes successfully!)
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(' SCENARIO 3: DUAL FB + IG DIRECT PUBLISH (BUG FIX TEST)');
  console.log('====================================================');
  console.log('Uploading shared clip to B2 for direct dual publish...');
  const b2DualAsset = await uploadSampleVideoToB2(authHeaders, videoBuffer, 'dual');
  console.log(`✓ Uploaded to B2: ${b2DualAsset.fileName}`);

  // Publish to Facebook first
  console.log('[Direct Publish 1/2] Publishing to Facebook Reel now...');
  const fbPubRes = await fetch(`${BASE_URL}/api/facebook/publish`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      contentType: 'reel',
      b2FileId: b2DualAsset.fileId,
      b2FileName: b2DualAsset.fileName,
      caption: 'Demo Reel Direct Publish on Facebook 🎬 #reels #demo #viral',
      title: 'Demo Reel Direct FB',
      pageId: fbAcc.page_id
    })
  });
  const fbPubData = await fbPubRes.json();
  console.log('Facebook Direct Publish result:', fbPubData.success ? `✓ PUBLISHED (${fbPubData.postUrl || fbPubData.video_id})` : fbPubData);
  results.dualPublish.facebook = fbPubData;

  // Publish to Instagram using the SAME B2 file
  console.log('[Direct Publish 2/2] Publishing to Instagram Reel now (reusing B2 file)...');
  const igPubRes = await fetch(`${BASE_URL}/api/instagram/publish`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      contentType: 'reel',
      b2FileId: b2DualAsset.fileId,
      b2FileName: b2DualAsset.fileName,
      caption: 'Demo Reel Direct Publish on Instagram 🎬 #reels #demo #viral',
      title: 'Demo Reel Direct IG',
      igUserId: igAcc.ig_user_id,
      shareToFeed: true
    })
  });
  const igPubData = await igPubRes.json();
  console.log('Instagram Direct Publish result:', igPubData.success ? `✓ PUBLISHED (${igPubData.postUrl || igPubData.media_id})` : igPubData);
  results.dualPublish.instagram = igPubData;

  // ----------------------------------------------------
  // SCENARIO 4: VERIFY HISTORY & FINAL AUDIT
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(' SCENARIO 4: VERIFY SOCIAL UPLOAD HISTORY');
  console.log('====================================================');
  const histRes = await fetch(`${BASE_URL}/api/social/history`, { headers: authHeaders });
  const histData = await histRes.json();
  console.log(`✓ Total jobs in history: ${Array.isArray(histData) ? histData.length : 0}`);
  if (Array.isArray(histData) && histData.length > 0) {
    console.log('Latest 3 jobs in history:');
    histData.slice(0, 3).forEach(j => {
      console.log(` - [${j.platform.toUpperCase()}] status=${j.status} title="${j.title || j.movie_name}" url=${j.post_url || j.facebook_post_url || j.instagram_post_url || 'N/A'}`);
    });
  }

  console.log('\n====================================================');
  console.log(' ALL SCENARIOS COMPLETED');
  console.log('====================================================');
  console.log(JSON.stringify(results, null, 2));
}

runAllLiveTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
