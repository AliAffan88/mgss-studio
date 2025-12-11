// svgExport.js - builds Power BI friendly SVG and full export with optional image
// Uses the same minimal attributes we require.

function buildCleanSVGFragment(items, width, height, includeImageData) {
  const xmlns = 'http://www.w3.org/2000/svg';
  const xlink = 'http://www.w3.org/1999/xlink';
  let svgOpen = `<svg xmlns="${xmlns}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"`;
  if(includeImageData) svgOpen += ` xmlns:xlink="${xlink}"`;
  svgOpen += `>`;
  let body = '';
  if(includeImageData && includeImageData.href) {
    const href = includeImageData.href;
    body += `<image id="bgImage" x="0" y="0" width="${includeImageData.width}" height="${includeImageData.height}" href="${href}" xlink:href="${href}" preserveAspectRatio="xMinYMin meet" />`;
  }
  items.forEach(it => {
    if(it.tag === 'polygon') {
      body += `<polygon id="${escapeXml(it.id)}" points="${escapeXml(it.attr.points)}" fill="${escapeXml(it.attr.fill)}" fill-opacity="${it.attr['fill-opacity']}" stroke="${escapeXml(it.attr.stroke)}" stroke-width="${it.attr['stroke-width']}" />`;
    } else if(it.tag === 'path') {
      body += `<path id="${escapeXml(it.id)}" d="${escapeXml(it.attr.d)}" fill="${escapeXml(it.attr.fill)}" fill-opacity="${it.attr['fill-opacity']}" stroke="${escapeXml(it.attr.stroke)}" stroke-width="${it.attr['stroke-width']}" />`;
    }
  });
  const svgClose = `</svg>`;
  return svgOpen + body + svgClose;
}

function escapeXml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
