import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import { Sun, Moon, X, Paperclip } from 'lucide-react';

interface PeerRef {
  peerID: string;
  peer: InstanceType<typeof Peer>;
}

interface FileMessage {
  name: string;
  path: string;
  sender: string;
  timestamp: string;
  channel: string;
  size?: number;
  type?: string;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const socket = useRef(io('http://localhost:5000', { transports: ['websocket'] }));

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    localStorage.setItem('darkMode', JSON.stringify(!darkMode));
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chat, files]);

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

  const handleSetUsername = () => {
    if (tempUsername.trim()) {
      setUsername(tempUsername);
      socket.current.emit('setUsername', tempUsername);
      setShowUsernameModal(false);
    }
  };

  const handleSendMessage = async () => {
    if (!message && !file) return;

    const timestamp = new Date().toISOString();
    const formattedMessage = JSON.stringify({
      channel: currentChannel,
      sender: username || 'Anónimo',
      text: message,
      timestamp: timestamp
    });

    peersRef.current.forEach(({ peer }) => {
      peer.send(formattedMessage);
    });

    if (file) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('channel', currentChannel);
        formData.append('sender', username || 'Anónimo');
        formData.append('message', formattedMessage);

        const response = await fetch('http://localhost:5000/upload', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) throw new Error('Error al subir el archivo');

        const fileData = await response.json();
        setFiles(prev => [...prev, fileData.file]);

      } catch (error) {
        console.error('Error subiendo archivo:', error);
        alert('Error al subir el archivo');
      }
    } else {
      socket.current.emit('message', {
        message: formattedMessage,
        channel: currentChannel,
        file: null
      });
    }

    setMessage('');
    setFile(null);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.size <= 2 * 1024 * 1024) {
      setFile(selectedFile);
    } else {
      alert('File size exceeds 2MB limit');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const downloadFile = async (filePath: string, filename: string) => {
    try {
      const response = await fetch(`http://localhost:5000/files/${filePath}`);
      if (!response.ok) throw new Error('Error al descargar');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'descarga';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error descargando archivo:', error);
      alert('Error al descargar el archivo');
    }
  };

  const changeChannel = (channel: string) => {
    setCurrentChannel(channel);
    socket.current.emit('joinChannel', channel);
    socket.current.emit('getFileHistory', channel);
  };

  useEffect(() => {
    socket.current.on('Id', (id) => {
      setMyID(id);
      setShowUsernameModal(true);
    });

    socket.current.on('history', (history) => {
      setChat(history);
    });

    socket.current.on('file-history', (fileHistory) => {
      setFiles(fileHistory || []);
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

  useEffect(() => {
    if (myID) {
      socket.current.emit('joinChannel', currentChannel);
      socket.current.emit('getFileHistory', currentChannel);
    }
  }, [myID]);

  useEffect(() => {
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode) {
      setDarkMode(JSON.parse(savedMode));
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setDarkMode(prefersDark);
    }
  }, []);

  return (
    <div className={`flex h-screen ${darkMode ? 'dark bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      {/* Sidebar */}
      <div className="w-1/4 border-r p-4 flex flex-col dark:border-gray-700 dark:bg-gray-800">
        {/* User Info */}
        <div className="mb-6 p-4 rounded-lg bg-white dark:bg-gray-700 shadow">
          <p className="font-bold">{username || 'Anónimo'}</p>
          <p className="text-sm">Canal: #{currentChannel}</p>
        </div>

        {/* Shared Files */}
        <div className="mb-6">
          <h3 className="font-bold mb-3">Archivos compartidos</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {files
              .filter((f) => f.channel === currentChannel)
              .map((file, i) => (
                <div
                  key={i}
                  onClick={() => downloadFile(file.path, file.name)}
                  className="p-2 rounded cursor-pointer hover:bg-blue-100 dark:hover:bg-gray-700 flex justify-between items-center"
                >
                  <span className="truncate flex-1">{file.name}</span>
                  <span className="text-xs opacity-70">
                    {new Date(file.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Message Input */}
        <div className="mt-auto space-y-4">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Escribe tu mensaje..."
            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          />
          
          <div className="flex gap-2">
            <input
              type="file"
              onChange={handleFile}
              className="hidden"
              id="fileInput"
              ref={fileInputRef}
            />
            <label
              htmlFor="fileInput"
              className={`flex-1 p-2 text-center rounded cursor-pointer border ${
                file ? 'border-green-500 bg-green-100 dark:bg-green-900' : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              {file ? file.name : 'Seleccionar archivo'}
            </label>
            <button
              onClick={handleSendMessage}
              disabled={!message && !file}
              className={`flex-1 p-2 rounded ${
                (!message && !file) ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              Enviar
            </button>
          </div>

          {file && (
            <div className="p-2 bg-blue-50 dark:bg-gray-700 rounded flex justify-between items-center">
              <span className="truncate">{file.name}</span>
              <button onClick={() => setFile(null)} className="text-red-500">
                <X size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col p-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">
            Chat P2P - <span className="text-blue-600 dark:text-blue-400">{username || 'Anónimo'}</span>
          </h1>
          <div className="flex gap-2">
            {['general', 'auxiliar'].map((channel) => (
              <button
                key={channel}
                onClick={() => changeChannel(channel)}
                className={`px-4 py-1 rounded ${
                  currentChannel === channel 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                #{channel}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto mb-4 space-y-2">
          {chat.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No hay mensajes en este canal
            </div>
          ) : (
            chat.map((msg, i) => {
              try {
                const messageObj: MessageObj = JSON.parse(msg);
                const isCurrentUser = messageObj.sender === username;
                
                const associatedFile = files.find(f => 
                  f.sender === messageObj.sender && 
                  new Date(f.timestamp).getTime() - new Date(messageObj.timestamp).getTime() < 1000
                );
                
                return (
                  <div key={i} className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-lg ${
                      isCurrentUser 
                        ? 'bg-blue-500 text-white rounded-br-none' 
                        : 'bg-gray-200 dark:bg-gray-700 rounded-bl-none'
                    }`}>
                      <div className="font-semibold">{messageObj.sender}</div>
                      <div>{messageObj.text}</div>
                      <div className="text-xs opacity-70 mt-1">
                        {new Date(messageObj.timestamp).toLocaleTimeString()}
                      </div>
                      {associatedFile && (
                        <button 
                          onClick={() => downloadFile(associatedFile.path, associatedFile.name)}
                          className="mt-1 text-xs flex items-center hover:underline"
                        >
                          <Paperclip size={12} className="mr-1" />
                          Descargar archivo
                        </button>
                      )}
                    </div>
                  </div>
                );
              } catch {
                return (
                  <div key={i} className="p-2 bg-gray-100 dark:bg-gray-700 rounded">
                    {msg}
                  </div>
                );
              }
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Dark Mode Toggle */}
      <button 
        onClick={toggleDarkMode}
        className="fixed bottom-4 right-4 p-3 rounded-full bg-blue-500 text-white shadow-lg"
      >
        {darkMode ? <Sun /> : <Moon />}
      </button>

      {/* Username Modal */}
      {showUsernameModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-700 p-6 rounded-lg shadow-lg w-80">
            <h2 className="text-xl font-bold mb-4">Elige tu nombre</h2>
            <input
              type="text"
              value={tempUsername}
              onChange={(e) => setTempUsername(e.target.value)}
              placeholder="Nombre de usuario"
              className="w-full p-2 mb-4 border rounded dark:bg-gray-600 dark:border-gray-500"
              onKeyPress={(e) => e.key === 'Enter' && handleSetUsername()}
            />
            <button
              onClick={handleSetUsername}
              className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;