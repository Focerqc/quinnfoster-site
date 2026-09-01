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

// Let's take Tooth 7 (which is at 90° = angle along +Z axis or near it, or let's rotate all vertices so a tooth is centered at X=0, +Z)
// Best offset angle is 10.0° (or let's take Tooth 7 at ~90°)
// For a tooth at angle theta_t, let's rotate vertices by -theta_t into local coordinates:
// localX = x * cos(-theta_t) - z * sin(-theta_t)  (tangential)
// localZ = x * sin(-theta_t) + z * cos(-theta_t)  (radial)
const theta_t = 10.0 * Math.PI / 180; // Tooth 1
const localPoints = [];
for (const v of centered) {
  if (v.y > 40) { // top face
    const lx = v.x * Math.cos(-theta_t) - v.z * Math.sin(-theta_t);
    const lz = v.x * Math.sin(-theta_t) + v.z * Math.cos(-theta_t);
    // filter points near tooth 1: lz > 28, |lx| < 15
    if (lz > 28 && Math.abs(lx) < 15) {
      localPoints.push({ lx, lz, y: v.y });
    }
  }
}

console.log(`Local points near tooth 1: ${localPoints.length}`);

// Find tooth stem width at various radial distances lz:
for (let r = 32; r <= 56; r += 2) {
  const slice = localPoints.filter(p => Math.abs(p.lz - r) <= 1.0);
  if (slice.length > 0) {
    let minLx = Math.min(...slice.map(p => p.lx));
    let maxLx = Math.max(...slice.map(p => p.lx));
    console.log(`Radial R = ${r}mm: tangential X in [${minLx.toFixed(2)}, ${maxLx.toFixed(2)}], width = ${(maxLx - minLx).toFixed(2)}mm`);
  }
}
