// src/extractor.ts
// Reads Claude Code session JSONL files and extracts decisions via LLM

import fs from 'fs';
import path from 'path';
import os from 'os';
import Anthropic from '@anthropic-ai/sdk';
import { addDecision, type Decision } from './store.js';

const client = new Anthropic();

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string }>;
}

interface ClaudeSessionEntry {
  type: 'message' | 'tool_use' | 'tool_result';
  message?: ClaudeMessage;
  tool?: { name: string; input?: Record<string, unknown> };
}

// Find all Claude Code session files for a given project
export function findClaudeCodeSessions(projectRoot: string): string[] {
  const claudeDir = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(claudeDir)) return [];

  // Claude Code hashes the project path to create a folder name
  const projectFolders = fs.readdirSync(claudeDir);

  // Try all project folders and return the most recent session files
  const sessionFiles: string[] = [];
  for (const folder of projectFolders) {
    const sessionsDir = path.join(claudeDir, folder, 'sessions');
    if (!fs.existsSync(sessionsDir)) continue;

    const files = fs.readdirSync(sessionsDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => path.join(sessionsDir, f))
      .sort((a, b) => fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime());

    sessionFiles.push(...files);
  }

  return sessionFiles;
}

// Parse a JSONL session file into conversation turns
export function parseSession(sessionFile: string): ClaudeSessionEntry[] {
  const raw = fs.readFileSync(sessionFile, 'utf-8');
  return raw
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line) as ClaudeSessionEntry; }
      catch { return null; }
    })
    .filter(Boolean) as ClaudeSessionEntry[];
}

// Extract readable text from a session
function sessionToText(entries: ClaudeSessionEntry[]): string {
  return entries
    .filter(e => e.type === 'message' && e.message)
    .map(e => {
      const msg = e.message!;
      const content = Array.isArray(msg.content)
        ? msg.content.map(c => (c.type === 'text' ? c.text : '')).join('')
        : msg.content;
      return `${msg.role.toUpperCase()}: ${content}`;
    })
    .join('\n\n');
}

// Proposed decision before human/agent approval
export interface ProposedDecision {
  file: string;
  lines: string;
  why: string;
  alternatives_rejected: string[];
  revisit_when?: string;
  confidence: 'high' | 'medium' | 'low';
}

// Call Anthropic to extract decisions from a session transcript
export async function extractDecisionsFromSession(
  sessionText: string
): Promise<ProposedDecision[]> {
  const response = await client.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `You are analyzing a coding session transcript to extract non-obvious implementation decisions.

A "decision" is something future developers or AI agents need to know BEFORE editing specific code:
- Why a seemingly wrong approach was chosen intentionally
- Why a simpler alternative was rejected (with reason)
- Constraints that are not visible in the code itself
- "Don't change this" situations with clear reasoning

Do NOT extract:
- General summaries of what was built
- Obvious code explanations
- Things that are clear from reading the code itself

For each decision found, provide JSON in this exact format:
{
  "decisions": [
    {
      "file": "relative/path/to/file.ts",
      "lines": "47" or "45-52",
      "why": "concise explanation of WHY this specific approach was taken",
      "alternatives_rejected": ["alternative 1: why rejected", "alternative 2: why rejected"],
      "revisit_when": "optional condition to revisit this decision",
      "confidence": "high" | "medium" | "low"
    }
  ]
}

If no clear decisions exist, return { "decisions": [] }

SESSION TRANSCRIPT:
${sessionText.slice(0, 8000)}`
    }]
  });

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as { decisions: ProposedDecision[] };
    return parsed.decisions ?? [];
  } catch {
    return [];
  }
}

// Main: extract + auto-save decisions from latest Claude Code session
export async function extractAndSaveFromLatestSession(
  projectRoot: string,
  options: { autoSave?: boolean; minConfidence?: 'high' | 'medium' | 'low' } = {}
): Promise<{ saved: Decision[]; skipped: ProposedDecision[] }> {
  const sessionFiles = findClaudeCodeSessions(projectRoot);
  if (sessionFiles.length === 0) {
    console.log('[WhyCode] No Claude Code sessions found.');
    return { saved: [], skipped: [] };
  }

  const latestSession = sessionFiles[0];
  console.log(`[WhyCode] Analyzing session: ${path.basename(latestSession)}`);

  const entries = parseSession(latestSession);
  const transcript = sessionToText(entries);

  if (transcript.length < 100) {
    console.log('[WhyCode] Session too short to extract decisions.');
    return { saved: [], skipped: [] };
  }

  console.log('[WhyCode] Extracting decisions via LLM...');
  const proposed = await extractDecisionsFromSession(transcript);

  const confidenceRank = { high: 3, medium: 2, low: 1 };
  const minRank = confidenceRank[options.minConfidence ?? 'medium'];

  const saved: Decision[] = [];
  const skipped: ProposedDecision[] = [];

  for (const proposal of proposed) {
    const rank = confidenceRank[proposal.confidence];
    if (options.autoSave && rank >= minRank) {
      const decision = addDecision(projectRoot, {
        ...proposal,
        added_by: 'whycode-extractor',
      });
      saved.push(decision);
    } else {
      skipped.push(proposal);
    }
  }

  return { saved, skipped };
}
