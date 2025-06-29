console.log("PosePal background script loaded. v3.1 - Debugging onActivated"); // Updated version

let lastNotificationTime = 0;
const NOTIFICATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
let posePalTabId = null; // Initial state
let lastKnownPostureIsBad = false;

// Log initial posePalTabId state
console.log(`[INIT] posePalTabId at script start: ${posePalTabId}`);

// Default settings structure
const appDefaultSettings = {
    enableNotifications: true,
    horizontalTiltThreshold: 0.07,
    minVerticalNeckHeight: 0.03,
    forwardHeadOffsetThreshold: -0.05,
    shoulderHeightDifferenceThreshold: 0.04,
    notificationInterval: 20,
    enableAutoPip: true, 
    enableBlurEffect: false
};

chrome.runtime.onStartup.addListener(() => {
    console.log("[DEBUG] Extension startup.");
    openTrackerPage();
});

chrome.runtime.onInstalled.addListener((details) => {
    console.log(`[DEBUG] Extension installed/updated. Reason: ${details.reason}`);
    openTrackerPage();
    if (details.reason === 'install' || details.reason === 'update') {
        chrome.storage.sync.get(appDefaultSettings, (currentSettings) => {
            if (chrome.runtime.lastError) {
                console.error("[ERROR] onInstalled: Error getting settings:", chrome.runtime.lastError.message);
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
            if (settingsWereUpdated) {
                chrome.storage.sync.set(newSettingsToStore, () => {
                    if (chrome.runtime.lastError) {
                        console.error("[ERROR] onInstalled: Error setting new settings:", chrome.runtime.lastError.message);
                    } else {
                        console.log("[DEBUG] Default settings initialized/updated:", newSettingsToStore);
                    }
                });
            } else {
                console.log("[DEBUG] All default settings already exist.");
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
        console.log(`[DEBUG] openTrackerPage: Found ${tabs.length} tabs with URL ${trackerUrl}. Current posePalTabId: ${posePalTabId}`);
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
                    console.error("[ERROR] openTrackerPage: Failed to create PosePal tab (tab object is null/undefined).");
                }
            });
        } else {
            posePalTabId = tabs[0].id;
            console.log(`[INFO] openTrackerPage: PosePal tab found. ID: ${posePalTabId}. Attempting to focus.`);
            chrome.tabs.update(posePalTabId, { active: true }, (updatedTab) => {
                if (chrome.runtime.lastError) {
                    console.warn("[WARN] openTrackerPage: Error making tab active:", chrome.runtime.lastError.message);
                } else if (updatedTab) {
                    console.log(`[DEBUG] openTrackerPage: Tab ${updatedTab.id} successfully activated.`);
                    chrome.windows.update(updatedTab.windowId, { focused: true }, (window) => {
                         if (chrome.runtime.lastError) {
                            console.warn("[WARN] openTrackerPage: Error focusing window:", chrome.runtime.lastError.message);
                        } else if (window) {
                            console.log(`[DEBUG] openTrackerPage: Window ${window.id} successfully focused.`);
                        }
                    });
                }
            });
        }
    });
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    console.log(`%c[DEBUG] chrome.tabs.onActivated FIRED! Active tab ID: ${activeInfo.tabId}, Window ID: ${activeInfo.windowId}. Current posePalTabId before logic: ${posePalTabId}`, "color: blue; font-weight: bold;");

    let currentPosePalTabId = posePalTabId;

    if (!currentPosePalTabId) {
        console.log("[DEBUG] onActivated: posePalTabId is not set globally. Attempting to re-acquire for this event.");
        const trackerUrl = chrome.runtime.getURL("index.html");
        try {
            const tabs = await chrome.tabs.query({ url: trackerUrl });
            if (tabs.length > 0) {
                currentPosePalTabId = tabs[0].id;
                console.log(`[DEBUG] onActivated: Re-acquired PosePal tab ID for this event: ${currentPosePalTabId}`);
                if (!posePalTabId) { // If global was null, set it now.
                    posePalTabId = currentPosePalTabId;
                    console.log(`[DEBUG] onActivated: Global posePalTabId updated to: ${posePalTabId}`);
                }
            } else {
                console.warn("[WARN] onActivated: Could not re-acquire PosePal tab ID (tracker page not found). Skipping blur logic for this activation.");
                // Don't return entirely, still might need to unblur the new tab if it's not PosePal
            }
        } catch (e) {
            console.error("[ERROR] onActivated: Error during posePalTabId re-acquisition:", e);
            // Don't return entirely
        }
    }
    
    // If currentPosePalTabId is STILL null here, it means the tracker page isn't open or findable.
    // PiP logic relies on sending messages to currentPosePalTabId, so it cannot proceed.
    // Blur logic for non-PosePal tabs can still proceed.

    let settings;
    try {
        settings = await chrome.storage.sync.get(appDefaultSettings);
        console.log("[DEBUG] onActivated: Settings loaded:", settings);
    } catch (e) {
        console.error("[ERROR] onActivated: Error loading settings:", e);
        return; // Critical error, cannot proceed without settings
    }

    // PiP logic is now handled by script.js using visibilitychange
    // So, remove REQUEST_PIP and EXIT_PIP message sending from here.

    if (activeInfo.tabId === currentPosePalTabId) {
        console.log(`[INFO] Switched TO PosePal tab (ID: ${currentPosePalTabId}).`);
        // Ensure the PosePal tab itself is unblurred (it shouldn't be blurred, but as a safeguard)
        try {
            await chrome.tabs.sendMessage(activeInfo.tabId, { action: "UNBLUR_PAGE" });
            console.log(`[DEBUG] UNBLUR_PAGE message sent to tab ${activeInfo.tabId} (PosePal tab).`);
        } catch (e) { 
            // This might fail if the content script isn't on index.html, which is fine.
            // console.warn(`[DEBUG] Failed to send UNBLUR_PAGE to PosePal tab ${activeInfo.tabId}:`, e.message);
        }
    } else { 
        console.log(`[INFO] Switched AWAY from PosePal tab (PosePal ID: ${currentPosePalTabId || 'unknown'}) to tab ${activeInfo.tabId}.`);
        // Blur/Unblur logic for the NEWLY active tab
        if (lastKnownPostureIsBad && settings.enableBlurEffect) {
            console.log(`[DEBUG] Blur effect enabled and posture is bad. Blurring new tab: ${activeInfo.tabId}`);
            try {
                // Check if the target tab is not an extension page or a system page where content scripts might not run
                const tabInfo = await chrome.tabs.get(activeInfo.tabId);
                if (tabInfo.url && (tabInfo.url.startsWith('http:') || tabInfo.url.startsWith('https:'))) {
                    await chrome.tabs.sendMessage(activeInfo.tabId, { action: "BLUR_PAGE" });
                    console.log(`[DEBUG] BLUR_PAGE message sent to tab ${activeInfo.tabId}`);
                } else {
                    console.log(`[DEBUG] Skipping BLUR_PAGE for non-http(s) tab: ${tabInfo.url}`);
                }
            } catch (e) { 
                console.warn(`[WARN] Failed to send BLUR_PAGE to new tab ${activeInfo.tabId}:`, e.message); 
            }
        } else if (settings.enableBlurEffect) { // Posture is good or unknown, ensure unblur
            console.log(`[DEBUG] Posture is good or unknown. Ensuring new tab ${activeInfo.tabId} is not blurred.`);
            try {
                const tabInfo = await chrome.tabs.get(activeInfo.tabId);
                if (tabInfo.url && (tabInfo.url.startsWith('http:') || tabInfo.url.startsWith('https:'))) {
                    await chrome.tabs.sendMessage(activeInfo.tabId, { action: "UNBLUR_PAGE" });
                    console.log(`[DEBUG] UNBLUR_PAGE message sent to tab ${activeInfo.tabId} (good posture/blur enabled check).`);
                } else {
                     console.log(`[DEBUG] Skipping UNBLUR_PAGE for non-http(s) tab: ${tabInfo.url}`);
                }
            } catch (e) {
                 // console.warn(`[DEBUG] Failed to send UNBLUR_PAGE to new tab ${activeInfo.tabId} (good posture check, might be okay if no content script):`, e.message);
            }
        }
    }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    console.log(`[DEBUG] chrome.tabs.onRemoved FIRED. Removed tab ID: ${tabId}. Current posePalTabId: ${posePalTabId}`);
    if (tabId === posePalTabId) {
        console.log(`[INFO] PosePal tab with ID: ${posePalTabId} was closed.`);
        posePalTabId = null;
        lastKnownPostureIsBad = false; 
        updateBadge("Closed"); 
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    let senderTabId = sender.tab ? sender.tab.id : "unknown (not from a tab)";
    let senderUrl = sender.tab ? sender.tab.url : (sender.url || "unknown URL");
    console.log(`[DEBUG] Message received in background:`, message, `from sender tab ID: ${senderTabId}, URL: ${senderUrl}, origin: ${sender.origin}`);
    
    if (message.type === "POSTURE_STATUS") {
        lastKnownPostureIsBad = (message.status === "Bad Posture");
        console.log(`[INFO] Posture status updated: ${message.status}. lastKnownPostureIsBad: ${lastKnownPostureIsBad}`);
        updateBadge(message.status);

        chrome.storage.sync.get(appDefaultSettings, (settings) => {
            if (chrome.runtime.lastError) {
                console.error("[ERROR] onMessage/POSTURE_STATUS: Error getting settings:", chrome.runtime.lastError.message);
                return;
            }
            console.log("[DEBUG] onMessage/POSTURE_STATUS: Settings loaded:", settings);

            if (message.status === "Bad Posture") {
                if (settings.enableNotifications && message.messages && message.messages.length > 0) {
                    const now = Date.now();
                    const intervalMilliseconds = settings.notificationInterval * 1000;
                    if (now - lastNotificationTime > intervalMilliseconds) {
                        chrome.notifications.create(
                            `posepal-alert-${Date.now()}`,
                            { 
                                type: 'basic',
                                iconUrl: 'icons/icon128.png',
                                title: 'PosePal Alert!',
                                message: message.messages.join('\n'),
                                priority: 2
                            },
                            (notificationId) => {
                                if (chrome.runtime.lastError) {
                                    console.error("[ERROR] Notification creation error:", chrome.runtime.lastError.message);
                                } else {
                                    console.log("[INFO] Notification shown:", notificationId);
                                    lastNotificationTime = now;
                                }
                            }
                        );
                    } else {
                        console.log("[DEBUG] Notification skipped due to interval.");
                    }
                }
                if (settings.enableBlurEffect) {
                    chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
                        if (chrome.runtime.lastError) {
                            console.error("[ERROR] onMessage/POSTURE_STATUS: Error querying active tabs for blur:", chrome.runtime.lastError.message);
                            return;
                        }
                        if (activeTabs.length > 0 && activeTabs[0].id !== posePalTabId) {
                            console.log(`[DEBUG] Bad posture & blur enabled. Sending BLUR_PAGE to active tab: ${activeTabs[0].id}`);
                            chrome.tabs.sendMessage(activeTabs[0].id, { action: "BLUR_PAGE" })
                                .catch(e => console.warn(`[WARN] Failed to send BLUR_PAGE to active tab ${activeTabs[0].id} (from POSTURE_STATUS):`, e.message));
                        }
                    });
                }
            } else { // Good Posture
                if (settings.enableBlurEffect) { 
                    chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
                         if (chrome.runtime.lastError) {
                            console.error("[ERROR] onMessage/POSTURE_STATUS: Error querying active tabs for unblur:", chrome.runtime.lastError.message);
                            return;
                        }
                        if (activeTabs.length > 0 && activeTabs[0].id !== posePalTabId) {
                            console.log(`[DEBUG] Good posture & blur enabled. Sending UNBLUR_PAGE to active tab: ${activeTabs[0].id}`);
                            chrome.tabs.sendMessage(activeTabs[0].id, { action: "UNBLUR_PAGE" })
                                .catch(e => console.warn(`[WARN] Failed to send UNBLUR_PAGE to active tab ${activeTabs[0].id} (from POSTURE_STATUS):`, e.message));
                        }
                    });
                }
            }
        });
    } else if (message.action === "REQUEST_INITIAL_STATE") { 
        console.log(`[DEBUG] Received REQUEST_INITIAL_STATE from tab ${senderTabId}. Current global posePalTabId: ${posePalTabId}`);
        if (sender.tab && sender.tab.url === chrome.runtime.getURL("index.html")) {
            if (!posePalTabId || posePalTabId !== sender.tab.id) {
                 posePalTabId = sender.tab.id;
                 console.log(`[INFO] PosePal tab ID confirmed/updated to ${posePalTabId} from REQUEST_INITIAL_STATE from ${senderUrl}.`);
            }
        }
        sendResponse({ posePalTabId: posePalTabId, lastKnownPostureIsBad: lastKnownPostureIsBad });
        return true; 
    }
    return true; 
});

function updateBadge(status) {
    let text = "";
    let color = "#808080"; // Default grey for neutral/off

    if (status === "Bad Posture") {
        text = "BAD";
        color = "#FF0000"; // Red
    } else if (status === "Good Posture") {
        text = "GOOD";
        color = "#00FF00"; // Green
    } else if (status === "Closed") { 
        text = "OFF";
        // color remains grey
    } else { // Default/unknown status
        text = ""; // Clear badge
        // color remains grey or could be set to transparent/default
    }

    chrome.action.setBadgeText({ text: text });
    chrome.action.setBadgeBackgroundColor({ color: color });
    console.log(`[DEBUG] Badge updated. Text: '${text}', Color: '${color}'`);
}

chrome.action.onClicked.addListener((tab) => {
    console.log("[DEBUG] Browser action clicked.");
    openTrackerPage();
});

console.log("[INIT] PosePal background script (v3.1 - Debugging onActivated) fully parsed and listeners attached.");

// Initial attempt to find PosePal tab when script (re)loads
(async () => {
    console.log("[INIT] Attempting to find PosePal tab immediately after script load/restart.");
    const trackerUrl = chrome.runtime.getURL("index.html");
    try {
        const tabs = await chrome.tabs.query({ url: trackerUrl });
        if (tabs.length > 0) {
            if (posePalTabId !== tabs[0].id) {
                posePalTabId = tabs[0].id;
                console.log(`[INIT] Found/Updated PosePal tab ID: ${posePalTabId} on initial query.`);
            } else {
                console.log(`[INIT] PosePal tab ID: ${posePalTabId} already known and correct.`);
            }
        } else {
            console.log("[INIT] PosePal tab not found on initial query. It might be created later by user action or onStartup.");
        }
    } catch (e) {
        console.error("[INIT] Error during initial tab query:", e);
    }
})();