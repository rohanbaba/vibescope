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
/* Generic fixture drawn in the 3D view: a square plate with a ring on top and gussets. Edit to match your own. */
const FIX = { plateX: 500, plateY: 500, plateT: 20, ringOD: 360, ringID: 240, ringTop: 165, ribs: 8, ribLen: 90, ribT: 10,
  holes: (() => { const o = []; for (const x of [-200, -100, 100, 200]) for (const y of [-200, 200]) o.push([x, y]); for (const y of [-100, 100]) for (const x of [-200, 200]) o.push([x, y]); return o; })(), taps: [] };
function buildTelescope(pay, g = {}) { buildGenericPayload(pay, 'fixture+cylinder', g); }
