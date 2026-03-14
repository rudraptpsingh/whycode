// src/daemon.ts
// Watches Claude Code session files and auto-extracts decisions when sessions complete

import chokidar from 'chokidar';
import path from 'path';
import os from 'os';
import { extractAndSaveFromLatestSession } from './extractor.js';

const DEBOUNCE_MS = 5000; // Wait 5s after last write (session may still be streaming)
const PROJECT_ROOT = process.env.WHYCODE_PROJECT_ROOT ?? process.cwd();

const timers = new Map<string, ReturnType<typeof setTimeout>>();

async function onSessionUpdated(sessionFile: string) {
  console.log(`[WhyCode Daemon] Session updated: ${path.basename(sessionFile)}`);

  // Debounce — session files get written to line by line
  if (timers.has(sessionFile)) clearTimeout(timers.get(sessionFile)!);

  timers.set(sessionFile, setTimeout(async () => {
    timers.delete(sessionFile);
    console.log(`[WhyCode Daemon] Session settled. Extracting decisions...`);

    try {
      const { saved, skipped } = await extractAndSaveFromLatestSession(PROJECT_ROOT, {
        autoSave: true,
        minConfidence: 'medium',
      });

      if (saved.length > 0) {
        console.log(`[WhyCode Daemon] ✅ Auto-saved ${saved.length} decision(s):`);
        saved.forEach(d => console.log(`  [${d.id}] ${d.file}:${d.lines} — ${d.why.slice(0, 60)}...`));
      }

      if (skipped.length > 0) {
        console.log(`[WhyCode Daemon] ⚠️  ${skipped.length} low-confidence decision(s) skipped.`);
        console.log('  Run: whycode review  to see and approve them manually');
      }

      if (saved.length === 0 && skipped.length === 0) {
        console.log('[WhyCode Daemon] No new decisions found in session.');
      }
    } catch (err) {
      console.error('[WhyCode Daemon] Extraction error:', (err as Error).message);
    }
  }, DEBOUNCE_MS));
}

function start() {
  const claudeSessionsGlob = path.join(os.homedir(), '.claude', 'projects', '**', 'sessions', '*.jsonl');

  console.log('[WhyCode Daemon] Starting...');
  console.log(`[WhyCode Daemon] Project root: ${PROJECT_ROOT}`);
  console.log(`[WhyCode Daemon] Watching: ${claudeSessionsGlob}`);

  const watcher = chokidar.watch(claudeSessionsGlob, {
    persistent: true,
    ignoreInitial: true,    // Don't process existing sessions on start
    awaitWriteFinish: false,
  });

  watcher
    .on('add', onSessionUpdated)
    .on('change', onSessionUpdated)
    .on('error', err => console.error('[WhyCode Daemon] Watcher error:', err));

  console.log('[WhyCode Daemon] Running. Waiting for Claude Code sessions...');
  console.log('[WhyCode Daemon] Press Ctrl+C to stop.\n');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await watcher.close();
    console.log('\n[WhyCode Daemon] Stopped.');
    process.exit(0);
  });
}

start();
