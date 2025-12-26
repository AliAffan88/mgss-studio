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
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const autosaveCheckbox = document.getElementById('autosave');
const themeToggle = document.getElementById('themeToggle');
const handBtn = document.getElementById('handBtn');


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
let draggingHandle = null, dragOffset = [0,0];

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

// mode buttons
polyBtn.onclick = ()=> setMode('polygon');
bezierBtn.onclick = ()=> setMode('bezier');
selectBtn.onclick = ()=> setMode('select');
handBtn.onclick = () => setMode('hand');


function setMode(m){
  mode = m;
  document.body.classList.toggle('mode-hand', m === 'hand');
  document.querySelectorAll('.modeBtn').forEach(b=>b.classList.remove('active'));
  if(m==='polygon') polyBtn.classList.add('active');
  if(m==='bezier') bezierBtn.classList.add('active');
  if(m==='select') selectBtn.classList.add('active');
  if(m === 'hand') handBtn.classList.add('active');
  deselect();
}

// UndoRedo snapshot helpers
function snapshotState(){
  const obj = { regions: [], bg: null, canvas:{ w:canvas.clientWidth, h:canvas.clientHeight } };
  if(bgImage) obj.bg = { href:bgImage.href, width:bgImage.width, height:bgImage.height };
  regions.forEach(r=>{
    obj.regions.push({
      id: r.id,
      points: r.points.map(p=>({x:p.x,y:p.y,curve:p.curve?true:false,cx:p.cx||null,cy:p.cy||null})),
      color: r.color,
      opacity: r.opacity,
      field: r.field || ''
    });
  });
  return obj;
}
function restoreState(obj){
  clearAllRegions();
  if(obj.bg) loadBackgroundFromData(obj.bg.href, obj.bg.width, obj.bg.height, false);
  if(obj.regions) obj.regions.forEach(rr=>{
    const id = rr.id;
    const r = { 
      id, 
      points: rr.points.map(p=>({x:p.x,y:p.y,curve:!!p.curve,cx:p.cx||null,cy:p.cy||null})), 
      color: rr.color||defaultColorInput.value, 
      opacity: rr.opacity!=null?rr.opacity:parseFloat(defaultOpacityInput.value),
      field: rr.field || ''
    };
    createRegionElement(r);
    regions.set(id,r);
  });
  if (r.field) {
  r.element.setAttribute('data-field', r.field);
}
  updateRegionList();
}

// initial capture
UndoRedo.onChangeSet(()=>{});
function capture(){ UndoRedo.capture(snapshotState()); }

// Background image
uploadImage.addEventListener('change', ev=>{
  const file = ev.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    const href = e.target.result;
    const img = new Image();
    img.onload = ()=> {
      loadBackgroundFromData(href,img.naturalWidth,img.naturalHeight);
      capture();
    };
    img.src = href;
  };
  reader.readAsDataURL(file);
});

function loadBackgroundFromData(href,imgW,imgH){
  const old = canvas.querySelector('#bgImage');
  if(old) old.remove();
  canvas.setAttribute('viewBox',`0 0 ${imgW} ${imgH}`);
  canvas.setAttribute('width',imgW);
  canvas.setAttribute('height',imgH);
  canvas.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const img = document.createElementNS(svgNS,'image');
  img.setAttribute('id','bgImage');
  img.setAttribute('x',0); img.setAttribute('y',0);
  img.setAttribute('width',imgW); img.setAttribute('height',imgH);
  img.setAttribute('href',href); 
  img.style.pointerEvents='none';
  canvas.insertBefore(img,canvas.firstChild);
  bgImage = { href, width:imgW, height:imgH };
  viewBox = { x: 0, y: 0, w: imgW, h: imgH };
}

function removeBackgroundImage() {
  const old = canvas.querySelector('#bgImage');
  if (old) old.remove();

  bgImage = null;

  // Reset viewBox to a safe default
  canvas.setAttribute('viewBox', '0 0 1000 700');
  canvas.setAttribute('width', 1000);
  canvas.setAttribute('height', 700);

  viewBox = { x: 0, y: 0, w: 1000, h: 700 };
}

// Mouse events
canvas.addEventListener('mousedown', ev=>{
  if (mode === 'hand') {
  isPanning = true;
  panStart = { x: ev.clientX, y: ev.clientY };
  canvas.style.cursor = 'grabbing';
  return;
}

  if(ev.target.classList && ev.target.classList.contains('handle')) return;
  const {x:svgX,y:svgY} = clientToSvg(ev); // use precise SVG coordinates
  if(mode==='polygon'||mode==='bezier'){
    if(!drawing){
      // start exactly at mouse cursor
      startRegion(svgX, svgY);
      // push first point immediately
      addPoint(svgX, svgY, false);
    } else addPoint(svgX, svgY,false);
  } else if(mode==='select'){
    if(ev.target.tagName==='polygon'||ev.target.tagName==='path'){
      const id = ev.target.id;
      if(regions.has(id)) selectRegion(regions.get(id));
    } else deselect();
  }
});

canvas.addEventListener('mousemove', ev=>{
  if (isPanning) {
  const dx = (ev.clientX - panStart.x) * (viewBox.w / canvas.clientWidth);
  const dy = (ev.clientY - panStart.y) * (viewBox.h / canvas.clientHeight);

  viewBox.x -= dx;
  viewBox.y -= dy;

  panStart = { x: ev.clientX, y: ev.clientY };
  updateViewBox();
  return;
}

  const {x,y} = clientToSvg(ev);
  if(drawing){ updateTempLine(x,y); showTempCursor(x,y); }
  if(selected && !drawing){
    const near = findClosestEdge(selected,x,y);
    showEdgePreview(near);
  }
  if(draggingHandle && selected){
    const idx = parseInt(draggingHandle.getAttribute('data-idx'),10);
    const nx = x - dragOffset[0], ny = y - dragOffset[1];
    selected.points[idx].x = Math.round(nx); selected.points[idx].y = Math.round(ny);
    updateRegionElement(selected);
    recreateHandles(selected);
  }
});

canvas.addEventListener('dblclick', ev=>{ if(drawing) finalizeRegion(); });

document.addEventListener('keydown', ev=>{
  if(ev.key==='Escape'||ev.key==='Backspace'){
    if(drawing){
      if(current.points.length>0){ current.points.pop(); if(current.points.length===0) cancelCurrent(); else updateRegionElement(current); }
      removeTempLine(); removeTempCursor(); ev.preventDefault();
    } else deselect();
  } else if(ev.key==='Enter'){ if(drawing) finalizeRegion(); }
  else if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='z'){ const s=UndoRedo.undo(); if(s) restoreState(s); }
  else if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='y'){ const s=UndoRedo.redo(); if(s) restoreState(s); }
  else if(ev.key==='Delete'){ if(selected) deleteRegion(selected.id); }
});

// helpers
function clientToSvg(ev) {
  const pt = canvas.createSVGPoint();
  pt.x = ev.clientX;
  pt.y = ev.clientY;
  const svgPt = pt.matrixTransform(canvas.getScreenCTM().inverse());
  return {
    x: svgPt.x,
    y: svgPt.y
  };
}

function startRegion(x,y){
  const id = generateId();
  current = { id, points:[{x:Math.round(x),y:Math.round(y),curve:false}], field: '', element:null, color:defaultColorInput.value, opacity:parseFloat(defaultOpacityInput.value) };
  createRegionElement(current);
  drawing=true;
  showTempCursor(x,y);
}

function addPoint(x,y,curve=false,cx=null,cy=null){
  if(!current) return;
  const p={x:Math.round(x),y:Math.round(y),curve:!!curve};
  if(curve&&cx!=null&&cy!=null){p.cx=Math.round(cx); p.cy=Math.round(cy);}
  current.points.push(p);
  updateRegionElement(current);
}

function updateViewBox() {
  canvas.setAttribute(
    'viewBox',
    `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`
  );
}

function updateTempLine(x,y){
  if(!current) return;
  const pts = current.points;
  if(pts.length===0) return;
  if(!tempLine){ tempLine=document.createElementNS(svgNS,'line'); tempLine.setAttribute('stroke','blue'); tempLine.setAttribute('stroke-dasharray','4,4'); tempLine.setAttribute('pointer-events','none'); canvas.appendChild(tempLine);}
  const last=pts[pts.length-1];
  tempLine.setAttribute('x1',last.x); tempLine.setAttribute('y1',last.y);
  tempLine.setAttribute('x2',x); tempLine.setAttribute('y2',y);
}

function removeTempLine(){ if(tempLine&&tempLine.parentNode) tempLine.parentNode.removeChild(tempLine); tempLine=null; }
function showTempCursor(x,y){ if(!tempCursor){ tempCursor=document.createElementNS(svgNS,'circle'); tempCursor.setAttribute('r',4); tempCursor.setAttribute('fill','#007acc'); tempCursor.setAttribute('pointer-events','none'); canvas.appendChild(tempCursor); } tempCursor.setAttribute('cx',x); tempCursor.setAttribute('cy',y); }
function removeTempCursor(){ if(tempCursor&&tempCursor.parentNode) tempCursor.parentNode.removeChild(tempCursor); tempCursor=null; }

function finalizeRegion(){
  if(!current) return;
  if(current.points.length<3){ cancelCurrent(); return; }
  regions.set(current.id,current);
  attachRegionEvents(current);
  current=null; drawing=false;
  removeTempLine(); removeTempCursor();
  updateRegionList();
  capture();
}

function cancelCurrent(){
  if(current&&current.element&&current.element.parentNode) current.element.parentNode.removeChild(current.element);
  current=null; drawing=false; removeTempLine(); removeTempCursor();
}

function createRegionElement(region){
  const poly=document.createElementNS(svgNS,'polygon');
  poly.setAttribute('id',region.id);
  poly.setAttribute('fill',region.color||defaultColorInput.value);
  poly.setAttribute('fill-opacity',region.opacity!=null?region.opacity:defaultOpacityInput.value);
  poly.setAttribute('stroke','black'); poly.setAttribute('stroke-width','1.5');
  canvas.appendChild(poly);
  region.element=poly;
  updateRegionElement(region);
}

function updateRegionElement(region){
  const pts = region.points;
  if(!region.element) createRegionElement(region);
  const anyCurve = pts.some(p=>p.curve);
  if(anyCurve){
    if(region.element.tagName!=='path'){ const newEl=document.createElementNS(svgNS,'path'); if(region.element.parentNode) canvas.replaceChild(newEl,region.element); region.element=newEl;}
    let d=`M ${pts[0].x} ${pts[0].y}`;
    for(let i=1;i<pts.length;i++){ const p=pts[i]; if(p.curve&&p.cx!=null&&p.cy!=null) d+=` Q ${p.cx} ${p.cy} ${p.x} ${p.y}`; else d+=` L ${p.x} ${p.y}`; }
    d+=' Z'; region.element.setAttribute('d',d);
  } else {
    if(region.element.tagName!=='polygon'){ const newEl=document.createElementNS(svgNS,'polygon'); if(region.element.parentNode) canvas.replaceChild(newEl,region.element); region.element=newEl;}
    const ptsAttr = pts.map(p=>`${p.x},${p.y}`).join(' ');
    region.element.setAttribute('points',ptsAttr);
  }
  region.element.setAttribute('fill',region.color||defaultColorInput.value);
  region.element.setAttribute('fill-opacity',region.opacity!=null?region.opacity:defaultOpacityInput.value);
  region.element.setAttribute('stroke','black'); region.element.setAttribute('stroke-width','1.5');
}

// ID helpers
function generateId(){ let id; do{id=`Area_${regionCounter++}`}while(document.getElementById(id)); return id; }
function attachRegionEvents(region){ if(region.element) region.element.addEventListener('click', ev=>{ if(mode==='select'){ ev.stopPropagation(); selectRegion(region); } }); }

// region selection / handles
function selectRegion(r){
  deselect();
  selected=r;
  r.element.classList.add('selected');
  regionFieldInput.value = r.field || '';
  regionIDInput.value=r.id;
  fillColorInput.value=r.color||defaultColorInput.value;
  fillOpacityInput.value=r.opacity!=null?r.opacity:defaultOpacityInput.value;
  recreateHandles(r);
}
function deselect(){ if(selected){ selected.element.classList.remove('selected'); removeHandles(); } selected=null; regionIDInput.value=''; fillColorInput.value='#000000'; fillOpacityInput.value=0; }

// handle creation
function createHandles(r){
  removeHandles();
  r.points.forEach((p,idx)=>{
    const g=document.createElementNS(svgNS,'g'); g.classList.add('handle'); g.setAttribute('data-idx',idx);
    g.setAttribute('transform',`translate(${p.x},${p.y})`);
    const circ=document.createElementNS(svgNS,'circle'); circ.setAttribute('r',6); circ.setAttribute('cx',0); circ.setAttribute('cy',0);
    g.appendChild(circ);
    g.addEventListener('mousedown', ev=>{
  ev.stopPropagation();
  draggingHandle = g;

  // current handle position (from transform)
  const tr = g.getAttribute('transform');
  const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(tr);
  const hx = m ? parseFloat(m[1]) : 0;
  const hy = m ? parseFloat(m[2]) : 0;

  // mouse position in SVG coordinates
  const pt = clientToSvg(ev);

  // correct SVG-based offset
  dragOffset = [
    pt.x - hx,
    pt.y - hy
  ];

  window.addEventListener('mousemove', handleDragging);
  window.addEventListener('mouseup', stopDraggingHandle);
});
    g.addEventListener('contextmenu', ev=>{ ev.preventDefault(); const i=parseInt(g.getAttribute('data-idx'),10); removeVertex(r,i); });
    canvas.appendChild(g); handles.push(g);
  });
  bringHandlesToFront();
}

function handleDragging(ev){
  if(!draggingHandle||!selected) return;
  const pt = clientToSvg(ev);
  const mx=pt.x, my=pt.y;
  const nx=mx-dragOffset[0], ny=my-dragOffset[1];
  draggingHandle.setAttribute('transform',`translate(${nx},${ny})`);
  const idx=parseInt(draggingHandle.getAttribute('data-idx'),10);
  selected.points[idx].x=Math.round(nx); selected.points[idx].y=Math.round(ny);
  updateRegionElement(selected); recreateHandles(selected);
}

function stopDraggingHandle(){ window.removeEventListener('mousemove',handleDragging); window.removeEventListener('mouseup',stopDraggingHandle); draggingHandle=null; updateRegionList(); capture(); }

function removeHandles(){ handles.forEach(h=>{ if(h.parentNode) h.parentNode.removeChild(h); }); handles=[]; }
function recreateHandles(r){ removeHandles(); createHandles(r); }
function bringHandlesToFront(){ handles.forEach(h=>canvas.appendChild(h)); }

function removeVertex(r,index){
  if(r.points.length<=3){ if(confirm('Removing this vertex will leave fewer than 3 points. Delete region?')) deleteRegion(r.id); return; }
  r.points.splice(index,1); updateRegionElement(r); recreateHandles(r); updateRegionList(); capture();
}

// edge previews & insertion
function findClosestEdge(r,x,y){
  const pts = r.points;
  let best={dist:Infinity, idx:-1, x:0, y:0};
  for(let i=0;i<pts.length;i++){
    const a=pts[i], b=pts[(i+1)%pts.length];
    const proj = projectPointToSegment([x,y],[a.x,a.y],[b.x,b.y]);
    if(proj.dist<best.dist) best={ dist:proj.dist, idx:i+1, x:proj.x, y:proj.y };
  }
  return best;
}
function showEdgePreview(info){
  if(!info||info.dist===Infinity) return;
  if(info.dist>28){ if(edgePreviewDot){ edgePreviewDot.remove(); edgePreviewDot=null; } return; }
  if(!edgePreviewDot){ edgePreviewDot=document.createElementNS(svgNS,'circle'); edgePreviewDot.setAttribute('r',5); edgePreviewDot.setAttribute('fill','#ff9900'); edgePreviewDot.setAttribute('pointer-events','none'); canvas.appendChild(edgePreviewDot);}
  edgePreviewDot.setAttribute('cx',info.x); edgePreviewDot.setAttribute('cy',info.y);
}
function insertVertexAt(r,x,y){
  const info=findClosestEdge(r,x,y);
  if(info.dist<28){ r.points.splice(info.idx,0,{x:Math.round(info.x),y:Math.round(info.y),curve:false}); updateRegionElement(r); recreateHandles(r); updateRegionList(); capture(); }
}

canvas.addEventListener('click', ev=>{
  if(ev.shiftKey && selected){ const {x,y}=clientToSvg(ev); insertVertexAt(selected,x,y); }
});

// delete region
function deleteRegion(id){
  const r = regions.get(id);
  if(!r) return;
  if(r.element&&r.element.parentNode) r.element.parentNode.removeChild(r.element);
  regions.delete(id);
  if(selected&&selected.id===id){ removeHandles(); selected=null; }
  updateRegionList(); capture();
}

// clear all
function clearAllRegions(){ regions.forEach(r=>{ if(r.element&&r.element.parentNode) r.element.parentNode.removeChild(r.element); }); regions.clear(); removeHandles(); selected=null; }

// region list UI
function updateRegionList(){
  regionList.innerHTML='';
  regions.forEach(r=>{
    const li=document.createElement('li'); li.textContent=r.id;
    li.addEventListener('click',()=>selectRegion(r));
    regionList.appendChild(li);
  });
}

// property updates
canvas.addEventListener('wheel', ev => {
  ev.preventDefault();

  const zoomFactor = ev.deltaY > 0 ? 1.1 : 0.9;
  const pt = clientToSvg(ev);

  viewBox.x = pt.x - (pt.x - viewBox.x) * zoomFactor;
  viewBox.y = pt.y - (pt.y - viewBox.y) * zoomFactor;
  viewBox.w *= zoomFactor;
  viewBox.h *= zoomFactor;

  updateViewBox();
});
document.addEventListener('keydown', ev => {
  if (ev.code === 'Space') canvas.style.cursor = 'grab';
});

document.addEventListener('keyup', ev => {
  if (ev.code === 'Space') canvas.style.cursor = 'default';
});

canvas.addEventListener('mousedown', ev => {
  if (ev.code === 'Space' || ev.button === 1) {
    isPanning = true;
    panStart = { x: ev.clientX, y: ev.clientY };
    canvas.style.cursor = 'grabbing';
  }
});

canvas.addEventListener('mousemove', ev => {
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


fillColorInput.addEventListener('input',()=>{ if(selected){ selected.color=fillColorInput.value; updateRegionElement(selected); capture(); } });
fillOpacityInput.addEventListener('input',()=>{ if(selected){ selected.opacity=parseFloat(fillOpacityInput.value); updateRegionElement(selected); capture(); } });
regionFieldInput.addEventListener('input', () => {
  if (!selected) return;

  selected.field = regionFieldInput.value.trim();

  if (selected.field) {
    selected.element.setAttribute('data-field', selected.field);
  } else {
    selected.element.removeAttribute('data-field');
  }

  capture();
});
//regionFieldInput.addEventListener('input', () => {if (!selected) return; selected.field = regionFieldInput.value.trim(); if (selected.element) {
//    if (selected.field) {
 //     selected.element.setAttribute('data-field', selected.field);
 //   } else {
 //     selected.element.removeAttribute('data-field');
 //   }
//  } 
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

  // update Map key
  regions.delete(oldId);
  selected.id = newId;
  regions.set(newId, selected);

  // update SVG
  selected.element.setAttribute('id', newId);

  updateRegionList();
  capture();
});

// export
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
exportFull.addEventListener('click',()=>{ const svgStr=canvas.outerHTML; downloadSVG(svgStr,'mgss_full_raw.svg'); });

function createPathD(r){ const pts=r.points; let d=`M ${pts[0].x} ${pts[0].y}`; for(let i=1;i<pts.length;i++){ const p=pts[i]; if(p.curve&&p.cx!=null&&p.cy!=null) d+=` Q ${p.cx} ${p.cy} ${p.x} ${p.y}`; else d+=` L ${p.x} ${p.y}`; } return d+' Z'; }

function downloadSVG(svgStr,filename){
  const blob = new Blob([svgStr],{type:'image/svg+xml'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); a.remove();
}

// project save/load
saveProjectBtn.addEventListener('click',()=>{ ProjectIO.exportProject(snapshotState()); });
loadProjectFile.addEventListener('change', ev=>{
  const file = ev.target.files[0]; if(!file) return;
  ProjectIO.importProjectFile(file,(err,obj)=>{ if(err){ alert('Failed to load project'); return; } restoreState(obj); capture(); });
});

// auto-save
autosaveCheckbox.addEventListener('change', ev=>{
  if(ev.target.checked){ setInterval(()=>{ ProjectIO.exportProject(snapshotState()); },10000); }
});

// UndoRedo
undoBtn.addEventListener('click',()=>{ const s=UndoRedo.undo(); if(s) restoreState(s); });
redoBtn.addEventListener('click',()=>{ const s=UndoRedo.redo(); if(s) restoreState(s); });

// helpers
function projectPointToSegment(p,a,b){
  const [px,py]=p; const [ax,ay]=a; const [bx,by]=b;
  const dx=bx-ax, dy=by-ay;
  if(dx===0 && dy===0) return {x:ax,y:ay,dist:distance(px,py,ax,ay)};
  let t=((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy);
  t=Math.max(0,Math.min(1,t));
  const cx=ax+t*dx, cy=ay+t*dy;
  return {x:cx,y:cy,dist:distance(px,py,cx,cy)};
}
function distance(x1,y1,x2,y2){ return Math.hypot(x2-x1,y2-y1); }




