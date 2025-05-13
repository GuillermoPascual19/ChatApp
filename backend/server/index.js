import express from 'express';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import http from 'http';

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new SocketServer(server, {
  cors: {
    origin: ['http://localhost:5173', 'https://chat-app-drab-delta-83.vercel.app/'],
    methods: ['GET', 'POST']
  }
});

const channels = {
  general: { history: [], coordinator: null },
  auxiliar: { history: [], coordinator: null }
};

const users = new Map();

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  
  // Set initial user data - will be updated when username is set
  users.set(socket.id, { 
    channels: new Set(),
    username: `Usuario_${socket.id.substr(0, 4)}` // Default username
  });

  // Send ID to client
  socket.emit('Id', socket.id);

  // Handle username setting
  socket.on('setUsername', (username) => {
    if (username && username.trim()) {
      const oldUsername = users.get(socket.id)?.username;
      users.get(socket.id).username = username;
      
      // Notify channels of username change
      users.get(socket.id)?.channels.forEach(channelName => {
        const systemMsg = `[System] ${oldUsername} ahora es ${username}`;
        // Añadir al inicio del historial en lugar de al final
        channels[channelName].history.unshift(systemMsg);
        io.to(channelName).emit('new-message', systemMsg, true); // Segundo parámetro indica mensaje nuevo al inicio
      });
    }
  });

  // Channel handling
  socket.on('joinChannel', (channelName) => {
    if (!channels[channelName]) return;

    // Leave previous channels
    users.get(socket.id)?.channels.forEach(ch => {
      socket.leave(ch);
    });
    
    // Join new channel
    const username = users.get(socket.id)?.username;
    users.get(socket.id).channels = new Set([channelName]);
    socket.join(channelName);

    // Inform channel about new user
    const joinMsg = `[System] ${username} se ha unido a #${channelName}`;
    // Añadir al inicio del historial
    channels[channelName].history.unshift(joinMsg);
    io.to(channelName).emit('new-message', joinMsg, true); // true indica mensaje nuevo al inicio

    // Assign coordinator if needed
    if (!channels[channelName].coordinator) {
      channels[channelName].coordinator = socket.id;
      socket.emit('coordinator-status', true);
    }

    // Send channel history (ahora ya viene en orden inverso)
    socket.emit('history', channels[channelName].history);
  });

  // Message handling
  socket.on('message', ({ message, channel, file }) => {
    const username = users.get(socket.id)?.username;
    let formattedMessage = message;
    
    // We need to handle file specifically
    if (file) {
      const fileData = {
        name: file.name,
        size: file.size,
        data: file,
        sender: username,
        timestamp: new Date().toISOString(),
        channel: channel
      };
      
      // Store file info in history
      const fileMessage = `[${channel}] [${username}]: ${message} [Archivo adjunto]`;
      // Añadir al inicio del historial
      channels[channel].history.unshift(fileMessage);
      
      // Send file to all clients in the channel
      io.to(channel).emit('new-file', fileData, true); // true indica archivo nuevo al inicio
    } else {
      // Regular text message
      // Añadir al inicio del historial
      channels[channel].history.unshift(formattedMessage);
      if (channels[channel].history.length > 100) {
        channels[channel].history.pop(); // Eliminar el mensaje más antiguo (ahora el último)
      }
      
      io.to(channel).emit('new-message', formattedMessage, true); // true indica mensaje nuevo al inicio
    }
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
    const username = users.get(socket.id)?.username;
    const userChannels = [...(users.get(socket.id)?.channels || [])];
    
    // Notify about user disconnection
    userChannels.forEach(channelName => {
      if (channels[channelName]) {
        const leaveMsg = `[System] ${username} se ha desconectado`;
        // Añadir al inicio del historial
        channels[channelName].history.unshift(leaveMsg);
        io.to(channelName).emit('new-message', leaveMsg, true); // true indica mensaje nuevo al inicio
      }
    });
    
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