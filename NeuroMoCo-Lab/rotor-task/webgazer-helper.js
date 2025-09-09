/**
 * WebGazer Helper for Rotor Task
 * - Initialization
 * - Coordinate mapping
 * - Stop/cleanup
 *
 * Credit: WebGazer.js (Papoutsaki et al., 2016)
 */

function startWebgazer(canvas, callback) {
  if (!window.webgazer) {
    console.warn("WebGazer not loaded.");
    return;
  }

  webgazer.setGazeListener((data, ts) => {
    if (data == null) return;
    const rect = canvas.getBoundingClientRect();
    callback({
      x: data.x - rect.left,
      y: data.y - rect.top,
      ts
    });
  })
  .showVideo(false)
  .showFaceOverlay(false)
  .showFaceFeedbackBox(false)
  .begin();
}

function stopWebgazer() {
  try { webgazer.pause(); } catch(e) { }
}
