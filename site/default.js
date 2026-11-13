/* ===== Site edition: open source (default) =====
   No bundled data, no company brand (set your own in Settings), a small generic profile library. A site file can override any of these. */
const SITE = { id: 'open', telescope: false, srsRequirementId: null, brand: null };
function siteLibrary() {
  return [
    { id: 'ex-random', name: 'Example random, 20 to 2000 Hz (edit to your spec)', short: 'example', type: 'random', axis: '', notes: 'A starting point: +3 dB/oct from 20 to 80 Hz, 0.04 g²/Hz plateau to 500 Hz, -3 dB/oct to 2000 Hz. Replace with your own requirement.', bp: [[20, 0.01], [80, 0.04], [500, 0.04], [2000, 0.01]], limits: [] },
    { id: 'ex-srs', name: 'Example SRS 500 g, knee 1000 Hz (edit to your spec)', short: '500 g', type: 'srs', axis: '', pulses: 3, notes: 'A starting point: +9 dB/oct from 100 Hz to the 1000 Hz knee, flat to 10 kHz. Q = 10. Replace with your own requirement.', bp: [[100, 500 * Math.pow(0.1, 1.5)], [1000, 500], [10000, 500]], limits: [] },
  ];
}
const SITE_TEMPLATES = [];
const BUNDLE_KEYS = {};
async function inflateEmbedded() { return false; }
function loadEmbedded() { return false; }
function addMissingBundled() { return []; }
const SITE_HISTORY = '<p><strong>Version history.</strong><br>v3.0: first open-source release. Generic import with a review step, campaigns, signature pairing, shock checks (SRS, pseudo velocity, amplification, multi-pulse), branding, guide and example project.</p>';
function siteMigrate() { }
function siteAfterBundled() { }
function siteBootNotice() { }
/* What the 3D view draws under the test article: a plain square interface plate with a bolt pattern. 'ring' style (see 07_three.js)
   adds a ring and gussets; ringTop is the height the article sits at. Edit to match your own. */
const FIX = { style: 'plate', plateX: 420, plateY: 420, plateT: 20, ringOD: 0, ringID: 0, ringTop: 20, ribs: 0, ribLen: 0, ribT: 0,
  holes: (() => { const o = []; const e = 180, step = 60; for (let x = -e; x <= e + 0.1; x += step) { o.push([x, -e], [x, e]); } for (let y = -e + step; y < e - 0.1; y += step) { o.push([-e, y], [e, y]); } return o; })(), taps: [] };
function buildTelescope(pay, g = {}) { buildGenericPayload(pay, 'fixture+cylinder', g); }
