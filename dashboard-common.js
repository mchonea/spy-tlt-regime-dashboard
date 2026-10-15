/*
  dashboard-common.js - shared browser code for index.html (summary) and market-dashboard.html (detail).
  Loaded AFTER config.js, scoring.js, market-data.js (and chart.umd.min.js where charts are used).
  Holds: data loading, score history, banners, regime quadrant (inline + expanded), charts with the shared
  time-range selector, glossary tooltips, generated summary text, "what changed", and the Refresh flow
  (GitHub Actions on the published site, plain file reload locally).
  Pages keep only their own layout and a render(state) callback:  Dash.start({ render: function (state) { ... } })
*/
(function () {
  "use strict";

  var CFG = window.MARKET_CONFIG, S = window.Scoring, DC = CFG.dashboard;
  var KEY_RANGE = "cfpDash.chartRange", KEY_TRAIL = "cfpDash.quadTrail", KEY_TOKEN = "cfpDash.ghToken";

  var state = { D: null, H: null, cur: null, range: DC.defaultRange, trail: DC.trailDays, flash: "", pageRender: null, forced: false };
  var memToken = null;           // used only if localStorage is unavailable

  /* ---------------------------------------------------------------- tiny helpers */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmtSigned(v, d) { return (v >= 0 ? "+" : "") + v.toFixed(d === undefined ? 2 : d); }
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function parts(iso) { var p = iso.split("-"); return { y: +p[0], m: +p[1] - 1, d: +p[2] }; }
  function fmtMonDay(iso) { var p = parts(iso); return MON[p.m] + " " + p.d; }
  function fmtLong(iso) { var p = parts(iso), dt = new Date(Date.UTC(p.y, p.m, p.d)); return DOW[dt.getUTCDay()] + ", " + MON[p.m] + " " + p.d + ", " + p.y; }
  function fmtMonYY(iso) { var p = parts(iso); return MON[p.m] + " '" + String(p.y).slice(2); }
  function fmtFull(iso) { var p = parts(iso); return MON[p.m] + " " + p.d + ", " + p.y; }
  function lowerFirst(s) { return /^(Federal|S&P|U\.S\.)/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1); }
  function joinList(a) { return a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }

  /* ---------------------------------------------------------------- glossary tooltips */
  var GL_FOR = {
    spy: { curve: "yieldcurve", hy: "highyield", baa: "creditspread", vix: "vix", trend: "avg200", drawdown: "drawdown" },
    tlt: { dgs30: "yield", dfii10: "yield", hyoas: "creditspread", curve: "yieldcurve", price: "totalreturn" }
  };
  function gl(key) {
    var t = CFG.glossary[key];
    return t ? '<i class="gl" tabindex="0" role="button" aria-label="What does this mean? ' + esc(t) + '" data-tip="' + esc(t) + '">i</i>' : "";
  }
  function initGlossary() {
    var tip = document.createElement("div"); tip.id = "gltip"; tip.setAttribute("role", "tooltip"); document.body.appendChild(tip);
    var cur = null;
    function show(el) {
      cur = el; tip.textContent = el.getAttribute("data-tip"); tip.style.display = "block";
      var r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      var left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
      var top = r.bottom + 8; if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
      tip.style.left = left + "px"; tip.style.top = top + "px";
    }
    function hide() { cur = null; tip.style.display = "none"; }
    document.addEventListener("mouseover", function (e) { var t = e.target.closest && e.target.closest(".gl"); if (t) show(t); });
    document.addEventListener("mouseout", function (e) { var t = e.target.closest && e.target.closest(".gl"); if (t) hide(); });
    document.addEventListener("focusin", function (e) { var t = e.target.closest && e.target.closest(".gl"); if (t) show(t); });
    document.addEventListener("focusout", function (e) { if (e.target.closest && e.target.closest(".gl")) hide(); });
    document.addEventListener("click", function (e) {            // tap on touch devices
      var t = e.target.closest && e.target.closest(".gl");
      if (t) { if (cur === t && tip.style.display === "block") hide(); else show(t); } else hide();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") hide(); });
    window.addEventListener("scroll", hide, { passive: true });
  }

  /* ---------------------------------------------------------------- script (re)loading with cache-busting */
  function loadScript(src, globalName) {
    return new Promise(function (resolve) {
      var old = document.getElementById("dyn_" + globalName), prev = window[globalName];
      if (old) old.remove();
      window[globalName] = undefined;
      var s = document.createElement("script");
      s.id = "dyn_" + globalName;
      s.src = src + "?v=" + Date.now();
      s.onload = function () { if (!window[globalName]) window[globalName] = prev; resolve(window[globalName] || null); };
      s.onerror = function () { window[globalName] = prev; resolve(null); };
      document.head.appendChild(s);
    });
  }

  /* ---------------------------------------------------------------- mode */
  function isPublished() {
    return location.protocol === "https:" && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  }

  /* ---------------------------------------------------------------- banners */
  function renderBanners(D) {
    var el = $("banners"); if (!el) return;
    var html = "";
    if (!D) {
      html += '<div class="banner red">market-data.js was not found. ' + (isPublished() ? 'Click Refresh data, or check the Actions tab on GitHub.' : "Run 'Update Market Data.bat' in this folder (or 'Setup Market Schedule.bat' the first time).") + '</div>';
      el.innerHTML = html + state.flash; return;
    }
    var now = Date.now(), gen = new Date(D.generated), ageDays = (now - gen.getTime()) / 86400000;
    var newest = "";
    Object.keys(D.series).forEach(function (id) {
      if ((CFG.series[id] || {}).freq !== "D") return;
      var rows = D.series[id];
      if (rows.length && rows[rows.length - 1][0] > newest) newest = rows[rows.length - 1][0];
    });
    var today = new Date().toISOString().slice(0, 10);
    var obsBiz = newest ? S.businessDaysBetween(newest, today) : 999;
    var genStale = ageDays > DC.staleGeneratedDays, obsStale = obsBiz > DC.staleObsBusinessDays;
    if (genStale || obsStale) {
      var n = genStale ? Math.floor(ageDays) : Math.floor((now - S.dayNum(newest) * 86400000) / 86400000);
      var gh = DC.github, actions = "https://github.com/" + gh.owner + "/" + gh.repo + "/actions";
      if (isPublished()) {
        html += '<div class="banner amber">Data is ' + n + ' days old. Click Refresh data. If this keeps happening, the scheduled GitHub update may be failing: check the <a href="' + actions + '" target="_blank" rel="noopener">Actions tab</a>.</div>';
      } else {
        html += '<div class="banner amber">Data is ' + n + " days old. Run 'Update Market Data.bat'. If this keeps happening, the folder may have moved: run 'Setup Market Schedule.bat'.</div>";
      }
    }
    if (D.failed && D.failed.length) {
      html += '<div class="banner red">Last update failed for: ' + esc(D.failed.join(", ")) + '. Those series were carried forward from the previous download, so the affected indicators may be stale. See update-log.txt.</div>';
    }
    el.innerHTML = html + state.flash;
  }

  /* ---------------------------------------------------------------- score history */
  function computeHistory(D) {
    var prep = S.prepare({ series: D.series, prices: D.prices }, CFG);
    var live = S.liveDate(prep);
    var last = S.tradingDates(prep).slice(-1)[0];
    var from = S.dayStr(S.dayNum(last) - Math.round(DC.displayYears * 365.25));
    var dates = S.tradingDates(prep, from, null).concat([live]);
    var res = dates.map(function (d) { return S.evaluate(prep, d, CFG); });
    return { prep: prep, dates: dates, res: res, live: live, last: last, nums: dates.map(S.dayNum) };
  }

  function labelFor(list, score) { for (var i = 0; i < list.length; i++) if (score <= list[i].max) return list[i]; return list[list.length - 1]; }
  function plainLabel(kind, score) { return score === null ? "n/a" : labelFor(CFG.plainLabels[kind], score).label; }
  function quadKeyOf(r) { return r.quadrant === "FTQ" && r.ftqUnconfirmed ? "FTQ_UNCONF" : r.quadrant; }
  function quadName(r) { return CFG.joint.quadrants[quadKeyOf(r)].label; }

  /* Dev-only: ?forceQuadrant=NOHEDGE&forceS=70&forceT=20[&forceShock=growth|inflation][&forceConfirmed=1] */
  function applyForce(cur) {
    var q = new URLSearchParams(location.search);
    if (!(q.has("forceQuadrant") || q.has("forceS") || q.has("forceT") || q.has("forceShock") || q.has("forceConfirmed"))) return cur;
    state.forced = true;
    var c = Object.assign({}, cur), qd = q.get("forceQuadrant");
    c.spy = Object.assign({}, cur.spy); c.tlt = Object.assign({}, cur.tlt); c.shock = Object.assign({}, cur.shock);
    if (q.has("forceS")) { c.spy.score = +q.get("forceS"); c.spy.reliable = true; var ls = labelFor(CFG.spyLabels, c.spy.score); c.spy.label = ls.label; c.spy.headline = ls.headline; c.spy.text = ls.text; }
    if (q.has("forceT")) { c.tlt.score = +q.get("forceT"); c.tlt.reliable = true; var lt = labelFor(CFG.tltLabels, c.tlt.score); c.tlt.label = lt.label; c.tlt.headline = lt.label; c.tlt.text = lt.text; }
    if (qd) { c.quadrant = qd === "FTQ_UNCONF" ? "FTQ" : qd; c.ftqUnconfirmed = qd === "FTQ_UNCONF"; }
    else { var k = S.quadrant(c.spy.score, c.tlt.score, c.rho, CFG); c.quadrant = k.key; c.ftqUnconfirmed = k.unconfirmed; }
    if (q.get("forceShock") === "growth") c.shock.type = "Growth scare";
    if (q.get("forceShock") === "inflation") c.shock.type = "Inflation/rates shock";
    if (q.get("forceConfirmed") === "1") c.spy.confirmed = true;
    return c;
  }

  /* ---------------------------------------------------------------- generated summary text (spec 12.4) */
  function checkWording(text) {
    var bad = [];
    CFG.summary.bannedWords.forEach(function (w) { if (new RegExp("\\b" + w + "\\b", "i").test(text)) bad.push(w); });
    if (bad.length && window.console) console.warn("[dashboard] banned word(s) " + bad.join(", ") + " in generated text: " + text);
    return text;
  }
  function fill(t, o) { return t.replace(/\{(\w+)\}/g, function (m, k) { return o[k] === undefined ? m : o[k]; }); }
  function top(items, statuses, kind, max) {
    return items.filter(function (it) { return it.loaded && statuses.indexOf(it.status) >= 0; })
      .sort(function (a, b) { return b.weight - a.weight; }).slice(0, max)
      .map(function (it) { return lowerFirst(CFG.plain[kind][it.key].name); });
  }
  function scoreAgo(H, kind, k) {
    var i = H.res.length - 1 - k; if (i < 0) return null;
    return H.res[i][kind].score;
  }

  function buildSummary(H, cur) {
    var T = CFG.summary, out = { headline: "", lines: [] };
    out.headline = checkWording(T.headline[quadKeyOf(cur)]);
    // stock-risk sentence
    var s = cur.spy, t = cur.tlt, line;
    if (s.score === null || !s.reliable) line = T.unreliable;
    else {
      var d = top(s.items, ["ALERT"], "spy", 2), txt;
      if (d.length) txt = fill(T.spyDrivers, { list: joinList(d) });
      else { d = top(s.items, ["WATCH"], "spy", 2); txt = d.length ? fill(T.spyWatchDrivers, { list: joinList(d) }) : T.spyNone; }
      line = fill(T.spyLine, { label: plainLabel("spy", s.score), score: s.score, drivers: txt });
    }
    out.lines.push(checkWording(line));
    // treasury sentence
    if (t.score === null || !t.reliable) line = T.unreliable;
    else {
      var drv = t.score <= 45 ? top(t.items, ["RED"], "tlt", 2) : top(t.items, ["GREEN"], "tlt", 2), tx;
      if (drv.length) tx = fill(t.score <= 45 ? T.tltHeldBack : T.tltDrivers, { list: joinList(drv) });
      else tx = T.tltNone;
      line = fill(T.tltLine, { label: plainLabel("tlt", t.score), score: t.score, drivers: tx });
    }
    out.lines.push(checkWording(line));
    // optional sentences
    if (s.confirmed) out.lines.push(checkWording(T.confirmed));
    if (cur.shock.type === "Inflation/rates shock") out.lines.push(checkWording(T.shockInflation));
    else if (cur.shock.type === "Growth scare") out.lines.push(checkWording(T.shockGrowth));
    var sm = scoreAgo(H, "spy", 21), tm = scoreAgo(H, "tlt", 21);
    if (!state.forced) {
      if (sm !== null && s.score !== null && Math.abs(s.score - sm) >= T.jumpPoints) out.lines.push(checkWording(fill(s.score > sm ? T.jumpUp : T.jumpDown, { n: Math.abs(s.score - sm) })));
      if (tm !== null && t.score !== null && Math.abs(t.score - tm) >= T.jumpPoints) out.lines.push(checkWording(fill(t.score > tm ? T.tltJumpUp : T.tltJumpDown, { n: Math.abs(t.score - tm) })));
    }
    return out;
  }

  /* ---------------------------------------------------------------- "What changed recently" (spec 12.7) */
  function buildChanges(H) {
    var n = H.res.length, w = CFG.summary.changeWindowDays, items = [];
    var iNow = n - 1, iOld = Math.max(0, n - 1 - w), now = H.res[iNow], old = H.res[iOld];
    ["spy", "tlt"].forEach(function (kind) {
      now[kind].items.forEach(function (it, idx) {
        var o = old[kind].items[idx];
        if (!it.loaded || !o.loaded || o.status === it.status) return;
        var j = iNow;                                        // find the first date it held its current status
        while (j > iOld && H.res[j - 1][kind].items[idx].loaded && H.res[j - 1][kind].items[idx].status === it.status) j--;
        var P = CFG.plainStatus, name = CFG.plain[kind][it.key].name;
        items.push({ date: H.res[j].asOf, html: '<strong>' + esc(name) + '</strong>: moved from <span class="st-' + o.status + '">' + P[o.status] + '</span> to <span class="st-' + it.status + '">' + P[it.status] + '</span> (' + esc(it.value) + ').' });
      });
    });
    var prevQ = quadKeyOf(old), curQ = quadKeyOf(now);
    if (prevQ !== curQ) {
      var k = iNow; while (k > iOld && quadKeyOf(H.res[k - 1]) === curQ) k--;
      items.push({ date: H.res[k].asOf, html: 'Regime moved from ‘' + esc(CFG.joint.quadrants[prevQ].label) + '’ to ‘' + esc(CFG.joint.quadrants[curQ].label) + '’ on ' + fmtMonDay(H.res[k].asOf) + '.' });
    }
    items.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return items;
  }

  /* ---------------------------------------------------------------- quadrant (SVG): one drawing function for inline + expanded */
  var QUAD_COLORS = {
    FTQ: "rgba(46,204,113,0.16)", NOHEDGE: "rgba(231,76,60,0.16)", BONDRALLY: "rgba(93,173,226,0.14)", RISKON: "rgba(154,168,189,0.12)"
  };
  var AVG_OVER = 30, AVG_N = 5;       // trails longer than 30 days show non-overlapping 5-day averages
  function trailPoints(H, trailDays) {
    var n = H.res.length, trail = H.res.slice(Math.max(0, n - 1 - trailDays), n);
    var pts = trail.filter(function (r) { return r.spy.score !== null && r.tlt.score !== null; });
    if (trailDays <= AVG_OVER) return pts;
    var out = [];
    for (var end = pts.length; end > 0; end -= AVG_N) {            // buckets end on the newest day
      var grp = pts.slice(Math.max(0, end - AVG_N), end), last = grp[grp.length - 1], sS = 0, sT = 0;
      grp.forEach(function (r) { sS += r.spy.score; sT += r.tlt.score; });
      var aS = Math.round(sS / grp.length * 10) / 10, aT = Math.round(sT / grp.length * 10) / 10;
      var q = S.quadrant(aS, aT, last.rho, CFG);
      out.unshift({ asOf: last.asOf, from: grp[0].asOf, avg: grp.length, spy: { score: aS }, tlt: { score: aT }, rho: last.rho, shock: last.shock, quadrant: q.key, ftqUnconfirmed: q.unconfirmed });
    }
    return out;
  }

  /* opts: { size (px, expanded: square), trailDays, detail } -> { svg, pts, geom } */
  function renderQuad(H, opts) {
    opts = opts || {};
    var cur = state.cur, J = CFG.joint, detail = !!opts.detail;
    var W = detail ? opts.size : 420, HT = detail ? opts.size : 410;
    var X0 = detail ? 62 : 54, X1 = W - (detail ? 22 : 16), Y0 = detail ? 26 : 18, Y1 = HT - (detail ? 66 : 42);
    var fq = detail ? 16 : 12, ft = detail ? 13 : 11, fa = detail ? 14 : 12;
    function px(t) { return X0 + (X1 - X0) * Math.max(0, Math.min(100, t)) / 100; }
    function py(s) { return Y1 - (Y1 - Y0) * Math.max(0, Math.min(100, s)) / 100; }
    var tx = px(J.tltHigh - 0.5), sy = py(J.spyHigh - 0.5);
    var cells = {
      FTQ:       { x: tx, y: Y0, w: X1 - tx, h: sy - Y0, name: "Flight to quality", ax: X1 - 8, ay: Y0 + fq + 6, anchor: "end" },
      NOHEDGE:   { x: X0, y: Y0, w: tx - X0, h: sy - Y0, name: "Duration won't hedge", ax: X0 + 8, ay: Y0 + fq + 6, anchor: "start" },
      BONDRALLY: { x: tx, y: sy, w: X1 - tx, h: Y1 - sy, name: "Bond rally, stocks OK", ax: X1 - 8, ay: Y1 - 10, anchor: "end" },
      RISKON:    { x: X0, y: sy, w: tx - X0, h: Y1 - sy, name: "Risk-on / rates pressure", ax: X0 + 8, ay: Y1 - 10, anchor: "start" }
    };
    var vb = detail ? 'width="' + W + '" height="' + HT + '" viewBox="0 0 ' + W + " " + HT + '"' : 'viewBox="0 0 ' + W + " " + HT + '"';
    var svg = '<svg class="quad" ' + vb + ' role="img" aria-label="Regime map: stock risk score against Treasury score" style="font-family:inherit' + (detail ? ";width:" + W + "px;height:" + HT + "px;max-width:none" : "") + '">';
    var ns = detail ? ' vector-effect="non-scaling-stroke"' : "";
    Object.keys(cells).forEach(function (k) {
      var c = cells[k], on = cur.quadrant === k;
      svg += '<rect x="' + c.x + '" y="' + c.y + '" width="' + c.w + '" height="' + c.h + '" fill="' + QUAD_COLORS[k] + '"' + (on ? ' stroke="#e8edf6" stroke-width="2.5"' : ' stroke="#253149" stroke-width="1"') + ns + '/>';
    });
    if (detail) {                                              // gridlines every 10 + threshold lines
      for (var g = 0; g <= 100; g += 10) {
        svg += '<line x1="' + px(g) + '" y1="' + Y0 + '" x2="' + px(g) + '" y2="' + Y1 + '" stroke="#253149" stroke-width="1"' + ns + '/>';
        svg += '<line x1="' + X0 + '" y1="' + py(g) + '" x2="' + X1 + '" y2="' + py(g) + '" stroke="#253149" stroke-width="1"' + ns + '/>';
      }
      svg += '<line x1="' + tx + '" y1="' + Y0 + '" x2="' + tx + '" y2="' + Y1 + '" stroke="#c8d2e1" stroke-width="1.5" stroke-dasharray="6 4"' + ns + '/>';
      svg += '<line x1="' + X0 + '" y1="' + sy + '" x2="' + X1 + '" y2="' + sy + '" stroke="#c8d2e1" stroke-width="1.5" stroke-dasharray="6 4"' + ns + '/>';
      svg += '<text x="' + (tx + 4) + '" y="' + (Y1 - 4) + '" font-size="12" fill="#c8d2e1">46</text>';
      svg += '<text x="' + (X0 + 4) + '" y="' + (sy - 4) + '" font-size="12" fill="#c8d2e1">46</text>';
    }
    Object.keys(cells).forEach(function (k) {
      var c = cells[k], on = cur.quadrant === k;
      svg += '<text x="' + c.ax + '" y="' + c.ay + '" text-anchor="' + c.anchor + '" font-size="' + fq + '" font-weight="' + (on ? 800 : 600) + '" fill="' + (on ? "#ffffff" : "#9aa8bd") + '">' + c.name + '</text>';
    });
    var ticks = detail ? [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] : [0, 25, 50, 75, 100];
    ticks.forEach(function (v) {
      svg += '<text x="' + px(v) + '" y="' + (Y1 + ft + 6) + '" text-anchor="middle" font-size="' + ft + '" fill="#9aa8bd">' + v + '</text>';
      svg += '<text x="' + (X0 - 8) + '" y="' + (py(v) + 4) + '" text-anchor="end" font-size="' + ft + '" fill="#9aa8bd">' + v + '</text>';
    });
    svg += '<text x="' + ((X0 + X1) / 2) + '" y="' + (HT - (detail ? 10 : 6)) + '" text-anchor="middle" font-size="' + fa + '" fill="#c8d2e1">Treasury setup score (T): higher = more favorable →</text>';
    svg += '<text transform="translate(' + (detail ? 16 : 12) + " " + ((Y0 + Y1) / 2) + ') rotate(-90)" text-anchor="middle" font-size="' + fa + '" fill="#c8d2e1">Stock risk score (S): higher = riskier →</text>';

    // trail (oldest -> newest)
    var pts = trailPoints(H, opts.trailDays || DC.trailDays), geom = [];
    if (pts.length > 1) {
      var path = pts.map(function (r) { return px(r.tlt.score).toFixed(1) + "," + py(r.spy.score).toFixed(1); }).join(" ");
      svg += '<polyline points="' + path + '" fill="none" stroke="#9aa8bd" stroke-opacity="0.45" stroke-width="1.2"' + ns + '/>';
      pts.forEach(function (r, i) {
        var x = px(r.tlt.score), y = py(r.spy.score);
        geom.push({ x: x, y: y, r: r });
        if (i === pts.length - 1) return;
        var a = 0.2 + 0.6 * i / pts.length;
        svg += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (detail ? 3.2 : 2.6) + '" fill="#c8d2e1" fill-opacity="' + a.toFixed(2) + '">' + (detail ? "" : "<title>" + r.asOf + ": S " + r.spy.score + ", T " + r.tlt.score + "</title>") + "</circle>";
      });
      var f = pts[0];
      svg += '<text x="' + (px(f.tlt.score) + 6) + '" y="' + (py(f.spy.score) - 6) + '" font-size="' + (detail ? 12 : 10) + '" fill="#9aa8bd">' + (opts.trailDays || DC.trailDays) + 'd ago</text>';
      if (detail) {
        // month labels at the first trail point of each month, skipping any within 18px of the previous
        var lastLabel = null, crossYear = parts(pts[0].asOf).y !== parts(pts[pts.length - 1].asOf).y, prevMonth = null;
        pts.forEach(function (r, i) {
          var p = parts(r.asOf), mk = p.y * 12 + p.m;
          if (mk === prevMonth) return; prevMonth = mk;
          if (i === 0) return;
          var gx = geom[i].x, gy = geom[i].y;
          if (lastLabel && Math.abs(gx - lastLabel.x) < 18 && Math.abs(gy - lastLabel.y) < 18) return;
          lastLabel = { x: gx, y: gy };
          svg += '<text x="' + (gx + 5) + '" y="' + (gy + 14) + '" font-size="11" fill="#b5c1d4">' + (crossYear ? fmtMonYY(r.asOf) : MON[p.m]) + '</text>';
        });
        // arrowhead on the last segment
        var a1 = geom[geom.length - 2], a2 = geom[geom.length - 1], dx = a2.x - a1.x, dy = a2.y - a1.y, len = Math.sqrt(dx * dx + dy * dy);
        if (len > 1) {
          var ux = dx / len, uy = dy / len, bx = a2.x - ux * 12, by = a2.y - uy * 12;
          svg += '<polygon points="' + (a2.x - ux * 9).toFixed(1) + "," + (a2.y - uy * 9).toFixed(1) + " " + (bx - uy * 5).toFixed(1) + "," + (by + ux * 5).toFixed(1) + " " + (bx + uy * 5).toFixed(1) + "," + (by - ux * 5).toFixed(1) + '" fill="#e8edf6"/>';
        }
      }
    }
    if (cur.spy.score !== null && cur.tlt.score !== null) {
      var cx = px(cur.tlt.score), cy = py(cur.spy.score);
      geom.push({ x: cx, y: cy, r: cur, today: true });
      svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (detail ? 9 : 8) + '" fill="#ffffff" stroke="#0b1020" stroke-width="2">' + (detail ? "" : "<title>Today: S " + cur.spy.score + ", T " + cur.tlt.score + "</title>") + "</circle>";
      if (detail) {
        var label = "Today · S " + cur.spy.score + " · T " + cur.tlt.score, lw = label.length * 7.4 + 8;
        var lx = cx + 14, anchor = "start"; if (lx + lw > X1) { lx = cx - 14; anchor = "end"; }
        var ly = cy - 14; if (ly < Y0 + 14) ly = cy + 26;
        svg += '<text x="' + lx + '" y="' + ly + '" text-anchor="' + anchor + '" font-size="14" font-weight="700" fill="#ffffff" paint-order="stroke" stroke="#0b1020" stroke-width="3">' + label + '</text>';
      }
    }
    if (detail) svg += '<circle id="qring" r="9" fill="none" stroke="#f1c40f" stroke-width="2.5" style="display:none"/>';
    svg += "</svg>";
    return { svg: svg, geom: geom };
  }

  /* inline quadrants: any element with a data-quad attribute is filled by renderInlineQuads */
  var quadMounts = [];
  function mountQuad(el) {
    el.innerHTML = '<div class="quadbox" title="Click to enlarge"><button class="expand" type="button" aria-label="Expand regime chart" title="Expand">⤢</button><div class="quadsvg"></div></div>';
    var box = el.firstChild, btn = box.querySelector(".expand");
    btn.addEventListener("click", function (e) { e.stopPropagation(); openQuadModal(btn); });
    box.addEventListener("click", function () { openQuadModal(btn); });
    quadMounts.push(el);
  }
  function renderInlineQuads() {
    quadMounts.forEach(function (el) { el.querySelector(".quadsvg").innerHTML = renderQuad(state.H, { trailDays: DC.trailDays, detail: false }).svg; });
  }

  /* expanded view */
  var modal = null, modalOpener = null, resizeTimer = null;
  function buildModal() {
    var bd = document.createElement("div"); bd.className = "qbackdrop";
    bd.innerHTML =
      '<div class="qdialog" role="dialog" aria-modal="true" aria-labelledby="qtitle">' +
        '<div class="qhead"><h2 id="qtitle">Regime map</h2>' +
        '<div class="seg" role="group" aria-label="Trail length in trading days" id="qtrail"></div>' +
        '<button class="qclose" type="button" aria-label="Close">✕</button></div>' +
        '<div class="qbody"><div id="qsvgwrap"></div><div class="qtip" id="qtip"></div></div>' +
      '</div>';
    document.body.appendChild(bd);
    modal = { bd: bd, dlg: bd.querySelector(".qdialog"), body: bd.querySelector(".qbody"), wrap: bd.querySelector("#qsvgwrap"), tip: bd.querySelector("#qtip"), geom: [] };
    bd.addEventListener("mousedown", function (e) { if (e.target === bd) closeQuadModal(); });
    bd.querySelector(".qclose").addEventListener("click", closeQuadModal);
    var tr = bd.querySelector("#qtrail");
    DC.trailOptions.forEach(function (n) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = n; b.setAttribute("data-n", n);
      b.addEventListener("click", function () { state.trail = n; lsSet(KEY_TRAIL, String(n)); drawModal(); });
      tr.appendChild(b);
    });
    document.addEventListener("keydown", function (e) {
      if (!bd.classList.contains("open")) return;
      if (e.key === "Escape") { e.preventDefault(); closeQuadModal(); return; }
      if (e.key === "Tab") {                                     // keep focus inside the dialog
        var f = bd.querySelectorAll("button"); if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    window.addEventListener("resize", function () {
      if (!bd.classList.contains("open")) return;
      clearTimeout(resizeTimer); resizeTimer = setTimeout(drawModal, 150);
    });
    var svgHost = modal.wrap;
    function nearest(e) {
      var r = svgHost.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null, bd2 = 100;
      modal.geom.forEach(function (g) { var d = (g.x - x) * (g.x - x) + (g.y - y) * (g.y - y); if (d <= bd2 && (best === null || d < best.d)) best = { g: g, d: d }; });
      return best && best.g;
    }
    function tip(e) {
      var g = nearest(e), ring = svgHost.querySelector("#qring");
      if (!g) { modal.tip.style.display = "none"; if (ring) ring.style.display = "none"; return; }
      var r = g.r, hb = modal.body.getBoundingClientRect(), sb = svgHost.getBoundingClientRect();
      modal.tip.innerHTML = "<strong>" + (g.today ? "Today · " : "") + (r.avg ? "5-day average, " + fmtMonDay(r.from) + " to " + fmtFull(r.asOf) : fmtFull(r.asOf)) + "</strong><br>S (stock risk) " + r.spy.score + " · T (Treasury) " + r.tlt.score +
        "<br>" + esc(quadName(r)) + "<br>Shock: " + esc(r.shock.type) + "<br>Correlation (63d): " + (r.rho === null ? "n/a" : r.rho.toFixed(2));
      modal.tip.style.display = "block";
      var left = g.x + (sb.left - hb.left) + 14, topPx = g.y + (sb.top - hb.top) + 14;
      if (left + modal.tip.offsetWidth > hb.width - 4) left = g.x + (sb.left - hb.left) - modal.tip.offsetWidth - 14;
      if (topPx + modal.tip.offsetHeight > hb.height - 4) topPx = g.y + (sb.top - hb.top) - modal.tip.offsetHeight - 14;
      modal.tip.style.left = Math.max(4, left) + "px"; modal.tip.style.top = Math.max(4, topPx) + "px";
      if (ring) { ring.setAttribute("cx", g.x); ring.setAttribute("cy", g.y); ring.style.display = ""; }
    }
    svgHost.addEventListener("pointermove", tip);
    svgHost.addEventListener("pointerdown", tip);
    svgHost.addEventListener("pointerleave", function () { modal.tip.style.display = "none"; var r = svgHost.querySelector("#qring"); if (r) r.style.display = "none"; });
  }
  function drawModal() {
    if (!modal || !state.H) return;
    modal.bd.querySelectorAll("#qtrail button").forEach(function (b) { b.setAttribute("aria-pressed", String(+b.getAttribute("data-n") === state.trail)); });
    var bw = modal.body.clientWidth - 12, bh = window.innerHeight * 0.96 - (modal.dlg.querySelector(".qhead").offsetHeight || 56) - 14;
    var size = Math.max(280, Math.floor(Math.min(bw, bh)));
    var q = renderQuad(state.H, { size: size, trailDays: state.trail, detail: true });
    modal.wrap.innerHTML = q.svg; modal.geom = q.geom;
    var cur = state.cur;
    $("qtitle").textContent = "Regime map: " + quadName(cur);
  }
  function openQuadModal(opener) {
    if (!state.H) return;
    if (!modal) buildModal();
    modalOpener = opener || null;
    modal.bd.classList.add("open"); document.body.style.overflow = "hidden";
    drawModal();
    modal.bd.querySelector(".qclose").focus();
  }
  function closeQuadModal() {
    if (!modal) return;
    modal.bd.classList.remove("open"); modal.tip.style.display = "none"; document.body.style.overflow = "";
    if (modalOpener && modalOpener.focus) modalOpener.focus();
  }

  /* ---------------------------------------------------------------- charts + shared time-range selector */
  var charts = { scores: null, prices: null, rho: null };
  var shadePlugin = {
    id: "shade",
    beforeDatasetsDraw: function (chart, args, opts) {
      var ctx = chart.ctx, a = chart.chartArea, x = chart.scales.x, y = chart.scales.y;
      (opts.bands || []).forEach(function (b) {
        var x0 = Math.max(a.left, x.getPixelForValue(b.a)), x1 = Math.min(a.right, x.getPixelForValue(b.b));
        if (x1 > x0) { ctx.fillStyle = b.color; ctx.fillRect(x0, a.top, x1 - x0, a.bottom - a.top); }
      });
      (opts.hlines || []).forEach(function (h) {
        var yy = y.getPixelForValue(h.y);
        if (yy < a.top || yy > a.bottom) return;
        ctx.save(); ctx.strokeStyle = h.color || "#9aa8bd"; ctx.setLineDash(h.dash || [5, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a.left, yy); ctx.lineTo(a.right, yy); ctx.stroke(); ctx.restore();
      });
    }
  };

  function bandsFrom(flags, nums, color) {
    var out = [], start = null;
    for (var i = 0; i < flags.length; i++) {
      if (flags[i] && start === null) start = nums[i];
      if ((!flags[i] || i === flags.length - 1) && start !== null) { out.push({ a: start, b: flags[i] ? nums[i] : nums[i - 1], color: color }); start = null; }
    }
    return out;
  }
  function recessionBands(D, loNum, hiNum) {
    var out = [];
    (D.series.USREC || []).forEach(function (r) {
      if (+r[1] !== 1) return;
      var a = S.dayNum(r[0]), p = r[0].split("-"), b = Math.round(Date.UTC(+p[0], +p[1], 1) / 86400000);
      if (b < loNum || a > hiNum) return;
      if (out.length && out[out.length - 1].b >= a) out[out.length - 1].b = b; else out.push({ a: a, b: b, color: "rgba(154,168,189,0.22)" });
    });
    return out;
  }

  var rangeInfo = { lo: 0, hi: 0, startIdx: 0 };
  function monthsOf(r) { return { "3M": 3, "6M": 6, "1Y": 12, "2Y": 24, "3Y": 36 }[r] || 36; }
  function computeRange() {
    var H = state.H, hi = H.nums[H.nums.length - 1], d = new Date(hi * 86400000);
    var lo = Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - monthsOf(state.range), d.getUTCDate()) / 86400000);
    var idx = 0; while (idx < H.nums.length - 1 && H.nums[idx] < lo) idx++;
    rangeInfo = { lo: H.nums[idx], hi: hi, startIdx: idx };
  }

  function xScale() {
    return {
      type: "linear", min: 0, max: 1,
      grid: { color: "rgba(37,49,73,0.6)" },
      ticks: { color: "#9aa8bd", maxRotation: 0, font: { size: 12 },
        callback: function (v) { return (monthsOf(state.range) <= 6) ? fmtMonDay(S.dayStr(v)) : fmtMonYY(S.dayStr(v)); } },
      afterBuildTicks: function (scale) {
        var lo = rangeInfo.lo, hi = rangeInfo.hi, span = hi - lo, ticks = [];
        var maxTicks = Math.max(3, Math.floor(scale.chart.width / 78));
        if (monthsOf(state.range) <= 6) {
          var step = Math.max(14, Math.ceil(span / maxTicks / 7) * 7);
          for (var v = hi; v >= lo; v -= step) ticks.unshift({ value: v });
        } else {
          var stepM = 1; while (stepM < 12 && (span / 30.4 / stepM) > maxTicks) stepM = stepM === 1 ? 2 : (stepM === 2 ? 3 : (stepM === 3 ? 6 : 12));
          var d0 = new Date(lo * 86400000), y = d0.getUTCFullYear(), m0 = d0.getUTCMonth();
          for (var k = 0; k < 80; k++) {
            var mv = Math.round(Date.UTC(y, m0 + 1 + k * stepM, 1) / 86400000);
            if (mv > hi) break; if (mv >= lo) ticks.push({ value: mv });
          }
        }
        scale.ticks = ticks;
      }
    };
  }

  function pricesRebased(D, H) {
    var out = {}, i0 = rangeInfo.startIdx, baseDate = null;
    ["SPY", "TLT"].forEach(function (tk) {
      var rows = (D.prices && D.prices[tk]) || [], map = {}; rows.forEach(function (r) { map[r[0]] = r[1]; });
      var base0 = null, bi = -1;
      for (var i = i0; i < H.dates.length - 1; i++) if (map[H.dates[i]] !== undefined) { base0 = map[H.dates[i]]; bi = i; break; }
      if (tk === "SPY" && bi >= 0) baseDate = H.dates[bi];
      var data = [];
      for (var j = i0; j < H.dates.length; j++) data.push({ x: H.nums[j], y: (map[H.dates[j]] !== undefined && base0) ? map[H.dates[j]] / base0 * 100 : null });
      out[tk] = data;
    });
    out.baseDate = baseDate || H.dates[i0];
    return out;
  }

  function shadeSets() {
    var H = state.H, nums = H.nums;
    var ftqC = H.res.map(function (r) { return r.quadrant === "FTQ" && !r.ftqUnconfirmed; });
    var ftqU = H.res.map(function (r) { return r.quadrant === "FTQ" && r.ftqUnconfirmed; });
    var rec = recessionBands(state.D, nums[0], nums[nums.length - 1]);
    return { rec: rec, bands: rec.concat(bandsFrom(ftqU, nums, "rgba(46,204,113,0.10)")).concat(bandsFrom(ftqC, nums, "rgba(46,204,113,0.24)")) };
  }

  function buildCharts() {
    var H = state.H, D = state.D;
    ["scores", "prices", "rho"].forEach(function (k) { if (charts[k]) { charts[k].destroy(); charts[k] = null; } });
    if (!window.Chart) return;
    computeRange();
    var sh = shadeSets();
    var base = { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false }, elements: { point: { radius: 0 }, line: { borderWidth: 2 } } };
    function tip(unit) { return { callbacks: { title: function (items) { return S.dayStr(items[0].parsed.x); }, label: function (c) { return c.dataset.label + ": " + (c.parsed.y === null ? "n/a" : c.parsed.y.toFixed(unit)); } } }; }
    var yGrid = { grid: { color: "rgba(37,49,73,0.6)" }, ticks: { color: "#9aa8bd", font: { size: 12 } } };
    var el;
    if ((el = $("chScores"))) {
      charts.scores = new Chart(el, {
        type: "line",
        data: { datasets: [
          { label: "Stock risk score (S)", data: H.res.map(function (r, i) { return { x: H.nums[i], y: r.spy.score }; }), borderColor: "#e8734f", backgroundColor: "#e8734f", spanGaps: false },
          { label: "Treasury setup score (T)", data: H.res.map(function (r, i) { return { x: H.nums[i], y: r.tlt.score }; }), borderColor: "#5dade2", backgroundColor: "#5dade2", spanGaps: false }
        ] },
        options: Object.assign({}, base, { scales: { x: xScale(), y: Object.assign({ min: 0, max: 100 }, yGrid) },
          plugins: { legend: { labels: { color: "#c8d2e1" } }, tooltip: tip(0), shade: { bands: sh.bands, hlines: [{ y: CFG.joint.spyHigh, color: "#c8d2e1" }] } } }),
        plugins: [shadePlugin]
      });
    }
    if ((el = $("chPrices"))) {
      var pr = pricesRebased(D, H);
      charts.prices = new Chart(el, {
        type: "line",
        data: { datasets: [
          { label: "SPY (S&P 500 fund)", data: pr.SPY, borderColor: "#e8734f", backgroundColor: "#e8734f", spanGaps: false },
          { label: "TLT (long-term Treasury fund)", data: pr.TLT, borderColor: "#5dade2", backgroundColor: "#5dade2", spanGaps: false }
        ] },
        options: Object.assign({}, base, { scales: { x: xScale(), y: Object.assign({}, yGrid) },
          plugins: { legend: { labels: { color: "#c8d2e1" } }, tooltip: tip(1), shade: { bands: sh.bands, hlines: [{ y: 100, color: "#5b6b86" }] } } }),
        plugins: [shadePlugin]
      });
    }
    if ((el = $("chRho"))) {
      charts.rho = new Chart(el, {
        type: "line",
        data: { datasets: [{ label: "63-day correlation", data: H.res.map(function (r, i) { return { x: H.nums[i], y: r.rho }; }), borderColor: "#c8d2e1", backgroundColor: "#c8d2e1", spanGaps: false }] },
        options: Object.assign({}, base, { scales: { x: xScale(), y: Object.assign({ min: -1, max: 1 }, yGrid) },
          plugins: { legend: { display: false }, tooltip: tip(2), shade: { bands: sh.bands, hlines: [{ y: 0, color: "#e8edf6", dash: [] }, { y: CFG.joint.corrUnconfirmed, color: "#f39c12" }] } } }),
        plugins: [shadePlugin]
      });
    }
    applyRange(true);
  }

  function legendHtml() {
    var sh = shadeSets(), vis = sh.rec.some(function (b) { return b.b >= rangeInfo.lo && b.a <= rangeInfo.hi; });
    return '<span><i style="background:rgba(46,204,113,0.45)"></i>Flight to quality</span><span><i style="background:rgba(46,204,113,0.2)"></i>Flight to quality, unconfirmed</span>' +
      (vis ? '<span><i style="background:rgba(154,168,189,0.4)"></i>NBER recession</span>' : "");
  }

  /* change the visible window of all charts in place (no score recomputation) */
  function applyRange(initial) {
    if (!state.H) return;
    computeRange();
    var H = state.H, lo = rangeInfo.lo, hi = rangeInfo.hi;
    Object.keys(charts).forEach(function (k) {
      var c = charts[k]; if (!c) return;
      c.options.scales.x.min = lo; c.options.scales.x.max = hi;
    });
    if (charts.prices) {
      var pr = pricesRebased(state.D, H);
      charts.prices.data.datasets[0].data = pr.SPY; charts.prices.data.datasets[1].data = pr.TLT;
      var t = $("priceTitle"); if (t) t.innerHTML = 'SPY and TLT prices (total return ' + gl("totalreturn") + ', rebased to 100 on ' + fmtFull(pr.baseDate) + ')' + gl("rebased");
    }
    Object.keys(charts).forEach(function (k) { if (charts[k]) charts[k].update("none"); });
    var lg = legendHtml();
    ["legendScores", "legendPrices"].forEach(function (id) { var e = $(id); if (e) e.innerHTML = lg; });
    document.querySelectorAll("[data-rangegroup]").forEach(function (g) {
      g.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-r") === state.range)); });
    });
  }
  function setRange(r) { state.range = r; lsSet(KEY_RANGE, r); applyRange(); }

  function mountRangeSelector(el) {
    el.setAttribute("role", "group"); el.setAttribute("aria-label", "Chart time range"); el.setAttribute("data-rangegroup", "1"); el.className = "seg";
    el.innerHTML = DC.ranges.map(function (r) { return '<button type="button" data-r="' + r + '" aria-pressed="' + (r === state.range) + '">' + r + "</button>"; }).join("");
    el.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) setRange(b.getAttribute("data-r")); });
  }

  /* ---------------------------------------------------------------- shared score pieces */
  var RING = { "Clear": "#7f93b0", "Watch": "#f1c40f", "Elevated": "#e8873a", "High risk": "#e74c3c" };
  function arrowFor(now, then) {
    if (now === null || then === null) return "";
    var d = now - then; if (d === 0) return '<span class="arrow-flat">▬ 0</span>';
    return d > 0 ? '<span class="arrow-up">▲ ' + d + "</span>" : '<span class="arrow-down">▼ ' + Math.abs(d) + "</span>";
  }
  function priorHtml(H, kind) {
    var now = state.cur[kind].score, w = scoreAgo(H, kind, 5), m = scoreAgo(H, kind, 21);
    function part(label, v) { return v === null ? "" : label + ": " + v + " " + arrowFor(now, v); }
    return [part("1 week ago", w), part("1 month ago", m)].filter(Boolean).join(" · ");
  }

  /* ---------------------------------------------------------------- refresh (spec 11.1) */
  var refreshing = false;
  function setNote(text, cls, runUrl) {
    var n = $("refreshNote"); if (!n) return;
    n.className = "refreshnote" + (cls ? " " + cls : "");
    n.innerHTML = esc(text || "") + (runUrl ? ' <a href="' + esc(runUrl) + '" target="_blank" rel="noopener">View run</a>' : "");
  }
  function setBtn(text, disabled) { var b = $("refreshBtn"); if (!b) return; b.textContent = text; b.disabled = !!disabled; }
  function getToken() { var t = lsGet(KEY_TOKEN); return t || memToken; }
  function saveToken(t) { if (!lsSet(KEY_TOKEN, t)) memToken = t; }
  function forgetToken() { lsDel(KEY_TOKEN); memToken = null; syncForget(); }
  function syncForget() { var f = $("forgetTok"); if (f) f.style.display = (isPublished() && getToken()) ? "" : "none"; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function tokenDialog() {
    return new Promise(function (resolve) {
      var gh = DC.github;
      var bd = document.createElement("div"); bd.className = "qbackdrop open";
      bd.innerHTML = '<div class="qdialog" role="dialog" aria-modal="true" aria-labelledby="tkt" style="width:min(92vw,560px)"><div class="qhead"><h2 id="tkt">GitHub token needed</h2></div><div class="qbody" style="padding:14px 16px">' +
        '<p style="margin-top:0">To refresh, this page asks GitHub to run the data update, and GitHub needs a one-time token that is stored only in this browser.</p>' +
        '<p>Create one at <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a> with these settings:</p>' +
        '<ul><li>Repository access: <strong>Only select repositories</strong> → <code>' + esc(gh.owner + "/" + gh.repo) + '</code></li><li>Permissions → Repository → <strong>Actions: Read and write</strong> (nothing else)</li><li>Expiration: 90 days</li></ul>' +
        '<label for="tkin" class="small">Paste the token here</label><br><input id="tkin" type="password" autocomplete="off" spellcheck="false" style="width:100%;margin:6px 0 12px;padding:10px;border-radius:10px;border:1px solid #40506e;background:#0c1424;color:#e8edf6;font:inherit">' +
        '<div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" id="tkcancel">Cancel</button><button type="button" id="tksave" style="border-color:#5dade2">Save and run</button></div></div></div>';
      document.body.appendChild(bd);
      var inp = bd.querySelector("#tkin"); inp.focus();
      function done(v) { bd.remove(); resolve(v); }
      bd.querySelector("#tkcancel").addEventListener("click", function () { done(null); });
      bd.querySelector("#tksave").addEventListener("click", function () { var v = inp.value.trim(); done(v || null); });
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { var v = inp.value.trim(); done(v || null); } if (e.key === "Escape") done(null); });
    });
  }

  function ghFetch(path, opts) {
    var gh = DC.github, tok = getToken();
    opts = opts || {};
    return fetch("https://api.github.com/repos/" + gh.owner + "/" + gh.repo + path, {
      method: opts.method || "GET",
      headers: { "Authorization": "Bearer " + tok, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
  }
  function authFail() {
    forgetToken();
    setNote("GitHub rejected the token (expired or missing Actions permission). Click Refresh to enter a new one.", "err");
  }
  function flash(html) { state.flash = html; renderBanners(state.D); }

  async function refreshPublished() {
    var gh = DC.github, start = Date.now(), LIMIT = 10 * 60 * 1000;
    if (!getToken()) {
      var t = await tokenDialog(); if (!t) return;
      saveToken(t); syncForget();
    }
    state.flash = ""; renderBanners(state.D);
    var oldGen = state.D ? state.D.generated : "", clickedAt = new Date(), runUrl = null;
    setBtn("Queued…", true); setNote("");
    var r = await ghFetch("/actions/workflows/" + gh.workflow + "/dispatches", { method: "POST", body: { ref: gh.branch } });
    if (r.status === 401 || r.status === 403) return authFail();
    if (r.status === 404) { setNote("Workflow not found. Check dashboard.github in config.js.", "err"); return; }
    if (r.status !== 204) { setNote("GitHub returned an unexpected response (" + r.status + ").", "err"); return; }

    // find the run
    var run = null, found = Date.now();
    while (!run && Date.now() - found < 60000) {
      await sleep(5000);
      var lr = await ghFetch("/actions/workflows/" + gh.workflow + "/runs?event=workflow_dispatch&per_page=5");
      if (lr.status === 401 || lr.status === 403) return authFail();
      if (lr.status === 404) { setNote("Workflow not found. Check dashboard.github in config.js.", "err"); return; }
      if (lr.ok) {
        var j = await lr.json();
        (j.workflow_runs || []).some(function (w) { if (new Date(w.created_at).getTime() >= clickedAt.getTime() - 10000) { run = w; return true; } return false; });
      }
    }
    if (!run) { setNote("Update is taking longer than expected. Check the run on GitHub.", "err", "https://github.com/" + gh.owner + "/" + gh.repo + "/actions"); return; }
    runUrl = run.html_url; setNote("", "", runUrl);

    // follow the run
    for (;;) {
      if (Date.now() - start > LIMIT) { setNote("Update is taking longer than expected. Check the run on GitHub.", "err", runUrl); return; }
      var pr = await ghFetch("/actions/runs/" + run.id);
      if (pr.status === 401 || pr.status === 403) return authFail();
      if (pr.ok) {
        run = await pr.json();
        if (run.status === "completed") break;
        setBtn(run.status === "queued" || run.status === "waiting" || run.status === "pending" ? "Queued…" : "Updating data…", true);
      }
      await sleep(10000);
    }
    if (run.conclusion !== "success") {
      flash('<div class="banner red">The data update failed on GitHub. <a href="' + esc(runUrl) + '" target="_blank" rel="noopener">View run</a></div>');
      setNote("", "", runUrl); return;
    }

    // publishing: wait for Pages to serve newer data
    setBtn("Publishing…", true);
    var pubStart = Date.now();
    for (;;) {
      var got = await reloadData(true);
      if (got && state.D.generated > oldGen) { setNote("Updated " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), "ok", runUrl); setTimeout(function () { setNote(""); }, 10000); return; }
      if (Date.now() - start > LIMIT) { setNote("Update is taking longer than expected. Check the run on GitHub.", "err", runUrl); return; }
      if (Date.now() - pubStart > 5 * 60 * 1000) { setNote("Update ran but no new data was published.", "err", runUrl); return; }
      await sleep(15000);
    }
  }

  async function reloadData(onlyIfNewer) {
    var prevD = state.D;
    var D = await loadScript("market-data.js", "MARKET_DATA");
    if ($("btBody")) await loadScript("backtest/summary.js", "BACKTEST_SUMMARY");
    if (!D) return false;
    if (onlyIfNewer && prevD && D.generated <= prevD.generated) { return true; }
    renderAll();
    return true;
  }

  async function onRefreshClick() {
    if (refreshing) return;
    refreshing = true;
    try {
      if (isPublished()) await refreshPublished();
      else {
        setBtn("Refreshing…", true);
        await reloadData(false);
      }
    } catch (e) {
      setNote("Refresh failed: " + (e && e.message ? e.message : e), "err");
      if (window.console) console.error(e);
    } finally {
      refreshing = false; setBtn("Refresh data", false); syncForget();
    }
  }

  function initRefresh() {
    var b = $("refreshBtn"); if (!b) return;
    b.addEventListener("click", onRefreshClick);
    if (!isPublished()) b.title = "Reloads the local file. To fetch new data locally, run 'Update Market Data.bat'.";
    var f = $("forgetTok"); if (f) f.addEventListener("click", function () { forgetToken(); setNote("GitHub token forgotten.", ""); });
    syncForget();
  }

  /* ---------------------------------------------------------------- indicator cards (shared) */
  function indicatorCard(it, kind, opts) {
    opts = opts || {};
    var P = CFG.plain[kind][it.key], g = GL_FOR[kind][it.key];
    var h = '<div class="indicator"><div class="row"><div><div class="name">' + esc(it.name) + (g ? gl(g) : "") + ' <span class="small">(' + it.weight + ' pts)</span></div>' +
      (P ? '<div class="plainname">' + esc(P.name) + "</div>" : "") + '</div>' +
      '<span class="pill ' + (it.loaded ? it.status : "NA") + '">' + (it.loaded ? esc(it.status) : "NO DATA") + "</span></div>" +
      '<div class="value">' + (it.loaded ? esc(it.value) : "Unavailable") + "</div>" +
      '<div class="delta">' + (it.loaded ? esc(it.trend) + " · " + it.date : "Excluded from the score until data loads.") + "</div>";
    if (it.loaded && P) h += '<div class="now"><strong>What this means now:</strong> ' + esc(P.now[it.status]) + "</div>";
    h += '<div class="meaning">' + esc(P ? P.meaning : it.meaning) + "</div></div>";
    return h;
  }

  /* ---------------------------------------------------------------- render orchestration */
  function updateHeader() {
    var a = $("asOfBig");
    if (a && state.H) a.textContent = "Data as of " + fmtLong(state.H.last);
    var df = $("dataFile");
    if (df && state.D) df.textContent = "Data file: " + new Date(state.D.generated).toLocaleString() + (state.D.priceSource ? " · prices: " + state.D.priceSource : "");
  }

  function renderAll() {
    var D = window.MARKET_DATA || null;
    state.D = D;
    renderBanners(D);
    if (!D) { if (state.pageRender) state.pageRender(state); return; }
    state.H = computeHistory(D);
    state.cur = applyForce(state.H.res[state.H.res.length - 1]);
    updateHeader();
    renderInlineQuads();
    buildCharts();
    if (state.pageRender) state.pageRender(state);
    if (modal && modal.bd.classList.contains("open")) drawModal();     // keep the dialog open with the new data
    document.querySelectorAll("[data-rangegroup]").forEach(function (g) { g.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-r") === state.range)); }); });
  }

  function start(opts) {
    state.pageRender = opts.render;
    var r = lsGet(KEY_RANGE); if (r && DC.ranges.indexOf(r) >= 0) state.range = r;
    var tr = +lsGet(KEY_TRAIL); if (tr && DC.trailOptions.indexOf(tr) >= 0) state.trail = tr;
    initGlossary(); initRefresh();
    document.querySelectorAll("[data-quad]").forEach(mountQuad);
    document.querySelectorAll("[data-range]").forEach(mountRangeSelector);
    document.querySelectorAll("[data-gl]").forEach(function (el) { el.insertAdjacentHTML("beforeend", gl(el.getAttribute("data-gl"))); });
    try { renderAll(); } catch (e) { $("banners").innerHTML = '<div class="banner red">Dashboard error: ' + esc(e.message) + "</div>"; if (window.console) console.error(e); }
  }

  window.Dash = {
    CFG: CFG, S: S, state: state, start: start, $: $, esc: esc, gl: gl, fmtSigned: fmtSigned, fmtLong: fmtLong, fmtMonDay: fmtMonDay,
    plainLabel: plainLabel, quadKeyOf: quadKeyOf, quadName: quadName, buildSummary: buildSummary, buildChanges: buildChanges,
    indicatorCard: indicatorCard, priorHtml: priorHtml, RING: RING, checkWording: checkWording
  };
})();
