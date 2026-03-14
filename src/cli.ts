// src/cli.ts
// WhyCode CLI — whycode init | start | status | list | add | review

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { readDecisions, addDecision, formatDecisionsForAgent } from './store.js';
import { extractAndSaveFromLatestSession, findClaudeCodeSessions } from './extractor.js';

const program = new Command();
const PROJECT_ROOT = process.cwd();

program
  .name('whycode')
  .description('Agent-readable decision memory for your codebase')
  .version('0.1.0');

// ─── init ─────────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Set up WhyCode in the current project')
  .action(() => {
    // Create .whycode/ directory
    const whycodeDir = path.join(PROJECT_ROOT, '.whycode');
    if (!fs.existsSync(whycodeDir)) {
      fs.mkdirSync(whycodeDir, { recursive: true });
      fs.writeFileSync(path.join(whycodeDir, 'decisions.json'), '[]');
      console.log('✅ Created .whycode/decisions.json');
    } else {
      console.log('ℹ️  .whycode/ already exists');
    }

    // Add .whycode to .gitignore? No — we WANT it tracked
    // Add MCP config for Claude Desktop
    const claudeConfigPath = path.join(
      os.homedir(),
      'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'
    );

    if (fs.existsSync(claudeConfigPath)) {
      const config = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf-8'));
      config.mcpServers = config.mcpServers ?? {};
      config.mcpServers.whycode = {
        command: 'npx',
        args: ['tsx', path.join(__dirname, '..', 'src', 'mcp-server.ts')],
        env: { WHYCODE_PROJECT_ROOT: PROJECT_ROOT },
      };
      fs.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2));
      console.log('✅ Configured WhyCode MCP in Claude Desktop');
    } else {
      console.log('ℹ️  Claude Desktop config not found — skipping MCP auto-config');
      console.log('   Manual: add whycode to your claude_desktop_config.json mcpServers');
    }

    // Add instruction to CLAUDE.md
    const claudeMdPath = path.join(PROJECT_ROOT, 'CLAUDE.md');
    const whycodeInstruction = `
## WhyCode (Decision Memory)
Before editing ANY file, call the \`whycode_get_decisions\` tool with the file path.
Before completing any session where you made a non-obvious implementation decision, 
call \`whycode_add_decision\` to record it for future agents.
`.trim();

    if (fs.existsSync(claudeMdPath)) {
      const existing = fs.readFileSync(claudeMdPath, 'utf-8');
      if (!existing.includes('whycode_get_decisions')) {
        fs.appendFileSync(claudeMdPath, '\n\n' + whycodeInstruction);
        console.log('✅ Added WhyCode instructions to CLAUDE.md');
      } else {
        console.log('ℹ️  CLAUDE.md already has WhyCode instructions');
      }
    } else {
      fs.writeFileSync(claudeMdPath, whycodeInstruction);
      console.log('✅ Created CLAUDE.md with WhyCode instructions');
    }

    console.log('\n🎉 WhyCode initialized. Run `whycode start` to begin the daemon.');
  });

// ─── start ─────────────────────────────────────────────────────────────────────

program
  .command('start')
  .description('Start the WhyCode daemon (watches Claude Code sessions)')
  .action(async () => {
    console.log('Starting WhyCode daemon...');
    // Dynamically import to avoid loading chokidar unless needed
    const { default: { fork } } = await import('child_process');
    const daemon = fork(path.join(path.dirname(new URL(import.meta.url).pathname), 'daemon.ts'), [], {
      env: { ...process.env, WHYCODE_PROJECT_ROOT: PROJECT_ROOT },
      detached: false,
    });
    daemon.on('error', err => console.error('Daemon error:', err));
  });

// ─── status ────────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show WhyCode status for current project')
  .action(() => {
    const decisions = readDecisions(PROJECT_ROOT);
    const active = decisions.filter(d => d.status === 'active');
    const draft = decisions.filter(d => d.status === 'draft');

    console.log(`\n📊 WhyCode Status — ${PROJECT_ROOT}`);
    console.log(`   Active decisions:  ${active.length}`);
    console.log(`   Draft decisions:   ${draft.length}`);

    const sessions = findClaudeCodeSessions(PROJECT_ROOT);
    console.log(`   Claude sessions:   ${sessions.length} found`);
  });

// ─── list ──────────────────────────────────────────────────────────────────────

program
  .command('list')
  .description('List all decisions in this project')
  .option('-f, --file <file>', 'Filter by file')
  .action((opts) => {
    let decisions = readDecisions(PROJECT_ROOT).filter(d => d.status === 'active');
    if (opts.file) decisions = decisions.filter(d => d.file.includes(opts.file));

    if (decisions.length === 0) {
      console.log('No decisions recorded yet.');
      return;
    }

    console.log(formatDecisionsForAgent(decisions));
  });

// ─── add ───────────────────────────────────────────────────────────────────────

program
  .command('add')
  .description('Manually add a decision')
  .requiredOption('-f, --file <file>', 'File path')
  .requiredOption('-l, --lines <lines>', 'Line or range (e.g. 47 or 45-52)')
  .requiredOption('-w, --why <why>', 'Reason for this decision')
  .option('-a, --alternatives <alts...>', 'Rejected alternatives')
  .option('-r, --revisit <when>', 'When to revisit this decision')
  .action((opts) => {
    const decision = addDecision(PROJECT_ROOT, {
      file: opts.file,
      lines: opts.lines,
      why: opts.why,
      alternatives_rejected: opts.alternatives,
      revisit_when: opts.revisit,
      added_by: 'human',
    });
    console.log(`✅ Decision [${decision.id}] saved.`);
  });

// ─── extract ───────────────────────────────────────────────────────────────────

program
  .command('extract')
  .description('Extract decisions from latest Claude Code session')
  .option('--auto', 'Auto-save without prompting (medium+ confidence)', false)
  .action(async (opts) => {
    console.log('Extracting decisions from latest session...');
    const { saved, skipped } = await extractAndSaveFromLatestSession(PROJECT_ROOT, {
      autoSave: opts.auto,
      minConfidence: 'medium',
    });

    if (saved.length) {
      console.log(`\n✅ Saved ${saved.length} decision(s).`);
      saved.forEach(d => console.log(`  [${d.id}] ${d.file}:${d.lines}`));
    }

    if (skipped.length) {
      console.log(`\n⚠️  ${skipped.length} proposed decision(s) not saved (low confidence or manual mode):`);
      skipped.forEach((p, i) => console.log(`  ${i + 1}. ${p.file}:${p.lines} — ${p.why.slice(0, 60)}...`));
      console.log('\n  To save all, run: whycode extract --auto');
    }
  });

program.parse();
