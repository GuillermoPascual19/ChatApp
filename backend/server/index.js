import express from 'express';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import http from 'http';

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new SocketServer(server, {
  cors: {
    origin: ['http://localhost:5173', 'https://chat-app-drab-delta-83.vercel.app/', "https://chat-p2p-guille.vercel.app" , "https://chat-p2p-goje.vercel.app"],
    methods: ['GET', 'POST']
  }
});

const channels = {
  general: { history: [], fileHistory: [], coordinator: null },
  auxiliar: { history: [], fileHistory: [], coordinator: null }
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
    console.log(`User ${socket.id} setting username to ${username}`);
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

  // // Channel handling
  // socket.on('joinChannel', (channelName) => {
  //   console.log(`User ${socket.id} joining channel ${channelName}`);
  //   if (!channels[channelName]) return;

  //   // Leave previous channels
  //   users.get(socket.id)?.channels.forEach(ch => {
  //     socket.leave(ch);
  //   });
    
  //   // Join new channel
  //   const username = users.get(socket.id)?.username;
  //   users.get(socket.id).channels = new Set([channelName]);
  //   socket.join(channelName);

  //   // Inform channel about new user
  //   const joinMsg = `[System] ${username} se ha unido a #${channelName}`;
  //   // Añadir al inicio del historial
  //   channels[channelName].history.unshift(joinMsg);
  //   io.to(channelName).emit('new-message', joinMsg, true); // true indica mensaje nuevo al inicio

  //   // Assign coordinator if needed
  //   if (!channels[channelName].coordinator) {
  //     channels[channelName].coordinator = socket.id;
  //     socket.emit('coordinator-status', true);
  //   }

  //   // Send channel history (ahora ya viene en orden inverso)
  //   socket.emit('history', channels[channelName].history);
    
  //   // Enviar explícitamente el historial de archivos al unirse al canal
  //   console.log(`Sending file history to user ${socket.id}, channel ${channelName}, ${channels[channelName].fileHistory.length} files`);
  //   socket.emit('file-history', channels[channelName].fileHistory);
  // });
  socket.on('joinChannel', (channelName) => {
  console.log(`User ${socket.id} joining channel ${channelName}`);
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
  channels[channelName].history.unshift(joinMsg);
  io.to(channelName).emit('new-message', joinMsg, true);

  // Assign coordinator if needed
  if (!channels[channelName].coordinator) {
    channels[channelName].coordinator = socket.id;
    socket.emit('coordinator-status', true);
    console.log(`User ${socket.id} assigned as coordinator for ${channelName}`);
  }

  // Send full channel history (messages and files)
  socket.emit('full-history', {
    messages: channels[channelName].history,
    files: channels[channelName].fileHistory
  });
});

  // Manejar solicitud explícita de historial de archivos
  socket.on('getFileHistory', (channelName) => {
    console.log(`User ${socket.id} requesting file history for channel ${channelName}`);
    if (channels[channelName]) {
      console.log(`Sending ${channels[channelName].fileHistory.length} files in history to user ${socket.id}`);
      socket.emit('file-history', channels[channelName].fileHistory);
    }
  });

  // Message handling
  socket.on('message', ({ message, channel, file }) => {
    const username = users.get(socket.id)?.username;
    let formattedMessage = message;
    
    console.log(`Message from ${username} in channel ${channel}, has file: ${!!file}`);
    
    // We need to handle file specifically
    if (file) {
      console.log(`File received: ${file.name}, size: ${file.size}, data length: ${file.data ? file.data.length : 'undefined'}`);
      
      // Asegurarse de que el archivo tenga datos válidos antes de procesarlo
      if (!file.data) {
        console.error('No file data received');
        socket.emit('error', { message: 'No file data received' });
        return;
      }
      
      // Crear el objeto de archivo con los datos recibidos
      const fileData = {
        name: file.name,
        size: file.size,
        data: file.data, // Usar directamente los datos tal como vienen
        sender: username,
        timestamp: new Date().toISOString(),
        channel: channel
      };
      
      // Store file info in history
      const fileMessage = `[${channel}] [${username}]: ${formattedMessage} [Archivo ${file.name}]`;
      // Añadir al inicio del historial
      channels[channel].history.unshift(fileMessage);

      // Guardar el archivo en el historial de archivos del canal
      channels[channel].fileHistory.push(fileData);
      
      // Send file to all clients in the channel
      console.log(`Broadcasting new file to channel ${channel}`);
      io.to(channel).emit('new-file', fileData);
      io.to(channel).emit('new-message', fileMessage, true); // true indica mensaje nuevo al inicio
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

  // Agregar manejador para limpiar el historial
  socket.on('clearHistory', (channelName) => {
    console.log(`Clearing history for channel ${channelName}`);
    if (channels[channelName]) {
      channels[channelName].history = [];
      channels[channelName].fileHistory = [];
      io.to(channelName).emit('history', []);
      io.to(channelName).emit('file-history', []);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const username = users.get(socket.id)?.username;
    console.log(`User ${socket.id} (${username}) disconnected`);
    
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
          console.log(`New coordinator for channel ${name}: ${channel.coordinator}`);
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

// Agregar manejo de errores para el servidor
server.on('error', (error) => {
  console.error('Server error:', error);
});