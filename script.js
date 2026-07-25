const root = document.documentElement;
const toggleButton = document.querySelector('.theme-toggle');
const settingsButton = document.querySelector('.settings-button');
const modalOverlay = document.getElementById('settings-modal');
const modalClose = document.querySelector('.modal-close');

// --- THEME MANAGEMENT ---
const storedTheme = localStorage.getItem('nexus-theme') || 'system';
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');

function resolveTheme(theme) {
  if (theme === 'system') {
    return systemPrefersDark.matches ? 'dark' : 'light';
  }
  return theme;
}

function applyTheme(theme) {
  const activeTheme = resolveTheme(theme);
  root.setAttribute('data-theme', activeTheme);
  document.body.setAttribute('data-theme', activeTheme);
  localStorage.setItem('nexus-theme', theme);
  
  toggleButton?.setAttribute('aria-pressed', String(activeTheme === 'dark'));

  // Update Settings Modal theme options selection highlight
  document.querySelectorAll('.theme-btn').forEach(btn => {
    if (btn.getAttribute('data-theme-opt') === theme) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// Initial theme application
applyTheme(storedTheme);

// Watch for system prefers-color-scheme adjustments if 'system' theme is active
systemPrefersDark.addEventListener('change', () => {
  if (localStorage.getItem('nexus-theme') === 'system') {
    applyTheme('system');
  }
});

// Apple-style pill switch toggle interaction
toggleButton?.addEventListener('click', () => {
  const currentSaved = localStorage.getItem('nexus-theme') || 'system';
  let nextTheme;
  if (currentSaved === 'system') {
    const activeResolved = root.getAttribute('data-theme') || 'light';
    nextTheme = activeResolved === 'dark' ? 'light' : 'dark';
  } else {
    nextTheme = currentSaved === 'dark' ? 'light' : 'dark';
  }
  applyTheme(nextTheme);
});

// --- REFLECTION DEPTH MANAGEMENT ---
let currentDepth = localStorage.getItem('nexus-depth') || 'balanced';

function applyDepth(depth) {
  currentDepth = depth;
  localStorage.setItem('nexus-depth', depth);
  document.querySelectorAll('.depth-btn').forEach(btn => {
    if (btn.getAttribute('data-depth') === depth) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

applyDepth(currentDepth);

// Attach event listeners to depth options inside Settings Modal
document.querySelectorAll('.depth-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const selectedDepth = e.currentTarget.getAttribute('data-depth');
    if (selectedDepth) applyDepth(selectedDepth);
  });
});

// Attach event listeners to theme options inside Settings Modal
document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const selectedTheme = e.currentTarget.getAttribute('data-theme-opt');
    if (selectedTheme) applyTheme(selectedTheme);
  });
});

// --- SETTINGS GLASS MODAL CONTROLS ---
settingsButton?.addEventListener('click', (e) => {
  // Ripple animation
  settingsButton.classList.remove('rippling');
  void settingsButton.offsetWidth; // Force reflow
  settingsButton.classList.add('rippling');
  
  // Clear rippling class after animation ends
  setTimeout(() => {
    settingsButton.classList.remove('rippling');
  }, 600);

  // Open modal
  modalOverlay?.classList.add('active');
});

modalClose?.addEventListener('click', () => {
  modalOverlay?.classList.remove('active');
});

modalOverlay?.addEventListener('click', (e) => {
  if (e.target === modalOverlay) {
    modalOverlay.classList.remove('active');
  }
});

// --- COPY REFLECTION SYSTEM ---
function copyReflectionToClipboard() {
  const cards = document.querySelectorAll('.reflection-grid .reflection-card');
  if (!cards.length) return;
  
  let textToCopy = "NEXUS REFLECTION\n\n";
  cards.forEach(card => {
    const header = card.querySelector('.card-header')?.textContent;
    const content = card.querySelector('.card-content')?.textContent;
    if (header && content) {
      textToCopy += `## ${header}\n${content}\n\n`;
    }
  });
  
  navigator.clipboard.writeText(textToCopy.trim()).then(() => {
    const copyBtn = document.querySelector('.copy-button');
    if (copyBtn) {
      const originalText = copyBtn.innerHTML;
      copyBtn.innerHTML = `
        <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Copied!</span>
      `;
      copyBtn.style.borderColor = "rgba(16, 185, 129, 0.6)"; // emerald glow
      setTimeout(() => {
        copyBtn.innerHTML = originalText;
        copyBtn.style.borderColor = "";
      }, 2000);
    }
  }).catch(err => {
    console.error("Failed to copy to clipboard:", err);
  });
}

function addCopyReflectionButton() {
  let btnContainer = responseContainer.querySelector('.copy-button-container');
  if (!btnContainer) {
    btnContainer = document.createElement('div');
    btnContainer.className = 'copy-button-container';
    btnContainer.innerHTML = `
      <button class="copy-button" type="button">
        <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span>Copy Reflection</span>
      </button>
    `;
    responseContainer.appendChild(btnContainer);
    
    btnContainer.querySelector('.copy-button').addEventListener('click', copyReflectionToClipboard);
  }
}

// --- ORIGINAL REFLECTION LOGIC (PRESERVED & ENHANCED) ---
const reflectButton = document.querySelector('.primary-button');
const reflectionTextarea = document.getElementById('reflection');

let responseContainer = document.querySelector('.response-container');
if (!responseContainer) {
  responseContainer = document.createElement('div');
  responseContainer.className = 'response-container';
  const composer = document.querySelector('.composer');
  if (composer && composer.parentNode) {
    composer.parentNode.insertBefore(responseContainer, composer.nextSibling);
  }
}

const SECTIONS = [
  "Possible Bias",
  "Potential Contradiction",
  "Hidden Assumption",
  "Alternative Perspective",
  "Reflection Prompt",
  "Blind Spot",
  "Reframe"
];

let loadingInterval = null;
let currentStatusIndex = 0;
let gridCreated = false;
let gridElement = null;
let renderedCount = 0;

class ReflectionCard {
  constructor(title, content, index) {
    this.title = title;
    this.content = content;
    this.index = index;
  }

  render() {
    const card = document.createElement('div');
    card.className = 'reflection-card';
    card.setAttribute('data-key', this.title);
    card.style.animationDelay = `${this.index * 120}ms`;
    
    const accentLine = document.createElement('div');
    accentLine.className = 'card-accent-line';
    
    const header = document.createElement('div');
    header.className = 'card-header';
    header.textContent = this.title;
    
    const contentBody = document.createElement('div');
    contentBody.className = 'card-content';
    contentBody.textContent = this.content;
    
    card.appendChild(accentLine);
    card.appendChild(header);
    card.appendChild(contentBody);
    
    return card;
  }
}

function startLoadingState() {
  responseContainer.innerHTML = '';
  responseContainer.style.display = 'block';
  
  if (reflectButton) {
    reflectButton.disabled = true;
    const btnSpan = reflectButton.querySelector('span');
    if (btnSpan) btnSpan.textContent = 'Reflecting...';
  }

  const loaderContainer = document.createElement('div');
  loaderContainer.className = 'loader-container';
  
  const spinner = document.createElement('div');
  spinner.className = 'loader-spinner';
  
  const loaderText = document.createElement('div');
  loaderText.className = 'loader-text';
  
  loaderContainer.appendChild(spinner);
  loaderContainer.appendChild(loaderText);
  responseContainer.appendChild(loaderContainer);

  const STATUS_MESSAGES = [
    "Looking for patterns...",
    "Uncovering perspectives...",
    "Challenging assumptions...",
    "Almost there..."
  ];

  currentStatusIndex = 0;
  loaderText.textContent = STATUS_MESSAGES[currentStatusIndex];

  loadingInterval = setInterval(() => {
    currentStatusIndex = (currentStatusIndex + 1) % STATUS_MESSAGES.length;
    loaderText.style.opacity = '0';
    setTimeout(() => {
      loaderText.textContent = STATUS_MESSAGES[currentStatusIndex];
      loaderText.style.opacity = '0.85';
    }, 200);
  }, 2000);
}

function stopLoadingState(callback) {
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }
  
  const loader = responseContainer.querySelector('.loader-container');
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => {
      loader.remove();
      if (callback) callback();
    }, 300);
  } else {
    if (callback) callback();
  }
  
  if (reflectButton) {
    reflectButton.disabled = false;
    const btnSpan = reflectButton.querySelector('span');
    if (btnSpan) btnSpan.textContent = 'Reflect';
  }
}

function ensureGridCreated() {
  if (!gridCreated) {
    gridElement = document.createElement('div');
    gridElement.className = 'reflection-grid';
    
    const loader = responseContainer.querySelector('.loader-container');
    if (loader) {
      responseContainer.insertBefore(gridElement, loader);
    } else {
      responseContainer.appendChild(gridElement);
    }
    gridCreated = true;
  }
}

function renderCardToGrid(title, body) {
  if (!body || body.trim() === '') return;
  ensureGridCreated();
  
  const cardComponent = new ReflectionCard(title, body, renderedCount);
  const cardElement = cardComponent.render();
  
  renderedCount++;
  gridElement.appendChild(cardElement);
}

function updateProgressiveCard(title, text) {
  ensureGridCreated();
  const existingCard = gridElement ? gridElement.querySelector(`.reflection-card[data-key="${title}"]`) : null;
  if (existingCard) {
    const contentBody = existingCard.querySelector('.card-content');
    if (contentBody) {
      contentBody.textContent = text;
    }
  } else {
    renderCardToGrid(title, text);
  }
}

function extractJSONObject(str) {
  let cleaned = str.trim();
  // Strip markdown code fences if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '').trim();
  }
  // Try parsing directly
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (e) {
    // If it fails, try to extract first '{' and last '}'
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const candidate = cleaned.slice(startIdx, endIdx + 1);
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch (innerErr) {
        // Fall through
      }
    }
  }
  return null;
}

function renderFormattedJSON(jsonString) {
  const parsed = extractJSONObject(
    jsonString
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim()
);
  if (parsed) {
    if (gridElement) {
      gridElement.innerHTML = '';
    }
    renderedCount = 0;
    
    for (const key of SECTIONS) {
      if (parsed[key] !== undefined) {
        const bodyText = String(parsed[key]).trim();
        if (bodyText) {
          renderCardToGrid(key, bodyText);
        }
      }
    }
    
    // Add copy button below the reflection cards
    addCopyReflectionButton();
    return true;
  }
  return false;
}

function showError(message) {
  responseContainer.innerHTML = '';
  const errorEl = document.createElement('div');
  errorEl.className = 'error-message';
  errorEl.textContent = message;
  responseContainer.appendChild(errorEl);
}

async function streamReflection(prompt) {
  startLoadingState();
  
  gridCreated = false;
  gridElement = null;
  renderedCount = 0;

  let accumulatedText = '';

  try {
    const apiTarget = "https://nexusproj.onrender.com/reflect";

    const response = await fetch(apiTarget, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch from reflection engine. Status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          let rawLine = line;
          if (rawLine.endsWith('\r')) {
            rawLine = rawLine.slice(0, -1);
          }
          
          if (!rawLine.trim()) {
            continue;
          }
          
          if (rawLine.startsWith('data: ')) {
            const data = rawLine.slice(6);
            
            if (data === '[DONE]') {
              continue;
            }
            
            if (data.startsWith('[ERROR]')) {
              console.error("Error event from backend:", data);
              stopLoadingState();
              showError('Error: ' + data.slice(8));
              return;
            }
            
            accumulatedText += data.replace(/\r?\n/g, "");
            updateProgressiveCard("Reflection", accumulatedText);
          }
        }
      }

      if (done) {
        break;
      }
    }

    stopLoadingState(() => {
      const parsedSuccessfully = renderFormattedJSON(accumulatedText);
      if (!parsedSuccessfully) {
        // If JSON parsing fails, THEN fall back to the single Reflection card.
        if (gridElement) {
          gridElement.innerHTML = '';
        }
        renderedCount = 0;
        renderCardToGrid("Reflection", accumulatedText);
      }
    });
  } catch (error) {
    console.error("Fetch or streaming error in script.js:", error);
    stopLoadingState();
    showError('Error: ' + error.message);
  }
}

reflectButton?.addEventListener('click', () => {
  const prompt = reflectionTextarea.value.trim();
  if (prompt) {
    streamReflection(prompt);
  }
});
