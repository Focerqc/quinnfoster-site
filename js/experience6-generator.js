/**
 * Experience 6 — Personal AI Chatbot Co-Pilot Driven 16mm Cylinder Generator
 * Powered by Three.js, Procedural Math Engines, AI JSON Array Parsers & Binary STL Exporter
 * 
 * Features:
 * - Precise Geometric Shape Algorithms (Stars & Crosses, Honeycombs, Knurling, Scales).
 * - Personal AI Chatbot System Prompts & Multimodal Vision Snapshots.
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
      lipRetainer: true,     // Bottom stop ring
      lipThickness: 1.2,     // mm
      lipBore: 14.5,         // Inner stop diameter mm
      
      // AI Procedural Engine
      aiPrompt: 'Alternating Star & Cross Geometric Lattice',
      patternPreset: 'stars',// 'stars', 'cyber', 'voronoi', 'knurl', 'waves', 'scales', 'flutes', 'weave', 'turbulence'
      noiseScale: 0.12,
      noiseContrast: 1.2,
      radialSymmetry: 4,     // 4-fold radial symmetry default for clean star patterns
      helicalTwist: 0.0,     // Helical twist angle in degrees
      randomSeed: 42,
      
      // Display & Visual Modes
      showGlassTube: true,
      geoNodesMode: false,   // Blender Geometry Nodes Scatter Mode
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
    this._animate();
    this._resetCamera();
    
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
    this.scene.add(this.modelGroup);
    this.scene.add(this.geoNodesGroup);

    this.camera = new THREE.PerspectiveCamera(42, w / h, 1, 1000);
    this.camera.position.set(45, 35, 75);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);
    window.addEventListener('resize', () => this._onResize());
  }

  _initLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(60, 80, 50);
    dirLight1.castShadow = true;
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.85);
    dirLight2.position.set(-60, -30, -50);
    this.scene.add(dirLight2);

    const dirLight3 = new THREE.DirectionalLight(0xc084fc, 0.65);
    dirLight3.position.set(0, 50, -80);
    this.scene.add(dirLight3);
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
          <button id="btnDownloadImg" class="btn-secondary">
            📥 Download PNG
          </button>
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
            alert("Image copied to clipboard! You can now paste (Ctrl+V) directly into ChatGPT or Claude.");
          }).catch(err => {
            console.warn("ClipboardItem fallback:", err);
            this._downloadPNG(dataURL);
          });
        });
    };

    document.getElementById('btnDownloadImg').onclick = () => this._downloadPNG(dataURL);

    document.getElementById('btnCopyVisionPrompt').onclick = () => {
      const visionPrompt = `Here is a 3D snapshot of my current 16mm glass tube sleeve design (${this.state.gridCols}x${this.state.gridRows} grid).
Please analyze this 3D image and give me specific feedback and recommendations to improve the aesthetics, grip texture, or depth contrast.
Return updated JSON float array if recommending changes!`;
      navigator.clipboard.writeText(visionPrompt).then(() => {
        alert("AI Vision Prompt copied to clipboard! Attach it alongside your image in ChatGPT / Claude.");
      });
    };
  }

  _downloadPNG(dataURL) {
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = `sleeve_3d_snapshot_${this.state.gridCols}x${this.state.gridRows}.png`;
    link.click();
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

  // ─── PURE ALGORITHMIC AI PATTERN GENERATOR ENGINE ──────────────────
  generateAIPattern(presetName) {
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
        let v = 0;

        switch (presetName) {
          case 'stars':
          default:
            // ⭐ Precise 5-Point Star & Cross Lattice Array
            const starCellX = (symCol % 8) - 4;
            const starCellY = (r % 10) - 5;
            const starDist = Math.sqrt(starCellX * starCellX + starCellY * starCellY);
            const starAngle = Math.atan2(starCellY, starCellX);
            const starRadius = 2.4 + Math.sin(starAngle * 5.0) * 1.2;
            
            if (starDist < starRadius) {
              v = 1.0 * contrast; // Cut 5-Point Star
            } else {
              const isCross = (Math.abs(starCellX) <= 1 || Math.abs(starCellY) <= 1);
              v = isCross ? -0.75 * contrast : 0.0; // Raised Cross Grid
            }
            break;

          case 'cyber':
            const n1 = this._simplexNoise2D(symCol * scale, r * scale + seed);
            const n2 = Math.sin(twistedAngle * 6 + normY * 16);
            v = Math.sin((n1 + n2) * Math.PI * contrast);
            if (v > 0.25) v = 1.0;
            else if (v < -0.25) v = -0.8;
            else v = 0;
            break;

          case 'voronoi':
            const vx = (symCol / cols) * (8 * scale * 10);
            const vy = normY * (10 * scale * 10);
            v = this._voronoiCell(vx, vy, seed) * contrast;
            v = Math.max(-1.0, Math.min(1.0, (v - 0.45) * 2.2));
            break;

          case 'knurl':
            const k1 = Math.sin(twistedAngle * 12 + normY * 36);
            const k2 = Math.sin(twistedAngle * 12 - normY * 36);
            v = Math.max(-0.3, (k1 * k2) * 1.6 * contrast);
            break;

          case 'waves':
            v = Math.sin(twistedAngle * 8 + normY * 24) * Math.cos(normY * 12 + seed);
            v = Math.tanh(v * contrast * 1.5);
            break;

          case 'scales':
            const scaleY = normY * 18;
            const offset = (Math.floor(scaleY) % 2 === 0) ? 0 : Math.PI / 6;
            v = Math.sin(twistedAngle * 10 + offset) * Math.sin((scaleY % 1.0) * Math.PI);
            v = Math.pow(Math.max(0, v), 1.4) * contrast;
            break;

          case 'flutes':
            const spiral = twistedAngle * 6 + normY * Math.PI * 8;
            v = Math.sin(spiral);
            v = Math.pow(Math.abs(v), 0.7) * Math.sign(v) * contrast;
            break;

          case 'weave':
            const w1 = Math.floor((symCol / cols) * 32) % 2;
            const w2 = Math.floor(normY * 40) % 2;
            v = (w1 ^ w2) ? 0.75 * contrast : -0.75 * contrast;
            break;

          case 'turbulence':
            const t1 = this._simplexNoise2D(symCol * scale * 2, r * scale * 2 + seed);
            const t2 = this._simplexNoise2D(symCol * scale * 4 + 100, r * scale * 4 + seed);
            v = (t1 * 0.7 + t2 * 0.3) * contrast;
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

  // ─── 3D MESH GENERATOR ───────────────────────────────────────────
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

    const sleeveGeom = this._createSleeveGeometry();
    const sleeveMat = this._getMaterial(this.state.materialStyle);
    this.sleeveMesh = new THREE.Mesh(sleeveGeom, sleeveMat);
    this.sleeveMesh.castShadow = true;
    this.sleeveMesh.receiveShadow = true;
    this.modelGroup.add(this.sleeveMesh);

    if (this.state.showGlassTube) {
      const glassGeom = new THREE.CylinderGeometry(
        8.0, 8.0, this.state.length + 20, 32, 1, false
      );
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xe0f2fe,
        transmission: 0.92,
        opacity: 1,
        transparent: true,
        roughness: 0.05,
        ior: 1.5,
        thickness: 1.5,
        clearcoat: 1.0
      });
      this.glassMesh = new THREE.Mesh(glassGeom, glassMat);
      this.modelGroup.add(this.glassMesh);
    }

    if (this.state.geoNodesMode) {
      this._updateGeoNodesScatter();
    }

    this._updateMeshStatusOverlay(sleeveGeom);
  }

  _createSleeveGeometry() {
    const R_in = this.state.innerDiameter / 2.0;  // 8.1mm
    const R_out = this.state.outerDiameter / 2.0;
    const maxWall = R_out - R_in;
    const L = this.state.length;
    
    const cols = this.state.gridCols;
    const rows = this.state.gridRows;

    const vertices = [];
    const indices = [];
    const uvs = [];

    const halfL = L / 2.0;

    for (let r = 0; r <= rows; r++) {
      const normY = r / rows;
      const y = normY * L - halfL;
      const mapR = Math.min(r, rows - 1);

      for (let c = 0; c <= cols; c++) {
        const normX = c / cols;
        const angle = normX * Math.PI * 2.0;
        const mapC = c % cols;

        const depthVal = this.depthMatrix[mapC][mapR];
        
        let deltaR = 0;
        if (depthVal > 0) {
          deltaR = -Math.min(depthVal * this.state.maxCutDepth, maxWall - 0.4);
        } else if (depthVal < 0) {
          deltaR = Math.abs(depthVal) * this.state.maxExtrudeHeight;
        }

        const currR = R_out + deltaR;
        const x = Math.cos(angle) * currR;
        const z = Math.sin(angle) * currR;

        vertices.push(x, y, z);
        uvs.push(normX, normY);
      }
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i1 = r * (cols + 1) + c;
        const i2 = i1 + 1;
        const i3 = (r + 1) * (cols + 1) + c;
        const i4 = i3 + 1;

        indices.push(i1, i3, i2);
        indices.push(i2, i3, i4);
      }
    }

    const innerStartIdx = vertices.length / 3;
    for (let r = 0; r <= rows; r++) {
      const y = (r / rows) * L - halfL;
      for (let c = 0; c <= cols; c++) {
        const angle = (c / cols) * Math.PI * 2.0;
        const x = Math.cos(angle) * R_in;
        const z = Math.sin(angle) * R_in;

        vertices.push(x, y, z);
        uvs.push(c / cols, r / rows);
      }
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i1 = innerStartIdx + r * (cols + 1) + c;
        const i2 = i1 + 1;
        const i3 = innerStartIdx + (r + 1) * (cols + 1) + c;
        const i4 = i3 + 1;

        indices.push(i1, i2, i3);
        indices.push(i2, i4, i3);
      }
    }

    const topOuterStart = rows * (cols + 1);
    const topInnerStart = innerStartIdx + rows * (cols + 1);
    for (let c = 0; c < cols; c++) {
      const o1 = topOuterStart + c;
      const o2 = o1 + 1;
      const i1 = topInnerStart + c;
      const i2 = i1 + 1;

      indices.push(o1, o2, i1);
      indices.push(o2, i2, i1);
    }

    const botOuterStart = 0;
    const botInnerStart = innerStartIdx;
    for (let c = 0; c < cols; c++) {
      const o1 = botOuterStart + c;
      const o2 = o1 + 1;
      const i1 = botInnerStart + c;
      const i2 = i1 + 1;

      indices.push(o1, i1, o2);
      indices.push(o2, i1, i2);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    return geom;
  }

  _updateGeoNodesScatter() {
    const cols = this.state.gridCols;
    const rows = this.state.gridRows;
    const L = this.state.length;
    const R_out = this.state.outerDiameter / 2.0;

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
          const radialOffset = R_out + (val > 0 ? -val * this.state.maxCutDepth : Math.abs(val) * this.state.maxExtrudeHeight);
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
    switch (style) {
      case 'anodized':
        return new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.25, metalness: 0.85 });
      case 'neon':
        return new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.1, metalness: 0.9, emissive: 0x0369a1, emissiveIntensity: 0.2 });
      case 'emerald':
        return new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.3, metalness: 0.7 });
      case 'copper':
        return new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.2, metalness: 0.95 });
      case 'titanium':
      default:
        return new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.8 });
    }
  }

  exportSTL() {
    if (!this.sleeveMesh || !this.sleeveMesh.geometry) return;

    const exporter = new THREE.STLExporter();
    const stlData = exporter.parse(this.sleeveMesh, { binary: true });

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

    const promptCards = document.querySelectorAll('.prompt-card-btn');
    promptCards.forEach(card => {
      card.addEventListener('click', () => {
        const text = card.getAttribute('data-prompt-text');
        const inputEl = document.getElementById('aiJsonInput');
        if (inputEl) inputEl.value = text;
        this.copyChatbotSystemPrompt(text);
      });
    });

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

    const presetBtns = document.querySelectorAll('.preset-chip');
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const preset = btn.getAttribute('data-preset');
        this.state.patternPreset = preset;
        this.generateAIPattern(preset);
      });
    });

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

    const btnSTL = document.getElementById('btnExportSTL');
    if (btnSTL) {
      btnSTL.addEventListener('click', () => this.exportSTL());
    }

    const btnResetView = document.getElementById('btnResetView');
    if (btnResetView) {
      btnResetView.addEventListener('click', () => this._resetCamera());
    }
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

  _resetCamera() {
    if (this.camera && this.controls) {
      this.camera.position.set(45, 35, 75);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
  }

  _onResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
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
