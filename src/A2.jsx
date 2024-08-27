import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCode, faTerminal, faComment, faCog } from '@fortawesome/free-solid-svg-icons';
import Editor from './EditorComp';
import Terminal from './t3';
import Chat from './Chat';
import Settings from './Settings';
import {
  AppContainer,
  Sidebar,
  MainContent,
  Panel,
  IconButton,
  Header,
  Footer,
  HomePage,
  EditorTerminalContainer,
  HorResizer,
  VerResizer,
  ChatBox
} from './styles';

const App = () => {
  const [activePanel, setActivePanel] = useState('home');
  const [editorHeight, setEditorHeight] = useState(50);
  const [chatWidth, setChatWidth] = useState(30);

  const handleResize = (e, direction) => {
    if (direction === 'vertical') {
      const newHeight = (e.clientY / window.innerHeight) * 100;
      setEditorHeight(newHeight);
    } else if (direction === 'horizontal') {
      const newWidth = 100 - (e.clientX / window.innerWidth) * 100;
      setChatWidth(newWidth);
    }
  };

  return (
    <AppContainer>
      <Header>
        <img src="https://raw.githubusercontent.com/edielam/TerminalEditor-CC/main/icon.png" alt="Logo" style={{ height: '30px', marginRight: '10px' }} />
        <h1>CodeCollab</h1>
        <div>
          {/* Add any header controls here */}
        </div>
      </Header>
      <MainContent>
        <Sidebar>
          <IconButton onClick={() => setActivePanel('home')}><FontAwesomeIcon icon={faCode} /></IconButton>
          <IconButton onClick={() => setActivePanel('editor')}><FontAwesomeIcon icon={faCode} /></IconButton>
          <IconButton onClick={() => setActivePanel('terminal')}><FontAwesomeIcon icon={faTerminal} /></IconButton>
          <IconButton onClick={() => setActivePanel('chat')}><FontAwesomeIcon icon={faComment} /></IconButton>
          <IconButton onClick={() => setActivePanel('settings')}><FontAwesomeIcon icon={faCog} /></IconButton>
        </Sidebar>
        <Panel visible={activePanel === 'home'}>
          <HomePage>
            <img src="https://raw.githubusercontent.com/edielam/TerminalEditor-CC/main/icon.png" alt="CodeCollab Logo" style={{ width: '150px', marginBottom: '20px' }} />
            <h2>Welcome to CodeCollab</h2>
            <p>Collaborate and share compute remotely over a direct P2P network.</p>
            <button onClick={() => setActivePanel('editor')}>Start Coding</button>
          </HomePage>
        </Panel>
        <Panel visible={activePanel === 'editor' || activePanel === 'terminal'}>
          <EditorTerminalContainer>
            <Editor style={{ height: `${editorHeight}%` }} />
            <HorResizer
              onMouseDown={(e) => {
                document.addEventListener('mousemove', (event) => handleResize(event, 'vertical'), false);
                document.addEventListener('mouseup', () => {
                  document.removeEventListener('mousemove', handleResize, false);
                }, false);
              }}
            />
            <Terminal style={{ height: `${100 - editorHeight}%` }} />
          </EditorTerminalContainer>
        </Panel>
        <Panel visible={activePanel === 'chat'}>
          <ChatBox style={{ width: `${chatWidth}%` }}>
            <Chat />
          </ChatBox>
          <VerResizer
            onMouseDown={(e) => {
              document.addEventListener('mousemove', (event) => handleResize(event, 'horizontal'), false);
              document.addEventListener('mouseup', () => {
                document.removeEventListener('mousemove', handleResize, false);
              }, false);
            }}
          />
        </Panel>
        <Panel visible={activePanel === 'settings'}>
          <Settings />
        </Panel>
      </MainContent>
      <Footer>
        <p>© 2023 CodeCollab. All rights reserved.</p>
      </Footer>
    </AppContainer>
  );
};

export default App;