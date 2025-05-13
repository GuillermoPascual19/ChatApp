// HomeLayout.tsx
import Home from '../views/Home';
import Chat from '../components/chat-chart';

interface FileMessage {
  name: string;
  size: number;
  data: string;
  sender: string;
  timestamp: string;
  channel: string;
}

interface HomeLayoutProps {
  chat: string[];
  username: string;
  files: FileMessage[];
  currentChannel: string;
  onChannelChange: (channel: string) => void;
  downloadFile: (data: string, filename: string) => void;
}

const HomeLayout = ({
  chat,
  username,
  files,
  currentChannel,
  onChannelChange,
  downloadFile
}: HomeLayoutProps) => {
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Título arriba del todo */}
      <div className="bg-white shadow-sm py-4 px-6">
        <h2 className="text-xl font-semibold">
          Chat P2P
        </h2>
      </div>
      
      {/* Contenido principal dividido en dos columnas */}
      <div className="flex flex-1 overflow-hidden">
        {/* Columna izquierda - Controles (1/3) */}
        <div className="w-1/3 border-r border-gray-200 overflow-auto p-4">
          <Home />
        </div>
        
        {/* Columna derecha - Chat (2/3) */}
        <div className="w-2/3 flex flex-col">
          <div className="flex-1 flex flex-col border border-gray-300 rounded-lg shadow-sm bg-white overflow-hidden m-4">
            <Chat 
              chat={chat}
              username={username}
              files={files}
              currentChannel={currentChannel}
              downloadFile={downloadFile}
              onChannelChange={onChannelChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomeLayout;