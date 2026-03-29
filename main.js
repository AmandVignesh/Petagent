const { app, BrowserWindow, ipcMain, screen, Tray, Menu } = require('electron');
const path = require('path');
const { exec } = require('child_process');

// Load environment variables from .env
require('dotenv').config({ path: path.join(__dirname, '.env') });

let mainWindow;
let assistantWindow;
let tray = null;

function createWindow() {
  const cursorPoint = screen.getCursorScreenPoint();
  const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
  
  const windowWidth = 420;
  const windowHeight = 260;

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: Math.floor(activeDisplay.workArea.x + (activeDisplay.workArea.width - windowWidth) / 2),
    y: activeDisplay.workArea.y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver'); // Keeps it above most things
  mainWindow.setVisibleOnAllWorkspaces(true); // For multi-desktop

  const loadUrl = app.isPackaged 
    ? `file://${path.join(__dirname, 'index.html')}` 
    : `file://${path.join(__dirname, 'index.html')}`;
  mainWindow.loadURL(loadUrl);

  // Force re-center after creation to ensure correct monitor logic
  mainWindow.once('ready-to-show', () => {
    const { width: windowWidth, height: windowHeight } = mainWindow.getBounds();
    recenterWindow(windowWidth, windowHeight);
  });
}

function recenterWindow(width, height) {
  if (!mainWindow) return;

  // Use the center of current window location to pick monitor
  const currentBounds = mainWindow.getBounds();
  const centerX = currentBounds.x + Math.floor(currentBounds.width / 2);
  const centerY = currentBounds.y + Math.floor(currentBounds.height / 2);
  const activeDisplay = screen.getDisplayNearestPoint({ x: centerX, y: centerY });
  
  // Use Electron's native center() to handle DPI scaling better, then move to top of monitor
  mainWindow.center();
  const centeredBounds = mainWindow.getBounds();
  mainWindow.setPosition(centeredBounds.x, activeDisplay.bounds.y);
  
  console.log(`[WINDOW] Native Centering: Display=${activeDisplay.id}, NewX=${centeredBounds.x}`);
}

function createAssistantWindow() {
  const display = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = display.workAreaSize;
  const winW = 500;
  const winH = 480;

  assistantWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x: Math.floor((screenW - winW) / 2),
    y: screenH - winH, // Bottom of screen, above taskbar
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-assistant.js')
    }
  });

  assistantWindow.setAlwaysOnTop(true, 'screen-saver');
  assistantWindow.setVisibleOnAllWorkspaces(true);
  assistantWindow.loadFile('assistant.html');

  assistantWindow.on('closed', () => { assistantWindow = null; });

  // Uncomment to debug
  // assistantWindow.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(() => {
  createWindow();
  createAssistantWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      createAssistantWindow();
    }
  });
  
  // Start polling Windows Media Transport Controls
  setInterval(pollMedia, 1500);
});

// Windows Global System Media Transport Controls Polling logic
function pollMedia() {
  if (!mainWindow) return;

  const scriptPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'media.ps1') 
    : path.join(__dirname, 'media.ps1');

  exec(`powershell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File "${scriptPath}"`, { windowsHide: true }, (error, stdout) => {
    if (error) return; // Silent fail if PS execution errors out
    
    try {
      if (stdout.trim()) {
        const raw = stdout.trim();
        // console.log("Media Polling Output:", raw);
        const data = JSON.parse(raw);
        mainWindow.webContents.send('media-update', data);
      }
    } catch (e) {
      console.warn("Media Polling JSON Parse Error:", e);
    }
  });
}

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC communication
ipcMain.on('set-window-size', (event, width, height) => {
  if (mainWindow) {
    mainWindow.setSize(width, height);
    recenterWindow(width, height);
  }
});

// Mouse forwarding for transparent windows — enables hover detection on transparent areas
ipcMain.on('set-ignore-mouse', (event, ignore, forward) => {
  if (mainWindow) {
    if (ignore) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      mainWindow.setIgnoreMouseEvents(false);
    }
  }
});

ipcMain.handle('get-models-path', () => {
  return app.isPackaged 
    ? path.join(process.resourcesPath, 'models') 
    : path.join(__dirname, 'models');
});

// Assistant window IPC
ipcMain.on('assistant-set-size', (event, width, height) => {
  if (assistantWindow) {
    const display = screen.getPrimaryDisplay();
    const { width: screenW, height: screenH } = display.workAreaSize;
    assistantWindow.setSize(width, height);
    assistantWindow.setPosition(
      Math.floor((screenW - width) / 2),
      screenH - height
    );
  }
});

// ══════════════════════════════════════════
// GEMINI AI API — with retry for rate limits
// ══════════════════════════════════════════

async function callGemini(userMessage, apiKey, retries = 3) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      { role: 'user', parts: [{ text: userMessage }] }
    ],
    systemInstruction: {
      parts: [{
        text: 'You are LOLI, a smart AI assistant embedded in a desktop productivity app. Be concise, helpful, and friendly. Keep responses under 150 words. Use bullet points for lists. If asked about code, give specific examples. Never use markdown headers (#). Use plain text with bullet points (•) for structure.'
      }]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 300,
      topP: 0.9
    }
  };

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.status === 429) {
        // Rate limited — wait and retry
        const waitTime = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.log(`[GEMINI] Rate limited (429). Retrying in ${waitTime / 1000}s... (attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      if (response.status === 401) {
        return { error: 'Invalid API key. Check your .env file.' };
      }

      if (response.status === 403) {
        return { error: 'API key does not have access. Enable "Generative Language API" in Google Cloud Console.' };
      }

      if (!response.ok) {
        const errText = await response.text();
        console.error('[GEMINI] API Error:', response.status, errText);
        return { error: `API error (${response.status}). Try again.` };
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        return { error: 'Empty response from Gemini. Try rephrasing.' };
      }

  return { text };
    } catch (err) {
      console.error('[GEMINI] Fetch error:', err.message);
      if (attempt === retries - 1) {
        return { error: `Connection failed: ${err.message}` };
      }
    }
  }

  return { error: 'Rate limit exceeded. Wait a few seconds and try again.' };
}

ipcMain.handle('gemini-query', async (event, userMessage) => {
  // Read .env fresh from disk every time (not cached)
  let apiKey = '';
  try {
    const fs = require('fs');
    const envPath = path.join(__dirname, '.env');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/GEMINI_API_KEY=(.+)/);
    if (match) apiKey = match[1].trim();
  } catch (e) {
    return { error: 'Could not read .env file. Make sure it exists in the app folder.' };
  }

  if (!apiKey || apiKey === 'your_api_key_here') {
    return { error: 'API key not configured. Add your Gemini API key to the .env file and save it (Ctrl+S).' };
  }

  console.log(`[GEMINI] Using key: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`);
  return await callGemini(userMessage, apiKey);
});
