// c:\Users\rajes\VSCode Projects\Posepal\tracking\posepal-tracking\content_script.js
// console.log("PoseCorrect content script loaded."); // Use for debugging

const POSECORRECT_BLUR_OVERLAY_ID = "posecorrect-blur-overlay-9z8xy"; // Unique ID

function applyBlurEffect() {
  if (document.getElementById(POSECORRECT_BLUR_OVERLAY_ID)) {
    return; // Already blurred
  }
  const overlay = document.createElement("div");
  overlay.id = POSECORRECT_BLUR_OVERLAY_ID;
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100vw";
  overlay.style.height = "100vh";
  // overlay.style.backgroundColor = "rgba(0, 0, 0, 0.05)"; // Optional: slight dimming
  overlay.style.backdropFilter = "blur(8px)"; // Adjust blur intensity as needed
  overlay.style.webkitBackdropFilter = "blur(8px)"; // For Safari/older Chrome
  overlay.style.zIndex = "2147483647"; // Max z-index
  overlay.style.pointerEvents = "none"; // Allows interaction with the page underneath

  document.body.appendChild(overlay);
  // console.log("Blur overlay applied by PoseCorrect.");
}

function removeBlurEffect() {
  const overlay = document.getElementById(POSECORRECT_BLUR_OVERLAY_ID);
  if (overlay) {
    overlay.remove();
    // console.log("Blur overlay removed by PoseCorrect.");
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "APPLY_BLUR") {
    applyBlurEffect();
    sendResponse({ success: true });
  } else if (request.type === "REMOVE_BLUR") {
    removeBlurEffect();
    sendResponse({ success: true });
  }
  return true; // Keep message channel open for async response
});