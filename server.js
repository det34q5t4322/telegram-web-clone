const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const os = require('os');

const app = express();
app.set('trust proxy', true);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e8 // 100MB for media files
});

const PORT = process.env.PORT || 3000;

// Ensure directories exist
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'db.json');

class Database {
  constructor() {
    this.data = {
      users: {},
      rooms: {},
      messages: [],
      pinned: {}
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.data = JSON.parse(raw);
      } else {
        this.data.rooms['general'] = { id: 'general', name: 'Telegram Global', type: 'group', icon: 'fa-paper-plane' };
        this.data.rooms['ai_bot'] = { id: 'ai_bot', name: '🤖 Telegram AI Bot', type: 'bot', icon: 'fa-robot' };
        this.data.rooms['saved_messages'] = { id: 'saved_messages', name: '🔖 Избранное', type: 'saved', icon: 'fa-bookmark' };
        this.save();
      }
    } catch (err) {
      console.error('Error loading database:', err);
    }
  }

  save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving database:', err);
    }
  }

  saveUser(user) {
    this.data.users[user.id] = { ...this.data.users[user.id], ...user, lastSeen: Date.now() };
    this.save();
    return this.data.users[user.id];
  }

  getUser(id) {
    return this.data.users[id] || null;
  }

  getOrCreateRoom(roomId, roomName = 'Telegram Chat', type = 'group') {
    if (!this.data.rooms[roomId]) {
      this.data.rooms[roomId] = {
        id: roomId,
        name: roomName,
        type: type,
        createdBy: 'user'
      };
      this.save();
    }
    return this.data.rooms[roomId];
  }

  addMessage(msg) {
    const fullMsg = {
      id: msg.id || 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      roomId: msg.roomId || 'general',
      senderId: msg.senderId,
      senderName: msg.senderName,
      senderAvatar: msg.senderAvatar || null,
      text: msg.text || '',
      type: msg.type || 'text',
      fileUrl: msg.fileUrl || null,
      fileName: msg.fileName || null,
      fileSize: msg.fileSize || null,
      pollData: msg.pollData || null,
      replyTo: msg.replyTo || null,
      reactions: msg.reactions || {},
      timestamp: msg.timestamp || Date.now(),
      status: 'sent'
    };

    this.data.messages.push(fullMsg);
    this.save();
    return fullMsg;
  }

  getMessages(roomId, limit = 150) {
    return this.data.messages
      .filter(m => m.roomId === roomId)
      .slice(-limit);
  }

  toggleReaction(messageId, emoji, userId) {
    const msg = this.data.messages.find(m => m.id === messageId);
    if (!msg) return null;

    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];

    const index = msg.reactions[emoji].indexOf(userId);
    if (index > -1) {
      msg.reactions[emoji].splice(index, 1);
      if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
    } else {
      msg.reactions[emoji].push(userId);
    }

    this.save();
    return msg;
  }

  votePoll(messageId, optionIdx, userId) {
    const msg = this.data.messages.find(m => m.id === messageId);
    if (!msg || !msg.pollData || !msg.pollData.options[optionIdx]) return null;

    const opt = msg.pollData.options[optionIdx];
    if (!opt.votes) opt.votes = [];

    const idx = opt.votes.indexOf(userId);
    if (idx > -1) {
      opt.votes.splice(idx, 1);
    } else {
      opt.votes.push(userId);
    }

    this.save();
    return msg;
  }

  pinMessage(roomId, messageId) {
    if (!this.data.pinned) this.data.pinned = {};
    this.data.pinned[roomId] = messageId;
    this.save();
    return messageId;
  }

  getPinnedMessage(roomId) {
    const msgId = this.data.pinned ? this.data.pinned[roomId] : null;
    if (!msgId) return null;
    return this.data.messages.find(m => m.id === msgId) || null;
  }

  deleteMessage(messageId, userId) {
    const idx = this.data.messages.findIndex(m => m.id === messageId);
    if (idx !== -1) {
      const msg = this.data.messages[idx];
      if (msg.senderId === userId) {
        this.data.messages.splice(idx, 1);
        this.save();
        return true;
      }
    }
    return false;
  }
}

const db = new Database();

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || (file.mimetype.includes('audio') ? '.webm' : '.bin');
    cb(null, 'upload-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

// Express Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// Helper: Get local LAN IP address
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

// AI Bot response logic
function generateAiResponse(userText) {
  const text = userText.toLowerCase();
  if (text.includes('привет') || text.includes('здравствуй') || text.includes('hi') || text.includes('hello')) {
    return 'Привет! Я виртуальный ассистент Telegram AI. Чем я могу помочь тебе сегодня? 🚀';
  } else if (text.includes('как дела') || text.includes('как ты')) {
    return 'У меня всё отлично! Все сервера работают на 100% мощности. А как твои дела? 😊';
  } else if (text.includes('погода') || text.includes('weather')) {
    return 'Сегодня отличный день для программирования и общения с друзьями в Telegram! ☀️';
  } else if (text.includes('анекдот') || text.includes('шутк') || text.includes('joke')) {
    return '— Программист перед сном ставит на тумбочку два стакана: один с водой — если захочет пить, и один пустой — если не захочет пить. 😄';
  } else if (text.includes('время') || text.includes('time')) {
    return `Текущее точное время сервера: ${new Date().toLocaleTimeString('ru-RU')} ⏰`;
  } else {
    const defaultReplies = [
      'Интересный вопрос! В Telegram Web можно отправлять голосовые сообщения, файлы, стикеры и гифки! 🌟',
      'Я постоянно обновляюсь и могу подсказать ответы на любые темы! ✨',
      'Замечательное сообщение! Можешь скинуть ссылку друзьям через кнопку «Пригласить». 🔗',
      'Будущее за веб-технологиями и удобными мессенджерами! 🚀'
    ];
    return defaultReplies[Math.floor(Math.random() * defaultReplies.length)];
  }
}

// API Routes
app.get('/api/info', (req, res) => {
  const ips = getLocalIpAddresses();
  res.json({
    port: PORT,
    localIp: ips[0] || 'localhost',
    allIps: ips
  });
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  const fileUrl = `/uploads/${req.file.filename}`;
  const isImage = req.file.mimetype.startsWith('image/');
  const isAudio = req.file.mimetype.startsWith('audio/');

  res.json({
    fileUrl,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    fileType: isImage ? 'image' : (isAudio ? 'voice' : 'file')
  });
});

// Socket.io Real-Time Handlers
const activeUsers = new Map();

io.on('connection', (socket) => {
  socket.on('user:join', (user) => {
    if (!user || !user.id) return;
    
    const dbUser = db.saveUser({
      id: user.id,
      username: user.username || 'Anonymous',
      avatar: user.avatar || null,
      status: 'online'
    });

    activeUsers.set(socket.id, {
      userId: dbUser.id,
      username: dbUser.username,
      avatar: dbUser.avatar,
      roomId: 'general'
    });

    socket.join('general');
    io.emit('user:status_change', { userId: dbUser.id, status: 'online', username: dbUser.username });

    const history = db.getMessages('general');
    const pinnedMsg = db.getPinnedMessage('general');
    socket.emit('chat:history', { roomId: 'general', messages: history, pinned: pinnedMsg });
    socket.emit('user:joined_success', { user: dbUser, room: db.getOrCreateRoom('general') });
  });

  socket.on('room:join', ({ roomId, roomName }) => {
    const userInfo = activeUsers.get(socket.id);
    if (!userInfo) return;

    for (const room of socket.rooms) {
      if (room !== socket.id) socket.leave(room);
    }

    const room = db.getOrCreateRoom(roomId, roomName || 'Telegram Chat');
    socket.join(roomId);
    userInfo.roomId = roomId;

    const history = db.getMessages(roomId);
    const pinnedMsg = db.getPinnedMessage(roomId);
    socket.emit('chat:history', { roomId, messages: history, pinned: pinnedMsg });
  });

  socket.on('message:send', (msgData) => {
    const userInfo = activeUsers.get(socket.id);
    if (!userInfo) return;

    const roomId = msgData.roomId || userInfo.roomId || 'general';

    const savedMsg = db.addMessage({
      roomId: roomId,
      senderId: userInfo.userId,
      senderName: userInfo.username,
      senderAvatar: userInfo.avatar,
      text: msgData.text,
      type: msgData.type || 'text',
      fileUrl: msgData.fileUrl,
      fileName: msgData.fileName,
      fileSize: msgData.fileSize,
      pollData: msgData.pollData,
      replyTo: msgData.replyTo || null
    });

    io.to(roomId).emit('message:new', savedMsg);

    if (roomId === 'ai_bot' || (msgData.text && msgData.text.includes('@ai'))) {
      setTimeout(() => {
        const replyText = generateAiResponse(msgData.text || '');
        const aiMsg = db.addMessage({
          roomId: roomId,
          senderId: 'ai_bot_id',
          senderName: '🤖 Telegram AI Bot',
          senderAvatar: 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png',
          text: replyText,
          type: 'text'
        });
        io.to(roomId).emit('message:new', aiMsg);
      }, 1000);
    }
  });

  socket.on('typing:start', ({ roomId }) => {
    const userInfo = activeUsers.get(socket.id);
    if (userInfo) {
      socket.to(roomId || userInfo.roomId || 'general').emit('typing:status', {
        userId: userInfo.userId,
        username: userInfo.username,
        isTyping: true
      });
    }
  });

  socket.on('typing:stop', ({ roomId }) => {
    const userInfo = activeUsers.get(socket.id);
    if (userInfo) {
      socket.to(roomId || userInfo.roomId || 'general').emit('typing:status', {
        userId: userInfo.userId,
        username: userInfo.username,
        isTyping: false
      });
    }
  });

  socket.on('message:react', ({ messageId, emoji }) => {
    const userInfo = activeUsers.get(socket.id);
    if (!userInfo) return;

    const updatedMsg = db.toggleReaction(messageId, emoji, userInfo.userId);
    if (updatedMsg) {
      io.to(updatedMsg.roomId).emit('message:updated', updatedMsg);
    }
  });

  socket.on('poll:vote', ({ messageId, optionIdx }) => {
    const userInfo = activeUsers.get(socket.id);
    if (!userInfo) return;

    const updatedMsg = db.votePoll(messageId, optionIdx, userInfo.userId);
    if (updatedMsg) {
      io.to(updatedMsg.roomId).emit('message:updated', updatedMsg);
    }
  });

  socket.on('message:pin', ({ roomId, messageId }) => {
    const pinnedMsgId = db.pinMessage(roomId, messageId);
    const pinnedMsg = db.getPinnedMessage(roomId);
    io.to(roomId).emit('chat:pinned_update', { roomId, pinned: pinnedMsg });
  });

  socket.on('message:delete', ({ messageId }) => {
    const userInfo = activeUsers.get(socket.id);
    if (!userInfo) return;

    const deleted = db.deleteMessage(messageId, userInfo.userId);
    if (deleted) {
      io.emit('message:deleted', { messageId });
    }
  });

  socket.on('call:initiate', ({ targetUserId, isVideo }) => {
    const userInfo = activeUsers.get(socket.id);
    if (userInfo) {
      socket.broadcast.emit('call:incoming', {
        callerId: userInfo.userId,
        callerName: userInfo.username,
        callerAvatar: userInfo.avatar,
        isVideo: isVideo
      });
    }
  });

  socket.on('call:answer', ({ callerId }) => {
    socket.broadcast.emit('call:accepted', { answererId: socket.id });
  });

  socket.on('call:end', () => {
    socket.broadcast.emit('call:ended');
  });

  socket.on('disconnect', () => {
    const userInfo = activeUsers.get(socket.id);
    if (userInfo) {
      db.saveUser({ id: userInfo.userId, status: 'offline' });
      io.emit('user:status_change', { userId: userInfo.userId, status: 'offline', lastSeen: Date.now() });
      activeUsers.delete(socket.id);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIpAddresses();
  console.log(`====================================================`);
  console.log(`🚀 Telegram Web Server Running!`);
  console.log(`💻 Local Access: http://localhost:${PORT}`);
  if (ips.length > 0) {
    console.log(`🌐 LAN Access:   http://${ips[0]}:${PORT}`);
  }
  console.log(`====================================================`);
});
