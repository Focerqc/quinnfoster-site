const THREE = require('../three.js');
const fs = require('fs');

// 1. Verify syntax of both JS files
console.log('--- Step 1: Checking JS Syntax ---');
try {
  const code8 = fs.readFileSync('./js/experience8-generator.js', 'utf8');
  new Function(code8);
  console.log('✓ js/experience8-generator.js parsed without syntax errors.');
} catch (e) {
  console.error('✗ Syntax error in js/experience8-generator.js:', e);
  process.exit(1);
}

try {
  const code7 = fs.readFileSync('./js/experience7-generator.js', 'utf8');
  new Function(code7);
  console.log('✓ js/experience7-generator.js parsed without syntax errors.');
} catch (e) {
  console.error('✗ Syntax error in js/experience7-generator.js:', e);
  process.exit(1);
}

// 2. Load GLB and test all 27 teeth containment
console.log('\n--- Step 2: Testing Alignment with All 27 Teeth in GLB ---');
const buf = fs.readFileSync('./models/stator_laminations.glb');
const length = buf.readUInt32LE(8);
let offset = 12, jsonChunk = null, binChunk = null;
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
const centeredGLB = raw.map(v => ({ x: v.x - cx, y: v.y - cy, z: v.z - cz }));

function getToothAngle(slotIndex) {
  return (10.0 * Math.PI / 180) + (slotIndex * 2 * Math.PI) / 27;
}

const wStem = 4.8;
const stackLen = 90.0;
const tBundle = 3.0;
const hCrown = 5.0;
const toothRadialDepth = 16.2;
const halfW = (wStem / 2) + tBundle;
const halfH = (stackLen / 2) + hCrown;
const inHalfW = wStem / 2;
const inHalfH = stackLen / 2;
const cornerR = 2.2;
const inCornerR = 0.5;

const shape = new THREE.Shape();
shape.moveTo(-halfW + cornerR, -halfH);
shape.lineTo(halfW - cornerR, -halfH);
shape.quadraticCurveTo(halfW, -halfH, halfW, -halfH + cornerR);
shape.lineTo(halfW, halfH - cornerR);
shape.quadraticCurveTo(halfW, halfH, halfW - cornerR, halfH);
shape.lineTo(-halfW + cornerR, halfH);
shape.quadraticCurveTo(-halfW, halfH, -halfW, halfH - cornerR);
shape.lineTo(-halfW, -halfH + cornerR);
shape.quadraticCurveTo(-halfW, -halfH, -halfW + cornerR, -halfH);

const hole = new THREE.Path();
hole.moveTo(-inHalfW + inCornerR, -inHalfH);
hole.lineTo(inHalfW - inCornerR, -inHalfH);
hole.quadraticCurveTo(inHalfW, -inHalfH, inHalfW, -inHalfH + inCornerR);
hole.lineTo(inHalfW, inHalfH - inCornerR);
hole.quadraticCurveTo(inHalfW, inHalfH, inHalfW - inCornerR, inHalfH);
hole.lineTo(-inHalfW + inCornerR, inHalfH);
hole.quadraticCurveTo(-inHalfW, inHalfH, -inHalfW, inHalfH - inCornerR);
hole.lineTo(-inHalfW, -inHalfH + inCornerR);
hole.quadraticCurveTo(-inHalfW, -inHalfH, -inHalfW + inCornerR, -inHalfH);
shape.holes.push(hole);

const baseCoilGeo = new THREE.ExtrudeGeometry(shape, {
  depth: toothRadialDepth,
  bevelEnabled: true,
  bevelSegments: 3,
  steps: 1,
  bevelSize: 0.5,
  bevelThickness: 0.5
});
baseCoilGeo.center();

const midR = 45.0;
let totalStemPoints = 0;
let totalContainedPoints = 0;

for (let s = 0; s < 27; s++) {
  const toothAngle = getToothAngle(s);
  const mesh = new THREE.Mesh(baseCoilGeo);
  mesh.position.set(midR * Math.cos(toothAngle), 0, midR * Math.sin(toothAngle));
  mesh.rotation.y = -toothAngle + Math.PI / 2;
  mesh.updateMatrixWorld(true);

  const invMatrix = mesh.matrixWorld.clone().invert();
  let sTotal = 0;
  let sContained = 0;

  for (const v of centeredGLB) {
    const r = Math.hypot(v.x, v.z);
    if (r >= 35.8 && r <= 54.0 && Math.abs(v.y) <= 45.1) {
      let deg = Math.atan2(v.z, v.x) * 180 / Math.PI;
      if (deg < 0) deg += 360;
      let toothDeg = (toothAngle * 180 / Math.PI) % 360;
      let dDeg = Math.abs(deg - toothDeg);
      if (dDeg > 180) dDeg = 360 - dDeg;

      if (dDeg < 3.5) {
        sTotal++;
        const pWorld = new THREE.Vector3(v.x, v.y, v.z);
        const pLocal = pWorld.applyMatrix4(invMatrix);
        if (Math.abs(pLocal.x) <= inHalfW + 0.25 && Math.abs(pLocal.y) <= inHalfH + 0.25 && Math.abs(pLocal.z) <= toothRadialDepth / 2 + 1.0) {
          sContained++;
        }
      }
    }
  }

  totalStemPoints += sTotal;
  totalContainedPoints += sContained;
  console.log(`Tooth ${s + 1} (${(toothAngle * 180 / Math.PI).toFixed(1)}°): ${sContained}/${sTotal} points contained (${(sContained / sTotal * 100).toFixed(1)}%)`);
}

console.log(`\nAll 27 Teeth Overall Result: ${totalContainedPoints}/${totalStemPoints} points contained (${(totalContainedPoints / totalStemPoints * 100).toFixed(1)}%)`);
