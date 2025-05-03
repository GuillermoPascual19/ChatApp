// HOME.tsx (Frontend)
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';

interface PeerRef {
  peerID: string;
  peer: InstanceType<typeof Peer>;
}

interface FileMessage {
  data: string;
  sender: string;
  timestamp: string;
  channel: string;
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
  const peersRef = useRef<PeerRef[]>([]);
  const socket = useRef(io('https://chatapp-87po.onrender.com', { transports: ['websocket'] }));

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

    const formattedMessage = `[${currentChannel}] [${username || 'Anónimo'}]: ${message}`;
    
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
          file: fileData
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

    setChat(prev => [...prev, `[Me]: ${message}${file ? ' [Archivo adjunto]' : ''}`]);
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

  // Server Communication
  useEffect(() => {
    socket.current.on('Id', (id) => {
      setMyID(id);
      setShowUsernameModal(true);
    });

    socket.current.on('history', (history) => {
      setChat(history);
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
      setFiles(prev => [...prev, fileData]);
    });

    return () => {
      socket.current.disconnect();
    };
  }, []);

  // Join channel on component mount
  useEffect(() => {
    if (myID) {
      socket.current.emit('joinChannel', currentChannel);
    }
  }, [myID]);

  return (
    <div className="flex flex-col h-screen p-4 bg-gray-50">
      {/* Username Modal */}
      {showUsernameModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10">
          <div className="bg-white p-6 rounded-lg shadow-lg w-80">
            <h2 className="text-lg font-bold mb-4">Elige un nombre de usuario</h2>
            <input
              type="text"
              value={tempUsername}
              onChange={(e) => setTempUsername(e.target.value)}
              placeholder="Tu nombre..."
              className="w-full border rounded p-2 mb-4"
            />
            <button
              onClick={handleSetUsername}
              className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">P2P Chat ({username || 'Anónimo'})</h1>
      </header>
      
      {/* Channel Selector */}
      <div className="flex flex-wrap gap-3 mb-6">
        {['general', 'tech', 'random'].map(channel => (
          <button 
            key={channel}
            onClick={() => {
              setCurrentChannel(channel);
              socket.current.emit('joinChannel', channel);
            }}
            className={`px-4 py-2 rounded-lg transition-all ${
              currentChannel === channel 
                ? 'bg-blue-500 text-white shadow-md' 
                : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            #{channel}
          </button>
        ))}
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto mb-4 bg-white rounded-lg p-4 shadow-sm">
        {chat.length === 0 ? (
          <div className="text-gray-500 text-center py-4">
            No hay mensajes en este canal. ¡Envía el primero!
          </div>
        ) : (
          chat.map((msg, i) => (
            <div key={i} className="mb-3 p-3 bg-gray-50 rounded-lg">
              {msg}
            </div>
          ))
        )}
      </div>

      {/* Files section */}
      {files.length > 0 && (
        <div className="mb-4 bg-white rounded-lg p-4 shadow-sm">
          <h3 className="font-bold mb-3 text-gray-700">Archivos compartidos:</h3>
          <div className="flex flex-wrap gap-3">
            {files
              .filter(f => f.channel === currentChannel)
              .map((file, i) => (
                <div 
                  key={i} 
                  onClick={() => downloadFile(file.data, `file-${i}`)}
                  className="p-3 bg-blue-100 rounded-lg cursor-pointer flex items-center hover:bg-blue-200 transition-colors"
                >
                  <span className="text-blue-800">Archivo de {file.sender}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Message Input */}
      <div className="flex gap-3">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Escribe un mensaje..."
          className="flex-1 border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
        />
        <input
          type="file"
          onChange={handleFile}
          className="hidden"
          id="fileInput"
        />
        <label
          htmlFor="fileInput"
          className="bg-gray-200 p-3 rounded-lg cursor-pointer flex items-center hover:bg-gray-300 transition-colors"
        >
          {file ? '✓' : ''}
        </label>
        <button
          onClick={handleSendMessage}
          className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
        >
          Enviar
        </button>
      </div>

      {/* Selected File Indicator */}
      {file && (
        <div className="mt-3 p-3 bg-blue-100 rounded-lg flex justify-between items-center">
          <span className="text-blue-800">Archivo seleccionado: {file.name}</span>
          <button 
            onClick={() => setFile(null)}
            className="text-red-500 hover:text-red-700"
          >
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
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

export default Home;