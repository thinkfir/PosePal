// Load settings when the page opens
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();

    // Add event listeners to save settings when they change
    document.getElementById('enableNotifications').addEventListener('change', saveSettings);
    document.getElementById('enableAudio').addEventListener('change', saveSettings);
    document.getElementById('enablePip').addEventListener('change', saveSettings);
    document.getElementById('enablePipBlur').addEventListener('change', saveSettings);
});

function saveSettings() {
    const settings = {
        enableNotifications: document.getElementById('enableNotifications').checked,
        enableAudio: document.getElementById('enableAudio').checked,
        enablePip: document.getElementById('enablePip').checked,
        enablePipBlur: document.getElementById('enablePipBlur').checked
    };

    chrome.storage.sync.set({ poseCorrectSettings: settings }, () => {
        console.log('Settings saved');
    });
}

function loadSettings() {
    chrome.storage.sync.get('poseCorrectSettings', (data) => {
        if (data.poseCorrectSettings) {
            document.getElementById('enableNotifications').checked = data.poseCorrectSettings.enableNotifications || false;
            document.getElementById('enableAudio').checked = data.poseCorrectSettings.enableAudio || false;
            document.getElementById('enablePip').checked = data.poseCorrectSettings.enablePip || false;
            document.getElementById('enablePipBlur').checked = data.poseCorrectSettings.enablePipBlur || false;
        }
    });
}