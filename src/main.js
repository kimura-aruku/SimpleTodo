const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const createDefaultTodo = (title = "") => ({
  id: randomUUID(),
  title,
  completed: false,
  createdAt: new Date().toISOString()
});

const getTodoFilePath = () => path.join(app.getPath("userData"), "todos.json");

const readTodos = async () => {
  try {
    const content = await fs.readFile(getTodoFilePath(), "utf8");
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((todo) => typeof todo.id === "string");
  } catch (error) {
    if (error.code === "ENOENT") {
      const initialTodos = [
        createDefaultTodo("Todoを追加してみる"),
        createDefaultTodo("チェックを入れて完了にする")
      ];
      await writeTodos(initialTodos);
      return initialTodos;
    }

    throw error;
  }
};

const writeTodos = async (todos) => {
  await fs.mkdir(path.dirname(getTodoFilePath()), { recursive: true });
  await fs.writeFile(getTodoFilePath(), JSON.stringify(todos, null, 2), "utf8");
};

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 520,
    minHeight: 420,
    title: "Simple Todo",
    backgroundColor: "#f6f7f9",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
};

ipcMain.handle("todos:load", async () => readTodos());

ipcMain.handle("todos:save", async (_event, todos) => {
  await writeTodos(todos);
  return todos;
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
