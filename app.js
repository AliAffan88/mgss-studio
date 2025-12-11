// app.js - MGSS Studio v3 main
// Depends on undoRedo.js, projectIO.js, svgExport.js

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
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const autosaveCheckbox = document.getElementById('autosave');
const themeToggle = document.getElementById('themeToggle');

let mode = 'polygon';
let drawing = false;
let current = null; // region under creation
let regionCounter = 1;
const regions = new Map(); // id -> region object {id, points[], element, color, opacity}
let selected = null;
let tempLine = null, tempCursor = null, edgePreviewDot = null, bgImage = null;
let handles = [];
let draggingHandle = null;
let dragOffset = [0,0];

// theme
(function initTheme(){
  const saved = localStorage.getItem('mgss_theme') || 'light';
  if(saved === 'dark') document.documentElement.setAttribute('data-theme','dark');
})();
themeToggle.onclick = () => {
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('mgss_theme', next);
};

// wire mode buttons
polyBtn.onclick = ()=> setMode('polygon');
bezierBtn.onclick = ()=> setMode('bezier');
selectBtn.onclick = ()=> setMode('select');

function setMode(m) {
  mode = m;
  document.querySelectorAll('.modeBtn').forEach(b=>b.classList.remove('active'));
  if(m === 'polygon') polyBtn.classList.add('active');
  if(m === 'bezier') bezierBtn.classList.add('active');
  if(m === 'select') selectBtn.classList.add('active');
  deselect();
}

// helper: serialize scene for undo stack and save
function snapshotState() {
  const obj = { regions: [], bg: null, canvas: {w: canvas.clientWidth, h: canvas.clientHeight} };
  if(bgImage) obj.bg = { href: bgImage.href, width: bgImage.width, height: bgImage.height };
  regions.forEach(r => {
    obj.regions.push({
      id: r.id,
      points: r.points.map(p => ({x:p.x,y:p.y,curve:p.curve?true:false, cx:p.cx||null, cy:p.cy||null})),
      color: r.color,
      opacity: r.opacity
    });
  });
  return obj;
}
function restoreState(obj) {
  clearAllRegions();
  if(obj.bg) {
    loadBackgroundFromData(obj.bg.href, obj.bg.width, obj.bg.height, false);
  }
  if(obj.regions) {
    obj.regions.forEach(rr => {
      const id = rr.id;
      const r = { id, points: rr.points.map(p=>({x:p.x,y:p.y,curve:!!p.curve, cx:p.cx||null, cy:p.cy||null})), color: rr.color || defaultColorInput.value, opacity: (rr.opacity==null)?parseFloat(defaultOpacityInput.value):rr.opacity };
      createRegionElement(r);
      regions.set(id, r);
    });
  }
  updateRegionList();
}

// Initial undo capture
UndoRedo.onChangeSet(status=>{
  // optional UI update: status.size / status.index
});
function capture() { UndoRedo.capture(snapshotState()); }

// ========== Background image handling ===========
uploadImage.addEventListener('change', (ev) => {
  const file = ev.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const href = e.target.result;
    loadBackgroundFromData(href, canvas.clientWidth, canvas.clientHeight, true);
    capture();
  };
  reader.readAsDataURL(file);
});

function loadBackgroundFromData(href, w, h, store){
  // remove existing
  const existing = canvas.querySelector('#bgImage');
  if(existing) existing.remove();
  const img = document.createElementNS(svgNS,'image');
  img.setAttribute('id','bgImage');
  img.setAttribute('href', href);
  img.setAttribute('x','0'); img.setAttribute('y','0');
  img.setAttribute('width', w); img.setAttribute('height', h);
  img.setAttribute('preserveAspectRatio','xMinYMin meet');
  canvas.insertBefore(img, canvas.firstChild);
  bgImage = { href, width:w, height:h };
  if(store) { /* store if needed */ }
}

// ========== Drawing engine ==========

canvas.addEventListener('mousedown', (ev) => {
  if(ev.target.classList && ev.target.classList.contains('handle')) return;
  const {x,y} = clientToSvg(ev);
  if(mode === 'polygon' || mode === 'bezier') {
    if(!drawing) startRegion(x,y);
    else addPoint(x,y, false);
  } else if(mode === 'select') {
    if(ev.target.tagName === 'polygon' || ev.target.tagName === 'path') {
      const id = ev.target.id;
      if(regions.has(id)) selectRegion(regions.get(id));
    } else {
      deselect();
    }
  }
});

canvas.addEventListener('mousemove', (ev) => {
  const {x,y} = clientToSvg(ev);
  if(drawing) {
    updateTempLine(x,y);
    showTempCursor(x,y);
  }
  // edge hover preview
  if(selected && !drawing) {
    const near = findClosestEdge(selected, x, y);
    showEdgePreview(near);
  }
  if(draggingHandle && selected) {
    const idx = parseInt(draggingHandle.getAttribute('data-idx'),10);
    const nx = x - dragOffset[0], ny = y - dragOffset[1];
    selected.points[idx].x = Math.round(nx); selected.points[idx].y = Math.round(ny);
    updateRegionElement(selected);
    recreateHandles(selected);
  }
});

canvas.addEventListener('mouseup', (ev) => {
  if(drawing && current) {
    // detect whether mouse was dragged for curve: if last mouse down point differs
    // handled by storing mousedown coords via current._md if implemented
  }
});

canvas.addEventListener('dblclick', (ev) => { if(drawing) finalizeRegion(); });

document.addEventListener('keydown', (ev) => {
  if(ev.key === 'Escape' || ev.key === 'Backspace') {
    if(drawing) {
      if(current.points.length > 0) {
        current.points.pop();
        if(current.points.length === 0) cancelCurrent();
        else updateRegionElement(current);
      }
      removeTempLine(); removeTempCursor();
      ev.preventDefault();
    } else {
      deselect();
    }
  } else if(ev.key === 'Enter') {
    if(drawing) finalizeRegion();
  } else if((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
    const s = UndoRedo.undo();
    if(s) restoreState(s);
  } else if((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') {
    const s = UndoRedo.redo();
    if(s) restoreState(s);
  } else if(ev.key === 'Delete') {
    if(selected) deleteRegion(selected.id);
  }
});

// helpers
function clientToSvg(ev) {
  const rect = canvas.getBoundingClientRect();
  return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
}

function startRegion(x,y) {
  const id = generateId();
  current = { id, points: [{x:Math.round(x), y:Math.round(y), curve:false}], element:null, color: defaultColorInput.value, opacity: parseFloat(defaultOpacityInput.value) };
  createRegionElement(current);
  drawing = true;
  showTempCursor(x,y);
}

function addPoint(x,y, curve=false, cx=null, cy=null) {
  if(!current) return;
  const p = { x: Math.round(x), y: Math.round(y), curve: !!curve };
  if(curve && cx!=null && cy!=null){ p.cx = Math.round(cx); p.cy = Math.round(cy); }
  current.points.push(p);
  updateRegionElement(current);
}

function updateTempLine(x,y) {
  if(!current) return;
  const pts = current.points;
  if(pts.length === 0) return;
  if(!tempLine) {
    tempLine = document.createElementNS(svgNS,'line');
    tempLine.setAttribute('stroke','blue');
    tempLine.setAttribute('stroke-dasharray','4,4');
    tempLine.setAttribute('pointer-events','none');
    canvas.appendChild(tempLine);
  }
  const last = pts[pts.length-1];
  tempLine.setAttribute('x1', last.x); tempLine.setAttribute('y1', last.y);
  tempLine.setAttribute('x2', x); tempLine.setAttribute('y2', y);
}

function removeTempLine(){ if(tempLine && tempLine.parentNode) tempLine.parentNode.removeChild(tempLine); tempLine=null; }
function showTempCursor(x,y) {
  if(!tempCursor) { tempCursor = document.createElementNS(svgNS,'circle'); tempCursor.setAttribute('r',4); tempCursor.setAttribute('fill','#007acc'); tempCursor.setAttribute('pointer-events','none'); canvas.appendChild(tempCursor); }
  tempCursor.setAttribute('cx', x); tempCursor.setAttribute('cy', y);
}
function removeTempCursor(){ if(tempCursor && tempCursor.parentNode) tempCursor.parentNode.removeChild(tempCursor); tempCursor=null; }

function finalizeRegion() {
  if(!current) return;
  if(current.points.length < 3) { cancelCurrent(); return; }
  // if any curved points exist -> path, else polygon
  regions.set(current.id, current);
  attachRegionEvents(current);
  // reset
  current = null; drawing = false;
  removeTempLine(); removeTempCursor();
  updateRegionList();
  capture(); // undo snapshot
}

// cancel region creation
function cancelCurrent() {
  if(current && current.element && current.element.parentNode) current.element.parentNode.removeChild(current.element);
  current = null; drawing = false; removeTempLine(); removeTempCursor();
}

// create SVG element (polygon or path placeholder)
function createRegionElement(region) {
  // default create polygon; updateRegionElement will switch to path if curves present
  const poly = document.createElementNS(svgNS,'polygon');
  poly.setAttribute('id', region.id);
  poly.setAttribute('fill', region.color || defaultColorInput.value);
  poly.setAttribute('fill-opacity', region.opacity != null ? region.opacity : defaultOpacityInput.value);
  poly.setAttribute('stroke','black');
  poly.setAttribute('stroke-width','1.5');
  canvas.appendChild(poly);
  region.element = poly;
  updateRegionElement(region);
}

// update element depending on curved points
function updateRegionElement(region) {
  const pts = region.points;
  if(!region.element) createRegionElement(region);
  const anyCurve = pts.some(p => p.curve);
  if(anyCurve) {
    // ensure path element
    if(region.element.tagName !== 'path') {
      const newEl = document.createElementNS(svgNS,'path');
      if(region.element.parentNode) canvas.replaceChild(newEl, region.element);
      region.element = newEl;
    }
    // build d with M L and Q segments (using control points stored on the destination point)
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for(let i=1;i<pts.length;i++) {
      const p = pts[i];
      if(p.curve && p.cx!=null && p.cy!=null) d += ` Q ${p.cx} ${p.cy} ${p.x} ${p.y}`;
      else d += ` L ${p.x} ${p.y}`;
    }
    d += ' Z';
    region.element.setAttribute('d', d);
  } else {
    // ensure polygon element
    if(region.element.tagName !== 'polygon') {
      const newEl = document.createElementNS(svgNS,'polygon');
      if(region.element.parentNode) canvas.replaceChild(newEl, region.element);
      region.element = newEl;
    }
    const ptsAttr = pts.map(p=>`${p.x},${p.y}`).join(' ');
    region.element.setAttribute('points', ptsAttr);
  }
  // styling
  region.element.setAttribute('fill', region.color || defaultColorInput.value);
  region.element.setAttribute('fill-opacity', region.opacity != null ? region.opacity : defaultOpacityInput.value);
  region.element.setAttribute('stroke','black');
  region.element.setAttribute('stroke-width','1.5');
}

// generate new ID
function generateId() {
  let id;
  do { id = `Area_${regionCounter++}`; } while (document.getElementById(id));
  return id;
}

// attach click handler
function attachRegionEvents(region) {
  if(region.element) {
    region.element.addEventListener('click', (ev) => {
      if(mode === 'select') { ev.stopPropagation(); selectRegion(region); }
    });
  }
}

// list UI
function updateRegionList(){
  regionList.innerHTML = '';
  regions.forEach((r,id) => {
    const li = document.createElement('li');
    const span = document.createElement('span'); span.textContent = id; span.style.flex='1';
    li.appendChild(span);
    li.addEventListener('click',()=>selectRegion(r));
    const renameBtn = document.createElement('button'); renameBtn.textContent='Rename'; renameBtn.className='small-btn';
    renameBtn.addEventListener('click', (ev)=>{ ev.stopPropagation(); renameRegionPrompt(r); });
    const delBtn = document.createElement('button'); delBtn.textContent='Delete'; delBtn.className='small-btn';
    delBtn.addEventListener('click', (ev)=>{ ev.stopPropagation(); deleteRegion(r.id); });
    li.appendChild(renameBtn); li.appendChild(delBtn);
    regionList.appendChild(li);
  });
}

// rename prompt
function renameRegionPrompt(r) {
  const nn = prompt('Region ID', r.id);
  if(!nn) return;
  const trimmed = nn.trim();
  if(trimmed === r.id) return;
  if(document.getElementById(trimmed)) { alert('ID exists'); return; }
  // transfer
  regions.delete(r.id);
  r.id = trimmed;
  if(r.element) r.element.id = trimmed;
  regions.set(r.id, r);
  if(selected === r) regionIDInput.value = r.id;
  updateRegionList(); capture();
}

// select / deselect
function selectRegion(r) {
  deselect();
  selected = r;
  r.element.classList.add('selected');
  regionIDInput.value = r.id;
  fillColorInput.value = r.color || defaultColorInput.value;
  fillOpacityInput.value = r.opacity != null ? r.opacity : defaultOpacityInput.value;
  createHandles(r);
}

function deselect() {
  if(selected) {
    selected.element.classList.remove('selected');
    removeHandles();
  }
  selected = null;
  regionIDInput.value=''; fillColorInput.value='#000000'; fillOpacityInput.value=0;
}

regionIDInput.addEventListener('change', ()=> {
  if(!selected) return;
  const newId = regionIDInput.value.trim(); if(!newId) { regionIDInput.value = selected.id; return; }
  if(newId === selected.id) return;
  if(document.getElementById(newId)) { alert('ID exists'); regionIDInput.value = selected.id; return; }
  regions.delete(selected.id);
  selected.id = newId;
  selected.element.id = newId;
  regions.set(selected.id, selected);
  updateRegionList(); capture();
});

fillColorInput.addEventListener('input', ()=> {
  if(!selected) return;
  selected.color = fillColorInput.value;
  updateRegionElement(selected); capture();
});
fillOpacityInput.addEventListener('input', ()=> {
  if(!selected) return;
  selected.opacity = parseFloat(fillOpacityInput.value);
  updateRegionElement(selected); capture();
});

// create handles
function createHandles(r) {
  removeHandles();
  r.points.forEach((p, idx) => {
    const g = document.createElementNS(svgNS,'g'); g.classList.add('handle'); g.setAttribute('data-idx', idx);
    g.setAttribute('transform', `translate(${p.x},${p.y})`);
    const circ = document.createElementNS(svgNS,'circle'); circ.setAttribute('r',6); circ.setAttribute('cx',0); circ.setAttribute('cy',0);
    g.appendChild(circ);
    g.addEventListener('mousedown', (ev)=> {
      ev.stopPropagation();
      draggingHandle = g;
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      const tr = g.getAttribute('transform'); const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(tr);
      const hx = m?parseFloat(m[1]):0, hy = m?parseFloat(m[2]):0;
      dragOffset = [mx - hx, my - hy];
      window.addEventListener('mousemove', handleDragging);
      window.addEventListener('mouseup', stopDraggingHandle);
    });
    g.addEventListener('contextmenu', (ev)=>{ ev.preventDefault(); const i = parseInt(g.getAttribute('data-idx'),10); removeVertex(r, i); });
    canvas.appendChild(g); handles.push(g);
  });
  bringHandlesToFront();
}

function handleDragging(ev) {
  if(!draggingHandle || !selected) return;
  const rect = canvas.getBoundingClientRect(); const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
  const nx = mx - dragOffset[0], ny = my - dragOffset[1];
  draggingHandle.setAttribute('transform', `translate(${nx},${ny})`);
  const idx = parseInt(draggingHandle.getAttribute('data-idx'),10);
  selected.points[idx].x = Math.round(nx); selected.points[idx].y = Math.round(ny);
  updateRegionElement(selected);
  recreateHandles(selected);
}

function stopDraggingHandle() { window.removeEventListener('mousemove', handleDragging); window.removeEventListener('mouseup', stopDraggingHandle); draggingHandle=null; updateRegionList(); capture(); }

function removeHandles() { handles.forEach(h=>{ if(h.parentNode) h.parentNode.removeChild(h); }); handles = []; }
function recreateHandles(r) { removeHandles(); createHandles(r); }
function bringHandlesToFront() { handles.forEach(h => canvas.appendChild(h)); }

function removeVertex(r, index) {
  if(r.points.length <= 3) {
    if(confirm('Removing this vertex will leave fewer than 3 points. Delete region?')) deleteRegion(r.id);
    return;
  }
  r.points.splice(index,1); updateRegionElement(r); recreateHandles(r); updateRegionList(); capture();
}

// edge preview & insert
function findClosestEdge(r, x, y) {
  const pts = r.points;
  let best = { dist: Infinity, idx: -1, x:0, y:0 };
  for(let i=0;i<pts.length;i++){
    const a = pts[i], b = pts[(i+1)%pts.length];
    const proj = projectPointToSegment([x,y],[a.x,a.y],[b.x,b.y]);
    if(proj.dist < best.dist) best = { dist: proj.dist, idx: i+1, x: proj.x, y: proj.y };
  }
  return best;
}

function showEdgePreview(info) {
  if(!info || info.dist === Infinity) return;
  if(info.dist > 24) { if(edgePreviewDot){edgePreviewDot.remove(); edgePreviewDot=null;} return; }
  if(!edgePreviewDot) {
    edgePreviewDot = document.createElementNS(svgNS,'circle');
    edgePreviewDot.setAttribute('r',5); edgePreviewDot.setAttribute('fill','#ff9900'); edgePreviewDot.setAttribute('pointer-events','none');
    canvas.appendChild(edgePreviewDot);
  }
  edgePreviewDot.setAttribute('cx', info.x); edgePreviewDot.setAttribute('cy', info.y);
}

function insertVertexAt(r, x, y) {
  const info = findClosestEdge(r, x, y);
  if(info.dist < 24) {
    r.points.splice(info.idx, 0, {x:Math.round(info.x), y:Math.round(info.y), curve:false});
    updateRegionElement(r); recreateHandles(r); updateRegionList(); capture();
  }
}

// projection util
function projectPointToSegment(p, a, b) {
  const px=p[0], py=p[1], ax=a[0], ay=a[1], bx=b[0], by=b[1];
  const l2 = (bx-ax)*(bx-ax) + (by-ay)*(by-ay);
  if(l2 === 0) return {x:ax,y:ay,dist: Math.hypot(px-ax,py-ay)};
  let t = ((px-ax)*(bx-ax) + (py-ay)*(by-ay)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projx = ax + t*(bx-ax), projy = ay + t*(by-ay);
  return { x: projx, y: projy, dist: Math.hypot(px-projx, py-projy) };
}

// insert on Shift+click
canvas.addEventListener('click', (ev) => {
  if(ev.shiftKey && selected) {
    const {x,y} = clientToSvg(ev);
    insertVertexAt(selected, x, y);
  }
});

// delete region
function deleteRegion(id) {
  const r = regions.get(id);
  if(!r) return;
  if(r.element && r.element.parentNode) r.element.parentNode.removeChild(r.element);
  regions.delete(id);
  if(selected && selected.id === id){ removeHandles(); selected=null; }
  updateRegionList(); capture();
}

// clear all regions
function clearAllRegions(){
  regions.forEach(r=>{ if(r.element && r.element.parentNode) r.element.parentNode.removeChild(r.element); });
  regions.clear(); removeHandles(); selected=null; updateRegionList();
}

// export functions
function collectShapesForExport() {
  const arr = [];
  regions.forEach((r, id) => {
    if(!r.element) return;
    if(r.element.tagName === 'polygon') {
      arr.push({ id, tag:'polygon', attr: { points: r.points.map(p=>`${p.x},${p.y}`).join(' '), fill: r.color || defaultColorInput.value, 'fill-opacity': (r.opacity!=null)?r.opacity:parseFloat(defaultOpacityInput.value), stroke:'black', 'stroke-width':1.5 }});
    } else if(r.element.tagName === 'path') {
      let d = `M ${r.points[0].x} ${r.points[0].y}`;
      for(let i=1;i<r.points.length;i++){
        const p = r.points[i];
        if(p.curve && p.cx!=null && p.cy!=null) d += ` Q ${p.cx} ${p.cy} ${p.x} ${p.y}`; else d += ` L ${p.x} ${p.y}`;
      }
      d += ' Z';
      arr.push({ id, tag:'path', attr: { d, fill: r.color || defaultColorInput.value, 'fill-opacity': (r.opacity!=null)?r.opacity:parseFloat(defaultOpacityInput.value), stroke:'black', 'stroke-width':1.5 }});
    }
  });
  return arr;
}

exportPowerBI.addEventListener('click', ()=> {
  const shapes = collectShapesForExport();
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const svgStr = buildCleanSVGFragment(shapes, w, h, null);
  const blob = new Blob([svgStr], {type:'image/svg+xml'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mgss_powerbi.svg'; document.body.appendChild(a); a.click(); a.remove();
});

exportFull.addEventListener('click', ()=> {
  const include = includeImage.checked && bgImage ? bgImage : null;
  const shapes = collectShapesForExport();
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const svgStr = buildCleanSVGFragment(shapes, w, h, include);
  const blob = new Blob([svgStr], {type:'image/svg+xml'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mgss_full.svg'; document.body.appendChild(a); a.click(); a.remove();
});

// Save / Load project
saveProjectBtn.addEventListener('click', ()=> {
  const state = snapshotState();
  ProjectIO.exportProject(state);
});
loadProjectFile.addEventListener('change', (ev)=> {
  const file = ev.target.files[0]; if(!file) return;
  ProjectIO.importProjectFile(file, (err,obj)=> {
    if(err) return alert('Invalid project file');
    restoreState(obj);
    capture();
  });
});

// Undo / Redo buttons
undoBtn.addEventListener('click', ()=> {
  const s = UndoRedo.undo();
  if(s) restoreState(s);
});
redoBtn.addEventListener('click', ()=> {
  const s = UndoRedo.redo();
  if(s) restoreState(s);
});

// capture initial
capture();

// helper to show edge preview only when mouse over selected region
function showEdgePreview(info) {
  if(!info || info.dist === Infinity) return;
  if(info.dist > 28) { if(edgePreviewDot){ edgePreviewDot.remove(); edgePreviewDot=null; } return; }
  if(!edgePreviewDot) { edgePreviewDot = document.createElementNS(svgNS,'circle'); edgePreviewDot.setAttribute('r',5); edgePreviewDot.setAttribute('fill','#ff9900'); edgePreviewDot.setAttribute('pointer-events','none'); canvas.appendChild(edgePreviewDot); }
  edgePreviewDot.setAttribute('cx', info.x); edgePreviewDot.setAttribute('cy', info.y);
}

// utility: client->svg
function clientToSvg(ev) {
  const rect = canvas.getBoundingClientRect();
  return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
}

// generate id helper exposed
function generateId() {
  let id;
  do { id = `Area_${regionCounter++}`; } while(document.getElementById(id));
  return id;
}
