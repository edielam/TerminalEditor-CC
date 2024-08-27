import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { CanvasAddon } from 'xterm-addon-canvas';
import { WebglAddon } from 'xterm-addon-webgl';
import { LigaturesAddon } from 'xterm-addon-ligatures';
import { Unicode11Addon } from 'xterm-addon-unicode11';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon } from 'xterm-addon-search';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/shell';
import 'xterm/css/xterm.css';
import styled from 'styled-components';

const PTY_WS_ADDRESS = "ws://127.0.0.1:7703"

const TerminalContainer = styled.div`
  width: 100%;
  height: 100vh;
  background-color: #0A1A1A;
  overflow: hidden;
`;

const TerminalComponent = () => {
  const terminalRef = useRef(null);
  const [terminal, setTerminal] = useState(null);
  const [addons, setAddons] = useState(null);
  const [ptyWebSocket, setPtyWebSocket] = useState(null);

  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      allowProposedApi: true,
      theme: {
        background: '#0A1A1A',
        foreground: '#E0FFFF',
        cursor: '#00FFFF',
      },
      fontSize: 15,
      fontWeight: '300',
      fontFamily: "'Roboto Mono', monospace",
      lineHeight: 1.2,
    });

    const newAddons = {
      fitAddon: new FitAddon(),
      ligaturesAddon: new LigaturesAddon(),
      unicode11Addon: new Unicode11Addon(),
      webLinksAddon: new WebLinksAddon((evt, uri) => {
        evt.preventDefault();
        open(uri);
      }),
      searchAddon: new SearchAddon(),
    };

    setTerminal(term);
    setAddons(newAddons);

    return () => {
      term.dispose();
      if (newAddons.webglAddon) {
        newAddons.webglAddon.dispose();
      } else if (newAddons.canvasAddon) {
        newAddons.canvasAddon.dispose();
      }
    };
  }, []);

  useEffect(() => {
    if (terminal && addons && terminalRef.current) {
      openDomTerminalInterface();
    }
  }, [terminal, addons, terminalRef.current]);

  const openDomTerminalInterface = () => {
    if (!terminal || !addons || !terminalRef.current) return;

    terminal.open(terminalRef.current);

    terminal.loadAddon(addons.fitAddon);
    terminal.loadAddon(addons.ligaturesAddon);
    terminal.loadAddon(addons.unicode11Addon);
    terminal.loadAddon(addons.webLinksAddon);
    terminal.loadAddon(addons.searchAddon);

    setRenderingMode();
    adjustDomTerminalElementSize();
    newTerminalSession();
    terminal.focus();
  };

  const setRenderingMode = async () => {
    if (!terminal || !addons) return;

    const settings = await invoke('get_settings');

    if (settings.useWebGL && webglIsSupported()) {
      console.log('Using WebGL');
      const webglAddon = new WebglAddon();
      terminal.loadAddon(webglAddon);
      addons.webglAddon = webglAddon;
    } else {
      if (settings.useWebGL) {
        alert('WebGL is not supported. Falling back to canvas rendering.');
      }
      const canvasAddon = new CanvasAddon();
      terminal.loadAddon(canvasAddon);
      addons.canvasAddon = canvasAddon;
    }
  };

  const newTerminalSession = () => {
    const ws = new WebSocket(PTY_WS_ADDRESS);
    ws.binaryType = 'arraybuffer';
    ws.onmessage = writePtyIncomingToTermInterface;
    ws.onclose = handlePtyWsClose;
    ws.onerror = handlePtyWsError;
    ws.onopen = () => {
      sendProposedSizeToPty(ws);
      setupTerminalEventListeners(ws);
    };
    setPtyWebSocket(ws);
  };

  const sendProposedSizeToPty = (ws) => {
    if (!addons) return;
    const proposedSize = addons.fitAddon.proposeDimensions();
    if (proposedSize) {
      const resizeData = {
        cols: proposedSize.cols,
        rows: proposedSize.rows,
        pixel_width: 0,
        pixel_height: 0,
      };
      ws.send(new TextEncoder().encode('\x01' + JSON.stringify(resizeData)));
    }
  };

  const adjustDomTerminalElementSize = () => {
    if (!addons || !terminalRef.current) return;
    addons.fitAddon.fit();

    const terminalElement = terminalRef.current;
    const terminalHeight = terminalElement.clientHeight;
    const terminalWidth = terminalElement.clientWidth;

    const xtermElement = terminalElement.getElementsByClassName('xterm')[0];
    const xtermViewPortElement = terminalElement.getElementsByClassName('xterm-viewport')[0];

    if (xtermElement && xtermViewPortElement) {
      xtermElement.style.height = `${terminalHeight}px`;
      xtermElement.style.width = `${terminalWidth}px`;
      xtermViewPortElement.style.height = `${terminalHeight}px`;
      xtermViewPortElement.style.width = `${terminalWidth}px`;
    }
  };

  const setupTerminalEventListeners = (ws) => {
    if (!terminal) return;

    window.addEventListener('resize', adjustDomTerminalElementSize);
    terminal.onResize((evt) => handleTerminalResize(evt, ws));
    terminal.onData((data) => handleUserInput(data, ws));
    terminal.onTitleChange(handleTitleChange);
  };

  const handleTerminalResize = (evt, ws) => {
    const resizeValues = {
      cols: evt.cols,
      rows: evt.rows,
      pixel_width: 0,
      pixel_height: 0,
    };
    ws.send(new TextEncoder().encode('\x01' + JSON.stringify(resizeValues)));
    adjustDomTerminalElementSize();
  };

  const handleUserInput = (data, ws) => {
    const encodedData = new TextEncoder().encode('\x00' + data);
    ws.send(encodedData);
  };

  const handleTitleChange = (title) => {
    if (title.includes('[manter]')) {
      title = title.replace('[manter]', '');
      try {
        const promptUpdatedData = JSON.parse(title);
        // Handle promptUpdatedData as needed
      } catch (e) {
        alert('Error parsing JSON from prompt_command_script\n' + e.message);
      }
      return;
    }
    document.title = title;
  };

  const writePtyIncomingToTermInterface = (evt) => {
    if (!terminal) return;
    if (!(evt.data instanceof ArrayBuffer)) {
      alert('unknown data type ' + evt.data);
      return;
    }
    const dataString = new TextDecoder().decode(evt.data.slice(1));
    terminal.write(dataString);
  };

  const handlePtyWsClose = (evt) => {
    if (!terminal) return;
    terminal.write('Terminal session terminated');
    terminal.dispose();
    console.log('websocket closes from backend side');
  };

  const handlePtyWsError = (evt) => {
    console.error('ws error', evt);
  };

  const webglIsSupported = () => {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  };

  return <TerminalContainer ref={terminalRef} />;
};

export default TerminalComponent;