# Phase 1, 2 and 3 of CortexCode Project

A desktop application featuring a code editor, an embedded terminal emulator, and a working p2p network layer. This application is built with Tauri, Rust, and React, providing a seamless development environment for writing, testing, and sharing code.

<!--![TermED](https://raw.githubusercontent.com/edielam/TerminalEditor-CC/main/d3.JPG) -->

![TermED2](https://raw.githubusercontent.com/edielam/TerminalEditor-CC/main/d2.JPG)

<!--[TermED](https://raw.githubusercontent.com/edielam/TerminalEditor-CC/main/d1.JPG) -->

## Features

- **Code Editor**: 
  - Integrated code editor with syntax highlighting and autocomplete features.
  - Built using React for a responsive and dynamic interface.
- **Terminal Emulator**: 
  - Embedded terminal emulator for executing commands directly within the application.
  - Utilizes xterm.js for a rich terminal experience.
- **P2P Network Layer**:
  - Implements a peer-to-peer network for collaborative coding and resource sharing.
  - Overcomes NAT traversal challenges for cross-country collaboration.
<!--  - Enables distributed computing capabilities among peers. -->

## Built With

- **Rust**: Backend server logic and network layer implementation.
- **React**: Frontend framework for building the UI.
- **Tauri**: Framework for creating the desktop application.
- **Libp2p**: For peer-to-peer network layer.
<!-- - **STUN/TURN servers**: For NAT traversal in the network layer. -->

## Progress

- The code editor is fully functional and integrated into the Tauri desktop application.
- The terminal emulator is embedded and allows for command execution within the app.
- The P2P network layer is operational, enabling peer discovery and communication.

## Getting Started

### Prerequisites

- Install [Rust](https://www.rust-lang.org/).
- Install [Node.js](https://nodejs.org/).
- Install [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites).

### Installation

1. Clone the repository:
    ```bash
    git clone https://github.com/edielam/TerminalEditor-CC.git
    cd TerminalEditor-CC
    ```
2. Install dependencies:
    ```bash
    npm install
    cargo install tauri-cli --version ^1.0.0
    ```
3. Run the application:
    ```bash
    npm run tauri dev
    ```

## Usage

- Open the application to start coding in the integrated code editor.
- Use the embedded terminal to execute commands and manage your development environment.
- Connect with peers through the P2P network layer for collaborative coding and resource sharing.


## Acknowledgements

- [Rust](https://www.rust-lang.org/)
- [React](https://reactjs.org/)
- [Tauri](https://tauri.app/)
- [xterm.js](https://xtermjs.org/)
- [Manter](https://github.com/iondodon/manter)
- [Universal connectivity project](https://github.com/libp2p/universal-connectivity)
