// import express from 'express';
// import cors from 'cors';
// import { Server as SocketServer } from 'socket.io';
// import http from 'http';
// import fs from 'fs';
// import path from 'path';
// import { fileURLToPath } from 'url';

// const app = express();
// app.use(cors());
// const server = http.createServer(app);

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// const tempDir = path.join(__dirname, 'temp');
// if (!fs.existsSync(tempDir)) {
//   fs.mkdirSync(tempDir, { recursive: true });
// }

// const io = new SocketServer(server, {
//   cors: {
//     origin: ['http://localhost:5173', 'https://chat-app-drab-delta-83.vercel.app', 'https://chat-p2p-goje.vercel.app'],
//     methods: ['GET', 'POST']
//   }
// });

// const channels = {
//   general: { history: [], fileHistory: [], coordinator: null },
//   auxiliar: { history: [], fileHistory: [], coordinator: null }
// };

// const users = new Map();

// function saveFile(fileData, channel, sender, originalFilename) {
//   try {
//     const channelDir = path.join(tempDir, channel);
//     if (!fs.existsSync(channelDir)) {
//       fs.mkdirSync(channelDir);
//     }

//     const matches = fileData.match(/^data:(.+);base64,(.+)$/);
//     if (!matches || matches.length !== 3) {
//       throw new Error('Invalid file format');
//     }

//     const mimeType = matches[1];
//     const base64Data = matches[2];
//     const buffer = Buffer.from(base64Data, 'base64');

//     const sanitizedName = originalFilename.replace(/[^a-zA-Z0-9\-_.]/g, '_');
//     const safeFilename = `${Date.now()}_${sanitizedName}`;
//     const filePath = path.join(channelDir, safeFilename);

//     fs.writeFileSync(filePath, buffer);

//     return {
//       filename: safeFilename,
//       originalName: sanitizedName,
//       path: filePath,
//       relativePath: path.join('temp', channel, safeFilename),
//       mimeType: mimeType
//     };
//   } catch (error) {
//     console.error('Error saving file:', error);
//     throw error;
//   }
// }

// function loadFilesFromDisk() {
//   if (!fs.existsSync(tempDir)) return;

//   const channelDirs = fs.readdirSync(tempDir, { withFileTypes: true })
//     .filter(dirent => dirent.isDirectory())
//     .map(dirent => dirent.name);

//   channelDirs.forEach(channelName => {
//     if (!channels[channelName]) {
//       channels[channelName] = { history: [], fileHistory: [], coordinator: null };
//     }

//     const channelDir = path.join(tempDir, channelName);
//     const files = fs.readdirSync(channelDir);

//     files.forEach(filename => {
//       try {
//         const filePath = path.join(channelDir, filename);
//         const stats = fs.statSync(filePath);

//         if (stats.isFile()) {
//           const [timestamp, ...nameParts] = filename.split('_');
//           const originalName = nameParts.join('_');

//           if (!timestamp || isNaN(parseInt(timestamp))) return;

//           const fileBuffer = fs.readFileSync(filePath);
//           const base64Data = fileBuffer.toString('base64');
//           const ext = path.extname(filename).toLowerCase();
//           const mimeType = {
//             '.jpg': 'image/jpeg',
//             '.jpeg': 'image/jpeg',
//             '.png': 'image/png',
//             '.gif': 'image/gif',
//             '.pdf': 'application/pdf',
//             '.txt': 'text/plain'
//           }[ext] || 'application/octet-stream';

//           const dataUri = `data:${mimeType};base64,${base64Data}`;
//           const relativePath = path.join('temp', channelName, filename);

//           const exists = channels[channelName].fileHistory.some(
//             f => f.filepath === relativePath
//           );

//           if (!exists) {
//             channels[channelName].fileHistory.push({
//               name: originalName,
//               data: dataUri,
//               sender: 'System',
//               timestamp: new Date(parseInt(timestamp)).toISOString(),
//               channel: channelName,
//               filepath: relativePath
//             });
//           }
//         }
//       } catch (error) {
//         console.error(`Error loading file ${filename}:`, error);
//       }
//     });
//   });
// }

// loadFilesFromDisk();

// io.on('connection', (socket) => {
//   console.log('New connection:', socket.id);
  
//   users.set(socket.id, { 
//     channels: new Set(),
//     username: `User_${socket.id.substr(0, 4)}`
//   });

//   socket.emit('Id', socket.id);

//   socket.on('setUsername', (username) => {
//     if (username && username.trim()) {
//       const oldUsername = users.get(socket.id)?.username;
//       users.get(socket.id).username = username;
      
//       users.get(socket.id)?.channels.forEach(channelName => {
//         const systemMsg = `[System] ${oldUsername} is now ${username}`;
//         channels[channelName].history.unshift(systemMsg);
//         io.to(channelName).emit('new-message', systemMsg, true);
//       });
//     }
//   });

//   socket.on('joinChannel', (channelName) => {
//     if (!channels[channelName]) {
//       channels[channelName] = { history: [], fileHistory: [], coordinator: null };
//       const channelDir = path.join(tempDir, channelName);
//       if (!fs.existsSync(channelDir)) {
//         fs.mkdirSync(channelDir);
//       }
//     }

//     users.get(socket.id)?.channels.forEach(ch => {
//       socket.leave(ch);
//     });
    
//     const username = users.get(socket.id)?.username;
//     users.get(socket.id).channels = new Set([channelName]);
//     socket.join(channelName);

//     const joinMsg = `[System] ${username} joined #${channelName}`;
//     channels[channelName].history.unshift(joinMsg);
//     io.to(channelName).emit('new-message', joinMsg, true);

//     if (!channels[channelName].coordinator) {
//       channels[channelName].coordinator = socket.id;
//       socket.emit('coordinator-status', true);
//     }

//     socket.emit('history', channels[channelName].history);
//     socket.emit('file-history', channels[channelName].fileHistory);
//   });

//   socket.on('getFileHistory', (channelName) => {
//     if (channels[channelName]) {
//       socket.emit('file-history', channels[channelName].fileHistory);
//     }
//   });

//   socket.on('message', ({ message, channel, file }) => {
//     const username = users.get(socket.id)?.username;
    
//     if (file) {
//       try {
//         const messageObj = JSON.parse(message);
//         const fileInfo = saveFile(file, channel, username, messageObj.filename);
        
//         const fileData = {
//           name: fileInfo.originalName,
//           data: file,
//           sender: username,
//           timestamp: new Date().toISOString(),
//           channel: channel,
//           filepath: fileInfo.relativePath
//         };
          
//         const fileMessage = `[${channel}] [${username}]: ${messageObj.text} [File ${fileInfo.originalName}]`;
//         channels[channel].history.unshift(fileMessage);
//         channels[channel].fileHistory.unshift(fileData);
        
//         io.to(channel).emit('new-file', fileData);
//         io.to(channel).emit('new-message', fileMessage, true);
//       } catch (error) {
//         console.error('Error processing file:', error);
//         socket.emit('error', { message: 'Error processing file' });
//       }
//     } else {
//       channels[channel].history.unshift(message);
//       if (channels[channel].history.length > 100) {
//         channels[channel].history.pop();
//       }
//       io.to(channel).emit('new-message', message, true);
//     }
//   });

//   socket.on('sendSignal', ({ userToSignal, callerID, signal }) => {
//     io.to(userToSignal).emit('user-joined', { signal, callerID });
//   });

//   socket.on('returnSignal', ({ signal, callerID }) => {
//     io.to(callerID).emit('receivingReturnSignal', { signal, id: socket.id });
//   });

//   socket.on('clearHistory', (channelName) => {
//     if (channels[channelName]) {
//       channels[channelName].history = [];
//       const channelDir = path.join(tempDir, channelName);
//       if (fs.existsSync(channelDir)) {
//         const files = fs.readdirSync(channelDir);
//         files.forEach(file => {
//           fs.unlinkSync(path.join(channelDir, file));
//         });
//       }
//       channels[channelName].fileHistory = [];
//       io.to(channelName).emit('history', []);
//       io.to(channelName).emit('file-history', []);
//     }
//   });

//   socket.on('disconnect', () => {
//     const username = users.get(socket.id)?.username;
    
//     [...(users.get(socket.id)?.channels || [])].forEach(channelName => {
//       if (channels[channelName]) {
//         const leaveMsg = `[System] ${username} disconnected`;
//         channels[channelName].history.unshift(leaveMsg);
//         io.to(channelName).emit('new-message', leaveMsg, true);
//       }
//     });
    
//     users.delete(socket.id);
    
//     Object.entries(channels).forEach(([name, channel]) => {
//       if (channel.coordinator === socket.id) {
//         const participants = io.sockets.adapter.rooms.get(name) || new Set();
//         channel.coordinator = participants.size > 0 ? [...participants][0] : null;
//         if (channel.coordinator) {
//           io.to(channel.coordinator).emit('coordinator-status', true);
//         }
//       }
//     });
//   });
// });

// app.use('/files', express.static(tempDir));

// const PORT = process.env.PORT || 5000;
// server.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });

// server.on('error', (error) => {
//   console.error('Server error:', error);
// });

import express from 'express';
import cors from 'cors';
import { Server as IO } from 'socket.io';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const svc = express();
svc.use(cors());
const httpServer = http.createServer(svc);

const __f = fileURLToPath(import.meta.url);
const __d = path.dirname(__f);
const TEMP_PATH = path.join(__d, 'temp');

fs.existsSync(TEMP_PATH) || fs.mkdirSync(TEMP_PATH, { recursive: true });

const io = new IO(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'https://chat-app-drab-delta-83.vercel.app', 'https://chat-p2p-goje.vercel.app'],
    methods: ['GET', 'POST']
  }
});

const CHANNELS = {
  general: { history: [], fileHistory: [], coordinator: null },
  auxiliar: { history: [], fileHistory: [], coordinator: null }
};

const CLIENTS = new Map();

function persistFile(rawData, room, author, original) {
  try {
    const channelFolder = path.join(TEMP_PATH, room);
    fs.existsSync(channelFolder) || fs.mkdirSync(channelFolder);

    const parts = rawData.match(/^data:(.+);base64,(.+)$/);
    if (!parts || parts.length !== 3) throw new Error('File format invalid');

    const mime = parts[1];
    const data = Buffer.from(parts[2], 'base64');
    const safe = original.replace(/[^a-zA-Z0-9\-_.]/g, '_');
    const fname = `${Date.now()}_${safe}`;
    const full = path.join(channelFolder, fname);

    fs.writeFileSync(full, data);

    return {
      filename: fname,
      originalName: safe,
      path: full,
      relativePath: path.join('temp', room, fname),
      mimeType: mime
    };
  } catch (e) {
    console.error('File persist error:', e);
    throw e;
  }
}

function hydrateFiles() {
  if (!fs.existsSync(TEMP_PATH)) return;

  const rooms = fs.readdirSync(TEMP_PATH, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  rooms.forEach(room => {
    if (!CHANNELS[room]) CHANNELS[room] = { history: [], fileHistory: [], coordinator: null };

    const files = fs.readdirSync(path.join(TEMP_PATH, room));

    files.forEach(file => {
      try {
        const filePath = path.join(TEMP_PATH, room, file);
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) return;

        const [time, ...rest] = file.split('_');
        if (!time || isNaN(+time)) return;

        const content = fs.readFileSync(filePath);
        const b64 = content.toString('base64');
        const ext = path.extname(file).toLowerCase();
        const mime = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.pdf': 'application/pdf',
          '.txt': 'text/plain'
        }[ext] || 'application/octet-stream';

        const uri = `data:${mime};base64,${b64}`;
        const rel = path.join('temp', room, file);

        const dup = CHANNELS[room].fileHistory.some(x => x.filepath === rel);
        if (!dup) {
          CHANNELS[room].fileHistory.push({
            name: rest.join('_'),
            data: uri,
            sender: 'System',
            timestamp: new Date(+time).toISOString(),
            channel: room,
            filepath: rel
          });
        }
      } catch (e) {
        console.error(`Failed to load ${file}:`, e);
      }
    });
  });
}

hydrateFiles();

io.on('connection', sock => {
  console.log('Connect:', sock.id);

  CLIENTS.set(sock.id, {
    channels: new Set(),
    username: `User_${sock.id.slice(0, 4)}`
  });

  sock.emit('Id', sock.id);

  sock.on('setUsername', alias => {
    if (!alias || !alias.trim()) return;

    const old = CLIENTS.get(sock.id)?.username;
    CLIENTS.get(sock.id).username = alias;

    CLIENTS.get(sock.id)?.channels.forEach(ch => {
      const msg = `[System] ${old} is now ${alias}`;
      CHANNELS[ch].history.unshift(msg);
      io.to(ch).emit('new-message', msg, true);
    });
  });

  sock.on('joinChannel', chan => {
    if (!CHANNELS[chan]) {
      CHANNELS[chan] = { history: [], fileHistory: [], coordinator: null };
      const folder = path.join(TEMP_PATH, chan);
      fs.existsSync(folder) || fs.mkdirSync(folder);
    }

    CLIENTS.get(sock.id)?.channels.forEach(c => sock.leave(c));

    const alias = CLIENTS.get(sock.id)?.username;
    CLIENTS.get(sock.id).channels = new Set([chan]);
    sock.join(chan);

    const msg = `[System] ${alias} joined #${chan}`;
    CHANNELS[chan].history.unshift(msg);
    io.to(chan).emit('new-message', msg, true);

    if (!CHANNELS[chan].coordinator) {
      CHANNELS[chan].coordinator = sock.id;
      sock.emit('coordinator-status', true);
    }

    sock.emit('history', CHANNELS[chan].history);
    sock.emit('file-history', CHANNELS[chan].fileHistory);
  });

  sock.on('getFileHistory', ch => {
    if (CHANNELS[ch]) {
      sock.emit('file-history', CHANNELS[ch].fileHistory);
    }
  });

  sock.on('message', ({ message, channel, file }) => {
    const alias = CLIENTS.get(sock.id)?.username;

    if (file) {
      try {
        const parsed = JSON.parse(message);
        const meta = persistFile(file, channel, alias, parsed.filename);

        const payload = {
          name: meta.originalName,
          data: file,
          sender: alias,
          timestamp: new Date().toISOString(),
          channel,
          filepath: meta.relativePath
        };

        const output = `[${channel}] [${alias}]: ${parsed.text} [File ${meta.originalName}]`;
        CHANNELS[channel].history.unshift(output);
        CHANNELS[channel].fileHistory.unshift(payload);

        io.to(channel).emit('new-file', payload);
        io.to(channel).emit('new-message', output, true);
      } catch (e) {
        console.error('File error:', e);
        sock.emit('error', { message: 'Error processing file' });
      }
    } else {
      CHANNELS[channel].history.unshift(message);
      CHANNELS[channel].history.length > 100 && CHANNELS[channel].history.pop();
      io.to(channel).emit('new-message', message, true);
    }
  });

  sock.on('sendSignal', ({ userToSignal, callerID, signal }) => {
    io.to(userToSignal).emit('user-joined', { signal, callerID });
  });

  sock.on('returnSignal', ({ signal, callerID }) => {
    io.to(callerID).emit('receivingReturnSignal', { signal, id: sock.id });
  });

  sock.on('clearHistory', channelName => {
    if (!CHANNELS[channelName]) return;

    CHANNELS[channelName].history = [];
    const dir = path.join(TEMP_PATH, channelName);
    fs.existsSync(dir) && fs.readdirSync(dir).forEach(f => fs.unlinkSync(path.join(dir, f)));
    CHANNELS[channelName].fileHistory = [];
    io.to(channelName).emit('history', []);
    io.to(channelName).emit('file-history', []);
  });

  sock.on('disconnect', () => {
    const alias = CLIENTS.get(sock.id)?.username;

    [...(CLIENTS.get(sock.id)?.channels || [])].forEach(chan => {
      const out = `[System] ${alias} disconnected`;
      CHANNELS[chan].history.unshift(out);
      io.to(chan).emit('new-message', out, true);
    });

    CLIENTS.delete(sock.id);

    Object.entries(CHANNELS).forEach(([ch, data]) => {
      if (data.coordinator === sock.id) {
        const peers = io.sockets.adapter.rooms.get(ch) || new Set();
        data.coordinator = peers.size ? [...peers][0] : null;
        data.coordinator && io.to(data.coordinator).emit('coordinator-status', true);
      }
    });
  });
});

svc.use('/files', express.static(TEMP_PATH));

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Live on port ${PORT}`);
});

httpServer.on('error', e => {
  console.error('Server issue:', e);
});