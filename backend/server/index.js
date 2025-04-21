import express from 'express';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import http from 'http';

const app = express();
const server = http.createServer(app);

const io = new SocketServer(server, {
    cors:{
        origin: ['http://localhost:5173', "https://chat-app-drab-delta-83.vercel.app/"],
        methods: ['GET', 'POST'],
    }
});

io.on('connection', (socket) => {
    console.log('New client connected', socket.id)

    socket.on('message', (body) => {
        console.log('Message received:', body)
        //socket.broadcast.emit('message', msg)
        io.emit('message', {
            body,
            from: socket.id.slice(6), //SIX ELEMENTS OF THE SOCKET ID
        })
    })

    socket.on('disconnect', () => {
        console.log('Client disconnected', socket.id)
    })
})

const PORT = 5000;

server.listen(PORT, () => {
    console.log('Server listening on port', PORT);
});
console.log('Server running on port', PORT);