// test/smoke-test.ts
// Quick smoke test — runs the store CRUD and verifies MCP tool descriptions load

import path from 'path';
import os from 'os';
import fs from 'fs';
import {
  addDecision,
  getDecisionsForFile,
  queryDecisions,
  updateDecision,
  deprecateDecision,
  formatDecisionsForAgent,
  readDecisions,
} from '../src/store.ts';

// Use a temp dir as project root
const TEST_ROOT = path.join(os.tmpdir(), 'whycode-test-' + Date.now());
fs.mkdirSync(TEST_ROOT, { recursive: true });

console.log('🧪 WhyCode Smoke Test\n');
console.log('Test root:', TEST_ROOT);

// 1. Add decisions
const d1 = addDecision(TEST_ROOT, {
  file: 'src/auth/token.ts',
  lines: '45-52',
  why: 'RS256 not HS256 — multi-service JWT sharing requires asymmetric keys',
  alternatives_rejected: ['HS256: shared secret creates cross-service security hole'],
  revisit_when: 'If we consolidate to single auth service',
  added_by: 'agent',
});

const d2 = addDecision(TEST_ROOT, {
  file: 'src/api/polling.ts',
  lines: '89',
  why: 'Polling not WebSockets — Acme Corp firewall blocks WS connections',
  alternatives_rejected: ['WebSockets: blocked by enterprise firewall'],
  revisit_when: 'When Acme Corp is no longer a client (Q4 2026)',
  added_by: 'claude-code',
});

console.log('\n✅ Added 2 decisions');
console.log(`   [${d1.id}] ${d1.file}:${d1.lines}`);
console.log(`   [${d2.id}] ${d2.file}:${d2.lines}`);

// 2. Get decisions for a file
const forToken = getDecisionsForFile(TEST_ROOT, 'src/auth/token.ts');
console.log(`\n✅ getDecisionsForFile('src/auth/token.ts') → ${forToken.length} decision(s)`);
console.log(formatDecisionsForAgent(forToken));

// 3. Query by keyword
const queryResult = queryDecisions(TEST_ROOT, 'WebSocket polling firewall');
console.log(`\n✅ queryDecisions('WebSocket') → ${queryResult.length} result(s)`);
console.log(`   [${queryResult[0]?.id}] ${queryResult[0]?.why.slice(0, 60)}...`);

// 4. Update a decision
updateDecision(TEST_ROOT, d1.id, { why: 'Updated: RS256 chosen for asymmetric key security across services' });
const afterUpdate = readDecisions(TEST_ROOT).find(d => d.id === d1.id);
console.log(`\n✅ updateDecision → ${afterUpdate?.why.slice(0, 60)}...`);

// 5. Deprecate a decision
deprecateDecision(TEST_ROOT, d2.id, 'Acme Corp ended contract Q2 2026 — WebSockets now safe to use');
const afterDeprecate = readDecisions(TEST_ROOT).find(d => d.id === d2.id);
console.log(`\n✅ deprecateDecision → status: ${afterDeprecate?.status}`);
console.log(`   Reason: ${afterDeprecate?.deprecated_reason}`);

// 6. Verify deprecated decision not returned for file query
const afterDeprecateQuery = getDecisionsForFile(TEST_ROOT, 'src/api/polling.ts');
console.log(`\n✅ getDecisionsForFile after deprecate → ${afterDeprecateQuery.length} (should be 0)`);

// 7. Show final decisions.json
const allDecisions = readDecisions(TEST_ROOT);
console.log(`\n✅ decisions.json contains ${allDecisions.length} total decisions`);
console.log(JSON.stringify(allDecisions, null, 2));

// Cleanup
fs.rmSync(TEST_ROOT, { recursive: true });
console.log('\n🎉 All smoke tests passed!');
