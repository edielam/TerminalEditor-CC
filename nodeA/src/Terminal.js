import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { invoke } from '@tauri-apps/api/tauri';
import 'xterm/css/xterm.css';

const TerminalComponent = () => {
  const terminalRef = useRef(null);
  const [terminal, setTerminal] = useState(null);
  const [fitAddon, setFitAddon] = useState(null);
  const [prompt, setPrompt] = useState('');
  const wsRef = useRef(null);

  const connectWebSocket = useCallback(() => {
    if (!terminal) return;

    wsRef.current = new WebSocket('ws://localhost:8081/ws');

    wsRef.current.onopen = () => {
      console.log('WebSocket connection established');
      terminal.writeln('Connected to terminal server.');
    };

    wsRef.current.onmessage = (event) => {
      console.log('Received message:', event.data);  // Debug log
      const data = event.data;
      
      // Always write the incoming data to the terminal
      terminal.write(data);

      // Check if the data ends with a prompt-like pattern
      const lines = data.split('\n');
      const lastLine = lines[lines.length - 1].trim();
      if (lastLine.endsWith('$') || lastLine.endsWith('>')) {
        setPrompt(lastLine);
      }
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      terminal.writeln('Error: Failed to connect to terminal server');
    };

    wsRef.current.onclose = () => {
      console.log('WebSocket connection closed');
      terminal.writeln('Disconnected from terminal server. Attempting to reconnect...');
      setTimeout(connectWebSocket, 3000);
    };
  }, [terminal]);

  useEffect(() => {
    if (terminalRef.current && !terminal) {
      const term = new Terminal({
        cursorBlink: true,
        theme: {
          background: '#03070f'
        }
      });

      const newFitAddon = new FitAddon();
      term.loadAddon(newFitAddon);

      term.open(terminalRef.current);
      newFitAddon.fit();

      setTerminal(term);
      setFitAddon(newFitAddon);

      term.onKey(({ key, domEvent }) => {
        const printable = !domEvent.altKey && !domEvent.ctrlKey && !domEvent.metaKey;
      
        if (domEvent.keyCode === 13) { // Enter key
          const fullLine = term.buffer.active.getLine(term.buffer.active.cursorY).translateToString().trim();
          const command = fullLine.substring(prompt.length).trim();
          term.write('\r\n');
          sendCommand(command);
        } else if (domEvent.keyCode === 8) { // Backspace
          if (term.buffer.active.cursorX > prompt.length) {
            term.write('\b \b');
          }
        } else if (printable) {
          term.write(key);
        }
      });
    }
  }, [terminalRef.current]);

  useEffect(() => {
    if (terminal) {
      connectWebSocket();

      return () => {
        if (wsRef.current) {
          wsRef.current.close();
        }
      };
    }
  }, [terminal, connectWebSocket]);

  useEffect(() => {
    if (terminalRef.current && terminal && fitAddon) {
      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
      });
      resizeObserver.observe(terminalRef.current);

      const resizeHandler = () => {
        fitAddon.fit();
      };
      window.addEventListener('resize', resizeHandler);

      return () => {
        resizeObserver.disconnect();
        window.removeEventListener('resize', resizeHandler);
      };
    }
  }, [terminal, fitAddon]);

  const sendCommand = async (command) => {
    try {
      console.log('Sending command:', command);  // Debug log
      await invoke('send_command_to_terminal', { command });
    } catch (error) {
      console.error('Error:', error);
      terminal.writeln(`Error: ${error}`);
    }
  };

  return <div ref={terminalRef} className="terminal-container"></div>;
};

export default TerminalComponent;