/**
 * jsPsych Plugin: rotor-task
 * Pursuit rotor task with shape-coded states.
 *
 * Credits:
 *   - jsPsych (de Leeuw, 2015, MIT License)
 */

class RotorPlugin {
  static info = {
    name: 'rotor',
    parameters: {
      duration_s: { type: Number, default: 10 },
      sampleMs: { type: Number, default: 20 },
      canvasWidth: { type: Number, default: 800 },
      canvasHeight: { type: Number, default: 600 },
      pathType: { type: String, default: 'circle' },
      velocity: { type: Number, default: 1.0 },
      complexity: { type: Number, default: 2 },
      nSwitches: { type: Number, default: 5 },
      minSwitchMs: { type: Number, default: 800 },
      maxSwitchMs: { type: Number, default: 1500 },
      freezeMinMs: { type: Number, default: 500 },
      freezeMaxMs: { type: Number, default: 2000 },
      nJitters: { type: Number, default: 0 },
      jitterMagnitudePx: { type: Number, default: 10 },
      jitterDurationMs: { type: Number, default: 100 },
      seed: { type: Number, default: 42 },
      participantId: { type: String, default: "" },
      conditionLabel: { type: String, default: "" }
    }
  };

  constructor(jsPsych) {
    this.jsPsych = jsPsych;
  }

  trial(display_element, trial) {
    display_element.innerHTML = `<canvas id="rotor-canvas" width="${trial.canvasWidth}" height="${trial.canvasHeight}"></canvas>`;
    const canvas = document.getElementById('rotor-canvas');
    const ctx = canvas.getContext('2d');

    const rng = seededPRNG(trial.seed);
    const schedules = buildSchedules(trial, rng);

    let mouse = { x: trial.canvasWidth/2, y: trial.canvasHeight/2 };
    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    });

    let samples = [];
    let startTime = performance.now();
    let endTime = startTime + trial.duration_s * 1000;
    let nextSampleAt = startTime;

    const frame = (now) => {
      if (now >= endTime) {
        endTrial();
        return;
      }

      let currentShape = 'circle';
      for (let s of schedules.switches) {
        if (now - startTime >= s.t_ms) {
          currentShape = s.shape;
        }
      }
      schedules.currentShape = currentShape;

      while (now >= nextSampleAt && nextSampleAt <= endTime) {
        const t_ms = Math.round(nextSampleAt - startTime);
        const pos = computeTargetPosition(t_ms/1000, trial, schedules);
        const err = Math.hypot(mouse.x - pos.x, mouse.y - pos.y);

        samples.push({
          t_ms,
          targetX: pos.x,
          targetY: pos.y,
          mouseX: mouse.x,
          mouseY: mouse.y,
          error_px: err,
          shape: currentShape
        });
        nextSampleAt += trial.sampleMs;
      }

      const pos = computeTargetPosition((now - startTime)/1000, trial, schedules);
      drawTarget(ctx, pos, currentShape);

      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    const endTrial = () => {
      display_element.innerHTML = '';
      this.jsPsych.finishTrial({
        participantId: trial.participantId,
        conditionLabel: trial.conditionLabel,
        samples,
        schedules
      });
    };
  }
}

// Register with jsPsych
jsPsych.plugins['rotor'] = RotorPlugin;
