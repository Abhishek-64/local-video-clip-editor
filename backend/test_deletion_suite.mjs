/**
 * Local Video Clip Editor — Comprehensive Deletion, Multi-Select & Permanent Cleanup Test Suite
 * 
 * Verifies:
 * - Test 1: YouTube 'uploaded' status records are permanently deleted by clearCompletedSocialHistory.
 * - Test 2: Active scheduled jobs ('scheduled', 'uploading') are strictly protected during history clearing.
 * - Test 3: Multi-Select History Deletion (deleteSocialHistoryItems) removes selected records across all platforms.
 * - Test 4: Single History Item Deletion removes only the targeted record.
 * - Test 5: User Isolation (User A cannot delete User B's history).
 * - Test 6: Scheduled Jobs Multi-Select Deletion (deleteScheduledSocialJobs).
 * - Test 7: Hard Permanent Deletion (Zero soft-deletes, rows count = 0 after delete).
 * - Test 8: All-Table Auto-Cleanup (runAutoCleanup) purges expired sessions, old logs across 3 platforms, stale guests.
 * - Test 9: On-demand Cleanup (cleanupUnusedData).
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// D1 Database Shim wrapping node:sqlite
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

import {
  clearCompletedSocialHistory,
  deleteSocialHistoryItems,
  deleteScheduledSocialJobs,
  clearUserDataByScope,
  runAutoCleanup,
  cleanupUnusedData
} from './src/db.js';

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASSED: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAILED: ${message}`);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('\n===============================================================');
  console.log('STARTING PERMANENT DELETION & ALL-TABLE CLEANUP TEST SUITE');
  console.log('===============================================================\n');

  const db = new D1Shim();
  const userId = 'test-user-001';
  const otherUserId = 'other-user-999';

  // Seed user
  db.prepare("INSERT INTO users (id, email, name) VALUES (?, 'tester@example.com', 'Tester')").bind(userId).run();
  db.prepare("INSERT INTO users (id, email, name) VALUES (?, 'other@example.com', 'Other')").bind(otherUserId).run();

  // ─────────────────────────────────────────────────────────────
  console.log('--- TEST 1: YouTube "uploaded" status deleted by clearCompletedSocialHistory ---');
  // ─────────────────────────────────────────────────────────────
  db.prepare(`
    INSERT INTO upload_jobs (id, user_id, title, status)
    VALUES ('yt-job-1', ?, 'YouTube Part 01', 'uploaded'),
           ('yt-job-2', ?, 'YouTube Part 02', 'uploaded'),
           ('yt-job-3', ?, 'YouTube Part 03 Failed', 'failed'),
           ('yt-job-sched', ?, 'YouTube Part Sched', 'scheduled')
  `).bind(userId, userId, userId, userId).run();

  db.prepare(`
    INSERT INTO facebook_upload_jobs (id, user_id, page_id, title, status)
    VALUES ('fb-job-1', ?, 'p1', 'FB Reel 1', 'published'),
           ('fb-job-sched', ?, 'p1', 'FB Reel Sched', 'scheduled')
  `).bind(userId, userId).run();

  db.prepare(`
    INSERT INTO instagram_upload_jobs (id, user_id, ig_user_id, title, status)
    VALUES ('ig-job-1', ?, 'ig1', 'IG Reel 1', 'published'),
           ('ig-job-sched', ?, 'ig1', 'IG Reel Sched', 'scheduled')
  `).bind(userId, userId).run();

  const clearRes = await clearCompletedSocialHistory(db, userId, 'all');
  assert(clearRes.success === true, 'clearCompletedSocialHistory returned success');
  assert(clearRes.deletedCount === 5, `Deleted exactly 5 terminal records (got ${clearRes.deletedCount}): 3 YT + 1 FB + 1 IG (minus scheduled)`);
  assert(clearRes.youtubeDeleted === 3, `YouTube deleted 3 records including 'uploaded' (got ${clearRes.youtubeDeleted})`);
  assert(clearRes.facebookDeleted === 1, `Facebook deleted 1 published record (got ${clearRes.facebookDeleted})`);
  assert(clearRes.instagramDeleted === 1, `Instagram deleted 1 published record (got ${clearRes.instagramDeleted})`);

  // Verify scheduled jobs protected
  const remYtSched = db.prepare("SELECT COUNT(*) as count FROM upload_jobs WHERE id = 'yt-job-sched'").first('count');
  const remFbSched = db.prepare("SELECT COUNT(*) as count FROM facebook_upload_jobs WHERE id = 'fb-job-sched'").first('count');
  const remIgSched = db.prepare("SELECT COUNT(*) as count FROM instagram_upload_jobs WHERE id = 'ig-job-sched'").first('count');
  assert(remYtSched === 1, 'Scheduled YouTube job was strictly protected from history clearance');
  assert(remFbSched === 1, 'Scheduled Facebook job was strictly protected from history clearance');
  assert(remIgSched === 1, 'Scheduled Instagram job was strictly protected from history clearance');

  // Verify uploaded YT jobs are permanently gone from DB
  const remYtUploaded = db.prepare("SELECT COUNT(*) as count FROM upload_jobs WHERE id IN ('yt-job-1', 'yt-job-2')").first('count');
  assert(remYtUploaded === 0, 'YouTube "uploaded" jobs completely removed from D1 (count = 0)');

  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Multi-Select History Deletion (deleteSocialHistoryItems) ---');
  // ─────────────────────────────────────────────────────────────
  db.prepare(`
    INSERT INTO upload_jobs (id, user_id, title, status)
    VALUES ('yt-sel-1', ?, 'YouTube Select 1', 'uploaded'),
           ('yt-sel-2', ?, 'YouTube Select 2', 'uploaded')
  `).bind(userId, userId).run();

  db.prepare(`
    INSERT INTO facebook_upload_jobs (id, user_id, page_id, title, status)
    VALUES ('fb-sel-1', ?, 'p1', 'FB Select 1', 'published'),
           ('fb-sel-2', ?, 'p1', 'FB Select 2', 'published')
  `).bind(userId, userId).run();

  db.prepare(`
    INSERT INTO instagram_upload_jobs (id, user_id, ig_user_id, title, status)
    VALUES ('ig-sel-1', ?, 'ig1', 'IG Select 1', 'published')
  `).bind(userId).run();

  // Multi-select delete yt-sel-1 and fb-sel-1 and ig-sel-1
  const delSelectedRes = await deleteSocialHistoryItems(db, userId, [
    { platform: 'youtube', id: 'yt-sel-1' },
    { platform: 'facebook', id: 'fb-sel-1' },
    { platform: 'instagram', id: 'ig-sel-1' }
  ]);

  assert(delSelectedRes.success === true, 'deleteSocialHistoryItems succeeded');
  assert(delSelectedRes.deletedCount === 3, `Expected 3 deleted items, got ${delSelectedRes.deletedCount}`);
  assert(delSelectedRes.deletedIds.length === 3, 'Returns 3 deleted item IDs');

  // Verify yt-sel-1 is gone, yt-sel-2 still exists
  const yt1Check = db.prepare("SELECT COUNT(*) as count FROM upload_jobs WHERE id = 'yt-sel-1'").first('count');
  const yt2Check = db.prepare("SELECT COUNT(*) as count FROM upload_jobs WHERE id = 'yt-sel-2'").first('count');
  assert(yt1Check === 0, 'Selected yt-sel-1 was permanently deleted from DB');
  assert(yt2Check === 1, 'Unselected yt-sel-2 was preserved in DB');

  // Verify fb-sel-1 is gone, fb-sel-2 still exists
  const fb1Check = db.prepare("SELECT COUNT(*) as count FROM facebook_upload_jobs WHERE id = 'fb-sel-1'").first('count');
  const fb2Check = db.prepare("SELECT COUNT(*) as count FROM facebook_upload_jobs WHERE id = 'fb-sel-2'").first('count');
  assert(fb1Check === 0, 'Selected fb-sel-1 was permanently deleted from DB');
  assert(fb2Check === 1, 'Unselected fb-sel-2 was preserved in DB');

  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: User Isolation in History Deletion ---');
  // ─────────────────────────────────────────────────────────────
  db.prepare(`
    INSERT INTO upload_jobs (id, user_id, title, status)
    VALUES ('yt-other-1', ?, 'Other User Video', 'uploaded')
  `).bind(otherUserId).run();

  // User 001 tries to delete Other User's record
  const hackRes = await deleteSocialHistoryItems(db, userId, [
    { platform: 'youtube', id: 'yt-other-1' }
  ]);
  assert(hackRes.deletedCount === 0, 'Cannot delete records belonging to another user (deletedCount = 0)');
  const otherCheck = db.prepare("SELECT COUNT(*) as count FROM upload_jobs WHERE id = 'yt-other-1'").first('count');
  assert(otherCheck === 1, 'Other user record remained untouched');

  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Scheduled Jobs Multi-Select Deletion (deleteScheduledSocialJobs) ---');
  // ─────────────────────────────────────────────────────────────
  db.prepare(`
    INSERT INTO facebook_upload_jobs (id, user_id, page_id, title, status, b2_file_name)
    VALUES ('fb-sched-del-1', ?, 'p1', 'FB Sched Del 1', 'scheduled', 'video_b2_del.mp4'),
           ('fb-sched-del-2', ?, 'p1', 'FB Sched Del 2', 'scheduled', 'video_b2_keep.mp4')
  `).bind(userId, userId).run();

  const schedDelRes = await deleteScheduledSocialJobs(db, userId, [
    { platform: 'facebook', id: 'fb-sched-del-1' }
  ]);
  assert(schedDelRes.success === true, 'deleteScheduledSocialJobs succeeded');
  assert(schedDelRes.deletedCount === 1, 'Deleted 1 scheduled job');
  assert(schedDelRes.candidateB2Files.includes('video_b2_del.mp4'), 'Candidate B2 file captured for cleanup');

  const fbSchedCheck = db.prepare("SELECT COUNT(*) as count FROM facebook_upload_jobs WHERE id = 'fb-sched-del-1'").first('count');
  assert(fbSchedCheck === 0, 'Scheduled job permanently deleted from database (count = 0)');

  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: All-Table Auto-Cleanup Strategy (runAutoCleanup) ---');
  // ─────────────────────────────────────────────────────────────
  const pastTimestamp = Date.now() - 10000; // expired
  const futureTimestamp = Date.now() + 1000000; // valid

  // Expired session & valid session
  db.prepare("INSERT INTO sessions (id, user_id, token, expires_at) VALUES ('sess-exp', ?, 'token-exp', ?)").bind(userId, pastTimestamp).run();
  db.prepare("INSERT INTO sessions (id, user_id, token, expires_at) VALUES ('sess-val', ?, 'token-val', ?)").bind(userId, futureTimestamp).run();

  // Old upload jobs (> 30 days) vs recent upload jobs
  db.prepare(`
    INSERT INTO upload_jobs (id, user_id, title, status, created_at)
    VALUES ('yt-old', ?, 'Old YT', 'uploaded', datetime('now', '-35 days')),
           ('yt-new', ?, 'New YT', 'uploaded', datetime('now', '-2 days'))
  `).bind(userId, userId).run();

  db.prepare(`
    INSERT INTO facebook_upload_jobs (id, user_id, page_id, title, status, created_at)
    VALUES ('fb-old', ?, 'p1', 'Old FB', 'published', datetime('now', '-35 days')),
           ('fb-new', ?, 'p1', 'New FB', 'published', datetime('now', '-2 days'))
  `).bind(userId, userId).run();

  db.prepare(`
    INSERT INTO instagram_upload_jobs (id, user_id, ig_user_id, title, status, created_at)
    VALUES ('ig-old', ?, 'ig1', 'Old IG', 'published', datetime('now', '-35 days')),
           ('ig-new', ?, 'p1', 'New IG', 'published', datetime('now', '-2 days'))
  `).bind(userId, userId).run();

  // Stale guest user (> 7 days, no email) vs active guest user
  db.prepare("INSERT INTO users (id, email, name, last_seen) VALUES ('guest-old', NULL, 'Guest', datetime('now', '-10 days'))").run();
  db.prepare("INSERT INTO users (id, email, name, last_seen) VALUES ('guest-new', NULL, 'Guest', datetime('now', '-1 days'))").run();

  const cleanupReport = await runAutoCleanup(db);
  assert(cleanupReport.expiredSessions >= 1, `Cleaned expired sessions: ${cleanupReport.expiredSessions}`);
  assert(cleanupReport.oldUploads >= 1, `Cleaned old YouTube uploads: ${cleanupReport.oldUploads}`);
  assert(cleanupReport.oldFacebookUploads >= 1, `Cleaned old Facebook uploads: ${cleanupReport.oldFacebookUploads}`);
  assert(cleanupReport.oldInstagramUploads >= 1, `Cleaned old Instagram uploads: ${cleanupReport.oldInstagramUploads}`);
  assert(cleanupReport.staleGuests >= 1, `Cleaned stale guest users: ${cleanupReport.staleGuests}`);

  // Verify valid session still exists
  const validSess = db.prepare("SELECT COUNT(*) as count FROM sessions WHERE id = 'sess-val'").first('count');
  assert(validSess === 1, 'Valid unexpired session was preserved');

  // Verify expired session is permanently removed
  const expSess = db.prepare("SELECT COUNT(*) as count FROM sessions WHERE id = 'sess-exp'").first('count');
  assert(expSess === 0, 'Expired session was permanently deleted from DB (count = 0)');

  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 6: On-Demand Unused Data Cleanup (cleanupUnusedData) ---');
  // ─────────────────────────────────────────────────────────────
  // Add an expired session for user
  db.prepare("INSERT INTO sessions (id, user_id, token, expires_at) VALUES ('sess-user-exp', ?, 'token-uexp', ?)").bind(userId, pastTimestamp).run();

  const onDemandRes = await cleanupUnusedData(db, userId);
  assert(onDemandRes.expiredSessions >= 1, `On-demand cleaned user expired sessions: ${onDemandRes.expiredSessions}`);

  console.log('\n===============================================================');
  console.log(`ALL TESTS COMPLETED: ${passedTests} Passed, ${totalTests - passedTests} Failed`);
  console.log('===============================================================\n');
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
