// MGSS SVG EXPORT VERSION: 2025-ALIGNMENT-FIX
// svgExport.js - Synoptic & Power BI safe SVG export
// Guarantees 1:1 coordinate alignment between image and regions
// svgExport.js - Power BI safe SVG export with correct alignment

function buildCleanSVGFragment(items, width, height, imageData) {
  const xmlns = 'http://www.w3.org/2000/svg';

  let svg =
    `<svg xmlns="${xmlns}" ` +
    `width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">`;

  // Background image (ONLY href, no xlink)
  if (imageData && imageData.href) {
    svg +=
      `<image id="bgImage" ` +
      `x="0" y="0" ` +
      `width="${width}" height="${height}" ` +
      `href="${imageData.href}" ` +
      `preserveAspectRatio="none" />`;
  }

  // Regions
  items.forEach(it => {
    if (it.tag === 'polygon') {
      svg +=
        `<polygon id="${escapeXml(it.id)}" ` +
        `points="${escapeXml(it.attr.points)}" ` +
        `fill="${escapeXml(it.attr.fill)}" ` +
        `fill-opacity="${it.attr['fill-opacity']}" ` +
        `stroke="${escapeXml(it.attr.stroke)}" ` +
        `stroke-width="${it.attr['stroke-width']}" />`;
    }

    if (it.tag === 'path') {
      svg +=
        `<path id="${escapeXml(it.id)}" ` +
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

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

