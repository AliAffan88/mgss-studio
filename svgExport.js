// svgExport.js - Synoptic & Power BI safe SVG export
// Guarantees 1:1 coordinate alignment between image and regions

function buildCleanSVGFragment(items, width, height, includeImageData) {
  const xmlns = 'http://www.w3.org/2000/svg';

  // Use image natural size as the master coordinate system when included
  const vbW = includeImageData ? includeImageData.width : width;
  const vbH = includeImageData ? includeImageData.height : height;

  let svg =
    `<svg xmlns="${xmlns}" ` +
    `width="${vbW}" height="${vbH}" ` +
    `viewBox="0 0 ${vbW} ${vbH}">`;

  // Background image (no scaling drift, Synoptic-safe)
  if (includeImageData && includeImageData.href) {
    const href = escapeXml(includeImageData.href);
    svg +=
      `<image ` +
      `id="bgImage" ` +
      `x="0" y="0" ` +
      `width="${vbW}" height="${vbH}" ` +
      `href="${href}" ` +
      `preserveAspectRatio="none" />`;
  }

  // Regions (pure SVG, no transforms, no groups)
  items.forEach(it => {
    if (it.tag === 'polygon') {
      svg +=
        `<polygon ` +
        `id="${escapeXml(it.id)}" ` +
        `points="${escapeXml(it.attr.points)}" ` +
        `fill="${escapeXml(it.attr.fill)}" ` +
        `fill-opacity="${it.attr['fill-opacity']}" ` +
        `stroke="${escapeXml(it.attr.stroke)}" ` +
        `stroke-width="${it.attr['stroke-width']}" />`;
    } else if (it.tag === 'path') {
      svg +=
        `<path ` +
        `id="${escapeXml(it.id)}" ` +
        `d="${escapeXml(it.attr.d)}" ` +
        `fill="${escapeXml(it.attr.fill)}" ` +
        `fill-opacity="${it.attr['fill-opacity']}" ` +
        `stroke="${escapeXml(it.attr.stroke)}" ` +
        `stroke-width="${it.attr['stroke-width']}" />`;
    }
  });

  svg += `</svg>`;
  return svg;
}

// XML-safe escaping
function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
