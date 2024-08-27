import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import {
  FaComments,
  FaFolderOpen,
  FaCode,
  FaTerminal,
  FaHome,
  FaCog,
} from "react-icons/fa";
import EditorComponent from "./EditorComp";
import {
  AppContainer,
  Sidebar,
  MainContent,
  Panel,
  IconButton,
  ChatContainer,
  ChatMessages,
  ChatInputContainer,
  ChatInput,
  SendButton,
  EditorTerminalContainer,
  HorResizer,
  VerResizer,
  ChatBox,
  Header,
  Footer,
  HomePage,
} from "./styles";
import TerminalComponent from "./t3";
import FileExplorer from "./FileExplorer2";

function App() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);
  const [activePanel, setActivePanel] = useState("home");
  const [showTerminal, setShowTerminal] = useState(false);
  const [terminalKey, setTerminalKey] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(300);
  const [chatWidth, setChatWidth] = useState(30);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showFileExplorer, setShowFileExplorer] = useState(false);
  const [fileExplorerWidth, setFileExplorerWidth] = useState(20);
  const containerRef = useRef(null);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 50);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setActivePanel((prevPanel) => prevPanel);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const fetchMessages = async () => {
    try {
      if (window.__TAURI_IPC__) {
        const response = await invoke("get_messages");
        // Ensure the messages are in the correct format
        const formattedMessages = response.map((msg) => {
          if (typeof msg === "string") {
            // If the message is a string, assume it's from a peer
            return { sender: "peer", content: msg };
          } else if (typeof msg === "object" && msg.content) {
            // If it's an object with a content field, use that
            return { sender: msg.sender || "peer", content: msg.content };
          } else {
            // If it's in an unexpected format, use it as is but mark as unknown
            return { sender: "unknown", content: JSON.stringify(msg) };
          }
        });
        setMessages(formattedMessages);
      }
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    }
  };
  const handleSendMessage = async () => {
    if (message.trim()) {
      try {
        // Send just the content to the backend
        await invoke("send_message", { content: message.trim() });
        setMessage("");
        fetchMessages();
      } catch (error) {
        console.error("Failed to send message:", error);
      }
    }
  };

  const handleFileSelect = (filePath) => {
    setSelectedFile(filePath);
  };

  const handleResize = (e) => {
    const startY = e.clientY;
    const startHeight = terminalHeight;

    const doDrag = (e) => {
      const newHeight = startHeight - (e.clientY - startY);
      setTerminalHeight(
        Math.max(50, Math.min(newHeight, window.innerHeight - 200)),
      );
    };

    const stopDrag = () => {
      document.removeEventListener("mousemove", doDrag);
      document.removeEventListener("mouseup", stopDrag);
    };

    document.addEventListener("mousemove", doDrag);
    document.addEventListener("mouseup", stopDrag);
  };

  const verResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = chatWidth;

    const doPull = (e) => {
      const containerWidth = containerRef.current.getBoundingClientRect().width;
      const pull = startX - e.clientX;
      const newChatWidth = startWidth + (pull / containerWidth) * 100;
      setChatWidth(Math.max(20, Math.min(newChatWidth, 80)));
    };

    const stopPull = () => {
      document.removeEventListener("mousemove", doPull);
      document.removeEventListener("mouseup", stopPull);
    };

    document.addEventListener("mousemove", doPull);
    document.addEventListener("mouseup", stopPull);
  };

  const startNewTerminal = () => {
    if (!showTerminal) {
      setShowTerminal(true);
      setTerminalKey((prevKey) => prevKey + 1);
    }
  };

  const handleCloseTerminal = () => {
    setShowTerminal(false);
  };

  const toggleChat = () => {
    setShowChat((prev) => !prev);
  };
  const toggleFileExplorer = () => {
    setShowFileExplorer((prev) => !prev);
  };

  const fileExplorerResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = fileExplorerWidth;

    const doPull = (e) => {
      const containerWidth = containerRef.current.getBoundingClientRect().width;
      const pull = e.clientX - startX;
      const newFileExplorerWidth = startWidth + (pull / containerWidth) * 100;
      setFileExplorerWidth(Math.max(10, Math.min(newFileExplorerWidth, 30)));
    };

    const stopPull = () => {
      document.removeEventListener("mousemove", doPull);
      document.removeEventListener("mouseup", stopPull);
    };

    document.addEventListener("mousemove", doPull);
    document.addEventListener("mouseup", stopPull);
  };

  return (
    <AppContainer>
      <Header>
        <div className="logo-title">
          <img
            src="https://raw.githubusercontent.com/edielam/TerminalEditor-CC/main/icon.png"
            alt="Logo"
          />
          {/* <h1>CortexCode</h1> */}
        </div>
        <div className="icon-container">
          <IconButton onClick={toggleFileExplorer}>
            <FaFolderOpen />
          </IconButton>
          <IconButton onClick={() => setActivePanel("editor")}>
            <FaCode />
          </IconButton>
          <IconButton
            onClick={startNewTerminal}
            disabled={showTerminal}
            style={{
              opacity: showTerminal ? 0.5 : 1,
              cursor: showTerminal ? "not-allowed" : "pointer",
            }}
          >
            <FaTerminal />
          </IconButton>
          <IconButton onClick={toggleChat}>
            <FaComments />
          </IconButton>
        </div>
      </Header>
      <MainContent ref={containerRef}>
        {activePanel === "home" && (
          <HomePage>
            <div className="logo-container">
              <img
                src="https://raw.githubusercontent.com/edielam/TerminalEditor-CC/main/icon.png"
                alt="Logo"
              />
              <h2>CortexCode</h2>
            </div>
            <p>
              Collaborate and share compute remotely over a direct P2P network.
            </p>
            <button onClick={() => setActivePanel("editor")}>
              Start Coding
            </button>
          </HomePage>
        )}
        {activePanel === "editor" && (
          <Panel style={{ display: "flex", flexDirection: "row", flex: 1 }}>
            {showFileExplorer && (
              <>
                <Panel
                  style={{
                    width: `${fileExplorerWidth}%`,
                    display: showFileExplorer ? 'flex' : 'none'
                  }}
                >
                  <FileExplorer onFileSelect={handleFileSelect} />
                </Panel>

                <VerResizer onMouseDown={fileExplorerResize} />
              </>
            )}
            <EditorTerminalContainer style={{ flex: 1, minWidth: 0 }}>
              <EditorComponent
                height={`calc(100% - ${showTerminal ? terminalHeight : 0}px)`}
                selectedFile={selectedFile}
              />
              {showTerminal && (
                <>
                  <HorResizer onMouseDown={handleResize} />
                  <Panel
                    style={{
                      height: `${terminalHeight}px`,
                      minHeight: "50px",
                      maxHeight: "calc(100% - 50px)",
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    <TerminalComponent
                      key={terminalKey}
                      onClose={handleCloseTerminal}
                    />
                  </Panel>
                </>
              )}
            </EditorTerminalContainer>
            {showChat && (
              <>
                <VerResizer onMouseDown={verResize} />
                <ChatBox
                  style={{
                    width: `${chatWidth}%`,
                    minWidth: "20%",
                    maxWidth: "80%",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <ChatContainer>
                    <ChatMessages>
                      {messages.map((msg, index) => (
                        <div
                          key={index}
                          className={
                            msg.sender === "user" ? "sent" : "received"
                          }
                        >
                          <img
                            src={
                              msg.sender === "user"
                                ? "https://raw.githubusercontent.com/edielam/TerminalEditor-CC/main/Itachi.jpg"
                                : "https://raw.githubusercontent.com/edielam/TerminalEditor-CC/main/zen.jpg"
                            }
                            alt={msg.sender === "user" ? "User" : "Peer"}
                            className="avatar"
                          />
                          <div className="content">{msg.content}</div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </ChatMessages>
                    <ChatInputContainer>
                      <ChatInput
                        type="text"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Type a message"
                        onKeyPress={(e) =>
                          e.key === "Enter" && handleSendMessage()
                        }
                      />
                      <SendButton onClick={handleSendMessage}>Send</SendButton>
                    </ChatInputContainer>
                  </ChatContainer>
                </ChatBox>
              </>
            )}
          </Panel>
        )}
      </MainContent>
      <Footer>
        <p>© 2024 0xed</p>
        <IconButton>
          <FaCog />
        </IconButton>
      </Footer>
    </AppContainer>
  );
}

export default App;
