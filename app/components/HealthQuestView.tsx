"use client";

import { useEffect, useMemo, useState } from "react";

type HabitKey = "noEnergyDrink" | "noBinge" | "gym" | "sleepWindow" | "waterDrinking";
type HabitState = Record<HabitKey, boolean>;

interface DailyLog {
  habits: HabitState;
}

interface WeightEntry {
  dateKey: string;
  weightLb: number;
}

interface HealthQuestState {
  currentWeightLb: number;
  baselineWeightLb: number;
  logs: Record<string, DailyLog>;
  weightHistory: WeightEntry[];
}

const STORAGE_KEY = "vault-health-quest-state-v1";
const CHALLENGE_START_KEY = "2026-03-16";
const DEADLINE_KEY = "2026-06-05";
const TARGET_WEIGHT_LB = 15 * 14;
const MAP_COLUMNS = 14;

const HABITS: Array<{ key: HabitKey; label: string }> = [
  { key: "noEnergyDrink", label: "No energy drinks" },
  { key: "noBinge", label: "No binge eating" },
  { key: "gym", label: "Gym session" },
  { key: "sleepWindow", label: "Good sleep schedule" },
  { key: "waterDrinking", label: "Drink water" },
];

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function poundsToStoneParts(totalLb: number): { stone: number; pounds: number } {
  const safe = Math.max(0, Math.round(totalLb));
  return {
    stone: Math.floor(safe / 14),
    pounds: safe % 14,
  };
}

function stonePartsToPounds(stone: number, pounds: number): number {
  const safeStone = Number.isFinite(stone) ? Math.max(0, Math.floor(stone)) : 0;
  const safePounds = Number.isFinite(pounds) ? Math.min(13, Math.max(0, Math.floor(pounds))) : 0;
  return safeStone * 14 + safePounds;
}

function formatStone(totalLb: number): string {
  const { stone, pounds } = poundsToStoneParts(totalLb);
  return `${stone}st ${pounds}lb`;
}

function getDefaultHabits(): HabitState {
  return {
    noEnergyDrink: false,
    noBinge: false,
    gym: false,
    sleepWindow: false,
    waterDrinking: false,
  };
}

function getDefaultState(): HealthQuestState {
  return {
    currentWeightLb: 0,
    baselineWeightLb: 0,
    logs: {},
    weightHistory: [],
  };
}

function loadState(): HealthQuestState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultState();

    const parsed = JSON.parse(raw) as Partial<HealthQuestState>;
    return {
      currentWeightLb: Number(parsed.currentWeightLb) || 0,
      baselineWeightLb: Number(parsed.baselineWeightLb) || 0,
      logs: typeof parsed.logs === "object" && parsed.logs ? parsed.logs : {},
      weightHistory: Array.isArray(parsed.weightHistory)
        ? parsed.weightHistory
            .map((entry) => ({
              dateKey: typeof entry?.dateKey === "string" ? entry.dateKey : "",
              weightLb: Number(entry?.weightLb) || 0,
            }))
            .filter((entry) => entry.dateKey.length > 0 && entry.weightLb > 0)
        : [],
    };
  } catch {
    return getDefaultState();
  }
}

function saveState(next: HealthQuestState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function getCompletedHabitCount(log?: DailyLog): number {
  if (!log) return 0;
  return HABITS.reduce((sum, habit) => sum + (log.habits?.[habit.key] ? 1 : 0), 0);
}

function getDateRangeKeys(startKey: string, endKey: string): string[] {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  const keys: string[] = [];

  const cursor = new Date(start);
  while (cursor <= end) {
    keys.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

export function HealthQuestView() {
  const [state, setState] = useState<HealthQuestState>(() => {
    if (typeof window === "undefined") return getDefaultState();
    return loadState();
  });
  const [now, setNow] = useState(() => new Date());

  const todayKey = formatDateKey(now);
  const activeDayKey = todayKey < CHALLENGE_START_KEY
    ? CHALLENGE_START_KEY
    : todayKey > DEADLINE_KEY
      ? DEADLINE_KEY
      : todayKey;

  const todayLog = state.logs[activeDayKey] || { habits: getDefaultHabits() };

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const challengeKeys = useMemo(() => getDateRangeKeys(CHALLENGE_START_KEY, DEADLINE_KEY), []);

  const mapCells = useMemo(() => {
    return [...challengeKeys];
  }, [challengeKeys]);

  const daysLeft = useMemo(() => {
    const deadline = new Date(`${DEADLINE_KEY}T23:59:59`);
    const diff = deadline.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [now]);

  const targetParts = poundsToStoneParts(TARGET_WEIGHT_LB);
  const currentParts = poundsToStoneParts(state.currentWeightLb);
  const baselineParts = poundsToStoneParts(state.baselineWeightLb);

  const [weighInStone, setWeighInStone] = useState<number>(() => currentParts.stone);
  const [weighInPounds, setWeighInPounds] = useState<number>(() => currentParts.pounds);

  const getDayCellClass = (dateKey: string): string => {
    if (dateKey > todayKey) {
      return "bg-[#2a2a2a] border border-[#3a3a3a]";
    }

    const done = getCompletedHabitCount(state.logs[dateKey]);
    if (done === 0) return "bg-[#7f1d1d] border border-[#991b1b]";
    if (done === HABITS.length) return "bg-[#166534] border border-[#22c55e]";
    return "bg-[#9a3412] border border-[#f59e0b]";
  };

  const updateToday = (updater: (prev: DailyLog) => DailyLog) => {
    setState((prev) => {
      const previous = prev.logs[activeDayKey] || { habits: getDefaultHabits() };
      return {
        ...prev,
        logs: {
          ...prev.logs,
          [activeDayKey]: updater(previous),
        },
      };
    });
  };

  const submitWeighIn = () => {
    const nextStone = weighInStone;
    const nextPounds = weighInPounds;
    const nextWeight = stonePartsToPounds(nextStone, nextPounds);

    if (nextWeight <= 0) {
      return;
    }

    setState((prev) => {
      const nextHistory = [...prev.weightHistory];
      const index = nextHistory.findIndex((entry) => entry.dateKey === todayKey);
      const entry: WeightEntry = { dateKey: todayKey, weightLb: nextWeight };

      if (index >= 0) {
        nextHistory[index] = entry;
      } else {
        nextHistory.push(entry);
      }

      nextHistory.sort((a, b) => a.dateKey.localeCompare(b.dateKey));

      return {
        ...prev,
        currentWeightLb: nextWeight,
        baselineWeightLb: prev.baselineWeightLb > 0 ? prev.baselineWeightLb : nextWeight,
        weightHistory: nextHistory,
      };
    });
  };

  const lostFromBaseline = state.baselineWeightLb > 0
    ? Math.max(0, state.baselineWeightLb - state.currentWeightLb)
    : 0;

  const chartSeries = useMemo(() => {
    return state.weightHistory
      .filter((entry) => entry.dateKey >= CHALLENGE_START_KEY && entry.dateKey <= DEADLINE_KEY)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [state.weightHistory]);

  const chartPath = useMemo(() => {
    if (chartSeries.length < 2) return "";

    const minWeight = Math.min(...chartSeries.map((entry) => entry.weightLb), TARGET_WEIGHT_LB);
    const maxWeight = Math.max(...chartSeries.map((entry) => entry.weightLb), TARGET_WEIGHT_LB);
    const range = Math.max(1, maxWeight - minWeight);

    return chartSeries
      .map((entry, index) => {
        const x = (index / (chartSeries.length - 1)) * 100;
        const y = 100 - (((entry.weightLb - minWeight) / range) * 100);
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }, [chartSeries]);

  const weightToLoseText = state.currentWeightLb > 0
    ? formatStone(Math.max(0, state.currentWeightLb - TARGET_WEIGHT_LB))
    : `${targetParts.stone}st ${targetParts.pounds}lb`;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center h-11 px-4 border-b border-[#2f2f2f] shrink-0">
        <div className="flex items-center gap-1 text-sm text-[#9b9b9b]">
          <span>Holiday Weight Loss</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-8 py-8 space-y-6">
          <section className="space-y-3">
            <h1 className="text-2xl font-bold text-[#e3e3e3]">Holiday Weight Loss</h1>
            <p className="text-sm text-[#9b9b9b]">{daysLeft} days to lose {weightToLoseText}</p>
            <div className="rounded border border-[#2f2f2f] bg-[#1e1e1e] p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="rounded-lg bg-[#1b1b1b] border border-[#2f2f2f] p-3">
                  <p className="text-xs text-[#7f7f7f] uppercase tracking-wide">Days left</p>
                  <p className={`text-xl font-semibold mt-1 ${daysLeft <= 21 ? "text-[#f87171]" : "text-[#ebebeb]"}`}>{daysLeft}</p>
                </div>
                <div className="rounded-lg bg-[#1b1b1b] border border-[#2f2f2f] p-3">
                  <p className="text-xs text-[#7f7f7f] uppercase tracking-wide">Start</p>
                  <p className="text-xl font-semibold mt-1 text-[#ebebeb]">
                    {state.baselineWeightLb > 0 ? `${baselineParts.stone}st ${baselineParts.pounds}lb` : "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-[#1b1b1b] border border-[#2f2f2f] p-3">
                  <p className="text-xs text-[#7f7f7f] uppercase tracking-wide">Target</p>
                  <p className="text-xl font-semibold text-[#4ade80] mt-1">{targetParts.stone}st {targetParts.pounds}lb</p>
                </div>
                <div className="rounded-lg bg-[#1b1b1b] border border-[#2f2f2f] p-3">
                  <p className="text-xs text-[#7f7f7f] uppercase tracking-wide">Lost so far</p>
                  <p className={`text-xl font-semibold mt-1 ${lostFromBaseline > 0 ? "text-[#4ade80]" : "text-[#ebebeb]"}`}>
                    {formatStone(lostFromBaseline)}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="lg:col-span-2 space-y-6">
              <div className="space-y-3">
                <h2 className="text-lg text-[#e3e3e3] font-medium">Consistency Map</h2>
                <div className="rounded border border-[#2f2f2f] bg-[#1e1e1e] p-4">
                  <div className="grid gap-1 w-full" style={{ gridTemplateColumns: `repeat(${MAP_COLUMNS}, minmax(0, 1fr))` }}>
                    {mapCells.map((dateKey, index) => (
                      <div
                        key={`${dateKey ?? "empty"}-${index}`}
                        className={`rounded-sm aspect-square ${dateKey ? getDayCellClass(dateKey) : "bg-[#2a2a2a] border border-[#3a3a3a]"}`}
                      >
                        {dateKey ? (
                          <div className="h-full w-full px-1 py-1 flex flex-col justify-center items-center text-center text-[#b3b3b3]">
                            <span className="text-[8px] leading-none tracking-wide opacity-85">
                              {parseDateKey(dateKey).toLocaleDateString("en-GB", { month: "long" }).toUpperCase()}
                            </span>
                            <span className="text-xs leading-none font-semibold mt-1">
                              {parseDateKey(dateKey).getDate()}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-lg text-[#e3e3e3] font-medium">Weight Trend</h2>
                <div className="rounded border border-[#2f2f2f] bg-[#1e1e1e] p-4">
                  {chartSeries.length < 2 ? (
                    <p className="text-sm text-[#8b8b8b]">Add at least two weigh-ins to draw trend.</p>
                  ) : (
                    <div className="space-y-2">
                      <svg viewBox="0 0 100 100" className="w-full h-36">
                        <line x1="0" y1="100" x2="100" y2="100" stroke="#3a3a3a" strokeWidth="1" />
                        <path d={chartPath} fill="none" stroke="#7eb8f7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <div className="flex items-center justify-between text-xs text-[#8b8b8b]">
                        <span>{chartSeries[0]?.dateKey}</span>
                        <span>{chartSeries[chartSeries.length - 1]?.dateKey}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <div className="space-y-6">
              <section className="space-y-3">
                <h2 className="text-lg text-[#e3e3e3] font-medium">Weigh-in</h2>
                <div className="rounded border border-[#2f2f2f] bg-[#1e1e1e] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={weighInStone || ""}
                      onChange={(e) => setWeighInStone(Number(e.target.value) || 0)}
                      className="w-20 bg-[#111111] border border-[#3a3a3a] rounded-md px-2 py-1.5 text-[#e3e3e3]"
                    />
                    <span className="text-[#9b9b9b] text-sm">st</span>
                    <input
                      type="number"
                      min={0}
                      max={13}
                      value={weighInPounds || ""}
                      onChange={(e) => setWeighInPounds(Math.min(13, Math.max(0, Number(e.target.value) || 0)))}
                      className="w-20 bg-[#111111] border border-[#3a3a3a] rounded-md px-2 py-1.5 text-[#e3e3e3]"
                    />
                    <span className="text-[#9b9b9b] text-sm">lb</span>
                    <button
                      onClick={submitWeighIn}
                      title="Submit weigh-in"
                      aria-label="Submit weigh-in"
                      className="ml-auto shrink-0 h-9 w-9 inline-flex items-center justify-center bg-[#2a2a2a] hover:bg-[#343434] text-[#e3e3e3] rounded-md transition-colors"
                    >
                      <span className="text-lg leading-none">+</span>
                    </button>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg text-[#e3e3e3] font-medium">Today Mission</h2>
                <div className="rounded border border-[#2f2f2f] bg-[#1e1e1e] p-4 space-y-3">
                  {HABITS.map((habit) => {
                    const checked = Boolean(todayLog.habits?.[habit.key]);
                    return (
                      <label key={habit.key} className="flex items-start gap-3 rounded-lg bg-[#1a1a1a] border border-[#2f2f2f] px-3 py-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const value = e.target.checked;
                            updateToday((prev) => ({
                              ...prev,
                              habits: {
                                ...getDefaultHabits(),
                                ...prev.habits,
                                [habit.key]: value,
                              },
                            }));
                          }}
                          className="mt-0.5"
                        />
                        <div className="flex-1">
                          <p className={`text-sm ${checked ? "text-[#4ade80]" : "text-[#e3e3e3]"}`}>{habit.label}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
