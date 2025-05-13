import React from 'react';

interface FileMessage {
  name: string;
  size: number;
  data: string;
  sender: string;
  timestamp: string;
  channel: string;
}

interface ChatProps {
  chat: string[];
  username: string;
  files: FileMessage[];
  currentChannel: string;
  downloadFile: (data: string, filename: string) => void;
  onChannelChange: (channel: string) => void;
}

const Chat: React.FC<ChatProps> = ({
  chat,
  username,
  files,
  currentChannel,
  downloadFile,
  onChannelChange
}) => {
  return (
    <div className="chat-container bg-white rounded-lg border border-gray-300 shadow-sm flex flex-col" style={{ height: '500px' }}>
      {/* Header del chat */}
      <div className="p-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">
            Chat P2P - <span className="text-blue-600">{username || 'Anónimo'}</span>
          </h2>
          
          {/* Selector de Canal */}
          <div className="flex gap-2">
            {['general', 'auxiliar'].map((channel) => (
              <button
                key={channel}
                onClick={() => onChannelChange(channel)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  currentChannel === channel
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                #{channel}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Área de mensajes con scroll interno */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {chat.length === 0 ? (
          <div className="text-center text-gray-500 py-4">
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
                    className={`p-2 rounded-lg max-w-[80%] ${
                      isCurrentUser 
                        ? 'bg-green-100 rounded-tr-none' 
                        : 'bg-blue-100 rounded-tl-none'
                    }`}
                  >
                    <div className="font-semibold text-xs text-gray-700">
                      {messageObj.sender}
                    </div>
                    <div className="mt-1 text-sm text-gray-900">
                      {messageObj.text}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {new Date(messageObj.timestamp).toLocaleTimeString()}
                    </div>
                    {files[i] && (
                      <button 
                        onClick={() => downloadFile(files[i].data, `file-${i}`)}
                        className="mt-1 text-xs text-blue-600 hover:underline flex items-center"
                      >
                        Descargar archivo
                      </button>
                    )}
                  </div>
                </div>
              );
            } catch {
              return (
                <div key={i} className="p-2 bg-gray-100 rounded-lg text-sm">
                  {msg}
                </div>
              );
            }
          })
        )}
      </div>
    </div>
  );
};

export default Chat;