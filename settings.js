// Default settings
const defaultSettings = {
    enableNotifications: true,
    headTiltAngleThreshold: 20, // degrees - Increased from 17
    forwardHeadAngleThreshold: 22, // degrees - Was 20
    shoulderTiltAngleThreshold: 12, // degrees - Was 10
    minVerticalNeckHeight: 0.015, // factor - Was 0.018
    notificationInterval: 20, // Default notification interval in seconds
    enableAutoPip: true, // Default auto PiP to true
    enableBlurEffect: false, // Default blur effect to false
    // NEW: Calibration defaults
    calibratedMetrics: null,
    maxHeadTiltDeviation: 10, // degrees - Increased from 8
    maxForwardHeadDeviation: 11, // degrees - Was 10
    maxShoulderTiltDeviation: 8, // degrees - Was 7
    neckHeightRatioDeviation: 0.015 // factor - Was 0.012
};

document.addEventListener('DOMContentLoaded', () => {
    // Existing elements
    const enableNotificationsCheckbox = document.getElementById('enableNotifications');
    const headTiltAngleThresholdInput = document.getElementById('headTiltAngleThreshold');
    const forwardHeadAngleThresholdInput = document.getElementById('forwardHeadAngleThreshold');
    const shoulderTiltAngleThresholdInput = document.getElementById('shoulderTiltAngleThreshold');
    const minVerticalNeckHeightInput = document.getElementById('minVerticalNeckHeight');
    const notificationIntervalInput = document.getElementById('notificationInterval');
    const enableAutoPipCheckbox = document.getElementById('enableAutoPip');
    const enableBlurEffectCheckbox = document.getElementById('enableBlurEffect');
    
    // NEW: Calibration elements
    const calibratedValuesDisplayDiv = document.getElementById('calibratedValuesDisplay');
    const calibratedHeadTiltDiv = document.getElementById('calibratedHeadTilt');
    const calibratedForwardHeadDiv = document.getElementById('calibratedForwardHead');
    const calibratedShoulderTiltDiv = document.getElementById('calibratedShoulderTilt');
    const calibratedNeckHeightDiv = document.getElementById('calibratedNeckHeight');

    const maxHeadTiltDeviationInput = document.getElementById('maxHeadTiltDeviation');
    const maxForwardHeadDeviationInput = document.getElementById('maxForwardHeadDeviation');
    const maxShoulderTiltDeviationInput = document.getElementById('maxShoulderTiltDeviation');
    const neckHeightRatioDeviationInput = document.getElementById('neckHeightRatioDeviation');
    
    const clearCalibrationButton = document.getElementById('clearCalibration');

    const saveButton = document.getElementById('saveSettings');
    const resetButton = document.getElementById('resetToDefaults');
    const statusMessage = document.getElementById('statusMessage');

    function displayCalibratedMetrics(metrics) {
        if (metrics && typeof metrics === 'object' && Object.keys(metrics).length > 0) {
            calibratedHeadTiltDiv.textContent = `- Head Tilt: ${metrics.headTilt !== undefined ? metrics.headTilt.toFixed(1) + '°' : 'N/A'}`;
            calibratedForwardHeadDiv.textContent = `- Forward Head: ${metrics.forwardHead !== undefined ? metrics.forwardHead.toFixed(1) + '°' : 'N/A'}`;
            calibratedShoulderTiltDiv.textContent = `- Shoulder Tilt: ${metrics.shoulderTilt !== undefined ? metrics.shoulderTilt.toFixed(1) + '°' : 'N/A'}`;
            calibratedNeckHeightDiv.textContent = `- Neck Height Ratio: ${metrics.neckHeight !== undefined ? metrics.neckHeight.toFixed(3) : 'N/A'}`;
            calibratedValuesDisplayDiv.style.display = 'block';
        } else {
            calibratedHeadTiltDiv.textContent = '- Head Tilt: N/A';
            calibratedForwardHeadDiv.textContent = '- Forward Head: N/A';
            calibratedShoulderTiltDiv.textContent = '- Shoulder Tilt: N/A';
            calibratedNeckHeightDiv.textContent = '- Neck Height Ratio: N/A';
            calibratedValuesDisplayDiv.style.display = 'block'; // Keep it visible to show N/A
        }
    }

    // Load saved settings or defaults
    chrome.storage.sync.get(defaultSettings, (settings) => {
        enableNotificationsCheckbox.checked = settings.enableNotifications;
        headTiltAngleThresholdInput.value = settings.headTiltAngleThreshold;
        forwardHeadAngleThresholdInput.value = settings.forwardHeadAngleThreshold;
        shoulderTiltAngleThresholdInput.value = settings.shoulderTiltAngleThreshold;
        minVerticalNeckHeightInput.value = settings.minVerticalNeckHeight.toFixed(3);
        notificationIntervalInput.value = settings.notificationInterval;
        enableAutoPipCheckbox.checked = settings.enableAutoPip;
        enableBlurEffectCheckbox.checked = settings.enableBlurEffect;

        // NEW: Load calibration settings
        displayCalibratedMetrics(settings.calibratedMetrics);
        maxHeadTiltDeviationInput.value = settings.maxHeadTiltDeviation;
        maxForwardHeadDeviationInput.value = settings.maxForwardHeadDeviation;
        maxShoulderTiltDeviationInput.value = settings.maxShoulderTiltDeviation;
        neckHeightRatioDeviationInput.value = settings.neckHeightRatioDeviation.toFixed(3);
    });

    // Save settings
    saveButton.addEventListener('click', () => {
        const newSettings = {
            enableNotifications: enableNotificationsCheckbox.checked,
            headTiltAngleThreshold: parseInt(headTiltAngleThresholdInput.value, 10),
            forwardHeadAngleThreshold: parseInt(forwardHeadAngleThresholdInput.value, 10),
            shoulderTiltAngleThreshold: parseInt(shoulderTiltAngleThresholdInput.value, 10),
            minVerticalNeckHeight: parseFloat(minVerticalNeckHeightInput.value),
            notificationInterval: parseInt(notificationIntervalInput.value, 10),
            enableAutoPip: enableAutoPipCheckbox.checked,
            enableBlurEffect: enableBlurEffectCheckbox.checked,
            // NEW: Save calibration deviation thresholds
            maxHeadTiltDeviation: parseInt(maxHeadTiltDeviationInput.value, 10),
            maxForwardHeadDeviation: parseInt(maxForwardHeadDeviationInput.value, 10),
            maxShoulderTiltDeviation: parseInt(maxShoulderTiltDeviationInput.value, 10),
            neckHeightRatioDeviation: parseFloat(neckHeightRatioDeviationInput.value),
            // calibratedMetrics is managed by script.js, but we need to read it to not overwrite
        };
        
        // Preserve existing calibratedMetrics unless explicitly cleared
        chrome.storage.sync.get('calibratedMetrics', (data) => {
            if (data.calibratedMetrics) {
                newSettings.calibratedMetrics = data.calibratedMetrics;
            } else {
                newSettings.calibratedMetrics = null; // Ensure it's null if not present
            }

            chrome.storage.sync.set(newSettings, () => {
                statusMessage.textContent = 'Settings saved!';
                setTimeout(() => statusMessage.textContent = '', 2000);
                // Re-display calibrated metrics in case they were part of the loaded settings
                // (though typically they are not changed here, this ensures consistency)
                displayCalibratedMetrics(newSettings.calibratedMetrics);
            });
        });
    });

    // Reset to defaults
    resetButton.addEventListener('click', () => {
        enableNotificationsCheckbox.checked = defaultSettings.enableNotifications;
        headTiltAngleThresholdInput.value = defaultSettings.headTiltAngleThreshold;
        forwardHeadAngleThresholdInput.value = defaultSettings.forwardHeadAngleThreshold;
        shoulderTiltAngleThresholdInput.value = defaultSettings.shoulderTiltAngleThreshold;
        minVerticalNeckHeightInput.value = defaultSettings.minVerticalNeckHeight.toFixed(3);
        notificationIntervalInput.value = defaultSettings.notificationInterval;
        enableAutoPipCheckbox.checked = defaultSettings.enableAutoPip;
        enableBlurEffectCheckbox.checked = defaultSettings.enableBlurEffect;
        
        // NEW: Reset calibration settings
        maxHeadTiltDeviationInput.value = defaultSettings.maxHeadTiltDeviation;
        maxForwardHeadDeviationInput.value = defaultSettings.maxForwardHeadDeviation;
        maxShoulderTiltDeviationInput.value = defaultSettings.maxShoulderTiltDeviation;
        neckHeightRatioDeviationInput.value = defaultSettings.neckHeightRatioDeviation.toFixed(3);
        
        // Clear calibratedMetrics in storage and update display
        const settingsToReset = { ...defaultSettings }; // Create a copy to ensure all defaults are set
        settingsToReset.calibratedMetrics = null; // Explicitly set to null for reset

        chrome.storage.sync.set(settingsToReset, () => {
            displayCalibratedMetrics(null);
            statusMessage.textContent = 'Settings reset to defaults! Calibrated posture cleared.';
            setTimeout(() => statusMessage.textContent = '', 3000);
        });
    });

    // NEW: Clear Calibrated Posture
    clearCalibrationButton.addEventListener('click', () => {
        chrome.storage.sync.set({ calibratedMetrics: null }, () => {
            displayCalibratedMetrics(null);
            statusMessage.textContent = 'Calibrated posture cleared!';
            setTimeout(() => statusMessage.textContent = '', 2000);
        });
    });
});