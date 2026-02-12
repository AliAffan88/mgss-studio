// app.js - MGSS Studio v5 main
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
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const ZOOM_STEP = 1.1; 
const lockBgChk = document.getElementById('lockBgChk');
const wandThresholdInput = document.getElementById('wandThreshold');
const thresholdValDisplay = document.getElementById('thresholdVal');

let currentLevel = 'root'; 
let drillPath = [{ id: 'root', name: 'Project Root' }];
const hierarchy = new Map(); // Key: ParentID, Value: Map of regions
hierarchy.set('root', new Map()); // Initialize root level

// Update the number display when you move the slider
wandThresholdInput.oninput = () => {
  thresholdValDisplay.textContent = wandThresholdInput.value;
};

// Wand initialization
let wandCanvas = document.createElement('canvas');
let wandCtx = wandCanvas.getContext('2d', { willReadFrequently: true });
const wandBtn = document.getElementById('wandBtn');

wandBtn.onclick = () => setMode('wand');

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

let isAltDown = false;
let activeCurvePoint = null;
let viewBox = { x: 0, y: 0, w: 1000, h: 1000 };
let isPanning = false;
let panStart = { x: 0, y: 0 };
let mode = 'polygon';
let drawing = false;
let current = null;
let regionCounter = 1;
function getActiveRegions() {
  return hierarchy.get(currentLevel);
};
let selected = null;
let tempLine = null,
  tempCursor = null,
  edgePreviewDot = null,
  bgImage = null;
let handles = [];
let draggingHandle = null,
  dragOffset = [0, 0];

// Mode buttons
polyBtn.onclick = () => setMode('polygon');
bezierBtn.onclick = () => setMode('bezier');
selectBtn.onclick = () => setMode('select');
handBtn.onclick = () => setMode('hand');

function setMode(m) {
  mode = m;
  document.body.classList.toggle('mode-hand', m === 'hand');
  document.body.classList.toggle('mode-wand', m === 'wand');
  document.querySelectorAll('.modeBtn').forEach(b => b.classList.remove('active'));
  if (m === 'polygon') polyBtn.classList.add('active');
  if (m === 'bezier') bezierBtn.classList.add('active');
  if (m === 'select') selectBtn.classList.add('active');
  if (m === 'hand') handBtn.classList.add('active');
  if (m === 'wand') wandBtn.classList.add('active');
  deselect();
}

function snapshotState() {
  const obj = { regions: [], bg: null, canvas: { w: canvas.clientWidth, h: canvas.clientHeight } };
  if (bgImage) obj.bg = { href: bgImage.href, width: bgImage.width, height: bgImage.height };
  getActiveRegions().forEach(r => {
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
  if (obj.regions) obj.getActiveRegions().forEachh(rr => {
    const id = rr.id;
    const r = {
      id,
      points: rr.points.map(p => ({ x: p.x, y: p.y, curve: !!p.curve, cx: p.cx || null, cy: p.cy || null })),
      color: rr.color || defaultColorInput.value,
      opacity: rr.opacity != null ? rr.opacity : parseFloat(defaultOpacityInput.value),
      field: rr.field || ''
    };
    createRegionElement(r);
    getActiveRegions().set(id, r);
    if (r.field) r.element.setAttribute('data-field', r.field);
  });
  updateRegionList();
}

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
  const imgTag = document.createElementNS(svgNS, 'image');
  imgTag.setAttribute('id', 'bgImage');
  imgTag.setAttribute('x', 0);
  imgTag.setAttribute('y', 0);
  imgTag.setAttribute('width', imgW);
  imgTag.setAttribute('height', imgH);
  imgTag.setAttribute('href', href);
  imgTag.style.pointerEvents = 'none';
  canvas.insertBefore(imgTag, canvas.firstChild);
  bgImage = { href, width: imgW, height: imgH };
  viewBox = { x: 0, y: 0, w: imgW, h: imgH };
  
  // Sync Wand scanner canvas
  wandCanvas.width = imgW;
  wandCanvas.height = imgH;
  const tempImg = new Image();
  tempImg.onload = () => wandCtx.drawImage(tempImg, 0, 0);
  tempImg.src = href;
}

document.getElementById('removeBgBtn').addEventListener('click', () => {
  if (!bgImage) return;
  if (!confirm('Remove background image?')) return;
  const old = canvas.querySelector('#bgImage');
  if (old) old.remove();
  bgImage = null;
  canvas.setAttribute('viewBox', '0 0 1000 700');
  canvas.setAttribute('width', 1000);
  canvas.setAttribute('height', 700);
  viewBox = { x: 0, y: 0, w: 1000, h: 700 };
});

document.getElementById('fitBtn').onclick = () => {
  if (!bgImage) return;
  viewBox = { x: 0, y: 0, w: bgImage.width, h: bgImage.height };
  updateViewBox();
  canvas.dataset.zoom = 1;
};

document.getElementById('resetZoomBtn').onclick = () => {
  canvas.dataset.zoom = 1;
  if (bgImage) viewBox = { x: 0, y: 0, w: bgImage.width, h: bgImage.height };
  else viewBox = { x: 0, y: 0, w: 1000, h: 700 };
  updateViewBox();
};

// Mouse events
canvas.addEventListener('mousedown', ev => {
  // Wand click logic
  if (mode === 'wand') {
    const raw = clientToSvg(ev);
    autoTrace(Math.round(raw.x), Math.round(raw.y));
    return;
  }
  if (mode === 'hand' || ev.code === 'Space' || ev.button === 1) {
    isPanning = true;
    panStart = { x: ev.clientX, y: ev.clientY };
    canvas.style.cursor = 'grabbing';
    return;
  }

  if (ev.target.classList && ev.target.classList.contains('handle')) return;
  const raw = clientToSvg(ev); 
  const snapped = getSnappedPoint(raw.x, raw.y);
  
  if (mode === 'polygon' || mode === 'bezier') {
    if (!drawing) {
      startRegion(snapped.x, snapped.y);
      addPoint(snapped.x, snapped.y, false);
    } else addPoint(snapped.x, snapped.y, false);
  } else if (mode === 'select') {
    if (ev.target.tagName === 'polygon' || ev.target.tagName === 'path') {
      const id = ev.target.id;
      if (regions.has(id)) selectRegion(getActiveRegions().get(id));
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
    if (mode === 'bezier' && isAltDown && activeCurvePoint) {
      activeCurvePoint.curve = true;
      activeCurvePoint.cx = Math.round(x);
      activeCurvePoint.cy = Math.round(y);
      updateRegionElement(current);
      return;
    }
    const snappedMove = getSnappedPoint(x, y);
    updateTempLine(snappedMove.x, snappedMove.y);
    showTempCursor(snappedMove.x, snappedMove.y);
  }
  if (selected && !drawing) {
    const near = findClosestEdge(selected, x, y);
    showEdgePreview(near);
  }
  if (draggingHandle && selected) {
    const idx = parseInt(draggingHandle.getAttribute('data-idx'), 10);
    const nx = x - dragOffset[0], ny = y - dragOffset[1];
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
  } else if (ev.key === 'Alt') isAltDown = true;
    else if (ev.code === 'Space') canvas.style.cursor = 'grab';
});

document.addEventListener('keyup', ev => {
  if (ev.key === 'Alt') { isAltDown = false; activeCurvePoint = null; }
  if (ev.code === 'Space') canvas.style.cursor = 'default';
});

document.addEventListener('mouseup', () => { isPanning = false; canvas.style.cursor = 'default'; });

function updateBreadcrumbs() {
  const container = document.getElementById('breadcrumb-path');
  container.innerHTML = '';
  drillPath.forEach((step, index) => {
    const link = document.createElement('span');
    link.textContent = step.name;
    link.style.cursor = index === drillPath.length - 1 ? 'default' : 'pointer';
    link.style.color = index === drillPath.length - 1 ? 'var(--text)' : 'var(--accent)';
    
    if (index < drillPath.length - 1) {
      link.onclick = () => drillUpTo(index);
      container.appendChild(link);
      container.appendChild(document.createTextNode(' > '));
    } else {
      container.appendChild(link);
    }
  });
}

function drillIn(region) {
  currentLevel = region.id;
  drillPath.push({ id: region.id, name: region.id });
  
  if (!hierarchy.has(currentLevel)) {
    hierarchy.set(currentLevel, new Map());
  }
  
  deselect();
  renderLevel();
}

function drillUpTo(index) {
  drillPath = drillPath.slice(0, index + 1);
  currentLevel = drillPath[index].id;
  renderLevel();
}

function renderLevel() {
  // Clear canvas except background
  const bg = canvas.querySelector('#bgImage');
  canvas.innerHTML = '';
  if (bg) canvas.appendChild(bg);
  
  // Draw regions of the current level
  getActiveRegions().forEach(r => {
    createRegionElement(r);
    attachRegionEvents(r);
  });
  
  updateRegionList();
  updateBreadcrumbs();
}

document.getElementById('drillInBtn').onclick = () => {
  if (selected) drillIn(selected);
};

// Helpers
const SNAP_THRESHOLD = 10;
function getSnappedPoint(svgX, svgY) {
  let bestPoint = { x: svgX, y: svgY };
  const currentZoom = parseFloat(canvas.dataset.zoom || 1);
  const adjustedThreshold = SNAP_THRESHOLD / currentZoom;
  let minDistance = SNAP_THRESHOLD;

  getActiveRegions().forEach(region => {
    if (drawing && current && region.id === current.id) return;
    if (selected && region.id === selected.id) return;
    region.points.forEach(p => {
      const d = distance(svgX, svgY, p.x, p.y);
      if (d < minDistance) { minDistance = d; bestPoint = { x: p.x, y: p.y }; }
    });
  });
  return bestPoint;
}

function clientToSvg(ev) {
  const pt = canvas.createSVGPoint();
  pt.x = ev.clientX; pt.y = ev.clientY;
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

function updateViewBox() { canvas.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`); }

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
  tempLine.setAttribute('x1', last.x); tempLine.setAttribute('y1', last.y);
  tempLine.setAttribute('x2', x); tempLine.setAttribute('y2', y);
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
  tempCursor.setAttribute('cx', x); tempCursor.setAttribute('cy', y);
}
function removeTempCursor() { if (tempCursor && tempCursor.parentNode) tempCursor.parentNode.removeChild(tempCursor); tempCursor = null; }

function finalizeRegion() {
  if (!current) return;
  if (current.points.length < 3) { cancelCurrent(); return; }
  getActiveRegions().set(current.id, current);
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
  current = null; drawing = false; removeTempLine(); removeTempCursor();
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

function generateId() {
  let id; do { id = `Area_${regionCounter++}` } while (document.getElementById(id));
  return id;
}

function attachRegionEvents(region) {
  if (region.element) region.element.addEventListener('click', ev => {
    if (mode === 'select') { ev.stopPropagation(); selectRegion(region); }
  });
}

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
  if (selected) { selected.element.classList.remove('selected'); removeHandles(); }
  selected = null; regionIDInput.value = ''; fillColorInput.value = '#000000'; fillOpacityInput.value = 0;
}

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
    circ.setAttribute('cx', 0); circ.setAttribute('cy', 0);
    g.appendChild(circ);
    g.addEventListener('mousedown', ev => {
      ev.stopPropagation();
      draggingHandle = g;
      const tr = g.getAttribute('transform');
      const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(tr);
      const hx = m ? parseFloat(m[1]) : 0, hy = m ? parseFloat(m[2]) : 0;
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
  const nx = pt.x - dragOffset[0], ny = pt.y - dragOffset[1];
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
  draggingHandle = null; updateRegionList(); capture();
}

function removeHandles() { handles.forEach(h => { if (h.parentNode) h.parentNode.removeChild(h); }); handles = []; }
function recreateHandles(r) { removeHandles(); createHandles(r); }
function bringHandlesToFront() { handles.forEach(h => canvas.appendChild(h)); }

function removeVertex(r, index) {
  if (r.points.length <= 3) { if (confirm('Delete region?')) deleteRegion(r.id); return; }
  r.points.splice(index, 1); updateRegionElement(r); recreateHandles(r); updateRegionList(); capture();
}

function findClosestEdge(r, x, y) {
  const pts = r.points;
  let best = { dist: Infinity, idx: -1, x: 0, y: 0 };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const proj = projectPointToSegment([x, y], [a.x, a.y], [b.x, b.y]);
    if (proj.dist < best.dist) best = { dist: proj.dist, idx: i + 1, x: proj.x, y: proj.y };
  }
  return best;
}

function showEdgePreview(info) {
  if (!info || info.dist > 28) { if (edgePreviewDot) { edgePreviewDot.remove(); edgePreviewDot = null; } return; }
  if (!edgePreviewDot) {
    edgePreviewDot = document.createElementNS(svgNS, 'circle');
    edgePreviewDot.setAttribute('r', 5); edgePreviewDot.setAttribute('fill', '#ff9900');
    edgePreviewDot.setAttribute('pointer-events', 'none'); canvas.appendChild(edgePreviewDot);
  }
  edgePreviewDot.setAttribute('cx', info.x); edgePreviewDot.setAttribute('cy', info.y);
}

function insertVertexAt(r, x, y) {
  const info = findClosestEdge(r, x, y);
  if (info.dist < 28) {
    r.points.splice(info.idx, 0, { x: Math.round(info.x), y: Math.round(info.y), curve: false });
    updateRegionElement(r); recreateHandles(r); updateRegionList(); capture();
  }
}

canvas.addEventListener('click', ev => { if (ev.shiftKey && selected) { const { x, y } = clientToSvg(ev); insertVertexAt(selected, x, y); } });

function deleteRegion(id) {
  const r = getActiveRegions().get(id);
  if (!r) return;
  if (r.element && r.element.parentNode) r.element.parentNode.removeChild(r.element);
  regions.delete(id);
  if (selected && selected.id === id) { removeHandles(); selected = null; }
  updateRegionList(); capture();
}

function applyZoom(factor, centerX, centerY) {
  const vb = canvas.viewBox.baseVal;
  let newW = vb.width / factor; let newH = vb.height / factor;
  const currentZoom = canvas.dataset.zoom ? parseFloat(canvas.dataset.zoom) : 1;
  let nextZoom = currentZoom * factor;
  if (nextZoom < MIN_ZOOM || nextZoom > MAX_ZOOM) return;
  const dx = (centerX - vb.x) / vb.width; const dy = (centerY - vb.y) / vb.height;
  vb.x += vb.width * dx - newW * dx; vb.y += vb.height * dy - newH * dy;
  vb.width = newW; vb.height = newH;
  canvas.dataset.zoom = nextZoom;
  document.querySelectorAll('.handle circle').forEach(c => c.setAttribute('r', 6 / nextZoom));
  updateZoomButtons();
}

function updateZoomButtons() {
  const z = parseFloat(canvas.dataset.zoom || 1);
  if (zoomInBtn) zoomInBtn.disabled = z >= MAX_ZOOM;
  if (zoomOutBtn) zoomOutBtn.disabled = z <= MIN_ZOOM;
}

zoomInBtn.onclick = () => { const vb = canvas.viewBox.baseVal; applyZoom(ZOOM_STEP, vb.x + vb.width / 2, vb.y + vb.height / 2); };
zoomOutBtn.onclick = () => { const vb = canvas.viewBox.baseVal; applyZoom(1 / ZOOM_STEP, vb.x + vb.width / 2, vb.y + vb.height / 2); };

function clearAllRegions() {
  getActiveRegions().forEach(r => { if (r.element && r.element.parentNode) r.element.parentNode.removeChild(r.element); });
  regions.clear(); removeHandles(); selected = null;
}

function updateRegionList() {
  regionList.innerHTML = '';
  getActiveRegions().forEach(r => {
    const li = document.createElement('li');
    li.textContent = r.id; li.onclick = () => selectRegion(r);
    regionList.appendChild(li);
  });
}

canvas.addEventListener('wheel', ev => { ev.preventDefault(); const factor = ev.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP; const pt = clientToSvg(ev); applyZoom(factor, pt.x, pt.y); });

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
  if (!newId || (regions.has(newId) && newId !== selected.id)) return;
  const oldId = selected.id; regions.delete(oldId); selected.id = newId; getActiveRegions().set(newId, selected);
  selected.element.setAttribute('id', newId); updateRegionList(); capture();
});

exportPowerBI.onclick = () => {
  const isHeatmap = document.getElementById('heatmapExportChk').checked;
  const svgStr = buildCleanSVGFragment([...regions.values()].map(r => ({
    tag: r.points.some(p => p.curve) ? 'path' : 'polygon',
    id: r.id,
    attr: {
      points: r.points.map(p => `${p.x},${p.y}`).join(' '),
      d: r.points.some(p => p.curve) ? createPathD(r) : '',
      fill: isHeatmap ? 'transparent' : r.color, 
      'fill-opacity': isHeatmap ? 1 : r.opacity,
      'data-field': r.field || '',
      stroke: 'black', 
      'stroke-width': '1.5'
      'data-parent': currentLevel === 'root' ? '' : currentLevel,
      'data-level': drillPath.length - 1
    }
  })), canvas.viewBox.baseVal.width, canvas.viewBox.baseVal.height, bgImage);
  downloadSVG(svgStr, isHeatmap ? 'map_heatmap_ready.svg' : 'map_colored.svg');
};

exportFull.onclick = () => downloadSVG(canvas.outerHTML, 'mgss_full_raw.svg');

function createPathD(r) {
  const pts = r.points; let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.curve && p.cx != null && p.cy != null) d += ` Q ${p.cx} ${p.cy} ${p.x} ${p.y}`;
    else d += ` L ${p.x} ${p.y}`;
  }
  return d + ' Z';
}

function downloadSVG(svgStr, filename) {
  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

saveProjectBtn.onclick = () => ProjectIO.exportProject(snapshotState());
loadProjectFile.onchange = ev => {
  const file = ev.target.files[0]; if (!file) return;
  ProjectIO.importProjectFile(file, (err, obj) => { if (!err) { restoreState(obj); capture(); } });
};

undoBtn.onclick = () => { const s = UndoRedo.undo(); if (s) restoreState(s); };
redoBtn.onclick = () => { const s = UndoRedo.redo(); if (s) restoreState(s); };

document.getElementById('frontBtn').onclick = () => { if (selected) { canvas.appendChild(selected.element); bringHandlesToFront(); capture(); } };
document.getElementById('backBtn').onclick = () => {
  if (!selected) return; const bg = canvas.querySelector('#bgImage');
  if (bg) bg.after(selected.element); else canvas.prepend(selected.element);
  bringHandlesToFront(); capture();
};

document.getElementById('centerBtn').onclick = () => {
  if (!selected) return; const bbox = selected.element.getBBox();
  viewBox.x = bbox.x - (viewBox.w / 2) + (bbox.width / 2);
  viewBox.y = bbox.y - (viewBox.h / 2) + (bbox.height / 2); updateViewBox();
};

function projectPointToSegment(p, a, b) {
  const [px, py] = p; const [ax, ay] = a; const [bx, by] = b;
  const dx = bx - ax, dy = by - ay; if (dx === 0 && dy === 0) return { x: ax, y: ay, dist: distance(px, py, ax, ay) };
  let t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return { x: ax + t * dx, y: ay + t * dy, dist: distance(px, py, ax + t * dx, ay + t * dy) };
}

function distance(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }

document.querySelectorAll('.collapsible-header').forEach(h => h.onclick = () => h.closest('.collapsible').classList.toggle('open'));

// --- MAGIC WAND LOGIC ---
function autoTrace(startX, startY) {
  if (!bgImage) return alert("Upload a background image first!");

  const pixelData = wandCtx.getImageData(0, 0, wandCanvas.width, wandCanvas.height).data;
  const getPixel = (x, y) => {
    const i = (y * wandCanvas.width + x) * 4;
    return [pixelData[i], pixelData[i+1], pixelData[i+2]];
  };

  const targetColor = getPixel(startX, startY);
  const threshold = parseInt(wandThresholdInput.value); 
  let points = [];
  const rayCount = 40; 

  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2;
    for (let dist = 1; dist < 800; dist += 3) {
      const px = Math.round(startX + Math.cos(angle) * dist);
      const py = Math.round(startY + Math.sin(angle) * dist);
      
      if (px < 0 || px >= wandCanvas.width || py < 0 || py >= wandCanvas.height) break;

      const color = getPixel(px, py);
      const diff = Math.abs(color[0] - targetColor[0]) + 
                   Math.abs(color[1] - targetColor[1]) + 
                   Math.abs(color[2] - targetColor[2]);

      if (diff > threshold) {
        points.push({x: px, y: py});
        break;
      }
    }
  }

  if (points.length > 3) {
    const id = generateId();
    const newRegion = {
      id, points, color: defaultColorInput.value,
      opacity: parseFloat(defaultOpacityInput.value), field: ''
    };
    createRegionElement(newRegion);
    getActiveRegions().set(id, newRegion);
    attachRegionEvents(newRegion);
    updateRegionList();
    capture();
  }
}

// --- CSV EXPORT DEBUG VERSION ---
const exportCSVBtn = document.getElementById('exportCSV');

if (exportCSVBtn) {
    console.log("✅ Checkpoint 1: CSV Button found in HTML");

    exportCSVBtn.onclick = () => {
        console.log("✅ Checkpoint 2: Button clicked");
        
        if (regions.size === 0) {
            alert("No regions found! Draw some shapes first.");
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,Level,Parent ID,Area ID,Field Name\n";
        hierarchy.forEach((map, parentId) => {
        map.forEach((r, id) => {
            csvContent += `"${r.level || 0}","${parentId}","${r.id}","${r.field || ''}"\n`;
          });
        });
        getActiveRegions().forEach((r, id) => {
            console.log(`Processing region: ${id}`);
            csvContent += `"${r.id}","${r.field || ''}"\n`;
        });

        try {
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "mgss_hierarchy_mapping.csv");
            document.body.appendChild(link);
            link.click();
            link.remove();
            console.log("✅ Checkpoint 3: Download triggered");
        } catch (err) {
            console.error("❌ Export failed:", err);
        }
    };
} else {
    console.error("❌ Checkpoint 1 Failed: Button with ID 'exportCSV' not found!");
}
