/* pursuit-rotor-cog — jsPsych v7 plugin
   Author: Shahryar
   License: MIT
*/
var jsPsychPursuitRotorCog = (function (jspsych) {
  'use strict';

  const info = {
    name: 'pursuit-rotor-cog',
    parameters: {
      duration_ms:       { type: jspsych.ParameterType.INT,    default: 20000 },
      canvas_size:       { type: jspsych.ParameterType.INT,    default: 600 },
      target_radius_px:  { type: jspsych.ParameterType.INT,    default: 8 },
      on_target_px:      { type: jspsych.ParameterType.INT,    default: 25 },
      omega:             { type: jspsych.ParameterType.FLOAT,  default: 0.9 }, // rad/s
      direction:         { type: jspsych.ParameterType.INT,    default: 1 },   // 1 or -1
      path:              { type: jspsych.ParameterType.FUNCTION, default: null }, // (angle, params)->{x,y}
      path_params:       { type: jspsych.ParameterType.OBJECT, default: {} },
      jitter:            { type: jspsych.ParameterType.OBJECT, default: { type: 'none', amp: 0, freq: 0.5 } },
      probe_colors:      { type: jspsych.ParameterType.OBJECT, default: { go: '#3498db', flip: '#ffffff' } },
      probe_ahead_ms:    { type: jspsych.ParameterType.INT,    default: 250 },
      probe_dur_ms:      { type: jspsych.ParameterType.INT,    default: 400 },
      probe_isi_range_ms:{ type: jspsych.ParameterType.OBJECT, default: { min: 1500, max: 3500 } },
      key_reverse:       { type: jspsych.ParameterType.STRING, default: null },
      mapping_randomize: { type: jspsych.ParameterType.BOOL,   default: true },
      cursor_amp:        { type: jspsych.ParameterType.FLOAT,  default: 0 }
    }
  };

  function circle(t, p) {
    const { cx, cy, R = 150 } = p;
    return { x: cx + R * Math.cos(t), y: cy + R * Math.sin(t) };
  }

  class SmoothNoise {
    constructor(amp = 0, alpha = 0.1) { this.amp = amp; this.alpha = alpha; this.v = 0; }
    next() {
      this.v = (1 - this.alpha) * this.v + this.alpha * (Math.random() * 2 - 1) * this.amp;
      return this.v;
    }
  }

  class PursuitRotorCog {
    constructor(jsPsych) { this.jsPsych = jsPsych; }
    static info = info;

    trial(display_element, trial) {
      const size = trial.canvas_size;
      display_element.innerHTML =
        `<div style="user-select:none"><canvas width="${size}" height="${size}" style="background:#111; cursor:none"></canvas></div>`;
      const canvas = display_element.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const cx = size / 2, cy = size / 2;

      const basePath = trial.path || circle;
      const params = Object.assign({ cx, cy }, trial.path_params);

      const j = trial.jitter || {};
      const jAngle = new SmoothNoise(j.amp || 0, 0.07);
      const jRad   = new SmoothNoise(j.amp || 0, 0.07);
      const cursorJ = new SmoothNoise(trial.cursor_amp || 0, 0.15);

      let mapping = { flip: trial.probe_colors.flip, go: trial.probe_colors.go };
      if (trial.mapping_randomize && Math.random() < 0.5) {
        mapping = { flip: trial.probe_colors.go, go: trial.probe_colors.flip };
      }

      let dir = trial.direction || 1;
      let start = null;
      let lastTs = null;
      let run = true;
      let mouse = { x: cx, y: cy };
      let onTargetTime = 0;
      const frames = [];
      const probes = scheduleProbes(trial.duration_ms, trial.probe_isi_range_ms);
      let activeProbe = null;

      const keyHandler = (e) => {
        if (!trial.key_reverse) return;
        if (e.key.toLowerCase() === trial.key_reverse.toLowerCase()) {
          dir *= -1;
          frames.push({ t: performance.now() - start, event: 'key_reverse', key: e.key, dir });
        }
      };
      if (trial.key_reverse) window.addEventListener('keydown', keyHandler);

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

      const finish = () => {
        run = false;
        if (trial.key_reverse) window.removeEventListener('keydown', keyHandler);
        const tot = trial.duration_ms;
        this.jsPsych.finishTrial({
          duration_ms: tot,
          on_target_ms: Math.round(onTargetTime),
          on_target_prop: onTargetTime / tot,
          mapping,
          frames
        });
      };

      const frame = (ts) => {
        if (!start) start = ts;
        const elapsed = ts - start;
        const dt = lastTs ? Math.min(ts - lastTs, 50) : 16.7;
        lastTs = ts;

        const tsec = elapsed / 1000;
        const omega = (trial.omega || 1) * dir;
        const angle = omega * tsec;

        let pos = basePath(angle, params);

        if (j.type === 'angle') {
          pos = basePath(angle + jAngle.next(), params);
        } else if (j.type === 'radial') {
          const dR = jRad.next();
          const R = (trial.path_params && trial.path_params.R ? trial.path_params.R : 150) + dR;
          pos = { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
        }

        ctx.clearRect(0, 0, size, size);

        if (!activeProbe) {
          const p = probes.find(pr => !pr.handled && elapsed >= pr.onset);
          if (p) { activeProbe = { ...p, off: p.onset + trial.probe_dur_ms, responded: false }; p.handled = true; }
        } else if (elapsed >= activeProbe.off) {
          activeProbe = null;
        }

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

        drawDot(pos.x, pos.y, '#fafafa', trial.target_radius_px);
        const cj = cursorJ.next();
        const mx = mouse.x + (trial.cursor_amp ? cj : 0);
        const my = mouse.y + (trial.cursor_amp ? cj : 0);
        drawDot(mx, my, '#0ff', 3);

        const dist = Math.hypot(pos.x - mouse.x, pos.y - mouse.y);
        if (dist <= trial.on_target_px) onTargetTime += dt;
        frames.push({ t: elapsed, x: pos.x, y: pos.y, cx: mouse.x, cy: mouse.y, dist, dir });

        if (elapsed >= trial.duration_ms) finish();
        else if (run) window.requestAnimationFrame(frame);
      };

      window.requestAnimationFrame(frame);
    }
  }

  return PursuitRotorCog;
})(window.jsPsychModule);
