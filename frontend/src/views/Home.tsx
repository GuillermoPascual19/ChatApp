import { useEffect, useState, useRef } from 'react'
import { io, Socket} from 'socket.io-client'

//HACER UN HISTORIAL PARA QUE EL COORDINADOR PUEDA ENSEÑAR CONVERSACIONES ANTERIORES A NUEVOS CLIENTES QUE ENTREN
//MENSAJES DE CLIENTE A CLIENTE, NO DE CLINTE-sERVIDOR-CLIENTE
//ADJUNTAR FICHEROS DE MAXIMO DE 2MGS
//METER CANALES Y HACER UN COORDINADOR EN CADA CANAL


interface Message {
    from: string;
    body: string;
    timestamp: number;
    isHistory?: boolean;
}

interface Peer {
    id: string;
    isCoordinator: boolean;
}

const Home = () => {

    const [message, setMessage] = useState('')
    const [messages, setMessages] = useState<Message[]>([])
    const [peers, setPeers] = useState<Peer[]>([])
    const [myId, setMyId] = useState<string>('')
    const [isCoordinator, setIsCoordinator] = useState(false)
    const socketRef = useRef<Socket | null>(null)
    const peerConnections = useRef<Record<string, RTCPeerConnection>>({})
    const dataChannels = useRef<Record<string, RTCDataChannel>>({})
    
    const handleSendMessage = () => {
        if(!message.trim()) return 

        const newMsg = {
            from: myId,
            body: message,
            timestamp: Date.now()
        }

        //Enviar mensaje a todos los peers conectados
        Object.entries(dataChannels.current).forEach(([peerId,dc]) => {
            if(dc.readyState === 'open'){
                try {
                    dc.send(JSON.stringify({
                        type: 'message',
                        data: message
                    }))
                } catch(error) {
                    console.error(`Error sending message to ${peerId}:`, error)
                }
            }
        })
        setMessages(prev => [...prev, newMsg])
        setMessage('')
    };

    const setupPeerConnection = (peerId: string) => {
        if(peerConnections.current[peerId]) return

        console.log('Setting up peer connection for', peerId)
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302'},
                { urls: 'stun:stun1.l.google.com:19302'},
                { urls: 'stun:stun2.l.google.com:19302'}
            ]
        })
        peerConnections.current[peerId] = pc
        
        pc.onicecandidate = (event) => {
            if(event.candidate && socketRef.current) {
                socketRef.current?.emit('signal', {
                    to: peerId,
                    data: { type: 'candidate', candidate: event.candidate}
                })
            }
        }

        pc.onconnectionstatechange = () => {
            console.log(`Connection state with ${peerId}`, pc.connectionState)
        }

        pc.onconnectionstatechange = () => {
            console.log(` ICE connection state with ${peerId}`, pc.iceConnectionState)
        }

        //Si somos el que iniciar la conexion, creamos el data channel
        if(myId > peerId) {
            const dc = pc.createDataChannel('chat', {negotiated: true, id: 0})
            setupDataChannel(peerId, dc)

            pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
                if(socketRef.current && pc.localDescription) {
                    socketRef.current.emit('signal', {
                        to: peerId,
                        data: pc.localDescription
                    })
                }
                
            })
            .catch(error => console.error('Error creating offer', error))
        } else {
            pc.ondatachannel = (event) => {
                setupDataChannel(peerId, event.channel)
            }
        }
    };

    const setupDataChannel = (peerId: string, dc: RTCDataChannel) => {
        dataChannels.current[peerId] = dc

        dc.onopen = () => {
            console.log(`Data channel with ${peerId} is open`)

            //Si somos coordinador y se conecta nuevo cliente, enviamos el historial de mensajes
            if( isCoordinator){
                dc.send(JSON.stringify({ type: 'history', data: messages}))
            }
        };

        dc.onclose = () => {
            console.log(`Data channel with ${peerId} closed`)
            delete dataChannels.current[peerId]
        }

        dc.onerror = (error) => {
            console.error(`Data channel error with ${peerId}:`, error)
        }

        dc.onmessage = (event ) => {
            try {
                const message = JSON.parse(event.data)
                console.log('Received message', message)

                if(message.type === 'message') {
                    setMessages(prev => [...prev, { 
                        from: peerId, 
                        body: message.data, 
                        timestamp: Date.now()
                    }])
                } else if (message.type === 'history') {
                    setMessages(prev => [
                        ...message.data.map((msg: Message) => ({ ...msg, isHistory: true})),
                        ...prev
                    ])
                }
            } catch (error) {
                console.error('Error parsing message', error)
            }
        }
    };

    useEffect(() => {
        const socket = io('https://chatapp-87po.onrender.com', {
            transports: ['websocket'],
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        })
        socketRef.current = socket
        
        socket.on('connect', () => {
            console.log('Connected to server')
            setMyId(socket.id || '');
        })

        socket.on('peer-list', (peerList: Peer[]) => {
            setPeers(peerList)
            const coordinator = peerList.find(p => p.isCoordinator)
            setIsCoordinator(coordinator?.id === socket.id)

            peerList.forEach(peer => {
                if(peer.id !== socket.id) {
                    setupPeerConnection(peer.id)
                }
            })
        })

        //CHECKAR ESTO; NO SE QUE TAN BIEN ESTA Y ES MUY ENREVESADO; PREGUNTAR POR EXPLICACION

        //Señales ICE y oferta/respuesta
        socket.on('signal', ({from, data}) => {
            if(!peerConnections.current[from]) setupPeerConnection(from)

            const pc = peerConnections.current[from]
            if(!pc) return 
            try {
                if (data.type === 'offer') {
                    pc.setRemoteDescription(new RTCSessionDescription(data))
                    .then(() => pc.createAnswer())
                    .then(answer => pc.setLocalDescription(answer))
                    .then(() => { 
                        if(socketRef.current && pc.localDescription) {
                            socketRef.current.emit('signal', {to: from, data: pc.localDescription})
                        }
                    }).catch(error => console.error('Error handling offer: ', error))
                } else if(data.type === 'answer') {
                    pc.setRemoteDescription(new RTCSessionDescription(data))
                        .catch(error => console.error('Error handling answer: ', error))
                } else if(data.type === 'candidate') {
                    pc.addIceCandidate(new RTCIceCandidate(data))
                        .catch(error => console.error('Error adding ICE candidate: ', error))
                }
            } catch(error) {
                console.error('Error processing signal:', error)
            }
            
        });
        
        socket.on('info-coordinador', (idcoordinador: string) => {
            if(idcoordinador && idcoordinador !== socket.id){
                const dc = dataChannels.current[idcoordinador]
            
                if(dc && dc.readyState === 'open'){
                    dc.send(JSON.stringify({ type: 'request-history'})); 
                }
             }
        });

        
        socket.on('disconnect' , () => {
            console.log('Disconnected from server')
        })
        return () => {
            if(socketRef.current) socketRef.current.disconnect()
            Object.values(peerConnections.current).forEach(pc => pc.close())
        }
    }, [])    

    return (
    <>
        <div className="flex h-screen bg-gray-100">
            <div className='w-64 border-r bg-white p-4 overflow-y-auto'>
                <h3 className='font-bold text-lg mb-4'>Connected Peers: ({peers.length})</h3>
                <ul className='space-y-2'>
                    {peers.map(peer => (
                        <li key={peer.id} className={`p-2 rounded ${peer.isCoordinator ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
                            <div className='truncate'>{peer.id}</div>
                            {peer.isCoordinator && <div className='text-xs text-green-600'>Coodinador</div>}
                        </li>
                    ))}
                </ul>
            </div>
            <div className='flex-1 flex flex-col'>
                <div className='p-4 border-b' >
                    <span className='font-bold'>Your ID:</span> {myId} {isCoordinator && <span className='ml-2 bg-green-500 text-white px-2 py-1 rounded text-sm'>Coordinator</span>}
                </div>
                <div className="flex-1 overflow-y-auto p-4 flex justify-center">
                    <div className='w-full max-w-2xl space-y-2'>
                        {messages.map((msg, index) => (
                            <div key={index} className={`p-2 rounded ${msg.isHistory ? 'bg-green-50' : 'bg-red-50'} shadow-sm`}>
                                <strong>{msg.from}</strong>: {msg.body}
                                {msg.isHistory && <span className='text-gray-500 ml-2 text-xs'>(history)</span>}
                            </div>
                            
                        ))}
                    </div>
                </div>
                <div className='p-4 border-t'>
                    <div className='flex justify-end'>
                        <div className='flex w-full max-w-2xl'>
                            <input type='text' placeholder='Type a message...' 
                                className='flex-1 border rounded-l-lg p-2 focus:outline-none focus:ring-2 focus:rings-blue-500'
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                            />
                            <button className='bg-blue-500 hover:bg-blue-600 text-white rounded-r-lg p-2 px-4' onClick={handleSendMessage}>
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </>
  )
}

export default Home