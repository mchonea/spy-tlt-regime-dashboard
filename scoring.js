/*
  scoring.js - ALL indicator / score logic for the SPY-TLT regime dashboard.
  Loaded by the browser (global `Scoring`) and by Node (require) so the dashboard and
  the backtest run exactly the same code.  Thresholds and weights live in config.js.

  Usage
    const prep = Scoring.prepare({ series: {ID:[[date,value],...]}, prices: {T:[[date,adjclose],...]} }, cfg);
    const res  = Scoring.evaluate(prep, '2026-10-14', cfg);   // uses only observations usable on that date

  evaluate() is a pure function of (prepared data, asOf date, config): an observation is used only if it
  would have been published by asOf (config.availability), and series that stopped updating are ignored
  (maxAgeDays) rather than scored on stale values.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./config.js'));
  else root.Scoring = factory(root.MARKET_CONFIG);
})(typeof self !== 'undefined' ? self : this, function (DEFAULT_CFG) {
  'use strict';

  // ---------------------------------------------------------------- dates
  function dayNum(s) {   // 'YYYY-MM-DD' -> days since 1970-01-01
    return Math.round(Date.UTC(+s.substr(0, 4), +s.substr(5, 2) - 1, +s.substr(8, 2)) / 86400000);
  }
  function dayStr(n) { return new Date(n * 86400000).toISOString().slice(0, 10); }
  function addDays(s, k) { return dayStr(dayNum(s) + k); }

  // Day on which an observation dated `s` becomes usable
  function availDay(freq, s, cfg) {
    var a = cfg.availability;
    if (freq === 'M') {
      var y = +s.substr(0, 4), m = +s.substr(5, 2);          // first day of the following month + offset
      return Math.round(Date.UTC(y, m, 1) / 86400000) + a.MonthlyOffset;
    }
    return dayNum(s) + (freq === 'W' ? a.W : a.D);
  }

  var MAX_AGE = { D: 10, W: 21, M: 100 };   // a series whose newest usable obs is older than this is treated as missing

  // ---------------------------------------------------------------- prepare
  function mkSeries(rows, freq, cfg) {
    var n = rows.length, d = new Array(n), v = new Float64Array(n), dn = new Int32Array(n), av = new Int32Array(n);
    var pre = new Float64Array(n + 1);
    for (var i = 0; i < n; i++) {
      d[i] = rows[i][0]; v[i] = +rows[i][1]; dn[i] = dayNum(d[i]); av[i] = availDay(freq, d[i], cfg);
      pre[i + 1] = pre[i] + v[i];
    }
    return { d: d, v: v, dn: dn, av: av, pre: pre, n: n, freq: freq };
  }

  function prepare(data, cfg) {
    cfg = cfg || DEFAULT_CFG;
    var prep = { s: {}, cfg: cfg };
    Object.keys(data.series || {}).forEach(function (id) {
      var f = (cfg.series[id] || {}).freq || 'D';
      if (data.series[id] && data.series[id].length) prep.s[id] = mkSeries(data.series[id], f, cfg);
    });
    Object.keys(data.prices || {}).forEach(function (t) {
      if (data.prices[t] && data.prices[t].length) prep.s['P:' + t] = mkSeries(data.prices[t], 'D', cfg);
    });
    // XLY/XLP ratio on common dates
    var a = prep.s['P:XLY'], b = prep.s['P:XLP'];
    if (a && b) {
      var rows = [], i = 0, j = 0;
      while (i < a.n && j < b.n) {
        if (a.dn[i] === b.dn[j]) { rows.push([a.d[i], a.v[i] / b.v[j]]); i++; j++; }
        else if (a.dn[i] < b.dn[j]) i++; else j++;
      }
      prep.s['R:XLYXLP'] = mkSeries(rows, 'D', cfg);
    }
    // daily total returns of SPY and TLT on common dates (for rolling correlation)
    var sp = prep.s['P:SPY'], tl = prep.s['P:TLT'];
    if (sp && tl) {
      var cd = [], cs = [], ct = [], ii = 0, jj = 0;
      while (ii < sp.n && jj < tl.n) {
        if (sp.dn[ii] === tl.dn[jj]) { cd.push(sp.d[ii]); cs.push(sp.v[ii]); ct.push(tl.v[jj]); ii++; jj++; }
        else if (sp.dn[ii] < tl.dn[jj]) ii++; else jj++;
      }
      var rr = [];
      for (var k = 1; k < cd.length; k++) rr.push([cd[k], 0]);
      var ser = mkSeries(rr, 'D', cfg);
      ser.rs = new Float64Array(rr.length); ser.rt = new Float64Array(rr.length);
      for (var m = 1; m < cd.length; m++) { ser.rs[m - 1] = cs[m] / cs[m - 1] - 1; ser.rt[m - 1] = ct[m] / ct[m - 1] - 1; }
      prep.s['RET'] = ser;
    }
    return prep;
  }

  // ---------------------------------------------------------------- accessors
  // number of observations usable on day `ad`
  function usable(x, ad) {
    var lo = 0, hi = x.n;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (x.av[mid] <= ad) lo = mid + 1; else hi = mid; }
    return lo;
  }
  // {x, n} if the series has >= minN usable obs and its newest is fresh enough, else null
  function get(prep, key, ad, minN) {
    var x = prep.s[key];
    if (!x) return null;
    var n = usable(x, ad);
    if (n < (minN || 1)) return null;
    if (ad - x.dn[n - 1] > MAX_AGE[x.freq]) return null;
    return { x: x, n: n };
  }
  function last(g) { return g.x.v[g.n - 1]; }
  function ago(g, k) { return g.x.v[g.n - 1 - k]; }
  function chg(g, k) { return last(g) - ago(g, k); }
  function mean(g, k) { var s = g.x.pre; return (s[g.n] - s[g.n - k]) / k; }
  function lastDate(g) { return g.x.d[g.n - 1]; }
  function smaAt(x, i, k) { return (x.pre[i + 1] - x.pre[i + 1 - k]) / k; }   // SMA of k obs ending at index i

  function f2(v) { return isFinite(v) ? v.toFixed(2) : '--'; }
  function f1(v) { return isFinite(v) ? v.toFixed(1) : '--'; }
  function sg(v, d) { return (v >= 0 ? '+' : '') + (d === undefined ? f2(v) : v.toFixed(d)); }

  var SPY_V = { ALERT: 1, WATCH: 0.5, CLEAR: 0 };
  var TLT_V = { GREEN: 1, YELLOW: 0.5, RED: 0 };

  function spyRes(status, value, trend, g) { return { status: status, frac: SPY_V[status], value: value, trend: trend, date: lastDate(g) }; }
  function tltRes(status, value, trend, g) { return { status: status, frac: TLT_V[status], value: value, trend: trend, date: lastDate(g) }; }

  // ---------------------------------------------------------------- SPY indicators (spec section 6)
  var SPY_FN = {
    curve: function (p, ad, P) {
      var g = get(p, 'T10Y3M', ad, P.avgObs); if (!g) return null;
      var avg = mean(g, P.avgObs), lb = Math.min(g.n, P.lookbackObs), neg = 0;
      for (var i = g.n - lb; i < g.n; i++) if (g.x.v[i] < 0) neg++;
      var st = (neg >= P.invDaysAlert && avg > 0) ? 'ALERT' : (avg < 0 ? 'WATCH' : 'CLEAR');
      return spyRes(st, f2(last(g)) + ' pp', '20-day avg ' + sg(avg) + ' pp; inverted ' + neg + ' of last ' + lb + ' sessions', g);
    },
    sahm: function (p, ad, P) {
      var g = get(p, 'SAHMREALTIME', ad); if (!g) return null;
      var v = last(g);
      return spyRes(v >= P.alert ? 'ALERT' : (v >= P.watch ? 'WATCH' : 'CLEAR'), f2(v) + ' pp', 'Triggers at ' + f2(P.alert), g);
    },
    claims: function (p, ad, P) {
      var g = get(p, 'ICSA', ad, P.lowObs + P.avgObs - 1); if (!g) return null;
      var min = Infinity, cur = 0, k;
      for (var i = g.n - P.lowObs; i < g.n; i++) {
        var s = 0; for (k = 0; k < P.avgObs; k++) s += g.x.v[i - k];
        s /= P.avgObs; if (s < min) min = s; cur = s;
      }
      var pct = (cur / min - 1) * 100;
      return spyRes(pct >= P.alertPct ? 'ALERT' : (pct >= P.watchPct ? 'WATCH' : 'CLEAR'),
        Math.round(cur / 1000) + 'k (4-wk avg)', sg(pct, 1) + '% vs 52-wk low (' + Math.round(min / 1000) + 'k)', g);
    },
    payrolls: function (p, ad, P) {
      var g = get(p, 'PAYEMS', ad, P.months + 1); if (!g) return null;
      var avg = chg(g, P.months) / P.months;
      return spyRes(avg < P.alertBelow ? 'ALERT' : (avg <= P.watchBelow ? 'WATCH' : 'CLEAR'),
        sg(avg, 0) + 'k / month', '3-month average change; latest month ' + sg(chg(g, 1), 0) + 'k', g);
    },
    hy: function (p, ad, P) {
      var g = get(p, 'BAMLH0A0HYM2', ad, P.chObs + 1); if (!g) return null;
      var v = last(g), c63 = chg(g, P.chObs), c20 = chg(g, P.shortObs);
      var st = (c63 >= P.alertCh || (v >= P.alertLevel && c20 > 0)) ? 'ALERT' : (c63 >= P.watchCh ? 'WATCH' : 'CLEAR');
      return spyRes(st, f2(v) + '%', '63-day change ' + sg(c63) + ' pp; 20-day ' + sg(c20) + ' pp', g);
    },
    baa: function (p, ad, P) {
      var g = get(p, 'BAA10Y', ad, P.chObs + 1); if (!g) return null;
      var c = chg(g, P.chObs);
      return spyRes(c >= P.alertCh ? 'ALERT' : (c >= P.watchCh ? 'WATCH' : 'CLEAR'), f2(last(g)) + '%', '63-day change ' + sg(c) + ' pp', g);
    },
    nfci: function (p, ad, P) {
      var g = get(p, 'NFCI', ad, P.weeks + 1); if (!g) return null;
      var v = last(g), c = chg(g, P.weeks);
      var st = v > P.alert ? 'ALERT' : ((v > P.watch && c > 0) ? 'WATCH' : 'CLEAR');
      return spyRes(st, f2(v), '13-week change ' + sg(c), g);
    },
    vix: function (p, ad, P) {
      var g = get(p, 'VIXCLS', ad, P.avgObs); if (!g) return null;
      var a = mean(g, P.avgObs);
      return spyRes(a >= P.alert ? 'ALERT' : (a >= P.watch ? 'WATCH' : 'CLEAR'), f1(last(g)), '50-day average ' + f1(a), g);
    },
    trend: function (p, ad, P) {
      var g = get(p, 'P:SPY', ad, P.smaObs + P.slopeObs); if (!g) return null;
      var x = g.x, i = g.n - 1, price = x.v[i], sma = smaAt(x, i, P.smaObs), run = 0;
      for (var k = 0; k < P.belowSessions; k++) { var j = i - k; if (x.v[j] < smaAt(x, j, P.smaObs)) run++; else break; }
      var slopeDown = sma < smaAt(x, i - P.slopeObs, P.smaObs);
      var st = (price < sma && run >= P.belowSessions && slopeDown) ? 'ALERT' : (price < sma ? 'WATCH' : 'CLEAR');
      var pct = (price / sma - 1) * 100;
      return spyRes(st, sg(pct, 1) + '% vs 200-day SMA', (price < sma ? run + ' sessions below' : 'above') + '; SMA ' + (slopeDown ? 'falling' : 'rising') + ' vs 20 sessions ago', g);
    },
    drawdown: function (p, ad, P) {
      var g = get(p, 'P:SPY', ad, P.highObs); if (!g) return null;
      var hi = -Infinity; for (var i = g.n - P.highObs; i < g.n; i++) if (g.x.v[i] > hi) hi = g.x.v[i];
      var dd = (1 - last(g) / hi) * 100;
      return spyRes(dd >= P.alertPct ? 'ALERT' : (dd >= P.watchPct ? 'WATCH' : 'CLEAR'), f1(dd) + '% below high', '52-week high of adjusted close', g);
    },
    cyc: function (p, ad, P) {
      var g = get(p, 'R:XLYXLP', ad, P.smaObs + 1); if (!g) return null;
      var i = g.n - 1, r = g.x.v[i], sma = smaAt(g.x, i, P.smaObs), c = r / g.x.v[i - P.chObs] - 1;
      var st = (r < sma && c < 0) ? 'ALERT' : (r < sma ? 'WATCH' : 'CLEAR');
      return spyRes(st, r.toFixed(3) + ' (' + sg((r / sma - 1) * 100, 1) + '% vs SMA)', '63-day change ' + sg(c * 100, 1) + '%', g);
    }
  };

  // ---------------------------------------------------------------- TLT indicators (spec section 7; logic ported unchanged)
  var TLT_FN = {
    dgs30: function (p, ad, P) {
      var g = get(p, 'DGS30', ad, P.chObs + 1); if (!g) return null;
      var v = last(g), c = chg(g, P.chObs);
      var st = (v < P.greenBelow && c < 0) ? 'GREEN' : ((v > P.redAbove || c > P.redCh) ? 'RED' : 'YELLOW');
      return tltRes(st, f2(v) + '%', '20-observation change: ' + sg(c) + ' pp', g);
    },
    dfii10: function (p, ad, P) {
      var g = get(p, 'DFII10', ad, P.chObs + 1); if (!g) return null;
      var v = last(g), c = chg(g, P.chObs);
      var st = (v < P.greenBelow && c < 0) ? 'GREEN' : ((v > P.redAbove && c >= 0) ? 'RED' : 'YELLOW');
      return tltRes(st, f2(v) + '%', '20-observation change: ' + sg(c) + ' pp', g);
    },
    t10yie: function (p, ad, P) {
      var g = get(p, 'T10YIE', ad, P.chObs + 1); if (!g) return null;
      var v = last(g), c = chg(g, P.chObs);
      var st = (v < P.greenBelow && c < 0) ? 'GREEN' : ((v > P.redAbove && c > 0) ? 'RED' : 'YELLOW');
      return tltRes(st, f2(v) + '%', '20-observation change: ' + sg(c) + ' pp', g);
    },
    fedfunds: function (p, ad, P) {
      var g = get(p, 'DFF', ad, P.chObs + 1); if (!g) return null;
      var v = last(g), c = chg(g, P.chObs);
      var st = c < P.greenCh ? 'GREEN' : (c > P.redCh ? 'RED' : 'YELLOW');
      return tltRes(st, f2(v) + '%', '~30-day change: ' + sg(c) + ' pp', g);
    },
    labor: function (p, ad, P) {
      var u = get(p, 'UNRATE', ad, P.unrateObs + 1), pay = get(p, 'PAYEMS', ad, 2);
      if (!u || !pay) return null;
      var uc = chg(u, P.unrateObs), pc = chg(pay, 1);
      var st = (uc >= P.greenUnrate || pc < P.greenPay) ? 'GREEN' : ((uc >= P.yellowUnrate || pc < P.yellowPay) ? 'YELLOW' : 'RED');
      return tltRes(st, f1(last(u)) + '% unemployment',
        '3-mo unemployment Δ ' + sg(uc, 1) + ' pp; latest payroll Δ ' + sg(pc, 0) + 'k', u);
    },
    hyoas: function (p, ad, P) {
      var g = get(p, 'BAMLH0A0HYM2', ad, P.chObs + 1); if (!g) return null;
      var v = last(g), c = chg(g, P.chObs);
      var st = (v > P.greenAbove && c > 0) ? 'GREEN' : (v < P.redBelow ? 'RED' : 'YELLOW');
      return tltRes(st, f2(v) + '%', '20-observation change: ' + sg(c) + ' pp', g);
    },
    curve: function (p, ad, P) {
      var l = get(p, 'DGS30', ad, P.chObs + 1), s = get(p, 'DGS2', ad, P.chObs + 1);
      if (!l || !s) return null;
      var lc = chg(l, P.chObs), sc = chg(s, P.chObs), spread = last(l) - last(s), st;
      var green = P.curveRule === 'alt' ? lc < 0 : (lc < 0 && lc < sc);
      if (green) st = 'GREEN';
      else if (lc > P.redCh && lc > sc) st = 'RED';
      else st = 'YELLOW';
      return tltRes(st, f2(spread) + ' pp', '30Y Δ ' + sg(lc) + ' vs 2Y Δ ' + sg(sc) + ' pp', l);
    },
    price: function (p, ad, P) {
      var g = get(p, 'P:TLT', ad, P.obs + 1); if (!g) return null;
      var r = (last(g) / ago(g, P.obs) - 1) * 100;
      var st = r > P.greenPct ? 'GREEN' : (r < P.redPct ? 'RED' : 'YELLOW');
      return tltRes(st, 'adj. $' + f2(last(g)), '63-day total return: ' + sg(r, 1) + '%', g);
    }
  };

  // ---------------------------------------------------------------- score assembly
  function labelFor(list, score) {
    for (var i = 0; i < list.length; i++) if (score <= list[i].max) return list[i];
    return list[list.length - 1];
  }

  function scoreModel(prep, ad, defs, fns) {
    var items = [], earned = 0, possible = 0, loaded = 0, newest = '';
    var layers = {};
    defs.forEach(function (d) {
      var r = fns[d.key](prep, ad, d.params);
      var it = { key: d.key, name: d.name, layer: d.layer || null, weight: d.weight, meaning: d.meaning, loaded: !!r };
      if (r) {
        it.status = r.status; it.frac = r.frac; it.value = r.value; it.trend = r.trend; it.date = r.date;
        possible += d.weight; earned += d.weight * r.frac; loaded++;
        if (r.date > newest) newest = r.date;
      }
      if (d.layer) {
        var L = layers[d.layer] || (layers[d.layer] = { earned: 0, possible: 0, loaded: 0, count: 0 });
        L.count++;
        if (r) { L.earned += d.weight * r.frac; L.possible += d.weight; L.loaded++; }
      }
      items.push(it);
    });
    var score = possible ? Math.round(earned / possible * 100) : null;
    return { items: items, earned: earned, possible: possible, loaded: loaded, total: defs.length, score: score, newest: newest, layers: layers };
  }

  function scoreSpy(prep, ad) {
    var cfg = prep.cfg, m = scoreModel(prep, ad, cfg.spy, SPY_FN);
    Object.keys(m.layers).forEach(function (k) {
      var L = m.layers[k]; L.pct = L.possible ? L.earned / L.possible : null; L.weight = cfg.layers[k].weight; L.name = cfg.layers[k].name;
    });
    var A = m.layers.A, B = m.layers.B, C = m.layers.C, th = cfg.confirmedLayerPct;
    m.confirmed = !!(C && C.pct !== null && C.pct >= th && ((A && A.pct !== null && A.pct >= th) || (B && B.pct !== null && B.pct >= th)));
    m.reliable = m.possible >= cfg.minWeightLoaded;
    if (m.score !== null) { var lb = labelFor(cfg.spyLabels, m.score); m.label = lb.label; m.headline = lb.headline; m.text = lb.text; }
    return m;
  }

  function scoreTlt(prep, ad) {
    var cfg = prep.cfg, m = scoreModel(prep, ad, cfg.tlt, TLT_FN);
    m.reliable = m.possible >= cfg.minWeightLoaded;
    if (m.score !== null) { var lb = labelFor(cfg.tltLabels, m.score); m.label = lb.label; m.headline = lb.label; m.text = lb.text; }
    return m;
  }

  // ---------------------------------------------------------------- joint view (spec section 8)
  function rollingCorr(prep, ad, W) {
    var g = get(prep, 'RET', ad, W); if (!g) return null;
    var rs = g.x.rs, rt = g.x.rt, i0 = g.n - W, sx = 0, sy = 0, k;
    for (k = i0; k < g.n; k++) { sx += rs[k]; sy += rt[k]; }
    var mx = sx / W, my = sy / W, sxx = 0, syy = 0, sxy = 0;
    for (k = i0; k < g.n; k++) { var a = rs[k] - mx, b = rt[k] - my; sxx += a * a; syy += b * b; sxy += a * b; }
    return (sxx > 0 && syy > 0) ? sxy / Math.sqrt(sxx * syy) : null;
  }

  function shockType(prep, ad) {
    var J = prep.cfg.joint, be = get(prep, 'T10YIE', ad, J.shockWindow + 1), y2 = get(prep, 'DGS2', ad, J.shockWindow + 1);
    if (!y2) return { type: 'n/a', detail: 'insufficient data' };
    var dy = chg(y2, J.shockWindow), db = be ? chg(be, J.shockWindow) : null;
    var detail = '63-day change: 2Y yield ' + sg(dy) + ' pp' + (db !== null ? ', 10Y breakeven ' + sg(db) + ' pp' : ' (breakeven unavailable)');
    if ((db !== null ? db < 0 : true) && dy < 0) return { type: 'Growth scare', detail: detail, dy: dy, db: db };
    if (dy > J.shockDgs2Up || (db !== null && db > J.shockBreakevenUp)) return { type: 'Inflation/rates shock', detail: detail, dy: dy, db: db };
    return { type: 'Mixed', detail: detail, dy: dy, db: db };
  }

  function quadrant(S, T, rho, cfg) {
    var J = cfg.joint, sHi = S !== null && S >= J.spyHigh, tHi = T !== null && T >= J.tltHigh;
    var key = sHi ? (tHi ? 'FTQ' : 'NOHEDGE') : (tHi ? 'BONDRALLY' : 'RISKON');
    return { key: key, unconfirmed: key === 'FTQ' && rho !== null && rho > J.corrUnconfirmed };
  }

  // ---------------------------------------------------------------- public: evaluate one date
  function evaluate(prep, asOf, cfg) {
    if (cfg && cfg !== prep.cfg) prep.cfg = cfg;
    var ad = dayNum(asOf), c = prep.cfg;
    var spy = scoreSpy(prep, ad), tlt = scoreTlt(prep, ad);
    var rho = rollingCorr(prep, ad, c.joint.corrWindow), shock = shockType(prep, ad), q = quadrant(spy.score, tlt.score, rho, c);
    return { asOf: asOf, spy: spy, tlt: tlt, rho: rho, shock: shock, quadrant: q.key, ftqUnconfirmed: q.unconfirmed };
  }

  // The live evaluation date: the day after the newest SPY price, so every observation published so far is usable
  function liveDate(prep) {
    var x = prep.s['P:SPY']; return x ? dayStr(x.dn[x.n - 1] + 1) : null;
  }
  // Trading dates (SPY dates) in [from, to]
  function tradingDates(prep, from, to) {
    var x = prep.s['P:SPY'], out = [];
    if (!x) return out;
    for (var i = 0; i < x.n; i++) if ((!from || x.d[i] >= from) && (!to || x.d[i] <= to)) out.push(x.d[i]);
    return out;
  }

  // Business days between two dates (Mon-Fri), used for the stale-data banner
  function businessDaysBetween(a, b) {
    var n = 0, d = dayNum(a), e = dayNum(b);
    for (var k = d + 1; k <= e; k++) { var w = new Date(k * 86400000).getUTCDay(); if (w !== 0 && w !== 6) n++; }
    return n;
  }

  return {
    prepare: prepare, evaluate: evaluate, liveDate: liveDate, tradingDates: tradingDates,
    rollingCorr: rollingCorr, shockType: shockType, quadrant: quadrant,
    dayNum: dayNum, dayStr: dayStr, addDays: addDays, businessDaysBetween: businessDaysBetween,
    SPY_FN: SPY_FN, TLT_FN: TLT_FN, MAX_AGE: MAX_AGE
  };
});
