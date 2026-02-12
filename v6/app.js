/**
 * MGSS Studio v6 - Full Consolidated Code
 * Features: Hierarchical Drill-Down, Undo/Redo, SVG Interaction, Panning/Zooming
 */

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

// --- HIERARCHY STATE ---
let currentLevel = 'root'; 
let drillPath = [{ id: 'root', name: 'Project Root' }];
const hierarchy = new Map(); 
hierarchy.set('root', new Map()); 

function getActiveRegions() {
  if (!hierarchy.has(currentLevel)) hierarchy.set(currentLevel, new Map());
  return hierarchy.get(currentLevel);
}

// --- STATE VARIABLES ---
let viewBox = { x: 0, y: 0, w: 1000, h: 1000 };
let isPanning = false;
let panStart = { x: 0, y: 0 };
let mode = 'polygon';
let drawing = false;
let current = null;
let regionCounter = 1;
let selected = null;
let tempLine = null, bgImage = null;

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
  renderLevel();
  capture();
}

function drillUpTo(index) {
  drillPath = drillPath.slice(0, index + 1);
  currentLevel = drillPath[index].id;
  renderLevel();
  capture();
}

function renderLevel() {
  canvas.innerHTML = '';
  // Restore Background Image
  if (bgImage && bgImage.href) {
    const imgTag = document.createElementNS(svgNS, 'image');
    imgTag.id = 'bgImage';
    imgTag.setAttribute('width', bgImage.width);
    imgTag.setAttribute('height', bgImage.height);
    imgTag.setAttribute('href', bgImage.href);
    canvas.appendChild(imgTag);
  }
  // Restore Regions for this level
  getActiveRegions().forEach(r => {
    createRegionElement(r);
    attachRegionEvents(r);
  });
  updateRegionList();
  updateBreadcrumbs();
  deselect();
}

// --- UNDO / REDO / SNAPSHOT ---
function snapshotState() {
  const state = { 
    currentLevel, 
    drillPath: [...drillPath], 
    bg: bgImage, 
    viewBox: { ...viewBox },
    hierarchy: [] 
  };
  hierarchy.forEach((map, parentId) => {
    const regionsArray = Array.from(map.values()).map(r => ({
      id: r.id, points: JSON.parse(JSON.stringify(r.points)),
      color: r.color, opacity: r.opacity, field: r.field || ''
    }));
    state.hierarchy.push({ parentId, regions: regionsArray });
  });
  return state;
}

function restoreState(obj) {
  if (!obj) return;
  hierarchy.clear();
  obj.hierarchy.forEach(h => {
    const map = new Map();
    h.regions.forEach(r => map.set(r.id, r));
    hierarchy.set(h.parentId, map);
  });
  currentLevel = obj.currentLevel;
  drillPath = obj.drillPath;
  bgImage = obj.bg;
  viewBox = obj.viewBox;
  updateViewBox();
  renderLevel();
}

function capture() { UndoRedo.capture(snapshotState()); }

// --- KEYBOARD SHORTCUTS ---
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    if (drawing) cancelCurrent();
    else deselect();
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key === 'z') {
    ev.preventDefault();
    const s = UndoRedo.undo(); if(s) restoreState(s);
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key === 'y') {
    ev.preventDefault();
    const s = UndoRedo.redo(); if(s) restoreState(s);
  }
});

undoBtn.onclick = () => { const s = UndoRedo.undo(); if(s) restoreState(s); };
redoBtn.onclick = () => { const s = UndoRedo.redo(); if(s) restoreState(s); };

// --- MOUSE & CANVAS INTERACTION ---
canvas.addEventListener('mousedown', ev => {
  if (mode === 'hand' || ev.button === 1) { 
    isPanning = true; 
    panStart = { x: ev.clientX, y: ev.clientY }; 
    return; 
  }
  const pt = clientToSvg(ev);
  if (mode === 'polygon' || mode === 'bezier') {
    if (!drawing) startRegion(pt.x, pt.y);
    addPoint(pt.x, pt.y);
  } else if (mode === 'select') {
    const id = ev.target.id;
    if (getActiveRegions().has(id)) selectRegion(getActiveRegions().get(id));
    else deselect();
  }
});

canvas.addEventListener('mousemove', ev => {
  if (isPanning) {
    const dx = (ev.clientX - panStart.x) * (viewBox.w / canvas.clientWidth);
    const dy = (ev.clientY - panStart.y) * (viewBox.h / canvas.clientHeight);
    viewBox.x -= dx; viewBox.y -= dy;
    panStart = { x: ev.clientX, y: ev.clientY };
    updateViewBox();
    return;
  }
  if (drawing) {
    const pt = clientToSvg(ev);
    updateTempLine(pt.x, pt.y);
  }
});

canvas.addEventListener('dblclick', () => { if (drawing) finalizeRegion(); });

// --- REGION MANAGEMENT ---
function startRegion(x, y) {
  const id = `Area_${regionCounter++}`;
  current = { 
    id, 
    points: [], 
    color: defaultColorInput.value, 
    opacity: parseFloat(defaultOpacityInput.value), 
    field: '' 
  };
  createRegionElement(current);
  drawing = true;
}

function addPoint(x, y) {
  current.points.push({ x: Math.round(x), y: Math.round(y), curve: mode === 'bezier' });
  updateRegionElement(current);
}

function finalizeRegion() {
  if (current.points.length < 3) { cancelCurrent(); return; }
  getActiveRegions().set(current.id, current);
  attachRegionEvents(current);
  current = null; drawing = false;
  removeTempLine();
  updateRegionList(); 
  capture();
}

function cancelCurrent() { 
  if (current?.element) current.element.remove(); 
  current = null; drawing = false; removeTempLine(); 
}

function createRegionElement(r) {
  const el = document.createElementNS(svgNS, 'polygon');
  el.id = r.id;
  canvas.appendChild(el);
  r.element = el;
  updateRegionElement(r);
}

function updateRegionElement(r) {
  const isPath = r.points.some(p => p.curve);
  if (isPath && r.element.tagName !== 'path') {
    const newEl = document.createElementNS(svgNS, 'path');
    r.element.replaceWith(newEl);
    r.element = newEl;
  }
  r.element.setAttribute('fill', r.color);
  r.element.setAttribute('fill-opacity', r.opacity);
  r.element.setAttribute('stroke', 'black');
  r.element.setAttribute('stroke-width', '1.5');
  if (isPath) r.element.setAttribute('d', createPathD(r));
  else r.element.setAttribute('points', r.points.map(p => `${p.x},${p.y}`).join(' '));
}

function attachRegionEvents(r) {
  r.element.onclick = (e) => { 
    if(mode === 'select') { e.stopPropagation(); selectRegion(r); }
  };
}

// --- PROPERTY PANEL UPDATE ---
function selectRegion(r) {
  deselect();
  selected = r;
  r.element.classList.add('selected');
  regionIDInput.value = r.id;
  regionFieldInput.value = r.field || '';
  fillColorInput.value = r.color;
  fillOpacityInput.value = r.opacity;
}

function deselect() {
  if (selected) selected.element.classList.remove('selected');
  selected = null;
}

// --- HELPERS ---
function clientToSvg(ev) {
  const pt = canvas.createSVGPoint();
  pt.x = ev.clientX; pt.y = ev.clientY;
  return pt.matrixTransform(canvas.getScreenCTM().inverse());
}

function updateViewBox() {
  canvas.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
}

function createPathD(r) {
  if (r.points.length === 0) return '';
  let d = `M ${r.points[0].x} ${r.points[0].y}`;
  for (let i = 1; i < r.points.length; i++) {
    d += ` L ${r.points[i].x} ${r.points[i].y}`;
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

function updateTempLine(x, y) {
  if (current.points.length === 0) return;
  if (!tempLine) {
    tempLine = document.createElementNS(svgNS, 'line');
    tempLine.setAttribute('stroke', 'red');
    tempLine.setAttribute('stroke-dasharray', '4');
    canvas.appendChild(tempLine);
  }
  const last = current.points[current.points.length - 1];
  tempLine.setAttribute('x1', last.x); tempLine.setAttribute('y1', last.y);
  tempLine.setAttribute('x2', x); tempLine.setAttribute('y2', y);
}

function removeTempLine() { 
  if (tempLine) { tempLine.remove(); tempLine = null; } 
}

// --- TOOLBAR CLICKS ---
polyBtn.onclick = () => { mode = 'polygon'; setActiveBtn(polyBtn); };
bezierBtn.onclick = () => { mode = 'bezier'; setActiveBtn(bezierBtn); };
selectBtn.onclick = () => { mode = 'select'; setActiveBtn(selectBtn); };
handBtn.onclick = () => { mode = 'hand'; setActiveBtn(handBtn); };

function setActiveBtn(btn) {
  document.querySelectorAll('.modeBtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// --- IMAGE UPLOAD ---
uploadImage.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      bgImage = { href: ev.target.result, width: img.width, height: img.height };
      viewBox = { x: 0, y: 0, w: img.width, h: img.height };
      updateViewBox();
      renderLevel();
      capture();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
};

// --- PROPERTY CHANGE LISTENERS ---
regionIDInput.onchange = () => {
  if (!selected) return;
  const oldId = selected.id;
  const newId = regionIDInput.value;
  if (getActiveRegions().has(newId)) { alert("ID already exists"); return; }
  getActiveRegions().delete(oldId);
  selected.id = newId;
  selected.element.id = newId;
  getActiveRegions().set(newId, selected);
  updateRegionList();
  capture();
};

regionFieldInput.onchange = () => {
  if (selected) { selected.field = regionFieldInput.value; capture(); }
};

fillColorInput.onchange = () => {
  if (selected) { selected.color = fillColorInput.value; updateRegionElement(selected); capture(); }
};

fillOpacityInput.oninput = () => {
  if (selected) { selected.opacity = parseFloat(fillOpacityInput.value); updateRegionElement(selected); }
};
fillOpacityInput.onchange = () => capture();

// --- DRILL DOWN TRIGGER ---
document.getElementById('drillInBtn').onclick = () => { 
  if (selected) drillIn(selected); 
  else alert("Please select a region first");
};

// --- INITIALIZE ---
document.addEventListener('mouseup', () => { isPanning = false; });
updateViewBox();
updateBreadcrumbs();
capture(); // Initial state capture
