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
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const ZOOM_STEP = 1.1; 
const lockBgChk = document.getElementById('lockBgChk');
const wandBtn = document.getElementById('wandBtn');

// ===== THEME HANDLING =====
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('mgss_theme', theme);
}

(function initTheme() {
  const savedTheme = localStorage.getItem('mgss_theme') || 'light';
  applyTheme(savedTheme);
})();

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
});

// ===== STATE VARIABLES =====
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
let tempLine = null, tempCursor = null, edgePreviewDot = null, bgImage = null;
let handles = [];
let draggingHandle = null, dragOffset = [0, 0];
let wandCanvas = document.createElement('canvas');
let wandCtx = wandCanvas.getContext('2d', { willReadFrequently: true });

// ===== MODE HANDLING =====
wandBtn.onclick = () => setMode('wand');
polyBtn.onclick = () => setMode('polygon');
bezierBtn.onclick = () => setMode('bezier');
selectBtn.onclick = () => setMode('select');
handBtn.onclick = () => setMode('hand');

function setMode(m) {
  mode = m;
  document.body.classList.toggle('mode-hand', m === 'hand');
  document.body.classList.toggle('mode-wand', m === 'wand');
  document.querySelectorAll('.modeBtn').forEach(b => b.classList.remove('active'));
  
  const btnMap = { 'polygon': polyBtn, 'bezier': bezierBtn, 'select': selectBtn, 'hand': handBtn, 'wand': wandBtn };
  if (btnMap[m]) btnMap[m].classList.add('active');
  
  deselect();
}

// ===== UNDO / REDO / PROJECT STATE =====
function snapshotState() {
  const obj = { regions: [], bg: null, canvas: { w: canvas.clientWidth, h: canvas.clientHeight } };
  if (bgImage) obj.bg = { href: bgImage.href, width: bgImage.width, height: bgImage.height };
  regions.forEach(r => {
    obj.regions.push({
      id: r.id,
      points: r.points.map(p => ({ x: p.x, y: p.y, curve: !!p.curve, cx: p.cx || null, cy: p.cy || null })),
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
  if (obj.regions) {
    obj.regions.forEach(rr => {
      const r = {
        id: rr.id,
        points: rr.points.map(p => ({ x: p.x, y: p.y, curve: !!p.curve, cx: p.cx || null, cy: p.cy || null })),
        color: rr.color || defaultColorInput.value,
        opacity: rr.opacity != null ? rr.opacity : parseFloat(defaultOpacityInput.value),
        field: rr.field || ''
      };
      createRegionElement(r);
      regions.set(r.id, r);
      if (r.field) r.element.setAttribute('data-field', r.field);
    });
  }
  updateRegionList();
}

UndoRedo.onChangeSet(() => {});
function capture() { UndoRedo.capture(snapshotState()); }

// ===== BACKGROUND IMAGE HANDLING =====
lockBgChk.addEventListener('change', () => {
  const bg = canvas.querySelector('#bgImage');
  if (!bg) return;
  bg.style.pointerEvents = lockBgChk.checked ? 'none' : 'auto';
  canvas.classList.toggle('bg-locked', lockBgChk.checked);
});

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
  
  const img = document.createElementNS(svgNS, 'image');
  img.setAttribute('id', 'bgImage');
  img.setAttribute('width', imgW);
  img.setAttribute('height', imgH);
  img.setAttribute('href', href);
  img.style.pointerEvents = 'none';
  canvas.insertBefore(img, canvas.firstChild);
  
  bgImage = { href, width: imgW, height: imgH };
  viewBox = { x: 0, y: 0, w: imgW, h: imgH };
  wandCanvas.width = imgW;
  wandCanvas.height = imgH;
  const wandImg = new Image();
  wandImg.onload = () => wandCtx.drawImage(wandImg, 0, 0);
  wandImg.src = href;
}

// ===== MOUSE & DRAWING LOGIC =====
canvas.addEventListener('mousedown', ev => {
  if (mode === 'wand') {
    const raw = clientToSvg(ev);
    autoTrace(Math.round(raw.x), Math.round(raw.y));
    return;
  }
  if (mode === 'hand') {
    isPanning = true;
    panStart = { x: ev.clientX, y: ev.clientY };
    canvas.style.cursor = 'grabbing';
    return;
  }
  if (ev.target.classList && ev.target.classList.contains('handle')) return;

  const raw = clientToSvg(ev);
  const { x: svgX, y: svgY } = getSnappedPoint(raw.x, raw.y);

  if (mode === 'polygon' || mode === 'bezier') {
    if (!drawing) {
      startRegion(svgX, svgY);
      addPoint(svgX, svgY);
    } else {
      addPoint(svgX, svgY);
    }
  } else if (mode === 'select') {
    if (ev.target.tagName === 'polygon' || ev.target.tagName === 'path') {
      if (regions.has(ev.target.id)) selectRegion(regions.get(ev.target.id));
    } else {
      deselect();
    }
  }
});

canvas.addEventListener('mousemove', ev => {
  const raw = clientToSvg(ev);
  const { x, y } = getSnappedPoint(raw.x, raw.y);

  if (isPanning) {
    const dx = (ev.clientX - panStart.x) * (viewBox.w / canvas.clientWidth);
    const dy = (ev.clientY - panStart.y) * (viewBox.h / canvas.clientHeight);
    viewBox.x -= dx;
    viewBox.y -= dy;
    panStart = { x: ev.clientX, y: ev.clientY };
    updateViewBox();
    return;
  }

  if (drawing) {
    if (mode === 'bezier' && isAltDown && activeCurvePoint) {
      activeCurvePoint.curve = true;
      activeCurvePoint.cx = Math.round(x);
      activeCurvePoint.cy = Math.round(y);
      updateRegionElement(current);
    }
    updateTempLine(x, y);
    showTempCursor(x, y);
  }

  if (selected && !drawing && !draggingHandle) {
    showEdgePreview(findClosestEdge(selected, x, y));
  }

  if (draggingHandle && selected) {
    const nx = x - dragOffset[0];
    const ny = y - dragOffset[1];
    const idx = parseInt(draggingHandle.getAttribute('data-idx'), 10);
    selected.points[idx].x = Math.round(nx);
    selected.points[idx].y = Math.round(ny);
    updateRegionElement(selected);
    recreateHandles(selected);
  }
});

canvas.addEventListener('dblclick', () => { if (drawing) finalizeRegion(); });

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', ev => {
  if (ev.target.matches('input, textarea, select')) return;

  if (ev.key === 'Escape' || ev.key === 'Backspace') {
    if (drawing) {
      current.points.pop();
      if (current.points.length === 0) cancelCurrent();
      else updateRegionElement(current);
      removeTempLine(); removeTempCursor();
    } else if (ev.key === 'Escape') {
      deselect();
    }
  } else if (ev.key === 'Enter') {
    if (drawing) finalizeRegion();
  } else if (ev.key === 'Delete' && selected) {
    deleteRegion(selected.id);
  } else if (ev.key === 'Alt') {
    isAltDown = true;
  } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
    const s = UndoRedo.undo(); if (s) restoreState(s);
  } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') {
    const s = UndoRedo.redo(); if (s) restoreState(s);
  }
});

document.addEventListener('keyup', ev => { if (ev.key === 'Alt') isAltDown = false; });

// ===== ZOOM & PAN HELPERS =====
function updateViewBox() {
  canvas.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
}

function applyZoom(factor, centerX, centerY) {
  const vb = canvas.viewBox.baseVal;
  const currentZoom = parseFloat(canvas.dataset.zoom || 1);
  let nextZoom = currentZoom * factor;
  if (nextZoom < MIN_ZOOM || nextZoom > MAX_ZOOM) return;

  const newW = vb.width / factor;
  const newH = vb.height / factor;
  const dx = (centerX - vb.x) / vb.width;
  const dy = (centerY - vb.y) / vb.height;

  viewBox.x = vb.x + (vb.width * dx) - (newW * dx);
  viewBox.y = vb.y + (vb.height * dy) - (newH * dy);
  viewBox.w = newW;
  viewBox.h = newH;

  canvas.dataset.zoom = nextZoom;
  updateViewBox();
  
  const newRadius = 6 / nextZoom;
  document.querySelectorAll('.handle circle').forEach(c => c.setAttribute('r', newRadius));
}

canvas.addEventListener('wheel', ev => {
  ev.preventDefault();
  const factor = ev.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
  const pt = clientToSvg(ev);
  applyZoom(factor, pt.x, pt.y);
});

// ===== CORE DRAWING FUNCTIONS =====
function startRegion(x, y) {
  const id = generateId();
  current = { 
    id, 
    points: [{ x: Math.round(x), y: Math.round(y), curve: false }], 
    field: '', 
    color: defaultColorInput.value, 
    opacity: parseFloat(defaultOpacityInput.value) 
  };
  createRegionElement(current);
  drawing = true;
}

function addPoint(x, y) {
  if (!current) return;
  const p = { x: Math.round(x), y: Math.round(y), curve: false, cx: null, cy: null };
  current.points.push(p);
  activeCurvePoint = p;
  updateRegionElement(current);
}

function finalizeRegion() {
  if (!current) return;
  if (current.points.length < 3) { cancelCurrent(); return; }
  regions.set(current.id, current);
  attachRegionEvents(current);
  drawing = false; current = null;
  removeTempLine(); removeTempCursor();
  updateRegionList();
  capture();
}

function updateRegionElement(region) {
  const pts = region.points;
  const anyCurve = pts.some(p => p.curve);
  let el = region.element;

  if (anyCurve && el.tagName !== 'path') {
    const newEl = document.createElementNS(svgNS, 'path');
    el.replaceWith(newEl);
    el = newEl;
  } else if (!anyCurve && el.tagName !== 'polygon') {
    const newEl = document.createElementNS(svgNS, 'polygon');
    el.replaceWith(newEl);
    el = newEl;
  }

  region.element = el;
  if (anyCurve) {
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p.curve && p.cx != null) d += ` Q ${p.cx} ${p.cy} ${p.x} ${p.y}`;
      else d += ` L ${p.x} ${p.y}`;
    }
    el.setAttribute('d', d + ' Z');
  } else {
    el.setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '));
  }
  
  el.setAttribute('fill', region.color);
  el.setAttribute('fill-opacity', region.opacity);
  el.setAttribute('stroke', 'black');
  el.setAttribute('stroke-width', '1.5');
}

// ===== SNAPPING LOGIC (FIXED) =====
const BASE_SNAP_THRESHOLD = 10;
function getSnappedPoint(svgX, svgY) {
  let bestPoint = { x: svgX, y: svgY };
  const currentZoom = parseFloat(canvas.dataset.zoom || 1);
  const adjustedThreshold = BASE_SNAP_THRESHOLD / currentZoom;
  let minDistance = adjustedThreshold;

  regions.forEach(region => {
    if (drawing && current && region.id === current.id) return;
    if (selected && region.id === selected.id && !draggingHandle) return;

    region.points.forEach(p => {
      const d = Math.hypot(svgX - p.x, svgY - p.y);
      if (d < minDistance) {
        minDistance = d;
        bestPoint = { x: p.x, y: p.y };
      }
    });
  });
  return bestPoint;
}

// ===== HANDLE MANAGEMENT =====
function createHandles(r) {
  removeHandles();
  r.points.forEach((p, idx) => {
    const g = document.createElementNS(svgNS, 'g');
    g.classList.add('handle');
    g.setAttribute('data-idx', idx);
    g.setAttribute('transform', `translate(${p.x},${p.y})`);
    
    const currentZoom = parseFloat(canvas.dataset.zoom || 1);
    const circ = document.createElementNS(svgNS, 'circle');
    circ.setAttribute('r', 6 / currentZoom);
    g.appendChild(circ);

    g.addEventListener('mousedown', ev => {
      ev.stopPropagation();
      draggingHandle = g;
      const pt = clientToSvg(ev);
      dragOffset = [pt.x - p.x, pt.y - p.y];
      window.addEventListener('mouseup', stopDraggingHandle, { once: true });
    });
    
    g.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      removeVertex(r, idx);
    });
    
    canvas.appendChild(g);
    handles.push(g);
  });
}

function stopDraggingHandle() {
  draggingHandle = null;
  updateRegionList();
  capture();
}

// ===== MAGIC WAND (RADIAL TRACE) =====
function autoTrace(startX, startY) {
  if (!bgImage) return alert("Upload a background image first!");
  const pixelData = wandCtx.getImageData(0, 0, wandCanvas.width, wandCanvas.height).data;
  const getPixel = (x, y) => {
    const i = (y * wandCanvas.width + x) * 4;
    return [pixelData[i], pixelData[i+1], pixelData[i+2]];
  };

  const targetColor = getPixel(startX, startY);
  const threshold = 40;
  let points = [];
  const rayCount = 40;

  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2;
    for (let dist = 1; dist < 800; dist += 3) {
      const px = Math.round(startX + Math.cos(angle) * dist);
      const py = Math.round(startY + Math.sin(angle) * dist);
      if (px < 0 || px >= wandCanvas.width || py < 0 || py >= wandCanvas.height) break;
      const c = getPixel(px, py);
      if (Math.abs(c[0]-targetColor[0]) + Math.abs(c[1]-targetColor[1]) + Math.abs(c[2]-targetColor[2]) > threshold) {
        points.push({ x: px, y: py });
        break;
      }
    }
  }

  if (points.length > 3) {
    const id = generateId();
    const nr = { id, points, color: defaultColorInput.value, opacity: parseFloat(defaultOpacityInput.value), field: '' };
    createRegionElement(nr);
    regions.set(id, nr);
    attachRegionEvents(nr);
    updateRegionList();
    capture();
  }
}

// ===== UTILS & UI =====
function clientToSvg(ev) {
  const pt = canvas.createSVGPoint();
  pt.x = ev.clientX; pt.y = ev.clientY;
  return pt.matrixTransform(canvas.getScreenCTM().inverse());
}

function generateId() {
  let id;
  do { id = `Area_${regionCounter++}`; } while (document.getElementById(id));
  return id;
}

function selectRegion(r) {
  deselect();
  selected = r;
  r.element.classList.add('selected');
  regionIDInput.value = r.id;
  regionFieldInput.value = r.field || '';
  fillColorInput.value = r.color;
  fillOpacityInput.value = r.opacity;
  createHandles(r);
  document.getElementById('regionPropsSection')?.classList.add('open');
}

function deselect() {
  if (selected) selected.element.classList.remove('selected');
  selected = null;
  removeHandles();
}

function removeHandles() { handles.forEach(h => h.remove()); handles = []; }
function recreateHandles(r) { removeHandles(); createHandles(r); }
function clearAllRegions() { regions.forEach(r => r.element.remove()); regions.clear(); deselect(); }

function updateRegionList() {
  regionList.innerHTML = '';
  regions.forEach(r => {
    const li = document.createElement('li');
    li.textContent = r.id;
    li.onclick = () => selectRegion(r);
    regionList.appendChild(li);
  });
}

function deleteRegion(id) {
  const r = regions.get(id);
  if (r) r.element.remove();
  regions.delete(id);
  if (selected?.id === id) deselect();
  updateRegionList(); capture();
}

function attachRegionEvents(r) {
  r.element.addEventListener('click', ev => {
    if (mode === 'select') { ev.stopPropagation(); selectRegion(r); }
  });
}

function updateTempLine(x, y) {
  if (!current || current.points.length === 0) return;
  if (!tempLine) {
    tempLine = document.createElementNS(svgNS, 'line');
    tempLine.setAttribute('stroke', 'blue');
    tempLine.setAttribute('stroke-dasharray', '4,4');
    canvas.appendChild(tempLine);
  }
  const last = current.points[current.points.length - 1];
  tempLine.setAttribute('x1', last.x); tempLine.setAttribute('y1', last.y);
  tempLine.setAttribute('x2', x); tempLine.setAttribute('y2', y);
}

function removeTempLine() { if (tempLine) tempLine.remove(); tempLine = null; }
function showTempCursor(x, y) {
  if (!tempCursor) {
    tempCursor = document.createElementNS(svgNS, 'circle');
    tempCursor.setAttribute('r', 4);
    tempCursor.setAttribute('fill', '#007acc');
    canvas.appendChild(tempCursor);
  }
  tempCursor.setAttribute('cx', x); tempCursor.setAttribute('cy', y);
}
function removeTempCursor() { if (tempCursor) tempCursor.remove(); tempCursor = null; }

function createRegionElement(region) {
  const poly = document.createElementNS(svgNS, 'polygon');
  poly.setAttribute('id', region.id);
  canvas.appendChild(poly);
  region.element = poly;
  updateRegionElement(region);
}

// ===== PROPERTY INPUTS =====
fillColorInput.oninput = () => { if (selected) { selected.color = fillColorInput.value; updateRegionElement(selected); capture(); } };
fillOpacityInput.oninput = () => { if (selected) { selected.opacity = parseFloat(fillOpacityInput.value); updateRegionElement(selected); capture(); } };
regionFieldInput.oninput = () => { 
  if (selected) { 
    selected.field = regionFieldInput.value.trim(); 
    selected.field ? selected.element.setAttribute('data-field', selected.field) : selected.element.removeAttribute('data-field');
    capture(); 
  } 
};

regionIDInput.onchange = () => {
  if (!selected) return;
  const newId = regionIDInput.value.trim();
  if (!newId || (regions.has(newId) && newId !== selected.id)) {
    regionIDInput.value = selected.id;
    return;
  }
  regions.delete(selected.id);
  selected.id = newId;
  selected.element.setAttribute('id', newId);
  regions.set(newId, selected);
  updateRegionList(); capture();
};

// ===== EXPORT & PROJECT IO =====
exportPowerBI.onclick = () => {
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
  downloadSVG(svgStr, 'mgss_powerbi.svg');
};

function createPathD(r) {
  const pts = r.points;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].curve) d += ` Q ${pts[i].cx} ${pts[i].cy} ${pts[i].x} ${pts[i].y}`;
    else d += ` L ${pts[i].x} ${pts[i].y}`;
  }
  return d + ' Z';
}

function downloadSVG(str, name) {
  const blob = new Blob([str], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  a.click();
}

saveProjectBtn.onclick = () => ProjectIO.exportProject(snapshotState());
loadProjectFile.onchange = ev => {
  const file = ev.target.files[0];
  if (file) ProjectIO.importProjectFile(file, (err, obj) => { if (!err) { restoreState(obj); capture(); } });
};

// ===== LAYER CONTROL =====
document.getElementById('frontBtn').onclick = () => {
  if (selected) { canvas.appendChild(selected.element); recreateHandles(selected); capture(); }
};
document.getElementById('backBtn').onclick = () => {
  if (selected) {
    const bg = canvas.querySelector('#bgImage');
    bg ? bg.after(selected.element) : canvas.prepend(selected.element);
    recreateHandles(selected); capture();
  }
};

// Final Cleanup Helpers
function findClosestEdge(r, x, y) {
  const pts = r.points;
  let best = { dist: Infinity, idx: -1, x: 0, y: 0 };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    let t = ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1);
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + t * dx, cy = a.y + t * dy;
    const d = Math.hypot(x - cx, y - cy);
    if (d < best.dist) best = { dist: d, idx: i + 1, x: cx, y: cy };
  }
  return best;
}

function showEdgePreview(info) {
  if (!edgePreviewDot) {
    edgePreviewDot = document.createElementNS(svgNS, 'circle');
    edgePreviewDot.setAttribute('r', 5);
    edgePreviewDot.setAttribute('fill', '#ff9900');
    edgePreviewDot.setAttribute('pointer-events', 'none');
  }
  if (info.dist < 20) {
    edgePreviewDot.setAttribute('cx', info.x);
    edgePreviewDot.setAttribute('cy', info.y);
    if (!edgePreviewDot.parentNode) canvas.appendChild(edgePreviewDot);
  } else {
    edgePreviewDot.remove();
  }
}
