import express from 'express';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import http from 'http';

const app = express();
const server = http.createServer(app);
app.use(cors());

const io = new SocketServer(server, {
    cors:{
        origin: ['http://localhost:5173', "https://chat-app-drab-delta-83.vercel.app"],
        methods: ['GET', 'POST'],
    }
});





const peers = {};
const messageHistory = []; // Almacena todos los mensajes del chat

const getNewCoordinator = () => {
    const peerIds = Object.keys(peers);
    if( peerIds.length === 0) return null;

    return peerIds.sort()[0];
    //const minorId = [...peerIds].sort()[0];
   // return minorId;
}

const updateCoordinator = () => {
    const newCoordinatorId = getNewCoordinator();

    //Actualizar estado de coordinador de todos los peers
    Object.keys(peers).forEach(id => {
        peers[id].isCoordinator = id === newCoordinatorId;
    })

    //NOtificar a todos los clientes sobre el nuevo coordinador
    io.emit('coordinator', newCoordinatorId);
    io.emit('peers-list', Object.values(peers))
}


io.on('connection', (socket) => {
    console.log('New client connected', socket.id)

    //Registrar nuevo peer
    peers[socket.id] = {
        id: socket.id,
        isCoordinator: false,
        timestamp: Date.now()
    }
  // Enviar historial de mensajes al nuevo usuario
  socket.emit('message-history', messageHistory); // 📜 Envía todo el historial
  
  // Enviar lista de peers actualizada
  socket.emit('peer-list', Object.values(peers));

    //Actualizar coordinador
    updateCoordinator();

    socket.on('send-message', (message) => {
        const messageData = {
          sender: socket.id,
          text: message.text,
          timestamp: Date.now(),
        };
    
        messageHistory.push(messageData); // Guardar en historial
        io.emit('new-message', messageData); // Transmitir a todos
      });

    //Enviar señales entre pares
    socket.on('signal', ({to, data}) => {
        if (peers[to]) io.to(to).emit('signal', { from: socket.id, data })
    })

    socket.on('disconnect', () => {
        console.log('Client disconnected', socket.id)
        delete peers[socket.id];
        updateCoordinator();
    })

    // //OPCIONAL: MANEJAR MENSAJES DE CHAT(si decido mantener algun mensaje en el servidor)
    // socket.on('chat-message', (message) => {
    //     //Registrar mensaje si el servidor los almacena temporalmente
    //     io.emit('chat-message', {
    //         from: socket.id,
    //         message: message,
    //         timestamp: Date.now()
    //     })
    // })
})

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log('Server listening on port', PORT);
});
console.log('Server running on port', PORT);