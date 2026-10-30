import { useEffect, useMemo, useState, type ReactNode } from "react";
import { applyFilters, buildIndex, type Index } from "./domain/model";
import { loadDataset } from "./domain/load";
import { CHANNELS, ORIGINS, type Channel } from "./domain/types";
import { Agents } from "./pages/Agents";
import { AllIntents } from "./pages/AllIntents";
import { Answerable } from "./pages/Answerable";
import { Bundles } from "./pages/Bundles";
import { Census } from "./pages/Census";
import { Coverage } from "./pages/Coverage";
import { IntentMap } from "./pages/IntentMap";
import { Overview } from "./pages/Overview";
import { TimePlace } from "./pages/TimePlace";
import { heroFor, type TabId } from "./pages/heroes";
import type { PageProps } from "./pages/types";
import { useFilters } from "./state/filters";
import { CHANNEL_LABEL, fmtInt, fmtMonth, ORIGIN_LABEL, pct } from "./ui/format";
import { Kpi, Legend } from "./ui/primitives";
import { channelColor, PALETTE_IDS, ThemeContext, usePalette } from "./ui/theme";

const TABS = [
  { id: "overview", label: "Overview", Page: Overview },
  { id: "map", label: "Intent map", Page: IntentMap },
  { id: "census", label: "Answerability census", Page: Census },
  { id: "answerable", label: "Answerable", Page: Answerable },
  { id: "coverage", label: "FAQ coverage", Page: Coverage },
  { id: "intents", label: "All intents", Page: AllIntents },
  { id: "time", label: "Time & place", Page: TimePlace },
  { id: "bundles", label: "Bundles & journeys", Page: Bundles },
  { id: "agents", label: "Agents & routing", Page: Agents },
] as const satisfies readonly { readonly id: TabId; readonly label: string; readonly Page: (p: PageProps) => ReactNode }[];

const tabFromHash = (): TabId => TABS.find((t) => `#${t.id}` === window.location.hash)?.id ?? "overview";
const NO_HUMAN: ReadonlySet<Channel> = new Set<Channel>(["answer", "agent_action", "intake_and_route"]);

type LoadState = { readonly status: "loading" } | { readonly status: "error"; readonly message: string } | { readonly status: "ready"; readonly index: Index };

function Select<T extends string>(props: { readonly label: string; readonly all: string; readonly value: T | null; readonly options: readonly (readonly [T, string])[]; readonly onChange: (v: T | null) => void }) {
  return (
    <label>{props.label}
      <select value={props.value ?? ""} onChange={(e) => props.onChange(props.options.find(([v]) => v === e.target.value)?.[0] ?? null)}>
        <option value="">{props.all}</option>
        {props.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function Dashboard({ index }: { readonly index: Index }) {
  const { theme, setPalette } = usePalette();
  const filters = useFilters(index);
  const [tab, setTab] = useState<TabId>(tabFromHash);
  useEffect(() => {
    const on = () => setTab(tabFromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const model = useMemo(() => applyFilters(index, filters.filters), [index, filters.filters]);
  const f = filters.filters;
  const n = model.tickets.length;
  const share = (test: (t: (typeof model.tickets)[number]) => boolean) => (n ? pct(model.tickets.filter(test).length / n) : "—");
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const hero = heroFor(active.id, model);
  const intents = [...index.meta.values()].sort((a, b) => a.name.localeCompare(b.name)).map((r) => [r.intent, r.name] as const);
  const months = index.months.map((mo) => [mo, fmtMonth(mo)] as const);
  return (
    <ThemeContext.Provider value={theme}>
      <div className="app">
        <header className="head">
          <span className="wordmark">Skywalker</span>
          <div className="palettes" role="group" aria-label="Colour theme">
            {PALETTE_IDS.map((p) => (
              <button key={p} type="button" className="palette" aria-pressed={theme.id === p} onClick={() => setPalette(p)}>#{p}</button>
            ))}
          </div>
        </header>
        <nav className="tabs" role="tablist" aria-label="Pages">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" className="tab" aria-selected={t.id === tab} onClick={() => { window.location.hash = t.id; setTab(t.id); }}>{t.label}</button>
          ))}
        </nav>
        <section className="hero">
          <span className="hero-num">{String(TABS.findIndex((t) => t.id === active.id) + 1).padStart(2, "0")}</span>
          <div className="hero-head">
            <h1>{hero.title}</h1>
            <p>{hero.summary}</p>
          </div>
          <p className="hero-statement">{hero.statement}</p>
        </section>
        <div className="filters">
          <Select label="Region" all="All regions" value={f.region} options={index.regions.map((r) => [r, r] as const)} onChange={(region) => filters.set({ region })} />
          <Select label="Filed through" all="All routes" value={f.origin} options={ORIGINS.map((o) => [o, ORIGIN_LABEL[o]] as const)} onChange={(origin) => filters.set({ origin })} />
          <Select label="From month" all="Earliest" value={f.from} options={months} onChange={(from) => filters.set({ from })} />
          <Select label="To month" all="Latest" value={f.to} options={months} onChange={(to) => filters.set({ to })} />
          <Select label="Domain" all="All domains" value={f.domain} options={index.domains.map((d) => [d, d] as const)} onChange={(domain) => filters.set({ domain })} />
          <Select label="Channel" all="All channels" value={f.channel} options={CHANNELS.map((c) => [c, CHANNEL_LABEL[c]] as const)} onChange={(channel) => filters.set({ channel })} />
          <Select label="Intent" all="All intents" value={f.intent} options={intents} onChange={(intent) => filters.set({ intent })} />
          <button type="button" className="btn" onClick={filters.reset}>Reset filters</button>
        </div>
        <div className="kpis">
          <Kpi label="Tickets in view" value={fmtInt(n)} note="Employee demand, after exclusions" />
          <Kpi label="Fully answerable" value={share((t) => t.channel === "answer")} note="Every need answered by documentation" />
          <Kpi label="Has an answerable need" value={share((t) => t.anyAnswer)} note="At least one need is answerable" />
          <Kpi label="Agent action" value={share((t) => t.channel === "agent_action")} note="Hardest need is a system task" />
          <Kpi label="No human needed" value={share((t) => NO_HUMAN.has(t.channel))} note="Answer, agent action or agent intake" />
          <Kpi label="More than one need" value={share((t) => t.n_intents > 1)} note="Tickets carrying 2+ intents" />
        </div>
        <Legend label="Channels" items={CHANNELS.map((c) => ({ key: c, label: CHANNEL_LABEL[c], color: channelColor(theme, c) }))} />
        <main className="page" role="tabpanel" aria-label={active.label}>
          <active.Page model={model} filters={filters} />
        </main>
      </div>
    </ThemeContext.Provider>
  );
}

export function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  useEffect(() => {
    let live = true;
    const fonts = Promise.all(["400 12px Rubik", "600 12px Rubik", "700 12px Rubik"].map((f) => document.fonts.load(f)));
    Promise.all([loadDataset(import.meta.env.BASE_URL), fonts]).then(([data]) => data)
      .then((data) => { if (live) setState({ status: "ready", index: buildIndex(data) }); })
      .catch((e: unknown) => { if (live) setState({ status: "error", message: e instanceof Error ? e.message : String(e) }); });
    return () => { live = false; };
  }, []);
  if (state.status === "loading") return <div className="app"><p className="sub">Loading tickets…</p></div>;
  if (state.status === "error") return <div className="app"><p className="error" role="alert">Could not load the dashboard data: {state.message}</p></div>;
  return <Dashboard index={state.index} />;
}
