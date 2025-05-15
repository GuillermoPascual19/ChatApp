import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import { Sun, Moon, X, Paperclip } from 'lucide-react';

interface PeerRef {
  peerID: string;
  peer: InstanceType<typeof Peer>;
}

interface FileMessage {
  name: string; // Añadido nombre del archivo
  size: number; // Añadido tamaño del archivo
  data: string;
  sender: string;
  timestamp: string;
  channel: string;
}

interface MessageObj {
  channel: string;
  sender: string;
  text: string;
  timestamp: string;
}

const Home = () => {
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState<string[]>([]);
  const [myID, setMyID] = useState('');
  const [username, setUsername] = useState('');
  const [tempUsername, setTempUsername] = useState('');
  const [currentChannel, setCurrentChannel] = useState('general');
  const [file, setFile] = useState<File | null>(null);
  const [files, setFiles] = useState<FileMessage[]>([]);
  const [showUsernameModal, setShowUsernameModal] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const peersRef = useRef<PeerRef[]>([]);

  // Referencia al socket para evitar reconexiones
  const socket = useRef(io('https://chatapp-87po.onrender.com', { transports: ['websocket'] }));

   const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    // Guardar preferencia en localStorage
    localStorage.setItem('darkMode', JSON.stringify(!darkMode));
  };

  // WebRTC Configuration
  const addPeer = (incomingSignal: string, callerID: string) => {
    const peer = new Peer({ initiator: false, trickle: false });
    
    peer.on('signal', (signal) => {
      socket.current.emit('returnSignal', { signal, callerID });
    });

    peer.signal(incomingSignal);
    
    peer.on('data', (data) => {
      setChat(prev => [...prev, data.toString()]);
    });

    return peer;
  };

  // Username setup
  const handleSetUsername = () => {
    if (tempUsername.trim()) {
      setUsername(tempUsername);
      socket.current.emit('setUsername', tempUsername);
      setShowUsernameModal(false);
    }
  };

  // Message Handling
  const handleSendMessage = async () => {
    if (!message && !file) return;

    const formattedMessage = JSON.stringify({
      channel: currentChannel,
      sender: username || 'Anónimo',
      text: message,
      timestamp: new Date().toISOString()
    });
    // Send to peers
    peersRef.current.forEach(({ peer }) => {
      peer.send(formattedMessage);
    });

    // Handle file upload
    if (file) {
      try {
        const fileData = await toBase64(file);
        // Send to coordinator for history
        socket.current.emit('message', {
          message: formattedMessage,
          channel: currentChannel,
          file: {
            name: file.name,
            size: file.size,
            data: fileData
          }
        });
      } catch (error) {
        console.error('Error processing file:', error);
        alert('Error processing file');
      }
    } else {
      // Send text only message
      socket.current.emit('message', {
        message: formattedMessage,
        channel: currentChannel,
        file: null
      });
    }

    setMessage('');
    setFile(null);
  };

  // File Handling
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.size <= 2 * 1024 * 1024) {
      setFile(selectedFile);
    } else {
      alert('File size exceeds 2MB limit');
    }
  };

  const downloadFile = (fileData: string, filename: string) => {
    const link = document.createElement('a');
    link.href = fileData;
    link.download = filename || 'downloaded-file';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  function toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          resolve(reader.result.toString());
        } else {
          reject(new Error('File could not be converted to Base64'));
        }
      };
      reader.onerror = () => reject(new Error('Error reading file'));
      reader.readAsDataURL(file);
    });
  }

  // Solicitar explícitamente el historial de archivos al cambiar de canal
  const handleChannelChange = (channel: string) => {
    setCurrentChannel(channel);
    socket.current.emit('joinChannel', channel);
    // Solicitar explícitamente el historial de archivos
    socket.current.emit('getFileHistory', channel);
  };

  // Server Communication
  useEffect(() => {
    socket.current.on('Id', (id) => {
      setMyID(id);
      setShowUsernameModal(true);
    });

    socket.current.on('history', (history) => {
      setChat(history);
    });

    // Manejar el historial de archivos recibido del servidor
    socket.current.on('file-history', (fileHistory: FileMessage[]) => {
      console.log('File history received:', fileHistory);
      if (Array.isArray(fileHistory)) {
        setFiles(fileHistory);
      } else {
        console.error('Invalid file history format:', fileHistory);
      }
    });

    socket.current.on('user-joined', (payload) => {
      const peer = addPeer(payload.signal, payload.callerID);
      peersRef.current.push({ peerID: payload.callerID, peer });
    });

    socket.current.on('receivingReturnSignal', (payload) => {
      const item = peersRef.current.find(p => p.peerID === payload.id);
      item?.peer.signal(payload.signal);
    });

    socket.current.on('new-message', (message) => {
      setChat(prev => [...prev, message]);
    });

    socket.current.on('new-file', (fileData: FileMessage) => {
      console.log('New file received:', fileData);
      if (fileData && fileData.data) {
        setFiles(prev => [...prev, fileData]);
      }
    });

    // Limpiar event listeners al desmontar
    return () => {
      socket.current.off('Id');
      socket.current.off('history');
      socket.current.off('file-history');
      socket.current.off('user-joined');
      socket.current.off('receivingReturnSignal');
      socket.current.off('new-message');
      socket.current.off('new-file');
    };
  }, []);

  // Join channel on component mount
  useEffect(() => {
    if (myID) {
      socket.current.emit('joinChannel', currentChannel);
      // Solicitar explícitamente el historial de archivos
      socket.current.emit('getFileHistory', currentChannel);
    }
  }, [myID]);

  useEffect(() => {
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode) {
      setDarkMode(JSON.parse(savedMode));
    } else {
      // Usar la preferencia del sistema si no hay configuración guardada
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setDarkMode(prefersDark);
    }
  }, []);

  return (
      <div className={`main-container ${darkMode ? 'dark' : ''}`}>
        {/* Botón de toggle para dark mode */}
        <button 
          onClick={toggleDarkMode}
          className="fixed bottom-4 right-4 p-3 rounded-full bg-blue-500 text-white shadow-lg z-50"
          aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {darkMode ? <Sun/> : <Moon />}
        </button>

        {/* COLUMNA IZQUIERDA - CONTROLES */}
        <div className="controls-column dark:bg-gray-800 dark:border-gray-700">
          {/* Modal Usuario */}
          {showUsernameModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-700 p-6 rounded-lg shadow-lg w-80">
                <h2 className="text-xl font-bold mb-4 dark:text-white">Elige tu nombre</h2>
                <input
                  type="text"
                  value={tempUsername}
                  onChange={(e) => setTempUsername(e.target.value)}
                  placeholder="Nombre de usuario"
                  className="w-full p-2 mb-4 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-600 dark:border-gray-500 dark:text-white dark:placeholder-gray-400"
                />
                <button
                  onClick={handleSetUsername}
                  className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
                >
                  Confirmar
                </button>
              </div>
            </div>
          )}

          {/* Archivos Compartidos */}
          {files.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold mb-3 dark:text-white">Archivos compartidos</h3>
              <div className="grid grid-cols-1 gap-2">
                {files
                  .filter((f) => f.channel === currentChannel)
                  .map((file, i) => (
                    <div
                      key={i}
                      onClick={() => downloadFile(file.data, file.name || `file-${i}`)}
                      className="p-3 bg-blue-50 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-blue-100 dark:hover:bg-gray-600 transition-colors flex items-center"
                    >
                      <span className="text-sm flex-1 dark:text-gray-200">
                        {file.name ? file.name : `Archivo de ${file.sender}`}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(file.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Entrada de Mensaje */}
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-4 dark:text-white">Enviar Mensaje</h2>
            <div className="space-y-4">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escribe tu mensaje..."
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              />
              
              <div className="flex gap-2">
                <input
                  type="file"
                  onChange={handleFile}
                  className="hidden"
                  id="fileInput"
                />
                <label
                  htmlFor="fileInput"
                  className={`flex-1 p-2 text-center rounded-lg cursor-pointer border ${
                    file ? 'border-green-500 bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-200' : 
                    'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200'
                  }`}
                >
                  {file ? 'Archivo listo' : 'Seleccionar archivo'}
                </label>
                <button
                  onClick={handleSendMessage}
                  disabled={!message && !file}
                  className={`flex-1 p-2 rounded-lg border ${
                    (!message && !file) ? 
                    'border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed' :
                    'border-blue-500 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white'
                  }`}
                >
                  Enviar
                </button>
              </div>
            </div>

            {/* Previsualización Archivo */}
            {file && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-gray-700 rounded-lg border border-blue-200 dark:border-gray-600">
                <div className="flex justify-between items-center">
                  <span className="text-sm truncate dark:text-gray-200">{file.name}</span>
                  <button 
                    onClick={() => setFile(null)}
                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  >
                    <X />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Información Usuario */}
          <div className="mt-auto pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="bg-white dark:bg-gray-700 p-3 rounded-lg shadow-sm">
              <p className="font-semibold dark:text-white">{username || 'Anónimo'}</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">Canal: #{currentChannel}</p>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA - CHAT */}
        <div className="chat-column dark:bg-gray-900">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
              Chat P2P - <span className="text-blue-600 dark:text-blue-400">{username || 'Anónimo'}</span>
            </h1>
          </div>

          {/* Selector de Canal */}
          <div className="channels-container">
            {['general', 'auxiliar'].map((channel) => (
              <button
                key={channel}
                onClick={() => handleChannelChange(channel)}
                className={`channel-btn ${
                  currentChannel === channel ? 'active' : ''
                }`}
              >
                #{channel}
              </button>
            ))}
          </div>

          {/* Área de mensajes con scroll independiente */}
          <div className="message-area">
            <div className="chat-messages">
                {chat.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No hay mensajes en este canal
                </div>
                ) : (
                chat.map((msg: string, i: number) => {
                  
                  try {
                  const messageObj: MessageObj = JSON.parse(msg);
                  const isCurrentUser: boolean = messageObj.sender === username;
                  
                  // Buscar si hay un archivo asociado con este mensaje
                  const relatedFile = files.find(f => 
                    f.sender === messageObj.sender && 
                    new Date(f.timestamp).getTime() - new Date(messageObj.timestamp).getTime() < 1000
                  );
                  
                  return (
                    <div key={i} className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-2`}>
                    <div 
                      className={`message-bubble ${isCurrentUser ? 'own' : 'other'}`}
                    >
                      <div className="message-content">
                      <span className="message-sender">
                        {messageObj.sender}:
                      </span>
                      <span className="message-text">
                        {messageObj.text}
                      </span>
                      </div>
                      <div className="message-time">
                      {new Date(messageObj.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                      {relatedFile && (
                      <button 
                        onClick={() => downloadFile(relatedFile.data, relatedFile.name || `file-${i}`)}
                        className="mt-1 text-xs text-blue-200 hover:underline flex items-center"
                      >
                        <Paperclip size={12}/>
                        <span className="ml-1">Descargar {relatedFile.name || 'archivo'}</span>
                      </button>
                      )}
                    </div>
                    </div>
                  );
                  } catch {
                  return (
                    <div key={i} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg dark:text-gray-200 text-sm mb-2">
                    {msg}
                    </div>
                  );
                  }
                })
                )}
            </div>
          </div>
        </div>
      </div>
    );
};

export default Home;