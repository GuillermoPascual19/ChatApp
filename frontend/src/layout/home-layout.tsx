// HomeLayout.tsx
import Home from '../views/Home';
import Chat from '../components/chat-chart';

const HomeLayout = () => {
  return (
    <div className="flex flex-col h-screen">
      {/* Título arriba del todo */}
      <div className="bg-white shadow-sm py-4 px-6">
        <h2 className="text-xl font-semibold">
          Chat P2P
        </h2>
      </div>
      
      {/* Contenido principal dividido en dos columnas */}
      <div className="flex flex-1 overflow-hidden">
        {/* Columna izquierda - Home */}
        <div className="w-1/3 border-r border-gray-200 overflow-auto">
          <Home />
        </div>
        
        {/* Columna derecha - Chat */}
        <div className="w-2/3 overflow-auto">
          <Chat 
            chat={[]}
            username=""
            files={[]}
            currentChannel="general"
            downloadFile={() => {}}
            onChannelChange={() => {}}
          />
        </div>
      </div>
    </div>
  );
}

export default HomeLayout;