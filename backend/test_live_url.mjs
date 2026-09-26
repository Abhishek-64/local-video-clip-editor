
const LIVE_WORKER_URL = 'https://local-video-clip-editor-worker.varmaabhishek97.workers.dev';
const LIVE_FRONTEND_URL = 'https://local-video-clip-editor.varmaabhishek97.workers.dev';

const CREDENTIALS = {
  email: 'abhiwithpooja0768@gmail.com',
  password: 'Admin@123'
};

async function runLiveTests() {
  console.log('====================================================');
  console.log('  LIVE TESTING ON CLOUDFLARE WORKERS');
  console.log('  Worker:   ', LIVE_WORKER_URL);
  console.log('  Frontend: ', LIVE_FRONTEND_URL);
  console.log('  User:     ', CREDENTIALS.email);
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // ── 1. Test Live Frontend HTML Delivery ──────────────────────────────────
  console.log('1. Testing Live Frontend URL...');
  try {
    const res = await fetch(LIVE_FRONTEND_URL);
    assert(res.status === 200, `Frontend returned status 200 (received: ${res.status})`);
    const html = await res.text();
    assert(html.includes('<!DOCTYPE html>') || html.includes('<html'), 'Frontend returned valid HTML page');
    assert(html.includes('assets/index-'), 'Frontend contains compiled asset bundles');
  } catch (err) {
    assert(false, `Frontend fetch error: ${err.message}`);
  }

  // ── 2. Test Live Backend Health / Auth ────────────────────────────────────
  console.log('\n2. Testing Live Backend Authentication...');
  let authToken = null;
  let userId = null;

  try {
    let loginRes = await fetch(`${LIVE_WORKER_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: CREDENTIALS.email, password: CREDENTIALS.password })
    });

    let loginData = await loginRes.json();

    if (loginRes.status === 401 || (loginData.error && loginData.error.includes('not found'))) {
      console.log('  User not found, registering new account...');
      const signupRes = await fetch(`${LIVE_WORKER_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: CREDENTIALS.email,
          password: CREDENTIALS.password,
          name: 'Abhishek'
        })
      });
      const signupData = await signupRes.json();
      assert(signupRes.status === 200 || signupRes.status === 201, `Signup succeeded: ${JSON.stringify(signupData)}`);
      authToken = signupData.token;
      userId = signupData.user?.id;
    } else {
      assert(loginRes.status === 200, `Login succeeded with 200 OK`);
      authToken = loginData.token;
      userId = loginData.user?.id;
    }

    assert(Boolean(authToken), `Received auth token from live backend: ${authToken ? authToken.slice(0, 16) + '...' : 'NONE'}`);
  } catch (err) {
    assert(false, `Auth error: ${err.message}`);
  }

  if (!authToken) {
    console.error('Cannot proceed with authenticated tests without auth token.');
    return;
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  };

  // ── 3. Test Session Me Endpoint ───────────────────────────────────────────
  console.log('\n3. Testing /api/auth/me on Live Backend...');
  try {
    const meRes = await fetch(`${LIVE_WORKER_URL}/api/auth/me`, { headers: authHeaders });
    assert(meRes.status === 200, `/api/auth/me returned 200 OK`);
    const meData = await meRes.json();
    assert(meData.user?.email === CREDENTIALS.email, `Session matches user email: ${meData.user?.email}`);
  } catch (err) {
    assert(false, `Me endpoint error: ${err.message}`);
  }

  // ── 4. Test Permanent Database Cleanup on Live D1 ─────────────────────────
  console.log('\n4. Testing /api/storage/cleanup (Permanent DB Cleanup Strategy)...');
  try {
    const cleanupRes = await fetch(`${LIVE_WORKER_URL}/api/storage/cleanup`, {
      method: 'POST',
      headers: authHeaders
    });
    assert(cleanupRes.status === 200, `Cleanup endpoint returned 200 OK`);
    const cleanupData = await cleanupRes.json();
    assert(cleanupData.success === true, 'Cleanup reported success: true');
    console.log('   Cleanup Report:', JSON.stringify(cleanupData.deleted || cleanupData.cleaned || cleanupData));
  } catch (err) {
    assert(false, `Cleanup error: ${err.message}`);
  }

  // ── 5. Test Live Storage Overview (B2 + D1 Stats) ─────────────────────────
  console.log('\n5. Testing /api/storage/overview on Live Backend...');
  try {
    const storRes = await fetch(`${LIVE_WORKER_URL}/api/storage/overview`, { headers: authHeaders });
    assert(storRes.status === 200, `/api/storage/overview returned 200 OK`);
    const storData = await storRes.json();
    assert(storData.b2?.configured !== undefined, `B2 configured status: ${storData.b2?.configured}`);
    assert(Array.isArray(storData.b2?.files), `Files array returned (count: ${storData.b2?.files?.length || 0})`);
  } catch (err) {
    assert(false, `Storage overview error: ${err.message}`);
  }

  // ── 6. Test Live Social Upload History Endpoints ──────────────────────────
  console.log('\n6. Testing Social Upload History Retrieval & Deletion...');
  try {
    const histRes = await fetch(`${LIVE_WORKER_URL}/api/social/history`, { headers: authHeaders });
    assert(histRes.status === 200, `/api/social/history returned 200 OK`);
    const histData = await histRes.json();
    assert(Array.isArray(histData.history), `History items array returned (count: ${histData.history?.length || 0})`);

    // Test delete-selected endpoint
    const delHistRes = await fetch(`${LIVE_WORKER_URL}/api/social/history/delete-selected`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ items: [] })
    });
    assert(delHistRes.status === 200, `POST /api/social/history/delete-selected returned 200 OK`);
    const delHistData = await delHistRes.json();
    assert(delHistData.success === true, 'delete-selected reported success: true');
  } catch (err) {
    assert(false, `Social history error: ${err.message}`);
  }

  // ── 7. Test Live Scheduled Social Jobs Endpoints ──────────────────────────
  console.log('\n7. Testing Scheduled Social Jobs Retrieval & Deletion...');
  try {
    const schedRes = await fetch(`${LIVE_WORKER_URL}/api/social/scheduled`, { headers: authHeaders });
    assert(schedRes.status === 200, `/api/social/scheduled returned 200 OK`);
    const schedData = await schedRes.json();
    assert(Array.isArray(schedData.scheduled), `Scheduled jobs array returned (count: ${schedData.scheduled?.length || 0})`);

    // Test delete-selected endpoint
    const delSchedRes = await fetch(`${LIVE_WORKER_URL}/api/social/scheduled/delete-selected`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ items: [] })
    });
    assert(delSchedRes.status === 200, `POST /api/social/scheduled/delete-selected returned 200 OK`);
    const delSchedData = await delSchedRes.json();
    assert(delSchedData.success === true, 'Scheduled delete-selected reported success: true');
  } catch (err) {
    assert(false, `Scheduled jobs error: ${err.message}`);
  }

  // ── 8. Test YouTube History Clear Endpoint ────────────────────────────────
  console.log('\n8. Testing YouTube Upload History Clear...');
  try {
    const clrRes = await fetch(`${LIVE_WORKER_URL}/api/history/clear`, {
      method: 'POST',
      headers: authHeaders
    });
    assert(clrRes.status === 200, `POST /api/history/clear returned 200 OK`);
    const clrData = await clrRes.json();
    assert(clrData.success === true, 'History clear reported success: true');
  } catch (err) {
    assert(false, `History clear error: ${err.message}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n====================================================');
  console.log(`  LIVE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');
}

runLiveTests().catch(err => {
  console.error('Fatal live test execution failure:', err);
  process.exit(1);
});
