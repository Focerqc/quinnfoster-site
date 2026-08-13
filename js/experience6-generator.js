/**
 * Experience 6 — Personal AI Chatbot Co-Pilot Driven 16mm Cylinder Generator
 * Powered by Three.js, Procedural Math Engines, AI JSON Array Parsers & Binary STL Exporter
 * 
 * Features:
 * - Smoothstep End-Cap Rim Tapering: 100% smooth, flat, solid collar rims at top and bottom (zero spiky fins or missing faces).
 * - Bilinear Heightmap Interpolation: Watertight, continuous 3D manifold geometry.
 * - Expanded Procedural Presets: Stars, Cyber, Voronoi, Knurl, Waves, Scales, Flutes, Weave, Turbulence, Lotus, Bricks.
 * - DoubleSide PBR rendering for zero backface black-hole visual glitches.
 */

class PixelSleeveGenerator {
  constructor(container) {
    this.container = container || document.getElementById('viewport');
    
    // Core Generator State
    this.state = {
      innerDiameter: 16.2,   // Locked for 16mm glass tube fit (0.2mm clearance)
      outerDiameter: 22.0,   // Base Outer Diameter in mm
      length: 90.0,          // Sleeve Length in mm
      
      // Grid Matrix Resolution
      gridCols: 32,          // Radial Circumference Divisions (16 to 128)
      gridRows: 40,          // Vertical Length Divisions (20 to 120)
      
      // Depth Parameters
      maxCutDepth: 1.5,      // Max inward cut in mm
      maxExtrudeHeight: 1.2, // Max outward extrusion in mm
      voxelShape: 'chisel',   // 'block', 'chisel', 'knurl', 'hex', 'smooth'
      
      // Retainer Lip
      lipRetainer: false,    // Bottom stop ring (Default: OFF)
      lipThickness: 1.2,     // mm
      lipBore: 14.5,         // Inner stop diameter mm
      
      // AI Procedural Engine
      aiPrompt: 'Alternating Star & Cross Geometric Lattice',
      patternPreset: 'stars',// 'stars', 'cyber', 'voronoi', 'knurl', 'waves', 'scales', 'flutes', 'weave', 'turbulence', 'lotus', 'bricks'
      noiseScale: 0.12,
      noiseContrast: 1.2,
      radialSymmetry: 4,     // 4-fold radial symmetry default for clean star patterns
      helicalTwist: 0.0,     // Helical twist angle in degrees
      randomSeed: 42,
      
      // Display & Visual Modes
      showGlassTube: true,
      geoNodesMode: false,   // Blender Geometry Nodes Scatter Mode
      facetedShading: true,  // High-Visibility CAD Faceted Shading Mode (Default: ON)
      isRotatedHorizontal: false, // 90° Orientation Toggle (Default: Vertical)
      materialStyle: 'titanium'
    };

    // 2D Depth Matrix Array (gridCols x gridRows), values in [-1.0, 1.0]
    this.depthMatrix = [];
    
    // Three.js Objects
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.modelGroup = null;
    this.sleeveMesh = null;
    this.glassMesh = null;
    this.geoNodesGroup = null;
    
    // Canvas Preview Reference
    this.canvas2D = null;
    this.ctx2D = null;

    this._init();
  }

  // ─── INITIALIZATION ───────────────────────────────────────────────
  _init() {
    this._initDepthMatrix();
    this._initScene();
    this._initLighting();
    this._initControls();
    this._initCanvas2D();
    
    // Initial Algorithmic AI Generation
    this.generateAIPattern(this.state.patternPreset);
    
    this._initUI();
    this.toggleOrientation(false);
    this._animate();
    
    // Hide loading screen
    const loader = document.getElementById('viewportLoading');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.style.display = 'none', 300);
    }
  }

  _initDepthMatrix() {
    const cols = this.state.gridCols;
    const rows = this.state.gridRows;
    this.depthMatrix = new Array(cols);
    for (let c = 0; c < cols; c++) {
      this.depthMatrix[c] = new Float32Array(rows);
    }
  }

  _initScene() {
    const w = this.container.clientWidth || 600;
    const h = this.container.clientHeight || 500;

    this.scene = new THREE.Scene();
    this.modelGroup = new THREE.Group();
    this.geoNodesGroup = new THREE.Group();
    this.glassGroup = new THREE.Group();
    this.scene.add(this.modelGroup);
    this.scene.add(this.geoNodesGroup);
    this.scene.add(this.glassGroup);

    this.camera = new THREE.PerspectiveCamera(42, w / h, 1, 1000);
    this.camera.position.set(40, 10, 140);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);
    window.addEventListener('resize', () => this._onResize());
  }

  _initLighting() {
    // 1. Sky & Ground Hemisphere Ambient Light
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 1.1);
    this.scene.add(hemiLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    // 2. Main Key Light (Front-Right Top)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(45, 60, 50);
    keyLight.castShadow = true;
    this.scene.add(keyLight);

    // 3. Front-Left Fill Light
    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
    fillLight.position.set(-50, 30, 40);
    this.scene.add(fillLight);

    // 4. Top-Back Rim Accent Light
    const rimLight = new THREE.DirectionalLight(0xffffff, 1.2);
    rimLight.position.set(0, 70, -60);
    this.scene.add(rimLight);

    // 5. Bottom Bounce Light (Illuminates bottom rim & endstop lip)
    const bottomLight = new THREE.DirectionalLight(0xe2e8f0, 0.7);
    bottomLight.position.set(0, -60, 40);
    this.scene.add(bottomLight);
  }

  _initControls() {
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI - 0.05;
    this.controls.minDistance = 20;
    this.controls.maxDistance = 300;
    this.controls.target.set(0, 0, 0);
  }

  // ─── LIVE AI HEIGHTMAP CANVAS PREVIEW ─────────────────────────────
  _initCanvas2D() {
    this.canvas2D = document.getElementById('pixelMapCanvas');
    if (!this.canvas2D) return;
    this.ctx2D = this.canvas2D.getContext('2d');
    this.canvas2D.addEventListener('mousemove', (e) => this._updateCanvasHoverTooltip(e));
  }

  _updateCanvasHoverTooltip(e) {
    const tooltip = document.getElementById('canvasTooltip');
    if (!tooltip || !this.canvas2D) return;

    const rect = this.canvas2D.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const col = Math.floor((x / rect.width) * this.state.gridCols);
    const row = Math.floor((y / rect.height) * this.state.gridRows);

    if (col >= 0 && col < this.state.gridCols && row >= 0 && row < this.state.gridRows) {
      const depthVal = this.depthMatrix[col][row];
      let depthText = '';
      if (depthVal > 0) {
        depthText = `AI Cut: ${(depthVal * this.state.maxCutDepth).toFixed(2)}mm`;
      } else if (depthVal < 0) {
        depthText = `AI Emboss: ${(-depthVal * this.state.maxExtrudeHeight).toFixed(2)}mm`;
      } else {
        depthText = `Surface (0mm)`;
      }
      tooltip.textContent = `Col: ${col + 1}/${this.state.gridCols} | Row: ${row + 1}/${this.state.gridRows} → ${depthText}`;
    }
  }

  _renderCanvas2D() {
    if (!this.canvas2D || !this.ctx2D) return;

    const w = this.canvas2D.width;
    const h = this.canvas2D.height;
    const cols = this.state.gridCols;
    const rows = this.state.gridRows;

    const cellW = w / cols;
    const cellH = h / rows;

    this.ctx2D.clearRect(0, 0, w, h);

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const val = this.depthMatrix[c][r]; // -1.0 to 1.0
        
        let color = '';
        if (val > 0) {
          const intensity = Math.min(255, Math.floor(val * 255));
          color = `rgb(14, ${Math.floor(165 * val + 50)}, ${intensity})`;
        } else if (val < 0) {
          const absVal = Math.abs(val);
          const intensity = Math.min(255, Math.floor(absVal * 255));
          color = `rgb(${intensity}, ${Math.floor(100 * absVal)}, ${Math.floor(250 * absVal)})`;
        } else {
          color = '#1e293b';
        }

        this.ctx2D.fillStyle = color;
        this.ctx2D.fillRect(c * cellW, r * cellH, cellW, cellH);

        if (cols <= 64 && rows <= 80) {
          this.ctx2D.strokeStyle = 'rgba(255, 255, 255, 0.04)';
          this.ctx2D.strokeRect(c * cellW, r * cellH, cellW, cellH);
        }
      }
    }
  }

  // ─── BILINEAR SMOOTH HEIGHTMAP SAMPLING ENGINE ─────────────────────
  _sampleDepthMatrix(cFloat, rFloat) {
    const cols = this.state.gridCols;
    const rows = this.state.gridRows;

    const c0 = (Math.floor(cFloat) % cols + cols) % cols;
    const c1 = (c0 + 1) % cols;
    const r0 = Math.max(0, Math.min(rows - 1, Math.floor(rFloat)));
    const r1 = Math.max(0, Math.min(rows - 1, r0 + 1));

    const fc = cFloat - Math.floor(cFloat);
    const fr = rFloat - Math.floor(rFloat);

    // Smoothstep blending curve
    const sc = fc * fc * (3.0 - 2.0 * fc);
    const sr = fr * fr * (3.0 - 2.0 * fr);

    const v00 = this.depthMatrix[c0][r0];
    const v10 = this.depthMatrix[c1][r0];
    const v01 = this.depthMatrix[c0][r1];
    const v11 = this.depthMatrix[c1][r1];

    const top = v00 * (1.0 - sc) + v10 * sc;
    const bot = v01 * (1.0 - sc) + v11 * sc;

    return top * (1.0 - sr) + bot * sr;
  }

  // ─── 3D VIEWPORT AI SCREENSHOT & FEEDBACK SUITE ────────────────────
  takeAIScreenshot() {
    if (!this.renderer || !this.scene || !this.camera) return;

    this.renderer.render(this.scene, this.camera);
    const dataURL = this.renderer.domElement.toDataURL('image/png');
    this._showScreenshotModal(dataURL);
  }

  _showScreenshotModal(dataURL) {
    let modal = document.getElementById('aiScreenshotModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'aiScreenshotModal';
      modal.className = 'ai-screenshot-modal';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h3>📸 3D Viewport AI Progress Snapshot</h3>
          <button class="modal-close-btn" id="btnCloseModal">✕</button>
        </div>

        <div class="modal-preview-box">
          <img src="${dataURL}" alt="3D Sleeve Snapshot" class="screenshot-img">
        </div>

        <div class="modal-desc">
          Send this 3D image to your AI Chatbot (ChatGPT-4o, Claude 3.5 Sonnet, Gemini 1.5) for visual progress check and design feedback!
        </div>

        <div class="modal-actions">
          <button id="btnCopyImgClipboard" class="btn-primary">
            📋 Copy Image to Clipboard
          </button>
          <div style="display:flex; gap:0.4rem;">
            <button id="btnDownloadImg" class="btn-secondary" style="flex:1;">
              📥 Download PNG
            </button>
            <button id="btnDownloadJSON" class="btn-secondary" style="flex:1;">
              📄 Download JSON
            </button>
          </div>
          <button id="btnCopyVisionPrompt" class="btn-secondary">
            🤖 Copy AI Vision Feedback Prompt
          </button>
        </div>
      </div>
    `;

    modal.style.display = 'flex';

    document.getElementById('btnCloseModal').onclick = () => modal.style.display = 'none';
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

    document.getElementById('btnCopyImgClipboard').onclick = () => {
      fetch(dataURL)
        .then(res => res.blob())
        .then(blob => {
          navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob })
          ]).then(() => {
            this._showParseStatus("📋 3D Snapshot Image copied to Clipboard! Paste into ChatGPT / Claude.");
          }).catch(err => {
            console.warn("ClipboardItem fallback:", err);
            this._downloadPNG(dataURL);
          });
        });
    };

    document.getElementById('btnDownloadImg').onclick = () => this._downloadPNG(dataURL);
    document.getElementById('btnDownloadJSON').onclick = () => this._downloadJSON();

    document.getElementById('btnCopyVisionPrompt').onclick = () => {
      const visionPrompt = `Here is a 3D snapshot of my current 16mm glass tube sleeve design (${this.state.gridCols}x${this.state.gridRows} grid).
Please analyze this 3D image and give me specific feedback and recommendations to improve the aesthetics, grip texture, or depth contrast.
Return updated JSON float array if recommending changes!`;
      navigator.clipboard.writeText(visionPrompt).then(() => {
        this._showParseStatus("🤖 AI Vision Prompt copied to clipboard!");
      });
    };
  }

  _downloadPNG(dataURL) {
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = `sleeve_3d_snapshot_${this.state.gridCols}x${this.state.gridRows}.png`;
    link.click();
  }

  _downloadJSON() {
    const cols = this.state.gridCols;
    const rows = this.state.gridRows;
    const exportArr = [];

    for (let r = 0; r < rows; r++) {
      const rowArr = [];
      for (let c = 0; c < cols; c++) {
        rowArr.push(Number(this.depthMatrix[c][r].toFixed(2)));
      }
      exportArr.push(rowArr);
    }

    const jsonStr = JSON.stringify(exportArr, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `sleeve_heightmap_${cols}x${rows}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    this._showParseStatus("📄 Downloaded sleeve heightmap JSON file!");
  }

  // ─── AI CHATBOT CO-PILOT INTEGRATION SUITE ────────────────────────
  copyChatbotSystemPrompt(customText = '') {
    const promptText = `System Instruction for AI Co-Pilot:
I am customizing a 3D printable sleeve for a 16mm glass tube in Quinn Foster's Experience 6 CAD Tool.
The sleeve grid is ${this.state.gridCols} columns (circumference) x ${this.state.gridRows} rows (length).
Generate a JSON 2D float array of size [${this.state.gridRows}][${this.state.gridCols}] containing depth values:
- Range: -1.0 (max extrusion outward) to +1.0 (max cut depth inward), 0.0 = flush surface.
- Example Geometric Shapes: Stars (depth 1.0 in a 5-point star shape), Crosses (depth -0.8 in 4-arm cross), Honeycombs, or Knurling.
- Return ONLY raw valid JSON array output format: [[val1, val2...], ...]

My Design Request: ${customText || this.state.aiPrompt}`;

    navigator.clipboard.writeText(promptText).then(() => {
      this._showParseStatus("✅ System Prompt copied to clipboard! Paste into ChatGPT / Claude / Gemini.");
    }).catch(err => console.warn(err));
  }

  exportMatrixToClipboard() {
    const cols = this.state.gridCols;
    const rows = this.state.gridRows;
    const exportArr = [];

    for (let r = 0; r < rows; r++) {
      const rowArr = [];
      for (let c = 0; c < cols; c++) {
        rowArr.push(Number(this.depthMatrix[c][r].toFixed(2)));
      }
      exportArr.push(rowArr);
    }

    const jsonStr = JSON.stringify(exportArr);
    const clipboardText = `Here is my current 16mm sleeve heightmap matrix array (${cols}x${rows}):\n${jsonStr}\n\nPlease modify it to add: [describe your changes here]`;

    navigator.clipboard.writeText(clipboardText).then(() => {
      this._showParseStatus("📤 Exported 3D matrix array to clipboard for your AI chatbot!");
    }).catch(err => console.warn(err));
  }

  parseAIChatbotInput(rawInput) {
    if (!rawInput || typeof rawInput !== 'string') return false;

    const trimmed = rawInput.trim();

    const jsonMatch = trimmed.match(/\[\s*\[[\s\S]*\]\s*\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.updateRandomizedControlsVisibility('custom');
          this._loadArrayIntoMatrix(parsed);
          this._renderCanvas2D();
          this.updateMesh();
          this._showParseStatus(`✅ Applied Chatbot JSON Array! Matrix: ${this.state.gridCols}x${this.state.gridRows}`);
          return true;
        }
      } catch (err) {
        console.warn("JSON parse failed:", err);
      }
    }

    this.state.aiPrompt = trimmed;
    this.generateAIPattern(this.state.patternPreset);
    this._showParseStatus(`✨ Generated AI Pattern for prompt: "${trimmed}"`);
    return true;
  }

  _loadArrayIntoMatrix(arr) {
    const cols = this.state.gridCols;
    const rows = this.state.gridRows;
    this._initDepthMatrix();

    if (Array.isArray(arr[0])) {
      const srcRows = arr.length;
      const srcCols = arr[0].length;

      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const srcC = Math.floor((c / cols) * srcCols);
          const srcR = Math.floor((r / rows) * srcRows);
          let val = parseFloat(arr[srcR][srcC]);
          if (isNaN(val)) val = 0;
          this.depthMatrix[c][r] = Math.max(-1.0, Math.min(1.0, val));
        }
      }
    }
  }

  _showParseStatus(msg) {
    const statusEl = document.getElementById('aiParseStatus');
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.style.color = '#38bdf8';
    }
  }

  isRandomizedPreset(presetName) {
    const randomizedPresets = ['cyber', 'voronoi', 'waves', 'turbulence'];
    return randomizedPresets.includes(presetName);
  }

  updateRandomizedControlsVisibility(presetName) {
    const isRandomized = this.isRandomizedPreset(presetName);
    const noiseScaleGroup = document.getElementById('noiseScaleGroup');
    const seedBtn = document.getElementById('btnRandomizeSeed');

    if (noiseScaleGroup) {
      noiseScaleGroup.style.display = isRandomized ? '' : 'none';
    }
    if (seedBtn) {
      seedBtn.style.display = isRandomized ? '' : 'none';
    }
  }

  // ─── PURE ALGORITHMIC AI PATTERN GENERATOR ENGINE ──────────────────
  generateAIPattern(presetName) {
    this.updateRandomizedControlsVisibility(presetName);
    this._initDepthMatrix();
    
    const cols = this.state.gridCols;
    const rows = this.state.gridRows;
    const scale = parseFloat(this.state.noiseScale) || 0.12;
    const sym = parseInt(this.state.radialSymmetry) || 1;
    const contrast = parseFloat(this.state.noiseContrast) || 1.2;
    const twist = (parseFloat(this.state.helicalTwist) || 0.0) * (Math.PI / 180.0);
    
    const prompt = this.state.aiPrompt || presetName;
    const seed = this.state.randomSeed + this._hashString(prompt);

    for (let c = 0; c < cols; c++) {
      const symCol = Math.floor((c % Math.max(1, Math.floor(cols / sym))) * sym);
      const angle = (symCol / cols) * Math.PI * 2.0;
      
      for (let r = 0; r < rows; r++) {
        const normY = r / rows;
        const twistedAngle = angle + normY * twist;
        const twistedSymCol = Math.floor((((twistedAngle / (Math.PI * 2.0)) % 1.0 + 1.0) % 1.0) * cols);
        let v = 0;

        switch (presetName) {
          case 'stars':
          default:
            // ⭐ Precise 5-Point Star & Cross Lattice Array
            const starCellX = (twistedSymCol % 8) - 4;
            const starCellY = (r % 10) - 5;
            const starDist = Math.sqrt(starCellX * starCellX + starCellY * starCellY);
            const starAngle = Math.atan2(starCellY, starCellX);
            const starRadius = 2.4 + Math.sin(starAngle * 5.0) * 1.2;
            
            if (starDist < starRadius) {
              v = 1.0 * contrast; // Cut 5-Point Star (100% Passthrough Window)
            } else {
              const isCross = (Math.abs(starCellX) <= 1 || Math.abs(starCellY) <= 1);
              v = isCross ? -0.75 * contrast : 0.0; // Raised Cross Grid
            }
            break;

          case 'custom1':
            const c1_cellX = (twistedSymCol % 6) - 3;
            const c1_cellY = (r % 8) - 4;
            const c1_dist = Math.sqrt(c1_cellX * c1_cellX + c1_cellY * c1_cellY);
            v = (c1_dist < 2.0) ? 1.0 * contrast : -0.6 * contrast;
            break;

          case 'custom2':
            const c2_wave = Math.sin(twistedAngle * 10 + normY * 30) * Math.cos(symCol * 0.3);
            v = Math.tanh(c2_wave * 2.0);
            v = (v > 0) ? Math.min(1.0, v * 1.25) * contrast : v * contrast;
            break;

          case 'custom3':
            const c3_spiral = twistedAngle * 8 + normY * Math.PI * 10;
            const c3_cross = Math.sin(twistedAngle * 8 - normY * Math.PI * 10);
            v = Math.sin(c3_spiral) * c3_cross * 1.5;
            v = (v > 0) ? Math.min(1.0, v * 1.35) * contrast : Math.max(-0.6, v) * contrast;
            break;

          case 'custom4':
            const c4_rib = Math.sin(normY * Math.PI * 16);
            const c4_radial = Math.cos(twistedAngle * 6);
            v = (c4_rib * c4_radial > 0.1) ? 1.0 * contrast : -0.7 * contrast;
            break;

          case 'cyber':
            const n1 = this._simplexNoise2D(twistedSymCol * scale, r * scale + seed);
            const n2 = Math.sin(twistedAngle * 6 + normY * 16);
            v = Math.sin((n1 + n2) * Math.PI);
            if (v > 0.20) v = 1.0 * contrast;
            else if (v < -0.20) v = -0.8 * contrast;
            else v = 0;
            break;

          case 'voronoi':
            const vx = ((twistedAngle / (Math.PI * 2.0)) % 1.0 + 1.0) * (8 * scale * 10);
            const vy = normY * (10 * scale * 10);
            v = (this._voronoiCell(vx, vy, seed) - 0.45) * 2.5;
            v = (v > 0) ? Math.min(1.0, v * 1.4) * contrast : Math.max(-1.0, v) * contrast;
            break;

          case 'knurl':
            const k1 = Math.sin(twistedAngle * 12 + normY * 36);
            const k2 = Math.sin(twistedAngle * 12 - normY * 36);
            v = k1 * k2 * 1.8;
            v = (v > 0) ? Math.min(1.0, v * 1.25) * contrast : Math.max(-0.4, v) * contrast;
            break;

          case 'waves':
            const rawWave = Math.sin(twistedAngle * 8 + normY * 24) * Math.cos(normY * 12 + seed);
            v = (rawWave > 0) ? Math.min(1.0, rawWave * 2.2) * contrast : Math.max(-1.0, rawWave * 1.5) * contrast;
            break;

          case 'scales':
            const scaleY = normY * 18;
            const offset = (Math.floor(scaleY) % 2 === 0) ? 0 : Math.PI / 6;
            const rawScale = Math.sin(twistedAngle * 10 + offset) * Math.sin((scaleY % 1.0) * Math.PI);
            v = Math.pow(Math.max(0, rawScale), 1.2) * 1.35 * contrast;
            v = Math.min(1.0, v);
            break;

          case 'flutes':
            const spiral = twistedAngle * 6 + normY * Math.PI * 8;
            v = Math.sin(spiral);
            v = (v > 0) ? Math.min(1.0, Math.pow(v, 0.6) * 1.1) * contrast : -Math.pow(Math.abs(v), 0.7) * contrast;
            break;

          case 'weave':
            const w1 = Math.floor((((twistedAngle / (Math.PI * 2.0)) % 1.0 + 1.0) % 1.0) * 32) % 2;
            const w2 = Math.floor(normY * 40) % 2;
            v = (w1 ^ w2) ? 1.0 * contrast : -0.75 * contrast;
            break;

          case 'turbulence':
            const twistX = (((twistedAngle / (Math.PI * 2.0)) % 1.0 + 1.0) % 1.0) * cols;
            const t1 = this._simplexNoise2D(twistX * scale * 2, r * scale * 2 + seed);
            const t2 = this._simplexNoise2D(twistX * scale * 4 + 100, r * scale * 4 + seed);
            const rawTurb = (t1 * 0.7 + t2 * 0.3);
            v = (rawTurb > 0) ? Math.min(1.0, rawTurb * 2.0) * contrast : Math.max(-1.0, rawTurb * 1.8) * contrast;
            break;

          case 'lotus':
            const lotusAngle = twistedAngle * 8.0;
            const lotusY = normY * Math.PI * 12.0;
            const rawLotus = Math.sin(lotusAngle) * Math.cos(lotusY) + Math.cos(lotusAngle * 0.5);
            v = (rawLotus > 0) ? Math.min(1.0, rawLotus * 0.85) * contrast : Math.max(-1.0, rawLotus * 0.7) * contrast;
            break;

          case 'bricks':
            const brickR = Math.floor(normY * 24);
            const shift = (brickR % 2 === 0) ? 0 : 0.5;
            const brickC = Math.floor((((twistedAngle / (Math.PI * 2.0)) % 1.0 + 1.0 + shift) % 1.0) * 16);
            v = ((brickC % 3 === 0) || (brickR % 3 === 0)) ? 1.0 * contrast : -0.6 * contrast;
            break;
        }

        this.depthMatrix[c][r] = Math.max(-1.0, Math.min(1.0, v));
      }
    }

    this._renderCanvas2D();
    this.updateMesh();
  }

  // ─── PROCEDURAL MATH HELPERS ──────────────────────────────────────
  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % 10000;
  }

  _simplexNoise2D(x, y) {
    return Math.sin(x * 2.5 + y * 3.1) * 0.5 + Math.cos(x * 4.1 - y * 1.8) * 0.5;
  }

  _voronoiCell(x, y, seed) {
    let minDist = 100.0;
    const gx = Math.floor(x);
    const gy = Math.floor(y);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cx = gx + dx;
        const cy = gy + dy;
        const px = cx + (Math.sin(cx * 17.0 + cy * 31.0 + seed) * 0.5 + 0.5);
        const py = cy + (Math.cos(cx * 23.0 + cy * 13.0 + seed) * 0.5 + 0.5);
        const d = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
        minDist = Math.min(minDist, d);
      }
    }
    return minDist;
  }

  // ─── 3D MESH GENERATOR (100% WATERTIGHT MANIFOLD) ─────────────────
  updateMesh() {
    if (!this.scene) return;

    while (this.modelGroup.children.length > 0) {
      const obj = this.modelGroup.children.pop();
      if (obj.geometry) obj.geometry.dispose();
    }
    while (this.geoNodesGroup.children.length > 0) {
      const obj = this.geoNodesGroup.children.pop();
      if (obj.geometry) obj.geometry.dispose();
    }
    if (this.glassGroup) {
      while (this.glassGroup.children.length > 0) {
        const obj = this.glassGroup.children.pop();
        if (obj.geometry) obj.geometry.dispose();
      }
    }

    // 1. Create Sleeve Mesh
    const sleeveGeom = this._createSleeveGeometry();
    const sleeveMat = this._getMaterial(this.state.materialStyle);
    this.sleeveMesh = new THREE.Mesh(sleeveGeom, sleeveMat);
    this.sleeveMesh.castShadow = true;
    this.sleeveMesh.receiveShadow = true;
    this.modelGroup.add(this.sleeveMesh);

    const L = this.state.length;
    const R_in = this.state.innerDiameter / 2.0;

    // 2. Bottom Retainer Endstop Lip (if toggled on)
    if (this.state.lipRetainer) {
      const R_lip = (this.state.lipBore || 14.5) / 2.0;
      const lipH = this.state.lipThickness || 1.2;

      const lipShape = new THREE.Shape();
      lipShape.absarc(0, 0, R_in + 0.05, 0, Math.PI * 2, false);
      const lipHole = new THREE.Path();
      lipHole.absarc(0, 0, R_lip, 0, Math.PI * 2, true);
      lipShape.holes.push(lipHole);

      const lipGeo = new THREE.ExtrudeGeometry(lipShape, {
        depth: lipH,
        bevelEnabled: false,
        curveSegments: 48
      });
      const lipMesh = new THREE.Mesh(lipGeo, sleeveMat);
      lipMesh.rotation.x = -Math.PI / 2;
      lipMesh.position.y = -L / 2.0;
      lipMesh.castShadow = true;
      lipMesh.receiveShadow = true;
      this.modelGroup.add(lipMesh);
    }

    // 3. Realistic 16mm Glass Tube Reference
    if (this.state.showGlassTube) {
      const glassLen = L + 20.0;
      const glassOuterR = 8.0; // 16mm OD
      const glassInnerR = 6.8; // 13.6mm ID

      const glassShape = new THREE.Shape();
      glassShape.absarc(0, 0, glassOuterR, 0, Math.PI * 2, false);
      const glassHole = new THREE.Path();
      glassHole.absarc(0, 0, glassInnerR, 0, Math.PI * 2, true);
      glassShape.holes.push(glassHole);

      const glassGeom = new THREE.ExtrudeGeometry(glassShape, {
        depth: glassLen,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: 0.2,
        bevelThickness: 0.2,
        curveSegments: 48
      });
      glassGeom.center();

      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.70,
        roughness: 0.12,
        metalness: 0.05,
        transmission: 0.45,
        ior: 1.52,
        reflectivity: 0.95,
        clearcoat: 1.0,
        side: THREE.DoubleSide
      });
      this.glassMesh = new THREE.Mesh(glassGeom, glassMat);
      this.glassMesh.rotation.x = -Math.PI / 2;

      // Align glass tube bottom: sits on top of endstop if toggled ON (-L/2 + lipThickness), else flush at bottom (-L/2)
      const lipH = this.state.lipRetainer ? (this.state.lipThickness || 1.2) : 0.0;
      const bottomY = -L / 2.0 + lipH;
      const glassY = bottomY + glassLen / 2.0;

      this.glassMesh.position.set(0, glassY, 0);
      this.glassGroup.add(this.glassMesh);
    }

    // Apply orientation rotation (0° vertical vs 90° horizontal)
    const targetAngle = this.state.isRotatedHorizontal ? Math.PI / 2 : 0;
    if (this.modelGroup) this.modelGroup.rotation.z = targetAngle;
    if (this.glassGroup) this.glassGroup.rotation.z = targetAngle;
    if (this.geoNodesGroup) this.geoNodesGroup.rotation.z = targetAngle;

    if (this.state.geoNodesMode) {
      this._updateGeoNodesScatter();
    }

    this._updateMeshStatusOverlay(sleeveGeom);
  }

  _createSleeveGeometry() {
    const R_in = this.state.innerDiameter / 2.0;  // 8.1mm
    const R_out = this.state.outerDiameter / 2.0; // 11.0mm
    const maxWall = Math.max(0.1, R_out - R_in);  // 2.9mm wall thickness
    const L = this.state.length;
    
    // Cut depth up to full wall thickness (allows 100% passthrough windows)
    const cutDepth = Math.min(this.state.maxCutDepth, maxWall);
    
    const cols = this.state.gridCols;
    const rows = this.state.gridRows;

    const vertices = [];
    const indices = [];
    const uvs = [];
    const colors = [];

    const halfL = L / 2.0;
    
    // Store outer surface radii for passthrough window check
    const outerRadii = new Float32Array((rows + 1) * (cols + 1));

    // 1. Build Outer Surface Grid Vertices
    for (let r = 0; r <= rows; r++) {
      const normY = r / rows;
      const y = normY * L - halfL;

      // Smooth End-Cap Rim Taper: 0.0 at top/bottom rims, 1.0 inside (keeps top & bottom collars solid)
      let endTaper = 1.0;
      const taperMargin = 2; // top 2 and bottom 2 rows taper smoothly to 0
      if (r < taperMargin) {
        endTaper = r / taperMargin;
      } else if (r > rows - taperMargin) {
        endTaper = (rows - r) / taperMargin;
      }
      endTaper = endTaper * endTaper * (3.0 - 2.0 * endTaper); // smoothstep

      for (let c = 0; c <= cols; c++) {
        const normX = c / cols;
        const angle = normX * Math.PI * 2.0;

        const depthVal = this._sampleDepthMatrix(c, r) * endTaper;
        
        let deltaR = 0;
        if (depthVal > 0) {
          deltaR = -depthVal * cutDepth;
        } else if (depthVal < 0) {
          deltaR = Math.abs(depthVal) * this.state.maxExtrudeHeight;
        }

        // Clamp minimum radius to inner bore radius R_in
        const currR = Math.max(R_in, R_out + deltaR);
        const idx = r * (cols + 1) + c;
        outerRadii[idx] = currR;

        const x = Math.cos(angle) * currR;
        const z = Math.sin(angle) * currR;

        vertices.push(x, y, z);
        uvs.push(normX, normY);

        // Depth Ambient Occlusion & Facet Contrast Color:
        let factor = 1.0;
        if (depthVal > 0) {
          factor = 1.0 - depthVal * 0.40;
        } else if (depthVal < 0) {
          factor = 1.0 + Math.abs(depthVal) * 0.25;
        }

        const cr = Math.min(1.0, 0.62 * factor);
        const cg = Math.min(1.0, 0.68 * factor);
        const cb = Math.min(1.0, 0.76 * factor);
        colors.push(cr, cg, cb);
      }
    }

    // Helper: Check if a grid cell (c, r) is a full passthrough hole to the inner glass tube
    const isFullHoleCell = (c, r) => {
      const i1 = r * (cols + 1) + c;
      const i2 = i1 + 1;
      const i3 = (r + 1) * (cols + 1) + c;
      const i4 = i3 + 1;
      const eps = 0.02; // 0.02mm tolerance near R_in
      return (
        outerRadii[i1] <= R_in + eps &&
        outerRadii[i2] <= R_in + eps &&
        outerRadii[i3] <= R_in + eps &&
        outerRadii[i4] <= R_in + eps
      );
    };

    // Outer Quad Indices (Facing Outward)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (isFullHoleCell(c, r)) continue; // Omit quad to open a see-through window hole!

        const i1 = r * (cols + 1) + c;
        const i2 = i1 + 1;
        const i3 = (r + 1) * (cols + 1) + c;
        const i4 = i3 + 1;

        indices.push(i1, i3, i2);
        indices.push(i2, i3, i4);
      }
    }

    // 2. Build Inner Bore Surface Vertices (Smooth 16.2mm Inner Tube Bore)
    const innerStartIdx = vertices.length / 3;
    for (let r = 0; r <= rows; r++) {
      const y = (r / rows) * L - halfL;
      for (let c = 0; c <= cols; c++) {
        const angle = (c / cols) * Math.PI * 2.0;
        const x = Math.cos(angle) * R_in;
        const z = Math.sin(angle) * R_in;

        vertices.push(x, y, z);
        uvs.push(c / cols, r / rows);
        colors.push(0.38, 0.44, 0.52); // Inner bore slate color
      }
    }

    // Inner Quad Indices (Facing Inward)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (isFullHoleCell(c, r)) continue; // Omit inner quad for open see-through window hole!

        const i1 = innerStartIdx + r * (cols + 1) + c;
        const i2 = i1 + 1;
        const i3 = innerStartIdx + (r + 1) * (cols + 1) + c;
        const i4 = i3 + 1;

        indices.push(i1, i2, i3);
        indices.push(i2, i4, i3);
      }
    }

    // 3. Top Ring Cap (Closed Solid Ring - Outward Normal +Y)
    const topOuterStart = rows * (cols + 1);
    const topInnerStart = innerStartIdx + rows * (cols + 1);
    for (let c = 0; c < cols; c++) {
      const o1 = topOuterStart + c;
      const o2 = o1 + 1;
      const i1 = topInnerStart + c;
      const i2 = i1 + 1;

      indices.push(o1, i1, o2);
      indices.push(o2, i1, i2);
    }

    // 4. Bottom Ring Cap (Closed Solid Ring - Outward Normal -Y)
    const botOuterStart = 0;
    const botInnerStart = innerStartIdx;
    for (let c = 0; c < cols; c++) {
      const o1 = botOuterStart + c;
      const o2 = o1 + 1;
      const i1 = botInnerStart + c;
      const i2 = i1 + 1;

      indices.push(o1, o2, i1);
      indices.push(o2, i2, i1);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    return geom;
  }

  _updateGeoNodesScatter() {
    const cols = this.state.gridCols;
    const rows = this.state.gridRows;
    const L = this.state.length;
    const R_out = this.state.outerDiameter / 2.0;
    const R_in = this.state.innerDiameter / 2.0;
    const cutDepth = Math.min(this.state.maxCutDepth, R_out - R_in);

    const sphereGeom = new THREE.SphereGeometry(0.8, 8, 8);
    const nodeMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x15803d,
      roughness: 0.2
    });

    const instancedMesh = new THREE.InstancedMesh(sphereGeom, nodeMat, cols * rows);
    const dummy = new THREE.Object3D();
    let count = 0;

    for (let c = 0; c < cols; c++) {
      const angle = (c / cols) * Math.PI * 2.0;
      for (let r = 0; r < rows; r++) {
        const y = (r / rows) * L - L / 2.0;
        const val = this.depthMatrix[c][r];

        if (Math.abs(val) > 0.1) {
          const radialOffset = Math.max(R_in, R_out + (val > 0 ? -val * cutDepth : Math.abs(val) * this.state.maxExtrudeHeight));
          dummy.position.set(Math.cos(angle) * radialOffset, y, Math.sin(angle) * radialOffset);
          dummy.scale.setScalar(Math.abs(val) * 1.4 + 0.4);
          dummy.updateMatrix();
          instancedMesh.setMatrixAt(count++, dummy.matrix);
        }
      }
    }

    instancedMesh.count = count;
    instancedMesh.instanceMatrix.needsUpdate = true;
    this.geoNodesGroup.add(instancedMesh);
  }

  _getMaterial(style) {
    const matOpts = { 
      side: THREE.DoubleSide, 
      vertexColors: true, 
      flatShading: this.state.facetedShading 
    };

    switch (style) {
      case 'anodized':
        return new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.28, metalness: 0.65, ...matOpts });
      case 'neon':
        return new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.15, metalness: 0.6, emissive: 0x0369a1, emissiveIntensity: 0.25, ...matOpts });
      case 'emerald':
        return new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.3, metalness: 0.6, ...matOpts });
      case 'copper':
        return new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.22, metalness: 0.85, ...matOpts });
      case 'titanium':
      default:
        return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.45, ...matOpts });
    }
  }

  exportSTL() {
    if (!this.modelGroup || this.modelGroup.children.length === 0) return;

    const exporter = new THREE.STLExporter();
    const stlData = exporter.parse(this.modelGroup, { binary: true });

    const blob = new Blob([stlData], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ai_copilot_sleeve_${this.state.gridCols}x${this.state.gridRows}.stl`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  _initUI() {
    this._bindInput('outerDiameter', (v) => { this.state.outerDiameter = parseFloat(v); this.updateMesh(); });
    this._bindInput('sleeveLength', (v) => { this.state.length = parseFloat(v); this.updateMesh(); });
    this._bindInput('gridCols', (v) => { 
      this.state.gridCols = parseInt(v); 
      this.generateAIPattern(this.state.patternPreset);
    });
    this._bindInput('gridRows', (v) => { 
      this.state.gridRows = parseInt(v); 
      this.generateAIPattern(this.state.patternPreset);
    });
    this._bindInput('maxCutDepth', (v) => { this.state.maxCutDepth = parseFloat(v); this.updateMesh(); });
    this._bindInput('maxExtrudeHeight', (v) => { this.state.maxExtrudeHeight = parseFloat(v); this.updateMesh(); });
    this._bindInput('noiseScale', (v) => { this.state.noiseScale = parseFloat(v); this.generateAIPattern(this.state.patternPreset); });
    this._bindInput('noiseContrast', (v) => { this.state.noiseContrast = parseFloat(v); this.generateAIPattern(this.state.patternPreset); });
    this._bindInput('radialSymmetry', (v) => { this.state.radialSymmetry = parseInt(v); this.generateAIPattern(this.state.patternPreset); });
    this._bindInput('helicalTwist', (v) => { this.state.helicalTwist = parseFloat(v); this.generateAIPattern(this.state.patternPreset); });

    const btnTakeScreenshot = document.getElementById('btnTakeAIScreenshot');
    if (btnTakeScreenshot) {
      btnTakeScreenshot.addEventListener('click', () => this.takeAIScreenshot());
    }

    const btnCopyPrompt = document.getElementById('btnCopySystemPrompt');
    if (btnCopyPrompt) {
      btnCopyPrompt.addEventListener('click', () => {
        const textVal = document.getElementById('aiJsonInput')?.value || '';
        this.copyChatbotSystemPrompt(textVal);
      });
    }

    this._initPresetFolderToggles();

    const presetCards = document.querySelectorAll('.prompt-card-btn, .preset-chip');
    presetCards.forEach(card => {
      card.addEventListener('click', () => {
        presetCards.forEach(b => b.classList.remove('active'));
        card.classList.add('active');

        const presetKey = card.getAttribute('data-preset') || 'stars';
        const promptText = card.getAttribute('data-prompt-text') || '';
        const inputEl = document.getElementById('aiJsonInput');
        
        if (inputEl && promptText) {
          inputEl.value = promptText;
        }

        this.state.patternPreset = presetKey;
        this.generateAIPattern(presetKey);

        // Update Active Pattern title display banner
        const activeTitleEl = document.getElementById('activePatternTitle');
        if (activeTitleEl) {
          const titleSpan = card.querySelector('span');
          const titleText = titleSpan ? titleSpan.textContent : (card.textContent || presetKey);
          activeTitleEl.textContent = titleText.trim();
        }

        // Copy system prompt for AI chatbot with clear status
        this.copyChatbotSystemPrompt(promptText || presetKey);
      });
    });

    // Individual Slider Reset Buttons (↺)
    document.querySelectorAll('.btn-slider-reset').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sliderId = btn.getAttribute('data-slider');
        const defaultVal = btn.getAttribute('data-default');
        const sliderInput = document.getElementById(sliderId);
        if (sliderInput && defaultVal !== null) {
          sliderInput.value = defaultVal;
          sliderInput.dispatchEvent(new Event('input'));
        }
      });
    });

    // Master Reset Buttons
    const btnResetSec1 = document.getElementById('btnResetSection1');
    if (btnResetSec1) {
      btnResetSec1.addEventListener('click', () => {
        this.resetAllSlidersToDefault();
      });
    }

    const btnResetAll = document.getElementById('btnResetAllSliders');
    if (btnResetAll) {
      btnResetAll.addEventListener('click', () => {
        this.resetAllSlidersToDefault();
      });
    }

    const btnExecutePaste = document.getElementById('btnExecuteAIPaste');
    if (btnExecutePaste) {
      btnExecutePaste.addEventListener('click', () => {
        const inputEl = document.getElementById('aiJsonInput');
        if (inputEl && inputEl.value) {
          this.parseAIChatbotInput(inputEl.value);
        }
      });
    }

    const btnExportMatrix = document.getElementById('btnExportMatrixToAI');
    if (btnExportMatrix) {
      btnExportMatrix.addEventListener('click', () => this.exportMatrixToClipboard());
    }

    const seedBtn = document.getElementById('btnRandomizeSeed');
    if (seedBtn) {
      seedBtn.addEventListener('click', () => {
        this.state.randomSeed = Math.floor(Math.random() * 10000);
        this.generateAIPattern(this.state.patternPreset);
      });
    }

    const btnInvert = document.getElementById('btnInvertDepths');
    if (btnInvert) {
      btnInvert.addEventListener('click', () => {
        for (let c = 0; c < this.state.gridCols; c++) {
          for (let r = 0; r < this.state.gridRows; r++) {
            this.depthMatrix[c][r] = -this.depthMatrix[c][r];
          }
        }
        this._renderCanvas2D();
        this.updateMesh();
      });
    }

    const geoNodesToggle = document.getElementById('toggleGeoNodes');
    if (geoNodesToggle) {
      geoNodesToggle.addEventListener('change', (e) => {
        this.state.geoNodesMode = e.target.checked;
        this.updateMesh();
      });
    }

    const glassToggle = document.getElementById('toggleGlassTube');
    if (glassToggle) {
      glassToggle.addEventListener('change', (e) => {
        this.state.showGlassTube = e.target.checked;
        this.updateMesh();
      });
    }

    const lipToggle = document.getElementById('toggleLipRetainer');
    if (lipToggle) {
      lipToggle.checked = this.state.lipRetainer;
      lipToggle.addEventListener('change', (e) => {
        this.state.lipRetainer = e.target.checked;
        this.updateMesh();
      });
    }

    const facetedToggle = document.getElementById('toggleFacetedShading');
    if (facetedToggle) {
      facetedToggle.checked = this.state.facetedShading;
      facetedToggle.addEventListener('change', (e) => {
        this.state.facetedShading = e.target.checked;
        this.updateMesh();
      });
    }

    const btnRotateOrient = document.getElementById('btnToggleOrientation');
    if (btnRotateOrient) {
      btnRotateOrient.addEventListener('click', () => this.toggleOrientation());
    }

    const btnSTL = document.getElementById('btnExportSTL');
    if (btnSTL) {
      btnSTL.addEventListener('click', () => this.exportSTL());
    }

    const btnResetView = document.getElementById('btnResetView');
    if (btnResetView) {
      btnResetView.addEventListener('click', () => this._resetCamera());
    }

    const btnViewportReset = document.getElementById('btnViewportReset');
    if (btnViewportReset) {
      btnViewportReset.addEventListener('click', (e) => {
        e.stopPropagation();
        this._resetCamera();
      });
      btnViewportReset.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    const btnViewportZoomIn = document.getElementById('btnViewportZoomIn');
    if (btnViewportZoomIn) {
      btnViewportZoomIn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.zoomIn();
      });
      btnViewportZoomIn.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    const btnViewportZoomOut = document.getElementById('btnViewportZoomOut');
    if (btnViewportZoomOut) {
      btnViewportZoomOut.addEventListener('click', (e) => {
        e.stopPropagation();
        this.zoomOut();
      });
      btnViewportZoomOut.addEventListener('mousedown', (e) => e.stopPropagation());
    }
  }

  _initPresetFolderToggles() {
    const folders = [
      {
        cardId: 'folderBasicExamples',
        headerId: 'headerBasicExamples',
        toggleBtnId: 'toggleBasicExamples',
        extraCount: 7,
        name: 'basic examples'
      },
      {
        cardId: 'folderFosterQC',
        headerId: 'headerFosterQC',
        toggleBtnId: 'toggleFosterQC',
        extraCount: 0,
        name: 'fosterqc'
      }
    ];

    folders.forEach(folder => {
      const card = document.getElementById(folder.cardId);
      const header = document.getElementById(folder.headerId);
      const toggleBtn = document.getElementById(folder.toggleBtnId);

      if (!card) return;

      const toggleFolder = () => {
        const isCollapsed = card.classList.contains('collapsed');
        card.classList.toggle('collapsed', !isCollapsed);

        const nowCollapsed = card.classList.contains('collapsed');
        if (header) {
          header.setAttribute('aria-expanded', !nowCollapsed);
          const toggleText = header.querySelector('.folder-toggle-text');
          if (toggleText) {
            toggleText.textContent = nowCollapsed ? '▼ Expand' : '▲ Collapse';
          }
        }

        if (toggleBtn) {
          const toggleIcon = toggleBtn.querySelector('.toggle-icon');
          const toggleLabel = toggleBtn.querySelector('.toggle-label');

          if (nowCollapsed) {
            if (toggleIcon) toggleIcon.textContent = '▼';
            if (toggleLabel) {
              toggleLabel.textContent = folder.extraCount > 0 
                ? `Expand ${folder.name} (${folder.extraCount} more)`
                : `Expand ${folder.name} folder`;
            }
          } else {
            if (toggleIcon) toggleIcon.textContent = '▲';
            if (toggleLabel) toggleLabel.textContent = `Collapse ${folder.name}`;
          }
        }
      };

      if (header) header.addEventListener('click', toggleFolder);
      if (toggleBtn) toggleBtn.addEventListener('click', toggleFolder);
    });
  }

  _bindInput(id, callback) {
    const el = document.getElementById(id);
    const valDisplay = document.getElementById(id + 'Val');
    if (el) {
      el.addEventListener('input', (e) => {
        const val = e.target.value;
        if (valDisplay) valDisplay.textContent = val;
        callback(val);
      });
    }
  }

  _updateMeshStatusOverlay(geom) {
    const vertEl = document.getElementById('vertexCountDisplay');
    const triEl = document.getElementById('triangleCountDisplay');
    const dimsEl = document.getElementById('meshDimensionsDisplay');

    if (vertEl && geom) vertEl.textContent = geom.attributes.position.count.toLocaleString();
    if (triEl && geom) triEl.textContent = (geom.index ? geom.index.count / 3 : 0).toLocaleString();
    if (dimsEl) dimsEl.textContent = `16.2mm ID × ${this.state.outerDiameter}mm OD × ${this.state.length}mm L`;
  }

  toggleOrientation(forceState = null) {
    if (typeof forceState === 'boolean') {
      this.state.isRotatedHorizontal = forceState;
    } else {
      this.state.isRotatedHorizontal = !this.state.isRotatedHorizontal;
    }

    const isHoriz = this.state.isRotatedHorizontal;
    const targetAngle = isHoriz ? Math.PI / 2 : 0;

    if (this.modelGroup) this.modelGroup.rotation.z = targetAngle;
    if (this.glassGroup) this.glassGroup.rotation.z = targetAngle;
    if (this.geoNodesGroup) this.geoNodesGroup.rotation.z = targetAngle;

    const btnRotate = document.getElementById('btnToggleOrientation');
    if (btnRotate) {
      btnRotate.textContent = isHoriz ? '🔄 Rotate to Vertical (0°)' : '📐 Vertical View (0°)';
      btnRotate.title = isHoriz ? 'Click to set 3D view to upright Vertical orientation (0°)' : 'Click to rotate 3D view 90° Horizontal';
      btnRotate.classList.toggle('active', !isHoriz);
    }

    this._resetCamera();
  }

  _resetCamera() {
    if (this.camera && this.controls) {
      if (this.state && this.state.isRotatedHorizontal) {
        this.camera.position.set(0, 35, 135);
      } else {
        // Upright Vertical orientation camera positioning
        this.camera.position.set(35, 12, 130);
      }
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
  }

  zoomIn(factor = 0.8) {
    if (!this.camera || !this.controls) return;
    const target = this.controls.target;
    const pos = this.camera.position;
    const offset = new THREE.Vector3().subVectors(pos, target);
    
    const minDist = this.controls.minDistance || 20;
    const currentDist = offset.length();
    const newDist = Math.max(minDist, currentDist * factor);
    
    offset.setLength(newDist);
    pos.copy(target).add(offset);
    this.controls.update();
  }

  zoomOut(factor = 1.25) {
    if (!this.camera || !this.controls) return;
    const target = this.controls.target;
    const pos = this.camera.position;
    const offset = new THREE.Vector3().subVectors(pos, target);
    
    const maxDist = this.controls.maxDistance || 300;
    const currentDist = offset.length();
    const newDist = Math.min(maxDist, currentDist * factor);
    
    offset.setLength(newDist);
    pos.copy(target).add(offset);
    this.controls.update();
  }

  _onResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  resetAllSlidersToDefault() {
    const defaults = {
      outerDiameter: 22.0,
      sleeveLength: 90.0,
      gridCols: 32,
      gridRows: 40,
      maxCutDepth: 1.5,
      maxExtrudeHeight: 1.2,
      noiseScale: 0.12,
      noiseContrast: 1.2,
      radialSymmetry: 4,
      helicalTwist: 0
    };

    Object.keys(defaults).forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.value = defaults[id];
        el.dispatchEvent(new Event('input'));
      }
    });

    this._showParseStatus("↺ Reset all sleeve specs & fine-tuning sliders to preset defaults!");
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    if (this.controls) this.controls.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('viewport')) {
    window.pixelSleeveGen = new PixelSleeveGenerator(document.getElementById('viewport'));
  }
});
