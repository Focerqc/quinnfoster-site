/**
 * Experience 7: Interactive BLDC Outrunner Stator Winding & Performance Engine
 * Built for 27-Slot Superflux & Cannoncore Hub Motor Stator Laminations
 * Author: Quinn Foster
 */

(function () {
  'use strict';

  // --- Constants & Geometry Database for 27-Slot Hub Motor Stator ---
  const STATOR_SPECS = {
    name: "Superflux & Cannoncore 27-Slot Stator",
    slots: 27,
    outerDiameterMm: 115.0,
    innerDiameterMm: 60.0,
    stackLengthMm: 90.0,
    toothStemWidthMm: 5.0,
    slotOpeningMm: 2.2,
    slotAreaMm2: 98.5, // Usable cross-sectional slot area
    meanTurnLengthBaseMm: 210.0, // Base mean turn length (2 * (stack + toothWidth) + endturns)
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
    { awg: 28, diaMm: 0.321, areaMm2: 0.081, totalDiaMm: 0.36 }, // Standard multi-strand choice
    { awg: 29, diaMm: 0.286, areaMm2: 0.064, totalDiaMm: 0.32 },
    { awg: 30, diaMm: 0.255, areaMm2: 0.051, totalDiaMm: 0.29 },
    { awg: 32, diaMm: 0.202, areaMm2: 0.032, totalDiaMm: 0.23 },
    { awg: 34, diaMm: 0.160, areaMm2: 0.020, totalDiaMm: 0.19 },
    { awg: 36, diaMm: 0.127, areaMm2: 0.013, totalDiaMm: 0.15 }
  ];

  // Magnet grade database (Remanence Br in Tesla)
  const MAGNET_GRADES = {
    'N35': 1.18,
    'N38': 1.23,
    'N42': 1.30,
    'N45': 1.35,
    'N48': 1.40,
    'N50': 1.43,
    'N52': 1.46
  };

  // Phase color styling
  const PHASE_COLORS = {
    A: { hex: '#ef4444', name: 'Phase A', dark: '#991b1b', light: '#fca5a5' },
    B: { hex: '#06b6d4', name: 'Phase B', dark: '#0e7490', light: '#67e8f9' },
    C: { hex: '#10b981', name: 'Phase C', dark: '#047857', light: '#6ee7b7' },
    none: { hex: '#64748b', name: 'Unassigned', dark: '#334155', light: '#94a3b8' }
  };

  // State
  const state = {
    poles: 30, // 27N30P standard
    turns: 6,
    strands: 18,
    wireAwg: 28,
    connection: 'wye', // 'wye' or 'delta'
    magnetGrade: 'N48',
    magnetBr: 1.40,
    airgapMm: 0.70,
    magnetThickMm: 3.0,
    batteryVoltage: 84.0, // 20S Li-Ion (~84V max / 72V nominal)
    currentA: 50.0,
    tireDiameterInches: 11.0, // Standard PEV / Onewheel tire
    activeTab: 'view-3d', // 'view-3d', 'view-2d-circular', 'view-2d-linear', 'view-guide'
    explodedProgress: 0.0, // 0 = closed, 1 = exploded
    autoSpin: true,
    showWireStrands: false,
    selectedTooth: 1, // 1 to 27
    calculated: {}
  };

  // Global Three.js References
  let scene, camera, renderer, controls;
  let statorGroup, windingsGroup, rotorGroup, rootSceneGroup;
  let animFrameId = null;
  let glbLoaded = false;
  let isSceneInitialized = false;

  // --- Winding Pattern & Math Engine ---

  /**
   * Calculates concentrated fractional-slot winding schema for 27 slots and given poles.
   * Uses Star of Slots / Cros' method.
   */
  function computeWindingPattern(slots, poles) {
    const gammaE = (poles / 2) * (2 * Math.PI / slots); // Electrical angle per slot (rad)
    const teeth = [];

    // Phase angle targets in electrical space
    // Phase A: 0, Phase B: 120 (2pi/3), Phase C: 240 (4pi/3)
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

    // Fundamental Winding Factor kw1 for Phase A
    let sumX = 0;
    let sumY = 0;
    let countA = 0;
    for (let t of teeth) {
      if (t.phase === 'A') {
        countA++;
        const angle = t.elecAngleRad + (t.direction === -1 ? Math.PI : 0);
        sumX += Math.cos(angle);
        sumY += Math.sin(angle);
      }
    }
    const kw1 = countA > 0 ? (Math.hypot(sumX, sumY) / countA) : 0.95;

    // Cogging torque steps & periodicity
    function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
    const gcdPoles = gcd(slots, poles / 2);
    const lcmCogging = (slots * poles) / gcd(slots, poles);

    // Calculate Hall Sensor Slot Placements for 120° electrical spacing
    const hallPositions = findHallPlacements(teeth, gammaE);

    return {
      teeth,
      schemaString,
      kw1,
      gcdPoles,
      lcmCogging,
      gammaEDeg: (gammaE * 180 / Math.PI) % 360,
      hallPositions
    };
  }

  /**
   * Identifies the optimal stator slots for placing 3 Hall sensors (120° electrical spacing).
   */
  function findHallPlacements(teeth, gammaE) {
    const targets = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];
    const halls = [];

    targets.forEach((target, idx) => {
      let bestSlot = 1;
      let minDiff = Infinity;
      teeth.forEach(t => {
        let diff = Math.abs(((t.elecAngleRad - target + Math.PI) % (2 * Math.PI)) - Math.PI);
        if (diff < minDiff) {
          minDiff = diff;
          bestSlot = t.slotNumber;
        }
      });
      halls.push({ sensor: `H${idx + 1}`, slot: bestSlot, targetDeg: (target * 180 / Math.PI).toFixed(0) });
    });

    return halls;
  }

  // --- Complete Motor Calculations ---
  function recalculateAll() {
    const winding = computeWindingPattern(STATOR_SPECS.slots, state.poles);
    const wire = WIRE_GAUGE_DB.find(w => w.awg === state.wireAwg) || WIRE_GAUGE_DB[10];

    // Copper Area & Slot Fill
    // In double-layer concentrated winding, each slot houses 2 coil sides
    const singleCoilCopperArea = state.turns * state.strands * wire.areaMm2;
    const totalSlotCopperArea = 2 * singleCoilCopperArea;
    const fillFactorPercent = (totalSlotCopperArea / STATOR_SPECS.slotAreaMm2) * 100;

    let fillStatus = 'Safe';
    let fillClass = 'fill-safe';
    if (fillFactorPercent > 55) {
      fillStatus = 'Critical / Overfilled';
      fillClass = 'fill-critical';
    } else if (fillFactorPercent > 48) {
      fillStatus = 'Tight / Experienced';
      fillClass = 'fill-tight';
    } else if (fillFactorPercent > 32) {
      fillStatus = 'Optimal / Balanced';
      fillClass = 'fill-optimal';
    } else {
      fillStatus = 'Loose / Easy';
      fillClass = 'fill-loose';
    }

    // Mean Turn Length & Wire Length
    // MTL accounts for 90mm stack length + 5mm tooth width + end-turn semi-circle
    const endTurnArc = Math.PI * (STATOR_SPECS.toothStemWidthMm + 3.0);
    const meanTurnLengthM = (2 * (STATOR_SPECS.stackLengthMm + STATOR_SPECS.toothStemWidthMm) + endTurnArc) / 1000;
    
    const coilsPerPhase = STATOR_SPECS.slots / 3; // 9 coils per phase for 27 slots
    const totalTurnsPerPhase = coilsPerPhase * state.turns;
    const wireLengthPerPhaseM = totalTurnsPerPhase * meanTurnLengthM;
    const totalMotorWireLengthM = wireLengthPerPhaseM * 3 * state.strands;

    // Resistance calculations (Copper resistivity = 0.0172 Ohm*mm²/m at 20°C, 0.0212 at 80°C)
    const copperRho20 = 0.0172;
    const copperRho80 = 0.0212;
    const parallelCrossSection = state.strands * wire.areaMm2;

    const rPhase20 = (copperRho20 * wireLengthPerPhaseM) / parallelCrossSection;
    const rPhase80 = (copperRho80 * wireLengthPerPhaseM) / parallelCrossSection;

    let rTerminal20 = state.connection === 'wye' ? 2 * rPhase20 : (2 / 3) * rPhase20;
    let rTerminal80 = state.connection === 'wye' ? 2 * rPhase80 : (2 / 3) * rPhase80;

    // Magnetic Circuit & Flux Calculations
    const Br = state.magnetBr;
    const lm = state.magnetThickMm / 1000;
    const g = state.airgapMm / 1000;
    const kc = 1.12; // Carter's coefficient for slotted stator
    const muRec = 1.05; // Recoil permeability of NdFeB
    const Bg = Br * (lm / (lm + muRec * kc * g)); // Airgap flux density (Tesla)

    // Pole pitch at stator surface
    const D_stator = STATOR_SPECS.outerDiameterMm / 1000;
    const tauP = (Math.PI * D_stator) / state.poles;
    const L_stk = STATOR_SPECS.stackLengthMm / 1000;
    const fluxPerPoleWeber = (2 / Math.PI) * Bg * tauP * L_stk; // Peak fundamental flux per pole (Wb)

    // Back-EMF constant Ke and Torque constant Kt
    const N_phase_series = coilsPerPhase * state.turns;
    const p_pairs = state.poles / 2;
    
    // Ke (V*s/rad line-to-line RMS)
    let Ke_wye = Math.sqrt(3) * p_pairs * winding.kw1 * N_phase_series * fluxPerPoleWeber * (1 / Math.sqrt(2));
    let Kt_wye = Ke_wye; // In SI units: Kt (Nm/A) == Ke (V*s/rad)
    let Kv_wye = 9.5493 / Kt_wye; // Kv in RPM/V

    let Kt, Kv, Ke;
    if (state.connection === 'wye') {
      Kt = Kt_wye;
      Kv = Kv_wye;
      Ke = Ke_wye;
    } else {
      // Delta connection
      Kt = Kt_wye / Math.sqrt(3);
      Kv = Kv_wye * Math.sqrt(3);
      Ke = Ke_wye / Math.sqrt(3);
    }

    // Performance at selected battery voltage
    const noLoadRpm = Kv * state.batteryVoltage;
    const wheelCircumferenceM = (state.tireDiameterInches * 0.0254) * Math.PI;
    const noLoadKmh = (noLoadRpm * wheelCircumferenceM * 60) / 1000;
    const noLoadMph = noLoadKmh * 0.621371;

    // Torque & Copper Losses at rated current
    const continuousTorqueNm = Kt * state.currentA;
    const copperLossW = 3 * Math.pow(state.currentA / Math.sqrt(3), 2) * rPhase80; // Total 3-phase I²R loss

    // Estimated Copper Weight (Copper density ~8.96 g/cm³)
    const totalCopperVolumeCm3 = (totalMotorWireLengthM * 100) * (wire.areaMm2 / 100);
    const copperWeightKg = (totalCopperVolumeCm3 * 8.96) / 1000;

    state.calculated = {
      winding,
      wire,
      fillFactorPercent,
      fillStatus,
      fillClass,
      totalSlotCopperArea,
      singleCoilCopperArea,
      meanTurnLengthM,
      wireLengthPerPhaseM,
      totalMotorWireLengthM,
      copperWeightKg,
      rPhase20: rPhase20 * 1000, // mOhm
      rPhase80: rPhase80 * 1000, // mOhm
      rTerminal20: rTerminal20 * 1000, // mOhm
      rTerminal80: rTerminal80 * 1000, // mOhm
      Bg,
      fluxPerPoleWeber: fluxPerPoleWeber * 1000, // mWb
      Ke,
      Kt,
      Kv,
      noLoadRpm,
      noLoadKmh,
      noLoadMph,
      continuousTorqueNm,
      copperLossW
    };

    updateUI();
    render2DCircular();
    render2DLinear();
    renderWindingGuide();
    update3DCoils();
  }

  // --- UI Update & Rendering ---
  function updateUI() {
    const calc = state.calculated;
    if (!calc.winding) return;

    // Winding Scheme & Badges
    const schemaEl = document.getElementById('windingSchemaDisplay');
    if (schemaEl) schemaEl.textContent = calc.winding.schemaString;

    const kw1El = document.getElementById('kw1Display');
    if (kw1El) kw1El.textContent = calc.winding.kw1.toFixed(4);

    const lcmEl = document.getElementById('lcmDisplay');
    if (lcmEl) lcmEl.textContent = calc.winding.lcmCogging;

    const gcdEl = document.getElementById('gcdDisplay');
    if (gcdEl) gcdEl.textContent = calc.winding.gcdPoles;

    const gammaEl = document.getElementById('gammaEDisplay');
    if (gammaEl) gammaEl.textContent = `${calc.winding.gammaEDeg.toFixed(1)}°`;

    // Slot Fill Gauge
    const fillValEl = document.getElementById('fillFactorVal');
    const fillBarEl = document.getElementById('fillFactorBar');
    const fillStatusEl = document.getElementById('fillFactorStatus');
    if (fillValEl) fillValEl.textContent = `${calc.fillFactorPercent.toFixed(1)}%`;
    if (fillBarEl) {
      fillBarEl.style.width = `${Math.min(calc.fillFactorPercent, 100)}%`;
      fillBarEl.className = `fill-progress-bar ${calc.fillClass}`;
    }
    if (fillStatusEl) {
      fillStatusEl.textContent = calc.fillStatus;
      fillStatusEl.className = `fill-badge ${calc.fillClass}`;
    }

    // Performance Stats
    const kvEl = document.getElementById('kvDisplay');
    if (kvEl) kvEl.textContent = `${calc.Kv.toFixed(1)} RPM/V`;

    const ktEl = document.getElementById('ktDisplay');
    if (ktEl) ktEl.textContent = `${calc.Kt.toFixed(3)} Nm/A`;

    const rphEl = document.getElementById('rphDisplay');
    if (rphEl) rphEl.textContent = `${calc.rPhase20.toFixed(1)} mΩ (20°C) / ${calc.rPhase80.toFixed(1)} mΩ (80°C)`;

    const rttEl = document.getElementById('rttDisplay');
    if (rttEl) rttEl.textContent = `${calc.rTerminal80.toFixed(1)} mΩ`;

    const noLoadSpeedEl = document.getElementById('noLoadSpeedDisplay');
    if (noLoadSpeedEl) noLoadSpeedEl.textContent = `${calc.noLoadRpm.toFixed(0)} RPM (${calc.noLoadMph.toFixed(1)} mph / ${calc.noLoadKmh.toFixed(1)} km/h)`;

    const torqueEl = document.getElementById('torqueDisplay');
    if (torqueEl) torqueEl.textContent = `${calc.continuousTorqueNm.toFixed(1)} Nm (@ ${state.currentA}A)`;

    const copperLossEl = document.getElementById('copperLossDisplay');
    if (copperLossEl) copperLossEl.textContent = `${calc.copperLossW.toFixed(1)} W`;

    const bgEl = document.getElementById('bgDisplay');
    if (bgEl) bgEl.textContent = `${calc.Bg.toFixed(2)} T`;

    const fluxEl = document.getElementById('fluxDisplay');
    if (fluxEl) fluxEl.textContent = `${calc.fluxPerPoleWeber.toFixed(2)} mWb`;

    const copperWeightEl = document.getElementById('copperWeightDisplay');
    if (copperWeightEl) copperWeightEl.textContent = `${(calc.copperWeightKg * 1000).toFixed(0)} g`;

    // Sliders Readouts
    const turnsVal = document.getElementById('turnsVal');
    if (turnsVal) turnsVal.textContent = state.turns;

    const strandsVal = document.getElementById('strandsVal');
    if (strandsVal) strandsVal.textContent = state.strands;

    const airgapVal = document.getElementById('airgapVal');
    if (airgapVal) airgapVal.textContent = `${state.airgapMm.toFixed(2)} mm`;

    const voltageVal = document.getElementById('voltageVal');
    if (voltageVal) voltageVal.textContent = `${state.batteryVoltage} V`;

    const currentVal = document.getElementById('currentVal');
    if (currentVal) currentVal.textContent = `${state.currentA} A`;
  }

  // --- 2D Circular Interactive SVG Diagram ---
  function render2DCircular() {
    const container = document.getElementById('circularSvgContainer');
    if (!container) return;

    const calc = state.calculated;
    if (!calc.winding) return;

    const teeth = calc.winding.teeth;
    const poles = state.poles;
    const size = 520;
    const center = size / 2;
    const statorR_outer = 190;
    const statorR_inner = 90;
    const rotorR_inner = statorR_outer + 12 + state.airgapMm * 10;
    const rotorR_outer = rotorR_inner + 18;

    let svg = `<svg viewBox="0 0 ${size} ${size}" class="stator-svg" id="statorCircularSvg">
      <defs>
        <radialGradient id="statorCoreGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#1e293b" />
          <stop offset="100%" stop-color="#0f172a" />
        </radialGradient>
      </defs>

      <!-- Center Hole & Bore -->
      <circle cx="${center}" cy="${center}" r="${statorR_inner - 10}" fill="#0b1120" stroke="#334155" stroke-width="2" />
      <circle cx="${center}" cy="${center}" r="45" fill="#020617" stroke="#1e293b" stroke-dasharray="4 4" />
      <text x="${center}" y="${center - 6}" text-anchor="middle" fill="#94a3b8" font-size="11" font-weight="700">60mm Bore</text>
      <text x="${center}" y="${center + 12}" text-anchor="middle" fill="#38bdf8" font-size="10">27 Slots / Teeth</text>

      <!-- Outer Rotor Back-Iron Ring -->
      <circle cx="${center}" cy="${center}" r="${rotorR_outer}" fill="none" stroke="#475569" stroke-width="6" opacity="0.85" />
    `;

    // Draw Alternating Rotor Magnets
    const poleAngleStep = (2 * Math.PI) / poles;
    for (let p = 0; p < poles; p++) {
      const aStart = p * poleAngleStep - poleAngleStep / 2;
      const aEnd = aStart + poleAngleStep * 0.92;
      const isNorth = p % 2 === 0;
      const magColor = isNorth ? '#ef4444' : '#3b82f6';
      const magLabel = isNorth ? 'N' : 'S';

      const x1 = center + rotorR_inner * Math.cos(aStart);
      const y1 = center + rotorR_inner * Math.sin(aStart);
      const x2 = center + rotorR_outer * Math.cos(aStart);
      const y2 = center + rotorR_outer * Math.sin(aStart);
      const x3 = center + rotorR_outer * Math.cos(aEnd);
      const y3 = center + rotorR_outer * Math.sin(aEnd);
      const x4 = center + rotorR_inner * Math.cos(aEnd);
      const y4 = center + rotorR_inner * Math.sin(aEnd);

      const path = `M ${x1} ${y1} L ${x2} ${y2} A ${rotorR_outer} ${rotorR_outer} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${rotorR_inner} ${rotorR_inner} 0 0 0 ${x1} ${y1} Z`;
      
      const midAngle = (aStart + aEnd) / 2;
      const labelX = center + ((rotorR_inner + rotorR_outer) / 2) * Math.cos(midAngle);
      const labelY = center + ((rotorR_inner + rotorR_outer) / 2) * Math.sin(midAngle) + 3;

      svg += `<path d="${path}" fill="${magColor}" opacity="0.75" stroke="#0f172a" stroke-width="1" />`;
      if (poles <= 36) {
        svg += `<text x="${labelX}" y="${labelY}" text-anchor="middle" fill="#ffffff" font-size="8" font-weight="900">${magLabel}</text>`;
      }
    }

    // Draw Stator Teeth
    const toothAngleStep = (2 * Math.PI) / 27;
    teeth.forEach((tooth, i) => {
      const angle = i * toothAngleStep - Math.PI / 2; // Tooth 1 at top 12 o'clock
      const phaseData = PHASE_COLORS[tooth.phase];
      const isSelected = state.selectedTooth === tooth.slotNumber;

      const stemW = 14;
      const shoeW = 28;

      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const perpCos = -sinA;
      const perpSin = cosA;

      const bx1 = center + statorR_inner * cosA - (stemW / 2) * perpCos;
      const by1 = center + statorR_inner * sinA - (stemW / 2) * perpSin;
      const bx2 = center + statorR_inner * cosA + (stemW / 2) * perpCos;
      const by2 = center + statorR_inner * sinA + (stemW / 2) * perpSin;

      const sx1 = center + (statorR_outer - 12) * cosA - (stemW / 2) * perpCos;
      const sy1 = center + (statorR_outer - 12) * sinA - (stemW / 2) * perpSin;
      const sx2 = center + (statorR_outer - 12) * cosA + (stemW / 2) * perpCos;
      const sy2 = center + (statorR_outer - 12) * sinA + (stemW / 2) * perpSin;

      const wx1 = center + statorR_outer * cosA - (shoeW / 2) * perpCos;
      const wy1 = center + statorR_outer * sinA - (shoeW / 2) * perpSin;
      const wx2 = center + statorR_outer * cosA + (shoeW / 2) * perpCos;
      const wy2 = center + statorR_outer * sinA + (shoeW / 2) * perpSin;

      const toothPath = `M ${bx1} ${by1} L ${sx1} ${sy1} L ${wx1} ${wy1} A ${statorR_outer} ${statorR_outer} 0 0 1 ${wx2} ${wy2} L ${sx2} ${sy2} L ${bx2} ${by2} Z`;

      const coilR1 = statorR_inner + 8;
      const coilR2 = statorR_outer - 16;
      const cx1 = center + coilR1 * cosA - (stemW / 2 + 5) * perpCos;
      const cy1 = center + coilR1 * sinA - (stemW / 2 + 5) * perpSin;
      const cx2 = center + coilR2 * cosA - (stemW / 2 + 5) * perpCos;
      const cy2 = center + coilR2 * sinA - (stemW / 2 + 5) * perpSin;
      const cx3 = center + coilR2 * cosA + (stemW / 2 + 5) * perpCos;
      const cy3 = center + coilR2 * sinA + (stemW / 2 + 5) * perpSin;
      const cx4 = center + coilR1 * cosA + (stemW / 2 + 5) * perpCos;
      const cy4 = center + coilR1 * sinA + (stemW / 2 + 5) * perpSin;

      const coilPath = `M ${cx1} ${cy1} L ${cx2} ${cy2} L ${cx3} ${cy3} L ${cx4} ${cy4} Z`;

      svg += `<path d="${toothPath}" fill="${isSelected ? '#334155' : '#1e293b'}" stroke="#475569" stroke-width="1.5" />`;

      const coilFill = tooth.direction === 1 ? phaseData.hex : phaseData.dark;
      const strokeColor = isSelected ? '#ffffff' : phaseData.light;
      const strokeWidth = isSelected ? '3' : '1.5';

      svg += `
        <g class="tooth-group" data-tooth="${tooth.slotNumber}" style="cursor: pointer;">
          <path d="${coilPath}" fill="${coilFill}" opacity="0.9" stroke="${strokeColor}" stroke-width="${strokeWidth}" />
      `;

      const midR = (coilR1 + coilR2) / 2;
      const textX = center + midR * cosA;
      const textY = center + midR * sinA;
      const dirSymbol = tooth.direction === 1 ? '⟳' : '⟲';

      svg += `
          <text x="${textX}" y="${textY - 2}" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="900" style="pointer-events:none;">${tooth.code}</text>
          <text x="${textX}" y="${textY + 10}" text-anchor="middle" fill="#ffffff" font-size="9" font-weight="700" opacity="0.85" style="pointer-events:none;">${dirSymbol} T${tooth.slotNumber}</text>
        </g>
      `;
    });

    // Hall Sensor Markers Overlay
    calc.winding.hallPositions.forEach(h => {
      const toothIdx = h.slot - 1;
      const angle = toothIdx * toothAngleStep - Math.PI / 2;
      const hx = center + (statorR_outer - 6) * Math.cos(angle);
      const hy = center + (statorR_outer - 6) * Math.sin(angle);

      svg += `
        <circle cx="${hx}" cy="${hy}" r="5" fill="#facc15" stroke="#000000" stroke-width="1.5" />
        <text x="${hx}" y="${hy - 7}" text-anchor="middle" fill="#facc15" font-size="9" font-weight="800">${h.sensor}</text>
      `;
    });

    svg += `</svg>`;
    container.innerHTML = svg;

    container.querySelectorAll('.tooth-group').forEach(el => {
      el.addEventListener('click', () => {
        const tNum = parseInt(el.getAttribute('data-tooth'), 10);
        state.selectedTooth = tNum;
        render2DCircular();
        updateToothInspector(tNum);
      });
    });

    updateToothInspector(state.selectedTooth);
  }

  // --- Tooth Inspector Modal / Panel ---
  function updateToothInspector(slotNum) {
    const calc = state.calculated;
    if (!calc.winding) return;

    const tooth = calc.winding.teeth.find(t => t.slotNumber === slotNum);
    if (!tooth) return;

    const inspectorEl = document.getElementById('toothInspectorDisplay');
    if (!inspectorEl) return;

    const phase = PHASE_COLORS[tooth.phase];
    const dirIcon = tooth.direction === 1 ? '🔄 Clockwise (Forward +)' : '🔁 Counter-Clockwise (Reverse −)';

    inspectorEl.innerHTML = `
      <div class="tooth-inspect-card" style="border-left: 4px solid ${phase.hex};">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
          <span style="font-weight: 800; font-size: 1.05rem; color: #f8fafc;">Tooth #${tooth.slotNumber} of 27</span>
          <span class="phase-tag" style="background: ${phase.hex}22; color: ${phase.hex}; border: 1px solid ${phase.hex}88;">${phase.name} (${tooth.code})</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.8rem; color: #cbd5e1;">
          <div>Winding Direction: <strong>${dirIcon}</strong></div>
          <div>Turns on Tooth: <strong>${state.turns} Turns (${state.strands}x Strands)</strong></div>
          <div>Mechanical Angle: <strong>${tooth.mechAngleDeg.toFixed(1)}°</strong></div>
          <div>Electrical Angle: <strong>${tooth.elecAngleDeg.toFixed(1)}°</strong></div>
        </div>
      </div>
    `;
  }

  // --- 2D Linear Unrolled Stator Diagram ---
  function render2DLinear() {
    const container = document.getElementById('linearSvgContainer');
    if (!container) return;

    const calc = state.calculated;
    if (!calc.winding) return;

    const teeth = calc.winding.teeth;
    const width = 1100;
    const height = 240;
    const toothW = 34;
    const toothH = 100;
    const startX = 40;
    const startY = 80;

    let svg = `<svg viewBox="0 0 ${width} ${height}" class="linear-stator-svg" id="linearStatorSvg">
      <!-- Bus bars at top for Phase Leads & Neutral Point -->
      <line x1="${startX}" y1="30" x2="${width - 40}" y2="30" stroke="#334155" stroke-width="2" stroke-dasharray="3 3" />
      <text x="${startX - 10}" y="34" fill="#94a3b8" font-size="11" font-weight="700" text-anchor="end">Phase Bus</text>

      <line x1="${startX}" y1="${startY + toothH + 35}" x2="${width - 40}" y2="${startY + toothH + 35}" stroke="#e2e8f0" stroke-width="2.5" opacity="0.6" />
      <text x="${startX - 10}" y="${startY + toothH + 39}" fill="#f8fafc" font-size="11" font-weight="700" text-anchor="end">${state.connection === 'wye' ? 'Star Point (N)' : 'Delta Bus'}</text>
    `;

    teeth.forEach((t, i) => {
      const tx = startX + i * 38;
      const phase = PHASE_COLORS[t.phase];
      const isSelected = state.selectedTooth === t.slotNumber;

      svg += `
        <rect x="${tx}" y="${startY}" width="${toothW}" height="${toothH}" rx="3" fill="${isSelected ? '#334155' : '#1e293b'}" stroke="#475569" stroke-width="1.5" />
        
        <rect x="${tx + 3}" y="${startY + 15}" width="${toothW - 6}" height="${toothH - 30}" rx="2" fill="${t.direction === 1 ? phase.hex : phase.dark}" opacity="0.9" stroke="${isSelected ? '#fff' : phase.light}" stroke-width="${isSelected ? '2.5' : '1'}" />
        
        <text x="${tx + toothW / 2}" y="${startY + 40}" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="900">${t.code}</text>
        <text x="${tx + toothW / 2}" y="${startY + 56}" text-anchor="middle" fill="#ffffff" font-size="9" font-weight="700">${t.direction === 1 ? 'CW' : 'CCW'}</text>
        <text x="${tx + toothW / 2}" y="${startY + toothH - 6}" text-anchor="middle" fill="#94a3b8" font-size="9" font-weight="700">T${t.slotNumber}</text>
      `;

      const midTx = tx + toothW / 2;
      svg += `
        <line x1="${midTx}" y1="${startY + 15}" x2="${midTx}" y2="30" stroke="${phase.hex}" stroke-width="1.5" opacity="0.75" />
        <line x1="${midTx}" y1="${startY + toothH - 15}" x2="${midTx}" y2="${startY + toothH + 35}" stroke="${phase.hex}" stroke-width="1.5" opacity="0.75" />
      `;
    });

    svg += `</svg>`;
    container.innerHTML = svg;
  }

  // --- Step-by-Step Practical Winding Guide ---
  function renderWindingGuide() {
    const container = document.getElementById('windingGuideContainer');
    if (!container) return;

    const calc = state.calculated;
    if (!calc.winding) return;

    const teeth = calc.winding.teeth;
    const phases = ['A', 'B', 'C'];

    let html = `
      <div class="guide-header-card">
        <h4>📋 Practical Workshop Winding Guide: 27N${state.poles}P ${state.connection.toUpperCase()}</h4>
        <p style="color: #cbd5e1; font-size: 0.85rem; margin-top: 0.3rem;">
          Winding sequence for 27 teeth with <strong>${state.turns} turns per tooth</strong> using <strong>${state.strands} parallel strands of ${state.wireAwg} AWG</strong> magnet wire. Total slot fill: <strong>${calc.fillFactorPercent.toFixed(1)}% (${calc.fillStatus})</strong>.
        </p>
      </div>

      <div class="guide-steps-list">
    `;

    phases.forEach((pKey) => {
      const pColor = PHASE_COLORS[pKey];
      const pTeeth = teeth.filter(t => t.phase === pKey);

      html += `
        <div class="guide-phase-card" style="border-left: 4px solid ${pColor.hex};">
          <div class="guide-phase-header">
            <span class="phase-pill" style="background: ${pColor.hex};">${pColor.name}</span>
            <span style="font-size: 0.8rem; color: #94a3b8;">Wire Length: ~${(calc.wireLengthPerPhaseM).toFixed(1)} meters per bundle (${state.strands} strands)</span>
          </div>

          <div class="guide-tooth-sequence">
            <ol style="margin: 0; padding-left: 1.2rem; font-size: 0.82rem; color: #e2e8f0; line-height: 1.6;">
      `;

      pTeeth.forEach((t, stepIdx) => {
        const dirText = t.direction === 1 ? '<strong>Clockwise (CW)</strong>' : '<strong>Counter-Clockwise (CCW)</strong>';
        const transition = stepIdx < pTeeth.length - 1 ? `→ Bridge wire to Tooth #${pTeeth[stepIdx + 1].slotNumber}` : `→ Terminate lead at ${state.connection === 'wye' ? 'Star Point (N)' : 'Delta Node'}`;
        html += `
          <li><strong>Tooth #${t.slotNumber}</strong> (${t.code}): Wind <strong>${state.turns} turns</strong> ${dirText} ${transition}</li>
        `;
      });

      html += `
            </ol>
          </div>
        </div>
      `;
    });

    html += `
      <div class="guide-phase-card" style="border-left: 4px solid #facc15;">
        <div class="guide-phase-header">
          <span class="phase-pill" style="background: #facc15; color: #000;">Termination & Hall Sensors</span>
        </div>
        <div style="font-size: 0.82rem; color: #e2e8f0; line-height: 1.6;">
          <p><strong>Connection (${state.connection === 'wye' ? 'Wye / Star' : 'Delta'}):</strong> ${state.connection === 'wye' ? 'Solder all 3 Phase Ends (A_end, B_end, C_end) together into a single insulated center star point. Insulate with fiberglass sleeving.' : 'Solder A_end to B_start, B_end to C_start, and C_end to A_start to form a closed triangle.'}</p>
          <p><strong>Hall Sensor Slots (120° Electrical):</strong> Place 3 Hall sensors in <strong>Slot #${calc.winding.hallPositions[0].slot} (H1)</strong>, <strong>Slot #${calc.winding.hallPositions[1].slot} (H2)</strong>, and <strong>Slot #${calc.winding.hallPositions[2].slot} (H3)</strong>.</p>
        </div>
      </div>
    </div>`;

    container.innerHTML = html;
  }

  // --- 3D Scene Initialization & Three.js Engine ---
  function init3DScene() {
    const container = document.getElementById('viewport');
    if (!container) return;

    // Avoid duplicate canvases if init is called again
    const existingCanvas = container.querySelector('canvas');
    if (existingCanvas) {
      existingCanvas.remove();
    }

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1d);

    rootSceneGroup = new THREE.Group();
    scene.add(rootSceneGroup);

    statorGroup = new THREE.Group();
    windingsGroup = new THREE.Group();
    rotorGroup = new THREE.Group();

    rootSceneGroup.add(statorGroup);
    rootSceneGroup.add(windingsGroup);
    rootSceneGroup.add(rotorGroup);

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 140, 200);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    if (typeof THREE.OrbitControls !== 'undefined') {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.maxDistance = 500;
      controls.minDistance = 40;
    }

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 1.2);
    dirLight1.position.set(100, 200, 100);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xf43f5e, 0.8);
    dirLight2.position.set(-100, -100, -100);
    scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0xffffff, 1.0, 300);
    pointLight.position.set(0, 50, 80);
    scene.add(pointLight);

    const gridHelper = new THREE.GridHelper(300, 30, 0x1e293b, 0x0f172a);
    gridHelper.position.y = -60;
    scene.add(gridHelper);

    loadStatorGLB();
    buildRotorMagnets();
    update3DCoils();

    window.addEventListener('resize', onWindowResize);

    isSceneInitialized = true;
    if (!animFrameId) {
      animate();
    }
  }

  function loadStatorGLB() {
    const loadingEl = document.getElementById('viewportLoading');
    let isHandled = false;

    // Safety timeout: If GLB loader hangs or takes > 3.0s, fallback to procedural stator and hide loading screen
    const fallbackTimeout = setTimeout(() => {
      if (!isHandled && !glbLoaded) {
        console.warn('GLB load timeout, falling back to procedural stator.');
        isHandled = true;
        buildProceduralStator();
        if (loadingEl) loadingEl.style.display = 'none';
      }
    }, 3000);

    if (typeof THREE.GLTFLoader === 'undefined') {
      console.warn('GLTFLoader not available, building procedural stator.');
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
        console.warn('Could not load GLB from paths, building procedural stator fallback.');
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
          console.log('Stator GLB loaded successfully from:', glbPaths[index]);

          if (statorGroup) {
            while (statorGroup.children.length > 0) {
              const obj = statorGroup.children[0];
              if (obj.geometry) obj.geometry.dispose();
              if (obj.material) obj.material.dispose();
              statorGroup.remove(obj);
            }

            const statorMesh = gltf.scene;
            statorMesh.scale.set(1000, 1000, 1000);
            
            // Align GLB stator (Z is axial in CAD) with Three.js Y-up motor axis
            statorMesh.rotation.x = Math.PI / 2;
            statorMesh.updateMatrixWorld(true);

            const steelMat = new THREE.MeshStandardMaterial({
              color: 0x475569,
              metalness: 0.85,
              roughness: 0.35
            });

            statorMesh.traverse(child => {
              if (child.isMesh) {
                child.material = steelMat;
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });

            const box = new THREE.Box3().setFromObject(statorMesh);
            const center = box.getCenter(new THREE.Vector3());
            statorMesh.position.sub(center);

            statorGroup.add(statorMesh);
          }

          glbLoaded = true;
          if (loadingEl) loadingEl.style.display = 'none';
        },
        undefined,
        function (err) {
          console.warn('Failed to load GLB from:', glbPaths[index], err);
          tryLoad(index + 1);
        }
      );
    }

    tryLoad(0);
  }

  function buildProceduralStator() {
    if (!statorGroup) return;

    while (statorGroup.children.length > 0) {
      const obj = statorGroup.children[0];
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
      statorGroup.remove(obj);
    }

    const statorMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.8,
      roughness: 0.3
    });

    const stackLen = STATOR_SPECS.stackLengthMm;
    const rOut = STATOR_SPECS.outerDiameterMm / 2;
    const rIn = STATOR_SPECS.innerDiameterMm / 2;
    const slots = 27;

    const group = new THREE.Group();

    const innerRingGeo = new THREE.CylinderGeometry(rIn + 10, rIn, stackLen, 36, 1, true);
    const innerRingMesh = new THREE.Mesh(innerRingGeo, statorMat);
    group.add(innerRingMesh);

    for (let i = 0; i < slots; i++) {
      const angle = (i * 2 * Math.PI) / slots;
      const toothGeo = new THREE.BoxGeometry(STATOR_SPECS.toothStemWidthMm, stackLen, rOut - (rIn + 8));
      const toothMesh = new THREE.Mesh(toothGeo, statorMat);
      
      const midR = (rIn + 8 + rOut) / 2;
      toothMesh.position.set(midR * Math.cos(angle), 0, midR * Math.sin(angle));
      toothMesh.rotation.y = -angle + Math.PI / 2;
      group.add(toothMesh);
    }

    statorGroup.add(group);
  }

  function update3DCoils() {
    if (!windingsGroup) return;

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
    const stackLen = STATOR_SPECS.stackLengthMm;
    const rOut = STATOR_SPECS.outerDiameterMm / 2;
    const rIn = STATOR_SPECS.innerDiameterMm / 2;
    const midR = (rIn + 12 + rOut - 6) / 2;
    const stemL = rOut - (rIn + 12);

    const coilThickness = Math.min(8.0, 2.0 + (state.turns * 0.4) + (state.strands * 0.1));

    teeth.forEach(t => {
      const angle = ((t.slotNumber - 1) * 2 * Math.PI) / 27 - Math.PI / 2;
      const phase = PHASE_COLORS[t.phase];

      const coilMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(phase.hex),
        metalness: 0.9,
        roughness: 0.25,
        emissive: new THREE.Color(t.direction === 1 ? phase.hex : phase.dark),
        emissiveIntensity: 0.2
      });

      const coilGeo = new THREE.BoxGeometry(STATOR_SPECS.toothStemWidthMm + coilThickness, stackLen - 8, stemL - 4);
      const coilMesh = new THREE.Mesh(coilGeo, coilMat);

      coilMesh.position.set(midR * Math.cos(angle), 0, midR * Math.sin(angle));
      coilMesh.rotation.y = -angle + Math.PI / 2;

      windingsGroup.add(coilMesh);
    });

    buildRotorMagnets();
  }

  function buildRotorMagnets() {
    if (!rotorGroup) return;

    while (rotorGroup.children.length > 0) {
      const obj = rotorGroup.children[0];
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
      rotorGroup.remove(obj);
    }

    const poles = state.poles;
    const stackLen = STATOR_SPECS.stackLengthMm;
    const rStator = STATOR_SPECS.outerDiameterMm / 2;
    
    const radialOffset = state.explodedProgress * 35.0;
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
    const backIronMesh = new THREE.Mesh(backIronGeo, backIronMat);
    rotorGroup.add(backIronMesh);

    const poleAngle = (2 * Math.PI) / poles;
    const northMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.8, roughness: 0.2 });
    const southMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.8, roughness: 0.2 });

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
    const turnsInput = document.getElementById('turnsSlider');
    if (turnsInput) {
      turnsInput.addEventListener('input', (e) => {
        state.turns = parseInt(e.target.value, 10);
        recalculateAll();
      });
    }

    const strandsInput = document.getElementById('strandsSlider');
    if (strandsInput) {
      strandsInput.addEventListener('input', (e) => {
        state.strands = parseInt(e.target.value, 10);
        recalculateAll();
      });
    }

    const awgSelect = document.getElementById('wireAwgSelect');
    if (awgSelect) {
      awgSelect.addEventListener('change', (e) => {
        state.wireAwg = parseInt(e.target.value, 10);
        recalculateAll();
      });
    }

    const connBtns = document.querySelectorAll('.btn-conn-toggle');
    connBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        connBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.connection = btn.getAttribute('data-conn');
        recalculateAll();
      });
    });

    const magnetGradeSelect = document.getElementById('magnetGradeSelect');
    if (magnetGradeSelect) {
      magnetGradeSelect.addEventListener('change', (e) => {
        state.magnetGrade = e.target.value;
        state.magnetBr = MAGNET_GRADES[state.magnetGrade] || 1.40;
        recalculateAll();
      });
    }

    const airgapInput = document.getElementById('airgapSlider');
    if (airgapInput) {
      airgapInput.addEventListener('input', (e) => {
        state.airgapMm = parseFloat(e.target.value);
        recalculateAll();
      });
    }

    const voltageInput = document.getElementById('voltageSlider');
    if (voltageInput) {
      voltageInput.addEventListener('input', (e) => {
        state.batteryVoltage = parseFloat(e.target.value);
        recalculateAll();
      });
    }

    const currentInput = document.getElementById('currentSlider');
    if (currentInput) {
      currentInput.addEventListener('input', (e) => {
        state.currentA = parseFloat(e.target.value);
        recalculateAll();
      });
    }

    const explodedInput = document.getElementById('explodedSlider');
    if (explodedInput) {
      explodedInput.addEventListener('input', (e) => {
        state.explodedProgress = parseFloat(e.target.value);
        buildRotorMagnets();
      });
    }

    const btnAutoSpin = document.getElementById('btnToggleAutoSpin');
    if (btnAutoSpin) {
      btnAutoSpin.addEventListener('click', () => {
        state.autoSpin = !state.autoSpin;
        btnAutoSpin.classList.toggle('active', state.autoSpin);
        btnAutoSpin.textContent = state.autoSpin ? '🔄 Auto-Spin: ON' : '⏸ Auto-Spin: OFF';
      });
    }

    const btnResetView = document.getElementById('btnViewportReset');
    if (btnResetView) {
      btnResetView.addEventListener('click', () => {
        if (camera && controls) {
          camera.position.set(0, 140, 200);
          controls.target.set(0, 0, 0);
          controls.update();
        }
      });
    }

    const viewTabs = document.querySelectorAll('.view-tab-btn');
    viewTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        viewTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const viewId = tab.getAttribute('data-view');
        state.activeTab = viewId;

        document.querySelectorAll('.view-pane-content').forEach(p => p.classList.remove('active'));
        const activePane = document.getElementById(viewId);
        if (activePane) activePane.classList.add('active');

        if (viewId === 'view-3d') {
          setTimeout(onWindowResize, 50);
        } else if (viewId === 'view-2d-circular') {
          render2DCircular();
        } else if (viewId === 'view-2d-linear') {
          render2DLinear();
        } else if (viewId === 'view-guide') {
          renderWindingGuide();
        }
      });
    });

    const btnCopySpec = document.getElementById('btnCopyWindingSpec');
    if (btnCopySpec) {
      btnCopySpec.addEventListener('click', () => {
        const calc = state.calculated;
        const text = `=== 27-SLOT BLDC STATOR WINDING SPEC SHEET ===\n` +
          `Motor Topology: 27N${state.poles}P Hub Motor Outrunner\n` +
          `Stator Dimensions: 115mm OD x 60mm ID x 90mm Stack\n` +
          `Winding Pattern: ${calc.winding.schemaString}\n` +
          `Connection: ${state.connection.toUpperCase()} (${state.connection === 'wye' ? 'Star Center Point' : 'Delta Ring'})\n` +
          `Turns per Tooth: ${state.turns} turns\n` +
          `Strands: ${state.strands}x parallel strands (${state.wireAwg} AWG)\n` +
          `Slot Fill Factor: ${calc.fillFactorPercent.toFixed(1)}% (${calc.fillStatus})\n` +
          `Winding Factor (kw1): ${calc.winding.kw1.toFixed(4)}\n` +
          `Phase Resistance (Rph @ 20°C): ${calc.rPhase20.toFixed(1)} mΩ\n` +
          `Velocity Constant (Kv): ${calc.Kv.toFixed(1)} RPM/V\n` +
          `Torque Constant (Kt): ${calc.Kt.toFixed(3)} Nm/A\n` +
          `Airgap: ${state.airgapMm} mm | Magnets: ${state.magnetGrade}\n` +
          `Hall Sensor Slots (120°): ${calc.winding.hallPositions.map(h => `${h.sensor}=Slot#${h.slot}`).join(', ')}\n` +
          `Generated via Quinn Foster BLDC Winding Tool (Experience 7)\n`;

        navigator.clipboard.writeText(text).then(() => {
          const originalText = btnCopySpec.textContent;
          btnCopySpec.textContent = '✅ Copied to Clipboard!';
          btnCopySpec.style.background = 'rgba(16, 185, 129, 0.25)';
          setTimeout(() => {
            btnCopySpec.textContent = originalText;
            btnCopySpec.style.background = '';
          }, 2500);
        });
      });
    }

    const presetBtns = document.querySelectorAll('.btn-winding-preset');
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const presetType = btn.getAttribute('data-preset');
        if (presetType === 'superflux-standard') {
          state.poles = 30;
          state.turns = 6;
          state.strands = 18;
          state.wireAwg = 28;
          state.connection = 'wye';
          state.magnetGrade = 'N48';
          state.airgapMm = 0.70;
        } else if (presetType === 'torque-monster') {
          state.poles = 30;
          state.turns = 8;
          state.strands = 14;
          state.wireAwg = 28;
          state.connection = 'wye';
          state.magnetGrade = 'N52';
          state.airgapMm = 0.50;
        } else if (presetType === 'speed-runner') {
          state.poles = 30;
          state.turns = 5;
          state.strands = 22;
          state.wireAwg = 28;
          state.connection = 'delta';
          state.magnetGrade = 'N48';
          state.airgapMm = 0.80;
        } else if (presetType === 'single-strand-fat') {
          state.poles = 30;
          state.turns = 6;
          state.strands = 1;
          state.wireAwg = 18;
          state.connection = 'wye';
          state.magnetGrade = 'N48';
          state.airgapMm = 0.70;
        }
        
        if (turnsInput) turnsInput.value = state.turns;
        if (strandsInput) strandsInput.value = state.strands;
        if (awgSelect) awgSelect.value = state.wireAwg;
        if (airgapInput) airgapInput.value = state.airgapMm;
        if (magnetGradeSelect) magnetGradeSelect.value = state.magnetGrade;
        connBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-conn') === state.connection));

        recalculateAll();
      });
    });
  }

  // --- Document Initialization ---
  function initApp() {
    try {
      setupEventListeners();
    } catch (e) {
      console.error('Error setting up event listeners:', e);
    }

    try {
      init3DScene();
    } catch (e) {
      console.error('Error initializing 3D scene:', e);
      const loadingEl = document.getElementById('viewportLoading');
      if (loadingEl) loadingEl.style.display = 'none';
    }

    try {
      recalculateAll();
    } catch (e) {
      console.error('Error in recalculateAll:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
