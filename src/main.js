const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const createDefaultTodo = (title = "") => ({
  id: randomUUID(),
  title,
  completed: false,
  createdAt: new Date().toISOString()
});

const createDefaultList = (name = "マイTodo", todos = []) => ({
  id: randomUUID(),
  name,
  todos,
  createdAt: new Date().toISOString()
});

const createInitialState = () => {
  const list = createDefaultList("マイTodo", [
    createDefaultTodo("Todoを追加してみる"),
    createDefaultTodo("チェックを入れて完了にする")
  ]);

  return {
    selectedListId: list.id,
    lists: [list]
  };
};

const getTodoFilePath = () => path.join(app.getPath("userData"), "todos.json");

const normalizeState = (parsed) => {
  if (Array.isArray(parsed)) {
    const todos = parsed.filter((todo) => typeof todo.id === "string");
    const list = createDefaultList("マイTodo", todos.length > 0 ? todos : [createDefaultTodo()]);
    return {
      selectedListId: list.id,
      lists: [list]
    };
  }

  if (!parsed || !Array.isArray(parsed.lists)) {
    return createInitialState();
  }

  const lists = parsed.lists
    .filter((list) => typeof list.id === "string")
    .map((list) => {
      const todos = Array.isArray(list.todos) ? list.todos.filter((todo) => typeof todo.id === "string") : [];

      return {
        id: list.id,
        name: typeof list.name === "string" && list.name.trim() ? list.name : "無題のリスト",
        todos: todos.length > 0 ? todos : [createDefaultTodo()],
        createdAt: typeof list.createdAt === "string" ? list.createdAt : new Date().toISOString()
      };
    });

  if (lists.length === 0) {
    return createInitialState();
  }

  const selectedListExists = lists.some((list) => list.id === parsed.selectedListId);

  return {
    selectedListId: selectedListExists ? parsed.selectedListId : lists[0].id,
    lists
  };
};

const readState = async () => {
  try {
    const content = await fs.readFile(getTodoFilePath(), "utf8");
    const parsed = JSON.parse(content);
    const state = normalizeState(parsed);
    await writeState(state);
    return state;
  } catch (error) {
    if (error.code === "ENOENT") {
      const initialState = createInitialState();
      await writeState(initialState);
      return initialState;
    }

    throw error;
  }
};

const writeState = async (state) => {
  await fs.mkdir(path.dirname(getTodoFilePath()), { recursive: true });
  await fs.writeFile(getTodoFilePath(), JSON.stringify(normalizeState(state), null, 2), "utf8");
};

const createWindow = () => {
  Menu.setApplicationMenu(null);

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

ipcMain.handle("todos:load", async () => readState());

ipcMain.handle("todos:save", async (_event, state) => {
  await writeState(state);
  return state;
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
