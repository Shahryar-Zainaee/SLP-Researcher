function runRotorTask(callback) {
  const canvas = document.createElement("canvas");
  canvas.id = "rotor-canvas";
  canvas.width = 800;
  canvas.height = 600;
  document.getElementById("jspsych-target").appendChild(canvas);

  const ctx = canvas.getContext("2d");
  const rng = seededPRNG(42);
  const schedules = buildSchedules(
    { nSwitches: 5, minSwitchMs: 800, maxSwitchMs: 1500, duration_s: 10 },
    rng
  );

  let mouse = { x: canvas.width / 2, y: canvas.height / 2 };
  canvas.addEventListener("mousemove", e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });

  let samples = [];
  let startTime = performance.now();
  let endTime = startTime + 10000;
  let nextSampleAt = startTime;

  function frame(now) {
    if (now >= endTime) {
      document.getElementById("jspsych-target").innerHTML = "";
      callback({ samples, schedules }); // pass data back to jsPsych
      return;
    }

    // Determine current shape
    let currentShape = "circle";
    for (let s of schedules.switches) {
      if (now - startTime >= s.t_ms) {
        currentShape = s.shape;
      }
    }

    // Collect samples
    while (now >= nextSampleAt && nextSampleAt <= endTime) {
      const t_ms = Math.round(nextSampleAt - startTime);
      const pos = computeTargetPosition(t_ms / 1000, { canvasWidth: 800, canvasHeight: 600, velocity: 1 }, schedules);
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
      nextSampleAt += 20;
    }

    // Draw
    const pos = computeTargetPosition((now - startTime) / 1000, { canvasWidth: 800, canvasHeight: 600, velocity: 1 }, schedules);
    drawTarget(ctx, pos, currentShape);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
