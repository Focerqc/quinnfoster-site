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

const indAcc = jsonChunk.accessors[jsonChunk.meshes[0].primitives[0].indices];
const indBv = jsonChunk.bufferViews[indAcc.bufferView];
const indByteOffset = (indBv.byteOffset || 0) + (indAcc.byteOffset || 0);
const indices = indAcc.componentType === 5123
  ? new Uint16Array(binChunk.buffer, binChunk.byteOffset + indByteOffset, indAcc.count)
  : new Uint32Array(binChunk.buffer, binChunk.byteOffset + indByteOffset, indAcc.count);

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

const topTris = [];
for (let i = 0; i < indices.length; i += 3) {
  const v0 = centered[indices[i]];
  const v1 = centered[indices[i + 1]];
  const v2 = centered[indices[i + 2]];
  if (v0.y > 44 && v1.y > 44 && v2.y > 44) {
    const triCx = (v0.x + v1.x + v2.x) / 3;
    const triCz = (v0.z + v1.z + v2.z) / 3;
    const area = 0.5 * Math.abs(v0.x * (v1.z - v2.z) + v1.x * (v2.z - v0.z) + v2.x * (v0.z - v1.z));
    const r = Math.hypot(triCx, triCz);
    let deg = Math.atan2(triCz, triCx) * 180 / Math.PI;
    if (deg < 0) deg += 360;
    topTris.push({ cx: triCx, cz: triCz, area, r, deg });
  }
}

const pitch = 360 / 27;

let minVar = Infinity;
let bestOffset = 0;

for (let offsetDeg = 9.0; offsetDeg <= 11.0; offsetDeg += 0.05) {
  let totalWeight = 0;
  for (const tri of topTris) {
    if (tri.r >= 38 && tri.r <= 52) {
      let d = ((tri.deg - offsetDeg) % pitch + pitch) % pitch;
      if (d > pitch / 2) d -= pitch;
      totalWeight += tri.area * (d * d);
    }
  }
  if (totalWeight < minVar) {
    minVar = totalWeight;
    bestOffset = offsetDeg;
  }
}

console.log(`Optimal Tooth Offset angle: ${bestOffset.toFixed(3)}° (${(bestOffset * Math.PI / 180).toFixed(5)} rad)`);

// Now let's calculate the exact center angle of each of the 27 teeth:
console.log('\nExact 27 Tooth Centroids in GLB:');
for (let s = 0; s < 27; s++) {
  const nominal = (s * pitch + bestOffset) % 360;
  let sumDegArea = 0;
  let sumArea = 0;
  for (const tri of topTris) {
    if (tri.r >= 38 && tri.r <= 52) {
      let d = tri.deg - nominal;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      if (Math.abs(d) < pitch / 2) {
        sumDegArea += (nominal + d) * tri.area;
        sumArea += tri.area;
      }
    }
  }
  const actualCenter = sumArea > 0 ? (sumDegArea / sumArea + 360) % 360 : nominal;
  console.log(`Tooth ${s + 1}: angle = ${actualCenter.toFixed(2)}° (rad = ${(actualCenter * Math.PI / 180).toFixed(4)})`);
}
