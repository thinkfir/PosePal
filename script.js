let posture = "Neutral";

// Declare variables that will be assigned when DOM is ready
let videoElement, canvasElement, canvasCtx, statusDisplay, pose, camera;

document.addEventListener('DOMContentLoaded', () => {
    videoElement = document.getElementById('video');
    canvasElement = document.getElementById('output');
    canvasCtx = canvasElement.getContext('2d');
    statusDisplay = document.getElementById('status');

    // Initialize MediaPipe Pose
    pose = new Pose({
      locateFile: (file) => {
        return `mediapipe.libs/${file}`;
      }
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
    camera = new Camera(videoElement, {
      onFrame: async () => {
        if (videoElement && videoElement.readyState >= 2) {
          await pose.send({ image: videoElement });
        }
      },
      width: 640,
      height: 480,
    });
    camera.start();

    // Settings button functionality removed
    // const openSettingsButton = document.getElementById('openSettingsButton');
    // if (openSettingsButton) {
    //     openSettingsButton.addEventListener('click', () => {
    //         if (chrome.runtime.openOptionsPage) {
    //             chrome.runtime.openOptionsPage();
    //         } else {
    //             window.open(chrome.runtime.getURL('settings.html'));
    //         }
    //     });
    // } else {
    //     console.error("Settings button (openSettingsButton) not found.");
    // }
});

// Analyze posture from results
function onResults(results) {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  if (!results.poseLandmarks) {
    canvasCtx.restore();
    return;
  }

  const lm = results.poseLandmarks;
  const leftEar = lm[7];
  const leftShoulder = lm[11];
  const rightEar = lm[8];
  const rightShoulder = lm[12];

  if (!leftEar || !leftShoulder || !rightEar || !rightShoulder) {
    canvasCtx.restore();
    return;
  }

  const dxLeft = leftEar.x - leftShoulder.x;
  const dxRight = rightEar.x - rightShoulder.x;
  const dyLeft = leftShoulder.y - leftEar.y;
  const dyRight = rightShoulder.y - rightEar.y;

  const horizontalTiltThreshold = 0.07;
  const isHorizontallyTilted =
    Math.abs(dxLeft) > horizontalTiltThreshold ||
    Math.abs(dxRight) > horizontalTiltThreshold;

  const minVerticalNeckHeight = 0.025; // Adjusted from 0.05
  const isHeadDropped =
    dyLeft < minVerticalNeckHeight ||
    dyRight < minVerticalNeckHeight;

  const neckCrunchVerticalMax = 0.10;
  const neckCrunchHorizontalThreshold = 0.03;

  const isLeftNeckCrunched = 
    (dyLeft >= minVerticalNeckHeight && dyLeft < neckCrunchVerticalMax) && 
    (Math.abs(dxLeft) > neckCrunchHorizontalThreshold);
  
  const isRightNeckCrunched = 
    (dyRight >= minVerticalNeckHeight && dyRight < neckCrunchVerticalMax) && 
    (Math.abs(dxRight) > neckCrunchHorizontalThreshold);

  const isForwardNeckCrunch = isLeftNeckCrunched || isRightNeckCrunched;

  let feedbackMessages = [];

  if (isHorizontallyTilted) {
    feedbackMessages.push("Level your head.");
  }
  if (isHeadDropped) {
    feedbackMessages.push("Lift your chin / Sit up straighter.");
  }
  if (isForwardNeckCrunch && !isHeadDropped) { // Avoid redundant message if head is already fully dropped
    feedbackMessages.push("Bring your head back (ears over shoulders).");
  }

  // Check for uneven shoulders
  const shoulderHeightDifferenceThreshold = 0.04; // e.g., 4% of image height
  const shoulderHeightDifference = Math.abs(leftShoulder.y - rightShoulder.y);
  if (shoulderHeightDifference > shoulderHeightDifferenceThreshold) {
    feedbackMessages.push("Level your shoulders.");
  }

  if (feedbackMessages.length > 0) {
    statusDisplay.textContent = feedbackMessages.join(" ");
    statusDisplay.className = 'bad-posture';
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "POSTURE_STATUS", status: "Bad Posture", messages: feedbackMessages });
    }
  } else {
    statusDisplay.textContent = "Good Posture";
    statusDisplay.className = 'good-posture';
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "POSTURE_STATUS", status: "Good Posture" });
    }
  }

  canvasCtx.restore();
}