/*
// Authors:
// - Óscar Serrano Ramos
// - Jesús Vazquez Gorjón
// - Guillermo Pascual Mangas
*/ 

import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import { Sun, Moon, X } from 'lucide-react';

interface PeerRef {
  peerID: string;
  peer: InstanceType<typeof Peer>;
}

interface FileMessage {
  data: string;
  sender: string;
  timestamp: string;
  channel: string;
  name?: string;
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

  const socket = useRef(io('https://chatapp-87po.onrender.com', { transports: ['websocket'] }));

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
      sender: username || 'Anonymous',
      text: message || (file ? `Shared file: ${file.name}` : ''),
      timestamp: timestamp,
      filename: file?.name
    });
    
    peersRef.current.forEach(({ peer }) => {
      peer.send(formattedMessage);
    });

    if (file) {
      try {
        const fileData = await toBase64(file);
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
    }
  };

  const downloadFile = (fileData: string, filename: string) => {
    const link = document.createElement('a');
    link.href = fileData;
    link.download = filename || 'file';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  function toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result?.toString() || '');
      reader.onerror = () => reject('Error reading file');
      reader.readAsDataURL(file);
    });
  }
  
  const changeChannel = (channel: string) => {
    setCurrentChannel(channel);
    socket.current.emit('joinChannel', channel);
    socket.current.emit('getFileHistory', channel);
  };

  useEffect(() => {
    socket.current.on('Id', (id) => {
      console.log('My ID:', id, myID);
      setMyID(id);
      setShowUsernameModal(true);
    });

    socket.current.on('history', (history) => {
      setChat(history);
    });

    socket.current.on('file-history', (fileHistory) => {
      if (Array.isArray(fileHistory)) {
        setFiles(fileHistory);
      }
    });

    socket.current.on('new-file', (fileData: FileMessage) => {
      setFiles(prev => [...prev, fileData]);
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

    return () => {
      socket.current.disconnect();
    };
  }, []);

  useEffect(() => {
    if (username && currentChannel) {
      socket.current.emit('joinChannel', currentChannel);
      const timeout = setTimeout(() => {
        socket.current.emit('getFileHistory', currentChannel);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [username, currentChannel]);

  useEffect(() => {
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode) {
      setDarkMode(JSON.parse(savedMode));
    } else {
      setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
  }, []);

  return (
    <div className={`main-container ${darkMode ? 'dark' : ''}`}>
      <button 
        onClick={toggleDarkMode}
        className="fixed bottom-4 right-4 p-3 rounded-full bg-blue-500 text-white shadow-lg z-50"
      >
        {darkMode ? <Sun/> : <Moon />}
      </button>

      <div className="controls-column dark:bg-gray-800 dark:border-gray-700">
        {showUsernameModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-700 p-6 rounded-lg shadow-lg w-80">
              <h2 className="text-xl font-bold mb-4 dark:text-white">Choose username</h2>
              <input
                type="text"
                value={tempUsername}
                onChange={(e) => setTempUsername(e.target.value)}
                placeholder="Username"
                className="w-full p-2 mb-4 border rounded-lg dark:bg-gray-600 dark:border-gray-500 dark:text-white"
              />
              <button
                onClick={handleSetUsername}
                className="w-full bg-blue-500 text-white py-2 rounded-lg dark:bg-blue-600"
              >
                Confirm
              </button>
            </div>
          </div>
        )}

        {files.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold mb-3 dark:text-white">Shared files</h3>
            <div className="grid grid-cols-1 gap-2">
              {files
                .filter((file) => file.channel === currentChannel)
                .map((file, i) => (
                  <div
                    key={i}
                    onClick={() => downloadFile(file.data, file.name || `file-${i}`)}
                    className="p-3 bg-blue-50 dark:bg-gray-700 rounded-lg cursor-pointer dark:text-gray-200"
                  >
                    File from {file.sender}
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="flex-1">
          <h2 className="text-lg font-semibold mb-4 dark:text-white">Send Message</h2>
          <div className="space-y-4">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            />
            
            <div className="flex gap-2">
              <input type="file" onChange={handleFile} className="hidden" id="fileInput" />
              <label htmlFor="fileInput" className="flex-1 p-2 text-center rounded-lg cursor-pointer">
                {file ? 'File ready' : 'Select file'}
              </label>
              <button
                onClick={handleSendMessage}
                disabled={!message && !file}
                className="flex-1 p-2 rounded-lg bg-blue-500 text-white"
              >
                Send
              </button>
            </div>
          </div>

          {file && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-gray-700 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm truncate dark:text-gray-200">{file.name}</span>
                <button onClick={() => setFile(null)}>
                  <X />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-auto pt-4 border-t dark:border-gray-700">
          <div className="bg-white dark:bg-gray-700 p-3 rounded-lg">
            <p className="font-semibold dark:text-white">{username || 'Anonymous'}</p>
            <p className="text-sm dark:text-gray-300">Channel: #{currentChannel}</p>
          </div>
        </div>
      </div>

      <div className="chat-column dark:bg-gray-900">
        <div className="mb-6">
          <h1 className="text-2xl font-bold dark:text-white">
            P2P Chat - <span className="text-blue-600 dark:text-blue-400">{username || 'Anonymous'}</span>
          </h1>
        </div>

        <div className="channels-container">
          {['general', 'auxiliar'].map((channel) => (
            <button
              key={channel}
              onClick={() => changeChannel(channel)}
              className={`channel-btn ${currentChannel === channel ? 'active' : ''}`}
            >
              #{channel}
            </button>
          ))}
        </div>

        <div className="message-area">
          <div className="chat-messages">
            {chat.length === 0 ? (
              <div className="text-center dark:text-gray-400 py-8">
                No messages in this channel
              </div>
            ) : (
              chat.map((msg, i) => {
                try {
                  const messageObj = JSON.parse(msg);
                  const isCurrentUser = messageObj.sender === username;
                  
                  return (
                    <div key={i} className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-2`}>
                      <div className={`message-bubble ${isCurrentUser ? 'own' : 'other'}`}>
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
                      </div>
                    </div>
                  );
                } catch {
                  return (
                    <div key={i} className="p-2 dark:bg-gray-700 rounded-lg dark:text-gray-200 text-sm mb-2">
                      {msg}
                    </div>
                  );
                }
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;