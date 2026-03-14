// src/store.ts
// The core data layer — reads/writes .whycode/decisions.json

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface Decision {
  id: string;
  file: string;
  lines: string;         // e.g. "45-52" or "47"
  why: string;
  alternatives_rejected?: string[];
  revisit_when?: string;
  added_by: string;      // "claude-code" | "cursor" | "human" | agent name
  date: string;
  status: 'active' | 'deprecated' | 'draft';
  deprecated_reason?: string;
  blob_hash?: string;    // git blob hash of the lines at time of decision — for staleness
}

function getStorePath(projectRoot: string): string {
  return path.join(projectRoot, '.whycode', 'decisions.json');
}

export function readDecisions(projectRoot: string): Decision[] {
  const storePath = getStorePath(projectRoot);
  if (!fs.existsSync(storePath)) return [];
  const raw = fs.readFileSync(storePath, 'utf-8');
  return JSON.parse(raw) as Decision[];
}

export function writeDecisions(projectRoot: string, decisions: Decision[]): void {
  const dir = path.join(projectRoot, '.whycode');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getStorePath(projectRoot), JSON.stringify(decisions, null, 2));
}

export function addDecision(
  projectRoot: string,
  input: Omit<Decision, 'id' | 'date' | 'status'>
): Decision {
  const decisions = readDecisions(projectRoot);
  const decision: Decision = {
    ...input,
    id: crypto.randomBytes(4).toString('hex'),
    date: new Date().toISOString().split('T')[0],
    status: 'active',
  };
  decisions.push(decision);
  writeDecisions(projectRoot, decisions);
  return decision;
}

export function updateDecision(
  projectRoot: string,
  id: string,
  changes: Partial<Omit<Decision, 'id'>>
): Decision | null {
  const decisions = readDecisions(projectRoot);
  const idx = decisions.findIndex(d => d.id === id);
  if (idx === -1) return null;
  decisions[idx] = { ...decisions[idx], ...changes };
  writeDecisions(projectRoot, decisions);
  return decisions[idx];
}

export function deprecateDecision(
  projectRoot: string,
  id: string,
  reason: string
): Decision | null {
  return updateDecision(projectRoot, id, { status: 'deprecated', deprecated_reason: reason });
}

export function getDecisionsForFile(projectRoot: string, file: string): Decision[] {
  // Normalize file path — allow relative or absolute
  const normalized = file.replace(projectRoot + '/', '').replace(/^\//, '');
  return readDecisions(projectRoot).filter(
    d => d.status === 'active' &&
    (d.file === normalized || d.file === file || file.endsWith(d.file))
  );
}

export function queryDecisions(projectRoot: string, question: string): Decision[] {
  // Simple keyword search — for prototype. Can swap with embedding search later.
  const all = readDecisions(projectRoot).filter(d => d.status === 'active');
  const lower = question.toLowerCase();
  const keywords = lower.split(/\s+/).filter(w => w.length > 3);

  return all.filter(d => {
    const text = `${d.file} ${d.why} ${d.alternatives_rejected?.join(' ') ?? ''}`.toLowerCase();
    return keywords.some(kw => text.includes(kw));
  });
}

export function formatDecisionsForAgent(decisions: Decision[]): string {
  if (decisions.length === 0) return 'No WhyCode decisions recorded for this file.';
  return decisions.map(d =>
    `⚓ [${d.id}] ${d.file}:${d.lines}\n` +
    `   WHY: ${d.why}` +
    (d.alternatives_rejected?.length
      ? `\n   REJECTED: ${d.alternatives_rejected.join('; ')}`
      : '') +
    (d.revisit_when ? `\n   REVISIT WHEN: ${d.revisit_when}` : '')
  ).join('\n\n');
}
