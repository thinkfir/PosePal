let posture = "Neutral";

// Declare variables that will be assigned when DOM is ready
let videoElement, canvasElement, canvasCtx, statusDisplay, pose, camera;
let autoPipEnabled = true; // Local cache of the setting, default true
let wasAutoPiP = false; // Flag to track if PiP was entered automatically by this script
let pipInteractionOccurred = false; // NEW: Flag to track if user has interacted with PiP controls

document.addEventListener('DOMContentLoaded', () => {
    videoElement = document.getElementById('video');
    canvasElement = document.getElementById('output');
    canvasCtx = canvasElement.getContext('2d');
    statusDisplay = document.getElementById('status');
    const settingsIcon = document.getElementById('settingsIcon'); // Get the settings icon
    const pipButton = document.getElementById('pipButton'); // Get the PiP button

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
    if (pipButton && videoElement) {
        pipButton.addEventListener('click', togglePictureInPicture);

        // Update PiP button text/icon based on PiP state
        videoElement.addEventListener('enterpictureinpicture', () => {
            pipButton.title = "Exit Picture-in-Picture";
            // You could change the icon here, e.g., pipButton.textContent = '📺X';
        });

        videoElement.addEventListener('leavepictureinpicture', () => {
            pipButton.title = "Toggle Picture-in-Picture";
            console.log("script.js: Left Picture-in-Picture mode (event listener).");
            wasAutoPiP = false; // If PiP is exited for any reason, it's no longer the current auto-PiP session.
            // Reset icon, e.g., pipButton.textContent = '📺';
        });

    } else {
        if (!pipButton) console.error("PiP button (pipButton) not found.");
        if (!videoElement) console.error("Video element not found for PiP.");
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
    chrome.storage.sync.get([
        'horizontalTiltThreshold', 
        'minVerticalNeckHeight', 
        'forwardHeadOffsetThreshold', 
        'shoulderHeightDifferenceThreshold',
        'enableNotifications',
        'enableAutoPip' // Load this new setting
    ], (items) => {
        if (chrome.runtime.lastError) {
            console.error("Error loading settings in script.js:", chrome.runtime.lastError.message);
            // Keep defaults if error
            return;
        }
        horizontalTiltThreshold = items.horizontalTiltThreshold !== undefined ? items.horizontalTiltThreshold : 0.07;
        minVerticalNeckHeight = items.minVerticalNeckHeight !== undefined ? items.minVerticalNeckHeight : 0.03;
        forwardHeadOffsetThreshold = items.forwardHeadOffsetThreshold !== undefined ? items.forwardHeadOffsetThreshold : -0.05;
        shoulderHeightDifferenceThreshold = items.shoulderHeightDifferenceThreshold !== undefined ? items.shoulderHeightDifferenceThreshold : 0.04;
        enableNotifications = items.enableNotifications !== undefined ? items.enableNotifications : true;
        autoPipEnabled = items.enableAutoPip !== undefined ? items.enableAutoPip : true;
        
        console.log('PosePal settings loaded in script.js:', {
            horizontalTiltThreshold,
            minVerticalNeckHeight,
            forwardHeadOffsetThreshold,
            shoulderHeightDifferenceThreshold,
            enableNotifications,
            autoPipEnabled
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

document.addEventListener('visibilitychange', () => {
    console.log(`script.js: Visibility changed to: ${document.visibilityState}. Auto PiP enabled: ${autoPipEnabled}. Video Element: ${videoElement ? 'exists' : 'null'}`);
    if (!videoElement) {
        console.warn("script.js: videoElement is null in visibilitychange handler.");
        return;
    }
    if (!videoElement.srcObject) {
        console.warn("script.js: videoElement.srcObject is null in visibilitychange handler.");
        return;
    }
    console.log(`script.js: videoElement.readyState: ${videoElement.readyState}, paused: ${videoElement.paused}, pipInteractionOccurred: ${pipInteractionOccurred}`); // Added pipInteractionOccurred

    if (document.visibilityState === 'hidden') {
        console.log(`script.js: Tab hidden. autoPipEnabled: ${autoPipEnabled}, PiP Active: ${document.pictureInPictureElement === videoElement}, pipInteractionOccurred: ${pipInteractionOccurred}`);
        if (autoPipEnabled && pipInteractionOccurred && document.pictureInPictureElement !== videoElement) {
            console.log("script.js: Conditions met for entering PiP (hidden, autoPipEnabled, pipInteractionOccurred, not already in PiP). Requesting PiP.");
            if (videoElement.paused) {
                console.log("script.js: Video is paused, attempting to play before PiP.");
                videoElement.play().then(() => {
                    console.log("script.js: Video played successfully before PiP.");
                    videoElement.requestPictureInPicture()
                        .then(() => {
                            console.log("script.js: Entered PiP due to tab hidden (after play, interaction occurred).");
                            wasAutoPiP = true;
                        })
                        .catch(error => {
                            console.error("script.js: Error entering PiP on tab hidden (after play, interaction occurred):", error);
                            if (error.name === 'NotAllowedError') {
                                console.warn("script.js: Automatic PiP failed (after play). Browser may require a fresh user interaction. Click PiP button on PosePal tab to re-enable for next switch.");
                                pipInteractionOccurred = false; // Reset flag, requiring new user gesture
                            }
                        });
                }).catch(err => {
                    console.error("script.js: Error playing video before PiP:", err);
                });
            } else {
                console.log("script.js: Video is playing, requesting PiP (interaction occurred).");
                videoElement.requestPictureInPicture()
                    .then(() => {
                        console.log("script.js: Entered PiP due to tab hidden (interaction occurred).");
                        wasAutoPiP = true;
                    })
                    .catch(error => {
                        console.error("script.js: Error entering PiP on tab hidden (interaction occurred):", error);
                        if (error.name === 'NotAllowedError') {
                            console.warn("script.js: Automatic PiP failed. Browser may require a fresh user interaction. Click PiP button on PosePal tab to re-enable for next switch.");
                            pipInteractionOccurred = false; // Reset flag, requiring new user gesture
                        }
                    });
            }
        } else if (autoPipEnabled && !pipInteractionOccurred) {
            console.warn("script.js: Auto PiP enabled, but requires a manual PiP toggle first (or again if a previous auto-attempt failed). Please click the PiP button on the PosePal tab.");
        } else {
            console.log("script.js: Conditions NOT met for entering PiP (hidden).", {autoPipEnabled, pipActive: document.pictureInPictureElement === videoElement, pipInteractionOccurred});
        }
    } else if (document.visibilityState === 'visible') {
        console.log(`script.js: Tab visible. Auto PiP enabled: ${autoPipEnabled}, PiP Active: ${document.pictureInPictureElement === videoElement}, wasAutoPiP: ${wasAutoPiP}, pipInteractionOccurred: ${pipInteractionOccurred}`);
        if (document.pictureInPictureElement === videoElement && wasAutoPiP) {
            // Previously, we would exit PiP here if autoPipEnabled was true.
            // Now, we keep it open as per user suggestion.
            console.log("script.js: Tab visible. PiP was automatically opened and will remain open. Manual closure is required if PiP is no longer needed.");
        } else if (document.pictureInPictureElement === videoElement && !wasAutoPiP) {
            console.log("script.js: Tab visible. PiP is active (manually opened) and will remain open.");
        } else {
            console.log("script.js: Tab visible. No PiP active or PiP element is not our video.");
        }
    }
});

// UPDATED Manual Picture-in-Picture Toggle
async function togglePictureInPicture() {
    if (!videoElement || !videoElement.srcObject) {
        console.error("Video element not found or not ready for manual PiP toggle.");
        return;
    }
    if (document.pictureInPictureElement === videoElement) { // Currently in PiP, so exiting
        try {
            await document.exitPictureInPicture();
            console.log("Manually exited Picture-in-Picture mode.");
            wasAutoPiP = false; // User action overrides auto state
            pipInteractionOccurred = true; // User interacted with PiP controls
        } catch (error) {
            console.error("Error manually exiting Picture-in-Picture mode:", error);
        }
    } else { // Not in PiP, so entering
        try {
            await videoElement.requestPictureInPicture();
            console.log("Manually entered Picture-in-Picture mode.");
            wasAutoPiP = false; // User action means it's not "auto" PiP from visibility change
            pipInteractionOccurred = true; // User interacted with PiP controls
        } catch (error) {
            console.error("Error manually entering Picture-in-Picture mode:", error);
        }
    }
}

// Analyze posture from results
function onResults(results) {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height); // Re-enabled to show video feed on canvas for debugging

  if (!results.poseLandmarks) {
    if (statusDisplay) {
        statusDisplay.textContent = "No pose detected. Ensure you are visible.";
        statusDisplay.className = 'neutral-posture';
    }
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: "POSTURE_STATUS", status: "NO_POSE", messages: [] });
    }
    canvasCtx.restore();
    return;
  }

  const lm = results.poseLandmarks;
  const leftEar = lm[7]; // PoseLandmarker.PoseLandmarkIds.LEFT_EAR
  const leftShoulder = lm[11]; // PoseLandmarker.PoseLandmarkIds.LEFT_SHOULDER
  const rightEar = lm[8]; // PoseLandmarker.PoseLandmarkIds.RIGHT_EAR
  const rightShoulder = lm[12]; // PoseLandmarker.PoseLandmarkIds.RIGHT_SHOULDER
  // Add other landmarks if your commented-out checks are re-enabled later
  // const nose = lm[0]; 

  if (!leftEar || !leftShoulder || !rightEar || !rightShoulder) {
    if (statusDisplay) {
        statusDisplay.textContent = "Partial pose detected. Adjust visibility.";
        statusDisplay.className = 'neutral-posture';
    }
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: "POSTURE_STATUS", status: "PARTIAL_POSE", messages: [] });
    }
    canvasCtx.restore();
    return;
  }

  // Default settings (should match settings.js defaults)
  const defaultSettings = {
    enableNotifications: true,
    horizontalTiltThreshold: 0.07,
    minVerticalNeckHeight: 0.03,
    forwardHeadOffsetThreshold: -0.05,
    shoulderHeightDifferenceThreshold: 0.04,
    // notificationInterval: 20 // Not used in script.js for decision making
  };

  chrome.storage.sync.get(defaultSettings, (settings) => {
    if (chrome.runtime.lastError) {
        console.error("Error getting settings in onResults:", chrome.runtime.lastError.message);
        // Potentially use defaultSettings directly or handle error
    }
    const { 
        horizontalTiltThreshold,
        minVerticalNeckHeight,
        forwardHeadOffsetThreshold,
        shoulderHeightDifferenceThreshold,
        // enableNotifications // This setting is for background.js notifications, not for sending status
    } = settings;

    let feedbackMessages = [];

    // Temporarily disabled head and neck checks (as per previous request)
    
    const dxLeft = leftEar.x - leftShoulder.x;
    const dxRight = rightEar.x - rightShoulder.x;
    const dyLeft = leftShoulder.y - leftEar.y; // Assuming Y is inverted (smaller Y is higher)
    const dyRight = rightShoulder.y - rightEar.y;


    if (dyLeft < minVerticalNeckHeight || dyRight < minVerticalNeckHeight) {
      feedbackMessages.push("Lift your chin / Sit up straighter.");
    }
    
    // This horizontal tilt check might need adjustment based on landmark definitions
    // Example: if (Math.abs(nose.x - ((leftEar.x + rightEar.x) / 2)) > horizontalTiltThreshold) {
    // For simplicity, using the ear-shoulder X difference as a proxy if that was the intent
    // Ensure nose is defined if you use it: const nose = lm[0];
    // For now, let's assume the original intent was to check head tilt using ear-shoulder alignment
    // A more direct head tilt might compare y-coordinates of ears, or x-coordinates of nose vs midpoint of ears.
    // The existing dxLeft/dxRight check is more about forward/backward lean of the head relative to shoulders on X-axis.
    // Let's use a placeholder for actual head tilt if nose is available, or stick to the ear-shoulder X diff for now.
    // Re-evaluating the original commented out logic:
    // if (Math.abs(dxLeft) > horizontalTiltThreshold || Math.abs(dxRight) > horizontalTiltThreshold) {
    // This seems to check if one ear is significantly more forward/backward than its corresponding shoulder.
    // A true horizontal tilt (head leaning left/right) would be Math.abs(leftEar.y - rightEar.y) > some_threshold
    // Or, if using nose: Math.abs(nose.x - (leftShoulder.x + rightShoulder.x)/2) > horizontalTiltThreshold if shoulders are reference
    // Or, Math.abs(nose.x - (leftEar.x + rightEar.x)/2) > horizontalTiltThreshold if ears are reference for centering nose

    // Let's assume the original intent for "Level your head" was about horizontal alignment of ears or shoulders.
    // The provided dxLeft/dxRight check is more for "is your head aligned over your shoulders (front/back)".
    // For "Level your head" (side to side tilt), a better check would be:
    // const nose = lm[0]; // Make sure nose is available
    // if (Math.abs(nose.x - ((leftShoulder.x + rightShoulder.x) / 2)) > horizontalTiltThreshold) { // Example using nose and shoulders
    //    feedbackMessages.push("Center your head over your shoulders.");
    // }
    // Or, for ear tilt:
    // if (Math.abs(leftEar.y - rightEar.y) > horizontalTiltThreshold) { // Assuming horizontalTiltThreshold is also for Y diff
    //     feedbackMessages.push("Level your head (ears at same height).");
    // }

    // Sticking to the original uncommented logic for now, which was:
     if (Math.abs(dxLeft) > horizontalTiltThreshold || Math.abs(dxRight) > horizontalTiltThreshold) {
       feedbackMessages.push("Level your head."); // This message might be misleading for what dxLeft/dxRight check.
                                                 // It's more about forward/backward alignment of ear over shoulder.
                                                 // A better message might be "Align ears over shoulders (front/back)."
     }
    
    // Forward head: ear.x should be > shoulder.x if head is back (assuming origin is top-left)
    // So, dxLeft (ear.x - shoulder.x) should be positive. If it's too negative, it's forward.
    if (dxLeft < forwardHeadOffsetThreshold || dxRight < forwardHeadOffsetThreshold) {
      feedbackMessages.push("Bring your head back (ears over shoulders).");
    }
    

    const shoulderHeightDifference = Math.abs(leftShoulder.y - rightShoulder.y);
    if (shoulderHeightDifference > shoulderHeightDifferenceThreshold) {
      feedbackMessages.push("Level your shoulders.");
    }

    if (statusDisplay) {
        if (feedbackMessages.length > 0) {
          statusDisplay.textContent = feedbackMessages.join(" ");
          statusDisplay.className = 'bad-posture';
        } else {
          statusDisplay.textContent = "Good Posture";
          statusDisplay.className = 'good-posture';
        }
    }

    // Send status to background script unconditionally for badge and blur logic
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        if (feedbackMessages.length > 0) {
            chrome.runtime.sendMessage({ type: "POSTURE_STATUS", status: "Bad Posture", messages: feedbackMessages });
        } else {
            chrome.runtime.sendMessage({ type: "POSTURE_STATUS", status: "Good Posture", messages: [] });
        }
    }
  });

  canvasCtx.restore();
}