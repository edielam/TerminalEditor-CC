//src/components/EditorComp
import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { appWindow } from "@tauri-apps/api/window";
import { save, open } from "@tauri-apps/api/dialog";
import Editor from "@monaco-editor/react";
import { loader } from "@monaco-editor/react";

const EditorComponent = ({ height = "100%", selectedFile }) => {
  const [editorContent, setEditorContent] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [filePath, setFilePath] = useState(null);
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const handleEditorChange = (value, event) => {
    setEditorContent(value);
    setHasUnsavedChanges(true);
  };

  useEffect(() => {
    if (selectedFile) {
      if (hasUnsavedChanges) {
        const confirmed = window.confirm(
          "You have unsaved changes. Do you want to save them?"
        );
        if (confirmed) {
          saveFile();
        }
      }
      openFile(selectedFile);
    }
  }, [selectedFile]);


  useEffect(() => {
    const handleKeyDown = async (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        await saveFile(event.shiftKey); // Shift+Cmd+S for Save As
      } else if ((event.ctrlKey || event.metaKey) && event.key === "o") {
        event.preventDefault();
        await openCmd();
      } else if ((event.ctrlKey || event.metaKey) && event.key === "n") {
        event.preventDefault();
        newFile();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editorContent, filePath]);

  useEffect(() => {
    loader.init().then((monaco) => {
      const cyanTheme = {
        base: "vs-dark",
        inherit: true,
        rules: [
          { token: "", foreground: "E0FFFF" }, // Light cyan for default text
          { token: "comment", foreground: "#008B8B40", fontStyle: "italic" }, // Turquoise for comments
          { token: "keyword", foreground: "00FFFF" }, // Bright cyan for keywords
          { token: "string", foreground: "#DBA800" }, // dark yellow for strings
          { token: "number", foreground: "00CED1" }, // Dark turquoise for numbers
          { token: "type", foreground: "40E0D0" }, // Turquoise for types
        ],
        colors: {
          "editor.background": "#0A1A1A", // Very dark cyan-tinted gray
          "editor.foreground": "#E0FFFF", // Light cyan
          "editorCursor.foreground": "#00FFFF", // Bright cyan for cursor
          "editor.lineHighlightBackground": "#008B8B40", // Semi-transparent dark cyan for line highlight
          "editorLineNumber.foreground": "#20B2AA80", // opaque Light sea green for line numbers
          "editor.selectionBackground": "#00CED180", // Semi-transparent dark turquoise for selection
          "editorGutter.background": "#0A1A1A", // Very dark cyan-tinted gray for gutter
          "editorIndentGuide.background": "#008B8B40", // Semi-transparent dark cyan for indent guides
        },
      };

      monaco.editor.defineTheme("cyanTheme", cyanTheme);
      setThemeLoaded(true);
    });
  }, []);

  const saveFile = async (saveAs = false) => {
    try {
      let savePath = filePath;
      if (saveAs || !filePath) {
        savePath = await save({
          filters: generateFileFilters(),
        });
      }

      if (savePath) {
        await invoke("save_file", { path: savePath, content: editorContent });
        setFilePath(savePath);
        const extension = await invoke("get_file_extension", {
          path: savePath,
        });
        setLanguage(getLanguageFromExtension(extension));
        console.log("File saved successfully");
        const filename = savePath.split("/").pop();
        updateWindowTitle(filename);
        setHasUnsavedChanges(false);
      }
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  };

  const newFile = () => {
    setEditorContent("");
    setFilePath(null);
    setLanguage("plaintext");
    updateWindowTitle(null);
  };
  const languageMap = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    rs: "rust",
    c: "c",
    cpp: "cpp",
    h: "cpp",
    hpp: "cpp",
    cs: "csharp",
    java: "java",
    html: "html",
    css: "css",
    json: "json",
    md: "markdown",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    txt: "plaintext",
    // Add more mappings as needed
  };
  const generateFileFilters = () => {
    const filters = Object.entries(languageMap).reduce((acc, [ext, lang]) => {
      const existingFilter = acc.find(
        (filter) =>
          filter.name ===
          `${lang.charAt(0).toUpperCase() + lang.slice(1)} Files`,
      );
      if (existingFilter) {
        existingFilter.extensions.push(ext);
      } else {
        acc.push({
          name: `${lang.charAt(0).toUpperCase() + lang.slice(1)} Files`,
          extensions: [ext],
        });
      }
      return acc;
    }, []);

    filters.push({ name: "All Files", extensions: ["*"] });
    return filters;
  };

  const getLanguageFromExtension = (extension) => {
    return languageMap[extension.toLowerCase()] || "plaintext";
  };

  const openCmd = async () => {
    try {
      const selectedPath = await open({
        multiple: false,
        filters: generateFileFilters(),
      });

      if (selectedPath) {
        await openFile(selectedPath);
      }
    } catch (error) {
      console.error("Failed to open file:", error);
    }
  };
  const updateWindowTitle = async (filename) => {
    let title = "CortexCode"; // Default app name
    if (filename) {
      title = `${filename} - ${title}`;
    }
  }
  const openFile = async (path) => {
    try {
      const content = await invoke("read_file", { path });
      setEditorContent(content);
      setFilePath(path);
      const extension = await invoke("get_file_extension", { path });
      const detectedLanguage = getLanguageFromExtension(extension);
      setLanguage(detectedLanguage);
      const filename = path.split("/").pop();
      updateWindowTitle(filename);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("Failed to open file:", error);
    }
  };
  useEffect(() => {
    const unlistenNew = appWindow.listen("new-file-trigger", newFile);
    const unlistenSave = appWindow.listen("save-trigger", () =>
      saveFile(false),
    );
    const unlistenSaveAs = appWindow.listen("save-as-trigger", () =>
      saveFile(true),
    );
    const unlistenOpen = appWindow.listen("open-trigger", openCmd);
    return () => {
      unlistenNew.then((f) => f());
      unlistenSave.then((f) => f());
      unlistenSaveAs.then((f) => f());
      unlistenOpen.then((f) => f());
    };
  }, [editorContent, filePath]);

  return (
    <div
      style={{
        background: "#0A1A1A",
        padding: "10px",
        borderRadius: "5px",
        height: height,
      }}
    >
      {themeLoaded && (
        <Editor
        key={language}
        width="100%"
        height="100%"
        language={language} 
        theme="cyanTheme"
        value={editorContent}
        onChange={handleEditorChange}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            // fontFamily: "'Droid Sans Mono','Fira Code', monospace",
            fontFamily: "'Roboto Mono', monospace",
            // fontWeight: "100",
            fontSize: 13,
            lineHeight: 2,
            renderLineHighlight: "all",
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: true,
            smoothScrolling: true,
            padding: { top: 10, bottom: 10 },
          }}
        />
      )}
    </div>
  );
};

export default EditorComponent;
