import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { FaFolder, FaFolderOpen, FaFile } from 'react-icons/fa';

const FileExplorer = () => {
  const [files, setFiles] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState({});

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async (path = '') => {
    try {
      const result = await invoke('read_dir', { path });
      setFiles(result);
    } catch (error) {
      console.error('Failed to load files:', error);
    }
  };

  const toggleFolder = (path) => {
    setExpandedFolders(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
    if (!expandedFolders[path]) {
      loadFiles(path);
    }
  };

  const handleFileSelect = (file) => {
    // Implement file selection logic here
    console.log('Selected file:', file);
  };

  const renderTree = (items, basePath = '') => {
    return items.map((item) => {
      const fullPath = `${basePath}/${item.name}`;
      if (item.isDir) {
        return (
          <div key={fullPath}>
            <div onClick={() => toggleFolder(fullPath)} style={{ cursor: 'pointer' }}>
              {expandedFolders[fullPath] ? <FaFolderOpen /> : <FaFolder />} {item.name}
            </div>
            {expandedFolders[fullPath] && (
              <div style={{ paddingLeft: '20px' }}>
                {renderTree(item.children || [], fullPath)}
              </div>
            )}
          </div>
        );
      } else {
        return (
          <div key={fullPath} onClick={() => handleFileSelect(fullPath)} style={{ cursor: 'pointer' }}>
            <FaFile /> {item.name}
          </div>
        );
      }
    });
  };

  return (
    <div className="file-explorer">
      <h3>File Explorer</h3>
      {renderTree(files)}
    </div>
  );
};

export default FileExplorer;