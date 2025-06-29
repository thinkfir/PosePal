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

  // --- Basic Posture Logic (Reverted) ---
  const basicHorizontalTiltThreshold = 0.07; // Head tilted if ear is >7% of frame width from shoulder horizontally
  const basicMinVerticalNeckHeight = 0.03;  // Head dropped if ear is <3% of frame height above shoulder (dy is positive if ear is above shoulder)
  const basicForwardHeadOffsetThreshold = -0.05; // Head forward if ear.x is < shoulder.x by 5% of frame width (more negative dx)

  let currentPosture = "Good Posture"; // Default to Good

  // Check for bad posture conditions in a specific order
  if (dyLeft < basicMinVerticalNeckHeight || dyRight < basicMinVerticalNeckHeight) {
    currentPosture = "Bad Posture"; // Condition: Head Dropped
  } else if (Math.abs(dxLeft) > basicHorizontalTiltThreshold || Math.abs(dxRight) > basicHorizontalTiltThreshold) {
    currentPosture = "Bad Posture"; // Condition: Head Tilted
  } else if (dxLeft < basicForwardHeadOffsetThreshold || dxRight < basicForwardHeadOffsetThreshold) {
    // This is a simplified "head forward" check.
    // dxLeft/Right = ear.x - shoulder.x. Negative means ear is to the left of shoulder (from camera view).
    // Assuming a typical setup where the camera is in front, this can indicate leaning forward.
    currentPosture = "Bad Posture"; // Condition: Head Forward
  }

  // Update status display and send message
  if (currentPosture === "Bad Posture") {
    statusDisplay.textContent = "Bad Posture";
    statusDisplay.className = 'bad-posture';
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      // Send a simple status, not detailed messages as in the more complex version
      chrome.runtime.sendMessage({ type: "POSTURE_STATUS", status: "Bad Posture" });
    }
  } else {
    statusDisplay.textContent = "Good Posture";
    statusDisplay.className = 'good-posture';
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "POSTURE_STATUS", status: "Good Posture" });
    }
  }
  // --- End of Reverted Basic Posture Logic ---

  canvasCtx.restore();
}