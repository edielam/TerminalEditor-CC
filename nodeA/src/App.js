import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { FaComments, FaFolderOpen } from 'react-icons/fa';
import './app.css';
import TerminalComponent from './Terminal';
import EditorComponent from './EditorComp';

function App() {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [showChat, setShowChat] = useState(false);
  const [showFileExplorer, setShowFileExplorer] = useState(false);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000); // Fetch messages every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchMessages = async () => {
    try {
      if (window.__TAURI_IPC__) {
        console.log('Fetching messages');
        const response = await invoke('get_messages');
        console.log('Messages fetched:', response);
        setMessages(response);
      } else {
        console.log('Tauri environment not detected.');
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  };

  const handleSendMessage = async () => {
    if (message.trim()) {
      try {
        console.log('Sending message:', message);
        await invoke('send_message', { message });
        setMessage('');
        fetchMessages();
      } catch (error) {
        console.error('Failed to send message:', error);
      }
    }
  };

  const handleToggleChat = () => {
    setShowChat(!showChat);
  };

  const handleToggleFileExplorer = () => {
    setShowFileExplorer(!showFileExplorer);
  };

  return (
    <div className="App">
      <div className="icon-bar">
        <FaFolderOpen onClick={handleToggleFileExplorer} />
        <FaComments onClick={handleToggleChat} />
      </div>
      {showFileExplorer && (
        <div className="sidebar">
        </div>
      )}
      <div className='editor' style={{ width: showFileExplorer ? (showChat ? '33.33%' : '66.66%') : (showChat ? '66.66%' : '100%') }}>
        <div className='code-editor'>
          <EditorComponent/>
          <div className="terminal" style={{height:'29vh'}}>
            <TerminalComponent />
          </div>
        </div>
      </div>
      {showChat && (
        <div className="sidebar chat-sidebar">
          <h3>Chat</h3>
          <div className="chat-box">
            {messages.map((msg, index) => (
              <div key={index} className={`chat-message ${index % 2 === 0 ? 'sent' : 'received'}`}>
                {msg}
              </div>
            ))}
          </div>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message"
          />
          <button onClick={handleSendMessage}>Send</button>
        </div>
      )}
    </div>
  );
}

export default App;