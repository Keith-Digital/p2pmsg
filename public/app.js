document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const loginModal = document.getElementById('login-modal');
    const nameInput = document.getElementById('name-input');
    const loginBtn = document.getElementById('login-btn');
    const appContainer = document.getElementById('app-container');
    
    const userListEl = document.getElementById('user-list');
    const createChatBtn = document.getElementById('create-chat-btn');
    const chatArea = document.getElementById('chat-area');
    
    // --- State ---
    let ws;
    let myId = null;
    let allUsers = [];
    const chatWindows = new Map();

    // --- Login ---
    loginBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (name) {
            connectToServer(name);
        } else {
            alert('이름을 입력해주세요.');
        }
    });

    nameInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            loginBtn.click();
        }
    });

    // --- Core Connection Logic ---
    function connectToServer(name) {
        ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`);
        
        ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'login', name }));
        };

        ws.onclose = () => {
            document.body.innerHTML = '<div class="disconnected-message" style="text-align: center; padding: 50px; font-size: 1.2em;">서버와의 연결이 끊어졌습니다. 페이지를 새로고침해주세요.</div>';
        };

        ws.onerror = (error) => {
            console.error('WebSocket 오류:', error);
            alert('서버에 연결할 수 없습니다.');
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log('서버 메시지:', data);

            switch (data.type) {
                case 'login-success':
                    myId = data.id;
                    loginModal.classList.add('hidden');
                    appContainer.classList.remove('hidden');
                    showEmptyState();
                    break;
                case 'update-users':
                    allUsers = data.users;
                    updateUserListUI();
                    break;
                case 'room-created':
                    if (chatArea.querySelector('.empty-chat-area')) {
                        chatArea.innerHTML = '';
                    }
                    createChatWindow(data.room);
                    break;
                case 'room-updated':
                    updateChatWindow(data.room);
                    break;
                case 'system-message':
                    displaySystemMessage(data);
                    break;
                case 'chat-message':
                    displayMessage(data);
                    break;
                case 'file-message':
                    displayFileMessage(data);
                    break;
                case 'user-typing':
                    handleUserTyping(data);
                    break;
            }
        };
    }

    // --- UI and Helper Functions ---
    function showEmptyState() {
        if (chatWindows.size === 0) {
            chatArea.innerHTML = '<div class="empty-chat-area"><p>사용자를 선택하고 새로운 채팅을 시작해보세요!</p></div>';
        }
    }

    function updateUserListUI() {
        userListEl.innerHTML = '';
        allUsers.forEach(user => {
            const li = document.createElement('li');
            const isMe = user.id === myId;

            // Add a "(나)" suffix for the current user and disable their checkbox
            if (isMe) {
                li.innerHTML = `<span>${user.name} (나)</span>`;
                li.classList.add('me');
            } else {
                li.innerHTML = `<label><input type="checkbox" data-user-id="${user.id}"> ${user.name}</label>`;
            }
            userListEl.appendChild(li);
        });
    }

    function createChatWindow(room) {
        if (chatWindows.has(room.id)) {
            updateChatWindow(room);
            return;
        }
        if (chatArea.querySelector('.empty-chat-area')) {
            chatArea.innerHTML = '';
        }

        const windowEl = document.createElement('div');
        windowEl.className = 'chat-window';
        windowEl.dataset.roomId = room.id;

        const headerEl = document.createElement('div');
        headerEl.className = 'chat-header';
        
        const roomNameSpan = document.createElement('span');
        roomNameSpan.textContent = room.name;

        const headerButtons = document.createElement('div');
        headerButtons.className = 'header-buttons';

        const inviteBtn = document.createElement('button');
        inviteBtn.textContent = '초대';
        inviteBtn.className = 'invite-btn';
        inviteBtn.onclick = () => openInviteModal(room.id);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'X';
        closeBtn.className = 'close-btn';
        closeBtn.onclick = () => closeRoom(room.id);

        headerButtons.appendChild(inviteBtn);
        headerButtons.appendChild(closeBtn);
        headerEl.appendChild(roomNameSpan);
        headerEl.appendChild(headerButtons);
        
        const messageListEl = document.createElement('div');
        messageListEl.className = 'message-list';
        const typingIndicatorEl = document.createElement('div');
        typingIndicatorEl.className = 'typing-indicator';
        
        const { chatInputContainer } = createChatInput(room.id);

        windowEl.appendChild(headerEl);
        windowEl.appendChild(messageListEl);
        windowEl.appendChild(typingIndicatorEl);
        windowEl.appendChild(chatInputContainer);
        chatArea.appendChild(windowEl);

        chatWindows.set(room.id, {
            windowEl, headerEl, roomNameSpan, messageListEl, typingIndicatorEl,
            typingUsers: new Set(),
            participants: new Set(room.participants)
        });
    }

    function closeRoom(roomId) {
        const chatInfo = chatWindows.get(roomId);
        if (chatInfo) {
            ws.send(JSON.stringify({ type: 'leave-room', roomId }));
            chatInfo.windowEl.remove();
            chatWindows.delete(roomId);
            showEmptyState();
        }
    }

    function updateChatWindow(room) {
        const chatInfo = chatWindows.get(room.id);
        if (chatInfo) {
            chatInfo.roomNameSpan.textContent = room.name;
            chatInfo.participants = new Set(room.participants);
        }
    }

    function createChatInput(roomId) {
        let typingTimeout = null;
        const messageInput = document.createElement('textarea');
        messageInput.placeholder = '메시지를 입력하세요...';
        messageInput.rows = 1; // Start with a single line

        const sendMessage = () => {
            clearTimeout(typingTimeout);
            ws.send(JSON.stringify({ type: 'stop-typing', roomId }));
            const content = messageInput.value.trim();
            if (content) {
                ws.send(JSON.stringify({ type: 'chat-message', roomId, content }));
                messageInput.value = '';
                messageInput.style.height = 'auto'; // Reset height
            }
        };

        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        messageInput.addEventListener('input', () => {
            // Auto-resize textarea
            messageInput.style.height = 'auto';
            messageInput.style.height = (messageInput.scrollHeight) + 'px';

            // Typing indicator logic
            clearTimeout(typingTimeout);
            ws.send(JSON.stringify({ type: 'start-typing', roomId }));
            typingTimeout = setTimeout(() => ws.send(JSON.stringify({ type: 'stop-typing', roomId })), 2000);
        });

        const sendButton = document.createElement('button');
        sendButton.textContent = '전송';
        sendButton.addEventListener('click', sendMessage);

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = `file-input-${roomId}`;
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', () => {
            handleFileUpload(fileInput.files[0], roomId);
            fileInput.value = '';
        });

        const fileLabel = document.createElement('label');
        fileLabel.htmlFor = `file-input-${roomId}`;
        fileLabel.className = 'file-upload-btn';
        fileLabel.textContent = '📎';

        const chatInputContainer = document.createElement('div');
        chatInputContainer.className = 'chat-input-container';
        chatInputContainer.appendChild(fileLabel);
        chatInputContainer.appendChild(fileInput);
        chatInputContainer.appendChild(messageInput);
        chatInputContainer.appendChild(sendButton);
        return { chatInputContainer };
    }

    async function handleFileUpload(file, roomId) {
        if (!file || !myId) return;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('roomId', roomId);
        formData.append('senderId', myId);
        try {
            const response = await fetch('/upload', { method: 'POST', body: formData });
            if (!response.ok) throw new Error('파일 업로드 실패: ' + response.statusText);
        } catch (error) {
            console.error('파일 업로드 중 오류 발생:', error);
            alert('파일 업로드 중 오류가 발생했습니다.');
        }
    }

    function displaySystemMessage({ roomId, content }) {
        const chatWindow = chatWindows.get(roomId);
        if (chatWindow) {
            const msgEl = document.createElement('div');
            msgEl.className = 'system-message';
            msgEl.textContent = content;
            chatWindow.messageListEl.appendChild(msgEl);
            chatWindow.messageListEl.scrollTop = chatWindow.messageListEl.scrollHeight;
        }
    }

    function displayMessage({ roomId, senderId, senderName, content, timestamp }) {
        const chatWindow = chatWindows.get(roomId);
        if (chatWindow) {
            chatWindow.typingUsers.delete(senderName);
            updateTypingIndicator(roomId);
            const msgEl = document.createElement('div');
            msgEl.className = `message ${senderId === myId ? 'sent' : 'received'}`;
            const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            msgEl.innerHTML = `<span class="sender">${senderName}</span><p class="content">${content}</p><span class="timestamp">${time}</span>`;
            chatWindow.messageListEl.appendChild(msgEl);
            chatWindow.messageListEl.scrollTop = chatWindow.messageListEl.scrollHeight;
        }
    }

    function displayFileMessage({ roomId, senderId, senderName, timestamp, file }) {
        const chatWindow = chatWindows.get(roomId);
        if (chatWindow) {
            const msgEl = document.createElement('div');
            msgEl.className = `message ${senderId === myId ? 'sent' : 'received'}`;
            const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const fileSize = (file.size / 1024).toFixed(1) + ' KB';
            msgEl.innerHTML = `<span class="sender">${senderName}</span><div class="content file-content"><a href="${file.url}" target="_blank" download><span class="file-icon">📁</span><div class="file-info"><span class="file-name">${file.name}</span><span class="file-size">${fileSize}</span></div></a></div><span class="timestamp">${time}</span>`;
            chatWindow.messageListEl.appendChild(msgEl);
            chatWindow.messageListEl.scrollTop = chatWindow.messageListEl.scrollHeight;
        }
    }

    function handleUserTyping({ roomId, userName, isTyping }) {
        const chatWindow = chatWindows.get(roomId);
        if (!chatWindow) return;
        if (isTyping) chatWindow.typingUsers.add(userName);
        else chatWindow.typingUsers.delete(userName);
        updateTypingIndicator(roomId);
    }

    function updateTypingIndicator(roomId) {
        const chatWindow = chatWindows.get(roomId);
        if (!chatWindow) return;
        const typers = Array.from(chatWindow.typingUsers);
        chatWindow.typingIndicatorEl.textContent = typers.length > 0 ? `${typers.join(', ')} 님이 입력 중...` : '';
        chatWindow.typingIndicatorEl.style.visibility = typers.length > 0 ? 'visible' : 'hidden';
    }

    function openInviteModal(roomId) {
        const chatInfo = chatWindows.get(roomId);
        if (!chatInfo) return;
        const modal = document.createElement('div');
        modal.className = 'modal';
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        modalContent.innerHTML = '<h3>사용자 초대</h3>';
        const userList = document.createElement('ul');
        userList.className = 'modal-user-list';
        const usersToInvite = allUsers.filter(user => user.id !== myId && !chatInfo.participants.has(user.id));
        if (usersToInvite.length === 0) {
            userList.innerHTML = '<li>초대할 사용자가 없습니다.</li>';
        } else {
            usersToInvite.forEach(user => {
                const li = document.createElement('li');
                li.innerHTML = `<label><input type="checkbox" data-user-id="${user.id}"> ${user.name}</label>`;
                userList.appendChild(li);
            });
        }
        modalContent.appendChild(userList);
        const inviteBtn = document.createElement('button');
        inviteBtn.textContent = '초대하기';
        inviteBtn.onclick = () => {
            const selected = Array.from(userList.querySelectorAll('input:checked')).map(i => i.dataset.userId);
            if (selected.length > 0) {
                ws.send(JSON.stringify({ type: 'invite-users', roomId, usersToInvite: selected }));
            }
            document.body.removeChild(modal);
        };
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '취소';
        cancelBtn.onclick = () => document.body.removeChild(modal);
        const btnContainer = document.createElement('div');
        btnContainer.className = 'modal-buttons';
        btnContainer.appendChild(inviteBtn);
        btnContainer.appendChild(cancelBtn);
        modalContent.appendChild(btnContainer);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
    }
    
    createChatBtn.addEventListener('click', () => {
        const selectedUsers = Array.from(userListEl.querySelectorAll('input:checked')).map(input => input.dataset.userId);
        if (selectedUsers.length > 0) {
            ws.send(JSON.stringify({ type: 'create-chat-room', participants: selectedUsers }));
            userListEl.querySelectorAll('input:checked').forEach(input => input.checked = false);
        } else {
            alert('채팅할 사용자를 선택하세요.');
        }
    });
});