import React from 'react';
import Home from '../views/Home';


const HomeLayout = () => {
  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto px-4 py-8">
          <h2 className="text-lg font-semibold">
            Chat P2P
          </h2>
        </div>
      </div>
    </div>
  );
}

export default HomeLayout;