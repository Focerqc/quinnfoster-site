/**
 * Experience 2 — Clean 16mm Tube Generator with Draggable Logo Deboss
 * Built from scratch with proper BufferGeometry cylinder construction.
 * 
 * Features:
 * - Proper subdivided cylinder (no extrude+bend hacks)
 * - Upload logo (image → heightmap, STL mesh)
 * - Interactive drag-to-position logo on cylinder surface
 * - CSG boolean deboss
 * - Binary STL export
 */

class TubeGenerator {
  constructor(container) {
    this.container = container || document.getElementById('viewport');
    
    this.state = {
      innerDiameter: 16.2,   // Locked for 16mm glass tubes
      outerDiameter: 21.0,   // Default OD
      length: 100.0,         // Tube length in mm
      // Logo state
      logoEnabled: false,
      logoGeometry: null,     // THREE.BufferGeometry
      wrapLogo: true,         // Wrap logo around cylinder curve (true) vs project flat (false)
      logoTheta: 0,           // Angle position on cylinder (radians)
      logoY: 0,               // Height position on cylinder (mm from center)
      logoScale: 16.0,        // Logo size in mm
      logoDepth: 0.8,         // Deboss cut depth or Emboss height in mm
      logoRotateCoarse: 0,    // Coarse rotation (degrees)
      logoRotateFine: 0,      // Fine rotation offset (degrees)
      logoRotate: 0,          // Total in-plane rotation (degrees)
      logoMode: 'deboss',     // 'deboss' (cut inward) or 'emboss' (extrude outward)
      logoUseCSG: true,       // Use true Boolean CSG cut (vs fallback mesh overlap)
      textAlign: 'center',    // 'left', 'center', 'right' for multiline text
    };

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.modelGroup = null;
    this.tubeMesh = null;
    this.logoPreviewMesh = null;
    this.logoHandleMesh = null;
    this.isDraggingLogo = false;
    this.isDragModeActive = false;
    this.isCSGPreviewActive = false;
    this.csgPreviewMesh = null;
    this.currentFullLogoText = '';
    this.isTextTruncated = true;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.viewportWidthA = 480;
    this.viewportHeightB = 540;

    this._init();
  }

  // ─── SCENE SETUP ───────────────────────────────────────────────
  _init() {
    this._initScene();
    this._initLighting();
    this._initControls();
    this._buildTube();
    this._initUI();
    this._initDragControls();
    this._animate();
    this._resetCamera();

    // Hide loader
    const loader = document.getElementById('viewportLoading');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.style.display = 'none', 300);
    }
  }

  _initScene() {
    const w = this.container.clientWidth || 600;
    const h = this.container.clientHeight || 480;

    this.scene = new THREE.Scene();
    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);

    this.camera = new THREE.PerspectiveCamera(45, w / h, 1, 1000);
    this.camera.position.set(50, 40, 80);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => this._onResize());
  }

  _initLighting() {
    // High-visibility CAD studio lighting with strong ambient light and multi-directional fills
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.95));

    // Main key light
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(50, 80, 60);
    this.scene.add(key);

    // Frontal fill light to directly illuminate front faces & debossed details
    const frontFill = new THREE.DirectionalLight(0xffffff, 0.8);
    frontFill.position.set(0, 30, 100);
    this.scene.add(frontFill);

    // Side blue fill light
    const fill = new THREE.DirectionalLight(0x38bdf8, 0.5);
    fill.position.set(-60, 40, -40);
    this.scene.add(fill);

    // Rim light for depth
    const rim = new THREE.DirectionalLight(0x818cf8, 0.6);
    rim.position.set(20, -50, -40);
    this.scene.add(rim);
  }

  _initControls() {
    if (THREE.OrbitControls) {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.minDistance = 5;
      this.controls.maxDistance = 500;
      this.controls.minPolarAngle = 0.01;
      this.controls.maxPolarAngle = Math.PI - 0.01;
    } else if (THREE.TrackballControls) {
      this.controls = new THREE.TrackballControls(this.camera, this.renderer.domElement);
      this.controls.rotateSpeed = 3.5;
      this.controls.zoomSpeed = 1.2;
      this.controls.panSpeed = 0.8;
      this.controls.noZoom = false;
      this.controls.noPan = false;
      this.controls.staticMoving = false;
      this.controls.dynamicDampingFactor = 0.18;
      this.controls.minDistance = 5;
      this.controls.maxDistance = 500;
    }
  }

  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.controls && this.controls.handleResize) {
      this.controls.handleResize();
    }
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    if (this.controls) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  _resetCamera() {
    if (!this.camera || !this.controls) return;
    const maxDim = Math.max(this.state.length, this.state.outerDiameter);
    const fovRad = (this.camera.fov * Math.PI) / 180;
    
    const wrapper = document.querySelector('.stl-generator-wrapper');
    const isStacked = wrapper && wrapper.classList.contains('layout-stacked');

    // Keep camera up vector standard so OrbitControls drag is never inverted
    this.camera.up.set(0, 1, 0);

    if (isStacked) {
      // Wide Mode: Lay model flat horizontally & zoom out comfortably for padding
      let dist = (maxDim / 2) / Math.tan(fovRad / 2) * 1.15;
      dist = Math.max(dist, 55);
      if (this.modelGroup) this.modelGroup.rotation.z = -Math.PI / 2;
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(0, dist * 0.15, dist * 0.65);
    } else {
      // Side View: Stand tube vertically
      let dist = (maxDim / 2) / Math.tan(fovRad / 2) * 1.45;
      dist = Math.max(dist, 70);
      if (this.modelGroup) this.modelGroup.rotation.z = 0;
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(dist * 0.45, dist * 0.35, dist * 0.85);
    }

    this.camera.lookAt(0, 0, 0);
    this.controls.update();
  }

  // ─── CYLINDER GEOMETRY (PROPER BUFFERGEOMETRY) ─────────────────
  _buildCylinderGeo(rInner, rOuter, height, radSegs = 64, hSegs = 50) {
    const positions = [];
    const normals = [];
    const indices = [];

    // Outer wall
    for (let h = 0; h <= hSegs; h++) {
      const y = -height / 2 + (h / hSegs) * height;
      for (let r = 0; r <= radSegs; r++) {
        const theta = (r / radSegs) * Math.PI * 2;
        const nx = Math.sin(theta);
        const nz = Math.cos(theta);
        positions.push(rOuter * nx, y, rOuter * nz);
        normals.push(nx, 0, nz);
      }
    }
    const outerCount = (radSegs + 1) * (hSegs + 1);

    // Inner wall
    for (let h = 0; h <= hSegs; h++) {
      const y = -height / 2 + (h / hSegs) * height;
      for (let r = 0; r <= radSegs; r++) {
        const theta = (r / radSegs) * Math.PI * 2;
        const nx = Math.sin(theta);
        const nz = Math.cos(theta);
        positions.push(rInner * nx, y, rInner * nz);
        normals.push(-nx, 0, -nz);
      }
    }

    // Outer wall faces
    for (let h = 0; h < hSegs; h++) {
      for (let r = 0; r < radSegs; r++) {
        const a = h * (radSegs + 1) + r;
        const b = a + 1;
        const c = a + (radSegs + 1);
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    // Inner wall faces (reversed winding)
    for (let h = 0; h < hSegs; h++) {
      for (let r = 0; r < radSegs; r++) {
        const a = outerCount + h * (radSegs + 1) + r;
        const b = a + 1;
        const c = a + (radSegs + 1);
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    // Top cap (annular ring)
    const topBase = positions.length / 3;
    for (let r = 0; r <= radSegs; r++) {
      const theta = (r / radSegs) * Math.PI * 2;
      const s = Math.sin(theta), c = Math.cos(theta);
      positions.push(rOuter * s, height / 2, rOuter * c);
      normals.push(0, 1, 0);
      positions.push(rInner * s, height / 2, rInner * c);
      normals.push(0, 1, 0);
    }
    for (let r = 0; r < radSegs; r++) {
      const o1 = topBase + r * 2, i1 = o1 + 1, o2 = o1 + 2, i2 = o1 + 3;
      indices.push(o1, o2, i1, i1, o2, i2);
    }

    // Bottom cap
    const botBase = positions.length / 3;
    for (let r = 0; r <= radSegs; r++) {
      const theta = (r / radSegs) * Math.PI * 2;
      const s = Math.sin(theta), c = Math.cos(theta);
      positions.push(rOuter * s, -height / 2, rOuter * c);
      normals.push(0, -1, 0);
      positions.push(rInner * s, -height / 2, rInner * c);
      normals.push(0, -1, 0);
    }
    for (let r = 0; r < radSegs; r++) {
      const o1 = botBase + r * 2, i1 = o1 + 1, o2 = o1 + 2, i2 = o1 + 3;
      indices.push(o1, i1, o2, i1, i2, o2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  // ─── BUILD / REBUILD TUBE MESH ─────────────────────────────────
  _buildTube() {
    if (this.isCSGPreviewActive) {
      this.exitCSGPreview();
    }
    // Remove old
    if (this.tubeMesh) {
      if (this.modelGroup) this.modelGroup.remove(this.tubeMesh);
      else this.scene.remove(this.tubeMesh);
      if (this.tubeMesh.geometry) this.tubeMesh.geometry.dispose();
    }
    if (this.logoPreviewMesh) {
      if (this.modelGroup) this.modelGroup.remove(this.logoPreviewMesh);
      else this.scene.remove(this.logoPreviewMesh);
    }

    const innerR = this.state.innerDiameter / 2;
    const outerR = this.state.outerDiameter / 2;
    const len = this.state.length;

    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8, // Bright satin aluminum / silver metallic
      metalness: 0.35,
      roughness: 0.35,
      side: THREE.DoubleSide,
    });

    const tubeGeo = this._buildCylinderGeo(innerR, outerR, len);
    this.tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    if (this.modelGroup) this.modelGroup.add(this.tubeMesh);
    else this.scene.add(this.tubeMesh);

    // Re-add logo preview if we have one
    if (this.state.logoEnabled && this.state.logoGeometry) {
      this._updateLogoPreview();
    }

    this._updateReadouts();
  }

  // ─── LOGO UPLOAD HANDLING ──────────────────────────────────────
  handleLogoUpload(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();

    this.setLogoTextDisplay(file.name);

    const reader = new FileReader();

    if (ext === 'stl') {
      reader.onload = (e) => this._processSTL(e.target.result);
      reader.readAsArrayBuffer(file);
    } else {
      // Image → heightmap lithograph
      reader.onload = (e) => this._processImage(e.target.result);
      reader.readAsDataURL(file);
    }
  }

  // ─── TEXT TRUNCATION & REVEAL HANDLERS (>30 CHARS) ─────────────
  setLogoTextDisplay(fullText) {
    this.currentFullLogoText = fullText || '';
    // Automatically toggle ON truncation anytime text is > 30 characters
    if (this.currentFullLogoText.length > 30) {
      this.isTextTruncated = true;
    } else {
      this.isTextTruncated = false;
    }
    this.updateLogoTextUI();
  }

  updateLogoTextUI() {
    const nameEl = document.getElementById('logoFileName');
    const detailsEl = document.getElementById('logoFileDetails');
    const toggleBtn = document.getElementById('btnToggleTextReveal');

    if (!detailsEl) return;

    if (!this.currentFullLogoText) {
      if (nameEl) nameEl.textContent = 'No file selected';
      detailsEl.style.display = 'none';
      if (toggleBtn) toggleBtn.style.display = 'none';
      return;
    }

    detailsEl.style.display = 'block';

    const textLen = this.currentFullLogoText.length;
    const isLongText = textLen > 30;

    if (isLongText && toggleBtn) {
      toggleBtn.style.display = 'inline-flex';
      toggleBtn.textContent = this.isTextTruncated ? `👁️ Show Full (${textLen} chars)` : '👁️ Truncate Text';
      toggleBtn.title = this.isTextTruncated ? `Click to reveal full text (${textLen} characters)` : 'Hide text longer than 30 characters';
    } else if (toggleBtn) {
      toggleBtn.style.display = 'none';
    }

    if (nameEl) {
      if (isLongText && this.isTextTruncated) {
        nameEl.textContent = this.currentFullLogoText.substring(0, 30) + '...';
      } else {
        nameEl.textContent = this.currentFullLogoText;
      }
    }
  }

  toggleTextReveal() {
    this.isTextTruncated = !this.isTextTruncated;
    this.updateLogoTextUI();
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

      // Front face (heightmap)
      for (let row = 0; row <= res; row++) {
        const v = row / res;
        for (let col = 0; col <= res; col++) {
          const u = col / res;
          const px = Math.min(res - 1, Math.floor(u * res));
          const py = Math.min(res - 1, Math.floor(v * res));
          const idx = (py * res + px) * 4;
          const brightness = (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]) / 255;
          positions.push(u - 0.5, 0.5 - v, brightness);
        }
      }

      // Front face indices
      for (let row = 0; row < res; row++) {
        for (let col = 0; col < res; col++) {
          const a = row * (res + 1) + col;
          const b = a + 1;
          const c = a + (res + 1);
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }

      // Back face (flat at z=0)
      const backStart = positions.length / 3;
      for (let row = 0; row <= res; row++) {
        for (let col = 0; col <= res; col++) {
          positions.push(col / res - 0.5, 0.5 - row / res, 0);
        }
      }
      for (let row = 0; row < res; row++) {
        for (let col = 0; col < res; col++) {
          const a = backStart + row * (res + 1) + col;
          const b = a + 1;
          const c = a + (res + 1);
          const d = c + 1;
          indices.push(a, b, c, b, d, c);
        }
      }

      // Side walls
      for (let col = 0; col < res; col++) {
        const ft = col, fb = col + 1;
        const bt = backStart + col, bb = backStart + col + 1;
        indices.push(ft, fb, bt, fb, bb, bt);
        const ft2 = res * (res + 1) + col, fb2 = ft2 + 1;
        const bt2 = backStart + res * (res + 1) + col, bb2 = bt2 + 1;
        indices.push(ft2, bt2, fb2, fb2, bt2, bb2);
      }
      for (let row = 0; row < res; row++) {
        const fl = row * (res + 1), fr = (row + 1) * (res + 1);
        const bl = backStart + fl, br = backStart + fr;
        indices.push(fl, bl, fr, fr, bl, br);
        const fl2 = row * (res + 1) + res, fr2 = (row + 1) * (res + 1) + res;
        const bl2 = backStart + fl2, br2 = backStart + fr2;
        indices.push(fl2, fr2, bl2, fr2, br2, bl2);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      this.state.logoGeometry = geo;
      this.state.logoEnabled = true;
      this._updateLogoPreview();
      this._showLogoControls(true);
    };
    img.src = dataUrl;
  }

  _processSTL(buffer) {
    try {
      // Validate that the buffer is not a 404 HTML page or a Git LFS pointer
      if (buffer.byteLength < 84) {
        throw new Error("File is too small to be a valid STL (must be at least 84 bytes). It may be corrupted or a text pointer.");
      }
      const dataView = new DataView(buffer);
      // Check if it starts with '<!DOCTYPE' or '<html' which happens if Cloudflare Pages returns a 404 page
      const firstBytes = [];
      for(let i=0; i<Math.min(10, buffer.byteLength); i++) firstBytes.push(dataView.getUint8(i));
      const firstString = String.fromCharCode(...firstBytes).toLowerCase();
      if (firstString.startsWith('<html') || firstString.startsWith('<!doc')) {
        throw new Error("The loaded file is an HTML web page, not a 3D model. This usually happens if the server returned a 404 Not Found page.");
      }
      if (firstString.startsWith('version ')) {
        throw new Error("The loaded file is a Git LFS text pointer, not the actual 3D model data. Make sure Cloudflare Pages is configured to download LFS assets.");
      }

      let geo;
      if (THREE.STLLoader) {
        const loader = new THREE.STLLoader();
        geo = loader.parse(buffer);
      } else {
        // Fallback binary STL parser
        geo = new THREE.BufferGeometry();
        const positions = [];
        const dataView = new DataView(buffer);
        const faces = dataView.getUint32(80, true);
        let offset = 84;
        for (let i = 0; i < faces; i++) {
          offset += 12; // skip normal
          for (let j = 0; j < 3; j++) {
            positions.push(
              dataView.getFloat32(offset, true),
              dataView.getFloat32(offset + 4, true),
              dataView.getFloat32(offset + 8, true)
            );
            offset += 12;
          }
          offset += 2; // attr bytes
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      }
      geo.center();
      geo.computeVertexNormals();

      this.state.logoGeometry = geo;
      this.state.logoEnabled = true;
      this._updateLogoPreview();
      this._showLogoControls(true);
    } catch (err) {
      console.error('STL parse error:', err);
      alert('Could not parse STL file. Error: ' + (err.message || err) + '\n\nPlease check the console for more details.');
    }
  }

  // ─── LOGO PREVIEW (POSITIONED ON CYLINDER SURFACE) ─────────────
  _updateLogoPreview() {
    if (this.isCSGPreviewActive) {
      this.exitCSGPreview();
    }
    if (this.logoPreviewMesh) {
      if (this.modelGroup) this.modelGroup.remove(this.logoPreviewMesh);
      else this.scene.remove(this.logoPreviewMesh);
      if (this.logoPreviewMesh.geometry) this.logoPreviewMesh.geometry.dispose();
      this.logoPreviewMesh = null;
    }

    if (!this.state.logoGeometry || !this.state.logoEnabled) return;

    const geo = this._getWrappedLogoGeo();
    if (!geo) return;

    const isEmboss = (this.state.logoMode === 'emboss');
    const mat = new THREE.MeshStandardMaterial({
      color: isEmboss ? 0xf97316 : 0xef4444, // Orange for Emboss, Red/Crimson for Deboss
      emissive: isEmboss ? 0xc2410c : 0x991b1b,
      emissiveIntensity: 0.45,
      metalness: 0.3,
      roughness: 0.3,
      transparent: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      depthTest: true,
    });

    this.logoPreviewMesh = new THREE.Mesh(geo, mat);
    if (this.modelGroup) this.modelGroup.add(this.logoPreviewMesh);
    else this.scene.add(this.logoPreviewMesh);

    // ─── 3D DRAG TARGET DOT / HANDLE ─────────────────
    if (this.logoHandleMesh) {
      if (this.modelGroup) this.modelGroup.remove(this.logoHandleMesh);
      else this.scene.remove(this.logoHandleMesh);
      this.logoHandleMesh = null;
    }

    const handleGroup = new THREE.Group();

    // Central target dot sphere (bright cyan)
    const sphereGeo = new THREE.SphereGeometry(1.3, 16, 16);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.9,
      metalness: 0.8,
      roughness: 0.2
    });
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    handleGroup.add(sphereMesh);

    // Outer target ring
    const ringGeo = new THREE.RingGeometry(1.8, 2.6, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    handleGroup.add(ringMesh);

    // Position handle dot at center of logo on cylinder surface
    const outerR = this.state.outerDiameter / 2;
    const hx = (outerR + 0.9) * Math.sin(this.state.logoTheta);
    const hy = this.state.logoY;
    const hz = (outerR + 0.9) * Math.cos(this.state.logoTheta);

    handleGroup.position.set(hx, hy, hz);
    handleGroup.rotation.y = this.state.logoTheta;

    handleGroup.visible = Boolean(this.isDragModeActive && this.state.logoEnabled);
    this.logoHandleMesh = handleGroup;

    if (this.modelGroup) this.modelGroup.add(this.logoHandleMesh);
    else this.scene.add(this.logoHandleMesh);
  }

  // ─── DRAG MODE TOGGLE & HANDLE SYSTEM ─────────────────────────
  setDragMode(enabled) {
    this.isDragModeActive = Boolean(enabled && this.state.logoEnabled);
    const canvas = this.renderer ? this.renderer.domElement : null;
    const btn = document.getElementById('btnToggleDragMode');
    const card = document.getElementById('dragToggleCard');
    const btnText = document.getElementById('btnDragToggleText');
    const notice = document.getElementById('dragModeNotice');

    if (this.isDragModeActive) {
      if (this.controls) this.controls.enabled = false; // Lock camera completely

      if (btn) btn.classList.add('active');
      if (card) card.classList.add('active');
      if (btnText) btnText.textContent = '🎯 Drag Mode: ON (Camera Locked)';
      if (notice) notice.style.display = 'flex';
      if (canvas) canvas.style.cursor = 'grab';
    } else {
      if (this.controls) this.controls.enabled = true; // Unlock camera
      this.isDraggingLogo = false;

      if (btn) btn.classList.remove('active');
      if (card) card.classList.remove('active');
      if (btnText) btnText.textContent = 'Drag Mode: OFF (Click to Drag)';
      if (notice) notice.style.display = 'none';
      if (canvas) canvas.style.cursor = '';
    }

    if (this.logoHandleMesh) {
      this.logoHandleMesh.visible = this.isDragModeActive;
    }
  }

  // ─── INTERACTIVE DRAG LOGO POSITIONING ─────────────────────────
  _initDragControls() {
    const canvas = this.renderer.domElement;

    const performRaycastDrag = (e) => {
      this._updateMouse(e);
      this.raycaster.setFromCamera(this.mouse, this.camera);

      if (this.tubeMesh) {
        const hits = this.raycaster.intersectObject(this.tubeMesh);
        if (hits.length > 0) {
          const pt = hits[0].point.clone();
          if (this.modelGroup) {
            this.modelGroup.worldToLocal(pt);
          }
          this.state.logoTheta = Math.atan2(pt.x, pt.z);
          this.state.logoY = pt.y;
          this._updateLogoPreview();
        }
      }
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.state.logoEnabled || !this.isDragModeActive || this.isCSGPreviewActive) return;
      if (e.button !== 0) return; // left click only

      this.isDraggingLogo = true;
      canvas.style.cursor = 'grabbing';
      performRaycastDrag(e);
      e.preventDefault();
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!this.isDragModeActive || !this.state.logoEnabled || this.isCSGPreviewActive) return;

      if (this.isDraggingLogo || (e.buttons === 1)) {
        this.isDraggingLogo = true;
        canvas.style.cursor = 'grabbing';
        performRaycastDrag(e);
      } else {
        canvas.style.cursor = 'grab';
      }
    });

    const stopDragging = () => {
      if (this.isDraggingLogo) {
        this.isDraggingLogo = false;
        if (this.isDragModeActive) canvas.style.cursor = 'grab';
      }
    };

    canvas.addEventListener('pointerup', stopDragging);
    canvas.addEventListener('pointerleave', stopDragging);
  }

  _updateMouse(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  // ─── LOGO MODE TOGGLE (DEBOSS vs EMBOSS) ─────────────────────
  setLogoMode(mode) {
    this.state.logoMode = mode;
    const btnDeboss = document.getElementById('btnModeDeboss');
    const btnEmboss = document.getElementById('btnModeEmboss');
    const toggleThroughCutContainer = document.getElementById('toggleThroughCutContainer');
    const sliderContainer = document.getElementById('depthSliderContainer');
    const debossMethodGroup = document.getElementById('debossMethodGroup');

    if (mode === 'emboss') {
      if (btnDeboss) btnDeboss.className = 'segmented-btn';
      if (btnEmboss) btnEmboss.className = 'segmented-btn active-emboss';
      if (toggleThroughCutContainer) toggleThroughCutContainer.style.display = 'none';
      if (sliderContainer) sliderContainer.style.display = 'flex';
      if (debossMethodGroup) debossMethodGroup.style.display = 'none';
    } else {
      if (btnDeboss) btnDeboss.className = 'segmented-btn active-deboss';
      if (btnEmboss) btnEmboss.className = 'segmented-btn';
      if (toggleThroughCutContainer) toggleThroughCutContainer.style.display = 'flex';
      if (sliderContainer) sliderContainer.style.display = this.state.logoThroughCut ? 'none' : 'flex';
      if (debossMethodGroup) debossMethodGroup.style.display = 'flex';
    }

    this._updateLogoPreview();
  }

  // ─── HELPER: WRAP LOGO GEOMETRY ONTO CYLINDER ──────────────────
  _getWrappedLogoGeo(forCsgCutter = false) {
    if (!this.state.logoGeometry) return null;
    const innerR = this.state.innerDiameter / 2;
    const outerR = this.state.outerDiameter / 2;
    const geo = this.state.logoGeometry.clone();
    geo.computeBoundingBox();
    const bbox = geo.boundingBox;
    const origW = bbox.max.x - bbox.min.x;
    const origH = bbox.max.y - bbox.min.y;
    const origD = Math.max(0.001, bbox.max.z - bbox.min.z);
    if (origW === 0 || origH === 0) return null;

    const targetSize = this.state.logoScale;
    const isEmboss = (this.state.logoMode === 'emboss');
    let targetDepth = this.state.logoDepth;

    if (this.state.logoThroughCut && !isEmboss) {
      targetDepth = (outerR - innerR) + 2.0; // Cut 2mm past inner wall to pierce cleanly
    }

    const scale = targetSize / Math.max(origW, origH);

    const rotRad = (this.state.logoRotate * Math.PI) / 180;
    if (rotRad) geo.rotateZ(rotRad);

    geo.scale(scale, scale, targetDepth / origD);
    geo.center();

    const posAttr = geo.attributes.position;
    
    let safeMaxCut;
    if (this.state.logoThroughCut && !isEmboss) {
      safeMaxCut = Math.max(0, outerR - targetDepth); // Allow it to reach the void, but clamp at center
    } else {
      safeMaxCut = Math.max(innerR + 0.2, outerR - targetDepth); // Clamp inside wall
    }

    const wrapLogo = (this.state.wrapLogo !== undefined) ? this.state.wrapLogo : (document.getElementById('toggleWrapLogo')?.checked ?? true);

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const normZ = Math.min(1, Math.max(0, (z + targetDepth / 2) / targetDepth)); // 0 (bottom/back) to 1 (top/front)

      let r;
      if (isEmboss) {
        // EMBOSS (Raised Extrude): Base sits slightly embedded (-0.05mm), top extends outward (+targetDepth)
        r = (outerR - 0.05) + normZ * (targetDepth + 0.05);
      } else {
        if (forCsgCutter) {
          // CSG Cutter tool: Top extends past outer skin (+0.6mm) to slice skin cleanly, bottom reaches safeMaxCut
          const topR = outerR + 0.6;
          r = safeMaxCut + normZ * (topR - safeMaxCut);
        } else {
          // DEBOSS (Recessed Cut): Top sits flush at outerR (+0.05mm), bottom penetrates INWARD to safeMaxCut
          r = safeMaxCut + normZ * (outerR + 0.05 - safeMaxCut);
        }
      }

      if (wrapLogo) {
        const theta = x / outerR + this.state.logoTheta;
        posAttr.setXYZ(i,
          r * Math.sin(theta),
          y + this.state.logoY,
          r * Math.cos(theta)
        );
      } else {
        // Flat Projection
        const x_local = x;
        const y_local = y + this.state.logoY;
        const z_local = r;

        const sinT = Math.sin(this.state.logoTheta);
        const cosT = Math.cos(this.state.logoTheta);

        // Rotate (x, z) tangentially around the cylinder
        posAttr.setXYZ(i,
          x_local * cosT + z_local * sinT,
          y_local,
          -x_local * sinT + z_local * cosT
        );
      }
    }
    geo.computeVertexNormals();
    return geo;
  }

  // ─── HELPER: MERGE BUFFER GEOMETRIES ───────────────────────────
  _mergeBufferGeometries(geometries) {
    const validGeos = (geometries || []).filter(g => g && (g.isBufferGeometry || g.attributes?.position));
    if (validGeos.length === 0) return new THREE.BufferGeometry();
    if (validGeos.length === 1) return validGeos[0].clone();

    if (THREE.BufferGeometryUtils && THREE.BufferGeometryUtils.mergeBufferGeometries) {
      const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(validGeos, false);
      if (merged) return merged;
    }

    const nonIndexedList = validGeos.map(g => g.index ? g.toNonIndexed() : g.clone());
    let totalVerts = 0;
    nonIndexedList.forEach(g => {
      if (g.attributes && g.attributes.position) {
        totalVerts += g.attributes.position.count;
      }
    });

    const mergedPositions = new Float32Array(totalVerts * 3);
    let offset = 0;
    nonIndexedList.forEach(g => {
      if (g.attributes && g.attributes.position) {
        const pos = g.attributes.position.array;
        mergedPositions.set(pos, offset);
        offset += pos.length;
      }
    });

    const mergedGeo = new THREE.BufferGeometry();
    mergedGeo.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
    mergedGeo.computeVertexNormals();
    return mergedGeo;
  }

  // ─── PROGRESS MODAL HELPERS ───────────────────────────────────
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

    if (modal && modal.style.display === 'none') {
      modal.style.display = 'flex';
    }
    if (!this.progressStartTime) {
      this._startProgressTimer();
    }

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

  // ─── ASYNC NON-BLOCKING CSG GEOMETRY COMPUTATION ──────────────
  async _computeCSGGeometry() {
    const innerR = this.state.innerDiameter / 2;
    const outerR = this.state.outerDiameter / 2;
    const len = this.state.length;

    const tubeGeo = this._buildCylinderGeo(innerR, outerR, len);
    let exportGeo = tubeGeo;

    if (this.state.logoEnabled && this.state.logoGeometry) {
      this._updateProgressModal(30, 'Processing 3D CAD geometry...');
      await new Promise(r => setTimeout(r, 10));

      const logoWrappedGeo = this._getWrappedLogoGeo();

      if (logoWrappedGeo) {
        if (this.state.logoMode === 'emboss') {
          this._updateProgressModal(80, 'Fusing embossed 3D relief mesh...');
          await new Promise(r => setTimeout(r, 10));
          exportGeo = this._mergeBufferGeometries([tubeGeo, logoWrappedGeo]);
        } else {
          let csgSuccess = false;
          if (this.state.logoUseCSG && typeof CSG !== 'undefined') {
            try {
              this._updateProgressModal(50, 'Executing 3D Boolean CAD cut...');
              await new Promise(r => setTimeout(r, 10));

              const csgCutterGeo = this._getWrappedLogoGeo(true);
              if (csgCutterGeo) {
                const solidOuterGeo = new THREE.CylinderGeometry(outerR, outerR, len, 32, 1);
                const solidOuterMesh = new THREE.Mesh(solidOuterGeo);
                const innerCoreGeo = new THREE.CylinderGeometry(innerR, innerR, len + 4, 32, 1);
                const innerCoreMesh = new THREE.Mesh(innerCoreGeo);
                const cutMesh = new THREE.Mesh(csgCutterGeo);

                solidOuterMesh.updateMatrixWorld();
                innerCoreMesh.updateMatrixWorld();
                cutMesh.updateMatrixWorld();

                const outerCsg = CSG.fromMesh(solidOuterMesh, 0);
                const cutCsg = CSG.fromMesh(cutMesh, 1);
                const innerCsg = CSG.fromMesh(innerCoreMesh, 2);

                const debossedSolidCsg = outerCsg.subtract(cutCsg);
                const finalTubeCsg = debossedSolidCsg.subtract(innerCsg);

                const resultMesh = CSG.toMesh(finalTubeCsg, solidOuterMesh.matrix);
                if (resultMesh && resultMesh.geometry) {
                  exportGeo = resultMesh.geometry;
                  csgSuccess = true;
                }
              }
            } catch (csgErr) {
              console.warn('CSG Boolean cut note:', csgErr.message || csgErr);
            }
          }

          if (!csgSuccess) {
            exportGeo = this._mergeBufferGeometries([tubeGeo, logoWrappedGeo]);
          }
        }
      }
    }
    return exportGeo;
  }

  // ─── IN-VIEWPORT CSG FINISHED RESULT PREVIEW ───────────────────
  async toggleCSGPreview() {
    if (this.isCSGPreviewActive) {
      this.exitCSGPreview();
      return;
    }

    const btn = document.getElementById('btnPreviewCSG');
    const btnText = document.getElementById('btnPreviewCSGText');

    if (btn) btn.classList.add('is-processing');
    this._showProgressModal();
    this._updateProgressModal(10, 'Building 3D CSG Solid Preview...');

    try {
      const csgGeo = await this._computeCSGGeometry();

      // Hide live editing meshes and automatically turn OFF Drag Mode
      if (this.tubeMesh) this.tubeMesh.visible = false;
      if (this.logoPreviewMesh) this.logoPreviewMesh.visible = false;
      if (this.logoHandleMesh) this.logoHandleMesh.visible = false;

      this.setDragMode(false); // Automatically disable Drag Mode for smooth 3D CAD inspection

      // Clean up previous preview if exists
      if (this.csgPreviewMesh) {
        if (this.modelGroup) this.modelGroup.remove(this.csgPreviewMesh);
        else if (this.scene) this.scene.remove(this.csgPreviewMesh);
        if (this.csgPreviewMesh.geometry) this.csgPreviewMesh.geometry.dispose();
        this.csgPreviewMesh = null;
      }

      // Sleek polished dark-steel CAD material so solid debossed cuts contrast vividly
      const mat = new THREE.MeshStandardMaterial({
        color: 0x475569,       // Dark slate / steel graphite tint
        metalness: 0.65,       // Metallic polish for specular edge reflections
        roughness: 0.25,
        side: THREE.DoubleSide
      });

      this.csgPreviewMesh = new THREE.Mesh(csgGeo, mat);
      if (this.modelGroup) this.modelGroup.add(this.csgPreviewMesh);
      else this.scene.add(this.csgPreviewMesh);

      this.isCSGPreviewActive = true;

      if (btnText) btnText.textContent = '✏️ Exit CSG Preview (Edit Mode)';
      if (btn) {
        btn.style.background = 'rgba(239, 68, 68, 0.25)';
        btn.style.borderColor = 'rgba(239, 68, 68, 0.6)';
        btn.style.color = '#fca5a5';
      }

      const notice = document.getElementById('csgPreviewNotice');
      if (notice) notice.style.display = 'flex';

      this._updateProgressModal(100, 'Solid CSG Preview Ready!');
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error('CSG Preview failed:', err);
      alert('Could not generate CSG preview: ' + err.message);
    } finally {
      this._hideProgressModal();
      if (btn) btn.classList.remove('is-processing');
    }
  }

  exitCSGPreview() {
    if (!this.isCSGPreviewActive) return;

    if (this.csgPreviewMesh) {
      if (this.modelGroup) this.modelGroup.remove(this.csgPreviewMesh);
      else if (this.scene) this.scene.remove(this.csgPreviewMesh);
      if (this.csgPreviewMesh.geometry) this.csgPreviewMesh.geometry.dispose();
      this.csgPreviewMesh = null;
    }

    if (this.tubeMesh) this.tubeMesh.visible = true;
    if (this.logoPreviewMesh) this.logoPreviewMesh.visible = true;
    if (this.logoHandleMesh) this.logoHandleMesh.visible = true;

    this.isCSGPreviewActive = false;

    const btn = document.getElementById('btnPreviewCSG');
    const btnText = document.getElementById('btnPreviewCSGText');
    if (btnText) btnText.textContent = '✨ Preview Finished CSG';
    if (btn) {
      btn.style.background = 'rgba(99, 102, 241, 0.2)';
      btn.style.borderColor = 'rgba(99, 102, 241, 0.5)';
      btn.style.color = '#fff';
    }

    const notice = document.getElementById('csgPreviewNotice');
    if (notice) notice.style.display = 'none';
  }

  // ─── ASYNC NON-BLOCKING STL EXPORT (BINARY) ───────────────────
  async exportSTL() {
    const btn = document.getElementById('downloadStlBtn');
    const originalContent = btn ? btn.innerHTML : '';

    if (btn) {
      btn.classList.add('is-processing');
      btn.innerHTML = `<span class="spinner-sm"></span> Generating 3D STL File...`;
    }

    this._showProgressModal();

    try {
      this._updateProgressModal(10, 'Initializing 3D CAD engine...');
      await new Promise(r => setTimeout(r, 20));

      const exportGeo = await this._computeCSGGeometry();

      this._updateProgressModal(95, 'Compiling binary STL file buffer...');
      await new Promise(r => setTimeout(r, 20));

      const stlData = this._geometryToSTL(exportGeo);
      const blob = new Blob([stlData], { type: 'application/octet-stream' });
      const modeName = this.state.logoMode === 'emboss' ? 'Embossed' : 'Debossed';
      const fileName = `Tube_16mm_${modeName}_${this.state.length.toFixed(0)}mm.stl`;

      this._updateProgressModal(100, '3D STL File Ready! Downloading...');
      await new Promise(r => setTimeout(r, 150));

      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (link.parentNode) link.parentNode.removeChild(link);
        URL.revokeObjectURL(link.href);
      }, 150);
    } catch (err) {
      console.error('Export STL failed:', err);
      alert('Could not export STL file: ' + err.message);
    } finally {
      this._hideProgressModal();
      if (btn) {
        btn.classList.remove('is-processing');
        btn.innerHTML = originalContent;
      }
    }
  }

  _geometryToSTL(geometry) {
    // Use Three.js STLExporter if available
    if (THREE.STLExporter) {
      const exporter = new THREE.STLExporter();
      const mesh = new THREE.Mesh(geometry);
      return exporter.parse(mesh, { binary: true });
    }

    // Fallback: manual binary STL writer
    let pos = geometry.attributes.position;
    let idx = geometry.index;
    let triCount;

    if (idx) {
      triCount = idx.count / 3;
    } else {
      triCount = pos.count / 3;
    }

    const bufferSize = 84 + triCount * 50;
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    // Header (80 bytes)
    for (let i = 0; i < 80; i++) view.setUint8(i, 0);
    view.setUint32(80, triCount, true);

    let offset = 84;
    for (let t = 0; t < triCount; t++) {
      let i0, i1, i2;
      if (idx) {
        i0 = idx.getX(t * 3);
        i1 = idx.getX(t * 3 + 1);
        i2 = idx.getX(t * 3 + 2);
      } else {
        i0 = t * 3;
        i1 = t * 3 + 1;
        i2 = t * 3 + 2;
      }

      const ax = pos.getX(i0), ay = pos.getY(i0), az = pos.getZ(i0);
      const bx = pos.getX(i1), by = pos.getY(i1), bz = pos.getZ(i1);
      const cx = pos.getX(i2), cy = pos.getY(i2), cz = pos.getZ(i2);

      // Face normal
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

      view.setFloat32(offset, nx / len, true); offset += 4;
      view.setFloat32(offset, ny / len, true); offset += 4;
      view.setFloat32(offset, nz / len, true); offset += 4;

      view.setFloat32(offset, ax, true); offset += 4;
      view.setFloat32(offset, ay, true); offset += 4;
      view.setFloat32(offset, az, true); offset += 4;
      view.setFloat32(offset, bx, true); offset += 4;
      view.setFloat32(offset, by, true); offset += 4;
      view.setFloat32(offset, bz, true); offset += 4;
      view.setFloat32(offset, cx, true); offset += 4;
      view.setFloat32(offset, cy, true); offset += 4;
      view.setFloat32(offset, cz, true); offset += 4;

      view.setUint16(offset, 0, true); offset += 2;
    }

    return buffer;
  }

  // ─── UI BINDINGS ───────────────────────────────────────────────
  _initUI() {
    const bind = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(event, handler);
    };

    // Length slider
    bind('inputLength', 'input', (e) => {
      this.state.length = parseFloat(e.target.value);
      this._buildTube();
      this._resetCamera();
    });

    // OD slider
    bind('inputOD', 'input', (e) => {
      this.state.outerDiameter = parseFloat(e.target.value);
      this._buildTube();
    });

    // Logo file upload
    const browseBtn = document.getElementById('btnBrowseLogo');
    const fileInput = document.getElementById('inputLogoFile');
    if (browseBtn && fileInput) {
      browseBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleLogoUpload(e.target.files[0]);
        }
      });
    }

    // Initialize STL & Logo Library Modal
    this._initLibraryModal();

    // Initialize Text to STL Modal
    this._initTextStlModal();

    // Logo scale percentage input handling
    const updateLogoScaleFromPercent = (percentVal) => {
      let percent = parseFloat(percentVal);
      if (isNaN(percent) || percent <= 0) percent = 100;
      this.state.logoScalePercent = percent;
      this.state.logoScale = (percent / 100) * 16.0;
      
      const inputEl = document.getElementById('inputLogoScalePercent');
      if (inputEl && parseFloat(inputEl.value) !== percent) {
        inputEl.value = percent;
      }
      
      const readout = document.getElementById('readoutLogoScale');
      if (readout) {
        readout.textContent = `${percent.toFixed(0)}% (${this.state.logoScale.toFixed(1)} mm)`;
      }
      this._updateLogoPreview();
    };

    bind('inputLogoScalePercent', 'input', (e) => updateLogoScaleFromPercent(e.target.value));
    bind('inputLogoScalePercent', 'change', (e) => updateLogoScaleFromPercent(e.target.value));

    // Scale preset buttons (100%, 500%, 1000%, 4000%)
    document.querySelectorAll('.btn-scale-preset').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const val = e.currentTarget.getAttribute('data-scale');
        if (val) updateLogoScaleFromPercent(val);
      });
    });

    // Logo rotation slider (Coarse & Fine) & quick rotate 90 deg buttons
    const updateLogoRotateReadout = () => {
      this.state.logoRotate = (this.state.logoRotateCoarse || 0) + (this.state.logoRotateFine || 0);
      const readoutCoarse = document.getElementById('readoutLogoRotate');
      const readoutFine = document.getElementById('readoutLogoRotateFine');
      if (readoutCoarse) {
        readoutCoarse.textContent = `${this.state.logoRotate.toFixed(2)}°`;
      }
      if (readoutFine) {
        const fineVal = this.state.logoRotateFine || 0;
        const sign = fineVal > 0 ? '+' : '';
        readoutFine.textContent = `${sign}${fineVal.toFixed(2)}°`;
      }
    };

    bind('inputLogoRotate', 'input', (e) => {
      this.state.logoRotateCoarse = parseFloat(e.target.value);
      updateLogoRotateReadout();
      this._updateLogoPreview();
    });

    bind('inputLogoRotateFine', 'input', (e) => {
      this.state.logoRotateFine = parseFloat(e.target.value);
      updateLogoRotateReadout();
      this._updateLogoPreview();
    });

    bind('btnResetRotateFine', 'click', () => {
      this.state.logoRotateFine = 0;
      const fineSlider = document.getElementById('inputLogoRotateFine');
      if (fineSlider) fineSlider.value = 0;
      updateLogoRotateReadout();
      this._updateLogoPreview();
    });

    bind('btnRotateCCW', 'click', () => {
      this.state.logoRotateCoarse = ((this.state.logoRotateCoarse || 0) - 90 + 360) % 360;
      const slider = document.getElementById('inputLogoRotate');
      if (slider) slider.value = this.state.logoRotateCoarse;
      updateLogoRotateReadout();
      this._updateLogoPreview();
    });

    bind('btnRotateCW', 'click', () => {
      this.state.logoRotateCoarse = ((this.state.logoRotateCoarse || 0) + 90) % 360;
      const slider = document.getElementById('inputLogoRotate');
      if (slider) slider.value = this.state.logoRotateCoarse;
      updateLogoRotateReadout();
      this._updateLogoPreview();
    });

    // Logo depth
    bind('inputLogoDepth', 'input', (e) => {
      this.state.logoDepth = parseFloat(e.target.value);
      const readout = document.getElementById('readoutLogoDepth');
      if (readout) readout.textContent = `${this.state.logoDepth.toFixed(1)} mm`;
      this._updateLogoPreview();
    });

    // Logo through cut toggle
    bind('toggleThroughCut', 'change', (e) => {
      this.state.logoThroughCut = e.target.checked;
      const sliderContainer = document.getElementById('depthSliderContainer');
      if (sliderContainer) {
        sliderContainer.style.display = this.state.logoThroughCut ? 'none' : 'flex';
      }
      this._updateLogoPreview();
    });

    // Reset camera
    bind('resetCameraBtn', 'click', () => this._resetCamera());

    // 3D Navigation Rotation Pad Gizmo - Orbits Camera smoothly using Spherical Coordinates
    const stepAngle = Math.PI / 12; // 15° step angle
    const orbitCamera = (deltaHorizontal, deltaVertical) => {
      if (!this.camera || !this.controls) return;
      const target = this.controls.target || new THREE.Vector3(0, 0, 0);

      const offset = this.camera.position.clone().sub(target);
      let radius = offset.length();
      if (radius < 0.001) radius = 50;

      let theta = Math.atan2(offset.x, offset.z);
      let phi = Math.acos(Math.min(Math.max(offset.y / radius, -1.0), 1.0));

      theta += deltaHorizontal;
      phi = Math.min(Math.max(phi + deltaVertical, 0.01), Math.PI - 0.01);

      offset.x = radius * Math.sin(phi) * Math.sin(theta);
      offset.y = radius * Math.cos(phi);
      offset.z = radius * Math.sin(phi) * Math.cos(theta);

      this.camera.position.copy(target).add(offset);
      this.camera.lookAt(target);
      if (this.controls.update) this.controls.update();
    };

    bind('btnNavUp', 'click', (e) => { e.stopPropagation(); orbitCamera(0, -stepAngle); });
    bind('btnNavDown', 'click', (e) => { e.stopPropagation(); orbitCamera(0, stepAngle); });
    bind('btnNavLeft', 'click', (e) => { e.stopPropagation(); orbitCamera(stepAngle, 0); });
    bind('btnNavRight', 'click', (e) => { e.stopPropagation(); orbitCamera(-stepAngle, 0); });
    bind('btnNavCenter', 'click', (e) => { e.stopPropagation(); this._resetCamera(); });

    // Dynamic Viewport Dimension Input (Width in View A, Height in View B)
    this._updateDimensionUI();
    this._applyViewportDimension(this.viewportWidthA);

    const sizeInput = document.getElementById('viewportSizeInput') || document.getElementById('viewportWidthInput');
    if (sizeInput) {
      const handleInput = (e) => this._applyViewportDimension(e.target.value);
      sizeInput.addEventListener('input', handleInput);
      sizeInput.addEventListener('change', handleInput);
    }

    // Layout Toggle (View A / View B)
    bind('toggleLayoutBtn', 'click', () => {
      const wrapper = document.querySelector('.stl-generator-wrapper');
      const btnText = document.getElementById('layoutBtnText');
      if (wrapper) {
        const isStacked = wrapper.classList.toggle('layout-stacked');
        if (btnText) {
          btnText.textContent = isStacked ? 'View B (Stacked) • Switch to View A' : 'View A (Side-by-Side) • Switch to View B';
        }

        // Update UI label/tooltip/input value and apply current mode dimension
        this._updateDimensionUI();
        if (isStacked) {
          this._applyViewportDimension(this.viewportHeightB);
        } else {
          this._applyViewportDimension(this.viewportWidthA);
        }

        setTimeout(() => {
          this._onResize();
          this._resetCamera();
        }, 50);
      }
    });

    // Download STL
    bind('downloadStlBtn', 'click', () => this.exportSTL());

    // Logo Mode Segmented Buttons (Deboss Cut vs Emboss Extrude)
    bind('btnModeDeboss', 'click', () => this.setLogoMode('deboss'));
    bind('btnModeEmboss', 'click', () => this.setLogoMode('emboss'));

    // Toggle CSG Mode
    bind('toggleCSG', 'change', (e) => {
      this.state.logoUseCSG = e.target.checked;
    });

    // Toggle Wrap Logo Mode
    bind('toggleWrapLogo', 'change', (e) => {
      this.state.wrapLogo = e.target.checked;
      this._updateLogoPreview();
    });

    // Toggle Drag Mode
    bind('btnToggleDragMode', 'click', () => {
      this.setDragMode(!this.isDragModeActive);
    });

    bind('btnExitDragMode', 'click', () => {
      this.setDragMode(false);
    });

    // CSG Solid Preview
    bind('btnPreviewCSG', 'click', () => this.toggleCSGPreview());
    bind('btnExitCsgPreview', 'click', () => this.exitCSGPreview());

    // Text Truncation Reveal Toggle (>30 chars)
    bind('btnToggleTextReveal', 'click', () => this.toggleTextReveal());

    // Remove logo
    bind('btnRemoveLogo', 'click', () => {
      this.setDragMode(false);
      this.state.logoEnabled = false;
      this.state.logoGeometry = null;
      if (this.logoPreviewMesh) {
        if (this.modelGroup) this.modelGroup.remove(this.logoPreviewMesh);
        else if (this.scene) this.scene.remove(this.logoPreviewMesh);
        if (this.logoPreviewMesh.geometry) this.logoPreviewMesh.geometry.dispose();
        this.logoPreviewMesh = null;
      }
      if (this.logoHandleMesh) {
        if (this.modelGroup) this.modelGroup.remove(this.logoHandleMesh);
        else if (this.scene) this.scene.remove(this.logoHandleMesh);
        this.logoHandleMesh = null;
      }
      this._showLogoControls(false);
      this.setLogoTextDisplay('');
    });
  }

  // ─── TEXT TO STL GENERATOR (MULTILINE & ALIGNMENT SUPPORT) ───────────
  _initTextStlModal() {
    const modal = document.getElementById('textStlModal');
    const openBtn = document.getElementById('btnOpenTextModal');
    const closeBtn = document.getElementById('closeTextModalBtn');
    const generateBtn = document.getElementById('generateTextStlBtn');

    if (openBtn && modal) openBtn.addEventListener('click', () => modal.style.display = 'flex');
    if (closeBtn && modal) closeBtn.addEventListener('click', () => modal.style.display = 'none');
    if (modal) modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });

    // Inputs
    const sizeInput = document.getElementById('textStlSize');
    const sizeOut = document.getElementById('textStlSizeOut');
    if (sizeInput) sizeInput.addEventListener('input', (e) => {
      if(sizeOut) sizeOut.textContent = e.target.value + ' mm';
    });

    const depthInput = document.getElementById('textStlDepth');
    const depthOut = document.getElementById('textStlDepthOut');
    if (depthInput) depthInput.addEventListener('input', (e) => {
      if(depthOut) depthOut.textContent = parseFloat(e.target.value).toFixed(1) + ' mm';
    });

    // Text Alignment Segmented Controls
    const btnLeft = document.getElementById('btnAlignLeft');
    const btnCenter = document.getElementById('btnAlignCenter');
    const btnRight = document.getElementById('btnAlignRight');

    const setAlign = (align) => {
      this.state.textAlign = align;
      if (btnLeft) btnLeft.className = align === 'left' ? 'segmented-btn active-deboss' : 'segmented-btn';
      if (btnCenter) btnCenter.className = align === 'center' ? 'segmented-btn active-deboss' : 'segmented-btn';
      if (btnRight) btnRight.className = align === 'right' ? 'segmented-btn active-deboss' : 'segmented-btn';
    };

    if (btnLeft) btnLeft.addEventListener('click', () => setAlign('left'));
    if (btnCenter) btnCenter.addEventListener('click', () => setAlign('center'));
    if (btnRight) btnRight.addEventListener('click', () => setAlign('right'));

    // Text input character counter
    const textInput = document.getElementById('textStlInput');
    const textLenOut = document.getElementById('textLengthReadout');

    const updateTextModalCounter = () => {
      if (!textInput) return;
      const len = textInput.value.length;
      if (textLenOut) textLenOut.textContent = `${len} char${len === 1 ? '' : 's'}`;
    };

    if (textInput) {
      textInput.addEventListener('input', updateTextModalCounter);
      updateTextModalCounter();
    }

    const applyBtn = document.getElementById('applyTextBtn');

    if (generateBtn) {
      generateBtn.addEventListener('click', () => this._generateTextStl('download'));
    }
    if (applyBtn) {
      applyBtn.addEventListener('click', () => this._generateTextStl('apply'));
    }
  }

  _generateTextStl(action = 'download') {
    const text = document.getElementById('textStlInput')?.value || 'Hello!';
    const size = parseFloat(document.getElementById('textStlSize')?.value || 20);
    const depth = parseFloat(document.getElementById('textStlDepth')?.value || 2.0);

    const btnId = action === 'apply' ? 'applyTextBtn' : 'generateTextStlBtn';
    const btn = document.getElementById(btnId);
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
      btn.innerHTML = `<span class="spinner-sm"></span> Generating...`;
      btn.disabled = true;
    }

    if (!THREE.FontLoader || !THREE.TextGeometry) {
      alert('TextGeometry or FontLoader is not loaded. Make sure the Three.js plugins are included.');
      if (btn) {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
      return;
    }

    const buildTextWithFont = (font) => {
      try {
        const lines = text.split('\n');
        const align = this.state.textAlign || 'center';
        let geometry;

        if (lines.length === 1) {
          geometry = new THREE.TextGeometry(text, {
            font: font,
            size: size,
            height: depth,
            curveSegments: 3,
            bevelEnabled: false
          });
          geometry.center();
        } else {
          // Multiline text rendering & alignment (Left, Center, Right)
          const lineGeos = [];
          const lineSpacing = size * 1.35;
          const lineBoxes = [];
          let maxLineWidth = 0;

          lines.forEach(lineStr => {
            const str = lineStr.length > 0 ? lineStr : ' ';
            const g = new THREE.TextGeometry(str, {
              font: font,
              size: size,
              height: depth,
              curveSegments: 3,
              bevelEnabled: false
            });
            g.computeBoundingBox();
            const w = g.boundingBox.max.x - g.boundingBox.min.x;
            if (w > maxLineWidth) maxLineWidth = w;
            lineBoxes.push({ geo: g, width: w });
          });

          const numLines = lines.length;
          lineBoxes.forEach((item, idx) => {
            const lineGeo = item.geo;
            let xOff = 0;
            if (align === 'center') {
              xOff = -0.5 * item.width;
            } else if (align === 'right') {
              xOff = maxLineWidth / 2 - item.width;
            } else { // left
              xOff = -maxLineWidth / 2;
            }

            const yOff = (numLines - 1 - idx) * lineSpacing - 0.5 * (numLines - 1) * lineSpacing;
            lineGeo.translate(xOff, yOff, -0.5 * depth);
            lineGeos.push(lineGeo);
          });

          geometry = this._mergeBufferGeometries(lineGeos);
          geometry.center();
        }

        if (action === 'apply') {
          this.state.logoGeometry = geometry.clone();
          this.state.logoEnabled = true;
          this.state.logoScale = size; // Default scale to text size
          const percent = Math.round((size / 16.0) * 100);
          this.state.logoScalePercent = percent;

          const scaleInput = document.getElementById('inputLogoScalePercent');
          if (scaleInput) scaleInput.value = percent;

          const readout = document.getElementById('readoutLogoScale');
          if (readout) readout.textContent = `${percent}% (${size.toFixed(1)} mm)`;
          
          const wrapToggle = document.getElementById('toggleWrapLogo');
          if (wrapToggle) {
            wrapToggle.checked = true; // Auto wrap for text looks better and ensures proper CSG cuts
            this.state.wrapLogo = true;
          }
          
          this._updateLogoPreview();
          this._showLogoControls(true);
          
          this.setLogoTextDisplay(`Text: "${text}"`);

          const modal = document.getElementById('textStlModal');
          if (modal) modal.style.display = 'none';
        } else {
          // Convert to Mesh and Export
          const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
          const mesh = new THREE.Mesh(geometry, material);

          if (THREE.STLExporter) {
            const exporter = new THREE.STLExporter();
            const stlString = exporter.parse(mesh);
          const blob = new Blob([stlString], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = `Text_${text.replace(/[^a-z0-9]/gi, '_')}.stl`;
          document.body.appendChild(a);
          a.click();
            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }, 100);
          } else {
            alert('STLExporter is not loaded.');
          }
        }
      } catch (err) {
        console.error('Error generating text geometry:', err);
        alert('Failed to generate text geometry.');
      }
    };
    const runGenerator = (font) => {
      buildTextWithFont(font);
      if (btn) {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    };

    if (this.cachedFont) {
      runGenerator(this.cachedFont);
    } else {
      const loader = new THREE.FontLoader();
      loader.load('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/fonts/helvetiker_bold.typeface.json', (font) => {
        this.cachedFont = font;
        runGenerator(font);
      }, undefined, (err) => {
        console.error('Error loading font:', err);
        alert('Failed to load font. Check console.');
        if (btn) {
          btn.innerHTML = originalText;
          btn.disabled = false;
        }
      });
    }
  }
  _initLibraryModal() {
    const modal = document.getElementById('stlLibraryModal');
    const openBtn = document.getElementById('btnOpenLibrary');
    const closeBtn = document.getElementById('closeLibraryModalBtn');

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

    // Attach click listener to library cards
    const cards = document.querySelectorAll('.library-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const type = card.dataset.type;
        const title = card.dataset.title;
        const url = card.dataset.url;

        if (modal) modal.style.display = 'none';
        this._loadLibraryPreset(type, url, title);
      });
    });
  }

  _loadLibraryPreset(type, url, title) {
    this.setLogoTextDisplay(title || 'Library Item');

    if (type === 'stl' && url) {
      fetch(encodeURI(url))
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then(buffer => {
          this._processSTL(buffer);
        })
        .catch(err => {
          console.warn('Library STL fetch failed (e.g. local file:// protocol restriction):', err);
          alert('Cannot open library files directly from your hard drive due to browser security (file:// protocol blocks fetching).\n\nPlease use the "Upload Logo" button instead and manually select your STL file.');
          
          // Clear loading state if necessary
          this.setLogoTextDisplay('');
        });
    } else if (type === 'preset-qf') {
      const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
        <rect width="256" height="256" fill="#000"/>
        <circle cx="128" cy="128" r="100" fill="none" stroke="#fff" stroke-width="16"/>
        <text x="128" y="148" font-family="sans-serif" font-weight="900" font-size="76" fill="#fff" text-anchor="middle">QF</text>
      </svg>`;
      const dataUrl = 'data:image/svg+xml;base64,' + btoa(svgStr);
      this._processImage(dataUrl);
    } else if (type === 'preset-audio') {
      const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
        <rect width="256" height="256" fill="#000"/>
        <path d="M128 32 C80 32 64 64 64 120 L64 180 H192 L192 120 C192 64 176 32 128 32 Z" fill="none" stroke="#fff" stroke-width="14"/>
        <line x1="96" y1="180" x2="96" y2="220" stroke="#fff" stroke-width="12"/>
        <line x1="128" y1="180" x2="128" y2="224" stroke="#fff" stroke-width="12"/>
        <line x1="160" y1="180" x2="160" y2="220" stroke="#fff" stroke-width="12"/>
        <circle cx="128" cy="110" r="30" fill="none" stroke="#fff" stroke-width="10"/>
      </svg>`;
      const dataUrl = 'data:image/svg+xml;base64,' + btoa(svgStr);
      this._processImage(dataUrl);
    } else if (type === 'preset-star') {
      const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
        <rect width="256" height="256" fill="#000"/>
        <polygon points="128,24 158,96 232,96 172,142 194,216 128,170 62,216 84,142 24,96 98,96" fill="#fff"/>
      </svg>`;
      const dataUrl = 'data:image/svg+xml;base64,' + btoa(svgStr);
      this._processImage(dataUrl);
    }
  }

  _updateDimensionUI() {
    const wrapper = document.querySelector('.stl-generator-wrapper');
    const isStacked = wrapper && wrapper.classList.contains('layout-stacked');

    const sizeInput = document.getElementById('viewportSizeInput') || document.getElementById('viewportWidthInput');
    const sizeLabel = document.getElementById('viewportDimensionLabel') || (sizeInput && sizeInput.previousElementSibling);
    const dimensionBox = document.getElementById('viewportDimensionBox') || (sizeInput && sizeInput.parentElement);

    if (isStacked) {
      if (sizeLabel) sizeLabel.textContent = 'Height:';
      if (dimensionBox) dimensionBox.setAttribute('title', 'Adjust Stacked Viewport Height (View B)');
      if (sizeInput) sizeInput.value = this.viewportHeightB || 540;
    } else {
      if (sizeLabel) sizeLabel.textContent = 'Width:';
      if (dimensionBox) dimensionBox.setAttribute('title', 'Adjust Side-by-Side Viewport Width (View A)');
      if (sizeInput) sizeInput.value = this.viewportWidthA || 480;
    }
  }

  _applyViewportDimension(valStr) {
    const val = parseInt(valStr, 10);
    if (isNaN(val) || val < 250 || val > 1200) return;

    const wrapper = document.querySelector('.stl-generator-wrapper');
    const isStacked = wrapper && wrapper.classList.contains('layout-stacked');

    if (isStacked) {
      this.viewportHeightB = val;
      document.documentElement.style.setProperty('--viewport-pane-height-stacked', `${val}px`);
      if (wrapper) wrapper.style.setProperty('--viewport-pane-height-stacked', `${val}px`);
    } else {
      this.viewportWidthA = val;
      document.documentElement.style.setProperty('--viewport-pane-width', `${val}px`);
      if (wrapper) wrapper.style.setProperty('--viewport-pane-width', `${val}px`);
    }

    this._onResize();
  }

  _showLogoControls(show) {
    const container = document.getElementById('logoControlsActive');
    if (container) container.style.display = show ? 'flex' : 'none';
    if (show) {
      this.setDragMode(true); // Automatically activate Drag Mode when logo is loaded
    } else {
      this.setDragMode(false);
    }
  }

  _updateReadouts() {
    const readoutOD = document.getElementById('readoutOD');
    const readoutLength = document.getElementById('readoutLength');
    const readoutWall = document.getElementById('readoutWall');

    if (readoutOD) readoutOD.textContent = `${this.state.outerDiameter.toFixed(1)} mm`;
    if (readoutLength) readoutLength.textContent = `${this.state.length.toFixed(0)} mm`;

    const wall = ((this.state.outerDiameter - this.state.innerDiameter) / 2).toFixed(2);
    if (readoutWall) readoutWall.textContent = `${wall} mm`;
  }
}

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('viewport')) {
    window.tubeGen = new TubeGenerator();
  }
});
