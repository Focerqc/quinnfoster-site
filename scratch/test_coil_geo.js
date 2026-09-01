const THREE = require('../three.js');

// Test creating the coil geometry using ExtrudeGeometry
const wStem = 4.8;
const hTooth = 90.0;
const tBundle = 3.2;
const hCrown = 5.5;
const depth = 16.2;

const halfW = wStem / 2 + tBundle;
const halfH = hTooth / 2 + hCrown;
const cornerR = 2.5;

// Outer rounded rectangle
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

// Inner tooth hole (the tooth stem itself passes through here)
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

const extrudeSettings = {
  depth: depth,
  bevelEnabled: true,
  bevelSegments: 3,
  steps: 1,
  bevelSize: 0.6,
  bevelThickness: 0.6
};

const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
geo.center(); // Center at (0, 0, 0)
geo.computeBoundingBox();

console.log('Coil Geometry generated successfully:');
console.log('Bounding Box Min:', geo.boundingBox.min);
console.log('Bounding Box Max:', geo.boundingBox.max);
console.log('Vertices count:', geo.attributes.position.count);
