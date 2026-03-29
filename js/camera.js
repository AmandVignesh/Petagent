const video = document.getElementById('webcam');
let currentDetectionMode = 'basic'; 
let isCameraReady = false;

async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 320, height: 240, facingMode: "user" },
            audio: false
        });
        video.srcObject = stream;
        
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.play();
                isCameraReady = true;
                resolve(video);
            };
        });
    } catch (e) {
        console.warn("Camera access failed. Ensure it's not in use by another app.", e);
        // We do not set isCameraReady to true, so AI won't run, app stays 'focused' by default or relies on basic motion if enabled later.
        return null;
    }
}

let tfjsDetector;

async function initializeAI() {
    // Force WebGL backend for extremely fast prediction rates without heavy CPU load
    try {
        if (typeof window.tf !== 'undefined') {
            await tf.setBackend('webgl');
            await tf.ready();
        }
    } catch(e) {
        console.warn("Could not enforce WebGL backend, tfjs might run slower.", e);
    }

    // We try to find the loaded tf libraries.
    try {
        if (typeof window.faceDetection !== 'undefined') {
            const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
            const detectorConfig = { runtime: 'tfjs', modelType: 'short' };
            tfjsDetector = await faceDetection.createDetector(model, detectorConfig);
            
            console.log("TFJS Face Detection successfully initialized.");
            currentDetectionMode = 'tensorflow';
            return;
        }
    } catch(e) {
        console.error("TFJS Initialization error:", e);
    }

    console.log("Falling back to basic webcam detection");
    currentDetectionMode = 'basic';
}

async function detectFace() {
    if (!isCameraReady) {
        // If camera never loaded (e.g., error), we check again slowly instead of hammering requestAnimationFrame
        setTimeout(detectFace, 3000);
        return;
    }

    // Smooth distraction state to prevent false positives from noisy bounding boxes or quick glances
    let currentFrameDistracted = false;

    try {
        switch(currentDetectionMode) {
            case "tensorflow":
                if (tfjsDetector) {
                    const faces = await tfjsDetector.estimateFaces(video, {flipHorizontal: false});
                    
                    if (faces.length === 0) {
                        currentFrameDistracted = true;
                    } else {
                        // Advanced Gaze Tracking: Analyze face keypoints
                        const face = faces[0];
                        if (face.keypoints) {
                            const rightEye = face.keypoints.find(k => k.name === 'rightEye');
                            const leftEye = face.keypoints.find(k => k.name === 'leftEye');
                            const noseTip = face.keypoints.find(k => k.name === 'noseTip');
                            
                            if (rightEye && leftEye && noseTip) {
                                // Calculate distance from nose to each eye
                                const distRight = Math.abs(noseTip.x - rightEye.x);
                                const distLeft = Math.abs(noseTip.x - leftEye.x);
                                
                                // Calculate yaw ratio (how turned the head is)
                                const ratio = Math.max(distRight, distLeft) / Math.max(0.1, Math.min(distRight, distLeft)); // avoid division by 0
                                
                                // Calculate pitch (looking up/down)
                                const eyeYAvg = (rightEye.y + leftEye.y) / 2;
                                const verticalDist = noseTip.y - eyeYAvg;
                                
                                // Thresholds for distraction:
                                // Ratio > 3.5 means head is turned very significantly sideways
                                // verticalDist < -2 means face is pointed very far downward
                                if (ratio > 3.5 || verticalDist < -2) {
                                    currentFrameDistracted = true;
                                } else {
                                    currentFrameDistracted = false;
                                }
                            } else {
                                currentFrameDistracted = false;
                            }
                        } else {
                            // Face detected but no keypoints — that's fine, user is present
                            currentFrameDistracted = false;
                        }
                        
                        // Extra safety: if face bounding box is very small, ignore it
                        // (prevents distant reflections or screen faces from triggering)
                        if (face.box) {
                            const faceArea = face.box.width * face.box.height;
                            const frameArea = video.videoWidth * video.videoHeight;
                            if (faceArea < frameArea * 0.01) {
                                // Face is too small — probably a reflection, not the user
                                currentFrameDistracted = false;
                            }
                        }
                    }
                }
                break;
            case "basic":
            default:
                currentFrameDistracted = !checkBasicPresence();
                break;
        }
    } catch (err) {
        console.warn("Detection error frame dropped:", err);
    }

    // Temporal Smoothing via Weighted Score
    updateDistractionScore(currentFrameDistracted);

    // Run again at ~15 FPS
    setTimeout(detectFace, 1000 / 15);
}

// ══════════════════════════════════════════════════
// WEIGHTED DISTRACTION SCORING
// ══════════════════════════════════════════════════
// Instead of consecutive frames (fragile - one false frame resets everything),
// we use a score that increases/decreases gradually.
// Distracted frames: score += 3
// Focused frames:    score -= 1
// This means one brief false-positive only reduces score by 1, not a full reset.

const DISTRACT_TRIGGER = 20;   // Score to trigger distracted (~7 distracted frames = ~0.5s)
const FOCUS_TRIGGER = 3;       // Score to clear distracted (~3 focused frames after score drops)
let distractionScore = 0;
let currentlyDistractedState = false;

function updateDistractionScore(frameIsDistracted) {
    if (frameIsDistracted) {
        distractionScore = Math.min(distractionScore + 3, 60);
    } else {
        distractionScore = Math.max(distractionScore - 1, 0);
    }

    if (!currentlyDistractedState && distractionScore >= DISTRACT_TRIGGER) {
        currentlyDistractedState = true;
        console.log('[LOLI] DISTRACTED — score:', distractionScore);
        if (window.LoliAPI) window.LoliAPI.setDistractedState(true);
    } else if (currentlyDistractedState && distractionScore <= FOCUS_TRIGGER) {
        currentlyDistractedState = false;
        console.log('[LOLI] FOCUSED — score:', distractionScore);
        if (window.LoliAPI) window.LoliAPI.setDistractedState(false);
    }
}

// Basic presence detection using canvas motion differences
let motionCanvas, motionCtx, previousImageData;
let noMotionCount = 0;

function checkBasicPresence() {
    if (!motionCanvas) {
        motionCanvas = document.createElement('canvas');
        motionCanvas.width = video.videoWidth / 4;
        motionCanvas.height = video.videoHeight / 4;
        motionCtx = motionCanvas.getContext('2d', { willReadFrequently: true });
    }
    
    motionCtx.drawImage(video, 0, 0, motionCanvas.width, motionCanvas.height);
    const currentImageData = motionCtx.getImageData(0, 0, motionCanvas.width, motionCanvas.height);
    
    if (!previousImageData) {
        previousImageData = currentImageData;
        return true; 
    }
    
    let diff = 0;
    const pixels = currentImageData.data;
    const prevPixels = previousImageData.data;
    
    for (let i = 0; i < pixels.length; i += 4) {
        const rDiff = Math.abs(pixels[i] - prevPixels[i]);
        const gDiff = Math.abs(pixels[i+1] - prevPixels[i+1]);
        const bDiff = Math.abs(pixels[i+2] - prevPixels[i+2]);
        if (rDiff + gDiff + bDiff > 40) diff++;
    }
    
    previousImageData = currentImageData;
    
    // If screen is extremely static, might be distracted/away
    if (diff < (pixels.length / 4) * 0.001) {
        noMotionCount++;
    } else {
        noMotionCount = 0;
    }

    // Require 30 consecutive frames (~2 seconds) of no motion to trigger distracted
    return noMotionCount < 30; 
}

async function startDetection() {
    await setupCamera();
    await initializeAI();
    detectFace();
}

startDetection();
