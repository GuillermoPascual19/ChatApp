
// import Home from './views/Home'
import './App.css'
import HomeLayout from './layout/home-layout'

function App() {
  return (
    // <Home />
    <HomeLayout
      chat={[]}
      username="User"
      files={[]}
      currentChannel="general"
      onChannelChange={() => {}}
      downloadFile={() => {}}
    />
  )
}

export default App