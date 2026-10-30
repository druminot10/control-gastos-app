const STORAGE_KEY = "mis-gastos-v1";
const THEME_STORAGE_KEY = "mis-gastos-theme";
const CATEGORIES_STORAGE_KEY = "mis-gastos-categories-v1";
const INSTALL_DATE_KEY = "mis-gastos-install-date";
const defaultCategories = [
  { name: "Pasajes", emoji: "🚌" },
  { name: "Comida", emoji: "🍊" },
  { name: "Transporte", emoji: "🚌" },
  { name: "Compras súper", emoji: "🛒" },
  { name: "Hogar", emoji: "🏡" },
  { name: "Salud", emoji: "💊" },
  { name: "Ocio", emoji: "🎈" },
  { name: "Otros", emoji: "✳️" },
];
const descriptionIcons = [
  [/cafe|cafeteria|te\b|desayuno|espresso|capuccino|latte/, "☕"],
  [/pizza/, "🍕"],
  [/hamburguesa|burger|sushi|restaurante|almuerzo|cena|comida/, "🍽️"],
  [/supermercado|super|verdura|fruta|mercado|compras/, "🛒"],
  [/bus|micro|metro|pasajes|transantiago/, "🚌"],
  [/taxi|uber|cabify/, "🚕"],
  [/bencina|gasolina|combustible/, "⛽"],
  [/bicicleta|bici/, "🚲"],
  [/arriendo|alquiler|casa|hogar|mueble|decoracion/, "🏠"],
  [/luz|electricidad|lampara/, "💡"],
  [/agua|gasfiter/, "💧"],
  [/internet|wifi|telefono|celular/, "📱"],
  [/farmacia|remedio|medicamento|doctor|medico|consulta/, "💊"],
  [/gimnasio|gym|deporte|ejercicio/, "🏋️"],
  [/cine|pelicula|netflix/, "🎬"],
  [/musica|concierto/, "🎵"],
  [/viaje|avion|vuelo|hotel|vacaciones/, "✈️"],
  [/ropa|zapato|tienda/, "🛍️"],
  [/mascota|perro|gato|veterinario/, "🐾"],
  [/libro|libreria|estudio|curso/, "📚"],
  [/regalo|cumpleanos/, "🎁"],
];

const $ = (selector) => document.querySelector(selector);
const currentDate = $("#current-date");
const monthTotal = $("#month-total");
const monthCaption = $("#month-caption");
const monthCount = $("#month-count");
const expenseList = $("#expense-list");
const emptyState = $("#empty-state");
const categoryFilter = $("#category-filter");
const expenseDialog = $("#expense-dialog");
const expenseForm = $("#expense-form");
const expenseDate = $("#expense-date");
const formError = $("#form-error");
const categoryDialog = $("#category-dialog");
const categoryForm = $("#category-form");
const categoryNameInput = $("#category-name");
const categoryError = $("#category-error");
const confirmDialog = $("#confirm-dialog");

const today = new Date();
today.setHours(0, 0, 0, 0);

function toLocalDateString(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function fromLocalDateString(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

const todayAsInput = toLocalDateString(today);
let installDate;
try {
  const storedInstallDate = localStorage.getItem(INSTALL_DATE_KEY);
  if (storedInstallDate && /^\d{4}-\d{2}-\d{2}$/.test(storedInstallDate)) {
    installDate = storedInstallDate;
  } else {
    installDate = todayAsInput;
    localStorage.setItem(INSTALL_DATE_KEY, installDate);
  }
} catch (error) {
  console.error("No se pudo leer o guardar la fecha de instalación.", error);
  installDate = todayAsInput;
}

let activePeriod = "month";
let selectedDate = todayAsInput;
let selectedYearMonth = todayAsInput.slice(0, 7);
let selectedYearMonthDay = false;
let pendingConfirmation = null;
let categories = readCategories();

const currentDateLabel = new Intl.DateTimeFormat("es-CL", {
  weekday: "long",
  day: "numeric",
  month: "long",
}).format(today);
currentDate.textContent = currentDateLabel.toLocaleUpperCase("es-CL");

function getGreeting(hour = new Date().getHours()) {
  if (hour >= 5 && hour < 12) return "Buenos días, Diego";
  if (hour >= 12 && hour < 20) return "Buenas tardes, Diego";
  if (hour >= 1 && hour < 5) return "¡Qué bueno verte despierto, Diego!";
  return "Buenas noches, Diego";
}

$("#greeting").textContent = getGreeting();

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  $("#theme-toggle").setAttribute("aria-label", isDark ? "Activar modo claro" : "Activar modo oscuro");
  $("#theme-icon").textContent = isDark ? "☀" : "☾";
  $("#theme-label").textContent = isDark ? "Modo claro" : "Modo oscuro";
  $('meta[name="theme-color"]').content = isDark ? "#19211b" : "#f5f6f2";
}

function toggleTheme() {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.error("No se pudo guardar la preferencia de tema.", error);
  }
}

try {
  applyTheme(localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light");
} catch (error) {
  console.error("No se pudo leer la preferencia de tema.", error);
  applyTheme("light");
}

function normalizeText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function suggestEmoji(value) {
  const text = normalizeText(value);
  const matchingIcon = descriptionIcons.find(([pattern]) => pattern.test(text));
  return matchingIcon?.[1] ?? "✨";
}

function readCategories() {
  try {
    const saved = localStorage.getItem(CATEGORIES_STORAGE_KEY);
    if (!saved) return [...defaultCategories];
    const parsed = JSON.parse(saved);
    if (
      !Array.isArray(parsed) ||
      parsed.some(
        (category) =>
          typeof category.name !== "string" ||
          typeof category.emoji !== "string",
      )
    ) {
      throw new Error("Las secciones guardadas no tienen el formato esperado.");
    }
    return parsed;
  } catch (error) {
    console.error("No se pudieron leer las secciones guardadas.", error);
    return [...defaultCategories];
  }
}

function saveCategories() {
  try {
    localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
    categoryError.textContent = "";
    return true;
  } catch (error) {
    console.error("No se pudieron guardar las secciones.", error);
    categoryError.textContent = "No se pudo guardar. Revisa el espacio disponible en tu dispositivo.";
    return false;
  }
}

function readExpenses() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (
      !Array.isArray(parsed) ||
      parsed.some(
        (expense) =>
          typeof expense.id !== "string" ||
          typeof expense.description !== "string" ||
          typeof expense.amount !== "number" ||
          typeof expense.category !== "string" ||
          typeof expense.date !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(expense.date),
      )
    ) {
      throw new Error("Los datos guardados no tienen el formato esperado.");
    }
    return parsed;
  } catch (error) {
    console.error("No se pudieron leer los gastos guardados.", error);
    formError.textContent = "No se pudieron cargar tus gastos guardados.";
    return [];
  }
}

let expenses = readExpenses();

function saveExpenses() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
    formError.textContent = "";
    return true;
  } catch (error) {
    console.error("No se pudieron guardar los gastos.", error);
    formError.textContent = "No se pudo guardar. Revisa el espacio disponible en tu dispositivo.";
    return false;
  }
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateString, options = { day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat("es-CL", options).format(fromLocalDateString(dateString));
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function weekStart(date) {
  const start = new Date(date);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  return start;
}

function periodBounds(period = activePeriod) {
  const anchor = fromLocalDateString(selectedDate);
  if (period === "day") return [selectedDate, selectedDate];
  if (period === "week") {
    const start = weekStart(anchor);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return [toLocalDateString(start), toLocalDateString(end)];
  }
  if (period === "month") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return [toLocalDateString(start), toLocalDateString(end)];
  }
  return [`${anchor.getFullYear()}-01-01`, `${anchor.getFullYear()}-12-31`];
}

function moveDate(date, period, amount) {
  const moved = new Date(date);
  if (period === "day") moved.setDate(moved.getDate() + amount);
  if (period === "week") moved.setDate(moved.getDate() + amount * 7);
  if (period === "month" || period === "year") {
    const originalDay = moved.getDate();
    moved.setDate(1);
    if (period === "month") moved.setMonth(moved.getMonth() + amount);
    if (period === "year") moved.setFullYear(moved.getFullYear() + amount);
    moved.setDate(Math.min(originalDay, new Date(moved.getFullYear(), moved.getMonth() + 1, 0).getDate()));
  }
  return moved;
}

function shiftPeriod(amount) {
  const date = moveDate(fromLocalDateString(selectedDate), activePeriod, amount);
  const candidate = toLocalDateString(date);
  if (candidate > todayAsInput || periodEndForDate(date, activePeriod) < installDate) return;
  selectedDate = candidate;
  selectedYearMonth = candidate.slice(0, 7);
  selectedYearMonthDay = false;
  render();
}

function periodEndForDate(date, period) {
  if (period === "week") {
    const end = weekStart(date);
    end.setDate(end.getDate() + 6);
    return toLocalDateString(end);
  }
  if (period === "month") return toLocalDateString(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  if (period === "year") return `${date.getFullYear()}-12-31`;
  return toLocalDateString(date);
}

function isDateAllowed(value) {
  return value >= installDate && value <= todayAsInput;
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function dateExpenseTotal(date) {
  const selectedCategory = categoryFilter.value;
  return expenses
    .filter((expense) => expense.date === date)
    .filter((expense) => selectedCategory === "all" || expense.category === selectedCategory)
    .reduce((sum, expense) => sum + expense.amount, 0);
}

function expensesForSelectedPeriod() {
  const selectedCategory = categoryFilter.value;
  const [start, end] = periodBounds();
  let visible = expenses.filter((expense) => expense.date >= start && expense.date <= end);

  if (activePeriod === "day" || activePeriod === "week" || activePeriod === "month") {
    visible = visible.filter((expense) => expense.date === selectedDate);
  } else if (selectedYearMonthDay) {
    visible = visible.filter((expense) => expense.date === selectedDate);
  } else if (selectedYearMonth) {
    visible = visible.filter((expense) => expense.date.startsWith(selectedYearMonth));
  }

  return visible
    .filter((expense) => selectedCategory === "all" || expense.category === selectedCategory)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

function updateSummary() {
  const thisMonth = todayAsInput.slice(0, 7);
  const monthlyExpenses = expenses.filter((expense) => expense.date.startsWith(thisMonth));
  const total = monthlyExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  monthTotal.textContent = formatCurrency(total);
  monthCount.textContent = String(monthlyExpenses.length);
  monthCaption.textContent =
    monthlyExpenses.length === 0 ? "Todavía no hay gastos este mes" : "sumados durante este mes";
}

function createOverviewButton(title, subtitle, total, { disabled = false, selected = false, onClick } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `overview-item${selected ? " is-selected" : ""}`;
  button.disabled = disabled;
  button.setAttribute("aria-pressed", String(selected));
  const name = document.createElement("span");
  name.className = "overview-name";
  name.textContent = title;
  const detail = document.createElement("span");
  detail.className = "overview-subtitle";
  detail.textContent = subtitle;
  const amount = document.createElement("span");
  amount.className = "overview-total";
  amount.textContent = disabled ? "🔒" : formatCurrency(total);
  button.append(name, detail, amount);
  if (onClick && !disabled) button.addEventListener("click", onClick);
  return button;
}

function getPeriodTitle() {
  const date = fromLocalDateString(selectedDate);
  if (activePeriod === "day") {
    return formatDate(selectedDate, { weekday: "long", day: "numeric", month: "long" });
  }
  if (activePeriod === "week") {
    const [start, end] = periodBounds();
    return `${formatDate(start)} – ${formatDate(end, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  if (activePeriod === "month") {
    return new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(date);
  }
  return String(date.getFullYear());
}

function renderPeriodOverview() {
  const overview = $("#period-overview");
  const title = $("#period-title");
  title.textContent = getPeriodTitle();
  overview.replaceChildren();
  overview.className = `period-overview ${activePeriod}-overview`;

  document.querySelectorAll(".period-tab").forEach((tab) => {
    const isActive = tab.dataset.period === activePeriod;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  const previous = $("#previous-period");
  const previousDate = moveDate(fromLocalDateString(selectedDate), activePeriod, -1);
  previous.disabled = periodEndForDate(previousDate, activePeriod) < installDate;
  const next = $("#next-period");
  const nextDate = moveDate(fromLocalDateString(selectedDate), activePeriod, 1);
  next.disabled = toLocalDateString(nextDate) > todayAsInput;
  previous.textContent = previous.disabled ? "🔒" : "‹";
  next.textContent = next.disabled ? "🔒" : "›";
  previous.setAttribute("aria-label", previous.disabled ? "Período anterior bloqueado" : "Período anterior");
  next.setAttribute("aria-label", next.disabled ? "Período siguiente bloqueado" : "Período siguiente");

  if (activePeriod === "day") return;

  if (activePeriod === "week") {
    const start = weekStart(fromLocalDateString(selectedDate));
    for (let index = 0; index < 7; index += 1) {
      const date = toLocalDateString(addDays(start, index));
      const allowed = isDateAllowed(date);
      overview.append(
        createOverviewButton(
          formatDate(date, { weekday: "short" }),
          formatDate(date, { day: "numeric", month: "short" }),
          dateExpenseTotal(date),
          {
            disabled: !allowed,
            selected: date === selectedDate,
            onClick: () => {
              selectedDate = date;
              render();
            },
          },
        ),
      );
    }
    return;
  }

  if (activePeriod === "month") {
    const date = fromLocalDateString(selectedDate);
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    ["L", "M", "X", "J", "V", "S", "D"].forEach((day) => {
      const label = document.createElement("span");
      label.className = "calendar-weekday";
      label.textContent = day;
      overview.append(label);
    });
    for (let blank = 0; blank < offset; blank += 1) {
      const spacer = document.createElement("span");
      spacer.className = "calendar-spacer";
      overview.append(spacer);
    }
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dayDate = toLocalDateString(new Date(date.getFullYear(), date.getMonth(), day));
      const allowed = isDateAllowed(dayDate);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `calendar-day${dayDate === selectedDate ? " is-selected" : ""}`;
      cell.disabled = !allowed;
      cell.textContent = String(day);
      cell.setAttribute("aria-label", allowed ? formatDate(dayDate, { day: "numeric", month: "long" }) : `Día ${day}, bloqueado`);
      if (!allowed) {
        const lock = document.createElement("span");
        lock.className = "calendar-lock";
        lock.setAttribute("aria-hidden", "true");
        lock.textContent = "🔒";
        cell.append(lock);
      }
      if (allowed) {
        const total = dateExpenseTotal(dayDate);
        if (total > 0) {
          cell.classList.add("has-expenses");
          const marker = document.createElement("span");
          marker.className = "calendar-day-total";
          marker.textContent = formatCurrency(total);
          cell.append(marker);
        }
        cell.addEventListener("click", () => {
          selectedDate = dayDate;
          render();
        });
      }
      overview.append(cell);
    }
    return;
  }

  const year = fromLocalDateString(selectedDate).getFullYear();
  for (let month = 0; month < 12; month += 1) {
    const firstOfMonth = new Date(year, month, 1);
    const key = monthKey(firstOfMonth);
    const monthStart = toLocalDateString(firstOfMonth);
    const monthEnd = toLocalDateString(new Date(year, month + 1, 0));
    const allowed = monthStart <= todayAsInput && monthEnd >= installDate;
    const monthExpenses = expenses.filter(
      (expense) =>
        expense.date.startsWith(key) &&
        (categoryFilter.value === "all" || expense.category === categoryFilter.value),
    );
    const total = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    overview.append(
      createOverviewButton(
        new Intl.DateTimeFormat("es-CL", { month: "long" }).format(firstOfMonth),
        `${monthExpenses.length} ${monthExpenses.length === 1 ? "gasto" : "gastos"}`,
        total,
        {
          disabled: !allowed,
          selected: selectedYearMonth === key,
          onClick: () => {
            selectedYearMonth = key;
            selectedYearMonthDay = false;
            selectedDate = key === todayAsInput.slice(0, 7) ? todayAsInput : `${key}-01`;
            render();
          },
        },
      ),
    );
  }
}

function makeExpenseRow(expense) {
  const row = document.createElement("article");
  row.className = "expense-item";
  const category = categories.find((item) => item.name === expense.category);

  const icon = document.createElement("span");
  icon.className = "category-icon";
  icon.dataset.category = expense.category;
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = suggestEmoji(expense.description) === "✨"
    ? category?.emoji ?? "✨"
    : suggestEmoji(expense.description);

  const info = document.createElement("div");
  info.className = "expense-info";
  const name = document.createElement("p");
  name.className = "expense-name";
  name.textContent = expense.description;
  const meta = document.createElement("p");
  meta.className = "expense-meta";
  meta.textContent = `${category?.emoji ?? "✨"} ${expense.category} · ${formatDate(expense.date)}`;
  info.append(name, meta);

  const amount = document.createElement("span");
  amount.className = "expense-amount";
  amount.textContent = formatCurrency(expense.amount);

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-button";
  deleteButton.type = "button";
  deleteButton.textContent = "×";
  deleteButton.setAttribute("aria-label", `Eliminar gasto: ${expense.description}`);
  deleteButton.addEventListener("click", () => {
    showConfirmation({
      title: "¿Eliminar este gasto?",
      message: `Se eliminará “${expense.description}” por ${formatCurrency(expense.amount)}. Esta acción no se puede deshacer.`,
      onConfirm: () => {
        const previous = expenses;
        expenses = expenses.filter((item) => item.id !== expense.id);
        if (saveExpenses()) render();
        else expenses = previous;
      },
    });
  });
  row.append(icon, info, amount, deleteButton);
  return row;
}

function renderCategorySelects() {
  const previousFilter = categoryFilter.value || "all";
  categoryFilter.replaceChildren(new Option("Todas", "all"));
  $("#expense-category").replaceChildren(
    ...categories.map((category) => new Option(`${category.emoji} ${category.name}`, category.name)),
  );
  categories.forEach((category) => {
    categoryFilter.append(new Option(`${category.emoji} ${category.name}`, category.name));
  });
  categoryFilter.value = categories.some((category) => category.name === previousFilter) ? previousFilter : "all";
}

function renderCategoryManagement() {
  const list = $("#category-management-list");
  list.replaceChildren();
  categories.forEach((category) => {
    const row = document.createElement("div");
    row.className = "category-management-item";
    const label = document.createElement("span");
    label.className = "category-management-name";
    label.textContent = `${category.emoji} ${category.name}`;
    row.append(label);
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "category-delete-button";
    deleteButton.textContent = "Eliminar";
    deleteButton.addEventListener("click", () => {
      if (categories.length === 1) {
        categoryError.textContent = "Mantén al menos una sección para poder registrar gastos.";
        return;
      }
      const expenseCount = expenses.filter((expense) => expense.category === category.name).length;
      showConfirmation({
        title: `¿Eliminar ${category.name}?`,
        message: expenseCount
          ? `Esta sección tiene ${expenseCount} ${expenseCount === 1 ? "gasto asociado" : "gastos asociados"}. Se eliminarán junto con la sección y no se podrá deshacer.`
          : "No tiene gastos asociados. Esta acción no se puede deshacer.",
        onConfirm: () => {
          const previousCategories = categories;
          const previousExpenses = expenses;
          categories = categories.filter((item) => item.name !== category.name);
          expenses = expenses.filter((expense) => expense.category !== category.name);
          if (saveCategories() && saveExpenses()) {
            renderCategoryManagement();
            renderCategorySelects();
            render();
          } else {
            categories = previousCategories;
            expenses = previousExpenses;
            saveCategories();
            categoryError.textContent = "No se pudo completar la eliminación. Inténtalo de nuevo.";
            renderCategoryManagement();
          }
        },
      });
    });
    row.append(deleteButton);
    list.append(row);
  });
}

function renderYearDayBreakdown() {
  if (activePeriod !== "year" || !selectedYearMonth || selectedYearMonthDay) return null;
  const wrapper = document.createElement("div");
  wrapper.className = "year-day-breakdown";
  const heading = document.createElement("h3");
  heading.className = "breakdown-heading";
  heading.textContent = `Días de ${new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
  }).format(fromLocalDateString(`${selectedYearMonth}-01`))}`;
  wrapper.append(heading);
  const list = document.createElement("div");
  list.className = "breakdown-list";
  const [year, month] = selectedYearMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  let shown = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = toLocalDateString(new Date(year, month - 1, day));
    if (!isDateAllowed(date)) continue;
    shown += 1;
    const dayExpenseCount = expenses.filter((expense) => expense.date === date).length;
    const button = createOverviewButton(
      formatDate(date, { weekday: "short", day: "numeric" }),
      `${dayExpenseCount} ${dayExpenseCount === 1 ? "gasto" : "gastos"}`,
      dateExpenseTotal(date),
      {
        selected: date === selectedDate,
        onClick: () => {
          selectedDate = date;
          selectedYearMonthDay = true;
          render();
        },
      },
    );
    list.append(button);
  }
  if (shown) wrapper.append(list);
  return wrapper;
}

function updateDetailCaption() {
  const caption = $("#detail-caption");
  const total = $("#detail-total");
  if (activePeriod === "year" && !selectedYearMonth) {
    caption.textContent = "Selecciona un mes para ver los días.";
    total.textContent = "";
    return;
  }
  if (activePeriod === "year" && selectedYearMonth && !selectedYearMonthDay) {
    caption.textContent = `Gastos de ${new Intl.DateTimeFormat("es-CL", { month: "long" }).format(
      fromLocalDateString(`${selectedYearMonth}-01`),
    )}`;
    const monthExpenses = expenses.filter(
      (expense) =>
        expense.date.startsWith(selectedYearMonth) &&
        (categoryFilter.value === "all" || expense.category === categoryFilter.value),
    );
    total.textContent = formatCurrency(monthExpenses.reduce((sum, expense) => sum + expense.amount, 0));
    return;
  }
  caption.textContent =
    activePeriod === "day" || selectedYearMonthDay
      ? formatDate(selectedDate, { weekday: "long", day: "numeric", month: "long" })
      : `Día seleccionado · ${formatDate(selectedDate)}`;
  total.textContent = formatCurrency(dateExpenseTotal(selectedDate));
}

function render() {
  renderCategorySelects();
  renderPeriodOverview();
  updateSummary();
  updateDetailCaption();

  const breakdown = renderYearDayBreakdown();
  const currentBreakdown = $(".year-day-breakdown");
  if (currentBreakdown) currentBreakdown.remove();
  if (breakdown) $("#period-overview").after(breakdown);

  const visibleExpenses = expensesForSelectedPeriod();
  expenseList.replaceChildren(...visibleExpenses.map(makeExpenseRow));
  expenseList.hidden = visibleExpenses.length === 0;
  emptyState.hidden = visibleExpenses.length !== 0;
  if (activePeriod === "year" && !selectedYearMonth) {
    emptyState.hidden = true;
    expenseList.hidden = true;
    $("#detail-caption").textContent = "Selecciona un mes para explorar sus gastos.";
  } else if (activePeriod === "year" && !selectedYearMonthDay && visibleExpenses.length === 0) {
    $("#empty-state h3").textContent = "Un mes tranquilo";
    $("#empty-state p").textContent = "Todavía no hay gastos registrados en este mes.";
  } else {
    $("#empty-state h3").textContent = "Un día para empezar";
    $("#empty-state p").textContent = "No hay gastos para esta fecha. Puedes agregar uno cuando quieras.";
  }
}

function showConfirmation({ title, message, onConfirm }) {
  $("#confirm-title").textContent = title;
  $("#confirm-message").textContent = message;
  pendingConfirmation = onConfirm;
  confirmDialog.showModal();
}

function openExpenseForm() {
  formError.textContent = "";
  expenseForm.reset();
  const defaultDate = activePeriod === "year" ? todayAsInput : selectedDate;
  expenseDate.min = installDate;
  expenseDate.max = todayAsInput;
  expenseDate.value = isDateAllowed(defaultDate) ? defaultDate : todayAsInput;
  expenseDialog.showModal();
  $("#expense-description").focus();
}

function openCategoryDialog() {
  categoryError.textContent = "";
  categoryForm.reset();
  $("#category-emoji-preview").textContent = "✨";
  renderCategoryManagement();
  categoryDialog.showModal();
  categoryNameInput.focus();
}

$("#add-button").addEventListener("click", openExpenseForm);
$("#empty-add-button").addEventListener("click", openExpenseForm);
$("#close-dialog").addEventListener("click", () => expenseDialog.close());
$("#close-category-dialog").addEventListener("click", () => categoryDialog.close());
$("#manage-categories").addEventListener("click", openCategoryDialog);
$("#theme-toggle").addEventListener("click", toggleTheme);
$("#previous-period").addEventListener("click", () => shiftPeriod(-1));
$("#next-period").addEventListener("click", () => shiftPeriod(1));
categoryFilter.addEventListener("change", render);

document.querySelectorAll(".period-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    activePeriod = tab.dataset.period;
    selectedYearMonth = activePeriod === "year" ? todayAsInput.slice(0, 7) : null;
    selectedYearMonthDay = false;
    render();
  });
});

for (const dialog of [expenseDialog, categoryDialog, confirmDialog]) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

$("#confirm-cancel").addEventListener("click", () => {
  pendingConfirmation = null;
  confirmDialog.close();
});

$("#confirm-accept").addEventListener("click", () => {
  const confirm = pendingConfirmation;
  pendingConfirmation = null;
  confirmDialog.close();
  confirm?.();
});

categoryNameInput.addEventListener("input", () => {
  $("#category-emoji-preview").textContent = suggestEmoji(categoryNameInput.value);
});

categoryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = categoryNameInput.value.trim();
  if (!name) return;
  if (categories.some((category) => normalizeText(category.name) === normalizeText(name))) {
    categoryError.textContent = "Ya existe una sección con ese nombre.";
    return;
  }
  const category = { name, emoji: suggestEmoji(name) };
  categories = [...categories, category];
  if (!saveCategories()) {
    categories = categories.filter((item) => item !== category);
    return;
  }
  categoryForm.reset();
  $("#category-emoji-preview").textContent = "✨";
  renderCategoryManagement();
  renderCategorySelects();
});

expenseDialog.addEventListener("close", () => {
  if (!expenseForm.checkValidity()) return;
  expenseForm.reset();
});

expenseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  formError.textContent = "";
  const formData = new FormData(expenseForm);
  const description = String(formData.get("description") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const category = String(formData.get("category") ?? "");
  const date = String(formData.get("date") ?? "");

  if (
    !description ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !date ||
    !isDateAllowed(date) ||
    !categories.some((item) => item.name === category)
  ) {
    formError.textContent = "Revisa el nombre, el monto, la sección y la fecha antes de guardar.";
    return;
  }

  const expense = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description,
    amount,
    category,
    date,
  };
  expenses = [...expenses, expense];
  if (!saveExpenses()) {
    expenses = expenses.filter((item) => item.id !== expense.id);
    return;
  }

  expenseDialog.close();
  if (activePeriod === "year") {
    selectedYearMonth = date.slice(0, 7);
    selectedYearMonthDay = true;
  }
  selectedDate = date;
  render();
});

render();
