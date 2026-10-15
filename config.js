/*
  config.js - thresholds, weights and series list for the SPY-TLT regime dashboard.
  NO LOGIC lives here. scoring.js reads this; the dashboard's "scoring model" tables
  are generated from it. Loaded by the browser (global MARKET_CONFIG) and by Node (require).
  Starting values come from SPEC - SPY-TLT Regime Dashboard.md (sections 6-8).
  Any change to a number below must be justified in backtest/backtest-report.md ("Threshold changes").
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MARKET_CONFIG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    version: '1.0',

    // ---- data series ------------------------------------------------------------
    // freq decides how long an observation takes to become usable (availability below)
    series: {
      DGS30:        { freq: 'D', label: '30Y Treasury yield' },
      DGS20:        { freq: 'D', label: '20Y Treasury yield (TLT proxy for backtest)' },
      DGS10:        { freq: 'D', label: '10Y Treasury yield' },
      DGS2:         { freq: 'D', label: '2Y Treasury yield' },
      DFII10:       { freq: 'D', label: '10Y real yield' },
      T10YIE:       { freq: 'D', label: '10Y breakeven inflation' },
      DFF:          { freq: 'D', label: 'Effective fed funds rate' },
      UNRATE:       { freq: 'M', label: 'Unemployment rate' },
      PAYEMS:       { freq: 'M', label: 'Nonfarm payrolls (thousands)' },
      BAMLH0A0HYM2: { freq: 'D', label: 'US high-yield OAS' },
      T10Y3M:       { freq: 'D', label: '10Y minus 3M Treasury' },
      SAHMREALTIME: { freq: 'M', label: 'Sahm rule recession indicator (real-time)' },
      ICSA:         { freq: 'W', label: 'Initial jobless claims' },
      NFCI:         { freq: 'W', label: 'Chicago Fed financial conditions index' },
      BAA10Y:       { freq: 'D', label: 'Moody\'s Baa minus 10Y Treasury' },
      VIXCLS:       { freq: 'D', label: 'VIX' },
      USREC:        { freq: 'M', label: 'NBER recession flag (outcome labels only)' }
    },
    priceTickers: ['SPY', 'TLT', 'XLY', 'XLP'],

    // No-look-ahead rules (spec 9.2). Observation dated d becomes usable on:
    //   D: d + 1 calendar day (next trading day)   W: d + 5 days
    //   M: first day of the following month + 7 days
    availability: { D: 1, W: 5, MonthlyOffset: 7 },

    // ---- labels -----------------------------------------------------------------
    minWeightLoaded: 50,        // below this many weight points: score shown but "not reliable"
    spyLabels: [                // upper bound (inclusive) -> label
      { max: 25,  label: 'Clear',     headline: 'Clear',
        text: 'Little evidence of an approaching bear market or recession.' },
      { max: 45,  label: 'Watch',     headline: 'Watch',
        text: 'Some stress indicators are active, but not broadly. Worth monitoring.' },
      { max: 65,  label: 'Elevated',  headline: 'Elevated risk',
        text: 'Several recession, credit or trend indicators are flashing together.' },
      { max: 100, label: 'High risk', headline: 'High risk',
        text: 'Most indicators across macro, credit and market trend point to downside risk.' }
    ],
    tltLabels: [
      { max: 25,  label: 'Unconfirmed duration thesis',
        text: 'Starting yields may be attractive, but the dashboard does not yet show broad confirmation from rates, macro data, and market stress.' },
      { max: 45,  label: 'Early setup',
        text: 'Some indicators are improving, but the evidence is not yet broad enough to call the long-duration regime clearly favorable.' },
      { max: 65,  label: 'Evidence accumulating',
        text: 'Rates and macro indicators are increasingly consistent with a more favorable environment for long-duration Treasuries.' },
      { max: 80,  label: 'Strong confirmation',
        text: 'Most major indicators are aligned with falling long yields and a more supportive TLT regime.' },
      { max: 100, label: 'Broad alignment',
        text: 'Nearly all measured indicators are aligned with the long-duration thesis. This can also mean the trade is already well underway.' }
    ],
    confirmedText: 'Macro conditions and market trend both point to elevated risk.',
    confirmedLayerPct: 0.5,     // layer C >= 50% AND (layer A >= 50% OR layer B >= 50%)

    // ---- joint view -------------------------------------------------------------
    joint: {
      spyHigh: 46,              // S >= 46  => SPY risk elevated
      tltHigh: 46,              // T >= 46  => TLT favorable
      corrWindow: 63,           // days of SPY/TLT daily total returns
      corrUnconfirmed: 0.2,     // rho above this downgrades "Flight to quality"
      shockWindow: 63,          // observations for T10YIE / DGS2 change
      shockDgs2Up: 0.25,        // DGS2 up by more than this (pp)  => inflation/rates shock
      shockBreakevenUp: 0.10,   // T10YIE up by more than this (pp) => inflation/rates shock (spec says "up"; small band avoids noise)
      quadrants: {
        FTQ:       { label: 'Flight to quality',
                     text: 'Stocks look at risk while long Treasuries look favorable: the classic setup where duration can hedge an equity bear market (2000–02, 2007–09, 2020).' },
        FTQ_UNCONF:{ label: 'Flight to quality — unconfirmed (stocks and bonds still moving together)',
                     text: 'Both scores point to a flight-to-quality setup, but stocks and long bonds have been moving together recently, so the hedge has not yet shown up in prices.' },
        NOHEDGE:   { label: "Duration won't hedge",
                     text: 'Stocks look at risk while long bonds are also under pressure, as in an inflation or rates shock (2022). Long Treasuries may fall with equities.' },
        BONDRALLY: { label: 'Bond rally, stocks OK',
                     text: 'Conditions favor long Treasuries without broad equity stress: a disinflation or soft-landing type of environment.' },
        RISKON:    { label: 'Risk-on / rates pressure',
                     text: 'Equity risk is low and the long-duration thesis is not confirmed.' }
      }
    },

    // ---- confidence meter (added 2026-10-15). The Flight-to-quality box stays an early WARNING; this rates how well the
    // warning is confirmed. Three checks, each met or not. Does not change S, T or the quadrant.
    confidence: {
      persistSessions: 20,      // check 1: S >= 46 for this many straight sessions
      layerAMin: 0.5,           // check 2: recession layer (A) at least this share of its weight
      // check 3: shock type is not "Inflation/rates shock"
      labels: ['Early warning', 'Low confidence', 'Moderate confidence', 'High confidence'],
      plainLabels: ['Very low', 'Low', 'Moderate', 'High'],
      checks: {
        persist:   { name: 'Lasting', met: 'Stock risk has stayed high for 4+ weeks.', notMet: 'Stock risk has not stayed high for 4+ weeks yet.' },
        recession: { name: 'Economy agrees', met: 'Jobs and recession signals back up the warning.', notMet: 'Jobs and recession signals do not back it up yet.' },
        noShock:   { name: 'Not an inflation shock', met: 'Moves do not look driven by inflation or rising rates.', notMet: 'Moves look driven by inflation or rising rates, when bonds hedge poorly.' }
      },
      notApplicable: 'Not applicable: stock-market risk is below the warning level (46).'
    },

    // ---- SPY bear-market risk score (spec 6) ---------------------------------------
    // status values: ALERT 1.0 / WATCH 0.5 / CLEAR 0   (higher = more downside risk)
    layers: {
      A: { name: 'Recession conditions',        weight: 40 },
      B: { name: 'Credit & financial stress',   weight: 30 },
      C: { name: 'Market confirmation',         weight: 30 }
    },
    spy: [
      { key: 'curve', layer: 'A', weight: 10, name: 'Yield curve 10Y–3M',
        params: { avgObs: 20, invDaysAlert: 60, lookbackObs: 504 },
        rules: { alert: 'Inverted ≥ 60 days in the last 24 months and 20-day avg now > 0 (re-steepening)',
                 watch: 'Currently inverted (20-day avg < 0)', clear: 'Otherwise' },
        meaning: 'Recessions tend to start after an inverted curve re-steepens, not while it is inverted.' },
      { key: 'sahm', layer: 'A', weight: 10, name: 'Sahm rule',
        params: { alert: 0.50, watch: 0.30 },
        rules: { alert: '≥ 0.50', watch: '0.30–0.49', clear: '< 0.30' },
        meaning: 'Real-time unemployment trigger. Historically confirms a recession is already under way.' },
      { key: 'claims', layer: 'A', weight: 10, name: 'Jobless claims',
        params: { avgObs: 4, lowObs: 52, alertPct: 20, watchPct: 10 },
        rules: { alert: '4-wk avg ≥ 20% above its 52-wk low', watch: '10–20% above', clear: '< 10%' },
        meaning: 'Fast, high-frequency read on layoffs. Rises before payrolls turn negative.' },
      { key: 'payrolls', layer: 'A', weight: 10, name: 'Payroll momentum',
        params: { months: 3, alertBelow: 50, watchBelow: 100 },
        rules: { alert: '3-mo avg monthly change < 50k', watch: '50–100k', clear: '> 100k' },
        meaning: 'Slowing job creation is the broadest recession signal. Subject to revision.' },

      { key: 'hy', layer: 'B', weight: 10, name: 'High-yield spread change',
        params: { chObs: 63, alertCh: 1.00, alertLevel: 5.0, shortObs: 20, watchCh: 0.40 },
        rules: { alert: '63-day change ≥ +1.00pp, or level ≥ 5.0% and 20-day change > 0', watch: '63-day change ≥ +0.40pp', clear: 'Otherwise' },
        meaning: 'Credit markets reprice default risk before equities do. The change matters more than the level.' },
      { key: 'baa', layer: 'B', weight: 10, name: 'Baa–10Y spread change',
        params: { chObs: 63, alertCh: 0.40, watchCh: 0.20 },
        rules: { alert: '63-day change ≥ +0.40pp', watch: '≥ +0.20pp', clear: 'Otherwise' },
        meaning: 'Long-history credit gauge (back to 1986), used where the high-yield series is short.' },
      { key: 'nfci', layer: 'B', weight: 5, name: 'Financial conditions (NFCI)',
        params: { alert: 0, watch: -0.30, weeks: 13 },
        rules: { alert: '> 0', watch: '> −0.30 and 13-wk change > 0', clear: 'Otherwise' },
        meaning: 'Above zero means financial conditions are tighter than average.' },
      { key: 'vix', layer: 'B', weight: 5, name: 'Volatility (VIX)',
        params: { avgObs: 50, alert: 25, watch: 20 },
        rules: { alert: '50-day avg ≥ 25', watch: '50-day avg ≥ 20', clear: '< 20' },
        meaning: 'A persistently elevated VIX, not a one-day spike, marks a stressed market.' },

      { key: 'trend', layer: 'C', weight: 15, name: 'SPY trend',
        params: { smaObs: 200, belowSessions: 10, slopeObs: 20 },
        rules: { alert: 'Close < 200-day SMA for ≥ 10 straight sessions and the SMA is below its value 20 sessions ago', watch: 'Close < 200-day SMA', clear: 'Above' },
        meaning: 'Price confirmation. Fast but late: most of the damage is often done by the time it triggers.' },
      { key: 'drawdown', layer: 'C', weight: 5, name: 'SPY drawdown from 52-wk high',
        params: { highObs: 252, alertPct: 15, watchPct: 8 },
        rules: { alert: '≥ 15%', watch: '8–15%', clear: '< 8%' },
        meaning: 'How much of a decline has already happened.' },
      { key: 'cyc', layer: 'C', weight: 10, name: 'Cyclicals vs defensives (XLY/XLP)',
        params: { smaObs: 200, chObs: 63 },
        rules: { alert: 'Ratio < its 200-day SMA and 63-day change < 0', watch: 'Ratio < its 200-day SMA', clear: 'Above' },
        meaning: 'Leadership rotating from discretionary to staples is a classic late-cycle tell.' }
    ],

    // ---- TLT entry score (spec 7; ported unchanged) -----------------------------------
    tlt: [
      { key: 'dgs30', weight: 20, name: '30Y Treasury yield',
        params: { chObs: 20, greenBelow: 5.0, redAbove: 5.4, redCh: 0.20 },
        rules: { green: 'Below 5.0% and falling', yellow: '5.0–5.4% / mixed', red: 'Above 5.4% or rising > 0.20pp' },
        meaning: 'The most direct driver of TLT. Falling long yields are favorable; new highs are unfavorable.' },
      { key: 'dfii10', weight: 20, name: '10Y real yield',
        params: { chObs: 20, greenBelow: 2.25, redAbove: 2.60 },
        rules: { green: '< 2.25% and falling', yellow: '2.25–2.60%', red: '> 2.60% and rising' },
        meaning: 'High real yields pressure long-duration bonds. A sustained decline is one of the strongest confirmations.' },
      { key: 't10yie', weight: 10, name: '10Y breakeven inflation',
        params: { chObs: 20, greenBelow: 2.25, redAbove: 2.50 },
        rules: { green: '< 2.25% and falling', yellow: '2.25–2.50%', red: '> 2.50% and rising' },
        meaning: 'Helps separate inflation risk from real-rate risk. Falling breakevens generally support nominal Treasuries.' },
      { key: 'fedfunds', weight: 10, name: 'Fed policy pressure',
        params: { chObs: 30, greenCh: -0.10, redCh: 0.10 },
        rules: { green: 'Policy rate falling', yellow: 'Flat', red: 'Rising' },
        meaning: 'Falling policy rates help, but only if the long end also responds. Fed easing by itself is not enough.' },
      { key: 'labor', weight: 10, name: 'Labor market',
        params: { unrateObs: 3, greenUnrate: 0.30, yellowUnrate: 0.10, greenPay: 75, yellowPay: 150 },
        rules: { green: 'Unemployment rising / payrolls weak', yellow: 'Softening', red: 'Stable / strong' },
        meaning: 'A weakening labor market supports the recession and disinflation case that typically benefits long Treasuries.' },
      { key: 'hyoas', weight: 10, name: 'High-yield credit spread',
        params: { chObs: 20, greenAbove: 4.0, redBelow: 3.0 },
        rules: { green: '> 4.0% and widening', yellow: '3.0–4.0%', red: '< 3.0%' },
        meaning: 'Wider spreads indicate rising financial stress and often coincide with demand for Treasury duration.' },
      { key: 'curve', weight: 10, name: 'Curve behavior (30Y–2Y)',
        // curveRule: 'original' = GREEN only for bull flattening (30Y falling faster than 2Y)
        //            'alt'      = GREEN if 30Y 20-day change < 0 whatever the 2Y does (spec section 7 open question)
        params: { chObs: 20, curveRule: 'original', redCh: 0.15 },
        rules: { green: 'Long yields falling faster than front end', yellow: 'Mixed', red: 'Bear steepening' },
        meaning: 'The key distinction is whether long yields are falling or the curve is steepening because long yields are rising.' },
      { key: 'price', weight: 10, name: 'TLT price trend',
        params: { obs: 63, greenPct: 3, redPct: -3 },
        rules: { green: 'Positive 3M total return (> +3%)', yellow: 'Flat/base', red: 'Negative 3M total return (< −3%)' },
        meaning: 'Price confirmation matters. A positive 3-month trend suggests the Treasury market itself is validating the thesis.' }
    ],

    // ---- plain-language layer (spec 12.5). Display only: scoring never reads this block. ----
    // NOTE FOR MICHAEL: every string in plain / glossary / summary / aboutText is a first draft for your review (spec 12.10).
    plainLabels: {
      spy: [ { max: 25, label: 'Low' }, { max: 45, label: 'Moderate' }, { max: 65, label: 'Elevated' }, { max: 100, label: 'High' } ],
      tlt: [ { max: 25, label: 'Weak' }, { max: 45, label: 'Early signs' }, { max: 65, label: 'Building' }, { max: 80, label: 'Strong' }, { max: 100, label: 'Very strong' } ]
    },

    // plain name, one-sentence meaning, and a "what this means now" line per status
    plain: {
      spy: {
        curve:    { name: 'Short vs. long interest rates', meaning: 'When short-term rates are higher than long-term rates, it has often been an early sign of a coming recession.',
                    now: { ALERT: 'Alert: rates were upside-down for months and have just returned to normal, which is when recessions have often begun.', WATCH: 'Watch: short-term rates are currently higher than long-term rates, a pattern that has often come before recessions.', CLEAR: 'Clear: no recent upside-down pattern in interest rates.' } },
        sahm:     { name: 'Unemployment trigger (Sahm rule)', meaning: 'A rule of thumb that flags a recession once unemployment has risen enough from its recent low.',
                    now: { ALERT: 'Alert: unemployment has risen enough that this rule has historically signaled a recession.', WATCH: 'Watch: unemployment is rising, but not yet to the recession-signal level.', CLEAR: 'Clear: unemployment is not rising meaningfully.' } },
        claims:   { name: 'Weekly unemployment claims', meaning: 'New claims for unemployment benefits, a fast read on layoffs.',
                    now: { ALERT: 'Alert: claims are well above their one-year low, which has usually meant layoffs are building.', WATCH: 'Watch: claims are rising but not yet at recession-warning levels.', CLEAR: 'Clear: claims are near their one-year low.' } },
        payrolls: { name: 'Job growth', meaning: 'How many jobs the economy is adding each month, on average over three months.',
                    now: { ALERT: 'Alert: hiring has slowed to a crawl.', WATCH: 'Watch: hiring is slower than normal.', CLEAR: 'Clear: hiring is healthy.' } },
        hy:       { name: 'Extra interest paid by risky companies', meaning: 'How much more interest lower-rated companies pay than the U.S. government. It widens when lenders get nervous.',
                    now: { ALERT: 'Alert: the extra interest has jumped, so lenders are getting more worried.', WATCH: 'Watch: the extra interest is creeping up.', CLEAR: 'Clear: lenders are not showing new worry.' } },
        baa:      { name: 'Extra interest on good-quality company bonds', meaning: 'The same idea for higher-quality companies, with a much longer history.',
                    now: { ALERT: 'Alert: borrowing costs for companies have risen sharply versus the government.', WATCH: 'Watch: borrowing costs for companies are edging up.', CLEAR: 'Clear: no meaningful change.' } },
        nfci:     { name: 'How easy it is to borrow', meaning: 'A Chicago Fed measure of how tight or loose financial conditions are. Above zero means tighter than average.',
                    now: { ALERT: 'Alert: financial conditions are tighter than average.', WATCH: 'Watch: conditions are loose but tightening.', CLEAR: 'Clear: conditions are easy.' } },
        vix:      { name: 'Stock market jitters (VIX)', meaning: 'A gauge of how much volatility investors expect. Persistently high readings mean a nervous market.',
                    now: { ALERT: 'Alert: the market has been nervous for weeks.', WATCH: 'Watch: nervousness is somewhat above normal.', CLEAR: 'Clear: the market is calm.' } },
        trend:    { name: "Stock market's longer-term trend", meaning: 'Whether the S&P 500 is trading above or below its average price over the past 200 trading days.',
                    now: { ALERT: 'Alert: stocks have been below their long-term average for two weeks or more, and that average is falling.', WATCH: 'Watch: stocks are below their long-term average.', CLEAR: 'Clear: stocks are above their long-term average.' } },
        drawdown: { name: 'How far stocks are below their high', meaning: 'The drop from the highest price of the past year.',
                    now: { ALERT: 'Alert: stocks are well below their recent high.', WATCH: 'Watch: stocks have pulled back from their recent high.', CLEAR: 'Clear: stocks are close to their recent high.' } },
        cyc:      { name: 'Spending stocks vs. necessities stocks', meaning: 'Compares companies that make things people want (cars, travel) with those that make things people need (food, soap). Falling ratios often show worry about the economy.',
                    now: { ALERT: 'Alert: investors have been moving away from spending stocks.', WATCH: 'Watch: spending stocks are lagging necessities stocks.', CLEAR: 'Clear: spending stocks are holding up.' } }
      },
      tlt: {
        dgs30:    { name: 'Long-term Treasury interest rate (30-year)', meaning: 'The interest rate on 30-year U.S. government bonds. When it falls, long-term Treasury prices rise.',
                    now: { GREEN: 'Favorable: the 30-year rate is low enough and falling.', YELLOW: 'Mixed: the 30-year rate is in a middle zone or not moving clearly.', RED: 'Unfavorable: the 30-year rate is high or still rising.' } },
        dfii10:   { name: 'Interest rate after inflation', meaning: 'The 10-year Treasury rate after subtracting expected inflation. High readings weigh on long-term bonds.',
                    now: { GREEN: 'Favorable: the inflation-adjusted rate is low and falling.', YELLOW: 'Mixed: the inflation-adjusted rate is in a middle zone.', RED: 'Unfavorable: the inflation-adjusted rate is high and rising.' } },
        t10yie:   { name: 'Expected inflation', meaning: 'What bond investors expect inflation to average over the next 10 years.',
                    now: { GREEN: 'Favorable: expected inflation is low and falling.', YELLOW: 'Mixed: expected inflation is in a middle zone.', RED: 'Unfavorable: expected inflation is high and rising.' } },
        fedfunds: { name: 'Federal Reserve interest rate direction', meaning: 'Whether the Fed has been lowering, holding or raising its short-term rate.',
                    now: { GREEN: 'Favorable: the Fed has been lowering rates.', YELLOW: 'Mixed: the Fed has been holding rates steady.', RED: 'Unfavorable: the Fed has been raising rates.' } },
        labor:    { name: 'Job market', meaning: 'A weakening job market supports the case for falling long-term rates.',
                    now: { GREEN: 'Favorable: the job market is weakening.', YELLOW: 'Mixed: the job market is softening.', RED: 'Unfavorable: the job market is stable or strong.' } },
        hyoas:    { name: 'Extra interest paid by risky companies', meaning: 'Wider gaps show more stress in lending markets, which often sends money toward Treasuries.',
                    now: { GREEN: 'Favorable: lending stress is high and rising, which has often favored Treasuries.', YELLOW: 'Mixed: lending stress is in a middle zone.', RED: 'Unfavorable: lending markets are calm.' } },
        curve:    { name: 'Long-term vs. short-term rate moves', meaning: 'Whether long-term rates are falling faster than short-term rates, which tends to help long-term bonds.',
                    now: { GREEN: 'Favorable: long-term rates are falling faster than short-term rates.', YELLOW: 'Mixed: rate moves are not lining up clearly.', RED: 'Unfavorable: long-term rates are rising faster than short-term rates.' } },
        price:    { name: 'Long-term Treasury price trend', meaning: 'How a long-term Treasury fund has performed over the past three months, including interest paid.',
                    now: { GREEN: 'Favorable: the fund has gained over the past three months.', YELLOW: 'Mixed: the fund is roughly flat over three months.', RED: 'Unfavorable: the fund has lost ground over three months.' } }
      }
    },
    plainStatus: { ALERT: 'Alert', WATCH: 'Watch', CLEAR: 'Clear', GREEN: 'Favorable', YELLOW: 'Mixed', RED: 'Unfavorable' },

    // short plain meaning per box, used under the quadrant on the main page (spec 12.6)
    quadrantKey: {
      FTQ:       'Stocks at risk, long-term Treasuries favored. Bonds have usually cushioned stock losses here (2008, 2020).',
      NOHEDGE:   'Stocks at risk, and long-term Treasuries under pressure too. Bonds may fall alongside stocks (2022).',
      BONDRALLY: 'Treasuries favored, stocks look fine. Often a cooling-inflation, "soft landing" period.',
      RISKON:    'Stocks look fine, Treasuries not favored. Typical of a growing economy with firm interest rates.'
    },

    // generated "short version" (spec 12.4). Wording rules: describe, never advise; no banned words.
    summary: {
      changeWindowDays: 10,
      maxChanges: 6,
      bannedWords: ['buy', 'sell', 'should', 'must', 'recommend', 'will', 'guarantee'],
      headline: {
        FTQ: "Signs point to stocks under stress while long-term Treasuries are positioned to gain, the classic 'safe-haven' pattern.",
        FTQ_UNCONF: "Signs point to stocks under stress while long-term Treasuries are positioned to gain, the classic 'safe-haven' pattern. But stocks and bonds are still moving together, so the effect isn't showing up yet.",
        NOHEDGE: "Stocks look at risk, and long-term Treasuries are under pressure too, so bonds may not cushion a stock decline right now (like 2022).",
        BONDRALLY: "Conditions look favorable for long-term Treasuries, and stock-market risk looks low.",
        RISKON: "Stock-market risk looks low, and conditions don't yet favor long-term Treasuries."
      },
      spyLine: 'Stock-market risk is {label} ({score} of 100). {drivers}',
      spyDrivers: 'The main warning signs are {list}.',
      spyWatchDrivers: 'Things to keep an eye on: {list}.',
      spyNone: 'No major warning signs are flashing.',
      tltLine: 'The Treasury setup is {label} ({score} of 100). {drivers}',
      tltDrivers: 'The strongest supports are {list}.',
      tltHeldBack: 'Held back mainly by {list}.',
      tltNone: 'No indicator stands out either way.',
      unreliable: 'Not enough data loaded today to trust this number.',
      confirmed: "Economic conditions and the stock market's own trend both point to elevated risk.",
      shockInflation: 'Recent moves look driven by inflation or rising rates, which is the situation where bonds hedge stocks poorly.',
      shockGrowth: 'Recent moves look like worries about economic growth, which is when Treasuries have usually helped.',
      confidence: 'Confidence that the warning is real: {label} ({met} of 3 checks met).',
      jumpPoints: 15,
      jumpUp: 'Stock-market risk has risen quickly: up {n} points in the past month.',
      jumpDown: 'Stock-market risk has eased quickly: down {n} points in the past month.',
      tltJumpUp: 'The Treasury setup has strengthened quickly: up {n} points in the past month.',
      tltJumpDown: 'The Treasury setup has weakened quickly: down {n} points in the past month.'
    },

    aboutText: [
      '<p><strong>The question.</strong> Are conditions forming for a serious stock decline (a bear market of 20% or more, or a recession), and if so, are long-term Treasuries likely to help or hurt?</p>',
      "<p><strong>Stock-market risk score.</strong> It combines three groups of signals: the economy (jobs, unemployment, interest-rate patterns), stress in lending markets (what risky borrowers pay, financial conditions, market nervousness), and the stock market's own behavior (its trend, how far it is below its high, and whether investors are favoring spending stocks or necessities stocks). Higher means more risk.</p>",
      '<p><strong>Treasury setup score.</strong> It looks at interest-rate trends, inflation expectations, the Federal Reserve, the job market and the recent price trend of a long-term Treasury fund. Higher means conditions are more favorable for long-term Treasuries.</p>',
      '<p><strong>Why both matter.</strong> Usually bonds rise when stocks fall, but not always (2022 was the exception). The map shows which situation we are in.</p>',
      '<p><strong>Limits.</strong> This was built for moves that play out over months to quarters, not short dips. It was tested on only about 5 to 6 past bear markets. Treat it as one input to judgment, not a forecast.</p>'
    ],

    // plain-English tooltips (spec 12.5), keyed; dashboard-common.js attaches them to terms
    glossary: {
      duration: "How sensitive a bond's price is to interest rates. Long-term bonds have high duration: their prices move a lot when rates change.",
      treasury: 'A bond issued by the U.S. government. "Long-term" here means about 20 years or more.',
      yield: "The interest rate a bond currently pays, based on its price. When a bond's price falls, its yield rises, and the reverse.",
      yieldcurve: 'The line connecting interest rates from short-term to long-term bonds. "Inverted" means short-term rates are higher than long-term rates, which has often come before recessions.',
      creditspread: 'The extra interest borrowers pay over the U.S. government. It widens when lenders worry about getting repaid.',
      highyield: 'Bonds from lower-rated companies, which pay more interest because they are riskier.',
      vix: 'A measure of how much volatility stock investors expect over the next month. Higher means a more nervous market.',
      avg200: 'The average closing price over the past 200 trading days. Prices below it suggest a weak longer-term trend.',
      drawdown: 'How far a price has fallen from its recent high.',
      correlation: 'Whether two things move together. Near +1 they move together, near 0 they are unrelated, and below 0 they tend to move in opposite directions.',
      totalreturn: 'The gain or loss on an investment including interest and dividends paid, not just the price change.',
      rebased: 'Each line is set to 100 at the start so you can compare how they grew from the same starting point.',
      ftq: 'Money moving out of stocks and into safer assets such as U.S. Treasuries during stress.',
      recession: 'A broad drop in economic activity. In the U.S., the National Bureau of Economic Research (NBER) officially dates recessions, usually months after they begin.',
      confidence: 'The map is an early warning. These three checks show how well the warning is backed up: it has lasted, the economy agrees, and it does not look like an inflation shock. More checks met means more confidence, not a guarantee.',
      pp: 'Percentage points. A rate moving from 4.0% to 4.5% rose 0.5 percentage points (50 basis points).'
    },

    // ---- dashboard window, chart controls (spec 11.3) and GitHub refresh (spec 11.1.5) --------------
    dashboard: {
      displayYears: 3, staleGeneratedDays: 2, staleObsBusinessDays: 5, trailDays: 60,
      trailOptions: [30, 60, 120, 250],
      ranges: ['3M', '6M', '1Y', '2Y', '3Y'], defaultRange: '3Y',
      github: { owner: 'mchonea', repo: 'spy-tlt-regime-dashboard', workflow: 'update-market-data.yml', branch: 'main' }
    }
  };
});
