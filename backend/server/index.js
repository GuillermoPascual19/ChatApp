import express from 'express';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fileUpload from 'express-fileupload';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
}));

const server = http.createServer(app);

// Configuración de rutas para dirname en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Crear la carpeta temp si no existe
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
  console.log(`Carpeta temporal creada en: ${tempDir}`);
}

const io = new SocketServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const channels = {
  general: { history: [], fileHistory: [], coordinator: null },
  auxiliar: { history: [], fileHistory: [], coordinator: null }
};

const users = new Map();

// Cargar archivos existentes al iniciar el servidor
function loadFilesFromDisk() {
  if (!fs.existsSync(tempDir)) return;

  const channelDirs = fs.readdirSync(tempDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  channelDirs.forEach(channelName => {
    if (!channels[channelName]) {
      channels[channelName] = { history: [], fileHistory: [], coordinator: null };
    }
    
    const channelDir = path.join(tempDir, channelName);
    const files = fs.readdirSync(channelDir);
    
    files.forEach(filename => {
      const filePath = path.join(channelDir, filename);
      const stats = fs.statSync(filePath);
      
      if (stats.isFile()) {
        const originalName = filename.split('_').slice(1).join('_');
        
        channels[channelName].fileHistory.push({
          name: originalName,
          path: path.join(channelName, filename),
          sender: 'Sistema',
          timestamp: new Date(parseInt(filename.split('_')[0])).toISOString(),
          channel: channelName,
          size: stats.size
        });
      }
    });
  });
}

loadFilesFromDisk();

// Ruta para subir archivos
app.post('/upload', (req, res) => {
  if (!req.files || !req.files.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const file = req.files.file;
  const channel = req.body.channel;
  const sender = req.body.sender;
  const message = req.body.message;

  // Crear directorio del canal si no existe
  const channelDir = path.join(tempDir, channel);
  if (!fs.existsSync(channelDir)) {
    fs.mkdirSync(channelDir, { recursive: true });
  }

  // Generar nombre único para el archivo
  const timestamp = Date.now();
  const safeFilename = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
  const filePath = path.join(channelDir, safeFilename);

  // Mover el archivo a la carpeta temp
  file.mv(filePath, (err) => {
    if (err) {
      console.error('Error saving file:', err);
      return res.status(500).json({ error: 'Error saving file' });
    }

    // Crear objeto de archivo para el historial
    const fileData = {
      name: file.name,
      path: path.join(channel, safeFilename),
      sender: sender,
      timestamp: new Date().toISOString(),
      channel: channel,
      size: file.size,
      type: file.mimetype
    };

    // Añadir al historial del canal
    if (!channels[channel]) {
      channels[channel] = { history: [], fileHistory: [], coordinator: null };
    }
    
    channels[channel].fileHistory.push(fileData);
    
    // Parsear el mensaje para el historial de chat
    let chatMessage = message;
    try {
      const msgObj = JSON.parse(message);
      chatMessage = `[${msgObj.sender}]: ${msgObj.text}`;
      if (file.name) {
        chatMessage += ` [Archivo: ${file.name}]`;
      }
    } catch (e) {
      console.error('Error parsing message:', e);
    }
    
    channels[channel].history.unshift(chatMessage);

    // Notificar a todos en el canal
    io.to(channel).emit('new-file', fileData);
    io.to(channel).emit('new-message', chatMessage);

    res.json({
      success: true,
      file: fileData
    });
  });
});

// Ruta para servir archivos estáticos
app.use('/files', express.static(tempDir));

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  
  users.set(socket.id, { 
    channels: new Set(),
    username: `Usuario_${socket.id.substr(0, 4)}`
  });

  socket.emit('Id', socket.id);

  socket.on('setUsername', (username) => {
    if (username && username.trim()) {
      const oldUsername = users.get(socket.id)?.username;
      users.get(socket.id).username = username;
      
      users.get(socket.id)?.channels.forEach(channelName => {
        const systemMsg = `[System] ${oldUsername} ahora es ${username}`;
        channels[channelName].history.unshift(systemMsg);
        io.to(channelName).emit('new-message', systemMsg);
      });
    }
  });

  socket.on('joinChannel', (channelName) => {
    if (!channels[channelName]) {
      channels[channelName] = { history: [], fileHistory: [], coordinator: null };
      const channelDir = path.join(tempDir, channelName);
      if (!fs.existsSync(channelDir)) {
        fs.mkdirSync(channelDir, { recursive: true });
      }
    }

    users.get(socket.id)?.channels.forEach(ch => {
      socket.leave(ch);
    });
    
    const username = users.get(socket.id)?.username;
    users.get(socket.id).channels = new Set([channelName]);
    socket.join(channelName);

    const joinMsg = `[System] ${username} se ha unido a #${channelName}`;
    channels[channelName].history.unshift(joinMsg);
    io.to(channelName).emit('new-message', joinMsg);

    if (!channels[channelName].coordinator) {
      channels[channelName].coordinator = socket.id;
      socket.emit('coordinator-status', true);
    }

    socket.emit('history', channels[channelName].history);
    socket.emit('file-history', channels[channelName].fileHistory);
  });

  socket.on('getFileHistory', (channelName) => {
    if (channels[channelName]) {
      socket.emit('file-history', channels[channelName].fileHistory);
    }
  });

  socket.on('message', ({ message, channel, file }) => {
    const username = users.get(socket.id)?.username;
    
    if (!file) {
      channels[channel].history.unshift(message);
      if (channels[channel].history.length > 100) {
        channels[channel].history.pop();
      }
      
      io.to(channel).emit('new-message', message);
    }
  });

  socket.on('sendSignal', ({ userToSignal, callerID, signal }) => {
    io.to(userToSignal).emit('user-joined', { signal, callerID });
  });

  socket.on('returnSignal', ({ signal, callerID }) => {
    io.to(callerID).emit('receivingReturnSignal', { signal, id: socket.id });
  });

  socket.on('disconnect', () => {
    const username = users.get(socket.id)?.username;
    console.log(`User ${socket.id} (${username}) disconnected`);
    
    const userChannels = [...(users.get(socket.id)?.channels || [])];
    
    userChannels.forEach(channelName => {
      if (channels[channelName]) {
        const leaveMsg = `[System] ${username} se ha desconectado`;
        channels[channelName].history.unshift(leaveMsg);
        io.to(channelName).emit('new-message', leaveMsg);
      }
    });
    
    users.delete(socket.id);
    
    Object.entries(channels).forEach(([name, channel]) => {
      if (channel.coordinator === socket.id) {
        const participants = io.sockets.adapter.rooms.get(name) || new Set();
        channel.coordinator = participants.size > 0 ? [...participants][0] : null;
        if (channel.coordinator) {
          io.to(channel.coordinator).emit('coordinator-status', true);
        }
      }
    });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});