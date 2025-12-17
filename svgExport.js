// svgExport.js - Power BI safe SVG export with correct alignment

// svgExport.js — FINAL Power BI–safe exporter

function buildCleanSVGFragment(items, canvasWidth, canvasHeight, imageData) {
  const xmlns = 'http://www.w3.org/2000/svg';

  // SVG root — viewBox defines ALL coordinates
  let svg =
    `<svg xmlns="${xmlns}" ` +
    `width="${canvasWidth}" height="${canvasHeight}" ` +
    `viewBox="0 0 ${canvasWidth} ${canvasHeight}">`;

  // Background image — NO xlink, NO preserveAspectRatio tricks
  if (imageData && imageData.href) {
    svg +=
      `<image ` +
      `id="bgImage" ` +
      `x="0" y="0" ` +
      `width="${canvasWidth}" height="${canvasHeight}" ` +
      `href="${imageData.href}" />`;
  }

  // Regions — coordinates already normalized to viewBox
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
    }

    if (it.tag === 'path') {
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

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}


