// test_live_scheduled_deletion.mjs
// Verifies live scheduled Facebook & Instagram deletion on Cloudflare Worker

const LIVE_WORKER_URL = 'https://local-video-clip-editor-worker.varmaabhishek97.workers.dev';
const CREDENTIALS = {
  email: 'abhiwithpooja0768@gmail.com',
  password: 'Admin@123'
};

async function testScheduledDeletion() {
  console.log('--- Logging into live worker ---');
  const loginRes = await fetch(`${LIVE_WORKER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(CREDENTIALS)
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  if (!token) throw new Error('Could not log in: ' + JSON.stringify(loginData));
  console.log('Logged in successfully, token:', token.slice(0, 15) + '...');

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // 1. Fetch current scheduled jobs
  console.log('\n--- 1. Fetching current scheduled jobs ---');
  const schedRes1 = await fetch(`${LIVE_WORKER_URL}/api/social/scheduled`, { headers: authHeaders });
  const schedData1 = await schedRes1.json();
  const initialJobs = schedData1.scheduled || [];
  console.log(`Found ${initialJobs.length} active scheduled jobs.`);

  if (initialJobs.length > 0) {
    const firstJob = initialJobs[0];
    console.log(`Sample scheduled job: [${firstJob.platform}] id=${firstJob.id}, title="${firstJob.title}", status=${firstJob.status}`);

    // 2. Test single deletion via DELETE /api/social/scheduled/:platform/:id
    console.log(`\n--- 2. Testing DELETE /api/social/scheduled/${firstJob.platform}/${firstJob.id} ---`);
    const delRes = await fetch(`${LIVE_WORKER_URL}/api/social/scheduled/${firstJob.platform}/${firstJob.id}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    const delData = await delRes.json();
    console.log('Single deletion response:', delData);
    if (!delData.success) {
      throw new Error('Single delete failed: ' + JSON.stringify(delData));
    }
    console.log('✅ Single delete succeeded permanently!');

    // 3. Verify count decreased
    const schedRes2 = await fetch(`${LIVE_WORKER_URL}/api/social/scheduled`, { headers: authHeaders });
    const schedData2 = await schedRes2.json();
    const afterSingleJobs = schedData2.scheduled || [];
    console.log(`Scheduled jobs count after single delete: ${afterSingleJobs.length} (was ${initialJobs.length})`);
    if (afterSingleJobs.some(j => j.id === firstJob.id)) {
      throw new Error(`Job ${firstJob.id} is still present in scheduled list! Permanent deletion failed.`);
    }
    console.log(`✅ Verified job ${firstJob.id} is completely gone from scheduled jobs!`);

    // 4. Test multi-select bulk delete via POST /api/social/scheduled/delete-selected
    if (afterSingleJobs.length >= 2) {
      const toDelete = afterSingleJobs.slice(0, 2).map(j => ({ platform: j.platform, id: j.id }));
      console.log(`\n--- 3. Testing POST /api/social/scheduled/delete-selected with ${toDelete.length} items:`, toDelete);
      
      const bulkRes = await fetch(`${LIVE_WORKER_URL}/api/social/scheduled/delete-selected`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ items: toDelete })
      });
      const bulkData = await bulkRes.json();
      console.log('Bulk deletion response:', bulkData);
      if (!bulkData.success) {
        throw new Error('Bulk delete failed: ' + JSON.stringify(bulkData));
      }
      console.log(`✅ Bulk delete reported ${bulkData.deletedCount} items permanently deleted!`);

      // 5. Verify jobs are gone
      const schedRes3 = await fetch(`${LIVE_WORKER_URL}/api/social/scheduled`, { headers: authHeaders });
      const schedData3 = await schedRes3.json();
      const afterBulkJobs = schedData3.scheduled || [];
      console.log(`Scheduled jobs count after bulk delete: ${afterBulkJobs.length} (was ${afterSingleJobs.length})`);
      for (const deletedItem of toDelete) {
        if (afterBulkJobs.some(j => j.id === deletedItem.id)) {
          throw new Error(`Item ${deletedItem.id} still found in scheduled jobs list!`);
        }
      }
      console.log('✅ Verified all selected jobs are completely removed from scheduled list!');
    }
  } else {
    console.log('No scheduled jobs to delete.');
  }

  console.log('\n🎉 ALL LIVE SCHEDULED DELETION TESTS PASSED!');
}

testScheduledDeletion().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
