const THREE = require('../three.js');
const fs = require('fs');

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

const tooth1Angle = 10.0 * Math.PI / 180;
const midR = 45.0;

const wStem = 4.8;
const hTooth = 90.0;
const tBundle = 3.0;
const hCrown = 5.0;
const depth = 16.0;
const halfW = wStem / 2 + tBundle;
const halfH = hTooth / 2 + hCrown;
const cornerR = 2.2;

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
const inHalfW = wStem / 2;
const inHalfH = hTooth / 2;
const inR = 0.5;
hole.moveTo(-inHalfW + inR, -inHalfH);
hole.lineTo(inHalfW - inR, -inHalfH);
hole.quadraticCurveTo(inHalfW, -inHalfH, inHalfW, -inHalfH + inR);
hole.lineTo(inHalfW, inHalfH - inR);
hole.quadraticCurveTo(inHalfW, inHalfH, inHalfW - inR, inHalfH);
hole.lineTo(-inHalfW + inR, inHalfH);
hole.quadraticCurveTo(-inHalfW, inHalfH, -inHalfW, inHalfH - inR);
hole.lineTo(-inHalfW, -inHalfH + inR);
hole.quadraticCurveTo(-inHalfW, -inHalfH, -inHalfW + inR, -inHalfH);
shape.holes.push(hole);

const geo = new THREE.ExtrudeGeometry(shape, {
  depth: depth,
  bevelEnabled: true,
  bevelSegments: 3,
  steps: 1,
  bevelSize: 0.5,
  bevelThickness: 0.5
});
geo.center();

const mesh = new THREE.Mesh(geo);
mesh.position.set(midR * Math.cos(tooth1Angle), 0, midR * Math.sin(tooth1Angle));
mesh.rotation.y = -tooth1Angle + Math.PI / 2;
mesh.updateMatrixWorld(true);

const invMatrix = mesh.matrixWorld.clone().invert();

let tooth1PointsInHole = 0;
let tooth1PointsTotal = 0;
for (const v of centeredGLB) {
  const pWorld = new THREE.Vector3(v.x, v.y, v.z);
  const r = Math.hypot(v.x, v.z);
  if (r >= 35.8 && r <= 54.0 && Math.abs(v.y) <= 45.1) {
    let deg = Math.atan2(v.z, v.x) * 180 / Math.PI;
    if (deg < 0) deg += 360;
    if (Math.abs(deg - 10.0) < 4.0) {
      tooth1PointsTotal++;
      const pLocal = pWorld.clone().applyMatrix4(invMatrix);
      // Tooth stem points should have local |x| <= wStem/2 + 0.2 and |y| <= 45.1 and |z| <= depth/2 + 1.0
      if (Math.abs(pLocal.x) <= inHalfW + 0.2 && Math.abs(pLocal.y) <= inHalfH + 0.2 && Math.abs(pLocal.z) <= depth / 2 + 1.0) {
        tooth1PointsInHole++;
      } else {
        console.log(`Point outside hole: local=(${pLocal.x.toFixed(2)}, ${pLocal.y.toFixed(2)}, ${pLocal.z.toFixed(2)}), world=(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`);
      }
    }
  }
}

console.log(`GLB Tooth 1 stem points: total=${tooth1PointsTotal}, inside coil hole=${tooth1PointsInHole} (${(tooth1PointsInHole / tooth1PointsTotal * 100).toFixed(1)}%)`);
