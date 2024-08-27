import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { ChatContainer, ChatMessages, ChatInputContainer, ChatInput, SendButton } from './styles';

const Message = ({ content, isSent, avatar }) => (
  <div className={`message ${isSent ? 'sent' : 'received'}`}>
    <img src={avatar} alt={isSent ? 'User' : 'System'} className="avatar" />
    <div className="content">{content}</div>
  </div>
);

const Chat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    fetchMessages();
    const intervalId = setInterval(fetchMessages, 50);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(scrollToBottom, [messages]);

  const fetchMessages = async () => {
    try {
      if (window.__TAURI_IPC__) {
        const response = await invoke("get_messages");
        setMessages(response);
      }
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    }
  };

  const handleSend = async () => {
    if (input.trim()) {
      try {
        await invoke("send_message", { message: input });
        setInput("");
        await fetchMessages();
      } catch (error) {
        console.error("Failed to send message:", error);
      }
    }
  };

  return (
    <ChatContainer>
      <ChatMessages>
        {messages.map((msg, index) => (
          <Message 
            key={index} 
            content={msg.content} 
            isSent={msg.sender === 'user'} 
            avatar={msg.sender === 'user' 
              ? 'https://raw.githubusercontent.com/edielam/TerminalEditor-CC/main/user.jpg'
              : 'https://raw.githubusercontent.com/edielam/TerminalEditor-CC/main/icon.png'
            } 
          />
        ))}
        <div ref={messagesEndRef} />
      </ChatMessages>
      <ChatInputContainer>
        <ChatInput
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
        />
        <SendButton onClick={handleSend}>Send</SendButton>
      </ChatInputContainer>
    </ChatContainer>
  );
};

export default Chat;