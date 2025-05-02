import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';

const Home = () => {
    const [message, setMessage] = useState('');
    const [chat, setChat] = useState<string[]>([]);
    const [myID, setMyID] = useState('');
    const [peers, setPeers] = useState<any[]>([]);
    const peersRef = useRef<any[]>([]);
    const socketRef = useRef<any>(null);

    useEffect(() => {
        // Crear una sola instancia de socket
        socketRef.current = io('https://chatapp-87po.onrender.com', {
            transports: ['websocket']
        });

        // Configurar los listeners del socket
        socketRef.current.on('Id', (id: string) => {
            setMyID(id);
            console.log('My Id is: ', id);
        });

        socketRef.current.on('all-users', (users: string[]) => {
            const peers = users.map((userID: string) => {
                const peer = createPeer(userID, socketRef.current.id);
                peersRef.current.push({ peerID: userID, peer });
                return peer;
            });
            setPeers(peers);
        });

        socketRef.current.on('user-joined', (payload: any) => {
            const peer = addPeer(payload.signal, payload.callerID);
            peersRef.current.push({ peerID: payload.callerID, peer });
            setPeers(prevPeers => [...prevPeers, peer]);
        });

        socketRef.current.on('receivingReturnSignal', (payload: any) => {
            const item = peersRef.current.find(p => p.peerID === payload.id);
            if (item) {
                item.peer.signal(payload.signal);
            }
        });

        // Limpiar los listeners cuando el componente se desmonte
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
            peersRef.current.forEach(({ peer }) => {
                peer.destroy();
            });
        };
    }, []);

    function createPeer(userToSignal: string, callerID: string) {
        const peer = new Peer({ initiator: true, trickle: false });
        
        peer.on('signal', (signal: any) => {
            socketRef.current.emit('sendSignal', { userToSignal, callerID, signal });
        });

        peer.on('data', (data: any) => {
            const messageReceived = new TextDecoder().decode(data);
            setChat(prev => [...prev, `[${userToSignal}]: ${messageReceived}`]);
        });

        return peer;
    }

    function addPeer(incomingSignal: any, callerID: string) {
        const peer = new Peer({ initiator: false, trickle: false });
        
        peer.on('signal', (signal: any) => {
            socketRef.current.emit('returnSignal', { signal, callerID });
        });

        peer.on('data', (data: any) => {
            const messageReceived = new TextDecoder().decode(data);
            setChat(prev => [...prev, `[${callerID}]: ${messageReceived}`]);
        });

        peer.signal(incomingSignal);
        return peer;
    }

    const handleSendMessage = () => {
        if (!message.trim()) return;
        
        peersRef.current.forEach(({ peer }) => {
            peer.send(message);
        });

        setChat(prev => [...prev, `[Me]: ${message}`]);
        setMessage('');
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSendMessage();
        }
    };

    return (
        <div className="flex flex-col h-screen p-4 bg-gray-100">
            <h1 className="text-xl font-bold mb-2">Chat P2P (ID: {myID})</h1>
            <p className="text-sm mb-4">Usuarios conectados: {peers.length}</p>
            
            <div className="flex-1 overflow-y-auto mb-4 p-2 bg-white rounded shadow">
                {chat.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">
                        No hay mensajes aún. ¡Sé el primero en enviar algo!
                    </p>
                ) : (
                    chat.map((msg, index) => (
                        <div 
                            key={index} 
                            className={`p-2 my-1 rounded ${msg.includes('[Me]:') ? 'bg-blue-100 text-right' : 'bg-gray-200'}`}
                        >
                            {msg}
                        </div>
                    ))
                )}
            </div>
            
            <div className="flex items-center">
                <input 
                    type="text" 
                    placeholder="Escribe un mensaje..." 
                    className="border rounded p-2 w-full"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                />
                <button 
                    className="bg-blue-500 hover:bg-blue-600 text-white rounded p-2 ml-2"
                    onClick={handleSendMessage}
                    disabled={!message.trim()}
                >
                    Enviar
                </button>
            </div>
        </div>
    );
};

export default Home;