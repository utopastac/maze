import "./style.css";
import { App } from "./app/App.ts";

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#viewport");
  const chrome = document.querySelector<HTMLElement>("#chrome");
  const overlay = document.querySelector<HTMLElement>("#overlay");
  const sheet = document.querySelector<HTMLElement>("#sheet");
  const editor = document.querySelector<HTMLElement>("#editor");
  if (!canvas || !chrome || !overlay || !sheet || !editor) {
    throw new Error("Maze shell markup is missing.");
  }

  const app = new App(canvas, chrome, overlay, sheet, editor);
  await app.start();
}

boot().catch((error: unknown) => {
  console.error(error);
  document.body.innerHTML = `<pre class="boot-error">Maze failed to start.\n${String(error)}</pre>`;
});
