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

// Indices
let indices = null;
if (jsonChunk.meshes[0].primitives[0].indices !== undefined) {
  const indAcc = jsonChunk.accessors[jsonChunk.meshes[0].primitives[0].indices];
  const indBv = jsonChunk.bufferViews[indAcc.bufferView];
  const indByteOffset = (indBv.byteOffset || 0) + (indAcc.byteOffset || 0);
  if (indAcc.componentType === 5123) { // UNSIGNED_SHORT
    indices = new Uint16Array(binChunk.buffer, binChunk.byteOffset + indByteOffset, indAcc.count);
  } else if (indAcc.componentType === 5125) { // UNSIGNED_INT
    indices = new Uint32Array(binChunk.buffer, binChunk.byteOffset + indByteOffset, indAcc.count);
  }
}

// Transform: scale 1000, Rx(PI/2)
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

// Triangles on top face:
// A triangle on top face has all 3 vertices with y > 44
const topTris = [];
if (indices) {
  for (let i = 0; i < indices.length; i += 3) {
    const v0 = centered[indices[i]];
    const v1 = centered[indices[i + 1]];
    const v2 = centered[indices[i + 2]];
    if (v0.y > 44 && v1.y > 44 && v2.y > 44) {
      // Area and centroid
      const triCx = (v0.x + v1.x + v2.x) / 3;
      const triCz = (v0.z + v1.z + v2.z) / 3;
      // Area in XZ plane
      const area = 0.5 * Math.abs(v0.x * (v1.z - v2.z) + v1.x * (v2.z - v0.z) + v2.x * (v0.z - v1.z));
      const r = Math.hypot(triCx, triCz);
      let deg = Math.atan2(triCz, triCx) * 180 / Math.PI;
      if (deg < 0) deg += 360;
      topTris.push({ cx: triCx, cz: triCz, area, r, deg });
    }
  }
}

console.log(`Top face triangles: ${topTris.length}`);

// We have 27 teeth. Let's find the angular center of mass of the tooth body (r between 35 and 55) for each 360/27 sector!
const pitch = 360 / 27; // 13.333333333333334
console.log(`\nTooth Stem Centroids (r in [36, 52]):`);

// Let's test different angular offsets theta0 from 0 to pitch to find the best alignment of the 27 sectors
for (let offsetDeg = 0; offsetDeg < pitch; offsetDeg += 1) {
  // Check how well the tooth stems are centered in sector [s * pitch + offset - pitch/4, s * pitch + offset + pitch/4]
  let totalWeight = 0;
  for (const tri of topTris) {
    if (tri.r >= 38 && tri.r <= 52) {
      // distance from nearest tooth center
      let d = ((tri.deg - offsetDeg) % pitch + pitch) % pitch;
      if (d > pitch / 2) d -= pitch;
      // if tooth stem is narrow (e.g. ±2 deg), d should be small
      totalWeight += tri.area * (d * d);
    }
  }
  console.log(`Offset ${offsetDeg.toFixed(1)}°: variance metric = ${totalWeight.toFixed(1)}`);
}
