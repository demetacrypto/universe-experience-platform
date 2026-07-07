// Generative ambient soundscape + interaction whooshes.
// Pure WebAudio — no assets. Starts only after a user gesture (autoplay-safe),
// fades in over several seconds, and can be muted (persisted by the caller).
let ctx = null, master = null, noiseBuf = null, running = false, muted = false;

function ensure() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  // shared 4 s white-noise buffer (wind + whooshes)
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

// Deep, slowly-breathing space drone: detuned low oscillators through a
// LFO-swept lowpass, a barely-there high shimmer, and band-passed wind.
export function startAmbient() {
  if (muted) return;
  ensure(); if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  if (running) return;
  running = true;
  master.gain.linearRampToValueAtTime(0.055, ctx.currentTime + 6);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 220; lp.Q.value = 0.4;
  lp.connect(master);
  const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
  lfo.frequency.value = 0.02; lfoG.gain.value = 90;
  lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();

  [[55.0, "sine", 0.50], [55.4, "sine", 0.40], [82.41, "triangle", 0.22], [110.6, "sine", 0.12]]
    .forEach(([f, t, g]) => {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = t; o.frequency.value = f; og.gain.value = g;
      o.connect(og); og.connect(lp); o.start();
    });

  // faint shimmer that swells in and out over ~75 s
  const sh = ctx.createOscillator(), shG = ctx.createGain();
  sh.type = "sine"; sh.frequency.value = 660; shG.gain.value = 0;
  const shl = ctx.createOscillator(), shlG = ctx.createGain();
  shl.frequency.value = 0.013; shlG.gain.value = 0.015;
  shl.connect(shlG); shlG.connect(shG.gain); shl.start();
  sh.connect(shG); shG.connect(master); sh.start();

  // soft cosmic wind
  const ns = ctx.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 320; bp.Q.value = 0.6;
  const ng = ctx.createGain(); ng.gain.value = 0.05;
  ns.connect(bp); bp.connect(ng); ng.connect(master); ns.start();
}

export function setAudioMuted(m) {
  muted = m;
  if (!ctx || !master) { if (!m) startAmbient(); return; }
  if (m) master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
  else { startAmbient(); master.gain.linearRampToValueAtTime(0.055, ctx.currentTime + 2); }
}

// Short filtered-noise swell — played on camera fly-tos and layer jumps.
export function whoosh(strength = 1) {
  if (muted || !ctx || !running) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.1;
  f.frequency.setValueAtTime(120, t);
  f.frequency.exponentialRampToValueAtTime(900, t + 0.5);
  f.frequency.exponentialRampToValueAtTime(140, t + 1.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09 * strength, t + 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
  src.connect(f); f.connect(g); g.connect(ctx.destination);
  src.start(t); src.stop(t + 1.6);
}
