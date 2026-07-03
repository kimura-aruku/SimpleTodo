const listNav = document.querySelector("#listNav");
const todoList = document.querySelector("#todoList");
const emptyMessage = document.querySelector("#emptyMessage");
const summaryText = document.querySelector("#summaryText");
const currentListTitle = document.querySelector("#currentListTitle");
const addListButton = document.querySelector("#addListButton");
const deleteListButton = document.querySelector("#deleteListButton");
const addTopButton = document.querySelector("#addTopButton");
const detailModeSelect = document.querySelector("#detailModeSelect");
const showIncomplete = document.querySelector("#showIncomplete");
const showCompleted = document.querySelector("#showCompleted");

let state = {
  selectedListId: "",
  detailMode: "simple",
  lists: []
};

let draggedTodoId = "";
let dragPreview = null;
let draggedItemElement = null;
const movedEmptyTodoIds = new Set();
const undoStack = [];
const editSnapshots = new Map();
let activeEditKey = "";
let activeEditInitialValue = "";

const indentWidth = 28;
const maxUndoEntries = 100;
const todayIsoDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const sanitizeEffortValue = (value) => {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [integerPart, ...decimalParts] = cleaned.split(".");
  if (decimalParts.length === 0) {
    return integerPart;
  }

  return `${integerPart}.${decimalParts.join("")}`;
};

const parseEffortValue = (value) => {
  if (typeof value !== "string" || !value.trim() || value === ".") {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatEffortTotal = (value) => {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
};

const logClientError = (source, error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  window.todoApi.logError({ source, message }).catch(() => {});
};

const logClientDebug = (source, detail) => {
  window.todoApi.logError({ source, message: typeof detail === "string" ? detail : JSON.stringify(detail) }).catch(() => {});
};

window.addEventListener("error", (event) => {
  logClientError("renderer:error", event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  logClientError("renderer:unhandledrejection", event.reason);
});

const createTodo = (parentId = null) => ({
  id: crypto.randomUUID(),
  title: "",
  completed: false,
  dueDate: "",
  effort: "",
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

const getDetailMode = () => state.detailMode || "simple";

const cloneState = (targetState = state) => JSON.parse(JSON.stringify(targetState));

const statesAreEqual = (firstState, secondState) => JSON.stringify(firstState) === JSON.stringify(secondState);

const pushUndoSnapshot = (snapshot) => {
  if (!snapshot) {
    return;
  }

  const previousSnapshot = undoStack.at(-1);
  if (previousSnapshot && statesAreEqual(previousSnapshot, snapshot)) {
    return;
  }

  undoStack.push(cloneState(snapshot));
  if (undoStack.length > maxUndoEntries) {
    undoStack.shift();
  }
};

const captureEditSnapshot = (key) => {
  editSnapshots.set(key, cloneState());
};

const beginEdit = (key, element) => {
  activeEditKey = key;
  activeEditInitialValue = element.value;
  captureEditSnapshot(key);
};

const commitEditSnapshot = (key) => {
  const snapshot = editSnapshots.get(key);
  editSnapshots.delete(key);
  if (activeEditKey === key) {
    activeEditKey = "";
    activeEditInitialValue = "";
  }
  if (!snapshot || statesAreEqual(snapshot, state)) {
    return;
  }

  const previousSnapshot = undoStack.at(-1);
  if (previousSnapshot && statesAreEqual(previousSnapshot, state)) {
    return;
  }

  pushUndoSnapshot(snapshot);
};

const undoLastAction = async () => {
  const snapshot = undoStack.pop();
  if (!snapshot) {
    return;
  }

  clearDropPreview();
  draggedItemElement?.removeAttribute("data-dragging");
  draggedItemElement = null;
  draggedTodoId = "";
  movedEmptyTodoIds.clear();
  editSnapshots.clear();
  state = cloneState(snapshot);
  await saveTodos();
  render();
};

const isEditableElement = (element) => element instanceof HTMLInputElement
  || element instanceof HTMLTextAreaElement
  || element?.isContentEditable;

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
  const completedTodos = todos.filter((todo) => todo.completed);
  const incompleteTodos = todos.filter((todo) => !todo.completed);
  const completedCount = completedTodos.length;
  const incompleteCount = todos.length - completedCount;
  if (getDetailMode() !== "effort") {
    summaryText.textContent = `未完了 ${incompleteCount} / 完了 ${completedCount}`;
    return;
  }

  const incompleteEffort = incompleteTodos.reduce((total, todo) => total + parseEffortValue(todo.effort), 0);
  const completedEffort = completedTodos.reduce((total, todo) => total + parseEffortValue(todo.effort), 0);
  summaryText.textContent = `未完了 ${incompleteCount}（工数 ${formatEffortTotal(incompleteEffort)}） / 完了 ${completedCount}（工数 ${formatEffortTotal(completedEffort)}）`;
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

const getParentIdForDepth = (entries, referenceEntry, depth) => {
  if (depth <= 0) {
    return null;
  }

  if (depth === referenceEntry.depth + 1) {
    return referenceEntry.todo.id;
  }

  const parentDepth = depth - 1;
  const parentEntry = referenceEntry.depth === parentDepth
    ? referenceEntry
    : getAncestorEntryAtDepth(entries, referenceEntry.todo.id, parentDepth);

  return parentEntry?.todo.id ?? null;
};

const getReferenceForAfterDrop = (entries, referenceEntry, depth) => {
  if (depth < referenceEntry.depth) {
    const ancestorEntry = getAncestorEntryAtDepth(entries, referenceEntry.todo.id, depth);
    return ancestorEntry?.todo.id ?? referenceEntry.todo.id;
  }

  return referenceEntry.todo.id;
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
  const verticalMode = y < targetRect.height * 0.35 ? "before" : "after";
  const requestedDepth = Math.max(0, Math.floor((event.clientX - listRect.left) / indentWidth));
  const maxDepth = verticalMode === "before" ? targetEntry.depth : targetEntry.depth + 1;
  const depth = Math.min(requestedDepth, maxDepth);
  const parentId = getParentIdForDepth(entries, targetEntry, depth);
  const referenceId = verticalMode === "before"
    ? targetEntry.todo.id
    : getReferenceForAfterDrop(entries, targetEntry, depth);

  if (draggedTodoId === referenceId) {
    return null;
  }

  return {
    depth,
    parentId,
    placement: verticalMode,
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
  const draggedTodo = getCurrentList()?.todos.find((todo) => todo.id === draggedTodoId);
  preview.textContent = draggedTodo?.title.trim() || "無題のTodo";

  if (intent.placement === "before") {
    referenceItem.before(preview);
  } else {
    referenceItem.after(preview);
  }
};

const getTodoItemAtY = (clientY) => {
  const items = [...todoList.querySelectorAll(".todo-item:not([data-dragging='true'])")];
  if (items.length === 0) {
    return null;
  }

  return items.find((item) => {
    const rect = item.getBoundingClientRect();
    return clientY >= rect.top && clientY <= rect.bottom;
  }) ?? items.reduce((nearestItem, item) => {
    const nearestRect = nearestItem.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const nearestDistance = Math.min(Math.abs(clientY - nearestRect.top), Math.abs(clientY - nearestRect.bottom));
    const itemDistance = Math.min(Math.abs(clientY - itemRect.top), Math.abs(clientY - itemRect.bottom));
    return itemDistance < nearestDistance ? item : nearestItem;
  });
};

const updateDropPreviewFromEvent = (event) => {
  if (!draggedTodoId) {
    return null;
  }

  const item = getTodoItemAtY(event.clientY);
  if (!item) {
    return null;
  }

  const intent = getDropIntent(item.dataset.todoId, event, item);
  document.querySelectorAll("[data-drag-over]").forEach((element) => {
    delete element.dataset.dragOver;
  });

  if (!intent) {
    document.querySelector(".drop-preview")?.remove();
    return null;
  }

  item.dataset.dragOver = intent.placement;
  renderDropPreview(intent);
  return intent;
};

const startTodoDrag = (todo, depth, item, event) => {
  event.preventDefault();
  draggedTodoId = todo.id;
  draggedItemElement = item;
  item.dataset.dragging = "true";
  todoList.dataset.draggingActive = "true";
  logClientDebug("renderer:pointerDragStart", {
    draggedTodoId,
    title: todo.title,
    depth
  });
};

const updateTodoDrag = (event) => {
  if (!draggedTodoId) {
    return;
  }

  try {
    updateDropPreviewFromEvent(event);
  } catch (error) {
    logClientError("renderer:pointerDragMove", error);
  }
};

const finishTodoDrag = async (event) => {
  if (!draggedTodoId) {
    return;
  }

  try {
    updateDropPreviewFromEvent(event);
    const intent = dragPreview;
    logClientDebug("renderer:pointerDragEnd", {
      draggedTodoId,
      intent,
      clientX: event.clientX,
      clientY: event.clientY
    });
    clearDropPreview();
    await moveDraggedTodo(intent);
  } catch (error) {
    logClientError("renderer:pointerDragEnd", error);
  } finally {
    draggedItemElement?.removeAttribute("data-dragging");
    draggedItemElement = null;
    draggedTodoId = "";
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

    const dragHandle = document.createElement("button");
    dragHandle.className = "drag-handle";
    dragHandle.type = "button";
    dragHandle.title = "ドラッグして並び替え";
    dragHandle.setAttribute("aria-label", "ドラッグしてTodoを並び替え");
    dragHandle.addEventListener("pointerdown", (event) => startTodoDrag(todo, depth, item, event));

    const checkbox = document.createElement("input");
    checkbox.className = "todo-check";
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed;
    checkbox.setAttribute("aria-label", "Todoを完了にする");
    checkbox.addEventListener("change", async () => {
      pushUndoSnapshot(cloneState());
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
    input.addEventListener("focus", () => beginEdit(`todo:${todo.id}`, input));
    input.addEventListener("input", () => {
      todo.title = input.value;
      if (todo.title.trim()) {
        movedEmptyTodoIds.delete(todo.id);
      }
      resizeTodoText(input);
      updateSummary();
    });
    input.addEventListener("blur", async () => {
      if (todo.title.trim()) {
        commitEditSnapshot(`todo:${todo.id}`);
        await saveTodos();
        return;
      }

      if (draggedTodoId === todo.id) {
        return;
      }

      if (movedEmptyTodoIds.has(todo.id)) {
        commitEditSnapshot(`todo:${todo.id}`);
        await saveTodos();
        return;
      }

      if (removeTodoFromCurrentList(todo.id)) {
        commitEditSnapshot(`todo:${todo.id}`);
        await saveTodos();
        render();
        return;
      }

      commitEditSnapshot(`todo:${todo.id}`);
      await saveTodos();
    });
    input.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        await addChildTodoToEnd(todo.id);
      }
    });
    requestAnimationFrame(() => resizeTodoText(input));

    const detailField = document.createElement("div");
    detailField.className = "todo-detail-field";
    if (getDetailMode() === "deadline") {
      const dueDateWrapper = document.createElement("div");
      dueDateWrapper.className = "todo-date-wrapper";
      const dueDateInput = document.createElement("input");
      dueDateInput.className = "todo-date";
      dueDateInput.type = "date";
      dueDateInput.value = typeof todo.dueDate === "string" ? todo.dueDate : "";
      dueDateInput.min = "1900-01-01";
      dueDateInput.placeholder = todayIsoDate();
      dueDateInput.setAttribute("aria-label", "締切日");
      const dueDatePlaceholder = document.createElement("button");
      dueDatePlaceholder.className = "todo-date-placeholder";
      dueDatePlaceholder.type = "button";
      dueDatePlaceholder.setAttribute("aria-label", "締切日を選択");
      const syncDueDateInputState = () => {
        const isEmpty = dueDateInput.value === "";
        dueDateInput.classList.toggle("is-empty", isEmpty);
        dueDatePlaceholder.classList.toggle("is-empty", isEmpty);
        dueDatePlaceholder.textContent = isEmpty ? "年/月/日" : "";
      };
      const openDueDatePicker = () => {
        if (typeof dueDateInput.showPicker === "function") {
          dueDateInput.showPicker();
          return;
        }
        dueDateInput.focus({ preventScroll: true });
        dueDateInput.click();
      };
      syncDueDateInputState();
      dueDateInput.addEventListener("focus", () => beginEdit(`due-date:${todo.id}`, dueDateInput));
      dueDateInput.addEventListener("input", syncDueDateInputState);
      dueDatePlaceholder.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openDueDatePicker();
      });
      dueDateInput.addEventListener("change", async () => {
        todo.dueDate = dueDateInput.value;
        syncDueDateInputState();
        commitEditSnapshot(`due-date:${todo.id}`);
        await saveTodos();
      });
      dueDateInput.addEventListener("blur", async () => {
        todo.dueDate = dueDateInput.value;
        syncDueDateInputState();
        commitEditSnapshot(`due-date:${todo.id}`);
        await saveTodos();
      });
      dueDateWrapper.append(dueDateInput, dueDatePlaceholder);
      detailField.append(dueDateWrapper);
    } else if (getDetailMode() === "effort") {
      const effortInput = document.createElement("input");
      effortInput.className = "todo-effort";
      effortInput.type = "text";
      effortInput.inputMode = "decimal";
      effortInput.value = typeof todo.effort === "string" ? todo.effort : "";
      effortInput.placeholder = "工数";
      effortInput.setAttribute("aria-label", "工数");
      effortInput.addEventListener("focus", () => beginEdit(`effort:${todo.id}`, effortInput));
      effortInput.addEventListener("input", () => {
        const sanitizedValue = sanitizeEffortValue(effortInput.value);
        if (effortInput.value !== sanitizedValue) {
          effortInput.value = sanitizedValue;
        }
        todo.effort = sanitizedValue;
        updateSummary();
      });
      effortInput.addEventListener("blur", async () => {
        todo.effort = sanitizeEffortValue(effortInput.value);
        effortInput.value = todo.effort;
        commitEditSnapshot(`effort:${todo.id}`);
        await saveTodos();
      });
      detailField.append(effortInput);
    }

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
    addButton.title = "子Todoを末尾に追加";
    addButton.setAttribute("aria-label", "子Todoを末尾に追加");
    addButton.addEventListener("click", () => addChildTodoToEnd(todo.id));

    const rowActions = document.createElement("div");
    rowActions.className = "row-actions";
    rowActions.append(deleteButton, addButton);

    item.append(dragHandle, checkbox, input, detailField, rowActions);
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

  pushUndoSnapshot(cloneState());
  const todo = createTodo(parentId);
  currentList.todos.splice(index, 0, todo);
  render();
  focusTodoInput(todo.id);
};

const getTodoSubtreeEndIndex = (todos, id) => {
  const subtreeIds = new Set([id, ...getDescendantIds(todos, id)]);

  for (var index = todos.length - 1; index >= 0; index -= 1) {
    if (subtreeIds.has(todos[index].id)) {
      return index;
    }
  }

  return -1;
};

const addChildTodoToEnd = async (id) => {
  const todos = getCurrentList()?.todos ?? [];
  const parentExists = todos.some((todo) => todo.id === id);
  const index = parentExists ? getTodoSubtreeEndIndex(todos, id) + 1 : todos.length;
  await addTodoAt(index, parentExists ? id : null);
};

const addRootTodoToEnd = async () => {
  const todos = getCurrentList()?.todos ?? [];
  await addTodoAt(todos.length, null);
};

const moveDraggedTodo = async (intent) => {
  if (!draggedTodoId || !intent) {
    logClientError("renderer:moveSkipped", `draggedTodoId=${draggedTodoId || "(empty)"}, intent=${JSON.stringify(intent)}`);
    return;
  }

  const currentList = getCurrentList();
  if (!currentList) {
    logClientError("renderer:moveSkipped", "currentList is missing");
    return;
  }

  const movedTodo = currentList.todos.find((todo) => todo.id === draggedTodoId);
  if (!movedTodo) {
    logClientError("renderer:moveSkipped", `movedTodo is missing: ${draggedTodoId}`);
    return;
  }

  const movedEntry = getTodoEntry(getFullTodoEntries(), draggedTodoId);
  const oldParentId = movedTodo.parentId ?? null;
  const undoSnapshot = cloneState();

  const descendantIds = getDescendantIds(currentList.todos, movedTodo.id);
  const isOutdenting = movedEntry && intent.depth < movedEntry.depth;
  if ((!isOutdenting && descendantIds.has(intent.referenceId)) || descendantIds.has(intent.parentId)) {
    logClientError("renderer:moveBlocked", JSON.stringify({
      draggedTodoId,
      intent,
      isOutdenting,
      reason: "descendant-reference"
    }));
    return;
  }

  pushUndoSnapshot(undoSnapshot);
  if (movedEntry && intent.depth < movedEntry.depth) {
    currentList.todos.forEach((todo) => {
      if (todo.parentId === movedTodo.id) {
        todo.parentId = oldParentId;
      }
    });
  }

  const remainingTodos = currentList.todos.filter((todo) => todo.id !== movedTodo.id);
  const referenceIndex = remainingTodos.findIndex((todo) => todo.id === intent.referenceId);
  if (referenceIndex < 0) {
    logClientError("renderer:moveSkipped", JSON.stringify({
      draggedTodoId,
      intent,
      reason: "reference-not-found"
    }));
    return;
  }

  movedTodo.parentId = intent.parentId;
  remainingTodos.splice(intent.placement === "before" ? referenceIndex : referenceIndex + 1, 0, movedTodo);
  if (!movedTodo.title.trim()) {
    movedEmptyTodoIds.add(movedTodo.id);
  }

  currentList.todos = remainingTodos;
  await saveTodos();
  logClientDebug("renderer:moveSucceeded", {
    movedTodoId: movedTodo.id,
    parentId: movedTodo.parentId,
    referenceId: intent.referenceId,
    placement: intent.placement,
    depth: intent.depth
  });
  render();
};

const deleteTodo = async (id) => {
  const currentList = getCurrentList();
  if (!currentList) {
    return;
  }

  const undoSnapshot = cloneState();
  if (removeTodoFromCurrentList(id)) {
    pushUndoSnapshot(undoSnapshot);
    await saveTodos();
    render();
  }
};

const addTodoList = async () => {
  pushUndoSnapshot(cloneState());
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

  pushUndoSnapshot(cloneState());
  const currentIndex = state.lists.findIndex((list) => list.id === state.selectedListId);
  state.lists = state.lists.filter((list) => list.id !== state.selectedListId);
  const nextIndex = Math.max(0, currentIndex - 1);
  state.selectedListId = state.lists[nextIndex].id;
  await saveTodos();
  render();
};

addTopButton.addEventListener("click", addRootTodoToEnd);
addListButton.addEventListener("click", addTodoList);
deleteListButton.addEventListener("click", deleteCurrentList);
currentListTitle.addEventListener("focus", () => beginEdit("current-list-title", currentListTitle));
currentListTitle.addEventListener("input", () => {
  const currentList = getCurrentList();
  if (!currentList) {
    return;
  }

  currentList.name = currentListTitle.value.trim() || "無題のリスト";
  renderSidebar();
});
currentListTitle.addEventListener("blur", async () => {
  commitEditSnapshot("current-list-title");
  await saveTodos();
});
showIncomplete.addEventListener("change", render);
showCompleted.addEventListener("change", render);
detailModeSelect.addEventListener("change", async () => {
  state.detailMode = detailModeSelect.value;
  await saveTodos();
  render();
});
window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() !== "z" || !event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
    return;
  }

  if (isEditableElement(document.activeElement)) {
    if (document.activeElement.value !== activeEditInitialValue) {
      return;
    }
  }

  event.preventDefault();
  undoLastAction().catch((error) => logClientError("renderer:undo", error));
});
window.addEventListener("pointermove", updateTodoDrag);
window.addEventListener("pointerup", finishTodoDrag);
window.addEventListener("pointercancel", finishTodoDrag);

const boot = async () => {
  state = await window.todoApi.loadTodos();
  detailModeSelect.value = getDetailMode();
  render();
};

boot().catch((error) => {
  summaryText.textContent = "読み込みに失敗しました";
  logClientError("renderer:boot", error);
  console.error(error);
});
