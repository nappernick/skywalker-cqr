import { useStore } from "./store";
import { GameApp } from "./ui/game/GameApp";
import { ModelApp } from "./ModelApp";

export function App() {
  const screen = useStore((s) => s.screen);
  return screen === "model" ? <ModelApp /> : <GameApp />;
}
