const fs = require('fs');

// Read GLB file
const buf = fs.readFileSync('./models/stator_laminations.glb');

// Simple GLB parser to extract position buffer
const magic = buf.readUInt32LE(0);
if (magic !== 0x46546C67) {
  console.log('Not a GLB file');
  process.exit(1);
}
const version = buf.readUInt32LE(4);
const length = buf.readUInt32LE(8);

let jsonChunk = null;
let binChunk = null;

let offset = 12;
while (offset < length) {
  const chunkLength = buf.readUInt32LE(offset);
  const chunkType = buf.readUInt32LE(offset + 4);
  const chunkData = buf.subarray(offset + 8, offset + 8 + chunkLength);
  if (chunkType === 0x4E4F534A) { // JSON
    jsonChunk = JSON.parse(chunkData.toString('utf8'));
  } else if (chunkType === 0x004E4942) { // BIN
    binChunk = chunkData;
  }
  offset += 8 + chunkLength;
}

console.log('GLTF JSON meshes:', jsonChunk.meshes.length);
console.log('GLTF JSON accessors:', jsonChunk.accessors.length);

// Let's find the position accessor
let posAccessorIdx = null;
for (const mesh of jsonChunk.meshes) {
  for (const prim of mesh.primitives) {
    if (prim.attributes.POSITION !== undefined) {
      posAccessorIdx = prim.attributes.POSITION;
      break;
    }
  }
}

if (posAccessorIdx !== null && binChunk) {
  const acc = jsonChunk.accessors[posAccessorIdx];
  const bv = jsonChunk.bufferViews[acc.bufferView];
  const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const count = acc.count;
  console.log(`Vertex count: ${count}, type: ${acc.type}, componentType: ${acc.componentType}`);
  
  // Float32 (5126)
  const floatView = new Float32Array(binChunk.buffer, binChunk.byteOffset + byteOffset, count * 3);
  
  // Note: in experience8-generator.js, statorMesh has:
  // scale(1000, 1000, 1000)
  // rotation.x = Math.PI / 2
  // And centered via Box3 center subtraction.
  
  // Let's compute transformed vertices:
  // Original (x, y, z)
  // Rotated by Rx(PI/2):
  // newX = x * 1000
  // newY = -z * 1000
  // newZ = y * 1000
  
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  const verts = [];
  for (let i = 0; i < count; i++) {
    const x = floatView[i * 3] * 1000;
    const y = -floatView[i * 3 + 2] * 1000;
    const z = floatView[i * 3 + 1] * 1000;
    verts.push({ x, y, z });
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  
  console.log(`Bounds X: [${minX.toFixed(2)}, ${maxX.toFixed(2)}], center: ${cx.toFixed(2)}`);
  console.log(`Bounds Y: [${minY.toFixed(2)}, ${maxY.toFixed(2)}], center: ${cy.toFixed(2)}`);
  console.log(`Bounds Z: [${minZ.toFixed(2)}, ${maxZ.toFixed(2)}], center: ${cz.toFixed(2)}`);
  
  // Center them
  const centered = verts.map(v => ({ x: v.x - cx, y: v.y - cy, z: v.z - cz }));
  
  // Let's analyze radial distance R = sqrt(x^2 + z^2) and angle theta = atan2(z, x)
  // Outer radius is ~57.5mm (115mm OD)
  // Let's sample angles around the circle and find where the teeth (maximum outer radius) and slots are located!
  
  const angleBins = 360;
  const maxRAtAngle = new Float32Array(angleBins);
  
  for (const v of centered) {
    const r = Math.hypot(v.x, v.z);
    let deg = (Math.atan2(v.z, v.x) * 180 / Math.PI);
    if (deg < 0) deg += 360;
    const bin = Math.floor(deg) % 360;
    if (r > maxRAtAngle[bin]) {
      maxRAtAngle[bin] = r;
    }
  }
  
  // Find local peaks in maxRAtAngle (stator tooth centers at outer diameter)
  console.log('\nAnalyzing Stator Teeth angular positions in X-Z plane:');
  
  // Also let's check inner yoke / slot root vs tooth stem
  // Let's sample at intermediate radius (e.g. r between 35 and 50)
  const intermediateBins = new Array(720).fill(0);
  const countInBin = new Array(720).fill(0);
  for (const v of centered) {
    const r = Math.hypot(v.x, v.z);
    if (r > 35 && r < 52) {
      let deg = (Math.atan2(v.z, v.x) * 180 / Math.PI);
      if (deg < 0) deg += 360;
      const bin = Math.floor(deg * 2) % 720;
      countInBin[bin]++;
    }
  }
  
  // Print peaks
  console.log('Peak density / teeth positions (samples):');
  for (let s = 0; s < 27; s++) {
    const nominalDeg = s * (360 / 27);
    // search around nominalDeg
    let maxCount = -1;
    let bestDeg = nominalDeg;
    for (let d = nominalDeg - 6; d <= nominalDeg + 6; d += 0.5) {
      let checkDeg = (d + 360) % 360;
      const bin = Math.floor(checkDeg * 2);
      if (countInBin[bin] > maxCount) {
        maxCount = countInBin[bin];
        bestDeg = checkDeg;
      }
    }
    console.log(`Tooth index ${s}: nominal=${nominalDeg.toFixed(2)}°, detected peak=${bestDeg.toFixed(2)}°, diff=${(bestDeg - nominalDeg).toFixed(2)}°`);
  }
}
