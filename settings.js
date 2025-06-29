// Default settings
const defaultSettings = {
    enableNotifications: true,
    enableAutoPip: true, 
    enableBlurEffect: false,
    postureSensitivity: 50, // Default sensitivity (1-100)
    detectionDelay: 1500, // NEW: Default detection delay in ms
    blurDelay: 1000, // <<< ADD THIS LINE
    // Notification interval is now fixed at 5 minutes, managed by background.js
};

document.addEventListener('DOMContentLoaded', () => {
    const postureSensitivitySlider = document.getElementById('postureSensitivity');
    const postureSensitivityValueDisplay = document.getElementById('postureSensitivityValue');
    const detectionDelaySlider = document.getElementById('detectionDelay'); // NEW
    const detectionDelayValueDisplay = document.getElementById('detectionDelayValue'); // NEW
    const blurDelaySlider = document.getElementById('blurDelay'); // <<< ADD THIS LINE
    const blurDelayValueDisplay = document.getElementById('blurDelayValue'); // <<< ADD THIS LINE
    const enableNotificationsCheckbox = document.getElementById('enableNotifications');
    const enableAutoPipCheckbox = document.getElementById('enableAutoPip');
    const enableBlurEffectCheckbox = document.getElementById('enableBlurEffect');
    
    const saveButton = document.getElementById('saveSettings');
    const resetButton = document.getElementById('resetToDefaults');
    const statusMessage = document.getElementById('statusMessage');

    // Update slider value display
    if (postureSensitivitySlider && postureSensitivityValueDisplay) {
        postureSensitivitySlider.addEventListener('input', () => {
            postureSensitivityValueDisplay.textContent = postureSensitivitySlider.value;
        });
    }
    // NEW: Update detection delay slider value display
    if (detectionDelaySlider && detectionDelayValueDisplay) {
        detectionDelaySlider.addEventListener('input', () => {
            detectionDelayValueDisplay.textContent = detectionDelaySlider.value;
        });
    }
    // NEW: Update blur delay slider value display
    if (blurDelaySlider && blurDelayValueDisplay) { // <<< ADD THIS BLOCK
        blurDelaySlider.addEventListener('input', () => {
            blurDelayValueDisplay.textContent = blurDelaySlider.value;
        });
    }

    // Load saved settings or defaults
    chrome.storage.sync.get(defaultSettings, (settings) => {
        if (chrome.runtime.lastError) {
            console.error("Error loading settings:", chrome.runtime.lastError.message);
            // Apply defaults directly if error
            postureSensitivitySlider.value = defaultSettings.postureSensitivity;
            postureSensitivityValueDisplay.textContent = defaultSettings.postureSensitivity;
            detectionDelaySlider.value = defaultSettings.detectionDelay; // NEW
            detectionDelayValueDisplay.textContent = defaultSettings.detectionDelay; // NEW
            blurDelaySlider.value = defaultSettings.blurDelay; // <<< ADD THIS LINE
            blurDelayValueDisplay.textContent = defaultSettings.blurDelay; // <<< ADD THIS LINE
            enableNotificationsCheckbox.checked = defaultSettings.enableNotifications;
            enableAutoPipCheckbox.checked = defaultSettings.enableAutoPip;
            enableBlurEffectCheckbox.checked = defaultSettings.enableBlurEffect;
            return;
        }

        postureSensitivitySlider.value = settings.postureSensitivity;
        postureSensitivityValueDisplay.textContent = settings.postureSensitivity;
        detectionDelaySlider.value = settings.detectionDelay; 
        detectionDelayValueDisplay.textContent = settings.detectionDelay; 
        blurDelaySlider.value = settings.blurDelay; // <<< ADD THIS LINE
        blurDelayValueDisplay.textContent = settings.blurDelay; // <<< ADD THIS LINE
        enableNotificationsCheckbox.checked = settings.enableNotifications;
        enableAutoPipCheckbox.checked = settings.enableAutoPip;
        enableBlurEffectCheckbox.checked = settings.enableBlurEffect;
    });

    // Save settings
    saveButton.addEventListener('click', () => {
        const newSettings = {
            postureSensitivity: parseInt(postureSensitivitySlider.value, 10),
            detectionDelay: parseInt(detectionDelaySlider.value, 10), // NEW
            blurDelay: parseInt(blurDelaySlider.value, 10), // <<< ADD THIS LINE
            enableNotifications: enableNotificationsCheckbox.checked,
            enableAutoPip: enableAutoPipCheckbox.checked,
            enableBlurEffect: enableBlurEffectCheckbox.checked,
        };
        
        chrome.storage.sync.set(newSettings, () => {
            if (chrome.runtime.lastError) {
                console.error("Error saving settings:", chrome.runtime.lastError.message);
                statusMessage.textContent = 'Error saving settings.';
            } else {
                statusMessage.textContent = 'Settings saved!';
            }
            setTimeout(() => statusMessage.textContent = '', 2500);
        });
    });

    // Reset to defaults
    resetButton.addEventListener('click', () => {
        if (confirm("Are you sure you want to reset all settings to their defaults?")) {
            chrome.storage.sync.set(defaultSettings, () => {
                if (chrome.runtime.lastError) {
                    console.error("Error resetting settings:", chrome.runtime.lastError.message);
                    statusMessage.textContent = 'Error resetting settings.';
                } else {
                    postureSensitivitySlider.value = defaultSettings.postureSensitivity;
                    postureSensitivityValueDisplay.textContent = defaultSettings.postureSensitivity;
                    detectionDelaySlider.value = defaultSettings.detectionDelay; // NEW
                    detectionDelayValueDisplay.textContent = defaultSettings.detectionDelay; // NEW
                    blurDelaySlider.value = defaultSettings.blurDelay; // <<< ADD THIS LINE
                    blurDelayValueDisplay.textContent = defaultSettings.blurDelay; // <<< ADD THIS LINE
                    enableNotificationsCheckbox.checked = defaultSettings.enableNotifications;
                    enableAutoPipCheckbox.checked = defaultSettings.enableAutoPip;
                    enableBlurEffectCheckbox.checked = defaultSettings.enableBlurEffect;
                    statusMessage.textContent = 'Settings reset to defaults!';
                }
                setTimeout(() => statusMessage.textContent = '', 3000);
            });
        }
    });
});