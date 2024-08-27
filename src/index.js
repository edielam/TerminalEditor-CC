// index.js
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Buffer } from "buffer";
import process from "process";
import { createGlobalStyle } from "styled-components";
import 'path-browserify';
import 'stream-browserify';

window.process = process;
window.Buffer = Buffer;

const GlobalStyle = createGlobalStyle`
  body {
    font-family: 'Roboto Mono', monospace;
    margin: 0;
    padding: 0;
    background-color: #1e1e1e;
    color: #f1f1f1;
    height: 100vh;
    overflow: hidden;
  }

  #root {
    height: 100%;
  }
`;

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <GlobalStyle />
    <App />
  </React.StrictMode>,
);
