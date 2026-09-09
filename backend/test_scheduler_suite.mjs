/**
 * Local Video Clip Editor — Comprehensive Scheduler & Cross-Platform Publishing Test Suite
 * 
 * Verifies:
 * - Test A: Independent Schedule Times (Instagram 7:00 PM vs Facebook 7:15 PM)
 * - Test B: Due vs Non-Due Execution (Only due jobs claimed; future jobs untouched)
 * - Test C: Multi-Platform B2 File Retention (B2 file NOT deleted while other platform is pending)
 * - Test D: Later Facebook Execution & Eventual B2 Deletion
 * - Test E: Atomic Claim Race Prevention (Only 1 worker wins claim)
 * - Test F: Idempotency Protection against duplicate submissions
 * - Test G: UTC Timestamp Normalization across timezones
 * - Test H: Non-blocking Multi-Tick Container Polling for Instagram
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── D1 Database Shim wrapping node:sqlite ──────────────────────────────────
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

// Import db helpers
import {
  createFacebookUploadJob,
  createInstagramUploadJob,
  claimDueFacebookJob,
  claimDueInstagramJob,
  getDueFacebookJobs,
  getDueInstagramJobs,
  getProcessingInstagramJobs,
  updateFacebookUploadJob,
  updateInstagramUploadJob,
  isB2FileNeededByOtherJobs,
  getScheduledSocialJobs,
  getCompletedSocialHistory,
  cancelScheduledSocialJob,
  clearCompletedSocialHistory
} from './src/db.js';

function normalizeToUtcIso(dateInput) {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ─── Test Runner ─────────────────────────────────────────────────────────────

let totalPassed = 0;
let totalFailed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    totalFailed++;
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ PASSED: ${message}`);
  totalPassed++;
}

async function runTests() {
  console.log('\n===============================================================');
  console.log('STARTING SCHEDULER & INDEPENDENT PUBLISHING TEST SUITE');
  console.log('===============================================================\n');

  const d1 = new D1Shim();

  // Setup sample user and platform accounts
  const testUserId = 'usr_test_123';
  d1.prepare(`
    INSERT INTO users (id, email, name) VALUES (?, ?, ?)
  `).bind(testUserId, 'creator@example.com', 'Test Creator').run();

  const testFbAccountId = 'fb_acc_123';
  d1.prepare(`
    INSERT INTO facebook_accounts (id, user_id, page_id, page_name, page_access_token)
    VALUES (?, ?, ?, ?, ?)
  `).bind(testFbAccountId, testUserId, 'page_12345', 'My Creator Page', 'fb_enc_token').run();

  const testIgAccountId = 'ig_acc_123';
  d1.prepare(`
    INSERT INTO instagram_accounts (id, user_id, ig_user_id, ig_username, access_token)
    VALUES (?, ?, ?, ?, ?)
  `).bind(testIgAccountId, testUserId, 'ig_user_67890', 'creator_ig', 'ig_enc_token').run();

  // ───────────────────────────────────────────────────────────────────────────
  console.log('--- TEST G: UTC Timestamp Normalization ---');
  // ───────────────────────────────────────────────────────────────────────────
  const isoUtc = normalizeToUtcIso('2026-09-06T19:00:00.000Z');
  assert(isoUtc === '2026-09-06T19:00:00.000Z', 'UTC string normalized to ISO-8601');

  const offsetInput = '2026-09-06T19:00:00+05:30';
  const fromOffset = normalizeToUtcIso(offsetInput);
  assert(fromOffset === new Date('2026-09-06T19:00:00+05:30').toISOString(), 'Timezone offset converted accurately to UTC ISO');

  const invalidInput = normalizeToUtcIso('not-a-real-date');
  assert(invalidInput === null, 'Invalid date string correctly returns null');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST A: Independent Schedule Times & Creation ---');
  // ───────────────────────────────────────────────────────────────────────────
  // Scenario: Same video clip stored once in B2
  const sharedB2FileName = 'shared_clip_movie_part1.mp4';
  const sharedB2FileId = 'b2_file_shared_001';

  // Instagram scheduled at 7:00 PM (10 seconds ago -> DUE NOW)
  const igTime = new Date(Date.now() - 10000).toISOString();
  // Facebook scheduled at 7:15 PM (15 minutes in the future -> NOT DUE)
  const fbTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const igJob = await createInstagramUploadJob(d1, {
    user_id: testUserId,
    instagram_account_id: testIgAccountId,
    ig_user_id: 'ig_user_67890',
    title: 'Movie Clip - Part 1',
    caption: 'Watch part 1 on IG! #reels',
    scheduled_at: igTime,
    status: 'scheduled',
    b2_file_id: sharedB2FileId,
    b2_file_name: sharedB2FileName
  });

  const fbJob = await createFacebookUploadJob(d1, {
    user_id: testUserId,
    facebook_account_id: testFbAccountId,
    page_id: 'page_12345',
    title: 'Movie Clip - Part 1',
    caption: 'Watch part 1 on FB! #reels',
    scheduled_at: fbTime,
    status: 'scheduled',
    b2_file_id: sharedB2FileId,
    b2_file_name: sharedB2FileName
  });

  assert(igJob && igJob.id, `Instagram job created with ID ${igJob.id}`);
  assert(fbJob && fbJob.id, `Facebook job created with ID ${fbJob.id}`);
  assert(igJob.id !== fbJob.id, 'IG and FB jobs have completely distinct IDs');
  assert(igJob.scheduled_at === igTime, `IG job scheduled_at is correctly ${igTime}`);
  assert(fbJob.scheduled_at === fbTime, `FB job scheduled_at is correctly ${fbTime}`);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST B: Due vs Non-Due Execution ---');
  // ───────────────────────────────────────────────────────────────────────────
  // Query due jobs
  const dueIgJobs = await getDueInstagramJobs(d1, 10);
  const dueFbJobs = await getDueFacebookJobs(d1, 10);

  assert(dueIgJobs.some(j => j.id === igJob.id), 'Due query finds Instagram job (scheduled_at <= now)');
  assert(!dueFbJobs.some(j => j.id === fbJob.id), 'Due query EXCLUDES Facebook job (scheduled_at in the future)');

  // Attempt atomic claim
  const igClaimed = await claimDueInstagramJob(d1, igJob.id);
  assert(igClaimed === true, 'claimDueInstagramJob succeeded for due Instagram job');

  const fbClaimed = await claimDueFacebookJob(d1, fbJob.id);
  assert(fbClaimed === false, 'claimDueFacebookJob refused future Facebook job (atomic check scheduled_at <= now)');

  // Verify IG job is now 'uploading' in DB
  const igInDb = d1.prepare('SELECT status FROM instagram_upload_jobs WHERE id = ?').bind(igJob.id).first();
  assert(igInDb.status === 'uploading', 'IG job status atomically changed to uploading');

  const fbInDb = d1.prepare('SELECT status FROM facebook_upload_jobs WHERE id = ?').bind(fbJob.id).first();
  assert(fbInDb.status === 'scheduled', 'FB job remains scheduled in D1');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST C: Multi-Platform B2 File Retention Across Platforms ---');
  // ───────────────────────────────────────────────────────────────────────────
  // Instagram finishes uploading / publishing
  await updateInstagramUploadJob(d1, igJob.id, {
    status: 'published',
    instagram_media_id: 'ig_media_99999'
  });

  // Now Instagram checks if B2 file can be safely deleted:
  const isNeededAfterIg = await isB2FileNeededByOtherJobs(d1, sharedB2FileName, igJob.id);
  assert(isNeededAfterIg === true, 'isB2FileNeededByOtherJobs returns TRUE because Facebook job is still scheduled!');
  console.log('    -> Result: B2 file is SAFELY RETAINED in Backblaze for Facebook.');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST D: Later Facebook Execution & Eventual B2 Deletion ---');
  // ───────────────────────────────────────────────────────────────────────────
  // Fast forward: Facebook job scheduled time arrives (update scheduled_at to past)
  d1.prepare(`
    UPDATE facebook_upload_jobs
    SET scheduled_at = datetime('now', '-1 minute')
    WHERE id = ?
  `).bind(fbJob.id).run();

  const dueFbJobsNow = await getDueFacebookJobs(d1, 10);
  assert(dueFbJobsNow.some(j => j.id === fbJob.id), 'Facebook job is now due and picked up by scheduler');

  const fbClaimedNow = await claimDueFacebookJob(d1, fbJob.id);
  assert(fbClaimedNow === true, 'claimDueFacebookJob succeeded once scheduled_at arrived');

  // Facebook finishes publishing
  await updateFacebookUploadJob(d1, fbJob.id, {
    status: 'published',
    facebook_video_id: 'fb_video_77777'
  });

  // Now Facebook checks if B2 file is needed by other jobs:
  const isNeededAfterFb = await isB2FileNeededByOtherJobs(d1, sharedB2FileName, fbJob.id);
  assert(isNeededAfterFb === false, 'isB2FileNeededByOtherJobs returns FALSE because both IG and FB are finished!');
  console.log('    -> Result: B2 file can now be SAFELY DELETED from Backblaze B2.');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST E: Atomic Claim Race Prevention ---');
  // ───────────────────────────────────────────────────────────────────────────
  // Create another due job
  const raceJob = await createFacebookUploadJob(d1, {
    user_id: testUserId,
    facebook_account_id: testFbAccountId,
    page_id: 'page_12345',
    title: 'Race Test Job',
    scheduled_at: new Date(Date.now() - 5000).toISOString(),
    status: 'scheduled'
  });

  // Simulate 2 parallel workers attempting to claim at the exact same millisecond
  const [claim1, claim2] = await Promise.all([
    claimDueFacebookJob(d1, raceJob.id),
    claimDueFacebookJob(d1, raceJob.id)
  ]);

  const claimsCount = (claim1 ? 1 : 0) + (claim2 ? 1 : 0);
  assert(claimsCount === 1, `Exactly one worker won the atomic claim (claim1=${claim1}, claim2=${claim2})`);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST F: Idempotency Protection ---');
  // ───────────────────────────────────────────────────────────────────────────
  const params = {
    user_id: testUserId,
    facebook_account_id: testFbAccountId,
    page_id: 'page_12345',
    title: 'Idempotency Clip',
    b2_file_name: 'unique_clip_idem_1.mp4',
    status: 'scheduled',
    scheduled_at: '2026-09-06T21:00:00.000Z'
  };

  const jobA = await createFacebookUploadJob(d1, params);
  const jobB = await createFacebookUploadJob(d1, params);

  assert(jobA.id === jobB.id, `Idempotency check returned existing job ID: ${jobA.id}`);

  const totalCountInDb = d1.prepare(`
    SELECT COUNT(*) as count FROM facebook_upload_jobs WHERE b2_file_name = ?
  `).bind('unique_clip_idem_1.mp4').first('count');

  assert(totalCountInDb === 1, 'Database contains exactly 1 row despite repeated duplicate submissions');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST H: Non-blocking Multi-Tick Container Polling for Instagram ---');
  // ───────────────────────────────────────────────────────────────────────────
  // Job in 'processing' state with a container ID
  const procJob = await createInstagramUploadJob(d1, {
    user_id: testUserId,
    instagram_account_id: testIgAccountId,
    ig_user_id: 'ig_user_67890',
    title: 'Container Polling Test',
    status: 'processing',
    b2_file_name: 'container_video.mp4'
  });

  await updateInstagramUploadJob(d1, procJob.id, {
    instagram_container_id: 'ig_container_88888'
  });

  const processingJobs = await getProcessingInstagramJobs(d1, 10);
  assert(processingJobs.some(j => j.id === procJob.id), 'getProcessingInstagramJobs correctly finds background container job');

  // Verify transition to published
  await updateInstagramUploadJob(d1, procJob.id, {
    status: 'published',
    instagram_media_id: 'ig_media_published_888'
  });

  const processingJobsAfter = await getProcessingInstagramJobs(d1, 10);
  assert(!processingJobsAfter.some(j => j.id === procJob.id), 'Job removed from processing queue once published');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST I: Scheduled Videos Query (Strict Separation from History) ---');
  // ───────────────────────────────────────────────────────────────────────────
  // Create 1 scheduled IG job and 1 scheduled FB job
  const activeIg = await createInstagramUploadJob(d1, {
    user_id: testUserId,
    instagram_account_id: testIgAccountId,
    ig_user_id: 'ig_user_67890',
    title: 'Active Scheduled Reel',
    scheduled_at: new Date(Date.now() + 3600000).toISOString(),
    status: 'scheduled',
    b2_file_name: 'active_reel_b2.mp4'
  });

  const activeFb = await createFacebookUploadJob(d1, {
    user_id: testUserId,
    facebook_account_id: testFbAccountId,
    page_id: 'page_12345',
    title: 'Active Scheduled Reel',
    scheduled_at: new Date(Date.now() + 4500000).toISOString(),
    status: 'scheduled',
    b2_file_name: 'active_reel_b2.mp4'
  });

  // Query scheduled social jobs
  const scheduledList = await getScheduledSocialJobs(d1, testUserId);
  assert(scheduledList.some(j => j.id === activeIg.id && j.platform === 'instagram'), 'Scheduled list contains active Instagram job');
  assert(scheduledList.some(j => j.id === activeFb.id && j.platform === 'facebook'), 'Scheduled list contains active Facebook job');
  assert(scheduledList.every(j => ['pending', 'scheduled', 'uploading', 'processing'].includes(j.status)), 'Scheduled list contains ZERO published/failed/cancelled jobs');

  // Query completed history
  const historyList = await getCompletedSocialHistory(d1, testUserId);
  assert(!historyList.some(j => j.id === activeIg.id || j.id === activeFb.id), 'Completed history EXCLUDES active scheduled jobs');
  assert(historyList.every(j => ['published', 'failed', 'cancelled'].includes(j.status)), 'History contains only terminal states');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST J: Safe Clear History with Active Schedule Protection ---');
  // ───────────────────────────────────────────────────────────────────────────
  // We have completed jobs from earlier tests in the database
  const historyBefore = await getCompletedSocialHistory(d1, testUserId);
  assert(historyBefore.length > 0, `History contains ${historyBefore.length} completed records before clearing`);

  // Clear completed history
  const clearResult = await clearCompletedSocialHistory(d1, testUserId, 'all');
  assert(clearResult.success === true, 'clearCompletedSocialHistory executed successfully');
  assert(clearResult.deletedCount > 0, `Deleted ${clearResult.deletedCount} completed records`);

  // Verify completed history is now empty
  const historyAfter = await getCompletedSocialHistory(d1, testUserId);
  assert(historyAfter.length === 0, 'Completed history is now 0 records');

  // CRITICAL ASSERTION: The active scheduled jobs MUST STILL EXIST!
  const scheduledAfterClear = await getScheduledSocialJobs(d1, testUserId);
  assert(scheduledAfterClear.some(j => j.id === activeIg.id), 'Active Instagram schedule was 100% PROTECTED from history clearance!');
  assert(scheduledAfterClear.some(j => j.id === activeFb.id), 'Active Facebook schedule was 100% PROTECTED from history clearance!');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST K: Schedule Cancellation & Multi-Platform B2 Lifecycle ---');
  // ───────────────────────────────────────────────────────────────────────────
  // Both activeIg and activeFb share 'active_reel_b2.mp4'
  const neededBeforeCancel = await isB2FileNeededByOtherJobs(d1, 'active_reel_b2.mp4', activeIg.id);
  assert(neededBeforeCancel === true, 'active_reel_b2.mp4 is needed because Facebook is still scheduled');

  // Cancel Instagram schedule
  const cancelIgRes = await cancelScheduledSocialJob(d1, testUserId, 'instagram', activeIg.id);
  assert(cancelIgRes.success === true, 'cancelScheduledSocialJob succeeded for Instagram');
  assert(cancelIgRes.job.status === 'cancelled', 'Instagram job status set to cancelled');

  // B2 file must STILL be needed because Facebook is still scheduled
  const neededAfterCancelIg = await isB2FileNeededByOtherJobs(d1, 'active_reel_b2.mp4', activeIg.id);
  assert(neededAfterCancelIg === true, 'active_reel_b2.mp4 is still retained in B2 because Facebook schedule is active');

  // Now cancel Facebook schedule as well
  const cancelFbRes = await cancelScheduledSocialJob(d1, testUserId, 'facebook', activeFb.id);
  assert(cancelFbRes.success === true, 'cancelScheduledSocialJob succeeded for Facebook');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST L: Failed Jobs Retain B2 Asset for Retries ---');
  // ───────────────────────────────────────────────────────────────────────────
  const retryB2File = 'retry_test_clip_01.mp4';
  const failedIgJob = await createInstagramUploadJob(d1, {
    user_id: testUserId,
    ig_user_id: '17841400000000001',
    content_type: 'reel',
    title: 'Retry Test Part 1',
    caption: 'Testing retry retention',
    status: 'pending',
    b2_file_id: 'b2_retry_id_01',
    b2_file_name: retryB2File
  });

  // Simulate publish failure
  await updateInstagramUploadJob(d1, failedIgJob.id, {
    status: 'failed',
    error_message: 'Temporary Meta API network timeout'
  });

  // Check if B2 file is needed by other jobs (e.g. from Facebook's perspective)
  const isNeededForRetry = await isB2FileNeededByOtherJobs(d1, retryB2File, 'some_other_finished_job_id');
  assert(isNeededForRetry === true, 'Failed Instagram job still retains B2 file for retry!');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST M: Retry Reuses Existing B2 File ---');
  // ───────────────────────────────────────────────────────────────────────────
  // Retry resets status back to processing/scheduled without changing b2_file_name
  const retriedJob = await updateInstagramUploadJob(d1, failedIgJob.id, {
    status: 'processing',
    error_message: null
  });
  assert(retriedJob.b2_file_name === retryB2File, 'Retried job preserved the exact same B2 file name');
  assert(retriedJob.status === 'processing', 'Retried job successfully resumed without re-upload');

  // Complete the retry
  await updateInstagramUploadJob(d1, failedIgJob.id, {
    status: 'published',
    instagram_media_id: '18000000000000099'
  });

  const isNeededAfterRetryPublished = await isB2FileNeededByOtherJobs(d1, retryB2File, failedIgJob.id);
  assert(isNeededAfterRetryPublished === false, 'B2 file cleanup allowed once retry finishes successfully');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST N: Multi-Platform Shared B2 Ingestion & Idempotency ---');
  // ───────────────────────────────────────────────────────────────────────────
  const sharedAssetB2 = 'shared_clip_01_master.mp4';
  const sharedFbTime = '2026-09-10T19:00:00.000Z';
  const sharedIgTime = '2026-09-11T20:00:00.000Z';

  // 1. Create Facebook job for Clip 01
  const multiFbJob = await createFacebookUploadJob(d1, {
    user_id: testUserId,
    page_id: '100088888888888',
    content_type: 'reel',
    title: 'Clip 01 - FB',
    scheduled_at: sharedFbTime,
    status: 'scheduled',
    b2_file_id: 'shared_b2_id_master',
    b2_file_name: sharedAssetB2
  });

  // 2. Create Instagram job for the SAME Clip 01 with a DIFFERENT schedule time
  const multiIgJob = await createInstagramUploadJob(d1, {
    user_id: testUserId,
    ig_user_id: '17841400000000001',
    content_type: 'reel',
    title: 'Clip 01 - IG',
    scheduled_at: sharedIgTime,
    status: 'scheduled',
    b2_file_id: 'shared_b2_id_master',
    b2_file_name: sharedAssetB2
  });

  assert(multiFbJob.b2_file_name === multiIgJob.b2_file_name, 'FB and IG jobs share the exact same B2 file name');
  assert(multiFbJob.scheduled_at !== multiIgJob.scheduled_at, 'FB and IG have independent schedule times');

  // 3. Repeated schedule request (idempotency check)
  const dupFbJob = await createFacebookUploadJob(d1, {
    user_id: testUserId,
    page_id: '100088888888888',
    content_type: 'reel',
    title: 'Clip 01 - FB',
    scheduled_at: sharedFbTime,
    status: 'scheduled',
    b2_file_id: 'shared_b2_id_master',
    b2_file_name: sharedAssetB2
  });

  assert(dupFbJob.id === multiFbJob.id, 'Duplicate Facebook schedule request returned existing job ID');

  console.log('\n===============================================================');
  console.log(`ALL TESTS COMPLETED: ${totalPassed} Passed, ${totalFailed} Failed`);
  console.log('===============================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
