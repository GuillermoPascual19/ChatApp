import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Paperclip, Loader2 } from 'lucide-react';

interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  channel: string;
  isFile?: boolean;
  fileName?: string;
}

interface User {
  id: string;
  isCoordinator?: boolean;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

const Home = () => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Record<string, Message[]>>({
    general: [],
    random: [],
    help: []
  });
  const [currentChannel, setCurrentChannel] = useState('general');
  const [users, setUsers] = useState<User[]>([]);
  const [isCoordinator, setIsCoordinator] = useState(false);
  const [myId, setMyId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll al final de los mensajes
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages[currentChannel]]);

  useEffect(() => {
    setIsLoading(true);
    setConnectionStatus('connecting');
    
    const socket = io('https://chatapp-87po.onrender.com', {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnectionStatus('connected');
      setMyId(socket.id || '');
      socket.emit('join-channel', currentChannel, (response: any) => {
        if (response.status === 'success') {
          setIsCoordinator(response.isCoordinator);
          setMessages(prev => ({
            ...prev,
            [currentChannel]: response.messages || []
          }));
          setUsers(response.users.map((id: string) => ({
            id,
            isCoordinator: id === response.coordinator
          })));
        }
        setIsLoading(false);
      });
    });

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    socket.on('connect_error', () => {
      setConnectionStatus('error');
    });

    socket.on('new-message', (newMessage: Message) => {
      if (newMessage.channel === currentChannel) {
        setMessages(prev => ({
          ...prev,
          [currentChannel]: [...prev[currentChannel], newMessage]
        }));
      }
    });

    socket.on('user-joined', (data: { userId: string; users: string[] }) => {
      setUsers(data.users.map(id => ({
        id,
        isCoordinator: id === getChannelCoordinator()
      })));
    });

    socket.on('user-left', (data: { userId: string; users: string[] }) => {
      setUsers(data.users.map(id => ({
        id,
        isCoordinator: id === getChannelCoordinator()
      })));
    });

    socket.on('role-update', ({ isCoordinator: coordinator }: { isCoordinator: boolean }) => {
      setIsCoordinator(coordinator);
    });

    return () => {
      socket.disconnect();
    };
  }, [currentChannel]);

  const getChannelCoordinator = () => {
    return users.find(user => user.isCoordinator)?.id || null;
  };

  const handleSendMessage = () => {
    if (!message.trim() || !socketRef.current) return;

    setIsLoading(true);
    socketRef.current.emit('send-message', message, (response: any) => {
      if (response.status === 'success') {
        setMessage('');
      }
      setIsLoading(false);
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !socketRef.current) {
      e.target.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      alert('El archivo excede el límite de 2MB');
      e.target.value = '';
      return;
    }

    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const fileData = event.target?.result as string;
      socketRef.current?.emit('send-file', {
        name: file.name,
        data: fileData
      }, () => {
        setIsLoading(false);
        e.target.value = '';
      });
    };
    reader.readAsDataURL(file);
  };

  const changeChannel = (channel: string) => {
    if (channel === currentChannel || isLoading) return;
    
    setIsLoading(true);
    setCurrentChannel(channel);
    socketRef.current?.emit('join-channel', channel, (response: any) => {
      if (response.status === 'success') {
        setIsCoordinator(response.isCoordinator);
        setMessages(prev => ({
          ...prev,
          [channel]: response.messages || []
        }));
        setUsers(response.users.map((id: string) => ({
          id,
          isCoordinator: id === response.coordinator
        })));
      }
      setIsLoading(false);
    });
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r p-4 flex flex-col">
        <h2 className="text-xl font-bold mb-4">Canales</h2>
        <div className="space-y-2 mb-6 flex-1">
          {['general', 'random', 'help'].map(channel => (
            <div
              key={channel}
              className={`p-2 rounded cursor-pointer flex justify-between items-center ${
                currentChannel === channel ? 'bg-blue-100' : 'hover:bg-gray-100'
              } ${isLoading ? 'opacity-50' : ''}`}
              onClick={() => changeChannel(channel)}
            >
              <span>#{channel}</span>
              <span className="text-xs bg-gray-200 px-2 py-1 rounded-full">
                {messages[channel]?.length || 0}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-auto">
          <h2 className="text-xl font-bold mb-4">Usuarios ({users.length})</h2>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {users.map(user => (
              <div
                key={user.id}
                className={`p-2 rounded flex items-center ${
                  user.id === myId ? 'bg-green-50' : 'bg-gray-50'
                }`}
              >
                <div className={`w-2 h-2 rounded-full mr-2 ${
                  user.id === myId ? 'bg-green-500' :
                  user.isCoordinator ? 'bg-blue-500' : 'bg-gray-400'
                }`}></div>
                <div className="truncate flex-1">
                  {user.id === myId ? 'Tú' : user.id}
                </div>
                {user.isCoordinator && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded ml-2">
                    Coord
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className={`mt-2 text-xs ${
            connectionStatus === 'connected' ? 'text-green-500' :
            connectionStatus === 'error' ? 'text-red-500' : 'text-yellow-500'
          }`}>
            {connectionStatus === 'connected' ? 'Conectado' :
             connectionStatus === 'error' ? 'Error de conexión' : 'Conectando...'}
            {connectionStatus === 'connected' && (
              <span className="ml-1">• {myId}</span>
            )}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b flex justify-between items-center bg-white">
          <h1 className="text-xl font-bold">#{currentChannel}</h1>
          <div className="flex items-center">
            {isCoordinator && (
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mr-2">
                Coordinador
              </span>
            )}
            {isLoading && <Loader2 className="animate-spin h-5 w-5 text-gray-500" />}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {messages[currentChannel]?.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              No hay mensajes en este canal. ¡Envía el primero!
            </div>
          ) : (
            messages[currentChannel]?.map(msg => (
              <div
                key={msg.id}
                className={`mb-4 p-3 rounded-lg max-w-[80%] ${
                  msg.sender === myId ? 'bg-blue-100 ml-auto' : 'bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center">
                    <div className={`w-2 h-2 rounded-full mr-2 ${
                      msg.sender === myId ? 'bg-blue-500' : 'bg-gray-500'
                    }`}></div>
                    <div className="font-semibold text-sm">
                      {msg.sender === myId ? 'Tú' : msg.sender}
                      {users.find(u => u.id === msg.sender)?.isCoordinator && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-1 py-0.5 rounded ml-1">
                          Coord
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatTime(msg.timestamp)}
                  </div>
                </div>
                
                {msg.isFile ? (
                  <a
                    href={msg.content}
                    download={msg.fileName}
                    className="mt-1 inline-flex items-center text-blue-600 hover:underline"
                  >
                    <Paperclip className="mr-1" size={16} />
                    {msg.fileName}
                  </a>
                ) : (
                  <div className="mt-1 whitespace-pre-wrap">{msg.content}</div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t bg-white">
          <div className="flex items-center mb-1">
            <label className={`p-2 rounded-full mr-2 cursor-pointer ${
              isLoading ? 'text-gray-400' : 'text-gray-600 hover:bg-gray-200'
            }`}>
              <Paperclip size={20} />
              <input
                type="file"
                className="hidden"
                onChange={handleFileUpload}
                accept="image/*,.pdf,.doc,.docx,.txt"
                disabled={isLoading}
              />
            </label>
            <input
              type="text"
              className={`flex-1 border rounded-l-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isLoading ? 'bg-gray-100' : ''
              }`}
              placeholder="Escribe un mensaje..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSendMessage()}
              disabled={isLoading}
            />
            <button
              className={`bg-blue-500 text-white rounded-r-lg px-4 py-2 ${
                isLoading || !message.trim() ? 'opacity-50' : 'hover:bg-blue-600'
              }`}
              onClick={handleSendMessage}
              disabled={isLoading || !message.trim()}
            >
              {isLoading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Enviar'}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Límite de archivos: 2MB • Presiona Enter para enviar
          </p>
        </div>
      </div>
    </div>
  );
};

export default Home;