import styled from "styled-components";

const primaryColor = "#001A1A"; // Very dark cyan (almost black)
const secondaryColor = "#003333"; // Dark cyan
const tertiaryColor = "#005555"; // Medium dark cyan
const accentColor = "#00CCCC"; // Bright cyan
const highlightColor = "#00FFFF"; // Very bright cyan
const bgColor = "#001A1A"; // Same as primaryColor for consistency
const textColor = "#E0FFFF"; // Light cyan for text

const sentBubbleColor = "rgba(0, 204, 204, 0.2)"; // Glassy bright cyan
const receivedBubbleColor = "rgba(0, 85, 85, 0.4)"; // Glassy medium dark cyan
const sentTextColor = "#E0FFFF"; // Light cyan for sent text
const receivedTextColor = "#FFFFFF"; // White for received text

export const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: linear-gradient(135deg, ${bgColor} 0%, ${secondaryColor} 100%);
  color: ${textColor};
  overflow: hidden;
`;

export const Sidebar = styled.div`
  width: 60px;
  background-color: ${primaryColor};
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
`;

export const MainContent = styled.div`
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
`;

export const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 20px;
  background-color: ${secondaryColor};
  color: ${textColor};

  .logo-title {
    display: flex;
    align-items: center;

    img {
      height: 30px;
      margin-right: 10px;
    }

    h1 {
      margin: 0;
      font-size: 18px;
    }
  }

  .icon-container {
    display: flex;
    align-items: center;
  }
`;

export const Footer = styled.footer`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0px 20px;
  background-color: ${secondaryColor};
  color: ${textColor};

  p {
    margin: 0;
  }
`;

export const HomePage = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  text-align: center;

  .logo-container {
    display: flex;
    align-items: center;
    margin-bottom: 20px;

    img {
      width: 10rem;
      height: 10rem;
      margin-right: 0.5rem;
    }

    h2 {
      font-size: 36px;
      margin: 0;
    }
  }

  p {
    font-size: 18px;
    margin-bottom: 40px;
    max-width: 600px;
    line-height: 1.5;
    padding-left: 3rem;
  }

  button {
    padding: 12px 24px;
    font-size: 18px;
    background-color: ${accentColor};
    color: ${primaryColor};
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition:
      background-color 0.3s,
      transform 0.2s;

    &:hover {
      background-color: ${highlightColor};
      transform: scale(1.05);
    }
  }
`;

export const Panel = styled.div`
  display: ${props => props.visible ? 'flex' : 'none'};
  flex-direction: column;
  background-color: ${primaryColor}E6;
  overflow: hidden;
  transition: width 0.3s ease;
`;

export const IconButton = styled.button`
  background: none;
  border: none;
  color: ${accentColor};
  font-size: 22px;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;
  margin: 0 5px;

  &:hover {
    color: ${highlightColor};
    text-shadow: 0 0 10px ${highlightColor};
  }

  &:after {
    content: "";
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    border-radius: 10%;
    transition: all 0.3s;
  }
`;

export const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  border-top: 1px solid ${tertiaryColor};
`;

export const ChatMessages = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-wrap: break-word;
  padding: 10px;
  font-family: "Fira Code", monospace;
  background-color: rgba(
    0,
    26,
    26,
    0.7
  ); // Slightly transparent dark background

  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
  }
  &::-webkit-scrollbar-thumb {
    background: ${tertiaryColor};
    border-radius: 4px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: ${accentColor};
  }

  .sent,
  .received {
    display: flex;
    align-items: flex-start;
    margin-bottom: 10px;
    width: 100%;
  }

  .sent {
    flex-direction: row-reverse;
    justify-content: flex-start;
  }

  .received {
    flex-direction: row;
    justify-content: flex-start;
  }

  .avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    margin: 0 10px;
    flex-shrink: 0;
  }

  .content {
    padding: 10px 15px;
    border-radius: 18px;
    max-width: 70%;
    word-wrap: break-word;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  }

  .sent .content {
    background-color: ${sentBubbleColor};
    color: ${sentTextColor};
    border: 1px solid rgba(0, 204, 204, 0.3);
  }

  .received .content {
    background-color: ${receivedBubbleColor};
    color: ${receivedTextColor};
    border: 1px solid rgba(0, 85, 85, 0.5);
  }
`;

export const ChatInputContainer = styled.div`
  display: flex;
  padding: 1rem;
  background-color: rgba(
    0,
    26,
    26,
    0.8
  ); // Slightly transparent dark background
`;

export const ChatInput = styled.input`
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 25px;
  font-size: 14px;
  background-color: rgba(0, 85, 85, 0.3); // Glassy dark cyan
  color: #fff;
  transition: all 0.3s;

  &::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px ${highlightColor};
    background-color: rgba(0, 85, 85, 0.5); // Slightly more opaque when focused
  }
`;

export const SendButton = styled.button`
  background-color: ${accentColor};
  color: ${primaryColor};
  border: none;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  margin-left: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;

  &:hover {
    background-color: ${highlightColor};
  }

  &:active {
    transform: scale(0.95);
  }
`;

export const EditorTerminalContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  border: 1px solid ${tertiaryColor};
  border-radius: 5px;
  box-shadow: 0 0 20px rgba(91, 192, 190, 0.1);
`;

export const HorResizer = styled.div`
  height: 3px;
  background-color: ${tertiaryColor};
  cursor: row-resize;
  &:hover {
    background-color: ${accentColor};
  }
`;

export const VerResizer = styled.div`
  height: 100%;
  width: 3px;
  background-color: ${tertiaryColor};
  cursor: col-resize;
  &:hover {
    background-color: ${accentColor};
  }
`;

export const ChatBox = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border-top: 0.5px solid ${tertiaryColor};
  border-right: 0.5px solid ${tertiaryColor};
`;
