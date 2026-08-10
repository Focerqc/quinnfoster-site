/**
 * Experience 1 — Beginner 16mm Tube Generator with Draggable Logo Deboss
 * Built for clean, simplified beginner operation with 16mm glass tube support.
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
      wrapLogo: true,         // Wrap logo around cylinder curve
      logoTheta: 0,           // Angle position on cylinder (radians)
      logoY: 0,               // Height position on cylinder (mm from center)
      logoScale: 16.0,        // Logo size in mm
      logoDepth: 0.8,         // Deboss cut depth or Emboss height in mm
      logoThroughCut: true,   // Deboss through-cut pierces wall completely
      logoRotateCoarse: 0,    // Coarse rotation (degrees)
      logoRotateFine: 0,      // Fine rotation offset (degrees)
      logoRotate: 0,          // Total in-plane rotation (degrees)
      logoMode: 'deboss',     // 'deboss' (cut inward) or 'emboss' (extrude outward)
      logoUseCSG: true,       // Use true Boolean CSG cut
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

  _init() {
    this._initScene();
    this._initLighting();
    this._initControls();
    this._buildTube();
    this._initUI();
    this._initDragControls();
    this._animate();
    this._resetCamera();

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

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => this._onResize());
  }

  _initLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const dir1 = new THREE.DirectionalLight(0xffffff, 1.0);
    dir1.position.set(50, 80, 50);
    dir1.castShadow = true;
    this.scene.add(dir1);

    const dir2 = new THREE.DirectionalLight(0x6366f1, 0.5);
    dir2.position.set(-50, -30, -50);
    this.scene.add(dir2);
  }

  _initControls() {
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI - 0.05;
    this.controls.minDistance = 20;
    this.controls.maxDistance = 400;
  }

  _buildTube() {
    if (this.tubeMesh) {
      this.modelGroup.remove(this.tubeMesh);
      if (this.tubeMesh.geometry) this.tubeMesh.geometry.dispose();
    }

    const R_in = this.state.innerDiameter / 2.0;
    const R_out = this.state.outerDiameter / 2.0;
    const L = this.state.length;

    const sleeveGeom = new THREE.CylinderGeometry(R_out, R_out, L, 64, 1, false);
    const innerGeom = new THREE.CylinderGeometry(R_in, R_in, L + 2, 64, 1, false);

    const sleeveMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.3,
      metalness: 0.8
    });

    this.tubeMesh = new THREE.Mesh(sleeveGeom, sleeveMat);
    this.modelGroup.add(this.tubeMesh);
  }

  _resetCamera() {
    if (this.camera && this.controls) {
      this.camera.position.set(50, 40, 80);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
  }

  _initUI() {
    const bindVal = (id, key) => {
      const el = document.getElementById(id);
      const valDisplay = document.getElementById(id + 'Val');
      if (el) {
        el.addEventListener('input', (e) => {
          this.state[key] = parseFloat(e.target.value);
          if (valDisplay) valDisplay.textContent = e.target.value;
          this._buildTube();
        });
      }
    };

    bindVal('outerDiameter', 'outerDiameter');
    bindVal('tubeLength', 'length');

    const resetBtn = document.getElementById('resetCameraBtn');
    if (resetBtn) resetBtn.addEventListener('click', () => this._resetCamera());

    const exportBtn = document.getElementById('exportStlBtn');
    if (exportBtn) exportBtn.addEventListener('click', () => this.exportSTL());
  }

  _initDragControls() {}

  exportSTL() {
    if (!this.tubeMesh) return;
    const exporter = new THREE.STLExporter();
    const stlData = exporter.parse(this.tubeMesh, { binary: true });

    const blob = new Blob([stlData], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `experience1_beginner_sleeve_${this.state.outerDiameter}mm.stl`;
    link.click();
    URL.revokeObjectURL(link.href);
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

window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('viewport')) {
    window.tubeGen = new TubeGenerator(document.getElementById('viewport'));
  }
});
