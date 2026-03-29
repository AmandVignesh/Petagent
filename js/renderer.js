// ══════════════════════════════════════════════════
// LOLI Renderer — Pixel Eyes + Focus Timer + Media
// + Collapse / Expand + Timer Settings Dropdown
// ══════════════════════════════════════════════════

// ── DOM Refs ──
const timerRow = document.getElementById('timer-row');
const timerText = document.getElementById('timer-text');
const timerDetails = document.getElementById('timer-details');
const timerTextFull = document.getElementById('timer-text-full');
const warningText = document.getElementById('warning-text');
const notch = document.getElementById('notch');
const hoverZone = document.getElementById('hover-zone');

const eyesFocused = document.getElementById('eyes');
const eyesDistracted = document.getElementById('eyes-distracted');
const setupControls = document.getElementById('setup-controls');
const timerDropdown = document.getElementById('timer-dropdown');
const timerSettingsBtn = document.getElementById('timer-settings-btn');
const selectedTimeLabel = document.getElementById('selected-time-label');
const mediaPlayer = document.getElementById('media-player');

const buttons = document.querySelectorAll('.time-btn');
const customTimeInput = document.getElementById('custom-time');
const customApplyBtn = document.getElementById('custom-apply-btn');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const resetBtn = document.getElementById('reset-btn');

// Sync both timer text elements
class FocusTimerSync extends FocusTimer {
    updateDisplay() {
        const m = Math.floor(this.remaining / 60).toString().padStart(2, '0');
        const s = (this.remaining % 60).toString().padStart(2, '0');
        const text = `${m}:${s}`;
        timerText.innerText = text;
        timerTextFull.innerText = text;
    }
}

const focusTimer = new FocusTimerSync(timerText);

// ══════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════

let currentMode = 'setup';       // 'setup' | 'running'
let isCollapsed = false;
let isMediaPlaying = false;
let isDistracted = false;
let recentlyStarted = true;
let isTimerDropdownOpen = false;
let selectedDuration = 25; // default 25 min

let initialCollapseTimer = null;

// ══════════════════════════════════════════════════
// PIXEL EYE RENDERER
// ══════════════════════════════════════════════════

const PIXEL = 3;
const EYE_W = 9;
const EYE_H = 10;

const EYE_PATTERNS = {
    calm: [
        [0,0,1,1,1,1,1,0,0],
        [0,1,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,1,1],
        [1,1,1,2,2,1,1,1,1],
        [1,1,1,2,2,3,1,1,1],
        [1,1,1,2,2,1,1,1,1],
        [1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1],
        [0,1,1,1,1,1,1,1,0],
        [0,0,1,1,1,1,1,0,0],
    ],
    blink: [
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,1,1,1,1,1,0,0],
        [0,1,1,1,1,1,1,1,0],
        [0,1,1,1,1,1,1,1,0],
        [0,0,1,1,1,1,1,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
    ],
    angryL: [
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,1,1,0],
        [0,0,0,0,1,1,1,0,0],
        [0,0,1,1,1,1,1,0,0],
        [0,1,1,1,1,1,1,1,0],
        [1,1,1,2,2,1,1,1,1],
        [1,1,1,2,2,1,1,1,1],
        [1,1,1,1,1,1,1,1,1],
        [0,1,1,1,1,1,1,1,0],
        [0,0,1,1,1,1,1,0,0],
    ],
    angryR: [
        [0,0,0,0,0,0,0,0,0],
        [0,1,1,0,0,0,0,0,0],
        [0,0,1,1,1,0,0,0,0],
        [0,0,1,1,1,1,1,0,0],
        [0,1,1,1,1,1,1,1,0],
        [1,1,1,1,1,2,2,1,1],
        [1,1,1,1,1,2,2,1,1],
        [1,1,1,1,1,1,1,1,1],
        [0,1,1,1,1,1,1,1,0],
        [0,0,1,1,1,1,1,0,0],
    ]
};

const COLORS = { 1: '#E8E8F0', 2: '#0B0B0B', 3: '#E8E8F0' };
const COLORS_ANGRY = { 1: '#FF4461', 2: '#1a0005', 3: '#FF4461' };

function drawEye(canvasId, pattern, angry) {
    const c = document.getElementById(canvasId);
    if (!c) return;
    c.width = EYE_W * PIXEL;
    c.height = EYE_H * PIXEL;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const pal = angry ? COLORS_ANGRY : COLORS;
    for (let y = 0; y < EYE_H; y++)
        for (let x = 0; x < EYE_W; x++) {
            const v = pattern[y][x];
            if (v === 0) continue;
            ctx.fillStyle = pal[v];
            ctx.fillRect(x * PIXEL, y * PIXEL, PIXEL, PIXEL);
        }
}

function drawCalmEyes() {
    drawEye('eye-left', EYE_PATTERNS.calm, false);
    drawEye('eye-right', EYE_PATTERNS.calm, false);
}
function drawAngryEyes() {
    drawEye('eye-left-angry', EYE_PATTERNS.angryL, true);
    drawEye('eye-right-angry', EYE_PATTERNS.angryR, true);
}

function scheduleBlink() {
    setTimeout(() => {
        drawEye('eye-left', EYE_PATTERNS.blink, false);
        drawEye('eye-right', EYE_PATTERNS.blink, false);
        setTimeout(() => { drawCalmEyes(); scheduleBlink(); }, 160);
    }, 3000 + Math.random() * 3000);
}

drawCalmEyes();
drawAngryEyes();
scheduleBlink();

// ══════════════════════════════════════════════════
// WINDOW SIZE HELPER
// ══════════════════════════════════════════════════

function setWindowSize(w, h) {
    if (window.electronAPI) window.electronAPI.setWindowSize(w, h);
}

// ══════════════════════════════════════════════════
// RENDER UI — single source of truth
// ══════════════════════════════════════════════════

function enterRunningMode() {
    setWindowSize(420, 300);
}

function renderUI() {
    // 1. Hide everything
    setupControls.classList.add('hidden');
    timerDropdown.classList.add('hidden');
    timerRow.classList.add('hidden');
    timerDetails.classList.add('hidden');
    mediaPlayer.classList.add('hidden');
    eyesFocused.classList.add('hidden');
    eyesDistracted.classList.add('hidden');
    warningText.classList.add('hidden');

    if (currentMode === 'setup') {
        // ── SETUP SCREEN ──
        if (isTimerDropdownOpen) {
            notch.className = 'notch-expanded-dropdown drag-region';
            setWindowSize(280, 220);
            timerDropdown.classList.remove('hidden');
        } else {
            notch.className = 'notch-expanded drag-region';
            setWindowSize(280, 140);
        }
        setupControls.classList.remove('hidden');
        eyesFocused.classList.remove('hidden');
        return;
    }

    // ── RUNNING MODE ──
    // NO drag-region in running mode — critical for hover detection on Windows

    if (isCollapsed) {
        notch.className = 'notch-compact';
        if (isDistracted) notch.classList.add('notch-distracted');
        timerRow.classList.remove('hidden');
        if (!isDistracted) {
            eyesFocused.classList.remove('hidden');
        } else {
            eyesDistracted.classList.remove('hidden');
        }
    } else {
        const hasMedia = isMediaPlaying;
        notch.className = hasMedia ? 'notch-medium-media' : 'notch-medium';
        if (isDistracted) notch.classList.add('notch-distracted');
        timerDetails.classList.remove('hidden');
        if (hasMedia) mediaPlayer.classList.remove('hidden');
        if (!isDistracted) {
            eyesFocused.classList.remove('hidden');
        } else {
            eyesDistracted.classList.remove('hidden');
            warningText.classList.remove('hidden');
        }
    }
}

// ══════════════════════════════════════════════════
// COLLAPSE / EXPAND
// ══════════════════════════════════════════════════

function collapse() {
    if (currentMode !== 'running' || isCollapsed) return;
    isCollapsed = true;
    renderUI();
}

function expand() {
    if (currentMode !== 'running' || !isCollapsed) return;
    isCollapsed = false;
    renderUI();
}

function clearAllTimers() {
    if (initialCollapseTimer) { clearTimeout(initialCollapseTimer); initialCollapseTimer = null; }
}

// ══════════════════════════════════════════════════
// HOVER DETECTION
// ══════════════════════════════════════════════════

notch.addEventListener('mouseenter', () => {
    if (initialCollapseTimer) { clearTimeout(initialCollapseTimer); initialCollapseTimer = null; }
    if (currentMode === 'running' && isCollapsed) expand();
});

notch.addEventListener('mouseleave', () => {
    if (currentMode === 'running' && !isCollapsed) collapse();
});

// ══════════════════════════════════════════════════
// TIMER SETTINGS DROPDOWN
// ══════════════════════════════════════════════════

timerSettingsBtn.addEventListener('click', () => {
    isTimerDropdownOpen = !isTimerDropdownOpen;
    timerSettingsBtn.classList.toggle('active', isTimerDropdownOpen);
    renderUI();
});

function updateTimeLabel(mins) {
    selectedDuration = mins;
    selectedTimeLabel.textContent = `${mins} min`;
    focusTimer.setDuration(mins);
}

buttons.forEach(btn => {
    btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        customTimeInput.value = '';
        updateTimeLabel(parseInt(btn.dataset.time));
    });
});

customApplyBtn.addEventListener('click', () => {
    let val = parseInt(customTimeInput.value);
    if (!isNaN(val) && val > 0) {
        buttons.forEach(b => b.classList.remove('active'));
        updateTimeLabel(val);
    }
});

customTimeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') customApplyBtn.click();
});

// Default 25 min
buttons[1].classList.add('active');
updateTimeLabel(25);

// ══════════════════════════════════════════════════
// START / STOP / RESET
// ══════════════════════════════════════════════════

startBtn.addEventListener('click', () => {
    if (customTimeInput.value) {
        let val = parseInt(customTimeInput.value);
        if (!isNaN(val) && val > 0) updateTimeLabel(val);
    }
    
    currentMode = 'running';
    isCollapsed = false;
    isTimerDropdownOpen = false;
    focusTimer.start();
    enterRunningMode();
    renderUI();
    
    initialCollapseTimer = setTimeout(() => {
        initialCollapseTimer = null;
        if (currentMode === 'running' && !isCollapsed) collapse();
    }, 3000);
});

stopBtn.addEventListener('click', () => {
    clearAllTimers();
    focusTimer.stop();
    currentMode = 'setup';
    isCollapsed = false;
    isDistracted = false;
    isTimerDropdownOpen = false;
    renderUI();
});

resetBtn.addEventListener('click', () => {
    if (isDistracted) {
        isDistracted = false;
        focusTimer.start();
        renderUI();
    } else {
        focusTimer.stop();
        focusTimer.remaining = focusTimer.duration;
        focusTimer.updateDisplay();
        focusTimer.start();
    }
});

// ══════════════════════════════════════════════════
// DISTRACTION STATE
// ══════════════════════════════════════════════════

function setDistractedState(distracted) {
    if (currentMode === 'setup') return;

    if (distracted) {
        if (!isDistracted) {
            isDistracted = true;
            focusTimer.pause();
            playBeep(200, "square", 0.3);
            renderUI();
        }
    } else {
        if (isDistracted || recentlyStarted) {
            recentlyStarted = false;
            isDistracted = false;
            focusTimer.start();
            playBeep(800, "sine", 0.1);
            renderUI();
        }
    }
}

// ══════════════════════════════════════════════════
// AUDIO
// ══════════════════════════════════════════════════

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playBeep(frequency, type, duration) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

document.addEventListener('timer-complete', () => {
    playBeep(600, "triangle", 0.2);
    setTimeout(() => playBeep(800, "triangle", 0.4), 250);
});

window.LoliAPI = { setDistractedState };

// ══════════════════════════════════════════════════
// MEDIA TRACKING
// ══════════════════════════════════════════════════

if (window.electronAPI && window.electronAPI.onMediaUpdate) {
    const mediaTitle = document.getElementById('media-title');
    const mediaArtist = document.getElementById('media-artist');
    const mediaBadge = document.getElementById('media-badge');
    
    window.electronAPI.onMediaUpdate((data) => {
        if (!data || data.status === "NoSession" || data.status === "Stopped") {
            if (isMediaPlaying) {
                isMediaPlaying = false;
                mediaBadge.classList.add('hidden');
                if (currentMode === 'running' && !isCollapsed) renderUI();
            }
            return;
        }

        const { status, title, artist } = data;
        if (status === "Playing" || status === "Paused") {
            const wasPlaying = isMediaPlaying;
            isMediaPlaying = true;
            mediaBadge.classList.remove('hidden');
            if (title) mediaTitle.textContent = title;
            if (artist) mediaArtist.textContent = artist;
            document.getElementById('media-visualizer').classList.toggle('paused', status === "Paused");
            if (!wasPlaying && currentMode === 'running' && !isCollapsed) renderUI();
        }
    });
}

// ── Initialize ──
currentMode = 'setup';
renderUI();
