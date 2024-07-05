# Phase 1 and 2 of CortexCode Project
A desktop application featuring a code editor and an embedded terminal emulator. This application is built with Tauri, Rust, and React, providing a seamless development environment for writing and testing code.

![TermED](https://raw.githubusercontent.com/edielam/about_me/portfolio/src/assets/prgs1.png)
## Features

- **Code Editor**: 
  - Integrated code editor with syntax highlighting and autocomplete features.
  - Built using React for a responsive and dynamic interface.

- **Terminal Emulator**: 
  - Embedded terminal emulator for executing commands directly within the application.
  - Utilizes xterm.js for a rich terminal experience.

## Built With

- **Rust**: Backend server logic.
- **React**: Frontend framework for building the UI.
- **Tauri**: Framework for creating the desktop application.
- **xterm.js**: Terminal emulator for the embedded terminal.

## Progress

- The code editor is fully functional and integrated into the Tauri desktop application.
- The terminal emulator is embedded and allows for command execution within the app.

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


## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Acknowledgements

- [Rust](https://www.rust-lang.org/)
- [React](https://reactjs.org/)
- [Tauri](https://tauri.app/)
- [xterm.js](https://xtermjs.org/)
