// c:\Users\rajes\VSCode Projects\Posepal\tracking\posepal-tracking\background.js
console.log("PoseCorrect background script loaded.");

// 1. Open tracker.html on startup or install
chrome.runtime.onStartup.addListener(() => {
  openTrackerPage();
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install' || details.reason === 'update') {
    openTrackerPage();
  }
  // Initialize default settings on install (Phase 2)
  // chrome.storage.local.set({ blurEnabled: true, audioEnabled: true, notificationsEnabled: true });
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

// 2. Listen for posture status messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "POSTURE_STATUS") {
    console.log("Posture status received:", request.status);
    updateBadge(request.status);

    if (request.status === "Bad Posture") {
      // Later, check settings: e.g. chrome.storage.local.get('blurEnabled', ({blurEnabled}) => { if(blurEnabled) ... });
      controlBlurOverlayInActiveTab(true);
    } else {
      controlBlurOverlayInActiveTab(false);
    }
  }
  return true; // For async response
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "POSTURE_STATUS") {
    console.log("Background: Received posture status:", message.status);
    // Notification logic removed
    // if (message.status === "Bad Posture") {
    //     chrome.storage.sync.get('poseCorrectSettings', (data) => {
    //         if (data.poseCorrectSettings && data.poseCorrectSettings.enableNotifications) {
    //             const notificationId = 'postureNotification-' + Date.now();
    //             chrome.notifications.create(notificationId, {
    //                 type: 'basic',
    //                 iconUrl: 'icons/icon128.png',
    //                 title: 'Posture Check',
    //                 message: 'Please check your posture!',
    //                 priority: 2
    //             });
    //         }
    //     });
    // }
  }
});

// Listens for messages from script.js and shows notifications

// Default settings (should match settings.js defaults)
const defaultSettings = {
    enableNotifications: true,
    horizontalTiltThreshold: 0.07,
    minVerticalNeckHeight: 0.03,
    forwardHeadOffsetThreshold: -0.05,
    shoulderHeightDifferenceThreshold: 0.04
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "POSTURE_STATUS") {
        chrome.storage.sync.get(defaultSettings, (settings) => {
            if (settings.enableNotifications && request.status === "Bad Posture") {
                const messages = request.messages || [];
                const notificationMessage = messages.length > 0 ? messages.join("\n") : "Adjust your posture.";
                
                chrome.notifications.create({
                    type: "basic",
                    iconUrl: "icons/icon128.png",
                    title: "PosePal Alert!",
                    message: notificationMessage,
                    priority: 2
                });
            }
        });
    }
});

// Optional: Listen for storage changes to keep background script aware if needed,
// though for notifications, checking storage on each message is usually sufficient.
// chrome.storage.onChanged.addListener((changes, namespace) => {
//   for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
//     console.log(
//       `Storage key "${key}" in namespace "${namespace}" changed.`, 
//       `Old value was "${oldValue}", new value is "${newValue}".`
//     );
//   }
// });

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