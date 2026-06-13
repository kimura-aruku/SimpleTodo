const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const getProjectRootPath = () => {
  if (app.isPackaged) {
    return path.resolve(path.dirname(app.getPath("exe")), "..", "..");
  }

  return app.getAppPath();
};

const getLogFilePath = () => path.join(getProjectRootPath(), "logs", "last-error.log");

const formatLogEntry = (source, error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  return `[${new Date().toISOString()}] [${source}]\n${message}\n\n`;
};

const resetLogFile = async () => {
  await fs.mkdir(path.dirname(getLogFilePath()), { recursive: true });
  await fs.writeFile(getLogFilePath(), "", "utf8");
};

const writeLog = async (source, error) => {
  await fs.appendFile(getLogFilePath(), formatLogEntry(source, error), "utf8");
};

process.on("uncaughtException", (error) => {
  writeLog("main:uncaughtException", error).catch(() => {});
});

process.on("unhandledRejection", (reason) => {
  writeLog("main:unhandledRejection", reason).catch(() => {});
});

const createDefaultTodo = (title = "", parentId = null) => ({
  id: randomUUID(),
  title,
  completed: false,
  parentId,
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
    const todos = normalizeTodos(parsed);
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
      const todos = Array.isArray(list.todos) ? normalizeTodos(list.todos) : [];

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

const normalizeTodos = (todos) => {
  const validTodos = todos
    .filter((todo) => typeof todo.id === "string")
    .map((todo) => ({
      id: todo.id,
      title: typeof todo.title === "string" ? todo.title : "",
      completed: Boolean(todo.completed),
      parentId: typeof todo.parentId === "string" ? todo.parentId : null,
      createdAt: typeof todo.createdAt === "string" ? todo.createdAt : new Date().toISOString()
    }));
  const todoIds = new Set(validTodos.map((todo) => todo.id));

  return validTodos.map((todo) => ({
    ...todo,
    parentId: todo.parentId && todoIds.has(todo.parentId) && todo.parentId !== todo.id ? todo.parentId : null
  }));
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

ipcMain.handle("log:error", async (_event, payload) => {
  await writeLog(payload?.source ?? "renderer", payload?.message ?? payload);
});

app.whenReady().then(async () => {
  await resetLogFile();
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
