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
      innerDiameter: 16.2,   // Sleeve Inner Bore Diameter in mm (Fits 16mm glass tube, default 16.2mm with 0.2mm clearance)
      elephantsFootChamfer: 0.8, // 45° internal entrance relief chamfer in mm (eliminates elephant's foot 1st-layer sticking)
      outerDiameter: 22.0,   // Base Outer Diameter in mm
      length: 80.0,          // Sleeve Length in mm (Default: 80.0mm)
      glassLength: 100.0,    // Glass Tube Length in mm (Default: 100.0mm, range 80-200mm)
      
      // Grid Matrix Resolution
      gridCols: 32,          // Radial Circumference Divisions (16 to 128)
      gridRows: 40,          // Vertical Length Divisions (20 to 120)
      
      // Depth Parameters (Pure Cut-Only & Passthrough Windows)
      maxCutDepth: 2.9,      // Max inward cut in mm (≥2.5mm = True Passthrough Windows)
      maxExtrudeHeight: 0.0, // Cut-only engine (Locked to 0.0 for flush outer diameter)
      voxelShape: 'chisel',   // 'block', 'chisel', 'knurl', 'hex', 'smooth'
      
      // Retainer Lip
      lipRetainer: false,    // Bottom stop ring (Default: OFF)
      lipThickness: 1.2,     // mm
      lipBore: 14.5,         // Inner stop diameter mm
      
      // AI Procedural Engine
      aiPrompt: 'Design a fluid dynamics turbulence pattern with organic flowing waves.',
      patternPreset: 'turbulence',// 'stars', 'cyber', 'voronoi', 'knurl', 'waves', 'scales', 'flutes', 'weave', 'turbulence', 'lotus', 'bricks'
      noiseScale: 0.12,
      noiseContrast: 1.2,
      radialSymmetry: 4,     // 4-fold radial symmetry default for clean star patterns
      helicalTwist: 0.0,     // Helical twist angle in degrees
      randomSeed: 42,
      isDepthInverted: false,// Persisted depth inversion state
      
      // Display & Visual Modes
      showGlassTube: true,
      geoNodesMode: false,   // Blender Geometry Nodes Scatter Mode
      facetedShading: true,  // High-Visibility CAD Faceted Shading Mode (Default: ON)
      isRotatedHorizontal: true, // 90° Orientation Toggle (Default: Horizontal)
      materialStyle: 'titanium',

      // 3D Vector Text & Logo CAD Engine (Experience 4 Integration)
      logoEnabled: false,
      logoGeometry: null,     // THREE.BufferGeometry
      wrapLogo: true,         // Wrap 3D geometry around cylinder curve
      solidBacker: false,     // Solid Backer Plaque (Clears background pattern)
      logoTheta: 0,           // Angle position on cylinder (radians)
      logoY: 0,               // Height position on cylinder (mm from center)
      logoScale: 16.0,        // Logo size in mm
      logoScalePercent: 100,  // Scale percentage
      logoDepth: 1.0,         // Deboss cut depth or Emboss height in mm
      logoAxisRadius: 11.0,   // Distance from cylinder central axis (radius in mm)
      logoRotate: 0,          // Total in-plane rotation (degrees)
      logoMode: 'deboss',     // 'deboss' (cut inward) or 'emboss' (extrude outward)
      logoUseCSG: true,       // Use true Boolean CSG cut
      cleanFloatingIslands: true // Auto-remove disconnected floating islands (D/O counters, stencil debris)
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

    // Vector CAD 3D Mesh Overlays & CSG Engine
    this.logoPreviewMesh = null;
    this.csgPreviewMesh = null;
    this.isCSGPreviewActive = false;
    this.cachedFont = null;
    this.progressTimerInterval = null;
    this.progressStartTime = null;
    
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
    this.toggleOrientation(true); // Default to horizontal view
    this._preloadFont();
    this._animate();
    
    // Hide loading screen
    const loader = document.getElementById('viewportLoading');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.style.display = 'none', 300);
    }
  }

  _preloadFont() {
    if (this.cachedFont) return;
    const loader = new THREE.FontLoader();
    loader.load('fonts/helvetiker_bold.typeface.json', (font) => {
      this.cachedFont = font;
    }, undefined, () => {
      loader.load('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/fonts/helvetiker_bold.typeface.json', (font) => {
        this.cachedFont = font;
      });
    });
  }

  _debouncedUpdateMesh(delayMs = 20) {
    if (this._meshDebounceTimer) clearTimeout(this._meshDebounceTimer);
    this._meshDebounceTimer = setTimeout(() => {
      this.updateMesh();
    }, delayMs);
  }

  _debouncedGenerateAIPattern(delayMs = 25) {
    if (this._patternDebounceTimer) clearTimeout(this._patternDebounceTimer);
    this._patternDebounceTimer = setTimeout(() => {
      this.generateAIPattern(this.state.patternPreset);
    }, delayMs);
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

  takeAIScreenshot() {
    if (!this.renderer || !this.scene || !this.camera) return;

    // 1. Store current camera & renderer states
    const origAspect = this.camera.aspect;
    const origPos = this.camera.position.clone();
    const origTarget = this.controls ? this.controls.target.clone() : new THREE.Vector3(0, 0, 0);
    const contW = this.container.clientWidth || 600;
    const contH = this.container.clientHeight || 500;

    // 2. Configure camera to clean default squared 1:1 view
    const sqSize = 800;
    this.renderer.setSize(sqSize, sqSize, false);
    this.camera.aspect = 1.0;
    this.camera.updateProjectionMatrix();

    if (this.state && this.state.isRotatedHorizontal) {
      this.camera.position.set(0, 28, 142);
    } else {
      this.camera.position.set(32, 0, 142);
    }
    if (this.controls) {
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }

    // 3. Render clean squared screenshot
    this.renderer.render(this.scene, this.camera);
    const dataURL = this.renderer.domElement.toDataURL('image/png');

    // 4. Restore original camera and viewport dimensions
    this.camera.aspect = contW / contH;
    this.camera.position.copy(origPos);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(contW, contH);

    if (this.controls) {
      this.controls.target.copy(origTarget);
      this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);

    // 5. Open snapshot preview modal
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
            // ⭐ Precise 5-Point Star Cutout Windows (1.0) & Solid Cross Lattice (0.0)
            const starCellX = (twistedSymCol % 8) - 4;
            const starCellY = (r % 10) - 5;
            const starDist = Math.sqrt(starCellX * starCellX + starCellY * starCellY);
            const starAngle = Math.atan2(starCellY, starCellX);
            const starRadius = 2.4 + Math.sin(starAngle * 5.0) * 1.2;
            
            if (starDist < starRadius) {
              v = 1.0 * contrast; // ⭐ True Cutout Window straight to glass tube!
            } else {
              const isCross = (Math.abs(starCellX) <= 1 || Math.abs(starCellY) <= 1);
              v = isCross ? 0.0 : 0.35 * contrast; // 0.0 = Solid Outer Wall, 0.35 = Tactile Texture
            }
            break;

          case 'custom1':
            // ✨ Star & Hex Hybrid Cutout Ports
            const c1_cellX = (twistedSymCol % 6) - 3;
            const c1_cellY = (r % 8) - 4;
            const c1_dist = Math.sqrt(c1_cellX * c1_cellX + c1_cellY * c1_cellY);
            v = (c1_dist < 2.0) ? 1.0 * contrast : 0.0;
            break;

          case 'custom2':
            // 🔥 Flame Cyber Ripple Flutes
            const c2_wave = Math.sin(twistedAngle * 10 + normY * 30) * Math.cos(symCol * 0.3);
            v = Math.max(0.0, Math.sin(c2_wave * Math.PI)) * 0.85 * contrast;
            break;

          case 'custom3':
            // 💎 Diamond Spiral Vortex Engraving
            const c3_spiral = twistedAngle * 8 + normY * Math.PI * 10;
            const c3_cross = Math.sin(twistedAngle * 8 - normY * Math.PI * 10);
            v = Math.max(0.0, Math.sin(c3_spiral) * c3_cross) * 0.85 * contrast;
            break;

          case 'custom4':
            // 🎯 Precision Target Ring Window Slots
            const c4_rib = Math.sin(normY * Math.PI * 16);
            const c4_radial = Math.cos(twistedAngle * 6);
            v = (c4_rib * c4_radial > 0.1) ? 1.0 * contrast : 0.0;
            break;

          case 'cyber':
            // ⚡ Cyber Barcode Stream Window Slots
            const n1 = this._simplexNoise2D(twistedSymCol * scale, r * scale + seed);
            const n2 = Math.sin(twistedAngle * 6 + normY * 16);
            const rawCyber = Math.sin((n1 + n2) * Math.PI);
            if (rawCyber > 0.25) v = 1.0 * contrast; // Vertical window slot
            else if (rawCyber > -0.2) v = 0.4 * contrast; // Recessed channel
            else v = 0.0; // Flush outer housing
            break;

          case 'voronoi':
            // 🧬 Biomechanical Voronoi Breathing Windows
            const vx = ((twistedAngle / (Math.PI * 2.0)) % 1.0 + 1.0) * (8 * scale * 10);
            const vy = normY * (10 * scale * 10);
            const vorDist = this._voronoiCell(vx, vy, seed);
            if (vorDist < 0.32) v = 1.0 * contrast; // Breathing window port!
            else if (vorDist < 0.55) v = ((0.55 - vorDist) / 0.23) * 0.65 * contrast;
            else v = 0.0; // Cellular wall
            break;

          case 'knurl':
            // 💎 Diamond Knurl Tactile V-Grooves
            const k1 = Math.sin(twistedAngle * 12 + normY * 36);
            const k2 = Math.sin(twistedAngle * 12 - normY * 36);
            v = Math.max(0.0, k1 * k2) * 0.85 * contrast;
            break;

          case 'waves':
            // 🌊 Japanese Wave Ripples
            const rawWave = Math.sin(twistedAngle * 8 + normY * 24) * Math.cos(normY * 12 + seed);
            v = Math.max(0.0, rawWave) * 0.8 * contrast;
            break;

          case 'scales':
            // 🐉 Dragon Scale Armor Grooves
            const scaleY = normY * 18;
            const offset = (Math.floor(scaleY) % 2 === 0) ? 0 : Math.PI / 6;
            const rawScale = Math.sin(twistedAngle * 10 + offset) * Math.sin((scaleY % 1.0) * Math.PI);
            v = Math.max(0.0, Math.pow(Math.max(0, rawScale), 1.2)) * 0.85 * contrast;
            break;

          case 'flutes':
            // 🌀 Helical Spiral Flutes with Window Ports
            const spiral = twistedAngle * 6 + normY * Math.PI * 8;
            const fluteVal = Math.sin(spiral);
            v = (fluteVal > 0.65) ? 1.0 * contrast : Math.max(0.0, fluteVal) * 0.7 * contrast;
            break;

          case 'weave':
            // 🕸️ Micro-Weave Carbon Checkerboard
            const w1 = Math.floor((((twistedAngle / (Math.PI * 2.0)) % 1.0 + 1.0) % 1.0) * 32) % 2;
            const w2 = Math.floor(normY * 40) % 2;
            v = (w1 ^ w2) ? 0.65 * contrast : 0.0;
            break;

          case 'turbulence':
            // 🌪️ Fluid Turbulence Swirl Windows
            const twistX = (((twistedAngle / (Math.PI * 2.0)) % 1.0 + 1.0) % 1.0) * cols;
            const t1 = this._simplexNoise2D(twistX * scale * 2, r * scale * 2 + seed);
            const t2 = this._simplexNoise2D(twistX * scale * 4 + 100, r * scale * 4 + seed);
            const rawTurb = (t1 * 0.7 + t2 * 0.3);
            v = (rawTurb > 0.35) ? 1.0 * contrast : Math.max(0.0, rawTurb) * 0.75 * contrast;
            break;

          case 'lotus':
            // 🌸 Lotus Petal Ripple Contours
            const lotusAngle = twistedAngle * 8.0;
            const lotusY = normY * Math.PI * 12.0;
            const rawLotus = Math.sin(lotusAngle) * Math.cos(lotusY) + Math.cos(lotusAngle * 0.5);
            v = Math.max(0.0, rawLotus * 0.75) * 0.85 * contrast;
            break;

          case 'bricks':
            // 🧱 Brick Lattice Window Cutouts
            const brickR = Math.floor(normY * 24);
            const shift = (brickR % 2 === 0) ? 0 : 0.5;
            const brickC = Math.floor((((twistedAngle / (Math.PI * 2.0)) % 1.0 + 1.0 + shift) % 1.0) * 16);
            v = ((brickC % 3 === 0) || (brickR % 3 === 0)) ? 1.0 * contrast : 0.0;
            break;
        }

        const finalV = this.state.isDepthInverted ? (1.0 - v) : v;
        this.depthMatrix[c][r] = Math.max(0.0, Math.min(1.0, finalV));
      }
    }

    this._renderCanvas2D();
    this.updateMesh();
  }

  // ─── LOCAL MATRIX RADIUS SAMPLER & SOLID BACKER PLAQUE ──────────
  _getLocalMatrixRadius(centerTheta, centerY, padW, padH) {
    const cols = this.state.gridCols;
    const rows = this.state.gridRows;
    const L = this.state.length;
    const R_out = this.state.outerDiameter / 2.0;
    const R_in = this.state.innerDiameter / 2.0;
    const maxWall = Math.max(0.1, R_out - R_in);
    const cutDepth = Math.min(this.state.maxCutDepth, maxWall);
    const maxExt = Math.max(0, parseFloat(this.state.maxExtrudeHeight) || 0.0);

    const halfL = L / 2.0;
    const normYCenter = (centerY + halfL) / L;
    const normXCenter = ((centerTheta / (Math.PI * 2.0)) % 1.0 + 1.0) % 1.0;

    const spanY = (padH / L) * 0.5;
    const spanX = (padW / (Math.PI * 2.0 * R_out)) * 0.5;

    let maxRad = R_out;
    const samples = 4;

    for (let sy = -samples; sy <= samples; sy++) {
      const ny = Math.min(1.0, Math.max(0.0, normYCenter + (sy / samples) * spanY));
      const r_idx = Math.min(rows, Math.max(0, Math.round(ny * rows)));

      for (let sx = -samples; sx <= samples; sx++) {
        const nx = ((normXCenter + (sx / samples) * spanX) % 1.0 + 1.0) % 1.0;
        const c_idx = Math.min(cols - 1, Math.max(0, Math.round(nx * cols) % cols));

        const val = this._sampleDepthMatrix(c_idx, r_idx);
        let curR = R_out;
        if (val > 0) {
          curR = R_out - val * cutDepth;
        } else if (val < 0) {
          curR = R_out + Math.abs(val) * maxExt;
        }
        if (curR > maxRad) maxRad = curR;
      }
    }
    return maxRad;
  }

  _createSolidBackerPlaqueGeo() {
    if (!this.state.logoGeometry) return null;

    const geo = this.state.logoGeometry.clone();
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    const size = new THREE.Vector3();
    box.getSize(size);

    const targetScale = parseFloat(this.state.logoScale) || 16.0;
    const maxDim = Math.max(size.x, size.y);
    const scaleFactor = maxDim > 0 ? (targetScale / maxDim) : 1.0;

    const textW = (size.x * scaleFactor);
    const textH = (size.y * scaleFactor);

    // Padding around 3D text: 4.0mm horizontal margin, 2.5mm vertical margin
    const padX = 4.0;
    const padY = 2.5;
    const plaqueW = textW + padX * 2;
    const plaqueH = textH + padY * 2;

    const outerR = this.state.outerDiameter / 2.0;
    const innerR = this.state.innerDiameter / 2.0;

    const centerTheta = this.state.logoTheta || 0;
    const centerY = this.state.logoY || 0;

    // Accurately sample procedural matrix under the plaque:
    const localPeakR = this._getLocalMatrixRadius(centerTheta, centerY, plaqueW, plaqueH);

    // Plaque base sits deep in wall (innerR + 0.2) to flood valleys, top sits flush with local peak (+0.10mm)
    const baseR = Math.max(innerR + 0.2, outerR - 1.0);
    const topR = localPeakR + 0.10;
    const plaqueThick = Math.max(0.3, topR - baseR);

    // Create 100% Watertight Manifold Box with edge blend
    const boxGeo = new THREE.BoxGeometry(plaqueW, plaqueH, plaqueThick, 16, 8, 2);
    boxGeo.center();

    // Conformal Cylindrical Wrap with Smooth Edge Blending
    const pos = boxGeo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      // normZ from 0 (baseR) to 1 (topR)
      const normZ = Math.min(1.0, Math.max(0.0, (z + plaqueThick / 2.0) / plaqueThick));
      
      // Smooth edge taper to blend plaque seamlessly into surrounding procedural sleeve:
      const edgeFactorX = Math.cos((x / (plaqueW * 0.5)) * (Math.PI * 0.5));
      const edgeFactorY = Math.cos((y / (plaqueH * 0.5)) * (Math.PI * 0.5));
      const blendFactor = Math.pow(Math.max(0.0, edgeFactorX * edgeFactorY), 0.35);

      // Surface radius blends smoothly towards local matrix height at boundaries
      const rad = baseR + normZ * ((localPeakR - baseR) + 0.10 * blendFactor);
      const theta = x / localPeakR + centerTheta;

      pos.setXYZ(i,
        rad * Math.sin(theta),
        y + centerY,
        rad * Math.cos(theta)
      );
    }

    boxGeo.computeVertexNormals();
    return boxGeo;
  }

  // ─── 3D VECTOR TEXT & CSG CAD ENGINE (EXPERIENCE 4 INTEGRATION) ───
  _initTextStlModal() {
    const modal = document.getElementById('textStlModal');
    const openBtn = document.getElementById('btnOpenTextModal');
    const closeBtn = document.getElementById('closeTextModalBtn');
    const applyBtn = document.getElementById('applyTextBtn');

    if (openBtn && modal) {
      openBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      });
    }

    // Dynamic slider readouts in modal
    const sizeSlider = document.getElementById('textStlSize');
    const sizeOut = document.getElementById('textStlSizeOut');
    if (sizeSlider && sizeOut) {
      sizeSlider.addEventListener('input', (e) => {
        sizeOut.textContent = `${e.target.value} mm`;
      });
    }

    if (applyBtn) {
      applyBtn.addEventListener('click', () => this._generateTextStl());
    }
  }

  _generateTextStl() {
    const text = document.getElementById('textStlInput')?.value || '16MM TUBE';
    const size = parseFloat(document.getElementById('textStlSize')?.value || 20);
    const depth = 3.0; // Standard 3D vector extrusion thickness
    const btn = document.getElementById('applyTextBtn');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.innerHTML = 'Generating 3D Text...';
      btn.disabled = true;
    }

    const buildWithFont = (font) => {
      setTimeout(() => {
        try {
          const lines = text.split('\n');
          let geometry;

          if (lines.length === 1) {
            geometry = new THREE.TextGeometry(text, {
              font: font,
              size: size,
              height: depth,
              curveSegments: 1, // Ultra-fast CAD segments
              bevelEnabled: false
            });
            geometry.center();
          } else {
            const lineGeos = [];
            const lineSpacing = size * 1.35;
            let maxW = 0;
            const boxes = [];

            lines.forEach(l => {
              const str = l.length > 0 ? l : ' ';
              const g = new THREE.TextGeometry(str, { font: font, size: size, height: depth, curveSegments: 1, bevelEnabled: false });
              g.computeBoundingBox();
              const w = g.boundingBox.max.x - g.boundingBox.min.x;
              if (w > maxW) maxW = w;
              boxes.push({ geo: g, width: w });
            });

            boxes.forEach((item, idx) => {
              const lineGeo = item.geo;
              const xOff = -0.5 * item.width;
              const yOff = (lines.length - 1 - idx) * lineSpacing - 0.5 * (lines.length - 1) * lineSpacing;
              lineGeo.translate(xOff, yOff, -0.5 * depth);
              lineGeos.push(lineGeo);
            });

            geometry = this._mergeBufferGeometries(lineGeos);
            geometry.center();
          }

          this.state.logoGeometry = geometry.clone();
          this.state.logoEnabled = true;
          this.state.logoScale = size;
          this.state.logoScalePercent = 100;
          this.state.wrapLogo = true;

          const scaleInput = document.getElementById('inputLogoScalePercent');
          if (scaleInput) scaleInput.value = 100;
          const readoutScale = document.getElementById('readoutLogoScale');
          if (readoutScale) readoutScale.textContent = `100% (${size.toFixed(1)} mm)`;

          this._showLogoControls(true);
          this.setLogoTextDisplay(`Text: "${text}"`);
          this.updateMesh();

          const modal = document.getElementById('textStlModal');
          if (modal) modal.style.display = 'none';
          this._showParseStatus(`✨ Applied 3D Vector Text "${text}"!`);
        } catch (err) {
          console.error('Text geometry error:', err);
          alert('Failed to generate 3D text geometry: ' + err.message);
        } finally {
          if (btn) {
            btn.innerHTML = origHtml || '✨ Apply 3D Text to Sleeve';
            btn.disabled = false;
          }
        }
      }, 20);
    };

    if (this.cachedFont) {
      buildWithFont(this.cachedFont);
    } else {
      const loader = new THREE.FontLoader();
      loader.load('fonts/helvetiker_bold.typeface.json', (font) => {
        this.cachedFont = font;
        buildWithFont(font);
      }, undefined, () => {
        loader.load('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/fonts/helvetiker_bold.typeface.json', (font) => {
          this.cachedFont = font;
          buildWithFont(font);
        }, undefined, (err) => {
          console.error('Font load error:', err);
          alert('Failed to load Three.js typeface font.');
          if (btn) {
            btn.innerHTML = origHtml || '✨ Apply 3D Text to Sleeve';
            btn.disabled = false;
          }
        });
      });
    }
  }

  // ─── LOGO FILE UPLOAD HANDLING (STL / IMAGE) ──────────────────────
  handleLogoUpload(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    this.setLogoTextDisplay(file.name);

    const reader = new FileReader();
    if (ext === 'stl') {
      reader.onload = (e) => this._processSTL(e.target.result);
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (e) => this._processImage(e.target.result);
      reader.readAsDataURL(file);
    }
  }

  _processSTL(arrayBuffer) {
    try {
      const loader = new THREE.STLLoader();
      const geo = loader.parse(arrayBuffer);
      geo.center();
      geo.computeVertexNormals();

      this.state.logoGeometry = geo;
      this.state.logoEnabled = true;
      this._showLogoControls(true);
      this.generateAIPattern(this.state.patternPreset);
      this.updateMesh();
      this._showParseStatus("✅ Loaded 3D STL Logo Mesh!");
    } catch (err) {
      console.error('STL parse error:', err);
      alert('Could not parse STL file: ' + err.message);
    }
  }

  _processImage(dataUrl) {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const res = 64;
      const canvas = document.createElement('canvas');
      canvas.width = res;
      canvas.height = res;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, res, res);

      const aspect = img.width / img.height;
      let dw = res, dh = res, dx = 0, dy = 0;
      if (aspect > 1) { dh = res / aspect; dy = (res - dh) / 2; }
      else { dw = res * aspect; dx = (res - dw) / 2; }
      ctx.drawImage(img, dx, dy, dw, dh);

      const data = ctx.getImageData(0, 0, res, res).data;
      const positions = [];
      const indices = [];

      for (let row = 0; row <= res; row++) {
        const v = row / res;
        for (let col = 0; col <= res; col++) {
          const u = col / res;
          const px = Math.min(res - 1, Math.floor(u * res));
          const py = Math.min(res - 1, Math.floor(v * res));
          const idx = (py * res + px) * 4;
          const brightness = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255.0;

          const x = (u - 0.5) * 16.0;
          const y = (0.5 - v) * 16.0;
          const z = brightness * 2.0;
          positions.push(x, y, z);
        }
      }

      for (let row = 0; row < res; row++) {
        for (let col = 0; col < res; col++) {
          const a = row * (res + 1) + col;
          const b = a + 1;
          const c = (row + 1) * (res + 1) + col;
          const d = c + 1;
          indices.push(a, b, c);
          indices.push(b, d, c);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.center();
      geo.computeVertexNormals();

      this.state.logoGeometry = geo;
      this.state.logoEnabled = true;
      this._showLogoControls(true);
      this.generateAIPattern(this.state.patternPreset);
      this.updateMesh();
      this._showParseStatus("✅ Converted Image Heightmap to 3D Mesh!");
    };
    img.src = dataUrl;
  }

  // ─── 3D CONFORMAL CYLINDRICAL WRAPPER ─────────────────────────────
  _getWrappedLogoGeo(forCsgCutter = false) {
    if (!this.state.logoGeometry) return null;

    const geo = this.state.logoGeometry.clone();
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    const size = new THREE.Vector3();
    box.getSize(size);

    geo.center();

    const targetScale = parseFloat(this.state.logoScale) || 16.0;
    const maxDim = Math.max(size.x, size.y);
    const scaleFactor = maxDim > 0 ? (targetScale / maxDim) : 1.0;
    geo.scale(scaleFactor, scaleFactor, 1.0);

    if (this.state.logoRotate) {
      geo.rotateZ((parseFloat(this.state.logoRotate) * Math.PI) / 180.0);
    }

    const outerR = this.state.outerDiameter / 2.0;       // Nominal cylinder radius (e.g. 11.0mm)
    const innerR = this.state.innerDiameter / 2.0;       // Inner bore radius (e.g. 8.1mm)
    const centerTheta = this.state.logoTheta || 0;
    const centerY = this.state.logoY || 0;

    // User-defined Radial Distance from Center Axis (Height from tube axis)
    const axisR = (this.state.logoAxisRadius !== undefined && this.state.logoAxisRadius !== null)
      ? parseFloat(this.state.logoAxisRadius)
      : outerR;

    const isEmboss = (this.state.logoMode === 'emboss');
    const targetDepth = Math.max(0.2, parseFloat(this.state.logoDepth) || 2.5);

    const posAttr = geo.attributes.position;
    
    // Re-compute bounding box after scale & rotation for exact normalized Z bounds:
    geo.computeBoundingBox();
    const minZ = geo.boundingBox.min.z;
    const maxZ = geo.boundingBox.max.z;
    const depthZ = maxZ - minZ;

    // Calculate radial boundary limits [bottomR, topR]:
    let topR, bottomR;
    if (isEmboss) {
      // EMBOSS: Base sits flush at axis radius (axisR - 0.05), top projects outward (+targetDepth)
      bottomR = axisR - 0.05;
      topR = axisR + targetDepth;
    } else {
      // DEBOSS CUT:
      // Top radius extends past the axis radius (+1.0mm in CSG, +0.3mm in preview)
      topR = axisR + (forCsgCutter ? 1.0 : 0.3);
      
      const isPassthrough = (targetDepth >= (axisR - innerR - 0.15));
      if (isPassthrough) {
        bottomR = innerR - (forCsgCutter ? 0.8 : 0.05); // Cleanly pierces inner tube cavity
      } else {
        // Deboss cuts into the outer wall from topR down by targetDepth
        bottomR = Math.max(innerR + 0.05, axisR - targetDepth);
      }
    }

    // Conformal Cylindrical Coordinate Transformation
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);

      // Normalized Z from back (0.0) to front (1.0):
      const normZ = depthZ > 0.001 
        ? Math.min(1.0, Math.max(0.0, (z - minZ) / depthZ)) 
        : 1.0;

      const r = bottomR + normZ * (topR - bottomR);

      if (this.state.wrapLogo) {
        const theta = x / axisR + centerTheta;
        posAttr.setXYZ(i,
          r * Math.sin(theta),
          y + centerY,
          r * Math.cos(theta)
        );
      } else {
        const sinT = Math.sin(centerTheta);
        const cosT = Math.cos(centerTheta);
        posAttr.setXYZ(i,
          x * cosT + r * sinT,
          y + centerY,
          -x * sinT + r * cosT
        );
      }
    }

    geo.computeVertexNormals();
    return geo;
  }

  _updateLogoPreview() {
    if (this.isCSGPreviewActive) {
      this.exitCSGPreview();
    }
    this.updateMesh();
  }

  _showLogoControls(show) {
    const el = document.getElementById('logoControlsActive');
    const details = document.getElementById('logoFileDetails');
    if (el) el.style.display = show ? 'flex' : 'none';
    if (details) details.style.display = show ? 'block' : 'none';
  }

  setLogoTextDisplay(text) {
    const nameEl = document.getElementById('logoFileName');
    if (nameEl) nameEl.textContent = text || 'No file selected';
  }

  _mergeBufferGeometries(geometries) {
    const validGeos = (geometries || []).filter(g => g && (g.isBufferGeometry || g.attributes?.position));
    if (validGeos.length === 0) return new THREE.BufferGeometry();
    if (validGeos.length === 1) return validGeos[0].clone();

    if (THREE.BufferGeometryUtils && THREE.BufferGeometryUtils.mergeBufferGeometries) {
      const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(validGeos, false);
      if (merged) return merged;
    }

    const nonIndexed = validGeos.map(g => g.index ? g.toNonIndexed() : g.clone());
    let total = 0;
    nonIndexed.forEach(g => { if (g.attributes?.position) total += g.attributes.position.count; });
    const posArr = new Float32Array(total * 3);
    let off = 0;
    nonIndexed.forEach(g => {
      if (g.attributes?.position) {
        posArr.set(g.attributes.position.array, off);
        off += g.attributes.position.array.length;
      }
    });
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    mg.computeVertexNormals();
    return mg;
  }

  // ─── 3D CSG BOOLEAN SOLID COMPUTATION & PREVIEW ───────────────────
  async _computeCSGGeometry() {
    let sleeveGeom = this._createSleeveGeometry();
    const L = this.state.length;
    const R_in = this.state.innerDiameter / 2.0;

    // Include bottom endstop lip if active
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
      lipGeo.rotateX(-Math.PI / 2);
      lipGeo.translate(0, -L / 2.0, 0);
      sleeveGeom = this._mergeBufferGeometries([sleeveGeom, lipGeo]);
    }

    let exportGeo = sleeveGeom;

    if (this.state.logoEnabled && this.state.logoGeometry && typeof CSG !== 'undefined') {
      this._updateProgressModal(35, 'Building 3D CSG Solid...');
      await new Promise(r => setTimeout(r, 10));

      try {
        if (this.state.logoMode === 'emboss') {
          this._updateProgressModal(70, 'Fusing embossed 3D relief mesh...');
          await new Promise(r => setTimeout(r, 10));
          const embossGeo = this._getWrappedLogoGeo(false);
          if (embossGeo) {
            exportGeo = this._mergeBufferGeometries([sleeveGeom, embossGeo]);
          }
        } else {
          this._updateProgressModal(50, 'Executing 3D Boolean deboss cut...');
          await new Promise(r => setTimeout(r, 10));
          const csgCutterGeo = this._getWrappedLogoGeo(true);
          if (csgCutterGeo) {
            const baseMesh = new THREE.Mesh(sleeveGeom);
            baseMesh.updateMatrixWorld();
            const cutMesh = new THREE.Mesh(csgCutterGeo);
            cutMesh.updateMatrixWorld();

            const baseCsg = CSG.fromMesh(baseMesh, 0);
            const cutCsg = CSG.fromMesh(cutMesh, 1);
            const debossedCsg = baseCsg.subtract(cutCsg);

            const resultMesh = CSG.toMesh(debossedCsg, baseMesh.matrix);
            if (resultMesh && resultMesh.geometry) {
              exportGeo = resultMesh.geometry;
              exportGeo.computeVertexNormals();
            }
          }
        }
      } catch (csgErr) {
        console.warn('CSG Boolean error:', csgErr);
      }
    }

    // Auto-remove disconnected floating islands (e.g. inner counter of letter D, O, A, etc.)
    if (this.state.cleanFloatingIslands) {
      this._updateProgressModal(75, 'Filtering and removing disconnected floating islands...');
      await new Promise(r => setTimeout(r, 10));
      exportGeo = this._removeFloatingIslands(exportGeo);
    }

    return exportGeo;
  }

  _removeFloatingIslands(geometry) {
    if (!geometry || !geometry.attributes || !geometry.attributes.position) return geometry;

    const posAttr = geometry.attributes.position;
    const indexAttr = geometry.index;
    const numTriangles = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(posAttr.count / 3);
    if (numTriangles <= 10) return geometry;

    const posArray = posAttr.array;
    const keyToVertId = new Map();
    let vertCount = 0;
    const triVerts = new Int32Array(numTriangles * 3);

    for (let i = 0; i < numTriangles * 3; i++) {
      const idx = indexAttr ? indexAttr.getX(i) : i;
      const px = posArray[idx * 3];
      const py = posArray[idx * 3 + 1];
      const pz = posArray[idx * 3 + 2];
      // 0.02mm quantization tolerance to weld shared edges
      const key = `${Math.round(px * 50)},${Math.round(py * 50)},${Math.round(pz * 50)}`;
      let vid = keyToVertId.get(key);
      if (vid === undefined) {
        vid = vertCount++;
        keyToVertId.set(key, vid);
      }
      triVerts[i] = vid;
    }

    // Disjoint Set Union (Union-Find)
    const parent = new Int32Array(numTriangles);
    for (let i = 0; i < numTriangles; i++) parent[i] = i;

    function find(i) {
      let root = i;
      while (root !== parent[root]) root = parent[root];
      let curr = i;
      while (curr !== root) {
        let nxt = parent[curr];
        parent[curr] = root;
        curr = nxt;
      }
      return root;
    }

    function union(i, j) {
      const ri = find(i);
      const rj = find(j);
      if (ri !== rj) parent[ri] = rj;
    }

    const vertToTris = new Map();
    for (let t = 0; t < numTriangles; t++) {
      for (let k = 0; k < 3; k++) {
        const v = triVerts[t * 3 + k];
        let list = vertToTris.get(v);
        if (!list) {
          list = [];
          vertToTris.set(v, list);
        }
        list.push(t);
      }
    }

    vertToTris.forEach(tList => {
      if (tList.length > 1) {
        const first = tList[0];
        for (let i = 1; i < tList.length; i++) {
          union(first, tList[i]);
        }
      }
    });

    // Count triangles per component
    const compSizes = new Map();
    for (let t = 0; t < numTriangles; t++) {
      const r = find(t);
      compSizes.set(r, (compSizes.get(r) || 0) + 1);
    }

    if (compSizes.size <= 1) return geometry;

    let maxTriCount = 0;
    let mainRoot = -1;
    compSizes.forEach((count, r) => {
      if (count > maxTriCount) {
        maxTriCount = count;
        mainRoot = r;
      }
    });

    // Keep the main sleeve body and any significant connected component (> 15% of max)
    const keepTriangles = [];
    for (let t = 0; t < numTriangles; t++) {
      const r = find(t);
      if (r === mainRoot || (compSizes.get(r) / maxTriCount) > 0.15) {
        keepTriangles.push(t);
      }
    }

    if (keepTriangles.length === numTriangles) return geometry;

    const newPos = new Float32Array(keepTriangles.length * 9);
    let dst = 0;
    for (let i = 0; i < keepTriangles.length; i++) {
      const t = keepTriangles[i];
      for (let k = 0; k < 3; k++) {
        const srcIdx = indexAttr ? indexAttr.getX(t * 3 + k) : (t * 3 + k);
        newPos[dst++] = posArray[srcIdx * 3];
        newPos[dst++] = posArray[srcIdx * 3 + 1];
        newPos[dst++] = posArray[srcIdx * 3 + 2];
      }
    }

    const cleanGeo = new THREE.BufferGeometry();
    cleanGeo.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
    cleanGeo.computeVertexNormals();
    return cleanGeo;
  }

  async toggleCSGPreview() {
    if (this.isCSGPreviewActive) {
      this.exitCSGPreview();
      return;
    }

    const btn = document.getElementById('btnPreviewCSG');
    const btnText = document.getElementById('btnPreviewCSGText');

    if (btn) btn.classList.add('is-processing');
    this._showProgressModal();
    this._updateProgressModal(15, 'Building 3D CSG Solid Preview...');

    try {
      const csgGeo = await this._computeCSGGeometry();

      if (this.sleeveMesh) this.sleeveMesh.visible = false;
      if (this.solidBackerMesh) this.solidBackerMesh.visible = false;
      if (this.logoPreviewMesh) this.logoPreviewMesh.visible = false;

      if (this.csgPreviewMesh) {
        if (this.modelGroup) this.modelGroup.remove(this.csgPreviewMesh);
        if (this.csgPreviewMesh.geometry) this.csgPreviewMesh.geometry.dispose();
        this.csgPreviewMesh = null;
      }

      const mat = new THREE.MeshStandardMaterial({
        color: 0x475569, // Dark steel CAD finish
        metalness: 0.65,
        roughness: 0.25,
        flatShading: this.state.facetedShading,
        side: THREE.DoubleSide
      });

      this.csgPreviewMesh = new THREE.Mesh(csgGeo, mat);
      this.modelGroup.add(this.csgPreviewMesh);
      this.isCSGPreviewActive = true;

      if (btnText) btnText.textContent = '✏️ Exit CSG Preview (Edit Mode)';
      if (btn) {
        btn.style.background = 'rgba(239, 68, 68, 0.25)';
        btn.style.borderColor = 'rgba(239, 68, 68, 0.6)';
        btn.style.color = '#fca5a5';
      }

      this._updateProgressModal(100, '3D CSG Solid Preview Complete!');
      setTimeout(() => this._hideProgressModal(), 300);
    } catch (err) {
      console.error('CSG Preview error:', err);
      this._hideProgressModal();
      alert('Could not compute CSG Boolean preview: ' + err.message);
    } finally {
      if (btn) btn.classList.remove('is-processing');
    }
  }

  exitCSGPreview() {
    if (!this.isCSGPreviewActive) return;

    if (this.csgPreviewMesh) {
      if (this.modelGroup) this.modelGroup.remove(this.csgPreviewMesh);
      if (this.csgPreviewMesh.geometry) this.csgPreviewMesh.geometry.dispose();
      this.csgPreviewMesh = null;
    }

    if (this.sleeveMesh) this.sleeveMesh.visible = true;
    if (this.solidBackerMesh) this.solidBackerMesh.visible = true;
    if (this.logoPreviewMesh) this.logoPreviewMesh.visible = true;

    this.isCSGPreviewActive = false;

    const btn = document.getElementById('btnPreviewCSG');
    const btnText = document.getElementById('btnPreviewCSGText');
    if (btnText) btnText.textContent = '✨ Preview Finished 3D CSG';
    if (btn) {
      btn.style.background = 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)';
      btn.style.borderColor = '';
      btn.style.color = '';
    }
  }

  async exportSTL() {
    this._showProgressModal();
    this._updateProgressModal(20, 'Compiling 3D CAD export geometry...');
    await new Promise(r => setTimeout(r, 10));

    try {
      const exportGeo = await this._computeCSGGeometry();
      this._updateProgressModal(80, 'Exporting binary STL file...');
      await new Promise(r => setTimeout(r, 10));

      const mesh = new THREE.Mesh(exportGeo);
      const exporter = new THREE.STLExporter();
      const stlData = exporter.parse(mesh, { binary: true });

      const blob = new Blob([stlData], { type: 'application/octet-stream' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `experience6_sleeve_${this.state.innerDiameter.toFixed(1)}mm_ID_${this.state.gridCols}x${this.state.gridRows}.stl`;
      link.click();
      URL.revokeObjectURL(link.href);

      this._updateProgressModal(100, 'STL Download Ready!');
      setTimeout(() => this._hideProgressModal(), 300);
    } catch (err) {
      console.error('Export STL error:', err);
      this._hideProgressModal();
      alert('Failed to export STL: ' + err.message);
    }
  }

  // ─── PROGRESS MODAL HELPERS ───────────────────────────────────────
  _startProgressTimer() {
    if (this.progressTimerInterval) clearInterval(this.progressTimerInterval);
    this.progressStartTime = Date.now();
    const timerReadout = document.getElementById('progressTimerReadout');
    if (timerReadout) timerReadout.textContent = '⏱️ Elapsed: 0.0s';

    this.progressTimerInterval = setInterval(() => {
      if (!this.progressStartTime) return;
      const elapsed = ((Date.now() - this.progressStartTime) / 1000).toFixed(1);
      if (timerReadout) timerReadout.textContent = `⏱️ Elapsed: ${elapsed}s`;
    }, 100);
  }

  _showProgressModal() {
    const modal = document.getElementById('stlProgressModal');
    if (modal) modal.style.display = 'flex';
    this._startProgressTimer();
  }

  _updateProgressModal(percent, statusText) {
    const modal = document.getElementById('stlProgressModal');
    const fill = document.getElementById('progressBarFill');
    const status = document.getElementById('progressModalStatus');
    const readout = document.getElementById('progressPercentReadout');

    if (modal && modal.style.display === 'none') modal.style.display = 'flex';
    if (!this.progressStartTime) this._startProgressTimer();

    if (fill) fill.style.width = `${percent}%`;
    if (status) status.textContent = statusText;
    if (readout) readout.textContent = `${percent}%`;
  }

  _hideProgressModal() {
    const modal = document.getElementById('stlProgressModal');
    if (modal) modal.style.display = 'none';
    if (this.progressTimerInterval) {
      clearInterval(this.progressTimerInterval);
      this.progressTimerInterval = null;
    }
    this.progressStartTime = null;
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
    if (this.isCSGPreviewActive) {
      this.exitCSGPreview();
    }

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

    // 1. Create Base Sleeve Mesh Geometry
    const sleeveGeom = this._createSleeveGeometry();
    const sleeveMat = this._getMaterial(this.state.materialStyle);
    this.sleeveMesh = new THREE.Mesh(sleeveGeom, sleeveMat);
    this.sleeveMesh.castShadow = true;
    this.sleeveMesh.receiveShadow = true;
    this.modelGroup.add(this.sleeveMesh);

    // 2. 3D Vector Text / CAD Deboss Cutter (Live 3D Geometry in Edit Mode)
    if (this.state.logoEnabled && this.state.logoGeometry) {
      const logoGeo = this._getWrappedLogoGeo(false);
      if (logoGeo) {
        let logoMat;
        if (this.state.logoMode === 'emboss') {
          logoMat = sleeveMat;
        } else {
          // High-visibility glowing deboss cut preview indicator
          logoMat = new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            emissive: 0x0284c7,
            emissiveIntensity: 0.5,
            roughness: 0.25,
            metalness: 0.3,
            side: THREE.DoubleSide
          });
        }
        this.logoPreviewMesh = new THREE.Mesh(logoGeo, logoMat);
        this.logoPreviewMesh.castShadow = true;
        this.logoPreviewMesh.receiveShadow = true;
        this.modelGroup.add(this.logoPreviewMesh);
      }
    }

    const L = this.state.length;
    const R_in = this.state.innerDiameter / 2.0;

    // 4. Bottom Retainer Endstop Lip (if toggled on)
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

    // 5. Realistic 16mm Glass Tube Reference
    if (this.state.showGlassTube) {
      const glassLen = Math.max(20.0, parseFloat(this.state.glassLength) || 100.0);
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

      // Align glass tube:
      // When lipRetainer is ON: glass tube sits on bottom endstop lip (-L/2 + lipThickness), so bottom is seated
      // When lipRetainer is OFF (Default): sleeve is centered on the glass tube at y = 0
      let glassY = 0;
      if (this.state.lipRetainer) {
        const lipH = this.state.lipThickness || 1.2;
        const bottomY = -L / 2.0 + lipH;
        glassY = bottomY + glassLen / 2.0;
      } else {
        glassY = 0; // Default centered
      }

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
    
    // Cut depth up to full wall thickness
    const cutDepth = Math.min(this.state.maxCutDepth, maxWall);
    const isFullWindowDepth = cutDepth >= 2.4; // Enable true passthrough window cutouts when cut depth is deep (>= 2.4mm)
    
    const cols = this.state.gridCols;
    const rows = this.state.gridRows;

    const vertices = [];
    const indices = [];
    const uvs = [];
    const colors = [];

    const halfL = L / 2.0;

    // Helper: Checks whether a specific grid cell (c, r) is an open passthrough window
    const isCellWindow = (c, r) => {
      if (!isFullWindowDepth) return false;
      // Preserve solid collar rings at top and bottom ends
      if (r < 2 || r >= rows - 2) return false;
      
      // Preserve solid backer band if 3D logo / text is active
      if (this.state.solidBacker && this.state.logoEnabled && this.state.logoGeometry) {
        const bandCenterY = this.state.logoY || 0;
        const targetScale = parseFloat(this.state.logoScale) || 16.0;
        const bandHeight = Math.max(14.0, (targetScale * 0.5) + 6.0);
        const y = ((r + 0.5) / rows) * L - halfL;
        if (Math.abs(y - bandCenterY) < bandHeight / 2.0 + 1.5) return false;
      }

      const d = Math.max(0.0, Math.min(1.0, this._sampleDepthMatrix(c, r)));
      return (d >= 0.85);
    };

    // 1. Build Outer Surface Grid Vertices
    for (let r = 0; r <= rows; r++) {
      const normY = r / rows;
      const y = normY * L - halfL;

      // Solid collar rim taper
      let endTaper = 1.0;
      const taperMargin = 2;
      if (r < taperMargin) {
        endTaper = r / taperMargin;
      } else if (r > rows - taperMargin) {
        endTaper = (rows - r) / taperMargin;
      }
      endTaper = endTaper * endTaper * (3.0 - 2.0 * endTaper);

      // Solid backer factor
      let backerFactor = 1.0;
      if (this.state.solidBacker && this.state.logoEnabled && this.state.logoGeometry) {
        const bandCenterY = this.state.logoY || 0;
        const targetScale = parseFloat(this.state.logoScale) || 16.0;
        const bandHeight = Math.max(14.0, (targetScale * 0.5) + 6.0);
        const blendMargin = 2.5;
        const distY = Math.abs(y - bandCenterY);
        const halfBand = bandHeight / 2.0;
        if (distY < halfBand) {
          backerFactor = 0.0;
        } else if (distY < halfBand + blendMargin) {
          const t = (distY - halfBand) / blendMargin;
          backerFactor = t * t * (3.0 - 2.0 * t);
        }
      }

      for (let c = 0; c < cols; c++) {
        const normX = c / cols;
        const angle = normX * Math.PI * 2.0;

        const rawDepth = Math.max(0.0, Math.min(1.0, this._sampleDepthMatrix(c, r)));
        const depthVal = rawDepth * endTaper * backerFactor;
        
        // Carve strictly inward from outer diameter R_out
        const deltaR = -depthVal * cutDepth;
        const currR = Math.max(R_in + 0.05, R_out + deltaR);
        const x = Math.cos(angle) * currR;
        const z = Math.sin(angle) * currR;

        vertices.push(x, y, z);
        uvs.push(normX, normY);

        const shadeFactor = 1.0 - depthVal * 0.35;
        colors.push(0.72 * shadeFactor, 0.78 * shadeFactor, 0.85 * shadeFactor);
      }
    }

    // 2. Build Inner Bore Surface Vertices (Smooth Inner Tube Bore with Elephant's Foot Relief Chamfer)
    const innerStartIdx = vertices.length / 3;
    const chamfer = Math.max(0.0, parseFloat(this.state.elephantsFootChamfer) || 0.0);
    const chamferDepth = Math.max(chamfer, 1.2); // at least 1.2mm transition depth
    for (let r = 0; r <= rows; r++) {
      const y = (r / rows) * L - halfL;
      const distFromBottom = (r / rows) * L;
      const distFromTop = L - distFromBottom;

      // 45° internal lead-in chamfer for elephant's foot relief at bottom and top openings
      let flare = 0.0;
      if (chamfer > 0.001) {
        if (distFromBottom < chamferDepth) {
          flare = Math.max(flare, chamfer * (1.0 - distFromBottom / chamferDepth));
        }
        if (distFromTop < chamferDepth) {
          flare = Math.max(flare, chamfer * (1.0 - distFromTop / chamferDepth));
        }
      }
      // Ensure inner radius stays cleanly within wall thickness
      const currR_in = Math.min(R_out - 0.2, R_in + flare);

      for (let c = 0; c < cols; c++) {
        const angle = (c / cols) * Math.PI * 2.0;
        const x = Math.cos(angle) * currR_in;
        const z = Math.sin(angle) * currR_in;

        vertices.push(x, y, z);
        uvs.push(c / cols, r / rows);
        colors.push(0.42, 0.48, 0.55);
      }
    }

    // 3. Build Outer Faces, Inner Faces, and Watertight Window Boundary Walls
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const nextC = (c + 1) % cols;
        const prevC = (c - 1 + cols) % cols;

        const oSW = r * cols + c;
        const oSE = r * cols + nextC;
        const oNW = (r + 1) * cols + c;
        const oNE = (r + 1) * cols + nextC;

        const iSW = innerStartIdx + r * cols + c;
        const iSE = innerStartIdx + r * cols + nextC;
        const iNW = innerStartIdx + (r + 1) * cols + c;
        const iNE = innerStartIdx + (r + 1) * cols + nextC;

        const isWin = isCellWindow(c, r);

        if (!isWin) {
          // Solid Cell: Draw Outer Quad (Facing Outward)
          indices.push(oSW, oNW, oSE);
          indices.push(oSE, oNW, oNE);

          // Solid Cell: Draw Inner Quad (Facing Inward)
          indices.push(iSW, iSE, iNW);
          indices.push(iSE, iNE, iNW);
        } else {
          // Passthrough Window Cell: Omit outer & inner surface quads!
          // Add boundary side walls bridging outer to inner wherever bordering a solid neighbor:

          // North Boundary Wall
          if (r === rows - 1 || !isCellWindow(c, r + 1)) {
            indices.push(oNW, oNE, iNW);
            indices.push(oNE, iNE, iNW);
          }

          // South Boundary Wall
          if (r === 0 || !isCellWindow(c, r - 1)) {
            indices.push(oSE, oSW, iSE);
            indices.push(oSW, iSW, iSE);
          }

          // East Boundary Wall
          if (!isCellWindow(nextC, r)) {
            indices.push(oNE, oSE, iNE);
            indices.push(oSE, iSE, iNE);
          }

          // West Boundary Wall
          if (!isCellWindow(prevC, r)) {
            indices.push(oSW, oNW, iSW);
            indices.push(oNW, iNW, iSW);
          }
        }
      }
    }

    // 4. Top Ring Cap (Closed Solid Ring - Outward Normal +Y)
    for (let c = 0; c < cols; c++) {
      const nextC = (c + 1) % cols;
      const o1 = rows * cols + c;
      const o2 = rows * cols + nextC;
      const i1 = innerStartIdx + rows * cols + c;
      const i2 = innerStartIdx + rows * cols + nextC;

      indices.push(o1, i1, o2);
      indices.push(o2, i1, i2);
    }

    // 5. Bottom Ring Cap (Closed Solid Ring - Outward Normal -Y)
    for (let c = 0; c < cols; c++) {
      const nextC = (c + 1) % cols;
      const o1 = c;
      const o2 = nextC;
      const i1 = innerStartIdx + c;
      const i2 = innerStartIdx + nextC;

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

  _initUI() {
    this._bindInput('innerDiameter', (v) => { 
      this.state.innerDiameter = parseFloat(v); 
      // Safety check: ensure outer diameter is at least innerDiameter + 1.6mm
      if (this.state.outerDiameter < this.state.innerDiameter + 1.6) {
        this.state.outerDiameter = parseFloat((this.state.innerDiameter + 1.6).toFixed(1));
        const odEl = document.getElementById('outerDiameter');
        const odVal = document.getElementById('outerDiameterVal');
        if (odEl) odEl.value = this.state.outerDiameter;
        if (odVal) odVal.textContent = this.state.outerDiameter.toFixed(1);
      }
      this._updateFitPresetButtons();
      this._debouncedUpdateMesh(20); 
    });
    this._bindInput('elephantsFootChamfer', (v) => { 
      this.state.elephantsFootChamfer = parseFloat(v); 
      this._debouncedUpdateMesh(20); 
    });
    this._bindInput('outerDiameter', (v) => { 
      this.state.outerDiameter = parseFloat(v); 
      if (this.state.outerDiameter < this.state.innerDiameter + 1.2) {
        this.state.innerDiameter = parseFloat((this.state.outerDiameter - 1.2).toFixed(2));
        const idEl = document.getElementById('innerDiameter');
        const idVal = document.getElementById('innerDiameterVal');
        if (idEl) idEl.value = this.state.innerDiameter;
        if (idVal) idVal.textContent = this.state.innerDiameter.toFixed(2);
        this._updateFitPresetButtons();
      }
      this._debouncedUpdateMesh(20); 
    });
    this._bindInput('sleeveLength', (v) => { this.state.length = parseFloat(v); this._debouncedUpdateMesh(20); });
    this._bindInput('glassLength', (v) => { 
      this.state.glassLength = parseFloat(v); 
      this._updateGlassPresetButtons();
      this._debouncedUpdateMesh(20); 
    });

    // Quick Fit Calibration Preset Buttons
    document.querySelectorAll('.btn-preset-fit[data-fit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const fitVal = parseFloat(btn.dataset.fit);
        if (!isNaN(fitVal)) {
          const idInput = document.getElementById('innerDiameter');
          if (idInput) {
            idInput.value = fitVal.toFixed(2);
            idInput.dispatchEvent(new Event('input'));
          }
        }
      });
    });

    // Quick Glass Length Preset Buttons
    document.querySelectorAll('.btn-preset-fit[data-glass]').forEach(btn => {
      btn.addEventListener('click', () => {
        const gVal = parseFloat(btn.dataset.glass);
        if (!isNaN(gVal)) {
          const gInput = document.getElementById('glassLength');
          if (gInput) {
            gInput.value = gVal.toFixed(1);
            gInput.dispatchEvent(new Event('input'));
          }
        }
      });
    });
    this._bindInput('gridCols', (v) => { 
      this.state.gridCols = parseInt(v); 
      this._debouncedGenerateAIPattern(35);
    });
    this._bindInput('gridRows', (v) => { 
      this.state.gridRows = parseInt(v); 
      this._debouncedGenerateAIPattern(35);
    });
    this._bindInput('maxCutDepth', (v) => { 
      this.state.maxCutDepth = parseFloat(v);
      const badge = document.getElementById('windowBadge');
      if (badge) {
        if (this.state.maxCutDepth >= 2.4) {
          badge.textContent = "🪟 Windows Cut Straight Through";
          badge.style.color = "#38bdf8";
          badge.style.borderColor = "rgba(56, 189, 248, 0.4)";
          badge.style.background = "rgba(56, 189, 248, 0.15)";
        } else {
          badge.textContent = "✏️ Surface Engraving Mode";
          badge.style.color = "#a5b4fc";
          badge.style.borderColor = "rgba(165, 180, 252, 0.4)";
          badge.style.background = "rgba(165, 180, 252, 0.15)";
        }
      }
      this._debouncedUpdateMesh(20); 
    });
    this._bindInput('noiseScale', (v) => { this.state.noiseScale = parseFloat(v); this._debouncedGenerateAIPattern(25); });
    this._bindInput('noiseContrast', (v) => { this.state.noiseContrast = parseFloat(v); this._debouncedGenerateAIPattern(25); });
    this._bindInput('radialSymmetry', (v) => { this.state.radialSymmetry = parseInt(v); this._debouncedGenerateAIPattern(25); });
    this._bindInput('helicalTwist', (v) => { this.state.helicalTwist = parseFloat(v); this._debouncedGenerateAIPattern(25); });

    const btnTakeScreenshot = document.getElementById('btnTakeAIScreenshot');
    if (btnTakeScreenshot) {
      btnTakeScreenshot.addEventListener('click', () => this.takeAIScreenshot());
    }

    const btnExpand = document.getElementById('btnExpandViewport');
    if (btnExpand) {
      btnExpand.addEventListener('click', () => {
        const pane = document.querySelector('.viewport-pane');
        if (!pane) return;
        const isExpanded = pane.classList.toggle('viewport-expanded');
        btnExpand.textContent = isExpanded ? '🗗 Compact Viewer' : '⛶ Expand Viewer';
        btnExpand.title = isExpanded ? 'Collapse viewport back to compact height' : 'Expand viewport height for full-size 3D view';
        btnExpand.classList.toggle('active', isExpanded);

        // Lock/unlock page scroll when enlarged viewer is active
        if (isExpanded) {
          document.body.classList.add('viewport-expanded-locked');
          document.documentElement.classList.add('viewport-expanded-locked');
          pane.classList.remove('viewport-shrunk');
        } else {
          document.body.classList.remove('viewport-expanded-locked');
          document.documentElement.classList.remove('viewport-expanded-locked');
        }

        setTimeout(() => {
          this._onResize();
          this._resetCamera();
        }, 150);
      });
    }

    this._initScrollShrinkBehavior();

    const btnCopyPrompt = document.getElementById('btnCopySystemPrompt');
    if (btnCopyPrompt) {
      btnCopyPrompt.addEventListener('click', () => {
        this.copyChatbotSystemPrompt();
      });
    }

    this._initAiAssistantAccordion();
    this._initPresetFolderToggles();

    const presetCards = document.querySelectorAll('.prompt-card-btn, .preset-chip');
    presetCards.forEach(card => {
      card.addEventListener('click', () => {
        presetCards.forEach(b => b.classList.remove('active'));
        card.classList.add('active');

        const presetKey = card.getAttribute('data-preset') || 'stars';
        const promptText = card.getAttribute('data-prompt-text') || '';

        this.state.patternPreset = presetKey;
        this.state.aiPrompt = promptText || presetKey;
        this.generateAIPattern(presetKey);

        // Update Active Pattern title display banner
        const activeTitleEl = document.getElementById('activePatternTitle');
        if (activeTitleEl) {
          const titleSpan = card.querySelector('span');
          const titleText = titleSpan ? titleSpan.textContent : (card.textContent || presetKey);
          activeTitleEl.textContent = titleText.trim();
        }

        // Update Prompt Preview Text
        const previewEl = document.getElementById('aiPromptPreviewText');
        if (previewEl && promptText) {
          previewEl.textContent = `Pattern: "${promptText}" | Matrix: ${this.state.gridCols}x${this.state.gridRows} | Range [-1.0, 1.0]`;
        }
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
        this.state.isDepthInverted = !this.state.isDepthInverted;
        for (let c = 0; c < this.state.gridCols; c++) {
          for (let r = 0; r < this.state.gridRows; r++) {
            this.depthMatrix[c][r] = -this.depthMatrix[c][r];
          }
        }
        this._renderCanvas2D();
        this.updateMesh();
        this._showParseStatus(this.state.isDepthInverted ? "🔄 Inverted pattern depths (Cuts ↔ Extrusions)" : "🔄 Restored normal pattern depths");
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

    const toggleFloating = document.getElementById('toggleCleanFloatingIslands');
    if (toggleFloating) {
      toggleFloating.addEventListener('change', (e) => {
        this.state.cleanFloatingIslands = e.target.checked;
        if (this.isCSGPreviewActive) {
          this.toggleCSGPreview(); // re-render CSG with new setting
          this.toggleCSGPreview();
        }
      });
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

    // Initialize 3D Vector Text & Logo CAD Engine (Experience 4 Integration)
    this._initTextStlModal();
    this._initLogoUI();
  }

  // ─── 3D VECTOR TEXT & LOGO UI CONTROLS ─────────────────────────────
  _initLogoUI() {
    const btnBrowse = document.getElementById('btnBrowseLogo');
    const inputFile = document.getElementById('inputLogoFile');
    const btnRemove = document.getElementById('btnRemoveLogo');
    const btnModeDeboss = document.getElementById('btnModeDeboss');
    const btnModeEmboss = document.getElementById('btnModeEmboss');
    const toggleWrap = document.getElementById('toggleWrapLogo');
    const toggleSolid = document.getElementById('toggleSolidBacker');
    const inputScale = document.getElementById('inputLogoScalePercent');
    const readoutScale = document.getElementById('readoutLogoScale');
    const btnResetSection = document.getElementById('btnResetLogoSection');
    const btnCSG = document.getElementById('btnPreviewCSG');

    if (btnBrowse && inputFile) {
      btnBrowse.addEventListener('click', () => inputFile.click());
      inputFile.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) this.handleLogoUpload(file);
      });
    }

    if (btnRemove) {
      btnRemove.addEventListener('click', () => {
        this.state.logoEnabled = false;
        this.state.logoGeometry = null;
        if (this.logoPreviewMesh) {
          if (this.modelGroup) this.modelGroup.remove(this.logoPreviewMesh);
          if (this.logoPreviewMesh.geometry) this.logoPreviewMesh.geometry.dispose();
          this.logoPreviewMesh = null;
        }
        if (inputFile) inputFile.value = '';
        this._showLogoControls(false);
        this.setLogoTextDisplay('No file selected');
        this.generateAIPattern(this.state.patternPreset);
        this.updateMesh();
        this._showParseStatus("🗑️ Removed 3D logo / text.");
      });
    }

    if (btnModeDeboss && btnModeEmboss) {
      btnModeDeboss.addEventListener('click', () => {
        btnModeDeboss.classList.add('active-deboss');
        btnModeEmboss.classList.remove('active-emboss');
        this.state.logoMode = 'deboss';
        this._updateLogoPreview();
      });
      btnModeEmboss.addEventListener('click', () => {
        btnModeEmboss.classList.add('active-emboss');
        btnModeDeboss.classList.remove('active-deboss');
        this.state.logoMode = 'emboss';
        this._updateLogoPreview();
      });
    }

    if (toggleWrap) {
      toggleWrap.checked = this.state.wrapLogo;
      toggleWrap.addEventListener('change', (e) => {
        this.state.wrapLogo = e.target.checked;
        this._updateLogoPreview();
      });
    }

    if (toggleSolid) {
      toggleSolid.checked = this.state.solidBacker;
      toggleSolid.addEventListener('change', (e) => {
        this.state.solidBacker = e.target.checked;
        this.updateMesh();
      });
    }

    // Scale percentage input & preset buttons
    const updateLogoScale = (percentVal) => {
      let percent = parseFloat(percentVal);
      if (isNaN(percent) || percent <= 0) percent = 100;
      this.state.logoScalePercent = percent;
      this.state.logoScale = (percent / 100) * 16.0;
      if (inputScale && parseFloat(inputScale.value) !== percent) inputScale.value = percent;
      if (readoutScale) readoutScale.textContent = `${percent.toFixed(0)}% (${this.state.logoScale.toFixed(1)} mm)`;
      this.updateMesh();
    };

    if (inputScale) {
      inputScale.addEventListener('input', (e) => updateLogoScale(e.target.value));
    }
    document.querySelectorAll('.btn-scale-preset').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const val = e.currentTarget.getAttribute('data-scale');
        if (val) updateLogoScale(val);
      });
    });

    // Sliders & Passthrough Shortcut
    const btnPassthrough = document.getElementById('btnSetPassthroughDepth');
    if (btnPassthrough) {
      btnPassthrough.addEventListener('click', () => {
        const outerR = this.state.outerDiameter / 2.0;
        const innerR = this.state.innerDiameter / 2.0;
        const maxExt = Math.max(0, parseFloat(this.state.maxExtrudeHeight) || 1.2);
        const fullPassDepth = (outerR - innerR) + maxExt + 0.5;
        this.state.logoDepth = parseFloat(fullPassDepth.toFixed(1));
        const depthInput = document.getElementById('inputLogoDepth');
        if (depthInput) {
          depthInput.value = this.state.logoDepth;
          depthInput.dispatchEvent(new Event('input'));
        }
        this._showParseStatus("🕳️ Set 100% Full Passthrough Window cut depth!");
      });
    }

    this._bindInput('inputLogoDepth', (v) => { 
      this.state.logoDepth = parseFloat(v); 
      const readout = document.getElementById('readoutLogoDepth');
      if (readout) readout.textContent = `${parseFloat(v).toFixed(1)} mm`;
      this._debouncedUpdateMesh(30); 
    });
    this._bindInput('inputLogoY', (v) => { 
      this.state.logoY = parseFloat(v); 
      const readout = document.getElementById('readoutLogoY');
      if (readout) readout.textContent = `${parseFloat(v).toFixed(1)} mm`;
      this._debouncedUpdateMesh(30); 
    });
    this._bindInput('inputLogoTheta', (v) => { 
      this.state.logoTheta = (parseFloat(v) * Math.PI) / 180.0; 
      const readout = document.getElementById('readoutLogoTheta');
      if (readout) readout.textContent = `${v}°`;
      this._debouncedUpdateMesh(30); 
    });
    this._bindInput('inputLogoRotate', (v) => { 
      this.state.logoRotate = parseFloat(v); 
      const readout = document.getElementById('readoutLogoRotate');
      if (readout) readout.textContent = `${parseFloat(v).toFixed(2)}°`;
      this._debouncedUpdateMesh(30); 
    });

    const updateAxisRadiusReadout = (val) => {
      const readout = document.getElementById('readoutLogoAxisRadius');
      if (!readout) return;
      const num = parseFloat(val);
      const outerR = this.state.outerDiameter / 2.0;
      const diff = num - outerR;
      if (Math.abs(diff) < 0.05) {
        readout.textContent = `${num.toFixed(1)} mm (Flush Surface)`;
      } else if (diff > 0) {
        readout.textContent = `${num.toFixed(1)} mm (+${diff.toFixed(1)} mm Raised)`;
      } else {
        readout.textContent = `${num.toFixed(1)} mm (${diff.toFixed(1)} mm Sunk)`;
      }
    };

    const btnSnapFlush = document.getElementById('btnSnapFlushRadius');
    if (btnSnapFlush) {
      btnSnapFlush.addEventListener('click', () => {
        const outerR = this.state.outerDiameter / 2.0;
        this.state.logoAxisRadius = outerR;
        const inp = document.getElementById('inputLogoAxisRadius');
        if (inp) {
          inp.value = outerR;
          updateAxisRadiusReadout(outerR);
        }
        this._debouncedUpdateMesh(30);
        this._showParseStatus(`🎯 Snapped 3D Text distance flush to ${outerR.toFixed(1)} mm surface radius!`);
      });
    }

    this._bindInput('inputLogoAxisRadius', (v) => {
      this.state.logoAxisRadius = parseFloat(v);
      updateAxisRadiusReadout(v);
      this._debouncedUpdateMesh(30);
    });

    if (btnResetSection) {
      btnResetSection.addEventListener('click', () => {
        this.state.logoRotate = 0;
        this.state.logoTheta = 0;
        this.state.logoY = 0;
        this.state.logoDepth = 1.0;
        this.state.logoAxisRadius = this.state.outerDiameter / 2.0;
        this.state.solidBacker = false;
        if (toggleSolid) toggleSolid.checked = false;
        updateLogoScale(100);

        ['inputLogoDepth', 'inputLogoY', 'inputLogoTheta', 'inputLogoRotate', 'inputLogoAxisRadius'].forEach(id => {
          const inp = document.getElementById(id);
          const dVal = inp?.getAttribute('data-default');
          if (inp && dVal !== null) {
            inp.value = dVal;
            inp.dispatchEvent(new Event('input'));
          }
        });

        this.generateAIPattern(this.state.patternPreset);
        this._updateLogoPreview();
        this._showParseStatus("↺ Reset 3D Logo / Text transforms to default!");
      });
    }

    if (btnCSG) {
      btnCSG.addEventListener('click', () => this.toggleCSGPreview());
    }
  }

  // ─── AI PROMPT, SCREENSHOT & MATRIX EXPORT HELPERS ────────────────
  copyChatbotSystemPrompt(customPrompt = '') {
    const promptText = customPrompt || this.state.aiPrompt || 'Design a fluid dynamics turbulence pattern with organic flowing waves.';
    const cols = this.state.gridCols;
    const rows = this.state.gridRows;

    const systemPrompt = `You are a 3D CAD Parametric Copilot for cylindrical 16mm glass tube sleeves.
The sleeve mesh is controlled by a 2D heightmap matrix of size ${cols} (circumferential radial columns) by ${rows} (vertical length rows).
Values must be floating point numbers between -1.0 (maximum cut depth) and +1.0 (maximum outward extrusion). 0.0 is the flush cylinder outer diameter.

Objective: Design a "${promptText}" pattern.
Return a valid JSON 2D array of numbers: [[col0_row0, col0_row1, ...], [col1_row0, ...]] of dimensions ${cols}x${rows}.`;

    const previewEl = document.getElementById('aiPromptPreviewText');
    if (previewEl) {
      previewEl.textContent = `Pattern: "${promptText}" | Matrix: ${cols}x${rows} | Range: [-1.0, 1.0]`;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(systemPrompt).then(() => {
        this._showParseStatus("📋 Copied AI Parametric System Prompt to clipboard!");
      }).catch(() => {
        this._showParseStatus("📋 System prompt prepared!");
      });
    }
  }

  exportMatrixToClipboard() {
    const jsonStr = JSON.stringify(this.depthMatrix, (key, val) => {
      if (typeof val === 'number') return parseFloat(val.toFixed(3));
      return val;
    });

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(jsonStr).then(() => {
        this._showParseStatus("📤 Exported 3D Depth Matrix JSON to clipboard!");
      }).catch(err => {
        console.error('Copy error:', err);
        alert('Matrix copied to console!');
        console.log(jsonStr);
      });
    }
  }

  _showParseStatus(msg) {
    const activeTitle = document.getElementById('activePatternTitle');
    if (activeTitle) {
      const orig = activeTitle.textContent;
      activeTitle.textContent = msg;
      setTimeout(() => {
        if (activeTitle.textContent === msg) {
          activeTitle.textContent = orig;
        }
      }, 3500);
    }
  }

  _initAiAssistantAccordion() {
    const accordion = document.getElementById('aiAssistantAccordion');
    const header = document.getElementById('headerAiAssistant');
    if (!accordion || !header) return;

    header.addEventListener('click', () => {
      const isCollapsed = accordion.classList.contains('collapsed');
      accordion.classList.toggle('collapsed', !isCollapsed);
      const nowCollapsed = accordion.classList.contains('collapsed');
      header.setAttribute('aria-expanded', !nowCollapsed);
      const toggleText = header.querySelector('.ai-accordion-toggle-text');
      if (toggleText) {
        toggleText.textContent = nowCollapsed ? '▼ Expand' : '▲ Collapse';
      }
      if (!nowCollapsed) {
        this._renderCanvas2D();
      }
    });
  }

  _initScrollShrinkBehavior() {
    const pane = document.querySelector('.viewport-pane');
    const wrapper = document.querySelector('.stl-generator-wrapper');
    const sentinel = document.getElementById('viewportScrollSentinel');
    if (!pane || !sentinel) return;

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (pane.classList.contains('viewport-expanded')) return;

          // When sentinel scrolls above top viewport sticky bar
          if (!entry.isIntersecting && entry.boundingClientRect.top < 54) {
            if (!pane.classList.contains('viewport-shrunk')) {
              pane.classList.add('viewport-shrunk');
              if (wrapper) wrapper.classList.add('wrapper-shrunk-spaced');
              this._animateResizeTransition(360);
            }
          } else if (entry.isIntersecting) {
            if (pane.classList.contains('viewport-shrunk')) {
              pane.classList.remove('viewport-shrunk');
              if (wrapper) wrapper.classList.remove('wrapper-shrunk-spaced');
              this._animateResizeTransition(360);
            }
          }
        });
      }, {
        root: null,
        rootMargin: '-54px 0px 0px 0px',
        threshold: 0
      });

      observer.observe(sentinel);
    }
  }

  _animateResizeTransition(durationMs = 360) {
    if (this._resizeAnimId) cancelAnimationFrame(this._resizeAnimId);
    const startTime = performance.now();
    const step = (now) => {
      this._onResize(true);
      if (now - startTime < durationMs) {
        this._resizeAnimId = requestAnimationFrame(step);
      } else {
        this._onResize(true);
        this._resizeAnimId = null;
      }
    };
    this._resizeAnimId = requestAnimationFrame(step);
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
        if (valDisplay) {
          const num = parseFloat(val);
          if (!isNaN(num) && (id === 'innerDiameter' || id === 'outerDiameter' || id === 'sleeveLength' || id === 'glassLength' || id === 'elephantsFootChamfer' || id === 'maxCutDepth')) {
            valDisplay.textContent = (id === 'innerDiameter') ? num.toFixed(2) : num.toFixed(1);
          } else {
            valDisplay.textContent = val;
          }
        }
        callback(val);
      });
    }
  }

  _updateFitPresetButtons() {
    const currId = parseFloat(this.state.innerDiameter) || 16.2;
    document.querySelectorAll('.btn-preset-fit[data-fit]').forEach(btn => {
      const fitVal = parseFloat(btn.dataset.fit);
      if (Math.abs(fitVal - currId) < 0.03) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  _updateGlassPresetButtons() {
    const currGlass = parseFloat(this.state.glassLength) || 100.0;
    document.querySelectorAll('.btn-preset-fit[data-glass]').forEach(btn => {
      const gVal = parseFloat(btn.dataset.glass);
      if (Math.abs(gVal - currGlass) < 0.5) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  _updateMeshStatusOverlay(geom) {
    const vertEl = document.getElementById('vertexCountDisplay');
    const triEl = document.getElementById('triangleCountDisplay');
    const dimsEl = document.getElementById('meshDimensionsDisplay');

    if (vertEl && geom) vertEl.textContent = geom.attributes.position.count.toLocaleString();
    if (triEl && geom) triEl.textContent = (geom.index ? geom.index.count / 3 : 0).toLocaleString();
    if (dimsEl) dimsEl.textContent = `${this.state.innerDiameter.toFixed(1)}mm ID × ${this.state.outerDiameter.toFixed(1)}mm OD × ${this.state.length.toFixed(1)}mm L`;
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
      btnRotate.textContent = isHoriz ? '🔄 Current View Horizontal' : '📐 Current View Vertical';
      btnRotate.title = isHoriz ? 'Click to set 3D view to upright Vertical orientation (0°)' : 'Click to rotate 3D view 90° Horizontal';
      btnRotate.classList.toggle('active', !isHoriz);
    }

    this._resetCamera();
  }

  _resetCamera() {
    if (this.camera && this.controls) {
      const isMobile = window.innerWidth <= 768;
      const isNarrow = window.innerWidth <= 480;

      if (this.state && this.state.isRotatedHorizontal) {
        const distZ = isNarrow ? 155 : (isMobile ? 145 : 135);
        this.camera.position.set(0, 28, distZ);
      } else {
        // Upright Vertical orientation camera positioning - centered on cylinder mid-height
        const distX = isNarrow ? 32 : 35;
        const distY = isNarrow ? 0 : 6;
        const distZ = isNarrow ? 144 : (isMobile ? 138 : 130);
        this.camera.position.set(distX, distY, distZ);
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

  _onResize(force = false) {
    if (!this.container || !this.renderer || !this.camera) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;

    if (!force && this._lastWidth === w && this._lastHeight === h) return;
    this._lastWidth = w;
    this._lastHeight = h;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.controls) this.controls.update();
  }

  resetAllSlidersToDefault() {
    const defaults = {
      innerDiameter: 16.2,
      elephantsFootChamfer: 0.8,
      outerDiameter: 22.0,
      sleeveLength: 80.0,
      glassLength: 100.0,
      gridCols: 32,
      gridRows: 40,
      maxCutDepth: 2.9,
      noiseScale: 0.12,
      noiseContrast: 1.2,
      radialSymmetry: 4,
      helicalTwist: 0
    };

    this.state.isDepthInverted = false;

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
