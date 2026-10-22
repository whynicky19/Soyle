import sharp from "sharp";
import fs from "node:fs/promises";
import { ImageResponse } from "next/og.js";
import { createElement } from "react";

// Generated character artwork + deterministic typography keep every spelling exact.
const out = "public/branding";
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const canvas = (width, height, background = transparent) =>
  sharp({ create: { width, height, channels: 4, background } });
const mascot = await sharp("assets/branding/mascot-master.png")
  .trim({ threshold: 8 })
  .png()
  .toBuffer();
const head = await sharp("assets/branding/head-master.png")
  .trim({ threshold: 8 })
  .png()
  .toBuffer();
async function lettering(text, width, color, subtitle = false) {
  const font = await fs.readFile(
    subtitle ? "public/fonts/onest-bold.ttf" : "public/fonts/nunito-black.ttf",
  );
  const rendered = new ImageResponse(
    createElement(
      "div",
      {
        style: {
          display: "flex",
          fontFamily: "SoyleBrand",
          fontSize: subtitle ? 42 : 240,
          fontWeight: subtitle ? 700 : 900,
          color,
          letterSpacing: subtitle ? 3.5 : -4,
          whiteSpace: "nowrap",
        },
      },
      text,
    ),
    {
      width: 1600,
      height: 500,
      fonts: [
        {
          name: "SoyleBrand",
          data: font,
          weight: subtitle ? 700 : 900,
          style: "normal",
        },
      ],
    },
  );
  return sharp(Buffer.from(await rendered.arrayBuffer()))
    .trim({ threshold: 1 })
    .resize({ width })
    .png()
    .toBuffer();
}
async function fit(image, width, height) {
  return sharp(image)
    .resize(width, height, { fit: "contain", background: transparent })
    .png()
    .toBuffer();
}
async function save(name, width, height, layers, background = transparent) {
  const image = await canvas(width, height, background)
    .composite(layers)
    .png()
    .toBuffer();
  await fs.writeFile(`${out}/${name}.png`, image);
  await sharp(image)
    .webp({ quality: 95, alphaQuality: 100, effort: 6 })
    .toFile(`${out}/${name}.webp`);
  return image;
}
await fs.mkdir(out, { recursive: true });
const bird = await fit(mascot, 360, 360);
for (const [name, ink, secondary] of [
  ["soyle-logo-primary", "#102B52", "#6684A1"],
  ["soyle-logo-light", "#FFF8ED", "#BFE9DF"],
]) {
  const title = await lettering("Söyle", 750, ink);
  const subtitle = await lettering("ОБЩЕНИЕ И ПРАКТИКА", 750, secondary, true);
  await save(name, 1200, 400, [
    { input: bird, left: 10, top: 20 },
    { input: title, left: 405, top: 38 },
    { input: subtitle, left: 405, top: 337 },
  ]);
}
await fs.copyFile(
  `${out}/soyle-logo-primary.png`,
  `${out}/soyle-logo-dark.png`,
);
await fs.copyFile(
  `${out}/soyle-logo-primary.webp`,
  `${out}/soyle-logo-dark.webp`,
);
await save("soyle-logo-compact", 1000, 320, [
  { input: await fit(mascot, 300, 300), left: 0, top: 10 },
  { input: await lettering("Söyle", 650, "#102B52"), left: 335, top: 33 },
]);
await save("soyle-logo-vertical", 640, 760, [
  { input: await fit(mascot, 440, 440), left: 100, top: 10 },
  { input: await lettering("Söyle", 480, "#102B52"), left: 80, top: 462 },
  {
    input: await lettering("ОБЩЕНИЕ И ПРАКТИКА", 550, "#6684A1", true),
    left: 45,
    top: 690,
  },
]);
const icon = await save("soyle-mascot", 640, 640, [
  { input: await fit(mascot, 608, 608), left: 16, top: 16 },
]);
const small = await save("soyle-icon-small", 256, 256, [
  { input: await fit(head, 236, 236), left: 10, top: 10 },
]);
for (const size of [192, 512])
  await canvas(size, size, "#FFF8ED")
    .composite([
      {
        input: await fit(
          mascot,
          Math.round(size * 0.86),
          Math.round(size * 0.86),
        ),
        gravity: "centre",
      },
    ])
    .png()
    .toFile(`${out}/pwa-icon-${size}.png`);
await canvas(180, 180, "#FFF8ED")
  .composite([{ input: await fit(mascot, 160, 160), gravity: "centre" }])
  .png()
  .toFile(`${out}/apple-touch-icon.png`);
await sharp(small).resize(32, 32).png().toFile(`${out}/favicon.png`);
const sizes = [16, 32, 48];
const icons = await Promise.all(
  sizes.map((size) => sharp(small).resize(size, size).png().toBuffer()),
);
const header = Buffer.alloc(6 + icons.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icons.length, 4);
let offset = header.length;
icons.forEach((image, i) => {
  const start = 6 + i * 16;
  header[start] = sizes[i];
  header[start + 1] = sizes[i];
  header.writeUInt16LE(1, start + 4);
  header.writeUInt16LE(32, start + 6);
  header.writeUInt32LE(image.length, start + 8);
  header.writeUInt32LE(offset, start + 12);
  offset += image.length;
});
await fs.writeFile(`${out}/favicon.ico`, Buffer.concat([header, ...icons]));
await canvas(512, 512)
  .composite([{ input: await fit(head, 480, 480), gravity: "centre" }])
  .png()
  .toFile("app/icon.png");
await fs.copyFile(`${out}/apple-touch-icon.png`, "app/apple-icon.png");
await fs.copyFile(`${out}/favicon.ico`, "app/favicon.ico");
await sharp(icon).resize(512, 512).png().toFile("public/soyle-icon.png");
// Social previews use a deliberate opaque cream canvas, unlike transparent logos.
await canvas(1200, 630, "#FFF8ED")
  .composite([
    {
      input: await sharp(`${out}/soyle-logo-primary.png`)
        .resize(1050, 350)
        .png()
        .toBuffer(),
      left: 75,
      top: 140,
    },
  ])
  .png()
  .toFile("app/opengraph-image.png");
console.log(
  "Brand kit generated with transparent logos, favicon, Apple and PWA icons.",
);
