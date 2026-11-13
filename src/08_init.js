/* ===== Init, global events, project save/load, embedded data ===== */
function migrateProject(obj) {
  if (!Array.isArray(obj.campaigns)) obj.campaigns = [];
  (obj.sessions || []).forEach(migrateSession);
  siteMigrate(obj);
  // generic upgrade of projects saved by builds before v2.7 (sites can do more in siteMigrate)
  if (!obj.v27) {
    const pr = obj.profiles = obj.profiles || {}; if (!Array.isArray(pr.library)) pr.library = defaultLibrary();
    for (const t of obj.tests || []) { if (t.hidden == null) t.hidden = false; if (!t.profile) t.profile = 'full'; if (t.levelDb === undefined) t.levelDb = null; }
    for (const f of obj.files || []) { if (f.cols) splitLimitColumns(f); if (f.kind === 'rms' && f.cols) cleanHistory(f); }
    for (const s of obj.sessions || []) if (s.rotation == null) s.rotation = 0;
    obj.v25 = obj.v27 = obj.v272 = true;
  }
  return obj;
}
async function gzipText(txt) { if (typeof CompressionStream === 'undefined') return null; const cs = new Blob([txt]).stream().pipeThrough(new CompressionStream('gzip')); return await new Response(cs).blob(); }
async function gunzipBlob(blob) { return await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text(); }
async function saveProjectFile() {
  P.app = APP.name + ' ' + APP.version; const json = JSON.stringify(P);
  // compressed by default (about a quarter of the size); Load project reads both .json and .json.gz
  let blob = await gzipText(json); let ext = '.json.gz'; if (!blob) { blob = new Blob([json], { type: 'application/json' }); ext = '.json'; }
  const filename = (P.name || 'vibescope').replace(/[^\w.-]+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + ext;
  // Hosted viewer: go through the downloads capability (viewer confirms). Local file: plain download.
  if (window.claude && typeof window.claude.use === 'function') {
    try { const dl = await window.claude.use('downloads'); if (dl) { await dl.save({ filename, data: blob }); toast('Project saved (' + (blob.size / 1e6).toFixed(1) + ' MB)'); return; } }
    catch (e) { if (e && e.code === 'declined') return; toast('Save did not go through: ' + (e?.message || e), true); return; }
  }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Project file saved (' + (blob.size / 1e6).toFixed(1) + ' MB)');
}
async function loadProjectFile(file) {
  try { const head = new Uint8Array(await file.slice(0, 2).arrayBuffer()); const gz = head[0] === 0x1f && head[1] === 0x8b; if (gz && typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed project files; use Chrome or Edge'); const txt = gz ? await gunzipBlob(file) : await file.text(); const obj = JSON.parse(txt); if (!obj || !Array.isArray(obj.sessions) || !Array.isArray(obj.files)) throw new Error('Not a project file');
    migrateProject(obj);
    modal('Load project', `<p>"${esc(obj.name || file.name)}" has ${obj.sessions.length} session(s), ${obj.tests.length} tests and ${obj.files.length} files${obj.app ? ` (saved from ${esc(obj.app)})` : ''}.</p><p class="small muted">Merge adds its sessions next to the ones already here. Replace discards what is in this browser first.</p>`, [{ label: 'Cancel' }, { label: 'Merge into current', onClick: () => { mergeProject(obj); LF_CACHE.clear(); M_CACHE.clear(); persist(); render(); } }, { label: 'Replace current', primary: true, onClick: () => { P = obj; P.profiles = Object.assign(defaultProfiles(), P.profiles || {}); UI.sessionId = (P.sessions.find(s => !s.hidden) || P.sessions[0])?.id || null; for (const s of P.sessions) if (s.collapsed == null) s.collapsed = s.id !== UI.sessionId; UI.testId = null; UI.compare.tests = []; UI.chan = {}; LF_CACHE.clear(); M_CACHE.clear(); persist(); render(); } }]);
  } catch (e) { toast('Could not load: ' + e.message, true); }
}
function mergeProject(obj) {
  const idmap = {};
  for (const s of obj.sessions) { const n = { ...s, id: uid() }; idmap[s.id] = n.id; if (P.sessions.some(x => x.name === n.name)) n.name += ' (imported)'; P.sessions.push(n); }
  for (const t of obj.tests) { const n = { ...t, id: uid(), sessionId: idmap[t.sessionId] || t.sessionId, fileIds: [] }; idmap[t.id] = n.id; P.tests.push(n); }
  for (const f of obj.files) { const n = { ...f, id: uid(), sessionId: idmap[f.sessionId] || f.sessionId, testId: idmap[f.testId] || null }; P.files.push(n); if (n.testId) { const t = P.tests.find(t => t.id === n.testId); if (t) t.fileIds.push(n.id); } }
}
function applyTheme(t) { UI.theme = t; if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); try { localStorage.setItem('vv-theme', t || ''); } catch (e) { } }
function currentThemeIsDark() { const t = document.documentElement.getAttribute('data-theme'); if (t) return t === 'dark'; return matchMedia('(prefers-color-scheme: dark)').matches; }
function referenceHtml() {
  return `<p class="small muted">${APP.name} v${APP.version} (${APP.date})</p>
  <p><strong>Import.</strong> Drag the data exports (xlsx, csv or txt from your controller or DAQ) anywhere onto the page, or use Import files. The file name is read for run number, axis, test type and level, and files from the same run are grouped into one test. Anything the detector is not sure about is listed in Files for manual placement.</p>
  <p><strong>Sessions and tests.</strong> A session is one test campaign with one sensor arrangement. Right-click a session or test for rename, duplicate, delete, and more. Drag files from the Files tab onto a test in the left panel.</p>
  <p><strong>Sensors.</strong> The Sensors and 3D tab holds one row per accelerometer: location, brand, serial, the sensitivities entered in the controller, and which input numbers carry its X, Y and Z. The channel map is built from this table. Paste the lab's channel sheet, or start from a saved sensor template. Positions r, angle, z place the marker in the 3D view.</p>
  <p><strong>Channel check.</strong> Below the first mode the article moves with the table, so each channel's ratio to the control tells which sensor axis points along the shaker. The tool uses this to pick the drive channel of every sensor (no assumption that sensor X is test X), to flag channels that read noise or a wrong sensitivity, and to show whether the three axis runs are consistent.</p>
  <p><strong>Test view.</strong> With many sensors the plot starts with one line per sensor (its drive channel). Click chips to add or hide channels, double-click to show only one, and use the per-sensor grid (S, M, L = 3, 2, 1 plots per row) to see every axis of every sensor. Tables: per sensor, per channel, and resonance peaks. Use the camera icon on a plot to export it as PNG.</p>
  <p><strong>Reports.</strong> Drop the controller's .doc/.docx/.pdf report together with the data; it attaches to the test with the same run number and an Open report button appears in the test view. You can also paste a SharePoint link per test.</p>
  <p><strong>Compare.</strong> Overlay the same channel across levels (linearity), across axes, or across sessions (before and after a fix).</p>
  <p><strong>Signatures.</strong> Pick a reference low level sweep and the sweeps run after the qualification runs. For every channel the transmissibility peaks are matched and the frequency shift is shown against the limit; lost and new peaks and amplitude changes are flagged too. Sweeps from other sessions (the 23 Oct low level runs, say) can be compared as long as the inputs are the same.</p>
  <p><strong>Sharing.</strong> Everything is stored in this browser. Save project writes one JSON file with all data; a teammate opens the same tool and uses Load project. Keep the HTML file on the shared drive so everyone has the same version.</p>
  <p><strong>Hiding.</strong> Right-click a test or session (or use Hide in the test header) to hide check runs, runs done at the wrong level and faulty sets. They stay in the project and come back with "show hidden" at the bottom of the left panel. Tests are listed in run order.</p>
  <p><strong>Left panel.</strong> Tests are in run order; drag one onto another to reorder it within its axis group (or Move up / Move down in the menu; Reset manual order in the session menu goes back to run order). Ctrl/Cmd-click or Shift-click selects several tests for one right-click menu: add to compare, hide, copy, duplicate, delete. Ctrl+C / Ctrl+V copy test definitions between sessions. Ctrl+Z / Ctrl+Y (or the arrows in the top bar) undo and redo every change to sessions, tests, profiles and file assignments. The "hidden" box at the top of the panel shows the hidden tests and sessions. The ☰ button hides the panel to give the plots the full width.</p>
  <p><strong>Profiles.</strong> Profiles and settings holds a library of random PSDs and SRS curves with the controller's channel limits (input, level, band). Each random or SRS test points at the profile it was run against (Edit test), which sets the curve, tolerance lines and the limit lines on the per-sensor plots. Breakpoints paste straight from a spreadsheet. When the controller export carries its limit lines ("Limit N-Abort(f)"), those are used instead, since they show exactly what was entered.</p>
  <p><strong>Planning a session.</strong> Right-click a session, Plan runs: one line per axis such as "X: sig, 0, sig, sig, srs, sig". The slots are created in run order with the chosen profiles, and imported files fall into them (signature sweeps fill the planned signature slots in order). Sensor sets can be saved as templates and reused for another session; the 3D model is parametric (telescope, box or cylinder payload) and the payload can be rotated on the fixture.</p>
  ${typeof SITE_HISTORY !== 'undefined' ? SITE_HISTORY : ''}
  <p class="small muted">Shortcuts: <kbd>Esc</kbd> closes dialogs. <kbd>Ctrl</kbd>-click selects several files for dragging.</p>`;
}
function helpDialog() { guideDialog(0); }

async function boot() {
  try { const t = localStorage.getItem('vv-theme'); if (t) applyTheme(t); } catch (e) { }
  const saved = await idbGet('project');
  try { await inflateEmbedded(); } catch (e) { console.error('bundled data', e); }
  let added = [];
  if (saved && saved.sessions) {
    P = migrateProject(saved); P.profiles = Object.assign(defaultProfiles(), P.profiles || {});
    // adding bundled sessions must never stop the app from starting
    try { added = addMissingBundled(); if (added.length) persist(); } catch (e) { console.error('bundled sessions', e); setTimeout(() => toast('Could not add the bundled sessions to the saved project: ' + (e?.message || e) + '. Use Reload bundled sessions in Profiles and settings.', true), 500); }
  }
  else { P = newProject(); try { loadEmbedded(); } catch (e) { console.error('embedded', e); } persist(); }
  siteAfterBundled(added);
  if (!P.sessions.some(s => s.id === UI.sessionId && (!s.hidden || UI.showHidden))) UI.sessionId = visibleSessions()[0]?.id || P.sessions[0]?.id || null;
  // the left panel starts with only the active session open
  for (const s of P.sessions) if (s.collapsed == null) s.collapsed = s.id !== UI.sessionId;
  // events
  $$('#tabs .tab').forEach(b => b.onclick = () => { UI.tab = b.dataset.tab; render(); $('#view').scrollTop = 0; $('#sidebar').classList.remove('open'); });
  $('#btn-import').onclick = () => $('#file-input').click();
  $('#file-input').onchange = e => { const rv = e.target.dataset.review === '1'; e.target.dataset.review = ''; importFiles(e.target.files, null, { review: rv }); e.target.value = ''; };
  $('#btn-save').onclick = saveProjectFile;
  $('#btn-load').onclick = () => $('#proj-input').click();
  $('#proj-input').onchange = e => { if (e.target.files[0]) loadProjectFile(e.target.files[0]); e.target.value = ''; };
  $('#btn-theme').onclick = () => { applyTheme(currentThemeIsDark() ? 'light' : 'dark'); render(); };
  $('#btn-undo').onclick = undo; $('#btn-redo').onclick = redo;
  document.addEventListener('keydown', e => {
    if (inEditable(e.target) || $('#modal').classList.contains('show')) return;
    const mod = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase();
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((mod && k === 'y') || (mod && k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    else if (mod && k === 'c' && UI.sel.size) { e.preventDefault(); copyTests([...UI.sel].map(id => P.tests.find(t => t.id === id)).filter(Boolean)); }
    else if (mod && k === 'v' && UI.clip.length) { e.preventDefault(); pasteTests(activeSession()); }
    else if (k === 'escape' && UI.sel.size) { UI.sel.clear(); renderTree(); }
  });
  $('#btn-help').onclick = helpDialog;
  $('#company').onclick = brandDialog;
  $('#btn-menu').onclick = () => { if (innerWidth <= 760) $('#sidebar').classList.toggle('open'); else { const c = $('#body').classList.toggle('sb-collapsed'); try { localStorage.setItem('vv-sb', c ? '1' : ''); } catch (e) { } setTimeout(() => { for (const el of livePlots.values()) { try { Plotly.Plots.resize(el); } catch (e) { } } }, 50); } };
  try { if (localStorage.getItem('vv-sb') === '1') $('#body').classList.add('sb-collapsed'); } catch (e) { }
  $('#btn-new-session').onclick = () => UI.treeMode === 'campaign' ? newCampaignDialog([]) : editSessionDialog(null);
  $('#btn-new-test').onclick = () => editTestDialog(null);
  $('#btn-autobuild').onclick = () => { const s = activeSession(); if (!s) { toast('Create a session first', true); return; } if (!buildStandardMatrix(s.id)) toast('Standard matrix already present'); persist(); render(); };
  $('#modal-x').onclick = closeModal; $('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
  // sidebar resize
  const db = $('#dragbar'); db.onmousedown = e => { e.preventDefault(); db.classList.add('active'); const mv = ev => { document.documentElement.style.setProperty('--sidebar-w', clamp(ev.clientX, 200, 560) + 'px'); }; const up = () => { db.classList.remove('active'); removeEventListener('mousemove', mv); removeEventListener('mouseup', up); try { localStorage.setItem('vv-sidebar', getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w')); } catch (e) { } }; addEventListener('mousemove', mv); addEventListener('mouseup', up); };
  try { const w = localStorage.getItem('vv-sidebar'); if (w) document.documentElement.style.setProperty('--sidebar-w', w); } catch (e) { }
  // global drag and drop of files
  let dragDepth = 0; const gd = $('#globaldrop');
  addEventListener('dragenter', e => { if (e.dataTransfer?.types?.includes('Files')) { dragDepth++; gd.classList.add('show'); } });
  addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) gd.classList.remove('show'); });
  addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
  addEventListener('drop', e => { dragDepth = 0; gd.classList.remove('show'); if (e.dataTransfer?.files?.length && !e.target.closest('.tnode,#dz')) { e.preventDefault(); importFiles(e.dataTransfer.files); } });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => render());
  $('#ver').textContent = 'v' + APP.version; document.title = APP.name + ' v' + APP.version;
  historyInit();
  render();
  setStatus(P.files.length ? `${P.files.length} files · ${P.tests.length} tests` : 'Ready');
  siteBootNotice(added);
}
boot();
