import express from 'express';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import http from 'http';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new SocketServer(server, {
  cors: {
    origin: ['http://localhost:5173', 'https://chat-app-drab-delta-83.vercel.app/', 'https://chat-p2p-guille.vercel.app', 'https://chat-p2p-goje.vercel.app/'],
    methods: ['GET', 'POST']
  }
});

// Directorio para persistencia de datos
const DATA_DIR = path.join(process.cwd(), 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// Crear directorio si no existe
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Inicializar o cargar datos existentes
let channelsData = {
  general: { history: [], fileHistory: [], coordinator: null },
  auxiliar: { history: [], fileHistory: [], coordinator: null }
};

// Cargar historial si existe
if (fs.existsSync(HISTORY_FILE)) {
  try {
    const data = fs.readFileSync(HISTORY_FILE, 'utf8');
    channelsData = JSON.parse(data);
    console.log('Historial cargado correctamente');
  } catch (error) {
    console.error('Error al cargar el historial:', error);
  }
}

// Función para guardar el historial en disco
function saveHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(channelsData), 'utf8');
  } catch (error) {
    console.error('Error al guardar el historial:', error);
  }
}

// Usar los datos cargados o inicializados
const channels = channelsData;
const users = new Map();

// Función para ayudar con el debugging
function logWithData(message, data) {
  console.log(message, typeof data === 'object' ? JSON.stringify(data).substring(0, 100) + '...' : data);
}

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
      
      // Guardar cambios en el historial
      saveHistory();
    }
  });

  // Channel handling
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
    
    // MODIFICADO: Enviar explícitamente el historial de archivos al unirse al canal
    console.log(`Sending file history to user ${socket.id}, channel ${channelName}, ${channels[channelName].fileHistory.length} files`);
    if (channels[channelName].fileHistory && channels[channelName].fileHistory.length > 0) {
      socket.emit('file-history', channels[channelName].fileHistory);
    }
    
    // Guardar cambios en el historial
    saveHistory();
  });

  // Manejar solicitud explícita de historial de archivos
  socket.on('getFileHistory', (channelName) => {
    console.log(`User ${socket.id} requesting file history for channel ${channelName}`);
    if (channels[channelName] && channels[channelName].fileHistory) {
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
      // MODIFICADO: Asegurarnos de que el arreglo fileHistory existe
      if (!channels[channel].fileHistory) {
        channels[channel].fileHistory = [];
      }
      channels[channel].fileHistory.push(fileData);
      
      // Send file to all clients in the channel
      console.log(`Broadcasting new file to channel ${channel}`);
      io.to(channel).emit('new-file', fileData);
      io.to(channel).emit('new-message', fileMessage, true); // true indica mensaje nuevo al inicio
      
      // Guardar cambios en el historial
      saveHistory();
    } else {
      // Regular text message
      // Añadir al inicio del historial
      channels[channel].history.unshift(formattedMessage);
      if (channels[channel].history.length > 100) {
        channels[channel].history.pop(); // Eliminar el mensaje más antiguo (ahora el último)
      }
      
      io.to(channel).emit('new-message', formattedMessage, true); // true indica mensaje nuevo al inicio
      
      // Guardar cambios en el historial
      saveHistory();
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
      
      // Guardar cambios en el historial
      saveHistory();
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
    
    // Guardar cambios en el historial
    saveHistory();
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