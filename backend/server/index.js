// index.js (Backend)
import express from 'express';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import http from 'http';

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new SocketServer(server, {
  cors: {
    origin: ['http://localhost:5173', 'https://your-deployment-url.com'],
    methods: ['GET', 'POST']
  }
});

// Channel structure: { name: string, history: array, coordinator: string }
const channels = {
  general: { history: [], coordinator: null },
  tech: { history: [], coordinator: null },
  random: { history: [], coordinator: null }
};

const users = new Map();

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  
  // Set initial user data
  users.set(socket.id, { channels: new Set() });

  // Send ID to client
  socket.emit('Id', socket.id);

  // Channel handling
  socket.on('joinChannel', (channelName) => {
    if (!channels[channelName]) return;

    // Leave previous channels
    users.get(socket.id)?.channels.forEach(ch => {
      socket.leave(ch);
    });
    
    // Join new channel
    users.set(socket.id, { channels: new Set([channelName]) });
    socket.join(channelName);

    // Assign coordinator if needed
    if (!channels[channelName].coordinator) {
      channels[channelName].coordinator = socket.id;
      socket.emit('coordinator-status', true);
    }

    // Send channel history
    socket.emit('history', channels[channelName].history);
  });

  // Message handling
  socket.on('message', ({ message, channel, file }) => {
    if (file) {
      // Handle file logic here
      message += ` [File: ${file.name}]`;
    }
    
    channels[channel].history.push(message);
    if (channels[channel].history.length > 100) {
      channels[channel].history.shift();
    }
    
    io.to(channel).emit('new-message', message);
  });

  // WebRTC signaling
  socket.on('sendSignal', ({ userToSignal, callerID, signal }) => {
    io.to(userToSignal).emit('user-joined', { signal, callerID });
  });

  socket.on('returnSignal', ({ signal, callerID }) => {
    io.to(callerID).emit('receivingReturnSignal', { signal, id: socket.id });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    users.delete(socket.id);
    
    // Check and reassign coordinators
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