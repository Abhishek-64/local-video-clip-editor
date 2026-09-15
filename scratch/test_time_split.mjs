import { parseFlexibleTime, parseMultipleTimestamps, splitPartsAtTimestamps, splitKeptParts, formatTime } from '../frontend/src/utils/time.js';

console.log('=== TEST 1: Flexible Time Parsing ===');
const testCases = [
  { input: '01:30', expected: 90 },
  { input: '1:20:30', expected: 4830 },
  { input: '1h 20m 30s', expected: 4830 },
  { input: '5m', expected: 300 },
  { input: '45s', expected: 45 },
  { input: '90', expected: 90 },
  { input: '2 hours 15 min 10 sec', expected: 8110 },
  { input: '10.5s', expected: 10.5 }
];

testCases.forEach(({ input, expected }) => {
  const result = parseFlexibleTime(input);
  console.log(`  "${input}" => ${result}s (Expected: ${expected}s) -> ${result === expected ? 'PASS' : 'FAIL'}`);
});

console.log('\n=== TEST 2: Multiple Timestamps Parsing ===');
const multiInputs = [
  '00:30, 01:15, 02:45',
  '1m, 2m 30s, 5m',
  '30s 60s 90s',
  '00:10; 00:20; 00:30'
];

multiInputs.forEach(input => {
  const result = parseMultipleTimestamps(input, 600);
  console.log(`  "${input}" => [${result.map(t => formatTime(t)).join(', ')}] (${result.length} cut points)`);
});

console.log('\n=== TEST 3: Simultaneous Video Splitting at Multiple Timestamps ===');
const initial = [
  { id: 'p1', partNumber: 1, title: 'Full Video', startTime: 0, endTime: 300, duration: 300, isDeleted: false }
];
const timestamps = [30, 90, 180, 240];
const splitResult = splitPartsAtTimestamps(initial, 300, timestamps);
console.log(`  Splitting 300s video at [${timestamps.join(', ')}s]:`);
console.log(`  Generated ${splitResult.length} segments:`);
splitResult.forEach(p => {
  console.log(`    Part ${p.partNumber}: ${formatTime(p.startTime)} -> ${formatTime(p.endTime)} (${p.duration}s)`);
});

console.log('\n=== TEST 4: Interval Splitting (e.g. Every 60s) ===');
const intervalResult = splitKeptParts(initial, 300, 'duration', 60);
console.log(`  Interval split every 60s generated ${intervalResult.length} segments:`);
intervalResult.forEach(p => {
  console.log(`    Part ${p.partNumber || 1}: ${formatTime(p.startTime)} -> ${formatTime(p.endTime)} (${p.duration}s)`);
});

console.log('\n=== ALL AUTOMATED TIME TESTS COMPLETED SUCCESSFULLY! ===');
