/** Styles injected into the when2meet page itself, for previewing cells on the grid. */
export const PAGE_CSS = `
[id^="YouTime"].w2x-add {
  background-image: repeating-linear-gradient(45deg, #339900 0 3px, #b7e4a0 3px 6px) !important;
}
[id^="YouTime"].w2x-remove {
  background-image: repeating-linear-gradient(45deg, #d33 0 3px, #ffdede 3px 6px) !important;
}
.w2x-layer {
  position: absolute; top: 0; left: 0; width: 0; height: 0;
  pointer-events: none; z-index: 2147483000;
}
.w2x-event {
  position: absolute; box-sizing: border-box; overflow: hidden;
  padding: 1px 3px; border-radius: 3px;
  background: rgba(26, 115, 232, 0.72); border: 1px solid #1557b0; color: #fff;
  font: 600 10px/1.15 system-ui, -apple-system, sans-serif; word-break: break-word;
}
.w2x-event.w2x-ignored {
  background: rgba(255, 255, 255, 0.6); border: 1px dashed #777; color: #444; font-weight: 500;
}
.w2x-event.w2x-narrow { white-space: nowrap; text-overflow: ellipsis; font-size: 9px; padding: 1px 2px; }
.w2x-event.w2x-allday { white-space: nowrap; text-overflow: ellipsis; z-index: 1; }
`;

/** Styles for the floating panel (inside a shadow root, isolated from when2meet's CSS). */
export const BANNER_CSS = `
:host { all: initial; }
.panel, .launcher {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1d1d1f;
}
.panel {
  width: 340px; max-height: calc(100vh - 32px); overflow: auto; box-sizing: border-box;
  background: #fff; border: 1px solid #d9d9de; border-radius: 12px; padding: 12px 14px;
  box-shadow: 0 8px 28px rgba(0,0,0,.18);
}
.panel[hidden], .launcher[hidden] { display: none; }
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.head strong { font-size: 14px; }
p { margin: 6px 0; }
.note { color: #555; }
.error { color: #b3261e; }
.hint { color: #777; font-size: 12px; margin: 4px 0 0; }
.legend { color: #444; }
.sw { display: inline-block; width: 12px; height: 12px; border: 1px solid #000; vertical-align: -2px; }
.sw.add { background: repeating-linear-gradient(45deg, #339900 0 3px, #b7e4a0 3px 6px); }
.sw.remove { background: repeating-linear-gradient(45deg, #d33 0 3px, #ffdede 3px 6px); }
.toggle { display: block; margin: 8px 0 0; cursor: pointer; }
.flagged { margin: 8px 0; padding: 8px 10px; background: #fff8e1; border: 1px solid #f0d58a; border-radius: 8px; }
.flagged summary { cursor: pointer; font-weight: 600; color: #7a5a00; }
.flagged ul { list-style: none; margin: 6px 0 0; padding: 0; }
.flagged li { margin: 3px 0; }
.flagged label { display: grid; grid-template-columns: auto 1fr; gap: 6px; align-items: baseline; cursor: pointer; }
.flagged input { margin: 0; flex: none; }
.ev-title { font-weight: 500; }
.ev-meta { color: #666; font-size: 12px; }
.actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
button {
  font: inherit; border-radius: 8px; border: 1px solid #c8c8cf; background: #f5f5f7;
  padding: 6px 12px; cursor: pointer; color: inherit;
}
button:hover { background: #ececf0; }
button.primary { background: #339900; border-color: #2b8000; color: #fff; }
button.primary:hover { background: #2b8000; }
button:disabled { opacity: .55; cursor: default; }
button.link { background: none; border: none; color: #0b57d0; padding: 6px 4px; margin-left: auto; }
button.icon { background: none; border: none; font-size: 18px; line-height: 1; padding: 0 4px; }
.launcher {
  border-radius: 999px; padding: 8px 14px; background: #fff; border: 1px solid #c8c8cf;
  box-shadow: 0 4px 14px rgba(0,0,0,.15); font-weight: 600;
}
`;
