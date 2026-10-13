#!/usr/bin/env node
'use strict';
// Test double for the Claude Code CLI's documented headless interface
// (`claude -p <prompt> --output-format json`). Behaviour is chosen by the file
// named in FAKE_CLAUDE_MODE_FILE: ok | hang | error. Every call is logged to
// FAKE_CLAUDE_LOG so tests can check arguments and the working folder.
const fs = require('fs');

const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('9.9.9 (Claude Code test double)'); process.exit(0); }
if (args.includes('--help')) {
  console.log(['Usage: claude [options] [prompt]', '  -p, --print', '  --output-format <format>', '  --tools <tools...>',
    '  --permission-prompts <target>', '  --strict-mcp-config', '  --no-session-persistence', '  --append-system-prompt <prompt>'].join('\n'));
  process.exit(0);
}
const mode = process.env.FAKE_CLAUDE_MODE_FILE && fs.existsSync(process.env.FAKE_CLAUDE_MODE_FILE)
  ? fs.readFileSync(process.env.FAKE_CLAUDE_MODE_FILE, 'utf8').trim() : 'ok';
if (process.env.FAKE_CLAUDE_LOG) {
  fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, `${JSON.stringify({ pid: process.pid, mode, args, cwd: process.cwd(), files: fs.readdirSync('.') })}\n`);
}
const prompt = args[args.indexOf('-p') + 1] || '';
if (mode === 'hang') {
  setInterval(() => {}, 1000);
} else if (mode === 'error') {
  console.log(JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'Simulated failure', num_turns: 1 }));
  process.exit(1);
} else {
  const text = /exactly the word OK/.test(prompt)
    ? 'OK'
    : '# Pipeline review\n## Summary\n- 2 open deals, both SAMPLE.\n## Deals at risk\n- None.\n## Next actions\n- Sunrise Bakery (SAMPLE): collect statements.\n## Data gaps\n- None.\n## Uncertainties\n- Produced by the test double.';
  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: text, num_turns: 2, duration_ms: 1234, total_cost_usd: 0.0123, session_id: 'test-session', permission_denials: [] }));
}
