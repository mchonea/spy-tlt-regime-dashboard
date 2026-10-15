// ftq-gates.js - tests candidate filters on the "Flight to quality" box using backtest/results.csv.
// Post-processing only: scores are NOT recomputed; each gate decides whether a day's FTQ reading counts.
// Run:  node backtest/ftq-gates.js
const fs = require('fs'), path = require('path');
const L = fs.readFileSync(path.join(__dirname, 'results.csv'), 'utf8').trim().split('\n');
const h = L[0].split(','), ix = n => h.indexOf(n);
const rows = L.slice(1).map(l => { const f = l.split(','); const o = {}; h.forEach((n, i) => o[n] = f[i]); return o; });
rows.forEach(r => { ['S', 'T', 'layerA_pct', 'layerB_pct', 'layerC_pct', 'spy_adj', 'spy_fwd6m', 'tlt_fwd6m'].forEach(k => r[k] = r[k] === '' ? null : +r[k]); });
const dn = s => Date.parse(s) / 864e5;
// NBER months
const rec = new Set(fs.readFileSync(path.join(__dirname, '..', 'history', 'USREC.csv'), 'utf8').trim().split('\n').slice(1).map(l => l.split(',')).filter(f => +f[1] === 1).map(f => f[0].slice(0, 7)));

const N_PERSIST = 20;
const gates = {
  'Baseline (current rule)':               () => true,
  '1. S >= 46 for 20 straight sessions':    (i) => run46(i) >= N_PERSIST,
  '2. Layer A (recession) >= 50%':          (i) => rows[i].layerA_pct !== null && rows[i].layerA_pct >= 0.5,
  '3. Inflation/rates shock vetoes FTQ':    (i) => rows[i].shock !== 'Inflation/rates shock',
  '1+3':                                    (i) => run46(i) >= N_PERSIST && rows[i].shock !== 'Inflation/rates shock',
  '2+3':                                    (i) => rows[i].layerA_pct >= 0.5 && rows[i].shock !== 'Inflation/rates shock',
  '1+2':                                    (i) => run46(i) >= N_PERSIST && rows[i].layerA_pct >= 0.5,
  '1+2+3':                                  (i) => run46(i) >= N_PERSIST && rows[i].layerA_pct >= 0.5 && rows[i].shock !== 'Inflation/rates shock'
};
const runs = []; { let c = 0; rows.forEach((r, i) => { c = (r.S !== null && r.S >= 46) ? c + 1 : 0; runs[i] = c; }); }
function run46(i) { return runs[i]; }

function evaluate(gate, from, to) {
  const on = rows.map((r, i) => r.quadrant === 'FTQ' && gate(i));
  const idx = rows.map((r, i) => i).filter(i => rows[i].date >= from && rows[i].date <= to);
  // entries: FTQ on today, none in prior 273 calendar days
  const entries = []; let last = null;
  for (let i = 0; i < rows.length; i++) {
    if (on[i]) { if (rows[i].date >= from && rows[i].date <= to && (last === null || dn(rows[i].date) - dn(last) > 273) && !(i > 0 && on[i - 1])) entries.push(i); last = rows[i].date; }
  }
  // outcome of each entry: NBER recession month within 12m, or SPY >= 15% below entry close within 12m
  let hits = 0;
  const detail = entries.map(i => {
    const d0 = dn(rows[i].date), p0 = rows[i].spy_adj; let minP = p0, recess = false;
    for (let j = i; j < rows.length && dn(rows[j].date) - d0 <= 365; j++) { if (rows[j].spy_adj < minP) minP = rows[j].spy_adj; if (rec.has(rows[j].date.slice(0, 7))) recess = true; }
    const dd = 1 - minP / p0, hit = recess || dd >= 0.15; if (hit) hits++;
    return { date: rows[i].date, hit, dd };
  });
  // day-level precision / recall vs FTQ windows (SPY 6m <= -10% and TLT 6m >= +5%)
  let onDays = 0, onWin = 0, wins = 0, winsCovered = 0;
  idx.forEach(i => {
    const r = rows[i]; if (r.spy_fwd6m === null || r.tlt_fwd6m === null) return;
    const win = r.spy_fwd6m <= -0.10 && r.tlt_fwd6m >= 0.05;
    if (on[i]) { onDays++; if (win) onWin++; }
    if (win) { wins++; for (let k = Math.max(0, i - 63); k <= i; k++) if (on[k]) { winsCovered++; break; } }
  });
  return { entries: entries.length, hits, falseAlarms: entries.length - hits, onDays, precision: onDays ? onWin / onDays : null, recall: wins ? winsCovered / wins : null, wins, detail };
}
function firstOn(gate, a, b) { for (let i = 0; i < rows.length; i++) if (rows[i].date >= a && rows[i].date <= b && rows[i].quadrant === 'FTQ' && gate(i)) return rows[i].date; return 'never'; }
const pc = v => v === null ? 'n/a' : (v * 100).toFixed(0) + '%';

const periods = [['2000-01-01', '2012-12-31', '2000-2012'], ['2013-01-01', '2099-01-01', '2013-now']];
console.log('| Rule | Period | Entries | Hits | False | FTQ days | Precision | Recall | Windows |');
console.log('|---|---|---|---|---|---|---|---|---|');
Object.keys(gates).forEach(name => periods.forEach(p => {
  const e = evaluate(gates[name], p[0], p[1]);
  console.log(`| ${name} | ${p[2]} | ${e.entries} | ${e.hits} | ${e.falseAlarms} | ${e.onDays} | ${pc(e.precision)} | ${pc(e.recall)} | ${e.wins} |`);
}));
console.log('\nFirst FTQ date by rule');
console.log('| Rule | 2000-02 bear | 2007-09 bear | Sep 2008 | Mar 2020 |');
console.log('|---|---|---|---|---|');
Object.keys(gates).forEach(name => console.log(`| ${name} | ${firstOn(gates[name], '2000-01-01', '2002-12-31')} | ${firstOn(gates[name], '2007-01-01', '2009-12-31')} | ${firstOn(gates[name], '2008-09-01', '2009-06-30')} | ${firstOn(gates[name], '2020-02-01', '2020-12-31')} |`));
console.log('\nEntries by rule (H = hit, F = false alarm)');
Object.keys(gates).forEach(name => {
  const a = evaluate(gates[name], '2000-01-01', '2099-01-01');
  console.log(name + ': ' + a.detail.map(d => d.date + (d.hit ? ' H' : ' F')).join(', '));
});
