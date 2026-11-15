// Marking up an image before it goes to an agent: boxes, ellipses, arrows, pen and highlighter strokes and text,
// drawn over a screenshot to point at what you mean. Marks stay shapes (select, move, resize, recolour, delete) until
// the image is saved: then they're drawn into it, so the agent gets an ordinary image showing exactly what you saw.
// Two ways in: an image waiting in a composer (Mark up on its thumbnail: Done puts the marked image in its place, and
// opening it again brings the marks back), and an image in a chat (Mark up in the viewer: sent straight back to that
// agent with what you write). Runs inside the dashboard's script (ui.ts), next to the composer's image code: it uses
// its shrink, toast and swap.

/** The editor's own icons, in the dashboard's icon style. */
const PATHS: Record<string, string> = {
  select: '<path d="M4.04 4.65a.5.5 0 0 1 .61-.61l15.6 6.07a.5.5 0 0 1-.04.95l-6.22 1.6a1 1 0 0 0-.72.72l-1.6 6.22a.5.5 0 0 1-.95.04z"/>',
  pen: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/>',
  marker: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  arrow: '<path d="M6 18 18 6"/><path d="M9 6h9v9"/>',
  rect: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7"/>',
  text: '<path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  mark: '<path d="M12 20h9"/><path d="M16.38 3.62a1 1 0 0 1 3 3L7.37 18.64a2 2 0 0 1-.86.5l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .5-.86z"/>',
};
const svg = (name: string, size = 17) =>
  `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ""}</svg>`;

/** The "Mark up" icon, for the buttons that open the editor. */
export const MARK_ICON = (size = 16) => svg("mark", size);

export const MARKUP_STYLE = `
/* Mark up an image (markup.ts) */
.mkdlg{width:min(1120px,calc(100vw - 32px));height:min(880px,calc(100dvh - 32px));max-width:none;max-height:none;flex-direction:column;overflow:hidden}.mkdlg[open]{display:flex}
.mkhd{flex:none;display:flex;align-items:center;gap:10px;padding:12px 12px 10px 18px}.mktitle{flex:1;min-width:0;font-size:15px;font-weight:620;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mkbar{flex:none;display:flex;align-items:center;gap:4px;padding:6px 14px 10px;overflow-x:auto;scrollbar-width:none}.mkbar::-webkit-scrollbar{display:none}
.mkbar button{flex:none;height:36px;min-width:36px;border:0;border-radius:9px;background:transparent;color:var(--ink-2);display:inline-grid;place-items:center;cursor:pointer;padding:0 6px;font:inherit}
.mkbar button:hover:not(:disabled){background:var(--surface-2);color:var(--ink)}.mkbar button:disabled{opacity:.35;cursor:default}
.mkbar button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.mkbar .mktool.on{background:var(--ink);color:var(--bg)}
.mkbar .mksw{width:36px}.mkbar .mksw i{width:22px;height:22px;border-radius:50%;background:var(--c);box-shadow:inset 0 0 0 1px rgba(0,0,0,.18)}
.mkbar .mksw.on i{box-shadow:0 0 0 2px var(--surface),0 0 0 4px var(--c)}
.mkbar .mksw[data-color="#16171c"] i{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ink) 30%,transparent)}.mkbar .mksw[data-color="#16171c"].on i{box-shadow:0 0 0 2px var(--surface),0 0 0 4px color-mix(in srgb,var(--ink) 55%,transparent)}
.mkbar .mksz i{border-radius:50%;background:currentColor}.mkbar .mksz.on{background:var(--ink);color:var(--bg)}
.mksep{flex:none;width:1px;height:22px;background:var(--line);margin:0 8px}
.mkbar .mkclear{color:var(--red);font-size:13px;font-weight:560;padding:0 10px}.mkbar .mkzoom{font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--ink-3);padding:0 8px}
.mkstage{flex:1;min-height:0;overflow:auto;margin:0 14px;border-radius:12px;background:var(--surface-2);overscroll-behavior:contain}
.mkpad{position:relative;min-width:100%;min-height:100%;width:max-content;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box}
.mkcv{display:block;touch-action:none;box-shadow:0 1px 2px rgba(0,0,0,.12),0 6px 24px rgba(0,0,0,.12);cursor:crosshair}
.mkcv.t-select{cursor:default}.mkcv.t-text{cursor:text}.mkcv.panning{cursor:grabbing}
.mkcv.loading{visibility:hidden}
.mktext{position:absolute;z-index:2;min-width:120px;border:1.5px dashed var(--accent);border-radius:4px;background:color-mix(in srgb,var(--surface) 75%,transparent);padding:0 4px;font-family:"Geist",system-ui,sans-serif;font-weight:650;outline:none;box-sizing:content-box}
.mkhint{flex:none;margin:8px 18px 0}
.mksend{flex:none;padding:10px 18px 0}.mksend[hidden]{display:none}.mksend label{display:block;font-weight:600;margin-bottom:5px}.mksend textarea{width:100%;box-sizing:border-box;resize:vertical;min-height:52px}.mkto{margin:6px 0 0;display:flex;align-items:center;gap:6px;flex-wrap:wrap}.mkto label{display:inline;margin:0;font-weight:500}.mkto select{height:28px;font-size:12.5px;padding:0 6px;max-width:100%}
.mkft{flex:none;display:flex;justify-content:flex-end;gap:8px;padding:12px 18px 16px}
.imgthumb .mkbtn{position:absolute;top:auto;right:auto;left:-6px;bottom:-6px;width:22px;height:22px;border-radius:50%;border:0;background:var(--ink);color:var(--bg);display:grid;place-items:center;padding:0;cursor:pointer}
.imgthumb .mkbtn svg{width:13px;height:13px}
@media (max-width:560px){
  .mkdlg{width:100vw;height:100dvh;border-radius:0;border:0}
  .mkhd{padding:max(10px,env(safe-area-inset-top)) 8px 6px 16px}.mkbar{padding:4px 10px 8px;flex-wrap:wrap;row-gap:2px;overflow:visible}.mkbar .mksep{display:none}.mkbar .mksep:nth-of-type(1),.mkbar .mksep:nth-of-type(3){display:block;flex-basis:100%;height:0;margin:0;background:none}.mkstage{margin:0;border-radius:0}.mkhint{display:none}
  .mkft{padding:10px 16px max(12px,env(safe-area-inset-bottom))}
}
`;

/** The editor, inside the dashboard's script. No backticks in here, and backslashes doubled (it's a template). */
export function markupScript(): string {
  const tool = (t: string, title: string) => `<button type="button" class="mktool" data-tool="${t}" title="${title}" aria-label="${title}">${svg(t)}</button>`;
  const tools = [
    tool("select", "Select: move, resize or delete a mark (V)"),
    tool("pen", "Pen (P)"),
    tool("marker", "Highlighter (H)"),
    tool("arrow", "Arrow (A)"),
    tool("rect", "Rectangle (R)"),
    tool("ellipse", "Ellipse (O)"),
    tool("text", "Text (T)"),
  ].join("");
  const colors = [
    ["#e5484d", "Red"],
    ["#f5b301", "Yellow"],
    ["#2f7cf6", "Blue"],
    ["#23a55a", "Green"],
    ["#16171c", "Black"],
  ]
    .map(([c, n]) => `<button type="button" class="mksw" data-color="${c}" style="--c:${c}" title="${n}" aria-label="${n}"><i></i></button>`)
    .join("");
  const sizes = [
    ["0.6", "Thin", 5],
    ["1", "Medium", 9],
    ["1.8", "Thick", 13],
  ]
    .map(([k, n, d]) => `<button type="button" class="mksz" data-size="${k}" title="${n}" aria-label="${n}"><i style="width:${d}px;height:${d}px"></i></button>`)
    .join("");
  const bar = `${tools}<span class="mksep"></span>${colors}<span class="mksep"></span>${sizes}<span class="mksep"></span><button type="button" data-mk="undo" title="Undo (Ctrl+Z)" aria-label="Undo">${svg("undo")}</button><button type="button" data-mk="redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo">${svg("redo")}</button><button type="button" data-mk="del" title="Delete the selected mark (Delete)" aria-label="Delete the selected mark">${svg("trash")}</button><button type="button" class="mkclear" data-mk="clear">Clear all</button><button type="button" class="mkzoom" data-mk="fit" title="Fit the image to the window">100%</button>`;
  const html = `<div class="mkhd"><b class="mktitle"></b><button type="button" class="btn ghost sm icon" data-mk="cancel" title="Cancel">${svg("x", 18)}</button></div><div class="mkbar" role="toolbar" aria-label="Mark-up tools">${bar}</div><div class="mkstage"><div class="mkpad"><canvas class="mkcv"></canvas><input class="mktext" type="text" maxlength="200" aria-label="Text" hidden></div></div><p class="mkhint tiny muted">Ctrl + scroll zooms (pinch on a phone), and the scroll bars or a drag with the select tool move around. Delete removes the selected mark; Ctrl+Z undoes, Ctrl+Shift+Z redoes.</p><div class="mksend" hidden><label class="tiny" for="mkmsg">What looks off?</label><textarea id="mkmsg" rows="2" maxlength="4000"></textarea><p class="tiny muted mkto"><label for="mksel">Goes to</label><select id="mksel" aria-label="Send it to"></select><span>with the marked-up image and what you write here.</span></p></div><div class="mkft"><button type="button" class="btn" data-mk="cancel">Cancel</button><button type="button" class="btn primary" data-mk="ok"></button></div>`;

  return `
  // ---- Mark up an image (markup.ts)
  const MK_HTML = ${JSON.stringify(html)};
  const MK_ICON = ${JSON.stringify(MARK_ICON(13))};
  const mkPrefs = { tool: "rect", color: "#e5484d", size: 1 };
  try { const p = JSON.parse(localStorage.getItem("ic_mk") || "null"); if (p && typeof p === "object") Object.assign(mkPrefs, p); } catch {}
  const mkSave = () => { try { localStorage.setItem("ic_mk", JSON.stringify(mkPrefs)); } catch {} };
  const MK_SIDE = 1600; // what the composer sends anyway: what you mark is what the agent gets
  let mk = null;
  function mkEditor() {
    if (mk) return mk;
    const d = document.createElement("dialog");
    d.id = "mkdlg"; d.className = "mkdlg"; d.innerHTML = MK_HTML;
    document.body.append(d);
    const cv = d.querySelector(".mkcv"), ctx = cv.getContext("2d"), stage = d.querySelector(".mkstage"), pad = d.querySelector(".mkpad");
    const tin = d.querySelector(".mktext"), zl = d.querySelector(".mkzoom"), msg = d.querySelector("#mkmsg"), ok = d.querySelector('[data-mk="ok"]');
    const E = { d, cv, ctx, stage, pad, tin, zl, msg, ok, img: null, W: 0, H: 0, U: 1, shapes: [], sel: -1, hist: [], fut: [], fit: 1, z: 1, op: null, pts: new Map(), pinch: null, opts: null, editing: -1, dirty: false, space: false };
    mk = E;
    const scale = () => E.fit * E.z;
    const toImg = (cx, cy) => { const r = cv.getBoundingClientRect(); return [(cx - r.left) * E.W / r.width, (cy - r.top) * E.H / r.height]; };
    const width = (s) => E.U * s.k * (s.t === "marker" ? 5 : s.t === "text" ? 9 : 1.15);
    // ---- drawing
    function bbox(s) {
      let x0, y0, x1, y1;
      if (s.t === "pen" || s.t === "marker") { x0 = Math.min(...s.pts.map((p) => p[0])); x1 = Math.max(...s.pts.map((p) => p[0])); y0 = Math.min(...s.pts.map((p) => p[1])); y1 = Math.max(...s.pts.map((p) => p[1])); const h = width(s) / 2; return [x0 - h, y0 - h, x1 + h, y1 + h]; }
      if (s.t === "text") { ctx.font = "650 " + width(s) + "px Geist, system-ui, sans-serif"; const w = ctx.measureText(s.s).width; return [s.a[0], s.a[1], s.a[0] + w, s.a[1] + width(s) * 1.25]; }
      return [Math.min(s.a[0], s.b[0]), Math.min(s.a[1], s.b[1]), Math.max(s.a[0], s.b[0]), Math.max(s.a[1], s.b[1])];
    }
    function drawShape(c, s) {
      const w = width(s);
      c.save(); c.strokeStyle = s.c; c.fillStyle = s.c; c.lineWidth = w; c.lineCap = "round"; c.lineJoin = "round";
      if (s.t === "pen" || s.t === "marker") {
        if (s.t === "marker") { c.globalAlpha = 0.38; c.lineCap = "butt"; c.lineJoin = "miter"; c.miterLimit = 2; }
        c.beginPath(); c.moveTo(s.pts[0][0], s.pts[0][1]);
        if (s.pts.length === 1) c.lineTo(s.pts[0][0] + 0.01, s.pts[0][1]);
        for (let i = 1; i < s.pts.length; i++) {
          // through the midpoints: a smooth line from the points a finger or mouse gives
          const p = s.pts[i - 1], q = s.pts[i];
          if (i < s.pts.length - 1) c.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); else c.quadraticCurveTo(p[0], p[1], q[0], q[1]);
        }
        c.stroke();
      } else if (s.t === "rect") {
        const [x0, y0, x1, y1] = bbox(s); c.strokeRect(x0, y0, x1 - x0, y1 - y0);
      } else if (s.t === "ellipse") {
        const [x0, y0, x1, y1] = bbox(s); c.beginPath(); c.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.max(0.5, (x1 - x0) / 2), Math.max(0.5, (y1 - y0) / 2), 0, 0, Math.PI * 2); c.stroke();
      } else if (s.t === "arrow") {
        const [ax, ay] = s.a, [bx, by] = s.b, len = Math.hypot(bx - ax, by - ay) || 1, head = Math.min(len * 0.6, w * 4.2), ang = Math.atan2(by - ay, bx - ax);
        const hx = bx - Math.cos(ang) * head * 0.8, hy = by - Math.sin(ang) * head * 0.8;
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(hx, hy); c.stroke();
        c.beginPath(); c.moveTo(bx, by);
        c.lineTo(bx - head * Math.cos(ang - 0.45), by - head * Math.sin(ang - 0.45));
        c.lineTo(bx - head * Math.cos(ang + 0.45), by - head * Math.sin(ang + 0.45));
        c.closePath(); c.lineWidth = w * 0.6; c.stroke(); c.fill();
      } else if (s.t === "text") {
        // An outline in the opposite tone keeps it readable on any background.
        c.font = "650 " + w + "px Geist, system-ui, sans-serif"; c.textBaseline = "top";
        const dark = s.c === "#16171c" || s.c === "#2f7cf6" || s.c === "#e5484d";
        c.lineWidth = Math.max(2, w / 6); c.strokeStyle = dark ? "rgba(255,255,255,.9)" : "rgba(0,0,0,.7)"; c.strokeText(s.s, s.a[0], s.a[1] + w * 0.1); c.fillText(s.s, s.a[0], s.a[1] + w * 0.1);
      }
      c.restore();
    }
    function handles(s) {
      if (s.t === "arrow") return [s.a, s.b];
      if (s.t === "rect" || s.t === "ellipse") { const [x0, y0, x1, y1] = bbox(s); return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
      return [];
    }
    function render(c = ctx, sel = true) {
      c.clearRect(0, 0, E.W, E.H);
      if (E.img) c.drawImage(E.img, 0, 0, E.W, E.H);
      E.shapes.forEach((s, i) => { if (i !== E.editing) drawShape(c, s); });
      if (!sel || E.sel < 0 || !E.shapes[E.sel]) return;
      const s = E.shapes[E.sel], px = 1 / scale(), [x0, y0, x1, y1] = bbox(s), m = 4 * px;
      c.save(); c.lineWidth = 1.5 * px; c.setLineDash([5 * px, 4 * px]); c.strokeStyle = "#7c5cff"; c.strokeRect(x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m); c.setLineDash([]);
      for (const h of handles(s)) { c.beginPath(); c.arc(h[0], h[1], 6 * px, 0, Math.PI * 2); c.fillStyle = "#fff"; c.fill(); c.lineWidth = 2 * px; c.strokeStyle = "#7c5cff"; c.stroke(); }
      c.restore();
    }
    E.render = render;
    // ---- hit testing (image pixels; a few screen pixels of slack)
    const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy; const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
    function hit(p) {
      const tol = 8 / scale();
      for (let i = E.shapes.length - 1; i >= 0; i--) {
        const s = E.shapes[i], w = width(s) / 2 + tol;
        if (s.t === "pen" || s.t === "marker") { for (let j = 0; j < s.pts.length; j++) if (segDist(p, s.pts[j], s.pts[Math.max(0, j - 1)]) <= w) return i; continue; }
        if (s.t === "arrow") { if (segDist(p, s.a, s.b) <= w + tol) return i; continue; }
        const [x0, y0, x1, y1] = bbox(s);
        if (s.t === "text") { if (p[0] >= x0 - tol && p[0] <= x1 + tol && p[1] >= y0 - tol && p[1] <= y1 + tol) return i; continue; }
        // a box or an ellipse is picked by its line, so what's under it stays reachable
        const near = p[0] >= x0 - w && p[0] <= x1 + w && p[1] >= y0 - w && p[1] <= y1 + w;
        if (!near) continue;
        if (s.t === "rect" && (Math.abs(p[0] - x0) <= w || Math.abs(p[0] - x1) <= w || Math.abs(p[1] - y0) <= w || Math.abs(p[1] - y1) <= w)) return i;
        if (s.t === "ellipse") { const rx = (x1 - x0) / 2 || 1, ry = (y1 - y0) / 2 || 1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; const r = Math.hypot((p[0] - cx) / rx, (p[1] - cy) / ry); if (Math.abs(r - 1) * Math.min(rx, ry) <= w) return i; }
      }
      return -1;
    }
    function hitHandle(p) {
      const s = E.shapes[E.sel]; if (!s) return -1;
      const hs = handles(s), tol = 12 / scale();
      for (let i = 0; i < hs.length; i++) if (Math.hypot(p[0] - hs[i][0], p[1] - hs[i][1]) <= tol) return i;
      return -1;
    }
    // ---- history
    const snap = () => JSON.stringify(E.shapes);
    const commit = () => { E.hist.push(snap()); if (E.hist.length > 200) E.hist.shift(); E.fut = []; E.dirty = true; };
    function step(back) {
      const from = back ? E.hist : E.fut, to = back ? E.fut : E.hist;
      if (!from.length) return;
      to.push(snap()); E.shapes = JSON.parse(from.pop()); E.sel = -1; E.dirty = true; sync();
    }
    // ---- toolbar
    function sync() {
      d.querySelectorAll(".mktool").forEach((b) => b.classList.toggle("on", b.dataset.tool === mkPrefs.tool));
      const s = E.shapes[E.sel], col = s ? s.c : mkPrefs.color, k = s ? s.k : mkPrefs.size;
      d.querySelectorAll(".mksw").forEach((b) => b.classList.toggle("on", b.dataset.color === col));
      d.querySelectorAll(".mksz").forEach((b) => b.classList.toggle("on", Number(b.dataset.size) === k));
      d.querySelector('[data-mk="undo"]').disabled = !E.hist.length;
      d.querySelector('[data-mk="redo"]').disabled = !E.fut.length;
      d.querySelector('[data-mk="del"]').disabled = E.sel < 0;
      d.querySelector('[data-mk="clear"]').disabled = !E.shapes.length;
      cv.className = "mkcv t-" + mkPrefs.tool + (E.img ? "" : " loading");
      zl.textContent = Math.round(scale() * 100) + "%";
      render();
    }
    E.sync = sync;
    const setTool = (t) => { finishText(); mkPrefs.tool = t; mkSave(); if (t !== "select") E.sel = -1; sync(); };
    d.querySelectorAll(".mktool").forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
    // A colour or size applies to the selected mark (or the text being typed), and to the marks you make next.
    d.querySelectorAll(".mksw").forEach((b) => (b.onclick = () => {
      const s = E.shapes[E.sel], c = b.dataset.color;
      if (s) { commit(); s.c = c; }
      if (E.textAt) { E.textAt.c = c; placeText(); }
      mkPrefs.color = c; mkSave(); sync();
    }));
    d.querySelectorAll(".mksz").forEach((b) => (b.onclick = () => {
      const s = E.shapes[E.sel], k = Number(b.dataset.size);
      if (s) { commit(); s.k = k; }
      if (E.textAt) { E.textAt.k = k; placeText(); }
      mkPrefs.size = k; mkSave(); sync();
    }));
    // While typing a text, the toolbar doesn't take the focus (which would end the text).
    d.querySelector(".mkbar").addEventListener("pointerdown", (e) => { if (!tin.hidden && e.target.closest(".mksw, .mksz")) e.preventDefault(); });
    const del = () => { if (E.sel < 0) return; commit(); E.shapes.splice(E.sel, 1); E.sel = -1; sync(); };
    d.querySelector('[data-mk="undo"]').onclick = () => step(true);
    d.querySelector('[data-mk="redo"]').onclick = () => step(false);
    d.querySelector('[data-mk="del"]').onclick = del;
    d.querySelector('[data-mk="clear"]').onclick = () => { if (!E.shapes.length) return; commit(); E.shapes = []; E.sel = -1; sync(); };
    d.querySelector('[data-mk="fit"]').onclick = () => zoomTo(1);
    // ---- zoom: the canvas keeps the image's pixels and is shown larger or smaller; the stage scrolls
    function layout() {
      cv.style.width = Math.round(E.W * scale()) + "px"; cv.style.height = Math.round(E.H * scale()) + "px";
      zl.textContent = Math.round(scale() * 100) + "%";
      if (!tin.hidden) placeText();
    }
    function zoomTo(z, cx, cy) {
      z = Math.min(8, Math.max(1, z));
      const r0 = cv.getBoundingClientRect();
      if (cx === undefined) { cx = r0.left + r0.width / 2; cy = r0.top + r0.height / 2; }
      const p = toImg(cx, cy);
      E.z = z; layout(); render();
      const r = cv.getBoundingClientRect();
      stage.scrollLeft += r.left + p[0] * r.width / E.W - cx;
      stage.scrollTop += r.top + p[1] * r.height / E.H - cy;
    }
    function fitNow() {
      const w = stage.clientWidth - 24, h = stage.clientHeight - 24;
      E.fit = Math.max(0.05, Math.min(w / E.W, h / E.H, 2)); layout();
    }
    stage.addEventListener("wheel", (e) => {
      if (!(e.ctrlKey || e.metaKey)) return; // plain scrolling moves around a zoomed image
      e.preventDefault(); zoomTo(E.z * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    }, { passive: false });
    new ResizeObserver(() => { if (E.W && d.open) { fitNow(); render(); } }).observe(stage);
    // ---- text: typed into a box over the image, drawn into the image when you're done
    function placeText() {
      const s = E.textAt; if (!s) return;
      tin.style.left = (cv.offsetLeft + s.a[0] * scale()) + "px"; tin.style.top = (cv.offsetTop + s.a[1] * scale()) + "px";
      const fs = width(s) * scale(); tin.style.fontSize = fs + "px"; tin.style.height = fs * 1.25 + "px"; tin.style.color = s.c;
    }
    function openText(s, i) {
      E.textAt = s; E.editing = i; tin.value = s.s || ""; tin.hidden = false; placeText(); render();
      // Focused right away, so the first letters typed don't go to the tool shortcuts.
      tin.focus(); setTimeout(() => { if (!tin.hidden) tin.focus(); }, 0);
    }
    function finishText(keep = true) {
      if (tin.hidden) return;
      const s = E.textAt, v = tin.value.trim();
      tin.hidden = true; E.textAt = null;
      const i = E.editing; E.editing = -1;
      if (keep && v && (i < 0 || E.shapes[i].s !== v || E.shapes[i].c !== s.c)) { commit(); if (i >= 0) { E.shapes[i].s = v; E.shapes[i].c = s.c; } else E.shapes.push({ ...s, s: v }); }
      else if (keep && !v && i >= 0) { commit(); E.shapes.splice(i, 1); E.sel = -1; }
      sync();
    }
    tin.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); finishText(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finishText(false); }
    });
    tin.addEventListener("blur", () => finishText());
    // ---- pointer: one finger or the mouse draws; two fingers zoom and move around
    function pinchStart() {
      const p = [...E.pts.values()];
      E.pinch = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1, z: E.z, mx: (p[0].x + p[1].x) / 2, my: (p[0].y + p[1].y) / 2 };
    }
    function dropOp() {
      // a stroke begun by the first finger of a pinch isn't a mark
      const op = E.op; E.op = null; if (!op) return;
      if (op.created) { E.shapes.pop(); E.hist.pop(); }
      else if (op.before) { E.shapes = JSON.parse(op.before); E.hist.pop(); }
      cv.classList.remove("panning"); render();
    }
    cv.addEventListener("pointerdown", (e) => {
      if (!E.img || (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1)) return;
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch {}
      E.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (E.pts.size === 2) { dropOp(); pinchStart(); return; }
      if (E.pts.size > 2) return;
      if (!tin.hidden) { finishText(); return; }
      const p = toImg(e.clientX, e.clientY), t = mkPrefs.tool;
      // Moving around: the middle button, space held, or a drag on nothing with the select tool.
      const pan = () => { E.op = { kind: "pan", x: e.clientX, y: e.clientY, sl: stage.scrollLeft, st: stage.scrollTop }; cv.classList.add("panning"); };
      if (e.button === 1 || E.space) return pan();
      if (t === "select") {
        const h = hitHandle(p);
        if (h >= 0) { E.op = { kind: "handle", h, before: snap() }; commit(); return; }
        const i = hit(p);
        if (i < 0) { E.sel = -1; sync(); return pan(); }
        E.sel = i; E.op = { kind: "move", last: p, before: snap() }; commit(); sync(); return;
      }
      if (t === "text") {
        const i = hit(p);
        if (i >= 0 && E.shapes[i].t === "text") { E.sel = -1; openText({ ...E.shapes[i] }, i); return; }
        openText({ t: "text", a: [p[0], p[1] - width({ t: "text", k: mkPrefs.size }) * 0.6], s: "", c: mkPrefs.color, k: mkPrefs.size }, -1); return;
      }
      commit();
      const s = t === "pen" || t === "marker" ? { t, pts: [p], c: mkPrefs.color, k: mkPrefs.size } : { t, a: p, b: p, c: mkPrefs.color, k: mkPrefs.size };
      E.shapes.push(s); E.sel = -1; E.op = { kind: "draw", created: true, s }; render();
    });
    cv.addEventListener("pointermove", (e) => {
      if (!E.pts.has(e.pointerId)) return;
      E.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (E.pinch && E.pts.size >= 2) {
        const p = [...E.pts.values()], dd = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), mx = (p[0].x + p[1].x) / 2, my = (p[0].y + p[1].y) / 2;
        zoomTo(E.pinch.z * dd / E.pinch.d, mx, my);
        stage.scrollLeft -= mx - E.pinch.mx; stage.scrollTop -= my - E.pinch.my; E.pinch.mx = mx; E.pinch.my = my;
        return;
      }
      const op = E.op; if (!op) return;
      if (op.kind === "pan") { stage.scrollLeft = op.sl - (e.clientX - op.x); stage.scrollTop = op.st - (e.clientY - op.y); return; }
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      const p = toImg(e.clientX, e.clientY);
      if (op.kind === "draw") {
        const s = op.s;
        if (s.pts) { for (const ev of evs.length ? evs : [e]) { const q = toImg(ev.clientX, ev.clientY), l = s.pts[s.pts.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) >= 1.5 / scale()) s.pts.push(q); } }
        else if (e.shiftKey && (s.t === "rect" || s.t === "ellipse")) { const m = Math.max(Math.abs(p[0] - s.a[0]), Math.abs(p[1] - s.a[1])); s.b = [s.a[0] + Math.sign(p[0] - s.a[0] || 1) * m, s.a[1] + Math.sign(p[1] - s.a[1] || 1) * m]; }
        else s.b = p;
      } else if (op.kind === "move") {
        const s = E.shapes[E.sel], dx = p[0] - op.last[0], dy = p[1] - op.last[1]; op.last = p;
        if (s.pts) s.pts = s.pts.map((q) => [q[0] + dx, q[1] + dy]);
        if (s.a) s.a = [s.a[0] + dx, s.a[1] + dy];
        if (s.b) s.b = [s.b[0] + dx, s.b[1] + dy];
        op.moved = true;
      } else if (op.kind === "handle") {
        const s = E.shapes[E.sel];
        if (s.t === "arrow") { if (op.h === 0) s.a = p; else s.b = p; }
        else {
          const [x0, y0, x1, y1] = bbox(s);
          const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], opp = c[(op.h + 2) % 4];
          s.a = opp; s.b = p;
        }
        op.moved = true;
      }
      render();
    });
    const up = (e) => {
      if (!E.pts.has(e.pointerId)) return;
      E.pts.delete(e.pointerId);
      if (E.pinch) { if (E.pts.size < 2) E.pinch = null; return; }
      const op = E.op; E.op = null; cv.classList.remove("panning");
      if (!op) return;
      if (op.kind === "draw" && !op.s.pts) {
        // a click without a drag isn't a box or an arrow
        const s = op.s;
        if (Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) < 6 / scale()) { E.shapes.pop(); E.hist.pop(); }
      }
      if ((op.kind === "move" || op.kind === "handle") && !op.moved) E.hist.pop();
      sync();
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", (e) => { if (E.pts.has(e.pointerId) && !E.pinch) dropOp(); up(e); });
    cv.addEventListener("dblclick", (e) => {
      if (mkPrefs.tool !== "select") return;
      const i = hit(toImg(e.clientX, e.clientY));
      if (i >= 0 && E.shapes[i].t === "text") { E.sel = -1; openText({ ...E.shapes[i] }, i); }
    });
    // ---- keys
    d.addEventListener("keydown", (e) => {
      if (e.target === tin) return;
      const typing = e.target === msg;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "z" || e.key === "Z") && !typing) { e.preventDefault(); step(!e.shiftKey); return; }
      if (mod && (e.key === "y" || e.key === "Y") && !typing) { e.preventDefault(); step(false); return; }
      if (typing || mod || e.altKey) return;
      if ((e.key === "Delete" || e.key === "Backspace") && E.sel >= 0) { e.preventDefault(); del(); return; }
      if (e.key === " ") { E.space = true; e.preventDefault(); return; }
      const keyTool = { v: "select", p: "pen", h: "marker", a: "arrow", r: "rect", o: "ellipse", t: "text" }[e.key.toLowerCase()];
      if (keyTool) { e.preventDefault(); setTool(keyTool); }
    });
    d.addEventListener("keyup", (e) => { if (e.key === " ") E.space = false; });
    // Esc, × or Cancel: marks you made aren't thrown away without asking.
    const leave = () => { if (E.dirty && E.shapes.length && !confirm("Discard your marks on this image?")) return; d.close(); };
    d.addEventListener("cancel", (e) => { e.preventDefault(); if (!tin.hidden) { finishText(false); return; } if (E.sel >= 0) { E.sel = -1; sync(); return; } leave(); });
    d.querySelectorAll('[data-mk="cancel"]').forEach((b) => (b.onclick = leave));
    d.addEventListener("close", () => { E.pts.clear(); E.op = null; E.pinch = null; tin.hidden = true; E.textAt = null; E.editing = -1; });
    // ---- done: the marks drawn into the image
    E.flatten = async () => {
      finishText();
      const c = document.createElement("canvas"); c.width = E.W; c.height = E.H;
      E.sel = -1; render(c.getContext("2d"), false);
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      const base = (E.opts.name || "image").replace(/[.][^.]*$/, "").replace(/-marked$/, "");
      return shrink(new File([blob], base + "-marked.png", { type: "image/png" }));
    };
    ok.onclick = async () => {
      if (ok.disabled) return;
      ok.disabled = true;
      try { await E.opts.done(await E.flatten(), E); }
      catch (err) { toast((err && err.message) || "That didn't work. Try again.", true); }
      finally { ok.disabled = false; }
    };
    return E;
  }
  /**
   * Open the editor on an image (a File or a URL). opts: { name, file | url, shapes (to go on marking), send (the label
   * of the agent it goes to; shows the comment box), okLabel, done(file, editor) }.
   */
  async function markUp(opts) {
    const E = mkEditor(), d = E.d;
    E.opts = opts; E.shapes = JSON.parse(JSON.stringify(opts.shapes || [])); E.sel = -1; E.hist = []; E.fut = []; E.dirty = false; E.z = 1; E.img = null;
    d.querySelector(".mktitle").textContent = "Mark up: " + (opts.name || "image");
    d.querySelector(".mksend").hidden = !opts.send;
    E.msg.value = ""; E.ok.textContent = opts.okLabel || "Done"; E.ok.disabled = false;
    if (opts.to) mkTargets(E);
    if (!d.open) d.showModal();
    E.sync();
    try {
      const blob = opts.file || (await (await fetch(opts.url, { credentials: "same-origin" })).blob());
      const bmp = await createImageBitmap(blob);
      const k = Math.min(1, MK_SIDE / Math.max(bmp.width, bmp.height));
      E.W = Math.round(bmp.width * k); E.H = Math.round(bmp.height * k); E.U = Math.max(1.5, Math.max(E.W, E.H) / 360);
      E.cv.width = E.W; E.cv.height = E.H; E.img = bmp;
    } catch { toast("Couldn't open that image", true); d.close(); return; }
    // Fit it to the window, then ready to draw with the tool you used last.
    requestAnimationFrame(() => { const st = E.stage; const w = st.clientWidth - 24, h = st.clientHeight - 24; E.fit = Math.max(0.05, Math.min(w / E.W, h / E.H, 2)); E.cv.style.width = Math.round(E.W * E.fit) + "px"; E.cv.style.height = Math.round(E.H * E.fit) + "px"; E.sync(); d.querySelector(".mktool.on")?.focus(); });
  }
  window.icMarkUp = markUp;
  // Who a marked-up image can go to: the agent it came from first, then every agent in the tree, by project (an image
  // from one agent, marked and sent to another). Picking one changes where it goes.
  function mkTargets(E) {
    const sel = E.d.querySelector("#mksel"), first = E.opts.to;
    const groups = new Map();
    $$("#tree a.ta").forEach((a) => {
      const k = a.dataset.k; if (!k) return;
      const p = a.closest("details.tp"), proj = p && p.querySelector(".tpn") ? p.querySelector(".tpn").textContent.trim() : "";
      const name = (a.querySelector(".tn") || a).textContent.trim() || k.split("/").pop();
      if (!groups.has(proj)) groups.set(proj, []);
      groups.get(proj).push({ address: k, label: name, project: proj, gone: a.classList.contains("gone") });
    });
    const all = [...groups.values()].flat();
    if (!all.some((t) => t.address === first.address)) all.unshift(first);
    sel.textContent = "";
    const opt = (t) => { const o = document.createElement("option"); o.value = t.address; o.textContent = t.label + (t.gone ? " (not connected)" : ""); return o; };
    if (!groups.size) sel.append(opt(first));
    else {
      if (![...groups.values()].flat().some((t) => t.address === first.address)) sel.append(opt(first));
      for (const [proj, list] of groups) { const g = document.createElement("optgroup"); g.label = proj ? "#" + proj : "Agents"; list.forEach((t) => g.append(opt(t))); sel.append(g); }
    }
    sel.value = first.address;
    sel.onchange = () => {
      const t = all.find((x) => x.address === sel.value) || first;
      // its project from the tree; the one it came with when that's the same agent
      E.opts.to = t.address === first.address ? first : { address: t.address, label: t.label, project: t.project };
      E.opts.send = E.opts.to.label; E.ok.textContent = "Send to " + E.opts.to.label;
    };
  }
  // Mark up an image waiting in a composer: the marked one takes its place; opening it again brings the marks back.
  function markTrayImage(f, it) {
    markUp({ name: (it.orig || it.file).name, file: it.orig || it.file, shapes: it.shapes, okLabel: "Done", done: async (file, E) => {
      if (it.url) URL.revokeObjectURL(it.url);
      it.orig = it.orig || it.file; it.shapes = E.shapes.length ? JSON.parse(JSON.stringify(E.shapes)) : null;
      it.file = E.shapes.length ? file : it.orig; it.url = URL.createObjectURL(it.file);
      const live = (f.id && document.getElementById(f.id)) || f;
      if (live !== f && live._imgs) live._imgs.push(it);
      drawTray(live); E.d.close();
    } });
  }
  // Mark up an image and send it straight to an agent, with what you write: through this chat's composer when it's
  // that agent's chat, else as a direct message to it (to: its address, in its project).
  async function sendMarked(file, E) {
    const to = E.opts.to, f = document.getElementById("chatform");
    let data, action;
    if (f && (!to || to.address === f.dataset.agent)) {
      data = new FormData(f); action = f.action;
      data.set("mode", ""); data.set("thread", ""); data.set("edit", "");
    } else if (to) {
      data = new FormData(); action = "/action/post";
      data.set("to", to.address); data.set("channel", to.project || ""); data.set("back", location.pathname + location.search);
    } else throw new Error("Nobody to send it to from here");
    data.set("message", E.msg.value.trim());
    data.append("image", file, file.name);
    const res = await fetch(action, { method: "POST", body: data, credentials: "same-origin" });
    const u = new URL(res.url), err = u.searchParams.get("err") || (res.ok ? null : "Couldn't send (HTTP " + res.status + "). Try again.");
    if (err) throw new Error(err);
    E.dirty = false; E.d.close();
    const v = document.getElementById("imgview"); if (v && v.open) v.close();
    await swap(await res.text());
    toast("Sent to " + E.opts.send);
  }
`;
}
