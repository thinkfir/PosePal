// Default settings
const defaultSettings = {
    enableNotifications: true,
    horizontalTiltThreshold: 0.07,
    minVerticalNeckHeight: 0.03,
    forwardHeadOffsetThreshold: -0.05,
    shoulderHeightDifferenceThreshold: 0.04
};

document.addEventListener('DOMContentLoaded', () => {
    const enableNotificationsCheckbox = document.getElementById('enableNotifications');
    const horizontalTiltThresholdInput = document.getElementById('horizontalTiltThreshold');
    const minVerticalNeckHeightInput = document.getElementById('minVerticalNeckHeight');
    const forwardHeadOffsetThresholdInput = document.getElementById('forwardHeadOffsetThreshold');
    const shoulderHeightDifferenceThresholdInput = document.getElementById('shoulderHeightDifferenceThreshold');
    
    const saveButton = document.getElementById('saveSettings');
    const resetButton = document.getElementById('resetToDefaults');
    const statusMessage = document.getElementById('statusMessage');

    // Load saved settings or defaults
    chrome.storage.sync.get(defaultSettings, (settings) => {
        enableNotificationsCheckbox.checked = settings.enableNotifications;
        horizontalTiltThresholdInput.value = settings.horizontalTiltThreshold.toFixed(2);
        minVerticalNeckHeightInput.value = settings.minVerticalNeckHeight.toFixed(3);
        forwardHeadOffsetThresholdInput.value = settings.forwardHeadOffsetThreshold.toFixed(2);
        shoulderHeightDifferenceThresholdInput.value = settings.shoulderHeightDifferenceThreshold.toFixed(2);
    });

    // Save settings
    saveButton.addEventListener('click', () => {
        const newSettings = {
            enableNotifications: enableNotificationsCheckbox.checked,
            horizontalTiltThreshold: parseFloat(horizontalTiltThresholdInput.value),
            minVerticalNeckHeight: parseFloat(minVerticalNeckHeightInput.value),
            forwardHeadOffsetThreshold: parseFloat(forwardHeadOffsetThresholdInput.value),
            shoulderHeightDifferenceThreshold: parseFloat(shoulderHeightDifferenceThresholdInput.value)
        };

        chrome.storage.sync.set(newSettings, () => {
            statusMessage.textContent = 'Settings saved!';
            setTimeout(() => statusMessage.textContent = '', 2000);
        });
    });

    // Reset to defaults
    resetButton.addEventListener('click', () => {
        enableNotificationsCheckbox.checked = defaultSettings.enableNotifications;
        horizontalTiltThresholdInput.value = defaultSettings.horizontalTiltThreshold.toFixed(2);
        minVerticalNeckHeightInput.value = defaultSettings.minVerticalNeckHeight.toFixed(3);
        forwardHeadOffsetThresholdInput.value = defaultSettings.forwardHeadOffsetThreshold.toFixed(2);
        shoulderHeightDifferenceThresholdInput.value = defaultSettings.shoulderHeightDifferenceThreshold.toFixed(2);
        
        chrome.storage.sync.set(defaultSettings, () => {
            statusMessage.textContent = 'Settings reset to defaults!';
            setTimeout(() => statusMessage.textContent = '', 2000);
        });
    });
});