// svgExport.js
// Synoptic / Power BI safe SVG exporter
// Includes xmlns:xlink and ensures href works without parser errors

function buildCleanSVGFragment(items, width, height, imageData) {
  // Add both default SVG namespace and xlink namespace
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" ` +
            `xmlns:xlink="http://www.w3.org/1999/xlink" ` +
            `width="${width}" height="${height}" ` +
            `viewBox="0 0 ${width} ${height}">`;

  // Background image (href only, no xlink:href)
  if (imageData && imageData.href) {
    svg += `<image id="bgImage" ` +
           `x="0" y="0" ` +
           `width="${imageData.width}" ` +
           `height="${imageData.height}" ` +
           `href="${escapeXml(imageData.href)}" />`;
  }

  // Regions (polygon or path)
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

// Escape XML for safe attribute injection
function escapeXml(v) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
