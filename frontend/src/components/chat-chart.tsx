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
            onClick={() => onChannelChange(channel)}
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
  );
};

export default Chat;