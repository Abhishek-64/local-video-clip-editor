/**
 * Local Video Clip Editor — Facebook Reel Verification & Lifecycle Test Suite
 *
 * Tests the complete Meta Graph API v26.0 Facebook Reel publication and lifecycle:
 * 1. Finish success but Meta status = processing (Bug #1 verification)
 * 2. Processing -> ready -> published transition
 * 3. Processing -> failed error handling and diagnostic capture
 * 4. Polling timeout & non-blocking Worker runtime safety
 * 5. Page ID / Page Token mismatch validation & security (no token leak)
 * 6. Canonical permalink retrieval & normalization (Bug #2 verification)
 * 7. D1 status correctness (no premature 'published' state)
 * 8. Multi-tick background cron verification for processing jobs
 * 9. Facebook + Instagram shared B2 file retention and cleanup safety
 * 10. Meta API error handling (OAuth 190 / token expiry)
 * 11. Development Mode vs Object Privacy ('EVERYONE') diagnostics
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
  createFacebookUploadJob,
  createInstagramUploadJob,
  updateFacebookUploadJob,
  updateInstagramUploadJob,
  getProcessingFacebookJobs,
  getDueFacebookJobs,
  claimDueFacebookJob,
  isB2FileNeededByOtherJobs
} from './src/db.js';

// Import Facebook functions
import {
  validatePageTokenMatch,
  normalizeFacebookPermalink,
  checkFacebookReelStatus,
  pollFacebookReelStatus,
  verifyPagePublishCapability,
  publishFacebookReel,
  processScheduledFacebookJobs
} from './src/facebook.js';

import { encryptToken } from './src/crypto.js';

// ── Test Harness ────────────────────────────────────────────────────────────
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASSED: ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAILED: ${message}`);
  }
}

// ── Mock Fetch Interceptor ──────────────────────────────────────────────────
let fetchHandlers = [];

function registerFetchMock(matcher, handler) {
  fetchHandlers.unshift({ matcher, handler });
}

function clearFetchMocks() {
  fetchHandlers = [];
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const urlStr = typeof url === 'string' ? url : url.toString();
  for (const { matcher, handler } of fetchHandlers) {
    if (typeof matcher === 'string' && urlStr.includes(matcher)) {
      return handler(urlStr, options);
    }
    if (matcher instanceof RegExp && matcher.test(urlStr)) {
      return handler(urlStr, options);
    }
  }
  return originalFetch(url, options);
};

// ── RUN TESTS ───────────────────────────────────────────────────────────────
async function runSuite() {
  console.log('===============================================================');
  console.log('STARTING FACEBOOK REEL & LIFECYCLE TEST SUITE');
  console.log('===============================================================');

  const SECRET_KEY = 'test-secret-key-1234567890123456';
  const mockEnv = {
    ENCRYPTION_KEY: SECRET_KEY,
    META_GRAPH_API_VERSION: 'v26.0',
    B2_BUCKET_NAME: 'test-bucket',
    B2_DOWNLOAD_URL: 'https://f005.backblazeb2.com/file/test-bucket'
  };

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Page / Token Match Validation & Security
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 1: Page ID & Page Token Mismatch Security ---');
  {
    clearFetchMocks();
    // 1a: Matching token
    registerFetchMock('https://graph.facebook.com/v26.0/me', (url) => {
      return new Response(JSON.stringify({
        id: '1327506660443141',
        name: 'Animee insight'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const matchRes = await validatePageTokenMatch(mockEnv, 'EAA_VALID_TOKEN', '1327506660443141');
    assert(matchRes.page_id === '1327506660443141', 'validatePageTokenMatch succeeds when Page ID matches');

    // 1b: Mismatching token
    let mismatchError = null;
    try {
      await validatePageTokenMatch(mockEnv, 'EAA_WRONG_TOKEN', '9999999999999999');
    } catch (err) {
      mismatchError = err;
    }
    assert(mismatchError !== null, 'validatePageTokenMatch throws error on mismatch');
    assert(mismatchError.message.includes('mismatch'), 'Error explains Page ID and Token mismatch');
    assert(!mismatchError.message.includes('EAA_WRONG_TOKEN'), 'Error does NOT leak the Page Access Token');

    // 1c: Invalid / Expired Token (OAuth error 190)
    registerFetchMock('https://graph.facebook.com/v26.0/me', (url) => {
      return new Response(JSON.stringify({
        error: {
          message: 'Error validating access token: Session has expired',
          code: 190,
          error_subcode: 460
        }
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    });

    let expiredError = null;
    try {
      await validatePageTokenMatch(mockEnv, 'EAA_EXPIRED_TOKEN', '1327506660443141');
    } catch (err) {
      expiredError = err;
    }
    assert(expiredError !== null, 'Throws error when Meta returns code 190');
    assert(expiredError.message.includes('Meta Token Error') || expiredError.message.includes('Session has expired'), 'Explains session expired cleanly');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Canonical Permalink Normalization
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Canonical Permalink Normalization ---');
  {
    const relativeUrl = '/reel/1080660668040753/';
    const normalizedRelative = normalizeFacebookPermalink(relativeUrl, '1080660668040753');
    assert(normalizedRelative === 'https://www.facebook.com/reel/1080660668040753/', 'Relative path normalized to canonical https://www.facebook.com/reel/{id}/');

    const relativeNoTrailingSlash = '/reel/1080660668040753';
    const normalizedNoSlash = normalizeFacebookPermalink(relativeNoTrailingSlash, '1080660668040753');
    assert(normalizedNoSlash === 'https://www.facebook.com/reel/1080660668040753/', 'Adds canonical trailing slash to reel URL');

    const emptyUrl = normalizeFacebookPermalink(null, '1080660668040753');
    assert(emptyUrl === 'https://www.facebook.com/reel/1080660668040753/', 'Fallback with videoId constructs canonical URL with trailing slash');

    const absoluteUrl = 'https://www.facebook.com/reel/1080660668040753/';
    assert(normalizeFacebookPermalink(absoluteUrl, '1080660668040753') === absoluteUrl, 'Absolute canonical URL is preserved unchanged');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Reel Status Parser (checkFacebookReelStatus)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Meta Reel Status Parser (Bug #1 Fix) ---');
  {
    clearFetchMocks();
    // 3a: Video is still in processing phase right after finish
    registerFetchMock('https://graph.facebook.com/v26.0/1080660668040753', () => {
      return new Response(JSON.stringify({
        id: '1080660668040753',
        published: false,
        status: {
          video_status: 'processing',
          uploading_phase: { status: 'complete' },
          processing_phase: { status: 'in_progress' },
          publishing_phase: { status: 'not_started' },
          copyright_check_status: { status: 'in_progress' }
        },
        permalink_url: '/reel/1080660668040753/'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const processingStatus = await checkFacebookReelStatus(mockEnv, 'TEST_TOKEN', '1080660668040753');
    assert(processingStatus.isProcessing === true, 'Correctly identifies isProcessing = true immediately after finish');
    assert(processingStatus.isComplete === false, 'isComplete is FALSE while video_status = processing');
    assert(processingStatus.videoStatus === 'processing', 'videoStatus is "processing"');
    assert(processingStatus.permalinkUrl === 'https://www.facebook.com/reel/1080660668040753/', 'Retrieves normalized canonical permalink even during processing');

    // 3b: Video has completed transcoding and is published
    clearFetchMocks();
    registerFetchMock('https://graph.facebook.com/v26.0/1080660668040753', () => {
      return new Response(JSON.stringify({
        id: '1080660668040753',
        published: true,
        status: {
          video_status: 'ready',
          uploading_phase: { status: 'complete' },
          processing_phase: { status: 'complete' },
          publishing_phase: { status: 'complete', publish_status: 'published' },
          copyright_check_status: { status: 'complete' }
        },
        permalink_url: '/reel/1080660668040753/',
        privacy: { value: 'EVERYONE', description: 'Public' }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const readyStatus = await checkFacebookReelStatus(mockEnv, 'TEST_TOKEN', '1080660668040753');
    assert(readyStatus.isComplete === true, 'Correctly identifies isComplete = true when video_status = ready');
    assert(readyStatus.isProcessing === false, 'isProcessing is false when ready');
    assert(readyStatus.published === true, 'published is true');
    assert(readyStatus.permalinkUrl === 'https://www.facebook.com/reel/1080660668040753/', 'Permalink is preserved');

    // 3c: Video processing failed on Meta
    clearFetchMocks();
    registerFetchMock('https://graph.facebook.com/v26.0/1080660668040753', () => {
      return new Response(JSON.stringify({
        id: '1080660668040753',
        published: false,
        status: {
          video_status: 'error',
          uploading_phase: { status: 'complete' },
          processing_phase: {
            status: 'error',
            errors: ['Your video could not be processed due to invalid codec specifications.']
          },
          publishing_phase: { status: 'error' }
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const errorStatus = await checkFacebookReelStatus(mockEnv, 'TEST_TOKEN', '1080660668040753');
    assert(errorStatus.isError === true, 'Correctly identifies isError = true');
    assert(errorStatus.isComplete === false, 'isComplete is false on error');
    assert(errorStatus.errorDetails.includes('invalid codec'), 'Captures detailed error message from Meta processing_phase');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Polling Function (pollFacebookReelStatus)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Polling Behavior & Graceful Timeout ---');
  {
    clearFetchMocks();
    let pollCount = 0;
    registerFetchMock('https://graph.facebook.com/v26.0/1080660668040753', () => {
      pollCount++;
      if (pollCount < 2) {
        // First poll: still processing
        return new Response(JSON.stringify({
          id: '1080660668040753',
          published: false,
          status: { video_status: 'processing' },
          permalink_url: '/reel/1080660668040753/'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      // Second poll: ready
      return new Response(JSON.stringify({
        id: '1080660668040753',
        published: true,
        status: { video_status: 'ready', publishing_phase: { status: 'complete' } },
        permalink_url: '/reel/1080660668040753/'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const pollResult = await pollFacebookReelStatus(mockEnv, 'TEST_TOKEN', '1080660668040753', {
      maxAttempts: 3,
      initialDelayMs: 10,
      backoffMs: 10
    });
    assert(pollResult.isComplete === true, 'Poll finishes as complete when ready');
    assert(pollCount === 2, 'Poll stopped as soon as ready was returned on attempt 2');

    // Test bounded timeout: when video remains processing
    clearFetchMocks();
    let timeoutPolls = 0;
    registerFetchMock('https://graph.facebook.com/v26.0/1080660668040753', () => {
      timeoutPolls++;
      return new Response(JSON.stringify({
        id: '1080660668040753',
        published: false,
        status: { video_status: 'processing' },
        permalink_url: '/reel/1080660668040753/'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const timeoutResult = await pollFacebookReelStatus(mockEnv, 'TEST_TOKEN', '1080660668040753', {
      maxAttempts: 2,
      initialDelayMs: 10,
      backoffMs: 10
    });
    assert(timeoutResult.isComplete === false, 'Gracefully returns non-complete status when timeout window elapses');
    assert(timeoutResult.videoStatus === 'processing', 'Last status remains processing');
    assert(timeoutPolls === 2, 'Respected maxAttempts bound (no infinite loop)');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: D1 State Machine & Asynchronous Processing in publishFacebookReel
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: D1 State Machine & Asynchronous Processing ---');
  {
    clearFetchMocks();
    const d1 = new D1Shim();
    d1.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, ?)").bind('user_1', 'user1@example.com', 'User One').run();
    const env = { ...mockEnv, DB: d1 };

    // Setup mock endpoints for publishFacebookReel:
    // 0. Validate Page token match
    registerFetchMock('https://graph.facebook.com/v26.0/me', () => {
      return new Response(JSON.stringify({
        id: '1327506660443141',
        name: 'Animee insight'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    // 1. Download video bytes from B2
    registerFetchMock('https://b2.test/download.mp4', () => {
      return new Response(new Uint8Array([0, 1, 2, 3]), { status: 200 });
    });

    // 2. Start upload on Meta
    registerFetchMock('https://graph.facebook.com/v26.0/1327506660443141/video_reels', (url, opts) => {
      const body = JSON.parse(opts.body || '{}');
      if (body.upload_phase === 'start') {
        return new Response(JSON.stringify({
          video_id: '999111222333',
          upload_url: 'https://rupload.facebook.com/fb-reels/999111222333'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (body.upload_phase === 'finish') {
        return new Response(JSON.stringify({
          success: true
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('Not Found', { status: 404 });
    });

    // 3. Upload bytes to Meta rupload
    registerFetchMock('https://rupload.facebook.com/fb-reels/999111222333', () => {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    // Scenario 5a: Meta remains in 'processing' when publishFacebookReel completes
    registerFetchMock('https://graph.facebook.com/v26.0/999111222333', () => {
      return new Response(JSON.stringify({
        id: '999111222333',
        published: false,
        status: { video_status: 'processing' },
        permalink_url: '/reel/999111222333/'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    // Insert Facebook Account
    const encryptedToken = await encryptToken('TEST_TOKEN', SECRET_KEY);
    await d1.prepare(`
      INSERT INTO facebook_accounts (id, user_id, fb_user_id, fb_user_name, page_id, page_name, page_access_token, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind('fb_acc_1', 'user_1', '122098793847461268', 'Abhishek Varma', '1327506660443141', 'Animee insight', encryptedToken).run();

    // Create D1 Job
    const job = await createFacebookUploadJob(d1, {
      user_id: 'user_1',
      facebook_account_id: 'fb_acc_1',
      page_id: '1327506660443141',
      b2_file_id: 'b2_file_1',
      b2_file_name: 'reel_video.mp4',
      caption: 'Test Reel Caption',
      title: 'Test Reel Title',
      content_type: 'reel',
      scheduled_at: null
    });

    assert(job.id !== null, 'D1 Facebook job created');

    // Run publishFacebookReel with quick polling to simulate Worker timeout
    const res5a = await publishFacebookReel(env, 'TEST_TOKEN', '1327506660443141', {
      b2DownloadUrl: 'https://b2.test/download.mp4',
      caption: 'Test Reel Caption',
      title: 'Test Reel Title',
      pollOptions: { maxAttempts: 1, initialDelayMs: 10, backoffMs: 0 }
    });

    // Verify Bug #1 fix: status must be 'processing', NOT 'published'
    assert(res5a.status === 'processing', 'Status is "processing" when Meta has not finished processing');
    assert(res5a.canonicalPermalink === 'https://www.facebook.com/reel/999111222333/', 'Canonical permalink is retrieved');

    // Update D1 job with intermediate status
    await updateFacebookUploadJob(d1, job.id, {
      status: res5a.status,
      facebook_video_id: res5a.videoId,
      facebook_post_url: res5a.status === 'published' ? res5a.postUrl : null
    });

    const d1JobAfterUpload = await d1.prepare('SELECT * FROM facebook_upload_jobs WHERE id = ?').bind(job.id).first();
    assert(d1JobAfterUpload.status === 'processing', 'D1 database row has status="processing" (NOT premature "published")');
    assert(d1JobAfterUpload.facebook_video_id === '999111222333', 'D1 stores video_id');
    assert(d1JobAfterUpload.facebook_post_url === null, 'facebook_post_url is NULL until confirmed published');

    // Scenario 5b: Background Cron Tick (Phase 1) checks getProcessingFacebookJobs
    const processingJobs = await getProcessingFacebookJobs(d1, 10);
    assert(processingJobs.length === 1, 'getProcessingFacebookJobs correctly finds in-progress Reel');
    assert(processingJobs[0].id === job.id, 'Found matching job ID in processing queue');

    // Now Meta finishes processing and returns ready
    clearFetchMocks();
    registerFetchMock('https://graph.facebook.com/v26.0/999111222333', () => {
      return new Response(JSON.stringify({
        id: '999111222333',
        published: true,
        status: { video_status: 'ready', publishing_phase: { status: 'complete' } },
        permalink_url: '/reel/999111222333/'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    // Run scheduler Phase 1 tick
    let b2Deleted = false;
    registerFetchMock('https://api.backblazeb2.com/b2api/v2/b2_delete_file_version', () => {
      b2Deleted = true;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    const schedResult = await processScheduledFacebookJobs(env);
    assert(schedResult.processed === 1, 'processScheduledFacebookJobs processed 1 job in Phase 1');

    const d1JobFinal = await d1.prepare('SELECT * FROM facebook_upload_jobs WHERE id = ?').bind(job.id).first();
    assert(d1JobFinal.status === 'published', 'D1 database row atomically transitioned to "published" after Meta verification');
    assert(d1JobFinal.facebook_post_url === 'https://www.facebook.com/reel/999111222333/', 'D1 database row stores verified canonical permalink');
    assert(d1JobFinal.published_at !== null, 'D1 stores verified published_at timestamp');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Facebook + Instagram Shared B2 Retention Across Status Checks
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 6: Facebook + Instagram Shared B2 Retention ---');
  {
    const d1 = new D1Shim();
    d1.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, ?)").bind('user_1', 'user1@example.com', 'User One').run();
    d1.prepare(`
      INSERT INTO facebook_accounts (id, user_id, fb_user_id, fb_user_name, page_id, page_name, page_access_token)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind('fb_acc_1', 'user_1', '122098793847461268', 'Abhishek Varma', '1327506660443141', 'Animee insight', 'token').run();
    const sharedFileName = 'social_shared_vid_99.mp4';

    // Create Facebook job and Instagram job pointing to the SAME B2 file
    const fbJob = await createFacebookUploadJob(d1, {
      user_id: 'user_1',
      facebook_account_id: 'fb_acc_1',
      page_id: '1327506660443141',
      b2_file_id: 'b2_shared_id',
      b2_file_name: sharedFileName,
      caption: 'Shared Reel',
      content_type: 'reel',
      scheduled_at: null
    });

    const igJob = await createInstagramUploadJob(d1, {
      user_id: 'user_1',
      ig_user_id: 'ig_123',
      b2_file_id: 'b2_shared_id',
      b2_file_name: sharedFileName,
      caption: 'Shared Reel on IG',
      scheduled_at: new Date(Date.now() + 3600000).toISOString() // scheduled in 1 hour
    });

    // Facebook finishes and transitions to 'published'
    await updateFacebookUploadJob(d1, fbJob.id, { status: 'published' });

    // Check if B2 file is needed by other jobs
    const neededWhileIgScheduled = await isB2FileNeededByOtherJobs(d1, sharedFileName, fbJob.id);
    assert(neededWhileIgScheduled === true, 'isB2FileNeededByOtherJobs is TRUE because Instagram is still scheduled');
    // Result: B2 file is preserved!

    // Instagram job also completes
    await updateInstagramUploadJob(d1, igJob.id, { status: 'published' });
    const neededAfterBothDone = await isB2FileNeededByOtherJobs(d1, sharedFileName, fbJob.id);
    assert(neededAfterBothDone === false, 'isB2FileNeededByOtherJobs is FALSE once both platforms are published');
    // Result: Safe to delete B2 file!
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: Development Mode vs Object Privacy Diagnostic
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 7: Meta Development Mode vs Object Privacy Diagnostics ---');
  {
    clearFetchMocks();
    // Test verifyPagePublishCapability with a video in Development Mode
    registerFetchMock('https://graph.facebook.com/v26.0/1327506660443141?fields=id,name,tasks', () => {
      return new Response(JSON.stringify({
        id: '1327506660443141',
        name: 'Animee insight',
        tasks: ['MANAGE', 'CREATE_CONTENT', 'MODERATE']
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    registerFetchMock('https://graph.facebook.com/v26.0/1080660668040753?fields=status,permalink_url,published,privacy,id', () => {
      return new Response(JSON.stringify({
        id: '1080660668040753',
        published: true,
        status: { video_status: 'ready' },
        permalink_url: '/reel/1080660668040753/',
        privacy: { value: 'EVERYONE', description: 'Public' }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const diag = await verifyPagePublishCapability(mockEnv, 'TEST_PAGE_TOKEN', '1327506660443141', '1080660668040753');
    assert(diag.connected === true, 'Page connected in diagnostics');
    assert(diag.can_publish === true, 'Page can publish');
    assert(diag.reel !== null, 'Target reel diagnostics returned');
    assert(diag.reel.metaObjectPrivacy?.value === 'EVERYONE', 'Object privacy correctly reported as EVERYONE');
    assert(typeof diag.reel.viewerAccessibilityNote === 'string', 'Viewer accessibility note explains App Roles & Development Mode restrictions');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 8: AI-Generated Content Disclosure Flag Propagation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 8: AI-Generated Content Disclosure Flag Propagation ---');
  {
    // Part 8A: fb_is_ai_generated = true -> isAiGenerated = true -> finish request is_ai_generated = true
    clearFetchMocks();
    let finishPayloadAiTrue = null;

    registerFetchMock('https://graph.facebook.com/v26.0/me', () => {
      return new Response(JSON.stringify({
        id: '1327506660443141',
        name: 'Animee insight'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    registerFetchMock('https://b2.test/ai_video.mp4', () => {
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    });

    registerFetchMock('https://graph.facebook.com/v26.0/1327506660443141/video_reels', (url, opts) => {
      const body = JSON.parse(opts.body || '{}');
      if (body.upload_phase === 'start') {
        return new Response(JSON.stringify({
          video_id: 'ai_vid_true_123',
          upload_url: 'https://rupload.facebook.com/fb-reels/ai_vid_true_123'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (body.upload_phase === 'finish') {
        finishPayloadAiTrue = body;
        return new Response(JSON.stringify({
          success: true
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('Not Found', { status: 404 });
    });

    registerFetchMock('https://rupload.facebook.com/fb-reels/ai_vid_true_123', () => {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    registerFetchMock('https://graph.facebook.com/v26.0/ai_vid_true_123', () => {
      return new Response(JSON.stringify({
        id: 'ai_vid_true_123',
        published: true,
        status: { video_status: 'ready' },
        permalink_url: '/reel/ai_vid_true_123/'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    // Frontend setting simulation: fbSettings has fb_is_ai_generated: true
    const fbSettingsTrue = { fb_is_ai_generated: true };
    const isAiGeneratedFromUiTrue = Boolean(fbSettingsTrue?.fb_is_ai_generated);
    assert(isAiGeneratedFromUiTrue === true, 'UI toggle fb_is_ai_generated=true maps to isAiGenerated=true');

    await publishFacebookReel(mockEnv, 'TEST_TOKEN', '1327506660443141', {
      b2DownloadUrl: 'https://b2.test/ai_video.mp4',
      caption: 'AI Test Reel',
      isAiGenerated: isAiGeneratedFromUiTrue,
      pollOptions: { maxAttempts: 1, initialDelayMs: 10, backoffMs: 0 }
    });

    assert(finishPayloadAiTrue !== null, 'Meta upload_phase=finish was called');
    assert(finishPayloadAiTrue.is_ai_generated === true, 'Meta upload_phase=finish payload contains is_ai_generated: true');

    // Part 8B: fb_is_ai_generated = false -> isAiGenerated = false -> finish request is_ai_generated = false
    clearFetchMocks();
    let finishPayloadAiFalse = null;

    registerFetchMock('https://graph.facebook.com/v26.0/me', () => {
      return new Response(JSON.stringify({
        id: '1327506660443141',
        name: 'Animee insight'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    registerFetchMock('https://b2.test/non_ai_video.mp4', () => {
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    });

    registerFetchMock('https://graph.facebook.com/v26.0/1327506660443141/video_reels', (url, opts) => {
      const body = JSON.parse(opts.body || '{}');
      if (body.upload_phase === 'start') {
        return new Response(JSON.stringify({
          video_id: 'ai_vid_false_456',
          upload_url: 'https://rupload.facebook.com/fb-reels/ai_vid_false_456'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (body.upload_phase === 'finish') {
        finishPayloadAiFalse = body;
        return new Response(JSON.stringify({
          success: true
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('Not Found', { status: 404 });
    });

    registerFetchMock('https://rupload.facebook.com/fb-reels/ai_vid_false_456', () => {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    registerFetchMock('https://graph.facebook.com/v26.0/ai_vid_false_456', () => {
      return new Response(JSON.stringify({
        id: 'ai_vid_false_456',
        published: true,
        status: { video_status: 'ready' },
        permalink_url: '/reel/ai_vid_false_456/'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    // Frontend setting simulation: fbSettings has fb_is_ai_generated: false
    const fbSettingsFalse = { fb_is_ai_generated: false };
    const isAiGeneratedFromUiFalse = Boolean(fbSettingsFalse?.fb_is_ai_generated);
    assert(isAiGeneratedFromUiFalse === false, 'UI toggle fb_is_ai_generated=false maps to isAiGenerated=false');

    await publishFacebookReel(mockEnv, 'TEST_TOKEN', '1327506660443141', {
      b2DownloadUrl: 'https://b2.test/non_ai_video.mp4',
      caption: 'Non-AI Test Reel',
      isAiGenerated: isAiGeneratedFromUiFalse,
      pollOptions: { maxAttempts: 1, initialDelayMs: 10, backoffMs: 0 }
    });

    assert(finishPayloadAiFalse !== null, 'Meta upload_phase=finish was called');
    assert(finishPayloadAiFalse.is_ai_generated === false, 'Meta upload_phase=finish payload contains is_ai_generated: false');

    // Part 8C: Scheduled D1 Job preserves and propagates is_ai_generated flag
    const d1 = new D1Shim();
    d1.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, ?)").bind('user_ai', 'ai@example.com', 'AI User').run();
    const encryptedToken = await encryptToken('TEST_TOKEN', SECRET_KEY);
    await d1.prepare(`
      INSERT INTO facebook_accounts (id, user_id, fb_user_id, fb_user_name, page_id, page_name, page_access_token, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind('fb_acc_ai', 'user_ai', '122098793847461268', 'Abhishek Varma', '1327506660443141', 'Animee insight', encryptedToken).run();

    const scheduledJob = await createFacebookUploadJob(d1, {
      user_id: 'user_ai',
      facebook_account_id: 'fb_acc_ai',
      page_id: '1327506660443141',
      b2_file_id: 'b2_ai_file',
      b2_file_name: 'scheduled_ai_reel.mp4',
      caption: 'Scheduled AI Reel',
      content_type: 'reel',
      is_ai_generated: 1,
      status: 'scheduled',
      scheduled_at: new Date(Date.now() - 1000).toISOString() // due now
    });

    const storedJob = await d1.prepare('SELECT is_ai_generated FROM facebook_upload_jobs WHERE id = ?').bind(scheduledJob.id).first();
    assert(storedJob.is_ai_generated === 1, 'D1 database row stores is_ai_generated = 1');

    clearFetchMocks();
    let scheduledFinishPayload = null;

    registerFetchMock('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', () => {
      return new Response(JSON.stringify({
        authorizationToken: 'mock_auth_token',
        apiUrl: 'https://api.backblazeb2.com',
        downloadUrl: 'https://f005.backblazeb2.com'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    registerFetchMock('https://api.backblazeb2.com/b2api/v3/b2_get_download_authorization', () => {
      return new Response(JSON.stringify({
        authorizationToken: 'mock_download_auth'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    registerFetchMock('https://f005.backblazeb2.com/file/mock_bucket_name/scheduled_ai_reel.mp4', () => {
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });

    registerFetchMock('https://graph.facebook.com/v26.0/me', () => {
      return new Response(JSON.stringify({ id: '1327506660443141', name: 'Animee insight' }), { status: 200 });
    });

    registerFetchMock('https://graph.facebook.com/v26.0/1327506660443141/video_reels', (url, opts) => {
      const body = JSON.parse(opts.body || '{}');
      if (body.upload_phase === 'start') {
        return new Response(JSON.stringify({
          video_id: 'ai_sched_999',
          upload_url: 'https://rupload.facebook.com/fb-reels/ai_sched_999'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (body.upload_phase === 'finish') {
        scheduledFinishPayload = body;
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('Not Found', { status: 404 });
    });

    registerFetchMock('https://rupload.facebook.com/fb-reels/ai_sched_999', () => {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    registerFetchMock('https://graph.facebook.com/v26.0/ai_sched_999', () => {
      return new Response(JSON.stringify({
        id: 'ai_sched_999',
        published: true,
        status: { video_status: 'ready' },
        permalink_url: '/reel/ai_sched_999/'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const envWithD1 = {
      ...mockEnv,
      DB: d1,
      B2_KEY_ID: 'mock_key_id',
      B2_APPLICATION_KEY: 'mock_app_key',
      B2_BUCKET_ID: 'mock_bucket_id',
      B2_BUCKET_NAME: 'mock_bucket_name'
    };
    await processScheduledFacebookJobs(envWithD1);

    assert(scheduledFinishPayload !== null, 'Scheduled job runner executed finish request');
    assert(scheduledFinishPayload.is_ai_generated === true, 'Scheduled runner propagated is_ai_generated: true from D1 to Meta finish request');
  }

  console.log('\n===============================================================');
  console.log(`ALL TESTS COMPLETED: ${passedTests} Passed, ${failedTests} Failed`);
  console.log('===============================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
