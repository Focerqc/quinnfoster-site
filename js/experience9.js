/**
 * Experience 9: GamerWheels — 2.5D Isometric PEV Physics Engine
 * Author: Quinn Foster
 * Engine: Three.js Orthographic 2.5D Isometric Physics & Renderer
 * Version: 2.0 (Non-flat Contoured Terrain, Advanced Jumps, Model Fixes & Checkpoints)
 */

(function () {
  'use strict';

  // --- Constants & Config ---
  const GRAVITY = -28.0;         // m/s^2
  const MAX_SPEED = 11.2;        // ~25.0 MPH (flat ground top speed)
  const ACCELERATION = 24.0;     // m/s^2
  const DECELERATION = 16.0;     // m/s^2 (regenerative braking & coasting)
  const JUMP_VELOCITY = 7.8;     // m/s initial bunny-hop impulse
  const TIRE_RADIUS = 0.14;      // ~11 inch tire radius in meters
  const TURN_SPEED = 9.0;        // rad/s angular turning responsiveness

  // --- Checkpoints Data ---
  const CHECKPOINTS = [
    {
      id: 0,
      name: 'Plaza Park',
      zone: 'Central Town Square',
      x: 0,
      z: 0,
      heading: -Math.PI * 0.75, // Screen-up facing
      spawnYOffset: 0.18,
      desc: 'Central skate park with grind rails, ledges, and kickers'
    },
    {
      id: 1,
      name: 'Mega Drop',
      zone: 'Thunder Peak',
      x: 0,
      z: -72,
      heading: 0, // Facing South down the runway
      spawnYOffset: 7.22, // On top of 7m tower deck
      desc: '7-meter tall drop-in tower into massive canyon launch kicker'
    },
    {
      id: 2,
      name: 'Whale Tail',
      zone: 'Pine Ridge',
      x: 55,
      z: 22,
      heading: Math.PI, // Facing North down the slopestyle line
      spawnYOffset: 0.22,
      desc: 'Slopestyle timber step-up into arched whale-tail spine'
    },
    {
      id: 3,
      name: 'Tabletop & Gap',
      zone: 'Slickrock Bluff',
      x: -58,
      z: 26,
      heading: Math.PI, // Facing North into tabletop and gap jumps
      spawnYOffset: 0.22,
      desc: '13-meter tabletop jump and canyon gap launcher'
    },
    {
      id: 4,
      name: 'Desert Berms',
      zone: 'Cactus Canyon',
      x: 0,
      z: 56,
      heading: Math.PI, // Facing North into desert carving berms
      spawnYOffset: 0.22,
      desc: 'High-speed banked desert berm carving bowls and rollers'
    }
  ];

  // --- Game State ---
  const state = {
    player: {
      x: 0,
      y: 0.2,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      speed: 0,
      heading: -Math.PI * 0.75, // board yaw angle (radians)
      pitch: 0,                 // nose-down/up tilt
      roll: 0,                  // carving bank roll
      isAirborne: false,
      isGrinding: false,
      airtime: 0,
      groundY: 0.08,
      currentZone: 'Central Town Square',
      zoneType: 'PLAZA',
      inTabletop: false,
      inGap: false,
      inMegaDrop: false,
    },
    camera: {
      frustumSize: 18,
      targetFrustum: 18,
      minFrustum: 9,
      maxFrustum: 34,
    },
    grind: {
      active: false,
      type: '50-50', // 'noseslide', 'tailslide', 'boardslide', '50-50'
      balance: 0.0,  // -1.0 (tipped forward) to +1.0 (tipped back)
      balanceVel: 0.0,
      timer: 0.0,
      railX: 0,
      railMinZ: 0,
      railMaxZ: 0,
    },
    aerial: {
      airYaw: 0,
      airPitch: 0,
      spin180Done: false,
      spin360Done: false,
      flipDone: false,
    },
    input: {
      up: false,
      down: false,
      left: false,
      right: false,
      jump: false,
      jumpPressed: false,
      joystickActive: false,
      joystickVector: { x: 0, y: 0 },
      // Right Twist / Flip / Balance Stick (Arrows on desktop)
      twistUp: false,
      twistDown: false,
      twistLeft: false,
      twistRight: false,
      rightJoystickActive: false,
      rightJoystickVector: { x: 0, y: 0 },
    },
    obstacles: [],
    trailSigns: [],
    particles: [],
    activeCheckpoint: 0,
    clock: new THREE.Clock(),
  };

  // --- DOM Elements ---
  let container, canvas;
  let hudSpeedVal, hudSpeedBar, hudTerrainVal;
  let compassArrow, compassDist;
  let areaToast, areaBadge, areaName, trickToast, trickText;
  let btnRespawn, btnFullscreen, btnTouchJump;
  let btnZoomIn, btnZoomOut;
  let joystickZone, joystickBase, joystickThumb;
  let rightJoystickZone, rightJoystickBase, rightJoystickThumb;
  let balanceHud, balanceLabel, balanceNeedle;
  let cpButtons = [];

  // --- Three.js Globals ---
  let scene, camera, renderer;
  let boardGroup, wheelMesh, chassisMesh, shadowMesh;
  let headlightSpot, taillightGlow;
  let sunLight;
  let particleGroup;

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
  // 1. DOM Elements & Checkpoint Binding
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

    btnZoomIn = document.getElementById('btnZoomIn');
    btnZoomOut = document.getElementById('btnZoomOut');

    joystickZone = document.getElementById('joystickZone');
    joystickBase = document.getElementById('joystickBase');
    joystickThumb = document.getElementById('joystickThumb');

    rightJoystickZone = document.getElementById('rightJoystickZone');
    rightJoystickBase = document.getElementById('rightJoystickBase');
    rightJoystickThumb = document.getElementById('rightJoystickThumb');

    balanceHud = document.getElementById('balanceHud');
    balanceLabel = document.getElementById('balanceLabel');
    balanceNeedle = document.getElementById('balanceNeedle');

    if (btnRespawn) btnRespawn.addEventListener('click', respawnPlayer);
    if (btnFullscreen) btnFullscreen.addEventListener('click', toggleFullscreen);
    if (btnZoomIn) btnZoomIn.addEventListener('click', () => adjustZoom(-3));
    if (btnZoomOut) btnZoomOut.addEventListener('click', () => adjustZoom(+3));

    // Checkpoint navigation buttons
    cpButtons = Array.from(document.querySelectorAll('.exp9-cp-btn'));
    cpButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const cpIdx = parseInt(btn.getAttribute('data-cp'), 10);
        if (!isNaN(cpIdx)) {
          teleportToCheckpoint(cpIdx);
        }
      });
    });

    // Collapsible Game Info Accordion Toggle
    const btnGameInfoToggle = document.getElementById('btnGameInfoToggle');
    const gameInfoPanel = document.getElementById('gameInfoPanel');
    const accordionHintText = document.getElementById('accordionHintText');

    if (btnGameInfoToggle && gameInfoPanel) {
      btnGameInfoToggle.addEventListener('click', () => {
        const isOpen = gameInfoPanel.classList.contains('open');
        btnGameInfoToggle.setAttribute('aria-expanded', !isOpen);
        btnGameInfoToggle.classList.toggle('active', !isOpen);
        gameInfoPanel.classList.toggle('open', !isOpen);
        if (accordionHintText) {
          accordionHintText.textContent = !isOpen ? 'Hide Info' : 'Show Info';
        }
      });
    }
  }

  // ==========================================================================
  // 2. Three.js Isometric Scene & Camera Setup
  // ==========================================================================
  function initThreeScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1d);
    scene.fog = new THREE.FogExp2(0x0a0f1d, 0.0075);

    // 2.5D Isometric Orthographic Camera with Dynamic Zoom
    const aspect = container.clientWidth / container.clientHeight;
    const frustumSize = state.camera.frustumSize; // Viewport width in meters
    camera = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      -120,
      360
    );

    // Position camera diagonally up-right in world space for classic isometric view
    camera.position.set(30, 24.49, 30);
    camera.lookAt(0, 0, 0);

    // WebGL Renderer
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

    // --- Lighting (Balanced for High-Contrast Hill & Slope Visibility) ---
    // Ambient fill (reduced to prevent washing out slopes)
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.35);
    scene.add(ambientLight);

    // Hemisphere light (sky vs ground bounce)
    const hemiLight = new THREE.HemisphereLight(0xecfeff, 0x1e293b, 0.3);
    hemiLight.position.set(0, 60, 0);
    scene.add(hemiLight);

    // Directional Sun Light (strong directional shading for hills and berms)
    sunLight = new THREE.DirectionalLight(0xfffbeb, 1.35);
    sunLight.position.set(50, 75, 40);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 180;

    const shadowBoxSize = 32;
    sunLight.shadow.camera.left = -shadowBoxSize;
    sunLight.shadow.camera.right = shadowBoxSize;
    sunLight.shadow.camera.top = shadowBoxSize;
    sunLight.shadow.camera.bottom = -shadowBoxSize;
    sunLight.shadow.bias = -0.0006;
    scene.add(sunLight);
    scene.add(sunLight.target);

    // Create Root Board Group (Rotation order 'YXZ' allows correct pitch along heading)
    boardGroup = new THREE.Group();
    boardGroup.rotation.order = 'YXZ';
    boardGroup.position.set(state.player.x, state.player.y, state.player.z);
    scene.add(boardGroup);

    // Dynamic Drop Shadow Decal (Oriented along X width and Z length)
    const shadowGeo = new THREE.PlaneGeometry(0.42, 0.88);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 64;
    shadowCanvas.height = 64;
    const ctx = shadowCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
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
  // 3. Procedural Heightfield & World Topography
  // ==========================================================================

  /**
   * Continuous mathematical heightfield function.
   * Returns terrain elevation Y (meters) for any world (x, z) coordinate.
   */
  function getTerrainElevation(x, z) {
    const dist = Math.hypot(x, z);

    // 1. Central Town Square Plaza is flat at +0.08m
    if (dist < 19) {
      return 0.08;
    }

    // Smooth transition feathering from plaza to wild terrain
    const plazaBlend = dist < 25 ? (dist - 19) / 6 : 1;

    let h = 0.5;

    // A. North: Thunder Peak (High mountain ridge, rugged terraces, Mega Drop tower hill)
    if (z < -18 && Math.abs(x) <= Math.abs(z) * 1.6) {
      const n = (-z - 18);
      const ridge = Math.sin(x * 0.14) * 1.1 + Math.cos(z * 0.09) * 0.9;
      const terrace = Math.floor(n / 16) * 0.75;
      h = 1.0 + 0.05 * n + ridge + terrace;

      // Mega Drop hill crest around (x=0, z=-72)
      const peakDist = Math.hypot(x, z - (-72));
      if (peakDist < 18) {
        const peakFactor = Math.cos((peakDist / 18) * Math.PI * 0.5);
        h = Math.max(h, 4.2 + peakFactor * 2.8); // Peaks up to 7.0m
      }
    }
    // B. South: Cactus Canyon & Banked Berms Trail Circuit
    else if (z > 18 && Math.abs(x) <= Math.abs(z) * 1.6) {
      const s = (z - 18);
      // Base rolling desert dunes
      const dunes = Math.sin(x * 0.10) * 1.1 * Math.cos(s * 0.07) + Math.cos((x + s) * 0.06) * 0.8;
      const canyonFlanks = Math.max(0, (Math.abs(x) - 18) * 0.22);
      h = 1.0 + dunes + canyonFlanks;

      // 1. Entrance Roller Pump Track (z: 21 to 38, near center)
      if (Math.abs(x) < 8 && z >= 20 && z <= 40) {
        const roller = Math.sin((z - 20) * 0.65) * 0.5;
        h += roller;
      }

      // 2. East Banked Berm Turn (Apex near x=24, z=48)
      // Carves riders into a high-banked right sweep
      const distBermE = Math.hypot(x - 24, z - 48);
      if (distBermE < 16) {
        const outsideRise = Math.max(0, (x - 16) / 8.5) * 2.5; // Outer wall up to 2.5m
        const bowlPocket = -Math.cos((distBermE / 16) * Math.PI * 0.5) * 0.6;
        h += outsideRise + bowlPocket;
      }

      // 3. South Sweeper Berm Turn (Apex near x=0, z=76)
      // High-speed banked turn around the southern canyon rim
      const distBermS = Math.hypot(x, z - 76);
      if (distBermS < 18) {
        const outsideRise = Math.max(0, (z - 68) / 8.5) * 2.8; // Outer wall up to 2.8m
        const bowlPocket = -Math.cos((distBermS / 18) * Math.PI * 0.5) * 0.7;
        h += outsideRise + bowlPocket;
      }

      // 4. West Banked Berm Turn (Apex near x=-24, z=52)
      // Carves riders back northward toward town
      const distBermW = Math.hypot(x - (-24), z - 52);
      if (distBermW < 16) {
        const outsideRise = Math.max(0, (-x - 16) / 8.5) * 2.5; // Outer wall up to 2.5m
        const bowlPocket = -Math.cos((distBermW / 16) * Math.PI * 0.5) * 0.6;
        h += outsideRise + bowlPocket;
      }

      // 5. Central Infield Tabletop Roller / Hump (x ~ 0, z ~ 56)
      const distInfield = Math.hypot(x, z - 56);
      if (distInfield < 9) {
        h += Math.cos((distInfield / 9) * Math.PI * 0.5) * 1.25;
      }
    }
    // C. East: Pine Ridge (Forest singletrack, wooded knolls, stream ravine)
    else if (x > 18 && Math.abs(z) <= Math.abs(x) * 1.6) {
      const e = (x - 18);
      const forestKnolls = Math.sin(z * 0.13) * 1.3 + Math.cos(e * 0.11) * 1.1;
      const ravineDist = Math.abs(x - 46);
      const ravine = ravineDist < 7 ? -Math.cos((ravineDist / 7) * Math.PI * 0.5) * 1.2 : 0;
      h = 1.6 + forestKnolls + ravine;
    }
    // D. West: Slickrock Bluff (Tiered sandstone shelves, jump bowl)
    else if (x < -18 && Math.abs(z) <= Math.abs(x) * 1.6) {
      const w = (-x - 18);
      const shelves = Math.sin(z * 0.12) * 1.2 + Math.floor(w / 14) * 0.9;
      const bowlDist = Math.hypot(x - (-52), z);
      const bowl = bowlDist < 16 ? -Math.cos((bowlDist / 16) * Math.PI * 0.5) * 1.3 : 0;
      h = 1.4 + shelves + bowl;
    } else {
      // Diagonal corner transitions
      h = 0.8 + Math.sin(x * 0.09) * 0.7 + Math.cos(z * 0.09) * 0.7;
    }

    return THREE.MathUtils.lerp(0.08, Math.max(0.05, h), plazaBlend);
  }

  /**
   * Helper to check if a world point lies along the Desert Berm dirt trail circuit
   */
  function isDesertBermTrail(x, z) {
    if (z < 20 || z > 86 || Math.abs(x) > 38) return 0;

    // Entrance pump rollers
    if (Math.abs(x) < 6 && z >= 20 && z <= 38) return 1;

    // East Berm Arc (around 24, 48)
    const dE = Math.hypot(x - 24, z - 48);
    if (dE >= 6 && dE <= 15.5) return Math.max(0, 1 - Math.abs(dE - 11) / 4.5);

    // South Sweeper Arc (around 0, 76)
    const dS = Math.hypot(x, z - 76);
    if (dS >= 6 && dS <= 17) return Math.max(0, 1 - Math.abs(dS - 12) / 5);

    // West Berm Arc (around -24, 52)
    const dW = Math.hypot(x - (-24), z - 52);
    if (dW >= 6 && dW <= 15.5) return Math.max(0, 1 - Math.abs(dW - 11) / 4.5);

    // Connecting straightaways
    if (Math.abs(x) < 7 && z >= 36 && z <= 52) return 0.8;

    return 0;
  }

  // ==========================================================================
  // 4. World Generation: Topography, Park, Stunt Jumps & Biomes
  // ==========================================================================
  function buildWorld() {
    // 1. Base Contoured Terrain Mesh (100x100 grid for smooth hills)
    const groundGeo = new THREE.PlaneGeometry(300, 300, 100, 100);
    groundGeo.rotateX(-Math.PI / 2);

    const colors = [];
    const pos = groundGeo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const gx = pos.getX(i);
      const gz = pos.getZ(i);

      // Displace Y coordinate according to mathematical heightfield
      const gy = getTerrainElevation(gx, gz);
      pos.setY(i, gy);

      // Biome vertex color blending
      let col = new THREE.Color(0x27303f); // City asphalt slate
      const dist = Math.hypot(gx, gz);

      if (dist > 22) {
        if (gz < -20 && Math.abs(gx) < Math.abs(gz) * 1.6) {
          // North: Mountain (Dark granite / slate rock)
          col = new THREE.Color(0x334155).lerp(new THREE.Color(0x1e293b), Math.min(1, (-gz - 20) / 65));
        } else if (gz > 20 && Math.abs(gx) < Math.abs(gz) * 1.6) {
          // South: Cactus Canyon (Warm terracotta / red sand)
          col = new THREE.Color(0xd97736).lerp(new THREE.Color(0x9a3412), Math.min(1, (gz - 20) / 65));

          // Highlight sculpted dirt trail loops with packed singletrack dirt color
          const trailFactor = isDesertBermTrail(gx, gz);
          if (trailFactor > 0.05) {
            const dirtTrackCol = new THREE.Color(0x78350f).lerp(new THREE.Color(0xb45309), 0.6);
            col.lerp(dirtTrackCol, trailFactor * 0.85);
          }
        } else if (gx > 20 && Math.abs(gz) < Math.abs(gx) * 1.6) {
          // East: Pine Ridge (Deep moss forest loam)
          col = new THREE.Color(0x2f603c).lerp(new THREE.Color(0x1e3a29), Math.min(1, (gx - 20) / 65));
        } else if (gx < -20 && Math.abs(gz) < Math.abs(gx) * 1.6) {
          // West: Slickrock Bluff (Warm sandstone / terracotta rock)
          col = new THREE.Color(0xd97736).lerp(new THREE.Color(0xb45309), Math.min(1, (-gx - 20) / 65));
        }
      }

      // Topographic elevation contour lines (subtle dark rings every 0.5 meters)
      // Gives instant depth perception and clarity to all slopes and hills
      const contourMod = Math.abs((gy % 0.5) - 0.25);
      const isContour = contourMod > 0.21;

      // Slope steepness shading (steeper slopes are shaded darker to reveal contours)
      const epsG = 0.5;
      const hE = getTerrainElevation(gx + epsG, gz);
      const hW = getTerrainElevation(gx - epsG, gz);
      const hS = getTerrainElevation(gx, gz + epsG);
      const hN = getTerrainElevation(gx, gz - epsG);
      const slopeGrad = Math.hypot((hE - hW) / (2 * epsG), (hS - hN) / (2 * epsG));
      const slopeShade = Math.max(0.68, 1.0 - slopeGrad * 0.32);

      if (isContour && dist > 20) {
        col.multiplyScalar(0.78); // Crisp contour stripe
      }
      col.multiplyScalar(slopeShade); // Depth-enhancing slope shading

      colors.push(col.r, col.g, col.b);
    }

    groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    groundGeo.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.05,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // 2. Central Plaza Pavers (Town Square)
    const plazaGeo = new THREE.BoxGeometry(38, 0.12, 38);
    const plazaMat = new THREE.MeshStandardMaterial({
      color: 0x3e4758,
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
      emissiveIntensity: 0.35,
    });
    const padMesh = new THREE.Mesh(padGeo, padMat);
    padMesh.position.set(0, 0.08, 0);
    padMesh.receiveShadow = true;
    scene.add(padMesh);

    // 3. Central Plaza Features (Rails, Ledges, Curbs)
    createStreetParkFeatures();

    // 4. Stunt Features (Tabletop, Gap Jump, Whale Tail, Mega Drop)
    createStuntJumpLines();

    // 5. Trail Signs
    createTrailSign('North: Thunder Peak', '[MEGA DROP]', 0, -32, 0, 0xf59e0b);
    createTrailSign('South: Cactus Canyon', '[CHILL BERMS]', 0, 32, Math.PI, 0x14b8a6);
    createTrailSign('East: Pine Ridge', '[WHALE TAIL]', 32, 0, Math.PI / 2, 0x10b981);
    createTrailSign('West: Slickrock Bluff', '[TABLETOP & GAP]', -32, 0, -Math.PI / 2, 0xf59e0b);

    // 6. Scenery (Trees, Rocks, Cacti placed on contour elevation)
    populateScenery();
  }

  // Central Street Park Obstacles
  function createStreetParkFeatures() {
    // A. Concrete Skate Ledge (North-East Plaza)
    const ledgeWidth = 1.6;
    const ledgeLength = 8.5;
    const ledgeHeight = 0.42;
    const ledgeGeo = new THREE.BoxGeometry(ledgeWidth, ledgeHeight, ledgeLength);
    const ledgeMat = new THREE.MeshStandardMaterial({ color: 0x7a859b, roughness: 0.6 });
    const ledge = new THREE.Mesh(ledgeGeo, ledgeMat);
    ledge.position.set(9, ledgeHeight / 2 + 0.06, -6);
    ledge.castShadow = true;
    ledge.receiveShadow = true;
    scene.add(ledge);

    // Metal coping along ledge edge
    const copingGeo = new THREE.CylinderGeometry(0.04, 0.04, ledgeLength, 8);
    const copingMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 });
    const coping = new THREE.Mesh(copingGeo, copingMat);
    coping.position.set(9 + ledgeWidth / 2, ledgeHeight + 0.06, -6);
    coping.castShadow = true;
    scene.add(coping);

    registerObstacle({
      type: 'ledge',
      x: 9,
      z: -6,
      width: ledgeWidth + 0.2,
      length: ledgeLength,
      height: ledgeHeight + 0.06,
    });

    // B. Low Grind Rails (Plaza Skate Features)
    function createGrindRail(x, z, length = 11.0, height = 0.40, colorHex = 0xfacc15) {
      const railGeo = new THREE.CylinderGeometry(0.045, 0.045, length, 12);
      railGeo.rotateX(Math.PI / 2);
      const railMat = new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.9, roughness: 0.25 });
      const railMesh = new THREE.Mesh(railGeo, railMat);
      railMesh.position.set(x, height + 0.06, z);
      railMesh.castShadow = true;
      scene.add(railMesh);

      const postSpacing = length / 3;
      [-postSpacing, 0, postSpacing].forEach((offset) => {
        const postGeo = new THREE.CylinderGeometry(0.035, 0.035, height, 8);
        const postMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8 });
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(x, (height / 2) + 0.06, z + offset);
        post.castShadow = true;
        scene.add(post);
      });

      registerObstacle({
        type: 'rail',
        x: x,
        z: z,
        width: 0.48,
        length: length,
        height: height + 0.06,
      });
    }

    // Yellow South-West Rail & Cyan North-East Rail
    createGrindRail(-8, 7, 11.0, 0.40, 0xfacc15);
    createGrindRail(8, -7, 11.0, 0.40, 0x38bdf8);

    // C. Plaza Kicker Ramps
    createKickerRamp(-4, -13, 2.6, 3.4, 0.72, 0); // North launch
    createKickerRamp(12, 6, 2.6, 3.4, 0.68, -Math.PI / 2); // East launch

    // D. Curbs
    createCurbs();
  }

  // Curbs surrounding the plaza
  function createCurbs() {
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7 });
    const curbH = 0.22;
    const curbW = 0.35;
    const half = 19;

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

    sides.forEach((s) => {
      const curbGeo = new THREE.BoxGeometry(s.len, curbH, curbW);
      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.position.set(s.x + (s.offX || 0), curbH / 2 + 0.06, s.z + (s.offZ || 0));
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
        height: curbH + 0.06,
      });
    });
  }

  // ==========================================================================
  // 5. Specialized Stunt Jumps (Tabletop, Gap, Whale Tail, Mega Drop)
  // ==========================================================================
  function createStuntJumpLines() {
    // 1. TABLETOP JUMP (West: Slickrock Bluff - x=-58, z=14)
    createTabletopJump(-58, 14, 13.0, 3.8, 1.6);

    // 2. CANYON GAP JUMP (West: Slickrock Bluff - x=-58, z=-14)
    createGapJump(-58, -14, 3.8, 3.6, 1.8, 6.5, 5.0, 1.5);

    // 3. WHALE TAIL (East: Pine Ridge - x=55, z=8)
    createWhaleTail(55, 8);

    // 4. MEGA DROP ROLL-IN TOWER & SUPER JUMP (North: Thunder Peak - x=0, z=-72)
    createMegaDropRamp(0, -72);
  }

  // A. TABLETOP JUMP: Takeoff slope -> Flat elevated deck -> Landing transition
  function createTabletopJump(x, z, length, width, height) {
    const baseY = getTerrainElevation(x, z);
    const group = new THREE.Group();

    const takeoffLen = 4.0;
    const deckLen = 5.0;
    const landingLen = 4.0;

    // Wood & Sandstone Materials
    const deckMat = new THREE.MeshStandardMaterial({ color: 0xcd853f, roughness: 0.65 });
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.85 });

    // 1. Takeoff Ramp (Wedge up)
    const takeoffShape = new THREE.Shape();
    takeoffShape.moveTo(0, 0);
    takeoffShape.lineTo(takeoffLen, height);
    takeoffShape.lineTo(takeoffLen, 0);
    takeoffShape.closePath();

    const takeoffGeom = new THREE.ExtrudeGeometry(takeoffShape, { depth: width, bevelEnabled: false });
    takeoffGeom.center();
    const takeoffMesh = new THREE.Mesh(takeoffGeom, deckMat);
    takeoffMesh.position.set(0, height / 2, takeoffLen / 2 + deckLen / 2);
    takeoffMesh.rotation.y = Math.PI / 2;
    takeoffMesh.castShadow = true;
    takeoffMesh.receiveShadow = true;
    group.add(takeoffMesh);

    // 2. Flat Table Deck
    const deckGeo = new THREE.BoxGeometry(width, height, deckLen);
    const deckMesh = new THREE.Mesh(deckGeo, deckMat);
    deckMesh.position.set(0, height / 2, 0);
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    group.add(deckMesh);

    // 3. Landing Slope (Wedge down)
    const landShape = new THREE.Shape();
    landShape.moveTo(0, height);
    landShape.lineTo(landingLen, 0);
    landShape.lineTo(0, 0);
    landShape.closePath();

    const landGeom = new THREE.ExtrudeGeometry(landShape, { depth: width, bevelEnabled: false });
    landGeom.center();
    const landMesh = new THREE.Mesh(landGeom, deckMat);
    landMesh.position.set(0, height / 2, -landingLen / 2 - deckLen / 2);
    landMesh.rotation.y = Math.PI / 2;
    landMesh.castShadow = true;
    landMesh.receiveShadow = true;
    group.add(landMesh);

    group.position.set(x, baseY, z);
    scene.add(group);

    registerObstacle({
      type: 'tabletop',
      x: x,
      z: z,
      baseY: baseY,
      width: width,
      length: length,
      height: height,
      takeoffLen: takeoffLen,
      deckLen: deckLen,
      landingLen: landingLen,
    });
  }

  // B. GAP JUMP: Launch kicker -> Void chasm with warning markers -> Banked landing
  function createGapJump(x, z, kickerLen, width, kickerHeight, gapDist, landLen, landHeight) {
    const baseY = getTerrainElevation(x, z);
    const group = new THREE.Group();

    const rampMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.7 });
    const hazardMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x7f1d1d, emissiveIntensity: 0.5 });

    // 1. Takeoff Kicker
    const shapeKicker = new THREE.Shape();
    shapeKicker.moveTo(0, 0);
    shapeKicker.lineTo(kickerLen, kickerHeight);
    shapeKicker.lineTo(kickerLen, 0);
    shapeKicker.closePath();

    const kickerGeom = new THREE.ExtrudeGeometry(shapeKicker, { depth: width, bevelEnabled: false });
    kickerGeom.center();
    const kickerMesh = new THREE.Mesh(kickerGeom, rampMat);
    kickerMesh.position.set(0, kickerHeight / 2, (gapDist / 2) + (kickerLen / 2));
    kickerMesh.rotation.y = Math.PI / 2;
    kickerMesh.castShadow = true;
    kickerMesh.receiveShadow = true;
    group.add(kickerMesh);

    // Hazard pylons flanking the gap
    [-width / 2 - 0.3, width / 2 + 0.3].forEach((px) => {
      const pylonGeo = new THREE.CylinderGeometry(0.1, 0.12, 1.2, 8);
      const pylon = new THREE.Mesh(pylonGeo, hazardMat);
      pylon.position.set(px, 0.6, gapDist / 2);
      pylon.castShadow = true;
      group.add(pylon);

      const pylonLand = pylon.clone();
      pylonLand.position.set(px, 0.6, -gapDist / 2);
      group.add(pylonLand);
    });

    // 2. Landing Receiver Slope
    const shapeLand = new THREE.Shape();
    shapeLand.moveTo(0, landHeight);
    shapeLand.lineTo(landLen, 0);
    shapeLand.lineTo(0, 0);
    shapeLand.closePath();

    const landGeom = new THREE.ExtrudeGeometry(shapeLand, { depth: width, bevelEnabled: false });
    landGeom.center();
    const landMesh = new THREE.Mesh(landGeom, rampMat);
    landMesh.position.set(0, landHeight / 2, (-gapDist / 2) - (landLen / 2));
    landMesh.rotation.y = Math.PI / 2;
    landMesh.castShadow = true;
    landMesh.receiveShadow = true;
    group.add(landMesh);

    group.position.set(x, baseY, z);
    scene.add(group);

    // Register launch kicker obstacle
    registerObstacle({
      type: 'gap_kicker',
      x: x,
      z: z + (gapDist / 2) + (kickerLen / 2),
      baseY: baseY,
      width: width,
      length: kickerLen,
      height: kickerHeight,
    });

    // Register landing receiver obstacle
    registerObstacle({
      type: 'gap_landing',
      x: x,
      z: z - (gapDist / 2) - (landLen / 2),
      baseY: baseY,
      width: width,
      length: landLen,
      height: landHeight,
    });
  }

  // C. WHALE TAIL: Slopestyle curved wooden step-up -> arched spine deck -> drop kicker
  function createWhaleTail(x, z) {
    const baseY = getTerrainElevation(x, z);
    const group = new THREE.Group();

    const width = 3.2;
    const height = 1.9;
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xa16207, roughness: 0.6 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 });

    // 1. Curved Step-Up Ramp
    const stepUpLen = 4.5;
    const stepUpShape = new THREE.Shape();
    stepUpShape.moveTo(0, 0);
    stepUpShape.quadraticCurveTo(stepUpLen * 0.7, 0.4, stepUpLen, height);
    stepUpShape.lineTo(stepUpLen, 0);
    stepUpShape.closePath();

    const stepUpGeom = new THREE.ExtrudeGeometry(stepUpShape, { depth: width, bevelEnabled: false });
    stepUpGeom.center();
    const stepUpMesh = new THREE.Mesh(stepUpGeom, woodMat);
    stepUpMesh.position.set(0, height / 2, 5.5);
    stepUpMesh.rotation.y = Math.PI / 2;
    stepUpMesh.castShadow = true;
    stepUpMesh.receiveShadow = true;
    group.add(stepUpMesh);

    // 2. Whale Tail Arched Spine Platform (Length 6m)
    const spineLen = 6.0;
    const spineGeo = new THREE.BoxGeometry(width, 0.25, spineLen);
    const spineMesh = new THREE.Mesh(spineGeo, woodMat);
    spineMesh.position.set(0, height + 0.12, 0);
    spineMesh.castShadow = true;
    spineMesh.receiveShadow = true;
    group.add(spineMesh);

    // Decorative side arches
    const railMat = new THREE.MeshStandardMaterial({ color: 0xca8a04, metalness: 0.7 });
    [-width / 2 + 0.08, width / 2 - 0.08].forEach((rx) => {
      const sideCurb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, spineLen), railMat);
      sideCurb.position.set(rx, height + 0.25, 0);
      group.add(sideCurb);
    });

    // Support timber pillars
    [-2, 0, 2].forEach((pz) => {
      [-width / 2 + 0.3, width / 2 - 0.3].forEach((px) => {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, height, 6), postMat);
        pillar.position.set(px, height / 2, pz);
        pillar.castShadow = true;
        group.add(pillar);
      });
    });

    // 3. Drop-Down Transition Kicker
    const dropLen = 4.0;
    const dropShape = new THREE.Shape();
    dropShape.moveTo(0, height);
    dropShape.lineTo(dropLen, 0);
    dropShape.lineTo(0, 0);
    dropShape.closePath();

    const dropGeom = new THREE.ExtrudeGeometry(dropShape, { depth: width, bevelEnabled: false });
    dropGeom.center();
    const dropMesh = new THREE.Mesh(dropGeom, woodMat);
    dropMesh.position.set(0, height / 2, -5.2);
    dropMesh.rotation.y = Math.PI / 2;
    dropMesh.castShadow = true;
    dropMesh.receiveShadow = true;
    group.add(dropMesh);

    group.position.set(x, baseY, z);
    scene.add(group);

    registerObstacle({
      type: 'whaletail',
      x: x,
      z: z,
      baseY: baseY,
      width: width,
      length: 15.0,
      height: height,
    });
  }

  // D. MEGA DROP ROLL-IN TOWER & CANYON LAUNCH KICKER
  function createMegaDropRamp(x, z) {
    const group = new THREE.Group();

    const towerTopY = 7.0;
    const kickerBottomY = 2.0;
    const runwayLen = 22.0;
    const runwayWidth = 4.2;

    const metalScaffoldMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.85, roughness: 0.3 });
    const runwayMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5, metalness: 0.2 });

    // 1. High Tower Staging Platform (6m x 6m at Y = 7.0m)
    const platformGeo = new THREE.BoxGeometry(6.0, 0.3, 6.0);
    const platformMesh = new THREE.Mesh(platformGeo, runwayMat);
    platformMesh.position.set(0, towerTopY, -3.0);
    platformMesh.castShadow = true;
    platformMesh.receiveShadow = true;
    group.add(platformMesh);

    // Safety railings on platform
    const railMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
    const railingGeo = new THREE.BoxGeometry(0.08, 0.85, 5.8);
    const railLeft = new THREE.Mesh(railingGeo, railMat);
    railLeft.position.set(-2.9, towerTopY + 0.45, -3.0);
    group.add(railLeft);
    const railRight = new THREE.Mesh(railingGeo, railMat);
    railRight.position.set(2.9, towerTopY + 0.45, -3.0);
    group.add(railRight);

    // Scaffolding Pillars
    [-2.6, 2.6].forEach((px) => {
      [-5.6, -0.4].forEach((pz) => {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, towerTopY, 8), metalScaffoldMat);
        pillar.position.set(px, towerTopY / 2, pz);
        pillar.castShadow = true;
        group.add(pillar);
      });
    });

    // 2. Steep Downhill Roll-In Runway (Drops from 7.0m to 2.0m over 22 meters)
    const dropShape = new THREE.Shape();
    dropShape.moveTo(0, towerTopY);
    dropShape.lineTo(runwayLen, kickerBottomY);
    dropShape.lineTo(runwayLen, kickerBottomY - 0.3);
    dropShape.lineTo(0, towerTopY - 0.3);
    dropShape.closePath();

    const runwayGeom = new THREE.ExtrudeGeometry(dropShape, { depth: runwayWidth, bevelEnabled: false });
    runwayGeom.center();
    const runwayMesh = new THREE.Mesh(runwayGeom, runwayMat);
    runwayMesh.position.set(0, (towerTopY + kickerBottomY) / 2, (runwayLen / 2));
    runwayMesh.rotation.y = Math.PI / 2;
    runwayMesh.castShadow = true;
    runwayMesh.receiveShadow = true;
    group.add(runwayMesh);

    // 3. Giant Launch Kicker (2.6m high lip) at z = +runwayLen + 3
    const kickerLen = 4.5;
    const kickerH = 2.6;
    const kickerShape = new THREE.Shape();
    kickerShape.moveTo(0, kickerBottomY);
    kickerShape.quadraticCurveTo(kickerLen * 0.7, kickerBottomY + 0.3, kickerLen, kickerBottomY + kickerH);
    kickerShape.lineTo(kickerLen, 0);
    kickerShape.lineTo(0, 0);
    kickerShape.closePath();

    const kickerGeom = new THREE.ExtrudeGeometry(kickerShape, { depth: runwayWidth + 0.4, bevelEnabled: false });
    kickerGeom.center();
    const kickerMesh = new THREE.Mesh(kickerGeom, runwayMat);
    kickerMesh.position.set(0, (kickerBottomY + kickerH) / 2, runwayLen + (kickerLen / 2));
    kickerMesh.rotation.y = Math.PI / 2;
    kickerMesh.castShadow = true;
    kickerMesh.receiveShadow = true;
    group.add(kickerMesh);

    // 4. Downhill Landing Transition Slope
    const landLen = 14.0;
    const landShape = new THREE.Shape();
    landShape.moveTo(0, kickerBottomY + 1.2);
    landShape.lineTo(landLen, 0.2);
    landShape.lineTo(0, 0);
    landShape.closePath();

    const landGeom = new THREE.ExtrudeGeometry(landShape, { depth: runwayWidth + 1.2, bevelEnabled: false });
    landGeom.center();
    const landMesh = new THREE.Mesh(landGeom, metalScaffoldMat);
    landMesh.position.set(0, (kickerBottomY + 1.2) / 2, runwayLen + kickerLen + 7.0 + (landLen / 2));
    landMesh.rotation.y = Math.PI / 2;
    landMesh.castShadow = true;
    landMesh.receiveShadow = true;
    group.add(landMesh);

    group.position.set(x, 0, z);
    scene.add(group);

    // Register Mega Drop Runway Obstacle
    registerObstacle({
      type: 'megadrop_runway',
      x: x,
      z: z + (runwayLen / 2),
      width: runwayWidth,
      length: runwayLen + 4,
      topY: towerTopY,
      bottomY: kickerBottomY,
    });

    // Register Mega Launch Kicker
    registerObstacle({
      type: 'megadrop_kicker',
      x: x,
      z: z + runwayLen + (kickerLen / 2),
      width: runwayWidth + 0.4,
      length: kickerLen,
      baseY: kickerBottomY,
      height: kickerH,
    });

    // Register Mega Drop Downhill Landing Ramp (The metal scaffold ramp)
    registerObstacle({
      type: 'megadrop_landing',
      x: x,
      z: z + runwayLen + kickerLen + 7.0 + (landLen / 2),
      width: runwayWidth + 1.2,
      length: landLen,
      topY: kickerBottomY + 1.2,
      bottomY: 0.2,
    });
  }

  // Generic Kicker Ramp with Precise Wedge Geometry & Lip Coping
  function createKickerRamp(x, z, width, length, height, rotation) {
    const baseY = getTerrainElevation(x, z);
    const rampGroup = new THREE.Group();
    const halfL = length / 2;

    // Wedge Shape in Z-Y: entrance at +Z (South), launch lip at -Z (North)
    const shape = new THREE.Shape();
    shape.moveTo(halfL, 0); // Ground entrance
    shape.quadraticCurveTo(0, height * 0.28, -halfL, height); // Smooth transition up to lip
    shape.lineTo(-halfL, 0); // Vertical back drop
    shape.closePath();

    const geom = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    geom.center(); // Centered in X, Y, Z

    const woodMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.65, metalness: 0.1 });
    const rampMesh = new THREE.Mesh(geom, woodMat);
    rampMesh.position.set(0, height / 2, 0);
    rampMesh.rotation.y = Math.PI / 2; // Extrusion aligns width with local X
    rampMesh.castShadow = true;
    rampMesh.receiveShadow = true;
    rampGroup.add(rampMesh);

    // High-visibility launch coping along the takeoff lip
    const lipGeo = new THREE.BoxGeometry(width, 0.05, 0.08);
    const lipMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.85, roughness: 0.2 });
    const lipMesh = new THREE.Mesh(lipGeo, lipMat);
    lipMesh.position.set(0, height + 0.02, -halfL);
    lipMesh.castShadow = true;
    rampGroup.add(lipMesh);

    rampGroup.position.set(x, baseY, z);
    rampGroup.rotation.y = rotation;
    scene.add(rampGroup);

    registerObstacle({
      type: 'kicker',
      x: x,
      z: z,
      baseY: baseY,
      width: width,
      length: length,
      height: height,
      rotation: rotation,
    });
  }

  // Wooden Boardwalk Platform
  function createBoardwalk(x, z, length, width) {
    const baseY = getTerrainElevation(x, z);
    const geo = new THREE.BoxGeometry(length, 0.28, width);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.75 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, baseY + 0.14, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    registerObstacle({
      type: 'boardwalk',
      x: x,
      z: z,
      width: length,
      length: width,
      height: baseY + 0.28,
    });
  }

  function registerObstacle(obs) {
    state.obstacles.push(obs);
  }

  // Scenery (Populate on terrain elevation)
  function populateScenery() {
    // North (Mountain rocks)
    for (let i = 0; i < 22; i++) {
      const rx = (Math.random() - 0.5) * 60;
      const rz = -36 - Math.random() * 65;
      createBoulder(rx, rz, 1.2 + Math.random() * 2.5, 0x475569);
    }

    // South (Desert cacti and red hoodoo boulders)
    for (let i = 0; i < 24; i++) {
      const rx = (Math.random() - 0.5) * 60;
      const rz = 36 + Math.random() * 65;
      if (Math.random() > 0.45) {
        createCactus(rx, rz, 1.8 + Math.random() * 1.5);
      } else {
        createBoulder(rx, rz, 1.5 + Math.random() * 2.5, 0x9a3412);
      }
    }

    // East (Pine Ridge forest)
    for (let i = 0; i < 28; i++) {
      const rx = 36 + Math.random() * 65;
      const rz = (Math.random() - 0.5) * 60;
      createPineTree(rx, rz, 2.5 + Math.random() * 2.2);
    }
    createBoardwalk(55, -8, 22, 3.2);

    // West (Slickrock boulders)
    for (let i = 0; i < 22; i++) {
      const rx = -36 - Math.random() * 65;
      const rz = (Math.random() - 0.5) * 60;
      createBoulder(rx, rz, 2.0 + Math.random() * 3.5, 0xc2410c);
    }
  }

  function createPineTree(x, z, scale) {
    const baseY = getTerrainElevation(x, z);
    const tree = new THREE.Group();

    const trunkGeo = new THREE.CylinderGeometry(0.18 * scale, 0.25 * scale, 1.2 * scale, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = (1.2 * scale) / 2;
    trunk.castShadow = true;
    tree.add(trunk);

    const folMat = new THREE.MeshStandardMaterial({ color: 0x1e3a29, roughness: 0.8 });
    [1.0, 1.8, 2.5].forEach((yOff, idx) => {
      const coneR = (1.3 - idx * 0.3) * scale;
      const coneH = (1.4 - idx * 0.2) * scale;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(coneR, coneH, 6), folMat);
      cone.position.y = yOff * scale;
      cone.castShadow = true;
      cone.receiveShadow = true;
      tree.add(cone);
    });

    tree.position.set(x, baseY, z);
    scene.add(tree);
  }

  function createCactus(x, z, scale) {
    const baseY = getTerrainElevation(x, z);
    const cactus = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.7 });

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.22 * scale, 2.4 * scale, 8), mat);
    stem.position.y = (2.4 * scale) / 2;
    stem.castShadow = true;
    cactus.add(stem);

    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * scale, 0.14 * scale, 0.8 * scale, 6), mat);
    armR.position.set(0.45 * scale, 1.2 * scale, 0);
    armR.rotation.z = Math.PI / 2;
    cactus.add(armR);

    const armRUp = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * scale, 0.14 * scale, 0.9 * scale, 6), mat);
    armRUp.position.set(0.85 * scale, 1.6 * scale, 0);
    cactus.add(armRUp);

    cactus.position.set(x, baseY, z);
    scene.add(cactus);
  }

  function createBoulder(x, z, scale, color) {
    const baseY = getTerrainElevation(x, z);
    const geo = new THREE.DodecahedronGeometry(scale, 1);
    const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.9, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, baseY + scale * 0.55, z);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    mesh.scale.set(1.2, 0.8, 1.0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  function createTrailSign(title, badgeText, x, z, rotation, badgeColorHex) {
    const baseY = getTerrainElevation(x, z);
    const group = new THREE.Group();
    const postH = 2.4;
    const postMat = new THREE.MeshStandardMaterial({ color: 0x5c3d2e, roughness: 0.9 });

    [-1.2, 1.2].forEach((offX) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, postH, 8), postMat);
      post.position.set(offX, postH / 2, 0);
      post.castShadow = true;
      group.add(post);
    });

    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 160;
    const sCtx = signCanvas.getContext('2d');
    sCtx.fillStyle = '#1e1610';
    sCtx.fillRect(0, 0, 512, 160);
    sCtx.lineWidth = 8;
    sCtx.strokeStyle = '#8d5b38';
    sCtx.strokeRect(4, 4, 504, 152);

    sCtx.fillStyle = '#' + badgeColorHex.toString(16).padStart(6, '0');
    sCtx.beginPath();
    sCtx.roundRect(140, 20, 232, 38, 8);
    sCtx.fill();

    sCtx.fillStyle = '#0f172a';
    sCtx.font = 'bold 22px system-ui, sans-serif';
    sCtx.textAlign = 'center';
    sCtx.fillText(badgeText, 256, 47);

    sCtx.fillStyle = '#f8fafc';
    sCtx.font = 'bold 36px system-ui, sans-serif';
    sCtx.fillText(title.toUpperCase(), 256, 118);

    const signTex = new THREE.CanvasTexture(signCanvas);
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 1.6),
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6, side: THREE.DoubleSide })
    );
    signMesh.position.set(0, postH - 1.2, 0);
    signMesh.castShadow = true;
    group.add(signMesh);

    group.position.set(x, baseY, z);
    group.rotation.y = rotation;
    scene.add(group);
  }

  // ==========================================================================
  // 6. Loading Fungineers X7 Model (Horizontal Orientation & Lighting Fix)
  // ==========================================================================
  function loadX7BoardModel() {
    // 1. Procedural fallback immediately
    setupProceduralBoard();

    // 2. Load optimized CAD GLB
    if (typeof THREE.GLTFLoader === 'undefined') {
      console.warn('GLTFLoader not available, using procedural X7 board.');
      return;
    }

    const loader = new THREE.GLTFLoader();
    loader.load(
      'models/x7_board.glb',
      (gltf) => {
        console.log('Successfully loaded models/x7_board.glb!');
        const model = gltf.scene;

        // Clear procedural stand-in
        while (boardGroup.children.length > 0) {
          boardGroup.remove(boardGroup.children[0]);
        }

        // Re-add headlights (+Z forward) and taillights (-Z rear)
        setupBoardLights();

        // Traverse to configure shadows and identify tire mesh
        let foundTire = null;
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            if (child.name && child.name.toLowerCase().includes('tire')) {
              foundTire = child;
            }
          }
        });

        // ROTATION FIX:
        // In the original CAD assembly, length is along Y (+Y Front, -Y Rear), height is X, and width is Z.
        // Euler (0, Math.PI / 2, Math.PI / 2) maps CAD +Y to Three.js +Z (Forward), +X to +Y (Up), and Z to X (Width).
        model.rotation.set(0, Math.PI / 2, Math.PI / 2);
        model.updateMatrixWorld(true);

        // Center model and elevate on tire radius
        const rootBbox = new THREE.Box3().setFromObject(model);
        const center = rootBbox.getCenter(new THREE.Vector3());
        model.position.sub(center);
        model.position.y += TIRE_RADIUS; // elevate by tire radius

        chassisMesh = model;
        boardGroup.add(chassisMesh);

        // Assign isolated wheel mesh for axle rolling
        wheelMesh = foundTire || null;
      },
      undefined,
      (err) => {
        console.warn('Could not load models/x7_board.glb (using procedural):', err);
      }
    );
  }

  // Procedural Onewheel (Horizontal Orientation)
  function setupProceduralBoard() {
    while (boardGroup.children.length > 0) {
      boardGroup.remove(boardGroup.children[0]);
    }

    // A. Central Go-Kart Tire (Axle along X)
    const tireGeo = new THREE.CylinderGeometry(TIRE_RADIUS, TIRE_RADIUS, 0.18, 24);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85, metalness: 0.1 });
    wheelMesh = new THREE.Mesh(tireGeo, tireMat);
    wheelMesh.position.set(0, TIRE_RADIUS, 0);
    wheelMesh.castShadow = true;
    boardGroup.add(wheelMesh);

    // Motor Hub Anodized Bronze
    const hubGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.185, 16);
    hubGeo.rotateZ(Math.PI / 2);
    const hubMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.8, roughness: 0.25 });
    const hubMesh = new THREE.Mesh(hubGeo, hubMat);
    wheelMesh.add(hubMesh);

    // B. CNC Rails (Anodized Slate Blue along Z length)
    const railMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.7, roughness: 0.3 });
    const railGeo = new THREE.BoxGeometry(0.03, 0.045, 0.74);

    const railLeft = new THREE.Mesh(railGeo, railMat);
    railLeft.position.set(-0.115, TIRE_RADIUS, 0);
    railLeft.castShadow = true;
    boardGroup.add(railLeft);

    const railRight = new THREE.Mesh(railGeo, railMat);
    railRight.position.set(0.115, TIRE_RADIUS, 0);
    railRight.castShadow = true;
    boardGroup.add(railRight);

    // C. Footpads (+Z Front, -Z Rear)
    const padMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.95 });
    const padGeo = new THREE.BoxGeometry(0.23, 0.03, 0.24);

    // Front Pad (+Z)
    const padFront = new THREE.Mesh(padGeo, padMat);
    padFront.position.set(0, TIRE_RADIUS + 0.035, 0.22);
    padFront.castShadow = true;
    boardGroup.add(padFront);

    // Rear Pad (-Z)
    const padRear = new THREE.Mesh(padGeo, padMat);
    padRear.position.set(0, TIRE_RADIUS + 0.035, -0.22);
    padRear.castShadow = true;
    boardGroup.add(padRear);

    // D. Bumpers (+Z Front, -Z Rear)
    const bumperMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
    const bumperFront = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.1), bumperMat);
    bumperFront.position.set(0, TIRE_RADIUS - 0.01, 0.34);
    boardGroup.add(bumperFront);

    const bumperRear = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.1), bumperMat);
    bumperRear.position.set(0, TIRE_RADIUS - 0.01, -0.34);
    boardGroup.add(bumperRear);

    setupBoardLights();
  }

  // Headlight & Taillight System (+Z White Front, -Z Red Rear)
  function setupBoardLights() {
    // 1. Front Headlight Beam (Bright White Spotlight shining towards +Z forward)
    headlightSpot = new THREE.SpotLight(0xecfeff, 2.2, 14, 0.55, 0.4, 1.5);
    headlightSpot.position.set(0, TIRE_RADIUS + 0.02, 0.34);
    const targetObj = new THREE.Object3D();
    targetObj.position.set(0, 0, 8); // Shines forward along +Z
    boardGroup.add(targetObj);
    headlightSpot.target = targetObj;
    boardGroup.add(headlightSpot);

    // Glowing LED Lens (Front - White)
    const lensGeo = new THREE.BoxGeometry(0.14, 0.015, 0.02);
    const lens = new THREE.Mesh(lensGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    lens.position.set(0, TIRE_RADIUS + 0.015, 0.345);
    boardGroup.add(lens);

    // 2. Rear Taillight (Red LED glowing at -Z rear)
    taillightGlow = new THREE.PointLight(0xef4444, 1.5, 4.0);
    taillightGlow.position.set(0, TIRE_RADIUS + 0.02, -0.34);
    boardGroup.add(taillightGlow);

    const redLens = new THREE.Mesh(lensGeo, new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    redLens.position.set(0, TIRE_RADIUS + 0.015, -0.345);
    boardGroup.add(redLens);
  }

  // ==========================================================================
  // 7. Particles & Sparks
  // ==========================================================================
  function initParticlesAndFX() {
    particleGroup = new THREE.Group();
    scene.add(particleGroup);

    const pGeo = new THREE.SphereGeometry(0.06, 6, 6);
    for (let i = 0; i < 48; i++) {
      const pMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0 });
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
      p.material.color.setHex(0xfef08a);
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
  // 8. Controls, Scroll-Lock & Stuck-Movement Prevention
  // ==========================================================================
  function initControls() {
    // Keyboard Handler
    window.addEventListener('keydown', (e) => {
      // 1. SCROLL-LOCK: Prevent page scrolling on arrow keys and spacebar
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }

      // 2. CHECKPOINT HOTKEYS (Keys 1 - 5)
      if (e.code === 'Digit1' || e.code === 'Numpad1') { teleportToCheckpoint(0); return; }
      if (e.code === 'Digit2' || e.code === 'Numpad2') { teleportToCheckpoint(1); return; }
      if (e.code === 'Digit3' || e.code === 'Numpad3') { teleportToCheckpoint(2); return; }
      if (e.code === 'Digit4' || e.code === 'Numpad4') { teleportToCheckpoint(3); return; }
      if (e.code === 'Digit5' || e.code === 'Numpad5') { teleportToCheckpoint(4); return; }

      // 3. ZOOM HOTKEYS
      if (e.code === 'BracketLeft' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
        adjustZoom(+2.5); // Zoom out
        return;
      }
      if (e.code === 'BracketRight' || e.code === 'Equal' || e.code === 'NumpadAdd') {
        adjustZoom(-2.5); // Zoom in
        return;
      }

      // 4. MOVEMENT & TRICK / BALANCE INPUTS
      switch (e.code) {
        // Left Stick / Movement (WASD on desktop)
        case 'KeyW':
          state.input.up = true;
          break;
        case 'KeyS':
          state.input.down = true;
          break;
        case 'KeyA':
          state.input.left = true;
          break;
        case 'KeyD':
          state.input.right = true;
          break;

        // Right Stick / Twist, Flip & Grind Balance (Arrow Keys on desktop)
        case 'ArrowUp':
          state.input.twistUp = true;
          if (state.grind.active) {
            // Tapping Up applies corrective torque impulse to push nose up / balance
            state.grind.balanceVel -= 2.6;
          }
          break;
        case 'ArrowDown':
          state.input.twistDown = true;
          if (state.grind.active) {
            // Tapping Down applies corrective torque impulse to push nose down / balance
            state.grind.balanceVel += 2.6;
          }
          break;
        case 'ArrowLeft':
          state.input.twistLeft = true;
          break;
        case 'ArrowRight':
          state.input.twistRight = true;
          break;

        case 'Space':
          if (!state.input.jump) state.input.jumpPressed = true;
          state.input.jump = true;
          break;
        case 'KeyR':
          respawnPlayer();
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW':
          state.input.up = false;
          break;
        case 'KeyS':
          state.input.down = false;
          break;
        case 'KeyA':
          state.input.left = false;
          break;
        case 'KeyD':
          state.input.right = false;
          break;
        case 'ArrowUp':
          state.input.twistUp = false;
          break;
        case 'ArrowDown':
          state.input.twistDown = false;
          break;
        case 'ArrowLeft':
          state.input.twistLeft = false;
          break;
        case 'ArrowRight':
          state.input.twistRight = false;
          break;
        case 'Space':
          state.input.jump = false;
          break;
      }
    });

    // Reset input states on window blur/visibilitychange so keys never get stuck
    function resetInputs() {
      state.input.up = false;
      state.input.down = false;
      state.input.left = false;
      state.input.right = false;
      state.input.twistUp = false;
      state.input.twistDown = false;
      state.input.twistLeft = false;
      state.input.twistRight = false;
      state.input.jump = false;
      state.input.jumpPressed = false;
      state.input.joystickActive = false;
      state.input.rightJoystickActive = false;
      state.input.joystickVector.x = 0;
      state.input.joystickVector.y = 0;
      state.input.rightJoystickVector.x = 0;
      state.input.rightJoystickVector.y = 0;
    }

    window.addEventListener('blur', resetInputs);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) resetInputs();
    });

    // Mouse Wheel Zoom
    if (container) {
      container.addEventListener('wheel', (e) => {
        e.preventDefault();
        adjustZoom(Math.sign(e.deltaY) * 2.2);
      }, { passive: false });
    }

    // Mobile Pinch-to-Zoom
    let lastPinchDist = null;
    if (container) {
      container.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
          lastPinchDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
        }
      }, { passive: true });

      container.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && lastPinchDist !== null) {
          const currentDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          const delta = (lastPinchDist - currentDist) * 0.08;
          adjustZoom(delta);
          lastPinchDist = currentDist;
        }
      }, { passive: true });

      container.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) lastPinchDist = null;
      }, { passive: true });
    }

    // Touch Jump Button
    if (btnTouchJump) {
      btnTouchJump.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        state.input.jumpPressed = true;
        state.input.jump = true;
      });
      btnTouchJump.addEventListener('pointerup', () => {
        state.input.jump = false;
      });
      btnTouchJump.addEventListener('pointercancel', () => {
        state.input.jump = false;
      });
    }

    // Virtual Touch & Mouse Drag Joysticks (Left Drive + Right Twist & Balance)
    setupVirtualJoystick();
    setupRightVirtualJoystick();
  }

  function adjustZoom(delta) {
    state.camera.targetFrustum = THREE.MathUtils.clamp(
      state.camera.targetFrustum + delta,
      state.camera.minFrustum,
      state.camera.maxFrustum
    );
  }

  function setupVirtualJoystick() {
    if (!joystickZone || !joystickBase || !joystickThumb) return;

    let activePointerId = null;
    let baseRect = null;
    const maxRadius = 42;

    function handleStart(clientX, clientY, pointerId, target) {
      activePointerId = pointerId;
      state.input.joystickActive = true;
      joystickThumb.classList.add('active');
      baseRect = joystickBase.getBoundingClientRect();
      if (target && target.setPointerCapture && pointerId !== undefined) {
        try { target.setPointerCapture(pointerId); } catch (e) {}
      }
      handleMove(clientX, clientY);
    }

    function handleMove(clientX, clientY) {
      if (!state.input.joystickActive || !baseRect) return;
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
      state.input.joystickVector.x = dx / maxRadius;
      state.input.joystickVector.y = -dy / maxRadius;
    }

    function handleEnd(pointerId, target) {
      if (activePointerId !== null && pointerId !== undefined && pointerId !== activePointerId) return;
      activePointerId = null;
      state.input.joystickActive = false;
      state.input.joystickVector.x = 0;
      state.input.joystickVector.y = 0;
      joystickThumb.classList.remove('active');
      joystickThumb.style.transform = 'translate(0px, 0px)';
      if (target && target.releasePointerCapture && pointerId !== undefined) {
        try { target.releasePointerCapture(pointerId); } catch (e) {}
      }
    }

    // Unified Pointer Events (mouse drag on desktop + multi-touch on mobile)
    joystickZone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handleStart(e.clientX, e.clientY, e.pointerId, joystickZone);
    });

    window.addEventListener('pointermove', (e) => {
      if (activePointerId !== null && e.pointerId === activePointerId) {
        e.preventDefault();
        handleMove(e.clientX, e.clientY);
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (activePointerId !== null && e.pointerId === activePointerId) {
        handleEnd(e.pointerId, joystickZone);
      }
    });

    window.addEventListener('pointercancel', (e) => {
      if (activePointerId !== null && e.pointerId === activePointerId) {
        handleEnd(e.pointerId, joystickZone);
      }
    });
  }

  function setupRightVirtualJoystick() {
    if (!rightJoystickZone || !rightJoystickBase || !rightJoystickThumb) return;

    let activePointerId = null;
    let baseRect = null;
    const maxRadius = 42;

    function handleStart(clientX, clientY, pointerId, target) {
      activePointerId = pointerId;
      state.input.rightJoystickActive = true;
      rightJoystickThumb.classList.add('active');
      baseRect = rightJoystickBase.getBoundingClientRect();
      if (target && target.setPointerCapture && pointerId !== undefined) {
        try { target.setPointerCapture(pointerId); } catch (e) {}
      }
      handleMove(clientX, clientY);
    }

    function handleMove(clientX, clientY) {
      if (!state.input.rightJoystickActive || !baseRect) return;
      const centerX = baseRect.left + baseRect.width / 2;
      const centerY = baseRect.top + baseRect.height / 2;

      let dx = clientX - centerX;
      let dy = clientY - centerY;
      const dist = Math.hypot(dx, dy);

      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }

      rightJoystickThumb.style.transform = `translate(${dx}px, ${dy}px)`;
      state.input.rightJoystickVector.x = dx / maxRadius;
      state.input.rightJoystickVector.y = -dy / maxRadius;
    }

    function handleEnd(pointerId, target) {
      if (activePointerId !== null && pointerId !== undefined && pointerId !== activePointerId) return;
      activePointerId = null;
      state.input.rightJoystickActive = false;
      state.input.rightJoystickVector.x = 0;
      state.input.rightJoystickVector.y = 0;
      rightJoystickThumb.classList.remove('active');
      rightJoystickThumb.style.transform = 'translate(0px, 0px)';
      if (target && target.releasePointerCapture && pointerId !== undefined) {
        try { target.releasePointerCapture(pointerId); } catch (e) {}
      }
    }

    rightJoystickZone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handleStart(e.clientX, e.clientY, e.pointerId, rightJoystickZone);
    });

    window.addEventListener('pointermove', (e) => {
      if (activePointerId !== null && e.pointerId === activePointerId) {
        e.preventDefault();
        handleMove(e.clientX, e.clientY);
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (activePointerId !== null && e.pointerId === activePointerId) {
        handleEnd(e.pointerId, rightJoystickZone);
      }
    });

    window.addEventListener('pointercancel', (e) => {
      if (activePointerId !== null && e.pointerId === activePointerId) {
        handleEnd(e.pointerId, rightJoystickZone);
      }
    });
  }

  // ==========================================================================
  // 9. Checkpoint Teleportation System
  // ==========================================================================
  function teleportToCheckpoint(index) {
    if (index < 0 || index >= CHECKPOINTS.length) return;
    const cp = CHECKPOINTS[index];
    state.activeCheckpoint = index;

    const baseElevation = getTerrainElevation(cp.x, cp.z);
    const spawnY = index === 1 ? cp.spawnYOffset : baseElevation + cp.spawnYOffset;

    state.player.x = cp.x;
    state.player.y = spawnY;
    state.player.groundY = spawnY;
    state.player.z = cp.z;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.vz = 0;
    state.player.speed = 0;
    state.player.heading = cp.heading;
    state.player.pitch = 0;
    state.player.roll = 0;
    state.player.isAirborne = false;
    state.player.airtime = 0;
    state.player.isGrinding = false;
    state.grind.active = false;
    if (balanceHud) balanceHud.classList.remove('active');
    state.player.inTabletop = false;
    state.player.inGap = false;
    state.player.inMegaDrop = false;

    // Instant camera target snap
    camera.position.x = cp.x + 30;
    camera.position.y = spawnY + 24.49;
    camera.position.z = cp.z + 30;
    camera.lookAt(cp.x, spawnY + 0.3, cp.z);

    // Update active UI button
    updateCheckpointButtonsUI(index);
    showTrickToast(`WARPED: ${cp.name.toUpperCase()}`);
  }

  function updateCheckpointButtonsUI(activeIndex) {
    cpButtons.forEach((btn, idx) => {
      if (idx === activeIndex) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function respawnPlayer() {
    teleportToCheckpoint(0);
  }

  // ==========================================================================
  // 10. Physics Simulation & Movement Loop
  // ==========================================================================
  function updatePhysics(dt) {
    const p = state.player;

    // 1. Desired Screen-Space Direction
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

      const len = Math.hypot(inputX, inputY);
      if (len > 0) {
        inputX /= len;
        inputY /= len;
      }
    }

    // Convert Screen Space to Isometric World Coordinates
    const worldDirX = (inputX - inputY) * 0.7071;
    const worldDirZ = (-inputX - inputY) * 0.7071;
    const inputMagnitude = Math.min(1.0, Math.hypot(inputX, inputY));

    // 2. Downhill Slope Gravity, Grade Acceleration & Uphill Drag
    if (!p.isAirborne && !state.grind.active) {
      const epsG = 0.45;
      const hE = getTerrainElevation(p.x + epsG, p.z);
      const hW = getTerrainElevation(p.x - epsG, p.z);
      const hS = getTerrainElevation(p.x, p.z + epsG);
      const hN = getTerrainElevation(p.x, p.z - epsG);

      // Gradient vector points uphill (positive height increase)
      const gradX = (hE - hW) / (2 * epsG);
      const gradZ = (hS - hN) / (2 * epsG);

      // Downhill gravitational pull vector (points directly downhill)
      // When carving across a hill, this forces the rider to steer into the hill ("fight gravity")
      const SLOPE_GRAVITY_FORCE = 16.0;
      const downhillX = -gradX;
      const downhillZ = -gradZ;

      p.vx += downhillX * SLOPE_GRAVITY_FORCE * dt;
      p.vz += downhillZ * SLOPE_GRAVITY_FORCE * dt;

      // Grade along board heading (positive = pointing uphill, negative = pointing downhill)
      const forwardDirX = Math.sin(p.heading);
      const forwardDirZ = Math.cos(p.heading);
      const forwardGrade = forwardDirX * gradX + forwardDirZ * gradZ;

      if (forwardGrade > 0.04) {
        // Uphill resistance: gravity opposes velocity, slowing the board
        const uphillDrag = Math.min(forwardGrade * 20.0, 18.0);
        p.vx -= forwardDirX * uphillDrag * dt;
        p.vz -= forwardDirZ * uphillDrag * dt;
      } else if (forwardGrade < -0.04) {
        // Downhill acceleration: gravity boosts board speed downhill
        const downhillBoost = Math.min(-forwardGrade * 18.0, 24.0);
        p.vx += forwardDirX * downhillBoost * dt;
        p.vz += forwardDirZ * downhillBoost * dt;
      }
    }

    // Motor Acceleration or Coasting
    if (inputMagnitude > 0.05) {
      const targetVx = worldDirX * MAX_SPEED * inputMagnitude;
      const targetVz = worldDirZ * MAX_SPEED * inputMagnitude;

      p.vx = THREE.MathUtils.lerp(p.vx, targetVx, ACCELERATION * dt * 0.15);
      p.vz = THREE.MathUtils.lerp(p.vz, targetVz, ACCELERATION * dt * 0.15);
    } else {
      // Coasting friction
      p.vx = THREE.MathUtils.lerp(p.vx, 0, DECELERATION * dt * 0.14);
      p.vz = THREE.MathUtils.lerp(p.vz, 0, DECELERATION * dt * 0.14);
    }

    // Downhill top speed cap allows speed up to 18.5 m/s (~41 MPH!)
    const currentSpeed = Math.hypot(p.vx, p.vz);
    if (currentSpeed > 18.5) {
      p.vx = (p.vx / currentSpeed) * 18.5;
      p.vz = (p.vz / currentSpeed) * 18.5;
    }
    p.speed = Math.hypot(p.vx, p.vz);

    // 3. Heading (Board faces direction of motion when rolling on ground)
    if (!p.isAirborne && p.speed > 0.35 && !state.grind.active) {
      const targetHeading = Math.atan2(p.vx, p.vz);
      let angleDiff = targetHeading - p.heading;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      p.heading += angleDiff * TURN_SPEED * dt;

      // Carve Bank Roll
      const rollTarget = THREE.MathUtils.clamp(-angleDiff * 1.5, -0.15, 0.15);
      p.roll = THREE.MathUtils.lerp(p.roll, rollTarget, dt * 10);
    } else if (!p.isAirborne && !state.grind.active) {
      p.roll = THREE.MathUtils.lerp(p.roll, 0, dt * 8);
    }

    // 4. Terrain Slope Pitch & Carving Roll Alignment
    if (!p.isAirborne && !state.grind.active) {
      const eps = 0.45;
      const hForward = getTerrainElevation(p.x + Math.sin(p.heading) * eps, p.z + Math.cos(p.heading) * eps);
      const hBackward = getTerrainElevation(p.x - Math.sin(p.heading) * eps, p.z - Math.cos(p.heading) * eps);
      const hRight = getTerrainElevation(p.x + Math.cos(p.heading) * eps, p.z - Math.sin(p.heading) * eps);
      const hLeft = getTerrainElevation(p.x - Math.cos(p.heading) * eps, p.z + Math.sin(p.heading) * eps);

      // In Three.js with 'YXZ' rotation order, local +Z is forward.
      // Negative rotation around local X elevates the front nose (+Y).
      // When going uphill (hForward > hBackward), pitch must be negative so nose lifts up!
      const slopePitch = -Math.atan2(hForward - hBackward, eps * 2);
      const slopeRoll = Math.atan2(hRight - hLeft, eps * 2);

      // Rider acceleration tilt (pitch nose down slightly on acceleration, up on brake)
      const accelRate = (inputMagnitude * MAX_SPEED - p.speed) / MAX_SPEED;
      const riderPitch = THREE.MathUtils.clamp(-accelRate * 0.04, -0.03, 0.03);

      p.pitch = THREE.MathUtils.lerp(p.pitch, slopePitch + riderPitch, dt * 14);
      p.roll = THREE.MathUtils.lerp(p.roll, slopeRoll + p.roll, dt * 8);
    }

    // 5. Position Integration & Boundary Clamping
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.x = THREE.MathUtils.clamp(p.x, -135, 135);
    p.z = THREE.MathUtils.clamp(p.z, -135, 135);

    // 6. Vertical & Jump Physics
    handleObstaclesAndGround(dt);

    // Bunny Hop Jump Input
    if (state.input.jumpPressed && !p.isAirborne && !state.grind.active) {
      p.vy = JUMP_VELOCITY;
      p.isAirborne = true;
      p.airtime = 0;
      state.input.jumpPressed = false;
      state.aerial.airYaw = 0;
      state.aerial.airPitch = 0;
      state.aerial.spin180Done = false;
      state.aerial.spin360Done = false;
      state.aerial.flipDone = false;
    }

    // Airborne Gravity Simulation & Aerial Rigid-Body Rotation
    if (p.isAirborne) {
      p.vy += GRAVITY * dt;
      p.y += p.vy * dt;
      p.airtime += dt;

      // In-Air Rigid Body+Board Aerial Rotation (Spins & Flips)
      if (!state.grind.active) {
        let twistX = 0;
        let twistY = 0;
        if (state.input.rightJoystickActive) {
          twistX = state.input.rightJoystickVector.x;
          twistY = state.input.rightJoystickVector.y;
        } else {
          if (state.input.twistRight) twistX += 1;
          if (state.input.twistLeft) twistX -= 1;
          if (state.input.twistUp) twistY += 1;
          if (state.input.twistDown) twistY -= 1;
        }

        // Horizontal Twist (Yaw Spin: 180, 360)
        if (Math.abs(twistX) > 0.05) {
          const spinDelta = twistX * 8.2 * dt;
          p.heading += spinDelta;
          state.aerial.airYaw += spinDelta;

          if (!state.aerial.spin180Done && Math.abs(state.aerial.airYaw) >= Math.PI * 0.88) {
            state.aerial.spin180Done = true;
            showTrickToast('180 SPIN! +250 🔄');
          }
          if (!state.aerial.spin360Done && Math.abs(state.aerial.airYaw) >= Math.PI * 1.88) {
            state.aerial.spin360Done = true;
            showTrickToast('360 SPIN! +500 🌪️');
          }
        }

        // Vertical Twist (Pitch Flips: Backflip / Frontflip)
        if (Math.abs(twistY) > 0.05) {
          // Pulling down / stick back (twistY < 0): Backflip
          // Pushing up / stick forward (twistY > 0): Frontflip
          const flipDelta = -twistY * 7.5 * dt;
          p.pitch += flipDelta;
          state.aerial.airPitch += flipDelta;

          if (!state.aerial.flipDone) {
            if (state.aerial.airPitch >= Math.PI * 1.80) {
              state.aerial.flipDone = true;
              showTrickToast('BACKFLIP! +750 🌀');
            } else if (state.aerial.airPitch <= -Math.PI * 1.80) {
              state.aerial.flipDone = true;
              showTrickToast('FRONTFLIP! +750 🔄');
            }
          }
        }
      }

      // Landing check
      if (p.y <= p.groundY) {
        p.y = p.groundY;
        p.vy = 0;
        p.isAirborne = false;

        // Wrap pitch to [-PI, PI]
        while (p.pitch > Math.PI) p.pitch -= Math.PI * 2;
        while (p.pitch < -Math.PI) p.pitch += Math.PI * 2;

        if (Math.abs(p.pitch) > 1.25) {
          showTrickToast('SKETCHY LANDING! ⚠️');
          p.vx *= 0.55;
          p.vz *= 0.55;
        } else if (p.airtime > 0.45 && !state.aerial.spin180Done && !state.aerial.flipDone) {
          showTrickToast('BIG AIR! +150');
        }
        p.airtime = 0;
        state.aerial.airYaw = 0;
        state.aerial.airPitch = 0;
        state.aerial.spin180Done = false;
        state.aerial.spin360Done = false;
        state.aerial.flipDone = false;
      }
    } else {
      // Ground elevation clamping
      p.y = THREE.MathUtils.lerp(p.y, p.groundY, dt * 20);
    }

    // 7. Update 3D Board Transforms
    boardGroup.position.set(p.x, p.y, p.z);
    boardGroup.rotation.y = p.heading;
    boardGroup.rotation.x = p.pitch;
    boardGroup.rotation.z = p.roll;

    // Spin tire along axle
    if (wheelMesh) {
      wheelMesh.rotateX((p.speed / TIRE_RADIUS) * dt);
    }

    // 8. Update Drop Shadow Decal
    shadowMesh.position.set(p.x, p.groundY + 0.018, p.z);
    shadowMesh.rotation.y = p.heading;
    const jumpHeight = Math.max(0, p.y - p.groundY);
    const shadowScale = THREE.MathUtils.clamp(1 - jumpHeight * 0.35, 0.45, 1.0);
    shadowMesh.scale.set(shadowScale, shadowScale, shadowScale);
    shadowMesh.material.opacity = THREE.MathUtils.clamp(0.65 - jumpHeight * 0.25, 0.18, 0.65);

    // 9. Particles
    if (p.speed > 1.2 && !p.isAirborne) {
      if (Math.random() < 0.45) {
        const dustCol = getTerrainColor(p.x, p.z);
        emitDustParticle(p.x, p.groundY, p.z, dustCol);
      }
    }

    // 10. Check Current Zone
    checkCurrentZone();
  }

  // Handle Ground Elevation & Stunt Obstacle Collisions
  function handleObstaclesAndGround(dt) {
    const p = state.player;
    let targetGround = getTerrainElevation(p.x, p.z);
    p.isGrinding = false;

    for (const obs of state.obstacles) {
      const halfW = obs.width / 2;
      const halfL = obs.length / 2;

      // 1. KICKER RAMPS (Rotated local coordinate collision)
      if (obs.type === 'kicker') {
        const dx = p.x - obs.x;
        const dz = p.z - obs.z;
        const cosR = Math.cos(-obs.rotation);
        const sinR = Math.sin(-obs.rotation);
        const localX = dx * cosR + dz * sinR;
        const localZ = -dx * sinR + dz * cosR;

        if (Math.abs(localX) <= halfW && Math.abs(localZ) <= halfL) {
          // Entrance at localZ = +halfL, Lip at localZ = -halfL
          const ratio = THREE.MathUtils.clamp((halfL - localZ) / obs.length, 0, 1);
          const rampY = obs.baseY + Math.pow(ratio, 1.25) * obs.height;
          targetGround = Math.max(targetGround, rampY);

          if (ratio > 0.82 && p.speed > 2.8 && !p.isAirborne) {
            p.vy = JUMP_VELOCITY * 1.22;
            p.isAirborne = true;
            showTrickToast('KICKER POP! +200');
          }
        }
        continue;
      }

      // Standard AABB overlap check for non-rotated obstacles
      const effectiveHalfW = obs.type === 'rail' ? 0.65 : halfW;
      const effectiveHalfL = obs.type === 'rail' ? halfL + 0.35 : halfL;
      if (
        p.x >= obs.x - effectiveHalfW &&
        p.x <= obs.x + effectiveHalfW &&
        p.z >= obs.z - effectiveHalfL &&
        p.z <= obs.z + effectiveHalfL
      ) {
        if (obs.type === 'tabletop') {
          // RelRun goes from 0 (takeoff) to length (landing)
          const relRun = (obs.z + halfL) - p.z;
          if (relRun >= 0 && relRun <= obs.length) {
            let deckY = obs.baseY;
            if (relRun < obs.takeoffLen) {
              deckY += (relRun / obs.takeoffLen) * obs.height;
              if (relRun > obs.takeoffLen * 0.85 && p.speed > 3.8 && !p.isAirborne) {
                p.vy = JUMP_VELOCITY * 1.15;
                p.isAirborne = true;
                p.inTabletop = true;
                state.aerial.airYaw = 0;
                state.aerial.airPitch = 0;
                state.aerial.spin180Done = false;
                state.aerial.spin360Done = false;
                state.aerial.flipDone = false;
              }
            } else if (relRun <= obs.takeoffLen + obs.deckLen) {
              deckY += obs.height;
              if (p.inTabletop) {
                showTrickToast('TABLETOP STOMP! +250');
                p.inTabletop = false;
              }
            } else {
              const landRatio = (relRun - obs.takeoffLen - obs.deckLen) / obs.landingLen;
              deckY += (1 - landRatio) * obs.height;
              if (p.inTabletop) {
                showTrickToast('TABLETOP CLEARED! +300');
                p.inTabletop = false;
              }
            }
            targetGround = Math.max(targetGround, deckY);
          }
        } else if (obs.type === 'gap_kicker') {
          const relZ = (p.z - obs.z);
          const ratio = THREE.MathUtils.clamp((halfL - relZ) / obs.length, 0, 1);
          const rampY = obs.baseY + ratio * obs.height;
          targetGround = Math.max(targetGround, rampY);

          if (ratio > 0.85 && p.speed > 3.5 && !p.isAirborne) {
            p.vy = JUMP_VELOCITY * 1.35;
            p.isAirborne = true;
            p.inGap = true;
            state.aerial.airYaw = 0;
            state.aerial.airPitch = 0;
            state.aerial.spin180Done = false;
            state.aerial.spin360Done = false;
            state.aerial.flipDone = false;
            showTrickToast('GAP LAUNCH! 🚀');
          }
        } else if (obs.type === 'gap_landing') {
          const relZ = (p.z - obs.z);
          const ratio = THREE.MathUtils.clamp((halfL - relZ) / obs.length, 0, 1);
          const rampY = obs.baseY + (1 - ratio) * obs.height;
          targetGround = Math.max(targetGround, rampY);

          if (p.inGap && p.isAirborne && p.y <= rampY + 0.3) {
            p.inGap = false;
            showTrickToast('CANYON GAP CLEARED! +350');
          }
        } else if (obs.type === 'whaletail') {
          const relRun = (obs.z + halfL) - p.z;
          if (relRun >= 0 && relRun <= obs.length) {
            let spineY = obs.baseY;
            if (relRun < 4.5) {
              spineY += (relRun / 4.5) * obs.height;
            } else if (relRun <= 10.5) {
              const arch = Math.sin(((relRun - 4.5) / 6.0) * Math.PI) * 0.35;
              spineY += obs.height + arch;
              if (p.speed > 2.5) {
                emitGrindSparks(p.x, spineY, p.z);
                showTrickToast('WHALE TAIL SPINE! +300');
              }
            } else {
              const dropRatio = (relRun - 10.5) / (obs.length - 10.5);
              spineY += (1 - dropRatio) * obs.height;
              if (!p.isAirborne && p.speed > 3.5 && dropRatio > 0.85) {
                p.vy = JUMP_VELOCITY * 1.2;
                p.isAirborne = true;
                state.aerial.airYaw = 0;
                state.aerial.airPitch = 0;
                state.aerial.spin180Done = false;
                state.aerial.spin360Done = false;
                state.aerial.flipDone = false;
                showTrickToast('WHALE TAIL DROP! +300');
              }
            }
            targetGround = Math.max(targetGround, spineY);
          }
        } else if (obs.type === 'megadrop_runway') {
          const ratio = THREE.MathUtils.clamp((p.z - (obs.z - halfL)) / obs.length, 0, 1);
          const dropY = obs.topY - ratio * (obs.topY - obs.bottomY);
          targetGround = Math.max(targetGround, dropY);

          // Steep downhill gravity acceleration
          if (!p.isAirborne) {
            p.vz += 26.0 * dt; // accelerate South down the steep decline
            p.speed = Math.hypot(p.vx, p.vz);
          }
        } else if (obs.type === 'megadrop_kicker') {
          const relZ = (p.z - obs.z);
          const ratio = THREE.MathUtils.clamp((halfL - relZ) / obs.length, 0, 1);
          const rampY = obs.baseY + Math.pow(ratio, 1.4) * obs.height;
          targetGround = Math.max(targetGround, rampY);

          if (ratio > 0.8 && p.speed > 5.0 && !p.isAirborne) {
            p.vy = JUMP_VELOCITY * 1.85; // Massive mega kicker launch impulse (14.5 m/s)
            p.isAirborne = true;
            p.airtime = 0;
            state.aerial.airYaw = 0;
            state.aerial.airPitch = 0;
            state.aerial.spin180Done = false;
            state.aerial.spin360Done = false;
            state.aerial.flipDone = false;
            showTrickToast('MEGA DROP SUPER AIR! +500');
          }
        } else if (obs.type === 'megadrop_landing') {
          // Smooth transition along the black metal scaffold landing ramp
          const relZ = THREE.MathUtils.clamp((p.z - (obs.z - halfL)) / obs.length, 0, 1);
          const landY = obs.topY - relZ * (obs.topY - obs.bottomY);
          targetGround = Math.max(targetGround, landY);

          // If airborne and catching the landing slope
          if (p.isAirborne && p.y <= landY + 0.35) {
            p.y = landY;
            p.vy = 0;
            p.isAirborne = false;
            p.vz += 8.0 * dt;
            p.speed = Math.hypot(p.vx, p.vz);
            showTrickToast('MEGA DROP LANDED! +500');
          }
        } else if (obs.type === 'rail') {
          if (p.y >= obs.height - 0.28 && p.y <= obs.height + 0.65) {
            targetGround = Math.max(targetGround, obs.height);

            // If not currently grinding, lock into rail
            if (!state.grind.active) {
              let twistY = 0;
              if (state.input.rightJoystickActive) {
                twistY = state.input.rightJoystickVector.y;
              } else {
                if (state.input.twistUp) twistY += 1;
                if (state.input.twistDown) twistY -= 1;
              }

              // Determine grind trick:
              // twistY > 0.2: Up / Noseslide
              // twistY < -0.2: Down / Tailslide
              // Cross angle: Boardslide
              // Neutral: 50-50
              let grindType = '50-50';
              if (twistY > 0.2) {
                grindType = 'noseslide';
              } else if (twistY < -0.2) {
                grindType = 'tailslide';
              } else if (Math.abs(Math.cos(p.heading)) < 0.65) {
                grindType = 'boardslide';
              }

              state.grind.active = true;
              state.grind.type = grindType;
              state.grind.balance = (Math.random() - 0.5) * 0.16;
              state.grind.balanceVel = (Math.random() - 0.5) * 0.35;
              state.grind.timer = 0;
              state.grind.railX = obs.x;
              state.grind.railMinZ = obs.z - halfL;
              state.grind.railMaxZ = obs.z + halfL;

              if (balanceHud) balanceHud.classList.add('active');
              if (balanceLabel) balanceLabel.textContent = grindType.toUpperCase();
              showTrickToast(`LOCKED: ${grindType.toUpperCase()}! 🔥`);
            }

            // Grind physics loop
            if (state.grind.active) {
              p.isGrinding = true;
              p.isAirborne = false;
              p.vy = 0;
              p.y = obs.height;
              state.grind.timer += dt;

              // Pull board smoothly onto rail line
              p.x = THREE.MathUtils.lerp(p.x, obs.x, dt * 18);

              // Maintain forward glide along the rail (never stall out)
              const grindSign = Math.sign(p.vz) || 1;
              const minGrindSpeed = 4.5;
              if (Math.abs(p.vz) < minGrindSpeed) {
                p.vz = grindSign * minGrindSpeed;
              }
              p.vx = THREE.MathUtils.lerp(p.vx, 0, dt * 10);
              p.speed = Math.hypot(p.vx, p.vz);

              // Trick-specific board pitch & spark emitter
              if (state.grind.type === 'noseslide') {
                // Nose rests down on rail, tail tilted up in air
                p.pitch = -0.26 + state.grind.balance * 0.12;
                emitGrindSparks(p.x, obs.height + 0.02, p.z - 0.36);
              } else if (state.grind.type === 'tailslide') {
                // Tail rests down on rail, nose tilted up in air
                p.pitch = 0.26 + state.grind.balance * 0.12;
                emitGrindSparks(p.x, obs.height + 0.02, p.z + 0.36);
              } else {
                // Boardslide or 50-50
                p.pitch = state.grind.balance * 0.14;
                emitGrindSparks(p.x, obs.height + 0.02, p.z);
              }

              // Balance mini-game drift simulation:
              // Natural instability pushes needle away from center
              state.grind.balanceVel += (state.grind.balance * 2.2 + (Math.random() - 0.5) * 1.4) * dt;
              // Mild damping
              state.grind.balanceVel *= (1.0 - 0.45 * dt);

              // Continuous correction from right joystick (mobile or gamepad)
              if (state.input.rightJoystickActive) {
                state.grind.balanceVel -= state.input.rightJoystickVector.y * 3.8 * dt;
              }

              // Integrate balance position
              state.grind.balance += state.grind.balanceVel * dt;

              // Update HUD Needle
              if (balanceNeedle) {
                const needleOffset = THREE.MathUtils.clamp(state.grind.balance, -1.2, 1.2) * 65;
                balanceNeedle.style.transform = `translateX(${needleOffset}px)`;
                if (Math.abs(state.grind.balance) > 0.6) {
                  balanceNeedle.classList.add('danger');
                } else {
                  balanceNeedle.classList.remove('danger');
                }
              }

              // 1. SLIP OFF RAIL (Bail if balance exceeds limits)
              if (Math.abs(state.grind.balance) > 1.0) {
                showTrickToast('SLIPPED OFF RAIL! 💥');
                state.grind.active = false;
                p.isGrinding = false;
                p.x += (state.grind.balance > 0 ? 0.42 : -0.42);
                p.vx = (state.grind.balance > 0 ? 2.0 : -2.0);
                if (balanceHud) balanceHud.classList.remove('active');
              }

              // 2. HOP OFF RAIL (Space / Hop button)
              if (state.input.jumpPressed) {
                state.input.jumpPressed = false;
                p.vy = JUMP_VELOCITY * 1.15;
                p.isAirborne = true;
                state.grind.active = false;
                p.isGrinding = false;
                if (balanceHud) balanceHud.classList.remove('active');
                const pts = Math.round(state.grind.timer * 160 + 250);
                showTrickToast(`${state.grind.type.toUpperCase()} POP-OFF! +${pts} 🛹`);
              }

              // 3. REACHED END OF RAIL (Dismount)
              if (p.z < obs.z - halfL - 0.25 || p.z > obs.z + halfL + 0.25) {
                state.grind.active = false;
                p.isGrinding = false;
                if (balanceHud) balanceHud.classList.remove('active');
                const pts = Math.round(state.grind.timer * 120 + 200);
                showTrickToast(`${state.grind.type.toUpperCase()} LANDED! +${pts} ✨`);
              }
            }
          }
        } else {
          // Ledges, curbs, boardwalks
          if (p.y >= obs.height - 0.15) {
            targetGround = Math.max(targetGround, obs.height);
          }
        }
      }
    }

    // Clean up grind HUD if no longer grinding on any obstacle
    if (state.grind.active && !p.isGrinding) {
      state.grind.active = false;
      if (balanceHud) balanceHud.classList.remove('active');
    }

    // Multi-point ground clearance check to guarantee nose and tail bumpers never clip:
    const bumperDist = 0.38; // Distance from axle to bumper tip
    const noseX = p.x + Math.sin(p.heading) * bumperDist;
    const noseZ = p.z + Math.cos(p.heading) * bumperDist;
    const tailX = p.x - Math.sin(p.heading) * bumperDist;
    const tailZ = p.z - Math.cos(p.heading) * bumperDist;

    const hNose = getTerrainElevation(noseX, noseZ);
    const hTail = getTerrainElevation(tailX, tailZ);

    // Height offset of nose/tail relative to center axle:
    // With rotation order 'YXZ', pitch < 0 is nose up (+Y), tail down (-Y).
    const noseDeltaY = -Math.sin(p.pitch) * bumperDist;
    const tailDeltaY = Math.sin(p.pitch) * bumperDist;

    // Minimum center height so bumpers clear local ground by at least 0.055m
    const minCenterForNose = hNose - noseDeltaY + 0.055;
    const minCenterForTail = hTail - tailDeltaY + 0.055;

    targetGround = Math.max(targetGround, minCenterForNose, minCenterForTail);
    p.groundY = targetGround;
  }

  // Terrain particle tint helper
  function getTerrainColor(x, z) {
    if (Math.abs(x) < 22 && Math.abs(z) < 22) return 0x94a3b8;
    if (z < -25) return 0x64748b;
    if (z > 25) return 0xc2410c;
    if (x > 25) return 0x854d0e;
    if (x < -25) return 0xea580c;
    return 0x94a3b8;
  }

  // Zone & Trailhead Entry Detection
  function checkCurrentZone() {
    const p = state.player;
    let newZone = 'Central Town Square';
    let newType = 'PLAZA';

    if (Math.abs(p.x) < 24 && Math.abs(p.z) < 24) {
      newZone = 'Central Town Square';
      newType = 'PLAZA';
    } else if (p.z < -26 && Math.abs(p.x) < Math.abs(p.z) * 1.5) {
      newZone = 'Thunder Peak';
      newType = 'JUMP LINE';
    } else if (p.z > 26 && Math.abs(p.x) < Math.abs(p.z) * 1.5) {
      newZone = 'Cactus Canyon';
      newType = 'CHILL TRAIL';
    } else if (p.x > 26 && Math.abs(p.z) < Math.abs(p.x) * 1.5) {
      newZone = 'Pine Ridge';
      newType = 'CHILL TRAIL';
    } else if (p.x < -26 && Math.abs(p.z) < Math.abs(p.x) * 1.5) {
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

  // ==========================================================================
  // 11. Camera Tracking & HUD Updates
  // ==========================================================================
  function updateCamera() {
    const p = state.player;

    const targetX = p.x + 30;
    const targetY = p.y + 24.49;
    const targetZ = p.z + 30;

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.1);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.1);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.1);

    camera.lookAt(p.x, p.y + 0.3, p.z);

    // Smooth camera zoom interpolation
    const cs = state.camera;
    if (Math.abs(cs.frustumSize - cs.targetFrustum) > 0.02) {
      cs.frustumSize = THREE.MathUtils.lerp(cs.frustumSize, cs.targetFrustum, 0.16);
      updateCameraProjection();
    }

    // Follow sun light target so shadow is always sharp
    if (sunLight) {
      sunLight.position.set(p.x + 45, p.y + 75, p.z + 35);
      sunLight.target.position.set(p.x, p.y, p.z);
    }
  }

  function updateCameraProjection() {
    if (!container || !camera) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const aspect = width / height;
    const f = state.camera.frustumSize;

    camera.left = (-f * aspect) / 2;
    camera.right = (f * aspect) / 2;
    camera.top = f / 2;
    camera.bottom = -f / 2;
    camera.updateProjectionMatrix();
  }

  function updateHUD() {
    const p = state.player;

    // Speed in MPH
    const mph = (p.speed * 2.23694).toFixed(1);
    if (hudSpeedVal) hudSpeedVal.textContent = mph;

    if (hudSpeedBar) {
      const pct = Math.min(100, (p.speed / MAX_SPEED) * 100);
      hudSpeedBar.style.width = pct + '%';
    }

    // Compass pointing back to town square center (0, 0)
    if (compassArrow && compassDist) {
      const dist = Math.hypot(p.x, p.z).toFixed(0);
      compassDist.textContent = dist + 'm';

      const toOriginAngle = Math.atan2(-p.x, -p.z);
      const screenAngle = (toOriginAngle + Math.PI / 4) * (180 / Math.PI);
      compassArrow.style.transform = `rotate(${screenAngle}deg)`;
    }
  }

  // ==========================================================================
  // 12. Resize & Fullscreen
  // ==========================================================================
  function onWindowResize() {
    if (!container || !renderer || !camera) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    updateCameraProjection();
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
  // 13. Main Animation Loop
  // ==========================================================================
  function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(state.clock.getDelta(), 0.05);

    updatePhysics(dt);
    updateParticles(dt);
    updateCamera();
    updateHUD();

    renderer.render(scene, camera);
  }

})();
