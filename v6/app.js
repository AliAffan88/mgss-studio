// app.js - MGSS Studio v6 (Hierarchical Drill-Down Edition)
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
const lockBgChk = document.getElementById('lockBgChk');
const wandThresholdInput = document.getElementById('wandThreshold');
const thresholdValDisplay = document.getElementById('thresholdVal');
const breadcrumbPath = document.getElementById('breadcrumb-path');

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const ZOOM_STEP = 1.1; 

// --- HIERARCHY STATE ---
let currentLevel = 'root'; 
let drillPath = [{ id: 'root', name: 'Project Root' }];
const hierarchy = new Map(); 
hierarchy.set('root', new Map()); 

function getActiveRegions() {
  return hierarchy.get(currentLevel);
}

// --- WAND SETUP ---
let wandCanvas = document.createElement('canvas');
let wandCtx = wandCanvas.getContext('2d', { willReadFrequently: true });
const wandBtn = document.getElementById('wandBtn');

wandThresholdInput.oninput = () => {
  thresholdValDisplay.textContent = wandThresholdInput.value;
};

// --- STATE VARIABLES ---
let isAltDown = false;
let activeCurvePoint = null;
let viewBox = { x: 0, y: 0, w: 1000, h: 1000 };
let isPanning = false;
let panStart = { x: 0, y: 0 };
let mode = 'polygon';
let drawing = false;
let current = null;
let regionCounter = 1;
let selected = null;
let tempLine = null, tempCursor = null, edgePreviewDot = null, bgImage = null;
let handles = [];
let draggingHandle = null, dragOffset = [0, 0];

// --- THEME ---
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('mgss_theme', theme);
}
(function initTheme() {
  const savedTheme = localStorage.getItem('mgss_theme') || 'light';
  applyTheme(savedTheme);
})();
themeToggle.onclick = () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
};

// --- NAVIGATION & BREADCRUMBS ---
function updateBreadcrumbs() {
  breadcrumbPath.innerHTML = '';
  drillPath.forEach((step, index) => {
    const link = document.createElement('span');
    link.textContent = step.name;
    link.style.cursor = index === drillPath.length - 1 ? 'default' : 'pointer';
    link.style.color = index === drillPath.length - 1 ? 'var(--text)' : 'var(--accent)';
    if (index < drillPath.length - 1) {
      link.onclick = () => drillUpTo(index);
      breadcrumbPath.appendChild(link);
      breadcrumbPath.appendChild(document.createTextNode(' > '));
    } else {
      breadcrumbPath.appendChild(link);
    }
  });
}

function drillIn(region) {
  currentLevel = region.id;
  drillPath.push({ id: region.id, name: region.id });
  if (!hierarchy.has(currentLevel)) hierarchy.set(currentLevel, new Map());
  deselect();
  renderLevel();
}

function drillUpTo(index) {
  drillPath = drillPath.slice(0, index + 1);
  currentLevel = drillPath[index].id;
  renderLevel();
}

function renderLevel() {
  const bg = canvas.querySelector('#bgImage');
  canvas.innerHTML = '';
  if (bgImage && bgImage.href) {
    const imgTag = document.createElementNS(svgNS, 'image');
    imgTag.id = 'bgImage';
    imgTag.setAttribute('width', bgImage.width);
    imgTag.setAttribute('height', bgImage.height);
    imgTag.setAttribute('href', bgImage.href);
    canvas.appendChild(imgTag);
  }
  
  // Re-draw regions for the current level
  getActiveRegions().forEach(r => {
    createRegionElement(r);
    attachRegionEvents(r);
  });
  
  updateRegionList();
  updateBreadcrumbs();
}

// --- TOOLS & MODES ---
polyBtn.onclick = () => setMode('polygon');
bezierBtn.onclick = () => setMode('bezier');
selectBtn.onclick = () => setMode('select');
handBtn.onclick = () => setMode('hand');
wandBtn.onclick = () => setMode('wand');

function setMode(m) {
  mode = m;
  document.querySelectorAll('.modeBtn').forEach(b => b.classList.remove('active'));
  document.getElementById(m + 'Btn')?.classList.add('active');
  deselect();
}

// --- CORE LOGIC (REFACTORED FOR HIERARCHY) ---
function snapshotState() {
  const state = { 
    currentLevel, 
    drillPath, 
    bg: bgImage, 
    viewBox,
    hierarchy: [] 
  };
  hierarchy.forEach((map, parentId) => {
    const regionsArray = [];
    map.forEach(r => {
      regionsArray.push({
        id: r.id,
        points: JSON.parse(JSON.stringify(r.points)),
        color: r.color,
        opacity: r.opacity,
        field: r.field || ''
      });
    });
    state.hierarchy.push({ parentId, regions: regionsArray });
  });
  return state;
}

function restoreState(obj) {
  hierarchy.clear();
  obj.hierarchy.forEach(h => {
    const map = new Map();
    h.regions.forEach(r => map.set(r.id, r));
    hierarchy.set(h.parentId, map);
  });
  currentLevel = obj.currentLevel || 'root';
  drillPath = obj.drillPath || [{ id: 'root', name: 'Project Root' }];
  if (obj.bg) loadBackgroundFromData(obj.bg.href, obj.bg.width, obj.bg.height);
  renderLevel();
}

function capture() { UndoRedo.capture(snapshotState()); }

// --- MOUSE EVENTS ---
canvas.addEventListener('mousedown', ev => {
  if (mode === 'wand') {
    const raw = clientToSvg(ev);
    autoTrace(Math.round(raw.x), Math.round(raw.y));
    return;
  }
  if (mode === 'hand' || ev.button === 1) {
    isPanning = true;
    panStart = { x: ev.clientX, y: ev.clientY };
    return;
  }
  if (ev.target.classList.contains('handle')) return;
  
  const pt = clientToSvg(ev);
  const snapped = getSnappedPoint(pt.x, pt.y);

  if (mode === 'polygon' || mode === 'bezier') {
    if (!drawing) { startRegion(snapped.x, snapped.y); addPoint(snapped.x, snapped.y); }
    else addPoint(snapped.x, snapped.y);
  } else if (mode === 'select') {
    const id = ev.target.id;
    if (getActiveRegions().has(id)) selectRegion(getActiveRegions().get(id));
    else deselect();
  }
});
uploadImage.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      // Set the global bgImage object
      bgImage = { href: event.target.result, width: img.width, height: img.height };
      viewBox = { x: 0, y: 0, w: img.width, h: img.height };
      updateViewBox();
      renderLevel(); // This will now draw the image
      capture();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
};
canvas.addEventListener('mousemove', ev => {
  if (isPanning) {
    const dx = (ev.clientX - panStart.x) * (viewBox.w / canvas.clientWidth);
    const dy = (ev.clientY - panStart.y) * (viewBox.h / canvas.clientHeight);
    viewBox.x -= dx; viewBox.y -= dy;
    panStart = { x: ev.clientX, y: ev.clientY };
    updateViewBox();
    return;
  }
  const pt = clientToSvg(ev);
  if (drawing) {
    const snapped = getSnappedPoint(pt.x, pt.y);
    updateTempLine(snapped.x, snapped.y);
    showTempCursor(snapped.x, snapped.y);
  }
  if (selected && !drawing) showEdgePreview(findClosestEdge(selected, pt.x, pt.y));
});

canvas.addEventListener('dblclick', () => { if (drawing) finalizeRegion(); });

// --- REGION MANAGEMENT ---
function startRegion(x, y) {
  const id = generateId();
  current = {
    id, points: [{ x: Math.round(x), y: Math.round(y), curve: false }],
    field: '', element: null, color: defaultColorInput.value,
    opacity: parseFloat(defaultOpacityInput.value)
  };
  createRegionElement(current);
  drawing = true;
}

function addPoint(x, y) {
  current.points.push({ x: Math.round(x), y: Math.round(y), curve: false });
  updateRegionElement(current);
}

function finalizeRegion() {
  if (current.points.length < 3) { cancelCurrent(); return; }
  getActiveRegions().set(current.id, current);
  attachRegionEvents(current);
  current = null; drawing = false;
  removeTempLine(); removeTempCursor();
  updateRegionList(); capture();
}

function cancelCurrent() {
  if (current?.element) current.element.remove();
  current = null; drawing = false; removeTempLine(); removeTempCursor();
}

function createRegionElement(region) {
  const el = document.createElementNS(svgNS, 'polygon');
  el.id = region.id;
  canvas.appendChild(el);
  region.element = el;
  updateRegionElement(region);
}

function updateRegionElement(region) {
  const pts = region.points;
  const isPath = pts.some(p => p.curve);
  if (isPath && region.element.tagName !== 'path') {
    const newEl = document.createElementNS(svgNS, 'path');
    region.element.replaceWith(newEl);
    region.element = newEl;
  }
  region.element.setAttribute('id', region.id);
  region.element.setAttribute('fill', region.color);
  region.element.setAttribute('fill-opacity', region.opacity);
  region.element.setAttribute('stroke', 'black');
  region.element.setAttribute('stroke-width', '1.5');
  
  if (isPath) {
    region.element.setAttribute('d', createPathD(region));
  } else {
    region.element.setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '));
  }
}

// --- EXPORT LOGIC ---
exportPowerBI.onclick = () => {
  const isHeatmap = document.getElementById('heatmapExportChk').checked;
  const allItems = [];
  
  hierarchy.forEach((map, parentId) => {
    const levelIdx = drillPath.findIndex(p => p.id === parentId) + 1;
    map.forEach(r => {
      allItems.push({
        id: r.id,
        tag: r.points.some(p => p.curve) ? 'path' : 'polygon',
        attr: {
          points: r.points.map(p => `${p.x},${p.y}`).join(' '),
          d: createPathD(r),
          fill: isHeatmap ? 'transparent' : r.color,
          'fill-opacity': r.opacity,
          'data-field': r.field || '',
          'data-parent': parentId === 'root' ? '' : parentId,
          'data-level': levelIdx
        }
      });
    });
  });

  const svgStr = buildCleanSVGFragment(allItems, viewBox.w, viewBox.h, bgImage);
  downloadSVG(svgStr, 'mgss_v6_drilldown.svg');
};

document.getElementById('exportCSV').onclick = () => {
  let csv = "Level,Parent ID,Area ID,Field Name\n";
  hierarchy.forEach((map, parentId) => {
    const levelIdx = drillPath.findIndex(p => p.id === parentId) + 1;
    map.forEach(r => {
      csv += `"${levelIdx}","${parentId}","${r.id}","${r.field || ''}"\n`;
    });
  });
  const blob = new Blob([csv], {type: 'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'hierarchy_mapping.csv';
  a.click();
};

// --- HELPER FUNCTIONS ---
function generateId() {
  let id; do { id = `Area_${regionCounter++}` } while (document.getElementById(id));
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
}

function deselect() {
  if (selected) {
    selected.element.classList.remove('selected');
    removeHandles();
  }
  selected = null;
}

function deleteRegion(id) {
  const r = getActiveRegions().get(id);
  if (!r) return;
  r.element.remove();
  getActiveRegions().delete(id);
  deselect();
  updateRegionList();
  capture();
}

function clientToSvg(ev) {
  const pt = canvas.createSVGPoint();
  pt.x = ev.clientX; pt.y = ev.clientY;
  const svgPt = pt.matrixTransform(canvas.getScreenCTM().inverse());
  return { x: svgPt.x, y: svgPt.y };
}

function updateViewBox() {
  canvas.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
}

function createPathD(r) {
  const pts = r.points;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.curve && p.cx != null) d += ` Q ${p.cx} ${p.cy} ${p.x} ${p.y}`;
    else d += ` L ${p.x} ${p.y}`;
  }
  return d + ' Z';
}

function updateRegionList() {
  regionList.innerHTML = '';
  getActiveRegions().forEach(r => {
    const li = document.createElement('li');
    li.textContent = r.id;
    li.onclick = () => selectRegion(r);
    regionList.appendChild(li);
  });
}

// --- INITIALIZATION ---
document.getElementById('drillInBtn').onclick = () => { if (selected) drillIn(selected); };
document.addEventListener('mouseup', () => { isPanning = false; });
document.getElementById('fitBtn').onclick = () => {
  if (bgImage) { viewBox = { x:0, y:0, w: bgImage.width, h: bgImage.height }; updateViewBox(); }
};

// Load Background Helper
function loadBackgroundFromData(href, imgW, imgH) {
  const old = canvas.querySelector('#bgImage');
  if (old) old.remove();
  canvas.setAttribute('viewBox', `0 0 ${imgW} ${imgH}`);
  const imgTag = document.createElementNS(svgNS, 'image');
  imgTag.id = 'bgImage';
  imgTag.setAttribute('width', imgW);
  imgTag.setAttribute('height', imgH);
  imgTag.setAttribute('href', href);
  canvas.prepend(imgTag);
  bgImage = { href, width: imgW, height: imgH };
  viewBox = { x: 0, y: 0, w: imgW, h: imgH };
}

// Remaining helper stubs (temp lines, handles, etc) same as V5 logic
function removeTempLine() { tempLine?.remove(); tempLine = null; }
function removeTempCursor() { tempCursor?.remove(); tempCursor = null; }
function updateTempLine(x,y) { /* implementation same as v5 */ }
function showTempCursor(x,y) { /* implementation same as v5 */ }
function createHandles(r) { /* implementation same as v5 */ }
function removeHandles() { handles.forEach(h => h.remove()); handles = []; }
function getSnappedPoint(x, y) { /* implementation same as v5 using getActiveRegions() */ return {x,y}; }
function distance(x1,y1,x2,y2) { return Math.hypot(x2-x1, y2-y1); }
function downloadSVG(str, name) {
  const blob = new Blob([str], {type:'image/svg+xml'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}
