// HOME.tsx (Frontend)
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';

interface PeerRef {
  peerID: string;
  peer: InstanceType<typeof Peer>;
}

const Home = () => {
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState<{ text: string; file?: { name: string; type?: string; data: string; size: number } | null; timestamp?: string }[]>([]);
  const [myID, setMyID] = useState('');
  const [currentChannel, setCurrentChannel] = useState('general');
  const [file, setFile] = useState<File | null>(null);
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

  // Message Handling
  const handleSendMessage = async () => {
    if (!message && !file) return;

    const formattedMessage = `[${currentChannel}] [${myID}]: ${message}`;
    
    // Send to peers
    peersRef.current.forEach(({ peer }) => {
      peer.send(formattedMessage);
    });

    // Send to coordinator for history
    socket.current.emit('message', {
      message: formattedMessage,
      channel: currentChannel,
      file: file ? await toBase64(file) : null
    });

    setChat(prev => [...prev, { text: `[Me]: ${message}` }]);
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
      socket.current.emit('joinChannel', currentChannel);
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

    return () => {
      socket.current.disconnect();
    };

  }, []);

  return (
    <div className="flex flex-col h-screen p-4 bg-gray-100">
      <h1 className="text-lg font-bold mb-4">P2P Chat (ID: {myID})</h1>
      
      <div className="flex gap-2 mb-4">
        {['general', 'tech', 'random'].map(channel => (
          <button 
            key={channel}
            onClick={() => {
              setCurrentChannel(channel);
              socket.current.emit('joinChannel', channel);
            }}
            className={`px-4 py-2 rounded ${currentChannel === channel ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            #{channel}
          </button>
        ))}
      </div>


        
        






      <div className="flex-1 overflow-y-auto mb-4 bg-white rounded p-4">
        {chat.map((msg, i) => (
          <div key={i} className="mb-2 p-2 bg-gray-50 rounded">{msg.text}</div>
        ))}
      </div>
{/* sd */}
<div className="flex-1 overflow-y-auto mb-4 bg-white rounded p-4">
    {chat.map((msg, i) => (
      <div key={i} className="mb-2 p-2 bg-gray-50 rounded">
        <div>{typeof msg === 'string' ? msg : msg.text}</div>
        {msg.file && (
          <a 
            href={msg.file.data} 
            download={msg.file.name}
            className="text-blue-500 flex items-center mt-1"
          >
            📎 {msg.file.name} 
            <span className="text-xs ml-2">({(msg.file.size/1024).toFixed(1)}KB)</span>
          </a>
        )}
      </div>
    ))}
  </div>


{/* df */}
      <div className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 border rounded p-2"
        />
        <input
          type="file"
          onChange={handleFile}
          className="hidden"
          id="fileInput"
        />
        <label
          htmlFor="fileInput"
          className="bg-gray-200 p-2 rounded cursor-pointer"
        >
          📎
        </label>
        <button
          onClick={handleSendMessage}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default Home;

