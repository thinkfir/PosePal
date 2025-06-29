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

  // --- Load settings and then apply posture logic ---
  // Default settings (should match settings.js defaults)
  const defaultSettings = {
    enableNotifications: true, // Though notifications are handled in background.js, script.js needs to know if it should send messages
    horizontalTiltThreshold: 0.07,
    minVerticalNeckHeight: 0.03,
    forwardHeadOffsetThreshold: -0.05,
    shoulderHeightDifferenceThreshold: 0.04
  };

  chrome.storage.sync.get(defaultSettings, (settings) => {
    const { 
        horizontalTiltThreshold,
        minVerticalNeckHeight,
        forwardHeadOffsetThreshold,
        shoulderHeightDifferenceThreshold,
        enableNotifications // Used to decide if messages should be sent
    } = settings;

    let feedbackMessages = [];

    // Check for bad posture conditions using loaded settings
    if (dyLeft < minVerticalNeckHeight || dyRight < minVerticalNeckHeight) {
      feedbackMessages.push("Lift your chin / Sit up straighter.");
    }
    
    if (Math.abs(dxLeft) > horizontalTiltThreshold || Math.abs(dxRight) > horizontalTiltThreshold) {
      feedbackMessages.push("Level your head.");
    }
    
    if (dxLeft < forwardHeadOffsetThreshold || dxRight < forwardHeadOffsetThreshold) {
      feedbackMessages.push("Bring your head back (ears over shoulders).");
    }

    const shoulderHeightDifference = Math.abs(leftShoulder.y - rightShoulder.y);
    if (shoulderHeightDifference > shoulderHeightDifferenceThreshold) {
      feedbackMessages.push("Level your shoulders.");
    }

    if (feedbackMessages.length > 0) {
      statusDisplay.textContent = feedbackMessages.join(" ");
      statusDisplay.className = 'bad-posture';
      if (enableNotifications && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: "POSTURE_STATUS", status: "Bad Posture", messages: feedbackMessages });
      }
    } else {
      statusDisplay.textContent = "Good Posture";
      statusDisplay.className = 'good-posture';
      // Optionally, send a "Good Posture" message if notifications are on, though typically not needed for good status
      // if (enableNotifications && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      //   chrome.runtime.sendMessage({ type: "POSTURE_STATUS", status: "Good Posture" });
      // }
    }
  });
  // --- End of Posture Logic ---

  canvasCtx.restore();
}