import express from 'express';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import http from 'http';

// Configuración del servidor Express
const app = express();
app.use(cors({
  origin: ['http://localhost:5173', 'https://chat-app-drab-delta-83.vercel.app'],
  methods: ['GET', 'POST'],
  credentials: true
}));

// Crear el servidor HTTP
const server = http.createServer(app);

// Configuración de Socket.io con límite aumentado para transferencia de archivos
const io = new SocketServer(server, {
  cors:{
    origin: ['http://localhost:5173', 'https://chat-app-drab-delta-83.vercel.app'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  maxHttpBufferSize: 2 * 1024 * 1024 // 2MB para archivos
});

// Estado global
const users = {}; // Almacenar usuarios conectados
let coordinator = null; // ID del coordinador actual
const chatHistory = {
  general: [],    // Canal general
  tecnico: [],    // Canal técnico
  soporte: []     // Canal de soporte
};

// Función para elegir nuevo coordinador
function selectNewCoordinator() {
  const userIds = Object.keys(users);
  if (userIds.length > 0) {
    coordinator = userIds[0]; // Seleccionar el primer usuario disponible
    console.log('Nuevo coordinador seleccionado:', coordinator);
    io.to(coordinator).emit('become-coordinator', chatHistory);
    io.emit('coordinator-changed', coordinator);
    return true;
  }
  return false;
}

// Ruta principal (opcional)
app.get('/', (req, res) => {
  res.send('Servidor de señalización P2P funcionando');
});

// Gestión de conexiones Socket.io
io.on('connection', (socket) => {
  console.log('Nuevo cliente conectado:', socket.id);

  // Registrar el usuario
  users[socket.id] = {
    id: socket.id,
    socket: socket
  };
  
  // Enviar su ID al cliente recién conectado
  socket.emit('Id', socket.id);
  
  // Si es el primer usuario, hacerlo coordinador
  if (!coordinator) {
    coordinator = socket.id;
    socket.emit('become-coordinator', chatHistory);
    console.log('Primer coordinador seleccionado:', coordinator);
  } else {
    // Solicitar historial al coordinador actual
    io.to(coordinator).emit('request-history', socket.id);
  }
  
  // Informar al cliente de todos los usuarios existentes
  socket.emit('all-users', Object.keys(users).filter(id => id !== socket.id));
  socket.emit('coordinator-info', coordinator);
  
  // Informar a los demás sobre el nuevo usuario
  socket.broadcast.emit('user-joined', {
    signal: null,
    callerID: socket.id
  });

  // Manejar señales WebRTC
  socket.on('sendSignal', payload => {
    if (users[payload.userToSignal]) {
      io.to(payload.userToSignal).emit('user-joined', {
        signal: payload.signal,
        callerID: payload.callerID
      });
    } else {
      socket.emit('user-unavailable', payload.userToSignal);
    }
  });

  // Manejar señales de retorno WebRTC
  socket.on('returnSignal', payload => {
    if (users[payload.callerID]) {
      io.to(payload.callerID).emit('receivingReturnSignal', {
        signal: payload.signal,
        id: socket.id
      });
    }
  });

  // El coordinador envía el historial a un nuevo usuario
  socket.on('send-history-to-user', ({ targetId, history }) => {
    if (socket.id === coordinator && users[targetId]) {
      io.to(targetId).emit('receive-history', history);
    }
  });

  // Manejar mensajes por canal
  socket.on('channel-message', ({ channel, message, sender, timestamp }) => {
    // Validar canal
    if (!['general', 'tecnico', 'soporte'].includes(channel)) {
      return;
    }
    
    const messageObj = {
      sender,
      message,
      timestamp,
      type: 'text'
    };
    
    // Enviar a todos
    socket.broadcast.emit('channel-message', { channel, messageObj });
    
    // Actualizar historial (solo el coordinador lo guarda)
    if (coordinator === socket.id) {
      chatHistory[channel].push(messageObj);
      
      // Mantener historial a un tamaño razonable
      if (chatHistory[channel].length > 200) {
        chatHistory[channel].shift();
      }
    }
  });

  // Manejar archivos por canal
  socket.on('channel-file', ({ channel, file, filename, fileType, sender, timestamp }) => {
    // Validar canal y tamaño del archivo
    if (!['general', 'tecnico', 'soporte'].includes(channel) || file.length > 2 * 1024 * 1024) {
      return;
    }
    
    const fileObj = {
      sender,
      filename,
      fileType,
      file, // Buffer o Base64
      timestamp,
      type: 'file'
    };
    
    // Enviar a todos
    socket.broadcast.emit('channel-file', { channel, fileObj });
    
    // Actualizar historial (solo el coordinador lo guarda)
    if (coordinator === socket.id) {
      chatHistory[channel].push({
        sender,
        filename,
        fileType,
        file,
        timestamp,
        type: 'file'
      });
      
      // Mantener historial a un tamaño razonable
      if (chatHistory[channel].length > 100) {
        chatHistory[channel].shift();
      }
    }
  });

  // Manejar desconexiones
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
    
    // Si era el coordinador, elegir uno nuevo
    if (socket.id === coordinator) {
      const selected = selectNewCoordinator();
      if (!selected) {
        coordinator = null;
        console.log('No hay usuarios disponibles para ser coordinador');
      }
    }
    
    // Eliminar usuario
    delete users[socket.id];
    
    // Notificar a otros usuarios
    io.emit('user-disconnected', socket.id);
  });
});

// Determinar el puerto
const PORT = process.env.PORT || 5000;

// Iniciar el servidor
server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});