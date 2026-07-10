// Data-inspection mode (the guide's 4th UX mode): real, interactive charts
// drawn on a canvas from the catalogue data — a Hertzsprung–Russell diagram for
// the Gaia stars, a transit light curve for a selected exoplanet (from measured
// period/radii), and a redshift histogram for the cosmic web.
const AX = "#8aa0c0", GRID = "rgba(120,160,220,0.14)", ACC = "#6cc7ff";
const R_EARTH_OVER_R_SUN = 0.009168, R_SUN_AU = 0.00465047;

function setup(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 360, h = canvas.clientHeight || 240;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = "10px -apple-system, sans-serif";
  return { ctx, w, h };
}
function axes(ctx, m, w, h, xlab, ylab) {
  ctx.strokeStyle = AX; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(m.l, m.t); ctx.lineTo(m.l, h - m.b); ctx.lineTo(w - m.r, h - m.b); ctx.stroke();
  ctx.fillStyle = AX; ctx.textAlign = "center";
  ctx.fillText(xlab, (m.l + w - m.r) / 2, h - 4);
  ctx.save(); ctx.translate(10, (m.t + h - m.b) / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText(ylab, 0, 0); ctx.restore();
}

export function drawHR(canvas, scene, sel) {
  const { ctx, w, h } = setup(canvas);
  const m = { l: 42, r: 14, t: 24, b: 30 };
  const xMin = -0.4, xMax = 4.2, yMin = -6, yMax = 17; // absolute mag, inverted
  const X = (c) => m.l + (c - xMin) / (xMax - xMin) * (w - m.l - m.r);
  const Y = (M) => m.t + (M - yMin) / (yMax - yMin) * (h - m.t - m.b); // bright (low M) at top
  // gridlines
  ctx.strokeStyle = GRID;
  for (let M = -5; M <= 15; M += 5) { ctx.beginPath(); ctx.moveTo(m.l, Y(M)); ctx.lineTo(w - m.r, Y(M)); ctx.stroke();
    ctx.fillStyle = AX; ctx.textAlign = "right"; ctx.fillText(M, m.l - 4, Y(M) + 3); }
  for (let c = 0; c <= 4; c++) { ctx.fillStyle = AX; ctx.textAlign = "center"; ctx.fillText(c, X(c), h - m.b + 12); }
  // points
  const n = scene.count, col = scene.colors;
  for (let i = 0; i < n; i++) {
    const bp = scene.bp_rp[i], d = scene.distance_pc[i];
    if (bp == null || !(d > 0)) continue;
    const M = scene.mag[i] - 5 * Math.log10(d) + 5;
    const x = X(bp), y = Y(M);
    if (x < m.l || x > w - m.r || y < m.t || y > h - m.b) continue;
    ctx.fillStyle = `rgb(${col[i*3]*255|0},${col[i*3+1]*255|0},${col[i*3+2]*255|0})`;
    ctx.globalAlpha = 0.8; ctx.fillRect(x, y, 1.6, 1.6);
  }
  ctx.globalAlpha = 1;
  if (sel != null && scene.bp_rp[sel] != null && scene.distance_pc[sel] > 0) {
    const M = scene.mag[sel] - 5 * Math.log10(scene.distance_pc[sel]) + 5;
    const x = X(scene.bp_rp[sel]), y = Y(M);
    ctx.strokeStyle = ACC; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.stroke();
  }
  axes(ctx, m, w, h, "Colour  (BP − RP)  →  cooler", "← brighter   Absolute mag");
}

export function drawTransit(canvas, planet, sys) {
  const { ctx, w, h } = setup(canvas);
  const m = { l: 46, r: 14, t: 22, b: 30 };
  ctx.textAlign = "center"; ctx.fillStyle = AX;
  if (!planet || !planet.radius_earth || !sys || !sys.st_rad_sun || !planet.sma_au || !planet.period_days) {
    ctx.fillText("Select a planet with a known radius, period and host-star radius.", w / 2, h / 2); return null;
  }
  const RpRs = planet.radius_earth * R_EARTH_OVER_R_SUN / sys.st_rad_sun;
  const depth = RpRs * RpRs;                       // fractional flux drop
  const a_au = planet.sma_au, Rs_au = sys.st_rad_sun * R_SUN_AU;
  const durFrac = (Rs_au * (1 + RpRs)) / (Math.PI * a_au); // T14 / P (central transit)
  const durHours = durFrac * planet.period_days * 24;
  // axes: x = time from mid-transit (hours), y = relative flux
  const span = Math.max(durHours * 2.2, 1);
  const X = (t) => m.l + (t / span + 0.5) * (w - m.l - m.r);
  const yLo = 1 - depth * 1.4, yHi = 1 + depth * 0.25;
  const Y = (f) => m.t + (yHi - f) / (yHi - yLo) * (h - m.t - m.b);
  ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(m.l, Y(1)); ctx.lineTo(w - m.r, Y(1)); ctx.stroke();
  ctx.fillStyle = AX; ctx.textAlign = "right"; ctx.fillText("1.000", m.l - 4, Y(1) + 3);
  ctx.fillText((1 - depth).toFixed(4), m.l - 4, Y(1 - depth) + 3);
  // light curve (flat – ingress – floor – egress – flat)
  const half = durHours / 2, ingress = half * 0.18;
  const pts = [[-span/2, 1], [-half - ingress, 1], [-half + ingress, 1 - depth], [half - ingress, 1 - depth], [half + ingress, 1], [span/2, 1]];
  ctx.strokeStyle = ACC; ctx.lineWidth = 2; ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))); ctx.stroke();
  axes(ctx, m, w, h, "Hours from mid-transit", "Relative brightness");
  return { depthPpm: Math.round(depth * 1e6), durHours: durHours };
}

export function drawRedshift(canvas, cosmic) {
  const { ctx, w, h } = setup(canvas);
  const m = { l: 40, r: 14, t: 22, b: 30 };
  const z = cosmic.redshift, nb = 32, zMax = Math.max(...z) * 1.02 || 0.05;
  const bins = new Array(nb).fill(0);
  for (const v of z) { const b = Math.min(nb - 1, Math.max(0, Math.floor(v / zMax * nb))); bins[b]++; }
  const cMax = Math.max(...bins);
  const X = (i) => m.l + i / nb * (w - m.l - m.r), bw = (w - m.l - m.r) / nb;
  const Y = (c) => m.t + (1 - c / cMax) * (h - m.t - m.b);
  for (let i = 0; i < nb; i++) {
    const t = i / nb;
    ctx.fillStyle = `rgb(${(140+115*t)|0},${(180-90*t)|0},${(245-150*t)|0})`;
    ctx.fillRect(X(i) + 1, Y(bins[i]), bw - 1.5, (h - m.b) - Y(bins[i]));
  }
  ctx.fillStyle = AX; ctx.textAlign = "center";
  for (let k = 0; k <= 4; k++) { const zz = zMax * k / 4; ctx.fillText(zz.toFixed(3), m.l + k / 4 * (w - m.l - m.r), h - m.b + 12); }
  axes(ctx, m, w, h, "Redshift  z", "Galaxy count");
}
