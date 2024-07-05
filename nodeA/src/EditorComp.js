import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { appWindow } from '@tauri-apps/api/window';
import { save, open } from '@tauri-apps/api/dialog';
import Editor from '@monaco-editor/react';
import { loader } from '@monaco-editor/react';

const EditorComponent = () => {
  const [editorContent, setEditorContent] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [filePath, setFilePath] = useState(null);
  const [themeLoaded, setThemeLoaded] = useState(false);

  const handleEditorChange = (value, event) => {
    setEditorContent(value);
  };

  useEffect(() => {
    const handleKeyDown = async (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        await saveFile(event.shiftKey); // Shift+Cmd+S for Save As
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'o') {
        event.preventDefault();
        await openFile();
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
        event.preventDefault();
        newFile();
      }
    };
  
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editorContent, filePath]);

  useEffect(() => {
    loader.init().then(monaco => {
      import("monaco-themes/themes/All Hallows Eve.json")
      .then(data => {
        const modifiedTheme = {
          ...data,
          colors: {
            ...data.colors,
            'editor.background': '#141733', // Change this to your desired color
            // 'editor.foreground': '#FFFFFF',        // Main text color
            // 'editorLineNumber.foreground': '#858585', // Line number color
            // 'editor.selectionBackground': '#264F78', // Selection background color
            // 'editor.inactiveSelectionBackground': '#3A3D41', // Inactive selection background
          }
        };
        monaco.editor.defineTheme("modified-all-hallows-eve", modifiedTheme);
        setThemeLoaded(true);
        });
    });
  }, []);
  const saveFile = async (saveAs = false) => {
    try {
      let savePath = filePath;
      if (saveAs || !filePath) {
        savePath = await save({
          filters: [
            { name: 'JavaScript Files', extensions: ['js'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        });
      }
      
      if (savePath) {
        await invoke('save_file', { path: savePath, content: editorContent });
        setFilePath(savePath);
        const extension = await invoke('get_file_extension', { path: savePath });
        setLanguage(getLanguageFromExtension(extension));
        console.log('File saved successfully');
        const filename = savePath.split('/').pop();
        updateWindowTitle(filename);
      }
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  };

  const openFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: 'JavaScript Files', extensions: ['js'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      if (selected) {
        const content = await invoke('read_file', { path: selected });
        setEditorContent(content);
        setFilePath(selected);
        const extension = await invoke('get_file_extension', { path: selected });
        setLanguage(getLanguageFromExtension(extension));
        const filename = selected.split('/').pop();
        updateWindowTitle(filename);
      }
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };
  const newFile = () => {
    setEditorContent('');
    setFilePath(null);
    setLanguage('javascript'); 
    updateWindowTitle(null);
  };

  const getLanguageFromExtension = (extension) => {
    const languageMap = {
      'js': 'javascript',
      'py': 'python',
      'rs': 'rust',
      'cpp': 'cpp',
      'c': 'c',
      'html': 'html',
      'css': 'css',
      // Add more mappings as needed
    };
    return languageMap[extension] || 'plaintext';
  };
  const updateWindowTitle = async (filename) => {
    let title = "CortexCode"; // Default app name
    if (filename) {
      title = `${filename} - ${title}`;
    }
    await invoke('set_window_title', { title });
  };
  useEffect(() => {
    if (filePath) {
      const filename = filePath.split('/').pop(); // Get the filename from the path
      updateWindowTitle(filename);
    } else {
      updateWindowTitle(null);
    }
  }, [filePath]);
  useEffect(() => {
    const unlistenNew = appWindow.listen('new-file-trigger', newFile);
    const unlistenSave = appWindow.listen('save-trigger', () => saveFile(false));
    const unlistenSaveAs = appWindow.listen('save-as-trigger', () => saveFile(true));
    const unlistenOpen = appWindow.listen('open-trigger', openFile);
    return () => {
      unlistenNew.then(f => f());
      unlistenSave.then(f => f());
      unlistenSaveAs.then(f => f());
      unlistenOpen.then(f => f());
    };
  }, [editorContent, filePath]);

  return (
    <div>
      {themeLoaded && (
          <Editor
            width="100%"
            height="60vh"
            defaultLanguage = {language}
            theme="modified-all-hallows-eve"
            value={editorContent}
            onChange={handleEditorChange}
            options={{
              minimap: { enabled: false }, // Optionally disable minimap
              scrollBeyondLastLine: false }}
              />
            )}
    </div>
  );
}

export default EditorComponent;