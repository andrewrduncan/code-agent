// Get VS Code API
const vscode = acquireVsCodeApi();

// Get DOM elements
const providerSelect = document.getElementById('provider-select');
const modelSelect = document.getElementById('model-select');
const settingsForm = document.getElementById('provider-settings');
const modelConfig = document.getElementById('model-config');
const modelActions = document.getElementById('model-actions');
const modelUpload = document.getElementById('model-upload');
const progressContainer = document.getElementById('progress-container');
const uploadProgress = document.querySelector('.upload-progress');

// Initialize state
let currentProvider = '';
let isSelfHosted = false;
let isProcessing = false;

// Initialize event listeners for range inputs
document.querySelectorAll('.range-with-value input[type="range"]').forEach(input => {
    const valueDisplay = input.parentElement.querySelector('.range-value');
    input.addEventListener('input', () => {
        valueDisplay.textContent = input.value;
    });
});

// Initialize event listeners
providerSelect.addEventListener('change', (e) => {
    currentProvider = e.target.value;
    vscode.postMessage({
        type: 'setProvider',
        provider: e.target.value
    });
});

modelSelect.addEventListener('change', (e) => {
    vscode.postMessage({
        type: 'setModel',
        model: e.target.value
    });
    updateModelActions(e.target.value);
});

settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const settings = Object.fromEntries(formData.entries());
    vscode.postMessage({
        type: 'updateSettings',
        settings
    });
});

modelConfig.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const config = Object.fromEntries(formData.entries());
    vscode.postMessage({
        type: 'updateModelConfig',
        config: {
            temperature: parseFloat(config.temperature),
            max_tokens: parseInt(config.maxTokens),
            top_p: parseFloat(config.topP),
            frequency_penalty: parseFloat(config.frequencyPenalty),
            presence_penalty: parseFloat(config.presencePenalty)
        }
    });
});

modelActions.addEventListener('click', async (e) => {
    if (!e.target.matches('button') || isProcessing) return;
    
    const action = e.target.dataset.action;
    const model = modelSelect.value;
    
    switch (action) {
        case 'delete':
            if (confirm(`Are you sure you want to delete ${model}?`)) {
                setProcessing(true, 'Deleting model...');
                vscode.postMessage({
                    type: 'deleteModel',
                    model
                });
            }
            break;
        case 'copy':
            const newName = prompt(`Enter new name for copy of ${model}:`);
            if (newName) {
                setProcessing(true, 'Copying model...');
                vscode.postMessage({
                    type: 'copyModel',
                    source: model,
                    target: newName
                });
            }
            break;
        case 'pull':
            setProcessing(true, 'Pulling model...');
            vscode.postMessage({
                type: 'pullModel',
                model
            });
            break;
    }
});

modelUpload.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isProcessing) return;

    const formData = new FormData(e.target);
    const fileInput = document.getElementById('modelFile');
    const file = fileInput.files[0];
    
    if (!file) {
        vscode.postMessage({
            type: 'showError',
            error: 'No file selected'
        });
        return;
    }

    try {
        setProcessing(true, 'Uploading model...');
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result?.toString().split(',')[1];
            if (!base64) {
                setProcessing(false);
                vscode.postMessage({
                    type: 'showError',
                    error: 'Failed to read file'
                });
                return;
            }

            vscode.postMessage({
                type: 'uploadModel',
                name: formData.get('modelName'),
                file: base64
            });
        };
        reader.readAsDataURL(file);
    } catch (error) {
        setProcessing(false);
        vscode.postMessage({
            type: 'showError',
            error: error instanceof Error ? error.message : 'Failed to process file'
        });
    }
});

// Request initial state
vscode.postMessage({ type: 'getState' });

// Handle messages from extension
window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.type) {
        case 'updateState':
            updateProviderSelect(message.providers, message.currentProvider);
            updateModelSelect(message.models, message.currentModel);
            updateSettings(message.settings);
            updateModelConfig(message.modelConfig);
            isSelfHosted = message.isSelfHosted;
            toggleSelfHostedFeatures(message.isSelfHosted);
            setProcessing(false);
            break;
        case 'updateModels':
            updateModelSelect(message.models, message.currentModel);
            break;
        case 'showError':
            showError(message.error);
            setProcessing(false);
            break;
        case 'showSuccess':
            showSuccess(message.message);
            setProcessing(false);
            break;
        case 'updateProgress':
            updateProgress(message.progress, message.message);
            break;
    }
});

function updateProviderSelect(providers, currentProvider) {
    providerSelect.innerHTML = providers.map(provider => 
        `<option value="${provider}" ${provider === currentProvider ? 'selected' : ''}>
            ${provider}
        </option>`
    ).join('');
    updateProviderSettings(currentProvider);
}

function updateModelSelect(models, currentModel) {
    modelSelect.innerHTML = models.map(model =>
        `<option value="${model}" ${model === currentModel ? 'selected' : ''}>
            ${model}
        </option>`
    ).join('');
    updateModelActions(currentModel);
}

function updateSettings(settings) {
    Object.entries(settings).forEach(([key, value]) => {
        const input = settingsForm.querySelector(`[name="${key}"]`);
        if (input) input.value = value;
    });
}

function updateModelConfig(config = {}) {
    if (!config) return;
    Object.entries(config).forEach(([key, value]) => {
        const input = modelConfig.querySelector(`[name="${key}"]`);
        if (input) {
            input.value = value;
            if (input.type === 'range') {
                input.parentElement.querySelector('.range-value').textContent = value;
            }
        }
    });
}

function updateProviderSettings(provider) {
    const ollamaSettings = `
        <div class="setting-group">
            <label for="ollamaHost">Host:</label>
            <input type="text" id="ollamaHost" name="ollamaHost" value="localhost">
        </div>
        <div class="setting-group">
            <label for="ollamaPort">Port:</label>
            <input type="number" id="ollamaPort" name="ollamaPort" value="11434">
        </div>
    `;

    const cloudSettings = `
        <div class="setting-group">
            <label for="apiKey">API Key:</label>
            <input type="password" id="apiKey" name="apiKey">
        </div>
        <div class="setting-group">
            <label for="orgId">Organization ID (optional):</label>
            <input type="text" id="orgId" name="orgId">
        </div>
    `;

    settingsForm.innerHTML = `
        ${provider === 'Ollama' ? ollamaSettings : cloudSettings}
        <button type="submit">Save Settings</button>
    `;
}

function updateModelActions(model) {
    if (!isSelfHosted) {
        modelActions.style.display = 'none';
        modelUpload.style.display = 'none';
        return;
    }

    modelActions.style.display = 'block';
    modelUpload.style.display = 'block';
}

function toggleSelfHostedFeatures(show) {
    const elements = document.querySelectorAll('.self-hosted-only');
    elements.forEach(el => {
        el.style.display = show ? 'block' : 'none';
    });
}

function setProcessing(processing, message = 'Processing...') {
    isProcessing = processing;
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        button.disabled = processing;
        button.classList.toggle('processing', processing);
    });

    if (processing) {
        progressContainer.classList.remove('hidden');
        progressContainer.querySelector('.progress-text').textContent = message;
        progressContainer.querySelector('.progress-fill').style.width = '0%';
    } else {
        progressContainer.classList.add('hidden');
        uploadProgress.classList.add('hidden');
    }
}

function updateProgress(progress, message) {
    const progressBar = isProcessing ? progressContainer : uploadProgress;
    progressBar.classList.remove('hidden');
    progressBar.querySelector('.progress-fill').style.width = `${progress}%`;
    if (message) {
        progressBar.querySelector('.progress-text').textContent = message;
    }
}

function showError(message) {
    const alert = document.createElement('div');
    alert.className = 'alert error';
    alert.textContent = message;
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), 5000);
}

function showSuccess(message) {
    const alert = document.createElement('div');
    alert.className = 'alert success';
    alert.textContent = message;
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), 5000);
} 