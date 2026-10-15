// variants.js - candidate threshold changes tested by run-backtest.js (one at a time, per spec 9.5).
// Each is a deep copy of config.js with ONE change. Nothing here is applied unless the report says ADOPT.
module.exports = function (clone, CFG0) {
  const out = [];
  const add = (name, fn, why, change) => { const c = clone(CFG0); fn(c); out.push({ name, cfg: c, why, kind: 'spy', change }); };
  const sp = (c, k) => c.spy.find(x => x.key === k).params;
  add('SPY curve: re-steepening ALERT only if inverted within last 12 months', c => { sp(c, 'curve').lookbackObs = 252; }, 'Shorter memory so the curve ALERT does not persist for two years', 'lookbackObs 504 → 252');
  add('SPY VIX: 50-day avg thresholds 22 / 18', c => { sp(c, 'vix').alert = 22; sp(c, 'vix').watch = 18; }, 'More sensitive volatility gauge', 'alert 25 → 22, watch 20 → 18');
  add('SPY trend: ALERT after 5 straight sessions below SMA', c => { sp(c, 'trend').belowSessions = 5; }, 'Faster trend confirmation', 'belowSessions 10 → 5');
  add('SPY payrolls: thresholds 75k / 125k', c => { sp(c, 'payrolls').alertBelow = 75; sp(c, 'payrolls').watchBelow = 125; }, 'Higher bar for payroll weakness', 'alert < 50 → 75, watch 50–100 → 75–125');
  add('SPY claims: thresholds 15% / 7.5%', c => { sp(c, 'claims').alertPct = 15; sp(c, 'claims').watchPct = 7.5; }, 'More sensitive claims trigger', 'alert 20 → 15, watch 10 → 7.5');
  return out;
};
