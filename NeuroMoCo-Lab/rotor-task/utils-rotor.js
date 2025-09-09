/**
 * Rotor Task Utilities
 * - Seeded PRNG
 * - Event scheduling
 * - Motion path functions
 * - Drawing helpers
 */

/* ===== Seeded PRNG (Mulberry32) ===== */
function seededPRNG(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ t >>> 15, 1 | t);
    r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
}

/* ===== Event Scheduling ===== */
function buildSchedules(trial, rng) {
  // Simplified: evenly spaced switches for demo
  const switches = [];
  const step = trial.duration_s*1000 / (trial.nSwitches+1);
  for (let i=0; i<trial.nSwitches; i++) {
    const t_ms = Math.round((i+1)*step);
    const shape = (i % 3 === 0) ? 'circle' : (i % 3 === 1) ? 'triangle' : 'square';
    switches.push({index: i, t_ms, shape});
  }
  return {switches, currentShape: 'circle'};
}

/* ===== Motion Path Functions ===== */
function computeTargetPosition(t, trial, schedules) {
  const cx = trial.canvasWidth/2;
  const cy = trial.canvasHeight/2;
  const R = Math.min(cx, cy) * 0.4;
  const f = 0.25 * trial.velocity;

  switch(trial.pathType) {
    case 'circle':
      return {x: cx + R*Math.cos(2*Math.PI*f*t),
              y: cy + R*Math.sin(2*Math.PI*f*t)};
    default:
      return {x: cx + R*Math.cos(2*Math.PI*f*t),
              y: cy + R*Math.sin(2*Math.PI*f*t)};
  }
}

/* ===== Drawing ===== */
function drawTarget(ctx, pos, shape) {
  ctx.clearRect(0,0,ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = "#6cff9a";
  if (shape === 'circle') {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 12, 0, Math.PI*2);
    ctx.fill();
  } else if (shape === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y-12);
    ctx.lineTo(pos.x-12, pos.y+12);
    ctx.lineTo(pos.x+12, pos.y+12);
    ctx.closePath();
    ctx.fill();
  } else if (shape === 'square') {
    ctx.fillRect(pos.x-12, pos.y-12, 24, 24);
  }
}
