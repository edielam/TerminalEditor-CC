//src/Terminal
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { invoke } from "@tauri-apps/api/tauri";
import LocalEchoController from "local-echo";
import "xterm/css/xterm.css";
import styled from "styled-components";

const TerminalContainer = styled.div`
  width: 100%;
  height: 100%;
  padding: 10px;
  box-sizing: border-box;
  border-radius: 5px;
  background-color: #0a1a1a;
  color: #e0ffff;
`;
const TerminalComponent = () => {
  const terminalRef = useRef(null);
  const [terminal, setTerminal] = useState(null);
  const [fitAddon, setFitAddon] = useState(null);
  const [localEcho, setLocalEcho] = useState(null);
  useEffect(() => {
    if (terminalRef.current && !terminal) {
      const term = new Terminal({
        cursorBlink: true,
        theme: {
          background: "#0A1A1A",
          foreground: "#E0FFFF",
          cursor: "#00FFFF",
        },
        fontSize: 15,
        fontWeight: "300",
        fontFamily: "'Roboto Mono', monospace",
        lineHeight: 1.2,
        cursorBlinking: "smooth",
        wordWrap: true,
        cursorSmoothCaretAnimation: true,
      });
      const newFitAddon = new FitAddon();
      term.loadAddon(newFitAddon);
      const newLocalEcho = new LocalEchoController();
      term.loadAddon(newLocalEcho);
      term.open(terminalRef.current);
      newFitAddon.fit();
      setTerminal(term);
      setFitAddon(newFitAddon);
      setLocalEcho(newLocalEcho);
      // Initial command to get the prompt
      readCommand(newLocalEcho, term);
    }
  }, [terminalRef.current]);
  useEffect(() => {
    if (terminal && fitAddon) {
      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
      });
      resizeObserver.observe(terminalRef.current);
      // Initial fit
      fitAddon.fit();
      return () => resizeObserver.disconnect();
    }
  }, [terminal, fitAddon]);
  const sendCommand = useCallback(async (input, term) => {
    try {
      console.log("Sending command:", input);
      const result = await invoke("send_command_to_terminal", {
        command: input,
      });
      term.writeln(result);
    } catch (error) {
      console.error("Error:", error);
      term.writeln(`Error: ${error}`);
    }
  }, []);
  const readCommand = useCallback(
    async (localEcho, term) => {
      try {
        const input = await localEcho.read("(base) eddie@edGuard-2:~$ ");
        await sendCommand(input, term);
        readCommand(localEcho, term); // Continue reading commands
      } catch (error) {
        console.error("Error reading command:", error);
        term.writeln(`Error: ${error}`);
        readCommand(localEcho, term); // Continue reading commands even after an error
      }
    },
    [sendCommand],
  );
  // Add autocomplete handler
  useEffect(() => {
    if (localEcho) {
      localEcho.addAutocompleteHandler((index, tokens) => {
        // This is a simple example. You should implement more sophisticated autocomplete logic.
        if (index === 0) {
          return ["ls", "cd", "pwd", "echo", "cat", "grep"];
        }
        return [];
      });
    }
  }, [localEcho]);
  return <TerminalContainer ref={terminalRef} />;
};
export default TerminalComponent;

// import React, { useEffect, useRef, useState, useCallback } from "react";
// import { Terminal } from "xterm";
// import { FitAddon } from "xterm-addon-fit";
// import { invoke } from "@tauri-apps/api/tauri";
// import "xterm/css/xterm.css";
// import styled from "styled-components";

// const TerminalContainer = styled.div`
//   width: 100%;
//   height: 100%;
//   padding: 10px;
//   box-sizing: border-box;
//   border-radius: 5px;
//   background-color: #0a1a1a;
//   color: #e0ffff;
// `;

// const TerminalComponent = () => {
//   const terminalRef = useRef(null);
//   const [terminal, setTerminal] = useState(null);
//   const [fitAddon, setFitAddon] = useState(null);

//   useEffect(() => {
//     if (terminalRef.current && !terminal) {
//       const term = new Terminal({
//         cursorBlink: true,
//         theme: {
//           background: "#0A1A1A",
//           foreground: "#E0FFFF",
//           cursor: "#00FFFF",
//         },
//         // fontFamily: '"Fira Code", monospace',
//         fontSize: 15,
//         fontWeight: "300",
//         fontFamily: "'Roboto Mono', monospace",
//         lineHeight: 1.2,
//         cursorBlinking: "smooth",
//         wordWrap: true,
//         cursorSmoothCaretAnimation: true,
//       });

//       const newFitAddon = new FitAddon();
//       term.loadAddon(newFitAddon);
//       term.open(terminalRef.current);
//       newFitAddon.fit();
//       setTerminal(term);
//       setFitAddon(newFitAddon);

//       term.onKey(({ key, domEvent }) => {
//         const printable =
//           !domEvent.altKey && !domEvent.ctrlKey && !domEvent.metaKey;

//         if (domEvent.keyCode === 13) {
//           // Enter key
//           const currentLine = term.buffer.active
//             .getLine(term.buffer.active.cursorY)
//             .translateToString();
//           const command = currentLine
//             .substring(currentLine.lastIndexOf("$") + 1)
//             .trim();
//           term.write("\r\n");
//           sendCommand(command, term);
//         } else if (domEvent.keyCode === 8) {
//           // Backspace
//           // Only delete if we're not at the start of the prompt
//           if (
//             term.buffer.active.cursorX >
//             term.buffer.active
//               .getLine(term.buffer.active.cursorY)
//               .translateToString()
//               .lastIndexOf("$") +
//               1
//           ) {
//             term.write("\b \b");
//           }
//         } else if (printable) {
//           term.write(key);
//         }
//       });

//       // Initial command to get the prompt
//       sendCommand("", term);
//     }
//   }, [terminalRef.current]);

//   useEffect(() => {
//     if (terminal && fitAddon) {
//       const resizeObserver = new ResizeObserver(() => {
//         fitAddon.fit();
//       });
//       resizeObserver.observe(terminalRef.current);

//       // Initial fit
//       fitAddon.fit();

//       return () => resizeObserver.disconnect();
//     }
//   }, [terminal, fitAddon]);

//   const sendCommand = useCallback(async (input, term) => {
//     try {
//       console.log("Sending command:", input);
//       const result = await invoke("send_command_to_terminal", {
//         command: input,
//       });
//       term.write(result);
//     } catch (error) {
//       console.error("Error:", error);
//       term.writeln(`Error: ${error}`);
//     }
//   }, []);

//   return <TerminalContainer ref={terminalRef} />;
// };

// export default TerminalComponent;
