/*
  Custom plugin: pursuit-rotor-cog
  Author: Shahryar
  Built for use with jsPsych (https://www.jspsych.org/)

  jsPsych is open-source software released under the MIT License.
  Copyright (c) 2011–2025 Josh de Leeuw and contributors
  See: https://github.com/jspsych/jsPsych/blob/main/LICENSE
*/

jsPsych.plugins['pursuit-rotor-cog'] = (function () {
  const plugin = {};

  plugin.info = {
    name: 'pursuit-rotor-cog',
    parameters: {
      duration_ms: { type: jsPsych.plugins.parameterType.INT, default: 20000 },
      canvas_size: { type: jsPsych.plugins.parameterType.INT, default: 600 },
      target_radius_px: { type: jsPsych.plugins.parameterType.INT, default: 8 },
      on_target_px: { type: jsPsych.plugins.parameterType.INT, default: 25 },
      omega: { type: jsPsych.plugins.parameterType.FLOAT, default: 0.9 }, // rad/s
      direction: { type: jsPsych.plugins.parameterType.INT, default: 1 }, // 1 or -1
      path: { type: jsPsych.plugins.parameterType.FUNCTION, default: null }, // path(t)->{x,y}
      path_params: { type: jsPsych.plugins.parameterType.OBJECT, default: {} },
      jitter: { type: jsPsych.plugins.parameterType.OBJECT, default: { type: 'none', amp: 0, freq: 0.5 } },
      probe_colors: { type: jsPsych.plugins.parameterType.OBJECT, default: { go: '#3498db', flip: '#ffffff' } },
      probe_ahead_ms: { type: jsPsych.plugins.parameterType.INT, default: 250 },
      probe_dur_ms: { type: jsPsych.plugins.parameterType.INT, default: 400 },
      probe_isi_range_ms: { type: jsPsych.plugins.parameterType.OBJECT, default: { min: 1500, max: 3500 } },
      key_reverse: { type: jsPsych.plugins.parameterType.KEY, default: null }, // optional manual key
      mapping_randomize: { type: jsPsych.plugins.parameterType.BOOL, default: true }
    }
  };

  function circle(t, p) {
    const { cx, cy, R = 150 } = p;
    return { x: cx + R * Math.cos(t), y: cy + R * Math.sin(t) };
  }

  // simple smooth noise via low-pass random walk
  class SmoothNoise {
    constructor(amp = 0, alpha = 0.1) { this.amp = amp; this.alpha = alpha; this.v = 0; }
    next() {
      this.v = (1 - this.alpha) * this.v + this.alpha * (Math.random() * 2 - 1) * this.amp;
      return this.v;
    }
  }

  plugin.trial = function (display_element, trial) {
    // setup canvas
    const size = trial.canvas_size;
    display_element.innerHTML = `<div style="user-select:none"><canvas width="${size}" height="${size}" style="background:#111; cursor:none"></canvas></div>`;
    const canvas = display_element.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const cx = size / 2, cy = size / 2;

    // choose path
    const basePath = trial.path || circle;
    const params = Object.assign({ cx, cy }, trial.path_params);

    // jitter
    const j = trial.jitter || {};
    const jAngle = new SmoothNoise(j.amp || 0, 0.07);
    const jRad = new SmoothNoise(j.amp || 0, 0.07);
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
    let theta0 = 0;
    let mouse = { x: cx, y: cy };
    let onTargetTime = 0;
    let frames = [];
    let probes = scheduleProbes(trial.duration_ms, trial.probe_isi_range_ms);
    let activeProbe = null;

    // mouse events
    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    });

    function scheduleProbes(total, range) {
      const out = [];
      let t = 800 + rand(range.min, range.max); // first probe after ~0.8s
      while (t < total - trial.probe_dur_ms) {
        out.push({
          onset: t,
          color: Math.random() < 0.5 ? mapping.flip : mapping.go,
          handled: false
        });
        t += rand(range.min, range.max);
      }
      return out;
    }
    function rand(min, max) { return Math.floor(min + Math.random() * (max - min)); }

    function drawTarget(x, y, color = '#eee', r = trial.target_radius_px) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    function frame(ts) {
      if (!start) start = ts;
      const elapsed = ts - start;
      const dt = lastTs ? Math.min(ts - lastTs, 50) : 16.7; // clamp
      lastTs = ts;

      // path angle
      const tsec = elapsed / 1000;
      let omega = (trial.omega || 1) * dir;
      let angle = theta0 + omega * tsec;

      // base path
      let pos = basePath(angle, params);

      // path jitter
      if (j.type === 'angle') {
        const dth = jAngle.next();
        pos = basePath(angle + dth, params);
      } else if (j.type === 'radial') {
        const dR = jRad.next();
        if (basePath === circle) {
          const R = (trial.path_params?.R || 150) + dR;
          pos = { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
        }
      }

      // clear
      ctx.clearRect(0, 0, size, size);

      // probe logic
      if (!activeProbe) {
        const p = probes.find(pr => !pr.handled && elapsed >= pr.onset);
        if (p) {
          activeProbe = { ...p, off: p.onset + trial.probe_dur_ms, responded: false };
          p.handled = true;
        }
      } else if (elapsed >= activeProbe.off) {
        activeProbe = null;
      }

      // apply rule if probe is active and cursor is near probe
      if (activeProbe && !activeProbe.responded) {
        const aheadAngle = angle + (trial.probe_ahead_ms / 1000) * omega;
        const ahead = basePath(aheadAngle, params);

        // draw probe
        drawTarget(ahead.x, ahead.y, activeProbe.color, Math.max(6, trial.target_radius_px - 2));

        const dxp = ahead.x - mouse.x, dyp = ahead.y - mouse.y;
        const nearProbe = Math.hypot(dxp, dyp) < trial.on_target_px * 1.2;

        if (nearProbe) {
          const isFlip = activeProbe.color === mapping.flip;
          if (isFlip) dir *= -1;
          activeProbe.responded = true;
          frames.push({ t: elapsed, event: 'probe_response', isFlip, dir, nearProbe });
        }
      }

      // draw target
      drawTarget(pos.x, pos.y, '#fafafa', trial.target_radius_px);

      // draw cursor (with optional jitter)
      const cj = cursorJ.next();
      const cxr = mouse.x + (j.cursor_amp ? cj : 0);
      const cyr = mouse.y + (j.cursor_amp ? cj : 0);
      drawTarget(cxr, cyr, '#0ff', 3);

      // metrics
      const dx = pos.x - mouse.x, dy = pos.y - mouse.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= trial.on_target_px) onTargetTime += dt;

      frames.push({ t: elapsed, x: pos.x, y: pos.y, cx: mouse.x, cy: mouse.y, dist, dir });

      // end
      if (elapsed >= trial.duration_ms) {
        finish();
      } else if (run) {
        window.requestAnimationFrame(frame);
      }
    }

    function finish() {
      run = false;
      const tot = trial.duration_ms;
      const data = {
        duration_ms: tot,
        on_target_ms: Math.round(onTargetTime),
        on_target_prop: onTargetTime / tot,
        mapping,
        frames
      };
      jsPsych.finishTrial(data);
    }

    window.requestAnimationFrame(frame);
  };

  return plugin;
})();
