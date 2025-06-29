let posture = "Neutral";

// Declare variables that will be assigned when DOM is ready
let videoElement, canvasElement, canvasCtx, statusDisplay, pose, camera;
let pipVideoElement; // NEW: Hidden video element for PiP stream from canvas
let autoPipEnabled = true; // Local cache of the setting, default true
let wasAutoPiP = false; // Flag to track if PiP was entered automatically by this script
let pipInteractionOccurred = false; // NEW: Flag to track if user has interacted with PiP controls

// NEW: Default thresholds for angle-based checks (in degrees)
let headTiltAngleThreshold = 25; // Increased from 20
let forwardHeadAngleThreshold = 23; // Adjusted from 27/22
let shoulderTiltAngleThreshold = 15; // Increased from 12

// Existing settings that will be loaded from storage
let minVerticalNeckHeight = 0.004; // Adjusted from 0.012/0.008
let enableNotifications = true;

// NEW: Calibration related variables
let calibratedMetrics = null; // Will store { headTilt, forwardHead, shoulderTilt, neckHeight }
let isCalibrating = false; // Flag to trigger calibration in onResults

// NEW: Default deviation thresholds (used if posture is calibrated)
let maxHeadTiltDeviation = 15; // degrees, increased from 10
let maxForwardHeadDeviation = 13; // degrees, adjusted from 16/12
let maxShoulderTiltDeviation = 12; // degrees, increased from 8
let neckHeightRatioDeviation = 0.030; // Adjusted from 0.020/0.025

// Debounce/grace period for posture feedback
let lastPostureIsGood = true;
let postureStateChangedAt = Date.now();
let pendingPostureIsGood = true;
let POSTURE_GRACE_PERIOD_MS = 1500; // Default 1.5 seconds, will be updated from settings

document.addEventListener('DOMContentLoaded', () => {
    videoElement = document.getElementById('video');
    canvasElement = document.getElementById('output');
    canvasCtx = canvasElement.getContext('2d');
    statusDisplay = document.getElementById('status');
    const settingsIcon = document.getElementById('settingsIcon'); // Get the settings icon
    const pipButton = document.getElementById('pipButton'); // Get the PiP button
    const calibrateButton = document.getElementById('calibrateButton'); // NEW: Get the Calibrate button

    // NEW: Create a hidden video element for PiP streaming from canvas
    pipVideoElement = document.createElement('video');
    pipVideoElement.id = 'pipVideoOutput';
    pipVideoElement.autoplay = true;
    pipVideoElement.muted = true; // Important for autoplay and background streaming

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

    // Settings icon functionality
    if (settingsIcon) {
        settingsIcon.addEventListener('click', () => {
            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            } else {
                // Fallback for environments where openOptionsPage might not be available (e.g. during development)
                window.open(chrome.runtime.getURL('settings.html'));
            }
        });
    } else {
        console.error("Settings icon (settingsIcon) not found.");
    }

    // PiP Button functionality
    if (pipButton && pipVideoElement) { // Check pipVideoElement
        pipButton.addEventListener('click', togglePictureInPicture);

        // Update PiP button text/icon based on PiP state - LISTEN ON PIPVIDEOELEMENT
        pipVideoElement.addEventListener('enterpictureinpicture', () => {
            pipButton.title = "Exit Picture-in-Picture";
            // You could change the icon here, e.g., pipButton.textContent = '📺X';
        });

        pipVideoElement.addEventListener('leavepictureinpicture', () => {
            pipButton.title = "Toggle Picture-in-Picture";
            console.log("script.js: Left Picture-in-Picture mode (canvas stream, event listener).");
            wasAutoPiP = false; // If PiP is exited for any reason, it's no longer the current auto-PiP session.
            // Reset icon, e.g., pipButton.textContent = '📺';
        });

    } else {
        if (!pipButton) console.error("PiP button (pipButton) not found.");
        if (!pipVideoElement) console.error("pipVideoElement not found for PiP button events.");
    }

    // NEW: Calibrate Button functionality
    if (calibrateButton) {
        calibrateButton.addEventListener('click', () => {
            calibratePosture();
        });
    } else {
        console.error("Calibrate button (calibrateButton) not found.");
    }

    // Inform background script about the PosePal tab and request initial state
    if (chrome.runtime && chrome.runtime.sendMessage) {
        console.log("Sending REQUEST_INITIAL_STATE to background script.");
        chrome.runtime.sendMessage({ action: "REQUEST_INITIAL_STATE" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error sending REQUEST_INITIAL_STATE or receiving response:", chrome.runtime.lastError.message);
            } else if (response) {
                console.log("Received response for REQUEST_INITIAL_STATE:", response);
                // You can use response.posePalTabId and response.lastKnownPostureIsBad if needed here
            } else {
                console.warn("No response received for REQUEST_INITIAL_STATE.");
            }
        });
    } else {
        console.warn("chrome.runtime.sendMessage is not available. This script might not be running as an extension content script.");
    }
});

// Function to load settings from chrome.storage.sync
function loadPosePalSettings() {
    // Define default values for all settings PosePal uses
    const defaultValues = {
        headTiltAngleThreshold: 27, 
        forwardHeadAngleThreshold: 25, // Adjusted
        shoulderTiltAngleThreshold: 16, 
        minVerticalNeckHeight: 0.006, // Adjusted
        enableNotifications: true,
        enableAutoPip: true,
        // NEW: Add calibration settings and deviation thresholds to defaults
        calibratedMetrics: null,
        maxHeadTiltDeviation: 17,
        maxForwardHeadDeviation: 15, // Adjusted
        maxShoulderTiltDeviation: 13,
        neckHeightRatioDeviation: 0.035, // Adjusted
        enableBlurEffect: false, // Added from previous step, ensure it's here
        postureSensitivity: 50, // Added from previous step
        detectionDelay: 1500, // NEW: Default detection delay
    };

    chrome.storage.sync.get(defaultValues, (items) => {
        if (chrome.runtime.lastError) {
            console.error("Error loading settings in script.js:", chrome.runtime.lastError.message);
            // In case of error, explicitly use the compiled-in defaults
            headTiltAngleThreshold = defaultValues.headTiltAngleThreshold;
            forwardHeadAngleThreshold = defaultValues.forwardHeadAngleThreshold;
            shoulderTiltAngleThreshold = defaultValues.shoulderTiltAngleThreshold;
            minVerticalNeckHeight = defaultValues.minVerticalNeckHeight;
            enableNotifications = defaultValues.enableNotifications;
            autoPipEnabled = defaultValues.enableAutoPip;
            // REMOVE CALIBRATION RELATED SETTINGS FROM HERE
            // postureSensitivityFactor is now calculated based on postureSensitivity
            // No longer loading individual thresholds or calibration data
            POSTURE_GRACE_PERIOD_MS = defaultValues.detectionDelay; // NEW
            // Calculate postureSensitivityFactor based on loaded/default postureSensitivity
            // Assuming postureSensitivity is 1-100. Let's map it to a factor, e.g., 0.5 to 1.5
            // A sensitivity of 50 could be a factor of 1.0 (no change to base thresholds)
            // A sensitivity of 1 could be a factor of 1.5 (less sensitive, larger thresholds)
            // A sensitivity of 100 could be a factor of 0.5 (more sensitive, smaller thresholds)
            postureSensitivityFactor = 1.0 - ( (items.postureSensitivity - 50) / 50 ) * 0.5; // Example mapping
            // Ensure factor is within a reasonable range, e.g., 0.5 to 1.5
            postureSensitivityFactor = Math.max(0.5, Math.min(1.5, postureSensitivityFactor));


            console.log('PosePal settings loaded (ERROR FALLBACK) in script.js:', {
                enableNotifications,
                autoPipEnabled,
                enableBlurEffect: items.enableBlurEffect, // ensure this is logged
                postureSensitivity: items.postureSensitivity,
                postureSensitivityFactor, // Log the calculated factor
                detectionDelay: POSTURE_GRACE_PERIOD_MS // NEW
            });
            return;
        }
        
        // Assign values from storage (or defaults if not in storage)
        headTiltAngleThreshold = items.headTiltAngleThreshold;
        forwardHeadAngleThreshold = items.forwardHeadAngleThreshold;
        shoulderTiltAngleThreshold = items.shoulderTiltAngleThreshold;
        minVerticalNeckHeight = items.minVerticalNeckHeight;
        enableNotifications = items.enableNotifications;
        autoPipEnabled = items.enableAutoPip;
        // REMOVE CALIBRATION RELATED SETTINGS FROM HERE
        POSTURE_GRACE_PERIOD_MS = items.detectionDelay; // NEW

        // Calculate postureSensitivityFactor based on loaded postureSensitivity
        postureSensitivityFactor = 1.0 - ( (items.postureSensitivity - 50) / 50 ) * 0.5; // Example mapping
        postureSensitivityFactor = Math.max(0.5, Math.min(1.5, postureSensitivityFactor));
        
        console.log('PosePal settings loaded/applied in script.js:', {
            enableNotifications,
            autoPipEnabled,
            enableBlurEffect: items.enableBlurEffect,
            postureSensitivity: items.postureSensitivity,
            postureSensitivityFactor,
            detectionDelay: POSTURE_GRACE_PERIOD_MS // NEW
        });
    });
}

// Listen for changes to settings
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        console.log("Settings changed, reloading in script.js:", changes);
        loadPosePalSettings(); // Reload all settings if any change
    }
});

// Initial load of settings
loadPosePalSettings();

document.addEventListener('visibilitychange', async () => { // Made async
    console.log(`script.js: Visibility changed to: ${document.visibilityState}. Auto PiP enabled: ${autoPipEnabled}.`);
    if (!pipVideoElement) { // Check pipVideoElement
        console.warn("script.js: pipVideoElement is null in visibilitychange handler.");
        return;
    }
    // No need to check videoElement.srcObject here as pipVideoElement gets stream from canvas

    console.log(`script.js: pipVideoElement.readyState: ${pipVideoElement.readyState}, paused: ${pipVideoElement.paused}, pipInteractionOccurred: ${pipInteractionOccurred}`);

    if (document.visibilityState === 'hidden') {
        console.log(`script.js: Tab hidden. autoPipEnabled: ${autoPipEnabled}, PiP Active: ${document.pictureInPictureElement === pipVideoElement}, pipInteractionOccurred: ${pipInteractionOccurred}`);
        if (autoPipEnabled && pipInteractionOccurred && document.pictureInPictureElement !== pipVideoElement) {
            console.log("script.js: Conditions met for entering PiP (hidden, autoPipEnabled, pipInteractionOccurred, not already in PiP with pipVideoElement). Requesting PiP.");
            
            // Ensure canvas stream is active on pipVideoElement
            if (!pipVideoElement.srcObject && canvasElement.captureStream) {
                try {
                    pipVideoElement.srcObject = canvasElement.captureStream(25); // 25 FPS
                    await pipVideoElement.play(); // Ensure it's playing
                    console.log("script.js: pipVideoElement stream started in visibilitychange.");
                } catch (e) {
                    console.error("script.js: Error starting pipVideoElement stream in visibilitychange:", e);
                    return; // Don't proceed if stream fails
                }
            } else if (!pipVideoElement.srcObject) {
                 console.warn("script.js: pipVideoElement.srcObject is null and captureStream unavailable in visibilitychange.");
                 return;
            }

            pipVideoElement.requestPictureInPicture()
                .then(() => {
                    console.log("script.js: Entered PiP (canvas stream) due to tab hidden (interaction occurred).");
                    wasAutoPiP = true;
                })
                .catch(error => {
                    console.error("script.js: Error entering PiP (canvas stream) on tab hidden (interaction occurred):", error);
                    if (error.name === 'NotAllowedError') {
                        console.warn("script.js: Automatic PiP (canvas stream) failed. Browser may require a fresh user interaction. Click PiP button on PosePal tab to re-enable for next switch.");
                        pipInteractionOccurred = false; // Reset flag, requiring new user gesture
                    }
                });
        } else if (autoPipEnabled && !pipInteractionOccurred) {
            console.warn("script.js: Auto PiP enabled, but requires a manual PiP toggle first (or again if a previous auto-attempt failed). Please click the PiP button on the PosePal tab.");
        } else {
            console.log("script.js: Conditions NOT met for entering PiP (hidden).", {autoPipEnabled, pipActive: document.pictureInPictureElement === pipVideoElement, pipInteractionOccurred});
        }
    } else if (document.visibilityState === 'visible') {
        console.log(`script.js: Tab visible. Auto PiP enabled: ${autoPipEnabled}, PiP Active: ${document.pictureInPictureElement === pipVideoElement}, wasAutoPiP: ${wasAutoPiP}, pipInteractionOccurred: ${pipInteractionOccurred}`);
        if (document.pictureInPictureElement === pipVideoElement && wasAutoPiP) {
            console.log("script.js: Tab visible. PiP (canvas stream) was automatically opened and will remain open. Manual closure is required.");
        } else if (document.pictureInPictureElement === pipVideoElement && !wasAutoPiP) {
            console.log("script.js: Tab visible. PiP (canvas stream) is active (manually opened) and will remain open.");
        } else {
            console.log("script.js: Tab visible. No PiP active or PiP element is not our pipVideoElement.");
        }
    }
});

// UPDATED Manual Picture-in-Picture Toggle
async function togglePictureInPicture() {
    if (!pipVideoElement || !canvasElement) { // Check pipVideoElement and canvasElement
        console.error("pipVideoElement or canvasElement not found for manual PiP toggle.");
        return;
    }

    // Ensure canvas stream is active on pipVideoElement
    if (!pipVideoElement.srcObject && canvasElement.captureStream) {
        try {
            pipVideoElement.srcObject = canvasElement.captureStream(25); // 25 FPS
            await pipVideoElement.play(); // Ensure it's playing
            console.log("script.js: pipVideoElement stream started in togglePictureInPicture.");
        } catch (e) {
            console.error("script.js: Error starting pipVideoElement stream in togglePictureInPicture:", e);
            return; // Don't proceed if stream fails
        }
    } else if (!pipVideoElement.srcObject) {
        console.warn("script.js: pipVideoElement.srcObject is null and captureStream unavailable.");
        return;
    }


    if (document.pictureInPictureElement === pipVideoElement) {
        try {
            await document.exitPictureInPicture();
            console.log("Manually exited Picture-in-Picture mode (canvas stream).");
            wasAutoPiP = false;
            pipInteractionOccurred = true;
        } catch (error) {
            console.error("Error manually exiting Picture-in-Picture mode (canvas stream):", error);
        }
    } else {
        try {
            await pipVideoElement.requestPictureInPicture();
            console.log("Manually entered Picture-in-Picture mode (canvas stream).");
            wasAutoPiP = false;
            pipInteractionOccurred = true;
        } catch (error) {
            console.error("Error manually entering Picture-in-Picture mode (canvas stream):", error);
        }
    }
}

// NEW: Function to initiate posture calibration
function calibratePosture() {
    if (!videoElement || !videoElement.srcObject || videoElement.readyState < 2) {
        console.warn("script.js: Video not ready for calibration.");
        if (statusDisplay) {
            statusDisplay.textContent = "Webcam not ready. Please wait.";
            statusDisplay.className = 'neutral-posture';
        }
        return;
    }
    isCalibrating = true;
    if (statusDisplay) {
        statusDisplay.textContent = "Calibrating... Hold your ideal posture and look at the camera.";
        statusDisplay.className = 'neutral-posture'; // Or a specific 'calibrating' style
    }
    console.log("script.js: Calibration initiated. Waiting for next onResults.");

    // Optional: Provide a timeout for calibration attempt
    setTimeout(() => {
        if (isCalibrating) {
            isCalibrating = false; // Reset flag if no landmarks detected in time
            if (statusDisplay && statusDisplay.textContent.startsWith("Calibrating...")) {
                 statusDisplay.textContent = "Calibration timed out. Ensure you are clearly visible and try again.";
                 statusDisplay.className = 'bad-posture';
            }
            console.warn("script.js: Calibration timed out.");
        }
    }, 5000); // 5 seconds timeout
}

// Analyze posture from results
function onResults(results) {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height); // Re-enabled to show video feed on canvas for debugging

  if (!results.poseLandmarks) {
    // Draw "No pose detected" on canvas for PiP
    canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    canvasCtx.fillRect(0, canvasElement.height - 40, canvasElement.width, 40);
    canvasCtx.fillStyle = 'white';
    canvasCtx.font = '16px Arial';
    canvasCtx.textAlign = 'center';
    canvasCtx.fillText("No pose detected. Ensure you are visible.", canvasElement.width / 2, canvasElement.height - 15);
    canvasCtx.textAlign = 'left'; // Reset

    if (statusDisplay) {
        statusDisplay.textContent = "No pose detected. Ensure you are visible.";
        statusDisplay.className = 'neutral-posture';
    }
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: "POSTURE_STATUS", status: "NO_POSE", messages: [] });
    }
    // Update pipVideoElement stream
    if (pipVideoElement && canvasElement.captureStream && (!pipVideoElement.srcObject || pipVideoElement.srcObject.getVideoTracks()[0]?.readyState === 'ended')) {
        pipVideoElement.srcObject = canvasElement.captureStream(25);
        pipVideoElement.play().catch(e => console.warn("pipVideo play error on no pose:", e));
    }
    canvasCtx.restore();
    return;
  }

  const lm = results.poseLandmarks;
  const nose = lm[0]; // PoseLandmarker.PoseLandmarkIds.NOSE
  const leftEar = lm[7]; // PoseLandmarker.PoseLandmarkIds.LEFT_EAR
  const rightEar = lm[8]; // PoseLandmarker.PoseLandmarkIds.RIGHT_EAR
  const leftShoulder = lm[11]; // PoseLandmarker.PoseLandmarkIds.LEFT_SHOULDER
  const rightShoulder = lm[12]; // PoseLandmarker.PoseLandmarkIds.RIGHT_SHOULDER
  
  // Check if all essential landmarks are detected and sufficiently visible
  const requiredLandmarks = [nose, leftEar, rightEar, leftShoulder, rightShoulder];
  let allLandmarksValid = true;
  for (const landmark of requiredLandmarks) {
    if (!landmark || (landmark.visibility !== undefined && landmark.visibility < 0.5)) {
      allLandmarksValid = false;
      break;
    }
  }

  if (!allLandmarksValid) {
    // Draw "Partial or unclear pose" on canvas for PiP
    canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    canvasCtx.fillRect(0, canvasElement.height - 40, canvasElement.width, 40);
    canvasCtx.fillStyle = 'white';
    canvasCtx.font = '16px Arial';
    canvasCtx.textAlign = 'center';
    canvasCtx.fillText("Partial or unclear pose. Adjust position.", canvasElement.width / 2, canvasElement.height - 15);
    canvasCtx.textAlign = 'left'; // Reset

    if (statusDisplay) {
        statusDisplay.textContent = "Partial or unclear pose. Adjust visibility/position.";
        statusDisplay.className = 'neutral-posture';
    }
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: "POSTURE_STATUS", status: "PARTIAL_POSE", messages: [] });
    }
    // Update pipVideoElement stream
    if (pipVideoElement && canvasElement.captureStream && (!pipVideoElement.srcObject || pipVideoElement.srcObject.getVideoTracks()[0]?.readyState === 'ended')) {
        pipVideoElement.srcObject = canvasElement.captureStream(25);
        pipVideoElement.play().catch(e => console.warn("pipVideo play error on partial pose:", e));
    }
    canvasCtx.restore();
    return;
  }

  // Calculate current posture metrics
  const currentMetrics = {};
  // 1. Vertical Neck Height (Average)
  const dyLeftNeck = leftShoulder.y - leftEar.y; 
  const dyRightNeck = rightShoulder.y - rightEar.y;
  currentMetrics.neckHeight = (dyLeftNeck + dyRightNeck) / 2;

  // 2. Head Tilt (Side-to-Side)
  const earDiffX = rightEar.x - leftEar.x;
  const earDiffY = rightEar.y - leftEar.y;
  currentMetrics.headTilt = Math.atan2(earDiffY, earDiffX) * (180 / Math.PI);

  // 3. Forward Head Posture
  const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
  const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const headOffsetH = nose.x - midShoulderX;
  const headOffsetV = nose.y - midShoulderY;
  currentMetrics.forwardHead = Math.atan2(headOffsetH, -headOffsetV) * (180 / Math.PI);
  
  // 4. Shoulder Levelness
  const shoulderDiffX = rightShoulder.x - leftShoulder.x;
  const shoulderDiffY = rightShoulder.y - leftShoulder.y;
  currentMetrics.shoulderTilt = Math.atan2(shoulderDiffY, shoulderDiffX) * (180 / Math.PI);

  // NEW: Handle Calibration if isCalibrating is true
  if (isCalibrating) {
    calibratedMetrics = { ...currentMetrics }; // Store a copy
    chrome.storage.sync.set({ calibratedMetrics: calibratedMetrics }, () => {
        if (chrome.runtime.lastError) {
            console.error("Error saving calibrated metrics:", chrome.runtime.lastError.message);
            if (statusDisplay) {
                statusDisplay.textContent = "Error saving calibration. Please try again.";
                statusDisplay.className = 'bad-posture';
            }
        } else {
            console.log("Posture calibrated and saved:", calibratedMetrics);
            if (statusDisplay) {
                statusDisplay.textContent = "Posture Calibrated Successfully!";
                statusDisplay.className = 'good-posture'; 
            }
        }
    });
    isCalibrating = false; // Reset flag

    // Draw "Calibrated" on canvas for PiP
    canvasCtx.fillStyle = 'rgba(0, 128, 0, 0.7)'; // Greenish background
    canvasCtx.fillRect(0, canvasElement.height - 40, canvasElement.width, 40);
    canvasCtx.fillStyle = 'white';
    canvasCtx.font = '16px Arial';
    canvasCtx.textAlign = 'center';
    canvasCtx.fillText("Posture Calibrated Successfully!", canvasElement.width / 2, canvasElement.height - 15);
    canvasCtx.textAlign = 'left'; // Reset

    // Update pipVideoElement stream
    if (pipVideoElement && canvasElement.captureStream && (!pipVideoElement.srcObject || pipVideoElement.srcObject.getVideoTracks()[0]?.readyState === 'ended')) {
        pipVideoElement.srcObject = canvasElement.captureStream(25);
        pipVideoElement.play().catch(e => console.warn("pipVideo play error on calibration:", e));
    }
    canvasCtx.restore(); // Restore canvas before returning
    return; // Exit after calibration attempt, next frame will use new metrics
  }

  let feedbackMessages = [];
  let postureIsGood = true;

  if (calibratedMetrics) {
    // MODE 1: Check against calibrated posture using deviation thresholds
    if (Math.abs(currentMetrics.headTilt - calibratedMetrics.headTilt) > maxHeadTiltDeviation) {
        feedbackMessages.push(`Level head.`); // Simplified
        postureIsGood = false;
    }
    if (Math.abs(currentMetrics.forwardHead - calibratedMetrics.forwardHead) > maxForwardHeadDeviation) {
        feedbackMessages.push(`Align head.`); // Simplified
        postureIsGood = false;
    }
    if (Math.abs(currentMetrics.shoulderTilt - calibratedMetrics.shoulderTilt) > maxShoulderTiltDeviation) {
        feedbackMessages.push(`Level shoulders.`); // Simplified
        postureIsGood = false;
    }
    if (currentMetrics.neckHeight < (calibratedMetrics.neckHeight - neckHeightRatioDeviation)) {
        feedbackMessages.push(`Sit up straighter.`); // Simplified
        postureIsGood = false;
    }
  } else {
    // MODE 2: Fallback to absolute thresholds if not calibrated
    if (currentMetrics.neckHeight < minVerticalNeckHeight) { 
      feedbackMessages.push("Sit up straighter."); // Simplified
      postureIsGood = false;
    }
    if (Math.abs(currentMetrics.headTilt) > headTiltAngleThreshold) {
      feedbackMessages.push(`Level your head.`); // Simplified
      postureIsGood = false;
    }
    if (Math.abs(currentMetrics.forwardHead) > forwardHeadAngleThreshold) {
      feedbackMessages.push("Align your head (pull back)."); // Simplified
      postureIsGood = false;
    }
    if (Math.abs(currentMetrics.shoulderTilt) > shoulderTiltAngleThreshold) {
      feedbackMessages.push("Level your shoulders."); // Simplified
      postureIsGood = false;
    }
  }
  
  // --- Debounce/Grace Period Logic ---
  const now = Date.now();
  if (postureIsGood !== pendingPostureIsGood) {
    // Posture state changed, start grace period
    pendingPostureIsGood = postureIsGood;
    postureStateChangedAt = now;
  }
  // Only update UI if state is stable for grace period
  let showPostureIsGood = lastPostureIsGood;
  if (pendingPostureIsGood !== lastPostureIsGood && (now - postureStateChangedAt) >= POSTURE_GRACE_PERIOD_MS) {
    lastPostureIsGood = pendingPostureIsGood;
    showPostureIsGood = lastPostureIsGood;
  }

  // Update statusDisplay on the main page
  if (statusDisplay) {
      let pageMessage = "";
      if (!showPostureIsGood) {
          pageMessage = feedbackMessages.join(" ");
          statusDisplay.className = 'bad-posture';
      } else {
          pageMessage = "Good Posture!";
          statusDisplay.className = 'good-posture';
      }
      if (!calibratedMetrics) {
          pageMessage += (feedbackMessages.length > 0 ? " " : "") + "(Consider calibrating 🎯 for personalized tips)";
      }
      statusDisplay.textContent = pageMessage;
  }

  // Draw feedback messages on the canvas for PiP
  let pipTipMessage = "";
  if (!showPostureIsGood) {
      pipTipMessage = feedbackMessages.length > 0 ? feedbackMessages[0] : "Adjust posture"; // Show first simplified tip or generic
      canvasCtx.fillStyle = 'rgba(220, 53, 69, 0.85)'; // Updated bad posture PiP bar color (Bootstrap danger-like)
  } else {
      pipTipMessage = "Good Posture!";
      canvasCtx.fillStyle = 'rgba(40, 167, 69, 0.85)'; // Updated good posture PiP bar color (Bootstrap success-like)
  }
  
  let calibrationPipMessage = "";
  if (!calibratedMetrics) {
      calibrationPipMessage = "Tip: Calibrate on main page 🎯";
  }
  
  const textPadding = 10;
  // Increased bar height: base 45px, +15px if calibration message is also shown
  const barHeight = calibrationPipMessage ? 60 : 45; 
  const mainTipY = canvasElement.height - (barHeight / 2) + (calibrationPipMessage ? -9 : 6); // Adjusted Y for new bar height & potential second line
  const calibTipY = canvasElement.height - 18; // Position for calibration tip line

  // Draw background bar
  canvasCtx.fillRect(0, canvasElement.height - barHeight, canvasElement.width, barHeight);
  
  canvasCtx.fillStyle = 'white';
  canvasCtx.font = 'bold 19px Roboto, Arial'; // Slightly larger main tip font
  canvasCtx.textAlign = 'center';
  canvasCtx.fillText(pipTipMessage, canvasElement.width / 2, mainTipY);

  if (calibrationPipMessage) {
      canvasCtx.font = '15px Roboto, Arial'; // Slightly larger calibration tip font
      canvasCtx.fillText(calibrationPipMessage, canvasElement.width / 2, calibTipY);
  }

  canvasCtx.textAlign = 'left'; // Reset

  // Send status to background script unconditionally for badge and blur logic
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      if (feedbackMessages.length > 0) {
          chrome.runtime.sendMessage({ type: "POSTURE_STATUS", status: "Bad Posture", messages: feedbackMessages });
      } else {
          chrome.runtime.sendMessage({ type: "POSTURE_STATUS", status: "Good Posture", messages: [] });
      }
  }

  // Ensure the pipVideoElement is streaming the updated canvas
  if (pipVideoElement && canvasElement.captureStream) {
    // Check if the stream is not set, or if the track is ended (can happen if canvas is resized or hidden/reshown)
    const tracks = pipVideoElement.srcObject ? pipVideoElement.srcObject.getVideoTracks() : [];
    if (!pipVideoElement.srcObject || tracks.length === 0 || tracks[0].readyState === 'ended') {
        pipVideoElement.srcObject = canvasElement.captureStream(25); // FPS
        pipVideoElement.play().catch(e => console.warn("pipVideo play error in onResults:", e));
    }
  }
  canvasCtx.restore();
}