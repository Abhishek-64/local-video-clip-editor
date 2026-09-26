// test_api_endpoints.mjs - Verifies the live Wrangler server HTTP endpoints
import assert from 'assert';

const BASE_URL = 'http://127.0.0.1:8787';

async function testEndpoints() {
  console.log('Testing live API endpoints on', BASE_URL);

  // 1. Test POST /api/social/history/delete-selected with empty or guest auth
  const res1 = await fetch(`${BASE_URL}/api/social/history/delete-selected`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [] })
  });
  const data1 = await res1.json();
  console.log('1. /api/social/history/delete-selected response:', data1);
  assert.strictEqual(data1.success, true, 'Should return success: true for empty items');
  assert.strictEqual(data1.deletedCount, 0, 'deletedCount should be 0');

  // 2. Test POST /api/social/scheduled/delete-selected
  const res2 = await fetch(`${BASE_URL}/api/social/scheduled/delete-selected`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [] })
  });
  const data2 = await res2.json();
  console.log('2. /api/social/scheduled/delete-selected response:', data2);
  assert.strictEqual(data2.success, true, 'Should return success: true for empty items');

  // 3. Test POST /api/storage/cleanup (Permanent Cleanup)
  const res3 = await fetch(`${BASE_URL}/api/storage/cleanup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const data3 = await res3.json();
  console.log('3. /api/storage/cleanup response:', data3);
  assert.strictEqual(data3.success, true, 'Permanent cleanup should succeed');
  assert.ok(data3.report || data3.result, 'Should have cleanup result details');

  // 4. Test POST /api/history/clear
  const res4 = await fetch(`${BASE_URL}/api/history/clear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'all' })
  });
  const data4 = await res4.json();
  console.log('4. /api/history/clear response:', data4);
  assert.strictEqual(data4.success, true, 'Clear history should succeed');
  assert.strictEqual(typeof data4.deletedCount, 'number', 'Should return numeric deletedCount');

  console.log('\n✓ ALL LIVE HTTP API ENDPOINTS TESTED & PASSED!\n');
}

testEndpoints().catch(err => {
  console.error('API Endpoint test failed:', err);
  process.exit(1);
});
