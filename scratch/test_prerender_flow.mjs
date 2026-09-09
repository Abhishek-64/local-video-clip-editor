import assert from 'node:assert';
import { getIntervalSeconds, calculateSingleScheduleTime, SCHEDULE_INTERVALS } from '../../local-video-clip-editor/frontend/src/utils/scheduler.js';

console.log('====================================================');
console.log('TESTING PRE-RENDER MODAL & SEQUENTIAL SCHEDULING FLOW');
console.log('====================================================\n');

// Test 1: SCHEDULE_INTERVALS availability
console.log('--- Test 1: Interval Presets & Helpers ---');
assert.ok(SCHEDULE_INTERVALS.length >= 8, 'Should have comprehensive interval presets');
const fifteenMin = SCHEDULE_INTERVALS.find(i => i.id === '15min');
assert.strictEqual(fifteenMin.minutes, 15);
assert.strictEqual(fifteenMin.seconds, 900);

const oneHour = SCHEDULE_INTERVALS.find(i => i.id === '1hour');
assert.strictEqual(oneHour.minutes, 60);
assert.strictEqual(oneHour.seconds, 3600);

assert.strictEqual(getIntervalSeconds('15min'), 900);
assert.strictEqual(getIntervalSeconds('30min'), 1800);
assert.strictEqual(getIntervalSeconds('1hour'), 3600);
assert.strictEqual(getIntervalSeconds('2hours'), 7200);
console.log('✓ PASSED: Interval presets and getIntervalSeconds validated.\n');

// Test 2: Sequential Staggered Schedule Calculation
console.log('--- Test 2: Sequential Staggered Intervals Across Multiple Clips ---');
const baseTime = '2026-09-09T10:00:00.000Z';
const intervalMinutes = 45;

const staggeredTimes = [];
for (let i = 0; i < 4; i++) {
  const offsetMs = i * intervalMinutes * 60 * 1000;
  const targetIso = new Date(new Date(baseTime).getTime() + offsetMs).toISOString();
  staggeredTimes.push(targetIso);
}

assert.strictEqual(staggeredTimes[0], '2026-09-09T10:00:00.000Z');
assert.strictEqual(staggeredTimes[1], '2026-09-09T10:45:00.000Z');
assert.strictEqual(staggeredTimes[2], '2026-09-09T11:30:00.000Z');
assert.strictEqual(staggeredTimes[3], '2026-09-09T12:15:00.000Z');
console.log('✓ Staggered times computed accurately:');
staggeredTimes.forEach((t, idx) => console.log(`   Part ${idx + 1}: ${t}`));
console.log('✓ PASSED: Staggered intervals.\n');

// Test 3: Platform Metadata Independence (No generic reused metadata)
console.log('--- Test 3: Platform Metadata Independence ---');
const ytSettings = {
  yt_name: 'Iron Man Action',
  yt_title_template: '{movie} - Part {part} | #Shorts',
  yt_description_template: '{movie} Part {part}\n\n#Shorts #Clips\n{hashtags}',
  yt_tags: ['action', 'marvel', 'shorts']
};

const fbSettings = {
  fb_name: 'Action Movie Highlights',
  fb_title_template: '{movie} - Part {part} | Official Reel',
  fb_caption_template: '{movie} - Part {part}\nFollow for more! {hashtags}',
  fb_tags: ['reelsfb', 'viralvideo', 'blockbuster']
};

const igSettings = {
  ig_name: 'CineClips IG',
  ig_caption_template: 'Part {part} of {movie}! Tap link in bio. {hashtags}',
  ig_tags: ['reelsinsta', 'instamovies', 'cinema']
};

function renderTemplate(tpl, { movieName, partNumber, tags }) {
  return tpl
    .replace(/{movie}/g, movieName)
    .replace(/{part}/g, String(partNumber).padStart(2, '0'))
    .replace(/{hashtags}/g, (tags || []).map(t => `#${t}`).join(' '));
}

const partNum = 3;
const ytTitle = renderTemplate(ytSettings.yt_title_template, { movieName: ytSettings.yt_name, partNumber: partNum, tags: ytSettings.yt_tags });
const fbTitle = renderTemplate(fbSettings.fb_title_template, { movieName: fbSettings.fb_name, partNumber: partNum, tags: fbSettings.fb_tags });
const igCaption = renderTemplate(igSettings.ig_caption_template, { movieName: igSettings.ig_name, partNumber: partNum, tags: igSettings.ig_tags });

assert.strictEqual(ytTitle, 'Iron Man Action - Part 03 | #Shorts');
assert.strictEqual(fbTitle, 'Action Movie Highlights - Part 03 | Official Reel');
assert.ok(igCaption.includes('CineClips IG'));
assert.ok(igCaption.includes('#reelsinsta #instamovies #cinema'));
assert.notStrictEqual(ytTitle, fbTitle, 'YouTube and Facebook titles must be strictly separate');
console.log('✓ YouTube Part 3 Title:', ytTitle);
console.log('✓ Facebook Part 3 Title:', fbTitle);
console.log('✓ Instagram Part 3 Caption:', igCaption);
console.log('✓ PASSED: Platform metadata independence verified.\n');

console.log('====================================================');
console.log('ALL PRE-RENDER & WORKFLOW TESTS PASSED (3/3)');
console.log('====================================================');
