import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { CanvasAddon } from 'xterm-addon-canvas';
import { WebglAddon } from 'xterm-addon-webgl';
import { LigaturesAddon } from 'xterm-addon-ligatures';
import { Unicode11Addon } from 'xterm-addon-unicode11';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon } from 'xterm-addon-search';
import 'xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/shell';

const IS_WINDOWS = navigator.userAgent.includes("Windows");
const PTY_WS_ADDRESS = "ws://127.0.0.1:7703";

const Terminal2Com = () => {
  const terminalRef = useRef(null);
  const [terminalInterface, setTerminalInterface] = useState(null);
  const [ptyWebSocket, setPtyWebSocket] = useState(null);
  const [addons, setAddons] = useState({});
  const [sessionContext, setSessionContext] = useState({
    searchIsOn: false,
    lineText: '',
  });


  const newTerminalSession = () => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(PTY_WS_ADDRESS);
      ws.binaryType = 'arraybuffer';
      ws.onmessage = writePtyIncomingToTermInterface;
      ws.onclose = handlePtyWsClose;
      ws.onerror = (event) => {
        handlePtyWsError(event);
        reject(event);
      };
      ws.onopen = () => {
        setPtyWebSocket(ws);
        resolve(ws);
      };
    });
  };

  const setupNewTerminalInterface = async () => {
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 16,
      rows: 24,
      cols: 80,
      allowProposedApi: true,
      convertEol: true,
    });

    const newAddons = {
      fitAddon: new FitAddon(),
      unicode11Addon: new Unicode11Addon(),
      webLinksAddon: new WebLinksAddon(async (event, uri) => {
        event.preventDefault();
        await open(uri);
      }),
      searchAddon: new SearchAddon(),
    };

    term.loadAddon(newAddons.fitAddon);
    term.loadAddon(newAddons.unicode11Addon);
    term.loadAddon(newAddons.webLinksAddon);
    term.loadAddon(newAddons.searchAddon);

    setRenderingMode(term, newAddons);

    term.unicode.activeVersion = '11';

    term.attachCustomKeyEventHandler(termInterfaceHandleKeyEvents);
    term.onKey(() => {});
    term.onResize(termInterfaceHandleResize);
    term.onData(termInterfaceHandleUserInputData);
    term.onCursorMove(termInterfaceHandleCursorMove);
    term.buffer.onBufferChange(() => {});
    term.onTitleChange(termInterfaceHandleTitleChange);

    if (IS_WINDOWS) {
      term.options.windowsMode = true;
    }

    setTerminalInterface(term);
    setAddons(newAddons);

    openDomTerminalInterface(term, newAddons);
  };

  const setRenderingMode = async (term, newAddons) => {
    try {
      const settings = await invoke('get_settings');
  
      if (settings.useWebGL) {
        console.log('Trying to use WebGL');
        
        if (webglIsSupported()) {
          const webglAddon = new WebglAddon();
          webglAddon.onContextLoss(() => {
            webglAddon.dispose();
          });
          term.loadAddon(webglAddon);
          newAddons.webglAddon = webglAddon;
          return;
        }
  
        alert('WebGL is not supported. Falling back to canvas rendering. \n You can turn off WebGL in settings.');
      }
  
      const canvasAddon = new CanvasAddon();
      term.loadAddon(canvasAddon);
      newAddons.canvasAddon = canvasAddon;
    } catch (error) {
      console.error('Error getting settings:', error);
      // Fallback to canvas rendering if there's an error
      const canvasAddon = new CanvasAddon();
      term.loadAddon(canvasAddon);
      newAddons.canvasAddon = canvasAddon;
    }
  };

  const openDomTerminalInterface = (term, newAddons) => {
    if (!term || !terminalRef.current) return;

    term.open(terminalRef.current);

    const ligaturesAddon = new LigaturesAddon();
    term.loadAddon(ligaturesAddon);
    newAddons.ligaturesAddon = ligaturesAddon;

    sendProposedSizeToPty(newAddons.fitAddon);
    adjustDomTerminalElementSize(term, newAddons.fitAddon);
    term.focus();

    if (newAddons.webglAddon) {
      console.log('activating webgl addon');
      newAddons.webglAddon.activate(term);
    } else if (newAddons.canvasAddon) {
      console.log('activating canvas addon');
      newAddons.canvasAddon.activate(term);
    }
  };


  const sendProposedSizeToPty = (fitAddon) => {
    const proposedSize = fitAddon.proposeDimensions();
    const resizeData = {
      cols: proposedSize.cols,
      rows: proposedSize.rows,
      pixel_width: 0,
      pixel_height: 0,
    };
    ptyWebSocket.send(new TextEncoder().encode('\x01' + JSON.stringify(resizeData)));
  };

  const adjustDomTerminalElementSize = (term, fitAddon) => {
    fitAddon.fit();

    const terminal = terminalRef.current;
    const terminalHeight = terminal.clientHeight;
    const terminalWidth = terminal.clientWidth;

    const xtermElement = terminal.querySelector('.xterm');
    const xtermViewPortElement = terminal.querySelector('.xterm-viewport');

    xtermElement.style.height = `${terminalHeight}px`;
    xtermElement.style.width = `${terminalWidth}px`;

    xtermViewPortElement.style.height = `${terminalHeight}px`;
    xtermViewPortElement.style.width = `${terminalWidth}px`;
  };

  const termInterfaceHandleResize = (evt) => {
    const resizeValues = {
      cols: evt.cols,
      rows: evt.rows,
      pixel_width: 0,
      pixel_height: 0,
    };
    ptyWebSocket.send(new TextEncoder().encode('\x01' + JSON.stringify(resizeValues)));
    adjustDomTerminalElementSize(terminalInterface, addons.fitAddon);
  };

  const termInterfaceHandleUserInputData = (data) => {
    if (ptyWebSocket && ptyWebSocket.readyState === WebSocket.OPEN) {
      const encodedData = new TextEncoder().encode('\x00' + data);
      ptyWebSocket.send(encodedData);
    } else {
      console.error('WebSocket is not available or not open');
      // Optionally, you could try to reconnect here
      // newTerminalSession().then(setupNewTerminalInterface).catch(console.error);
    }
  };

  const termInterfaceHandleTitleChange = (title) => {
    if (title.includes('[manter]')) {
      title = title.replace('[manter]', '');
      let promptUpdatedData = {};
      try {
        promptUpdatedData = JSON.parse(title);
      } catch (e) {
        alert('Error parsing JSON from prompt_command_script\n' + e.message);
        return;
      }
      setSessionContext(prev => ({ ...prev, prompt_command_result: promptUpdatedData }));
      return;
    }
    document.title = title;
  };

  const termInterfaceHandleKeyEvents = (evt) => {
    console.log('Key event:', evt);
    return true;
  };

  const termInterfaceHandleCursorMove = () => {
    // Implement cursor move logic here
  };

  const writePtyIncomingToTermInterface = (evt) => {
    if (!(evt.data instanceof ArrayBuffer)) {
      alert('unknown data type ' + evt.data);
      return;
    }
    const dataString = arrayBufferToString(evt.data.slice(1));
    terminalInterface.write(dataString);
    return dataString;
  };

  const handlePtyWsClose = () => {
    terminalInterface.write('Terminal session terminated');
    terminalInterface.dispose();
    console.log('websocket closes from backend side');
  };

  const handlePtyWsError = (evt) => {
    console.log('ws error', evt);
  };

  const arrayBufferToString = (buffer) => {
    return new TextDecoder().decode(buffer);
  };

  const webglIsSupported = () => {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  };

  useEffect(() => {
    const handleResize = () => {
      if (terminalInterface && addons.fitAddon) {
        adjustDomTerminalElementSize(terminalInterface, addons.fitAddon);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [terminalInterface, addons]);

  useEffect(() => {
    if (terminalInterface) {
      terminalInterface.focus();
    }
  }, [terminalInterface]);

  useEffect(() => {
    newTerminalSession()
      .then(setupNewTerminalInterface)
      .catch(console.error);
  
    return () => {
      if (addons.webglAddon) {
        console.log('disposing webgl addon');
        addons.webglAddon.dispose();
      } else if (addons.canvasAddon) {
        console.log('disposing canvas addon');
        addons.canvasAddon.dispose();
      }
    };
  }, []);

  return (
    <div 
      id="terminal" 
      ref={terminalRef} 
      style={{ 
        width: '100%', 
        height: '100vh', 
        backgroundColor: 'black', 
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }} 
    />
  );
};

export default Terminal2Com;