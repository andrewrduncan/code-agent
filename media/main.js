// Get VS Code API
const vscode = acquireVsCodeApi();

// Initialize state
let isLoading = false;
let currentChatId = null;
let savedChats = [];

// Initialize UI elements
const newChatView = document.getElementById('new-chat-view');
const activeChatView = document.getElementById('active-chat-view');
const newChatInput = document.getElementById('new-chat-input');
const messagesContainer = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const chatList = document.getElementById('chat-list');

// Handle messages from extension
window.addEventListener('message', (event) => {
    const message = event.data;
    console.log('Received message from extension:', message);
    switch (message.type) {
        case 'addMessage':
            addMessage(message.message);
            break;
        case 'setLoading':
            setLoading(message.loading);
            break;
        case 'clearChat':
            clearChat();
            break;
        case 'loadChatHistory':
            if (message.chats) {
                // Clear existing chat list
                chatList.innerHTML = '';
                savedChats = message.chats;
                
                // Add all chats to the list
                savedChats.forEach(chat => {
                    const chatItem = document.createElement('div');
                    chatItem.setAttribute('data-chat-id', chat.id);
                    chatItem.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
                    
                    const chatName = document.createElement('span');
                    chatName.className = 'chat-name';
                    chatName.textContent = chat.name;
                    
                    const deleteButton = document.createElement('button');
                    deleteButton.className = 'icon-button delete-chat';
                    deleteButton.innerHTML = '<span class="codicon codicon-trash"></span>';
                    deleteButton.onclick = (e) => {
                        e.stopPropagation();
                        vscode.postMessage({
                            type: 'deleteChat',
                            chatId: chat.id
                        });
                    };
                    
                    chatItem.appendChild(chatName);
                    chatItem.appendChild(deleteButton);
                    
                    chatItem.onclick = () => {
                        if (chat.id !== currentChatId) {
                            currentChatId = chat.id;
                            setLoading(true);
                            showActiveChatView();
                            
                            // Update active states
                            document.querySelectorAll('.chat-item').forEach(item => {
                                item.classList.toggle('active', item.getAttribute('data-chat-id') === chat.id);
                            });
                            
                            // Load messages
                            loadHistory(chat.messages);
                        }
                    };
                    
                    chatList.appendChild(chatItem);
                });
            }
            break;
        case 'loadChat':
            if (message.chatId && message.chatName && message.messages && message.chatId === currentChatId) {
                loadHistory(message.messages);
            }
            break;
        case 'updateThinking':
            if (message.payload?.content) {
                updateThinkingContent(message.payload.content);
            }
            break;
        case 'chat:thinking':
            if (message.payload) {
                updateThinkingContent(message.payload);
            }
            break;
        case 'error':
            console.error('Error from extension:', message.error);
            const errorMessage = {
                role: 'error',
                content: message.error || 'An error occurred'
            };
            addMessage(errorMessage);
            setLoading(false);
            break;
    }
});

// Event listeners
sendButton.addEventListener('click', () => sendMessage(userInput));
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(userInput);
    }
});

newChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(newChatInput);
    }
});

function sendMessage(inputElement) {
    if (isLoading || !inputElement.value.trim()) return;
    
    const messageText = inputElement.value.trim();
    console.log('Sending message:', messageText);
    
    // Set loading state first
    setLoading(true);
    
    // Create and display the user message immediately
    const userMessage = {
        role: 'user',
        content: messageText
    };
    
    // If this is a new chat, transition to active chat view first
    if (inputElement === newChatInput) {
        console.log('Starting new chat');
        showActiveChatView();
        // Clear any existing messages since this is a new chat
        messagesContainer.innerHTML = '';
    }
    
    // Add the message after view transition
    addMessage(userMessage);
    
    // Clear input
    inputElement.value = '';
    
    // Send message to extension
    console.log('Posting message to extension');
    vscode.postMessage({
        type: 'sendMessage',
        text: messageText
    });
}

function addMessage(message) {
    // Prevent duplicate messages by checking if the last message is identical
    const lastMessage = messagesContainer.lastElementChild;
    if (lastMessage && lastMessage.classList.contains(message.role) && 
        lastMessage.textContent === message.content) {
        return;
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.role}`;
    
    // Remove any <think> tags from the content
    const cleanContent = message.content.replace(/<think>.*?<\/think>/gs, '').trim();
    messageDiv.textContent = cleanContent;
    
    // If this is an assistant message and has a thinking container before it,
    // preserve the thinking content in a collapsed state
    if (message.role === 'assistant') {
        const previousThinking = document.getElementById('thinking-container');
        if (previousThinking) {
            const thinkingContent = previousThinking.querySelector('.thinking-content');
            // Only preserve thinking if there was actual content
            if (thinkingContent && thinkingContent.textContent.trim()) {
                const thinkingClone = previousThinking.cloneNode(true);
                thinkingClone.id = ''; // Remove the id to avoid duplicates
                
                // Update the header to show "Thought Process" and add collapse functionality
                const header = thinkingClone.querySelector('.thinking-header');
                const content = thinkingClone.querySelector('.thinking-content');
                
                header.innerHTML = `
                    <span class="thinking-arrow">›</span>
                    <div class="loading">
                        <span>Thought Process</span>
                    </div>
                `;
                
                content.classList.remove('expanded');
                
                header.addEventListener('click', () => {
                    content.classList.toggle('expanded');
                    header.querySelector('.thinking-arrow').textContent = 
                        content.classList.contains('expanded') ? '⌄' : '›';
                });
                
                messagesContainer.appendChild(thinkingClone);
            }
            // Always remove the original thinking container
            previousThinking.remove();
        }
    }

    messagesContainer.appendChild(messageDiv);
    messageDiv.scrollIntoView({ behavior: 'smooth' });
}

function setLoading(loading) {
    isLoading = loading;
    sendButton.disabled = loading;
    userInput.disabled = loading;
    newChatInput.disabled = loading;
    
    if (loading) {
        // Remove any existing thinking container first
        const existingThinking = document.getElementById('thinking-container');
        if (existingThinking) {
            existingThinking.remove();
        }
        
        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'message thinking-container';
        thinkingDiv.id = 'thinking-container';
        
        const header = document.createElement('div');
        header.className = 'thinking-header';
        header.innerHTML = `
            <div class="loading">
                <div class="loading-spinner"></div>
                <span>Thinking...</span>
            </div>
        `;
        
        const content = document.createElement('div');
        content.className = 'thinking-content expanded';
        content.id = 'thinking-content';
        
        thinkingDiv.appendChild(header);
        thinkingDiv.appendChild(content);
        messagesContainer.appendChild(thinkingDiv);
        thinkingDiv.scrollIntoView({ behavior: 'smooth' });
    } else {
        // Don't remove the thinking container when loading ends
        // It will be handled by the addMessage function when the response arrives
        const thinkingDiv = document.getElementById('thinking-container');
        if (thinkingDiv) {
            const loadingSpinner = thinkingDiv.querySelector('.loading-spinner');
            if (loadingSpinner) {
                loadingSpinner.remove();
            }
        }
    }
}

function updateThinkingContent(text) {
    console.debug('Updating thinking content:', text);
    
    // Remove nested thinking tags recursively
    while (text.includes('<think>')) {
        text = text.replace(/<think>(.*?)<\/think>/gs, '$1').trim();
    }
    
    // Only proceed if we have actual content
    if (!text) {
        console.debug('No thinking content to display');
        return;
    }
    
    let thinkingContent = document.getElementById('thinking-content');
    let thinkingContainer = document.getElementById('thinking-container');
    
    // Create the thinking container if it doesn't exist and we have content
    if (!thinkingContainer) {
        console.debug('Creating new thinking container');
        thinkingContainer = document.createElement('div');
        thinkingContainer.id = 'thinking-container';
        thinkingContainer.className = 'message thinking-container';
        
        const header = document.createElement('div');
        header.className = 'thinking-header';
        header.innerHTML = `
            <div class="loading">
                <div class="loading-spinner"></div>
                <span>Thinking...</span>
            </div>
        `;
        
        thinkingContent = document.createElement('div');
        thinkingContent.id = 'thinking-content';
        thinkingContent.className = 'thinking-content expanded';
        
        thinkingContainer.appendChild(header);
        thinkingContainer.appendChild(thinkingContent);
        messagesContainer.appendChild(thinkingContainer);
    }
    
    // Update content
    if (thinkingContent) {
        console.debug('Updating thinking content element');
        // Clean up any remaining HTML-like content
        text = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // Replace the content instead of appending
        thinkingContent.innerHTML = text;
        
        // Auto-scroll if expanded
        if (thinkingContent.classList.contains('expanded')) {
            thinkingContent.scrollTop = thinkingContent.scrollHeight;
            thinkingContainer.scrollIntoView({ behavior: 'smooth' });
        }
    }
}

function loadHistory(messages) {
    // Clear existing messages
    messagesContainer.innerHTML = '';
    
    // Load all messages
    if (messages && Array.isArray(messages)) {
        messages.forEach(message => {
            // For each assistant message, check if it has thinking content
            if (message.role === 'assistant' && message.thinking) {
                // Create a collapsed thinking container
                const thinkingDiv = document.createElement('div');
                thinkingDiv.className = 'message thinking-container';
                
                const header = document.createElement('div');
                header.className = 'thinking-header';
                header.innerHTML = `
                    <span class="thinking-arrow">›</span>
                    <div class="loading">
                        <span>Thought Process</span>
                    </div>
                `;
                
                const content = document.createElement('div');
                content.className = 'thinking-content';
                content.textContent = message.thinking;
                
                header.addEventListener('click', () => {
                    content.classList.toggle('expanded');
                    header.querySelector('.thinking-arrow').textContent = 
                        content.classList.contains('expanded') ? '⌄' : '›';
                });
                
                thinkingDiv.appendChild(header);
                thinkingDiv.appendChild(content);
                messagesContainer.appendChild(thinkingDiv);
            }
            
            // Add the message
            addMessage(message);
        });
    }
    
    // Ensure we're in active chat view
    showActiveChatView();
    
    // Clear loading state
    setLoading(false);
}

function clearChat() {
    messagesContainer.innerHTML = '';
    userInput.value = '';
    newChatInput.value = '';
    savedChats = [];
    currentChatId = null;
    showNewChatView();
    // Clear the chat list UI
    chatList.innerHTML = '';
}

function showNewChatView() {
    // Only switch if we're not already in new chat view
    if (!activeChatView.classList.contains('hidden')) {
        newChatView.classList.remove('hidden');
        activeChatView.classList.add('hidden');
        // Clear messages when switching to new chat
        messagesContainer.innerHTML = '';
        currentChatId = null;
    }
    newChatInput.focus();
}

function showActiveChatView() {
    // Don't switch views if we're already in active chat view
    if (!newChatView.classList.contains('hidden')) {
        newChatView.classList.add('hidden');
        activeChatView.classList.remove('hidden');
    }
    userInput.focus();
} 