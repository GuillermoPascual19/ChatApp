import express from 'express';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.use(cors());
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
    origin: ['http://localhost:5173', 'https://chat-app-drab-delta-83.vercel.app/', "https://chat-p2p-guille.vercel.app", "https://chat-p2p-goje.vercel.app"],
    methods: ['GET', 'POST']
  }
});

const channels = {
  general: { history: [], fileHistory: [], coordinator: null },
  auxiliar: { history: [], fileHistory: [], coordinator: null }
};

const users = new Map();

// Función para guardar un archivo en la carpeta temporal
function saveFile(fileData, channel, sender, originalFilename) {
  // Crear una carpeta para el canal si no existe
  const channelDir = path.join(tempDir, channel);
  if (!fs.existsSync(channelDir)) {
    fs.mkdirSync(channelDir, { recursive: true });
  }

  // Extraer la parte de datos del Base64 (quitar el prefijo)
  const matches = fileData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  
  if (!matches || matches.length !== 3) {
    console.error('Formato de datos inválido');
    return null;
  }
  
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');
  
  // Crear un nombre de archivo único con timestamp
  const timestamp = Date.now();
  // Sanitizar el nombre del archivo para evitar problemas
  const sanitizedName = originalFilename ? originalFilename.replace(/[^a-zA-Z0-9.]/g, '_') : `file_${timestamp}`;
  const safeFilename = `${timestamp}_${sanitizedName}`;
  const filePath = path.join(channelDir, safeFilename);

  // Guardar el archivo
  fs.writeFileSync(filePath, buffer);
  console.log(`Archivo guardado en: ${filePath}`);
  
  // Determinar el tipo MIME basado en la extensión
  const ext = path.extname(sanitizedName).toLowerCase();
  let mimeType = 'application/octet-stream'; // Tipo por defecto
  
  // Mapeo simple de extensiones comunes
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  
  if (mimeTypes[ext]) {
    mimeType = mimeTypes[ext];
  }
  
  return {
    filename: safeFilename,
    originalName: sanitizedName,
    path: filePath,
    relativePath: path.join(channel, safeFilename),
    mimeType: mimeType
  };
}

// Actualizar la función loadFilesFromDisk para cargar correctamente los archivos
function loadFilesFromDisk() {
  if (!fs.existsSync(tempDir)) return;

  const channelDirs = fs.readdirSync(tempDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  console.log(`Encontrados ${channelDirs.length} canales con archivos: ${channelDirs.join(', ')}`);
  
  channelDirs.forEach(channelName => {
    if (!channels[channelName]) {
      channels[channelName] = { history: [], fileHistory: [], coordinator: null };
    }
    
    const channelDir = path.join(tempDir, channelName);
    const files = fs.readdirSync(channelDir);
    
    console.log(`Canal ${channelName}: ${files.length} archivos encontrados`);
    
    files.forEach(filename => {
      const filePath = path.join(channelDir, filename);
      const stats = fs.statSync(filePath);
      
      if (stats.isFile()) {
        const fileBuffer = fs.readFileSync(filePath);
        
        // Determinar el tipo MIME basado en la extensión
        const ext = path.extname(filename).toLowerCase();
        let mimeType = 'application/octet-stream'; // Tipo por defecto
        
        // Mapeo simple de extensiones comunes
        const mimeTypes = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.pdf': 'application/pdf',
          '.txt': 'text/plain',
          '.doc': 'application/msword',
          '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        };
        
        if (mimeTypes[ext]) {
          mimeType = mimeTypes[ext];
        }
        
        // Crear data URI para frontend
        const base64Data = fileBuffer.toString('base64');
        const dataUri = `data:${mimeType};base64,${base64Data}`;
        
        // Extraer información del nombre del archivo (timestamp_nombreoriginal)
        const filenameParts = filename.split('_');
        const timestamp = filenameParts[0];
        const originalName = filenameParts.slice(1).join('_');
        
        // Añadir al historial de archivos
        channels[channelName].fileHistory.push({
          name: originalName,
          data: dataUri,
          sender: 'Sistema',
          timestamp: new Date(parseInt(timestamp)).toISOString(),
          channel: channelName,
          filepath: path.join(channelName, filename)
        });
        
        console.log(`Cargado archivo: ${filename} para el canal ${channelName}`);
      }
    });
    
    console.log(`Canal ${channelName}: ${channels[channelName].fileHistory.length} archivos cargados en memoria`);
  });
  
  console.log('Archivos cargados desde el disco correctamente');
}

// Cargar archivos existentes al iniciar
loadFilesFromDisk();

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
        // Añadir al historial
        channels[channelName].history.unshift(systemMsg);
        io.to(channelName).emit('new-message', systemMsg, true);
      });
    }
  });

  // Channel handling
  socket.on('joinChannel', (channelName) => {
    console.log(`User ${socket.id} joining channel ${channelName}`);
    if (!channels[channelName]) {
      channels[channelName] = { history: [], fileHistory: [], coordinator: null };
      
      // Crear directorio para el canal si no existe
      const channelDir = path.join(tempDir, channelName);
      if (!fs.existsSync(channelDir)) {
        fs.mkdirSync(channelDir, { recursive: true });
      }
    }

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
    // Añadir al historial
    channels[channelName].history.unshift(joinMsg);
    io.to(channelName).emit('new-message', joinMsg, true);

    // Assign coordinator if needed
    if (!channels[channelName].coordinator) {
      channels[channelName].coordinator = socket.id;
      socket.emit('coordinator-status', true);
    }

    // Send channel history
    socket.emit('history', channels[channelName].history);
    
    // Enviar historial de archivos al unirse al canal
    console.log(`Sending file history to user ${socket.id}, channel ${channelName}, ${channels[channelName].fileHistory.length} files`);
    socket.emit('file-history', channels[channelName].fileHistory);
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
    console.log(`File received from ${username} in channel ${channel}`);
    
    try {
      // Parse the message to get file name
      const messageObj = JSON.parse(formattedMessage);
      let fileName = `file_${Date.now()}`;
      
      // Si el mensaje tiene info del archivo, usamos ese nombre
      if (messageObj.filename) {
        fileName = messageObj.filename;
      }
      
      // Guardar archivo en disco
      const fileInfo = saveFile(file, channel, username, fileName);
      
      if (fileInfo) {
        // Crear objeto de archivo para el historial
        const fileData = {
          name: fileInfo.originalName,
          data: file, // Mantener la versión base64 para el frontend
          sender: username,
          timestamp: new Date().toISOString(),
          channel: channel,
          filepath: fileInfo.relativePath
        };
        
        // Store file info in history
        const fileMessage = `[${channel}] [${username}]: ${messageObj.text} [Archivo ${fileInfo.originalName}]`;
        channels[channel].history.unshift(fileMessage);

        // Guardar el archivo en el historial de archivos del canal
        channels[channel].fileHistory.push(fileData);
        
        // Send file to all clients in the channel
        console.log(`Broadcasting new file to channel ${channel}`);
        io.to(channel).emit('new-file', fileData);
        io.to(channel).emit('new-message', fileMessage, true);
      } else {
        console.error('Error al guardar el archivo');
        socket.emit('error', { message: 'Error al guardar el archivo' });
      }
    } catch (error) {
      console.error('Error processing file:', error);
      socket.emit('error', { message: 'Error processing file' });
    }
  } else {
    // Regular text message
    channels[channel].history.unshift(formattedMessage);
    if (channels[channel].history.length > 100) {
      channels[channel].history.pop(); // Eliminar el mensaje más antiguo
    }
    
    io.to(channel).emit('new-message', formattedMessage, true);
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
      
      // También eliminar archivos físicos del canal
      const channelDir = path.join(tempDir, channelName);
      if (fs.existsSync(channelDir)) {
        try {
          // Eliminar todos los archivos en el directorio
          const files = fs.readdirSync(channelDir);
          files.forEach(file => {
            fs.unlinkSync(path.join(channelDir, file));
          });
          console.log(`Archivos físicos eliminados para el canal ${channelName}`);
        } catch (err) {
          console.error(`Error al eliminar archivos físicos: ${err}`);
        }
      }
      
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
        channels[channelName].history.unshift(leaveMsg);
        io.to(channelName).emit('new-message', leaveMsg, true);
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

// Ruta para servir archivos estáticos desde la carpeta temp
app.use('/files', express.static(tempDir));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Agregar manejo de errores para el servidor
server.on('error', (error) => {
  console.error('Server error:', error);
});