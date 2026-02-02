// app.js - MGSS Studio v4 main
// Full-featured version with Synoptic-compatible export
// Depends on undoRedo.js, projectIO.js, svgExport.js

const regionFieldInput = document.getElementById('regionField');
const svgNS = "http://www.w3.org/2000/svg";
const canvas = document.getElementById('svgCanvas');
const polyBtn = document.getElementById('polyBtn');
const bezierBtn = document.getElementById('bezierBtn');
const selectBtn = document.getElementById('selectBtn');
const uploadImage = document.getElementById('uploadImage');
const includeImage = document.getElementById('includeImage');
const exportPowerBI = document.getElementById('exportPowerBI');
const exportFull = document.getElementById('exportFull');
const regionList = document.getElementById('regionList');
const regionIDInput = document.getElementById('regionID');
const fillColorInput = document.getElementById('fillColor');
const fillOpacityInput = document.getElementById('fillOpacity');
const defaultColorInput = document.getElementById('defaultColor');
const defaultOpacityInput = document.getElementById('defaultOpacity');
const saveProjectBtn = document.getElementById('saveProjectBtn');
const loadProjectFile = document.getElementById('loadProjectFile');
const themeToggle = document.getElementById('themeToggle');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const autosaveCheckbox = document.getElementById('autosave');
const handBtn = document.getElementById('handBtn');
const wandBtn = document.getElementById('wandBtn');
const circleSelectBtn = document.getElementById('circleSelectBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const ZOOM_STEP = 1.1; // 20% per click
const lockBgChk = document.getElementById('lockBgChk');

// ===== THEME HANDLING =====
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('mgss_theme', theme);
}

// init theme on load
(function initTheme() {
  const savedTheme = localStorage.getItem('mgss_theme') || 'light';
  applyTheme(savedTheme);
})();

// toggle theme
themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
});

let isAltDown = false;
let activeCurvePoint = null;

let viewBox = { x: 0, y: 0, w: 1000, h: 1000 };
let isPanning = false;
let panStart = { x: 0, y: 0 };

let mode = 'polygon';
let drawing = false;
let current = null;
let regionCounter = 1;
const regions = new Map();
let selected = null;
let tempLine = null,
  tempCursor = null,
  edgePreviewDot = null,
  bgImage = null;
let handles = [];
let draggingHandle = null,
  dragOffset = [0, 0];

// mode buttons
polyBtn.onclick = () => setMode('polygon');
bezierBtn.onclick = () => setMode('bezier');
selectBtn.onclick = () => setMode('select');
handBtn.onclick = () => setMode('hand');
wandBtn.onclick = () => setMode('wand');
circleSelectBtn.onclick = () => setMode('circleSelect');

function setMode(m) {
  mode = m;
  document.body.classList.toggle('mode-hand', m === 'hand');
  document.querySelectorAll('.modeBtn').forEach(b => b.classList.remove('active'));
  if (m === 'polygon') polyBtn.classList.add('active');
  if (m === 'bezier') bezierBtn.classList.add('active');
  if (m === 'select') selectBtn.classList.add('active');
  if (m === 'hand') handBtn.classList.add('active');
  if (m === 'wand') wandBtn.classList.add('active');
  if (m === 'circleSelect') circleSelectBtn.classList.add('active');
   
  deselect();
}

// UndoRedo snapshot helpers
function snapshotState() {
  const obj = { regions: [], bg: null, canvas: { w: canvas.clientWidth, h: canvas.clientHeight } };
  if (bgImage) obj.bg = { href: bgImage.href, width: bgImage.width, height: bgImage.height };
  regions.forEach(r => {
    obj.regions.push({
      id: r.id,
      points: r.points.map(p => ({ x: p.x, y: p.y, curve: p.curve ? true : false, cx: p.cx || null, cy: p.cy || null })),
      color: r.color,
      opacity: r.opacity,
      field: r.field || ''
    });
  });
  return obj;
}

function restoreState(obj) {
  clearAllRegions();
  if (obj.bg) loadBackgroundFromData(obj.bg.href, obj.bg.width, obj.bg.height, false);
  if (obj.regions) obj.regions.forEach(rr => {
    const id = rr.id;
    const r = {
      id,
      points: rr.points.map(p => ({ x: p.x, y: p.y, curve: !!p.curve, cx: p.cx || null, cy: p.cy || null })),
      color: rr.color || defaultColorInput.value,
      opacity: rr.opacity != null ? rr.opacity : parseFloat(defaultOpacityInput.value),
      field: rr.field || ''
    };
    createRegionElement(r);
    regions.set(id, r);
    if (r.field) {
      r.element.setAttribute('data-field', r.field);
    }
  });
  updateRegionList();
}

// initial capture
UndoRedo.onChangeSet(() => {});
function capture() { UndoRedo.capture(snapshotState()); }

lockBgChk.addEventListener('change', () => {
  const bg = canvas.querySelector('#bgImage');
  if (!bg) return;

  if (lockBgChk.checked) {
    bg.style.pointerEvents = 'none';
    canvas.classList.add('bg-locked');
  } else {
    bg.style.pointerEvents = 'auto';
    canvas.classList.remove('bg-locked');
  }
});

// Background image
uploadImage.addEventListener('change', ev => {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const href = e.target.result;
    const img = new Image();
    img.onload = () => {
      loadBackgroundFromData(href, img.naturalWidth, img.naturalHeight);
      capture();
    };
    img.src = href;
  };
  reader.readAsDataURL(file);
});

function loadBackgroundFromData(href, imgW, imgH) {
  const old = canvas.querySelector('#bgImage');
  if (old) old.remove();
  canvas.setAttribute('viewBox', `0 0 ${imgW} ${imgH}`);
  canvas.setAttribute('width', imgW);
  canvas.setAttribute('height', imgH);
  canvas.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const img = document.createElementNS(svgNS, 'image');
  img.setAttribute('id', 'bgImage');
  img.setAttribute('x', 0);
  img.setAttribute('y', 0);
  img.setAttribute('width', imgW);
  img.setAttribute('height', imgH);
  img.setAttribute('href', href);
  img.style.pointerEvents = 'none';
  canvas.insertBefore(img, canvas.firstChild);
  bgImage = { href, width: imgW, height: imgH };
  viewBox = { x: 0, y: 0, w: imgW, h: imgH };
}

function removeBackgroundImage() {
  const old = canvas.querySelector('#bgImage');
  if (old) old.remove();
  bgImage = null;
  canvas.setAttribute('viewBox', '0 0 1000 700');
  canvas.setAttribute('width', 1000);
  canvas.setAttribute('height', 700);
  viewBox = { x: 0, y: 0, w: 1000, h: 700 };
}

document.getElementById('removeBgBtn').addEventListener('click', () => {
  if (!bgImage) return;
  if (!confirm('Remove background image?')) return;
  removeBackgroundImage();
});

const fitBtn = document.getElementById('fitBtn');
fitBtn.addEventListener('click', () => {
  if (!bgImage) return;
  viewBox.x = 0;
  viewBox.y = 0;
  viewBox.w = bgImage.width;
  viewBox.h = bgImage.height;
  canvas.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
  canvas.dataset.zoom = 1;
});

const resetZoomBtn = document.getElementById('resetZoomBtn');
resetZoomBtn.addEventListener('click', () => {
  canvas.dataset.zoom = 1;
  if (bgImage) {
    viewBox.x = 0;
    viewBox.y = 0;
    viewBox.w = bgImage.width;
    viewBox.h = bgImage.height;
  }
  updateViewBox();
});

// Mouse events
canvas.addEventListener('mousedown', ev => {
  if (mode === 'hand') {
    isPanning = true;
    panStart = { x: ev.clientX, y: ev.clientY };
    canvas.style.cursor = 'grabbing';
    return;
  }

  if (ev.target.classList && ev.target.classList.contains('handle')) return;
  const raw = clientToSvg(ev); 
  const snapped = getSnappedPoint(raw.x, raw.y);
  const svgX = snapped.x;
  const svgY = snapped.y; // Apply Snap
  if (mode === 'wand') {
    performAutoWand(svgX, svgY);
    return;
  }

  if (mode === 'circleSelect') {
    // 50 is the radius, you can change this value
    selectRegionsInCircle(svgX, svgY, 50); 
    return;
  }
  if (mode === 'polygon' || mode === 'bezier') {
    if (!drawing) {
      startRegion(svgX, svgY);
      addPoint(svgX, svgY, false);
    } else addPoint(svgX, svgY, false);
  } else if (mode === 'select') {
    if (ev.target.tagName === 'polygon' || ev.target.tagName === 'path') {
      const id = ev.target.id;
      if (regions.has(id)) selectRegion(regions.get(id));
    } else deselect();
  }
});

canvas.addEventListener('mousemove', ev => {
  if (isPanning) {
    const dx = (ev.clientX - panStart.x) * (viewBox.w / canvas.clientWidth);
    const dy = (ev.clientY - panStart.y) * (viewBox.h / canvas.clientHeight);
    viewBox.x -= dx;
    viewBox.y -= dy;
    panStart = { x: ev.clientX, y: ev.clientY };
    updateViewBox();
    return;
  }

  const { x, y } = clientToSvg(ev);
  if (drawing) {
  const movePt = clientToSvg(ev);
  const snappedMove = getSnappedPoint(movePt.x, movePt.y);
  updateTempLine(snappedMove.x, snappedMove.y);
  showTempCursor(snappedMove.x, snappedMove.y);
}
  if (selected && !drawing) {
    const near = findClosestEdge(selected, x, y);
    showEdgePreview(near);
  }
  if (draggingHandle && selected) {
    const idx = parseInt(draggingHandle.getAttribute('data-idx'), 10);
    const nx = x - dragOffset[0],
      ny = y - dragOffset[1];
    selected.points[idx].x = Math.round(nx);
    selected.points[idx].y = Math.round(ny);
    updateRegionElement(selected);
    recreateHandles(selected);
  }
});

canvas.addEventListener('dblclick', ev => { if (drawing) finalizeRegion(); });

document.addEventListener('keydown', ev => {
  const isTyping = ev.target.matches('input, textarea, select, [contenteditable="true"]');
  if (isTyping) return;
  
  if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA') {
    return;
  }

  if (ev.key === 'Escape' || ev.key === 'Backspace') {
    if (drawing) {
      if (current.points.length > 0) {
        current.points.pop();
        if (current.points.length === 0) cancelCurrent();
        else updateRegionElement(current);
      }
      removeTempLine();
      removeTempCursor();
      ev.preventDefault();
    } else {
      if (ev.key === 'Backspace' && !drawing) return;
      deselect();
    }
  } else if (ev.key === 'Enter') {
    if (drawing) finalizeRegion();
  } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
    const s = UndoRedo.undo();
    if (s) restoreState(s);
  } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') {
    const s = UndoRedo.redo();
    if (s) restoreState(s);
  } else if (ev.key === 'Delete') {
    if (selected) deleteRegion(selected.id);
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Alt') isAltDown = true;
});

document.addEventListener('keyup', e => {
  if (e.key === 'Alt') {
    isAltDown = false;
    activeCurvePoint = null;
  }
});

// helpers

const SNAP_THRESHOLD = 10;
function getSnappedPoint(svgX, svgY) {
  let bestPoint = { x: svgX, y: svgY };
  const currentZoom = parseFloat(canvas.dataset.zoom || 1);
  const adjustedThreshold = SNAP_THRESHOLD / currentZoom;
  let minDistance = SNAP_THRESHOLD;

  // Look through every point in every region
  regions.forEach(region => {
    // Don't snap to the region we are currently drawing
    if (drawing && current && region.id === current.id) return;
    if (selected && region.id === selected.id) return;

    region.points.forEach(p => {
      const d = distance(svgX, svgY, p.x, p.y);
      if (d < minDistance) {
        minDistance = d;
        bestPoint = { x: p.x, y: p.y };
      }
    });
  });

  return bestPoint;
}

function clientToSvg(ev) {
  const pt = canvas.createSVGPoint();
  pt.x = ev.clientX;
  pt.y = ev.clientY;
  const svgPt = pt.matrixTransform(canvas.getScreenCTM().inverse());
  return { x: svgPt.x, y: svgPt.y };
}

function startRegion(x, y) {
  const id = generateId();
  current = {
    id,
    points: [{ x: Math.round(x), y: Math.round(y), curve: false }],
    field: '',
    element: null,
    color: defaultColorInput.value,
    opacity: parseFloat(defaultOpacityInput.value)
  };
  createRegionElement(current);
  drawing = true;
  showTempCursor(x, y);
}

function addPoint(x, y) {
  if (!current) return;
  const p = { x: Math.round(x), y: Math.round(y), curve: false, cx: null, cy: null };
  current.points.push(p);
  activeCurvePoint = p;
  updateRegionElement(current);
}

function updateViewBox() {
  canvas.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
}

function updateTempLine(x, y) {
  if (!current) return;
  const pts = current.points;
  if (pts.length === 0) return;
  if (!tempLine) {
    tempLine = document.createElementNS(svgNS, 'line');
    tempLine.setAttribute('stroke', 'blue');
    tempLine.setAttribute('stroke-dasharray', '4,4');
    tempLine.setAttribute('pointer-events', 'none');
    canvas.appendChild(tempLine);
  }
  const last = pts[pts.length - 1];
  tempLine.setAttribute('x1', last.x);
  tempLine.setAttribute('y1', last.y);
  tempLine.setAttribute('x2', x);
  tempLine.setAttribute('y2', y);
}

function removeTempLine() { if (tempLine && tempLine.parentNode) tempLine.parentNode.removeChild(tempLine); tempLine = null; }
function showTempCursor(x, y) {
  if (!tempCursor) {
    tempCursor = document.createElementNS(svgNS, 'circle');
    tempCursor.setAttribute('r', 4);
    tempCursor.setAttribute('fill', '#007acc');
    tempCursor.setAttribute('pointer-events', 'none');
    canvas.appendChild(tempCursor);
  }
  tempCursor.setAttribute('cx', x);
  tempCursor.setAttribute('cy', y);
}
function removeTempCursor() { if (tempCursor && tempCursor.parentNode) tempCursor.parentNode.removeChild(tempCursor); tempCursor = null; }

function finalizeRegion() {
  if (!current) return;
  if (current.points.length < 3) { cancelCurrent(); return; }
  regions.set(current.id, current);
  attachRegionEvents(current);
  current = null;
  drawing = false;
  removeTempLine();
  removeTempCursor();
  updateRegionList();
  capture();
}

function cancelCurrent() {
  if (current && current.element && current.element.parentNode) current.element.parentNode.removeChild(current.element);
  current = null;
  drawing = false;
  removeTempLine();
  removeTempCursor();
}

function createRegionElement(region) {
  const poly = document.createElementNS(svgNS, 'polygon');
  poly.setAttribute('id', region.id);
  poly.setAttribute('fill', region.color || defaultColorInput.value);
  poly.setAttribute('fill-opacity', region.opacity != null ? region.opacity : defaultOpacityInput.value);
  poly.setAttribute('stroke', 'black');
  poly.setAttribute('stroke-width', '1.5');
  canvas.appendChild(poly);
  region.element = poly;
  updateRegionElement(region);
}

function updateRegionElement(region) {
  const pts = region.points;
  if (!region.element) createRegionElement(region);
  const anyCurve = pts.some(p => p.curve);
  if (anyCurve) {
    if (region.element.tagName !== 'path') {
      const newEl = document.createElementNS(svgNS, 'path');
      if (region.element.parentNode) canvas.replaceChild(newEl, region.element);
      region.element = newEl;
    }
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p.curve && p.cx != null && p.cy != null) d += ` Q ${p.cx} ${p.cy} ${p.x} ${p.y}`;
      else d += ` L ${p.x} ${p.y}`;
    }
    d += ' Z';
    region.element.setAttribute('d', d);
  } else {
    if (region.element.tagName !== 'polygon') {
      const newEl = document.createElementNS(svgNS, 'polygon');
      if (region.element.parentNode) canvas.replaceChild(newEl, region.element);
      region.element = newEl;
    }
    const ptsAttr = pts.map(p => `${p.x},${p.y}`).join(' ');
    region.element.setAttribute('points', ptsAttr);
  }
  region.element.setAttribute('fill', region.color || defaultColorInput.value);
  region.element.setAttribute('fill-opacity', region.opacity != null ? region.opacity : defaultOpacityInput.value);
  region.element.setAttribute('stroke', 'black');
  region.element.setAttribute('stroke-width', '1.5');
}

// ID helpers
function generateId() {
  let id;
  do { id = `Area_${regionCounter++}` } while (document.getElementById(id));
  return id;
}
function attachRegionEvents(region) {
  if (region.element) region.element.addEventListener('click', ev => {
    if (mode === 'select') {
      ev.stopPropagation();
      selectRegion(region);
    }
  });
}

// region selection / handles
function selectRegion(r) {
  const props = document.getElementById('regionPropsSection');
  if (props) props.classList.add('open');
  deselect();
  selected = r;
  r.element.classList.add('selected');
  regionFieldInput.value = r.field || '';
  regionIDInput.value = r.id;
  fillColorInput.value = r.color || defaultColorInput.value;
  fillOpacityInput.value = r.opacity != null ? r.opacity : defaultOpacityInput.value;
  recreateHandles(r);
}

function deselect() {
  if (selected) {
    selected.element.classList.remove('selected');
    removeHandles();
  }
  selected = null;
  regionIDInput.value = '';
  fillColorInput.value = '#000000';
  fillOpacityInput.value = 0;
}

// handle creation
function createHandles(r) {
  removeHandles();
  r.points.forEach((p, idx) => {
    const g = document.createElementNS(svgNS, 'g');
    g.classList.add('handle');
    g.setAttribute('data-idx', idx);
    g.setAttribute('transform', `translate(${p.x},${p.y})`);
    const currentZoom = parseFloat(canvas.dataset.zoom || 1);
    const scaledRadius = 6 / currentZoom;
    const circ = document.createElementNS(svgNS, 'circle');
    circ.setAttribute('r', 6);
    circ.setAttribute('cx', 0);
    circ.setAttribute('cy', 0);
    g.appendChild(circ);
    g.addEventListener('mousedown', ev => {
      ev.stopPropagation();
      draggingHandle = g;
      const tr = g.getAttribute('transform');
      const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(tr);
      const hx = m ? parseFloat(m[1]) : 0;
      const hy = m ? parseFloat(m[2]) : 0;
      const pt = clientToSvg(ev);
      dragOffset = [pt.x - hx, pt.y - hy];
      window.addEventListener('mousemove', handleDragging);
      window.addEventListener('mouseup', stopDraggingHandle);
    });
    g.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      const i = parseInt(g.getAttribute('data-idx'), 10);
      removeVertex(r, i);
    });
    canvas.appendChild(g);
    handles.push(g);
  });
  bringHandlesToFront();
}

function handleDragging(ev) {
  if (!draggingHandle || !selected) return;
  const pt = clientToSvg(ev);
  const snappedHandle = getSnappedPoint(pt.x, pt.y);
  const mx = pt.x,
    my = pt.y;
  const nx = mx - dragOffset[0],
    ny = my - dragOffset[1];
  draggingHandle.setAttribute('transform', `translate(${nx},${ny})`);
  const idx = parseInt(draggingHandle.getAttribute('data-idx'), 10);
  selected.points[idx].x = Math.round(nx);
  selected.points[idx].y = Math.round(ny);
  updateRegionElement(selected);
  recreateHandles(selected);
}

function stopDraggingHandle() {
  window.removeEventListener('mousemove', handleDragging);
  window.removeEventListener('mouseup', stopDraggingHandle);
  draggingHandle = null;
  updateRegionList();
  capture();
}

function removeHandles() { handles.forEach(h => { if (h.parentNode) h.parentNode.removeChild(h); }); handles = []; }
function recreateHandles(r) { removeHandles(); createHandles(r); }
function bringHandlesToFront() { handles.forEach(h => canvas.appendChild(h)); }

function removeVertex(r, index) {
  if (r.points.length <= 3) {
    if (confirm('Removing this vertex will leave fewer than 3 points. Delete region?')) deleteRegion(r.id);
    return;
  }
  r.points.splice(index, 1);
  updateRegionElement(r);
  recreateHandles(r);
  updateRegionList();
  capture();
}

// edge previews & insertion
function findClosestEdge(r, x, y) {
  const pts = r.points;
  let best = { dist: Infinity, idx: -1, x: 0, y: 0 };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    const proj = projectPointToSegment([x, y], [a.x, a.y], [b.x, b.y]);
    if (proj.dist < best.dist) best = { dist: proj.dist, idx: i + 1, x: proj.x, y: proj.y };
  }
  return best;
}

function showEdgePreview(info) {
  if (!info || info.dist === Infinity) return;
  if (info.dist > 28) {
    if (edgePreviewDot) { edgePreviewDot.remove(); edgePreviewDot = null; }
    return;
  }
  if (!edgePreviewDot) {
    edgePreviewDot = document.createElementNS(svgNS, 'circle');
    edgePreviewDot.setAttribute('r', 5);
    edgePreviewDot.setAttribute('fill', '#ff9900');
    edgePreviewDot.setAttribute('pointer-events', 'none');
    canvas.appendChild(edgePreviewDot);
  }
  edgePreviewDot.setAttribute('cx', info.x);
  edgePreviewDot.setAttribute('cy', info.y);
}

function insertVertexAt(r, x, y) {
  const info = findClosestEdge(r, x, y);
  if (info.dist < 28) {
    r.points.splice(info.idx, 0, { x: Math.round(info.x), y: Math.round(info.y), curve: false });
    updateRegionElement(r);
    recreateHandles(r);
    updateRegionList();
    capture();
  }
}

canvas.addEventListener('click', ev => {
  if (ev.shiftKey && selected) {
    const { x, y } = clientToSvg(ev);
    insertVertexAt(selected, x, y);
  }
});

function deleteRegion(id) {
  const r = regions.get(id);
  if (!r) return;
  if (r.element && r.element.parentNode) r.element.parentNode.removeChild(r.element);
  regions.delete(id);
  if (selected && selected.id === id) { removeHandles(); selected = null; }
  updateRegionList();
  capture();
}

function applyZoom(factor, centerX, centerY) {
  const vb = canvas.viewBox.baseVal;
  let newW = vb.width / factor;
  let newH = vb.height / factor;
  const currentZoom = canvas.dataset.zoom ? parseFloat(canvas.dataset.zoom) : 1;
  let nextZoom = currentZoom * factor;
  if (nextZoom < MIN_ZOOM || nextZoom > MAX_ZOOM) return;
  const dx = (centerX - vb.x) / vb.width;
  const dy = (centerY - vb.y) / vb.height;
  vb.x += vb.width * dx - newW * dx;
  vb.y += vb.height * dy - newH * dy;
  vb.width = newW;
  vb.height = newH;
  canvas.dataset.zoom = nextZoom;
  const newRadius = 6 / nextZoom;
  document.querySelectorAll('.handle circle').forEach(c => {
    c.setAttribute('r', newRadius);
  });
  updateZoomButtons();
}

function updateZoomButtons() {
  const z = parseFloat(canvas.dataset.zoom || 1);
  if (zoomInBtn) zoomInBtn.disabled = z >= MAX_ZOOM;
  if (zoomOutBtn) zoomOutBtn.disabled = z <= MIN_ZOOM;
}

zoomInBtn.addEventListener('click', () => {
  const vb = canvas.viewBox.baseVal;
  applyZoom(ZOOM_STEP, vb.x + vb.width / 2, vb.y + vb.height / 2);
});

zoomOutBtn.addEventListener('click', () => {
  const vb = canvas.viewBox.baseVal;
  applyZoom(1 / ZOOM_STEP, vb.x + vb.width / 2, vb.y + vb.height / 2);
});

function clearAllRegions() {
  regions.forEach(r => { if (r.element && r.element.parentNode) r.element.parentNode.removeChild(r.element); });
  regions.clear();
  removeHandles();
  selected = null;
}

function updateRegionList() {
  regionList.innerHTML = '';
  regions.forEach(r => {
    const li = document.createElement('li');
    li.textContent = r.id;
    li.addEventListener('click', () => selectRegion(r));
    regionList.appendChild(li);
  });
}

canvas.addEventListener('wheel', ev => {
  ev.preventDefault();
  const factor = ev.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
  const pt = clientToSvg(ev);
  applyZoom(factor, pt.x, pt.y);
});

document.addEventListener('keydown', ev => { if (ev.code === 'Space') canvas.style.cursor = 'grab'; });
document.addEventListener('keyup', ev => { if (ev.code === 'Space') canvas.style.cursor = 'default'; });

canvas.addEventListener('mousedown', ev => {
  if (ev.code === 'Space' || ev.button === 1) {
    isPanning = true;
    panStart = { x: ev.clientX, y: ev.clientY };
    canvas.style.cursor = 'grabbing';
  }
});

canvas.addEventListener('mousemove', ev => {
  if (drawing && mode === 'bezier' && isAltDown && activeCurvePoint) {
    const pt = clientToSvg(ev);
    activeCurvePoint.curve = true;
    activeCurvePoint.cx = Math.round(pt.x);
    activeCurvePoint.cy = Math.round(pt.y);
    updateRegionElement(current);
    return;
  }
  if (!isPanning) return;
  const dx = (ev.clientX - panStart.x) * (viewBox.w / canvas.clientWidth);
  const dy = (ev.clientY - panStart.y) * (viewBox.h / canvas.clientHeight);
  viewBox.x -= dx;
  viewBox.y -= dy;
  panStart = { x: ev.clientX, y: ev.clientY };
  updateViewBox();
});

document.addEventListener('mouseup', () => {
  isPanning = false;
  canvas.style.cursor = 'default';
});

fillColorInput.addEventListener('input', () => { if (selected) { selected.color = fillColorInput.value; updateRegionElement(selected); capture(); } });
fillOpacityInput.addEventListener('input', () => { if (selected) { selected.opacity = parseFloat(fillOpacityInput.value); updateRegionElement(selected); capture(); } });

regionFieldInput.addEventListener('input', () => {
  if (!selected) return;
  selected.field = regionFieldInput.value.trim();
  if (selected.field) selected.element.setAttribute('data-field', selected.field);
  else selected.element.removeAttribute('data-field');
  capture();
});

regionIDInput.addEventListener('input', () => {
  if (!selected) return;
  const newId = regionIDInput.value.trim();
  if (!newId) return;
  if (regions.has(newId) && newId !== selected.id) {
    alert("Region ID already exists");
    regionIDInput.value = selected.id;
    return;
  }
  const oldId = selected.id;
  regions.delete(oldId);
  selected.id = newId;
  regions.set(newId, selected);
  selected.element.setAttribute('id', newId);
  updateRegionList();
  capture();
});

exportPowerBI.addEventListener('click', () => {
  const svgStr = buildCleanSVGFragment(
    [...regions.values()].map(r => ({
      tag: r.points.some(p => p.curve) ? 'path' : 'polygon',
      id: r.id,
      attr: {
        points: r.points.map(p => `${p.x},${p.y}`).join(' '),
        d: r.points.some(p => p.curve) ? createPathD(r) : '',
        fill: r.color,
        'fill-opacity': r.opacity,
        'data-field': r.field || '',
        stroke: 'black',
        'stroke-width': '1.5'
      }
    })),
    canvas.viewBox.baseVal.width,
    canvas.viewBox.baseVal.height,
    bgImage
  );
  downloadSVG(svgStr, 'mgss_full.svg');
});

exportFull.addEventListener('click', () => { const svgStr = canvas.outerHTML; downloadSVG(svgStr, 'mgss_full_raw.svg'); });

function createPathD(r) {
  const pts = r.points;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.curve && p.cx != null && p.cy != null) d += ` Q ${p.cx} ${p.cy} ${p.x} ${p.y}`;
    else d += ` L ${p.x} ${p.y}`;
  }
  return d + ' Z';
}

function downloadSVG(svgStr, filename) {
  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

saveProjectBtn.addEventListener('click', () => { ProjectIO.exportProject(snapshotState()); });
loadProjectFile.addEventListener('change', ev => {
  const file = ev.target.files[0];
  if (!file) return;
  ProjectIO.importProjectFile(file, (err, obj) => {
    if (err) { alert('Failed to load project'); return; }
    restoreState(obj);
    capture();
  });
});

autosaveCheckbox.addEventListener('change', ev => {
  if (ev.target.checked) { setInterval(() => { ProjectIO.exportProject(snapshotState()); }, 10000); }
});

undoBtn.addEventListener('click', () => { const s = UndoRedo.undo(); if (s) restoreState(s); });
redoBtn.addEventListener('click', () => { const s = UndoRedo.redo(); if (s) restoreState(s); });

const frontBtn = document.getElementById('frontBtn');
const backBtn = document.getElementById('backBtn');

frontBtn.onclick = () => {
  if (!selected || !selected.element) return;
  // Moves the element to the bottom of the SVG list (renders on top)
  canvas.appendChild(selected.element);
  // Ensure handles stay on top of the moved element
  bringHandlesToFront();
  capture(); 
};

backBtn.onclick = () => {
  if (!selected || !selected.element) return;
  const bg = canvas.querySelector('#bgImage');
  if (bg) {
    // Places it right after the background so it's behind other polygons
    bg.after(selected.element);
  } else {
    canvas.prepend(selected.element);
  }
  bringHandlesToFront();
  capture();
};

// Also let's make that Center button work while we are here
document.getElementById('centerBtn').onclick = () => {
  if (!selected || !selected.element) return;
  const bbox = selected.element.getBBox();
  viewBox.x = bbox.x - (viewBox.w / 2) + (bbox.width / 2);
  viewBox.y = bbox.y - (viewBox.h / 2) + (bbox.height / 2);
  updateViewBox();
};

function projectPointToSegment(p, a, b) {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax,
    dy = by - ay;
  if (dx === 0 && dy === 0) return { x: ax, y: ay, dist: distance(px, py, ax, ay) };
  let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx,
    cy = ay + t * dy;
  return { x: cx, y: cy, dist: distance(px, py, cx, cy) };
}

function distance(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }



document.querySelectorAll('.collapsible-header').forEach(header => {
  header.addEventListener('click', () => {
    const section = header.closest('.collapsible');
    section.classList.toggle('open');
  });
});

// --- AUTO WAND LOGIC ---
async function performAutoWand(svgX, svgY) {
  if (!bgImage) return;
  
  // Create offscreen canvas to read pixels
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = bgImage.href;
  
  await img.decode();
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = bgImage.width;
  tempCanvas.height = bgImage.height;
  const ctx = tempCanvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  
  const imgData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const points = tracePathFromPixel(imgData, Math.round(svgX), Math.round(svgY));
  
  if (points.length > 3) {
    const id = generateId();
    const r = {
      id,
      points: points,
      field: '',
      color: defaultColorInput.value,
      opacity: parseFloat(defaultOpacityInput.value)
    };
    createRegionElement(r);
    regions.set(id, r);
    attachRegionEvents(r);
    updateRegionList();
    capture();
  }
}

// Simple Boundary Tracer (Sampled every 5th edge pixel for performance)
function tracePathFromPixel(imgData, startX, startY) {
  const width = imgData.width;
  const height = imgData.height;
  const data = imgData.data;

  // Helper to get pixel color
  const getPixel = (x, y) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i+1], data[i+2]];
  };

  const targetColor = getPixel(startX, startY);
  const points = [];
  const visited = new Set();
  const queue = [[startX, startY]];

  // Simple flood-fill to find edge points
  while(queue.length > 0 && points.length < 1000) {
    const [x, y] = queue.shift();
    const key = `${x},${y}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const color = getPixel(x, y);
    const isMatch = Math.abs(color[0]-targetColor[0]) < 30; // 30 is the sensitivity

    if (isMatch) {
      // If it's a boundary pixel, add to points
      if (x % 5 === 0) points.push({x, y}); // Sample every 5th pixel for performance
      
      // Check neighbors
      [[x+1,y],[x-1,y],[x,y+1],[x,y-1]].forEach(([nx, ny]) => {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) queue.push([nx, ny]);
      });
    }
  }
  return points;
}

// --- CIRCLE SELECTION LOGIC ---
function selectRegionsInCircle(centerX, centerY, radius = 50) {
  regions.forEach(r => {
    // Check if any point of the region falls within the circle radius
    const isInside = r.points.some(p => {
      const dist = Math.sqrt((p.x - centerX)**2 + (p.y - centerY)**2);
      return dist <= radius;
    });
    if (isInside) {
      // Logic to highlight/select multiple
      r.element.setAttribute('stroke-width', '3');
      selectRegion(r);
    }
  });
}
