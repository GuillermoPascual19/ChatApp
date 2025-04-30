import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Paperclip } from 'lucide-react';

interface Message {
    from: string;
    body: string;
    timestamp: number;
    isHistory?: boolean;
    isFile?: boolean;
    fileData?: string;
    fileName?: string;
}

interface Peer {
    id: string;
    isCoordinator: boolean;
}

interface ChannelInfo {
    peers: Peer[];
    coordinator: string | null;
    history: Message[];
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

const Home = () => {
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [peers, setPeers] = useState<Peer[]>([]);
    const [myId, setMyId] = useState('');
    const [isCoordinator, setIsCoordinator] = useState(false);
    const [currentChannel, setCurrentChannel] = useState('general');
    const socketRef = useRef<Socket | null>(null);
    const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
    const dataChannels = useRef<Record<string, RTCDataChannel>>({});
    const coordinatorId = useRef<string | null>(null);

    // Configurar conexión WebRTC con otro peer
    const setupPeerConnection = useCallback((peerId: string) => {
        if (peerConnections.current[peerId] || peerId === myId) return;

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        });

        peerConnections.current[peerId] = pc;

        pc.onicecandidate = (event) => {
            if (event.candidate && socketRef.current) {
                socketRef.current.emit('signal', {
                    to: peerId,
                    data: { type: 'candidate', candidate: event.candidate }
                });
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`Connection state with ${peerId}:`, pc.connectionState);
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                cleanupPeerConnection(peerId);
            }
        };

        // El peer con ID más bajo crea el data channel
        if (myId < peerId) {
            const dc = pc.createDataChannel('chat');
            setupDataChannel(peerId, dc);
        } else {
            pc.ondatachannel = (event) => {
                setupDataChannel(peerId, event.channel);
            };
        }

        return pc;
    }, [myId]);

    // Configurar data channel
    const setupDataChannel = useCallback((peerId: string, dc: RTCDataChannel) => {
        dataChannels.current[peerId] = dc;

        dc.onopen = () => {
            console.log(`Data channel with ${peerId} opened`);
            // Si soy coordinador y es un nuevo peer, enviar historial
            if (isCoordinator && !messages.some(m => m.isHistory)) {
                dc.send(JSON.stringify({
                    type: 'history',
                    data: messages
                }));
            }
        };

        dc.onclose = () => {
            console.log(`Data channel with ${peerId} closed`);
            cleanupPeerConnection(peerId);
        };

        dc.onerror = (error) => {
            console.error(`Data channel error with ${peerId}:`, error);
            cleanupPeerConnection(peerId);
        };

        dc.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                handleReceivedMessage(peerId, msg);
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };
    }, [isCoordinator, messages]);

    // Limpiar conexión con un peer
    const cleanupPeerConnection = useCallback((peerId: string) => {
        if (peerConnections.current[peerId]) {
            peerConnections.current[peerId].close();
            delete peerConnections.current[peerId];
        }
        if (dataChannels.current[peerId]) {
            delete dataChannels.current[peerId];
        }
    }, []);

    // Manejar mensajes recibidos
    const handleReceivedMessage = useCallback((from: string, msg: any) => {
        switch (msg.type) {
            case 'message':
                const newMsg: Message = {
                    from,
                    body: msg.body,
                    timestamp: Date.now()
                };
                setMessages(prev => [...prev, newMsg]);
                // Si soy coordinador, guardar el mensaje
                if (isCoordinator && socketRef.current) {
                    socketRef.current.emit('save-message', newMsg);
                }
                break;
                
            case 'file':
                setMessages(prev => [...prev, {
                    from,
                    body: '', // Ensure 'body' is included
                    isFile: true,
                    fileData: msg.data,
                    fileName: msg.fileName,
                    timestamp: Date.now()
                }]);
                if (isCoordinator && socketRef.current) {
                    socketRef.current.emit('save-message', {
                        from,
                        isFile: true,
                        fileData: msg.data,
                        fileName: msg.fileName,
                        timestamp: Date.now()
                    });
                }
                break;
                
            case 'history':
                setMessages(prev => [
                    ...msg.data.map((m: Message) => ({ ...m, isHistory: true })),
                    ...prev.filter(m => !m.isHistory)
                ]);
                break;
                
            case 'request-history':
                if (isCoordinator && dataChannels.current[from]?.readyState === 'open') {
                    dataChannels.current[from].send(JSON.stringify({
                        type: 'history',
                        data: messages
                    }));
                }
                break;
        }
    }, [isCoordinator, messages]);

    // Enviar mensaje a todos los peers
    const sendToAllPeers = useCallback((message: any) => {
        Object.entries(dataChannels.current).forEach(([peerId, dc]) => {
            if (dc.readyState === 'open') {
                try {
                    dc.send(JSON.stringify(message));
                } catch (error) {
                    console.error(`Error sending to ${peerId}:`, error);
                }
            }
        });
    }, []);

    // Manejar envío de mensaje
    const handleSendMessage = useCallback(() => {
        if (!message.trim()) return;

        const newMsg = {
            from: myId,
            body: message,
            timestamp: Date.now()
        };

        sendToAllPeers({
            type: 'message',
            body: message
        });

        setMessages(prev => [...prev, newMsg]);
        
        // Si soy coordinador, guardar el mensaje
        if (isCoordinator && socketRef.current) {
            socketRef.current.emit('save-message', newMsg);
        }

        setMessage('');
    }, [message, myId, isCoordinator, sendToAllPeers]);

    // Manejar envío de archivo
    const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = ''; // Reset input

        if (file.size > MAX_FILE_SIZE) {
            alert('File size exceeds 2MB limit');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const fileData = event.target?.result as string;
            const fileMsg = {
                from: myId,
                isFile: true,
                fileData,
                fileName: file.name,
                timestamp: Date.now()
            };

            sendToAllPeers({
                type: 'file',
                data: fileData,
                fileName: file.name
            });
            setMessages(prev => [...prev, { ...fileMsg, body: '' }]);
            
            // Si soy coordinador, guardar el archivo
            if (isCoordinator && socketRef.current) {
                socketRef.current.emit('save-message', fileMsg);
            }
        };
        reader.readAsDataURL(file);
    }, [myId, isCoordinator, sendToAllPeers]);

    // Cambiar de canal
    const handleChangeChannel = useCallback((channel: string) => {
        if (channel === currentChannel) return;

        // Limpiar conexiones anteriores
        Object.keys(peerConnections.current).forEach(cleanupPeerConnection);
        peerConnections.current = {};
        dataChannels.current = {};

        // Unirse al nuevo canal
        setCurrentChannel(channel);
        setMessages([]);
        socketRef.current?.emit('join-channel', channel);
    }, [currentChannel, cleanupPeerConnection]);

    // Efecto para configurar Socket.io
    useEffect(() => {
        const socket = io('https://chatapp-87po.onrender.com', {
            transports: ['websocket'],
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('Connected to server');
            setMyId(socket.id || '');
            socket.emit('join-channel', currentChannel);
        });

        socket.on('channel-info', ({ peers: peerList, coordinator, history }: ChannelInfo) => {
            setPeers(peerList);
            coordinatorId.current = coordinator;
            setIsCoordinator(coordinator === socket.id);
            
            // Establecer conexiones con todos los peers
            peerList.forEach(peer => {
                if (peer.id !== socket.id) {
                    setupPeerConnection(peer.id);
                }
            });

            // Cargar historial si existe
            if (history.length > 0) {
                setMessages(history.map(msg => ({ ...msg, isHistory: true })));
            }
        });

        socket.on('signal', ({ from, data }) => {
            if (!peerConnections.current[from]) {
                setupPeerConnection(from);
            }

            const pc = peerConnections.current[from];
            if (!pc) return;

            try {
                if (data.type === 'offer') {
                    pc.setRemoteDescription(new RTCSessionDescription(data))
                        .then(() => pc.createAnswer())
                        .then(answer => pc.setLocalDescription(answer))
                        .then(() => {
                            if (socketRef.current && pc.localDescription) {
                                socketRef.current.emit('signal', {
                                    to: from,
                                    data: pc.localDescription
                                });
                            }
                        })
                        .catch(console.error);
                } else if (data.type === 'answer') {
                    pc.setRemoteDescription(new RTCSessionDescription(data))
                        .catch(console.error);
                } else if (data.type === 'candidate') {
                    pc.addIceCandidate(new RTCIceCandidate(data.candidate))
                        .catch(console.error);
                }
            } catch (error) {
                console.error('Error processing signal:', error);
            }
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });

        return () => {
            socket.disconnect();
            Object.values(peerConnections.current).forEach(pc => pc.close());
        };
    }, [currentChannel, setupPeerConnection]);

    return (
        <div className="flex h-screen bg-gray-100">
            {/* Sidebar */}
            <div className="w-64 border-r bg-white p-4 overflow-y-auto">
                <h3 className="font-bold text-lg mb-4">Channels</h3>
                <div className="space-y-2 mb-6">
                    {['general', 'random', 'help'].map(channel => (
                        <div
                            key={channel}
                            className={`p-2 rounded cursor-pointer ${
                                currentChannel === channel ? 'bg-blue-100' : 'hover:bg-gray-100'
                            }`}
                            onClick={() => handleChangeChannel(channel)}
                        >
                            {channel}
                        </div>
                    ))}
                </div>
                <h3 className="font-bold text-lg mb-4">Connected Peers ({peers.length})</h3>
                <ul className="space-y-2">
                    {peers.map(peer => (
                        <li
                            key={peer.id}
                            className={`p-2 rounded ${
                                peer.isCoordinator ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                            }`}
                        >
                            <div className="truncate">{peer.id}</div>
                            {peer.isCoordinator && (
                                <div className="text-xs text-green-600">Coordinator</div>
                            )}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Main chat area */}
            <div className="flex-1 flex flex-col">
                <div className="p-4 border-b">
                    <span className="font-bold">Channel: {currentChannel}</span>
                    <span className="font-bold ml-4">Your ID: {myId}</span>
                    {isCoordinator && (
                        <span className="ml-2 bg-green-500 text-white px-2 py-1 rounded text-sm">
                            Coordinator
                        </span>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 flex justify-center">
                    <div className="w-full max-w-2xl space-y-2">
                        {messages.map((msg, index) => (
                            <div
                                key={index}
                                className={`p-3 rounded-lg ${
                                    msg.from === myId ? 'bg-green-50 ml-8' : 'bg-blue-50 mr-8'
                                } shadow-sm`}
                            >
                                <div className="font-semibold text-sm">
                                    {msg.from === myId ? 'You' : msg.from}
                                    {msg.isHistory && (
                                        <span className="text-gray-500 ml-2 text-xs">(history)</span>
                                    )}
                                </div>
                                {msg.isFile ? (
                                    <div className="mt-1">
                                        <a
                                            href={msg.fileData}
                                            download={msg.fileName}
                                            className="text-blue-500 underline"
                                        >
                                            Download {msg.fileName}
                                        </a>
                                    </div>
                                ) : (
                                    <div className="mt-1">{msg.body}</div>
                                )}
                                <div className="text-xs text-gray-500 mt-1">
                                    {new Date(msg.timestamp).toLocaleTimeString()}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t">
                    <div className="flex items-center space-x-2 mb-2">
                        <label className="bg-gray-200 hover:bg-gray-300 p-2 rounded cursor-pointer">
                            <Paperclip className="inline" size={20} />
                            <input
                                type="file"
                                className="hidden"
                                onChange={handleFileUpload}
                                accept="image/*,.pdf,.doc,.docx,.txt"
                            />
                        </label>
                        <div className="text-xs text-gray-500">
                            Max file size: 2MB
                        </div>
                    </div>
                    <div className="flex">
                        <input
                            type="text"
                            placeholder="Type a message..."
                            className="flex-1 border rounded-l-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        />
                        <button
                            className="bg-blue-500 hover:bg-blue-600 text-white rounded-r-lg p-2 px-4"
                            onClick={handleSendMessage}
                        >
                            Send
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Home;