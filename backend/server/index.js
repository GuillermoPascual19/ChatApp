import express from 'express';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import http from 'http';

const app = express();
app.use(cors());
const server = http.createServer(app);

// Configuración básica para el servidor express
app.get('/', (req, res) => {
    res.send('Servidor de chat P2P funcionando correctamente');
});

const io = new SocketServer(server, {
    cors:{
        // Añade aquí todos los orígenes permitidos
        origin: ['http://localhost:5173', 'https://chat-app-drab-delta-83.vercel.app'],
        methods: ['GET', 'POST'],
    }
});

// Almacenar usuarios conectados
const users = {};

io.on('connection', (socket) => {
    console.log('Nuevo cliente conectado:', socket.id);

    // Registrar el nuevo usuario
    users[socket.id] = socket;
    
    // Enviar ID al usuario recién conectado
    socket.emit('Id', socket.id);
    
    // Notificar a los demás usuarios sobre el nuevo usuario
    socket.broadcast.emit('all-users', Object.keys(users).filter(id => id !== socket.id));
    
    // Emitir la lista de usuarios existentes al nuevo usuario
    socket.emit('all-users', Object.keys(users).filter(id => id !== socket.id));

    // Manejar señales para establecer conexiones P2P
    socket.on('sendSignal', payload => {
        if (users[payload.userToSignal]) {
            io.to(payload.userToSignal).emit('user-joined', {
                signal: payload.signal,
                callerID: payload.callerID
            });
        }
    });

    socket.on('returnSignal', payload => {
        if (users[payload.callerID]) {
            io.to(payload.callerID).emit('receivingReturnSignal', {
                signal: payload.signal,
                id: socket.id
            });
        }
    });

    // Manejar desconexión
    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
        delete users[socket.id];
        
        // Notificar a los demás usuarios que este usuario se desconectó
        io.emit('user-disconnected', socket.id);
    });
});

// Configuración del puerto para producción o desarrollo
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});