import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.use(cors());
const server = http.createServer(app);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.join(__dirname, 'temp');

if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'https://chat-p2p-goje.vercel.app'],
    methods: ['GET', 'POST'],
  }
});

const channels = { general: initChannel(), auxiliar: initChannel() };
const users = new Map();

function initChannel() {
  return { history: [], fileHistory: [], coordinator: null };
}

function saveFile(fileData, channel, sender, originalFilename) {
  const matches = fileData.match(/^data:(.+);base64,(.+)$/);
  if (!matches) throw new Error('Formato inválido');

  const [, mimeType, base64] = matches;
  const buffer = Buffer.from(base64, 'base64');
  const safeName = (originalFilename || `file_${Date.now()}`).replace(/[^a-z0-9\-.]/gi, '_');
  const filePath = path.join(tempDir, channel, `${Date.now()}_${safeName}`);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);

  return {
    name: safeName,
    mimeType,
    path: filePath,
    relative: path.join('temp', channel, safeName),
  };
}

function loadFiles() {
  if (!fs.existsSync(tempDir)) return;

  for (const dir of fs.readdirSync(tempDir)) {
    const channel = channels[dir] || (channels[dir] = initChannel());
    const files = fs.readdirSync(path.join(tempDir, dir));

    for (const file of files) {
      const fullPath = path.join(tempDir, dir, file);
      const [timestamp] = file.split('_');
      const base64 = fs.readFileSync(fullPath).toString('base64');
      const mime = mimeType(file);

      channel.fileHistory.push({
        name: file.split('_').slice(1).join('_'),
        data: `data:${mime};base64,${base64}`,
        sender: 'Sistema',
        timestamp: new Date(+timestamp).toISOString(),
        channel: dir,
      });
    }
  }
}

function mimeType(file) {
  const ext = path.extname(file).toLowerCase();
  const mimes = {
    '.jpg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf',
    '.txt': 'text/plain', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return mimes[ext] || 'application/octet-stream';
}

loadFiles();

io.on('connection', (socket) => {
  users.set(socket.id, { channels: new Set(), username: `User_${socket.id.slice(0, 4)}` });
  socket.emit('Id', socket.id);

  socket.on('setUsername', (name) => {
    const user = users.get(socket.id);
    if (name) {
      const prev = user.username;
      user.username = name;
      for (const ch of user.channels) {
        const msg = `[System] ${prev} ahora es ${name}`;
        channels[ch].history.unshift(msg);
        io.to(ch).emit('new-message', msg);
      }
    }
  });

  socket.on('joinChannel', (ch) => {
    if (!channels[ch]) channels[ch] = initChannel();
    users.get(socket.id).channels.forEach(c => socket.leave(c));
    users.get(socket.id).channels = new Set([ch]);
    socket.join(ch);

    const name = users.get(socket.id).username;
    const joinMsg = `[System] ${name} se unió a #${ch}`;
    channels[ch].history.unshift(joinMsg);
    io.to(ch).emit('new-message', joinMsg);

    if (!channels[ch].coordinator) {
      channels[ch].coordinator = socket.id;
      socket.emit('coordinator-status', true);
    }

    socket.emit('history', channels[ch].history);
    socket.emit('file-history', channels[ch].fileHistory);
  });

  socket.on('message', ({ message, channel, file }) => {
    const name = users.get(socket.id)?.username;
    if (file) {
      const msgObj = JSON.parse(message);
      const fileMeta = saveFile(file, channel, name, msgObj.filename);
      const fileData = {
        name: fileMeta.name,
        data: file,
        sender: name,
        timestamp: new Date().toISOString(),
        channel,
      };
      channels[channel].fileHistory.unshift(fileData);
      io.to(channel).emit('new-file', fileData);
    }

    channels[channel].history.unshift(message);
    io.to(channel).emit('new-message', message);
  });

  socket.on('getFileHistory', ch => {
    if (channels[ch]) socket.emit('file-history', channels[ch].fileHistory);
  });

  socket.on('sendSignal', ({ userToSignal, callerID, signal }) => {
    io.to(userToSignal).emit('user-joined', { signal, callerID });
  });

  socket.on('returnSignal', ({ signal, callerID }) => {
    io.to(callerID).emit('receivingReturnSignal', { signal, id: socket.id });
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    user?.channels.forEach(ch => {
      const msg = `[System] ${user.username} se ha desconectado`;
      channels[ch].history.unshift(msg);
      io.to(ch).emit('new-message', msg);

      if (channels[ch].coordinator === socket.id) {
        const room = io.sockets.adapter.rooms.get(ch);
        const [next] = room || [];
        channels[ch].coordinator = next || null;
        if (next) io.to(next).emit('coordinator-status', true);
      }
    });

    users.delete(socket.id);
  });
});

app.use('/files', express.static(tempDir));
server.listen(process.env.PORT || 5000);
