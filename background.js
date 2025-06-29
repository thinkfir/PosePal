console.log("PosePal background script loaded. v3.2 - Immediate Blur Logic");

let lastNotificationTime = 0;
const NOTIFICATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const INITIAL_CALIBRATION_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
let extensionStartTime = Date.now(); // Timestamp for initial calibration cooldown
let posePalTabId = null;
let lastKnownPostureIsBad = false;

console.log(`[INIT] posePalTabId at script start: ${posePalTabId}`);

const appDefaultSettings = {
    enableNotifications: true,
    // Note: Posture detection thresholds (horizontalTiltThreshold, etc.) are now primarily managed in script.js
    // and derived from postureSensitivity. These defaults here are less critical for core posture logic
    // but kept for potential other uses or if script.js fails to load its own.
    headTiltAngleThreshold: 27, 
    forwardHeadAngleThreshold: 40,
    shoulderTiltAngleThreshold: 16, 
    minVerticalNeckHeight: 0.006,
    // notificationInterval is effectively replaced by NOTIFICATION_COOLDOWN_MS
    enableAutoPip: true,
    enableBlurEffect: false,
    postureSensitivity: 50, // Default sensitivity, matches settings.js
    detectionDelay: 1500,  // Default detection delay, matches settings.js
    // blurDelay is removed
};

chrome.runtime.onStartup.addListener(() => {
    console.log("[DEBUG] Extension startup.");
    extensionStartTime = Date.now(); // Reset calibration timer on browser startup
    openTrackerPage();
});

chrome.runtime.onInstalled.addListener((details) => {
    console.log(`[DEBUG] Extension installed/updated. Reason: ${details.reason}`);
    if (details.reason === 'install') {
        extensionStartTime = Date.now(); // Reset calibration timer on new install
        openTrackerPage();
        // Initialize all settings from appDefaultSettings on first install
        chrome.storage.sync.set(appDefaultSettings, () => {
            if (chrome.runtime.lastError) {
                console.error("[ERROR] onInstalled: Error setting initial default settings:", chrome.runtime.lastError.message);
            } else {
                console.log("[DEBUG] Initial default settings stored on install:", appDefaultSettings);
            }
        });
    } else if (details.reason === 'update') {
        openTrackerPage(); // Open tracker page on update as well
        // For updates, check and add only missing settings to preserve existing user preferences
        chrome.storage.sync.get(appDefaultSettings, (currentSettings) => {
            if (chrome.runtime.lastError) {
                console.error("[ERROR] onInstalled (update): Error getting settings:", chrome.runtime.lastError.message);
                return;
            }
            let newSettingsToStore = {};
            let settingsWereUpdated = false;
            for (const key in appDefaultSettings) {
                if (currentSettings[key] === undefined) {
                    newSettingsToStore[key] = appDefaultSettings[key];
                    settingsWereUpdated = true;
                }
            }
            // Explicitly remove blurDelay if it exists from a previous version
            if (currentSettings.hasOwnProperty('blurDelay')) {
                chrome.storage.sync.remove('blurDelay', () => {
                     if (chrome.runtime.lastError) {
                        console.error("[ERROR] onInstalled (update): Error removing old blurDelay setting:", chrome.runtime.lastError.message);
                    } else {
                        console.log("[DEBUG] Removed old 'blurDelay' setting.");
                    }
                });
            }

            if (settingsWereUpdated) {
                chrome.storage.sync.set(newSettingsToStore, () => {
                    if (chrome.runtime.lastError) {
                        console.error("[ERROR] onInstalled (update): Error setting new default settings:", chrome.runtime.lastError.message);
                    } else {
                        console.log("[DEBUG] Default settings updated for new keys:", newSettingsToStore);
                    }
                });
            } else {
                console.log("[DEBUG] All default settings already exist or no new keys to add.");
            }
        });
    }
});

function openTrackerPage() {
    console.log("[DEBUG] openTrackerPage called.");
    const trackerUrl = chrome.runtime.getURL("index.html");
    chrome.tabs.query({ url: trackerUrl }, (tabs) => {
        if (chrome.runtime.lastError) {
            console.error("[ERROR] openTrackerPage: Error querying tabs:", chrome.runtime.lastError.message);
            return;
        }
        if (tabs.length === 0) {
            chrome.tabs.create({ url: trackerUrl }, (tab) => {
                if (chrome.runtime.lastError) {
                    console.error("[ERROR] openTrackerPage: Error creating tab:", chrome.runtime.lastError.message);
                    return;
                }
                if (tab) {
                    posePalTabId = tab.id;
                    console.log(`[INFO] openTrackerPage: PosePal tab created with ID: ${posePalTabId}`);
                } else {
                    console.error("[ERROR] openTrackerPage: Failed to create PosePal tab.");
                }
            });
        } else {
            posePalTabId = tabs[0].id;
            console.log(`[INFO] openTrackerPage: PosePal tab found. ID: ${posePalTabId}. Attempting to focus.`);
            chrome.tabs.update(posePalTabId, { active: true }, (updatedTab) => {
                if (chrome.runtime.lastError) {
                    console.warn("[WARN] openTrackerPage: Error making tab active:", chrome.runtime.lastError.message);
                } else if (updatedTab) {
                    chrome.windows.update(updatedTab.windowId, { focused: true }, (window) => {
                         if (chrome.runtime.lastError) {
                            console.warn("[WARN] openTrackerPage: Error focusing window:", chrome.runtime.lastError.message);
                        }
                    });
                }
            });
        }
    });
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    console.log(`%c[DEBUG] chrome.tabs.onActivated: Active tab ID: ${activeInfo.tabId}. Current posePalTabId: ${posePalTabId}`, "color: blue; font-weight: bold;");

    let currentPosePalTabId = posePalTabId;
    if (!currentPosePalTabId) {
        const trackerUrl = chrome.runtime.getURL("index.html");
        try {
            const tabs = await chrome.tabs.query({ url: trackerUrl });
            if (tabs.length > 0) {
                currentPosePalTabId = tabs[0].id;
                if (!posePalTabId) posePalTabId = currentPosePalTabId;
                console.log(`[DEBUG] onActivated: Re-acquired PosePal tab ID: ${currentPosePalTabId}`);
            }
        } catch (e) {
            console.error("[ERROR] onActivated: Error during posePalTabId re-acquisition:", e);
        }
    }

    let settings;
    try {
        settings = await chrome.storage.sync.get(appDefaultSettings);
    } catch (e) {
        console.error("[ERROR] onActivated: Error loading settings:", e);
        return;
    }

    const newlyActiveTabId = activeInfo.tabId;

    if (newlyActiveTabId === currentPosePalTabId) {
        console.log(`[INFO] Switched TO PosePal tab (ID: ${currentPosePalTabId}). Ensuring it is unblurred.`);
        if (currentPosePalTabId) { // Ensure ID is valid
            try {
                await chrome.tabs.sendMessage(currentPosePalTabId, { action: "UNBLUR_PAGE" });
            } catch (e) { /* console.warn(`[DEBUG] Failed to send UNBLUR_PAGE to PosePal tab ${currentPosePalTabId} on activation:`, e.message); */ }
        }
    } else {
        console.log(`[INFO] Switched to non-PosePal tab ${newlyActiveTabId}. LastKnownPostureIsBad: ${lastKnownPostureIsBad}, Blur Enabled: ${settings.enableBlurEffect}`);
        try {
            const tabInfo = await chrome.tabs.get(newlyActiveTabId);
            if (!tabInfo.url || (!tabInfo.url.startsWith('http:') && !tabInfo.url.startsWith('https:'))) {
                console.log(`[DEBUG] Skipping blur/unblur for non-http(s) newly activated tab: ${tabInfo.url}`);
                return;
            }

            if (settings.enableBlurEffect) {
                if (lastKnownPostureIsBad) {
                    console.log(`[DEBUG] Posture is bad. Sending BLUR_PAGE to newly active tab: ${newlyActiveTabId}`);
                    await chrome.tabs.sendMessage(newlyActiveTabId, { action: "BLUR_PAGE" });
                } else {
                    console.log(`[DEBUG] Posture is good/unknown. Sending UNBLUR_PAGE to newly active tab: ${newlyActiveTabId}`);
                    await chrome.tabs.sendMessage(newlyActiveTabId, { action: "UNBLUR_PAGE" });
                }
            }
        } catch (e) {
            console.warn(`[WARN] Error processing tab ${newlyActiveTabId} on activation for blur/unblur:`, e.message);
        }
    }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (tabId === posePalTabId) {
        console.log(`[INFO] PosePal tab with ID: ${posePalTabId} was closed.`);
        posePalTabId = null;
        lastKnownPostureIsBad = false;
        updateBadge("Closed");
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    let senderTabId = sender.tab ? sender.tab.id : "unknown";
    console.log(`[DEBUG] Message received in background:`, message, `from sender tab ID: ${senderTabId}`);

    if (message.type === "POSTURE_STATUS") {
        lastKnownPostureIsBad = (message.status === "BAD");
        console.log(`[INFO] Posture status updated: ${message.status}. lastKnownPostureIsBad: ${lastKnownPostureIsBad}`);
        updateBadge(message.status);

        chrome.storage.sync.get(appDefaultSettings, (settings) => {
            if (chrome.runtime.lastError) {
                console.error("[ERROR] onMessage/POSTURE_STATUS: Error getting settings:", chrome.runtime.lastError.message);
                return;
            }

            // Notification Logic
            if (message.status === "Bad Posture") {
                if (settings.enableNotifications && message.messages && message.messages.length > 0) {
                    const now = Date.now();
                    if (now - extensionStartTime > INITIAL_CALIBRATION_COOLDOWN_MS) {
                        if (now - lastNotificationTime > NOTIFICATION_COOLDOWN_MS) {
                            chrome.notifications.create(
                                `posepal-alert-${Date.now()}`, {
                                type: 'basic',
                                iconUrl: 'icons/icon128.png',
                                title: 'PosePal Alert!',
                                message: message.messages.join('\\n'),
                                priority: 2
                            }, (notificationId) => {
                                if (chrome.runtime.lastError) {
                                    console.error("[ERROR] Notification creation error:", chrome.runtime.lastError.message);
                                } else {
                                    console.log("[INFO] Notification shown:", notificationId);
                                    lastNotificationTime = now;
                                }
                            });
                        } else {
                            console.log("[DEBUG] Notification skipped due to regular notification cooldown.");
                        }
                    } else {
                        console.log("[DEBUG] Notification skipped due to initial calibration cooldown.");
                    }
                }
            }

            // Immediate Blur/Unblur Logic
            if (settings.enableBlurEffect) {
                chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
                                        if (chrome.runtime.lastError) {
                        // Log the entire lastError object for more details
                        console.error("[ERROR] onMessage/POSTURE_STATUS: API Error querying active tabs. Full error object:", JSON.stringify(chrome.runtime.lastError));
                        // Also log its message property, even if it might be undefined
                        console.error("[ERROR] onMessage/POSTURE_STATUS: Error message property (if any):", chrome.runtime.lastError.message);
                        return;
                    }
                    if (!activeTabs) {
                        // This case should ideally be caught by chrome.runtime.lastError,
                        // but good to have a separate log if it's not.
                        console.error("[ERROR] onMessage/POSTURE_STATUS: activeTabs query returned null or undefined, but no lastError was set.");
                        return;
                    }
                    if (activeTabs.length === 0) {
                        // This means the query succeeded but found no matching tabs.
                        // This can happen if no window is focused, or the focused window has no active tab (e.g. devtools).
                        console.warn("[WARN] onMessage/POSTURE_STATUS: No active tab found in the current window (activeTabs.length is 0). Cannot blur/unblur. This might happen if the window is not focused or has no active tab.");
                        return;
                    }

                    const activeTab = activeTabs[0];
                    if (activeTab.id === posePalTabId) {
                        console.log("[DEBUG] Active tab is PosePal tab, skipping blur/unblur from POSTURE_STATUS.");
                        return;
                    }
                    if (!activeTab.url || (!activeTab.url.startsWith('http:') && !activeTab.url.startsWith('https:'))) {
                        console.log(`[DEBUG] Skipping blur/unblur for non-http(s) active tab: ${activeTab.url}`);
                        return;
                    }

                    if (lastKnownPostureIsBad) {
                        console.log(`[DEBUG] Bad posture & blur enabled. Sending BLUR_PAGE to active tab: ${activeTab.id}`);
                        chrome.tabs.sendMessage(activeTab.id, { action: "BLUR_PAGE" })
                            .catch(e => console.warn(`[WARN] Failed to send BLUR_PAGE to active tab ${activeTab.id} (from POSTURE_STATUS):`, e.message));
                    } else { // Good Posture, No Pose, or Partial Pose
                        console.log(`[DEBUG] Good/Unknown posture & blur enabled. Sending UNBLUR_PAGE to active tab: ${activeTab.id}`);
                        chrome.tabs.sendMessage(activeTab.id, { action: "UNBLUR_PAGE" })
                            .catch(e => console.warn(`[WARN] Failed to send UNBLUR_PAGE to active tab ${activeTab.id} (from POSTURE_STATUS):`, e.message));
                    }
                });
            }
        });
    } else if (message.action === "REQUEST_INITIAL_STATE") {
        console.log(`[DEBUG] Received REQUEST_INITIAL_STATE from tab ${senderTabId}. Current global posePalTabId: ${posePalTabId}`);
        if (sender.tab && sender.tab.url === chrome.runtime.getURL("index.html")) {
            if (!posePalTabId || posePalTabId !== sender.tab.id) {
                 posePalTabId = sender.tab.id;
                 console.log(`[INFO] PosePal tab ID confirmed/updated to ${posePalTabId} from REQUEST_INITIAL_STATE.`);
            }
        }
        sendResponse({ posePalTabId: posePalTabId, lastKnownPostureIsBad: lastKnownPostureIsBad });
        return true;
    }
    return true;
});

function updateBadge(status) {
    let text = "";
    let color = "#808080"; // Default grey

    if (status === "Bad Posture") {
        text = "BAD";
        color = "#FF0000"; // Red
    } else if (status === "Good Posture") {
        text = "GOOD";
        color = "#00FF00"; // Green
    } else if (status === "Closed") {
        text = "OFF";
    } else { // Neutral, No Pose, Partial Pose
        text = "POSE"; // Or some other neutral indicator
        color = "#FFA500"; // Orange for neutral/needs attention
    }

    chrome.action.setBadgeText({ text: text });
    chrome.action.setBadgeBackgroundColor({ color: color });
    console.log(`[DEBUG] Badge updated. Text: '${text}', Color: '${color}'`);
}

chrome.action.onClicked.addListener((tab) => {
    console.log("[DEBUG] Browser action clicked. No action configured to open tab.");
    // Intentionally does nothing as per requirements.
});

console.log("[INIT] PosePal background script (v3.2 - Immediate Blur Logic) fully parsed.");

// Initial attempt to find PosePal tab
(async () => {
    console.log("[INIT] Attempting to find PosePal tab immediately after script load/restart.");
    const trackerUrl = chrome.runtime.getURL("index.html");
    try {
        const tabs = await chrome.tabs.query({ url: trackerUrl });
        if (tabs.length > 0) {
            if (posePalTabId !== tabs[0].id) {
                posePalTabId = tabs[0].id;
                console.log(`[INIT] Found/Updated PosePal tab ID: ${posePalTabId} on initial query.`);
            }
        } else {
            console.log("[INIT] PosePal tab not found on initial query.");
        }
    } catch (e) {
        console.error("[INIT] Error during initial tab query:", e);
    }
})();