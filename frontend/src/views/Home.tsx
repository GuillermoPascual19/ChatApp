import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import Peer from 'simple-peer';

// Definir interfaces para mejorar la tipificación
interface PeerConnection {
  peerID: string;
  peer: Peer.Instance;
}

interface MessageObject {
  sender: string;
  message?: string;
  timestamp: number;
  type: 'text' | 'file';
  filename?: string;
  fileType?: string;
  file?: string; // Base64 para archivos
  fileSize?: number;
}

const Home = () => {
  // Estado general
  const [message, setMessage] = useState('');
  const [myID, setMyID] = useState('');
  const [peers, setPeers] = useState<Peer.Instance[]>([]);
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Conectando...');
  const [isCoordinator, setIsCoordinator] = useState(false);
  const [coordinatorID, setCoordinatorID] = useState('');
  
  // Estado de los canales
  const [activeChannel, setActiveChannel] = useState<keyof typeof chatHistory>('general');
  const [chatHistory, setChatHistory] = useState<{
    general: MessageObject[];
    tecnico: MessageObject[];
    soporte: MessageObject[];
  }>({
    general: [],
    tecnico: [],
    soporte: []
  });
  
  // Estado para subida de archivos
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  // Referencias
  const peersRef = useRef<PeerConnection[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Inicializar la conexión Socket.io
    socketRef.current = io('https://chatapp-87po.onrender.com', {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    
    const socket = socketRef.current;

    // Manejar la asignación de ID
    socket.on('Id', (id) => {
      setMyID(id);
      setConnected(true);
      setConnectionStatus(`Conectado (ID: ${id.substring(0, 6)}...)`);
    });

    // Manejar información del coordinador
    socket.on('coordinator-info', (id) => {
      setCoordinatorID(id);
      setConnectionStatus(() => {
        if (id === myID) {
          return `Conectado - Eres el coordinador`;
        } else {
          return `Conectado - Coordinador: ${id.substring(0, 6)}...`;
        }
      });
    });

    // Convertirse en coordinador
    socket.on('become-coordinator', (history) => {
      setIsCoordinator(true);
      setChatHistory(history);
      setConnectionStatus(`Conectado - Eres el coordinador`);
    });

    // Cambio de coordinador
    socket.on('coordinator-changed', (id) => {
      setCoordinatorID(id);
      if (id === myID) {
        setIsCoordinator(true);
        setConnectionStatus(`Conectado - Eres el coordinador`);
      } else {
        setIsCoordinator(false);
        setConnectionStatus(`Conectado - Nuevo coordinador: ${id.substring(0, 6)}...`);
      }
    });

    // Solicitud de historial (como coordinador)
    socket.on('request-history', (newUserId) => {
      if (isCoordinator) {
        socket.emit('send-history-to-user', {
          targetId: newUserId,
          history: chatHistory
        });
      }
    });

    // Recibir historial (como usuario nuevo)
    socket.on('receive-history', (history) => {
      setChatHistory(history);
    });

    // Manejar mensajes de texto por canal
    socket.on('channel-message', ({ channel, messageObj }: { channel: keyof typeof chatHistory; messageObj: MessageObject }) => {
      setChatHistory(prev => ({
        ...prev,
        [channel]: [...prev[channel], messageObj]
      }));
    });

    // Manejar archivos por canal
    socket.on('channel-file', ({ channel, fileObj }: { channel: keyof typeof chatHistory; fileObj: MessageObject }) => {
          setChatHistory(prev => ({
            ...prev,
            [channel]: [...prev[channel], fileObj]
          }));
        });

    // Manejar usuarios existentes
    socket.on('all-users', (users) => {
      const peerConnections = users.map((userID: string) => {
        const peer = createPeer(userID, socket.id || '');
        const peerConnection = { peerID: userID, peer };
        peersRef.current.push(peerConnection);
        return peer;
      });
      
      setPeers(peerConnections);
      
      if (users.length > 0) {
        addSystemMessage(`Conectado con ${users.length} usuarios`);
      }
    });

    // Manejar cuando un nuevo usuario se une
    socket.on('user-joined', (payload) => {
      const peer = addPeer(payload.signal, payload.callerID);
      const peerConnection = { peerID: payload.callerID, peer };
      
      peersRef.current.push(peerConnection);
      setPeers(prevPeers => [...prevPeers, peer]);
      
      addSystemMessage(`Nuevo usuario conectado: ${payload.callerID.substring(0, 6)}...`);
    });

    // Manejar señales de retorno
    socket.on('receivingReturnSignal', (payload) => {
      const item = peersRef.current.find(p => p.peerID === payload.id);
      if (item) {
        item.peer.signal(payload.signal);
      }
    });

    // Manejar desconexión
    socket.on('user-disconnected', (userID) => {
      addSystemMessage(`Usuario desconectado: ${userID.substring(0, 6)}...`);
      
      // Eliminar la conexión peer
      const peerObj = peersRef.current.find(p => p.peerID === userID);
      if (peerObj) {
        peerObj.peer.destroy();
      }
      
      // Actualizar las referencias
      peersRef.current = peersRef.current.filter(p => p.peerID !== userID);
      setPeers(peers.filter(p => p !== peerObj?.peer));
    });

    // Manejar errores de conexión
    socket.on('connect_error', () => {
      setConnectionStatus('Error de conexión. Reintentando...');
    });

    // Limpiar al desmontar
    return () => {
      peersRef.current.forEach(({ peer }) => peer.destroy());
      socket.disconnect();
    };
  }, [myID, isCoordinator]);

  // Cada vez que cambie el historial, scroll hacia abajo
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, activeChannel]);

  // Agregar un mensaje de sistema al canal activo
  const addSystemMessage = (text: string) => {
    setChatHistory(prev => ({
      ...prev,
      [activeChannel]: [
        ...prev[activeChannel], 
        {
          sender: 'SISTEMA',
          message: text,
          timestamp: Date.now(),
          type: 'text'
        }
      ]
    }));
  };

  // Crear una conexión peer como iniciador
  function createPeer(userToSignal: string, callerID: string) {
    const peer = new Peer({
      initiator: true,
      trickle: false
    });

    peer.on('signal', (signal) => {
      socketRef.current?.emit('sendSignal', {
        userToSignal,
        callerID,
        signal
      });
    });

    // En un chat de canal, los peers no se comunican directamente
    // sino a través del servidor, por lo que este evento es opcional
    peer.on('data', (data) => {
      try {
        console.log("Datos P2P recibidos:", data);
      } catch (error) {
        console.error('Error con datos P2P:', error);
      }
    });

    return peer;
  }

  // Crear una conexión peer como receptor
  function addPeer(incomingSignal: any, callerID: string) {
    const peer = new Peer({
      initiator: false,
      trickle: false
    });

    peer.on('signal', (signal) => {
      socketRef.current?.emit('returnSignal', {
        signal,
        callerID
      });
    });

    // Aplicar la señal entrante si existe
    if (incomingSignal) {
      peer.signal(incomingSignal);
    }

    return peer;
  }

  // Manejar el envío de mensajes de texto
  const handleSendMessage = () => {
    if (!message.trim()) return;
    
    const messageObj: MessageObject = {
      sender: myID,
      message: message,
      timestamp: Date.now(),
      type: 'text'
    };

    // Enviar mensaje al servidor para el canal actual
    socketRef.current?.emit('channel-message', {
      channel: activeChannel,
      message: message,
      sender: myID,
      timestamp: messageObj.timestamp
    });
    
    // Actualizar el estado local
    setChatHistory(prev => ({
      ...prev,
      [activeChannel]: [...prev[activeChannel], messageObj]
    }));
    
    setMessage('');
  };

  // Manejar la selección de archivo
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      // Verificar tamaño (2MB máximo)
      if (file.size > 2 * 1024 * 1024) {
        alert('El archivo es demasiado grande. Máximo 2MB permitido.');
        return;
      }
      setSelectedFile(file);
    }
  };

  // Manejar el envío de archivo
  const handleSendFile = () => {
    if (!selectedFile) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const base64File = e.target.result.toString();
        
        const fileObj: MessageObject = {
          sender: myID,
          filename: selectedFile.name,
          fileType: selectedFile.type,
          file: base64File,
          fileSize: selectedFile.size,
          timestamp: Date.now(),
          type: 'file'
        };
        
        // Enviar archivo al servidor
        socketRef.current?.emit('channel-file', {
          channel: activeChannel,
          file: base64File,
          filename: selectedFile.name,
          fileType: selectedFile.type,
          sender: myID,
          timestamp: fileObj.timestamp
        });
        
        // Actualizar estado local
        setChatHistory(prev => ({
          ...prev,
          [activeChannel]: [...prev[activeChannel], fileObj]
        }));
        
        // Limpiar selección
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsDataURL(selectedFile);
  };

  // Manejar descarga de archivo
  const handleDownloadFile = (fileObj: MessageObject) => {
    if (!fileObj.file || !fileObj.filename) return;
    
    // Crear enlace para descargar
    const link = document.createElement('a');
    link.href = fileObj.file;
    link.download = fileObj.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Manejar el envío con Enter
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  // Determinar el nombre para mostrar
  const getSenderDisplayName = (senderId: string) => {
    if (senderId === myID) return 'Yo';
    if (senderId === coordinatorID) return `Coordinador (${senderId.substring(0, 6)}...)`;
    if (senderId === 'SISTEMA') return 'Sistema';
    return `Usuario (${senderId.substring(0, 6)}...)`;
  };

  // Formatear la hora
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Cabecera */}
      <div className="bg-blue-600 text-white p-4 shadow-md">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">Chat P2P con Canales</h1>
          <div className="text-sm">
            {connected ? (
              <span className="bg-green-500 px-2 py-1 rounded-full">
                {isCoordinator ? '👑 Coordinador' : `Conectado`}
              </span>
            ) : (
              <span className="bg-red-500 px-2 py-1 rounded-full">Desconectado</span>
            )}
          </div>
        </div>
        <div className="text-xs mt-1">{connectionStatus}</div>
      </div>
      
      {/* Contenido principal: canales + chat */}
      <div className="flex flex-1 overflow-hidden">
        {/* Barra lateral de canales */}
        <div className="w-1/4 bg-gray-800 text-white p-4">
          <h2 className="font-bold mb-4 text-center">CANALES</h2>
          <ul>
            {(['general', 'tecnico', 'soporte'] as Array<keyof typeof chatHistory>).map(channel => (
              <li 
                key={channel}
                className={`p-2 mb-2 rounded cursor-pointer ${
                  activeChannel === channel 
                    ? 'bg-blue-600 text-white' 
                    : 'hover:bg-gray-700'
                }`}
                onClick={() => setActiveChannel(channel)}
              >
                # {channel.charAt(0).toUpperCase() + channel.slice(1)}
                <span className="float-right bg-gray-600 rounded-full px-2 text-xs">
                  {chatHistory[channel].length}
                </span>
              </li>
            ))}
          </ul>
          
          <div className="mt-8">
            <h3 className="font-bold mb-2">Usuarios conectados</h3>
            <div className="bg-gray-700 p-2 rounded">
              <div className="flex items-center mb-2">
                <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                <span className="text-sm">{myID ? `Tú (${myID.substring(0, 6)}...)` : 'Conectando...'}</span>
                {isCoordinator && <span className="ml-2 text-yellow-400">👑</span>}
              </div>
              
              {peersRef.current.map(({ peerID }) => (
                <div key={peerID} className="flex items-center mb-2">
                  <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                  <span className="text-sm">{peerID.substring(0, 6)}...</span>
                  {peerID === coordinatorID && <span className="ml-2 text-yellow-400">👑</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Área de chat */}
        <div className="flex-1 flex flex-col">
          {/* Canal actual */}
          <div className="bg-gray-200 p-2 border-b border-gray-300">
            <h2 className="font-semibold"># {activeChannel.charAt(0).toUpperCase() + activeChannel.slice(1)}</h2>
          </div>
          
          {/* Mensajes */}
          <div 
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-2"
          >
            {chatHistory[activeChannel].length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                No hay mensajes en este canal. ¡Sé el primero en enviar uno!
              </div>
            ) : (
              chatHistory[activeChannel].map((item, index) => (
                <div 
                  key={index} 
                  className={`p-3 rounded-lg shadow-sm max-w-3/4 ${
                    item.sender === myID 
                      ? 'ml-auto bg-blue-100' 
                      : item.sender === 'SISTEMA'
                        ? 'mx-auto bg-gray-200 text-center text-sm italic'
                        : 'bg-white'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className={`font-semibold text-sm ${
                      item.sender === coordinatorID ? 'text-yellow-600' : ''
                    }`}>
                      {getSenderDisplayName(item.sender)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatTime(item.timestamp)}
                    </span>
                  </div>
                  
                  {item.type === 'text' && (
                    <p>{item.message}</p>
                  )}
                  
                  {item.type === 'file' && (
                    <div className="border rounded p-2 bg-gray-50">
                      <div className="flex items-center">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                        </svg>
                        <span className="flex-1 truncate">{item.filename}</span>
                        <button
                          onClick={() => handleDownloadFile(item)}
                          className="ml-2 text-blue-600 hover:text-blue-800"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                          </svg>
                        </button>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {item.fileSize ? `${Math.round(item.fileSize / 1024)} KB` : 'Desconocido'} · {item.fileType || 'Desconocido'}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          
          {/* Entrada de mensaje y archivo */}
          <div className="p-3 bg-white border-t border-gray-300">
            {selectedFile && (
              <div className="mb-2 p-2 bg-blue-50 rounded flex items-center">
                <span className="truncate flex-1">{selectedFile.name}</span>
                <button 
                  onClick={() => setSelectedFile(null)}
                  className="text-red-600 ml-2"
                >
                  ✕
                </button>
                <button 
                  onClick={handleSendFile}
                  className="ml-2 bg-green-600 text-white px-2 py-1 rounded text-sm"
                >
                  Enviar archivo
                </button>
              </div>
            )}
            
            <div className="flex items-center">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
              />
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Escribe un mensaje..."
                className="flex-1 border rounded px-3 py-2"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home