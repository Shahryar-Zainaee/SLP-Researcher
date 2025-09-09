/*
  Custom plugin: pursuit-rotor-cog
  Author: Shahryar
  Built for use with jsPsych (https://www.jspsych.org/)
  jsPsych MIT License © 2011–2025 Josh de Leeuw and contributors
*/

jsPsych.plugins['pursuit-rotor-cog'] = (function () {
  const plugin = {};

  plugin.info = {
    name: 'pursuit-rotor-cog',
    parameters: {
      // v7: no parameterType needed. Defaults only.
      duration_ms: { default: 20000 },
      canvas_size: { default: 600 },
      target_radius_px: { default: 8 },
      on_target_px: { default: 25 },
      omega: { default: 0.9 },          // rad/s
      direction: { default: 1 },        // 1 or -1
      path: { default: null },          // function(angle, params) -> {x,y}
      path_params: { default: {} },
      jitter: { default: { type: 'none', amp: 0, freq: 0.5 } },
      probe_colors: { default: { go: '#3498db', flip: '#ffffff' } },
      probe_ahead_ms: { default: 250 },
      probe_dur_ms: { default: 400 },
      probe_isi_range_ms: { default: { min: 1500, max: 3500 } },
      key_reverse: { default: null },   // optional manual key
      mapping_randomize: { default: true }
    }
  };

  function circle(t, p) {
    const { cx, cy, R = 150 } = p;
    return { x: cx + R * Math.cos(t), y: cy + R * Math.sin(t) };
  }

  // smooth noise (low-pass random walk)
  class SmoothNoise {
    constructor(amp = 0, alpha = 0.1) { this.amp = amp; this.alpha = alpha; this.v = 0; }
    next() {
      this.v = (1 - this.alpha) * this.v + this.alpha * (Math.random() * 2 - 1) * this.amp;
      return this.v;
    }
  }

  plugin.trial = function (display_element, trial) {
    // canvas
    const size = trial.canvas_size;
    display_element.innerHTML =
      `<div style="user-select:none"><canvas width="${size}" height="${size}" style="background:#111; cursor:none"></canvas></div>`;
    const canvas = display_element.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const cx = size / 2, cy = size / 2;

    // path
    const basePath = trial.path || circle;
    const params = Object.assign({ cx, cy }, trial.path_params);

    // jitter
    const j = trial.jitter || {};
    const jAngle = new SmoothNoise(j.amp || 0, 0.07);
    const jRad   = new SmoothNoise(j.amp || 0, 0.07);
    const cursorJ = new SmoothNoise(j.cursor_amp || 0, 0.15);

    // mapping
    let mapping = { flip: trial.probe_colors.flip, go: trial.probe_colors.go };
    if (trial.mapping_randomize && Math.random() < 0.5) {
      mapping = { flip: trial.probe_colors.go, go: trial.probe_colors.flip };
    }

    // state
    let dir = trial.direction || 1;
    let start = null;
    let lastTs = null;
    let run = true;
    let mouse = { x: cx, y: cy };
    let onTargetTime = 0;
    const frames = [];
    const probes = scheduleProbes(trial.duration_ms, trial.probe_isi_range_ms);
    let activeProbe = null;

    // mouse
    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    });

    function scheduleProbes(total, range) {
      const out = [];
      let t = 800 + rand(range.min, range.max);
      while (t < total - trial.probe_dur_ms) {
        out.push({ onset: t, color: Math.random() < 0.5 ? mapping.flip : mapping.go, handled: false });
        t += rand(range.min, range.max);
      }
      return out;
    }
    function rand(min, max) { return Math.floor(min + Math.random() * (max - min)); }

    function drawDot(x, y, color = '#eee', r = trial.target_radius_px) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    }

    function frame(ts) {
      if (!start) start = ts;
      const elapsed = ts - start;
      const dt = lastTs ? Math.min(ts - lastTs, 50) : 16.7;
      lastTs = ts;

      // param angle
      const tsec = elapsed / 1000;
      const omega = (trial.omega || 1) * dir;
      const angle = omega * tsec;

      // base position
      let pos = basePath(angle, params);

      // path jitter
      if (j.type === 'angle') {
        pos = basePath(angle + jAngle.next(), params);
      } else if (j.type === 'radial') {
        const dR = jRad.next();
        const R = (trial.path_params && trial.path_params.R ? trial.path_params.R : 150) + dR;
        pos = { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
      }

      // clear
      ctx.clearRect(0, 0, size, size);

      // probe
      if (!activeProbe) {
        const p = probes.find(pr => !pr.handled && elapsed >= pr.onset);
        if (p) { activeProbe = { ...p, off: p.onset + trial.probe_dur_ms, responded: false }; p.handled = true; }
      } else if (elapsed >= activeProbe.off) {
        activeProbe = null;
      }

      // apply rule if cursor near probe
      if (activeProbe && !activeProbe.responded) {
        const aheadAngle = angle + (trial.probe_ahead_ms / 1000) * omega;
        const ahead = basePath(aheadAngle, params);
        drawDot(ahead.x, ahead.y, activeProbe.color, Math.max(6, trial.target_radius_px - 2));

        const nearProbe = Math.hypot(ahead.x - mouse.x, ahead.y - mouse.y) < trial.on_target_px * 1.2;
        if (nearProbe) {
          const isFlip = activeProbe.color === mapping.flip;
          if (isFlip) dir *= -1;
          activeProbe.responded = true;
          frames.push({ t: elapsed, event: 'probe_response', isFlip, dir, nearProbe });
        }
      }

      // draw target + cursor
      drawDot(pos.x, pos.y, '#fafafa', trial.target_radius_px);
      const cj = cursorJ.next();
      drawDot(mouse.x + (j.cursor_amp ? cj : 0), mouse.y + (j.cursor_amp ? cj : 0), '#0ff', 3);

      // metrics
      const dist = Math.hypot(pos.x - mouse.x, pos.y - mouse.y);
      if (dist <= trial.on_target_px) onTargetTime += dt;
      frames.push({ t: elapsed, x: pos.x, y: pos.y, cx: mouse.x, cy: mouse.y, dist, dir });

      // end or continue
      if (elapsed >= trial.duration_ms) finish();
      else if (run) window.requestAnimationFrame(frame);
    }

    function finish() {
      run = false;
      const tot = trial.duration_ms;
      jsPsych.finishTrial({
        duration_ms: tot,
        on_target_ms: Math.round(onTargetTime),
        on_target_prop: onTargetTime / tot,
        mapping,
        frames
      });
    }

    window.requestAnimationFrame(frame);
  };

  return plugin;
})();
