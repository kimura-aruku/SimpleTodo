const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("todoApi", {
  loadTodos: () => ipcRenderer.invoke("todos:load"),
  saveTodos: (todos) => ipcRenderer.invoke("todos:save", todos),
  logError: (payload) => ipcRenderer.invoke("log:error", payload)
});
