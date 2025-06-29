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

  // --- Basic Posture Logic with Specific Feedback (Reverted and Modified) ---
  const basicHorizontalTiltThreshold = 0.07; 
  const basicMinVerticalNeckHeight = 0.03;  
  const basicForwardHeadOffsetThreshold = -0.05; 
  const shoulderHeightDifferenceThreshold = 0.04; 

  let feedbackMessages = [];

  // Check for bad posture conditions
  // These conditions are checked independently and can accumulate messages.

  if (dyLeft < basicMinVerticalNeckHeight || dyRight < basicMinVerticalNeckHeight) {
    feedbackMessages.push("Lift your chin / Sit up straighter."); // Condition: Head Dropped
  }
  
  if (Math.abs(dxLeft) > basicHorizontalTiltThreshold || Math.abs(dxRight) > basicHorizontalTiltThreshold) {
    feedbackMessages.push("Level your head."); // Condition: Head Tilted
  }
  
  // This is a simplified "head forward" check.
  // dxLeft/Right = ear.x - shoulder.x. Negative means ear is to the left of shoulder (from camera view).
  // Assuming a typical setup where the camera is in front, this can indicate leaning forward.
  if (dxLeft < basicForwardHeadOffsetThreshold || dxRight < basicForwardHeadOffsetThreshold) {
    feedbackMessages.push("Bring your head back (ears over shoulders)."); // Condition: Head Forward
  }

  // Check for uneven shoulders
  const shoulderHeightDifference = Math.abs(leftShoulder.y - rightShoulder.y);
  if (shoulderHeightDifference > shoulderHeightDifferenceThreshold) {
    feedbackMessages.push("Level your shoulders.");
  }

  // Update status display and send message
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
  // --- End of Modified Basic Posture Logic ---

  canvasCtx.restore();
}