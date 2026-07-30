const fs = require("fs");
const path = require("path");

function prepareKatexCss(rootDir = path.join(__dirname, "..")) {
  const sourcePath = path.join(rootDir, "node_modules", "katex", "dist", "katex.min.css");
  const outputDir = path.join(rootDir, "web", "src", "generated");
  const outputPath = path.join(outputDir, "katex.css");
  const source = fs.readFileSync(sourcePath, "utf8");
  let replacementCount = 0;
  const woff2Only = source.replace(
    /url\(fonts\/([^)]+\.woff2)\) format\("woff2"\),url\(fonts\/[^)]+\.woff\) format\("woff"\),url\(fonts\/[^)]+\.ttf\) format\("truetype"\)/g,
    (_, fileName) => {
      replacementCount += 1;
      return `url("../../../node_modules/katex/dist/fonts/${fileName}") format("woff2")`;
    },
  );

  if (replacementCount === 0 || /url\(fonts\//.test(woff2Only)) {
    throw new Error("Unable to create the woff2-only KaTeX stylesheet");
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, woff2Only);
  return outputPath;
}

if (require.main === module) {
  console.log(`KaTeX stylesheet prepared: ${prepareKatexCss()}`);
}

module.exports = prepareKatexCss;

