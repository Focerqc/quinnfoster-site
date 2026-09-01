/**
 * Experience 8: Photorealistic 3D Stator Winding & Star/Delta Circuit Visualizer
 * Built for 27-Slot Superflux & Cannoncore Hub Motor Stator Laminations
 * Author: Quinn Foster
 */

(function () {
  'use strict';

  // --- Constants & Geometry Specs ---
  const STATOR_SPECS = {
    name: "Superflux & Cannoncore 27-Slot Stator",
    slots: 27,
    outerDiameterMm: 115.0,
    innerDiameterMm: 60.0,
    stackLengthMm: 90.0,
    toothStemWidthMm: 5.0,
    slotOpeningMm: 2.2,
    slotAreaMm2: 98.5, // Usable cross-sectional slot area
    meanTurnLengthBaseMm: 210.0,
  };

  // Wire gauge database (AWG & Metric diameter, bare copper area mm²)
  const WIRE_GAUGE_DB = [
    { awg: 18, diaMm: 1.024, areaMm2: 0.823, totalDiaMm: 1.09 },
    { awg: 19, diaMm: 0.912, areaMm2: 0.653, totalDiaMm: 0.97 },
    { awg: 20, diaMm: 0.812, areaMm2: 0.518, totalDiaMm: 0.87 },
    { awg: 21, diaMm: 0.723, areaMm2: 0.410, totalDiaMm: 0.78 },
    { awg: 22, diaMm: 0.644, areaMm2: 0.326, totalDiaMm: 0.70 },
    { awg: 23, diaMm: 0.573, areaMm2: 0.258, totalDiaMm: 0.62 },
    { awg: 24, diaMm: 0.511, areaMm2: 0.205, totalDiaMm: 0.56 },
    { awg: 25, diaMm: 0.455, areaMm2: 0.162, totalDiaMm: 0.50 },
    { awg: 26, diaMm: 0.405, areaMm2: 0.129, totalDiaMm: 0.45 },
    { awg: 27, diaMm: 0.361, areaMm2: 0.102, totalDiaMm: 0.40 },
    { awg: 28, diaMm: 0.321, areaMm2: 0.081, totalDiaMm: 0.36 }, // Standard multi-strand
    { awg: 29, diaMm: 0.286, areaMm2: 0.064, totalDiaMm: 0.32 },
    { awg: 30, diaMm: 0.255, areaMm2: 0.051, totalDiaMm: 0.29 },
    { awg: 32, diaMm: 0.202, areaMm2: 0.032, totalDiaMm: 0.23 }
  ];

  // Magnet grade database
  const MAGNET_GRADES = {
    'N35': 1.18,
    'N38': 1.23,
    'N42': 1.30,
    'N45': 1.35,
    'N48': 1.40,
    'N50': 1.43,
    'N52': 1.46
  };

  // Phase color definitions (Industry-Standard Brushless Motor Colors: Yellow U, Blue V, Green W)
  const PHASE_COLORS = {
    A: { hex: '#eab308', threeHex: 0xeab308, name: 'Phase A (U)', dark: '#854d0e', light: '#fef08a' }, // Yellow (U)
    B: { hex: '#3b82f6', threeHex: 0x3b82f6, name: 'Phase B (V)', dark: '#1d4ed8', light: '#93c5fd' }, // Blue (V)
    C: { hex: '#10b981', threeHex: 0x10b981, name: 'Phase C (W)', dark: '#047857', light: '#6ee7b7' }, // Green (W)
    neutral: { hex: '#e2e8f0', threeHex: 0xe2e8f0, name: 'Neutral Star (N)', dark: '#64748b', light: '#ffffff' }
  };

  // Pure Copper Color
  const COPPER_COLOR = 0xcd7f32;

  // Application State
  const state = {
    poles: 30,
    turns: 6,
    strands: 18,
    wireAwg: 28,
    connection: 'wye', // 'wye' or 'delta'
    magnetGrade: 'N48',
    magnetBr: 1.40,
    airgapMm: 0.70,
    magnetThickMm: 3.0,
    batteryVoltage: 84.0,
    currentA: 50.0,
    tireDiameterInches: 11.0,
    activeTab: 'view-3d',
    explodedProgress: 0.0,
    statorOpacity: 1.0, // 1.0 = solid, 0.35 = translucent x-ray, 0.0 = hidden
    wireAppearance: 'phase-coded', // 'phase-coded', 'copper', or 'copper-labeled'
    soloPhase: 'all', // 'all', 'A', 'B', 'C'
    showJumpers: true,
    showTerminations: true,
    autoSpin: false,
    calculated: {}
  };

  // Three.js References
  let scene, camera, renderer, controls;
  let rootSceneGroup, statorGroup, windingsGroup, jumpersGroup, terminationsGroup, labelsGroup, rotorGroup;
  let animFrameId = null;
  let glbLoaded = false;

  // --- Mathematical Winding Solver (Star of Slots) ---
  function computeWindingPattern(slots, poles) {
    const gammaE = (poles / 2) * (2 * Math.PI / slots);
    const teeth = [];

    const candidates = [
      { code: 'A', phase: 'A', dir: 1, target: 0 },
      { code: 'a', phase: 'A', dir: -1, target: Math.PI },
      { code: 'B', phase: 'B', dir: 1, target: 2 * Math.PI / 3 },
      { code: 'b', phase: 'B', dir: -1, target: 5 * Math.PI / 3 },
      { code: 'C', phase: 'C', dir: 1, target: 4 * Math.PI / 3 },
      { code: 'c', phase: 'C', dir: -1, target: Math.PI / 3 }
    ];

    for (let s = 0; s < slots; s++) {
      const elecAngle = (s * gammaE) % (2 * Math.PI);
      const mechAngleDeg = s * (360 / slots);
      const elecAngleDeg = (s * (poles / 2) * (360 / slots)) % 360;

      let bestCand = candidates[0];
      let minDiff = Infinity;

      for (let c of candidates) {
        let diff = Math.abs(((elecAngle - c.target + Math.PI) % (2 * Math.PI)) - Math.PI);
        if (diff < minDiff) {
          minDiff = diff;
          bestCand = c;
        }
      }

      teeth.push({
        slotNumber: s + 1,
        code: bestCand.code,
        phase: bestCand.phase,
        direction: bestCand.dir, // 1 = CW (+), -1 = CCW (-)
        dirName: bestCand.dir === 1 ? 'CW (+)' : 'CCW (−)',
        mechAngleDeg: mechAngleDeg,
        elecAngleDeg: elecAngleDeg,
        elecAngleRad: elecAngle
      });
    }

    const schemaString = teeth.map(t => t.code).join('');

    // Fundamental Winding Factor kw1
    let sumX = 0, sumY = 0, countA = 0;
    for (let t of teeth) {
      if (t.phase === 'A') {
        countA++;
        const angle = t.elecAngleRad + (t.direction === -1 ? Math.PI : 0);
        sumX += Math.cos(angle);
        sumY += Math.sin(angle);
      }
    }
    const kw1 = countA > 0 ? (Math.hypot(sumX, sumY) / countA) : 0.9598;

    function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
    const gcdPoles = gcd(slots, poles / 2);
    const lcmCogging = (slots * poles) / gcd(slots, poles);

    return {
      teeth,
      schemaString,
      kw1,
      gcdPoles,
      lcmCogging,
      gammaEDeg: (gammaE * 180 / Math.PI) % 360
    };
  }

  // --- Motor Physics & Performance Engine ---
  function recalculateAll() {
    const winding = computeWindingPattern(STATOR_SPECS.slots, state.poles);

    const wireEntry = WIRE_GAUGE_DB.find(w => w.awg === state.wireAwg) || WIRE_GAUGE_DB[10];
    const singleStrandAreaMm2 = wireEntry.areaMm2;
    const totalBundleAreaMm2 = singleStrandAreaMm2 * state.strands;
    const slotCopperAreaMm2 = 2 * state.turns * totalBundleAreaMm2; // 2 coil sides per slot
    const slotFillFactor = (slotCopperAreaMm2 / STATOR_SPECS.slotAreaMm2) * 100;

    // Copper Mass
    const meanTurnLengthM = (STATOR_SPECS.meanTurnLengthBaseMm + (state.turns * 3.5)) / 1000.0;
    const totalConductorLengthM = meanTurnLengthM * state.turns * STATOR_SPECS.slots * state.strands;
    const copperDensityKgM3 = 8960;
    const copperVolumeM3 = (totalConductorLengthM) * (singleStrandAreaMm2 * 1e-6);
    const totalCopperMassGrams = copperVolumeM3 * copperDensityKgM3 * 1000;

    // Resistance Calculation @ 80°C
    const rhoCopper80C = 2.12e-8; // Ohm*m
    const turnsPerPhase = state.turns * (STATOR_SPECS.slots / 3);
    const singlePhaseWireLengthM = turnsPerPhase * meanTurnLengthM;
    const bundleCrossSectionM2 = totalBundleAreaMm2 * 1e-6;
    const phaseResistanceRph = (rhoCopper80C * singlePhaseWireLengthM) / bundleCrossSectionM2;

    const isWye = state.connection === 'wye';
    const terminalResistanceRtt = isWye ? (2 * phaseResistanceRph) : ((2 / 3) * phaseResistanceRph);

    // Magnetic Flux & Back-EMF Constants
    state.magnetBr = MAGNET_GRADES[state.magnetGrade] || 1.40;
    const effectiveAirgap = state.airgapMm + (state.magnetThickMm / 1.05) * 0.15;
    const airgapFluxDensityBg = state.magnetBr * (state.magnetThickMm / (state.magnetThickMm + effectiveAirgap * 1.15));
    
    const polePitchM = (Math.PI * (STATOR_SPECS.outerDiameterMm * 1e-3)) / state.poles;
    const stackLengthM = STATOR_SPECS.stackLengthMm * 1e-3;
    const fluxPerPoleWb = (2 / Math.PI) * airgapFluxDensityBg * polePitchM * stackLengthM;

    // Torque & Velocity Constants
    const N_phase = turnsPerPhase;
    const kw = winding.kw1;
    let BEMF_factor = isWye ? Math.sqrt(3) : 1.0;
    const Ke_peak = 2 * N_phase * kw * fluxPerPoleWb * (state.poles / 2) * BEMF_factor;
    const Kt = Ke_peak * (3 / Math.PI); // Nm / A
    const Kv_rads = 1.0 / Math.max(0.01, Kt);
    const Kv = Math.max(1.0, Kv_rads * (60 / (2 * Math.PI)) * 0.94); // RPM/V

    // Speeds & Torques
    const noLoadRpm = Kv * state.batteryVoltage;
    const tireDiaM = state.tireDiameterInches * 0.0254;
    const tireCircumferenceM = Math.PI * tireDiaM;
    const wheelSpeedMps = (noLoadRpm / 60) * tireCircumferenceM;
    const wheelSpeedMph = wheelSpeedMps * 2.23694;
    const wheelSpeedKph = wheelSpeedMps * 3.6;

    const continuousTorqueNm = Kt * state.currentA;
    const copperLossWatts = (state.currentA ** 2) * (terminalResistanceRtt * 0.5);

    state.calculated = {
      winding,
      slotFillFactor,
      totalCopperMassGrams,
      phaseResistanceRph,
      terminalResistanceRtt,
      airgapFluxDensityBg,
      fluxPerPoleWb,
      Kv,
      Kt,
      noLoadRpm,
      wheelSpeedMph,
      wheelSpeedKph,
      continuousTorqueNm,
      copperLossWatts
    };

    updateUI();
    update3DScene();
    update2DSchematic();
  }

  // --- UI Update Function ---
  function updateUI() {
    const calc = state.calculated;
    if (!calc) return;

    const elStrandsVal = document.getElementById('strandsVal');
    if (elStrandsVal) elStrandsVal.textContent = state.strands;

    const elTurnsVal = document.getElementById('turnsVal');
    if (elTurnsVal) elTurnsVal.textContent = state.turns;

    const elFillVal = document.getElementById('fillFactorVal');
    if (elFillVal) elFillVal.textContent = calc.slotFillFactor.toFixed(1) + '%';

    const elFillBar = document.getElementById('fillFactorBar');
    const elFillBadge = document.getElementById('fillFactorStatus');
    if (elFillBar && elFillBadge) {
      const fill = calc.slotFillFactor;
      elFillBar.style.width = Math.min(100, fill) + '%';

      elFillBar.className = 'fill-progress-bar';
      elFillBadge.className = 'fill-badge';

      if (fill < 30) {
        elFillBar.classList.add('fill-loose');
        elFillBadge.classList.add('fill-loose');
        elFillBadge.textContent = 'Loose Fill (Easy Winding)';
      } else if (fill <= 50) {
        elFillBar.classList.add('fill-optimal');
        elFillBadge.classList.add('fill-optimal');
        elFillBadge.textContent = 'Optimal / Production Standard';
      } else if (fill <= 62) {
        elFillBar.classList.add('fill-tight');
        elFillBadge.classList.add('fill-tight');
        elFillBadge.textContent = 'Tight Fill (Experienced Hand)';
      } else {
        elFillBar.classList.add('fill-critical');
        elFillBadge.classList.add('fill-critical');
        elFillBadge.textContent = 'Overfill Warning (>62%)';
      }
    }

    const elCopperWeight = document.getElementById('copperWeightDisplay');
    if (elCopperWeight) elCopperWeight.textContent = Math.round(calc.totalCopperMassGrams) + ' g';

    const elRph = document.getElementById('rphDisplay');
    if (elRph) elRph.textContent = (calc.phaseResistanceRph * 1000).toFixed(1) + ' mΩ';

    const elRtt = document.getElementById('rttDisplay');
    if (elRtt) elRtt.textContent = (calc.terminalResistanceRtt * 1000).toFixed(1) + ' mΩ';

    const elKv = document.getElementById('kvDisplay');
    if (elKv) elKv.textContent = calc.Kv.toFixed(1) + ' RPM/V';

    const elKt = document.getElementById('ktDisplay');
    if (elKt) elKt.textContent = calc.Kt.toFixed(3) + ' Nm/A';

    const elSpeed = document.getElementById('noLoadSpeedDisplay');
    if (elSpeed) {
      elSpeed.textContent = `${Math.round(calc.noLoadRpm)} RPM (${calc.wheelSpeedMph.toFixed(1)} mph / ${calc.wheelSpeedKph.toFixed(1)} km/h)`;
    }

    const elTorque = document.getElementById('torqueDisplay');
    if (elTorque) elTorque.textContent = `${calc.continuousTorqueNm.toFixed(1)} Nm (@ ${state.currentA}A)`;

    const elCopperLoss = document.getElementById('copperLossDisplay');
    if (elCopperLoss) elCopperLoss.textContent = `${calc.copperLossWatts.toFixed(1)} W`;

    const elSchema = document.getElementById('windingSchemaDisplay');
    if (elSchema && calc.winding) elSchema.textContent = calc.winding.schemaString;

    const elConnMode = document.getElementById('terminationModeLabel');
    if (elConnMode) {
      elConnMode.textContent = state.connection === 'wye' ? 'Star (Wye / Y) Topology' : 'Delta (Δ) Closed Mesh';
    }
  }

  // --- 3D Three.js Visualizer Engine ---
  function initThreeScene() {
    const container = document.getElementById('viewport');
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 500;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1d);

    camera = new THREE.PerspectiveCamera(40, width / height, 1, 1000);
    camera.position.set(0, 110, 190);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    while (container.firstChild) {
      if (container.firstChild.id === 'viewportLoading') {
        container.firstChild.style.display = 'flex';
        break;
      }
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 450;
    controls.minDistance = 30;
    controls.target.set(0, 0, 0);

    // Studio Ambient & Hemisphere Lighting (ensures rich illumination top and bottom)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x475569, 0.95);
    hemiLight.position.set(0, 150, 0);
    scene.add(hemiLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    // Top Key & Back Lights
    const topKeyLight = new THREE.DirectionalLight(0xffffff, 1.25);
    topKeyLight.position.set(90, 170, 110);
    topKeyLight.castShadow = true;
    topKeyLight.shadow.mapSize.width = 2048;
    topKeyLight.shadow.mapSize.height = 2048;
    scene.add(topKeyLight);

    const topBackLight = new THREE.DirectionalLight(0x38bdf8, 0.7);
    topBackLight.position.set(-110, 130, -100);
    scene.add(topBackLight);

    // Bottom Key & Fill Lights (brightens bottom view completely!)
    const botKeyLight = new THREE.DirectionalLight(0xffffff, 1.3);
    botKeyLight.position.set(-80, -170, 110);
    scene.add(botKeyLight);

    const botFillLight = new THREE.DirectionalLight(0xe0f2fe, 0.85);
    botFillLight.position.set(100, -150, -100);
    scene.add(botFillLight);

    const botRearLight = new THREE.DirectionalLight(0x38bdf8, 0.65);
    botRearLight.position.set(0, -180, 0);
    scene.add(botRearLight);

    // Center Stator Bore Up/Down Point Lights (illuminates inner laminations and bore from inside)
    const innerTopLight = new THREE.PointLight(0xffffff, 0.9, 200);
    innerTopLight.position.set(0, 35, 0);
    scene.add(innerTopLight);

    const innerBotLight = new THREE.PointLight(0xffffff, 0.9, 200);
    innerBotLight.position.set(0, -35, 0);
    scene.add(innerBotLight);

    rootSceneGroup = new THREE.Group();
    statorGroup = new THREE.Group();
    windingsGroup = new THREE.Group();
    jumpersGroup = new THREE.Group();
    terminationsGroup = new THREE.Group();
    labelsGroup = new THREE.Group();
    rotorGroup = new THREE.Group();

    rootSceneGroup.add(statorGroup);
    rootSceneGroup.add(windingsGroup);
    rootSceneGroup.add(jumpersGroup);
    rootSceneGroup.add(terminationsGroup);
    rootSceneGroup.add(labelsGroup);
    rootSceneGroup.add(rotorGroup);
    scene.add(rootSceneGroup);

    loadStatorCADModel();

    window.addEventListener('resize', onWindowResize);

    if (animFrameId) cancelAnimationFrame(animFrameId);
    animate();
  }

  function loadStatorCADModel() {
    const loadingEl = document.getElementById('viewportLoading');
    let isHandled = false;

    const fallbackTimeout = setTimeout(() => {
      if (!isHandled && !glbLoaded) {
        console.warn('GLB load timed out, using high-detail procedural stator.');
        isHandled = true;
        buildProceduralStator();
        if (loadingEl) loadingEl.style.display = 'none';
      }
    }, 3000);

    if (typeof THREE.GLTFLoader === 'undefined') {
      isHandled = true;
      clearTimeout(fallbackTimeout);
      buildProceduralStator();
      if (loadingEl) loadingEl.style.display = 'none';
      return;
    }

    const loader = new THREE.GLTFLoader();
    const glbPaths = [
      'models/stator_laminations.glb',
      'EXPERIENCE 7 input info/Superflux_and_Cannoncore_motor_stator_laminations_.glb'
    ];

    function tryLoad(index) {
      if (isHandled) return;
      if (index >= glbPaths.length) {
        isHandled = true;
        clearTimeout(fallbackTimeout);
        buildProceduralStator();
        if (loadingEl) loadingEl.style.display = 'none';
        return;
      }

      loader.load(
        glbPaths[index],
        function (gltf) {
          if (isHandled) return;
          isHandled = true;
          clearTimeout(fallbackTimeout);

          while (statorGroup.children.length > 0) {
            const obj = statorGroup.children[0];
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
            statorGroup.remove(obj);
          }

          const statorMesh = gltf.scene;
          statorMesh.scale.set(1000, 1000, 1000);
          statorMesh.rotation.x = Math.PI / 2;
          statorMesh.updateMatrixWorld(true);

          applyStatorMaterials(statorMesh);

          const box = new THREE.Box3().setFromObject(statorMesh);
          const center = box.getCenter(new THREE.Vector3());
          statorMesh.position.sub(center);

          statorGroup.add(statorMesh);
          glbLoaded = true;
          if (loadingEl) loadingEl.style.display = 'none';

          update3DScene();
        },
        undefined,
        function () {
          tryLoad(index + 1);
        }
      );
    }

    tryLoad(0);
  }

  function applyStatorMaterials(meshGroup) {
    const isTranslucent = state.statorOpacity < 0.99;
    const isVisible = state.statorOpacity > 0.01;

    meshGroup.visible = isVisible;
    if (!isVisible) return;

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.85,
      roughness: 0.32,
      transparent: isTranslucent,
      opacity: state.statorOpacity,
      depthWrite: !isTranslucent
    });

    meshGroup.traverse(child => {
      if (child.isMesh) {
        child.material = steelMat;
        child.castShadow = !isTranslucent;
        child.receiveShadow = !isTranslucent;
      }
    });
  }

  // Helper: Tooth angular position in radians
  // Tooth 1 (index 0) in the 27-slot stator GLB is aligned at exactly 10.0 degrees (0.174533 rad)
  function getToothAngle(slotIndex) {
    return (10.0 * Math.PI / 180) + (slotIndex * 2 * Math.PI) / STATOR_SPECS.slots;
  }

  function buildProceduralStator() {
    while (statorGroup.children.length > 0) {
      const obj = statorGroup.children[0];
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
      statorGroup.remove(obj);
    }

    const group = new THREE.Group();
    const isTranslucent = state.statorOpacity < 0.99;
    const isVisible = state.statorOpacity > 0.01;
    group.visible = isVisible;

    const statorMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.85,
      roughness: 0.32,
      transparent: isTranslucent,
      opacity: state.statorOpacity,
      depthWrite: !isTranslucent
    });

    const stackLen = STATOR_SPECS.stackLengthMm;
    const rOut = STATOR_SPECS.outerDiameterMm / 2;
    const rIn = STATOR_SPECS.innerDiameterMm / 2;
    const slots = STATOR_SPECS.slots;

    const innerYoke = new THREE.Mesh(
      new THREE.CylinderGeometry(rIn + 6, rIn + 6, stackLen, 48, 1, false),
      statorMat
    );
    group.add(innerYoke);

    const toothLen = (rOut - 3.7) - (rIn + 6);
    const midR = (rIn + 6 + (rOut - 3.7)) / 2;

    for (let i = 0; i < slots; i++) {
      const angle = getToothAngle(i);
      const tooth = new THREE.Mesh(
        new THREE.BoxGeometry(STATOR_SPECS.toothStemWidthMm, stackLen, toothLen),
        statorMat
      );
      tooth.position.set(midR * Math.cos(angle), 0, midR * Math.sin(angle));
      tooth.rotation.y = -angle + Math.PI / 2;
      group.add(tooth);

      const shoe = new THREE.Mesh(
        new THREE.BoxGeometry(STATOR_SPECS.toothStemWidthMm * 2.3, stackLen, 2.5),
        statorMat
      );
      shoe.position.set((rOut - 1.25) * Math.cos(angle), 0, (rOut - 1.25) * Math.sin(angle));
      shoe.rotation.y = -angle + Math.PI / 2;
      group.add(shoe);
    }

    statorGroup.add(group);
  }

  // Helper: Physical dimensions of conductor bundle based on turns, strands & wire gauge
  function getBundleDimensions() {
    const wireEntry = WIRE_GAUGE_DB.find(w => w.awg === state.wireAwg) || WIRE_GAUGE_DB[10];
    const wireDia = wireEntry.totalDiaMm || (wireEntry.diaMm * 1.07);
    const singleWireArea = Math.PI * (wireDia / 2) ** 2;
    const totalConductorArea = state.turns * state.strands * singleWireArea; // mm² per coil side

    // Packed cross-section area in slot with random winding factor & air voids
    const packedArea = totalConductorArea * 1.35;

    // Tangential bundle thickness (mm) per side of tooth: 0.45mm (min) to 3.8mm (max)
    const rawThickness = packedArea / 7.5;
    const tBundle = Math.min(3.8, Math.max(0.45, rawThickness));

    // End-turn axial crown extension (mm) above stack: 0.7mm (min) to 7.5mm (max)
    const rawCrown = 0.5 + (packedArea / 4.2);
    const hCrown = Math.min(7.5, Math.max(0.7, rawCrown));

    const stackLen = STATOR_SPECS.stackLengthMm;
    const wStem = STATOR_SPECS.toothStemWidthMm;
    const midR = 45.0;
    const toothRadialDepth = 16.2;
    const topCrownY = (stackLen / 2) + hCrown;
    const botCrownY = -(stackLen / 2) - hCrown;

    return {
      tBundle,
      hCrown,
      wireDia,
      totalConductorArea,
      stackLen,
      wStem,
      midR,
      toothRadialDepth,
      topCrownY,
      botCrownY
    };
  }

  // --- Realistic 3D Winding Bundles & Concentrated Coils Wound Around Teeth ---
  function update3DWindings() {
    while (windingsGroup.children.length > 0) {
      const obj = windingsGroup.children[0];
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
      windingsGroup.remove(obj);
    }

    const calc = state.calculated;
    if (!calc || !calc.winding) return;

    const teeth = calc.winding.teeth;
    const dims = getBundleDimensions();

    const halfW = (dims.wStem / 2) + dims.tBundle;
    const halfH = (dims.stackLen / 2) + dims.hCrown;
    const inHalfW = dims.wStem / 2;
    const inHalfH = dims.stackLen / 2;
    const cornerR = Math.min(halfW - 0.2, Math.max(0.4, dims.hCrown * 0.4));

    // Create 2D profile of coil wrapped around tooth in local X-Y plane
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

    // Inner rectangular aperture through which tooth stem passes
    const hole = new THREE.Path();
    hole.moveTo(-inHalfW, -inHalfH);
    hole.lineTo(inHalfW, -inHalfH);
    hole.lineTo(inHalfW, inHalfH);
    hole.lineTo(-inHalfW, inHalfH);
    hole.lineTo(-inHalfW, -inHalfH);
    shape.holes.push(hole);

    const bevel = Math.min(0.45, Math.max(0.1, dims.tBundle * 0.25));
    const extrudeSettings = {
      depth: dims.toothRadialDepth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: bevel,
      bevelThickness: bevel
    };

    const baseCoilGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    baseCoilGeo.center();

    teeth.forEach(t => {
      const isSolo = state.soloPhase === 'all' || state.soloPhase === t.phase;
      const phaseData = PHASE_COLORS[t.phase];
      const isCopper = (state.wireAppearance === 'copper' || state.wireAppearance === 'copper-labeled');

      let baseColorHex = isCopper ? COPPER_COLOR : phaseData.threeHex;
      let emissiveHex = t.direction === 1 ? (isCopper ? 0x221100 : baseColorHex) : 0x000000;

      const coilMat = new THREE.MeshStandardMaterial({
        color: baseColorHex,
        metalness: isCopper ? 0.94 : 0.85,
        roughness: isCopper ? 0.20 : 0.28,
        emissive: emissiveHex,
        emissiveIntensity: isSolo ? (isCopper ? 0.15 : 0.25) : 0.0,
        transparent: !isSolo,
        opacity: isSolo ? 1.0 : 0.12,
        depthWrite: isSolo
      });

      const toothAngle = getToothAngle(t.slotNumber - 1);
      const coilMesh = new THREE.Mesh(baseCoilGeo, coilMat);

      coilMesh.position.set(dims.midR * Math.cos(toothAngle), 0, dims.midR * Math.sin(toothAngle));
      coilMesh.rotation.y = -toothAngle + Math.PI / 2;

      windingsGroup.add(coilMesh);
    });
  }

  // --- Helper: Arc Jumper Curve (Follows stator perimeter without chord cutting) ---
  function createArcJumperCurve(a1, a2, rCoil, rTrack, startY, trackY, isTop) {
    let diff = a2 - a1;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    const points = [];
    const steps = Math.max(6, Math.min(18, Math.round(Math.abs(diff) * 8)));

    points.push(new THREE.Vector3(rCoil * Math.cos(a1), startY, rCoil * Math.sin(a1)));

    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const ang = a1 + diff * t;
      const arch = Math.sin(t * Math.PI) * (isTop ? 2.2 : -2.2);
      points.push(new THREE.Vector3(
        rTrack * Math.cos(ang),
        trackY + arch,
        rTrack * Math.sin(ang)
      ));
    }

    points.push(new THREE.Vector3(rCoil * Math.cos(a2), startY, rCoil * Math.sin(a2)));
    return new THREE.CatmullRomCurve3(points);
  }

  // --- 3D Inter-Slot Jumpers & Connecting Harness ---
  function update3DJumpers() {
    while (jumpersGroup.children.length > 0) {
      const obj = jumpersGroup.children[0];
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
      jumpersGroup.remove(obj);
    }

    if (!state.showJumpers) return;

    const calc = state.calculated;
    if (!calc || !calc.winding) return;

    const teeth = calc.winding.teeth;
    const dims = getBundleDimensions();
    const rIn = STATOR_SPECS.innerDiameterMm / 2;
    const rOut = STATOR_SPECS.outerDiameterMm / 2;
    const midR = dims.midR;
    const topCrownY = dims.topCrownY;
    const botCrownY = dims.botCrownY;
    const jumperRadius = Math.min(1.4, Math.max(0.65, 0.4 + Math.sqrt(state.strands) * 0.15));

    const isCopper = (state.wireAppearance === 'copper' || state.wireAppearance === 'copper-labeled');

    const phases = ['A', 'B', 'C'];
    phases.forEach((phaseKey, phaseIdx) => {
      const isSolo = state.soloPhase === 'all' || state.soloPhase === phaseKey;
      const phaseData = PHASE_COLORS[phaseKey];
      const phaseTeeth = teeth.filter(t => t.phase === phaseKey);

      const jumperColor = isCopper ? COPPER_COLOR : phaseData.threeHex;
      const jumperMat = new THREE.MeshStandardMaterial({
        color: jumperColor,
        metalness: isCopper ? 0.92 : 0.88,
        roughness: isCopper ? 0.22 : 0.28,
        transparent: !isSolo,
        opacity: isSolo ? 0.95 : 0.12,
        depthWrite: isSolo
      });

      // Distinct radial track & elevation per phase (eliminates all bottom/top overlaps!)
      // Top: concentric inner tracks
      const rTrackTop = rIn + 11.5 + (phaseIdx * 2.5);
      const yTrackTop = topCrownY + 2.5 + (phaseIdx * 1.5);

      // Bottom: concentric outer tracks with radial and height stagger
      const rTrackBot = rOut - 5.5 - (phaseIdx * 2.8);
      const yTrackBot = botCrownY - 2.8 - (phaseIdx * 1.8);

      for (let i = 0; i < phaseTeeth.length - 1; i++) {
        const t1 = phaseTeeth[i];
        const t2 = phaseTeeth[i + 1];

        const a1 = getToothAngle(t1.slotNumber - 1);
        const a2 = getToothAngle(t2.slotNumber - 1);
        const useTop = i % 2 === 0;

        const startY = useTop ? topCrownY : botCrownY;
        const rTrack = useTop ? rTrackTop : rTrackBot;
        const trackY = useTop ? yTrackTop : yTrackBot;

        const curve = createArcJumperCurve(a1, a2, midR, rTrack, startY, trackY, useTop);
        const tubeGeo = new THREE.TubeGeometry(curve, 28, jumperRadius, 10, false);
        const tubeMesh = new THREE.Mesh(tubeGeo, jumperMat);
        jumpersGroup.add(tubeMesh);
      }
    });
  }

  // --- 3D Star (Wye) vs. Delta Termination Wiring & Straight Exit Leads ---
  function update3DTerminations() {
    while (terminationsGroup.children.length > 0) {
      const obj = terminationsGroup.children[0];
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
      terminationsGroup.remove(obj);
    }

    if (!state.showTerminations) return;

    const calc = state.calculated;
    if (!calc || !calc.winding) return;

    const teeth = calc.winding.teeth;
    const dims = getBundleDimensions();
    const rIn = STATOR_SPECS.innerDiameterMm / 2;
    const midR = dims.midR;
    const topCrownY = dims.topCrownY;
    const topY = (dims.stackLen / 2) + Math.max(5.0, dims.hCrown + 2.5);

    const isWye = state.connection === 'wye';
    const isCopper = (state.wireAppearance === 'copper' || state.wireAppearance === 'copper-labeled');

    const phaseStarts = {
      A: teeth.find(t => t.phase === 'A'),
      B: teeth.find(t => t.phase === 'B'),
      C: teeth.find(t => t.phase === 'C')
    };

    // 1. Phase Lead Exit Wires: Go straight up vertically from each phase's starting tooth
    const rLead = midR - 2.0;

    ['A', 'B', 'C'].forEach(phaseKey => {
      const isSolo = state.soloPhase === 'all' || state.soloPhase === phaseKey;
      const phaseData = PHASE_COLORS[phaseKey];
      const startTooth = phaseStarts[phaseKey];
      if (!startTooth) return;

      const angle = getToothAngle(startTooth.slotNumber - 1);
      const x = rLead * Math.cos(angle);
      const z = rLead * Math.sin(angle);

      // Clean straight-up vertical tube
      const p0 = new THREE.Vector3(x, topY, z);
      const p1 = new THREE.Vector3(x, topY + 10.0, z);
      const p2 = new THREE.Vector3(x, topY + 24.0, z);
      const p3 = new THREE.Vector3(x, topY + 38.0, z);

      const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);
      const leadGeo = new THREE.TubeGeometry(curve, 16, 2.2, 12, false);
      const leadMat = new THREE.MeshStandardMaterial({
        color: phaseData.threeHex,
        roughness: 0.35,
        metalness: 0.2,
        transparent: !isSolo,
        opacity: isSolo ? 1.0 : 0.15
      });
      terminationsGroup.add(new THREE.Mesh(leadGeo, leadMat));

      // Terminal Copper Lug at top of lead wire
      const tipGeo = new THREE.CylinderGeometry(2.3, 2.3, 4.0, 12);
      const tipMat = new THREE.MeshStandardMaterial({
        color: COPPER_COLOR,
        metalness: 0.95,
        roughness: 0.2,
        transparent: !isSolo,
        opacity: isSolo ? 1.0 : 0.15
      });
      const tipMesh = new THREE.Mesh(tipGeo, tipMat);
      tipMesh.position.set(x, topY + 39.5, z);
      terminationsGroup.add(tipMesh);

      // Base strain relief boot where lead emerges from coil
      const bootGeo = new THREE.CylinderGeometry(2.8, 3.2, 3.5, 12);
      const bootMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.8,
        metalness: 0.1,
        transparent: !isSolo,
        opacity: isSolo ? 1.0 : 0.15
      });
      const bootMesh = new THREE.Mesh(bootGeo, bootMat);
      bootMesh.position.set(x, topY + 1.8, z);
      terminationsGroup.add(bootMesh);
    });

    // 2. Star Neutral Center Busbar or Delta Loop Harness
    if (isWye) {
      // Positioned snug along the inner shoulder of the coils (rIn + 9.5), NOT floating in center bore!
      const rNeutral = rIn + 9.5;
      const neutralHubGeo = new THREE.TorusGeometry(rNeutral, 1.3, 16, 48);
      const neutralMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.95,
        roughness: 0.18
      });
      const neutralHub = new THREE.Mesh(neutralHubGeo, neutralMat);
      neutralHub.rotation.x = Math.PI / 2;
      neutralHub.position.y = topCrownY + 3.0;
      terminationsGroup.add(neutralHub);

      // Phase return leads connecting into the star busbar
      ['A', 'B', 'C'].forEach(phaseKey => {
        const isSolo = state.soloPhase === 'all' || state.soloPhase === phaseKey;
        const phaseTeeth = teeth.filter(t => t.phase === phaseKey);
        const lastTooth = phaseTeeth[phaseTeeth.length - 1];
        if (!lastTooth) return;

        const angle = getToothAngle(lastTooth.slotNumber - 1);
        const pEnd = new THREE.Vector3(midR * Math.cos(angle), topCrownY + 0.5, midR * Math.sin(angle));
        const pMid = new THREE.Vector3(((midR + rNeutral) / 2) * Math.cos(angle), topCrownY + 3.8, ((midR + rNeutral) / 2) * Math.sin(angle));
        const pHub = new THREE.Vector3(rNeutral * Math.cos(angle), topCrownY + 3.0, rNeutral * Math.sin(angle));

        const curve = new THREE.CatmullRomCurve3([pEnd, pMid, pHub]);
        const connGeo = new THREE.TubeGeometry(curve, 12, 1.3, 8, false);
        const connMat = new THREE.MeshStandardMaterial({
          color: isCopper ? COPPER_COLOR : PHASE_COLORS[phaseKey].threeHex,
          metalness: 0.9,
          roughness: 0.25,
          transparent: !isSolo,
          opacity: isSolo ? 0.95 : 0.15
        });
        terminationsGroup.add(new THREE.Mesh(connGeo, connMat));
      });
    } else {
      const pairs = [
        { from: 'A', to: 'B', color: 0xf59e0b },
        { from: 'B', to: 'C', color: 0x10b981 },
        { from: 'C', to: 'A', color: 0xef4444 }
      ];

      pairs.forEach((pair, pairIdx) => {
        const teethFrom = teeth.filter(t => t.phase === pair.from);
        const endTooth = teethFrom[teethFrom.length - 1];
        const startTooth = phaseStarts[pair.to];
        if (!endTooth || !startTooth) return;

        const a1 = getToothAngle(endTooth.slotNumber - 1);
        const a2 = getToothAngle(startTooth.slotNumber - 1);

        const rBridge = rIn + 11.0 + (pairIdx * 2.2);
        const bridgeY = topCrownY + 2.5 + (pairIdx * 1.5);
        const curve = createArcJumperCurve(a1, a2, midR, rBridge, topCrownY + 1.0, bridgeY, true);

        const deltaGeo = new THREE.TubeGeometry(curve, 24, 1.4, 8, false);
        const deltaMat = new THREE.MeshStandardMaterial({
          color: pair.color,
          metalness: 0.88,
          roughness: 0.28
        });
        terminationsGroup.add(new THREE.Mesh(deltaGeo, deltaMat));
      });
    }
  }

  // --- Canvas 2D Helper for High-Res 3D Billboard Sprite Badges ---
  function drawCanvasRoundRect(ctx, x, y, w, h, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function createCoilBadgeSprite(phaseKey, isSolo) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const phaseData = PHASE_COLORS[phaseKey];
    const col = phaseData.hex;

    // Glowing badge circle
    const grad = ctx.createRadialGradient(64, 64, 15, 64, 64, 56);
    grad.addColorStop(0, col);
    grad.addColorStop(0.85, col);
    grad.addColorStop(1, 'rgba(0,0,0,0.85)');

    ctx.beginPath();
    ctx.arc(64, 64, 54, 0, 2 * Math.PI);
    ctx.fillStyle = grad;
    ctx.shadowColor = col;
    ctx.shadowBlur = 14;
    ctx.fill();

    // Crisp white border
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Inner contrast disc
    ctx.beginPath();
    ctx.arc(64, 64, 43, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(10, 15, 29, 0.55)';
    ctx.shadowBlur = 0;
    ctx.fill();

    // Bold Phase Letter (A, B, or C)
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 60px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(phaseKey, 64, 66);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: isSolo ? 0.95 : 0.15,
      depthTest: true,
      depthWrite: false
    });

    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(6.8, 6.8, 1);
    return sprite;
  }

  function createLeadBadgeSprite(phaseKey, labelText, isSolo) {
    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');

    const phaseData = PHASE_COLORS[phaseKey];
    const col = phaseData.hex;

    // Background pill badge
    ctx.shadowColor = col;
    ctx.shadowBlur = 12;
    drawCanvasRoundRect(ctx, 8, 8, 264, 80, 20);
    ctx.fillStyle = 'rgba(10, 15, 29, 0.94)';
    ctx.fill();

    ctx.lineWidth = 3.5;
    ctx.strokeStyle = col;
    ctx.stroke();

    // Phase indicator circle dot
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(44, 48, 14, 0, 2 * Math.PI);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Text (e.g. "Phase A (U)")
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, 72, 50);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: isSolo ? 1.0 : 0.2,
      depthTest: false,
      depthWrite: false
    });

    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(16.0, 5.5, 1);
    return sprite;
  }

  function createNeutralBadgeSprite(labelText) {
    const canvas = document.createElement('canvas');
    canvas.width = 330;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');

    // Background pill badge
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 14;
    drawCanvasRoundRect(ctx, 8, 8, 314, 80, 20);
    ctx.fillStyle = 'rgba(10, 15, 29, 0.94)';
    ctx.fill();

    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();

    // Neutral star icon dot
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(44, 48, 14, 0, 2 * Math.PI);
    ctx.fillStyle = '#e2e8f0';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    // Text
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, 70, 50);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false
    });

    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(18.0, 5.2, 1);
    return sprite;
  }

  // --- 3D Dynamic Floating Badges (A, B, C & Phase Exit Lead Tags & Neutral Star Point) ---
  function update3DLabels() {
    if (!labelsGroup) return;

    while (labelsGroup.children.length > 0) {
      const obj = labelsGroup.children[0];
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
      labelsGroup.remove(obj);
    }

    const calc = state.calculated;
    if (!calc || !calc.winding) return;

    const teeth = calc.winding.teeth;
    const dims = getBundleDimensions();
    const rIn = STATOR_SPECS.innerDiameterMm / 2;
    const midR = dims.midR;
    const topCrownY = dims.topCrownY;
    const coilLabelY = topCrownY + 4.5;
    const topY = (dims.stackLen / 2) + Math.max(5.0, dims.hCrown + 2.5);
    const rLead = midR - 2.0;

    // 1. Coil Top A/B/C Badges (rendered in 'copper-labeled' mode)
    if (state.wireAppearance === 'copper-labeled') {
      teeth.forEach(t => {
        const isSolo = state.soloPhase === 'all' || state.soloPhase === t.phase;
        const toothAngle = getToothAngle(t.slotNumber - 1);

        const sprite = createCoilBadgeSprite(t.phase, isSolo);
        sprite.position.set(
          midR * Math.cos(toothAngle),
          coilLabelY,
          midR * Math.sin(toothAngle)
        );
        labelsGroup.add(sprite);
      });
    }

    // 2. Exit Phase Wire Labels (Phase A, Phase B, Phase C)
    if (state.showTerminations) {
      const phaseStarts = {
        A: teeth.find(t => t.phase === 'A'),
        B: teeth.find(t => t.phase === 'B'),
        C: teeth.find(t => t.phase === 'C')
      };

      const phaseLabels = {
        A: 'Phase A (U)',
        B: 'Phase B (V)',
        C: 'Phase C (W)'
      };

      ['A', 'B', 'C'].forEach(phaseKey => {
        const isSolo = state.soloPhase === 'all' || state.soloPhase === phaseKey;
        const startTooth = phaseStarts[phaseKey];
        if (!startTooth) return;

        const angle = getToothAngle(startTooth.slotNumber - 1);
        const sprite = createLeadBadgeSprite(phaseKey, phaseLabels[phaseKey], isSolo);
        sprite.position.set(
          rLead * Math.cos(angle),
          topY + 45.0,
          rLead * Math.sin(angle)
        );
        labelsGroup.add(sprite);
      });

      // 3. Neutral Star Hub (Wye) Badge: clearly labels the star point busbar
      if (state.connection === 'wye') {
        const rNeutral = rIn + 9.5;
        const neutralSprite = createNeutralBadgeSprite('⭐ Star Point (Neutral Hub)');
        neutralSprite.position.set(
          0,
          topCrownY + 16.0,
          rNeutral
        );
        labelsGroup.add(neutralSprite);
      }
    }
  }

  // --- Rotor Magnets & Exploded View ---
  function update3DRotor() {
    while (rotorGroup.children.length > 0) {
      const obj = rotorGroup.children[0];
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
      rotorGroup.remove(obj);
    }

    const poles = state.poles;
    const stackLen = STATOR_SPECS.stackLengthMm;
    const rStator = STATOR_SPECS.outerDiameterMm / 2;
    
    const radialOffset = state.explodedProgress * 38.0;
    const rMagIn = rStator + state.airgapMm + radialOffset;
    const rMagOut = rMagIn + state.magnetThickMm;
    const rBackIronOut = rMagOut + 4.0;

    const backIronGeo = new THREE.CylinderGeometry(rBackIronOut, rMagOut, stackLen + 4, poles * 2, 1, true);
    const backIronMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.9,
      roughness: 0.3,
      side: THREE.DoubleSide
    });
    rotorGroup.add(new THREE.Mesh(backIronGeo, backIronMat));

    const poleAngle = (2 * Math.PI) / poles;
    const northMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.8, roughness: 0.25 });
    const southMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.8, roughness: 0.25 });

    for (let p = 0; p < poles; p++) {
      const angle = p * poleAngle;
      const isNorth = p % 2 === 0;

      const magGeo = new THREE.BoxGeometry(
        (2 * Math.PI * rMagIn / poles) * 0.9,
        stackLen,
        state.magnetThickMm
      );
      const magMesh = new THREE.Mesh(magGeo, isNorth ? northMat : southMat);

      const midR = (rMagIn + rMagOut) / 2;
      magMesh.position.set(midR * Math.cos(angle), 0, midR * Math.sin(angle));
      magMesh.rotation.y = -angle + Math.PI / 2;

      rotorGroup.add(magMesh);
    }
  }

  function update3DScene() {
    if (statorGroup.children.length > 0) {
      applyStatorMaterials(statorGroup.children[0]);
    } else {
      buildProceduralStator();
    }
    update3DWindings();
    update3DJumpers();
    update3DTerminations();
    update3DLabels();
    update3DRotor();
  }

  // --- 2D Topological Circuit Schematic Generator ---
  function update2DSchematic() {
    const container = document.getElementById('schematicSvgContainer');
    if (!container) return;

    const calc = state.calculated;
    if (!calc || !calc.winding) return;

    const teeth = calc.winding.teeth;
    const isWye = state.connection === 'wye';

    const width = 1100;
    const height = 480;
    const marginX = 60;
    const slotStep = (width - 2 * marginX) / 27;

    let svg = `<svg viewBox="0 0 ${width} ${height}" class="stator-svg" style="width: 100%; height: auto;">
      <defs>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width="${width}" height="${height}" fill="#080d1a" rx="10" />

      <text x="${marginX}" y="32" fill="#38bdf8" font-size="14" font-weight="bold">
        TOPOLOGICAL CIRCUIT SCHEMATIC (${isWye ? 'STAR / WYE TERMINATION' : 'DELTA (Δ) TERMINATION'})
      </text>
      <text x="${width - marginX}" y="32" text-anchor="end" fill="#94a3b8" font-size="12">
        Phase A: Yellow (U) · Phase B: Blue (V) · Phase C: Green (W)
      </text>
    `;

    const phaseY = { A: 75, B: 105, C: 135 };
    ['A', 'B', 'C'].forEach(pKey => {
      const col = PHASE_COLORS[pKey].hex;
      svg += `
        <line x1="${marginX - 30}" y1="${phaseY[pKey]}" x2="${width - marginX + 30}" y2="${phaseY[pKey]}" stroke="${col}" stroke-width="2.5" opacity="0.4" stroke-dasharray="4 4" />
        <circle cx="${marginX - 30}" cy="${phaseY[pKey]}" r="7" fill="${col}" />
        <text x="${marginX - 45}" y="${phaseY[pKey] + 4}" fill="${col}" font-size="12" font-weight="bold" text-anchor="end">Phase ${pKey}</text>
      `;
    });

    const coilCenterY = 270;
    teeth.forEach((t, i) => {
      const cx = marginX + (i + 0.5) * slotStep;
      const col = PHASE_COLORS[t.phase].hex;
      const isCw = t.direction === 1;

      svg += `
        <rect x="${cx - 10}" y="${coilCenterY - 45}" width="20" height="90" rx="3" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
        <text x="${cx}" y="${coilCenterY + 62}" fill="#94a3b8" font-size="10" font-weight="bold" text-anchor="middle">T${t.slotNumber}</text>
        <text x="${cx}" y="${coilCenterY - 52}" fill="${col}" font-size="11" font-weight="bold" text-anchor="middle">${t.code}</text>

        <rect x="${cx - 14}" y="${coilCenterY - 35}" width="28" height="70" rx="6" fill="none" stroke="${col}" stroke-width="3" filter="url(#glow)" />
        <circle cx="${cx}" cy="${coilCenterY}" r="4" fill="${col}" />
        <text x="${cx}" y="${coilCenterY + 3.5}" fill="#ffffff" font-size="8" font-weight="bold" text-anchor="middle">${isCw ? '↻' : '↺'}</text>
      `;

      svg += `
        <line x1="${cx}" y1="${phaseY[t.phase]}" x2="${cx}" y2="${coilCenterY - 35}" stroke="${col}" stroke-width="1.8" opacity="0.75" />
        <circle cx="${cx}" cy="${phaseY[t.phase]}" r="3.5" fill="${col}" />
      `;
    });

    if (isWye) {
      const neutralY = 410;
      svg += `
        <line x1="${marginX}" y1="${neutralY}" x2="${width - marginX}" y2="${neutralY}" stroke="#e2e8f0" stroke-width="3" />
        <circle cx="${width / 2}" cy="${neutralY}" r="8" fill="#e2e8f0" />
        <text x="${width / 2}" y="${neutralY + 22}" fill="#e2e8f0" font-size="11" font-weight="bold" text-anchor="middle">Neutral Star Center (N)</text>
      `;

      teeth.forEach((t, i) => {
        const cx = marginX + (i + 0.5) * slotStep;
        svg += `
          <line x1="${cx}" y1="${coilCenterY + 35}" x2="${cx}" y2="${neutralY}" stroke="#64748b" stroke-width="1.2" stroke-dasharray="2 2" />
        `;
      });
    }

    svg += `</svg>`;
    container.innerHTML = svg;
  }

  // --- Window Resize & Render Loop ---
  function onWindowResize() {
    const container = document.getElementById('viewport');
    if (!container || !renderer || !camera) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function animate() {
    animFrameId = requestAnimationFrame(animate);

    if (state.autoSpin && rootSceneGroup) {
      rootSceneGroup.rotation.y += 0.003;
    }

    if (controls) controls.update();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  // --- UI Event Handlers & Binding ---
  function setupEventListeners() {
    // Preset Buttons
    const presetBtns = document.querySelectorAll('.btn-winding-preset');
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const preset = btn.getAttribute('data-preset');
        if (preset === 'superflux-standard') {
          state.turns = 6;
          state.strands = 18;
          state.wireAwg = 28;
          state.connection = 'wye';
        } else if (preset === 'torque-monster') {
          state.turns = 8;
          state.strands = 14;
          state.wireAwg = 28;
          state.connection = 'wye';
        } else if (preset === 'speed-runner') {
          state.turns = 5;
          state.strands = 22;
          state.wireAwg = 28;
          state.connection = 'delta';
        } else if (preset === 'single-strand-fat') {
          state.turns = 6;
          state.strands = 1;
          state.wireAwg = 18;
          state.connection = 'wye';
        }

        const turnsSlider = document.getElementById('turnsSlider');
        if (turnsSlider) turnsSlider.value = state.turns;
        const strandsSlider = document.getElementById('strandsSlider');
        if (strandsSlider) strandsSlider.value = state.strands;
        const awgSelect = document.getElementById('wireAwgSelect');
        if (awgSelect) awgSelect.value = state.wireAwg;

        const connBtns = document.querySelectorAll('.btn-conn-toggle');
        connBtns.forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-conn') === state.connection);
        });

        recalculateAll();
      });
    });

    // Turns & Strands Sliders
    const turnsSlider = document.getElementById('turnsSlider');
    if (turnsSlider) {
      turnsSlider.addEventListener('input', (e) => {
        state.turns = parseInt(e.target.value, 10);
        recalculateAll();
      });
    }

    const strandsSlider = document.getElementById('strandsSlider');
    if (strandsSlider) {
      strandsSlider.addEventListener('input', (e) => {
        state.strands = parseInt(e.target.value, 10);
        recalculateAll();
      });
    }

    // AWG Select
    const awgSelect = document.getElementById('wireAwgSelect');
    if (awgSelect) {
      awgSelect.addEventListener('change', (e) => {
        state.wireAwg = parseInt(e.target.value, 10);
        recalculateAll();
      });
    }

    // Voltage & Current Sliders
    const voltageSlider = document.getElementById('voltageSlider');
    if (voltageSlider) {
      voltageSlider.addEventListener('input', (e) => {
        state.batteryVoltage = parseFloat(e.target.value);
        const el = document.getElementById('voltageVal');
        if (el) el.textContent = state.batteryVoltage + ' V';
        recalculateAll();
      });
    }

    const currentSlider = document.getElementById('currentSlider');
    if (currentSlider) {
      currentSlider.addEventListener('input', (e) => {
        state.currentA = parseFloat(e.target.value);
        const el = document.getElementById('currentVal');
        if (el) el.textContent = state.currentA + ' A';
        recalculateAll();
      });
    }

    // Connection Toggle (Star vs Delta)
    const connBtns = document.querySelectorAll('.btn-conn-toggle');
    connBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        connBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.connection = btn.getAttribute('data-conn');
        recalculateAll();
      });
    });

    // Phase Isolation (Solo Filter Buttons)
    const soloBtns = document.querySelectorAll('.btn-phase-solo');
    soloBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        soloBtns.forEach(b => {
          b.classList.remove('active-all', 'active-a', 'active-b', 'active-c');
        });
        const phase = btn.getAttribute('data-solo');
        state.soloPhase = phase;

        if (phase === 'all') btn.classList.add('active-all');
        else if (phase === 'A') btn.classList.add('active-a');
        else if (phase === 'B') btn.classList.add('active-b');
        else if (phase === 'C') btn.classList.add('active-c');

        update3DScene();
      });
    });

    // Wire Appearance Toggle (Phase Coded vs Real Copper vs Copper + Phase Labels)
    const btnWireAppearance = document.getElementById('btnWireAppearance');
    if (btnWireAppearance) {
      btnWireAppearance.addEventListener('click', () => {
        if (state.wireAppearance === 'phase-coded') {
          state.wireAppearance = 'copper';
          btnWireAppearance.textContent = '✨ Mode: Pure Copper';
          btnWireAppearance.className = 'btn-mode-toggle active-copper';
        } else if (state.wireAppearance === 'copper') {
          state.wireAppearance = 'copper-labeled';
          btnWireAppearance.textContent = '🏷️ Mode: Copper + Labels (A/B/C)';
          btnWireAppearance.className = 'btn-mode-toggle active-labeled';
        } else {
          state.wireAppearance = 'phase-coded';
          btnWireAppearance.textContent = '🎨 Mode: Phase-Coded';
          btnWireAppearance.className = 'btn-mode-toggle';
        }
        update3DScene();
      });
    }

    // Stator Opacity Slider
    const statorOpacitySlider = document.getElementById('statorOpacitySlider');
    if (statorOpacitySlider) {
      statorOpacitySlider.addEventListener('input', (e) => {
        state.statorOpacity = parseFloat(e.target.value);
        if (statorGroup.children.length > 0) {
          applyStatorMaterials(statorGroup.children[0]);
        }
      });
    }

    // Exploded View Slider
    const explodedSlider = document.getElementById('explodedSlider');
    if (explodedSlider) {
      explodedSlider.addEventListener('input', (e) => {
        state.explodedProgress = parseFloat(e.target.value);
        update3DRotor();
      });
    }

    // Auto-Spin Toggle
    const btnAutoSpin = document.getElementById('btnToggleAutoSpin');
    if (btnAutoSpin) {
      btnAutoSpin.addEventListener('click', () => {
        state.autoSpin = !state.autoSpin;
        btnAutoSpin.textContent = state.autoSpin ? '▶ Auto-Spin: ON' : '⏸ Auto-Spin: OFF';
        btnAutoSpin.classList.toggle('active', state.autoSpin);
      });
    }

    // Camera Reset Button
    const btnResetCam = document.getElementById('btnViewportReset');
    if (btnResetCam) {
      btnResetCam.addEventListener('click', () => {
        if (camera && controls) {
          camera.position.set(0, 110, 190);
          controls.target.set(0, 0, 0);
          controls.update();
        }
      });
    }

    // View Switcher Tabs
    const tabBtns = document.querySelectorAll('.view-tab-btn');
    const tabPanes = document.querySelectorAll('.view-pane-content');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const viewId = btn.getAttribute('data-view');
        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const activePane = document.getElementById(viewId);
        if (activePane) activePane.classList.add('active');

        state.activeTab = viewId;
        if (viewId === 'view-3d') {
          setTimeout(onWindowResize, 50);
        }
      });
    });

    // Copy Spec Sheet Button
    const btnCopy = document.getElementById('btnCopyWindingSpec');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const calc = state.calculated;
        const text = `=== BLDC MOTOR WINDING SPEC SHEET ===
Motor: 27-Slot Outrunner Stator (115mm OD x 60mm ID x 90mm Stack)
Poles: ${state.poles} (15 Pole Pairs)
Termination: ${state.connection.toUpperCase()}
Winding Schema: ${calc.winding ? calc.winding.schemaString : 'N/A'}
Turns per Tooth: ${state.turns} T
Parallel Strands: ${state.strands} x ${state.wireAwg} AWG
Slot Fill Factor: ${calc.slotFillFactor.toFixed(1)}%
Copper Weight: ${Math.round(calc.totalCopperMassGrams)} g
Phase Resistance (80C): ${(calc.phaseResistanceRph * 1000).toFixed(1)} mOhm
Calculated Kv: ${calc.Kv.toFixed(1)} RPM/V
Calculated Kt: ${calc.Kt.toFixed(3)} Nm/A
Generated via Quinn Foster Web Suite (Experience 8)`;

        navigator.clipboard.writeText(text).then(() => {
          const oldText = btnCopy.textContent;
          btnCopy.textContent = '✅ Copied!';
          setTimeout(() => { btnCopy.textContent = oldText; }, 2000);
        });
      });
    }
  }

  // --- Document Initialization ---
  document.addEventListener('DOMContentLoaded', () => {
    initThreeScene();
    setupEventListeners();
    recalculateAll();
  });

})();
