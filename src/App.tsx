import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import type { Session } from "@supabase/supabase-js";
import type { FormEvent, ReactNode } from "react";
import { supabase } from "./lib/supabase";

type Period = "day" | "week" | "month" | "year";
type Category = { id: string; name: string; emoji: string; is_archived: boolean };
type Expense = {
  id: string;
  description: string;
  note: string;
  amount: number;
  date: string;
  time: string;
  categoryId: string;
};
type PendingConfirmation = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
};

const themeStorageKey = "mis-gastos-theme";
const nativeOAuthRedirect = "cl.druminot10.controlgastos://login-callback";
const expensePresets = [
  { description: "Micro ida", amount: 900, emoji: "🚌" },
  { description: "Micro vuelta", amount: 900, emoji: "🚌" },
  { description: "Colectivo ida", amount: 1000, emoji: "🚐" },
  { description: "Colectivo vuelta", amount: 1000, emoji: "🚐" },
];
const categoryEmojis: Array<[RegExp, string]> = [
  [/pasaje|micro|bus|transporte|colectivo|metro/, "🚌"],
  [/comida|restaurante|cafe|cafeteria|almuerzo/, "🍽️"],
  [/super|compra|mercado/, "🛒"],
  [/hogar|casa|arriendo/, "🏡"],
  [/salud|farmacia|medico/, "💊"],
  [/mascota|perro|gato/, "🐾"],
  [/ocio|cine|musica|juego/, "🎈"],
];

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateInChile(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(value: string, period: Period, amount: number): string {
  const result = parseLocalDate(value);
  if (period === "day") result.setDate(result.getDate() + amount);
  if (period === "week") result.setDate(result.getDate() + amount * 7);
  if (period === "month" || period === "year") {
    const day = result.getDate();
    result.setDate(1);
    if (period === "month") result.setMonth(result.getMonth() + amount);
    else result.setFullYear(result.getFullYear() + amount);
    result.setDate(Math.min(day, new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  }
  return localDate(result);
}

function periodRange(period: Period, selectedDate: string): [string, string] {
  const date = parseLocalDate(selectedDate);
  if (period === "day") return [selectedDate, selectedDate];
  if (period === "week") {
    const start = new Date(date);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return [localDate(start), localDate(end)];
  }
  if (period === "month") {
    return [
      localDate(new Date(date.getFullYear(), date.getMonth(), 1)),
      localDate(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
    ];
  }
  return [`${date.getFullYear()}-01-01`, `${date.getFullYear()}-12-31`];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  return new Intl.DateTimeFormat("es-CL", options).format(parseLocalDate(value));
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es");
}

function suggestEmoji(value: string): string {
  const normalized = normalizeText(value);
  return categoryEmojis.find(([pattern]) => pattern.test(normalized))?.[1] ?? "✨";
}

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return `Buenos días, ${name}`;
  if (hour >= 12 && hour < 20) return `Buenas tardes, ${name}`;
  if (hour >= 1 && hour < 5) return `¡Qué bueno verte despierto, ${name}!`;
  return `Buenas noches, ${name}`;
}

function parseExpense(row: {
  id: string;
  category_id: string;
  amount: number;
  note: string | null;
  spent_on: string;
  spent_at: string;
}): Expense {
  return {
    id: row.id,
    categoryId: row.category_id,
    amount: Number(row.amount),
    note: row.note ?? "",
    description: row.note?.split("\n", 1)[0] || "Gasto",
    date: row.spent_on,
    time: row.spent_at.slice(0, 5),
  };
}

export default function App() {
  const today = localDate(new Date());
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [authError, setAuthError] = useState("");
  const [profileDate, setProfileDate] = useState(today);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [monthlyExpenses, setMonthlyExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7));
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(themeStorageKey) === "dark" ? "dark" : "light";
    } catch (storageError) {
      console.error("No se pudo leer el tema guardado.", storageError);
      return "light";
    }
  });
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [dayDetailsDate, setDayDetailsDate] = useState<string | null>(null);
  const monthDetailsRef = useRef<HTMLDivElement>(null);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  const [expenseName, setExpenseName] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseDate, setExpenseDate] = useState(today);
  const [expenseTime, setExpenseTime] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const activeCategories = useMemo(() => categories.filter((category) => !category.is_archived), [categories]);

  const userName = useMemo(() => {
    const metadata = session?.user.user_metadata;
    const fullName = typeof metadata?.full_name === "string" ? metadata.full_name : "";
    return fullName.trim().split(/\s+/)[0] || "Diego";
  }, [session]);

  const [rangeStart, rangeEnd] = periodRange(period, selectedDate);
  const periodExpenses = useMemo(() => expenses.filter((expense) =>
    expense.date >= rangeStart && expense.date <= rangeEnd &&
    (categoryFilter === "all" || expense.categoryId === categoryFilter))
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)),
  [expenses, rangeEnd, rangeStart, categoryFilter]);
  const selectedDayExpenses = useMemo(() => expenses.filter((expense) =>
    expense.date === (dayDetailsDate ?? selectedDate) &&
    (categoryFilter === "all" || expense.categoryId === categoryFilter))
    .sort((a, b) => b.time.localeCompare(a.time)),
  [expenses, dayDetailsDate, selectedDate, categoryFilter]);
  const selectedMonthExpenses = useMemo(() => expenses.filter((expense) =>
    expense.date.startsWith(selectedMonth) &&
    (categoryFilter === "all" || expense.categoryId === categoryFilter))
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)),
  [expenses, selectedMonth, categoryFilter]);
  const selectedMonthDays = useMemo(() => {
    const grouped = new Map<string, Expense[]>();
    for (const expense of selectedMonthExpenses) {
      const dayExpenses = grouped.get(expense.date) ?? [];
      dayExpenses.push(expense);
      grouped.set(expense.date, dayExpenses);
    }
    return Array.from(grouped, ([date, dayExpenses]) => ({
      date,
      expenses: dayExpenses,
      total: dayExpenses.reduce((sum, expense) => sum + expense.amount, 0),
    }));
  }, [selectedMonthExpenses]);
  const periodTotal = periodExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  const monthlyTotal = monthlyExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const loadSequence = useRef(0);

  const loadAccountData = useCallback(async (userId: string, activePeriod: Period, anchorDate: string) => {
    if (!supabase) return;
    const requestId = ++loadSequence.current;
    setLoading(true);
    setError("");
    try {
      const [start, end] = periodRange(activePeriod === "day" ? "month" : activePeriod, anchorDate);
      const monthStart = `${today.slice(0, 7)}-01`;
      const monthEnd = localDate(new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0));
      const [profileResult, categoryResult, expenseResult, monthResult] = await Promise.all([
        supabase.from("profiles").select("created_at").eq("id", userId).single(),
        supabase.from("categories").select("id, name, emoji, is_archived").order("created_at"),
        supabase.from("expenses")
          .select("id, category_id, amount, note, spent_on, spent_at")
          .gte("spent_on", start)
          .lte("spent_on", end)
          .order("spent_on", { ascending: false })
          .order("spent_at", { ascending: false }),
        supabase.from("expenses").select("id, category_id, amount, note, spent_on, spent_at")
          .gte("spent_on", monthStart).lte("spent_on", monthEnd),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (categoryResult.error) throw categoryResult.error;
      if (expenseResult.error) throw expenseResult.error;
      if (monthResult.error) throw monthResult.error;
      if (requestId !== loadSequence.current) return;
      setProfileDate(dateInChile(profileResult.data.created_at));
      setCategories(categoryResult.data);
      setExpenses(expenseResult.data.map(parseExpense));
      setMonthlyExpenses(monthResult.data.map(parseExpense));
    } catch (loadError) {
      if (requestId !== loadSequence.current) return;
      console.error("No se pudieron cargar los datos de Supabase.", loadError);
      setError("No se pudieron cargar tus datos. Revisa tu conexión e inténtalo otra vez.");
    } finally {
      if (requestId === loadSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError) setAuthError("No se pudo recuperar tu sesión. Vuelve a iniciar sesión.");
      setSession(data.session);
      setAuthLoading(false);
    }).catch((sessionError: unknown) => {
      console.error("No se pudo recuperar la sesión de Supabase.", sessionError);
      if (mounted) {
        setAuthError("No se pudo verificar tu sesión. Comprueba tu conexión e inténtalo otra vez.");
        setAuthLoading(false);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthError("");
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !Capacitor.isNativePlatform()) return;
    const client = supabase;
    let mounted = true;
    let urlOpenListener: PluginListenerHandle | undefined;

    const handleOAuthRedirect = async (url: string) => {
      let callback: URL;
      try {
        callback = new URL(url);
      } catch (urlError) {
        console.error("Se recibió una URL de retorno OAuth inválida.", urlError);
        setAuthError("No se pudo completar el inicio de sesión. Inténtalo otra vez.");
        return;
      }

      if (callback.protocol !== "cl.druminot10.controlgastos:" || callback.hostname !== "login-callback") {
        return;
      }

      try {
        const providerError = callback.searchParams.get("error_description")
          ?? callback.searchParams.get("error");
        if (providerError) throw new Error(providerError);

        const code = callback.searchParams.get("code");
        if (code) {
          const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else {
          const hash = new URLSearchParams(callback.hash.slice(1));
          const accessToken = hash.get("access_token");
          const refreshToken = hash.get("refresh_token");
          if (!accessToken || !refreshToken) {
            throw new Error("La respuesta de Google no contiene un código de sesión.");
          }
          const { error: sessionError } = await client.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
        }

        await Browser.close().catch((closeError: unknown) => {
          console.error("No se pudo cerrar el navegador OAuth.", closeError);
        });
      } catch (redirectError) {
        console.error("No se pudo completar el retorno de Google OAuth.", redirectError);
        setAuthError("No se pudo completar el inicio de sesión. Revisa la configuración OAuth e inténtalo otra vez.");
      }
    };

    const registerRedirectListener = async () => {
      const listener = await CapacitorApp.addListener("appUrlOpen", ({ url }) => {
        if (mounted) void handleOAuthRedirect(url);
      });
      if (!mounted) {
        await listener.remove();
        return;
      }
      urlOpenListener = listener;
      const launch = await CapacitorApp.getLaunchUrl();
      if (mounted && launch?.url) await handleOAuthRedirect(launch.url);
    };

    void registerRedirectListener().catch((listenerError: unknown) => {
      console.error("No se pudo preparar el retorno de Google OAuth.", listenerError);
      setAuthError("No se pudo preparar el inicio de sesión. Reinicia la aplicación e inténtalo otra vez.");
    });

    return () => {
      mounted = false;
      void urlOpenListener?.remove();
    };
  }, []);

  useEffect(() => {
    if (session?.user.id) void loadAccountData(session.user.id, period, selectedDate);
    else {
      loadSequence.current += 1;
      setCategories([]);
      setExpenses([]);
      setMonthlyExpenses([]);
    }
  }, [session?.user.id, period, selectedDate, loadAccountData]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColor) themeColor.content = theme === "dark" ? "#111b2b" : "#e2d7c7";
  }, [theme]);

  async function signInWithGoogle() {
    if (!supabase) return;
    setSigningIn(true);
    setAuthError("");
    try {
      const isNative = Capacitor.isNativePlatform();
      const { data, error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: isNative
            ? nativeOAuthRedirect
            : new URL(import.meta.env.BASE_URL, window.location.origin).toString(),
          skipBrowserRedirect: isNative,
        },
      });
      if (signInError) throw signInError;
      if (isNative) {
        if (!data.url) throw new Error("Supabase no devolvió la URL de autorización de Google.");
        await Browser.open({ url: data.url });
      }
    } catch (signInError) {
      console.error("No se pudo iniciar sesión con Google.", signInError);
      setAuthError("No se pudo iniciar sesión. Revisa la configuración de Google OAuth en Supabase.");
      setSigningIn(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    setError("");
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      setSession(null);
    } catch (signOutError) {
      console.error("No se pudo cerrar la sesión.", signOutError);
      setError("No se pudo cerrar la sesión. Inténtalo otra vez.");
    } finally {
      setBusy(false);
    }
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) return;
    setFormError("");
    const amount = Number(expenseAmount);
    if (!expenseName.trim() || !Number.isSafeInteger(amount) || amount <= 0 ||
      !expenseCategory || !expenseTime || expenseDate < profileDate || expenseDate > today) {
      setFormError("Revisa el nombre, monto, sección, fecha y hora del gasto.");
      return;
    }
    setBusy(true);
    try {
      const { data, error: insertError } = await supabase.from("expenses").insert({
        user_id: session.user.id,
        category_id: expenseCategory,
        amount,
        note: [expenseName.trim(), expenseNote.trim()].filter(Boolean).join("\n") || null,
        spent_on: expenseDate,
        spent_at: expenseTime,
      }).select("id, category_id, amount, note, spent_on, spent_at").single();
      if (insertError) throw insertError;
      const inserted = parseExpense(data);
      setExpenses((current) => [...current.filter((item) => item.id !== inserted.id), inserted]);
      if (inserted.date.startsWith(today.slice(0, 7))) {
        setMonthlyExpenses((current) => [...current.filter((item) => item.id !== inserted.id), inserted]);
      }
      setSelectedDate(expenseDate);
      if (period === "year") {
        setSelectedMonth(expenseDate.slice(0, 7));
      }
      setExpenseDialogOpen(false);
    } catch (insertError) {
      console.error("No se pudo guardar el gasto en Supabase.", insertError);
      setFormError("No se pudo guardar el gasto. Comprueba la conexión y la migración de la base de datos.");
    } finally {
      setBusy(false);
    }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) return;
    const name = newCategoryName.trim();
    if (!name) return;
    if (categories.some((item) => normalizeText(item.name) === normalizeText(name))) {
      setCategoryError("Ya existe una sección con ese nombre.");
      return;
    }
    setBusy(true);
    setCategoryError("");
    try {
      const { data, error: insertError } = await supabase.from("categories")
        .insert({ user_id: session.user.id, name, emoji: suggestEmoji(name) })
        .select("id, name, emoji, is_archived").single();
      if (insertError) throw insertError;
      setCategories((current) => [...current, data]);
      setNewCategoryName("");
    } catch (insertError) {
      console.error("No se pudo crear la sección en Supabase.", insertError);
      setCategoryError("No se pudo crear la sección. Inténtalo otra vez.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteExpense(id: string) {
    if (!supabase) return;
    setBusy(true);
    try {
      const { error: deleteError } = await supabase.from("expenses").delete().eq("id", id);
      if (deleteError) throw deleteError;
      setExpenses((current) => current.filter((expense) => expense.id !== id));
      setMonthlyExpenses((current) => current.filter((expense) => expense.id !== id));
      setConfirmation(null);
    } catch (deleteError) {
      console.error("No se pudo eliminar el gasto de Supabase.", deleteError);
      setError("No se pudo eliminar el gasto. Inténtalo otra vez.");
    } finally {
      setBusy(false);
    }
  }

  async function setCategoryArchived(categoryId: string, isArchived: boolean) {
    if (!supabase) return;
    setBusy(true);
    try {
      const { data, error: updateError } = await supabase.from("categories")
        .update({ is_archived: isArchived })
        .eq("id", categoryId)
        .select("id, is_archived")
        .single();
      if (updateError) throw updateError;
      setCategories((current) => current.map((category) =>
        category.id === data.id ? { ...category, is_archived: data.is_archived } : category));
      setConfirmation(null);
    } catch (updateError) {
      console.error("No se pudo actualizar el estado de la sección en Supabase.", updateError);
      setCategoryError("No se pudo actualizar la sección. Inténtalo otra vez.");
    } finally {
      setBusy(false);
    }
  }

  async function requestCategoryArchival(category: Category) {
    if (!supabase) return;
    if (activeCategories.length <= 1) {
      setCategoryError("Mantén al menos una sección activa para registrar gastos.");
      return;
    }
    setCategoryError("");
    try {
      const { count, error: countError } = await supabase.from("expenses")
        .select("id", { count: "exact", head: true })
        .eq("category_id", category.id);
      if (countError) throw countError;
      openConfirmation({
        title: `¿Archivar ${category.name}?`,
        message: count
          ? `La sección dejará de estar disponible para nuevos gastos. Se conservarán su nombre y sus ${count} ${count === 1 ? "gasto histórico asociado" : "gastos históricos asociados"}.`
          : "La sección se conservará, pero dejará de aparecer para nuevos gastos. Puedes restaurarla cuando quieras.",
        confirmLabel: "Archivar",
        onConfirm: () => setCategoryArchived(category.id, true),
      });
    } catch (countError) {
      console.error("No se pudo contar los gastos de la sección.", countError);
      setCategoryError("No se pudo comprobar cuántos gastos se conservarán. Inténtalo otra vez.");
    }
  }

  function requestCategoryRestoration(category: Category) {
    setCategoryError("");
    openConfirmation({
      title: `¿Restaurar ${category.name}?`,
      message: "La sección volverá a estar disponible para registrar nuevos gastos.",
      confirmLabel: "Restaurar",
      onConfirm: () => setCategoryArchived(category.id, false),
    });
  }

  function openExpenseForm() {
    setFormError("");
    setExpenseName("");
    setExpenseNote("");
    setExpenseAmount("");
    setExpenseCategory(activeCategories[0]?.id ?? "");
    setExpenseDate(period === "year" ? today : selectedDate);
    const now = new Date();
    setExpenseTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    setExpenseDialogOpen(true);
  }

  function selectPeriod(nextPeriod: Period) {
    setPeriod(nextPeriod);
    setSelectedDate(today);
    setSelectedMonth(today.slice(0, 7));
  }

  function shiftPeriod(amount: number) {
    const candidate = shiftDate(selectedDate, period, amount);
    const [start] = periodRange(period, candidate);
    if (candidate > today || start < profileDate) return;
    setSelectedDate(candidate);
    setSelectedMonth(candidate.slice(0, 7));
  }

  function selectYearMonth(month: string, date: string) {
    setSelectedMonth(month);
    setSelectedDate(date > today ? today : date);
    requestAnimationFrame(() => monthDetailsRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    }));
  }

  const calendarMonthStart = parseLocalDate(`${selectedDate.slice(0, 7)}-01`);
  const calendarMonthEnd = new Date(calendarMonthStart.getFullYear(), calendarMonthStart.getMonth() + 1, 0);
  const selectedMonthStart = parseLocalDate(`${selectedMonth}-01`);
  const selectedMonthEnd = new Date(selectedMonthStart.getFullYear(), selectedMonthStart.getMonth() + 1, 0);
  const previousDate = shiftDate(selectedDate, period, -1);
  const nextDate = shiftDate(selectedDate, period, 1);
  const previousBlocked = periodRange(period, previousDate)[1] < profileDate;
  const nextBlocked = nextDate > today;

  const periodTitle = period === "day"
    ? formatDate(selectedDate, { weekday: "long", day: "numeric", month: "long" })
    : period === "week"
      ? `${formatDate(rangeStart)} – ${formatDate(rangeEnd, { day: "numeric", month: "short", year: "numeric" })}`
      : period === "month"
        ? new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(parseLocalDate(selectedDate))
        : String(parseLocalDate(selectedDate).getFullYear());

  function totalFor(date: string): number {
    return expenses.filter((expense) => expense.date === date &&
      (categoryFilter === "all" || expense.categoryId === categoryFilter))
      .reduce((sum, expense) => sum + expense.amount, 0);
  }

  function openConfirmation(nextConfirmation: PendingConfirmation) {
    setConfirmation(nextConfirmation);
  }

  if (!supabase) {
    return (
      <main className="setup-screen">
        <div className="setup-card">
          <Brand />
          <h1>Conectemos tu cuenta</h1>
          <p>Para iniciar sesión y guardar tus gastos, configura la URL de Supabase y su clave pública en el archivo <code>.env</code>.</p>
          <p>Copia <code>.env.example</code> como <code>.env</code>, completa ambos valores y reinicia el servidor.</p>
        </div>
      </main>
    );
  }

  if (authLoading) {
    return <main className="setup-screen"><p role="status">Comprobando tu sesión…</p></main>;
  }

  if (!session) {
    return (
      <main className="setup-screen">
        <div className="setup-card">
          <Brand />
          <p className="eyebrow">TUS GASTOS, MÁS CLAROS</p>
          <h1>Un registro simple,<br /><span>a tu manera.</span></h1>
          <p>Inicia sesión para guardar y sincronizar tus gastos personales de forma segura.</p>
          {authError && <p className="form-error" role="alert">{authError}</p>}
          <button className="submit-button" type="button" onClick={() => void signInWithGoogle()} disabled={signingIn}>
            {signingIn ? "Conectando con Google…" : "Continuar con Google"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="app-shell">
        <header className="topbar">
          <Brand />
          <span className="local-badge"><span className="status-dot" aria-hidden="true" />Sincronizado</span>
          <div className="account-actions">
            <button className="theme-toggle" type="button" onClick={() => {
              const nextTheme = theme === "dark" ? "light" : "dark";
              setTheme(nextTheme);
              try { localStorage.setItem(themeStorageKey, nextTheme); }
              catch (storageError) { console.error("No se pudo guardar el tema.", storageError); }
            }}>
              <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
              <span>Modo {theme === "dark" ? "claro" : "oscuro"}</span>
            </button>
            <button className="manage-categories-button" type="button" disabled={busy} onClick={() => void signOut()}>
              Cerrar sesión
            </button>
          </div>
        </header>

        <div className="page-content">
          <section className="intro" aria-labelledby="page-title">
            <div>
              <p className="greeting">{getGreeting(userName)}</p>
              <p className="eyebrow" id="current-date">{new Intl.DateTimeFormat("es-CL", {
                weekday: "long", day: "numeric", month: "long",
              }).format(new Date()).toLocaleUpperCase("es-CL")}</p>
              <h1 id="page-title">Tu dinero,<br /><span>más claro.</span></h1>
              <p className="intro-copy">Un pequeño paso hoy hace la diferencia.</p>
            </div>
            <div className="intro-decoration" aria-hidden="true">
              <svg className="decoration-art" viewBox="0 0 128 128">
                <rect x="18" y="35" width="92" height="62" rx="17" fill="var(--green)" />
                <path d="M18 53h92v28H18z" fill="var(--green-dark)" />
                <path d="M18 53h92v8H18z" fill="var(--green-light)" />
                <rect x="77" y="68" width="33" height="19" rx="9.5" fill="#efb16e" />
                <circle cx="87" cy="77.5" r="3" fill="#fff4e3" />
                <path d="m34 43 15-15 13 8 21-20" fill="none" stroke="#efb16e" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
                <path d="M78 16h6v17h-17v-6h11z" fill="#efb16e" />
              </svg>
            </div>
          </section>

          <section className="summary-grid" aria-label="Resumen del mes">
            <article className="summary-card total-card">
              <div className="card-label"><span>Gastos de este mes</span><span className="label-icon" aria-hidden="true">↗</span></div>
              <p className="total-amount">{formatCurrency(monthlyTotal)}</p>
              <p className="card-caption">{monthlyExpenses.length ? "sumados durante este mes" : "Todavía no hay gastos este mes"}</p>
            </article>
            <article className="summary-card count-card">
              <div className="card-label"><span>Movimientos</span><span className="label-icon count-icon" aria-hidden="true">≋</span></div>
              <p className="count-amount">{monthlyExpenses.length}</p>
              <p className="card-caption">registrados este mes</p>
            </article>
          </section>

          <section className="period-section" aria-label="Mis gastos por período">
            <div className="section-heading period-section-heading">
              <div><p className="eyebrow">TU HISTORIAL</p><h2>Mis gastos</h2></div>
              <div className="period-total-summary">
                <span>Total {period === "day" ? "del día" : period === "week" ? "de la semana" : period === "month" ? "del mes" : "del año"}</span>
                <strong>{formatCurrency(periodTotal)}</strong>
                <span>{periodExpenses.length} {periodExpenses.length === 1 ? "gasto" : "gastos"}</span>
              </div>
            </div>
            <div className="period-tabs" role="tablist" aria-label="Período">
              {(["day", "week", "month", "year"] as const).map((value) => (
                <button key={value} className={`period-tab${period === value ? " is-active" : ""}`} type="button" role="tab"
                  aria-selected={period === value} onClick={() => selectPeriod(value)}>
                  {{ day: "Día", week: "Semana", month: "Mes", year: "Año" }[value]}
                </button>
              ))}
            </div>
            <div className="period-navigation">
              <button className="period-arrow" type="button" disabled={previousBlocked} aria-label="Período anterior"
                onClick={() => shiftPeriod(-1)}>{previousBlocked ? "🔒" : "‹"}</button>
              <h2>{periodTitle}</h2>
              <button className="period-arrow" type="button" disabled={nextBlocked} aria-label="Período siguiente"
                onClick={() => shiftPeriod(1)}>{nextBlocked ? "🔒" : "›"}</button>
            </div>
            {period === "week" && (
              <div className="period-overview week-overview">
                {Array.from({ length: 7 }, (_, index) => {
                  const start = parseLocalDate(rangeStart);
                  start.setDate(start.getDate() + index);
                  const date = localDate(start);
                  const allowed = date >= profileDate && date <= today;
                  return <OverviewButton key={date} title={formatDate(date, { weekday: "short" })}
                    subtitle={formatDate(date, { day: "numeric", month: "short" })} total={totalFor(date)}
                    disabled={!allowed} selected={date === selectedDate} onClick={() => {
                      setSelectedDate(date);
                      setDayDetailsDate(date);
                    }} />;
                })}
              </div>
            )}
            {(period === "day" || period === "month") && (
              <>
                {period === "day" && <h3 className="breakdown-heading">{new Intl.DateTimeFormat("es-CL", {
                  month: "long", year: "numeric",
                }).format(calendarMonthStart)}</h3>}
                <div className="period-overview month-overview">
                  {["L", "M", "X", "J", "V", "S", "D"].map((day, index) => <span className="calendar-weekday" key={`${day}-${index}`}>{day}</span>)}
                  {Array.from({ length: (calendarMonthStart.getDay() + 6) % 7 }, (_, index) => <span className="calendar-spacer" key={`blank-${index}`} />)}
                  {Array.from({ length: calendarMonthEnd.getDate() }, (_, index) => {
                    const date = localDate(new Date(calendarMonthStart.getFullYear(), calendarMonthStart.getMonth(), index + 1));
                  const allowed = date >= profileDate && date <= today;
                  return <button key={date} type="button" className={`calendar-day${date === selectedDate ? " is-selected" : ""}${totalFor(date) ? " has-expenses" : ""}`}
                    disabled={!allowed} aria-label={`${date.slice(-2)} de ${formatDate(date, { month: "long" })}${allowed ? "" : ", bloqueado"}`}
                    onClick={() => {
                      setSelectedDate(date);
                      setDayDetailsDate(date);
                    }}>
                    <span>{index + 1}</span>{totalFor(date) > 0 && <span className="calendar-day-total">{formatCurrency(totalFor(date))}</span>}
                    {!allowed && <span className="calendar-lock" aria-hidden="true">🔒</span>}
                  </button>;
                  })}
                </div>
              </>
            )}
            {period === "year" && (
              <>
                <div className="period-overview year-overview">
                  {Array.from({ length: 12 }, (_, index) => {
                    const year = rangeStart.slice(0, 4);
                    const key = `${year}-${String(index + 1).padStart(2, "0")}`;
                    const monthStart = `${key}-01`;
                    const monthEnd = localDate(new Date(Number(year), index + 1, 0));
                    const allowed = monthStart <= today && monthEnd >= profileDate;
                    const monthRows = periodExpenses.filter((expense) => expense.date.startsWith(key));
                    const monthDay = monthStart < profileDate ? profileDate : monthStart;
                    return <OverviewButton key={key}
                      title={new Intl.DateTimeFormat("es-CL", { month: "long" }).format(new Date(Number(year), index, 1))}
                      subtitle={`${monthRows.length} ${monthRows.length === 1 ? "gasto" : "gastos"}`}
                      total={monthRows.reduce((sum, expense) => sum + expense.amount, 0)} disabled={!allowed}
                      selected={selectedMonth === key} onClick={() => selectYearMonth(key, monthDay)} />;
                  })}
                </div>
                {selectedMonth && (
                  <div className="year-day-breakdown" ref={monthDetailsRef}>
                    <div className="year-expenses">
                      <div className="year-expenses-heading">
                        <h3 className="breakdown-heading">Gastos de {new Intl.DateTimeFormat("es-CL", {
                          month: "long", year: "numeric",
                        }).format(selectedMonthStart)}</h3>
                        <span>{formatCurrency(selectedMonthExpenses.reduce((sum, expense) => sum + expense.amount, 0))}</span>
                      </div>
                      {selectedMonthDays.length ? (
                        <div className="year-expense-days">
                          {selectedMonthDays.map(({ date, expenses: dayExpenses, total }) => (
                            <section className="year-expense-day" key={date}>
                              <button className="year-expense-day-heading" type="button" onClick={() => {
                                setSelectedDate(date);
                                setDayDetailsDate(date);
                              }}>
                                <span>{formatDate(date, { weekday: "long", day: "numeric", month: "long" })}</span>
                                <span>{dayExpenses.length} {dayExpenses.length === 1 ? "gasto" : "gastos"}</span>
                                <strong>{formatCurrency(total)}</strong>
                                <span className="year-expense-day-link">Ver día ›</span>
                              </button>
                              <ul className="year-expense-rows">
                                {dayExpenses.map((expense) => {
                                  const category = categories.find((item) => item.id === expense.categoryId);
                                  const detail = expense.note.split("\n").slice(1).join("\n");
                                  return <li className="year-expense-row" key={expense.id}>
                                    <time>{expense.time}</time>
                                    <span className="year-expense-description">
                                      <strong>{expense.description}</strong>
                                      <span>{category ? `${category.emoji} ${category.name}` : "Sección"}</span>
                                      {detail && <span>{detail}</span>}
                                    </span>
                                    <strong>{formatCurrency(expense.amount)}</strong>
                                  </li>;
                                })}
                              </ul>
                            </section>
                          ))}
                        </div>
                      ) : <p className="table-hint">No hay gastos para este mes.</p>}
                    </div>
                    <h3 className="breakdown-heading">Calendario de {new Intl.DateTimeFormat("es-CL", {
                      month: "long", year: "numeric",
                    }).format(selectedMonthStart)}</h3>
                    <div className="period-overview month-overview">
                      {["L", "M", "X", "J", "V", "S", "D"].map((day, index) =>
                        <span className="calendar-weekday" key={`${day}-${index}`}>{day}</span>)}
                      {Array.from({ length: (selectedMonthStart.getDay() + 6) % 7 }, (_, index) =>
                        <span className="calendar-spacer" key={`year-blank-${index}`} />)}
                      {Array.from({ length: selectedMonthEnd.getDate() }, (_, index) => {
                        const date = `${selectedMonth}-${String(index + 1).padStart(2, "0")}`;
                        const allowed = date >= profileDate && date <= today;
                        return <button key={date} type="button"
                          className={`calendar-day${date === selectedDate ? " is-selected" : ""}${totalFor(date) ? " has-expenses" : ""}`}
                          disabled={!allowed}
                          aria-label={`${date.slice(-2)} de ${formatDate(date, { month: "long" })}${allowed ? "" : ", bloqueado"}`}
                          onClick={() => {
                            setSelectedDate(date);
                            setDayDetailsDate(date);
                          }}>
                          <span>{index + 1}</span>
                          {totalFor(date) > 0 && <span className="calendar-day-total">{formatCurrency(totalFor(date))}</span>}
                          {!allowed && <span className="calendar-lock" aria-hidden="true">🔒</span>}
                        </button>;
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="spending-section" aria-labelledby="spending-title">
            <div className="section-heading"><div><p className="eyebrow">DETALLE</p><h2 id="spending-title">{period === "day" ? "Gastos del día" : "Detalle del día"}</h2></div></div>
            <div className="expense-toolbar">
              <div className="detail-summary">
                <p className="detail-caption">{formatDate(selectedDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
                <span className="detail-total">{formatCurrency(selectedDayExpenses.reduce((sum, expense) => sum + expense.amount, 0))}</span>
              </div>
              <div className="expense-toolbar-actions">
                <button className="manage-categories-button" type="button" onClick={() => setCategoryDialogOpen(true)}>Secciones</button>
                <label className="filter-wrap"><span className="visually-hidden">Filtrar gastos</span>
                  <select aria-label="Filtrar por sección" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                    <option value="all">Todas</option>
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.emoji} {category.name}{category.is_archived ? " (Archivada)" : ""}</option>)}
                  </select>
                </label>
              </div>
            </div>
            {error && <div className="load-error" role="alert">
              <p className="form-error">{error}</p>
              <button className="text-button" type="button" disabled={loading}
                onClick={() => session?.user.id && void loadAccountData(session.user.id, period, selectedDate)}>
                Reintentar
              </button>
            </div>}
            {loading ? <p className="loading-state" role="status">Cargando tus gastos…</p> :
              period === "day"
                ? <ExpenseTable expenses={selectedDayExpenses} categories={categories}
                    onDelete={(expense) => openConfirmation({
                      title: "¿Eliminar este gasto?",
                      message: `Se eliminará “${expense.description}” por ${formatCurrency(expense.amount)}. Esta acción no se puede deshacer.`,
                      onConfirm: () => deleteExpense(expense.id),
                    })} />
                : <p className="table-hint">Selecciona un día del calendario para abrir sus gastos detallados.</p>}
          </section>
        </div>
      </main>

      <button className="add-button" type="button" onClick={openExpenseForm}><span className="add-symbol" aria-hidden="true">+</span><span>Agregar gasto</span></button>

      {dayDetailsDate && <Modal onClose={() => setDayDetailsDate(null)} className="expense-dialog day-details-dialog">
        <div className="expense-form">
          <DialogHeading eyebrow="DETALLE DIARIO"
            title={formatDate(dayDetailsDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            onClose={() => setDayDetailsDate(null)} />
          <div className="day-details-total">
            <span>Total del día</span>
            <strong>{formatCurrency(selectedDayExpenses.reduce((sum, expense) => sum + expense.amount, 0))}</strong>
          </div>
          <ExpenseTable expenses={selectedDayExpenses} categories={categories}
            onDelete={(expense) => openConfirmation({
              title: "¿Eliminar este gasto?",
              message: `Se eliminará “${expense.description}” por ${formatCurrency(expense.amount)}. Esta acción no se puede deshacer.`,
              onConfirm: () => deleteExpense(expense.id),
            })} />
        </div>
      </Modal>}

      {expenseDialogOpen && <Modal onClose={() => setExpenseDialogOpen(false)} className="expense-dialog">
        <form className="expense-form" onSubmit={(event) => void submitExpense(event)}>
          <DialogHeading eyebrow="NUEVO MOVIMIENTO" title="¿Qué gastaste?" onClose={() => setExpenseDialogOpen(false)} />
          <label className="field-label" htmlFor="expense-description">Nombre del gasto</label>
          <input id="expense-description" value={expenseName} onChange={(event) => setExpenseName(event.target.value)} maxLength={60} placeholder="Ej. Café de la mañana" required />
          <label className="field-label" htmlFor="expense-note">Descripción (opcional)</label>
          <textarea id="expense-note" value={expenseNote} onChange={(event) => setExpenseNote(event.target.value)} maxLength={160} placeholder="Agrega un detalle, por ejemplo, dónde o con quién" rows={2} />
          <div className="travel-presets"><p className="field-label">Viajes frecuentes</p><div className="travel-preset-list">
            {expensePresets.map((preset) => <button key={preset.description} className="travel-preset" type="button"
              onClick={() => {
                setExpenseName(preset.description);
                setExpenseAmount(String(preset.amount));
                const transport = activeCategories.find((category) => normalizeText(category.name) === "transporte");
                if (transport) setExpenseCategory(transport.id);
              }}>{preset.emoji} {preset.description} <span>{formatCurrency(preset.amount)}</span></button>)}
          </div></div>
          <label className="field-label" htmlFor="expense-amount">¿Cuánto pagaste?</label>
          <div className="amount-input"><span aria-hidden="true">$</span>
            <input id="expense-amount" type="number" min="1" max="999999999" step="1" value={expenseAmount}
              onChange={(event) => setExpenseAmount(event.target.value)} placeholder="0" inputMode="numeric" required />
            <span className="currency-code">CLP</span>
          </div>
          <div className="field-group"><label className="field-label" htmlFor="expense-category">Sección</label>
            <select id="expense-category" value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)} required>
              {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.emoji} {category.name}</option>)}
            </select>
          </div>
          <div className="field-row">
            <div className="field-group"><label className="field-label" htmlFor="expense-date">Fecha</label>
              <input id="expense-date" type="date" min={profileDate} max={today} value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} required />
            </div>
            <div className="field-group"><label className="field-label" htmlFor="expense-time">Hora</label>
              <input id="expense-time" type="time" value={expenseTime} onChange={(event) => setExpenseTime(event.target.value)} required />
            </div>
          </div>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <button className="submit-button" type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar gasto"} <span aria-hidden="true">↗</span></button>
          <p className="privacy-note">Tus datos se guardan de forma privada en tu cuenta.</p>
        </form>
      </Modal>}

      {categoryDialogOpen && <Modal onClose={() => { setCategoryDialogOpen(false); setCategoryError(""); }} className="expense-dialog category-dialog">
        <div className="expense-form">
          <DialogHeading eyebrow="ORGANIZA TUS GASTOS" title="Tus secciones" onClose={() => setCategoryDialogOpen(false)} />
          <form onSubmit={(event) => void addCategory(event)}>
            <label className="field-label" htmlFor="category-name">Nueva sección</label>
            <div className="category-create-row">
              <input id="category-name" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} maxLength={24} placeholder="Ej. Mascotas" required />
              <span className="category-emoji-preview" aria-live="polite">{suggestEmoji(newCategoryName)}</span>
              <button className="category-add-button" type="submit" aria-label="Crear sección" disabled={busy}>+</button>
            </div>
            <p className="category-hint">El emoji se elige automáticamente según el nombre.</p>
            {categoryError && <p className="form-error" role="alert">{categoryError}</p>}
          </form>
          <div className="category-management-list">
            {categories.map((category) => {
              return <div className="category-management-item" key={category.id}>
                <span className="category-management-name">
                  {category.emoji} {category.name}
                  {category.is_archived && <span className="category-archived-label"> · Archivada</span>}
                </span>
                {category.is_archived
                  ? <button className="category-action-button" type="button" disabled={busy} onClick={() => requestCategoryRestoration(category)}>Restaurar</button>
                  : <button className="category-action-button" type="button" disabled={busy || activeCategories.length <= 1}
                    title={activeCategories.length <= 1 ? "Debe quedar al menos una sección activa" : undefined}
                    onClick={() => void requestCategoryArchival(category)}>Archivar</button>}
              </div>;
            })}
          </div>
        </div>
      </Modal>}

      {confirmation && <Modal onClose={() => setConfirmation(null)} className="confirm-dialog">
        <div className="confirm-content">
          <span className="confirm-icon" aria-hidden="true">
            {confirmation.confirmLabel === "Archivar" ? "📦" : confirmation.confirmLabel === "Restaurar" ? "↩️" : "🗑️"}
          </span>
          <h2>{confirmation.title}</h2><p>{confirmation.message}</p>
          <div className="confirm-actions">
            <button className="cancel-button" type="button" disabled={busy} onClick={() => setConfirmation(null)}>Cancelar</button>
            <button className="danger-button" type="button" disabled={busy} onClick={() => void confirmation.onConfirm()}>{busy ? "Procesando…" : confirmation.confirmLabel ?? "Eliminar"}</button>
          </div>
        </div>
      </Modal>}
    </>
  );
}

function Brand() {
  return <a className="brand" href="#" aria-label="Mis gastos, inicio">
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 64 64" focusable="false">
        <rect width="64" height="64" rx="18" fill="#214d45" />
        <path d="M19 13h20l9 9v28a4 4 0 0 1-4 4H19a4 4 0 0 1-4-4V17a4 4 0 0 1 4-4Z" fill="#f7f2e8" />
        <path d="M39 13v9h9" fill="#d9e7dd" />
        <path d="M22 43v-7h5v7m5 0V30h5v13m5 0V25h5v18" fill="none" stroke="#38766a" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        <circle cx="45" cy="43" r="9" fill="#e7a65c" stroke="#214d45" strokeWidth="2" />
        <path d="M45 38v10m3-8c-.7-1-1.6-1.5-3-1.5-1.6 0-2.5.8-2.5 1.8 0 2.8 5.5 1.1 5.5 4 0 1.2-1.1 2-2.8 2-1.4 0-2.5-.5-3.2-1.5" fill="none" stroke="#fffaf0" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
      </svg>
    </span>
    <span>mis gastos<span className="brand-period">.</span></span>
  </a>;
}

function OverviewButton({ title, subtitle, total, disabled = false, selected = false, onClick }: {
  title: string;
  subtitle: string;
  total: number;
  disabled?: boolean;
  selected?: boolean;
  onClick: () => void;
}) {
  return <button type="button" className={`overview-item${selected ? " is-selected" : ""}`} disabled={disabled}
    aria-pressed={selected} onClick={onClick}>
    <span className="overview-name">{title}</span>
    <span className="overview-subtitle">{subtitle}</span>
    <span className="overview-total">{disabled ? "🔒" : formatCurrency(total)}</span>
  </button>;
}

function ExpenseTable({ expenses, categories, onDelete }: {
  expenses: Expense[];
  categories: Category[];
  onDelete: (expense: Expense) => void;
}) {
  if (!expenses.length) {
    return <p className="empty-table-state">No hay gastos registrados para este día.</p>;
  }

  return <div className="expense-table-wrap">
    <table className="expense-table">
      <thead><tr>
        <th scope="col">Hora</th>
        <th scope="col">Gasto</th>
        <th scope="col">Sección</th>
        <th scope="col">Detalle</th>
        <th scope="col" className="expense-table-amount">Monto</th>
        <th scope="col"><span className="visually-hidden">Acciones</span></th>
      </tr></thead>
      <tbody>{expenses.map((expense) => {
        const category = categories.find((item) => item.id === expense.categoryId);
        const detail = expense.note.split("\n").slice(1).join("\n");
        return <tr key={expense.id}>
          <td data-label="Hora">{expense.time}</td>
          <td data-label="Gasto" className="expense-table-name">{expense.description}</td>
          <td data-label="Sección">{category ? `${category.emoji} ${category.name}` : "Sección"}</td>
          <td data-label="Detalle">{detail || "—"}</td>
          <td data-label="Monto" className="expense-table-amount">{formatCurrency(expense.amount)}</td>
          <td className="expense-table-actions">
            <button className="delete-button" type="button" aria-label={`Eliminar gasto: ${expense.description}`}
              onClick={() => onDelete(expense)}>×</button>
          </td>
        </tr>;
      })}</tbody>
      <tfoot><tr>
        <th scope="row" colSpan={4}>Total</th>
        <td className="expense-table-amount">{formatCurrency(expenses.reduce((sum, expense) => sum + expense.amount, 0))}</td>
        <td />
      </tr></tfoot>
    </table>
  </div>;
}

function Modal({ children, className, onClose }: { children: ReactNode; className: string; onClose: () => void }) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return <div className="modal-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className={className} role="dialog" aria-modal="true">{children}</section>
  </div>;
}

function DialogHeading({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose: () => void }) {
  return <div className="dialog-heading">
    <div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>
    <button className="close-button" type="button" aria-label="Cerrar" onClick={onClose}>×</button>
  </div>;
}
