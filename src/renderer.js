const todoList = document.querySelector("#todoList");
const emptyMessage = document.querySelector("#emptyMessage");
const summaryText = document.querySelector("#summaryText");
const addTopButton = document.querySelector("#addTopButton");
const showIncomplete = document.querySelector("#showIncomplete");
const showCompleted = document.querySelector("#showCompleted");

let todos = [];

const createTodo = () => ({
  id: crypto.randomUUID(),
  title: "",
  completed: false,
  createdAt: new Date().toISOString()
});

const saveTodos = async () => {
  await window.todoApi.saveTodos(todos);
};

const getVisibleTodos = () => todos.filter((todo) => {
  if (todo.completed) {
    return showCompleted.checked;
  }

  return showIncomplete.checked;
});

const updateSummary = () => {
  const completedCount = todos.filter((todo) => todo.completed).length;
  const incompleteCount = todos.length - completedCount;
  summaryText.textContent = `未完了 ${incompleteCount} / 完了 ${completedCount}`;
};

const focusTodoInput = (id) => {
  requestAnimationFrame(() => {
    const input = document.querySelector(`[data-title-input="${id}"]`);
    input?.focus();
  });
};

const render = () => {
  todoList.innerHTML = "";
  const visibleTodos = getVisibleTodos();

  emptyMessage.hidden = visibleTodos.length > 0;

  visibleTodos.forEach((todo) => {
    const item = document.createElement("li");
    item.className = "todo-item";
    item.dataset.completed = String(todo.completed);

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

    const input = document.createElement("input");
    input.className = "todo-title";
    input.value = todo.title;
    input.placeholder = "Todoを入力";
    input.dataset.titleInput = todo.id;
    input.addEventListener("input", () => {
      todo.title = input.value;
      updateSummary();
    });
    input.addEventListener("blur", saveTodos);
    input.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        await addTodoAfter(todo.id);
      }
    });

    const addButton = document.createElement("button");
    addButton.className = "icon-button";
    addButton.type = "button";
    addButton.textContent = "+";
    addButton.title = "この下にTodoを追加";
    addButton.setAttribute("aria-label", "この下にTodoを追加");
    addButton.addEventListener("click", () => addTodoAfter(todo.id));

    item.append(checkbox, input, addButton);
    todoList.append(item);
  });

  updateSummary();
};

const addTodoAt = async (index) => {
  const todo = createTodo();
  todos.splice(index, 0, todo);
  await saveTodos();
  render();
  focusTodoInput(todo.id);
};

const addTodoAfter = async (id) => {
  const index = todos.findIndex((todo) => todo.id === id);
  await addTodoAt(index < 0 ? todos.length : index + 1);
};

addTopButton.addEventListener("click", () => addTodoAt(0));
showIncomplete.addEventListener("change", render);
showCompleted.addEventListener("change", render);

const boot = async () => {
  todos = await window.todoApi.loadTodos();
  render();
};

boot().catch((error) => {
  summaryText.textContent = "読み込みに失敗しました";
  console.error(error);
});
