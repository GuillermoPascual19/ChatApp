import express from 'express';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import http from 'http';

const app = express();
const server = http.createServer(app);
app.use(cors());

const io = new SocketServer(server, {
    cors: {
        origin: ['http://localhost:5173', "https://chat-app-drab-delta-83.vercel.app"],
        methods: ['GET', 'POST'],
    }
});

// Estructura para almacenar información por canal
const channels = {};

const getNewCoordinator = (channel) => {
    const peerIds = Object.keys(channels[channel]?.peers || {});
    if (peerIds.length === 0) return null;
    return peerIds.sort()[0];
};

const updateCoordinator = (channel) => {
    const newCoordinatorId = getNewCoordinator(channel);
    
    if (!channels[channel]) return;
    
    // Actualizar estado de coordinador
    Object.keys(channels[channel].peers).forEach(id => {
        channels[channel].peers[id].isCoordinator = id === newCoordinatorId;
    });

    // Notificar a los clientes del canal
    io.to(channel).emit('peer-list', {
        peers: Object.values(channels[channel].peers),
        coordinator: newCoordinatorId
    });
};

io.on('connection', (socket) => {
    console.log('New client connected', socket.id);
    
    let currentChannel = '';

    socket.on('join-channel', (channel) => {
        // Salir del canal anterior si existe
        if (currentChannel) {
            socket.leave(currentChannel);
            delete channels[currentChannel].peers[socket.id];
            if (Object.keys(channels[currentChannel].peers).length === 0) {
                delete channels[currentChannel];
            } else {
                updateCoordinator(currentChannel);
            }
        }
        
        // Unirse al nuevo canal
        currentChannel = channel;
        socket.join(channel);
        
        // Inicializar canal si no existe
        if (!channels[channel]) {
            channels[channel] = {
                peers: {},
                messageHistory: []
            };
        }
        
        // Registrar nuevo peer
        channels[channel].peers[socket.id] = {
            id: socket.id,
            isCoordinator: false
        };
        
        // Actualizar coordinador
        updateCoordinator(channel);
        
        // Enviar información inicial al cliente
        socket.emit('channel-info', {
            peers: Object.values(channels[channel].peers),
            coordinator: getNewCoordinator(channel),
            history: channels[channel].messageHistory
        });
    });

    // Señalización WebRTC
    socket.on('signal', ({ to, data }) => {
        if (channels[currentChannel]?.peers[to]) {
            io.to(to).emit('signal', { from: socket.id, data });
        }
    });

    // Guardar mensaje en el historial (solo si viene del coordinador)
    socket.on('save-message', (message) => {
        if (channels[currentChannel]?.peers[socket.id]?.isCoordinator) {
            channels[currentChannel].messageHistory.push(message);
        }
    });

    socket.on('disconnect', () => {
        if (currentChannel && channels[currentChannel]) {
            delete channels[currentChannel].peers[socket.id];
            if (Object.keys(channels[currentChannel].peers).length === 0) {
                delete channels[currentChannel];
            } else {
                updateCoordinator(currentChannel);
            }
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log('Server listening on port', PORT);
});