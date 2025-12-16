// svgExport.js - builds Power BI friendly SVG and full export with optional image
// Uses the same minimal attributes we require.

function buildCleanSVGFragment(shapes, width, height, bg) {
  const vbW = bg ? bg.width : width;
  const vbH = bg ? bg.height : height;

  let svg = [];
  svg.push(
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    `width="${vbW}" height="${vbH}"`,
    `viewBox="0 0 ${vbW} ${vbH}">`
  );

  // background image (fixed coordinates)
  if (bg) {
    svg.push(
      `<image href="${bg.href}" x="0" y="0" width="${vbW}" height="${vbH}" preserveAspectRatio="none"/>`
    );
  }

  // regions
  shapes.forEach(s => {
    let attrs = '';
    Object.entries(s.attr).forEach(([k,v]) => {
      attrs += ` ${k}="${v}"`;
    });
    svg.push(`<${s.tag} id="${s.id}"${attrs}/>`);
  });

  svg.push(`</svg>`);
  return svg.join('');
}
