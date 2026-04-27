import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const svgPath = resolve(projectRoot, "app/icon.svg");
const outPath = resolve(projectRoot, "LocalDraft.ico");
const sizes = [16, 32, 48, 64, 128, 256];

const svg = await readFile(svgPath);
const pngs = await Promise.all(
  sizes.map((size) =>
    sharp(svg).resize(size, size).png({ compressionLevel: 9 }).toBuffer()
  )
);

const headerSize = 6 + sizes.length * 16;
let dataOffset = headerSize;
const totalSize = headerSize + pngs.reduce((sum, p) => sum + p.length, 0);
const ico = Buffer.alloc(totalSize);

ico.writeUInt16LE(0, 0);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(sizes.length, 4);

for (let i = 0; i < sizes.length; i++) {
  const size = sizes[i];
  const png = pngs[i];
  const entryOffset = 6 + i * 16;
  ico.writeUInt8(size === 256 ? 0 : size, entryOffset + 0);
  ico.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
  ico.writeUInt8(0, entryOffset + 2);
  ico.writeUInt8(0, entryOffset + 3);
  ico.writeUInt16LE(1, entryOffset + 4);
  ico.writeUInt16LE(32, entryOffset + 6);
  ico.writeUInt32LE(png.length, entryOffset + 8);
  ico.writeUInt32LE(dataOffset, entryOffset + 12);
  png.copy(ico, dataOffset);
  dataOffset += png.length;
}

await writeFile(outPath, ico);
console.log(`Wrote ${outPath} (${totalSize} bytes, ${sizes.length} sizes)`);
