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
let dragPreview = null;

const indentWidth = 28;

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

const getFullTodoEntries = () => buildTodoTree(getCurrentList()?.todos ?? []);

const getTodoEntry = (entries, id) => entries.find((entry) => entry.todo.id === id);

const getAncestorEntryAtDepth = (entries, id, depth) => {
  let entry = getTodoEntry(entries, id);

  while (entry && entry.depth > depth) {
    entry = getTodoEntry(entries, entry.todo.parentId);
  }

  return entry && entry.depth === depth ? entry : null;
};

const getLastDescendantId = (entries, id) => {
  const index = entries.findIndex((entry) => entry.todo.id === id);
  if (index < 0) {
    return id;
  }

  let lastEntry = entries[index];
  for (let i = index + 1; i < entries.length; i += 1) {
    if (entries[i].depth <= entries[index].depth) {
      break;
    }
    lastEntry = entries[i];
  }

  return lastEntry.todo.id;
};

const getDropIntent = (targetId, event, item) => {
  const currentList = getCurrentList();
  if (!currentList || !draggedTodoId || draggedTodoId === "") {
    return null;
  }

  const entries = getFullTodoEntries();
  const movedEntry = getTodoEntry(entries, draggedTodoId);
  const targetEntry = getTodoEntry(entries, targetId);
  if (!movedEntry || !targetEntry) {
    return null;
  }

  const descendantIds = getDescendantIds(currentList.todos, draggedTodoId);
  if (descendantIds.has(targetId)) {
    return null;
  }

  const listRect = todoList.getBoundingClientRect();
  const targetRect = item.getBoundingClientRect();
  const y = event.clientY - targetRect.top;
  const verticalMode = y < targetRect.height * 0.3 ? "before" : y > targetRect.height * 0.7 ? "after" : "inside";
  const requestedDepth = Math.max(0, Math.floor((event.clientX - listRect.left) / indentWidth));
  let depth = Math.min(requestedDepth, targetEntry.depth + 1);
  let parentId = null;
  let referenceId = targetId;
  let placement = "after";

  if (verticalMode === "inside" && depth > targetEntry.depth) {
    depth = targetEntry.depth + 1;
    parentId = targetId;
    referenceId = targetId;
    placement = "after";
  } else if (verticalMode === "before") {
    depth = Math.min(depth, targetEntry.depth);
    const ancestorEntry = depth < targetEntry.depth ? getAncestorEntryAtDepth(entries, targetId, depth) : targetEntry;
    if (!ancestorEntry) {
      return null;
    }
    parentId = ancestorEntry.todo.parentId ?? null;
    referenceId = ancestorEntry.todo.id;
    placement = "before";
  } else {
    depth = Math.min(depth, targetEntry.depth);
    const ancestorEntry = depth < targetEntry.depth ? getAncestorEntryAtDepth(entries, targetId, depth) : targetEntry;
    if (!ancestorEntry) {
      return null;
    }
    parentId = ancestorEntry.todo.parentId ?? null;

    const subtreeIds = new Set(getTodoSubtree(currentList.todos, draggedTodoId).map((todo) => todo.id));
    const remainingEntries = entries.filter((entry) => !subtreeIds.has(entry.todo.id));
    referenceId = getLastDescendantId(remainingEntries, ancestorEntry.todo.id);
    placement = "after";
  }

  if (draggedTodoId === referenceId && placement === "after") {
    const ancestorEntry = getAncestorEntryAtDepth(entries, draggedTodoId, depth);
    if (!ancestorEntry) {
      return null;
    }
    const subtreeIds = new Set(getTodoSubtree(currentList.todos, draggedTodoId).map((todo) => todo.id));
    const remainingEntries = entries.filter((entry) => !subtreeIds.has(entry.todo.id));
    referenceId = getLastDescendantId(remainingEntries, ancestorEntry.todo.id);
    parentId = ancestorEntry.todo.parentId ?? null;
  }

  return {
    depth,
    parentId,
    placement,
    referenceId,
    targetId
  };
};

const clearDropPreview = () => {
  dragPreview = null;
  todoList.removeAttribute("data-dragging-active");
  todoList.style.removeProperty("--preview-depth");
  document.querySelectorAll("[data-drag-over]").forEach((element) => {
    delete element.dataset.dragOver;
  });
  document.querySelector(".drop-preview")?.remove();
};

const renderDropPreview = (intent) => {
  document.querySelector(".drop-preview")?.remove();
  if (!intent) {
    return;
  }

  dragPreview = intent;
  todoList.dataset.draggingActive = "true";
  todoList.style.setProperty("--preview-depth", intent.depth);

  const referenceItem = document.querySelector(`[data-todo-id="${intent.referenceId}"]`);
  if (!referenceItem) {
    return;
  }

  const preview = document.createElement("li");
  preview.className = "drop-preview";
  preview.style.setProperty("--todo-depth", intent.depth);
  preview.textContent = `ここに移動（階層 ${intent.depth + 1}）`;

  if (intent.placement === "before") {
    referenceItem.before(preview);
  } else {
    referenceItem.after(preview);
  }
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
      const intent = getDropIntent(todo.id, event, item);
      if (!intent) {
        return;
      }
      item.dataset.dragOver = intent.placement === "before" ? "before" : intent.parentId === todo.id ? "child" : "after";
      renderDropPreview(intent);
    });
    item.addEventListener("dragleave", () => {
      delete item.dataset.dragOver;
    });
    item.addEventListener("drop", async (event) => {
      event.preventDefault();
      const intent = getDropIntent(todo.id, event, item);
      delete item.dataset.dragOver;
      clearDropPreview();
      await moveDraggedTodo(intent);
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
      clearDropPreview();
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

const moveDraggedTodo = async (intent) => {
  if (!draggedTodoId || !intent) {
    return;
  }

  const currentList = getCurrentList();
  if (!currentList) {
    return;
  }

  const movedTodo = currentList.todos.find((todo) => todo.id === draggedTodoId);
  if (!movedTodo) {
    return;
  }

  const descendantIds = getDescendantIds(currentList.todos, movedTodo.id);
  if (descendantIds.has(intent.referenceId) || descendantIds.has(intent.parentId)) {
    return;
  }

  const subtree = getTodoSubtree(currentList.todos, movedTodo.id);
  const subtreeIds = new Set(subtree.map((todo) => todo.id));
  const remainingTodos = currentList.todos.filter((todo) => !subtreeIds.has(todo.id));
  const referenceIndex = remainingTodos.findIndex((todo) => todo.id === intent.referenceId);
  if (referenceIndex < 0) {
    return;
  }

  movedTodo.parentId = intent.parentId;
  remainingTodos.splice(intent.placement === "before" ? referenceIndex : referenceIndex + 1, 0, ...subtree);

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
