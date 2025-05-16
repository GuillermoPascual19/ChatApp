import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import { Sun, Moon, X, Paperclip } from 'lucide-react';

const Home = () => {
  const socketRef = useRef(io('https://chatapp-87po.onrender.com', { transports: ['websocket'] }));
  const peersRef = useRef<any[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [tempName, setTempName] = useState('');
  const [visibleModal, setVisibleModal] = useState(true);
  const [msg, setMsg] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [theme, setTheme] = useState(false);
  const [chan, setChan] = useState('general');
  const [file, setFile] = useState<File | null>(null);
  const [sharedFiles, setSharedFiles] = useState<any[]>([]);

  const autoScroll = () => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const changeTheme = () => {
    const newTheme = !theme;
    setTheme(newTheme);
    localStorage.setItem('darkMode', JSON.stringify(newTheme));
  };

  const encodeFile = (f: File): Promise<string> => {
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => reader.result ? res(reader.result.toString()) : rej('Error al codificar');
      reader.onerror = () => rej('Error al leer archivo');
      reader.readAsDataURL(f);
    });
  };

  const sendMsg = async () => {
    if (!msg && !file) return;

    const time = new Date().toISOString();
    const payload = JSON.stringify({
      channel: chan,
      sender: name || 'Anónimo',
      text: msg || (file ? `Envió un archivo: ${file.name}` : ''),
      timestamp: time,
      filename: file?.name || ''
    });

    for (const { peer } of peersRef.current) peer.send(payload);

    if (file) {
      const base64 = await encodeFile(file);
      socketRef.current.emit('message', { message: payload, channel: chan, file: base64 });
    } else {
      socketRef.current.emit('message', { message: payload, channel: chan, file: null });
    }

    setMsg('');
    setFile(null);
  };

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.size <= 2 * 1024 * 1024) setFile(f);
    else alert('Archivo supera 2MB');
  };

  const fetchHistory = () => {
    socketRef.current.emit('getFileHistory', chan);
  };

  const joinChannel = (ch: string) => {
    setChan(ch);
    socketRef.current.emit('joinChannel', ch);
    fetchHistory();
  };

  const storeFile = (data: string, name: string) => {
    const link = document.createElement('a');
    link.href = data;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const createPeer = (signal: string, caller: string) => {
    const peer = new Peer({ initiator: false, trickle: false });

    peer.on('signal', s => {
      socketRef.current.emit('returnSignal', { signal: s, callerID: caller });
    });

    peer.signal(signal);
    peer.on('data', d => setLog(prev => [...prev, d.toString()]));

    return peer;
  };
   useEffect(() => {
    socketRef.current.on('Id', userId => {
      console.log(id)
      setId(userId);
      setVisibleModal(true);
    });

    socketRef.current.on('history', data => setLog(data));
    socketRef.current.on('new-message', data => setLog(prev => [...prev, data]));
    
    socketRef.current.on('file-history', (files) => {
      if (Array.isArray(files)) {
        setSharedFiles(files);
      }
    });

    socketRef.current.on('new-file', fileData => {
      setSharedFiles(prev => {
        const exists = prev.some(f => f.timestamp === fileData.timestamp && f.sender === fileData.sender);
        return exists ? prev : [...prev, fileData];
      });
    });

    socketRef.current.on('user-joined', ({ signal, callerID }) => {
      const peer = createPeer(signal, callerID);
      peersRef.current.push({ peerID: callerID, peer });
    });

    socketRef.current.on('receivingReturnSignal', ({ signal, id }) => {
      const item = peersRef.current.find(p => p.peerID === id);
      item?.peer.signal(signal);
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  useEffect(() => {
    if (name && chan) {
      socketRef.current.emit('joinChannel', chan);
      const delay = setTimeout(() => fetchHistory(), 300);
      return () => clearTimeout(delay);
    }
  }, [name, chan]);

  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    setTheme(saved ? JSON.parse(saved) : window.matchMedia('(prefers-color-scheme: dark)').matches);
  }, []);

  useEffect(() => {
    autoScroll();
  }, [log, sharedFiles]);

  return (
    <div className={`main-container ${theme ? 'dark' : ''}`}>
      <button onClick={changeTheme} className="dark-mode-toggle">
        {theme ? <Sun /> : <Moon />}
      </button>

      <div className="controls-column">
        {visibleModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-700 p-6 rounded-lg shadow-lg w-80">
              <h2 className="text-xl font-bold mb-4 dark:text-white">Tu nombre</h2>
              <input
                value={tempName}
                onChange={e => setTempName(e.target.value)}
                placeholder="Nombre"
                className="w-full p-2 mb-4 border rounded-lg dark:bg-gray-600 dark:text-white"
              />
              <button
                onClick={() => {
                  if (tempName.trim()) {
                    setName(tempName);
                    socketRef.current.emit('setUsername', tempName);
                    setVisibleModal(false);
                  }
                }}
                className="w-full bg-blue-500 text-white py-2 rounded-lg"
              >
                Entrar
              </button>
            </div>
          </div>
        )}

        <h2 className="font-semibold dark:text-white mb-2">Enviar Mensaje</h2>
        <input
          value={msg}
          onChange={e => setMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMsg()}
          className="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:text-white"
          placeholder="Escribe..."
        />
        <div className="flex gap-2 mb-2">
          <input id="fileInput" type="file" className="hidden" onChange={pickFile} />
          <label
            htmlFor="fileInput"
            className={`flex-1 p-2 text-center rounded-lg cursor-pointer border ${
              file ? 'bg-green-100 text-green-700' : 'bg-white dark:bg-gray-600'
            }`}
          >
            {file ? 'Archivo listo' : 'Seleccionar archivo'}
          </label>
          <button
            onClick={sendMsg}
            disabled={!msg && !file}
            className="flex-1 p-2 bg-blue-500 text-white rounded-lg"
          >
            Enviar
          </button>
        </div>

        {file && (
          <div className="p-2 rounded bg-blue-50 dark:bg-gray-700 mb-4 flex justify-between">
            <span>{file.name}</span>
            <button onClick={() => setFile(null)}><X /></button>
          </div>
        )}

        {sharedFiles.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 font-semibold dark:text-white">Archivos</h3>
            <div className="space-y-1">
              {sharedFiles.filter(f => f.channel === chan).map((f, i) => (
                <div
                  key={i}
                  className="p-2 bg-blue-100 dark:bg-gray-800 rounded cursor-pointer flex justify-between"
                  onClick={() => storeFile(f.data, f.name)}
                >
                  <span className="truncate">{f.sender}</span>
                  <span className="text-xs">{new Date(f.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="chat-column">
        <h1 className="text-2xl font-bold dark:text-white mb-4">Chat #{chan}</h1>
        <div className="channels-container mb-4">
          {['general', 'auxiliar'].map(c => (
            <button
              key={c}
              className={`channel-btn ${chan === c ? 'active' : ''}`}
              onClick={() => joinChannel(c)}
            >
              #{c}
            </button>
          ))}
        </div>

        <div className="chat-messages">
          {log.length === 0 ? (
            <div className="text-center text-gray-500 py-6">Sin mensajes aún</div>
          ) : (
            log.map((m, idx) => {
              try {
                const parsed = JSON.parse(m);
                const isMe = parsed.sender === name;
                const fileLink = sharedFiles.find(f =>
                  f.sender === parsed.sender &&
                  Math.abs(new Date(f.timestamp).getTime() - new Date(parsed.timestamp).getTime()) < 1000
                );

                return (
                  <div key={idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-2`}>
                    <div className={`message-bubble ${isMe ? 'own' : 'other'}`}>
                      <div className="message-content">
                        <span className="message-sender">{parsed.sender}:</span>
                        <span className="message-text">{parsed.text}</span>
                      </div>
                      <div className="message-time">
                        {new Date(parsed.timestamp).toLocaleTimeString()}
                      </div>
                      {fileLink && (
                        <button
                          className="mt-1 text-xs text-blue-200 hover:underline flex items-center"
                          onClick={() => storeFile(fileLink.data, fileLink.name)}
                        >
                          <Paperclip size={12} />
                          <span className="ml-1">Descargar</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              } catch {
                return (
                  <div key={idx} className="text-sm bg-gray-200 dark:bg-gray-700 p-2 rounded">
                    {m}
                  </div>
                );
              }
            })
          )}
          <div ref={endRef} />
        </div>
      </div>
    </div>
  );
};

export default Home;