// svgExport.js
// Synoptic-safe SVG export (NO xlink)

function buildCleanSVGFragment(items, width, height, imageData) {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

  if(imageData && imageData.href){
    svg += `<image id="bgImage" x="0" y="0" width="${imageData.width}" height="${imageData.height}" href="${imageData.href}"/>`;
  }

  items.forEach(it=>{
    if(it.tag==='polygon'){
      svg += `<polygon id="${escapeXml(it.id)}" points="${escapeXml(it.attr.points)}" fill="${escapeXml(it.attr.fill)}" fill-opacity="${it.attr['fill-opacity']}" stroke="${escapeXml(it.attr.stroke)}" stroke-width="${it.attr['stroke-width']}"/>`;
    } else if(it.tag==='path'){
      svg += `<path id="${escapeXml(it.id)}" d="${escapeXml(it.attr.d)}" fill="${escapeXml(it.attr.fill)}" fill-opacity="${it.attr['fill-opacity']}" stroke="${escapeXml(it.attr.stroke)}" stroke-width="${it.attr['stroke-width']}"/>`;
    }
  });

  svg += '</svg>';
  return svg;
}

function escapeXml(v){
  return String(v||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
