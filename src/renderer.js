const listNav = document.querySelector("#listNav");
const todoList = document.querySelector("#todoList");
const emptyMessage = document.querySelector("#emptyMessage");
const summaryText = document.querySelector("#summaryText");
const currentListTitle = document.querySelector("#currentListTitle");
const addListButton = document.querySelector("#addListButton");
const deleteListButton = document.querySelector("#deleteListButton");
const addTopButton = document.querySelector("#addTopButton");
const showIncomplete = document.querySelector("#showIncomplete");
const showCompleted = document.querySelector("#showCompleted");

let state = {
  selectedListId: "",
  lists: []
};

let draggedTodoId = "";

const createTodo = (parentId = null) => ({
  id: crypto.randomUUID(),
  title: "",
  completed: false,
  parentId,
  createdAt: new Date().toISOString()
});

const createTodoList = () => ({
  id: crypto.randomUUID(),
  name: `新しいリスト ${state.lists.length + 1}`,
  todos: [createTodo()],
  createdAt: new Date().toISOString()
});

const getCurrentList = () => state.lists.find((list) => list.id === state.selectedListId) ?? state.lists[0];

const saveTodos = async () => {
  await window.todoApi.saveTodos(state);
};

const buildTodoTree = (todos) => {
  const todoIds = new Set(todos.map((todo) => todo.id));
  const childrenByParent = new Map();

  todos.forEach((todo) => {
    const parentId = todo.parentId && todoIds.has(todo.parentId) ? todo.parentId : null;
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    childrenByParent.get(parentId).push(todo);
  });

  const walk = (parentId = null, depth = 0) => {
    const children = childrenByParent.get(parentId) ?? [];
    return children.flatMap((todo) => [
      { todo, depth },
      ...walk(todo.id, depth + 1)
    ]);
  };

  return walk();
};

const getVisibleTodoEntries = () => {
  const currentList = getCurrentList();
  const todos = currentList?.todos ?? [];

  return buildTodoTree(todos).filter(({ todo }) => {
    if (todo.completed) {
      return showCompleted.checked;
    }

    return showIncomplete.checked;
  });
};

const updateSummary = () => {
  const todos = getCurrentList()?.todos ?? [];
  const completedCount = todos.filter((todo) => todo.completed).length;
  const incompleteCount = todos.length - completedCount;
  summaryText.textContent = `未完了 ${incompleteCount} / 完了 ${completedCount}`;
};

const getDescendantIds = (todos, id) => {
  const descendantIds = new Set();
  let changed = true;

  while (changed) {
    changed = false;
    todos.forEach((todo) => {
      if (!descendantIds.has(todo.id) && (todo.parentId === id || descendantIds.has(todo.parentId))) {
        descendantIds.add(todo.id);
        changed = true;
      }
    });
  }

  return descendantIds;
};

const getTodoSubtree = (todos, id) => {
  const descendantIds = getDescendantIds(todos, id);
  const subtreeIds = new Set([id, ...descendantIds]);
  return todos.filter((todo) => subtreeIds.has(todo.id));
};

const removeTodoFromCurrentList = (id) => {
  const currentList = getCurrentList();
  if (!currentList || currentList.todos.length <= 1) {
    return false;
  }

  const deleteIds = new Set([id, ...getDescendantIds(currentList.todos, id)]);
  if (deleteIds.size >= currentList.todos.length) {
    return false;
  }

  const originalLength = currentList.todos.length;
  currentList.todos = currentList.todos.filter((todo) => !deleteIds.has(todo.id));
  return currentList.todos.length !== originalLength;
};

const resizeTodoText = (textarea) => {
  textarea.style.height = "0px";
  textarea.style.height = `${textarea.scrollHeight}px`;
};

const focusTodoInput = (id) => {
  requestAnimationFrame(() => {
    const input = document.querySelector(`[data-title-input="${id}"]`);
    input?.focus();
    if (input) {
      resizeTodoText(input);
    }
  });
};

const renderSidebar = () => {
  listNav.innerHTML = "";
  deleteListButton.disabled = state.lists.length <= 1;

  state.lists.forEach((list) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.className = "list-nav-button";
    button.type = "button";
    button.textContent = list.name;
    button.dataset.active = String(list.id === state.selectedListId);
    button.addEventListener("click", async () => {
      state.selectedListId = list.id;
      await saveTodos();
      render();
    });

    item.append(button);
    listNav.append(item);
  });
};

const renderTodos = () => {
  const currentList = getCurrentList();
  currentListTitle.value = currentList?.name ?? "Todoリストなし";
  todoList.innerHTML = "";
  const visibleTodoEntries = getVisibleTodoEntries();

  emptyMessage.hidden = visibleTodoEntries.length > 0;

  visibleTodoEntries.forEach(({ todo, depth }) => {
    const item = document.createElement("li");
    item.className = "todo-item";
    item.dataset.completed = String(todo.completed);
    item.dataset.todoId = todo.id;
    item.dataset.depth = String(depth);
    item.style.setProperty("--todo-depth", depth);
    item.addEventListener("dragover", (event) => {
      event.preventDefault();
      const rect = item.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const mode = y < rect.height * 0.25 ? "before" : y > rect.height * 0.75 ? "after" : "child";
      item.dataset.dragOver = mode;
    });
    item.addEventListener("dragleave", () => {
      delete item.dataset.dragOver;
    });
    item.addEventListener("drop", async (event) => {
      event.preventDefault();
      const mode = item.dataset.dragOver || "after";
      delete item.dataset.dragOver;
      await moveDraggedTodo(todo.id, mode);
    });

    const dragHandle = document.createElement("button");
    dragHandle.className = "drag-handle";
    dragHandle.type = "button";
    dragHandle.draggable = true;
    dragHandle.title = "ドラッグして並び替え";
    dragHandle.setAttribute("aria-label", "ドラッグしてTodoを並び替え");
    dragHandle.addEventListener("dragstart", (event) => {
      draggedTodoId = todo.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", todo.id);
      item.dataset.dragging = "true";
    });
    dragHandle.addEventListener("dragend", () => {
      draggedTodoId = "";
      delete item.dataset.dragging;
      document.querySelectorAll("[data-drag-over]").forEach((element) => {
        delete element.dataset.dragOver;
      });
    });

    const checkbox = document.createElement("input");
    checkbox.className = "todo-check";
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed;
    checkbox.setAttribute("aria-label", "Todoを完了にする");
    checkbox.addEventListener("change", async () => {
      todo.completed = checkbox.checked;
      await saveTodos();
      render();
    });

    const input = document.createElement("textarea");
    input.className = "todo-title";
    input.value = todo.title;
    input.placeholder = "Todoを入力";
    input.rows = 1;
    input.dataset.titleInput = todo.id;
    input.addEventListener("input", () => {
      todo.title = input.value;
      resizeTodoText(input);
      updateSummary();
    });
    input.addEventListener("blur", async () => {
      if (todo.title.trim()) {
        await saveTodos();
        return;
      }

      if (removeTodoFromCurrentList(todo.id)) {
        await saveTodos();
        render();
        return;
      }

      await saveTodos();
    });
    input.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        await addTodoAfter(todo.id);
      }
    });
    requestAnimationFrame(() => resizeTodoText(input));

    const deleteButton = document.createElement("button");
    deleteButton.className = "icon-button danger";
    deleteButton.type = "button";
    deleteButton.disabled = getTodoSubtree(currentList?.todos ?? [], todo.id).length >= (currentList?.todos.length ?? 0);
    deleteButton.textContent = "-";
    deleteButton.title = "このTodoを削除";
    deleteButton.setAttribute("aria-label", "このTodoを削除");
    deleteButton.addEventListener("click", () => deleteTodo(todo.id));

    const addButton = document.createElement("button");
    addButton.className = "icon-button";
    addButton.type = "button";
    addButton.textContent = "+";
    addButton.title = "この下にTodoを追加";
    addButton.setAttribute("aria-label", "この下にTodoを追加");
    addButton.addEventListener("click", () => addTodoAfter(todo.id));

    const rowActions = document.createElement("div");
    rowActions.className = "row-actions";
    rowActions.append(deleteButton, addButton);

    item.append(dragHandle, checkbox, input, rowActions);
    todoList.append(item);
  });

  updateSummary();
};

const render = () => {
  renderSidebar();
  renderTodos();
};

const addTodoAt = async (index, parentId = null) => {
  const currentList = getCurrentList();
  if (!currentList) {
    return;
  }

  const todo = createTodo(parentId);
  currentList.todos.splice(index, 0, todo);
  render();
  focusTodoInput(todo.id);
};

const addTodoAfter = async (id) => {
  const todos = getCurrentList()?.todos ?? [];
  const index = todos.findIndex((todo) => todo.id === id);
  await addTodoAt(index < 0 ? todos.length : index + 1, index < 0 ? null : id);
};

const moveDraggedTodo = async (targetId, mode) => {
  if (!draggedTodoId || draggedTodoId === targetId) {
    return;
  }

  const currentList = getCurrentList();
  if (!currentList) {
    return;
  }

  const movedTodo = currentList.todos.find((todo) => todo.id === draggedTodoId);
  const targetTodo = currentList.todos.find((todo) => todo.id === targetId);
  if (!movedTodo || !targetTodo) {
    return;
  }

  const descendantIds = getDescendantIds(currentList.todos, movedTodo.id);
  if (descendantIds.has(targetTodo.id)) {
    return;
  }

  const subtree = getTodoSubtree(currentList.todos, movedTodo.id);
  const subtreeIds = new Set(subtree.map((todo) => todo.id));
  const remainingTodos = currentList.todos.filter((todo) => !subtreeIds.has(todo.id));
  const targetIndex = remainingTodos.findIndex((todo) => todo.id === targetId);
  if (targetIndex < 0) {
    return;
  }

  if (mode === "child") {
    movedTodo.parentId = targetTodo.id;
    remainingTodos.splice(targetIndex + 1, 0, ...subtree);
  } else {
    movedTodo.parentId = targetTodo.parentId ?? null;
    remainingTodos.splice(mode === "before" ? targetIndex : targetIndex + 1, 0, ...subtree);
  }

  currentList.todos = remainingTodos;
  await saveTodos();
  render();
};

const deleteTodo = async (id) => {
  const currentList = getCurrentList();
  if (!currentList) {
    return;
  }

  if (removeTodoFromCurrentList(id)) {
    await saveTodos();
    render();
  }
};

const addTodoList = async () => {
  const list = createTodoList();
  state.lists.push(list);
  state.selectedListId = list.id;
  await saveTodos();
  render();
  currentListTitle.focus();
  currentListTitle.select();
};

const deleteCurrentList = async () => {
  if (state.lists.length <= 1) {
    return;
  }

  const currentIndex = state.lists.findIndex((list) => list.id === state.selectedListId);
  state.lists = state.lists.filter((list) => list.id !== state.selectedListId);
  const nextIndex = Math.max(0, currentIndex - 1);
  state.selectedListId = state.lists[nextIndex].id;
  await saveTodos();
  render();
};

addTopButton.addEventListener("click", () => addTodoAt(0, null));
addListButton.addEventListener("click", addTodoList);
deleteListButton.addEventListener("click", deleteCurrentList);
currentListTitle.addEventListener("input", () => {
  const currentList = getCurrentList();
  if (!currentList) {
    return;
  }

  currentList.name = currentListTitle.value.trim() || "無題のリスト";
  renderSidebar();
});
currentListTitle.addEventListener("blur", saveTodos);
showIncomplete.addEventListener("change", render);
showCompleted.addEventListener("change", render);

const boot = async () => {
  state = await window.todoApi.loadTodos();
  render();
};

boot().catch((error) => {
  summaryText.textContent = "読み込みに失敗しました";
  console.error(error);
});
