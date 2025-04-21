import React from 'react'
import { useEffect, useState } from 'react'
import { io} from 'socket.io-client'

const Home = () => {

    const [isLoading, setIsLoading] = React.useState(true)
    const [message, setMessage] = useState('')
    const [messages, setMessages] = useState<{ from: string, body: string}[]>([])

    const socket = io('http://localhost:5000')

    const yourName = 'Me'
    
    const handleSendMessage = () => {
        socket.emit('message', message)
        setMessage('')
    }

    useEffect(() => {
        socket.on('connect', () => {
            console.log('Connected to server')
            setIsLoading(false)
            console.log('Finished loading')
        })

        socket.on('message', (msg) => {
            console.log('Received message:', msg)
            setMessages((prev) => [...prev, msg])
        });

        return () => {
            socket.off('connect')
            socket.off('message')
            socket.disconnect()
        }
    }, [])

    return (
    <>
        {
            isLoading ? (
                <div className="flex justify-center items-center h-screen">
                    Loading...
                </div>
            ) : (
                <div className="flex flex-col h-screen p-4 bf-gray-100">
                    <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                        {messages.map((msg, index) => (
                            <div key={index} className='boder-b p-2'>
                                <strong>{msg.from}</strong>: {msg.body}
                            </div>
                            
                        ))}
                    </div>
                    <div className='flex items-center'>
                        <input type='text' placeholder='Type a message...' 
                            className='border rounded p-2 w-full'
                            value={message}
                            onChange={(e) => setMessage(e.target.value)} 
                        />
                        <button className='bg-blue-500 text-white rounded p-2 ml-2' 
                            onClick={handleSendMessage}
                            >
                            Send
                        </button>
                    </div>
                </div>
            )
        }
    </>
  )
}

export default Home