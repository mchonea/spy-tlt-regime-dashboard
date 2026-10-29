# SPY–TLT Regime Dashboard: Backtest Report

Generated 2026-10-29 by `backtest\run-backtest.js` using the same `scoring.js` / `config.js` as the dashboard. Data through 2026-10-27.

> **Read this first.** The sample contains only 4 bear markets (≥20% drawdown) and 4 NBER recessions since 1990, and they overlap. Everything below is a sanity check on whether the scores behaved sensibly, **not proof** that they work. Thresholds were set before looking at results; any change is listed under "Threshold changes".

## 1. Headline numbers

- **Bear markets (≥20%) flagged by S ≥ 46 inside the 12-months-before-peak → trough window:** 4 of 4; median lead vs the peak -2.6 months (negative = after the peak). Confirmed-bear flag: 4 of 4, median 0.6 months.
- **NBER recessions flagged:** 4 of 4; median lead vs the recession start 5.0 months.
- **False alarms** (S ≥ 46 for ≥ 20 sessions, not followed within 12 months by a ≥15% SPY drawdown or an NBER recession): 3 of 10 signal episodes, 69 sessions.
- **Flight-to-quality quadrant, 2003→present:** precision 19.5% (base rate of FTQ windows 3.3%), recall 71.9%.
- **TLT score alone, 2003→present:** median forward 6-month TLT total return 1.5% when T ≥ 46 vs 2.4% when T ≤ 45.
- **Synthetic TLT (pre-2002-07):** monthly correlation vs real TLT 0.981 (291 months).

## 2. Data sources, coverage and limitations

**FRED series start dates (confirmed from the downloaded history):**

| Series | First obs | Last obs | Spec expected |
|---|---|---|---|
| DGS30 | 1977-02-15 | 2026-10-27 | 1977 |
| DGS20 | 1962-01-02 | 2026-10-27 | 1993 (+1962–86) |
| DGS10 | 1962-01-02 | 2026-10-27 | 1962 |
| DGS2 | 1976-06-01 | 2026-10-27 | 1976 |
| DFII10 | 2003-01-02 | 2026-10-27 | 2003 |
| T10YIE | 2003-01-02 | 2026-10-28 | 2003 |
| DFF | 1954-07-01 | 2026-10-27 | 1954 |
| UNRATE | 1948-01-01 | 2026-09-01 | 1948 |
| PAYEMS | 1939-01-01 | 2026-09-01 | 1939 |
| BAMLH0A0HYM2 | 2023-10-30 | 2026-10-27 | 1996 (verify) |
| T10Y3M | 1982-01-04 | 2026-10-28 | 1982 |
| SAHMREALTIME | 1959-12-01 | 2026-09-01 | 1959 |
| ICSA | 1967-01-07 | 2026-10-17 | 1967 |
| NFCI | 1971-01-08 | 2026-10-23 | 1971 |
| BAA10Y | 1986-01-02 | 2026-10-26 | 1986 |
| VIXCLS | 1990-01-02 | 2026-10-27 | 1990 |
| USREC | 1854-12-01 | 2026-09-01 | 1854 |

**Prices:** SPY from 1993-01-29 (dividend-adjusted close, Yahoo Finance); before that ^GSPC **price-only** (excludes dividends, understating pre-1993 total returns by about 3% a year), rescaled for continuity. TLT from 2002-07-30 (adjusted close); before that a **synthetic TLT** built from DGS20 (DGS30 where DGS20 is missing) with D = 16.5, C = 380. XLY/XLP from 1998-12 (the cyclicals/defensives indicator is unavailable before then and the score is rescaled).

**Truncated history: BAMLH0A0HYM2 (ICE BofA high-yield OAS) starts 2023-10-30** on FRED (ICE licensing limits FRED to about 3 years). The High-yield spread indicator therefore scores only from 2023-10-30; before that the SPY score relies on BAA10Y for credit, and the TLT score's high-yield indicator is missing (10 weight points rescaled). This is why the Baa–10Y indicator is in the spec.

**Synthetic TLT validation:** monthly-return correlation synthetic vs actual TLT over 291 months = **0.9809** (annualised tracking error 2.75%) using the spec's D = 16.5, C = 380 (no tuning needed; target was > 0.95).

**No look-ahead:** daily FRED data and prices become usable the next day, weekly (ICSA, NFCI) +5 days, monthly (UNRATE, PAYEMS, SAHMREALTIME) on the 8th of the following month; USREC is used only to label outcomes. Forward returns start from the close of the signal date.

**Limitations**
- PAYEMS and UNRATE are **current vintages** (revised). Real-time prints were weaker/noisier, so the payroll and labor indicators here are somewhat cleaner than what was known at the time. SAHMREALTIME is already real-time. ALFRED vintages were not used.
- Small sample (see top). Overlapping windows and serial correlation mean the effective number of independent observations is far smaller than the number of days.
- Pre-2003 the TLT score is missing DFII10 and T10YIE (40 of 100 weight points) and, throughout, the high-yield spread before 2023-10-30, so earlier scores are rescaled and less reliable. The 2002-02 → 2006-02 gap in DGS30 also removes the 30Y and curve indicators in that stretch.
- The TLT score was built with knowledge of the post-2020 period; the 1990–2012 calibration/2013+ validation split reduces, but does not remove, hindsight.
- Yahoo prices are unofficial; the final row is the latest close or an intraday print.

**Indicator coverage by year (average % of weight loaded):**

| Year | SPY score | TLT score |
|---|---|---|
| 1990 | 79% | 60% |
| 1991 | 80% | 60% |
| 1992 | 80% | 60% |
| 1993 | 80% | 60% |
| 1994 | 80% | 60% |
| 1995 | 80% | 60% |
| 1996 | 80% | 60% |
| 1997 | 80% | 60% |
| 1998 | 80% | 60% |
| 1999 | 82% | 60% |
| 2000 | 90% | 60% |
| 2001 | 90% | 60% |
| 2002 | 90% | 60% |
| 2003 | 90% | 88% |
| 2004 | 90% | 90% |
| 2005 | 90% | 90% |
| 2006 | 90% | 90% |
| 2007 | 90% | 90% |
| 2008 | 90% | 90% |
| 2009 | 90% | 90% |
| 2010 | 90% | 90% |
| 2011 | 90% | 90% |
| 2012 | 90% | 90% |
| 2013 | 90% | 90% |
| 2014 | 90% | 90% |
| 2015 | 90% | 90% |
| 2016 | 90% | 90% |
| 2017 | 90% | 90% |
| 2018 | 90% | 90% |
| 2019 | 90% | 90% |
| 2020 | 90% | 90% |
| 2021 | 90% | 90% |
| 2022 | 90% | 90% |
| 2023 | 90% | 91% |
| 2024 | 99% | 100% |
| 2025 | 100% | 100% |
| 2026 | 100% | 100% |

## 3. Bear markets and recessions: warning given by the SPY score

Window: from 12 months before the peak (recession: before the NBER start) to the trough. "Lead" is months before the peak (negative = after). "DD at signal" is the drawdown already taken from the peak when the signal first fired. "(on)" = already on at the start of the window.

### 3a. Bear markets (≥ 20% from all-time high, adjusted SPY / ^GSPC)

| Episode | Peak | Trough | Max DD | First S ≥ 46 | Lead (mo) | DD at signal | First "confirmed" | Lead (mo) | DD at signal | S / T at peak |
|---|---|---|---|---|---|---|---|---|---|---|
| Bear 2000 | 2000-03-24 | 2002-10-09 | 48% | 2000-10-17 | -6.8 | 12% | 1999-09-24 | 6.0 | 17% | 11 / 42 |
| Bear 2007 | 2007-10-09 | 2009-03-09 | 55% | 2007-08-17 | 1.7 | 8% | 2007-08-17 | 1.7 | 8% | 47 / 56 |
| Bear 2020 | 2020-02-19 | 2020-03-23 | 34% | 2020-03-10 | -0.7 | 15% | 2020-03-06 | -0.5 | 12% | 11 / 83 |
| Bear 2022 | 2022-01-03 | 2022-10-12 | 24% | 2022-05-19 | -4.5 | 18% | 2022-02-18 | -1.5 | 9% | 0 / 50 |

### 3b. NBER recessions (peak = recession start, trough = recession end)

| Episode | Peak | Trough | Max DD | First S ≥ 46 | Lead (mo) | DD at signal | First "confirmed" | Lead (mo) | DD at signal | S / T at peak |
|---|---|---|---|---|---|---|---|---|---|---|
| NBER 1990-08 | 1990-08-01 | 1991-03-31 |  | 1990-01-23 | 6.2 | 7% | 1990-01-23 | 6.2 | 7% | 31 / 58 |
| NBER 2001-04 | 2001-04-01 | 2001-11-30 |  | 2000-10-17 | 5.5 | -15% | 2000-05-11 | 10.7 | -20% | 61 / 50 |
| NBER 2008-01 | 2008-01-01 | 2009-06-30 |  | 2007-08-17 | 4.5 | 2% | 2007-08-17 | 4.5 | 2% | 61 / 61 |
| NBER 2020-03 | 2020-03-01 | 2020-04-30 |  | 2020-03-10 | -0.3 | 3% | 2020-03-06 | -0.2 | -0% | 28 / 78 |

### 3c. Near-bears (drawdown 15–20%): for context

| Episode | Peak | Trough | Max DD | First S ≥ 46 | Lead (mo) | DD at signal | First "confirmed" | Lead (mo) | DD at signal | S / T at peak |
|---|---|---|---|---|---|---|---|---|---|---|
| DD 1990-07 | 1990-07-16 | 1990-10-11 | 20% | 1990-01-23 | 5.7 | 10% | 1990-01-23 | 5.7 | 10% | 25 / 58 |
| DD 1998-07 | 1998-07-20 | 1998-08-31 | 19% | never | – | – | 1998-08-28 | -1.3 | 13% | 9 / 33 |
| DD 2018-09 | 2018-09-20 | 2018-12-24 | 19% | 2018-12-24 | -3.1 | 19% | 2018-12-24 | -3.1 | 19% | 0 / 28 |
| DD 2025-02 | 2025-02-19 | 2025-04-08 | 19% | 2024-08-08 | 6.4 | 14% | 2025-04-04 | -1.4 | 17% | 15 / 75 |

### 3d. Layer contribution: lead time each layer gives on its own

A layer "fires" when ≥ 50% of its (loaded) weight is in ALERT/WATCH-weighted points. Lead in months before the peak/start (negative = after). Bear markets and recessions are combined.

| Episode | Layer A (recession) | Layer B (credit) | Layer C (market) | Total S ≥ 46 | Confirmed |
|---|---|---|---|---|---|
| Bear 2000 | -5.5 | 6.3 | 6.0 | -6.8 | 6.0 |
| Bear 2007 | 1.0 | 1.7 | 2.1 | 1.7 | 1.7 |
| Bear 2020 | never | -0.5 | 8.6 | -0.7 | -0.5 |
| Bear 2022 | 12.0 | -1.5 | -0.7 | -4.5 | -1.5 |
| NBER 1990-08 | 6.7 | 6.9 | 6.2 | 6.2 | 6.2 |
| NBER 2001-04 | 6.7 | 11.9 | 10.7 | 5.5 | 10.7 |
| NBER 2008-01 | 3.7 | 4.5 | 4.9 | 4.5 | 4.5 |
| NBER 2020-03 | -0.8 | -0.2 | 8.9 | -0.3 | -0.2 |

Median lead (detected / total): A 3.7 (7/8), B 3.1 (8/8), C 6.1 (8/8), S ≥ 46 0.7 (8/8), confirmed 3.1 (8/8).

## 4. False alarms

A signal episode is S ≥ 46 for ≥ 20 consecutive sessions. It is a **hit** if within 12 months an NBER recession month occurs (or is in progress) or SPY falls ≥ 15% below the signal-date close; otherwise a **false alarm**. Episodes within 12 months of the data end are marked incomplete.

| Period | Signal episodes | Hits | False alarms | Sessions in signal | Sessions in false alarms | Years |
|---|---|---|---|---|---|---|
| 1990–2012 (calibration) | 7 | 6 | 1 | 1250 | 20 | 23.0 |
| 2013–present (validation) | 3 | 1 | 2 | 155 | 49 | 13.8 |

| Start | End | Sessions | Worst SPY 12-mo fwd | NBER recession ≤12m | Outcome |
|---|---|---|---|---|---|
| 1990-08-15 | 1991-06-26 | 219 | -13% | yes | hit |
| 2000-10-17 | 2001-01-29 | 71 | -27% | yes | hit |
| 2001-02-06 | 2002-03-04 | 266 | -27% | yes | hit |
| 2002-04-18 | 2002-12-06 | 163 | -30% | no | hit |
| 2007-08-29 | 2007-10-23 | 39 | -16% | yes | hit |
| 2007-11-08 | 2009-09-23 | 472 | -42% | yes | hit |
| 2011-09-27 | 2011-10-24 | 20 | -6% | no | FALSE ALARM |
| 2020-03-10 | 2020-08-07 | 106 | -22% | yes | hit |
| 2022-06-27 | 2022-07-28 | 23 | -8% | no | FALSE ALARM |
| 2025-04-04 | 2025-05-12 | 26 | -2% | no | FALSE ALARM |

## 5. Joint view: forward returns by regime quadrant

Quadrant needs both scores. TLT score has full indicator coverage only from 2003; 1990–2002 is supplementary. Forward returns are total returns over 3/6/12 months (63/126/252 sessions) from the signal date; each cell shows median [10th – 90th percentile].

### 1990–2002 (supplementary) (3280 sessions)

| Quadrant | Share of days | SPY 3m | SPY 6m | SPY 12m | TLT 3m | TLT 6m | TLT 12m |
|---|---|---|---|---|---|---|---|
| Flight to quality (S≥46, T≥46) | 12.8% | 0.9% [-11% – 14%] | 0.1% [-11% – 16%] | 5.2% [-21% – 25%] | 1.0% [-4% – 11%] | 4.7% [-4% – 11%] | 11.7% [1% – 22%] |
| Duration won't hedge (S≥46, T≤45) | 10.0% | -2.5% [-15% – 5%] | -6.2% [-17% – 16%] | -10.2% [-21% – 23%] | 5.4% [-2% – 13%] | 9.8% [1% – 18%] | 16.7% [5% – 28%] |
| Bond rally, stocks OK (S≤45, T≥46) | 15.4% | 2.9% [-7% – 12%] | 6.5% [-7% – 21%] | 10.1% [3% – 28%] | 2.0% [-6% – 9%] | 6.8% [-10% – 15%] | 12.8% [-13% – 29%] |
| Risk-on / rates pressure (S≤45, T≤45) | 61.7% | 3.5% [-4% – 10%] | 6.3% [-5% – 19%] | 15.7% [-4% – 35%] | 3.4% [-6% – 13%] | 8.7% [-9% – 19%] | 15.4% [-6% – 32%] |

### 2003–2012 (calibration) (2517 sessions)

| Quadrant | Share of days | SPY 3m | SPY 6m | SPY 12m | TLT 3m | TLT 6m | TLT 12m |
|---|---|---|---|---|---|---|---|
| Flight to quality (S≥46, T≥46) | 20.2% | -1.6% [-22% – 15%] | -1.8% [-34% – 26%] | 8.2% [-38% – 40%] | 2.3% [-8% – 11%] | 0.6% [-9% – 15%] | 6.7% [-11% – 17%] |
| Duration won't hedge (S≥46, T≤45) | 3.4% | 8.7% [-9% – 16%] | 16.7% [-31% – 25%] | 17.5% [-41% – 40%] | 2.3% [-6% – 8%] | 3.3% [-3% – 8%] | 10.6% [-5% – 18%] |
| Bond rally, stocks OK (S≤45, T≥46) | 53.9% | 4.1% [-4% – 10%] | 6.5% [-4% – 16%] | 12.4% [2% – 25%] | 1.3% [-7% – 9%] | 2.4% [-6% – 16%] | 6.6% [-8% – 23%] |
| Risk-on / rates pressure (S≤45, T≤45) | 22.5% | 2.5% [-4% – 9%] | 5.9% [-2% – 15%] | 11.7% [-3% – 22%] | 2.5% [-4% – 9%] | 6.0% [-4% – 13%] | 7.4% [-4% – 24%] |

### 2013–present (validation) (3476 sessions)

| Quadrant | Share of days | SPY 3m | SPY 6m | SPY 12m | TLT 3m | TLT 6m | TLT 12m |
|---|---|---|---|---|---|---|---|
| Flight to quality (S≥46, T≥46) | 4.6% | 12.0% [-0% – 21%] | 20.0% [5% – 31%] | 38.2% [17% – 55%] | 0.1% [-7% – 3%] | -2.4% [-9% – 8%] | -10.5% [-16% – 4%] |
| Duration won't hedge (S≥46, T≤45) | 0.8% | 6.5% [-5% – 15%] | 5.5% [1% – 22%] | 19.6% [8% – 39%] | -1.1% [-11% – 4%] | -6.3% [-13% – 5%] | -9.1% [-13% – 2%] |
| Bond rally, stocks OK (S≤45, T≥46) | 63.0% | 4.3% [-3% – 10%] | 7.8% [-2% – 15%] | 15.2% [-1% – 26%] | 0.7% [-8% – 8%] | 1.6% [-11% – 13%] | 0.1% [-10% – 23%] |
| Risk-on / rates pressure (S≤45, T≤45) | 31.6% | 3.8% [-8% – 10%] | 7.7% [-6% – 16%] | 16.2% [-5% – 29%] | 0.3% [-9% – 8%] | 0.3% [-15% – 10%] | 1.3% [-13% – 18%] |

### 2003–present (main) (5993 sessions)

| Quadrant | Share of days | SPY 3m | SPY 6m | SPY 12m | TLT 3m | TLT 6m | TLT 12m |
|---|---|---|---|---|---|---|---|
| Flight to quality (S≥46, T≥46) | 11.1% | 3.6% [-16% – 17%] | 8.8% [-32% – 27%] | 20.4% [-37% – 47%] | 1.5% [-8% – 9%] | -0.1% [-9% – 12%] | 4.9% [-15% – 16%] |
| Duration won't hedge (S≥46, T≤45) | 1.9% | 8.5% [-9% – 15%] | 15.7% [-14% – 25%] | 18.1% [-41% – 40%] | 1.2% [-8% – 8%] | 2.4% [-8% – 7%] | 5.5% [-10% – 17%] |
| Bond rally, stocks OK (S≤45, T≥46) | 59.2% | 4.2% [-3% – 10%] | 7.3% [-3% – 15%] | 14.1% [0% – 25%] | 0.9% [-7% – 8%] | 1.9% [-9% – 14%] | 4.0% [-9% – 23%] |
| Risk-on / rates pressure (S≤45, T≤45) | 27.8% | 3.3% [-6% – 9%] | 6.9% [-4% – 16%] | 13.9% [-5% – 27%] | 1.1% [-8% – 8%] | 2.4% [-11% – 12%] | 4.5% [-12% – 20%] |

## 6. Flight-to-quality precision and recall

FTQ window = next 6 months SPY total return ≤ −10% **and** TLT ≥ +5%. Both-down window = SPY ≤ −10% and TLT ≤ 0. Precision = share of quadrant days that were FTQ windows. Recall = share of FTQ-window days preceded by the quadrant within the previous 3 months (63 sessions).

| Period | Days w/ fwd data | Base rate FTQ window | Quadrant days | Precision | Recall | FTQ windows (days) | Confirmed-only precision | Confirmed-only recall |
|---|---|---|---|---|---|---|---|---|
| 2003–2012 (calibration) | 2517 | 6.9% | 508 | 25.6% | 81.0% | 174 | 25.6% (508 days) | 81.0% |
| 2013–present (validation) | 3350 | 0.7% | 159 | 0.0% | 0.0% | 22 | 0.0% (148 days) | 0.0% |
| 2003–present | 5867 | 3.3% | 667 | 19.5% | 71.9% | 196 | 19.8% (656 days) | 71.9% |
| 1990–2002 (supplementary) | 3280 | 7.5% | 421 | 9.7% | 62.8% | 247 | 13.2% (310 days) | 62.8% |

"Confirmed-only" excludes days downgraded to "unconfirmed" because the 63-day SPY/TLT correlation was above +0.2.

| Period | "Duration won't hedge" days | of which both-down | of which FTQ window | Base rate both-down |
|---|---|---|---|---|
| 2003–2012 (calibration) | 85 | 0 (0%) | 11 | 0.1% |
| 2013–present (validation) | 29 | 0 (0%) | 0 | 2.5% |
| 2003–present | 114 | 0 (0%) | 11 | 1.4% |
| 1990–2002 (supplementary) | 329 | 1 (0%) | 93 | 0.3% |

## 7. Does the TLT score alone have any value?

Forward TLT total return by TLT score bucket: median / mean / share positive (n sessions).

### 1990–2002 (partial coverage, synthetic TLT)

| TLT score | 6-mo fwd return | 12-mo fwd return |
|---|---|---|
| 0–25 | 7.9% / 6.6% / 68% (1054) | 17.1% / 16.2% / 85% (1054) |
| 26–45 | 9.6% / 7.8% / 81% (1299) | 14.3% / 12.8% / 81% (1299) |
| 46–65 | 6.9% / 5.5% / 79% (706) | 13.7% / 11.4% / 79% (706) |
| 66–80 | 3.0% / 3.0% / 72% (178) | 6.9% / 6.4% / 76% (178) |
| 81–100 | -2.1% / -2.8% / 40% (43) | 2.8% / 3.5% / 84% (43) |
| **All days** | 7.7% / 6.5% / 75% (3280) | 14.3% / 13.1% / 82% (3280) |

Median 6-mo forward TLT return: **5.8%** for T ≥ 46 (n=927) vs **8.9%** for T ≤ 45 (n=2353); difference -3.1%.

### 2003–2012 (calibration)

| TLT score | 6-mo fwd return | 12-mo fwd return |
|---|---|---|
| 0–25 | 9.0% / 7.7% / 94% (95) | 10.5% / 11.8% / 99% (95) |
| 26–45 | 4.5% / 5.1% / 75% (557) | 7.2% / 8.4% / 85% (557) |
| 46–65 | 3.9% / 5.1% / 65% (633) | 6.6% / 7.4% / 81% (633) |
| 66–80 | 2.4% / 4.2% / 63% (794) | 7.0% / 7.7% / 83% (794) |
| 81–100 | -1.7% / -0.9% / 43% (438) | 5.5% / 4.3% / 72% (438) |
| **All days** | 3.1% / 3.9% / 64% (2517) | 6.9% / 7.3% / 82% (2517) |

Median 6-mo forward TLT return: **1.9%** for T ≥ 46 (n=1865) vs **5.4%** for T ≤ 45 (n=652); difference -3.5%.

### 2013–present (validation)

| TLT score | 6-mo fwd return | 12-mo fwd return |
|---|---|---|
| 0–25 | -0.1% / -2.5% / 49% (189) | -4.5% / -2.4% / 35% (189) |
| 26–45 | 0.4% / -0.4% / 52% (866) | 1.9% / 1.6% / 57% (848) |
| 46–65 | 0.4% / 0.5% / 51% (796) | -0.4% / 1.7% / 49% (713) |
| 66–80 | 1.2% / 1.4% / 55% (1045) | -0.7% / 1.3% / 48% (1021) |
| 81–100 | 2.1% / 1.6% / 55% (454) | -1.6% / 3.9% / 46% (453) |
| **All days** | 0.7% / 0.5% / 53% (3350) | -0.0% / 1.6% / 50% (3224) |

Median 6-mo forward TLT return: **1.1%** for T ≥ 46 (n=2295) vs **0.1%** for T ≤ 45 (n=1055); difference 1.0%.

## 8. Episode hand-check

Scores as of the 15th of each month (or the prior trading day). **Expected sense checks:** 2007–09 and 2020 should show Flight to quality; 2022 should show "Duration won't hedge" / inflation shock. If not, this is stated plainly below; the thresholds were not tuned to force it.

| Month | Date | S | A / B / C | Confirmed | T | ρ (63d) | Shock type | Quadrant | SPY next 6m | TLT next 6m |
|---|---|---|---|---|---|---|---|---|---|---|
| 2000-03 | 2000-03-15 | 6 | 0% / 25% / 0% | no | 42 | -0.05 | Inflation/rates shock | Risk-on / rates pressure | 7% | 10% |
| 2001-09 | 2001-09-10 | 86 | 100% / 38% / 100% | yes | 75 | -0.28 | Growth scare | Flight to quality | 7% | -4% |
| 2007-10 | 2007-10-15 | 47 | 50% / 63% / 33% | no | 56 | -0.40 | Growth scare | Flight to quality | -11% | 9% |
| 2008-09 | 2008-09-15 | 97 | 100% / 88% / 100% | yes | 78 | -0.50 | Growth scare | Flight to quality | -34% | 5% |
| 2011-08 | 2011-08-15 | 36 | 0% / 63% / 67% | yes | 89 | -0.63 | Growth scare | Bond rally, stocks OK | 13% | 15% |
| 2015-08 | 2015-08-14 | 6 | 0% / 25% / 0% | no | 72 | -0.51 | Mixed | Bond rally, stocks OK | -8% | 6% |
| 2018-12 | 2018-12-14 | 33 | 13% / 25% / 67% | no | 83 | -0.34 | Growth scare | Bond rally, stocks OK | 13% | 13% |
| 2020-02 | 2020-02-14 | 11 | 25% / 0% / 0% | no | 83 | -0.51 | Growth scare | Bond rally, stocks OK | 1% | 14% |
| 2020-03 | 2020-03-13 | 53 | 25% / 75% / 75% | yes | 72 | -0.44 | Growth scare | Flight to quality | 25% | 8% |
| 2022-01 | 2022-01-14 | 11 | 0% / 0% / 33% | no | 44 | -0.40 | Inflation/rates shock | Risk-on / rates pressure | -15% | -19% |
| 2022-10 | 2022-10-14 | 36 | 0% / 38% / 83% | no | 22 | 0.20 | Inflation/rates shock | Risk-on / rates pressure | 17% | 7% |
| 2025-04 | 2025-04-15 | 57 | 38% / 75% / 67% | yes | 55 | 0.11 | Growth scare | Flight to quality | 24% | 6% |

\* TLT score computed on < 50 weight points (not reliable). The 2002-02 → 2006-02 DGS30 gap and missing DFII10/T10YIE/high-yield data before 2003 reduce pre-2003 coverage.

- **Flight to quality expected at 2007-10, 2008-09, 2020-02, 2020-03:** 2007-10 → Flight to quality; 2008-09 → Flight to quality; 2020-02 → Bond rally, stocks OK; 2020-03 → Flight to quality.
- **"Duration won't hedge" / inflation shock expected at 2022-01, 2022-10:** 2022-01 → Risk-on / rates pressure, shock: Inflation/rates shock; 2022-10 → Risk-on / rates pressure, shock: Inflation/rates shock.

**Result: the sense checks were NOT all met.** Misses: 2020-02 (Bond rally, stocks OK), 2022-01 (Risk-on / rates pressure), 2022-10 (Risk-on / rates pressure). Not tuned to fix.

## 9. Calibration and threshold changes

Rule (spec 9.5): calibrate on 1990–2012, validate on 2013–present; adopt a change only if it improves results in **both** periods. Starting values come from the spec.

Adoption test: SPY variants must (in each period) flag at least as many episodes, produce no more false-alarm episodes, and either remove a false alarm, flag another episode, or lead by ≥ 0.5 month more. TLT variants must widen the T ≥ 46 minus T ≤ 45 forward-return spread by ≥ 0.5pp. Both periods must pass.

Metrics per period (SPY side: bear markets + recessions flagged, median lead in months, false-alarm episodes; TLT side: median forward 6-mo TLT return, T ≥ 46 minus T ≤ 45, from 2003). Baseline = spec values.

| Variant | 1990–2012 | 2013–present | Decision |
|---|---|---|---|
| Baseline (spec values) | 5/5 flagged, lead 4.5, FA 1 (20 d), TLT spread -3.5% | 3/3 flagged, lead -0.7, FA 2 (49 d), TLT spread 1.0% | – |
| TLT curve rule: GREEN if 30Y 20-day change < 0 (any 2Y move) | 5/5 flagged, lead 4.5, FA 1 (20 d), TLT spread -3.4% | 3/3 flagged, lead -0.7, FA 2 (49 d), TLT spread 1.0% | not adopted (1793 sessions changed) |
| SPY curve: re-steepening ALERT only if inverted within last 12 months | 5/5 flagged, lead 4.5, FA 1 (20 d), TLT spread -3.5% | 3/3 flagged, lead -0.7, FA 2 (49 d), TLT spread 1.0% | not adopted (1154 sessions changed) |
| SPY VIX: 50-day avg thresholds 22 / 18 | 5/5 flagged, lead 4.5, FA 1 (20 d), TLT spread -3.5% | 3/3 flagged, lead -0.7, FA 2 (49 d), TLT spread 1.0% | not adopted (1960 sessions changed) |
| SPY trend: ALERT after 5 straight sessions below SMA | 5/5 flagged, lead 4.5, FA 1 (20 d), TLT spread -3.5% | 3/3 flagged, lead -0.7, FA 2 (49 d), TLT spread 1.0% | not adopted (57 sessions changed) |
| SPY payrolls: thresholds 75k / 125k | 5/5 flagged, lead 4.5, FA 1 (20 d), TLT spread -3.5% | 3/3 flagged, lead -0.7, FA 2 (49 d), TLT spread 1.0% | not adopted (905 sessions changed) |
| SPY claims: thresholds 15% / 7.5% | 5/5 flagged, lead 4.5, FA 1 (20 d), TLT spread -3.5% | 3/3 flagged, lead -0.7, FA 3 (69 d), TLT spread 1.0% | not adopted (1010 sessions changed) |

### Threshold changes

**No thresholds were changed from the §6/§7 starting values.** Each candidate above failed to improve results in both periods.

### Open question from spec section 7: TLT curve indicator

Compare the current rule (GREEN only for bull flattening) with "GREEN if 30Y 20-day change < 0 whatever the 2Y does". Median forward 6-mo TLT return, T ≥ 46 minus T ≤ 45, 2003→present:

| Rule | 1990–2012 spread | 2013–present spread |
|---|---|---|
| Current (bull flattening only) | -3.5% (hi 1.9%, lo 5.4%) | 1.0% (hi 1.1%, lo 0.1%) |
| Alternative (30Y falling) | -3.4% (hi 2.0%, lo 5.5%) | 1.0% (hi 1.1%, lo 0.1%) |

The alternative did not improve the spread in both periods, so the original rule was kept.

## 9b. Flight-to-quality confidence meter

The Flight-to-quality box stays an early **warning**. The meter rates how well a warning is confirmed with three checks (logic in `scoring.js`, settings in `config.js` → `confidence`): (1) S ≥ 46 for 20 straight sessions, (2) recession layer A ≥ 50%, (3) shock type is not "Inflation/rates shock". It does not change S, T or the quadrant. Rule: 0 met = Early warning, 1 = Low, 2 = Moderate, 3 = High.

All "Flight to quality" days, 2003 → present, by checks met (a flight-to-quality window = next 6-mo SPY ≤ −10% and TLT ≥ +5%):

| Checks met | Label | Days | FTQ-window precision | Median SPY next 6m | Median TLT next 6m |
|---|---|---|---|---|---|
| 0 | Early warning | 21 | 0% | 5.1% | -0.6% |
| 1 | Low confidence | 150 | 2% | 18.2% | 1.5% |
| 2 | Moderate confidence | 224 | 27% | 17.7% | -2.0% |
| 3 | High confidence | 272 | 24% | -4.7% | 0.5% |

Entries into Flight to quality with no flight-to-quality day in the prior 9 months (since 2000). Outcome: hit if an NBER recession month occurs, or SPY falls ≥ 15% below the entry close, within 12 months. "Peak confidence" is the highest checks-met count reached during that flight-to-quality stretch.

| Entry date | S | T | Met at entry | Peak confidence in stretch | SPY next 6m | TLT next 6m | Outcome |
|---|---|---|---|---|---|---|---|
| 2000-10-27 | 56 | 50 | 1 of 3 (Low confidence) | 1 of 3 | -8.3% | 4.6% | hit |
| 2007-08-17 | 53 | 78 | 1 of 3 (Low confidence) | 1 of 3 | -5.4% | 7.3% | hit |
| 2010-07-01 | 53 | 83 | 1 of 3 (Low confidence) | 1 of 3 | 23.6% | -6.5% | FALSE ALARM |
| 2011-08-31 | 50 | 94 | 1 of 3 (Low confidence) | 1 of 3 | 13.6% | 11.5% | FALSE ALARM |
| 2018-12-24 | 47 | 83 | 1 of 3 (Low confidence) | 1 of 3 | 25.1% | 10.0% | FALSE ALARM |
| 2020-03-10 | 50 | 89 | 1 of 3 (Low confidence) | 3 of 3 | 16.7% | 1.5% | hit |
| 2022-07-06 | 53 | 50 | 0 of 3 (Early warning) | 0 of 3 | 1.0% | -9.2% | FALSE ALARM |
| 2024-08-08 | 48 | 85 | 2 of 3 (Moderate confidence) | 2 of 3 | 14.7% | -4.7% | FALSE ALARM |

Small sample (about nine entries): this is a sanity check on the meter, not proof. The check thresholds (20 sessions, 50%) came from the earlier gate analysis in `backtest/ftq-gates.js` and were not tuned further.

## 10. Reproducing this report

```
node backtest\run-backtest.js        (from the TLT folder; needs history\*.csv from Update Market Data.bat)
```
