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