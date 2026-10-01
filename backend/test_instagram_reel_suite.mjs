/**
 * Local Video Clip Editor — Instagram Reel Verification & Long Video Handling Test Suite
 *
 * Tests the complete Meta Graph API Instagram Reel publication and lifecycle:
 * 1. Fast completion: Short video finishes transcoding quickly -> published immediately
 * 2. 13-minute / long video: Meta returns IN_PROGRESS during polling window -> gracefully transitions to 'processing' (NO timeout error)
 * 3. Container ID persistence via onStepUpdate callback
 * 4. Background reconciliation: in-progress container checked on Meta, publishes when ready, cleans B2 file
 * 5. Error handling: Meta returns ERROR or EXPIRED -> properly captured as failed
 * 6. B2 retention: B2 file is safely kept while processing and only deleted after published
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── D1 Database Shim wrapping node:sqlite ──────────────────────────────────
class D1Shim {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    const schemaSql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    this.db.exec(schemaSql);
  }

  prepare(sql) {
    const rawDb = this.db;
    return {
      _sql: sql,
      _params: [],
      bind(...params) {
        this._params = params.map(p => (p === undefined ? null : p));
        return this;
      },
      first(col) {
        const stmt = rawDb.prepare(this._sql);
        const row = stmt.get(...this._params);
        if (!row) return null;
        if (col) return row[col];
        return row;
      },
      all() {
        const stmt = rawDb.prepare(this._sql);
        const results = stmt.all(...this._params);
        return { results, meta: { changes: 0 } };
      },
      run() {
        const stmt = rawDb.prepare(this._sql);
        const info = stmt.run(...this._params);
        return {
          meta: {
            changes: info.changes,
            last_row_id: Number(info.lastInsertRowid)
          }
        };
      }
    };
  }
}

// Import DB functions
import {
  createInstagramUploadJob,
  updateInstagramUploadJob,
  getInstagramUploadJob,
  getProcessingInstagramJobs,
  getStuckUploadingInstagramJobs,
  isB2FileNeededByOtherJobs
} from './src/db.js';

import {
  publishInstagramReel,
  checkInstagramContainerStatus,
  publishInstagramMediaContainer,
  reconcileStuckInstagramJobs,
  processScheduledInstagramJobs
} from './src/instagram.js';

import { encryptToken } from './src/crypto.js';

// ── Fetch Interceptor for Meta Graph API Mocking ───────────────────────────
const originalFetch = globalThis.fetch;
const fetchMockRegistry = new Map();

function registerFetchMock(urlPrefix, handler) {
  fetchMockRegistry.set(urlPrefix, handler);
}

function clearFetchMocks() {
  fetchMockRegistry.clear();
}

globalThis.fetch = async function (input, init) {
  const url = typeof input === 'string' ? input : input.url;

  const sortedPrefixes = Array.from(fetchMockRegistry.entries()).sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, handler] of sortedPrefixes) {
    if (url.startsWith(prefix) || url.includes(prefix)) {
      return handler(url, init);
    }
  }

  return originalFetch(input, init);
};

// ── Assertion Helper ────────────────────────────────────────────────────────
let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    passedCount++;
    console.log(`  ✓ PASSED: ${message}`);
  } else {
    failedCount++;
    console.error(`  ✗ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

const SECRET_KEY = '7a279df54155e4f8f70991df0a4e9c9c';

// ── Test Runner ─────────────────────────────────────────────────────────────
async function runTests() {
  console.log('===============================================================');
  console.log('STARTING INSTAGRAM REEL LONG-VIDEO & LIFECYCLE TEST SUITE');
  console.log('===============================================================\n');

  const d1 = new D1Shim();
  const env = {
    DB: d1,
    ENCRYPTION_KEY: SECRET_KEY,
    META_GRAPH_API_VERSION: 'v26.0'
  };

  await d1.prepare(`
    INSERT INTO users (id, email, name) VALUES (?, ?, ?)
  `).bind('user_1', 'creator@example.com', 'Test Creator').run();

  const encryptedToken = await encryptToken('IG_TEST_ACCESS_TOKEN_123', SECRET_KEY);
  await d1.prepare(`
    INSERT INTO instagram_accounts (id, user_id, ig_user_id, ig_username, ig_name, access_token, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind('ig_acc_1', 'user_1', 'ig_user_100', 'anime_reels_hub', 'Anime Reels Hub', encryptedToken).run();

  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Short Video Fast Path (Instant FINISHED) ---');
  // ─────────────────────────────────────────────────────────────────────────
  clearFetchMocks();

  // Mock container creation
  registerFetchMock('https://graph.facebook.com/v26.0/ig_user_100/media', (url, init) => {
    return new Response(JSON.stringify({ id: 'container_fast_1' }), { status: 200 });
  });

  // Mock container status: FINISHED
  registerFetchMock('https://graph.facebook.com/v26.0/container_fast_1', () => {
    return new Response(JSON.stringify({
      status_code: 'FINISHED',
      status: 'Ready'
    }), { status: 200 });
  });

  // Mock container publish
  registerFetchMock('https://graph.facebook.com/v26.0/ig_user_100/media_publish', () => {
    return new Response(JSON.stringify({ id: 'ig_media_fast_100' }), { status: 200 });
  });

  // Mock permalink query
  registerFetchMock('https://graph.facebook.com/v26.0/ig_media_fast_100', () => {
    return new Response(JSON.stringify({
      id: 'ig_media_fast_100',
      permalink: 'https://www.instagram.com/reel/C-fast123/'
    }), { status: 200 });
  });

  const res1 = await publishInstagramReel(env, 'IG_TEST_ACCESS_TOKEN_123', 'ig_user_100', {
    b2DownloadUrl: 'https://b2.test/download_fast.mp4',
    caption: 'Fast Clip',
    pollOptions: { maxAttempts: 3, initialDelayMs: 10, backoffMs: 10 }
  });

  assert(res1.success === true, 'Fast publish returns success: true');
  assert(res1.status === 'published', 'Fast publish status is "published"');
  assert(res1.mediaId === 'ig_media_fast_100', 'Returns correct mediaId');
  assert(res1.postUrl === 'https://www.instagram.com/reel/C-fast123/', 'Returns correct postUrl');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: 13-Minute Long Video Ingestion (Meta IN_PROGRESS Timeout Prevention) ---');
  // ─────────────────────────────────────────────────────────────────────────
  clearFetchMocks();

  let stepUpdates = [];
  registerFetchMock('https://graph.facebook.com/v26.0/ig_user_100/media', (url, init) => {
    return new Response(JSON.stringify({ id: 'container_13min_long' }), { status: 200 });
  });

  // Meta is IN_PROGRESS throughout the initial polling window
  registerFetchMock('https://graph.facebook.com/v26.0/container_13min_long', () => {
    return new Response(JSON.stringify({
      status_code: 'IN_PROGRESS',
      status: 'Transcoding and chunking 13-minute video...'
    }), { status: 200 });
  });

  // Create D1 Job
  const job13m = await createInstagramUploadJob(d1, {
    user_id: 'user_1',
    instagram_account_id: 'ig_acc_1',
    ig_user_id: 'ig_user_100',
    title: '13-Minute Full Episode',
    caption: 'Long 13min video clip',
    status: 'processing',
    b2_file_id: 'b2_id_13min',
    b2_file_name: 'episode_13min.mp4'
  });

  // Execute publishInstagramReel with a bounded poll window (e.g., 2 attempts)
  let thrownError = null;
  let res2 = null;
  try {
    res2 = await publishInstagramReel(env, 'IG_TEST_ACCESS_TOKEN_123', 'ig_user_100', {
      b2DownloadUrl: 'https://b2.test/download_13min.mp4',
      caption: '13-minute video',
      pollOptions: { maxAttempts: 2, initialDelayMs: 10, backoffMs: 10 },
      onStepUpdate: async (stepData) => {
        stepUpdates.push(stepData);
        if (stepData.step === 'container_created' || stepData.step === 'processing') {
          await updateInstagramUploadJob(d1, job13m.id, {
            status: 'processing',
            instagram_container_id: stepData.containerId
          });
        }
      }
    });
  } catch (err) {
    thrownError = err;
  }

  assert(thrownError === null, 'Long 13-min video does NOT throw timeout error!');
  assert(res2 !== null && res2.success === true, 'Returns success: true instead of throwing');
  assert(res2.status === 'processing', 'Status is "processing" when Meta is still encoding');
  assert(res2.containerId === 'container_13min_long', 'Preserves containerId for background tracking');
  assert(stepUpdates.some(s => s.step === 'container_created'), 'onStepUpdate called with container_created');

  // Verify D1 state
  const jobAfter = await getInstagramUploadJob(d1, job13m.id);
  assert(jobAfter.status === 'processing', 'D1 database status is "processing"');
  assert(jobAfter.instagram_container_id === 'container_13min_long', 'D1 database stores containerId');
  assert(jobAfter.instagram_media_id === null, 'D1 database mediaId is null until Meta finishes');

  // Verify B2 retention
  const isNeeded = await isB2FileNeededByOtherJobs(d1, 'episode_13min.mp4');
  assert(isNeeded === true, 'B2 video file is SAFELY RETAINED while processing is in-progress!');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Background Reconcile When 13-Min Video Finishes Encoding ---');
  // ─────────────────────────────────────────────────────────────────────────
  clearFetchMocks();

  // Now Meta has FINISHED encoding the 13-minute video
  registerFetchMock('https://graph.facebook.com/v26.0/container_13min_long', () => {
    return new Response(JSON.stringify({
      status_code: 'FINISHED',
      status: 'Transcoding complete'
    }), { status: 200 });
  });

  registerFetchMock('https://graph.facebook.com/v26.0/ig_user_100/media_publish', () => {
    return new Response(JSON.stringify({ id: 'ig_media_13min_published' }), { status: 200 });
  });

  registerFetchMock('https://graph.facebook.com/v26.0/ig_media_13min_published', () => {
    return new Response(JSON.stringify({
      id: 'ig_media_13min_published',
      permalink: 'https://www.instagram.com/reel/C-13minFinal/'
    }), { status: 200 });
  });

  // Reconcile stuck/processing jobs
  const recResult = await reconcileStuckInstagramJobs(env, 'user_1');
  assert(recResult.reconciled === 1, 'reconcileStuckInstagramJobs successfully published finished container');

  const jobFinal = await getInstagramUploadJob(d1, job13m.id);
  assert(jobFinal.status === 'published', 'D1 status transitioned to "published"');
  assert(jobFinal.instagram_media_id === 'ig_media_13min_published', 'D1 stores final published media ID');
  assert(jobFinal.instagram_post_url === 'https://www.instagram.com/reel/C-13minFinal/', 'D1 stores final permalink');

  // Now B2 file is no longer needed
  const isNeededAfterPublish = await isB2FileNeededByOtherJobs(d1, 'episode_13min.mp4');
  assert(isNeededAfterPublish === false, 'B2 video file can now be safely cleaned up!');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Meta Encoding Error Handling ---');
  // ─────────────────────────────────────────────────────────────────────────
  clearFetchMocks();

  registerFetchMock('https://graph.facebook.com/v26.0/ig_user_100/media', () => {
    return new Response(JSON.stringify({ id: 'container_err_fail' }), { status: 200 });
  });

  registerFetchMock('https://graph.facebook.com/v26.0/container_err_fail', () => {
    return new Response(JSON.stringify({
      status_code: 'ERROR',
      status: 'Video codec or audio stream corrupted'
    }), { status: 200 });
  });

  let errCaught = null;
  try {
    await publishInstagramReel(env, 'IG_TEST_ACCESS_TOKEN_123', 'ig_user_100', {
      b2DownloadUrl: 'https://b2.test/download_corrupt.mp4',
      caption: 'Corrupt',
      pollOptions: { maxAttempts: 2, initialDelayMs: 10, backoffMs: 10 }
    });
  } catch (err) {
    errCaught = err;
  }

  assert(errCaught !== null, 'Throws error when Meta explicitly reports ERROR');
  assert(errCaught.message.includes('Video codec or audio stream corrupted'), 'Error message contains Meta details');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: getProcessingInstagramJobs Finds In-Progress Video Containers ---');
  // ─────────────────────────────────────────────────────────────────────────
  const activeProcJob = await createInstagramUploadJob(d1, {
    user_id: 'user_1',
    instagram_account_id: 'ig_acc_1',
    ig_user_id: 'ig_user_100',
    title: 'Processing Check',
    status: 'processing',
    instagram_container_id: 'container_proc_check'
  });

  const procList = await getProcessingInstagramJobs(d1, 10, 'user_1');
  assert(procList.some(j => j.id === activeProcJob.id), 'getProcessingInstagramJobs finds in-progress container');

  console.log('\n===============================================================');
  console.log(`ALL TESTS COMPLETED: ${passedCount} Passed, ${failedCount} Failed`);
  console.log('===============================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test Suite Failed Exception:', err);
  process.exit(1);
});
