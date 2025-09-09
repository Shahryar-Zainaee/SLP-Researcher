/**
 * jsPsych Plugin: rotor-task
 * Pursuit rotor task with shape-coded states.
 *
 * Credits:
 *   - jsPsych (de Leeuw, 2015, MIT License)
 */

(function() {
  const plugin = {};

  plugin.info = {
    name: 'rotor',
    parameters: {
      duration_s: { type: jsPsych.ParameterType.INT, default: 10 },
      sampleMs: { type: jsPsych.ParameterType.INT, default: 20 },
      canvasWidth: { type: jsPsych.ParameterType.INT, default: 800 },
      canvasHeight: { type: jsPsych.ParameterType.INT, default: 600 },
      pathType: { type: jsPsych.ParameterType.STRING, default: 'circle' },
      velocity: { type: jsPsych.ParameterType.FLOAT, default: 1.0 },
      complexity: { type: jsPsych.ParameterType.INT, default: 2 },
      nSwitches: { type: jsPsych.ParameterType.INT, default: 5 },
      minSwitchMs: { type: jsPsych.ParameterType.INT, default: 800 },
      maxSwitchMs: { type: jsPsych.ParameterType.INT, default: 1500 },
      freezeMinMs: { type: jsPsych.ParameterType.INT, default: 500 },
      freezeMaxMs: { type: jsPsych.ParameterType.INT, default: 2000 },
      nJitters: { type: jsPsych.ParameterType.INT, default: 0 },
      jitterMagnitudePx: { type: jsPsych.ParameterType.FLOAT, default: 10 },
      jitterDurationMs: { type: jsPsych.ParameterType.INT, default: 100 },
      seed: { type: jsPsych.ParameterType.INT, default: 42 },
      participantId: { type: jsPsych.ParameterType.STRING, default: "" },
      conditionLabel: { type: jsPsych.ParameterType.STRING, default: "" }
    }
  };

  plugin.trial = function(display_element, trial) {
    // --- Setup ---
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

    // --- Loop ---
    function frame(now) {
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
    }
    requestAnimationFrame(frame);

    function endTrial() {
      display_element.innerHTML = '';
      jsPsych.finishTrial({
        participantId: trial.participantId,
        conditionLabel: trial.conditionLabel,
        samples,
        schedules
      });
    }
  };

  jsPsych.plugins['rotor'] = plugin;
})();
