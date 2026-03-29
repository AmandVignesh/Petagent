// ══════════════════════════════════════════
// LOLI AI Assistant — Gemini-Powered Overlay
// ══════════════════════════════════════════

const root = document.getElementById('assistant-root');
const pill = document.getElementById('assistant-pill');
const panel = document.getElementById('assistant-panel');
const feedbackToast = document.getElementById('feedback-toast');
const toastText = document.getElementById('toast-text');
const commandInput = document.getElementById('command-input');
const contextText = document.querySelector('.context-text');
const chips = document.querySelectorAll('.chip');
const responseArea = document.getElementById('response-area');
const responseQuery = document.getElementById('response-query');
const responseText = document.getElementById('response-text');
const responseIndicator = document.querySelector('.response-indicator');
const suggestionChips = document.getElementById('suggestion-chips');

// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════

let state = 'collapsed';
let autoCollapseTimer = null;
let toastTimer = null;
let typewriterTimer = null;
let isInputFocused = false;
let isProcessing = false;

const AUTO_COLLAPSE_DELAY = 10000; // 10s — enough time to read AI responses

// ══════════════════════════════════════════
// STATE TRANSITIONS
// ══════════════════════════════════════════

function expand() {
    if (state === 'expanded') return;
    state = 'expanded';
    clearAutoCollapse();

    root.classList.remove('collapsed');
    root.classList.add('expanded');

    panel.classList.remove('hidden', 'collapsing');
    panel.style.animation = 'none';
    panel.offsetHeight;
    panel.style.animation = '';

    chips.forEach(chip => {
        chip.style.animation = 'none';
        chip.offsetHeight;
        chip.style.animation = '';
    });

    // Show chips, hide response on fresh expand
    suggestionChips.classList.remove('hidden');
    responseArea.classList.add('hidden');

    setTimeout(() => commandInput.focus(), 350);
    startAutoCollapse();
}

function collapse() {
    if (state === 'collapsed') return;
    if (isInputFocused && commandInput.value.trim() !== '') return;
    if (isProcessing) return; // don't collapse while waiting for API

    state = 'collapsed';
    clearAutoCollapse();
    clearTypewriter();

    commandInput.value = '';
    commandInput.blur();

    panel.classList.add('collapsing');

    setTimeout(() => {
        panel.classList.add('hidden');
        panel.classList.remove('collapsing');
        root.classList.remove('expanded');
        root.classList.add('collapsed');
        responseArea.classList.add('hidden');
        suggestionChips.classList.remove('hidden');
    }, 300);
}

// ══════════════════════════════════════════
// AUTO-COLLAPSE
// ══════════════════════════════════════════

function startAutoCollapse() {
    clearAutoCollapse();
    autoCollapseTimer = setTimeout(() => {
        if (state === 'expanded' && !isInputFocused && !isProcessing) collapse();
    }, AUTO_COLLAPSE_DELAY);
}

function clearAutoCollapse() {
    if (autoCollapseTimer) {
        clearTimeout(autoCollapseTimer);
        autoCollapseTimer = null;
    }
}

function resetAutoCollapse() {
    if (state === 'expanded' && !isInputFocused && !isProcessing) startAutoCollapse();
}

// ══════════════════════════════════════════
// INTERACTIONS
// ══════════════════════════════════════════

pill.addEventListener('click', expand);
pill.addEventListener('mouseenter', expand);

panel.addEventListener('mouseenter', clearAutoCollapse);
panel.addEventListener('mouseleave', () => {
    if (!isInputFocused && !isProcessing) startAutoCollapse();
});

commandInput.addEventListener('focus', () => {
    isInputFocused = true;
    clearAutoCollapse();
});

commandInput.addEventListener('blur', () => {
    isInputFocused = false;
    if (commandInput.value.trim() === '' && !isProcessing) startAutoCollapse();
});

// ══════════════════════════════════════════
// GEMINI API CALL
// ══════════════════════════════════════════

async function askGemini(userMessage) {
    if (!window.assistantAPI || !window.assistantAPI.sendQuery) {
        return { error: 'Assistant API not available.' };
    }
    return await window.assistantAPI.sendQuery(userMessage);
}

// ══════════════════════════════════════════
// COMMAND PROCESSING
// ══════════════════════════════════════════

async function processCommand(input) {
    const text = input.trim();
    if (!text || isProcessing) return;

    isProcessing = true;
    clearAutoCollapse();

    // Show response area, hide chips
    responseArea.classList.remove('hidden');
    responseArea.style.animation = 'none';
    responseArea.offsetHeight;
    responseArea.style.animation = '';
    suggestionChips.classList.add('hidden');

    // Show user query
    responseQuery.textContent = text;

    // Show typing indicator
    responseIndicator.style.display = 'flex';
    responseText.textContent = '';

    commandInput.value = '';

    // Call Gemini API
    const result = await askGemini(text);

    // Hide typing indicator
    responseIndicator.style.display = 'none';

    if (result.error) {
        responseText.textContent = '';
        typewriteResponse('⚠ ' + result.error);
    } else {
        typewriteResponse(result.text);
    }

    isProcessing = false;
}

function typewriteResponse(text) {
    clearTypewriter();
    let index = 0;
    responseText.textContent = '';

    typewriterTimer = setInterval(() => {
        responseText.textContent += text[index];
        index++;
        if (index >= text.length) {
            clearTypewriter();
            startAutoCollapse();
        }
    }, 12); // Fast typing
}

function clearTypewriter() {
    if (typewriterTimer) {
        clearInterval(typewriterTimer);
        typewriterTimer = null;
    }
}

// Enter → send to Gemini
commandInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        processCommand(commandInput.value);
    }
    if (e.key === 'Escape') {
        commandInput.blur();
        commandInput.value = '';
        responseArea.classList.add('hidden');
        suggestionChips.classList.remove('hidden');
        startAutoCollapse();
    }
});

commandInput.addEventListener('input', clearAutoCollapse);

// ══════════════════════════════════════════
// SUGGESTION CHIPS → also send to Gemini
// ══════════════════════════════════════════

const CHIP_PROMPTS = {
    summarize: 'Summarize the content I am currently working on. Give me key bullet points.',
    optimize: 'Give me code optimization tips for better performance.',
    search: 'Help me search for the best resources on the topic I am working on.',
    write: 'Help me draft a structured report based on my current work.',
    improve: 'Suggest improvements for better writing quality and clarity.',
    explain: 'Explain the concept I am working on in simple terms.'
};

chips.forEach(chip => {
    chip.addEventListener('click', () => {
        const action = chip.dataset.action;
        const prompt = CHIP_PROMPTS[action] || action;

        chip.style.background = 'var(--accent-soft)';
        chip.style.borderColor = 'rgba(255, 214, 102, 0.2)';
        setTimeout(() => {
            chip.style.background = '';
            chip.style.borderColor = '';
        }, 300);

        processCommand(prompt);
    });
});

// ══════════════════════════════════════════
// FEEDBACK TOAST
// ══════════════════════════════════════════

function showFeedback(message) {
    if (toastTimer) clearTimeout(toastTimer);
    toastText.textContent = message;
    feedbackToast.classList.remove('hidden', 'hiding');
    feedbackToast.style.animation = 'none';
    feedbackToast.offsetHeight;
    feedbackToast.style.animation = '';
    toastTimer = setTimeout(() => {
        feedbackToast.classList.add('hiding');
        setTimeout(() => {
            feedbackToast.classList.add('hidden');
            feedbackToast.classList.remove('hiding');
        }, 300);
    }, 2500);
}

// ══════════════════════════════════════════
// CONTEXT STATUS
// ══════════════════════════════════════════

const CONTEXTS = ['Powered by Gemini', 'Ready to assist', 'Listening for commands', 'AI-powered'];
let contextIndex = 0;

setInterval(() => {
    if (state === 'expanded') {
        contextIndex = (contextIndex + 1) % CONTEXTS.length;
        contextText.style.opacity = '0';
        contextText.style.transition = 'opacity 0.2s ease';
        setTimeout(() => {
            contextText.textContent = CONTEXTS[contextIndex];
            contextText.style.opacity = '1';
        }, 200);
    }
}, 6000);

// ══════════════════════════════════════════
// CURSOR PROXIMITY
// ══════════════════════════════════════════

document.addEventListener('mousemove', (e) => {
    if (e.clientY > window.innerHeight - 80 && state === 'collapsed') {
        expand();
    }
});

// ══════════════════════════════════════════
// KEYBOARD SHORTCUT
// ══════════════════════════════════════════

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        state === 'collapsed' ? expand() : collapse();
    }
});

// ══════════════════════════════════════════
// MIC TOGGLE
// ══════════════════════════════════════════

const micIndicator = document.getElementById('mic-indicator');
let isMicActive = false;
function toggleMic() {
    isMicActive = !isMicActive;
    micIndicator.classList.toggle('hidden', !isMicActive);
    if (isMicActive) showFeedback('Voice input active...');
}

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════

root.classList.add('collapsed');
