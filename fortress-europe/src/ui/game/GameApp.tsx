import { useEffect, useState } from "react";
import { useStore } from "../../store";
import { Play } from "./Play";
import { Setup } from "./Setup";
import { PALETTES, TYPES, loadLook, lookStyle, saveLook, type TypeId } from "./theme";
import "./game.css";

export function GameApp() {
  const game = useStore((s) => s.game);
  const quit = useStore((s) => s.quitGame);
  const setScreen = useStore((s) => s.setScreen);
  useStore((s) => s.gv);
  const [look, setLook] = useState(loadLook);
  const update = (v: Partial<typeof look>) => { const next = { ...look, ...v }; setLook(next); saveLook(next); };
  // The page behind the game takes the frame color too, so overscroll and short pages match.
  useEffect(() => {
    const root = document.documentElement.style;
    const vars = lookStyle(look.palette);
    for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
    return () => { for (const k of Object.keys(vars)) root.removeProperty(k); };
  }, [look.palette]);
  return (
    <div className="game" data-type={look.type} style={lookStyle(look.palette)}>
      <div className="g-wrap">
        <nav className="g-nav" aria-label="Game">
          <span className="g-brand">Fortress Europe</span>
          {game && <button className="g-link" onClick={quit}>New game</button>}
          <button className="g-link" onClick={() => setScreen("model")}>The model and its sources</button>
          <span className="g-look">
            <label htmlFor="pal">Palette</label>
            <input id="pal" type="number" min={1} max={PALETTES.length} value={look.palette}
              onChange={(e) => { const n = Math.round(Number(e.target.value)); if (PALETTES.some((p) => p.n === n)) update({ palette: n }); }} />
            <label htmlFor="typ">Type</label>
            <select id="typ" value={look.type} onChange={(e) => update({ type: e.target.value as TypeId })}>
              {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </span>
        </nav>
        {game ? <Play g={game} /> : <Setup />}
      </div>
    </div>
  );
}
