// c:\Users\rajes\VSCode Projects\Posepal\tracking\posepal-tracking\background.js
console.log("PoseCorrect background script loaded.");

let lastNotificationTime = 0; // Timestamp of the last notification

// 1. Open tracker.html on startup or install
chrome.runtime.onStartup.addListener(() => {
  openTrackerPage();
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install' || details.reason === 'update') {
    openTrackerPage();
    // Initialize default settings on install, including notificationInterval
    chrome.storage.sync.get(null, (items) => { // Get all items to see if defaults are set
      const defaultSettings = {
        enableNotifications: true,
        horizontalTiltThreshold: 0.07,
        minVerticalNeckHeight: 0.03,
        forwardHeadOffsetThreshold: -0.05,
        shoulderHeightDifferenceThreshold: 0.04,
        notificationInterval: 20, // Default 20 seconds
        // Add other defaults if they are not being set elsewhere on install
      };
      let newSettings = {};
      let needsUpdate = false;
      for (const key in defaultSettings) {
        if (items[key] === undefined) {
          newSettings[key] = defaultSettings[key];
          needsUpdate = true;
        }
      }
      if (needsUpdate) {
        chrome.storage.sync.set(newSettings, () => {
          console.log("Default settings initialized/updated in background.");
        });
      }
    });
  }
});

function openTrackerPage() {
  const trackerUrl = chrome.runtime.getURL("index.html"); // Adjusted path
  chrome.tabs.query({ url: trackerUrl }, (tabs) => {
    if (tabs.length === 0) {
      chrome.tabs.create({ url: trackerUrl });
    } else {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    }
  });
}

// Consolidating onMessage listeners. Remove the older one if it's fully superseded.
// Assuming the second listener is the one to keep and enhance.
// Remove or comment out the first onMessage listener if it's redundant.
/*
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "POSTURE_STATUS") {
    console.log("Posture status received (old listener):", request.status);
    updateBadge(request.status); // Ensure updateBadge is defined or remove

    if (request.status === "Bad Posture") {
      controlBlurOverlayInActiveTab(true); // Ensure controlBlurOverlayInActiveTab is defined or remove
    } else {
      controlBlurOverlayInActiveTab(false); // Ensure controlBlurOverlayInActiveTab is defined or remove
    }
  }
  return true; // For async response
});
*/

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "POSTURE_STATUS") {
    console.log("Background: Received posture status:", message.status, "Messages:", message.messages);

    // updateBadge(message.status); // If you have a badge update function

    if (message.status === "Bad Posture" && message.messages && message.messages.length > 0) {
      // Default settings for fallback
      const defaults = {
        enableNotifications: true,
        notificationInterval: 20 // Default interval in seconds
      };

      chrome.storage.sync.get(defaults, (settings) => {
        if (settings.enableNotifications) {
          const now = Date.now();
          const intervalMilliseconds = settings.notificationInterval * 1000;

          if (now - lastNotificationTime > intervalMilliseconds) {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icons/icon128.png', // Ensure this path is correct
              title: 'PosePal Alert!',
              message: message.messages.join('\n'), // Use the detailed messages
              priority: 2
            }, (notificationId) => {
              if (chrome.runtime.lastError) {
                console.error("Notification error:", chrome.runtime.lastError.message);
              } else {
                console.log("Notification shown:", notificationId);
                lastNotificationTime = now;
              }
            });
          } else {
            console.log("Notification skipped due to interval.");
          }
        } else {
          console.log("Notifications are disabled in settings.");
        }
      });
    }
    // Placeholder for blur logic to be added later
    // if (settings.enableBlurEffect) { ... }
  }
  return true; // Keep for async response, especially if using sendResponse
});

// Default settings (should match settings.js defaults)
const defaultSettings = {
    enableNotifications: true,
    horizontalTiltThreshold: 0.07,
    minVerticalNeckHeight: 0.03,
    forwardHeadOffsetThreshold: -0.05,
    shoulderHeightDifferenceThreshold: 0.04
};

// Placeholder for updateBadge if you use it
// function updateBadge(status) {
//   if (status === "Bad Posture") {
//     chrome.action.setBadgeText({ text: "BAD" });
//     chrome.action.setBadgeBackgroundColor({ color: [255, 0, 0, 255] });
//   } else {
//     chrome.action.setBadgeText({ text: "OK" });
//     chrome.action.setBadgeBackgroundColor({ color: [0, 255, 0, 255] });
//   }
// }

// Placeholder for controlBlurOverlayInActiveTab if you use it
// function controlBlurOverlayInActiveTab(shouldBlur) {
//   // This function would need to interact with content scripts
//   console.log("controlBlurOverlayInActiveTab called with:", shouldBlur);
// }

function updateBadge(status) {
  if (status === "Bad Posture") {
    chrome.action.setBadgeText({ text: "BAD" });
    chrome.action.setBadgeBackgroundColor({ color: "#FF0000" }); // Red
  } else if (status === "Good Posture") {
    chrome.action.setBadgeText({ text: "GOOD" });
    chrome.action.setBadgeBackgroundColor({ color: "#00FF00" }); // Green
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

async function controlBlurOverlayInActiveTab(applyBlur) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length === 0) return;
  const activeTab = tabs[0];

  // Avoid applying blur to the tracker page itself or chrome internal pages
  const trackerPageUrl = chrome.runtime.getURL("index.html");
  if (activeTab.url && activeTab.url !== trackerPageUrl && !activeTab.url.startsWith("chrome-extension://") && !activeTab.url.startsWith("chrome://")) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ["content_script.js"], // content_script.js is in the same directory
      });
      chrome.tabs.sendMessage(activeTab.id, { type: applyBlur ? "APPLY_BLUR" : "REMOVE_BLUR" });
    } catch (err) {
      console.error("Failed to inject/communicate with content script:", err, activeTab.url);
    }
  }
}

chrome.action.onClicked.addListener((tab) => {
  openTrackerPage();
});