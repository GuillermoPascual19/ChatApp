import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import Chat from '../components/chat-chart';


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

  // Usar Socket.IO con reconexión automática
  const socket = useRef(io('https://chatapp-87po.onrender.com', { 
    transports: ['websocket'],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  }));

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

    const messageData = {
      channel: currentChannel,
      sender: username || 'Anónimo',
      text: message,
      timestamp: new Date().toISOString(),
      file: file ? {
        name: file.name,
        size: file.size
      } : null
    };

    const formattedMessage = JSON.stringify(messageData);

    // Send to peers
    peersRef.current.forEach(({ peer }) => {
      peer.send(formattedMessage);
    });

    // Handle file upload
    if (file) {
      try {
        const fileData = await toBase64(file);
        console.log("File converted to base64, first 20 chars:", fileData.substring(0, 20));
        
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
    console.log("Downloading file, data type:", typeof fileData);
    console.log("File data preview:", fileData ? fileData.substring(0, 50) + '...' : 'empty');
    
    try {
      // Si fileData ya es directamente una URL, usarla
      if (fileData.startsWith('blob:') || fileData.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = fileData;
        a.download = filename || 'downloaded-file';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }
      
      // Si fileData es un objeto JSON stringificado con data en base64, intentar parsearlo
      try {
        // Verificar si es un JSON string
        if (fileData.startsWith('{') && fileData.endsWith('}')) {
          const fileObj = JSON.parse(fileData);
          if (fileObj.data) {
            fileData = fileObj.data;
          }
        }
      } catch (e) {
        // No es JSON, continuar con el string original
        console.log("Not JSON data, continuing with raw string");
      }
      
      // Para asegurarnos de que es un DataURL válido
      if (!fileData.includes('base64') && !fileData.includes('data:')) {
        // Si no es un DataURL pero es base64, intentar convertirlo
        fileData = `data:application/octet-stream;base64,${fileData}`;
      }
      
      // Crear un elemento <a> para la descarga
      const a = document.createElement('a');
      a.href = fileData;
      a.download = filename || 'downloaded-file';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error al descargar el archivo:', error);
      alert('Error al descargar el archivo. Por favor, inténtalo de nuevo.');
    }
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
    // Debugging para ver conexiones
    socket.current.on('connect', () => {
      console.log('Connected to server with socket ID:', socket.current.id);
    });
    
    socket.current.on('disconnect', () => {
      console.log('Disconnected from server');
    });
    
    socket.current.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });

    socket.current.on('Id', (id) => {
      console.log('Received ID from server:', id);
      setMyID(id);
      setShowUsernameModal(true);
    });

    socket.current.on('history', (history) => {
      console.log('Received message history:', history.length, 'messages');
      setChat(history);
    });
    
    socket.current.on('file-history', (fileHistory) => {
      console.log('Received file history:', fileHistory.length, 'files');
      console.log('File history sample:', fileHistory[0] || 'No files');
      setFiles(fileHistory || []);
    });

    socket.current.on('user-joined', (payload) => {
      console.log('User joined:', payload.callerID);
      const peer = addPeer(payload.signal, payload.callerID);
      peersRef.current.push({ peerID: payload.callerID, peer });
    });

    socket.current.on('receivingReturnSignal', (payload) => {
      console.log('Received return signal from:', payload.id);
      const item = peersRef.current.find(p => p.peerID === payload.id);
      item?.peer.signal(payload.signal);
    });

    socket.current.on('new-message', (message) => {
      console.log('New message received');
      setChat(prev => [...prev, message]);
    });

    socket.current.on('new-file', (fileData: FileMessage) => {
      console.log('New file received:', fileData.name);
      // Verificar que fileData.data es un string válido
      if (fileData && fileData.data) {
        setFiles(prev => {
          // Evitar duplicados verificando si ya existe un archivo con el mismo nombre y timestamp
          const exists = prev.some(f => 
            f.name === fileData.name && 
            f.timestamp === fileData.timestamp &&
            f.sender === fileData.sender
          );
          
          if (exists) {
            console.log('File already exists in state, not adding duplicate');
            return prev;
          }
          
          return [...prev, fileData];
        });
      } else {
        console.error('Received invalid file data:', fileData);
      }
    });

    // Limpieza al desmontar
    return () => {
      socket.current.disconnect();
      socket.current.off('Id');
      socket.current.off('history');
      socket.current.off('file-history');
      socket.current.off('user-joined');
      socket.current.off('receivingReturnSignal');
      socket.current.off('new-message');
      socket.current.off('new-file');
    };
  }, []);

  // Join channel on component mount or when changing channels
  useEffect(() => {
    if (myID) {
      console.log('Joining channel:', currentChannel);
      socket.current.emit('joinChannel', currentChannel);
      
      // Solicitar explícitamente el historial de archivos
      console.log('Requesting file history for channel:', currentChannel);
      socket.current.emit('getFileHistory', currentChannel);
    }
  }, [myID, currentChannel]);

return (
  <div className="main-container h-screen flex p-4 gap-4 bg-gray-50">
  {/* COLUMNA IZQUIERDA - CONTROLES */}
  <div className="controls-column w-1/3 flex flex-col p-4 bg-white rounded-lg shadow-sm overflow-auto">
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

    {/* Boton para borrar historial de mensajes */}
    <button
      onClick={() => {
        setChat([]);
        setFiles([]);
        socket.current.emit('clearHistory', currentChannel);
      }}
      className="mb-4 bg-red-500 text-white py-2 rounded-lg hover:bg-red-600"
    >
      Borrar historial
    </button>
    
    {/* Archivos Compartidos */}
    {files.length > 0 && (
      <div className="mb-6">
        <h3 className="font-semibold mb-3">Archivos compartidos ({files.filter(f => f.channel === currentChannel).length})</h3>
        <div className="grid grid-cols-1 gap-3">
          {files
            .filter((f) => f.channel === currentChannel)
            .map((file, i) => (
              <div
                key={i}
                onClick={() => downloadFile(file.data, file.name)}
                className="p-3 bg-blue-50 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors"
              >
                <div className="text-sm font-medium truncate">{file.name}</div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-gray-500">Archivo de: {file.sender}</span>
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
              Cancel
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
  <div className="w-2/3 flex flex-col">
    <div className="flex-1 flex flex-col border border-gray-300 rounded-lg shadow-sm bg-white overflow-hidden">
      <Chat 
        chat={chat}
        username={username}
        files={files}
        currentChannel={currentChannel}
        downloadFile={downloadFile}
        onChannelChange={(channel) => {
          setCurrentChannel(channel);
          socket.current.emit('joinChannel', channel);
          // Solicitar explícitamente el historial de archivos al cambiar de canal
          socket.current.emit('getFileHistory', channel);
        }}
      />
    </div>
  </div>
</div>
);

}

export default Home;