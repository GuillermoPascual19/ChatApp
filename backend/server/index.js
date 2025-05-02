const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');

const app = express();
const server = http.createServer(app);
app.use(cors());

const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', "https://chat-app-drab-delta-83.vercel.app"],
    methods: ['GET', 'POST'],
  }
});

// Almacenamiento por canal
const channels = {};

const getChannel = (channel) => {
  if (!channels[channel]) {
    channels[channel] = {
      coordinator: null,
      messages: [],
      users: new Set()
    };
  }
  return channels[channel];
};

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  let currentChannel = '';

  const handleJoinChannel = (channel, callback) => {
    // Salir del canal anterior
    if (currentChannel) {
      socket.leave(currentChannel);
      const prevChannel = getChannel(currentChannel);
      prevChannel.users.delete(socket.id);
      
      // Si era el coordinador, asignar nuevo coordinador
      if (prevChannel.coordinator === socket.id) {
        const usersArray = Array.from(prevChannel.users);
        prevChannel.coordinator = usersArray[0] || null;
        if (usersArray[0]) {
          io.to(usersArray[0]).emit('role-update', { isCoordinator: true });
        }
      }
    }

    // Unirse al nuevo canal
    currentChannel = channel;
    socket.join(channel);
    const channelData = getChannel(channel);
    channelData.users.add(socket.id);

    // Asignar coordinador si no hay
    if (!channelData.coordinator) {
      channelData.coordinator = socket.id;
    }

    // Notificar al usuario
    callback({
      status: 'success',
      channel,
      isCoordinator: channelData.coordinator === socket.id,
      messages: channelData.messages,
      users: Array.from(channelData.users)
    });

    // Notificar a otros usuarios
    socket.to(channel).emit('user-joined', {
      userId: socket.id,
      users: Array.from(channelData.users)
    });
  };

  socket.on('join-channel', handleJoinChannel);

  socket.on('send-message', (message, callback) => {
    if (!currentChannel) {
      callback({ status: 'error', message: 'No channel selected' });
      return;
    }

    const channelData = getChannel(currentChannel);
    const messageData = {
      id: `${Date.now()}-${socket.id}`,
      sender: socket.id,
      content: message,
      timestamp: Date.now(),
      channel: currentChannel
    };

    // Guardar mensaje si es el coordinador
    if (channelData.coordinator === socket.id) {
      channelData.messages.push(messageData);
    }

    // Transmitir a todos en el canal
    io.to(currentChannel).emit('new-message', messageData);
    callback({ status: 'success', message: messageData });
  });

  socket.on('send-file', (fileData, callback) => {
    if (!currentChannel) {
      callback({ status: 'error', message: 'No channel selected' });
      return;
    }

    const channelData = getChannel(currentChannel);
    const messageData = {
      id: `${Date.now()}-${socket.id}`,
      sender: socket.id,
      content: fileData.data,
      timestamp: Date.now(),
      channel: currentChannel,
      isFile: true,
      fileName: fileData.name
    };

    // Guardar archivo si es el coordinador
    if (channelData.coordinator === socket.id) {
      channelData.messages.push(messageData);
    }

    // Transmitir a todos en el canal
    io.to(currentChannel).emit('new-message', messageData);
    callback({ status: 'success', message: messageData });
  });

  socket.on('disconnect', () => {
    if (!currentChannel) return;
    
    const channelData = getChannel(currentChannel);
    channelData.users.delete(socket.id);

    // Si era el coordinador, asignar nuevo coordinador
    if (channelData.coordinator === socket.id) {
      const usersArray = Array.from(channelData.users);
      channelData.coordinator = usersArray[0] || null;
      if (usersArray[0]) {
        io.to(usersArray[0]).emit('role-update', { isCoordinator: true });
      }
    }

    // Notificar a otros usuarios
    io.to(currentChannel).emit('user-left', {
      userId: socket.id,
      users: Array.from(channelData.users)
    });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});