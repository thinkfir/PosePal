const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('output');
const canvasCtx = canvasElement.getContext('2d');
const statusDisplay = document.getElementById('status');

// Initialize MediaPipe Pose
const pose = new Pose({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
});
pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: false,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

pose.onResults(onResults);

// Webcam setup
const camera = new Camera(videoElement, {
  onFrame: async () => {
    await pose.send({ image: videoElement });
  },
  width: 640,
  height: 480,
});
camera.start();

// Analyze posture from results
function onResults(results) {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  if (!results.poseLandmarks) {
    // Optional: Update status if no landmarks detected for a few frames
    // statusDisplay.textContent = " No person detected";
    // statusDisplay.className = ''; // Reset class
    canvasCtx.restore(); // Ensure restore is called
    return;
  }

  const lm = results.poseLandmarks;
  const leftEar = lm[7];
  const leftShoulder = lm[11];
  const rightEar = lm[8];
  const rightShoulder = lm[12];

  // Check if essential landmarks are available
  if (!leftEar || !leftShoulder || !rightEar || !rightShoulder) {
    // statusDisplay.textContent = " Landmarks not clear";
    // statusDisplay.className = '';
    canvasCtx.restore();
    return;
  }

  // Calculate horizontal and vertical differences for posture analysis.

  // dx: Horizontal distance between ear and shoulder.
  //     Positive if ear is to the right of the shoulder (from camera's perspective).
  const dxLeft = leftEar.x - leftShoulder.x;
  const dxRight = rightEar.x - rightShoulder.x;

  // dy: Vertical distance between shoulder and ear.
  //     Positive if shoulder is below the ear (y-coordinates increase downwards).
  //     A larger positive value means more neck visible / head higher relative to shoulder.
  const dyLeft = leftShoulder.y - leftEar.y;
  const dyRight = rightShoulder.y - rightEar.y;

  // --- Define Bad Posture Conditions ---
  // These thresholds are normalized (0.0 to 1.0 related to image dimensions)
  // and may need tuning based on observation.

  // Condition 1: Head too far tilted or swayed horizontally.
  // Bad if the absolute horizontal distance between ear and shoulder exceeds this threshold.
  // (e.g., 7% of the image width).
  const horizontalTiltThreshold = 0.07; // Adjust as needed
  const isHorizontallyTilted =
    Math.abs(dxLeft) > horizontalTiltThreshold ||
    Math.abs(dxRight) > horizontalTiltThreshold;

  // Condition 2: Head dropped too low (chin towards chest, or neck compressed).
  // Bad if the vertical distance (shoulder.y - ear.y) is less than this threshold.
  // (e.g., ear is less than 5% of image height above the shoulder, or even below it).
  const minVerticalNeckHeight = 0.05; // Adjust as needed
  const isHeadDropped =
    dyLeft < minVerticalNeckHeight ||
    dyRight < minVerticalNeckHeight;

  // Combine conditions: Slouching if head is significantly tilted OR if head is dropped.
  const slouching = isHorizontallyTilted || isHeadDropped;

  /*
  // Original logic for reference:
  const dxLeftOriginal = leftEar.x - leftShoulder.x;
  const dxRightOriginal = rightEar.x - rightShoulder.x;
  // This rule flagged good alignment (ear very close to shoulder horizontally) as bad.
  const slouchingOriginal = Math.abs(dxLeftOriginal) < 0.03 || Math.abs(dxRightOriginal) < 0.03;
  */

  if (slouching) {
    statusDisplay.textContent = " Bad Posture";
    statusDisplay.className = 'bad-posture';
  } else {
    statusDisplay.textContent = " Good Posture";
    statusDisplay.className = 'good-posture';
  }

  canvasCtx.restore();
}