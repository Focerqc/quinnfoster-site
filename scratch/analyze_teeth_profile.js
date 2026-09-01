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

console.log(`Centered Y bounds: [${(minY - cy).toFixed(2)}, ${(maxY - cy).toFixed(2)}]`);

// Inspect top face vertices
const topFace = centered.filter(v => v.y > 40);
console.log(`Top face vertices: ${topFace.length}`);

// Sample angle step
const angleStep = 0.5;
const numSteps = Math.round(360 / angleStep);
const rProfile = new Float32Array(numSteps);

for (const v of centered) {
  const r = Math.hypot(v.x, v.z);
  let deg = (Math.atan2(v.z, v.x) * 180 / Math.PI);
  if (deg < 0) deg += 360;
  const idx = Math.floor(deg / angleStep) % numSteps;
  if (r > rProfile[idx]) rProfile[idx] = r;
}

// Print radius vs angle for first 2 slots (0° to 30°)
console.log('Angle vs Max Radius:');
for (let d = 0; d <= 30; d += 1) {
  const idx = Math.floor(d / angleStep) % numSteps;
  console.log(`  ${d.toFixed(1)}°: R = ${rProfile[idx].toFixed(2)} mm`);
}

// Check where R is max (tooth outer shoe tip ~57.5mm) vs min (slot opening ~52-54mm or root)
console.log('\nAll 27 teeth analysis:');
for (let s = 0; s < 27; s++) {
  const centerNominal = s * (360 / 27);
  // find max R in [nominal - 6.66, nominal + 6.66]
  let maxR = -1;
  let maxAngle = 0;
  for (let offset = -6.6; offset <= 6.6; offset += 0.2) {
    let d = (centerNominal + offset + 360) % 360;
    let idx = Math.floor(d / angleStep) % numSteps;
    if (rProfile[idx] > maxR) {
      maxR = rProfile[idx];
      maxAngle = d;
    }
  }
  console.log(`Slot/Tooth ${s}: Nominal=${centerNominal.toFixed(2)}°, Max R=${maxR.toFixed(2)} at angle ${maxAngle.toFixed(2)}°`);
}
