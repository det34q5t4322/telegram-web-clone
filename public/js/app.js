// Telegram Web Client Application Logic (GitHub Pages + PeerJS WebRTC P2P Support)

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const profileModal = document.getElementById('profile-modal');
  const usernameInput = document.getElementById('username-input');
  const saveProfileBtn = document.getElementById('save-profile-btn');

  const myAvatarEl = document.getElementById('my-avatar');
  const myUsernameEl = document.getElementById('my-username');
  const myPeerIdText = document.getElementById('my-peer-id-text');

  const messagesContainer = document.getElementById('messages-container');
  const messageInput = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const voiceBtn = document.getElementById('voice-btn');
  const attachBtn = document.getElementById('attach-btn');
  const fileInput = document.getElementById('file-input');

  const voiceRecordingUI = document.getElementById('voice-recording-ui');
  const voiceTimerEl = document.getElementById('voice-timer');
  const cancelVoiceBtn = document.getElementById('cancel-voice-btn');

  const emojiPickerBtn = document.getElementById('emoji-picker-btn');
  const emojiPopup = document.getElementById('emoji-popup');
  const stickersGrid = document.getElementById('stickers-grid');
  const gifsGrid = document.getElementById('gifs-grid');

  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const shareLinkBtn = document.getElementById('share-link-btn');
  const headerShareBtn = document.getElementById('header-share-btn');
  const shareModal = document.getElementById('share-modal');
  const closeShareModal = document.getElementById('close-share-modal');
  const shareUrlInput = document.getElementById('share-url-input');
  const copyShareBtn = document.getElementById('copy-share-btn');

  const replyBanner = document.getElementById('reply-banner');
  const replyUserEl = document.getElementById('reply-user');
  const replyTextEl = document.getElementById('reply-text');
  const cancelReplyBtn = document.getElementById('cancel-reply-btn');

  const pollBtn = document.getElementById('poll-btn');
  const pollModal = document.getElementById('poll-modal');
  const pollQuestionInput = document.getElementById('poll-question-input');
  const submitPollBtn = document.getElementById('submit-poll-btn');
  const cancelPollBtn = document.getElementById('cancel-poll-btn');

  const activeChatTitle = document.getElementById('active-chat-title');
  const activeChatSubtitle = document.getElementById('active-chat-subtitle');

  // State Variables
  let currentUser = null;
  let peer = null;
  let activeConn = null;
  let myPeerId = null;
  let activeReplyMsg = null;

  const avatarColors = ['bg-blue', 'bg-green', 'bg-orange', 'bg-purple', 'bg-red'];

  const stickerPack = [
    { id: 'duck_hi', url: 'https://cdn.jsdelivr.net/gh/TelegramMessenger/TWeb@master/src/assets/img/duck/duck_hi.png' },
    { id: 'duck_love', url: 'https://cdn.jsdelivr.net/gh/TelegramMessenger/TWeb@master/src/assets/img/duck/duck_love.png' },
    { id: 'duck_cool', url: 'https://cdn.jsdelivr.net/gh/TelegramMessenger/TWeb@master/src/assets/img/duck/duck_cool.png' },
    { id: 'pepe_happy', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3hxdTJ3MnNyc280dWFwdnBva3dzd3FyejdpdDdxbm5uNGkydXpydSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/eoxomXXVL2S0E/giphy.gif' },
    { id: 'cat_vibe', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNGQxbnpzaWs5NWtqdXBvaXdzbnZzNWRxNnF4czY4c2tzanFxd3lzOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/jpbnoe3UIa8TU8LM13/giphy.gif' }
  ];

  const gifPack = [
    { url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNDNqM285Z2VxcWs2amIxb2oxbmE2c2s4cDVvdzhxcHFvN2I1bDRuZSZlcD12MV_pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l3vR4CdLInEAhergI/giphy.gif' },
    { url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Z6cW9vMmEwdnpsNWtrcTl1b2NqbmNvcWdpNmY4NW9iaDF0ZHRzYiZlcD12MV_pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/13CoXDiaCcCoyk/giphy.gif' }
  ];

  const urlParams = new URLSearchParams(window.location.search);
  const targetPeerId = urlParams.get('peer');

  function initUserSession() {
    const savedUser = localStorage.getItem('tg_user');
    if (savedUser) {
      currentUser = JSON.parse(savedUser);
      profileModal.classList.add('hidden');
      updateUserProfileUI();
      initPeerJS();
    } else {
      profileModal.classList.remove('hidden');
    }
  }

  function updateUserProfileUI() {
    if (!currentUser) return;
    myUsernameEl.textContent = currentUser.username;
    myAvatarEl.textContent = currentUser.username.charAt(0).toUpperCase();
    myAvatarEl.className = `avatar ${currentUser.colorClass || 'bg-blue'}`;
  }

  saveProfileBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (!username) {
      alert('Пожалуйста, введите ваше имя!');
      return;
    }

    const randomColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];
    currentUser = {
      id: 'usr_' + Date.now(),
      username: username,
      colorClass: randomColor
    };

    localStorage.setItem('tg_user', JSON.stringify(currentUser));
    profileModal.classList.add('hidden');
    updateUserProfileUI();
    initPeerJS();
  });

  // WebRTC PeerJS Autonomous Real-Time Connection
  function initPeerJS() {
    if (typeof Peer === 'undefined') return;

    peer = new Peer();

    peer.on('open', (id) => {
      myPeerId = id;
      if (myPeerIdText) myPeerIdText.textContent = `ID: ${id.substring(0, 8)}...`;
      
      // If target peer ID present in URL, connect to friend!
      if (targetPeerId && targetPeerId !== id) {
        connectToPeer(targetPeerId);
      }
    });

    peer.on('connection', (conn) => {
      setupConnection(conn);
    });
  }

  function connectToPeer(peerId) {
    if (!peer) return;
    const conn = peer.connect(peerId);
    setupConnection(conn);
  }

  function setupConnection(conn) {
    activeConn = conn;

    conn.on('open', () => {
      activeChatSubtitle.textContent = 'Друг подключен • В сети';
      document.getElementById('chat-status-preview').textContent = 'Соединение установлено в реальном времени!';
    });

    conn.on('data', (data) => {
      if (data.type === 'message') {
        renderMessage(data.msg);
        playNotificationSound();
      }
    });

    conn.on('close', () => {
      activeChatSubtitle.textContent = 'Ожидание друга...';
    });
  }

  function renderMessage(msg) {
    const isOutgoing = msg.senderId === currentUser.id;
    const isSticker = msg.type === 'sticker';
    const isGif = msg.type === 'gif';

    const msgWrapper = document.createElement('div');
    msgWrapper.className = `msg-wrapper ${isOutgoing ? 'outgoing' : 'incoming'} ${isSticker ? 'sticker-msg' : ''}`;
    msgWrapper.setAttribute('data-msg-id', msg.id);

    const formattedTime = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let bodyHtml = '';
    if (isSticker) {
      bodyHtml = `<img src="${msg.fileUrl}" class="msg-sticker-img" alt="Sticker">`;
    } else if (isGif) {
      bodyHtml = `<img src="${msg.fileUrl}" class="msg-gif-img" alt="GIF">`;
    } else if (msg.type === 'image') {
      bodyHtml = `<img src="${msg.fileUrl}" class="msg-image" alt="Attachment">`;
    } else {
      bodyHtml = `<div class="msg-text">${escapeHtml(msg.text)}</div>`;
    }

    msgWrapper.innerHTML = `
      <div class="msg-bubble">
        ${!isOutgoing && !isSticker ? `<div class="msg-sender">${escapeHtml(msg.senderName)}</div>` : ''}
        ${bodyHtml}
        <div class="msg-meta">
          <span>${formattedTime}</span>
          ${isOutgoing ? '<i class="fa-solid fa-check-double check-icon"></i>' : ''}
        </div>
      </div>
    `;

    messagesContainer.appendChild(msgWrapper);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function sendTextMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    const msg = {
      id: 'msg_' + Date.now(),
      senderId: currentUser.id,
      senderName: currentUser.username,
      text: text,
      type: 'text',
      timestamp: Date.now()
    };

    renderMessage(msg);

    if (activeConn && activeConn.open) {
      activeConn.send({ type: 'message', msg });
    }

    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendBtn.classList.add('hidden');
    voiceBtn.classList.remove('hidden');
  }

  messageInput.addEventListener('input', () => {
    const hasText = messageInput.value.trim().length > 0;
    if (hasText) {
      sendBtn.classList.remove('hidden');
      voiceBtn.classList.add('hidden');
    } else {
      sendBtn.classList.add('hidden');
      voiceBtn.classList.remove('hidden');
    }
  });

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    }
  });

  sendBtn.addEventListener('click', sendTextMessage);

  // Share Link Modal
  function openShareModal() {
    const currentUrl = window.location.origin + window.location.pathname;
    const shareUrl = myPeerId ? `${currentUrl}?peer=${myPeerId}` : currentUrl;
    shareUrlInput.value = shareUrl;
    shareModal.classList.remove('hidden');
  }

  shareLinkBtn.addEventListener('click', openShareModal);
  headerShareBtn.addEventListener('click', openShareModal);
  closeShareModal.addEventListener('click', () => shareModal.classList.add('hidden'));

  copyShareBtn.addEventListener('click', () => {
    shareUrlInput.select();
    document.execCommand('copy');
    copyShareBtn.innerHTML = '<i class="fa-solid fa-check"></i> Скопировано!';
    setTimeout(() => copyShareBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Копировать', 2000);
  });

  function playNotificationSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {}
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // Theme Toggle
  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
  });

  initUserSession();
});
