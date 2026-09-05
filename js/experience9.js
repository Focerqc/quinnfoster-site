/**
 * Experience 9: 2.5D Isometric PEV / Onewheel Trail Carve & Street Park
 * Author: Quinn Foster
 * Engine: Three.js Orthographic 2.5D Isometric Physics & Renderer
 */

(function () {
  'use strict';

  // --- Constants & Config ---
  const GRAVITY = -28.0;         // m/s^2
  const MAX_SPEED = 10.8;        // ~24.2 MPH
  const ACCELERATION = 24.0;     // m/s^2
  const DECELERATION = 16.0;     // m/s^2 (coasting/regenerative friction)
  const JUMP_VELOCITY = 7.6;     // m/s initial jump impulse
  const TIRE_RADIUS = 0.14;      // ~11 inch tire radius
  const TURN_SPEED = 9.0;        // rad/s angular responsiveness

  // --- Game State ---
  const state = {
    player: {
      x: 0,
      y: 0.15,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      speed: 0,
      heading: 0,                // board yaw angle (radians)
      pitch: 0,                  // nose-down/up tilt
      roll: 0,                   // carving bank roll
      isAirborne: false,
      isGrinding: false,
      grindTimer: 0,
      airtime: 0,
      groundY: 0,
      currentZone: 'Central Town Square',
      zoneType: 'CHILL',
    },
    input: {
      up: false,
      down: false,
      left: false,
      right: false,
      jump: false,
      jumpPressed: false,        // edge trigger
      joystickActive: false,
      joystickVector: { x: 0, y: 0 },
    },
    obstacles: [],               // collision boxes, ledges, rails, ramps
    trailSigns: [],
    particles: [],
    speedLines: [],
    clock: new THREE.Clock(),
  };

  // --- DOM Elements ---
  let container, canvas;
  let hudSpeedVal, hudSpeedBar, hudTerrainVal;
  let compassArrow, compassDist;
  let areaToast, areaBadge, areaName, trickToast, trickText;
  let btnRespawn, btnFullscreen, btnTouchJump;
  let joystickZone, joystickBase, joystickThumb;

  // --- Three.js Globals ---
  let scene, camera, renderer;
  let boardGroup, wheelMesh, chassisMesh, shadowMesh;
  let headlightSpot, taillightGlow;
  let particleGroup, speedLinesGroup;

  // --- Init on DOM Load ---
  window.addEventListener('DOMContentLoaded', () => {
    initDOMElements();
    initThreeScene();
    buildWorld();
    loadX7BoardModel();
    initControls();
    initParticlesAndFX();
    window.addEventListener('resize', onWindowResize);
    onWindowResize();

    // Start Animation Loop
    animate();
  });

  // ==========================================================================
  // 1. DOM Elements & HUD Binding
  // ==========================================================================
  function initDOMElements() {
    container = document.getElementById('gameContainer');
    canvas = document.getElementById('gameCanvas');

    hudSpeedVal = document.getElementById('hudSpeedVal');
    hudSpeedBar = document.getElementById('hudSpeedBar');
    hudTerrainVal = document.getElementById('hudTerrainVal');

    compassArrow = document.getElementById('compassArrow');
    compassDist = document.getElementById('compassDist');

    areaToast = document.getElementById('areaToast');
    areaBadge = document.getElementById('areaBadge');
    areaName = document.getElementById('areaName');
    trickToast = document.getElementById('trickToast');
    trickText = document.getElementById('trickText');

    btnRespawn = document.getElementById('btnRespawn');
    btnFullscreen = document.getElementById('btnFullscreen');
    btnTouchJump = document.getElementById('btnTouchJump');

    joystickZone = document.getElementById('joystickZone');
    joystickBase = document.getElementById('joystickBase');
    joystickThumb = document.getElementById('joystickThumb');

    if (btnRespawn) btnRespawn.addEventListener('click', respawnPlayer);
    if (btnFullscreen) btnFullscreen.addEventListener('click', toggleFullscreen);
  }

  // ==========================================================================
  // 2. Three.js Isometric Scene & Camera Setup
  // ==========================================================================
  function initThreeScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c121e);
    scene.fog = new THREE.FogExp2(0x0c121e, 0.009);

    // Fixed 2.5D Isometric Orthographic Camera
    // Classic isometric angle: azimuth 45 deg, elevation atan(1/sqrt(2)) = 35.264 deg
    const aspect = container.clientWidth / container.clientHeight;
    const frustumSize = 18; // Viewport width in meters
    camera = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      -100,
      300
    );

    // Position camera diagonally up-right in world space
    camera.position.set(30, 24.49, 30); // 30 * sqrt(2/3) ~ 24.49 for exact isometric
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // --- Lighting ---
    // Ambient fill
    const ambientLight = new THREE.AmbientLight(0xd9e5f5, 0.65);
    scene.add(ambientLight);

    // Hemisphere light (sky vs ground bounce)
    const hemiLight = new THREE.HemisphereLight(0xeef5ff, 0x1f2937, 0.4);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    // Directional Sun Light casting crisp soft shadows
    const sunLight = new THREE.DirectionalLight(0xfff7ea, 0.95);
    sunLight.position.set(45, 60, 35);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 150;

    const shadowBoxSize = 30;
    sunLight.shadow.camera.left = -shadowBoxSize;
    sunLight.shadow.camera.right = shadowBoxSize;
    sunLight.shadow.camera.top = shadowBoxSize;
    sunLight.shadow.camera.bottom = -shadowBoxSize;
    sunLight.shadow.bias = -0.0008;
    scene.add(sunLight);

    // Create Root Board Group
    boardGroup = new THREE.Group();
    boardGroup.position.set(state.player.x, state.player.y, state.player.z);
    scene.add(boardGroup);

    // Dynamic Drop Shadow Decal directly beneath the board
    const shadowGeo = new THREE.PlaneGeometry(0.85, 0.42);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 64;
    shadowCanvas.height = 64;
    const ctx = shadowCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
    grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.35)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });
    shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.position.set(0, 0.02, 0);
    scene.add(shadowMesh);
  }

  // ==========================================================================
  // 3. World Generation: Town Square + Street Park + 4 Cardinal Trails
  // ==========================================================================
  function buildWorld() {
    // 1. Base Terrain Ground Plane
    const groundGeo = new THREE.PlaneGeometry(300, 300, 60, 60);
    groundGeo.rotateX(-Math.PI / 2);

    // Vertex colors for smooth gradient transition between biomes
    const colors = [];
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const gx = pos.getX(i);
      const gz = pos.getZ(i);

      let col = new THREE.Color(0x2d3748); // City asphalt/pavement slate

      // Distance from center
      const dist = Math.hypot(gx, gz);

      if (dist > 22) {
        // Transition into 4 cardinal biomes:
        if (gz < -20 && Math.abs(gx) < Math.abs(gz)) {
          // North: Mountain (Dark granite / slate rock)
          col = new THREE.Color(0x334155).lerp(new THREE.Color(0x1e293b), Math.min(1, (-gz - 20) / 60));
        } else if (gz > 20 && Math.abs(gx) < Math.abs(gz)) {
          // South: Cactus Canyon (Terracotta / Red Sand)
          col = new THREE.Color(0xc26d42).lerp(new THREE.Color(0xb4532b), Math.min(1, (gz - 20) / 60));
        } else if (gx > 20 && Math.abs(gz) < Math.abs(gx)) {
          // East: Pine Ridge (Deep moss forest green)
          col = new THREE.Color(0x2f603c).lerp(new THREE.Color(0x1e3a29), Math.min(1, (gx - 20) / 60));
        } else if (gx < -20 && Math.abs(gz) < Math.abs(gx)) {
          // West: Slickrock Bluff (Warm sandstone / orange rock)
          col = new THREE.Color(0xd97736).lerp(new THREE.Color(0x9a3412), Math.min(1, (-gx - 20) / 60));
        }
      }

      colors.push(col.r, col.g, col.b);
    }
    groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const groundMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      roughness: 0.9,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // 2. Central Plaza Pavers (Town Square)
    const plazaGeo = new THREE.BoxGeometry(38, 0.12, 38);
    const plazaMat = new THREE.MeshStandardMaterial({
      color: 0x4a5568,
      roughness: 0.7,
      metalness: 0.1,
    });
    const plazaMesh = new THREE.Mesh(plazaGeo, plazaMat);
    plazaMesh.position.set(0, 0.06, 0);
    plazaMesh.receiveShadow = true;
    scene.add(plazaMesh);

    // Center Inset Mosaic / Charging Pad
    const padGeo = new THREE.BoxGeometry(10, 0.16, 10);
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x6366f1,
      roughness: 0.4,
      metalness: 0.4,
      emissive: 0x24285b,
      emissiveIntensity: 0.3,
    });
    const padMesh = new THREE.Mesh(padGeo, padMat);
    padMesh.position.set(0, 0.08, 0);
    padMesh.receiveShadow = true;
    scene.add(padMesh);

    // 3. Street Park Features (Town Square)
    createStreetParkFeatures();

    // 4. Trail Entrances & Signposts (North, South, East, West)
    createTrailSign('North: Thunder Peak', '[JUMP LINE]', 0, -32, 0, 0xf59e0b);
    createTrailSign('South: Cactus Canyon', '[CHILL TRAIL]', 0, 32, Math.PI, 0x14b8a6);
    createTrailSign('East: Pine Ridge', '[CHILL TRAIL]', 32, 0, Math.PI / 2, 0x14b8a6);
    createTrailSign('West: Slickrock Bluff', '[JUMP LINE]', -32, 0, -Math.PI / 2, 0xf59e0b);

    // 5. Scenery Objects (Trees, Boulders, Cacti, Boardwalks)
    populateScenery();
  }

  // Street Park Obstacles (Rails, Ledges, Ramps, Gaps)
  function createStreetParkFeatures() {
    // A. Concrete Skate Ledge (North-East Plaza)
    const ledgeWidth = 1.6;
    const ledgeLength = 8.5;
    const ledgeHeight = 0.42;
    const ledgeGeo = new THREE.BoxGeometry(ledgeWidth, ledgeHeight, ledgeLength);
    const ledgeMat = new THREE.MeshStandardMaterial({ color: 0x8892b0, roughness: 0.6 });
    const ledge = new THREE.Mesh(ledgeGeo, ledgeMat);
    ledge.position.set(9, ledgeHeight / 2, -6);
    ledge.castShadow = true;
    ledge.receiveShadow = true;
    scene.add(ledge);

    // Metal coping along ledge edge
    const copingGeo = new THREE.CylinderGeometry(0.04, 0.04, ledgeLength, 8);
    const copingMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 });
    const coping = new THREE.Mesh(copingGeo, copingMat);
    coping.position.set(9 + ledgeWidth / 2, ledgeHeight, -6);
    coping.castShadow = true;
    scene.add(coping);

    registerObstacle({
      type: 'ledge',
      x: 9,
      z: -6,
      width: ledgeWidth + 0.2,
      length: ledgeLength,
      height: ledgeHeight,
    });

    // B. Low Grind Rail (South-West Plaza)
    const railLength = 11.0;
    const railHeight = 0.38;
    const railGeo = new THREE.CylinderGeometry(0.045, 0.045, railLength, 12);
    railGeo.rotateX(Math.PI / 2);
    const railMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.9, roughness: 0.25 }); // Vibrant yellow rail
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(-8, railHeight, 7);
    rail.castShadow = true;
    scene.add(rail);

    // Support posts for rail
    [-4, 0, 4].forEach(offset => {
      const postGeo = new THREE.CylinderGeometry(0.035, 0.035, railHeight, 8);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8 });
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(-8, railHeight / 2, 7 + offset);
      post.castShadow = true;
      scene.add(post);
    });

    registerObstacle({
      type: 'rail',
      x: -8,
      z: 7,
      width: 0.35,
      length: railLength,
      height: railHeight,
    });

    // C. Wooden Kicker Launch Ramp (Launches North toward Town Exit)
    createKickerRamp(-4, -13, 2.5, 3.2, 0.7, 0); // Facing North

    // D. Second Kicker Ramp (Launches East)
    createKickerRamp(12, 6, 2.5, 3.2, 0.65, Math.PI / 2); // Facing East

    // E. Curbs around the perimeter of the Plaza
    createCurbs();
  }

  // Create Kicker Ramp (Wedge Geometry)
  function createKickerRamp(x, z, width, length, height, rotation) {
    const rampGroup = new THREE.Group();

    // Build triangular prism
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0, height);
    shape.lineTo(length, 0);
    shape.closePath();

    const extrudeSettings = {
      steps: 1,
      depth: width,
      bevelEnabled: false,
    };
    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Center extrusion
    geom.center();

    const woodMat = new THREE.MeshStandardMaterial({
      color: 0xcd853f,
      roughness: 0.7,
      metalness: 0.1,
    });
    const rampMesh = new THREE.Mesh(geom, woodMat);
    rampMesh.position.set(0, height / 2, 0);
    rampMesh.rotation.y = -Math.PI / 2; // Orient along run
    rampMesh.castShadow = true;
    rampMesh.receiveShadow = true;
    rampGroup.add(rampMesh);

    rampGroup.position.set(x, 0, z);
    rampGroup.rotation.y = rotation;
    scene.add(rampGroup);

    registerObstacle({
      type: 'kicker',
      x: x,
      z: z,
      width: width,
      length: length,
      height: height,
      rotation: rotation,
    });
  }

  // Curbs surrounding the plaza
  function createCurbs() {
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7 });
    const curbH = 0.22;
    const curbW = 0.35;
    const half = 19;

    // 4 borders with curb-cuts (gaps) in the center for road exits
    const sides = [
      { x: 0, z: -half, len: 14, rot: 0, offX: -11 },
      { x: 0, z: -half, len: 14, rot: 0, offX: 11 },
      { x: 0, z: half, len: 14, rot: 0, offX: -11 },
      { x: 0, z: half, len: 14, rot: 0, offX: 11 },
      { x: -half, z: 0, len: 14, rot: Math.PI / 2, offZ: -11 },
      { x: -half, z: 0, len: 14, rot: Math.PI / 2, offZ: 11 },
      { x: half, z: 0, len: 14, rot: Math.PI / 2, offZ: -11 },
      { x: half, z: 0, len: 14, rot: Math.PI / 2, offZ: 11 },
    ];

    sides.forEach(s => {
      const curbGeo = new THREE.BoxGeometry(s.len, curbH, curbW);
      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.position.set(s.x + (s.offX || 0), curbH / 2, s.z + (s.offZ || 0));
      curb.rotation.y = s.rot;
      curb.castShadow = true;
      curb.receiveShadow = true;
      scene.add(curb);

      registerObstacle({
        type: 'curb',
        x: curb.position.x,
        z: curb.position.z,
        width: s.rot === 0 ? s.len : curbW,
        length: s.rot === 0 ? curbW : s.len,
        height: curbH,
      });
    });
  }

  // Large Readable Isometric Archway Trail Signs
  function createTrailSign(title, badgeText, x, z, rotation, badgeColorHex) {
    const group = new THREE.Group();

    // Wooden Archway Posts
    const postMat = new THREE.MeshStandardMaterial({ color: 0x472d1d, roughness: 0.85 });
    const postH = 4.2;
    const postGeo = new THREE.BoxGeometry(0.35, postH, 0.35);

    const postL = new THREE.Mesh(postGeo, postMat);
    postL.position.set(-3.2, postH / 2, 0);
    postL.castShadow = true;
    group.add(postL);

    const postR = new THREE.Mesh(postGeo, postMat);
    postR.position.set(3.2, postH / 2, 0);
    postR.castShadow = true;
    group.add(postR);

    // Cross beam
    const beamGeo = new THREE.BoxGeometry(7.0, 0.4, 0.35);
    const beam = new THREE.Mesh(beamGeo, postMat);
    beam.position.set(0, postH - 0.2, 0);
    beam.castShadow = true;
    group.add(beam);

    // Signboard Texture rendered via Canvas for razor-sharp typography
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 160;
    const sCtx = signCanvas.getContext('2d');

    // Board background
    sCtx.fillStyle = '#1e1610';
    sCtx.fillRect(0, 0, 512, 160);
    sCtx.lineWidth = 8;
    sCtx.strokeStyle = '#8d5b38';
    sCtx.strokeRect(4, 4, 504, 152);

    // Badge background
    sCtx.fillStyle = '#' + badgeColorHex.toString(16).padStart(6, '0');
    sCtx.beginPath();
    sCtx.roundRect(140, 20, 232, 38, 8);
    sCtx.fill();

    // Badge text
    sCtx.fillStyle = '#0f172a';
    sCtx.font = 'bold 22px system-ui, sans-serif';
    sCtx.textAlign = 'center';
    sCtx.fillText(badgeText, 256, 47);

    // Title text
    sCtx.fillStyle = '#f8fafc';
    sCtx.font = 'bold 36px system-ui, sans-serif';
    sCtx.fillText(title.toUpperCase(), 256, 118);

    const signTex = new THREE.CanvasTexture(signCanvas);
    const signGeo = new THREE.PlaneGeometry(5.2, 1.6);
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    const signMesh = new THREE.Mesh(signGeo, signMat);
    signMesh.position.set(0, postH - 1.2, 0);
    signMesh.castShadow = true;
    group.add(signMesh);

    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    scene.add(group);

    state.trailSigns.push({
      title: title,
      badge: badgeText,
      x: x,
      z: z,
    });
  }

  // Populate Trees, Boulders, Cacti, and Boardwalks across the 4 Trailheads
  function populateScenery() {
    // North (Mountain: Rocks, Slate Ledges, Kicker Gaps)
    for (let i = 0; i < 18; i++) {
      const rx = (Math.random() - 0.5) * 55;
      const rz = -38 - Math.random() * 70;
      createBoulder(rx, rz, 1.2 + Math.random() * 2.2, 0x475569);
    }
    // Mountain jump kicker
    createKickerRamp(0, -65, 3.5, 4.2, 1.1, 0);
    createKickerRamp(-10, -90, 3.0, 3.8, 0.95, -0.2);

    // South (Desert: Saguaro Cacti, Red Sandstone Meshas, Dunes)
    for (let i = 0; i < 22; i++) {
      const rx = (Math.random() - 0.5) * 55;
      const rz = 38 + Math.random() * 70;
      if (Math.random() > 0.4) {
        createCactus(rx, rz, 1.8 + Math.random() * 1.5);
      } else {
        createBoulder(rx, rz, 1.5 + Math.random() * 2.5, 0x9a3412);
      }
    }

    // East (Pine Ridge: Pine Trees, Wooden Boardwalks)
    for (let i = 0; i < 26; i++) {
      const rx = 38 + Math.random() * 70;
      const rz = (Math.random() - 0.5) * 55;
      createPineTree(rx, rz, 2.5 + Math.random() * 2.2);
    }
    // Wooden boardwalk bridge path
    createBoardwalk(55, 0, 24, 3.2);

    // West (Slickrock Bluff: Sandstone Bowls, Launch Ledges)
    for (let i = 0; i < 20; i++) {
      const rx = -38 - Math.random() * 70;
      const rz = (Math.random() - 0.5) * 55;
      createBoulder(rx, rz, 2.0 + Math.random() * 3.5, 0xc2410c);
    }
    createKickerRamp(-60, 4, 3.8, 4.5, 1.2, -Math.PI / 2);
  }

  // Pine Tree
  function createPineTree(x, z, scale) {
    const tree = new THREE.Group();
    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.18 * scale, 0.25 * scale, 1.2 * scale, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = (1.2 * scale) / 2;
    trunk.castShadow = true;
    tree.add(trunk);

    // 3 Foliage Cones
    const folMat = new THREE.MeshStandardMaterial({ color: 0x1e3a29, roughness: 0.8 });
    [1.0, 1.8, 2.5].forEach((yOff, idx) => {
      const coneR = (1.3 - idx * 0.3) * scale;
      const coneH = (1.4 - idx * 0.2) * scale;
      const coneGeo = new THREE.ConeGeometry(coneR, coneH, 6);
      const cone = new THREE.Mesh(coneGeo, folMat);
      cone.position.y = yOff * scale;
      cone.castShadow = true;
      cone.receiveShadow = true;
      tree.add(cone);
    });

    tree.position.set(x, 0, z);
    scene.add(tree);
  }

  // Desert Saguaro Cactus
  function createCactus(x, z, scale) {
    const cactus = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.85 });

    // Main Stem
    const stemGeo = new THREE.CylinderGeometry(0.22 * scale, 0.25 * scale, 2.8 * scale, 8);
    const stem = new THREE.Mesh(stemGeo, mat);
    stem.position.y = (2.8 * scale) / 2;
    stem.castShadow = true;
    cactus.add(stem);

    // Left Arm
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * scale, 0.14 * scale, 0.9 * scale, 6), mat);
    armL.position.set(-0.45 * scale, 1.4 * scale, 0);
    armL.rotation.z = Math.PI / 2;
    cactus.add(armL);

    const armLUp = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * scale, 0.14 * scale, 0.9 * scale, 6), mat);
    armLUp.position.set(-0.85 * scale, 1.8 * scale, 0);
    cactus.add(armLUp);

    cactus.position.set(x, 0, z);
    scene.add(cactus);
  }

  // Rock / Boulder
  function createBoulder(x, z, scale, color) {
    const geo = new THREE.DodecahedronGeometry(scale, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.9,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, scale * 0.6, z);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    mesh.scale.set(1.2, 0.8, 1.0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Wooden Boardwalk Platform
  function createBoardwalk(x, z, length, width) {
    const geo = new THREE.BoxGeometry(length, 0.28, width);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.75 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.14, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    registerObstacle({
      type: 'boardwalk',
      x: x,
      z: z,
      width: length,
      length: width,
      height: 0.28,
    });
  }

  function registerObstacle(obs) {
    state.obstacles.push(obs);
  }

  // ==========================================================================
  // 4. Loading Quinn's Optimized Fungineers X7 Model
  // ==========================================================================
  function loadX7BoardModel() {
    // 1. Setup Procedural Stand-in immediately so there is zero load delay
    setupProceduralBoard();

    // 2. Load the optimized models/x7_board.glb
    if (typeof THREE.GLTFLoader === 'undefined') {
      console.warn('GLTFLoader not found, using procedural X7 board.');
      return;
    }

    const loader = new THREE.GLTFLoader();
    loader.load(
      'models/x7_board.glb',
      (gltf) => {
        console.log('Successfully loaded models/x7_board.glb!');
        const model = gltf.scene;

        // Clear procedural meshes
        while (boardGroup.children.length > 0) {
          boardGroup.remove(boardGroup.children[0]);
        }

        // Re-add lights
        setupBoardLights();

        // Traverse model to configure shadows and identify tire vs chassis
        let foundTire = null;
        const chassisGroup = new THREE.Group();

        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            // Detect tire / motor hub by geometry size or name
            const bbox = new THREE.Box3().setFromObject(child);
            const sz = bbox.getSize(new THREE.Vector3());
            if (sz.x < 0.35 && sz.y < 0.35 && sz.z < 0.35 && !foundTire) {
              // likely the wheel
              foundTire = child;
            }
          }
        });

        // Center and scale model appropriately
        const rootBbox = new THREE.Box3().setFromObject(model);
        const center = rootBbox.getCenter(new THREE.Vector3());
        model.position.sub(center);
        model.position.y += 0.14; // tire radius elevation

        chassisMesh = model;
        boardGroup.add(chassisMesh);

        // Store wheelMesh reference for rotation
        wheelMesh = foundTire || chassisMesh;
      },
      undefined,
      (err) => {
        console.warn('Could not load models/x7_board.glb (using procedural):', err);
      }
    );
  }

  // Fallback / Instant Procedural Onewheel
  function setupProceduralBoard() {
    while (boardGroup.children.length > 0) {
      boardGroup.remove(boardGroup.children[0]);
    }

    // A. Chunky Central Go-Kart Tire
    const tireGeo = new THREE.CylinderGeometry(TIRE_RADIUS, TIRE_RADIUS, 0.18, 24);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.85,
      metalness: 0.1,
    });
    wheelMesh = new THREE.Mesh(tireGeo, tireMat);
    wheelMesh.position.set(0, TIRE_RADIUS, 0);
    wheelMesh.castShadow = true;
    boardGroup.add(wheelMesh);

    // Motor Hub Sideplate
    const hubGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.185, 16);
    hubGeo.rotateZ(Math.PI / 2);
    const hubMat = new THREE.MeshStandardMaterial({
      color: 0xb45309, // Anodized bronze/gold Superflux
      metalness: 0.8,
      roughness: 0.25,
    });
    const hubMesh = new THREE.Mesh(hubGeo, hubMat);
    wheelMesh.add(hubMesh);

    // B. CNC Rails (Anodized Slate Blue)
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      metalness: 0.7,
      roughness: 0.3,
    });
    const railGeo = new THREE.BoxGeometry(0.03, 0.045, 0.74);

    const railLeft = new THREE.Mesh(railGeo, railMat);
    railLeft.position.set(-0.115, TIRE_RADIUS, 0);
    railLeft.castShadow = true;
    boardGroup.add(railLeft);

    const railRight = new THREE.Mesh(railGeo, railMat);
    railRight.position.set(0.115, TIRE_RADIUS, 0);
    railRight.castShadow = true;
    boardGroup.add(railRight);

    // C. Footpads (Front & Rear Stompies)
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.95,
    });
    const padGeo = new THREE.BoxGeometry(0.23, 0.03, 0.24);

    const padFront = new THREE.Mesh(padGeo, padMat);
    padFront.position.set(0, TIRE_RADIUS + 0.035, -0.22);
    padFront.castShadow = true;
    boardGroup.add(padFront);

    const padRear = new THREE.Mesh(padGeo, padMat);
    padRear.position.set(0, TIRE_RADIUS + 0.035, 0.22);
    padRear.castShadow = true;
    boardGroup.add(padRear);

    // D. Front & Rear Bumpers (DANG Bumpers)
    const bumperMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
    const bumperFront = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.1), bumperMat);
    bumperFront.position.set(0, TIRE_RADIUS - 0.01, -0.34);
    boardGroup.add(bumperFront);

    const bumperRear = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.1), bumperMat);
    bumperRear.position.set(0, TIRE_RADIUS - 0.01, 0.34);
    boardGroup.add(bumperRear);

    setupBoardLights();
  }

  // Headlight & Taillight System
  function setupBoardLights() {
    // Front Headlight Beam (Bright White Spotlight)
    headlightSpot = new THREE.SpotLight(0xecfeff, 1.8, 12, 0.55, 0.4, 1.5);
    headlightSpot.position.set(0, TIRE_RADIUS + 0.02, -0.34);
    const targetObj = new THREE.Object3D();
    targetObj.position.set(0, 0, -6);
    boardGroup.add(targetObj);
    headlightSpot.target = targetObj;
    boardGroup.add(headlightSpot);

    // Glowing LED Lens Mesh (Front)
    const lensGeo = new THREE.BoxGeometry(0.14, 0.015, 0.02);
    const lensMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.position.set(0, TIRE_RADIUS + 0.015, -0.345);
    boardGroup.add(lens);

    // Rear Taillight (Red LED)
    taillightGlow = new THREE.PointLight(0xef4444, 1.2, 3.5);
    taillightGlow.position.set(0, TIRE_RADIUS + 0.02, 0.35);
    boardGroup.add(taillightGlow);

    const redLensMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const redLens = new THREE.Mesh(lensGeo, redLensMat);
    redLens.position.set(0, TIRE_RADIUS + 0.015, 0.345);
    boardGroup.add(redLens);
  }

  // ==========================================================================
  // 5. Particles & Speed Lines
  // ==========================================================================
  function initParticlesAndFX() {
    particleGroup = new THREE.Group();
    scene.add(particleGroup);

    // Pre-allocate 40 dust particles
    const pGeo = new THREE.SphereGeometry(0.06, 6, 6);
    for (let i = 0; i < 40; i++) {
      const pMat = new THREE.MeshBasicMaterial({
        color: 0x94a3b8,
        transparent: true,
        opacity: 0,
      });
      const p = new THREE.Mesh(pGeo, pMat);
      p.visible = false;
      p.userData = { life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0 };
      particleGroup.add(p);
      state.particles.push(p);
    }
  }

  function emitDustParticle(x, y, z, groundColorHex) {
    const p = state.particles.find((item) => !item.visible);
    if (!p) return;

    p.visible = true;
    p.position.set(x + (Math.random() - 0.5) * 0.1, y + 0.04, z + (Math.random() - 0.5) * 0.1);
    p.material.color.setHex(groundColorHex);
    p.material.opacity = 0.65;
    p.scale.setScalar(0.7 + Math.random() * 0.6);

    p.userData.life = 0;
    p.userData.maxLife = 0.35 + Math.random() * 0.25;
    p.userData.vx = (Math.random() - 0.5) * 0.8;
    p.userData.vy = 0.4 + Math.random() * 0.6;
    p.userData.vz = (Math.random() - 0.5) * 0.8;
  }

  function emitGrindSparks(x, y, z) {
    for (let i = 0; i < 3; i++) {
      const p = state.particles.find((item) => !item.visible);
      if (!p) continue;
      p.visible = true;
      p.position.set(x, y, z);
      p.material.color.setHex(0xfef08a); // Golden yellow spark
      p.material.opacity = 1.0;
      p.scale.setScalar(0.4);

      p.userData.life = 0;
      p.userData.maxLife = 0.2;
      p.userData.vx = (Math.random() - 0.5) * 3.5;
      p.userData.vy = 1.2 + Math.random() * 2.0;
      p.userData.vz = (Math.random() - 0.5) * 3.5;
    }
  }

  function updateParticles(dt) {
    state.particles.forEach((p) => {
      if (!p.visible) return;
      p.userData.life += dt;
      if (p.userData.life >= p.userData.maxLife) {
        p.visible = false;
        return;
      }
      const progress = p.userData.life / p.userData.maxLife;
      p.position.x += p.userData.vx * dt;
      p.position.y += p.userData.vy * dt;
      p.position.z += p.userData.vz * dt;
      p.material.opacity = (1 - progress) * 0.7;
      p.scale.multiplyScalar(1 + dt * 0.8);
    });
  }

  // ==========================================================================
  // 6. Controls & Input Handlers (Desktop & Mobile)
  // ==========================================================================
  function initControls() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          state.input.up = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          state.input.down = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          state.input.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          state.input.right = true;
          break;
        case 'Space':
          if (!state.input.jump) state.input.jumpPressed = true;
          state.input.jump = true;
          e.preventDefault();
          break;
        case 'KeyR':
          respawnPlayer();
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          state.input.up = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          state.input.down = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          state.input.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          state.input.right = false;
          break;
        case 'Space':
          state.input.jump = false;
          break;
      }
    });

    // Touch Jump Button
    if (btnTouchJump) {
      btnTouchJump.addEventListener('touchstart', (e) => {
        e.preventDefault();
        state.input.jumpPressed = true;
        state.input.jump = true;
      });
      btnTouchJump.addEventListener('touchend', () => {
        state.input.jump = false;
      });
      btnTouchJump.addEventListener('mousedown', () => {
        state.input.jumpPressed = true;
        state.input.jump = true;
      });
      btnTouchJump.addEventListener('mouseup', () => {
        state.input.jump = false;
      });
    }

    // Virtual Touch Joystick
    setupVirtualJoystick();
  }

  function setupVirtualJoystick() {
    if (!joystickZone || !joystickBase || !joystickThumb) return;

    let touchId = null;
    let baseRect = null;
    const maxRadius = 45; // Max thumb displacement in pixels

    function handleStart(clientX, clientY, id) {
      touchId = id;
      state.input.joystickActive = true;
      baseRect = joystickBase.getBoundingClientRect();
      handleMove(clientX, clientY);
    }

    function handleMove(clientX, clientY) {
      if (!baseRect) return;
      const centerX = baseRect.left + baseRect.width / 2;
      const centerY = baseRect.top + baseRect.height / 2;

      let dx = clientX - centerX;
      let dy = clientY - centerY;
      const dist = Math.hypot(dx, dy);

      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }

      joystickThumb.style.transform = `translate(${dx}px, ${dy}px)`;

      // Normalized input: dx positive is Right, dy negative is Up
      state.input.joystickVector.x = dx / maxRadius;
      state.input.joystickVector.y = -dy / maxRadius;
    }

    function handleEnd() {
      touchId = null;
      state.input.joystickActive = false;
      state.input.joystickVector.x = 0;
      state.input.joystickVector.y = 0;
      joystickThumb.style.transform = 'translate(0px, 0px)';
    }

    // Touch events
    joystickZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      handleStart(t.clientX, t.clientY, t.identifier);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (touchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === touchId) {
          handleMove(t.clientX, t.clientY);
          break;
        }
      }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
      if (touchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchId) {
          handleEnd();
          break;
        }
      }
    });

    // Mouse drag fallback for desktop testing
    let isMouseDown = false;
    joystickZone.addEventListener('mousedown', (e) => {
      isMouseDown = true;
      handleStart(e.clientX, e.clientY, 'mouse');
    });
    window.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;
      handleMove(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', () => {
      if (!isMouseDown) return;
      isMouseDown = false;
      handleEnd();
    });
  }

  // ==========================================================================
  // 7. Physics Simulation & Movement Loop
  // ==========================================================================
  function updatePhysics(dt) {
    const p = state.player;

    // 1. Calculate Desired Screen-Space Direction
    // Screen Up is North-East in isometric: direction (-1, 0, -1) normalized
    // Screen Right is South-East: direction (1, 0, -1) normalized
    let inputX = 0;
    let inputY = 0;

    if (state.input.joystickActive) {
      inputX = state.input.joystickVector.x;
      inputY = state.input.joystickVector.y;
    } else {
      if (state.input.right) inputX += 1;
      if (state.input.left) inputX -= 1;
      if (state.input.up) inputY += 1;
      if (state.input.down) inputY -= 1;

      // Normalize diagonal keyboard vectors
      const len = Math.hypot(inputX, inputY);
      if (len > 0) {
        inputX /= len;
        inputY /= len;
      }
    }

    // Convert Screen Space (inputX, inputY) to Isometric World Coordinates
    // Isometric camera is positioned along (+X, +Z)
    // Screen UP pushes (-X, -Z)
    // Screen RIGHT pushes (+X, -Z)
    const worldDirX = (inputX - inputY) * 0.7071;
    const worldDirZ = (-inputX - inputY) * 0.7071;
    const inputMagnitude = Math.min(1.0, Math.hypot(inputX, inputY));

    // 2. Acceleration & Braking
    if (inputMagnitude > 0.05) {
      const targetVx = worldDirX * MAX_SPEED * inputMagnitude;
      const targetVz = worldDirZ * MAX_SPEED * inputMagnitude;

      p.vx = THREE.MathUtils.lerp(p.vx, targetVx, ACCELERATION * dt * 0.15);
      p.vz = THREE.MathUtils.lerp(p.vz, targetVz, ACCELERATION * dt * 0.15);
    } else {
      // Coasting / regenerative friction
      p.vx = THREE.MathUtils.lerp(p.vx, 0, DECELERATION * dt * 0.2);
      p.vz = THREE.MathUtils.lerp(p.vz, 0, DECELERATION * dt * 0.2);
    }

    p.speed = Math.hypot(p.vx, p.vz);

    // 3. Update Heading (Board Faces Direction of Motion)
    if (p.speed > 0.35) {
      const targetHeading = Math.atan2(p.vx, p.vz);
      // Smooth shortest-arc angle interpolation
      let angleDiff = targetHeading - p.heading;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      p.heading += angleDiff * TURN_SPEED * dt;

      // Carve Bank Roll based on turning rate
      const rollTarget = THREE.MathUtils.clamp(-angleDiff * 1.5, -0.12, 0.12);
      p.roll = THREE.MathUtils.lerp(p.roll, rollTarget, dt * 10);
    } else {
      p.roll = THREE.MathUtils.lerp(p.roll, 0, dt * 8);
    }

    // Nose-down pitch on acceleration, nose-up on braking (classic Onewheel tilt!)
    const accelRate = (inputMagnitude * MAX_SPEED - p.speed) / MAX_SPEED;
    const pitchTarget = THREE.MathUtils.clamp(-accelRate * 0.08, -0.06, 0.06);
    p.pitch = THREE.MathUtils.lerp(p.pitch, pitchTarget, dt * 8);

    // 4. Position Step
    p.x += p.vx * dt;
    p.z += p.vz * dt;

    // Constrain within map bounds
    p.x = THREE.MathUtils.clamp(p.x, -135, 135);
    p.z = THREE.MathUtils.clamp(p.z, -135, 135);

    // 5. Vertical & Jump Physics
    handleObstaclesAndGround(dt);

    // Jump Input (Bunny Hop)
    if (state.input.jumpPressed && !p.isAirborne) {
      p.vy = JUMP_VELOCITY;
      p.isAirborne = true;
      p.airtime = 0;
      state.input.jumpPressed = false;
    }

    // Apply Gravity when airborne
    if (p.isAirborne) {
      p.vy += GRAVITY * dt;
      p.y += p.vy * dt;
      p.airtime += dt;

      // Landing check
      if (p.y <= p.groundY) {
        p.y = p.groundY;
        p.vy = 0;
        p.isAirborne = false;

        // Big Air toast
        if (p.airtime > 0.45) {
          showTrickToast('BIG AIR! +150');
        }
        p.airtime = 0;
      }
    } else {
      // Ground clamping with smooth elevation change
      p.y = THREE.MathUtils.lerp(p.y, p.groundY, dt * 18);
    }

    // 6. Update 3D Board Transform
    boardGroup.position.set(p.x, p.y, p.z);
    boardGroup.rotation.y = p.heading;
    boardGroup.rotation.x = p.pitch;
    boardGroup.rotation.z = p.roll;

    // Spin Wheel
    if (wheelMesh) {
      wheelMesh.rotation.x += (p.speed / TIRE_RADIUS) * dt;
    }

    // 7. Update Dynamic Shadow
    shadowMesh.position.set(p.x, p.groundY + 0.015, p.z);
    shadowMesh.rotation.y = p.heading;
    const jumpHeight = Math.max(0, p.y - p.groundY);
    const shadowScale = THREE.MathUtils.clamp(1 - jumpHeight * 0.35, 0.45, 1.0);
    shadowMesh.scale.set(shadowScale, shadowScale, shadowScale);
    shadowMesh.material.opacity = THREE.MathUtils.clamp(0.6 - jumpHeight * 0.25, 0.2, 0.6);

    // 8. Particle Dust Emissions
    if (p.speed > 1.2 && !p.isAirborne) {
      if (Math.random() < 0.45) {
        const dustCol = getTerrainColor(p.x, p.z);
        emitDustParticle(p.x, p.groundY, p.z, dustCol);
      }
    }

    // 9. Check Current Zone for HUD
    checkCurrentZone();
  }

  // Detect Curbs, Ledges, Rails, and Ramps underneath the player
  function handleObstaclesAndGround(dt) {
    const p = state.player;
    let targetGround = 0;
    p.isGrinding = false;

    // Base ground elevation: Plaza is 0.06m higher
    if (Math.abs(p.x) < 19 && Math.abs(p.z) < 19) {
      targetGround = 0.06;
    }

    for (const obs of state.obstacles) {
      const halfW = obs.width / 2;
      const halfL = obs.length / 2;

      // AABB overlap check
      if (
        p.x >= obs.x - halfW &&
        p.x <= obs.x + halfW &&
        p.z >= obs.z - halfL &&
        p.z <= obs.z + halfL
      ) {
        if (obs.type === 'kicker') {
          // Calculate ramp elevation along slope
          // Offset relative to ramp origin
          const relZ = (p.z - obs.z);
          const ratio = THREE.MathUtils.clamp((halfL - relZ) / obs.length, 0, 1);
          const rampY = ratio * obs.height;

          targetGround = Math.max(targetGround, rampY);

          // Launch boost when driving off the high edge of the kicker!
          if (ratio > 0.85 && p.speed > 3.0 && !p.isAirborne) {
            p.vy = JUMP_VELOCITY * 1.15; // Extra kicker pop!
            p.isAirborne = true;
            showTrickToast('KICKER POP! +200');
          }
        } else if (obs.type === 'rail') {
          // Rail Grind
          if (p.y >= obs.height - 0.15) {
            targetGround = Math.max(targetGround, obs.height);
            p.isGrinding = true;
            emitGrindSparks(p.x, obs.height, p.z);
            showTrickToast('RAIL GRIND! +50/s');
          }
        } else {
          // Ledges, curbs, boardwalks
          if (p.y >= obs.height - 0.15) {
            targetGround = Math.max(targetGround, obs.height);
          }
        }
      }
    }

    p.groundY = targetGround;
  }

  // Get Terrain Particle Tint
  function getTerrainColor(x, z) {
    if (Math.abs(x) < 22 && Math.abs(z) < 22) return 0x94a3b8; // Plaza concrete gray
    if (z < -25) return 0x64748b; // Mountain slate
    if (z > 25) return 0xc2410c; // Desert terracotta
    if (x > 25) return 0x854d0e; // Pine forest loam
    if (x < -25) return 0xea580c; // Slickrock red
    return 0x94a3b8;
  }

  // Zone & Trailhead Entry Detection
  function checkCurrentZone() {
    const p = state.player;
    let newZone = 'Central Town Square';
    let newType = 'CHILL';

    if (Math.abs(p.x) < 24 && Math.abs(p.z) < 24) {
      newZone = 'Central Town Square';
      newType = 'PLAZA';
    } else if (p.z < -26 && Math.abs(p.x) < Math.abs(p.z)) {
      newZone = 'Thunder Peak';
      newType = 'JUMP LINE';
    } else if (p.z > 26 && Math.abs(p.x) < Math.abs(p.z)) {
      newZone = 'Cactus Canyon';
      newType = 'CHILL TRAIL';
    } else if (p.x > 26 && Math.abs(p.z) < Math.abs(p.x)) {
      newZone = 'Pine Ridge';
      newType = 'CHILL TRAIL';
    } else if (p.x < -26 && Math.abs(p.z) < Math.abs(p.x)) {
      newZone = 'Slickrock Bluff';
      newType = 'JUMP LINE';
    }

    if (newZone !== p.currentZone) {
      p.currentZone = newZone;
      p.zoneType = newType;
      triggerZoneToast(newZone, newType);
      if (hudTerrainVal) hudTerrainVal.textContent = newZone;
    }
  }

  // Area Toast Notification Banner
  let toastTimeout = null;
  function triggerZoneToast(name, badge) {
    if (!areaToast || !areaBadge || !areaName) return;

    areaName.textContent = name;
    areaBadge.textContent = badge;
    areaBadge.className = 'exp9-area-badge ' + (badge.includes('JUMP') ? 'badge-jump' : 'badge-chill');

    areaToast.classList.add('visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      areaToast.classList.remove('visible');
    }, 3200);
  }

  // Trick Toast Banner
  let trickTimeout = null;
  function showTrickToast(text) {
    if (!trickToast || !trickText) return;
    trickText.textContent = text;
    trickToast.classList.add('visible');
    clearTimeout(trickTimeout);
    trickTimeout = setTimeout(() => {
      trickToast.classList.remove('visible');
    }, 1400);
  }

  // Respawn Player back to Central Town Square
  function respawnPlayer() {
    state.player.x = 0;
    state.player.y = 0.2;
    state.player.z = 0;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.vz = 0;
    state.player.speed = 0;
    state.player.heading = 0;
    state.player.pitch = 0;
    state.player.roll = 0;
    state.player.isAirborne = false;
    showTrickToast('RESPAWNED AT PLAZA');
  }

  // ==========================================================================
  // 8. Camera Tracking & HUD Update
  // ==========================================================================
  function updateCamera() {
    const p = state.player;
    // Smooth camera target follow
    const targetX = p.x + 30;
    const targetY = p.y + 24.49;
    const targetZ = p.z + 30;

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.1);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.1);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.1);

    camera.lookAt(p.x, p.y + 0.3, p.z);
  }

  function updateHUD() {
    const p = state.player;
    // Speed in MPH (1 m/s = 2.23694 MPH)
    const mph = (p.speed * 2.23694).toFixed(1);
    if (hudSpeedVal) hudSpeedVal.textContent = mph;

    if (hudSpeedBar) {
      const pct = Math.min(100, (p.speed / MAX_SPEED) * 100);
      hudSpeedBar.style.width = pct + '%';
    }

    // Compass Arrow pointing towards (0, 0)
    if (compassArrow && compassDist) {
      const dist = Math.hypot(p.x, p.z).toFixed(0);
      compassDist.textContent = dist + 'm';

      // Angle from player to origin (0, 0)
      const toOriginAngle = Math.atan2(-p.x, -p.z);
      // Adjust for isometric screen orientation
      const screenAngle = (toOriginAngle + Math.PI / 4) * (180 / Math.PI);
      compassArrow.style.transform = `rotate(${screenAngle}deg)`;
    }
  }

  // ==========================================================================
  // 9. Resize & Fullscreen Handlers
  // ==========================================================================
  function onWindowResize() {
    if (!container || !renderer || !camera) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const aspect = width / height;
    const frustumSize = 18;

    camera.left = (-frustumSize * aspect) / 2;
    camera.right = (frustumSize * aspect) / 2;
    camera.top = frustumSize / 2;
    camera.bottom = -frustumSize / 2;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch((err) => {
        console.warn('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen();
    }
  }

  // ==========================================================================
  // 10. Main Animation Loop
  // ==========================================================================
  function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(state.clock.getDelta(), 0.05); // cap delta time for smooth simulation

    updatePhysics(dt);
    updateParticles(dt);
    updateCamera();
    updateHUD();

    renderer.render(scene, camera);
  }

})();
