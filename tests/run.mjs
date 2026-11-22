// Runs the tests, several files at a time, and prints one line per file and the checks that failed.
//
//   node tests/run.mjs                 every test
//   node tests/run.mjs demineur yams   the tests of these games, and their screens in layout.mjs
//   node tests/run.mjs --verbose       every line of every test
//
// TEST_JOBS sets how many files run at once (4 by default). layout.mjs, the longest, runs in LAYOUT_PARTS
// parts at once (see the top of layout.mjs).
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';

// The games, and the tests that cover the library and every game. The longest first, so they end together.
const GAMES = ['solitaire', 'freecell', 'dames', 'dame-de-pique', 'demineur', 'yams', 'bataille-navale', 'paires'];
const FILES = {
  solitaire: ['play'], freecell: ['freecell'], dames: ['dames', 'dames-rules'], 'dame-de-pique': ['dame-de-pique', 'dame-de-pique-rules'],
  demineur: ['demineur', 'demineur-rules'], yams: ['yams', 'yams-rules'], 'bataille-navale': ['bataille-navale', 'bataille-navale-rules'],
  paires: ['paires', 'paires-rules'],
};
const SHARED = ['library', 'dialogs', 'zoom', 'stale', 'difficulty'];
const LAYOUT_PARTS = 4;

const args = process.argv.slice(2), verbose = args.includes('--verbose');
const picked = args.filter(a => !a.startsWith('--'));
for (const g of picked) if (!GAMES.includes(g)) { console.log(`Unknown game "${g}". Games: ${GAMES.join(', ')}`); process.exit(2); }

// One job: a file, with the environment it needs.
const jobs = [];
for (let k = 1; k <= LAYOUT_PARTS; k++) jobs.push({ file: 'layout', name: `layout ${k}/${LAYOUT_PARTS}`, env: { LAYOUT_PART: `${k}/${LAYOUT_PARTS}`, ...(picked.length && { LAYOUT_GAMES: picked.join(',') }) } });
for (const g of picked.length ? picked : GAMES) for (const f of FILES[g]) jobs.push({ file: f, name: f });
if (!picked.length) for (const f of SHARED) jobs.push({ file: f, name: f });

const width = Number(process.env.TEST_JOBS) || Math.max(1, Math.min(4, availableParallelism()));
const start = Date.now();
let failed = 0, next = 0;

function run(job) {
  return new Promise(done => {
    const t = Date.now();
    const child = spawn(process.execPath, [new URL(`${job.file}.mjs`, import.meta.url).pathname], { env: { ...process.env, ...job.env } });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('close', code => {
      const s = Math.round((Date.now() - t) / 1000);
      if (code === 0) console.log(`PASS ${job.name} (${s} s)`);
      else {
        failed++;
        console.log(`FAIL ${job.name} (${s} s)`);
        // The failed checks and what follows them; a crash shows its last lines.
        const lines = out.trimEnd().split('\n');
        const bad = lines.filter((l, i) => l.startsWith('FAIL') || (i && lines[i - 1].startsWith('FAIL') && l.startsWith('     ')));
        for (const l of (bad.length ? bad : lines.slice(-15))) console.log('  ' + l);
      }
      if (verbose) console.log(out);
      done();
    });
  });
}
async function worker() { while (next < jobs.length) await run(jobs[next++]); }
await Promise.all(Array.from({ length: Math.min(width, jobs.length) }, worker));
console.log(`\n${failed ? `${failed} of ${jobs.length} FAILED` : `ALL ${jobs.length} PASSED`} in ${Math.round((Date.now() - start) / 1000)} s`);
process.exit(failed ? 1 : 0);
