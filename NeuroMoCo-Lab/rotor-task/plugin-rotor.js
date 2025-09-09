/**
 * jsPsych Plugin: rotor-task
 * Pursuit rotor task with shape-coded states.
 *
 * Credits:
 *   - jsPsych (de Leeuw, 2015, MIT License)
 *   - WebGazer.js (Papoutsaki et al., 2016, GPLv3)
 */

jsPsych.plugins['rotor'] = (function() {

  const plugin = {};

  plugin.info = {
    name: 'rotor',
    parameters: {
      duration_s: { type: jsPsych.plugins.parameterType.INT, default: 10 },
      sampleMs: { type: jsPsych.plugins.parameterType.INT, default: 20 },
      canvasWidth: { type: jsPsych.plugins.parameterType.INT, default: 800 },
      canvasHeight: { type: jsPsych.plugins.parameterType.INT, default: 600 },
      pathType: { type: jsPsych.plugins.parameterType.STRING, default: 'circle' },
      velocity: { type: jsPsych.plugins.parameterType.FLOAT, default: 1.0 },
      complexity: { type: jsPsych.plugins.parameterType.INT, default: 2 },
      nSwitches: { type: jsPsych.plugins.parameterType.INT, default: 5 },
      minSwitchMs: { type: jsPsych.plugins.parameterType.INT, default: 800 },
      maxSwitchMs: { type: jsPsych.plugins.parameterType.INT, default: 1500 },
      freezeMinMs: { type: jsPsych.plugins.parameterType.INT, default: 500 },
      freezeMaxMs: { type: jsPsych.plugins.parameterType.INT, default: 2000 },
      nJitters: { type: jsPsych.plugins.parameterType.INT, default: 0 },
      jitterMagnitudePx: { type: jsPsych.plugins.parameterType.FLOAT, default: 10 },
      jitterDurationMs: { type: jsPsych.plugins.parameterType.INT, default: 100 },
      seed: { type: jsPsych.plugins.parameterType.INT, default: 42 },
      participantId: { type: jsPsych.plugins.parameterType.STRING, default: "" },
      conditionLabel: { type: jsPsych.plugins.parameterType.STRING, default: "" }
    }
  };

  plugin.trial = function(display_element, trial) {
    // --- Setup ---
    display_element.innerHTML = `<canvas id="rotor-canvas" width="${trial.canvasWidth}" height="${trial.canvasHeight}"></canvas>`;
    const canvas = document.getElementById('rotor-canvas');
    const ctx = canvas.getContext('2d');

    const rng = seededPRNG(trial.seed);
    const schedules = buildSchedules(trial, rng);

    let mouse = {x: trial.canvasWidth/2, y: trial.canvasHeight/2};
    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    });

    let gaze = {x: NaN, y: NaN};
    startWebgazer(canvas, g => gaze = g);

    let samples = [];
    let startTime = performance.now();
    let endTime = startTime + trial.duration_s*1000;
    let nextSampleAt = startTime;

    // --- Loop ---
    function frame(now) {
      if (now >= endTime) {
        endTrial();
        return;
      }

      // --- Determine current shape based on schedule ---
      let currentShape = 'circle';
      for (let s of schedules.switches) {
        if (now - startTime >= s.t_ms) {
          currentShape = s.shape;
        }
      }
      schedules.currentShape = currentShape;

      // --- Collect fixed-grid samples ---
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
          gazeX: gaze.x,
          gazeY: gaze.y,
          error_px: err,
          shape: currentShape
        });
        nextSampleAt += trial.sampleMs;
      }

      // --- Draw target shape ---
      const pos = computeTargetPosition((now - startTime)/1000, trial, schedules);
      drawTarget(ctx, pos, currentShape);

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    function endTrial() {
      stopWebgazer();

      display_element.innerHTML = '';
      jsPsych.finishTrial({
        participantId: trial.participantId,
        conditionLabel: trial.conditionLabel,
        samples,
        schedules
      });
    }
  };

  return plugin;
})();

/* ===== Helper: Build schedules ===== */
function buildSchedules(trial, rng) {
  const switches = [];
  let t = 0;
  for (let i=0; i<trial.nSwitches; i++) {
    t += trial.minSwitchMs + Math.floor(rng() * (trial.maxSwitchMs - trial.minSwitchMs));
    if (t >= trial.duration_s*1000) break;
    const shapeIdx = Math.floor(rng() * 3); // 0=circle,1=triangle,2=square
    const shape = (shapeIdx === 0) ? 'circle' : (shapeIdx === 1) ? 'triangle' : 'square';
    switches.push({index: i, t_ms: t, shape});
  }
  return {switches, currentShape: 'circle'};
}
