/* ===== Signatures: pre/post sweep comparison and resonance shift =====
   A signature sweep is a low level sine run before and after each qualification run. If the structure is unchanged, every
   resonance stays at the same frequency and amplitude. This tab matches the transmissibility peaks of a reference sweep to
   the peaks of later sweeps, channel by channel, and reports the frequency shift against the acceptance limit (5 % by default). */
const sessionIndex = t => P.sessions.findIndex(s => s.id === t.sessionId);
const inCampaignMode = () => UI.treeMode === 'campaign' && typeof activeCampaign === 'function' && !!activeCampaign();
function sigCandidates(axis) {
  const pool = inCampaignMode() ? campaignTests(activeCampaign(), UI.showHidden) : P.tests;
  return pool.filter(t => t.axis === axis && specFileOf(t)?.kind === 'sine' && (UI.showHidden || (!t.hidden && !sessionOf(t)?.hidden))).sort((a, b) => sessDate(a).localeCompare(sessDate(b)) || sessionIndex(a) - sessionIndex(b) || (a.run ?? 999) - (b.run ?? 999) || (a.created || 0) - (b.created || 0));
}
/* Before / after pairing. A signature sweep right before a qualification run (random, sine, shock) is its "before", the first sweep after it is its
   "after". Worked out from the run order of the axis in the test's own session, so it needs no manual linking. */
const isSigTest = q => specFileOf(q)?.kind === 'sine' && (q.kind === 'sig' || q.kind === 'lowsine' || q.kind === 'sinesurvey');
const isLoadTest = q => !isSigTest(q) && testFiles(q).some(f => ['sine', 'psd', 'srs', 'time'].includes(f.kind));
function axisRunList(t) { return testsOfSession(t.sessionId).filter(q => q.axis === t.axis && (!q.hidden || q.id === t.id)).sort(byRun); }
function loadPair(t) { // the sweeps around a qualification run
  if (!t || !isLoadTest(t)) return null; const list = axisRunList(t); const i = list.indexOf(t);
  const before = list.slice(0, i).reverse().find(isSigTest), after = list.slice(i + 1).find(isSigTest);
  return before && after ? { before, after, load: t } : null;
}
function sigPairOf(t) { // the pair a signature sweep belongs to
  if (!t || !isSigTest(t)) return null; const list = axisRunList(t); const i = list.indexOf(t);
  const prev = list.slice(0, i).reverse().find(q => isSigTest(q) || isLoadTest(q)), next = list.slice(i + 1).find(q => isSigTest(q) || isLoadTest(q));
  if (prev && isLoadTest(prev)) { const p = loadPair(prev); if (p && p.after === t) return p; }
  if (next && isLoadTest(next)) { const p = loadPair(next); if (p && p.before === t) return p; }
  return null;
}
function sigPairsOf(cands) { const out = []; for (const t of cands) { const p = sigPairOf(t); if (p && p.before === t && cands.includes(p.after)) out.push(p); } return out; }
function sigContext(t) { const p = sigPairOf(t); if (!p) return ''; return (p.before === t ? 'before ' : 'after ') + treeLabel(p.load); }
function sigLabel(t, withSession = true) {
  if (inCampaignMode()) { const c = sigContext(t); return `${t.run != null ? '#' + t.run + ' ' : ''}${t.kind === 'sig' ? 'Signature' : t.name}${c ? ' · ' + c : ''}`; }
  const s = sessionOf(t); return `${withSession ? (s?.name || '') + ' · ' : ''}${t.name}${t.run != null ? ' #' + t.run : ''}`;
}
function openSigPair(p) { UI.sig = { axis: p.before.axis, ref: p.before.id, cmps: [p.after.id], chans: (UI.sig && UI.sig.chans) || 'drive', chan: null, allAxes: false }; UI.tab = 'signatures'; render(); const v = $('#view'); if (v) v.scrollTop = 0; }
function matchPeaks(ref, cmp, win) {
  // all candidate pairs within the window, closest first; each peak used once
  const cand = [];
  ref.forEach((p, i) => cmp.forEach((q, j) => { const d = Math.abs(Math.log(q.f / p.f)); if (d <= Math.log(1 + win)) cand.push({ i, j, d }); }));
  cand.sort((a, b) => a.d - b.d);
  // a pair counts only when each peak is the other's nearest peak: a peak that dropped under the threshold must not be paired with a
  // different peak further away (that would report a shift that never happened)
  const nearest = (p, list) => list.reduce((best, q, k) => { const d = Math.abs(Math.log(q.f / p.f)); return d < best.d ? { k, d } : best; }, { k: -1, d: Infinity }).k;
  const ui = new Set(), uj = new Set(), out = [];
  for (const c of cand) { if (ui.has(c.i) || uj.has(c.j)) continue; if (nearest(ref[c.i], cmp) !== c.j || nearest(cmp[c.j], ref) !== c.i) continue; ui.add(c.i); uj.add(c.j); out.push({ ref: ref[c.i], cmp: cmp[c.j] }); }
  ref.forEach((p, i) => { if (!ui.has(i)) out.push({ ref: p, cmp: null }); });
  cmp.forEach((q, j) => { if (!uj.has(j)) out.push({ ref: null, cmp: q }); });
  return out.sort((a, b) => (a.ref || a.cmp).f - (b.ref || b.cmp).f);
}
const SIG_CACHE = new Map();
function sigAnalysis(refT, cmpTests, o) {
  const sp = P.profiles.signature; const thr = o.thr ?? sp.peakThreshold, win = (o.win ?? sp.matchWindowPct) / 100, lim = o.lim ?? sp.shiftLimitPct, ampLim = sp.ampLimitDb, minT = sp.shiftMinT ?? 4;
  const key = [refT.id, cmpTests.map(t => t.id).join(','), thr, win, lim, ampLim, minT].join('|');
  if (SIG_CACHE.has(key)) return SIG_CACHE.get(key);
  const fr = specFileOf(refT); const refSess = sessionOf(refT); const ctlR = controlCol(fr); const lfR = lfCheck(refT);
  const chans = withAxis(refT.axis, () => responseCols(fr).map(c => { const info = chInfo(refSess, c.ch); const drive = info.sensor ? driveAxisOf(refSess, info.sensor, refT, lfR) : null; const chk = info.sensor ? lfR?.sensors.get(info.sensor.id) : null; return { ch: c.ch, col: c, info, axis: info.axis, sensor: info.sensor, isDrive: !!(drive && info.axis === drive), label: colLabel(refSess, c), color: colStyle(refSess, c).color, dash: colStyle(refSess, c).dash, flagged: !!(chk && ['noisy', 'high', 'low'].includes(chk.status)) }; }));
  // peaks are searched down to half the threshold so a peak that only dropped below the threshold still pairs with itself; pairs where both stay under the threshold are dropped
  const peaksOf = (f, c, lo, hi) => { const ctl = controlCol(f); if (!ctl || !c) return { tr: null, peaks: [] }; const tr = ratioSeries(f.x, c.data, ctl.data); return { tr, peaks: findPeaks(f.x, tr, thr / 2, 24, lo).filter(p => p.f <= hi) }; };
  const out = { ref: refT, cmps: cmpTests, thr, win, lim, ampLim, rows: [] };
  for (const ch of chans) {
    const row = { ...ch, per: [] };
    for (const t of cmpTests) {
      const fc = specFileOf(t); const cc = fc.cols.find(q => q.ch === ch.ch && q.role === 'response');
      const lo = Math.max(fr.x[0], fc.x[0]) * 1.03, hi = Math.min(fr.x[fr.x.length - 1], fc.x[fc.x.length - 1]) * 0.995;
      const R = peaksOf(fr, ch.col, lo, hi), C = peaksOf(fc, cc, lo, hi);
      // a pair that moved beyond the limit is only a shift if the 'after' peak was not already there before at its own frequency (and the 'before' peak
      // is not still there after): otherwise one peak faded and a neighbouring one remained, which is not a frequency shift
      const valAt = (x, y, f) => { let k = 0; for (let i = 1; i < x.length; i++) if (Math.abs(x[i] - f) < Math.abs(x[k] - f)) k = i; return y?.[k] ?? 0; };
      const split = [];
      for (const pr of (cc ? matchPeaks(R.peaks, C.peaks, win) : [])) {
        if (pr.ref && pr.cmp && Math.abs(pr.cmp.f / pr.ref.f - 1) * 100 > lim && (valAt(fr.x, R.tr, pr.cmp.f) >= 0.7 * pr.cmp.v || valAt(fc.x, C.tr, pr.ref.f) >= 0.7 * pr.ref.v)) { split.push({ ref: pr.ref, cmp: null }, { ref: null, cmp: pr.cmp }); }
        else split.push(pr);
      }
      const pairs = cc ? split.sort((a, b) => (a.ref || a.cmp).f - (b.ref || b.cmp).f).filter(pr => Math.max(pr.ref?.v || 0, pr.cmp?.v || 0) >= thr).map(pr => {
        const shift = pr.ref && pr.cmp ? (pr.cmp.f - pr.ref.f) / pr.ref.f * 100 : null; const db = pr.ref && pr.cmp ? 20 * Math.log10(pr.cmp.v / pr.ref.v) : null;
        // peaks that stay under the minimum transmissibility in both sweeps are near the noise: listed, not judged
        const top = Math.max(pr.ref?.v || 0, pr.cmp?.v || 0); const low = top < minT;
        const status = low ? 'low' : !pr.ref ? 'new' : !pr.cmp ? 'lost' : Math.abs(shift) > lim ? 'shift' : Math.abs(db) > ampLim ? 'amp' : 'ok';
        return { ...pr, shift, db, status };
      }) : [];
      const matched = pairs.filter(p => p.ref && p.cmp && p.status !== 'low');
      const worst = matched.length ? matched.reduce((a, b) => Math.abs(b.shift) > Math.abs(a.shift) ? b : a) : null;
      const status = !cc ? 'nochan' : pairs.some(p => p.status === 'shift') ? 'shift' : pairs.some(p => p.status === 'lost' || p.status === 'new') ? 'changed' : pairs.some(p => p.status === 'amp') ? 'amp' : matched.length ? 'ok' : 'nopeaks';
      row.per.push({ test: t, col: cc, trRef: R.tr, trCmp: C.tr, xRef: fr.x, xCmp: fc.x, pairs, worst, status, nLost: pairs.filter(p => p.status === 'lost').length, nNew: pairs.filter(p => p.status === 'new').length });
    }
    out.rows.push(row);
  }
  SIG_CACHE.set(key, out); if (SIG_CACHE.size > 40) SIG_CACHE.delete(SIG_CACHE.keys().next().value);
  return out;
}
const SIG_STATUS = { low: ['', 'Low peaks only'], ok: ['good', 'OK'], amp: ['warn', 'Amplitude'], changed: ['warn', 'Peak lost/new'], shift: ['bad', 'Shift'], nopeaks: ['', 'No peaks'], nochan: ['', 'No channel'] };
function renderSignatures(v) {
  const S = UI.sig || (UI.sig = { axis: 'X', ref: null, cmps: [], chans: 'drive', chan: null, allAxes: false });
  const axes = AXES.filter(a => sigCandidates(a).length); if (!axes.includes(S.axis)) S.axis = axes[0] || 'X';
  const cands = sigCandidates(S.axis);
  if (!cands.some(t => t.id === S.ref)) { const act = activeSession(); const inAct = cands.filter(t => t.sessionId === act?.id); const sigs = inAct.filter(t => t.kind === 'sig'); S.ref = (sigs[0] || inAct[0] || cands[0])?.id || null; S.cmps = []; }
  const ref = cands.find(t => t.id === S.ref);
  if (ref && !S.cmps.length) { const pp = sigPairOf(ref); if (pp && pp.before === ref && cands.includes(pp.after)) S.cmps = [pp.after.id]; }
  if (ref && !S.cmps.length) S.cmps = cands.filter(t => t.id !== ref.id && t.sessionId === ref.sessionId && t.kind === ref.kind && (t.run ?? 0) > (ref.run ?? -1)).map(t => t.id);
  S.cmps = S.cmps.filter(id => cands.some(t => t.id === id && id !== S.ref));
  const cmps = S.cmps.map(id => cands.find(t => t.id === id)).filter(Boolean);
  const sp = P.profiles.signature;
  let html = `<div class="section-h"><h2>Signature comparison</h2><span class="sub">Resonance shift between low level sweeps, before and after each qualification run</span></div>`;
  html += `<div class="card" style="margin-bottom:14px"><div class="card-b"><div class="row" style="gap:14px;align-items:flex-start">
    <div><div class="small muted" style="margin-bottom:4px">Axis</div><div class="seg">${axes.map(a => `<button data-sax="${a}" class="${a === S.axis ? 'active' : ''}">${a}</button>`).join('')}</div></div>
    ${sigPairsOf(cands).length ? `<div style="min-width:240px;flex:1"><div class="small muted" style="margin-bottom:4px">Before / after a run</div><select class="input small" id="sg-pair" style="width:100%"><option value="">Pick a run…</option>${sigPairsOf(cands).map((p, i) => `<option value="${i}" ${p.before.id === S.ref && S.cmps.length === 1 && S.cmps[0] === p.after.id ? 'selected' : ''}>${esc(treeLabel(p.load))}${p.load.run != null ? ' #' + p.load.run : ''}: sweep ${p.before.run ?? '?'} vs ${p.after.run ?? '?'}${inCampaignMode() ? '' : ' · ' + esc(shortDate(sessDate(p.load)) || sessionOf(p.load)?.name || '')}</option>`).join('')}</select></div>` : ''}
    <div style="min-width:260px;flex:1"><div class="small muted" style="margin-bottom:4px">Reference sweep</div><select class="input small" id="sg-ref" style="width:100%">${cands.map(t => `<option value="${t.id}" ${t.id === S.ref ? 'selected' : ''}>${esc(sigLabel(t))}</option>`).join('')}</select></div>
    <div style="min-width:260px;flex:1"><div class="small muted" style="margin-bottom:4px">Compare with</div><div style="max-height:150px;overflow:auto;border:1px solid var(--line);border-radius:6px;padding:4px 8px">${cands.filter(t => t.id !== S.ref).map(t => `<label class="chk small" style="display:flex;padding:1px 0"><input type="checkbox" data-scmp="${t.id}" ${S.cmps.includes(t.id) ? 'checked' : ''}> ${esc(sigLabel(t))}</label>`).join('') || '<span class="small muted">No other sweep in this axis</span>'}</div></div>
    <div><div class="small muted" style="margin-bottom:4px">Channels</div><div class="seg"><button data-sch="drive" class="${S.chans === 'drive' ? 'active' : ''}">Drive channels</button><button data-sch="all" class="${S.chans === 'all' ? 'active' : ''}">All</button></div></div>
    <div><div class="small muted" style="margin-bottom:4px">Limits</div><div class="row small">shift ±<input class="input small" type="number" step="any" id="sg-lim" value="${sp.shiftLimitPct}" style="width:56px"> % · amplitude ±<input class="input small" type="number" step="any" id="sg-amp" value="${sp.ampLimitDb}" style="width:56px"> dB · peaks above <input class="input small" type="number" step="any" id="sg-thr" value="${sp.peakThreshold}" style="width:56px">× · match within ±<input class="input small" type="number" id="sg-win" value="${sp.matchWindowPct}" style="width:56px"> % · judge peaks from <input class="input small" type="number" step="any" id="sg-mint" value="${sp.shiftMinT ?? 4}" style="width:56px">× up</div></div>
  </div></div></div>`;
  if (!ref || !cmps.length) { html += `<div class="empty">Pick a reference sweep and at least one sweep to compare with. Sweeps of the same axis from any session are listed; a signature is matched against the earlier one by default.</div>`; v.innerHTML = html; bindSig(v, S); return; }
  const A = sigAnalysis(ref, cmps, {});
  const rows = A.rows.filter(r => S.chans === 'all' || r.isDrive || !r.sensor);
  if (!rows.some(r => r.ch === S.chan)) S.chan = (rows.find(r => r.per.some(p => p.status === 'shift')) || rows[0])?.ch ?? null;
  // summary table
  const nBad = rows.filter(r => r.per.some(p => p.status === 'shift')).length, nWarn = rows.filter(r => !r.per.some(p => p.status === 'shift') && r.per.some(p => p.status === 'changed' || p.status === 'amp')).length;
  html += `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Resonance shift per channel</h3><span class="hint">Worst matched peak per channel versus the reference. ${nBad ? `<span class="pill bad">${nBad} over ${A.lim} %</span>` : '<span class="pill good">all within ' + A.lim + ' %</span>'}${nWarn ? ` <span class="pill warn">${nWarn} with lost, new or amplitude changes</span>` : ''}</span><button class="btn small" id="sg-copy">Copy TSV</button></div><div class="card-b tbl-wrap"><table class="tbl" id="sg-table"><thead><tr><th>Sensor</th><th>Axis</th><th>Ch</th><th class="num">Ref peaks</th>${cmps.map(t => `<th colspan="3" style="text-align:center">${esc(sigLabel(t, t.sessionId !== ref.sessionId))}</th>`).join('')}</tr><tr><th></th><th></th><th></th><th></th>${cmps.map(() => '<th class="num">Worst shift</th><th class="num">At (Hz)</th><th>Status</th>').join('')}</tr></thead><tbody>`;
  for (const r of rows) {
    const nRef = r.per[0]?.pairs.filter(p => p.ref).length ?? 0;
    html += `<tr data-sgch="${r.ch}" class="${r.ch === S.chan ? 'sel' : ''}" style="cursor:pointer"><td><span class="sw" style="background:${r.color}"></span>${esc(r.sensor ? sensorLabel(r.sensor) : 'ch' + r.ch)}${r.flagged ? ' <span class="pill bad" title="flagged by the channel check in the reference">noisy</span>' : ''}</td><td>${r.axis || ''}${r.isDrive ? ' <span class="pill good">drive</span>' : ''}</td><td class="mono">${r.ch}</td><td class="num">${nRef}</td>` +
      r.per.map(p => { const [cls, lbl] = SIG_STATUS[p.status]; const w = p.worst; return `<td class="num" style="${w && Math.abs(w.shift) > A.lim ? 'color:var(--bad);font-weight:600' : ''}">${w ? (w.shift > 0 ? '+' : '') + fmt(w.shift, 2) + ' %' : ''}</td><td class="num muted">${w ? fmtF(w.ref.f) + ' → ' + fmtF(w.cmp.f) : ''}</td><td><span class="pill ${cls}" title="${esc(p.pairs.map(q => q.status + (q.ref ? ' ' + fmtF(q.ref.f) + ' Hz' : '') + (q.cmp ? ' → ' + fmtF(q.cmp.f) + ' Hz' : '') + (q.shift != null ? ' (' + fmt(q.shift, 2) + ' %, ' + fmt(q.db, 2) + ' dB)' : '')).join('\n'))}">${lbl}${p.nLost || p.nNew ? ` <span class="small">${p.nLost ? p.nLost + ' lost' : ''}${p.nLost && p.nNew ? ', ' : ''}${p.nNew ? p.nNew + ' new' : ''}</span>` : ''}</span></td>`; }).join('') + '</tr>';
  }
  html += `</tbody></table><div class="small muted" style="margin-top:6px">Peaks are transmissibility maxima above ${A.thr}× in the band both sweeps cover. A pair counts only when each peak is the other's nearest, within ±${A.win * 100} %; peaks under ${P.profiles.signature.shiftMinT ?? 4}× in both sweeps are near the noise and listed as low peaks, not judged. Shift is (f after − f before) ÷ f before. A lost peak means nothing above threshold was found near it; a new peak is one the reference did not have. Click a row to see it in the plot.</div></div></div>`;
  // overlay plot + peak table for the selected channel
  const sel = rows.find(r => r.ch === S.chan);
  html += `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3 id="sg-ptitle">Overlay</h3><div class="plot-tools"><span class="small muted">Channel</span><select class="input small" id="sg-chan">${rows.map(r => `<option value="${r.ch}" ${r.ch === S.chan ? 'selected' : ''}>${esc((r.sensor ? sensorLabel(r.sensor) : 'ch' + r.ch) + ' ' + (r.axis || '') + ' (ch' + r.ch + ')')}</option>`).join('')}</select><label class="chk small"><input type="checkbox" id="sg-allax" ${S.allAxes ? 'checked' : ''}> all three axes of this sensor</label></div></div><div class="plotbox tall"><div class="plot" id="p-sig"></div></div></div>`;
  html += `<div class="card"><div class="card-h"><h3>Peaks for the selected channel</h3></div><div class="card-b tbl-wrap" id="sg-peaks"></div></div>`;
  v.innerHTML = html; bindSig(v, S);
  $('#sg-chan').onchange = e => { S.chan = +e.target.value; $$('tr[data-sgch]', v).forEach(tr => tr.classList.toggle('sel', +tr.dataset.sgch === S.chan)); drawSig(A, rows, S); };
  $('#sg-allax').onchange = e => { S.allAxes = e.target.checked; drawSig(A, rows, S); };
  $$('tr[data-sgch]', v).forEach(tr => tr.onclick = () => { S.chan = +tr.dataset.sgch; $('#sg-chan').value = S.chan; $$('tr[data-sgch]', v).forEach(q => q.classList.toggle('sel', q === tr)); drawSig(A, rows, S); });
  $('#sg-copy').onclick = () => copyTable($('#sg-table'));
  drawSig(A, rows, S); makeResizableTables(v);
}
function bindSig(v, S) {
  const ps = $('#sg-pair', v); if (ps) ps.onchange = () => { const p = sigPairsOf(sigCandidates(S.axis))[+ps.value]; if (p) { S.ref = p.before.id; S.cmps = [p.after.id]; render(); } };
  $$('[data-sax]', v).forEach(b => b.onclick = () => { S.axis = b.dataset.sax; S.ref = null; S.cmps = []; render(); });
  const r = $('#sg-ref'); if (r) r.onchange = e => { S.ref = e.target.value; S.cmps = []; render(); };
  $$('[data-scmp]', v).forEach(c => c.onchange = () => { S.cmps = $$('[data-scmp]:checked', v).map(x => x.dataset.scmp); render(); });
  $$('[data-sch]', v).forEach(b => b.onclick = () => { S.chans = b.dataset.sch; render(); });
  const sp = P.profiles.signature; const apply = () => { sp.shiftLimitPct = parseFloat($('#sg-lim').value) || 5; sp.ampLimitDb = parseFloat($('#sg-amp').value) || 3; sp.peakThreshold = parseFloat($('#sg-thr').value) || 2; sp.matchWindowPct = parseFloat($('#sg-win').value) || 15; sp.shiftMinT = parseFloat($('#sg-mint').value) || 4; SIG_CACHE.clear(); persist(); render(); };
  ['#sg-lim', '#sg-amp', '#sg-thr', '#sg-win', '#sg-mint'].forEach(id => { const el = $(id); if (el) el.onchange = apply; });
}
function drawSig(A, rows, S) {
  const sel = rows.find(r => r.ch === S.chan); if (!sel) return;
  const palette = ['#444c56', '#1f56d6', '#d9480f', '#2b8a3e', '#9b59b6', '#e0a100', '#0b7285', '#c2255c'];
  const refSess = sessionOf(A.ref); const fr = specFileOf(A.ref);
  const chans = S.allAxes && sel.sensor ? withAxis(A.ref.axis, () => sensorChannels(refSess, sel.sensor).map(({ axis, ch }) => ({ axis, ch }))) : [{ axis: sel.axis, ch: sel.ch }];
  const traces = []; const ann = [];
  const tests = [A.ref, ...A.cmps];
  tests.forEach((t, ti) => {
    const f = specFileOf(t); const ctl = controlCol(f); if (!ctl) return;
    for (const { axis, ch } of chans) {
      const c = f.cols.find(q => q.ch === ch && q.role === 'response'); if (!c) continue;
      const tr = ratioSeries(f.x, c.data, ctl.data);
      traces.push({ x: f.x, y: tr, name: `${sigLabel(t, t.sessionId !== A.ref.sessionId)}${chans.length > 1 ? ' · ' + axis : ''}`, mode: 'lines', line: { color: palette[ti % palette.length], width: ti === 0 ? 2.2 : 1.5, dash: chans.length > 1 ? ({ X: 'solid', Y: 'dash', Z: 'dot' }[axis] || 'solid') : 'solid' }, hovertemplate: '%{y:.3g}× @ %{x:.1f} Hz<extra>' + esc(sigLabel(t, false)) + ' ' + axis + '</extra>' });
    }
  });
  // markers on the selected channel's matched peaks (first comparison)
  const p0 = sel.per[0];
  if (p0) for (const pr of p0.pairs) {
    if (pr.ref) traces.push({ x: [pr.ref.f], y: [pr.ref.v], mode: 'markers', marker: { color: palette[0], size: 9, symbol: 'diamond' }, showlegend: false, hoverinfo: 'skip' });
    if (pr.cmp) traces.push({ x: [pr.cmp.f], y: [pr.cmp.v], mode: 'markers', marker: { color: palette[1], size: 9, symbol: 'diamond' }, showlegend: false, hoverinfo: 'skip' });
    if (pr.ref && pr.cmp) ann.push({ x: Math.log10(pr.cmp.f), y: Math.log10(Math.max(pr.ref.v, pr.cmp.v)), text: `${pr.shift > 0 ? '+' : ''}${fmt(pr.shift, 2)} %`, showarrow: true, arrowhead: 0, ax: 0, ay: -24, font: { size: 10, color: pr.status === 'low' ? '#8a929c' : Math.abs(pr.shift) > A.lim ? '#c62828' : '#1a8a4a' } });
    else if (pr.ref) ann.push({ x: Math.log10(pr.ref.f), y: Math.log10(pr.ref.v), text: pr.status === 'low' ? '' : 'lost', showarrow: true, arrowhead: 0, ax: 0, ay: -24, font: { size: 10, color: '#b26a00' } });
    else ann.push({ x: Math.log10(pr.cmp.f), y: Math.log10(pr.cmp.v), text: pr.status === 'low' ? '' : 'new', showarrow: true, arrowhead: 0, ax: 0, ay: -24, font: { size: 10, color: '#b26a00' } });
  }
  $('#sg-ptitle').textContent = `Transmissibility · ${sel.sensor ? sensorLabel(sel.sensor) : 'ch' + sel.ch} ${sel.axis || ''} (ch${sel.ch}) · reference ${sigLabel(A.ref, false)}`;
  const sh = [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 1, y1: 1, line: { color: plotTheme().fg3, width: 1, dash: 'dot' } }];
  drawPlot('p-sig', traces, baseLayout({ yTitle: 'Transmissibility (×)', xType: 'log', yType: 'log', shapes: sh, annotations: ann, rev: 'sig' + sel.ch, legendRows: Math.ceil(traces.filter(t => t.showlegend !== false).length / 4) }));
  const pk = $('#sg-peaks'); if (!pk) return;
  let h = '';
  sel.per.forEach(p => {
    h += `<div class="small muted" style="margin:${h ? 10 : 0}px 0 4px">${esc(sigLabel(p.test, p.test.sessionId !== A.ref.sessionId))}</div><table class="tbl"><thead><tr><th class="num">Ref f (Hz)</th><th class="num">Ref T (×)</th><th class="num">After f (Hz)</th><th class="num">After T (×)</th><th class="num">Shift</th><th class="num">Amplitude</th><th>Status</th></tr></thead><tbody>` +
      p.pairs.map(q => `<tr><td class="num">${q.ref ? fmtF(q.ref.f) : '–'}</td><td class="num">${q.ref ? fmt(q.ref.v, 3) : '–'}</td><td class="num">${q.cmp ? fmtF(q.cmp.f) : '–'}</td><td class="num">${q.cmp ? fmt(q.cmp.v, 3) : '–'}</td><td class="num" style="${q.status === 'shift' ? 'color:var(--bad);font-weight:600' : ''}">${q.shift != null ? (q.shift > 0 ? '+' : '') + fmt(q.shift, 2) + ' %' : ''}</td><td class="num">${q.db != null ? (q.db > 0 ? '+' : '') + fmt(q.db, 2) + ' dB' : ''}</td><td><span class="pill ${{ ok: 'good', amp: 'warn', lost: 'warn', new: 'warn', shift: 'bad', low: '' }[q.status]}" ${q.status === 'low' ? 'title="Under the minimum transmissibility in both sweeps: near the noise, not judged"' : ''}>${q.status === 'low' ? 'low peak' : q.status}</span></td></tr>`).join('') + '</tbody></table>';
  });
  pk.innerHTML = h || '<div class="small muted">No peaks above threshold on this channel.</div>';
}
