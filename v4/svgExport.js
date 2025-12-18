// svgExport.js
// Synoptic Panel safe SVG exporter
// Includes xlink namespace and xlink:href for background images

function buildCleanSVGFragment(items, width, height, imageData) {
  // SVG root with xlink namespace
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
            `width="${width}" height="${height}" ` +
            `viewBox="0 0 ${width} ${height}">`;

  // Background image (Synoptic requires xlink:href)
  if (imageData && imageData.href) {
    svg += `<image id="bgImage" ` +
           `x="0" y="0" ` +
           `width="${imageData.width}" ` +
           `height="${imageData.height}" ` +
           `xlink:href="${escapeXml(imageData.href)}" />`;
  }

  // Add all regions
  items.forEach(it => {
    if (it.tag === "polygon") {
      svg += `<polygon ` +
             `id="${escapeXml(it.id)}" ` +
             `points="${escapeXml(it.attr.points)}" ` +
             `fill="${escapeXml(it.attr.fill)}" ` +
             `fill-opacity="${it.attr["fill-opacity"]}" ` +
             `stroke="${escapeXml(it.attr.stroke)}" ` +
             `stroke-width="${it.attr["stroke-width"]}" />`;
    }

    if (it.tag === "path") {
      svg += `<path ` +
             `id="${escapeXml(it.id)}" ` +
             `d="${escapeXml(it.attr.d)}" ` +
             `fill="${escapeXml(it.attr.fill)}" ` +
             `fill-opacity="${it.attr["fill-opacity"]}" ` +
             `stroke="${escapeXml(it.attr.stroke)}" ` +
             `stroke-width="${it.attr["stroke-width"]}" />`;
    }
  });

  svg += `</svg>`;
  return svg;
}

// Simple XML escaping
function escapeXml(v) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
