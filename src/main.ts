import "./style.css";
import { App } from "./app/App.ts";

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#viewport");
  const playHud = document.querySelector<HTMLCanvasElement>("#play-hud");
  const chrome = document.querySelector<HTMLElement>("#chrome");
  const overlay = document.querySelector<HTMLElement>("#overlay");
  const pause = document.querySelector<HTMLElement>("#pause");
  const home = document.querySelector<HTMLElement>("#home");
  const intro = document.querySelector<HTMLElement>("#tower-intro");
  const sheet = document.querySelector<HTMLElement>("#sheet");
  const picker = document.querySelector<HTMLElement>("#picker");
  const library = document.querySelector<HTMLElement>("#library");
  const editor = document.querySelector<HTMLElement>("#editor");
  if (
    !canvas
    || !playHud
    || !chrome
    || !overlay
    || !pause
    || !home
    || !intro
    || !sheet
    || !picker
    || !library
    || !editor
  ) {
    throw new Error("Mazespire shell markup is missing.");
  }

  const app = new App(
    canvas,
    playHud,
    chrome,
    overlay,
    pause,
    home,
    intro,
    sheet,
    picker,
    library,
    editor,
  );
  await app.start();
}

boot().catch((error: unknown) => {
  console.error(error);
  document.body.innerHTML = `<pre class="boot-error">Maze failed to start.\n${String(error)}</pre>`;
});
