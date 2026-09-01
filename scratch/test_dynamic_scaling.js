const THREE = require('../three.js');

const WIRE_GAUGE_DB = [
  { awg: 18, totalDiaMm: 1.09 },
  { awg: 28, totalDiaMm: 0.36 },
  { awg: 32, totalDiaMm: 0.23 }
];

function testCoilScaling(turns, strands, awg) {
  const wire = WIRE_GAUGE_DB.find(w => w.awg === awg) || WIRE_GAUGE_DB[1];
  const wireDia = wire.totalDiaMm;
  const singleWireArea = Math.PI * (wireDia / 2) ** 2;
  const totalConductorArea = turns * strands * singleWireArea; // mm² per coil side

  // Radial tooth depth in slot = 16.0 mm
  // In a slot, packing fraction with enamel and air voids is ~ 1.35
  const packedArea = totalConductorArea * 1.35;
  
  // Tangential bundle thickness (mm)
  // Clamp between 0.45mm (min thin ribbon) and 3.8mm (max slot full)
  const rawThickness = packedArea / 7.5; 
  const tBundle = Math.min(3.8, Math.max(0.45, rawThickness));

  // End-turn crown height above stack top (mm)
  // Clamp between 0.7mm and 7.5mm
  const rawCrown = 0.5 + (packedArea / 4.2);
  const hCrown = Math.min(7.5, Math.max(0.7, rawCrown));

  const wStem = 4.8;
  const stackLen = 90.0;
  const halfW = (wStem / 2) + tBundle;
  const halfH = (stackLen / 2) + hCrown;
  const inHalfW = wStem / 2;
  const inHalfH = stackLen / 2;
  const cornerR = Math.min(halfW - 0.2, Math.max(0.4, hCrown * 0.4));

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
  hole.moveTo(-inHalfW, -inHalfH);
  hole.lineTo(inHalfW, -inHalfH);
  hole.lineTo(inHalfW, inHalfH);
  hole.lineTo(-inHalfW, inHalfH);
  hole.lineTo(-inHalfW, -inHalfH);
  shape.holes.push(hole);

  const bevel = Math.min(0.4, tBundle * 0.25);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 16.2,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: bevel,
    bevelThickness: bevel
  });
  geo.center();
  geo.computeBoundingBox();

  console.log(`\n--- Config: ${turns}T, ${strands}x, AWG${awg} ---`);
  console.log(`Conductor Area: ${totalConductorArea.toFixed(2)} mm²`);
  console.log(`tBundle (thickness): ${tBundle.toFixed(2)} mm (total width = ${(wStem + 2 * tBundle).toFixed(2)} mm)`);
  console.log(`hCrown (height ext): ${hCrown.toFixed(2)} mm (total height = ${(stackLen + 2 * hCrown).toFixed(2)} mm)`);
  console.log(`Bounding Box X: [${geo.boundingBox.min.x.toFixed(2)}, ${geo.boundingBox.max.x.toFixed(2)}]`);
  console.log(`Bounding Box Y: [${geo.boundingBox.min.y.toFixed(2)}, ${geo.boundingBox.max.y.toFixed(2)}]`);
}

// Test minimum settings (Turns = 2, Strands = 1, 28 AWG)
testCoilScaling(2, 1, 28);

// Test typical settings (Turns = 6, Strands = 18, 28 AWG)
testCoilScaling(6, 18, 28);

// Test maximum settings (Turns = 10, Strands = 24, 28 AWG)
testCoilScaling(10, 24, 28);

// Test thick wire (Turns = 6, Strands = 1, 18 AWG)
testCoilScaling(6, 1, 18);
