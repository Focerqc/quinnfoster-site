const fs = require('fs');

const buf = fs.readFileSync('./models/stator_laminations.glb');
const magic = buf.readUInt32LE(0);
const length = buf.readUInt32LE(8);
let offset = 12;
let jsonChunk = null, binChunk = null;
while (offset < length) {
  const chunkLength = buf.readUInt32LE(offset);
  const chunkType = buf.readUInt32LE(offset + 4);
  const chunkData = buf.subarray(offset + 8, offset + 8 + chunkLength);
  if (chunkType === 0x4E4F534A) jsonChunk = JSON.parse(chunkData.toString('utf8'));
  else if (chunkType === 0x004E4942) binChunk = chunkData;
  offset += 8 + chunkLength;
}

const posAcc = jsonChunk.accessors[jsonChunk.meshes[0].primitives[0].attributes.POSITION];
const bv = jsonChunk.bufferViews[posAcc.bufferView];
const byteOffset = (bv.byteOffset || 0) + (posAcc.byteOffset || 0);
const floatView = new Float32Array(binChunk.buffer, binChunk.byteOffset + byteOffset, posAcc.count * 3);

let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
const raw = [];
for (let i = 0; i < posAcc.count; i++) {
  const x = floatView[i * 3] * 1000;
  const y = -floatView[i * 3 + 2] * 1000;
  const z = floatView[i * 3 + 1] * 1000;
  raw.push({ x, y, z });
  minX = Math.min(minX, x); maxX = Math.max(maxX, x);
  minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
}
const cx = (minX + maxX) / 2;
const cy = (minY + maxY) / 2;
const cz = (minZ + maxZ) / 2;
const centered = raw.map(v => ({ x: v.x - cx, y: v.y - cy, z: v.z - cz }));

// Let's inspect points between angles 3° and 17° (around tooth 1 at ~10°)
const tooth1Points = centered.filter(v => {
  let deg = Math.atan2(v.z, v.x) * 180 / Math.PI;
  if (deg < 0) deg += 360;
  return deg >= 3 && deg <= 17 && v.y > 44;
});

// Let's sort by R and print
tooth1Points.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
console.log(`Tooth 1 points on top face: ${tooth1Points.length}`);

// Group by radius
const rGroups = {};
for (const p of tooth1Points) {
  const r = Math.hypot(p.x, p.z);
  const rKey = r.toFixed(1);
  if (!rGroups[rKey]) rGroups[rKey] = [];
  let deg = Math.atan2(p.z, p.x) * 180 / Math.PI;
  if (deg < 0) deg += 360;
  rGroups[rKey].push(deg);
}

for (const [r, degs] of Object.entries(rGroups)) {
  const minDeg = Math.min(...degs);
  const maxDeg = Math.max(...degs);
  console.log(`R = ${r}mm: angles in [${minDeg.toFixed(2)}°, ${maxDeg.toFixed(2)}°] (angular width = ${(maxDeg - minDeg).toFixed(2)}°, center = ${((minDeg + maxDeg) / 2).toFixed(2)}°)`);
}
