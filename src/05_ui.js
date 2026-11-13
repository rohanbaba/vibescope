/* ===== UI: shell, tree, tabs, views ===== */
function toast(msg, bad = false) { const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg; $('#toasts').appendChild(t); setTimeout(() => t.remove(), bad ? 6000 : 3200); }
function modal(title, bodyHtml, buttons = [], onOpen) {
  $('#modal-title').textContent = title; $('#modal-body').innerHTML = bodyHtml; const mf = $('#modal-foot'); mf.innerHTML = '';
  for (const b of buttons) { const btn = document.createElement('button'); btn.className = 'btn ' + (b.primary ? 'primary' : '') + (b.danger ? ' danger' : ''); btn.textContent = b.label; btn.onclick = () => { if (b.onClick && b.onClick() === false) return; closeModal(); }; mf.appendChild(btn); }
  $('#modal').classList.add('show'); if (onOpen) onOpen($('#modal-body'));
}
function closeModal() { $('#modal').classList.remove('show'); }
function ctxMenu(x, y, items) {
  const m = $('#ctx'); m.innerHTML = '';
  for (const it of items) { if (it === '-') { m.appendChild(document.createElement('hr')); continue; } const b = document.createElement('button'); b.textContent = it.label; if (it.danger) b.className = 'danger'; b.onclick = () => { m.style.display = 'none'; it.onClick(); }; m.appendChild(b); }
  m.style.display = 'block'; const w = m.offsetWidth, h = m.offsetHeight; m.style.left = Math.min(x, innerWidth - w - 8) + 'px'; m.style.top = Math.min(y, innerHeight - h - 8) + 'px';
}
document.addEventListener('click', e => { if (!e.target.closest('#ctx')) $('#ctx').style.display = 'none'; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('#ctx').style.display = 'none'; closeModal(); } });

function activeSession() { return P.sessions.find(s => s.id === UI.sessionId) || P.sessions[0] || null; }
function activeTest() { return P.tests.find(t => t.id === UI.testId) || null; }
function selectTest(id) { UI.testId = id; const t = activeTest(); if (t) UI.sessionId = t.sessionId; UI.tab = 'test'; render(); const v = $('#view'); if (v) v.scrollTop = 0; }
const inEditable = el => !!(el && (el.closest('input, textarea, select, [contenteditable="true"]')));

/* ---------- Tree ----------
   Sessions with their tests in run order (or the order set by dragging). Click opens a test; Ctrl/Cmd-click and Shift-click select several
   for the right-click menu (compare, hide, copy, duplicate, delete). Drag a test onto another one to reorder it within its axis group. */
function renderTree() {
  const tree = $('#tree'); tree.innerHTML = '';
  if (!UI.treeMode) { try { UI.treeMode = localStorage.getItem('vs-treeMode') || 'date'; } catch (e) { UI.treeMode = 'date'; } }
  $$('#sb-mode [data-tm]').forEach(b => { b.classList.toggle('active', b.dataset.tm === UI.treeMode); b.onclick = () => { UI.treeMode = b.dataset.tm; try { localStorage.setItem('vs-treeMode', UI.treeMode); } catch (e) { } render(); }; });
  const gt = $('#sb-group'); if (gt) { gt.checked = groupByType(); gt.onchange = () => { UI.groupType = gt.checked; try { localStorage.setItem('vs-groupType', gt.checked ? '1' : '0'); } catch (e) { } renderTree(); }; }
  if ($('#sb-title')) $('#sb-title').textContent = UI.treeMode === 'campaign' ? 'Campaigns' : 'Sessions';
  if ($('#btn-new-session')) { $('#btn-new-session').textContent = UI.treeMode === 'campaign' ? '+ Campaign' : '+ Session'; $('#btn-new-session').title = UI.treeMode === 'campaign' ? 'New test campaign' : 'New session'; }
  if (UI.treeMode === 'campaign') return renderCampaignTree(tree);
  const hc = $('#sb-hidden-count'), hs = $('#sb-showhidden'); if (hs) { hs.checked = !!UI.showHidden; hs.onchange = e => { UI.showHidden = e.target.checked; render(); }; }
  if (!P.sessions.length) { tree.innerHTML = '<div class="empty small">No sessions yet. Import files or add a session.</div>'; if (hc) hc.textContent = ''; return; }
  let nHidden = P.sessions.filter(s => s.hidden).length;
  for (const s of P.sessions) {
    const all = testsOfSession(s.id); if (!s.hidden) nHidden += all.filter(t => t.hidden).length;
    if (s.hidden && !UI.showHidden && s.id !== UI.sessionId) continue;
    const d = document.createElement('div'); d.className = 'sess' + (s.hidden ? ' is-hidden' : '');
    const ts = visibleTests(all);
    const h = document.createElement('div'); h.className = 'sess-h' + (s.id === UI.sessionId ? ' active' : ''); h.innerHTML = `<span class="caret">${s.collapsed ? '▸' : '▾'}</span><span class="name" title="${esc(s.name)}${s.hidden ? ' (hidden)' : ''}">${esc(s.name)}</span>${s.hidden ? '<span class="pill" title="Hidden session">hidden</span>' : ''}<span class="small muted">${ts.length}</span>`;
    h.onclick = () => { UI.sessionId = s.id; UI.sel.clear(); if (UI.tab === 'test') UI.tab = 'overview'; render(); };
    h.querySelector('.caret').onclick = e => { e.stopPropagation(); s.collapsed = !s.collapsed; renderTree(); };
    h.oncontextmenu = e => { e.preventDefault(); sessionMenu(e.clientX, e.clientY, s); };
    d.appendChild(h);
    if (!s.collapsed) {
      const axes = axisOrder(ts);
      for (const ax of axes) {
        const list = ts.filter(t => t.axis === ax).sort(byRun);
        if (!list.length) continue;
        const g = document.createElement('div'); g.className = 'axis-group'; g.innerHTML = `<div class="ag-h">${esc(ax)} axis</div>`;
        const gh = g.querySelector('.ag-h');
        gh.ondragover = e => { if (e.dataTransfer.types.includes('text/test-ids')) { e.preventDefault(); gh.classList.add('dropover'); } };
        gh.ondragleave = () => gh.classList.remove('dropover');
        gh.ondrop = e => { gh.classList.remove('dropover'); const ids = (e.dataTransfer.getData('text/test-ids') || '').split(',').filter(Boolean); if (ids.length) { e.preventDefault(); reorderTests(ids, list[0].id, true); } };
        appendTyped(g, list, (t, i) => {
          const n = document.createElement('div'); n.className = 'tnode' + (t.id === UI.testId ? ' active' : '') + (t.hidden ? ' is-hidden' : '') + (UI.sel.has(t.id) ? ' sel' : ''); n.dataset.test = t.id; n.draggable = true;
          const fs = testFiles(t); const hasSpec = fs.some(f => ['sine', 'psd', 'srs', 'time'].includes(f.kind));
          n.innerHTML = `<span class="dot ${fs.length ? (hasSpec ? 'has' : 'partial') : ''}"></span><span class="lbl" title="${esc(t.name)}${t.hidden ? ' (hidden)' : ''}">${esc(treeLabel(t))}</span><span class="run">${/repeat/i.test(t.name) ? '↻ ' : ''}${t.run != null ? '#' + t.run : ''}</span>`;
          n.onclick = e => {
            if (e.ctrlKey || e.metaKey) { if (!UI.sel.size && UI.testId && UI.testId !== t.id && list.some(q => q.id === UI.testId)) UI.sel.add(UI.testId); if (UI.sel.has(t.id)) UI.sel.delete(t.id); else UI.sel.add(t.id); UI.selAnchor = t.id; renderTree(); return; }
            if (e.shiftKey && UI.selAnchor) { const a = list.findIndex(q => q.id === UI.selAnchor); if (a >= 0) { const [lo, hi] = [Math.min(a, i), Math.max(a, i)]; for (let k = lo; k <= hi; k++) UI.sel.add(list[k].id); renderTree(); return; } }
            UI.sel.clear(); UI.selAnchor = t.id; selectTest(t.id);
          };
          n.oncontextmenu = e => { e.preventDefault(); if (UI.sel.size > 1 && UI.sel.has(t.id)) multiMenu(e.clientX, e.clientY, [...UI.sel].map(id => P.tests.find(q => q.id === id)).filter(Boolean)); else { if (!UI.sel.has(t.id)) { UI.sel.clear(); renderTree(); } testMenu(e.clientX, e.clientY, t); } };
          n.ondragstart = e => { const ids = UI.sel.has(t.id) && UI.sel.size > 1 ? [...UI.sel].filter(id => list.some(q => q.id === id)) : [t.id]; e.dataTransfer.setData('text/test-ids', ids.join(',')); e.dataTransfer.effectAllowed = 'move'; n.classList.add('dragging'); };
          n.ondragend = () => n.classList.remove('dragging');
          n.ondragover = e => { e.preventDefault(); const r = n.getBoundingClientRect(); const before = e.clientY < r.top + r.height / 2; if (e.dataTransfer.types.includes('text/test-ids')) { n.classList.toggle('dropbefore', before); n.classList.toggle('dropafter', !before); } else n.classList.add('dropover'); };
          n.ondragleave = () => n.classList.remove('dropover', 'dropbefore', 'dropafter');
          n.ondrop = e => { e.preventDefault(); const before = n.classList.contains('dropbefore'); n.classList.remove('dropover', 'dropbefore', 'dropafter');
            const tids = (e.dataTransfer.getData('text/test-ids') || '').split(',').filter(Boolean);
            if (tids.length) { reorderTests(tids, t.id, before); return; }
            const ids = (e.dataTransfer.getData('text/file-ids') || '').split(',').filter(Boolean);
            if (ids.length) { ids.forEach(id => assignFileToTest(id, t.id)); persist(); render(); toast(`${ids.length} file(s) assigned to ${t.name}`); } else if (e.dataTransfer.files?.length) { importFiles(e.dataTransfer.files, t.id); } };
          return n;
        });
        d.appendChild(g);
      }
    }
    tree.appendChild(d);
  }
  if (hc) hc.textContent = nHidden ? `(${nHidden})` : '';
}
/* ---------- Campaigns ----------
   A campaign is a hand-picked list of runs (the ones that count) drawn from any number of sessions. Shown by axis, in date then run order. */
const CAMP_AXES = ['X', 'Y', 'Z'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(d) { if (!d || !/^\d{4}-\d\d-\d\d/.test(d)) return d || ''; const [, m, dd] = d.split('-'); return `${+dd} ${MONTHS[+m - 1]}`; }
const sessDate = t => sessionOf(t)?.date || '';
const byDateRun = (a, b) => sessDate(a).localeCompare(sessDate(b)) || (P.sessions.indexOf(sessionOf(a)) - P.sessions.indexOf(sessionOf(b))) || byRun(a, b);
function campaignsOf() { if (!Array.isArray(P.campaigns)) P.campaigns = []; return P.campaigns; }
function activeCampaign() { const cs = campaignsOf(); return cs.find(c => c.id === UI.campaignId) || cs[0] || null; }
function campaignTests(c, all = false) { const ts = (c?.testIds || []).map(id => P.tests.find(t => t.id === id)).filter(Boolean); return (all ? ts : visibleTests(ts)).sort(byDateRun); }
function addToCampaign(c, ids) { for (const id of ids) if (!c.testIds.includes(id)) c.testIds.push(id); persist(); render(); toast(`${ids.length} test(s) added to ${c.name}`); }
function removeFromCampaign(c, ids) { c.testIds = c.testIds.filter(id => !ids.includes(id)); persist(); render(); }
function newCampaignDialog(ids = []) {
  modal('New test campaign', `<div class="field"><label>Name</label><input class="input" id="m-cname" value="${esc('Test campaign ' + (campaignsOf().length + 1))}"></div><div class="field"><label>Notes</label><textarea class="input" id="m-cnotes" rows="3" placeholder="What the campaign covers, which runs count"></textarea></div><p class="hint">${ids.length ? ids.length + ' selected test(s) will be added. ' : ''}Add more later by right-clicking tests in the By date view.</p>`,
    [{ label: 'Cancel' }, { label: 'Create', primary: true, onClick: () => { const c = { id: uid(), name: $('#m-cname').value.trim() || 'Test campaign', notes: $('#m-cnotes').value.trim(), testIds: [...ids], created: Date.now() }; campaignsOf().push(c); UI.campaignId = c.id; UI.treeMode = 'campaign'; try { localStorage.setItem('vs-treeMode', 'campaign'); } catch (e) { } UI.tab = 'overview'; persist(); render(); } }]);
}
function editCampaignDialog(c) {
  modal('Edit campaign', `<div class="field"><label>Name</label><input class="input" id="m-cname" value="${esc(c.name)}"></div><div class="field"><label>Notes</label><textarea class="input" id="m-cnotes" rows="4">${esc(c.notes || '')}</textarea></div>`,
    [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => { c.name = $('#m-cname').value.trim() || c.name; c.notes = $('#m-cnotes').value.trim(); persist(); render(); } }]);
}
function campaignMenu(x, y, c) {
  ctxMenu(x, y, [
    { label: 'Open overview', onClick: () => { UI.campaignId = c.id; UI.tab = 'overview'; render(); } },
    { label: 'Rename / edit', onClick: () => editCampaignDialog(c) },
    { label: c.collapsed ? 'Expand' : 'Collapse', onClick: () => { c.collapsed = !c.collapsed; renderTree(); } },
    '-',
    { label: 'Delete campaign (tests stay in their sessions)', danger: true, onClick: () => confirmDialog(`Delete campaign "${c.name}"? Its ${c.testIds.length} tests stay in their sessions.`, () => { P.campaigns = campaignsOf().filter(q => q !== c); if (UI.campaignId === c.id) UI.campaignId = null; persist(); render(); }) },
  ]);
}
/* Context menu entries that add a test (or several) to a campaign or take it out */
function campaignMenuItems(tests) {
  const ids = tests.map(t => t.id); const n = ids.length; const items = [];
  for (const c of campaignsOf()) { const inn = ids.filter(id => c.testIds.includes(id)).length; if (inn < n) items.push({ label: `Add ${n > 1 ? n + ' ' : ''}to campaign: ${c.name}`, onClick: () => addToCampaign(c, ids) }); if (inn) items.push({ label: `Remove ${n > 1 ? inn + ' ' : ''}from campaign: ${c.name}`, onClick: () => removeFromCampaign(c, ids) }); }
  items.push({ label: `Add ${n > 1 ? n + ' ' : ''}to a new campaign…`, onClick: () => newCampaignDialog(ids) });
  return items;
}
function renderCampaignTree(tree) {
  const cs = campaignsOf();
  if (!cs.length) { tree.innerHTML = '<div class="empty small">No campaigns yet. A campaign collects the runs that count from any number of test days. Click + Campaign, or right-click tests in the By date view and choose "Add to a new campaign".</div>'; return; }
  const cur = activeCampaign();
  for (const c of cs) {
    const ts = campaignTests(c); const d = document.createElement('div'); d.className = 'sess';
    const h = document.createElement('div'); h.className = 'sess-h' + (c === cur && UI.tab === 'overview' ? ' active' : ''); h.innerHTML = `<span class="caret">${c.collapsed ? '▸' : '▾'}</span><span class="name" title="${esc(c.name)}">${esc(c.name)}</span><span class="small muted">${ts.length}</span>`;
    h.onclick = () => { UI.campaignId = c.id; UI.sel.clear(); UI.tab = 'overview'; render(); };
    h.querySelector('.caret').onclick = e => { e.stopPropagation(); c.collapsed = !c.collapsed; renderTree(); };
    h.oncontextmenu = e => { e.preventDefault(); campaignMenu(e.clientX, e.clientY, c); };
    d.appendChild(h);
    if (!c.collapsed) {
      const dates = [...new Set(ts.map(sessDate))]; if (dates.length) { const nd = document.createElement('div'); nd.className = 'camp-note'; nd.textContent = `${dates.length} test day(s), ${shortDate(dates[0])}${dates.length > 1 ? ' to ' + shortDate(dates[dates.length - 1]) : ''}`; d.appendChild(nd); }
      for (const ax of CAMP_AXES.filter(a => ts.some(t => t.axis === a)).concat([...new Set(ts.map(t => t.axis))].filter(a => !CAMP_AXES.includes(a)))) {
        const list = ts.filter(t => t.axis === ax); if (!list.length) continue;
        const g = document.createElement('div'); g.className = 'axis-group'; g.innerHTML = `<div class="ag-h">${esc(ax)} axis</div>`;
        appendTyped(g, list, (t, i) => {
          const n = document.createElement('div'); n.className = 'tnode' + (t.id === UI.testId && UI.tab === 'test' ? ' active' : '') + (t.hidden ? ' is-hidden' : '') + (UI.sel.has(t.id) ? ' sel' : ''); n.dataset.test = t.id;
          const fs = testFiles(t); const hasSpec = fs.some(f => ['sine', 'psd', 'srs', 'time'].includes(f.kind));
          n.innerHTML = `<span class="dot ${fs.length ? (hasSpec ? 'has' : 'partial') : ''}"></span><span class="lbl" title="${esc(t.name)} · ${esc(sessionOf(t)?.name || '')}">${esc(treeLabel(t))}</span><span class="date">${esc(shortDate(sessDate(t)))}</span><span class="run">${t.run != null ? '#' + t.run : ''}</span>`;
          n.onclick = e => {
            if (e.ctrlKey || e.metaKey) { if (UI.sel.has(t.id)) UI.sel.delete(t.id); else UI.sel.add(t.id); UI.selAnchor = t.id; renderTree(); return; }
            if (e.shiftKey && UI.selAnchor) { const a = list.findIndex(q => q.id === UI.selAnchor); if (a >= 0) { const [lo, hi] = [Math.min(a, i), Math.max(a, i)]; for (let k = lo; k <= hi; k++) UI.sel.add(list[k].id); renderTree(); return; } }
            UI.sel.clear(); UI.selAnchor = t.id; UI.campaignId = c.id; selectTest(t.id);
          };
          n.oncontextmenu = e => { e.preventDefault(); const sel = UI.sel.size > 1 && UI.sel.has(t.id) ? [...UI.sel].map(id => P.tests.find(q => q.id === id)).filter(Boolean) : [t]; if (sel.length > 1) multiMenu(e.clientX, e.clientY, sel); else testMenu(e.clientX, e.clientY, t); };
          return n;
        });
        d.appendChild(g);
      }
      if (!ts.length) { const e = document.createElement('div'); e.className = 'camp-note'; e.textContent = 'Empty. Right-click tests in the By date view to add them.'; d.appendChild(e); }
    }
    tree.appendChild(d);
  }
}
function renderCampaignOverview(v, c) {
  const ts = campaignTests(c); const axes = CAMP_AXES.filter(a => ts.some(t => t.axis === a));
  const dates = [...new Set(ts.map(sessDate))]; const sessions = [...new Set(ts.map(t => sessionOf(t)))].filter(Boolean);
  // signature shift only against the previous sweep of the same axis on the same test day
  const sigs = ts.filter(t => specFileOf(t)?.kind === 'sine' && (t.kind === 'sig' || t.kind === 'lowsine')).map(t => sigShiftOf(t, ts.filter(q => q.sessionId === t.sessionId))).filter(Boolean);
  const worstSig = sigs.length ? sigs.reduce((a, b) => Math.abs(b.worst ?? 0) > Math.abs(a.worst ?? 0) ? b : a) : null; const lim = P.profiles.signature.shiftLimitPct;
  let html = `<div class="section-h"><h2>${esc(c.name)}</h2><span class="sub">Test campaign · ${ts.length} runs from ${dates.length} test day(s)${dates.length ? ', ' + shortDate(dates[0]) + (dates.length > 1 ? ' to ' + shortDate(dates[dates.length - 1]) : '') : ''}</span><span class="spacer" style="flex:1"></span><button class="btn small" id="cv-edit">Edit campaign</button></div>`;
  html += `<div class="kpis"><div class="kpi"><div class="k">Runs</div><div class="v">${ts.length}</div><div class="s">${sessions.map(s => esc(shortDate(s.date))).join(', ')}</div></div>`;
  html += axes.map(a => { const list = ts.filter(t => t.axis === a); const kinds = []; if (list.some(t => kindById(t.kind).type === 'sine' && t.kind === 'sineq')) kinds.push('sine'); if (list.some(t => specFileOf(t)?.kind === 'psd')) kinds.push('random'); if (list.some(t => specFileOf(t)?.kind === 'srs')) kinds.push('shock'); const h = highestLevel(list); return `<div class="kpi"><div class="k">${a} axis</div><div class="v" style="font-size:16px;line-height:1.3;margin-top:6px">${kinds.length ? kinds.join(', ') : '<span class="muted">signatures only</span>'}</div><div class="s">${h ? esc(h.label) : ''}</div></div>`; }).join('');
  html += `<div class="kpi"><div class="k">Worst signature shift</div><div class="v">${worstSig && worstSig.worst != null ? `<span style="color:${Math.abs(worstSig.worst) > lim ? 'var(--bad)' : 'var(--good)'}">${worstSig.worst > 0 ? '+' : ''}${fmt(worstSig.worst, 2)} %</span>` : '<span class="muted">–</span>'}</div><div class="s">${worstSig ? `${worstSig.axis} run ${worstSig.t.run} (${esc(shortDate(sessDate(worstSig.t)))}) vs run ${worstSig.prev.run}` : ''}</div></div></div>`;
  if (c.notes) html += `<div class="card" style="margin-bottom:14px"><div class="card-b small">${esc(c.notes).replace(/\n/g, '<br>')}</div></div>`;
  html += `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Sequence per axis</h3><span class="hint">Date and run order. Click a run to open it.</span></div><div class="card-b stack" style="gap:8px">`;
  for (const a of axes) {
    const list = ts.filter(t => t.axis === a); let prevD = null;
    html += `<div class="row" style="align-items:center;gap:6px;flex-wrap:wrap"><span class="pill axis" style="min-width:52px;justify-content:center">${a} axis</span>${list.map(t => { const d = sessDate(t); const dl = d !== prevD ? `<span class="small muted" style="margin-left:6px">${esc(shortDate(d))}</span>` : ''; prevD = d; const fs = testFiles(t); const has = fs.some(f => ['sine', 'psd', 'srs', 'time'].includes(f.kind)); return `${dl}<span class="runchip ${has ? 'has' : fs.length ? 'partial' : ''}" data-test="${t.id}" title="${esc(t.name)}${t.notes ? '\n' + esc(t.notes.slice(0, 160)) : ''}"><span class="mono">${t.run != null ? '#' + t.run : '·'}</span> ${esc(seqLabel(t))}</span>`; }).join('<span class="muted small">›</span>')}</div>`;
  }
  html += `</div></div>`;
  html += `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Runs in the campaign</h3><span class="hint">Headline numbers per run, by axis and date. Signature shift is against the previous sweep of the same axis on the same day.</span><button class="btn small" id="cv-copy">Copy as TSV</button></div><div class="card-b tbl-wrap">${runTable(axes.flatMap(a => ts.filter(t => t.axis === a)), sigs, true)}</div></div>`;
  const top = topResponses(ts);
  if (top.rand.length || top.sine.length) {
    const tbl = (rows, unit) => rows.length ? `<table class="tbl"><thead><tr><th>Sensor</th><th>Ch</th><th class="num">${unit}</th><th class="num">At (Hz)</th><th>Run</th></tr></thead><tbody>${rows.map(r => `<tr data-test="${r.t.id}" style="cursor:pointer"><td><span class="sw" style="background:${r.r.style.color}"></span>${esc(r.r.sensorName || r.r.label)} ${esc(r.r.axis || '')}</td><td class="mono">${r.r.ch}</td><td class="num">${fmt(r.v)}</td><td class="num">${fmtF(r.r.peakF)}</td><td class="small">${r.t.axis} #${r.t.run ?? ''} · ${esc(shortDate(sessDate(r.t)))}</td></tr>`).join('')}</tbody></table>` : '<div class="small muted">None</div>';
    html += `<div class="grid2"><div class="card"><div class="card-h"><h3>Highest random responses</h3><span class="hint">gRMS, any channel, all random runs in the campaign</span></div><div class="card-b tbl-wrap">${tbl(top.rand, 'gRMS')}</div></div><div class="card"><div class="card-h"><h3>Highest sine responses</h3><span class="hint">Peak g, all sine runs in the campaign</span></div><div class="card-b tbl-wrap">${tbl(top.sine, 'g')}</div></div></div>`;
  }
  v.innerHTML = html;
  $('#cv-edit').onclick = () => editCampaignDialog(c);
  $$('[data-test]', v).forEach(el => el.onclick = () => selectTest(el.dataset.test));
  $('#cv-copy').onclick = () => copyTable(v.querySelector('#ov-runs'));
  makeResizableTables(v);
}
/* Test type of a test for the sub-headings in the left panel: from its kind, or from its data when the kind is custom. */
const TYPE_ORDER = [['sine', 'Sine'], ['random', 'Random'], ['srs', 'SRS'], ['any', 'Other']];
function testTypeOf(t) { const k = kindById(t.kind).type; if (k !== 'any') return k; const f = testFiles(t).find(f => f.kind !== 'report'); return f ? ({ sine: 'sine', psd: 'random', rms: 'random', srs: 'srs', time: 'srs' }[f.kind] || 'any') : 'any'; }
function groupByType() { if (UI.groupType == null) { try { UI.groupType = localStorage.getItem('vs-groupType') !== '0'; } catch (e) { UI.groupType = true; } } return UI.groupType; }
/* Add the tests of one axis to a group element, under Sine / Random / SRS sub-headings when grouping is on (run order inside each). */
function appendTyped(g, list, makeNode) {
  if (!groupByType()) { list.forEach((t, i) => g.appendChild(makeNode(t, i))); return; }
  for (const [ty, label] of TYPE_ORDER) { const sub = list.filter(t => testTypeOf(t) === ty); if (!sub.length) continue; const h = document.createElement('div'); h.className = 'ag-sub'; h.textContent = label; g.appendChild(h); sub.forEach(t => g.appendChild(makeNode(t, list.indexOf(t)))); }
}
/* Put the dragged tests before (or after) the target, inside the target's axis group; the whole group then carries explicit positions. */
function reorderTests(ids, targetId, before = true) {
  const t0 = P.tests.find(t => t.id === targetId); if (!t0) return;
  const group = testsOfSession(t0.sessionId).filter(t => t.axis === t0.axis).sort(byRun);
  const moving = group.filter(t => ids.includes(t.id)); if (!moving.length) { toast('Tests can only be reordered within their own axis group', true); return; }
  if (moving.some(t => t.id === targetId)) return;
  const rest = group.filter(t => !ids.includes(t.id)); let idx = rest.findIndex(t => t.id === targetId); if (idx < 0) return; if (!before) idx++;
  [...rest.slice(0, idx), ...moving, ...rest.slice(idx)].forEach((t, i) => t.order = i);
  persist(); renderTree();
}
function moveTest(t, dir) {
  const group = testsOfSession(t.sessionId).filter(q => q.axis === t.axis).sort(byRun); const i = group.indexOf(t); const j = i + dir;
  if (j < 0 || j >= group.length) return;
  [group[i], group[j]] = [group[j], group[i]]; group.forEach((q, k) => q.order = k); persist(); renderTree();
}
/* Short label for the tree: the kind's short name plus what distinguishes the run (level, notched profile), so the list stays readable. */
function treeLabel(t) {
  const k = kindById(t.kind); let s = t.name;
  if (t.kind === 'sig') s = 'Signature';
  else if (s === k.name) s = k.short;
  const lp = t.profile && t.profile !== 'full' ? libProfile(t.profile) : null;
  if (lp && lp.type === 'random' && k.type === 'random') { const db = testLevelDb(t); s = `${k.short} (${lp.short || 'custom'}${db ? ', ' + db + ' dB' : ''})`; }
  else if (lp && lp.type === 'srs' && k.type === 'srs') s = `SRS ${lp.short || ''}`.trim();
  return s;
}
const testDef = t => ({ axis: t.axis, kind: t.kind, name: t.name, notes: t.notes || '', status: t.status || '', profile: t.profile || 'full', levelDb: t.levelDb ?? null, reportUrl: t.reportUrl });
function copyTests(tests) { UI.clip = tests.map(testDef); toast(`${tests.length} test definition(s) copied. Right-click a session to paste, or Ctrl+V.`); }
function pasteTests(sess) {
  if (!UI.clip.length) { toast('Nothing to paste', true); return; } if (!sess) { toast('No session selected', true); return; }
  for (const d of UI.clip) P.tests.push(Object.assign(newTest(sess.id, d.axis, d.kind, null, d.name), { notes: d.notes, status: d.status, profile: d.profile, levelDb: d.levelDb, reportUrl: d.reportUrl }));
  UI.sessionId = sess.id; persist(); render(); toast(`${UI.clip.length} test(s) pasted into ${sess.name} (definitions only, no data)`);
}
function sessionMenu(x, y, s) {
  ctxMenu(x, y, [
    { label: 'Rename / edit', onClick: () => editSessionDialog(s) },
    { label: s.hidden ? 'Unhide session' : 'Hide session (check runs, faulty sets)', onClick: () => { s.hidden = !s.hidden; if (s.hidden && UI.sessionId === s.id && !UI.showHidden) { const v = visibleSessions(); UI.sessionId = v[0]?.id || s.id; } persist(); render(); } },
    { label: 'Duplicate session (tests, no data)', onClick: () => { const c = JSON.parse(JSON.stringify(s)); c.id = uid(); c.name = s.name + ' (copy)'; P.sessions.push(c); for (const t of testsOfSession(s.id)) { const nt = { ...t, id: uid(), sessionId: c.id, fileIds: [], run: null }; P.tests.push(nt); } persist(); render(); } },
    ...(UI.clip.length ? [{ label: `Paste ${UI.clip.length} test(s) here`, onClick: () => pasteTests(s) }] : []),
    { label: 'Add standard test matrix', onClick: () => { buildStandardMatrix(s.id); persist(); render(); } },
    { label: 'Plan runs…', onClick: () => planRunsDialog(s) },
    { label: 'Save sensors as a template…', onClick: () => saveSensorTemplate(s) },
    { label: 'Reset manual order (back to run order)', onClick: () => { testsOfSession(s.id).forEach(t => t.order = null); persist(); renderTree(); } },
    { label: s.collapsed ? 'Expand' : 'Collapse', onClick: () => { s.collapsed = !s.collapsed; renderTree(); } },
    '-',
    { label: 'Delete session and its tests', danger: true, onClick: () => confirmDialog(`Delete session "${s.name}" with ${testsOfSession(s.id).length} tests? Files stay in the Files tab as unassigned.`, () => { P.tests.filter(t => t.sessionId === s.id).forEach(t => t.fileIds.forEach(id => { const f = P.files.find(f => f.id === id); if (f) f.testId = null; })); P.tests = P.tests.filter(t => t.sessionId !== s.id); P.sessions = P.sessions.filter(q => q.id !== s.id); if (UI.sessionId === s.id) UI.sessionId = P.sessions[0]?.id || null; persist(); render(); }) },
  ]);
}
function testMenu(x, y, t) {
  ctxMenu(x, y, [
    { label: 'Open', onClick: () => selectTest(t.id) },
    { label: 'Rename / edit', onClick: () => editTestDialog(t) },
    { label: t.hidden ? 'Unhide test' : 'Hide test (check run, wrong level, faulty)', onClick: () => { t.hidden = !t.hidden; if (t.hidden && UI.testId === t.id && !UI.showHidden) { UI.testId = null; if (UI.tab === 'test') UI.tab = 'overview'; } persist(); render(); } },
    { label: 'Move up', onClick: () => moveTest(t, -1) },
    { label: 'Move down', onClick: () => moveTest(t, 1) },
    { label: 'Copy (definition)', onClick: () => copyTests([t]) },
    { label: 'Duplicate (definition only)', onClick: () => { const c = { ...t, id: uid(), fileIds: [], run: null, order: null, name: t.name + ' (copy)', created: Date.now() }; P.tests.push(c); persist(); render(); } },
    { label: 'Add to compare', onClick: () => { if (!UI.compare.tests.includes(t.id)) UI.compare.tests.push(t.id); UI.tab = 'compare'; render(); } },
    ...campaignMenuItems([t]),
    { label: 'Unassign all files', onClick: () => { t.fileIds.forEach(id => { const f = P.files.find(f => f.id === id); if (f) f.testId = null; }); t.fileIds = []; persist(); render(); } },
    '-',
    { label: 'Delete test', danger: true, onClick: () => confirmDialog(`Delete test "${t.name}"? Its ${t.fileIds.length} file(s) become unassigned.`, () => { deleteTest(t.id); persist(); render(); }) },
  ]);
}
function multiMenu(x, y, tests) {
  const n = tests.length; const allHidden = tests.every(t => t.hidden);
  ctxMenu(x, y, [
    { label: `Add ${n} to compare`, onClick: () => { for (const t of tests) if (!UI.compare.tests.includes(t.id)) UI.compare.tests.push(t.id); UI.tab = 'compare'; render(); } },
    { label: allHidden ? `Unhide ${n} tests` : `Hide ${n} tests`, onClick: () => { for (const t of tests) t.hidden = !allHidden; if (!allHidden && !UI.showHidden && tests.some(t => t.id === UI.testId)) { UI.testId = null; if (UI.tab === 'test') UI.tab = 'overview'; } UI.sel.clear(); persist(); render(); } },
    { label: `Copy ${n} (definitions)`, onClick: () => copyTests(tests) },
    { label: `Duplicate ${n} (definitions only)`, onClick: () => { for (const t of tests) P.tests.push({ ...t, id: uid(), fileIds: [], run: null, order: null, name: t.name + ' (copy)', created: Date.now() }); UI.sel.clear(); persist(); render(); } },
    ...campaignMenuItems(tests),
    { label: 'Clear selection', onClick: () => { UI.sel.clear(); renderTree(); } },
    '-',
    { label: `Delete ${n} tests`, danger: true, onClick: () => confirmDialog(`Delete ${n} tests? Their ${tests.reduce((a, t) => a + t.fileIds.length, 0)} file(s) become unassigned.`, () => { for (const t of tests) deleteTest(t.id); UI.sel.clear(); persist(); render(); }) },
  ]);
}
function deleteTest(id) { const t = P.tests.find(t => t.id === id); if (!t) return; campaignsOf().forEach(c => c.testIds = c.testIds.filter(x => x !== id)); t.fileIds.forEach(fid => { const f = P.files.find(f => f.id === fid); if (f) f.testId = null; }); P.tests = P.tests.filter(q => q.id !== id); if (UI.testId === id) { UI.testId = null; if (UI.tab === 'test') UI.tab = 'overview'; } UI.compare.tests = UI.compare.tests.filter(x => x !== id); }
function confirmDialog(msg, onYes) { modal('Please confirm', `<p>${esc(msg)}</p>`, [{ label: 'Cancel' }, { label: 'Confirm', primary: true, danger: true, onClick: onYes }]); }

const MODELS3D = [['fixture', 'Fixture only (plate and ring)'], ...(SITE.telescope ? [['fixture+telescope', 'Fixture + telescope payload']] : []), ['fixture+box', 'Fixture + box payload (size below)'], ['fixture+cylinder', 'Fixture + cylinder payload (size below)'], ['none', 'No model, markers only']];
function editSessionDialog(s = null) {
  const isNew = !s; const d = s || newSession('New session', new Date().toISOString().slice(0, 10));
  const g = d.geom || {}; const others = P.sessions.filter(q => q.id !== d.id);
  modal(isNew ? 'New session' : 'Edit session', `
    <div class="field"><label>Name</label><input class="input" id="m-name" value="${esc(d.name)}"></div>
    <div class="field"><label>Date</label><input class="input" id="m-date" type="date" value="${esc(d.date || '')}"></div>
    <div class="field"><label>Test article</label><input class="input" id="m-article" value="${esc(d.article || '')}" placeholder="Bare fixture, payload, unit…"></div>
    <div class="field"><label>3D model</label><select class="input" id="m-model">${MODELS3D.map(([v, l]) => `<option value="${v}" ${(d.model3d || 'fixture') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label>Payload rotation</label><div class="row"><input class="input" id="m-rot" type="number" step="any" value="${d.rotation ?? 0}" style="width:90px"> ° about Z, payload frame relative to the fixture <span class="small muted">(sensor positions on the payload are entered in the payload frame)</span></div></div>
    <div class="field"><label>Payload size</label><div class="row small">W <input class="input small" id="m-gw" type="number" value="${g.w ?? 300}" style="width:70px"> D <input class="input small" id="m-gd" type="number" value="${g.d ?? 300}" style="width:70px"> H <input class="input small" id="m-gh" type="number" value="${g.h ?? 400}" style="width:70px"> mm <span class="muted">(box and cylinder models; cylinder uses W as diameter)</span>${SITE.telescope ? ` · first bipod at <input class="input small" id="m-gb" type="number" value="${g.bipodAngle ?? 180}" style="width:60px">° <span class="muted">(telescope)</span>` : ''}</div></div>
    <div class="field"><label>Show in 3D view</label><label class="chk"><input type="checkbox" id="m-3d" ${d.show3D ? 'checked' : ''}> sensor positions are known for this session</label></div>
    <div class="field"><label>Hidden</label><label class="chk"><input type="checkbox" id="m-hidden" ${d.hidden ? 'checked' : ''}> leave this session out of the tree and the Signatures candidates (check runs, faulty sets)</label></div>
    <div class="field"><label>Notes</label><textarea class="input notes" id="m-notes">${esc(d.notes || '')}</textarea></div>
    ${isNew ? `<div class="field"><label>Sensors</label><select class="input" id="m-sensors">${sensorTemplates().map((t, i) => `<option value="t:${t.id}" ${i === 0 ? 'selected' : ''}>${esc(t.name)}${t.user ? ' (saved template)' : ''}</option>`).join('')}${others.map(q => `<option value="s:${q.id}">Copy from: ${esc(q.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Tests</label><select class="input" id="m-tests"><option value="plan">Plan the runs next (sequence per axis)</option><option value="low">Low level sine and random in Z, X, Y</option><option value="full">Full standard matrix in Z, X, Y</option><option value="none">None, I will add tests myself</option></select></div>` : ''}`,
    [{ label: 'Cancel' }, { label: isNew ? 'Create' : 'Save', primary: true, onClick: () => {
      d.name = $('#m-name').value.trim() || d.name; d.date = $('#m-date').value; d.article = $('#m-article').value; d.model3d = $('#m-model').value; d.show3D = $('#m-3d').checked; d.notes = $('#m-notes').value; d.hidden = $('#m-hidden').checked;
      d.rotation = parseFloat($('#m-rot').value) || 0; d.geom = { w: +$('#m-gw').value || 300, d: +$('#m-gd').value || 300, h: +$('#m-gh').value || 400, bipodAngle: parseFloat($('#m-gb')?.value) || 0 };
      let plan = false;
      if (isNew) {
        const sv = $('#m-sensors').value;
        if (sv.startsWith('t:')) { const t = sensorTemplates().find(q => q.id === sv.slice(2)); if (t) { d.sensors = [controlSensor(), ...t.make()]; if (t.model3d && $('#m-model').value === 'fixture') d.model3d = t.model3d; if (t.rotation != null && !d.rotation) d.rotation = t.rotation; } }
        else if (sv.startsWith('s:')) { const q = P.sessions.find(q => q.id === sv.slice(2)); if (q) { d.sensors = JSON.parse(JSON.stringify(q.sensors)); d.model3d = q.model3d; if (!d.rotation) d.rotation = q.rotation || 0; } }
        P.sessions.push(d); UI.sessionId = d.id;
        const tv = $('#m-tests').value; if (tv === 'full') buildStandardMatrix(d.id); else if (tv === 'low') buildStandardMatrix(d.id, true); else if (tv === 'plan') plan = true;
      }
      persist(); render(); if (plan) setTimeout(() => planRunsDialog(d), 50); } }]);
}
/* Plan runs: create the test slots of a session in the order they will be run, one line per axis, so imported files fall into place
   (signature sweeps fill the planned signature slots in order; other kinds fill the slot of the same kind). */
const PLAN_TOKENS = { sig: 'sig', signature: 'sig', ll: 'lowsine', lls: 'lowsine', lowsine: 'lowsine', sine: 'sineq', sineq: 'sineq', llr: 'lowrand', lowrand: 'lowrand', '-6': 'rand-6', 'rand-6': 'rand-6', '-3': 'rand-3', 'rand-3': 'rand-3', '0': 'rand0', '0db': 'rand0', rand0: 'rand0', random: 'rand0', srs: 'srs', shock: 'srs', custom: 'custom' };
function planRunsDialog(s) {
  const axes = ['X', 'Y', 'Z']; const rnd = a => libFor('random', a); const srs = libFor('srs');
  modal('Plan runs · ' + s.name, `
    <p class="small">One line per axis, runs in order, separated by commas. Words understood: sig, lls (low level sine), sine (qualification), llr (low level random), -6, -3, 0 (random at that level), srs, custom.</p>
    <textarea class="input notes" id="m-plan" style="min-height:90px;font-family:var(--mono);font-size:12px">X: sig, 0, sig, sig, srs, sig
Y: sig, 0, sig, sig, srs, sig
Z: sig, 0, sig, sig, srs, sig</textarea>
    ${axes.map(a => `<div class="field"><label>Random profile ${a}</label><select class="input small" id="m-pr-${a}"><option value="full">Full-level PSD</option>${rnd(a).map(p => `<option value="${p.id}" ${p.axis === a && /11 Nov/.test(p.name) ? 'selected' : ''}>${esc(p.name)} · ${psdGrms(p.bp).toFixed(2)} gRMS</option>`).join('')}</select></div>`).join('')}
    <div class="field"><label>SRS profile</label><select class="input small" id="m-prs">${srs.map(p => `<option value="${p.id}" ${/350/.test(p.name) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
    <label class="chk small"><input type="checkbox" id="m-planclear"> remove this session's empty test slots first</label>`,
    [{ label: 'Cancel' }, { label: 'Create slots', primary: true, onClick: () => {
      if ($('#m-planclear').checked) P.tests = P.tests.filter(t => t.sessionId !== s.id || t.fileIds.length);
      let n = 0; const bad = [];
      for (const line of $('#m-plan').value.split(/\r?\n/)) {
        const m = line.match(/^\s*([XYZ])\s*:\s*(.+)$/i); if (!m) continue; const ax = m[1].toUpperCase();
        const base = Math.max(-1, ...testsOfSession(s.id).filter(t => t.axis === ax).map(t => t.order ?? -1)) + 1;
        m[2].split(/[,;]+/).map(w => w.trim().toLowerCase().replace(/\s+db$/, '').replace(/ db$/, '')).filter(Boolean).forEach((w, i) => {
          const kind = PLAN_TOKENS[w]; if (!kind) { bad.push(w); return; }
          const t = newTest(s.id, ax, kind); t.order = base + i;
          if (kind === 'sig') t.name = 'Signature sweep';
          if (kindById(kind).type === 'random' && kind !== 'lowrand') { t.profile = $('#m-pr-' + ax).value; }
          if (kind === 'srs') t.profile = $('#m-prs').value;
          P.tests.push(t); n++;
        });
      }
      if (bad.length) toast('Not understood: ' + [...new Set(bad)].join(', '), true);
      UI.sessionId = s.id; persist(); render(); toast(`${n} planned test slot(s) added`); } }]);
}
function editTestDialog(t = null) {
  const sess = activeSession(); if (!sess && !t) { toast('Create a session first', true); return; }
  const isNew = !t; const d = t || newTest(sess.id, 'Z', 'custom');
  const kindOpts = KINDS.map(k => `<option value="${k.id}" ${k.id === d.kind ? 'selected' : ''}>${k.name}</option>`).join('');
  const sessOpts = P.sessions.map(s => `<option value="${s.id}" ${s.id === d.sessionId ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  modal(isNew ? 'New test' : 'Edit test', `
    <div class="field"><label>Session</label><select class="input" id="m-sess">${sessOpts}</select></div>
    <div class="field"><label>Name</label><input class="input" id="m-name" value="${esc(d.name)}"></div>
    <div class="field"><label>Axis</label><select class="input" id="m-axis">${['Z', 'X', 'Y'].map(a => `<option ${a === d.axis ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
    <div class="field"><label>Test kind</label><select class="input" id="m-kind">${kindOpts}</select></div>
    <div class="field"><label>Run number</label><input class="input" id="m-run" type="number" value="${d.run ?? ''}" placeholder="from controller file name"></div>
    <div class="field"><label>Profile</label><select class="input" id="m-profile">${profileOptions(d)}</select></div>
    <div class="field"><label>Schedule level</label><div class="row"><input class="input" id="m-level" type="number" step="any" value="${d.levelDb ?? ''}" placeholder="${kindById(d.kind).db ?? 0}" style="width:110px"> dB <span class="small muted">relative to the chosen profile; empty = the level of the test kind</span></div></div>
    <div class="field"><label>Result</label><select class="input" id="m-status">${['', 'Pass', 'Fail', 'Aborted', 'Info only'].map(s => `<option ${s === d.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    <div class="field"><label>Hidden</label><label class="chk"><input type="checkbox" id="m-hidden" ${d.hidden ? 'checked' : ''}> leave this test out of the tree and the Overview (check run, wrong level, faulty data)</label></div>
    <div class="field"><label>Notes</label><textarea class="input notes" id="m-notes">${esc(d.notes || '')}</textarea></div>
    <p class="hint">The kind decides which requirement profile and tolerance lines are drawn. For random and SRS tests, pick the profile the controller actually ran from the library (Profiles and settings); the schedule level is relative to that profile, so a notched profile run at -3 dB is a double reduction. Use Custom for anything outside the standard matrix.</p>`,
    [{ label: 'Cancel' }, { label: isNew ? 'Create' : 'Save', primary: true, onClick: () => { d.sessionId = $('#m-sess').value; d.name = $('#m-name').value.trim() || d.name; d.axis = $('#m-axis').value; d.kind = $('#m-kind').value; const r = $('#m-run').value; d.run = r === '' ? null : parseInt(r, 10); d.status = $('#m-status').value; d.notes = $('#m-notes').value; d.profile = $('#m-profile').value; const lv = $('#m-level').value; d.levelDb = lv === '' ? null : parseFloat(lv); d.hidden = $('#m-hidden').checked; if (isNew) { P.tests.push(d); UI.testId = d.id; UI.tab = 'test'; } M_CACHE.clear(); persist(); render(); } }],
    body => { const ref = () => { const tmp = { ...d, kind: body.querySelector('#m-kind').value, axis: body.querySelector('#m-axis').value, profile: body.querySelector('#m-profile').value }; body.querySelector('#m-profile').innerHTML = profileOptions(tmp); }; body.querySelector('#m-kind').onchange = e => { const nm = body.querySelector('#m-name'); if (isNew || KINDS.some(k => k.name === nm.value)) nm.value = kindById(e.target.value).name; ref(); }; body.querySelector('#m-axis').onchange = ref; });
}
function buildStandardMatrix(sid, lowOnly = false) {
  let n = 0;
  for (const ax of AXES) for (const k of KINDS) { if (!k.matrix || (lowOnly && !k.lowLevel)) continue; if (!P.tests.some(t => t.sessionId === sid && t.axis === ax && t.kind === k.id)) { P.tests.push(newTest(sid, ax, k.id)); n++; } }
  if (n) toast(`${n} ${lowOnly ? 'low level' : 'standard'} tests added`);
  return n;
}

/* ---------- Import and assignment ---------- */
async function importFiles(fileList, forceTestId = null, opts = {}) {
  const files = Array.from(fileList); if (!files.length) return;
  let bad = 0; const log = [];
  setStatus('Importing…');
  const parsed = [];
  for (const file of files) { try { parsed.push(await parseFile(file)); } catch (e) { bad++; log.push(`${file.name}: ${e.message}`); console.error(e); } }
  // data files first, reports last, so a report finds the test its run created
  parsed.sort((a, b) => (a.kind === 'report') - (b.kind === 'report'));
  // files that the name rules cannot place (any other lab's or DAQ's export) go through the review dialog first
  if (!parsed.length) { toast(`Could not read ${bad} file(s): ${log[0] || ''}`, true); setStatus('Ready'); return; }
  let plan = null; let sess = activeSession();
  if (!forceTestId && (opts.review || needsReview(parsed))) { plan = await reviewImportDialog(parsed, sess); if (!plan) { setStatus('Import cancelled'); return; } }
  if (!plan && !sess) { const s = newSession('Session ' + new Date().toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)); P.sessions.push(s); UI.sessionId = s.id; buildStandardMatrix(s.id); sess = s; }
  if (plan) { UI.sessionId = plan.sessionId; if (UI.tab === 'overview' || !UI.tab) UI.tab = 'overview'; }
  const sessT = plan ? P.sessions.find(s => s.id === plan.sessionId) : sess;
  return finishImport(parsed, sessT, plan, forceTestId, { bad, log });
}
async function finishImport(parsed, sess, plan, forceTestId, acc) {
  const norm = n => n.toLowerCase().replace(/[\s_]+/g, '_'); let ok = 0, unassigned = 0, replaced = 0, skipped = 0; const bad = acc.bad, log = acc.log;
  const dups = parsed.filter(pf => P.files.some(f => norm(f.name) === norm(pf.name) && f.sessionId === sess.id));
  let dupMode = 'replace';
  if (dups.length) dupMode = await askDuplicates(dups);
  for (const pf of parsed) {
    const old = P.files.find(f => norm(f.name) === norm(pf.name) && f.sessionId === sess.id);
    let targetTest = forceTestId;
    if (old) {
      if (dupMode === 'skip') { skipped++; continue; }
      if (dupMode === 'replace') { targetTest = targetTest || old.testId; if (old.testId) { const t = P.tests.find(t => t.id === old.testId); if (t) t.fileIds = t.fileIds.filter(x => x !== old.id); } P.files = P.files.filter(f => f.id !== old.id); replaced++; }
      else { pf.name = pf.name.replace(/(\.[^.]+)$/, ' (2)$1'); }
    }
    pf.sessionId = sess.id; P.files.push(pf); ok++;
    const tgt = plan?.targets.get(pf);
    if (!targetTest && tgt === 'new') { const d = pf.detected; const nt = newTest(sess.id, d.axis || 'X', d.kindId || 'custom', d.run, null); P.tests.push(nt); targetTest = nt.id; }
    else if (!targetTest && tgt && tgt !== 'auto') targetTest = tgt;
    if (targetTest) assignFileToTest(pf.id, targetTest);
    else { const r = autoAssign(pf, sess); if (!r) unassigned++; }
  }
  persist(); render();
  toast(`${ok} file(s) imported${replaced ? `, ${replaced} replaced` : ''}${skipped ? `, ${skipped} skipped` : ''}${unassigned ? `, ${unassigned} need manual assignment (see Files)` : ''}${bad ? `, ${bad} failed` : ''}`, bad > 0);
  if (log.length) console.info(log.join('\n'));
  if (unassigned && !forceTestId) { UI.tab = 'files'; render(); }
}
/* ---------- Import review ----------
   One row per file: what kind of data it is, which axis and run, which test it goes to, and (for data files) which column is the control and
   which input number each column carries. Pre-filled from what the file name and headers tell; nothing is imported until Import is pressed. */
const prefGet = (k, d) => { try { return localStorage.getItem('vs-pref-' + k) || d; } catch (e) { return d; } };
const prefSet = (k, v) => { try { localStorage.setItem('vs-pref-' + k, v); } catch (e) { } };
function needsReview(parsed) {
  const pref = prefGet('reviewImport', 'auto'); if (pref === 'always') return true; if (pref === 'never') return false;
  return parsed.some(pf => pf.kind !== 'report' && (pf.generic || !pf.detected.axis || !pf.detected.kindId || pf.detected.confidence < 0.5));
}
const DATA_KINDS = [['sine', 'Sine sweep (response vs frequency)'], ['psd', 'Random PSD (g²/Hz vs frequency)'], ['srs', 'SRS spectrum (g vs frequency)'], ['time', 'Shock time history (g vs time)'], ['rms', 'RMS history (gRMS vs time)']];
const kindsForData = k => KINDS.filter(x => x.type === 'any' || x.type === ({ sine: 'sine', psd: 'random', rms: 'random', srs: 'srs', time: 'srs' }[k] || 'any'));
function defaultKindFor(pf) { const d = pf.detected; if (d.kindId && kindsForData(pf.kind).some(k => k.id === d.kindId)) return d.kindId; return { sine: 'lowsine', psd: 'rand0', rms: 'rand0', srs: 'srs', time: 'srs' }[pf.kind] || 'custom'; }
function columnsEditorHtml(cols, key) {
  return `<table class="tbl colsed" data-colsed="${key}"><thead><tr><th>Use</th><th>Column</th><th class="num">Input #</th><th>Role</th><th class="num">First values</th></tr></thead><tbody>${cols.map((c, i) => `<tr><td><input type="checkbox" data-cu="${i}" ${c.use !== false ? 'checked' : ''}></td><td><input class="input small" data-cl="${i}" value="${esc(c.label)}" style="width:100%;min-width:140px"></td><td class="num"><input class="input small" type="number" min="1" data-cc="${i}" value="${c.ch ?? ''}" style="width:70px"></td><td><select class="input small" data-cr="${i}"><option value="response" ${c.role !== 'control' ? 'selected' : ''}>Response</option><option value="control" ${c.role === 'control' ? 'selected' : ''}>Control</option></select></td><td class="num small muted mono">${(c.data || []).slice(0, 3).map(v => v == null ? '–' : fmt(v, 3)).join(', ')}</td></tr>`).join('')}</tbody></table><div class="small muted" style="margin-top:4px">The control is the accelerometer the shaker was controlled on (all responses are divided by it). Input numbers link columns to sensors in Sensors and 3D; keep them unique.</div>`;
}
function readColumnsEditor(root, cols) {
  const out = cols.map((c, i) => ({ ...c, use: root.querySelector(`[data-cu="${i}"]`)?.checked !== false, label: root.querySelector(`[data-cl="${i}"]`)?.value.trim() || c.label, ch: parseInt(root.querySelector(`[data-cc="${i}"]`)?.value, 10) || c.ch, role: root.querySelector(`[data-cr="${i}"]`)?.value || c.role }));
  // one control at most: the first one marked wins
  let seen = false; for (const c of out) if (c.role === 'control' && c.use) { if (seen) c.role = 'response'; seen = true; }
  return out;
}
function applyColumns(f, cols) { f.cols = cols.filter(c => c.use !== false).map(c => { const { use, ...rest } = c; return rest; }); }
function reviewImportDialog(parsed, sess) {
  return new Promise(res => {
    const st = parsed.map(pf => ({ pf, kind: pf.kind, axis: pf.detected.axis || '', run: pf.detected.run, kindId: pf.kind === 'report' ? null : defaultKindFor(pf), target: 'auto', cols: pf.cols ? pf.cols.map(c => ({ ...c, use: true })) : null, open: false }));
    let sid = sess?.id || '__new'; let newName = 'Session ' + new Date().toISOString().slice(0, 10), newDate = new Date().toISOString().slice(0, 10);
    const box = $('#modal .box'); box.classList.add('wide');
    const testsFor = () => sid === '__new' ? [] : testsOfSession(sid).slice().sort((a, b) => AXES.indexOf(a.axis) - AXES.indexOf(b.axis) || byRun(a, b));
    const rowHtml = (r, i) => {
      const isRep = r.pf.kind === 'report'; const ctl = r.cols?.find(c => c.role === 'control' && c.use !== false);
      const tgtOpts = `<option value="auto" ${r.target === 'auto' ? 'selected' : ''}>Automatic (by run, axis and type)</option>${isRep ? '' : `<option value="new" ${r.target === 'new' ? 'selected' : ''}>New test</option>`}${testsFor().map(t => `<option value="${t.id}" ${r.target === t.id ? 'selected' : ''}>${t.axis} · ${esc(t.name)}${t.run != null ? ' #' + t.run : ''}${t.fileIds.length ? ' (has data)' : ''}</option>`).join('')}`;
      return `<tr data-ri="${i}"><td class="mono small" style="max-width:240px;overflow:hidden;text-overflow:ellipsis" title="${esc(r.pf.name)}">${esc(r.pf.name)}${r.pf.generic ? ' <span class="pill" title="Not a recognised controller layout: check the columns">generic</span>' : ''}</td>
        <td>${isRep ? '<span class="pill warn">Report</span>' : `<select class="input small" data-rk="${i}">${DATA_KINDS.map(([k, l]) => `<option value="${k}" ${r.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`}</td>
        <td><select class="input small" data-ra="${i}">${['', 'X', 'Y', 'Z'].map(a => `<option value="${a}" ${r.axis === a ? 'selected' : ''}>${a || '?'}</option>`).join('')}</select></td>
        <td>${isRep ? '' : `<select class="input small" data-rt="${i}">${kindsForData(r.kind).map(k => `<option value="${k.id}" ${r.kindId === k.id ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}</select>`}</td>
        <td><input class="input small" type="number" data-rr="${i}" value="${r.run ?? ''}" style="width:64px"></td>
        <td><select class="input small" data-rg="${i}" style="max-width:220px">${tgtOpts}</select></td>
        <td>${isRep ? '' : `<button class="btn small" data-ro="${i}">${r.cols.filter(c => c.use !== false).length} ch · control: ${ctl ? esc(ctl.label) : '<span style="color:var(--bad)">none</span>'} ${r.open ? '▴' : '▾'}</button>`}</td></tr>
        ${r.open && !isRep ? `<tr class="colsrow"><td colspan="7">${columnsEditorHtml(r.cols, i)}</td></tr>` : ''}`;
    };
    const draw = () => {
      const b = $('#modal-body');
      b.innerHTML = `<p class="small">Check how each file will be read and where it goes. Files with names like <span class="mono">05_X_Random_0dB.xlsx</span> fill these in by themselves; anything else, set it here. You can change all of it later in the Files tab.</p>
        <div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap"><div class="field" style="margin:0"><label>Import into session</label><select class="input small" id="ri-sess">${P.sessions.map(s => `<option value="${s.id}" ${s.id === sid ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}<option value="__new" ${sid === '__new' ? 'selected' : ''}>+ New session…</option></select></div>${sid === '__new' ? `<div class="field" style="margin:0"><label>Name</label><input class="input small" id="ri-nname" value="${esc(newName)}" style="width:240px"></div><div class="field" style="margin:0"><label>Test date</label><input class="input small" type="date" id="ri-ndate" value="${esc(newDate)}"></div>` : ''}</div>
        <div class="tbl-wrap"><table class="tbl" id="ri-table"><thead><tr><th>File</th><th>Data</th><th>Axis</th><th>Test type</th><th>Run</th><th>Goes to</th><th>Columns</th></tr></thead><tbody>${st.map(rowHtml).join('')}</tbody></table></div>
        <label class="chk small"><input type="checkbox" id="ri-always" ${prefGet('reviewImport', 'auto') === 'always' ? 'checked' : ''}> Always show this review (otherwise only when a file is not recognised)</label>`;
      const keepCols = () => st.forEach((r, i) => { const ed = b.querySelector(`[data-colsed="${i}"]`); if (ed) r.cols = readColumnsEditor(ed, r.cols); });
      $('#ri-sess').onchange = e => { keepCols(); sid = e.target.value; st.forEach(r => { if (r.target !== 'auto' && r.target !== 'new') r.target = 'auto'; }); draw(); };
      $('#ri-nname') && ($('#ri-nname').oninput = e => newName = e.target.value); $('#ri-ndate') && ($('#ri-ndate').oninput = e => newDate = e.target.value);
      $$('[data-rk]', b).forEach(el => el.onchange = () => { keepCols(); const r = st[+el.dataset.rk]; r.kind = el.value; if (!kindsForData(r.kind).some(k => k.id === r.kindId)) r.kindId = { sine: 'lowsine', psd: 'rand0', rms: 'rand0', srs: 'srs', time: 'srs' }[r.kind]; draw(); });
      $$('[data-ra]', b).forEach(el => el.onchange = () => st[+el.dataset.ra].axis = el.value);
      $$('[data-rt]', b).forEach(el => el.onchange = () => st[+el.dataset.rt].kindId = el.value);
      $$('[data-rr]', b).forEach(el => el.oninput = () => { const v = parseInt(el.value, 10); st[+el.dataset.rr].run = isFinite(v) ? v : null; });
      $$('[data-rg]', b).forEach(el => el.onchange = () => st[+el.dataset.rg].target = el.value);
      $$('[data-ro]', b).forEach(el => el.onclick = () => { keepCols(); const r = st[+el.dataset.ro]; r.open = !r.open; draw(); });
      b._keepCols = keepCols;
    };
    const done = v => { box.classList.remove('wide'); res(v); };
    modal(`Review import · ${parsed.length} file(s)`, '', [{ label: 'Cancel', onClick: () => done(null) }, { label: 'Import', primary: true, onClick: () => {
      $('#modal-body')._keepCols?.();
      prefSet('reviewImport', $('#ri-always')?.checked ? 'always' : 'auto');
      const missing = st.filter(r => r.pf.kind !== 'report' && !r.axis); if (missing.length) { toast(`Set the axis for ${missing.length} file(s)`, true); return false; }
      let sessionId = sid; if (sid === '__new') { const s = newSession(newName || 'New session', newDate); P.sessions.push(s); sessionId = s.id; }
      const targets = new Map();
      for (const r of st) {
        const pf = r.pf; const d = pf.detected; pf.detected = { ...d, axis: r.axis || d.axis, run: r.run, confidence: 1 };
        if (pf.kind !== 'report') { pf.kind = r.kind; applyColumns(pf, r.cols); pf.generic = false; const k = kindById(r.kindId); pf.detected.kindId = r.kindId; pf.detected.type = k.type === 'any' ? ({ sine: 'sine', psd: 'random', rms: 'random', srs: 'srs', time: 'srs' }[r.kind]) : k.type; if (pf.kind === 'rms') try { cleanHistory(pf); } catch (e) { } }
        targets.set(pf, r.target);
      }
      done({ sessionId, targets });
    } }]);
    const x = $('#modal-x'); const prev = x.onclick; x.onclick = () => { closeModal(); x.onclick = prev; done(null); };
    draw();
  });
}
/* Edit the columns of a file already imported: names, input numbers, which one is the control, which to drop. */
function columnsDialog(f) {
  const cols = f.cols.map(c => ({ ...c, use: true })); $('#modal .box').classList.add('wide');
  modal('Columns · ' + f.name, `<div class="field"><label>Data type</label><select class="input small" id="cd-kind">${DATA_KINDS.map(([k, l]) => `<option value="${k}" ${f.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>${columnsEditorHtml(cols, 'f')}`,
    [{ label: 'Cancel', onClick: () => $('#modal .box').classList.remove('wide') }, { label: 'Save', primary: true, onClick: () => { const ed = $('[data-colsed="f"]'); applyColumns(f, readColumnsEditor(ed, cols)); f.kind = $('#cd-kind').value; f.generic = false; LF_CACHE.clear(); M_CACHE.clear(); if (typeof SIG_CACHE !== 'undefined') SIG_CACHE.clear(); $('#modal .box').classList.remove('wide'); persist(); render(); toast('Columns updated'); } }]);
}
function askDuplicates(dups) {
  return new Promise(res => {
    modal('Files already in this session', `<p>${dups.length} file(s) with the same name are already imported here:</p><div class="small mono" style="max-height:160px;overflow:auto">${dups.map(d => esc(d.name)).join('<br>')}</div><p class="small muted">Replace keeps the test assignment and swaps the data. Keep both imports the new copy with "(2)" in the name. Skip leaves the existing files untouched.</p>`,
      [{ label: 'Skip', onClick: () => res('skip') }, { label: 'Keep both', onClick: () => res('keep') }, { label: 'Replace', primary: true, onClick: () => res('replace') }]);
    const x = $('#modal-x'); const prev = x.onclick; x.onclick = () => { closeModal(); x.onclick = prev; res('skip'); };
  });
}
function assignFileToTest(fileId, testId) {
  const f = P.files.find(f => f.id === fileId); if (!f) return;
  if (f.testId) { const old = P.tests.find(t => t.id === f.testId); if (old) old.fileIds = old.fileIds.filter(x => x !== fileId); }
  f.testId = testId; const t = P.tests.find(t => t.id === testId);
  if (t) { if (!t.fileIds.includes(fileId)) t.fileIds.push(fileId); f.sessionId = t.sessionId; if (t.run == null && f.detected?.run != null) t.run = f.detected.run; }
}
function autoAssign(f, sess) {
  let d = f.detected; const ts = testsOfSession(sess.id);
  // a report only attaches to the test of its run (and axis); it never creates or claims a slot
  if (f.kind === 'report') { const t = d.run != null ? ts.find(t => t.run === d.run && (!d.axis || t.axis === d.axis)) : null; if (t) { assignFileToTest(f.id, t.id); return t; } return null; }
  // a second low level sweep in the same axis is a signature sweep (before/after comparison), whatever its band
  // a low level sweep goes into an empty planned signature slot of its axis when the plan has one and no low level sine slot
  if (d.kindId === 'lowsine' && !ts.some(t => t.axis === d.axis && t.kind === 'lowsine' && !t.fileIds.length) && ts.some(t => t.axis === d.axis && t.kind === 'sig' && !t.fileIds.length && t.run == null)) d = { ...d, kindId: 'sig' };
  if (d.kindId === 'lowsine' && d.run != null && ts.some(t => t.axis === d.axis && (t.kind === 'lowsine' || t.kind === 'sig') && t.run != null && t.run !== d.run && t.fileIds.length)) d = { ...d, kindId: 'sig' };
  // 1. same run number already assigned in this session (and the same kind of test, since labs sometimes reuse a run number)
  if (d.run != null) { const byRun = ts.find(t => t.run === d.run && (!d.type || t.kind === 'custom' || kindById(t.kind).type === d.type)); if (byRun) { assignFileToTest(f.id, byRun.id); return byRun; } }
  // names without a level (e.g. '02_X_Random_All_Signals'): use the planned slot of that test type in the axis
  if (d.axis && d.type && (!d.kindId || d.confidence < 0.8)) { const slot = ts.filter(t => t.axis === d.axis && kindById(t.kind).type === d.type && t.kind !== 'sig' && !t.fileIds.length && t.run == null).sort(byRun)[0]; if (slot) { assignFileToTest(f.id, slot.id); if (slot.run == null) slot.run = d.run; return slot; } }
  if (d.axis && d.type === 'random' && !d.kindId) d = { ...d, kindId: 'rand0', confidence: 0.5 };
  if (!d.axis || !d.kindId || d.confidence < 0.5) return null;
  // signature sweeps are run several times per axis; each is its own test, named by run
  if (d.kindId === 'sig') { const slot = ts.filter(t => t.kind === 'sig' && t.axis === d.axis && !t.fileIds.length && t.run == null).sort(byRun)[0]; if (slot) { slot.run = d.run; if (/^Signature/.test(slot.name)) slot.name = `Signature sweep${d.run != null ? ' (run ' + d.run + ')' : ''}`; assignFileToTest(f.id, slot.id); return slot; } const nt = newTest(sess.id, d.axis, 'sig', d.run, `Signature sweep${d.run != null ? ' (run ' + d.run + ')' : ''}`); P.tests.push(nt); assignFileToTest(f.id, nt.id); return nt; }
  // 2. empty slot with same axis and kind
  const slot = ts.find(t => t.axis === d.axis && t.kind === d.kindId && (t.run == null || t.run === d.run) && !t.fileIds.some(id => { const g = P.files.find(x => x.id === id); return g && g.detected.run != null && d.run != null && g.detected.run !== d.run; }));
  if (slot) { assignFileToTest(f.id, slot.id); return slot; }
  // 3. no slot: a first test of this kind for the axis gets the plain name, otherwise it is a repeat
  const k = kindById(d.kindId); const first = !ts.some(t => t.axis === d.axis && t.kind === d.kindId);
  const nt = newTest(sess.id, d.axis, d.kindId, d.run, (first || d.kindId === 'sig') ? k.name : `${k.name} (repeat${d.run != null ? ' run ' + d.run : ''}${d.level != null && d.type === 'sine' ? ', ' + d.level + ' g' : ''})`);
  P.tests.push(nt); assignFileToTest(f.id, nt.id); return nt;
}

/* ---------- Render root ---------- */
function render() {
  renderBrand();
  renderTree();
  $$('#tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === UI.tab));
  const v = $('#view'); v.innerHTML = '';
  if (!P.sessions.length && UI.tab !== 'files' && UI.tab !== 'settings') { v.innerHTML = welcomeHtml(); bindWelcome(v); return; }
  ({ overview: renderOverview, test: renderTest, compare: renderCompare, signatures: renderSignatures, sensors: renderSensors, files: renderFiles, settings: renderSettings }[UI.tab] || renderOverview)(v);
  purgePlots();
}
function bindDropzone(root) { const dz = root.querySelector('#dz'); if (!dz) return; dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over'); dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); importFiles(e.dataTransfer.files); }; }

/* ---------- Overview ----------
   One session at a glance: where each axis stands, the runs in the order they were run with their headline numbers, how the signature
   sweeps moved, and the highest responses seen. Hidden tests are left out unless "show hidden" is on. */
function renderOverview(v) {
  if (UI.treeMode === 'campaign' && activeCampaign()) return renderCampaignOverview(v, activeCampaign());
  const s = activeSession(); if (!s) { v.innerHTML = welcomeHtml(); bindWelcome(v); return; }
  const all = testsOfSession(s.id); const ts = visibleTests(all).slice().sort(byRun); const files = P.files.filter(f => f.sessionId === s.id); const un = files.filter(f => !f.testId).length;
  const withData = ts.filter(t => t.fileIds.length).length; const nHid = all.length - visibleTests(all).length;
  const axes = axisOrder(ts);
  const sigs = ts.filter(t => specFileOf(t)?.kind === 'sine' && (t.kind === 'sig' || t.kind === 'lowsine')).map(t => sigShiftOf(t, ts)).filter(Boolean);
  const worstSig = sigs.length ? sigs.reduce((a, b) => Math.abs(b.worst ?? 0) > Math.abs(a.worst ?? 0) ? b : a) : null;
  const lim = P.profiles.signature.shiftLimitPct;
  let html = `<div class="section-h"><h2>${esc(s.name)}</h2><span class="sub">${esc(s.article || '')}${s.date ? ' · ' + esc(s.date) : ''}</span>${s.hidden ? '<span class="pill">hidden session</span>' : ''}<span class="spacer" style="flex:1"></span><button class="btn small" id="ov-edit">Edit session</button><button class="btn small" id="ov-matrix" title="Add the missing standard tests (sine qual, random levels, shock) for all three axes as empty slots">Add standard slots</button></div>
  <div class="kpis"><div class="kpi"><div class="k">Runs with data</div><div class="v">${withData}<span class="muted" style="font-size:14px">/${ts.length}</span></div><div class="s">${nHid ? `${nHid} hidden` : 'none hidden'}${un ? ` · <span class="pill warn">${un} file(s) unassigned</span>` : ''}</div></div>
  ${axes.map(a => { const h = highestLevel(ts.filter(t => t.axis === a)); return `<div class="kpi"><div class="k">${a} axis · reached</div><div class="v" style="font-size:16px;line-height:1.3;margin-top:6px">${h ? esc(h.label) : '<span class="muted">no data</span>'}</div><div class="s">${h ? esc(h.sub) : ''}</div></div>`; }).join('')}
  <div class="kpi"><div class="k">Signature shift</div><div class="v">${worstSig && worstSig.worst != null ? `<span style="color:${Math.abs(worstSig.worst) > lim ? 'var(--bad)' : 'var(--good)'}">${worstSig.worst > 0 ? '+' : ''}${fmt(worstSig.worst, 2)} %</span>` : '<span class="muted">–</span>'}</div><div class="s">${worstSig && worstSig.worst != null ? `${esc(worstSig.worstCh || 'drive channel')}, ${esc(worstSig.axis)} run ${worstSig.prev.run ?? '?'} → ${worstSig.t.run ?? '?'} at ${fmtF(worstSig.worstF)} Hz · limit ${lim} %` : 'needs two sweeps in one axis'}</div></div>
  <div class="kpi"><div class="k">Sensors</div><div class="v">${sensorsOf(s).length}<span class="muted" style="font-size:14px"> · ${Object.keys(chmapOf(s)).length} ch</span></div><div class="s">${checkSummary(ts)}</div></div></div>`;
  if (s.notes) html += `<div class="card" style="margin-bottom:14px"><div class="card-b small">${esc(s.notes).replace(/\n/g, '<br>')}</div></div>`;
  // run sequence per axis as a strip of chips
  html += `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Sequence per axis</h3><span class="hint">In run order. Click a run to open it. Green = data present, grey = empty slot, dashed = hidden.</span></div><div class="card-b stack" style="gap:8px">`;
  for (const a of axes) {
    const list = ts.filter(t => t.axis === a);
    html += `<div class="row" style="align-items:center;gap:6px"><span class="pill axis" style="min-width:52px;justify-content:center">${a} axis</span>${list.map(t => { const fs = testFiles(t); const has = fs.some(f => ['sine', 'psd', 'srs', 'time'].includes(f.kind)); return `<span class="runchip ${has ? 'has' : fs.length ? 'partial' : ''} ${t.hidden ? 'hid' : ''}" data-test="${t.id}" title="${esc(t.name)}${t.notes ? '\n' + esc(t.notes.slice(0, 160)) : ''}"><span class="mono">${t.run != null ? '#' + t.run : '·'}</span> ${esc(seqLabel(t))}</span>`; }).join('<span class="muted small">›</span>')}</div>`;
  }
  html += `</div></div>`;
  // run table
  html += `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Runs in order</h3><span class="hint">Headline numbers per run. Drive-axis = the channel of each sensor that carries the shaker motion; flagged channels are left out of the maxima.</span><button class="btn small" id="ov-copy">Copy as TSV</button></div><div class="card-b tbl-wrap">${runTable(ts, sigs)}</div></div>`;
  // highest responses
  const top = topResponses(ts);
  if (top.rand.length || top.sine.length) {
    const tbl = (rows, unit) => rows.length ? `<table class="tbl"><thead><tr><th>Sensor</th><th>Ch</th><th class="num">${unit}</th><th class="num">Peak</th><th class="num">At (Hz)</th><th>Run</th></tr></thead><tbody>${rows.map(r => `<tr data-test="${r.t.id}" style="cursor:pointer"><td><span class="sw" style="background:${r.r.style.color}"></span>${esc(r.r.sensorName || 'ch' + r.r.ch)} ${r.r.axis || ''}${r.r.inAxis ? ' <span class="pill good">drive</span>' : ''}</td><td class="mono">${r.r.ch}</td><td class="num">${fmt(r.v)}</td><td class="num">${fmt(r.r.peak)}${unit === 'gRMS' ? ' g²/Hz' : ' g'}</td><td class="num">${fmtF(r.r.peakF)}</td><td class="small">${r.t.run != null ? '#' + r.t.run + ' ' : ''}${esc(r.t.axis)} ${esc(seqLabel(r.t))}</td></tr>`).join('')}</tbody></table>` : '<div class="small muted">none</div>';
    html += `<div class="grid2"><div class="card"><div class="card-h"><h3>Highest random responses</h3><span class="hint">gRMS over the profile band, any channel, all random runs of this session</span></div><div class="card-b tbl-wrap">${tbl(top.rand, 'gRMS')}</div></div><div class="card"><div class="card-h"><h3>Highest sine responses</h3><span class="hint">Peak g, any channel, all sine runs of this session</span></div><div class="card-b tbl-wrap">${tbl(top.sine, 'g')}</div></div></div>`;
  }
  v.innerHTML = html;
  $('#ov-edit').onclick = () => editSessionDialog(s);
  $('#ov-matrix').onclick = () => { if (!buildStandardMatrix(s.id)) toast('Standard slots already present'); persist(); render(); };
  $$('[data-test]', v).forEach(c => c.onclick = () => selectTest(c.dataset.test));
  $('#ov-copy').onclick = () => copyTable(v.querySelector('#ov-runs'));
  makeResizableTables(v);
}
/* What distinguishes a run in a sequence strip: kind, level and profile in a few characters. */
function seqLabel(t) {
  const k = kindById(t.kind);
  if (t.kind === 'sig') return 'Sig';
  const lp = t.profile && t.profile !== 'full' ? libProfile(t.profile) : null;
  if (k.type === 'random' && t.kind !== 'lowrand') { const db = testLevelDb(t); return `Rand ${lp ? (lp.short || 'custom') : ''}${db ? ' ' + db + ' dB' : lp ? '' : ' 0 dB'}`.replace(/\s+/g, ' ').trim(); }
  if (k.type === 'srs') return lp ? `SRS ${lp.short || ''}`.trim() : 'SRS';
  return k.short;
}
/* Highest level reached in one axis: the random run with the highest control gRMS, else the sine qual, else the low level runs. */
function highestLevel(list) {
  const rands = list.filter(t => specFileOf(t)?.kind === 'psd').map(t => ({ t, m: computeMetrics(t) })).filter(x => x.m.control?.grms).sort((a, b) => b.m.control.grms - a.m.control.grms);
  if (rands.length) { const { t, m } = rands[0]; const pr = m.profile; return { label: `Random ${testLevelDb(t) ? testLevelDb(t) + ' dB' : '0 dB'}${pr?.custom ? ' (' + (pr.short || 'custom') + ')' : ''}`, sub: `control ${fmt(m.control.grms)} gRMS · run ${t.run ?? '?'}` }; }
  const sq = list.find(t => t.kind === 'sineq' && specFileOf(t)); if (sq) { const m = computeMetrics(sq); return { label: 'Sine qualification', sub: `run ${sq.run ?? '?'}${m.control ? ' · control ' + fmt(m.control.peak) + ' g' : ''}` }; }
  const lo = list.filter(t => specFileOf(t)); if (lo.length) return { label: kindById(lo[lo.length - 1].kind).name, sub: `${lo.length} run(s) with data` };
  return null;
}
/* Signature shift of a sine sweep against the previous sine sweep of the same axis in the session (by run number). */
function sigShiftOf(t, ts) {
  const prev = ts.filter(q => q.id !== t.id && q.axis === t.axis && specFileOf(q)?.kind === 'sine' && (q.run ?? -1) < (t.run ?? 1e9) && controlCol(specFileOf(q))).sort(byRun).pop();
  if (!prev || !controlCol(specFileOf(t))) return null;
  let A; try { A = sigAnalysis(prev, [t], {}); } catch (e) { return null; }
  // clear resonances only (transmissibility 4× and above): the forest of small peaks above 1.5 kHz pairs ambiguously and would dominate the worst case.
  const MIN = Math.max(4, P.profiles.signature.peakThreshold); const lim = P.profiles.signature.shiftLimitPct, ampLim = P.profiles.signature.ampLimitDb;
  const rows = A.rows.filter(r => (r.isDrive || !r.sensor) && !r.flagged);
  let worst = null, over = 0, changed = 0, amp = 0, ch = '';
  for (const r of rows) {
    const p = r.per[0]; if (!p) continue;
    const sig = p.pairs.filter(q => (q.ref && q.ref.v >= MIN) || (!q.ref && q.cmp && q.cmp.v >= MIN));
    const m = sig.filter(q => q.ref && q.cmp);
    for (const q of m) if (!worst || Math.abs(q.shift) > Math.abs(worst.shift)) { worst = q; ch = r.label; }
    if (m.some(q => Math.abs(q.shift) > lim)) over++;
    if (sig.some(q => !q.ref || !q.cmp)) changed++;
    if (m.some(q => Math.abs(q.db) > ampLim)) amp++;
  }
  return { t, prev, axis: t.axis, worst: worst ? worst.shift : null, worstF: worst ? worst.ref.f : null, worstCh: ch, over, changed, amp, n: rows.length };
}
function runTable(ts, sigs, withDate = false) {
  const lim = P.profiles.signature.shiftLimitPct;
  let h = `<table class="tbl" id="ov-runs"><thead><tr>${withDate ? '<th>Date</th>' : ''}<th>Run</th><th>Axis</th><th>Test</th><th>Profile / level</th><th class="num">Control</th><th class="num">Max drive-axis</th><th>Sensor</th><th class="num">At (Hz)</th><th class="num">Max T (×)</th><th>Sensor</th><th class="num">At (Hz)</th><th>Signature vs previous</th><th>Check</th><th>Result / notes</th></tr></thead><tbody>`;
  for (const t of ts) {
    const m = computeMetrics(t); const key = m.kind === 'psd' ? 'grms' : 'peak'; const unit = m.kind === 'psd' ? ' gRMS' : ' g';
    const bd = bestRow(m, 'drive') || bestRow(m, 'all');
    const bt = m.rows.filter(r => !r.isControl && !r.flagged && r.tmax != null).sort((a, b) => b.tmax - a.tmax)[0] || null;
    const flagged = (m.perSensor || []).filter(p => p.chk && ['noisy', 'high', 'low', 'mismatch'].includes(p.chk.status));
    const sg = sigs.find(x => x.t.id === t.id);
    const sigCell = sg ? (sg.worst != null ? `<span style="${Math.abs(sg.worst) > lim ? 'color:var(--bad);font-weight:600' : 'color:var(--good)'}">${sg.worst > 0 ? '+' : ''}${fmt(sg.worst, 2)} %</span> <span class="muted small">at ${fmtF(sg.worstF)} Hz vs run ${sg.prev.run ?? '?'}${sg.over ? ' · ' + sg.over + ' ch over' : ''}${sg.changed ? ' · ' + sg.changed + ' ch lost/new' : ''}${sg.amp ? ' · ' + sg.amp + ' ch amplitude' : ''}</span>` : `<span class="muted small">no matched peaks vs run ${sg.prev.run ?? '?'}</span>`) : '';
    const prof = m.kind === 'psd' ? (m.profile ? `${esc(m.profile.custom ? m.profile.name : 'full')} · ${m.profile.db ? m.profile.db + ' dB' : '0 dB'} · ${m.profile.grms.toFixed(2)} gRMS` : '') : m.kind === 'srs' ? (srsProfileFor(t) ? esc(srsProfileFor(t).name) : '') : m.kind === 'sine' ? (m.profile ? esc(m.profile.label).replace('Profile ', '') + (specFileOf(t) ? ` · ${fmtF(specFileOf(t).x[0])}–${fmtF(specFileOf(t).x[specFileOf(t).x.length - 1])} Hz` : '') : '') : m.kind === 'srs' ? 'SRS' : '';
    const note = [t.status, t.notes ? t.notes.split('\n')[0].slice(0, 90) + (t.notes.length > 90 ? '…' : '') : ''].filter(Boolean).join(' · ');
    h += `<tr data-test="${t.id}" style="cursor:pointer" class="${t.hidden ? 'hid' : ''}">${withDate ? `<td class="small" style="white-space:nowrap">${esc(shortDate(sessDate(t)))}</td>` : ''}<td class="mono">${t.run ?? ''}</td><td><span class="pill axis">${t.axis}</span></td><td>${esc(t.name)}${t.hidden ? ' <span class="pill">hidden</span>' : ''}</td><td class="small">${prof}</td><td class="num">${m.control ? fmt(m.control[key]) + unit : ''}</td><td class="num" title="${bd ? esc(bd.label) : ''}">${bd ? fmt(bd[key]) + unit : ''}</td><td class="small">${bd ? esc(bd.sensorName) + ' ' + (bd.axis || '') : ''}</td><td class="num muted">${bd ? fmtF(bd.peakF) : ''}</td><td class="num">${bt ? fmt(bt.tmax, 3) : ''}</td><td class="small">${bt ? esc(bt.sensorName) + ' ' + bt.axis : ''}</td><td class="num muted">${bt ? fmtF(bt.tmaxF) : ''}</td><td>${sigCell}</td><td>${m.kind ? (flagged.length ? `<span class="pill bad" title="${esc(flagged.map(p => sensorLabel(p.sensor) + ': ' + LF_STATUS[p.chk.status][1]).join('\n'))}">${flagged.length} flagged</span>` : (m.lf?.usable ? '<span class="pill good">ok</span>' : '')) : ''}</td><td class="small" title="${esc(t.notes || '')}">${esc(note)}</td></tr>`;
  }
  return h + `</tbody></table><div class="small muted" style="margin-top:6px">Signature vs previous: worst frequency shift of the matched transmissibility peaks of 4× and above on the drive channels, against the previous sine sweep of the same axis in this session (limit ${lim} %; the Signatures tab has every peak and channel). For random runs the response value is gRMS over the profile band and Max T is √(PSD ratio).</div>`;
}
function topResponses(ts, n = 8) {
  const rand = [], sine = [];
  for (const t of ts) { const m = computeMetrics(t); if (!m.kind) continue; for (const r of m.rows) { if (r.isControl || r.flagged) continue; if (m.kind === 'psd' && r.grms != null) rand.push({ t, r, v: r.grms }); else if (m.kind === 'sine' && r.peak != null) sine.push({ t, r, v: r.peak }); } }
  const pick = arr => arr.sort((a, b) => b.v - a.v).slice(0, n);
  return { rand: pick(rand), sine: pick(sine) };
}
function bestRow(m, which = 'drive') {
  const key = m.kind === 'psd' ? 'grms' : 'peak';
  // channels of sensors the low-frequency check flagged (noise, bad sensitivity) do not compete for the headline numbers
  const pool = m.rows.filter(r => !r.isControl && !r.flagged && (which === 'drive' ? r.inAxis : which === 'cross' ? !r.inAxis : true));
  return pool.slice().sort((a, b) => (b[key] || 0) - (a[key] || 0))[0] || null;
}
function checkSummary(ts) {
  let flagged = 0, checked = 0;
  for (const t of ts) { const m = computeMetrics(t); for (const p of m.perSensor || []) { if (p.chk && p.chk.status !== 'nodata' && p.chk.status !== 'noband') { checked++; if (['noisy', 'high', 'low', 'mismatch'].includes(p.chk.status)) flagged++; } } }
  if (!checked) return 'no channel check yet';
  return flagged ? `<span class="pill bad">${flagged} channel check flags</span>` : '<span class="pill good">channel checks clean</span>';
}
function copyTable(tbl) {
  if (!tbl) return; const rows = Array.from(tbl.rows).map(r => Array.from(r.cells).map(c => c.innerText.trim()).join('\t')).join('\n');
  navigator.clipboard?.writeText(rows).then(() => toast('Copied to clipboard'), () => toast('Clipboard blocked; select the table and copy manually', true));
}
function makeResizableTables(root) {
  $$('table.tbl th', root).forEach(th => { if (th.querySelector('.rz')) return; const rz = document.createElement('span'); rz.className = 'rz'; th.appendChild(rz); rz.onmousedown = e => { e.preventDefault(); const sx = e.clientX, sw = th.offsetWidth; const mv = ev => { th.style.width = th.style.minWidth = Math.max(40, sw + ev.clientX - sx) + 'px'; }; const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); }; addEventListener('mousemove', mv); addEventListener('mouseup', up); }; });
}

/* Profiles a test can use: the library entries of its type (random or SRS) for its axis, plus the default. */
function profileOptions(t) {
  const type = kindById(t.kind).type; const cur = t.profile || 'full';
  if (type === 'random') return `<option value="full" ${cur === 'full' ? 'selected' : ''}>Full-level PSD (${psdGrms(P.profiles.random.bp).toFixed(2)} gRMS at 0 dB)</option>` + libFor('random', t.axis).map(p => `<option value="${p.id}" ${cur === p.id ? 'selected' : ''}>${esc(p.name)} · ${psdGrms(p.bp).toFixed(2)} gRMS</option>`).join('');
  if (type === 'srs') return `<option value="full" ${cur === 'full' ? 'selected' : ''}>Default (first SRS profile in the library)</option>` + libFor('srs', t.axis).map(p => `<option value="${p.id}" ${cur === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  return `<option value="full">Not used for this kind of test</option>`;
}

function saveSensorTemplate(s) {
  modal('Save sensor set as a template', `<div class="field"><label>Name</label><input class="input" id="m-tn" value="${esc(s.name)} sensors"></div><p class="small muted">The template is stored in this project and offered when you create a session or load a template in Sensors and 3D.</p>`,
    [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => { P.sensorTemplates = P.sensorTemplates || []; P.sensorTemplates.push({ id: uid(), name: $('#m-tn').value.trim() || s.name, sensors: JSON.parse(JSON.stringify(sensorsOf(s))), model3d: s.model3d, rotation: s.rotation || 0 }); persist(); toast('Sensor template saved'); } }]);
}

/* Axes in the order they were (or will be) tested: by the first run number in each axis, then by when the slots were created. */
function axisOrder(ts) {
  const ax = [...new Set(ts.map(t => t.axis))];
  const key = a => { const l = ts.filter(t => t.axis === a); const r = Math.min(...l.map(t => t.run ?? Infinity)); return [r, Math.min(...l.map(t => P.tests.indexOf(t))), AXES.indexOf(a)]; };
  return ax.sort((a, b) => { const A = key(a), B = key(b); return (A[0] - B[0]) || (A[1] - B[1]) || (A[2] - B[2]); });
}
