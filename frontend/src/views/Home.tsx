
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';

interface PeerRef {
  peerID: string;
  peer: InstanceType<typeof Peer>;
}

interface FileMessage {
  name: string;
  size: number;
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
            data: fileData,
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

  // Server Communication
  useEffect(() => {
    socket.current.on('Id', (id) => {
      setMyID(id);
      setShowUsernameModal(true);
    });

    socket.current.on('history', (history) => {
      setChat(history);
    });
    socket.current.on('file-history', (fileHistory) => {
      setFiles(prevFiles => [...prevFiles, ...fileHistory]);
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
  <div className="main-container h-screen flex">
    {/* COLUMNA IZQUIERDA - CONTROLES */}
    <div className="controls-column w-1/3 flex flex-col p-4 overflow-auto">
      {/* Modal Usuario */}
      {showUsernameModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-80">
            <h2 className="text-xl font-bold mb-4">Elige tu nombre</h2>
            <input
              type="text"
              value={tempUsername}
              onChange={(e) => setTempUsername(e.target.value)}
              placeholder="Nombre de usuario"
              className="w-full p-2 mb-4 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSetUsername}
              className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}

      {/* Archivos Compartidos */}
      {files.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold mb-3">Archivos compartidos</h3>
          <div className="grid grid-cols-1 gap-3">
            {files
              .filter((f) => f.channel === currentChannel)
              .map((file, i) => (
                <div
                  key={i}
                  onClick={() => downloadFile(file.data, file.name)}
                  className="p-3 bg-blue-50 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors"
                >
                  <span className="text-sm">Archivo: {file.name}</span>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-gray-500">De: {file.sender}</span>
                    <span className="text-xs text-gray-500">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  <span className="block text-xs text-gray-500 mt-1">
                    {new Date(file.timestamp).toLocaleString()}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Entrada de Mensaje */}
      <div className="flex-1">
        <h2 className="text-lg font-semibold mb-4">Enviar Mensaje</h2>
        <div className="space-y-4">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Escribe tu mensaje..."
            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
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
              className={`flex-1 p-2 text-center rounded-lg cursor-pointer ${
                file ? 'bg-green-100 text-green-600' : 'bg-gray-200 hover:bg-gray-300'
              }`}
            >
              {file ? 'Archivo listo' : 'Seleccionar archivo'}
            </label>
            <button
              onClick={handleSendMessage}
              disabled={!message && !file}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-400"
            >
              Enviar
            </button>
          </div>
        </div>

        {/* Previsualización Archivo */}
        {file && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm truncate">{file.name}</span>
              <button 
                onClick={() => setFile(null)}
                className="text-red-500 hover:text-red-700"
              >
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Información Usuario */}
      <div className="mt-auto pt-4 border-t border-gray-200">
        <div className="bg-white p-3 rounded-lg shadow-sm">
          <p className="font-semibold">{username || 'Anónimo'}</p>
          <p className="text-sm text-gray-600">Canal: #{currentChannel}</p>
        </div>
      </div>
    </div>

    {/* COLUMNA DERECHA - CHAT */}
    <div className="chat-column w-2/3 flex flex-col h-full overflow-hidden p-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          Chat P2P - <span className="text-blue-600">{username || 'Anónimo'}</span>
        </h1>
      </div>

      {/* Selector de Canal */}
      <div className="flex gap-3 mb-6">
        {['general', 'auxiliar'].map((channel) => (
          <button
            key={channel}
            onClick={() => {
              setCurrentChannel(channel);
              socket.current.emit('joinChannel', channel);
            }}
            className={`px-4 py-2 rounded-lg transition-colors ${
              currentChannel === channel
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            #{channel}
          </button>
        ))}
      </div>

      {/* Mensajes del Chat */}
      <div className="flex-1 flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chat.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No hay mensajes en este canal
            </div>
          ) : (
            chat.map((msg, i) => {
              try {
                const messageObj = JSON.parse(msg);
                const isCurrentUser = messageObj.sender === username;

                return (
                  <div key={i} className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}>
                    <div 
                      className={`p-3 rounded-lg max-w-[80%] min-w-[20%] ${
                        isCurrentUser 
                          ? 'bg-green-100 rounded-tr-none' 
                          : 'bg-blue-100 rounded-tl-none'
                      }`}
                    >
                      <div className="font-semibold text-sm text-gray-700">
                        {messageObj.sender}
                      </div>
                      <div className="mt-1 text-gray-900">
                        {messageObj.text}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {new Date(messageObj.timestamp).toLocaleTimeString()}
                      </div>
                      {files[i] && (
                        <button 
                          onClick={() => downloadFile(files[i].data, `file-${i}`)}
                          className="mt-2 text-sm text-blue-600 hover:underline flex items-center"
                        >
                          Descargar archivo
                        </button>
                      )}
                    </div>
                  </div>
                );
              } catch {
                return (
                  <div key={i} className="p-3 bg-gray-100 rounded-lg">
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

}

export default Home;