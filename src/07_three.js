/* ===== Sensors tab and 3D view ===== */
const ORIENTS = ['', '+X', '-X', '+Y', '-Y', '+Z', '-Z'];

function sensorTable(s) {
  const num = (x, k, sub, w = 68, step = 'any') => `<input class="input small num" type="number" step="${step}" value="${sub ? (x[k]?.[sub] ?? '') : (x[k] ?? '')}" data-sid="${x.id}" data-k="${k}" ${sub ? `data-sub="${sub}"` : ''} style="width:${w}px">`;
  const txt = (x, k, w, ph = '') => `<input class="input small" value="${esc(x[k] ?? '')}" data-sid="${x.id}" data-k="${k}" style="width:${w}px" placeholder="${ph}">`;
  const sel = (x, k, sub, opts) => `<select class="input small" data-sid="${x.id}" data-k="${k}" ${sub ? `data-sub="${sub}"` : ''} style="min-width:${sub ? 52 : 92}px">${opts.map(o => `<option value="${o}" ${(sub ? x[k]?.[sub] : x[k]) === o ? 'selected' : ''}>${o || '–'}</option>`).join('')}</select>`;
  const rows = s.sensors.slice().sort((a, b) => (a.id === 'CTRL' ? -1 : b.id === 'CTRL' ? 1 : (a.pos ?? 99) - (b.pos ?? 99)));
  return `<table class="tbl" id="s3-sensors"><thead><tr><th>#</th><th>Location / name</th><th>Part</th><th>Brand</th><th>S/N</th><th class="num" title="Sensitivity entered in the controller, mV/g">Sens X</th><th class="num">Sens Y</th><th class="num">Sens Z</th><th title="Controller input number">In X</th><th>In Y</th><th>In Z</th><th title="Which test axis this sensor axis points along, if known. Leave blank to let the low-frequency check decide.">Pts X</th><th>Pts Y</th><th>Pts Z</th><th>Colour</th><th class="num" title="3D position: radius from the fixture centre, mm">r</th><th class="num" title="3D position: angle from +X towards +Y, degrees">angle</th><th class="num" title="3D position: height above the table, mm">z</th><th>Note</th><th></th></tr></thead><tbody>` +
    rows.map(x => x.id === 'CTRL'
      ? `<tr><td class="mono">C</td><td>${txt(x, 'name', 150)}</td><td class="small">table</td><td></td><td></td><td></td><td></td><td></td><td>${num(x, 'ch', 'C', 46, 1)}</td><td></td><td></td><td></td><td></td><td></td><td><input type="color" value="${x.color}" data-sid="${x.id}" data-k="color" class="colr"></td><td>${num(x, 'p3', 'r', 58)}</td><td>${num(x, 'p3', 'angle', 58)}</td><td>${num(x, 'p3', 'z', 58)}</td><td>${txt(x, 'note', 160)}</td><td></td></tr>`
      : `<tr><td>${num(x, 'pos', null, 46, 1)}</td><td>${txt(x, 'name', 150)}</td><td>${sel(x, 'part', null, PARTS)}</td><td>${txt(x, 'brand', 70)}</td><td>${txt(x, 'serial', 80)}</td><td>${num(x, 'sens', 'X')}</td><td>${num(x, 'sens', 'Y')}</td><td>${num(x, 'sens', 'Z')}</td><td>${num(x, 'ch', 'X', 46, 1)}</td><td>${num(x, 'ch', 'Y', 46, 1)}</td><td>${num(x, 'ch', 'Z', 46, 1)}</td><td>${sel(x, 'orient', 'X', ORIENTS)}</td><td>${sel(x, 'orient', 'Y', ORIENTS)}</td><td>${sel(x, 'orient', 'Z', ORIENTS)}</td><td><input type="color" value="${x.color}" data-sid="${x.id}" data-k="color" class="colr"></td><td>${num(x, 'p3', 'r', 58)}</td><td>${num(x, 'p3', 'angle', 58)}</td><td>${num(x, 'p3', 'z', 58)}</td><td>${txt(x, 'note', 160)}</td><td><button class="btn ghost small danger" data-sdel="${x.id}" title="Remove sensor">✕</button></td></tr>`).join('') + `</tbody></table>`;
}
function mapTable(s, map, tag) {
  return `<table class="tbl" data-map="${tag}"><thead><tr><th>Ch</th><th>Sensor</th><th>Axis</th></tr></thead><tbody>` +
    Object.keys(map).map(Number).sort((a, b) => a - b).map(ch => `<tr><td class="mono">${ch}</td><td><select class="input small" data-ch="${ch}" data-k="sensor">${s.sensors.map(x => `<option value="${x.id}" ${map[ch].sensor === x.id ? 'selected' : ''}>${esc(sensorLabel(x))}</option>`).join('')}</select></td><td><select class="input small" data-ch="${ch}" data-k="axis">${['X', 'Y', 'Z', 'C'].map(a => `<option ${map[ch].axis === a ? 'selected' : ''}>${a}</option>`).join('')}</select></td></tr>`).join('') + `</tbody></table>`;
}
function checkTestOptions(s) { return testsOfSession(s.id).filter(t => specFileOf(t) && specFileOf(t).kind !== 'srs').sort((a, b) => AXES.indexOf(a.axis) - AXES.indexOf(b.axis) || kindById(a.kind).order - kindById(b.kind).order); }
function channelCheckHtml(s, t) {
  if (!t) return '<div class="small muted">Import a sine sweep or random run for this session first. The check uses the band below the first mode where the article moves with the table.</div>';
  const lf = lfCheck(t); if (!lf) return '<div class="small muted">No spectrum file in this test.</div>';
  if (!lf.usable) return `<div class="small muted">This file starts at ${fmtF(lf.file.x[0])} Hz, above the rigid-body band, so the check cannot run on it. Use the 5 to 2000 Hz sweep or the random run.</div>`;
  let h = `<div class="small muted" style="margin-bottom:6px">Median ratio to control between ${fmtF(lf.band[0])} and ${fmtF(lf.band[1])} Hz, ${t.axis} axis drive. Expected: one channel near 1, the others near 0; |r| near 1.</div><table class="tbl"><thead><tr><th>Sensor</th><th class="num">X</th><th class="num">Y</th><th class="num">Z</th><th class="num">|r|</th><th>Drive ch</th><th class="num">Angle</th><th>Status</th><th>Note</th></tr></thead><tbody>`;
  for (const x of sensorsOf(s)) {
    const r = lf.sensors.get(x.id); if (!r) continue; const [cls, lbl] = LF_STATUS[r.status];
    const cell = ax => { const v = r.ratio[ax]; if (v == null) return '<td class="num muted">–</td>'; const strong = r.dom === ax; return `<td class="num" style="${strong ? 'font-weight:600' : ''}">${fmt(v, 2)}</td>`; };
    const physical = ['ok', 'tilted', 'mismatch'].includes(r.status);
    h += `<tr><td><span class="sw" style="background:${x.color}"></span>${esc(sensorLabel(x))}</td>${cell('X')}${cell('Y')}${cell('Z')}<td class="num">${r.mag != null ? fmt(r.mag, 2) : ''}</td><td>${r.dom && physical ? `<span class="pill ${r.declared && r.declared !== r.dom ? 'bad' : 'good'}">${r.dom}</span>` : '<span class="muted">–</span>'}${r.declared ? ` <span class="small muted">declared ${r.declared}</span>` : ''}</td><td class="num">${r.tilt != null && physical ? fmt(r.tilt, 2) + '°' : '–'}</td><td><span class="pill ${cls}">${lbl}</span></td><td class="small">${esc(r.note || '')}</td></tr>`;
  }
  return h + '</tbody></table>';
}
function orientationHtml(s) {
  const tests = checkTestOptions(s).filter(t => lfCheck(t)?.usable);
  const byAxis = {}; for (const ax of AXES) { const t = tests.find(t => t.axis === ax && t.kind === 'lowsine') || tests.find(t => t.axis === ax); if (t) byAxis[ax] = t; }
  const axes = AXES.filter(a => byAxis[a]); if (axes.length < 2) return '';
  let h = `<div class="small muted" style="margin:10px 0 6px">Drive channel per test axis (from ${axes.map(a => a + ': ' + esc(byAxis[a].name) + (byAxis[a].run != null ? ' #' + byAxis[a].run : '')).join(', ')}). Each sensor axis should appear once per row; a repeated letter means two shaker axes land on the same sensor axis, which points to a wiring or labelling error.</div><table class="tbl"><thead><tr><th>Sensor</th>${axes.map(a => `<th>${a} test</th>`).join('')}<th></th></tr></thead><tbody>`;
  for (const x of sensorsOf(s)) {
    const doms = axes.map(a => lfCheck(byAxis[a])?.sensors.get(x.id)); const letters = doms.map(r => r?.dom).filter(Boolean);
    const clear = doms.filter(r => r && r.dom && ['ok', 'tilted'].includes(r.status) && r.tilt != null && r.tilt < 35).map(r => r.dom);
    const dup = new Set(clear).size !== clear.length; const diag = !dup && new Set(letters).size !== letters.length;
    h += `<tr><td><span class="sw" style="background:${x.color}"></span>${esc(sensorLabel(x))}</td>${doms.map(r => r && r.dom ? `<td><span class="pill ${['ok', 'tilted'].includes(r.status) ? 'good' : 'bad'}">${r.dom}</span> <span class="small muted">${fmt(r.ratio[r.dom], 2)}${r.tilt > 25 ? ' · ' + fmt(r.tilt, 2) + '°' : ''}</span></td>` : '<td class="muted">–</td>').join('')}<td>${dup ? '<span class="pill bad">repeated axis</span>' : diag ? '<span class="pill warn" title="Two shaker axes land on the same pair of sensor axes at about 45°, so the dominant one is a coin toss. Normal for a sensor mounted diagonally.">45° mount</span>' : letters.length === axes.length ? '<span class="pill good">consistent</span>' : ''}</td></tr>`;
  }
  return h + '</tbody></table>';
}
function renderSensors(v) {
  const s = activeSession(); if (!s) { v.innerHTML = '<div class="empty">No session.</div>'; return; }
  const opts = checkTestOptions(s); const at = activeTest();
  const usable = t => !!lfCheck(t)?.usable;
  if (!UI.checkTest || !opts.some(t => t.id === UI.checkTest)) UI.checkTest = (at && opts.some(t => t.id === at.id) && usable(at)) ? at.id : (opts.find(t => t.kind === 'lowsine' && usable(t)) || opts.find(usable) || opts[0])?.id || null;
  const ct = opts.find(t => t.id === UI.checkTest) || null;
  const models = [['fixture', 'Fixture'], ...(SITE.telescope ? [['fixture+telescope', 'Telescope']] : []), ['fixture+box', 'Box'], ['fixture+cylinder', 'Cylinder'], ['none', 'Markers only']];
  let html = `<div class="section-h"><h2>Sensors and 3D</h2><span class="sub">${esc(s.name)} · ${sensorsOf(s).length} sensors · ${Object.keys(chmapOf(s)).length} channels</span><span style="flex:1"></span><button class="btn small" id="s3-copy">Copy from session…</button><button class="btn small" id="s3-export">Copy table as TSV</button></div>
  <div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Sensor table</h3><span class="hint">One row per accelerometer: where it sits, its serial and sensitivities, and which controller inputs carry its X, Y and Z. "Pts" is optional: the test axis a sensor axis points along, when you know it from the installation.</span><button class="btn small" id="s3-add">+ sensor</button><button class="btn small" id="s3-paste" title="Paste rows from a spreadsheet: #, location, brand, S/N, sens X, Y, Z, input X, Y, Z, part">Paste sheet</button><button class="btn small" id="s3-preset" title="Replace the sensors with a saved or built-in sensor set">Load template…</button><button class="btn small" id="s3-savet" title="Save this sensor set so it can be reused for another session">Save as template</button></div><div class="card-b tbl-wrap">${sensorTable(s)}</div></div>
  <div class="grid2" style="grid-template-columns:minmax(420px,1fr) minmax(0,1fr)">
   <div class="stack">
    <div class="card"><div class="card-h"><h3>Channel check</h3><select class="input small" id="s3-ctest" style="max-width:260px">${opts.map(t => `<option value="${t.id}" ${t.id === UI.checkTest ? 'selected' : ''}>${t.axis} · ${esc(t.name)}${t.run != null ? ' #' + t.run : ''}</option>`).join('')}</select></div><div class="card-b tbl-wrap">${channelCheckHtml(s, ct)}${orientationHtml(s)}</div></div>
    <details class="card"><summary class="card-h" style="cursor:pointer"><h3 style="display:inline">Relabelled inputs for X and Y tests (advanced)</h3><span class="hint" style="margin-left:8px">${s.useInPlaneMap ? 'on' : 'off'}</span></summary><div class="card-b tbl-wrap"><label class="chk small" style="margin-bottom:8px"><input type="checkbox" id="s3-useip" ${s.useInPlaneMap ? 'checked' : ''}> use a separate input map for X and Y tests</label><div id="s3-ipwrap" class="${s.useInPlaneMap ? '' : 'hidden'}">${mapTable(s, s.chmapInPlane || chmapOf(s), 'ip')}<div class="row" style="margin-top:8px"><button class="btn small" id="s3-copyip">Reset from the sensor table</button><span class="hint">Only needed when the lab renamed the inputs on the controller between shakers (the 21 Oct bare-fixture runs). With generic input names, leave this off.</span></div></div></div></details>
   </div>
   <div class="card"><div class="card-h"><h3>3D view</h3><div class="seg">${models.map(([k, l]) => `<button data-model="${k}" class="${(s.model3d || 'fixture') === k ? 'active' : ''}">${l}</button>`).join('')}</div><span class="small muted" title="Payload rotation about Z relative to the fixture. Payload sensors (part telescope or other) are entered in the payload frame and turn with it; fixture and table sensors do not.">rotation</span><input class="input small" type="number" step="any" id="s3-rot" value="${s.rotation ?? 0}" style="width:64px"><span class="small muted">°</span><label class="chk small"><input type="checkbox" id="s3-show" ${s.show3D ? 'checked' : ''}> markers</label><button class="btn small" id="s3-reset">Reset view</button></div><div id="three-wrap"><div id="three-legend"></div><button class="btn small" id="three-leg-btn" title="Show or hide the marker legend">Legend</button></div><div class="card-b small muted">Drag to orbit, wheel to zoom, right-drag to pan. Marker positions come from r, angle and z in the table and are approximate: edit them to match the installation photos. Payload sensors are placed in the payload frame and turned with the payload rotation; the small grey arrow on the payload shows its +X. The telescope is representative, not from a drawing: three bipods at 120° on the fixture ring carry the base plate, the tube with M1 and the M2 spider sits on top, and the lower metering structure (M3 to M5) and the camera hang below the base plate into the fixture cavity. The first bipod angle is set in Edit session.</div></div>
  </div>`;
  v.innerHTML = html;
  const save = (rerender = false) => { persist(); LF_CACHE.clear(); M_CACHE.clear(); if (rerender) { UI.chan = {}; render(); } else { update3D(s); renderTree(); } };
  $$('#s3-sensors input, #s3-sensors select', v).forEach(el => el.onchange = () => {
    const x = s.sensors.find(q => q.id === el.dataset.sid); if (!x) return; const k = el.dataset.k, sub = el.dataset.sub;
    const val = el.type === 'number' ? (el.value === '' ? null : parseFloat(el.value)) : el.value;
    if (sub) { if (!x[k]) x[k] = {}; x[k][sub] = val; } else x[k] = val;
    const rerender = k === 'ch' || k === 'orient' || k === 'pos' || k === 'part';
    save(rerender);
  });
  $$('[data-sdel]', v).forEach(b => b.onclick = () => { const x = s.sensors.find(q => q.id === b.dataset.sdel); confirmDialog(`Remove ${sensorLabel(x)} from this session?`, () => { s.sensors = s.sensors.filter(q => q !== x); save(true); }); });
  $('#s3-add').onclick = () => { const n = Math.max(0, ...sensorsOf(s).map(x => x.pos || 0)) + 1; const last = sensorsOf(s).slice(-1)[0]; const c = last ? Math.max(...Object.values(last.ch || {}).filter(v => v != null)) + 1 : 2; s.sensors.push(newSensor(n, { ch: { X: c, Y: c + 1, Z: c + 2 } })); save(true); };
  $('#s3-preset').onclick = () => modal('Load sensor template', `<div class="field"><label>Template</label><select class="input" id="m-tpl">${sensorTemplates().map(t => `<option value="${t.id}">${esc(t.name)}${t.user ? ' (saved)' : ''}</option>`).join('')}</select></div><p class="small muted">Replaces the sensors of this session. The control channel is kept.</p>`, [{ label: 'Cancel' }, { label: 'Load', primary: true, onClick: () => { const t = sensorTemplates().find(q => q.id === $('#m-tpl').value); if (!t) return; s.sensors = [s.sensors.find(x => x.id === 'CTRL') || controlSensor(), ...t.make()]; if (t.model3d && (!s.model3d || s.model3d === 'fixture')) s.model3d = t.model3d; if (t.rotation != null && !s.rotation) s.rotation = t.rotation; save(true); } }]);
  $('#s3-savet').onclick = () => saveSensorTemplate(s);
  $('#s3-paste').onclick = () => pasteSheetDialog(s);
  $('#s3-export').onclick = () => { const lines = [['#', 'Location', 'Part', 'Brand', 'S/N', 'Sens X', 'Sens Y', 'Sens Z', 'In X', 'In Y', 'In Z', 'Pts X', 'Pts Y', 'Pts Z', 'Note'].join('\t')]; for (const x of sensorsOf(s)) lines.push([x.pos, x.name, x.part, x.brand, x.serial, x.sens?.X ?? '', x.sens?.Y ?? '', x.sens?.Z ?? '', x.ch?.X ?? '', x.ch?.Y ?? '', x.ch?.Z ?? '', x.orient?.X ?? '', x.orient?.Y ?? '', x.orient?.Z ?? '', x.note || ''].join('\t')); navigator.clipboard?.writeText(lines.join('\n')).then(() => toast('Sensor table copied'), () => toast('Clipboard blocked', true)); };
  $('#s3-ctest').onchange = e => { UI.checkTest = e.target.value; render(); };
  $('#s3-show').onchange = e => { s.show3D = e.target.checked; save(); };
  $('#s3-rot').onchange = e => { s.rotation = parseFloat(e.target.value) || 0; persist(); update3D(s, true); };
  $$('[data-model]', v).forEach(b => b.onclick = () => { s.model3d = b.dataset.model; $$('[data-model]', v).forEach(q => q.classList.toggle('active', q === b)); persist(); update3D(s); });
  $$('[data-map="ip"] select', v).forEach(el => el.onchange = () => { if (!s.chmapInPlane) s.chmapInPlane = JSON.parse(JSON.stringify(chmapOf(s))); s.chmapInPlane[el.dataset.ch][el.dataset.k] = el.value; save(); });
  $('#s3-useip').onchange = e => { s.useInPlaneMap = e.target.checked; if (s.useInPlaneMap && !s.chmapInPlane) s.chmapInPlane = JSON.parse(JSON.stringify(chmapOf(s))); save(true); };
  $('#s3-copyip').onclick = () => { s.chmapInPlane = JSON.parse(JSON.stringify(chmapOf(s))); save(true); };
  $('#s3-copy').onclick = () => { const others = P.sessions.filter(q => q.id !== s.id); if (!others.length) { toast('No other session to copy from'); return; } modal('Copy sensors', `<div class="field"><label>From session</label><select class="input" id="m-from">${others.map(q => `<option value="${q.id}">${esc(q.name)}</option>`).join('')}</select></div>`, [{ label: 'Cancel' }, { label: 'Copy', primary: true, onClick: () => { const q = P.sessions.find(q => q.id === $('#m-from').value); s.sensors = JSON.parse(JSON.stringify(q.sensors)); s.model3d = q.model3d; s.useInPlaneMap = q.useInPlaneMap; s.chmapInPlane = q.chmapInPlane ? JSON.parse(JSON.stringify(q.chmapInPlane)) : undefined; save(true); } }]); };
  $('#three-leg-btn').onclick = () => { const l = $('#three-legend'); l.classList.toggle('hidden'); try { localStorage.setItem('vv-3dleg', l.classList.contains('hidden') ? '0' : '1'); } catch (e) { } };
  try { if (localStorage.getItem('vv-3dleg') === '0') $('#three-legend').classList.add('hidden'); } catch (e) { }
  $('#s3-reset').onclick = () => { if (T3.cam) { T3.theta = 0.9; T3.phi = 1.05; T3.dist = 1600; T3.target.set(0, 0, (s.model3d === 'fixture+telescope') ? 330 : 60); } };
  init3D($('#three-wrap')); update3D(s);
  makeResizableTables(v);
}
function pasteSheetDialog(s) {
  modal('Paste sensor sheet', `<p class="small">One sensor per line, columns separated by tabs or commas, in this order:</p><p class="small mono">#, location, brand, S/N, sens X, sens Y, sens Z, input X, input Y, input Z, part (optional)</p><textarea class="input notes" id="m-sheet" style="min-height:160px;font-family:var(--mono);font-size:12px" placeholder="1&#9;Box lid&#9;Acme&#9;A1234&#9;10.0&#9;10.0&#9;10.0&#9;2&#9;3&#9;4&#9;payload"></textarea><label class="chk small"><input type="checkbox" id="m-replace" checked> replace the current sensors (untick to append)</label>`,
    [{ label: 'Cancel' }, { label: 'Import', primary: true, onClick: () => {
      const lines = $('#m-sheet').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean); const out = [];
      for (const l of lines) { const c = l.split(l.includes('\t') ? '\t' : ','); if (!/^\d+$/.test((c[0] || '').trim())) continue; const n = parseInt(c[0], 10); const f = i => { const v = parseFloat(c[i]); return isFinite(v) ? v : null; }; out.push(newSensor(n, { name: (c[1] || '').trim() || 'Sensor ' + n, brand: (c[2] || '').trim(), serial: (c[3] || '').trim(), sens: { X: f(4), Y: f(5), Z: f(6) }, ch: { X: f(7), Y: f(8), Z: f(9) }, part: PARTS.includes((c[10] || '').trim()) ? c[10].trim() : 'telescope' })); }
      if (!out.length) { toast('No sensor rows recognised', true); return false; }
      if ($('#m-replace').checked) s.sensors = [controlSensor(), ...out]; else s.sensors.push(...out);
      persist(); LF_CACHE.clear(); M_CACHE.clear(); render(); toast(`${out.length} sensor(s) imported`);
    } }]);
}

/* ---------- three.js scene ---------- */
const T3 = { renderer: null, scene: null, cam: null, group: null, article: null, model: null, sensorsGroup: null, theta: 0.9, phi: 1.05, dist: 1600, target: null, raf: null, wrap: null };
function init3D(wrap) {
  if (typeof THREE === 'undefined') { wrap.innerHTML = '<div class="empty">3D library did not load.</div>'; return; }
  if (T3.renderer && T3.wrap === wrap) return;
  if (T3.raf) cancelAnimationFrame(T3.raf); if (T3.renderer) { try { T3.ro?.disconnect(); T3.renderer.dispose(); } catch (e) { } T3.renderer = null; }
  T3.wrap = wrap;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); r.setPixelRatio(Math.min(devicePixelRatio, 2)); wrap.appendChild(r.domElement); T3.renderer = r;
  const scene = new THREE.Scene(); T3.scene = scene;
  const cam = new THREE.PerspectiveCamera(38, 1, 10, 10000); T3.cam = cam; T3.target = new THREE.Vector3(0, 0, 60);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 0.9));
  const dl = new THREE.DirectionalLight(0xffffff, 0.7); dl.position.set(600, -800, 1200); scene.add(dl);
  const dl2 = new THREE.DirectionalLight(0xffffff, 0.3); dl2.position.set(-800, 600, 400); scene.add(dl2);
  scene.up = new THREE.Vector3(0, 0, 1); cam.up.set(0, 0, 1);
  const g = new THREE.Group(); T3.group = g; scene.add(g);
  // table
  const table = new THREE.Mesh(new THREE.BoxGeometry(900, 900, 30), new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 0.4, roughness: 0.7, transparent: true, opacity: 0.55 })); table.position.z = -15; g.add(table);
  // axis triad
  const w = FIX.plateX / 2, h = FIX.plateY / 2;
  const axisLen = 230; const mk = (dir, col, label) => { const ar = new THREE.ArrowHelper(dir, new THREE.Vector3(-w - 40, -h - 40, 0), axisLen, col, 40, 18); g.add(ar); const sp = textSprite(label, '#' + col.toString(16).padStart(6, '0')); sp.position.copy(new THREE.Vector3(-w - 40, -h - 40, 0).add(dir.clone().multiplyScalar(axisLen + 40))); g.add(sp); };
  mk(new THREE.Vector3(1, 0, 0), 0xd03030, 'X'); mk(new THREE.Vector3(0, 1, 0), 0x30a040, 'Y'); mk(new THREE.Vector3(0, 0, 1), 0x3060e0, 'Z');
  T3.article = new THREE.Group(); g.add(T3.article); T3.model = null;
  T3.sensorsGroup = new THREE.Group(); g.add(T3.sensorsGroup);
  // controls
  let drag = null; const el = r.domElement;
  el.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, b: e.button }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; if (drag.b === 2 || e.shiftKey) { const right = new THREE.Vector3().crossVectors(cam.getWorldDirection(new THREE.Vector3()), cam.up).normalize(); const up = cam.up.clone(); T3.target.add(right.multiplyScalar(-dx * T3.dist / 900)).add(up.multiplyScalar(dy * T3.dist / 900)); } else { T3.theta -= dx * 0.006; T3.phi = clamp(T3.phi - dy * 0.006, 0.05, Math.PI - 0.05); } });
  el.addEventListener('pointerup', () => drag = null); el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('wheel', e => { e.preventDefault(); T3.dist = clamp(T3.dist * (1 + Math.sign(e.deltaY) * 0.08), 300, 6000); }, { passive: false });
  const ro = new ResizeObserver(() => resize3D()); ro.observe(wrap); T3.ro = ro;
  resize3D(); loop3D();
}
function buildArticle(model) {
  const grp = T3.article; while (grp.children.length) grp.remove(grp.children[0]); T3.model = model;
  if (model === 'none') return;
  const alu = new THREE.MeshStandardMaterial({ color: 0xb8bec8, metalness: 0.55, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b313a, metalness: 0.2, roughness: 0.8 });
  // fixture plate with rounded corners
  const sh = new THREE.Shape(); const w = FIX.plateX / 2, h = FIX.plateY / 2, rr = 30;
  sh.moveTo(-w + rr, -h); sh.lineTo(w - rr, -h); sh.quadraticCurveTo(w, -h, w, -h + rr); sh.lineTo(w, h - rr); sh.quadraticCurveTo(w, h, w - rr, h); sh.lineTo(-w + rr, h); sh.quadraticCurveTo(-w, h, -w, h - rr); sh.lineTo(-w, -h + rr); sh.quadraticCurveTo(-w, -h, -w + rr, -h);
  const hole = new THREE.Path(); hole.absarc(0, 0, FIX.ringID / 2, 0, Math.PI * 2, true); sh.holes.push(hole);
  for (const [x, y] of FIX.holes) { const p = new THREE.Path(); p.absarc(x, y, 5.2, 0, Math.PI * 2, true); sh.holes.push(p); }
  grp.add(new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: FIX.plateT, bevelEnabled: false, curveSegments: 24 }), alu));
  const ring = new THREE.Shape(); ring.absarc(0, 0, FIX.ringOD / 2, 0, Math.PI * 2, false); const rh = new THREE.Path(); rh.absarc(0, 0, FIX.ringID / 2, 0, Math.PI * 2, true); ring.holes.push(rh);
  const ringGlass = new THREE.MeshStandardMaterial({ color: 0xb8bec8, metalness: 0.5, roughness: 0.45, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  // with a payload on top, the ring is drawn see-through so anything inside the cavity stays visible
  const ringM = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: FIX.ringTop - FIX.plateT, bevelEnabled: false, curveSegments: 64 }), model === 'fixture' ? alu : ringGlass); ringM.position.z = FIX.plateT; grp.add(ringM);
  for (let i = 0; i < FIX.ribs; i++) {
    const a = i * 2 * Math.PI / FIX.ribs; const r0 = FIX.ringOD / 2 - 2, r1 = r0 + FIX.ribLen;
    const prof = new THREE.Shape(); prof.moveTo(r0, 0); prof.lineTo(r1, 0); prof.lineTo(r1, 25); prof.lineTo(r0, FIX.ringTop - FIX.plateT - 20); prof.lineTo(r0, 0);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(prof, { depth: FIX.ribT, bevelEnabled: false }), alu);
    m.position.set(-Math.sin(a) * FIX.ribT / 2, Math.cos(a) * FIX.ribT / 2, FIX.plateT); m.rotation.set(Math.PI / 2, 0, a, 'ZYX'); grp.add(m);
  }
  for (let i = 0; i < 6; i++) { const a = (30 + i * 60) * Math.PI / 180; const b = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 2, 24), alu); b.rotation.x = Math.PI / 2; b.position.set(Math.cos(a) * 176, Math.sin(a) * 176, FIX.ringTop + 1); grp.add(b); }
  for (const [x, y] of FIX.holes) { const b = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6, 12), dark); b.rotation.x = Math.PI / 2; b.position.set(x, y, FIX.plateT + 3); grp.add(b); }
  for (const [x, y] of FIX.taps) { const b = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 1, 12), dark); b.rotation.x = Math.PI / 2; b.position.set(x, y, FIX.plateT + 0.5); grp.add(b); }
  const pay = new THREE.Group(); pay.name = 'payload'; grp.add(pay); T3.payload = pay;
  if (model === 'fixture+telescope') buildTelescope(pay, T3.geom || {});
  else if (model === 'fixture+box' || model === 'fixture+cylinder') buildGenericPayload(pay, model, T3.geom || {});
  if (model !== 'fixture') { const ar = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, FIX.ringTop + 30), 260, 0x8892a0, 30, 14); pay.add(ar); const sp = textSprite('+X payload', '#6b7480', 30); sp.position.set(300, 0, FIX.ringTop + 40); sp.scale.set(110, 40, 1); pay.add(sp); }
}
function buildGenericPayload(pay, model, g) {
  const m = new THREE.MeshStandardMaterial({ color: 0x5a6574, metalness: 0.3, roughness: 0.6, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
  const W = g.w || 300, D = g.d || 300, H = g.h || 400;
  const mesh = model === 'fixture+box' ? new THREE.Mesh(new THREE.BoxGeometry(W, D, H), m) : (() => { const c = new THREE.Mesh(new THREE.CylinderGeometry(W / 2, W / 2, H, 48), m); c.rotation.x = Math.PI / 2; return c; })();
  mesh.position.z = FIX.ringTop + H / 2; pay.add(mesh);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x8892a0 })); edges.position.copy(mesh.position); edges.rotation.copy(mesh.rotation); pay.add(edges);
}
function resize3D() { if (!T3.wrap || !T3.renderer) return; const w = T3.wrap.clientWidth, h = T3.wrap.clientHeight; if (!w || !h) return; T3.renderer.setSize(w, h, false); T3.cam.aspect = w / h; T3.cam.updateProjectionMatrix(); }
function loop3D() {
  if (!T3.renderer) return;
  if (!document.body.contains(T3.wrap)) { T3.ro?.disconnect(); T3.renderer.dispose(); T3.renderer = null; T3.wrap = null; T3.sensorsGroup = null; T3.article = null; T3.model = null; return; }
  const c = T3.cam; const t = T3.target; const d = T3.dist;
  c.position.set(t.x + d * Math.sin(T3.phi) * Math.cos(T3.theta), t.y + d * Math.sin(T3.phi) * Math.sin(T3.theta), t.z + d * Math.cos(T3.phi)); c.lookAt(t);
  const th = plotTheme(); T3.renderer.setClearColor(new THREE.Color(th.bg), 1);
  T3.renderer.render(T3.scene, c); T3.raf = requestAnimationFrame(loop3D);
}
function textSprite(text, color = '#111', size = 44) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const ctx = cv.getContext('2d');
  ctx.font = `600 ${size}px IBM Plex Sans, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.0)'; ctx.fillRect(0, 0, 256, 96); ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.strokeText(text, 128, 48); ctx.fillStyle = color; ctx.fillText(text, 128, 48);
  const tex = new THREE.CanvasTexture(cv); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false })); sp.scale.set(120, 45, 1); return sp;
}
function update3D(s, force = false) {
  if (!T3.sensorsGroup) return; const grp = T3.sensorsGroup; while (grp.children.length) grp.remove(grp.children[0]);
  const model = s.model3d || 'fixture'; const gk = JSON.stringify(s.geom || {}); T3.geom = s.geom || {};
  if (T3.model !== model || T3.geomKey !== gk || force) { T3.geomKey = gk; buildArticle(model); if (model !== 'fixture' && model !== 'none' && T3.target.z < 200) T3.target.z = 300; }
  const rot = (s.rotation || 0) * Math.PI / 180; if (T3.payload) T3.payload.rotation.z = rot;
  const legend = $('#three-legend'); if (legend) legend.innerHTML = '';
  if (!s.show3D) { if (legend) legend.innerHTML = '<span class="muted">Sensor markers are switched off for this session</span>'; return; }
  for (const x of s.sensors) {
    const p = x.p3 || { r: 176, angle: 0, z: 165 }; const onPayload = !['fixture', 'table'].includes(x.part) && x.id !== 'CTRL'; const a = (p.angle || 0) * Math.PI / 180 + (onPayload ? rot : 0); const px = Math.cos(a) * (p.r || 0), py = Math.sin(a) * (p.r || 0), pz = p.z || 0;
    const m = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 11), new THREE.MeshStandardMaterial({ color: new THREE.Color(x.color), metalness: 0.1, roughness: 0.5 })); m.position.set(px, py, pz + 5); grp.add(m);
    const sp = textSprite(x.id === 'CTRL' ? 'C' : '#' + x.pos, x.color, 40); sp.position.set(px, py, pz + 42); sp.scale.set(90, 34, 1); grp.add(sp);
    const chs = ['X', 'Y', 'Z', 'C'].filter(k => x.ch?.[k] != null).map(k => (k === 'C' ? '' : k) + x.ch[k]).join(' ');
    if (legend) legend.innerHTML += `<div><span class="sw" style="background:${x.color}"></span><strong>${x.id === 'CTRL' ? 'C' : '#' + x.pos}</strong> ${esc(x.name)} <span class="muted">· in ${esc(chs)}</span></div>`;
  }
}
