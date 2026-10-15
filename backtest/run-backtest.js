#!/usr/bin/env node
/*
  run-backtest.js - validates the SPY Bear-Market Risk Score and the TLT Entry Score (spec section 9).
  Run from the TLT folder:   node backtest\run-backtest.js
  Reads  ..\history\*.csv   Uses ..\scoring.js + ..\config.js (the SAME code the dashboard runs).
  Writes backtest-report.md, results.csv, summary.js in this folder.  No npm dependencies.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const HIST = path.join(ROOT, 'history');
const Scoring = require(path.join(ROOT, 'scoring.js'));
const CFG0 = require(path.join(ROOT, 'config.js'));

const START = '1990-01-02';          // first scored date
const CAL_END = '2012-12-31';        // calibrate on 1990-2012, validate on 2013-present
const H3 = 63, H6 = 126, H12 = 252;  // forward horizons in trading days
const clone = o => JSON.parse(JSON.stringify(o));
const dn = Scoring.dayNum;

// ------------------------------------------------------------------ CSV loading
function readCsv(name) {
  const p = path.join(HIST, name + '.csv');
  if (!fs.existsSync(p)) throw new Error('missing ' + p + ' (run Update Market Data.bat first)');
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).slice(1).filter(Boolean);
  return lines.map(l => l.split(','));
}
const fredRows = id => readCsv(id).map(r => [r[0], +r[1]]);
const priceRows = t => readCsv(t).map(r => [r[0], +r[2]]);   // adjusted close

// ------------------------------------------------------------------ stats helpers
function quantile(a, p) {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
const median = a => quantile(a, 0.5);
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
function corr(x, y) {
  const n = x.length, mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}
const pct = (v, d = 1) => v === null || v === undefined || !isFinite(v) ? 'n/a' : (v * 100).toFixed(d) + '%';
const num = (v, d = 1) => v === null || v === undefined || !isFinite(v) ? 'n/a' : v.toFixed(d);
const months = (a, b) => (dn(b) - dn(a)) / 30.4375;

// ------------------------------------------------------------------ build price series
const log = [];
function note(s) { console.log(s); log.push(s); }

// SPY: ^GSPC (price only) before SPY's first date, rescaled so the series is continuous
const spyAct = priceRows('SPY'), gspc = priceRows('GSPC');
const spyFirst = spyAct[0][0];
const gAtSplice = gspc.find(r => r[0] === spyFirst) || gspc.filter(r => r[0] < spyFirst).pop();
const gScale = spyAct[0][1] / gAtSplice[1];
const spyRows = gspc.filter(r => r[0] < spyFirst).map(r => [r[0], r[1] * gScale]).concat(spyAct);

// Synthetic TLT from DGS20 (DGS30 where DGS20 is missing):  r = y(t-1)/252 - D*dy + 0.5*C*dy^2
function synthTlt(D, C) {
  const y20 = new Map(fredRows('DGS20')), y30 = new Map(fredRows('DGS30'));
  const dates = Array.from(new Set([...y20.keys(), ...y30.keys()])).sort();
  const out = []; let prev = null, level = 100;
  for (const d of dates) {
    if (prev) {
      let dy = 0, carry = null;
      if (y20.has(d) && y20.has(prev)) { dy = (y20.get(d) - y20.get(prev)) / 100; carry = y20.get(prev) / 100; }
      else if (y30.has(d) && y30.has(prev)) { dy = (y30.get(d) - y30.get(prev)) / 100; carry = y30.get(prev) / 100; }
      else if (y20.has(prev) || y30.has(prev)) { carry = (y20.has(prev) ? y20.get(prev) : y30.get(prev)) / 100; }
      if (carry !== null) level *= 1 + carry / 252 - D * dy + 0.5 * C * dy * dy;
    }
    out.push([d, level]); prev = d;
  }
  return out;
}
function monthlyReturns(rows) {            // [date, level] -> Map(YYYY-MM -> return)
  const m = new Map(); let prevLevel = null, prevKey = null, lastOfMonth = new Map();
  for (const [d, v] of rows) lastOfMonth.set(d.slice(0, 7), v);
  const keys = Array.from(lastOfMonth.keys()).sort();
  for (const k of keys) { const v = lastOfMonth.get(k); if (prevLevel !== null) m.set(k, v / prevLevel - 1); prevLevel = v; }
  return m;
}
const tltAct = priceRows('TLT');
const tltFirst = tltAct[0][0];
function validateSynth(D, C) {
  const syn = monthlyReturns(synthTlt(D, C).filter(r => r[0] >= tltFirst)), act = monthlyReturns(tltAct);
  const ks = Array.from(act.keys()).filter(k => syn.has(k) && k > tltFirst.slice(0, 7));
  return { corr: corr(ks.map(k => syn.get(k)), ks.map(k => act.get(k))), n: ks.length,
           te: Math.sqrt(mean(ks.map(k => (syn.get(k) - act.get(k)) ** 2))) * Math.sqrt(12) };
}
let D = 16.5, Cv = 380;
let val = validateSynth(D, Cv);
note(`Synthetic TLT validation (D=${D}, C=${Cv}): monthly-return correlation ${val.corr.toFixed(4)} over ${val.n} months, annualised tracking error ${(val.te * 100).toFixed(2)}%`);
let tuned = null;
if (val.corr <= 0.95) {
  let best = { corr: -1 };
  for (let d = 10; d <= 22; d += 0.5) for (let c = 100; c <= 600; c += 50) { const v = validateSynth(d, c); if (v.corr > best.corr) best = Object.assign({ D: d, C: c }, v); }
  tuned = best; D = best.D; Cv = best.C; val = best;
  note(`Correlation was <= 0.95; tuned to D=${D}, C=${Cv}: correlation ${val.corr.toFixed(4)}`);
}
const synRows = synthTlt(D, Cv);
const synAtSplice = synRows.find(r => r[0] === tltFirst) || synRows.filter(r => r[0] < tltFirst).pop();
const tScale = tltAct[0][1] / synAtSplice[1];
const tltRows = synRows.filter(r => r[0] < tltFirst && r[0] >= '1985-01-01').map(r => [r[0], r[1] * tScale]).concat(tltAct);

// ------------------------------------------------------------------ prepared data
const data = { series: {}, prices: {} };
Object.keys(CFG0.series).forEach(id => { data.series[id] = fredRows(id); });
data.prices.SPY = spyRows; data.prices.TLT = tltRows;
data.prices.XLY = priceRows('XLY'); data.prices.XLP = priceRows('XLP');

const firstDates = {};
Object.keys(data.series).forEach(id => { firstDates[id] = data.series[id][0][0]; });
const lastDates = {};
Object.keys(data.series).forEach(id => { lastDates[id] = data.series[id][data.series[id].length - 1][0]; });

const prep = Scoring.prepare(data, CFG0);
const tradeDates = Scoring.tradingDates(prep, START);
const LIVE = Scoring.liveDate(prep);
const allDates = tradeDates.concat([LIVE]);
const N = tradeDates.length;

// level of each series on each trading date (carry forward)
function alignLevels(rows) {
  const out = new Array(tradeDates.length); let j = 0, last = null;
  for (let i = 0; i < tradeDates.length; i++) {
    while (j < rows.length && rows[j][0] <= tradeDates[i]) { last = rows[j][1]; j++; }
    out[i] = last;
  }
  return out;
}
const spyL = alignLevels(spyRows), tltL = alignLevels(tltRows);
function fwd(L, i, h) { return i + h < N ? L[i + h] / L[i] - 1 : null; }

// ------------------------------------------------------------------ scoring pass
function scoreAll(cfg) {
  prep.cfg = cfg;
  const rows = [];
  for (let i = 0; i < allDates.length; i++) {
    const d = allDates[i], r = Scoring.evaluate(prep, d, cfg), live = i >= N;
    const row = {
      d, i, live, S: r.spy.score, T: r.tlt.score, Sw: r.spy.possible, Tw: r.tlt.possible,
      A: r.spy.layers.A.pct, B: r.spy.layers.B.pct, C: r.spy.layers.C.pct, conf: r.spy.confirmed,
      q: r.quadrant, unc: r.ftqUnconfirmed, rho: r.rho, shock: r.shock.type,
      si: r.spy.items.map(x => x.loaded ? x.status : ''), ti: r.tlt.items.map(x => x.loaded ? x.status : ''),
      spy: live ? null : spyL[i], tlt: live ? null : tltL[i]
    };
    if (!live) { row.fS3 = fwd(spyL, i, H3); row.fS6 = fwd(spyL, i, H6); row.fS12 = fwd(spyL, i, H12); row.fT3 = fwd(tltL, i, H3); row.fT6 = fwd(tltL, i, H6); row.fT12 = fwd(tltL, i, H12); }
    rows.push(row);
  }
  return rows;
}
note(`Scoring ${allDates.length} dates (${allDates[0]} to ${allDates[allDates.length - 1]}) ...`);
const t0 = Date.now();
let R = scoreAll(CFG0);
note(`  done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const byDate = new Map(R.map(r => [r.d, r]));
const idxOnOrBefore = d => { let lo = 0, hi = N - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (tradeDates[m] <= d) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; };
const idxOnOrAfter = d => { let lo = 0, hi = N - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (tradeDates[m] >= d) { ans = m; hi = m - 1; } else lo = m + 1; } return ans; };

// ------------------------------------------------------------------ outcomes: bear markets, recessions
function bearEpisodes(rows, thresh) {
  const eps = []; let peakI = 0, inBear = false, cur = null;
  for (let i = 0; i < rows.length; i++) {
    const p = rows[i][1];
    if (p >= rows[peakI][1]) {
      if (inBear) { eps.push(cur); inBear = false; cur = null; }
      peakI = i;
    } else if (!inBear && p <= rows[peakI][1] * (1 - thresh)) {
      inBear = true; cur = { peak: rows[peakI][0], peakLvl: rows[peakI][1], trough: rows[i][0], troughLvl: p, recovered: null };
    }
    if (inBear && p < cur.troughLvl) { cur.trough = rows[i][0]; cur.troughLvl = p; }
  }
  if (inBear) eps.push(cur);
  eps.forEach(e => { e.dd = 1 - e.troughLvl / e.peakLvl; });
  return eps;
}
const bears = bearEpisodes(spyRows, 0.20).filter(e => e.peak >= '1989-06-01');
const nearBears = bearEpisodes(spyRows, 0.15).filter(e => e.peak >= '1989-06-01' && !bears.some(b => b.peak === e.peak));
const usrec = fredRows('USREC');
const recessions = []; {
  let cur = null;
  for (const [d, v] of usrec) {
    if (v === 1 && !cur) cur = { start: d, end: d };
    else if (v === 1) cur.end = d;
    else if (cur) { recessions.push(cur); cur = null; }
  }
  if (cur) recessions.push(cur);
}
const recs = recessions.filter(r => r.start >= '1990-01-01').map(r => {
  const e = new Date(r.end + 'T00:00:00Z'); const end = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { peak: r.start, trough: end, name: 'NBER ' + r.start.slice(0, 7) };
});
const usrecMonthSet = new Set(usrec.filter(r => r[1] === 1).map(r => r[0].slice(0, 7)));
function inRecessionBetween(a, b) {   // any NBER recession month overlapping [a,b]
  for (let d = dn(a); d <= dn(b); d += 20) if (usrecMonthSet.has(Scoring.dayStr(d).slice(0, 7))) return true;
  return usrecMonthSet.has(b.slice(0, 7));
}

// first date within [from,to] where pred(row); returns {row, onAtStart}
function firstSignal(rows, from, to, pred) {
  let first = null;
  for (const r of rows) {
    if (r.d < from) continue;
    if (r.d > to) break;
    if (!first) first = r;
    if (pred(r)) return { row: r, onAtStart: r === first };
  }
  return null;
}
function episodeStats(ep, rows, kind) {
  const from = Scoring.addDays(ep.peak, -365), to = ep.trough;
  const tests = {
    S: r => r.S !== null && r.S >= CFG0.joint.spyHigh,
    conf: r => r.conf,
    A: r => r.A !== null && r.A >= 0.5, B: r => r.B !== null && r.B >= 0.5, C: r => r.C !== null && r.C >= 0.5
  };
  const out = { ep, from, to };
  Object.keys(tests).forEach(k => {
    const f = firstSignal(rows, from < START ? START : from, to, tests[k]);
    out[k] = f ? { d: f.row.d, lead: months(f.row.d, ep.peak), onAtStart: f.onAtStart, dd: (() => { const i = idxOnOrBefore(f.row.d), pi = idxOnOrBefore(ep.peak); return i >= 0 && pi >= 0 ? 1 - spyL[i] / spyL[pi] : null; })() } : null;
  });
  const pr = byDate.get(tradeDates[idxOnOrAfter(ep.peak)] || ep.peak);
  out.atPeak = pr ? { S: pr.S, T: pr.T, q: pr.q } : null;
  return out;
}

// ------------------------------------------------------------------ analytics (reusable per variant / period)
const inPeriod = (period) => r => period === 'cal' ? (r.d <= CAL_END) : period === 'val' ? (r.d > CAL_END) : true;
const PERIODS = [['cal', '1990–2012 (calibration)'], ['val', '2013–present (validation)']];

function signalRuns(rows, minLen) {   // runs of S >= 46 lasting >= minLen sessions
  const runs = []; let start = -1;
  const hi = r => r.S !== null && r.S >= CFG0.joint.spyHigh && !r.live;
  for (let k = 0; k <= rows.length; k++) {
    const on = k < rows.length && hi(rows[k]);
    if (on && start < 0) start = k;
    if (!on && start >= 0) { if (k - start >= minLen) runs.push({ a: rows[start].d, b: rows[k - 1].d, len: k - start, si: start, ei: k - 1 }); start = -1; }
  }
  return runs;
}
function classifyRuns(runs) {
  runs.forEach(r => {
    const e = Scoring.addDays(r.a, 365);
    const fmin = (() => { let mn = 0; const i0 = idxOnOrBefore(r.a); for (let k = i0 + 1; k <= Math.min(N - 1, i0 + H12); k++) mn = Math.min(mn, spyL[k] / spyL[i0] - 1); return mn; })();
    r.fwdMin = fmin; r.rec = inRecessionBetween(r.a, e); r.dd15 = fmin <= -0.15; r.hit = r.rec || r.dd15;
    r.incomplete = dn(e) > dn(tradeDates[N - 1]);
  });
  return runs;
}

function quadStats(rows, filt) {
  const sel = rows.filter(r => !r.live && filt(r) && r.S !== null && r.T !== null);
  const tot = sel.length, out = {};
  ['FTQ', 'NOHEDGE', 'BONDRALLY', 'RISKON'].forEach(q => {
    const s = sel.filter(r => r.q === q), o = { n: s.length, share: tot ? s.length / tot : 0 };
    [['fS3', 'S3'], ['fS6', 'S6'], ['fS12', 'S12'], ['fT3', 'T3'], ['fT6', 'T6'], ['fT12', 'T12']].forEach(([f, k]) => {
      const v = s.map(r => r[f]).filter(x => x !== null && x !== undefined);
      o[k] = { n: v.length, med: median(v), p10: quantile(v, 0.1), p90: quantile(v, 0.9) };
    });
    out[q] = o;
  });
  return { tot, out };
}
function ftqStats(rows, filt) {
  const sel = rows.filter(r => !r.live && filt(r) && r.fS6 !== null && r.fS6 !== undefined && r.fT6 !== null && r.S !== null && r.T !== null);
  const isW = r => r.fS6 <= -0.10 && r.fT6 >= 0.05, isBoth = r => r.fS6 <= -0.10 && r.fT6 <= 0;
  const calc = (qf) => {
    const qDays = sel.filter(qf), hit = qDays.filter(isW).length;
    // recall: FTQ windows preceded by the quadrant within the previous 63 sessions (including the day)
    const wins = sel.filter(isW); let pre = 0;
    const pos = new Map(rows.map((r, k) => [r.d, k]));
    wins.forEach(w => { const k = pos.get(w.d); for (let j = Math.max(0, k - H3); j <= k; j++) if (qf(rows[j])) { pre++; break; } });
    return { qDays: qDays.length, hit, precision: qDays.length ? hit / qDays.length : null, windows: wins.length, recall: wins.length ? pre / wins.length : null,
             bothDown: qDays.filter(isBoth).length };
  };
  return {
    n: sel.length, base: sel.filter(isW).length / (sel.length || 1), baseBoth: sel.filter(isBoth).length / (sel.length || 1),
    any: calc(r => r.q === 'FTQ'), confirmed: calc(r => r.q === 'FTQ' && !r.unc),
    nohedge: (() => { const s = sel.filter(r => r.q === 'NOHEDGE'); return { n: s.length, bothDown: s.filter(isBoth).length, ftq: s.filter(isW).length }; })()
  };
}
const BUCKETS = [[0, 25], [26, 45], [46, 65], [66, 80], [81, 100]];
function tltBuckets(rows, filt) {
  const sel = rows.filter(r => !r.live && filt(r) && r.T !== null);
  const allv = (f) => sel.map(r => r[f]).filter(x => x !== null && x !== undefined);
  const res = BUCKETS.map(([lo, hi]) => {
    const s = sel.filter(r => r.T >= lo && r.T <= hi), o = { lo, hi, n: s.length };
    ['fT6', 'fT12'].forEach(f => { const v = s.map(r => r[f]).filter(x => x !== null && x !== undefined); o[f] = { n: v.length, med: median(v), mean: mean(v), pos: v.length ? v.filter(x => x > 0).length / v.length : null }; });
    return o;
  });
  const base = {}; ['fT6', 'fT12'].forEach(f => { const v = allv(f); base[f] = { n: v.length, med: median(v), mean: mean(v), pos: v.length ? v.filter(x => x > 0).length / v.length : null }; });
  const hiV = sel.filter(r => r.T >= 46).map(r => r.fT6).filter(x => x !== null && x !== undefined), loV = sel.filter(r => r.T <= 45).map(r => r.fT6).filter(x => x !== null && x !== undefined);
  return { buckets: res, base, spread6: (hiV.length && loV.length) ? { hi: median(hiV), lo: median(loV), diff: median(hiV) - median(loV), nHi: hiV.length, nLo: loV.length, meanDiff: mean(hiV) - mean(loV) } : null };
}

function summarizeVariant(rows) {
  const eps = bears.concat(recs).map(e => episodeStats(e, rows));
  const out = {};
  PERIODS.forEach(([p]) => {
    const f = inPeriod(p);
    const ee = eps.filter(e => f({ d: e.ep.peak }));
    const det = ee.filter(e => e.S), lead = det.map(e => e.S.lead);
    const runs = classifyRuns(signalRuns(rows.filter(f), 20));
    const fa = runs.filter(r => !r.hit);
    out[p] = { episodes: ee.length, detected: det.length, medLead: median(lead), runs: runs.length, falseAlarms: fa.length, faDays: fa.reduce((s, r) => s + r.len, 0),
               sigDays: runs.reduce((s, r) => s + r.len, 0), tlt: tltBuckets(rows, r => f(r) && r.d >= '2003-01-01').spread6, days: rows.filter(f).length };
  });
  return out;
}

// ------------------------------------------------------------------ variants (calibration, spec 9.5)
const variants = [];
function variant(name, apply, why, kind, change) { const c = clone(CFG0); apply(c); variants.push({ name, cfg: c, why, kind: kind || 'spy', change }); }
const sp = (c, k) => c.spy.find(x => x.key === k).params, tp = (c, k) => c.tlt.find(x => x.key === k).params;
variant('TLT curve rule: GREEN if 30Y 20-day change < 0 (any 2Y move)', c => { tp(c, 'curve').curveRule = 'alt'; }, 'Spec section 7 open question', 'tlt', "curveRule 'original' → 'alt'");
if (fs.existsSync(path.join(__dirname, 'variants.js'))) variants.push(...require('./variants.js')(clone, CFG0));

// ------------------------------------------------------------------ run analytics on the baseline
const base = summarizeVariant(R);
const variantResults = variants.map(v => { const rows = scoreAll(v.cfg); return { v, rows, sum: summarizeVariant(rows) }; });
prep.cfg = CFG0;

// ------------------------------------------------------------------ report
const md = [];
const P = s => md.push(s === undefined ? '' : s);
function table(head, rows) { P('| ' + head.join(' | ') + ' |'); P('|' + head.map(() => '---').join('|') + '|'); rows.forEach(r => P('| ' + r.join(' | ') + ' |')); P(); }

P('# SPY–TLT Regime Dashboard: Backtest Report');
P();
P(`Generated ${new Date().toISOString().slice(0, 10)} by \`backtest\\run-backtest.js\` using the same \`scoring.js\` / \`config.js\` as the dashboard. Data through ${tradeDates[N - 1]}.`);
P();
P('> **Read this first.** The sample contains only ' + bears.length + ' bear markets (≥20% drawdown) and ' + recs.length + ' NBER recessions since 1990, and they overlap. Everything below is a sanity check on whether the scores behaved sensibly, **not proof** that they work. Thresholds were set before looking at results; any change is listed under "Threshold changes".');
P();

// ---- headline
P('## 1. Headline numbers');
P();
const hdr = [], bearRows = [];
const epAll = bears.map(e => episodeStats(e, R));
const recAll = recs.map(e => episodeStats(e, R));
const detS = epAll.filter(e => e.S), detC = epAll.filter(e => e.conf);
const detSr = recAll.filter(e => e.S);
const medLeadBear = median(detS.map(e => e.S.lead)), medLeadConf = median(detC.map(e => e.conf.lead));
const medLeadRec = median(detSr.map(e => e.S.lead));
const runsAll = classifyRuns(signalRuns(R, 20)), faAll = runsAll.filter(r => !r.hit);
const ftqMain = ftqStats(R, r => r.d >= '2003-01-01');
const tltAll = tltBuckets(R, r => r.d >= '2003-01-01');
P(`- **Bear markets (≥20%) flagged by S ≥ 46 inside the 12-months-before-peak → trough window:** ${detS.length} of ${epAll.length}; median lead vs the peak ${num(medLeadBear)} months (negative = after the peak). Confirmed-bear flag: ${detC.length} of ${epAll.length}, median ${num(medLeadConf)} months.`);
P(`- **NBER recessions flagged:** ${detSr.length} of ${recAll.length}; median lead vs the recession start ${num(medLeadRec)} months.`);
P(`- **False alarms** (S ≥ 46 for ≥ 20 sessions, not followed within 12 months by a ≥15% SPY drawdown or an NBER recession): ${faAll.length} of ${runsAll.length} signal episodes, ${faAll.reduce((s, r) => s + r.len, 0)} sessions.`);
P(`- **Flight-to-quality quadrant, 2003→present:** precision ${pct(ftqMain.any.precision)} (base rate of FTQ windows ${pct(ftqMain.base)}), recall ${pct(ftqMain.any.recall)}.`);
if (tltAll.spread6) P(`- **TLT score alone, 2003→present:** median forward 6-month TLT total return ${pct(tltAll.spread6.hi)} when T ≥ 46 vs ${pct(tltAll.spread6.lo)} when T ≤ 45.`);
P(`- **Synthetic TLT (pre-2002-07):** monthly correlation vs real TLT ${val.corr.toFixed(3)} (${val.n} months).`);
P();

// ---- data
P('## 2. Data sources, coverage and limitations');
P();
P('**FRED series start dates (confirmed from the downloaded history):**');
P();
table(['Series', 'First obs', 'Last obs', 'Spec expected'], Object.keys(CFG0.series).map(id => [id, firstDates[id], lastDates[id], ({ DGS30: '1977', DGS20: '1993 (+1962–86)', DGS10: '1962', DGS2: '1976', DFII10: '2003', T10YIE: '2003', DFF: '1954', UNRATE: '1948', PAYEMS: '1939', BAMLH0A0HYM2: '1996 (verify)', T10Y3M: '1982', SAHMREALTIME: '1959', ICSA: '1967', NFCI: '1971', BAA10Y: '1986', VIXCLS: '1990', USREC: '1854' })[id] || '']));
P('**Prices:** SPY from ' + spyFirst + ' (dividend-adjusted close, Yahoo Finance); before that ^GSPC **price-only** (excludes dividends, understating pre-1993 total returns by about 3% a year), rescaled for continuity. TLT from ' + tltFirst + ' (adjusted close); before that a **synthetic TLT** built from DGS20 (DGS30 where DGS20 is missing) with D = ' + D + ', C = ' + Cv + '. XLY/XLP from 1998-12 (the cyclicals/defensives indicator is unavailable before then and the score is rescaled).');
P();
const hyFirst = firstDates.BAMLH0A0HYM2;
P(`**Truncated history: BAMLH0A0HYM2 (ICE BofA high-yield OAS) starts ${hyFirst}** on FRED (ICE licensing limits FRED to about 3 years). The High-yield spread indicator therefore scores only from ${hyFirst}; before that the SPY score relies on BAA10Y for credit, and the TLT score's high-yield indicator is missing (10 weight points rescaled). This is why the Baa–10Y indicator is in the spec.`);
P();
P(`**Synthetic TLT validation:** monthly-return correlation synthetic vs actual TLT over ${val.n} months = **${val.corr.toFixed(4)}** (annualised tracking error ${(val.te * 100).toFixed(2)}%)` + (tuned ? `. The spec's D = 16.5 / C = 380 gave ≤ 0.95, so they were tuned to D = ${D}, C = ${Cv}.` : ` using the spec's D = 16.5, C = 380 (no tuning needed; target was > 0.95).`));
P();
P('**No look-ahead:** daily FRED data and prices become usable the next day, weekly (ICSA, NFCI) +5 days, monthly (UNRATE, PAYEMS, SAHMREALTIME) on the 8th of the following month; USREC is used only to label outcomes. Forward returns start from the close of the signal date.');
P();
P('**Limitations**');
P('- PAYEMS and UNRATE are **current vintages** (revised). Real-time prints were weaker/noisier, so the payroll and labor indicators here are somewhat cleaner than what was known at the time. SAHMREALTIME is already real-time. ALFRED vintages were not used.');
P('- Small sample (see top). Overlapping windows and serial correlation mean the effective number of independent observations is far smaller than the number of days.');
P('- Pre-2003 the TLT score is missing DFII10 and T10YIE (40 of 100 weight points) and, throughout, the high-yield spread before ' + hyFirst + ', so earlier scores are rescaled and less reliable. The 2002-02 → 2006-02 gap in DGS30 also removes the 30Y and curve indicators in that stretch.');
P('- The TLT score was built with knowledge of the post-2020 period; the 1990–2012 calibration/2013+ validation split reduces, but does not remove, hindsight.');
P('- Yahoo prices are unofficial; the final row is the latest close or an intraday print.');
P();
P('**Indicator coverage by year (average % of weight loaded):**');
P();
{
  const yrs = {}; R.filter(r => !r.live).forEach(r => { const y = r.d.slice(0, 4); (yrs[y] = yrs[y] || { s: [], t: [] }); yrs[y].s.push(r.Sw); yrs[y].t.push(r.Tw); });
  const ys = Object.keys(yrs).sort();
  const cov = ys.map(y => [y, num(mean(yrs[y].s) / 100 * 100, 0) + '%', num(mean(yrs[y].t) / 100 * 100, 0) + '%']);
  table(['Year', 'SPY score', 'TLT score'], cov);
}

// ---- 3. episodes
P('## 3. Bear markets and recessions: warning given by the SPY score');
P();
P('Window: from 12 months before the peak (recession: before the NBER start) to the trough. "Lead" is months before the peak (negative = after). "DD at signal" is the drawdown already taken from the peak when the signal first fired. "(on)" = already on at the start of the window.');
P();
function epRow(e, name) {
  const f = k => e[k] ? e[k].d + (e[k].onAtStart ? ' (on)' : '') : 'never';
  const l = k => e[k] ? num(e[k].lead) : '–';
  const dd = k => e[k] && e[k].dd !== null ? pct(e[k].dd, 0) : '–';
  return [name, e.ep.peak, e.ep.trough, e.ep.dd ? pct(e.ep.dd, 0) : '', f('S'), l('S'), dd('S'), f('conf'), l('conf'), dd('conf'),
    e.atPeak ? (e.atPeak.S === null ? 'n/a' : e.atPeak.S) + ' / ' + (e.atPeak.T === null ? 'n/a' : e.atPeak.T) : ''];
}
const eh = ['Episode', 'Peak', 'Trough', 'Max DD', 'First S ≥ 46', 'Lead (mo)', 'DD at signal', 'First "confirmed"', 'Lead (mo)', 'DD at signal', 'S / T at peak'];
P('### 3a. Bear markets (≥ 20% from all-time high, adjusted SPY / ^GSPC)');
P();
table(eh, epAll.map((e, k) => epRow(e, 'Bear ' + e.ep.peak.slice(0, 4))));
P('### 3b. NBER recessions (peak = recession start, trough = recession end)');
P();
table(eh, recAll.map(e => epRow(e, e.ep.name)));
P('### 3c. Near-bears (drawdown 15–20%): for context');
P();
table(eh, nearBears.map(e => epRow(episodeStats(e, R), 'DD ' + e.peak.slice(0, 7))));
P('### 3d. Layer contribution: lead time each layer gives on its own');
P();
P('A layer "fires" when ≥ 50% of its (loaded) weight is in ALERT/WATCH-weighted points. Lead in months before the peak/start (negative = after). Bear markets and recessions are combined.');
P();
{
  const all = epAll.map(e => [ 'Bear ' + e.ep.peak.slice(0, 4), e]).concat(recAll.map(e => [e.ep.name, e]));
  table(['Episode', 'Layer A (recession)', 'Layer B (credit)', 'Layer C (market)', 'Total S ≥ 46', 'Confirmed'],
    all.map(([n, e]) => [n].concat(['A', 'B', 'C', 'S', 'conf'].map(k => e[k] ? num(e[k].lead) : 'never'))));
  const ks = ['A', 'B', 'C', 'S', 'conf'];
  const med = k => { const v = all.map(([, e]) => e[k] ? e[k].lead : null).filter(x => x !== null); return v.length ? num(median(v)) + ' (' + v.length + '/' + all.length + ')' : 'never'; };
  P('Median lead (detected / total): A ' + med('A') + ', B ' + med('B') + ', C ' + med('C') + ', S ≥ 46 ' + med('S') + ', confirmed ' + med('conf') + '.');
  P();
}

// ---- 4. false alarms
P('## 4. False alarms');
P();
P('A signal episode is S ≥ 46 for ≥ 20 consecutive sessions. It is a **hit** if within 12 months an NBER recession month occurs (or is in progress) or SPY falls ≥ 15% below the signal-date close; otherwise a **false alarm**. Episodes within 12 months of the data end are marked incomplete.');
P();
table(['Period', 'Signal episodes', 'Hits', 'False alarms', 'Sessions in signal', 'Sessions in false alarms', 'Years'], PERIODS.map(([p, n]) => {
  const rr = runsAll.filter(r => inPeriod(p)({ d: r.a })), fa = rr.filter(r => !r.hit);
  const yrs = R.filter(r => !r.live && inPeriod(p)(r)).length / 252;
  return [n, rr.length, rr.length - fa.length, fa.length, rr.reduce((s, r) => s + r.len, 0), fa.reduce((s, r) => s + r.len, 0), num(yrs, 1)];
}));
table(['Start', 'End', 'Sessions', 'Worst SPY 12-mo fwd', 'NBER recession ≤12m', 'Outcome'], runsAll.map(r => [r.a, r.b, r.len, pct(r.fwdMin, 0), r.rec ? 'yes' : 'no', r.hit ? 'hit' : (r.incomplete ? 'FALSE ALARM (incomplete window)' : 'FALSE ALARM')]));

// ---- 5. quadrants
P('## 5. Joint view: forward returns by regime quadrant');
P();
P('Quadrant needs both scores. TLT score has full indicator coverage only from 2003; 1990–2002 is supplementary. Forward returns are total returns over 3/6/12 months (63/126/252 sessions) from the signal date; each cell shows median [10th – 90th percentile].');
P();
const qNames = { FTQ: 'Flight to quality (S≥46, T≥46)', NOHEDGE: "Duration won't hedge (S≥46, T≤45)", BONDRALLY: 'Bond rally, stocks OK (S≤45, T≥46)', RISKON: 'Risk-on / rates pressure (S≤45, T≤45)' };
const QP = [['1990–2002 (supplementary)', r => r.d < '2003-01-01'], ['2003–2012 (calibration)', r => r.d >= '2003-01-01' && r.d <= CAL_END], ['2013–present (validation)', r => r.d > CAL_END], ['2003–present (main)', r => r.d >= '2003-01-01']];
QP.forEach(([title, f]) => {
  const qs = quadStats(R, f);
  P(`### ${title} (${qs.tot} sessions)`);
  P();
  const cell = o => o.n ? `${pct(o.med)} [${pct(o.p10, 0)} – ${pct(o.p90, 0)}]` : 'n/a';
  table(['Quadrant', 'Share of days', 'SPY 3m', 'SPY 6m', 'SPY 12m', 'TLT 3m', 'TLT 6m', 'TLT 12m'],
    Object.keys(qNames).map(q => { const o = qs.out[q]; return [qNames[q], pct(o.share), cell(o.S3), cell(o.S6), cell(o.S12), cell(o.T3), cell(o.T6), cell(o.T12)]; }));
});

P('## 6. Flight-to-quality precision and recall');
P();
P('FTQ window = next 6 months SPY total return ≤ −10% **and** TLT ≥ +5%. Both-down window = SPY ≤ −10% and TLT ≤ 0. Precision = share of quadrant days that were FTQ windows. Recall = share of FTQ-window days preceded by the quadrant within the previous 3 months (63 sessions).');
P();
const fp = [['2003–2012 (calibration)', r => r.d >= '2003-01-01' && r.d <= CAL_END], ['2013–present (validation)', r => r.d > CAL_END], ['2003–present', r => r.d >= '2003-01-01'], ['1990–2002 (supplementary)', r => r.d < '2003-01-01']];
table(['Period', 'Days w/ fwd data', 'Base rate FTQ window', 'Quadrant days', 'Precision', 'Recall', 'FTQ windows (days)', 'Confirmed-only precision', 'Confirmed-only recall'],
  fp.map(([n, f]) => { const s = ftqStats(R, f); return [n, s.n, pct(s.base), s.any.qDays, pct(s.any.precision), pct(s.any.recall), s.any.windows, pct(s.confirmed.precision) + ` (${s.confirmed.qDays} days)`, pct(s.confirmed.recall)]; }));
P('"Confirmed-only" excludes days downgraded to "unconfirmed" because the 63-day SPY/TLT correlation was above +0.2.');
P();
table(['Period', "\"Duration won't hedge\" days", 'of which both-down', 'of which FTQ window', 'Base rate both-down'],
  fp.map(([n, f]) => { const s = ftqStats(R, f); return [n, s.nohedge.n, s.nohedge.bothDown + (s.nohedge.n ? ` (${pct(s.nohedge.bothDown / s.nohedge.n, 0)})` : ''), s.nohedge.ftq, pct(s.baseBoth)]; }));

// ---- 7. TLT score
P('## 7. Does the TLT score alone have any value?');
P();
P('Forward TLT total return by TLT score bucket: median / mean / share positive (n sessions).');
P();
[['1990–2002 (partial coverage, synthetic TLT)', r => r.d < '2003-01-01'], ['2003–2012 (calibration)', r => r.d >= '2003-01-01' && r.d <= CAL_END], ['2013–present (validation)', r => r.d > CAL_END]].forEach(([title, f]) => {
  const t = tltBuckets(R, f);
  P('### ' + title);
  P();
  const c = o => o.n ? `${pct(o.med)} / ${pct(o.mean)} / ${pct(o.pos, 0)} (${o.n})` : 'n/a';
  table(['TLT score', '6-mo fwd return', '12-mo fwd return'],
    t.buckets.map(b => [`${b.lo}–${b.hi}`, c(b.fT6), c(b.fT12)]).concat([['**All days**', c(t.base.fT6), c(t.base.fT12)]]));
  if (t.spread6) P(`Median 6-mo forward TLT return: **${pct(t.spread6.hi)}** for T ≥ 46 (n=${t.spread6.nHi}) vs **${pct(t.spread6.lo)}** for T ≤ 45 (n=${t.spread6.nLo}); difference ${pct(t.spread6.diff)}.`);
  P();
});

// ---- 8. hand check
P('## 8. Episode hand-check');
P();
P('Scores as of the 15th of each month (or the prior trading day). **Expected sense checks:** 2007–09 and 2020 should show Flight to quality; 2022 should show "Duration won\'t hedge" / inflation shock. If not, this is stated plainly below; the thresholds were not tuned to force it.');
P();
const hc = ['2000-03', '2001-09', '2007-10', '2008-09', '2011-08', '2015-08', '2018-12', '2020-02', '2020-03', '2022-01', '2022-10', '2025-04'];
const qShort = { FTQ: 'Flight to quality', NOHEDGE: "Duration won't hedge", BONDRALLY: 'Bond rally, stocks OK', RISKON: 'Risk-on / rates pressure' };
const hcRows = hc.map(ym => {
  const i = idxOnOrBefore(ym + '-15'), r = byDate.get(tradeDates[i]);
  return { ym, r, i };
});
table(['Month', 'Date', 'S', 'A / B / C', 'Confirmed', 'T', 'ρ (63d)', 'Shock type', 'Quadrant', 'SPY next 6m', 'TLT next 6m'],
  hcRows.map(({ ym, r }) => [ym, r.d, r.S === null ? 'n/a' : r.S, [r.A, r.B, r.C].map(x => x === null ? '–' : Math.round(x * 100) + '%').join(' / '), r.conf ? 'yes' : 'no', r.T === null ? 'n/a' : r.T + (r.Tw < 50 ? '*' : ''),
    r.rho === null ? 'n/a' : r.rho.toFixed(2), r.shock, qShort[r.q] + (r.unc ? ' (unconfirmed)' : ''), pct(r.fS6, 0), pct(r.fT6, 0)]));
P('\\* TLT score computed on < 50 weight points (not reliable). The 2002-02 → 2006-02 DGS30 gap and missing DFII10/T10YIE/high-yield data before 2003 reduce pre-2003 coverage.');
P();
{
  const get = ym => hcRows.find(h => h.ym === ym).r;
  const chk = [];
  const ftqOk = ['2007-10', '2008-09', '2020-02', '2020-03'].map(m => [m, get(m).q]);
  chk.push('**Flight to quality expected at 2007-10, 2008-09, 2020-02, 2020-03:** ' + ftqOk.map(([m, q]) => `${m} → ${qShort[q]}${get(m).unc ? ' (unconfirmed)' : ''}`).join('; ') + '.');
  const nh = ['2022-01', '2022-10'].map(m => [m, get(m).q, get(m).shock]);
  chk.push('**"Duration won\'t hedge" / inflation shock expected at 2022-01, 2022-10:** ' + nh.map(([m, q, s]) => `${m} → ${qShort[q]}, shock: ${s}`).join('; ') + '.');
  chk.forEach(c => P('- ' + c));
  P();
  const fails = [];
  ftqOk.forEach(([m, q]) => { if (q !== 'FTQ') fails.push(m + ' (' + qShort[q] + ')'); });
  nh.forEach(([m, q]) => { if (q !== 'NOHEDGE') fails.push(m + ' (' + qShort[q] + ')'); });
  P(fails.length ? '**Result: the sense checks were NOT all met.** Misses: ' + fails.join(', ') + '. Not tuned to fix.' : '**Result: all sense checks met.**');
  P();
}

// ---- 9. calibration
P('## 9. Calibration and threshold changes');
P();
P('Rule (spec 9.5): calibrate on 1990–2012, validate on 2013–present; adopt a change only if it improves results in **both** periods. Starting values come from the spec.');
P();
P('Adoption test: SPY variants must (in each period) flag at least as many episodes, produce no more false-alarm episodes, and either remove a false alarm, flag another episode, or lead by ≥ 0.5 month more. TLT variants must widen the T ≥ 46 minus T ≤ 45 forward-return spread by ≥ 0.5pp. Both periods must pass.');
  P();
  P('Metrics per period (SPY side: bear markets + recessions flagged, median lead in months, false-alarm episodes; TLT side: median forward 6-mo TLT return, T ≥ 46 minus T ≤ 45, from 2003). Baseline = spec values.');
P();
const metricRow = (name, s) => PERIODS.map(([p]) => {
  const o = s[p]; return `${o.detected}/${o.episodes} flagged, lead ${num(o.medLead)}, FA ${o.falseAlarms} (${o.faDays} d), TLT spread ${o.tlt ? pct(o.tlt.diff) : 'n/a'}`;
});
const adopted = [];
const vrows = [['Baseline (spec values)'].concat(metricRow('base', base)).concat(['–'])];
variantResults.forEach(({ v, sum, rows }) => {
  v.diffDays = rows.filter((r, k) => r.S !== R[k].S || r.T !== R[k].T).length;
  const better = PERIODS.map(([p]) => {
    const a = base[p], b = sum[p];
    if (v.kind === 'tlt') return (b.tlt && a.tlt) ? (b.tlt.diff - a.tlt.diff) >= 0.005 : false;   // spread improves by >= 0.5pp
    return b.detected >= a.detected && b.falseAlarms <= a.falseAlarms &&
           (b.falseAlarms < a.falseAlarms || b.detected > a.detected || (b.medLead || 0) >= (a.medLead || 0) + 0.5);
  });
  const improvesBoth = better.every(Boolean);
  v.adopt = improvesBoth;
  vrows.push([v.name].concat(metricRow(v.name, sum)).concat([(improvesBoth ? 'improves both periods → ADOPT' : 'not adopted') + ` (${v.diffDays} sessions changed)`]));
});
table(['Variant', '1990–2012', '2013–present', 'Decision'], vrows);
P('### Threshold changes');
P();
const chg = variantResults.filter(x => x.v.adopt);
if (!chg.length) P('**No thresholds were changed from the §6/§7 starting values.** Each candidate above failed to improve results in both periods.');
else table(['Change', 'Reason', 'Old → New'], chg.map(({ v }) => [v.name, v.why, v.change || '']));
P();
P('### Open question from spec section 7: TLT curve indicator');
P();
{
  const alt = variantResults.find(x => /curve rule/.test(x.v.name));
  if (alt) {
    P('Compare the current rule (GREEN only for bull flattening) with "GREEN if 30Y 20-day change < 0 whatever the 2Y does". Median forward 6-mo TLT return, T ≥ 46 minus T ≤ 45, 2003→present:');
    P();
    table(['Rule', '1990–2012 spread', '2013–present spread'], [
      ['Current (bull flattening only)'].concat(PERIODS.map(([p]) => base[p].tlt ? pct(base[p].tlt.diff) + ` (hi ${pct(base[p].tlt.hi)}, lo ${pct(base[p].tlt.lo)})` : 'n/a')),
      ['Alternative (30Y falling)'].concat(PERIODS.map(([p]) => alt.sum[p].tlt ? pct(alt.sum[p].tlt.diff) + ` (hi ${pct(alt.sum[p].tlt.hi)}, lo ${pct(alt.sum[p].tlt.lo)})` : 'n/a'))]);
    P(alt.v.adopt ? 'The alternative improves the spread in both periods and has been adopted in `config.js`.' : 'The alternative did not improve the spread in both periods, so the original rule was kept.');
    P();
  }
}

P('## 10. Reproducing this report');
P();
P('```');
P('node backtest\\run-backtest.js        (from the TLT folder; needs history\\*.csv from Update Market Data.bat)');
P('```');
P();

fs.writeFileSync(path.join(__dirname, 'backtest-report.md'), md.join('\n'), 'utf8');

// ------------------------------------------------------------------ results.csv
{
  const cols = ['date'];
  CFG0.spy.forEach(d => cols.push('spy_' + d.key)); CFG0.tlt.forEach(d => cols.push('tlt_' + d.key));
  cols.push('layerA_pct', 'layerB_pct', 'layerC_pct', 'S', 'S_weight_loaded', 'confirmed', 'T', 'T_weight_loaded', 'rho63', 'quadrant', 'ftq_unconfirmed', 'shock', 'spy_adj', 'tlt_adj',
    'spy_fwd3m', 'spy_fwd6m', 'spy_fwd12m', 'tlt_fwd3m', 'tlt_fwd6m', 'tlt_fwd12m');
  const f = v => v === null || v === undefined ? '' : (typeof v === 'number' ? (Number.isInteger(v) ? v : +v.toFixed(5)) : v);
  const lines = [cols.join(',')];
  R.forEach(r => lines.push([r.d].concat(r.si, r.ti, [f(r.A), f(r.B), f(r.C), f(r.S), r.Sw, r.conf ? 1 : 0, f(r.T), r.Tw, f(r.rho), r.q, r.unc ? 1 : 0, r.shock, f(r.spy), f(r.tlt),
    f(r.fS3), f(r.fS6), f(r.fS12), f(r.fT3), f(r.fT6), f(r.fT12)]).join(',')));
  fs.writeFileSync(path.join(__dirname, 'results.csv'), lines.join('\n'), 'utf8');
}

// ------------------------------------------------------------------ summary.js (dashboard card)
{
  const last = R[R.length - 1];
  const vs = ftqStats(R, r => r.d > CAL_END), cs = ftqStats(R, r => r.d >= '2003-01-01' && r.d <= CAL_END);
  const summary = {
    generated: new Date().toISOString().slice(0, 10), dataThrough: tradeDates[N - 1], liveDate: LIVE,
    bears: { n: epAll.length, detected: detS.length, medianLeadMonths: medLeadBear, confirmedDetected: detC.length, confirmedMedianLeadMonths: medLeadConf },
    recessions: { n: recAll.length, detected: detSr.length, medianLeadMonths: medLeadRec },
    falseAlarms: { episodes: runsAll.length, falseAlarms: faAll.length, sessions: faAll.reduce((s, r) => s + r.len, 0) },
    ftq: { precision: ftqMain.any.precision, recall: ftqMain.any.recall, baseRate: ftqMain.base, precisionCal: cs.any.precision, precisionVal: vs.any.precision },
    tlt: tltAll.spread6 ? { medianFwd6mHigh: tltAll.spread6.hi, medianFwd6mLow: tltAll.spread6.lo } : null,
    syntheticTltCorr: val.corr,
    thresholdChanges: variantResults.filter(x => x.v.adopt).map(x => x.v.name),
    latest: { date: last.d, S: last.S, T: last.T, A: last.A, B: last.B, C: last.C, confirmed: last.conf, quadrant: last.q, unconfirmed: last.unc, rho: last.rho, shock: last.shock }
  };
  fs.writeFileSync(path.join(__dirname, 'summary.js'), 'window.BACKTEST_SUMMARY = ' + JSON.stringify(summary, null, 1) + ';\n', 'utf8');
}
note('Wrote backtest-report.md, results.csv, summary.js');
if (variantResults.some(x => x.v.adopt)) note('NOTE: variants were adopted; apply them to config.js and re-run to make the baseline reflect them.');
