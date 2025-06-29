// content_script.js for PosePal

const POSEPAL_BLUR_STYLE_ID = 'posepal-blur-overlay-style';
const POSEPAL_BLUR_MESSAGE_ID = 'posepal-blur-message';

function applyBlur() {
    // Avoid applying multiple times
    if (document.getElementById(POSEPAL_BLUR_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = POSEPAL_BLUR_STYLE_ID;
    style.textContent = `
        body > *:not(#${POSEPAL_BLUR_MESSAGE_ID}) { /* Exclude our message from blur */
            filter: blur(5px) !important;
            transition: filter 0.3s ease-in-out !important;
            pointer-events: none !important; /* Prevent interaction with blurred content */
            user-select: none !important; /* Prevent text selection */
        }
    `;
    document.head.appendChild(style);

    const messageDiv = document.createElement('div');
    messageDiv.id = POSEPAL_BLUR_MESSAGE_ID;
    messageDiv.style.position = 'fixed';
    messageDiv.style.top = '50%';
    messageDiv.style.left = '50%';
    messageDiv.style.transform = 'translate(-50%, -50%)';
    messageDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
    messageDiv.style.color = 'white';
    messageDiv.style.padding = '20px';
    messageDiv.style.borderRadius = '10px';
    messageDiv.style.zIndex = '2147483647'; // Max z-index
    messageDiv.style.textAlign = 'center';
    messageDiv.style.fontSize = '20px';
    messageDiv.innerHTML = 'PosePal: Please correct your posture to continue.<br/>Return to the PosePal tab or correct your posture.';
    document.body.appendChild(messageDiv);

    console.log("PosePal: Page blurred due to posture.");
}

function removeBlur() {
    const style = document.getElementById(POSEPAL_BLUR_STYLE_ID);
    if (style) {
        style.remove();
    }
    const messageDiv = document.getElementById(POSEPAL_BLUR_MESSAGE_ID);
    if (messageDiv) {
        messageDiv.remove();
    }
    console.log("PosePal: Page unblurred.");
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "BLUR_PAGE") {
        applyBlur();
        sendResponse({status: "Page blur initiated"});
    } else if (request.action === "UNBLUR_PAGE") {
        removeBlur();
        sendResponse({status: "Page unblur initiated"});
    }
    return true; // Keep the message channel open for asynchronous response
});

console.log("PosePal content script loaded and listener attached.");