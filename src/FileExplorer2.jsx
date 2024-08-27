// FileExplorer.js
import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { FaFolder, FaFile, FaEdit, FaTrash, FaPlus } from "react-icons/fa";
import styled from "styled-components";

const FileExplorerContainer = styled.div`
  padding: 10px;
  background-color: ${(props) => props.theme.primaryColor};
  color: ${(props) => props.theme.textColor};
  height: 100%;
  overflow-y: auto;
  // width: 100%;
`;

const FileItem = styled.div`
  display: flex;
  align-items: center;
  padding: 5px;
  cursor: pointer;
  &:hover {
    background-color: ${(props) => props.theme.secondaryColor};
  }
`;

const FileIcon = styled.span`
  margin-right: 5px;
  color: ${(props) => props.theme.accentColor};
`;

const FileName = styled.span`
  margin-left: 5px;
`;

const ContextMenu = styled.div`
  position: absolute;
  background-color: ${(props) => props.theme.bgColor};
  border: 1px solid ${(props) => props.theme.secondaryColor};
  border-radius: 4px;
  padding: 5px 0;
  z-index: 1000;
`;

const ContextMenuItem = styled.div`
  padding: 5px 10px;
  cursor: pointer;
  &:hover {
    background-color: ${(props) => props.theme.secondaryColor}30;
  }
`;

const ConfirmDialog = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: ${(props) => props.theme.bgColor};
  border: 1px solid ${(props) => props.theme.secondaryColor};
  border-radius: 4px;
  padding: 20px;
  z-index: 1001;
`;

const ConfirmButton = styled.button`
  margin: 0 10px;
  padding: 5px 10px;
  background-color: ${(props) => props.theme.secondaryColor};
  color: ${(props) => props.theme.textColor};
  border: none;
  border-radius: 4px;
  cursor: pointer;
`;

const FileExplorer = ({ onFileSelect }) => {
//   console.log("FileExplorer rendering");
  const [currentDir, setCurrentDir] = useState("");
  const [files, setFiles] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  useEffect(() => {
    fetchCurrentDir();
  }, []);

  useEffect(() => {
    if (currentDir) {
      fetchFiles(currentDir);
    }
  }, [currentDir]);

  const fetchCurrentDir = async () => {
    try {
      const dir = await invoke("get_current_dir");
      setCurrentDir(dir);
    } catch (error) {
      console.error("Failed to get current directory:", error);
    }
  };

  const fetchFiles = async (path) => {
    try {
      const fileList = await invoke("read_dir", { path });
      setFiles(fileList);
    } catch (error) {
      console.error("Failed to read directory:", error);
    }
  };

  const handleBackClick = () => {
    const parentDir = currentDir.split("/").slice(0, -1).join("/");
    setCurrentDir(parentDir);
  };

  const handleFileClick = (item) => {
    if (item.is_dir) {
      setCurrentDir(currentDir + "/" + item.name);
    } else {
      onFileSelect(currentDir + "/" + item.name);
    }
  };

  const handleContextMenu = (e, item) => {
    e.preventDefault();
    setSelectedItem(item);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleCreateFile = async () => {
    const fileName = prompt("Enter file name:");
    if (fileName) {
      try {
        await invoke("create_file", { path: `${currentDir}/${fileName}` });
        fetchFiles(currentDir);
      } catch (error) {
        console.error("Failed to create file:", error);
      }
    }
    setContextMenu(null);
  };

  const handleCreateDirectory = async () => {
    const dirName = prompt("Enter directory name:");
    if (dirName) {
      try {
        await invoke("create_directory", { path: `${currentDir}/${dirName}` });
        fetchFiles(currentDir);
      } catch (error) {
        console.error("Failed to create directory:", error);
      }
    }
    setContextMenu(null);
  };

  const handleRename = async () => {
    const newName = prompt("Enter new name:", selectedItem.name);
    if (newName && newName !== selectedItem.name) {
      try {
        await invoke("rename_file", {
          oldPath: `${currentDir}/${selectedItem.name}`,
          newPath: `${currentDir}/${newName}`,
        });
        fetchFiles(currentDir);
      } catch (error) {
        console.error("Failed to rename:", error);
      }
    }
    setContextMenu(null);
  };

  const handleDelete = async () => {
    setConfirmDialog({
      message: `Are you sure you want to delete ${selectedItem.name}?`,
      onConfirm: async () => {
        try {
          await invoke("delete_file", {
            path: `${currentDir}/${selectedItem.name}`,
          });
          fetchFiles(currentDir);
        } catch (error) {
          console.error("Failed to delete:", error);
        }
        setConfirmDialog(null);
        setContextMenu(null);
      },
      onCancel: () => {
        setConfirmDialog(null);
        setContextMenu(null);
      },
    });
  };

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <FileExplorerContainer>
      <FileItem onClick={handleBackClick}>
        <FileIcon>
          <FaFolder />
        </FileIcon>
        <FileName>..</FileName>
      </FileItem>
      {files.map((item, index) => (
        <FileItem
          key={index}
          onClick={() => handleFileClick(item)}
          onContextMenu={(e) => handleContextMenu(e, item)}
        >
          <FileIcon>{item.is_dir ? <FaFolder /> : <FaFile />}</FileIcon>
          <FileName>{item.name}</FileName>
        </FileItem>
      ))}
      {contextMenu && (
        <ContextMenu style={{ top: contextMenu.y, left: contextMenu.x }}>
          <ContextMenuItem onClick={handleCreateFile}>
            <FaPlus /> New File
          </ContextMenuItem>
          <ContextMenuItem onClick={handleCreateDirectory}>
            <FaPlus /> New Directory
          </ContextMenuItem>
          {selectedItem && (
            <>
              <ContextMenuItem onClick={handleRename}>
                <FaEdit /> Rename
              </ContextMenuItem>
              <ContextMenuItem onClick={handleDelete}>
                <FaTrash /> Delete
              </ContextMenuItem>
            </>
          )}
        </ContextMenu>
      )}
      {confirmDialog && (
        <ConfirmDialog>
          <p>{confirmDialog.message}</p>
          <ConfirmButton onClick={confirmDialog.onConfirm}>Yes</ConfirmButton>
          <ConfirmButton onClick={confirmDialog.onCancel}>No</ConfirmButton>
        </ConfirmDialog>
      )}
    </FileExplorerContainer>
  );
};

export default FileExplorer;
