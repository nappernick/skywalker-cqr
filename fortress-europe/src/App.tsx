import { useMemo } from "react";
import { useStore } from "./store";
import { makeView } from "./ui/view";
import { Rail } from "./ui/Rail";
import { Verdict } from "./ui/Verdict";
import { Watch } from "./ui/Watch";
import { MapView } from "./ui/MapView";
import { YearPanel } from "./ui/YearPanel";
import { RegionDetail } from "./ui/RegionDetail";
import { ControlChart, GroupMultiples } from "./ui/Charts";
import { Chronicle } from "./ui/Chronicle";
import { Explainer } from "./ui/Explainer";

export function App() {
  const agg = useStore((s) => s.agg);
  const run = useStore((s) => s.run);
  const mode = useStore((s) => s.mode);
  const v = useMemo(() => (agg ? makeView(mode, agg, run) : null), [agg, run, mode]);
  return (
    <div className="wrap">
      <header className="top">
        <p className="eyebrow">A Monte Carlo counterfactual · 1941–1970</p>
        <h1>Fortress Europe</h1>
        <p className="lede">Could Nazi Germany have held Europe for a generation? Each run draws one history of the occupied and allied peoples, the rulers in Berlin and the powers outside, and asks whether the empire wears down, and how.</p>
        <p className="premise">
          <span>Britain signs a compromise peace in 1940</span>
          <span>Soviet industry is destroyed in 1941–42; a rump may survive past the Urals</span>
          <span>The United States stays out but keeps sending aid</span>
        </p>
      </header>
      <div className="layout">
        <Rail />
        <main className="results">
          <Verdict />
          <Watch />
          {v ? (
            <>
              <div className="stage">
                <MapView v={v} />
                <YearPanel v={v} />
              </div>
              <RegionDetail v={v} />
              <ControlChart v={v} />
              <GroupMultiples v={v} />
              <Chronicle v={v} />
            </>
          ) : <section className="panel"><p className="status">Building the first batch of histories…</p></section>}
          <Explainer />
        </main>
      </div>
    </div>
  );
}
