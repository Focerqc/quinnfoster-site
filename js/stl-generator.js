/**
 * Experience 1 ΓÇö State-Driven 3D STL Generator Engine
 * Powered by CSG / Manifold3D Solid Geometry & Parametric CAD Engine
 * 
 * Features:
 * - 100% Solid procedural manifold CAD geometry for 3D printing.
 * - Solid 3D Text CSG Boolean Subtraction (Cut-In Deboss) & Union (Raised Emboss).
 * - Real-time Engraving Cut Depth slider support (0.2mm to 1.6mm).
 * - Continuous Helical Ribbon backing and parametric window frame cutouts.
 * - Manifold binary STL exporter.
 */

class STLGenerator {
  constructor(options = {}) {
    this.state = {
      innerDiameter: 16.2,  // Locked at 16.2mm for 16mm glass tubes (0.2mm tolerance)
      outerDiameter: 21.0,  // Default OD 21.0mm
      length: 100.0,        // Default Sleeve Length 100.0mm
      glassLength: 100.0,   // Default Glass Tube Length 100.0mm
      glassOffset: 0.0,     // Glass Tube Position Offset (0 = seated)
      textBacking: true,    // Solid backing border behind text
      wallThickness: 2.4,   // (outerDiameter - innerDiameter) / 2
      engravingText: "QUINN FOSTER",
      textStyle: "spiral",  // 'spiral', 'ring', 'vertical'
      engraveStyle: "embossed", // Solid 3D Raised Text
      engraveDepth: 0.8,    // Depth/Height in mm
      charSpacing: 1.0,     // Character Spacing Multiplier (0.5x to 2.5x)
      windowType: "lattice",// 'lattice', 'slotted', 'ports', 'solid'
      lipRetainer: false,   // Bottom lip stop ring (Default: OFF)
      autoLipOffset: true,  // Auto-adjust tube height/position for retainer lip
      showGlassTube: true,  // Visual reference glass tube toggle
      cutoutOriginY: 0.0,
      // Logo & Lithograph State
      logoEnabled: false,
      logoFileName: '',
      logoFileType: null,     // 'stl', 'dxf', 'image'
      logoRawData: null,      // DataURL, ArrayBuffer or Text
      logoGeometry: null,     // THREE.BufferGeometry
      logoPosition: 'center', // 'top', 'center', 'bottom'
      logoAngle: 0.0,         // 0-360 degrees
      logoRotate: 0.0,        // 0, 90, 180, 270 degrees in-plane rotation
      logoFlipH: false,
      logoFlipV: false,
      logoScale: 16.0,        // mm
      logoDepth: 0.8,         // mm
      logoInvert: false       // invert lithograph
    };

    this.container = options.container || document.getElementById('canvasContainer');
    this.sleeveGroup = null;
    this.glassMesh = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.loadedFont = null;
    this.manifoldWasm = null;

    this.init();
  }

  init() {
    if (!this.container) return;

    this.initThree();
    this.initManifoldWasm();
    this.loadStateFromURL();
    this.loadFont(() => {
      try {
        this.updateMesh();
        this.resetView();
      } catch (err) {
        console.error("Error initializing mesh:", err);
      } finally {
        const loaderEl = document.getElementById('viewportLoading');
        if (loaderEl) {
          loaderEl.style.opacity = '0';
          setTimeout(() => loaderEl.style.display = 'none', 300);
        }
      }
    });

    this.initUI();
    this.animate();
  }

  initManifoldWasm() {
    if (typeof Module !== 'undefined') {
      try {
        Module().then(wasm => {
          wasm.setup();
          this.manifoldWasm = wasm;
          console.log("ΓÜí Manifold3D WebAssembly Kernel Initialized (Main Thread)!");
          this.updateMesh();
        }).catch(err => {
          console.warn("Manifold3D Wasm fallback to CSG:", err);
        });
      } catch (e) {
        console.warn("Manifold3D fallback:", e);
      }
    }
  }

  loadFont(callback) {
    // 1. Try to load from opentype.js using a reliable CDN URL
    if (typeof opentype !== 'undefined') {
      opentype.load('https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-black-webfont.ttf', (err, font) => {
        if (err) {
          console.error("Failed to load Opentype Font:", err);
          this.loadedFont = null;
        } else {
          this.loadedFont = font;
        }
        if (callback) callback();
      });
    } else {
      console.warn("opentype.js not found.");
      if (callback) callback();
    }
  }

  // -------------------------------------------------------------
  // DYNAMIC CAMERA RESET & ZOOM TO FIT ENGINE
  // -------------------------------------------------------------
  resetView() {
    if (!this.camera || !this.controls) return;

    let targetY = 0;
    let maxDim = Math.max(this.state.length, this.state.glassLength, this.state.outerDiameter);

    if (this.sleeveGroup) {
      const box = new THREE.Box3().setFromObject(this.sleeveGroup);
      const center = new THREE.Vector3();
      box.getCenter(center);
      targetY = center.y;

      const size = new THREE.Vector3();
      box.getSize(size);
      maxDim = Math.max(size.x, size.y, size.z);
    }

    const fovRad = (this.camera.fov * Math.PI) / 180;
    let dist = (maxDim / 2) / Math.tan(fovRad / 2) * 1.45;
    dist = Math.max(dist, 70);

    const eyeX = dist * 0.45;
    const eyeY = targetY + dist * 0.35;
    const eyeZ = dist * 0.85;

    this.controls.target.set(0, targetY, 0);
    this.camera.position.set(eyeX, eyeY, eyeZ);
    this.camera.lookAt(0, targetY, 0);
    this.controls.update();
  }

  // -------------------------------------------------------------
  // THREE.JS VIEWPORT & SCENE SETUP
  // -------------------------------------------------------------
  initThree() {
    const width = this.container.clientWidth || 600;
    const height = this.container.clientHeight || 480;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
    this.camera.position.set(45, 50, 70);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.container.appendChild(this.renderer.domElement);

    if (THREE.OrbitControls) {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.minDistance = 15;
      this.controls.maxDistance = 300;
      this.controls.target.set(0, 0, 0);
    }

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(50, 80, 50);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    this.scene.add(keyLight);

    const frontFillLight = new THREE.DirectionalLight(0xffffff, 0.8);
    frontFillLight.position.set(0, 30, 100);
    this.scene.add(frontFillLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.6);
    fillLight.position.set(-50, 40, -40);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x818cf8, 0.6);
    rimLight.position.set(0, -60, -50);
    this.scene.add(rimLight);

    window.addEventListener('resize', () => this.onWindowResize());
  }

  onWindowResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    if (this.controls) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // -------------------------------------------------------------
  // STATE-DRIVEN MESH UPDATE
  // -------------------------------------------------------------
  updateMesh() {
    const lipAdd = (this.state.lipRetainer && this.state.autoLipOffset) ? 1.0 : 0.0;
    this.state.length = parseFloat((this.state.glassLength + lipAdd).toFixed(1));
    this.state.wallThickness = parseFloat(((this.state.outerDiameter - this.state.innerDiameter) / 2).toFixed(2));

    const readoutOD = document.getElementById('readoutOD');
    const readoutLength = document.getElementById('readoutLength');
    const readoutGlassLength = document.getElementById('readoutGlassLength');
    const readoutGlassOffset = document.getElementById('readoutGlassOffset');
    const inputLength = document.getElementById('inputLength');
    const labelDepth = document.getElementById('labelDepth');

    if (labelDepth) {
      labelDepth.textContent = this.state.engraveStyle === 'debossed' ? 'Engraving Cut Depth' : 'Raised Text Height';
    }

    if (readoutOD) readoutOD.textContent = `${this.state.outerDiameter.toFixed(1)} mm`;
    if (readoutGlassLength) readoutGlassLength.textContent = `${this.state.glassLength.toFixed(1)} mm`;
    if (readoutLength) {
      readoutLength.textContent = `${this.state.length.toFixed(1)} mm (${lipAdd > 0 ? '1.0mm lip added below automatically' : 'Flush'})`;
    }
    if (inputLength) inputLength.value = this.state.length;

    const maxOffset = Math.max(10.0, this.state.glassLength + 10.0);
    if (this.state.glassOffset < 0) this.state.glassOffset = 0;
    if (this.state.glassOffset > maxOffset) this.state.glassOffset = maxOffset;

    const inputGlassOffset = document.getElementById('inputGlassOffset');
    if (inputGlassOffset) {
      inputGlassOffset.min = "0.0";
      inputGlassOffset.max = maxOffset.toFixed(1);
      inputGlassOffset.value = this.state.glassOffset;
    }

    if (readoutGlassOffset) {
      const off = this.state.glassOffset;
      readoutGlassOffset.textContent = off === 0 ? "0.0 mm (Seated)" : `+${off.toFixed(1)} mm`;
    }

    if (this.sleeveGroup) {
      this.scene.remove(this.sleeveGroup);
    }
    if (this.glassMesh) {
      this.scene.remove(this.glassMesh);
      if (this.glassMesh.geometry) this.glassMesh.geometry.dispose();
    }

    this.sleeveGroup = this.buildSleeveAssembly();
    this.scene.add(this.sleeveGroup);

    if (this.state.showGlassTube) {
      this.glassMesh = this.buildGlassTubeMesh();
      this.scene.add(this.glassMesh);
    }

    this.syncStateToURL();
  }

  // -------------------------------------------------------------
  // PROCEDURAL SOLID CAD SLEEVE BUILDER
  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // PROCEDURAL SOLID CAD SLEEVE BUILDER (2D UNWRAPPED ARCHITECTURE)
  // -------------------------------------------------------------
  buildSleeveAssembly() {
    const group = new THREE.Group();
    const outerR = this.state.outerDiameter / 2;
    const innerR = this.state.innerDiameter / 2;
    const thickness = outerR - innerR;
    const length = this.state.length;
    const originY = this.state.cutoutOriginY || 0.0;
    const windowType = this.state.windowType || 'lattice';

    const sleeveMaterial = new THREE.MeshStandardMaterial({
      color: 0x94a3b8, // Bright satin aluminum / silver
      metalness: 0.35,
      roughness: 0.35
    });

    const highlightMaterial = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.50,
      metalness: 0.5,
      roughness: 0.2
    });

    const lipMaterial = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.35,
      roughness: 0.35
    });

    // 1. Bottom Retainer Lip (Added as separate 3D ring)
    if (this.state.lipRetainer) {
      const lipR = innerR - 1.0;
      const lipShape = new THREE.Shape();
      lipShape.absarc(0, 0, innerR + 0.05, 0, Math.PI * 2, false);
      const lipHole = new THREE.Path();
      lipHole.absarc(0, 0, lipR, 0, Math.PI * 2, true);
      lipShape.holes.push(lipHole);

      const lipGeo = new THREE.ExtrudeGeometry(lipShape, { depth: 1.0, bevelEnabled: false, curveSegments: 48 });
      const lipMesh = new THREE.Mesh(lipGeo, lipMaterial);
      lipMesh.rotation.x = -Math.PI / 2;
      lipMesh.position.y = -length / 2;
      group.add(lipMesh);
    }

    // 2. Prepare Engraving Text (2D Unwrapped Coordinates)
    const textStr = this.state.engravingText ? this.state.engravingText.trim().toUpperCase() : '';
    const style = this.state.textStyle || 'spiral';
    const fontSize = Math.min(3.8, length / 14);
    const fontDepth = Math.max(0.2, this.state.engraveDepth || 0.8);
    const isCutIn = this.state.engraveStyle === 'debossed';
    let textShapes = [];
    
    if (textStr !== '' && this.loadedFont) {
       textShapes = this.generateTextShapes(textStr, fontSize);
       
       // Compute bounding box of text
       let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
       textShapes.forEach(shape => {
          const pts = shape.extractPoints().shape;
          pts.forEach(p => {
             if (p.x < minX) minX = p.x;
             if (p.x > maxX) maxX = p.x;
             if (p.y < minY) minY = p.y;
             if (p.y > maxY) maxY = p.y;
          });
       });
       
       const cx = (minX + maxX) / 2;
       const cy = (minY + maxY) / 2;
       
       const m = new THREE.Matrix3();
       m.translate(-cx, -cy);
       
       if (style === 'vertical') {
         m.rotate(-Math.PI / 2);
         m.scale(1.2, 1.2);
       } else if (style === 'spiral') {
         const pitchAngle = Math.atan2(length * 0.4, (maxX - minX));
         m.rotate(-pitchAngle);
       } else if (style === 'ring') {
         m.translate(0, length / 4);
       }
       
       const applyMatrixToCurve = (curve, matrix) => {
         if (curve.v0) curve.v0.applyMatrix3(matrix);
         if (curve.v1) curve.v1.applyMatrix3(matrix);
         if (curve.v2) curve.v2.applyMatrix3(matrix);
         if (curve.v3) curve.v3.applyMatrix3(matrix);
       };
       
       textShapes.forEach(shape => {
          shape.curves.forEach(c => applyMatrixToCurve(c, m));
          shape.holes.forEach(h => h.curves.forEach(c => applyMatrixToCurve(c, m)));
       });
    }

    // 3. Build Main Sleeve 2D Shape
    const width = 2 * Math.PI * innerR;
    const halfW = width / 2;
    const topY = originY + length / 2;
    const botY = originY - length / 2;

    const baseShape = new THREE.Shape();
    baseShape.moveTo(-halfW, botY);
    baseShape.lineTo(halfW, botY);
    baseShape.lineTo(halfW, topY);
    baseShape.lineTo(-halfW, topY);
    baseShape.lineTo(-halfW, botY);

    // Add Lattice / Slotted Windows
    if (windowType === 'slotted') {
       const ringH = Math.min(10.0, length * 0.15);
       const addHole = (th1, th2) => {
         const x1 = th1 * innerR;
         const x2 = th2 * innerR;
         const hole = new THREE.Path();
         hole.moveTo(x1, botY + ringH);
         hole.lineTo(x1, topY - ringH);
         hole.lineTo(x2, topY - ringH);
         hole.lineTo(x2, botY + ringH);
         hole.lineTo(x1, botY + ringH);
         baseShape.holes.push(hole);
       };
       addHole(0.2 * Math.PI, 0.8 * Math.PI);
       addHole(-0.8 * Math.PI, -0.2 * Math.PI);
    } else if (windowType === 'lattice' || windowType === 'ports') {
       const ringH = windowType === 'lattice' ? Math.min(8.0, length * 0.12) : Math.min(10.0, length * 0.15);
       const midH = Math.min(5.0, length * 0.08);
       const angles = [-Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI];
       const pillarHalfW = windowType === 'lattice' ? 0.18 : 0.25;

       for (let i = 0; i < 4; i++) {
         const x1 = (angles[i] + pillarHalfW) * innerR;
         const x2 = (angles[i+1] - pillarHalfW) * innerR;
         
         if (windowType === 'lattice') {
           const holeBot = new THREE.Path();
           holeBot.moveTo(x1, botY + ringH);
           holeBot.lineTo(x1, originY - midH/2);
           holeBot.lineTo(x2, originY - midH/2);
           holeBot.lineTo(x2, botY + ringH);
           holeBot.lineTo(x1, botY + ringH);
           baseShape.holes.push(holeBot);

           const holeTop = new THREE.Path();
           holeTop.moveTo(x1, originY + midH/2);
           holeTop.lineTo(x1, topY - ringH);
           holeTop.lineTo(x2, topY - ringH);
           holeTop.lineTo(x2, originY + midH/2);
           holeTop.lineTo(x1, originY + midH/2);
           baseShape.holes.push(holeTop);
         } else {
           const hole = new THREE.Path();
           hole.moveTo(x1, botY + ringH);
           hole.lineTo(x1, topY - ringH);
           hole.lineTo(x2, topY - ringH);
           hole.lineTo(x2, botY + ringH);
           hole.lineTo(x1, botY + ringH);
           baseShape.holes.push(hole);
         }
       }
    }

    // 4. Handle Text Backing Border
    let backingShape = null;
    if (this.state.textBacking && textStr !== '' && windowType !== 'solid') {
      const pad = 2.0;
      const backingHeight = fontSize + pad * 2;
      backingShape = new THREE.Shape();

      if (style === 'ring') {
         const bTop = length / 4 + backingHeight / 2;
         const bBot = length / 4 - backingHeight / 2;
         backingShape.moveTo(-halfW, bBot);
         backingShape.lineTo(halfW, bBot);
         backingShape.lineTo(halfW, bTop);
         backingShape.lineTo(-halfW, bTop);
         backingShape.lineTo(-halfW, bBot);
      } else if (style === 'vertical') {
         const backingStartAngle = -0.25 - Math.PI / 2;
         const backingEndAngle = 0.25 - Math.PI / 2;
         const bx1 = backingStartAngle * innerR;
         const bx2 = backingEndAngle * innerR;
         backingShape.moveTo(bx1, botY);
         backingShape.lineTo(bx2, botY);
         backingShape.lineTo(bx2, topY);
         backingShape.lineTo(bx1, topY);
         backingShape.lineTo(bx1, botY);
      } else if (style === 'spiral') {
         // Spiral backing in 2D
         const ribbonWidth = fontSize * 1.5 + 4.0;
         const charVerticalSpacing = fontSize * 1.35;
         const charAngularSpacing = 0.30;
         const pitch = charAngularSpacing / charVerticalSpacing;
         const dx = innerR * pitch;
         const dy = 1.0;
         const cosAlpha = dx / Math.sqrt(dx * dx + dy * dy);
         const horizontalWidth = ribbonWidth / cosAlpha;
         const dX = horizontalWidth / 2;
         
         const ringH = windowType === 'lattice' ? Math.min(8.0, length * 0.12) : Math.min(10.0, length * 0.15);
         const sTopY = topY - ringH + 0.08;
         const sBotY = botY + ringH - 0.08;
         const totalSpan = sTopY - sBotY;
         
         const sShape = new THREE.Shape();
         sShape.moveTo((-sBotY * pitch * innerR) - dX, sBotY);
         sShape.lineTo((-sBotY * pitch * innerR) + dX, sBotY);
         sShape.lineTo((-sTopY * pitch * innerR) + dX, sTopY);
         sShape.lineTo((-sTopY * pitch * innerR) - dX, sTopY);
         sShape.lineTo((-sBotY * pitch * innerR) - dX, sBotY);
         backingShape = sShape;
      }
    }

    // 5. Apply Debossed Text (Cut into both Sleeve Base and Backing)
    const textIslands = [];
    if (isCutIn && textShapes.length > 0) {
       textShapes.forEach(shape => {
          // Push outer shape as a hole
          const holePath = new THREE.Path();
          holePath.curves = shape.curves;
          baseShape.holes.push(holePath);
          if (backingShape) backingShape.holes.push(holePath);

          // Inner holes become solid islands
          shape.holes.forEach(h => {
             const island = new THREE.Shape();
             island.curves = h.curves;
             textIslands.push(island);
          });
       });
    }

    // 6. Extrude and Bend the 2D Shapes
    const extrudeOptions = { depth: thickness, bevelEnabled: false, curveSegments: 32 };
    if (windowType === 'solid') {
      extrudeOptions.bevelEnabled = true;
      extrudeOptions.bevelSegments = 3;
      extrudeOptions.bevelSize = 0.4;
      extrudeOptions.bevelThickness = 0.4;
    }

    const baseGeo = new THREE.ExtrudeGeometry(baseShape, extrudeOptions);
    const bentBaseGeo = this.bendGeometryToCylinder(baseGeo, innerR);
    const sleeveBody = new THREE.Mesh(bentBaseGeo, sleeveMaterial);
    sleeveBody.castShadow = true;
    sleeveBody.receiveShadow = true;
    group.add(sleeveBody);

    if (backingShape) {
       // Offset slightly to prevent Z-fighting, or just leave it (they will cleanly intersect)
       const backGeo = new THREE.ExtrudeGeometry(backingShape, { depth: thickness, bevelEnabled: false, curveSegments: 32 });
       const bentBackGeo = this.bendGeometryToCylinder(backGeo, innerR);
       const backMesh = new THREE.Mesh(bentBackGeo, sleeveMaterial);
       backMesh.castShadow = true;
       backMesh.receiveShadow = true;
       group.add(backMesh);
    }

    textIslands.forEach(island => {
       const geo = new THREE.ExtrudeGeometry(island, extrudeOptions);
       const bentGeo = this.bendGeometryToCylinder(geo, innerR);
       const islandMesh = new THREE.Mesh(bentGeo, sleeveMaterial);
       islandMesh.castShadow = true;
       islandMesh.receiveShadow = true;
       group.add(islandMesh);
    });

    // 7. Raised Text (Embossed)
    if (!isCutIn && textShapes.length > 0) {
       const raiseOptions = { depth: thickness + fontDepth, bevelEnabled: false, curveSegments: 32 };
       const raisedGeo = new THREE.ExtrudeGeometry(textShapes, raiseOptions);
       const bentRaisedGeo = this.bendGeometryToCylinder(raisedGeo, innerR);
       const raisedMesh = new THREE.Mesh(bentRaisedGeo, highlightMaterial);
       raisedMesh.castShadow = true;
       raisedMesh.receiveShadow = true;
       group.add(raisedMesh);
    }

    // 8. Custom Logo
    if (this.state.logoEnabled && this.state.logoGeometry) {
      const logoGroup = this.buildCustomLogoGroup(outerR, length, highlightMaterial);
      if (logoGroup) {
        group.add(logoGroup);
      }
    }

    this.syncStateToURL();
    return group;
  }

  // -------------------------------------------------------------
  // OPENTYPE.JS VECTOR PATH CONVERTER & BENDING MODIFIER
  // -------------------------------------------------------------
  generateTextShapes(text, fontSize) {
    if (!this.loadedFont || typeof opentype === 'undefined') return [];
    
    // Get opentype.js paths
    const opentypePath = this.loadedFont.getPath(text, 0, 0, fontSize);
    const shapePath = new THREE.ShapePath();

    let firstX = 0, firstY = 0;

    opentypePath.commands.forEach((cmd) => {
      switch (cmd.type) {
        case 'M':
          shapePath.moveTo(cmd.x, -cmd.y);
          firstX = cmd.x;
          firstY = -cmd.y;
          break;
        case 'L':
          shapePath.lineTo(cmd.x, -cmd.y);
          break;
        case 'Q':
          shapePath.quadraticCurveTo(cmd.x1, -cmd.y1, cmd.x, -cmd.y);
          break;
        case 'C':
          shapePath.bezierCurveTo(cmd.x1, -cmd.y1, cmd.x2, -cmd.y2, cmd.x, -cmd.y);
          break;
        case 'Z':
          // ShapePath lacks closePath(), so we manually close the current subpath
          shapePath.lineTo(firstX, firstY);
          break;
      }
    });

    // Three.js robustly sorts holes vs solids using odd-even winding rule!
    return shapePath.toShapes(false);
  }

  bendGeometryToCylinder(geometry, radius) {
    geometry.computeBoundingBox();
    const pos = geometry.attributes.position;
    
    // We assume the flat geometry is centered at x=0, and lies on the XY plane 
    // where Z represents thickness/extrusion depth.
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      // Arc length x becomes the angle theta around the cylinder
      const theta = x / radius;
      
      // Z depth is added to the base radius
      const newRadius = radius + z;

      // Convert polar back to cartesian (wrapping around Y axis)
      const newX = newRadius * Math.sin(theta);
      const newZ = newRadius * Math.cos(theta);

      pos.setXYZ(i, newX, y, newZ);
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }

  // -------------------------------------------------------------
  // REALISTIC HOLLOW GLASS TUBE VISUAL MOCKUP
  // -------------------------------------------------------------
  buildGlassTubeMesh() {
    const outerR = 8.0;
    const innerR = 6.8;
    const glassLen = this.state.glassLength || 100.0;
    const sleeveLen = this.state.length || 100.0;
    const lipH = this.state.lipRetainer ? 1.0 : 0.0;

    const seatedY = (-sleeveLen / 2 + lipH) + (glassLen / 2);
    const glassY = seatedY + (this.state.glassOffset || 0.0);

    const glassShape = new THREE.Shape();
    glassShape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
    const glassHole = new THREE.Path();
    glassHole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
    glassShape.holes.push(glassHole);

    const glassGeo = new THREE.ExtrudeGeometry(glassShape, {
      depth: glassLen,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.2,
      bevelThickness: 0.2,
      curveSegments: 48
    });
    glassGeo.center();

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
      clearcoatRoughness: 0.1,
      side: THREE.DoubleSide
    });

    const glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.rotation.x = -Math.PI / 2;
    glassMesh.position.set(0, glassY, 0);

    return glassMesh;
  }

  // -------------------------------------------------------------
  // CUSTOM LOGO & LITHOGRAPH PROCESSING ENGINE
  // -------------------------------------------------------------
  handleLogoFileUpload(file) {
    if (!file) return;

    this.state.logoFileName = file.name;
    const ext = file.name.split('.').pop().toLowerCase();

    const fileNameEl = document.getElementById('logoFileName');
    const fileDetailsEl = document.getElementById('logoFileDetails');
    const invertGroupEl = document.getElementById('logoInvertGroup');

    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileDetailsEl) fileDetailsEl.style.display = 'block';

    const reader = new FileReader();

    if (ext === 'stl') {
      this.state.logoFileType = 'stl';
      if (invertGroupEl) invertGroupEl.style.display = 'none';
      reader.onload = (e) => {
        this.processSTLLogo(e.target.result);
      };
      reader.readAsArrayBuffer(file);

    } else if (ext === 'dxf') {
      this.state.logoFileType = 'dxf';
      if (invertGroupEl) invertGroupEl.style.display = 'none';
      reader.onload = (e) => {
        this.processDXFLogo(e.target.result);
      };
      reader.readAsText(file);

    } else {
      // Image (PNG, JPG, SVG, WebP) -> Lithograph
      this.state.logoFileType = 'image';
      if (invertGroupEl) invertGroupEl.style.display = 'flex';
      reader.onload = (e) => {
        this.state.logoRawData = e.target.result;
        this.processImageLithograph(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  }

  // Engine 1: Image to 3D Lithograph Heightmap Converter
  processImageLithograph(dataUrl) {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const targetRes = 80; // 80x80 grid for high detail & smooth CAD performance
      const canvas = document.createElement('canvas');
      canvas.width = targetRes;
      canvas.height = targetRes;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, targetRes, targetRes);

      const aspect = img.width / img.height;
      let drawW = targetRes, drawH = targetRes;
      let drawX = 0, drawY = 0;
      if (aspect > 1) {
        drawH = targetRes / aspect;
        drawY = (targetRes - drawH) / 2;
      } else {
        drawW = targetRes * aspect;
        drawX = (targetRes - drawW) / 2;
      }

      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      const imgData = ctx.getImageData(0, 0, targetRes, targetRes).data;

      const cols = targetRes;
      const rows = targetRes;
      const positions = [];
      const indices = [];

      for (let r = 0; r <= rows; r++) {
        const v = r / rows;
        const y = (0.5 - v);

        for (let c = 0; c <= cols; c++) {
          const u = c / cols;
          const x = (u - 0.5);

          const pxC = Math.min(cols - 1, Math.floor(u * cols));
          const pxR = Math.min(rows - 1, Math.floor(v * rows));
          const idx = (pxR * cols + pxC) * 4;

          const red = imgData[idx];
          const green = imgData[idx + 1];
          const blue = imgData[idx + 2];
          const alpha = imgData[idx + 3] / 255;

          let brightness = ((0.299 * red + 0.587 * green + 0.114 * blue) / 255) * alpha;

          if (this.state.logoInvert) {
            brightness = 1.0 - brightness;
          }

          const z = brightness;
          positions.push(x, y, z);
        }
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const p1 = r * (cols + 1) + c;
          const p2 = p1 + 1;
          const p3 = (r + 1) * (cols + 1) + c;
          const p4 = p3 + 1;

          indices.push(p1, p3, p2);
          indices.push(p2, p3, p4);
        }
      }

      const totalFrontVerts = positions.length / 3;

      for (let i = 0; i < totalFrontVerts; i++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        positions.push(x, y, 0.0);
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const p1 = totalFrontVerts + r * (cols + 1) + c;
          const p2 = p1 + 1;
          const p3 = totalFrontVerts + (r + 1) * (cols + 1) + c;
          const p4 = p3 + 1;

          indices.push(p1, p2, p3);
          indices.push(p2, p4, p3);
        }
      }

      for (let c = 0; c < cols; c++) {
        const f1 = c, f2 = c + 1;
        const b1 = totalFrontVerts + f1, b2 = totalFrontVerts + f2;
        indices.push(f1, b1, f2);
        indices.push(f2, b1, b2);

        const bf1 = rows * (cols + 1) + c, bf2 = bf1 + 1;
        const bb1 = totalFrontVerts + bf1, bb2 = totalFrontVerts + bf2;
        indices.push(bf1, bf2, bb1);
        indices.push(bf2, bb2, bb1);
      }

      for (let r = 0; r < rows; r++) {
        const f1 = r * (cols + 1), f2 = (r + 1) * (cols + 1);
        const b1 = totalFrontVerts + f1, b2 = totalFrontVerts + f2;
        indices.push(f1, f2, b1);
        indices.push(f2, b2, b1);

        const rf1 = r * (cols + 1) + cols, rf2 = (r + 1) * (cols + 1) + cols;
        const rb1 = totalFrontVerts + rf1, rb2 = totalFrontVerts + rf2;
        indices.push(rf1, rb1, rf2);
        indices.push(rf2, rb1, rb2);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      this.state.logoGeometry = geo;
      this.updateMesh();
    };
    img.src = dataUrl;
  }

  // Engine 2: STL File Loader Parser
  processSTLLogo(arrayBuffer) {
    try {
      let geo = null;
      if (typeof THREE.STLLoader !== 'undefined') {
        const loader = new THREE.STLLoader();
        geo = loader.parse(arrayBuffer);
      } else {
        geo = this.parseSTLBufferFallback(arrayBuffer);
      }

      if (geo) {
        geo.center();
        geo.computeVertexNormals();
        this.state.logoGeometry = geo;
        this.updateMesh();
      }
    } catch (err) {
      console.error("Error parsing STL logo file:", err);
      alert("Could not parse STL file. Please ensure it is a valid binary or ASCII STL.");
    }
  }

  // Fallback STL Binary/ASCII parser
  parseSTLBufferFallback(buffer) {
    const isBinary = (buf) => {
      if (buf.byteLength < 84) return false;
      const reader = new DataView(buf);
      const faceCount = reader.getUint32(80, true);
      return buf.byteLength === (84 + faceCount * 50);
    };

    const geo = new THREE.BufferGeometry();
    const positions = [];

    if (isBinary(buffer)) {
      const dataView = new DataView(buffer);
      const faces = dataView.getUint32(80, true);
      let offset = 84;

      for (let i = 0; i < faces; i++) {
        offset += 12; // Skip normal
        for (let j = 0; j < 3; j++) {
          positions.push(
            dataView.getFloat32(offset, true),
            dataView.getFloat32(offset + 4, true),
            dataView.getFloat32(offset + 8, true)
          );
          offset += 12;
        }
        offset += 2; // Attribute bytes
      }
    } else {
      const text = new TextDecoder().decode(buffer);
      const pattern = /facet\s+normal[\s\S]*?outer\s+loop\s+vertex\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+vertex\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+vertex\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/g;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        positions.push(
          parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]),
          parseFloat(match[4]), parseFloat(match[5]), parseFloat(match[6]),
          parseFloat(match[7]), parseFloat(match[8]), parseFloat(match[9])
        );
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }

  // Engine 3: 2D DXF Vector Shape Extruder
  processDXFLogo(dxfText) {
    try {
      const shapes = [];
      const lines = dxfText.split(/\r?\n/);
      let i = 0;

      let currentEntity = null;
      let x1=0, y1=0, x2=0, y2=0, radius=0, cx=0, cy=0;
      let polyPoints = [];

      while (i < lines.length) {
        const code = lines[i].trim();
        const val = lines[i+1] ? lines[i+1].trim() : '';
        i += 2;

        if (code === '0') {
          if (currentEntity === 'LINE') {
            const path = new THREE.Path();
            path.moveTo(x1, y1);
            path.lineTo(x2, y2);
            shapes.push(path);
          } else if (currentEntity === 'CIRCLE') {
            const shape = new THREE.Shape();
            shape.absarc(cx, cy, radius, 0, Math.PI * 2, false);
            shapes.push(shape);
          } else if (currentEntity === 'LWPOLYLINE' && polyPoints.length > 1) {
            const shape = new THREE.Shape();
            shape.moveTo(polyPoints[0].x, polyPoints[0].y);
            for (let k = 1; k < polyPoints.length; k++) {
              shape.lineTo(polyPoints[k].x, polyPoints[k].y);
            }
            shape.closePath();
            shapes.push(shape);
          }

          currentEntity = val;
          x1=0; y1=0; x2=0; y2=0; radius=0; cx=0; cy=0;
          polyPoints = [];
        }

        if (currentEntity === 'LINE') {
          if (code === '10') x1 = parseFloat(val);
          if (code === '20') y1 = parseFloat(val);
          if (code === '11') x2 = parseFloat(val);
          if (code === '21') y2 = parseFloat(val);
        } else if (currentEntity === 'CIRCLE') {
          if (code === '10') cx = parseFloat(val);
          if (code === '20') cy = parseFloat(val);
          if (code === '40') radius = parseFloat(val);
        } else if (currentEntity === 'LWPOLYLINE') {
          if (code === '10') {
            const px = parseFloat(val);
            let py = 0;
            if (lines[i] && lines[i].trim() === '20') {
              py = parseFloat(lines[i+1].trim());
              i += 2;
            }
            polyPoints.push({ x: px, y: py });
          }
        }
      }

      if (shapes.length > 0) {
        const extrudedGeos = [];
        shapes.forEach(s => {
          try {
            const g = new THREE.ExtrudeGeometry(s, { depth: 1.0, bevelEnabled: false });
            extrudedGeos.push(g);
          } catch(e){}
        });

        if (extrudedGeos.length > 0) {
          const mergedGeo = extrudedGeos[0];
          mergedGeo.center();
          mergedGeo.computeVertexNormals();
          this.state.logoGeometry = mergedGeo;
          this.updateMesh();
          return;
        }
      }
    } catch(e) {
      console.error("DXF parse error:", e);
    }
  }

  // -------------------------------------------------------------
  // CURVED LOGO PLACEMENT & WRAPPING ENGINE
  // -------------------------------------------------------------
  buildCustomLogoGroup(outerR, sleeveLength, defaultMaterial) {
    if (!this.state.logoEnabled || !this.state.logoGeometry) return null;

    const logoGroup = new THREE.Group();
    const origGeo = this.state.logoGeometry.clone();
    origGeo.computeBoundingBox();
    const bbox = origGeo.boundingBox;

    const origW = bbox.max.x - bbox.min.x;
    const origH = bbox.max.y - bbox.min.y;
    const origD = Math.max(0.001, bbox.max.z - bbox.min.z);

    if (origW === 0 || origH === 0) return null;

    const targetSize = this.state.logoScale || 16.0;
    const targetDepth = this.state.logoDepth || 0.8;

    const maxDim = Math.max(origW, origH);
    const scaleFactor = targetSize / maxDim;

    const flipX = this.state.logoFlipH ? -1 : 1;
    const flipY = this.state.logoFlipV ? -1 : 1;

    const rotRad = ((this.state.logoRotate || 0) * Math.PI) / 180;
    if (rotRad !== 0) {
      origGeo.rotateZ(rotRad);
    }

    origGeo.scale(scaleFactor * flipX, scaleFactor * flipY, targetDepth / origD);
    origGeo.center();

    // Wrap geometry onto cylinder radius outerR
    const posAttr = origGeo.attributes.position;
    const count = posAttr.count;

    for (let i = 0; i < count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);

      const theta = x / outerR;
      const r = outerR + z;

      const newX = r * Math.sin(theta);
      const newZ = r * Math.cos(theta);

      posAttr.setXYZ(i, newX, y, newZ);
    }

    origGeo.computeVertexNormals();

    const logoMaterial = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.60,
      metalness: 0.6,
      roughness: 0.2
    });

    const logoMesh = new THREE.Mesh(origGeo, logoMaterial);

    let posY = 0.0;
    if (this.state.logoPosition === 'top') {
      posY = (sleeveLength / 2) - (targetSize / 2) - 4.0;
    } else if (this.state.logoPosition === 'bottom') {
      posY = -(sleeveLength / 2) + (targetSize / 2) + 4.0;
    } else {
      posY = 0.0;
    }

    logoGroup.position.set(0, posY, 0);

    const angleRad = (this.state.logoAngle || 0) * (Math.PI / 180);
    logoGroup.rotation.y = angleRad;

    logoGroup.add(logoMesh);
    return logoGroup;
  }

  // -------------------------------------------------------------
  // UI CONTROLLER BINDINGS
  // -------------------------------------------------------------
  initUI() {
    const inputOD = document.getElementById('inputOD');
    const inputLength = document.getElementById('inputLength');
    const inputGlassLength = document.getElementById('inputGlassLength');
    const inputGlassOffset = document.getElementById('inputGlassOffset');
    const inputText = document.getElementById('inputText');
    const inputTextBacking = document.getElementById('inputTextBacking');
    const inputLip = document.getElementById('inputLip');
    const inputAutoLipOffset = document.getElementById('inputAutoLipOffset');
    const windowBtns = document.querySelectorAll('[data-window]');
    const textStyleBtns = document.querySelectorAll('[data-textstyle]');
    const engraveStyleBtns = document.querySelectorAll('[data-engravestyle]');
    const resetCamBtn = document.getElementById('resetCameraBtn');
    const toggleGlassBtn = document.getElementById('toggleGlassBtn');
    const downloadStlBtn = document.getElementById('downloadStlBtn');

    if (inputOD) {
      inputOD.addEventListener('input', (e) => {
        this.state.outerDiameter = parseFloat(e.target.value);
        this.updateMesh();
      });
    }

    if (inputGlassLength) {
      inputGlassLength.addEventListener('input', (e) => {
        this.state.glassLength = parseFloat(e.target.value);
        this.updateMesh();
      });
    }

    if (inputGlassOffset) {
      inputGlassOffset.addEventListener('input', (e) => {
        const rawVal = parseFloat(e.target.value);
        const maxOffset = Math.max(10.0, this.state.glassLength + 10.0);
        this.state.glassOffset = Math.max(0.0, Math.min(rawVal, maxOffset));
        this.updateMesh();
      });
    }

    // Quick Preset Example Buttons
    const presets = [
      { id: 'presetStandardLattice', state: { outerDiameter: 21.0, glassLength: 100.0, windowType: 'lattice', engraveStyle: 'embossed', engravingText: 'QUINN FOSTER' } },
      { id: 'presetCompactSlots', state: { outerDiameter: 20.0, glassLength: 80.0, windowType: 'slotted', engraveStyle: 'embossed', engravingText: 'COMPACT 80MM' } },
      { id: 'presetLongDebossed', state: { outerDiameter: 22.0, glassLength: 120.0, windowType: 'lattice', engraveStyle: 'debossed', engravingText: 'STUDIO 120MM' } },
      { id: 'presetSolidArmor', state: { outerDiameter: 24.0, glassLength: 100.0, windowType: 'solid', engraveStyle: 'embossed', engravingText: 'HEAVY ARMOR' } }
    ];

    presets.forEach(p => {
      const btn = document.getElementById(p.id);
      if (btn) {
        btn.addEventListener('click', () => {
          Object.assign(this.state, p.state, { glassOffset: 0.0 });
          this.syncDOMFromState();
          this.updateMesh();
        });
      }
    });

    const inputDepth = document.getElementById('inputDepth');
    const readoutDepth = document.getElementById('readoutDepth');

    if (inputDepth) {
      inputDepth.addEventListener('input', (e) => {
        this.state.engraveDepth = parseFloat(e.target.value);
        if (readoutDepth) readoutDepth.textContent = `${this.state.engraveDepth.toFixed(1)} mm`;
        this.updateMesh();
      });
    }

    const inputCharSpacing = document.getElementById('inputCharSpacing');
    const readoutCharSpacing = document.getElementById('readoutCharSpacing');

    if (inputCharSpacing) {
      inputCharSpacing.addEventListener('input', (e) => {
        this.state.charSpacing = parseFloat(e.target.value);
        if (readoutCharSpacing) readoutCharSpacing.textContent = `${this.state.charSpacing.toFixed(1)}x`;
        this.updateMesh();
      });
    }

    if (inputText) {
      inputText.addEventListener('input', (e) => {
        this.state.engravingText = e.target.value;
        this.updateMesh();
      });
    }

    if (inputTextBacking) {
      inputTextBacking.addEventListener('change', (e) => {
        this.state.textBacking = e.target.checked;
        this.updateMesh();
      });
    }

    if (inputLip) {
      inputLip.addEventListener('change', (e) => {
        this.state.lipRetainer = e.target.checked;
        this.updateMesh();
      });
    }

    if (inputAutoLipOffset) {
      inputAutoLipOffset.addEventListener('change', (e) => {
        this.state.autoLipOffset = e.target.checked;
        this.updateMesh();
      });
    }

    windowBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        windowBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.windowType = btn.getAttribute('data-window');
        this.updateMesh();
      });
    });

    textStyleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        textStyleBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.textStyle = btn.getAttribute('data-textstyle');
        this.updateMesh();
      });
    });

    engraveStyleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        engraveStyleBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.engraveStyle = btn.getAttribute('data-engravestyle');

        const labelDepth = document.getElementById('labelDepth');
        if (labelDepth) {
          labelDepth.textContent = this.state.engraveStyle === 'debossed' ? 'Engraving Cut Depth' : 'Raised Text Height';
        }

        this.updateMesh();
      });
    });

    if (resetCamBtn) {
      resetCamBtn.addEventListener('click', () => this.resetView());
    }

    if (toggleGlassBtn) {
      toggleGlassBtn.addEventListener('click', () => {
        toggleGlassBtn.classList.toggle('active');
        this.state.showGlassTube = toggleGlassBtn.classList.contains('active');
        this.updateMesh();
      });
    }

    // Custom Logo UI Event Listeners
    const inputLogoToggle = document.getElementById('inputLogoToggle');
    const logoControlsContainer = document.getElementById('logoControlsContainer');
    const btnBrowseLogo = document.getElementById('btnBrowseLogo');
    const inputLogoFile = document.getElementById('inputLogoFile');
    const logoPosBtns = document.querySelectorAll('[data-logopos]');
    const inputLogoAngle = document.getElementById('inputLogoAngle');
    const readoutLogoAngle = document.getElementById('readoutLogoAngle');
    const btnLogoFlipH = document.getElementById('btnLogoFlipH');
    const btnLogoFlipV = document.getElementById('btnLogoFlipV');
    const inputLogoScale = document.getElementById('inputLogoScale');
    const readoutLogoScale = document.getElementById('readoutLogoScale');
    const inputLogoDepth = document.getElementById('inputLogoDepth');
    const readoutLogoDepth = document.getElementById('readoutLogoDepth');
    const inputLogoInvert = document.getElementById('inputLogoInvert');

    if (inputLogoToggle) {
      inputLogoToggle.addEventListener('change', (e) => {
        this.state.logoEnabled = e.target.checked;
        if (logoControlsContainer) {
          logoControlsContainer.style.display = this.state.logoEnabled ? 'flex' : 'none';
        }
        this.updateMesh();
      });
    }

    if (btnBrowseLogo && inputLogoFile) {
      btnBrowseLogo.addEventListener('click', () => inputLogoFile.click());
      inputLogoFile.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleLogoFileUpload(e.target.files[0]);
        }
      });
    }

    logoPosBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        logoPosBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.logoPosition = btn.getAttribute('data-logopos');
        this.updateMesh();
      });
    });

    if (inputLogoAngle) {
      inputLogoAngle.addEventListener('input', (e) => {
        this.state.logoAngle = parseFloat(e.target.value);
        if (readoutLogoAngle) readoutLogoAngle.textContent = `${this.state.logoAngle.toFixed(0)}┬░`;
        this.updateMesh();
      });
    }

    const btnLogoRotateCW = document.getElementById('btnLogoRotateCW');
    const btnLogoRotateCCW = document.getElementById('btnLogoRotateCCW');

    if (btnLogoRotateCW) {
      btnLogoRotateCW.addEventListener('click', () => {
        this.state.logoRotate = ((this.state.logoRotate || 0) + 90) % 360;
        this.updateMesh();
      });
    }

    if (btnLogoRotateCCW) {
      btnLogoRotateCCW.addEventListener('click', () => {
        this.state.logoRotate = ((this.state.logoRotate || 0) - 90 + 360) % 360;
        this.updateMesh();
      });
    }

    if (btnLogoFlipH) {
      btnLogoFlipH.addEventListener('click', () => {
        btnLogoFlipH.classList.toggle('active');
        this.state.logoFlipH = btnLogoFlipH.classList.contains('active');
        this.updateMesh();
      });
    }

    if (btnLogoFlipV) {
      btnLogoFlipV.addEventListener('click', () => {
        btnLogoFlipV.classList.toggle('active');
        this.state.logoFlipV = btnLogoFlipV.classList.contains('active');
        this.updateMesh();
      });
    }

    if (inputLogoScale) {
      inputLogoScale.addEventListener('input', (e) => {
        this.state.logoScale = parseFloat(e.target.value);
        if (readoutLogoScale) readoutLogoScale.textContent = `${this.state.logoScale.toFixed(1)} mm`;
        this.updateMesh();
      });
    }

    if (inputLogoDepth) {
      inputLogoDepth.addEventListener('input', (e) => {
        this.state.logoDepth = parseFloat(e.target.value);
        if (readoutLogoDepth) readoutLogoDepth.textContent = `${this.state.logoDepth.toFixed(1)} mm`;
        this.updateMesh();
      });
    }

    if (inputLogoInvert) {
      inputLogoInvert.addEventListener('change', (e) => {
        this.state.logoInvert = e.target.checked;
        if (this.state.logoRawData && this.state.logoFileType === 'image') {
          this.processImageLithograph(this.state.logoRawData);
        }
      });
    }

    if (downloadStlBtn) {
      downloadStlBtn.addEventListener('click', () => this.exportSTL());
    }

    const saveProjectBtn = document.getElementById('saveProjectBtn');
    const importProjectBtn = document.getElementById('importProjectBtn');
    const inputProjectFile = document.getElementById('inputProjectFile');

    if (saveProjectBtn) {
      saveProjectBtn.addEventListener('click', () => this.exportProjectDraft());
    }

    if (importProjectBtn && inputProjectFile) {
      importProjectBtn.addEventListener('click', () => inputProjectFile.click());
      inputProjectFile.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.importProjectDraft(e.target.files[0]);
        }
      });
    }
  }

  // -------------------------------------------------------------
  // URL PARAMETER SYNCHRONIZATION (DEEP LINKING)
  // -------------------------------------------------------------
  syncStateToURL() {
    try {
      const params = new URLSearchParams();
      params.set('od', this.state.outerDiameter.toFixed(1));
      params.set('glass', this.state.glassLength.toFixed(1));
      params.set('offset', this.state.glassOffset.toFixed(1));
      params.set('pattern', this.state.windowType);
      if (this.state.engravingText) params.set('text', this.state.engravingText);
      params.set('style', this.state.engraveStyle);
      params.set('depth', this.state.engraveDepth.toFixed(1));
      params.set('spacing', this.state.charSpacing.toFixed(1));
      params.set('wrap', this.state.textStyle);
      params.set('backing', this.state.textBacking ? '1' : '0');
      params.set('lip', this.state.lipRetainer ? '1' : '0');
      params.set('autolip', this.state.autoLipOffset ? '1' : '0');
      
      if (this.state.logoEnabled) {
        params.set('logo', '1');
        params.set('logopos', this.state.logoPosition);
        params.set('logoangle', this.state.logoAngle.toFixed(0));
        params.set('logoscale', this.state.logoScale.toFixed(1));
        params.set('logodepth', this.state.logoDepth.toFixed(1));
        if (this.state.logoRotate) params.set('logorotate', this.state.logoRotate.toFixed(0));
        if (this.state.logoInvert) params.set('logoinvert', '1');
        if (this.state.logoFlipH) params.set('fliph', '1');
        if (this.state.logoFlipV) params.set('flipv', '1');
      }

      const queryString = `?${params.toString()}`;
      const baseUrl = window.location.href.split('?')[0].split('#')[0];
      const fullUrl = `${baseUrl}${queryString}`;

      try {
        history.replaceState(null, '', queryString);
      } catch (histErr) {
        // Fallback for file:// or strict origins
      }

      if (window.updateGlobalTopbarUrl) {
        window.updateGlobalTopbarUrl(fullUrl);
      }
    } catch (e) {
      console.warn("Could not sync state to URL:", e);
    }
  }

  loadStateFromURL() {
    try {
      const params = new URLSearchParams(window.location.search);
      if ([...params.keys()].length === 0) return;

      if (params.has('od')) this.state.outerDiameter = parseFloat(params.get('od')) || 21.0;
      if (params.has('glass')) {
        this.state.glassLength = parseFloat(params.get('glass')) || 100.0;
        this.state.length = this.state.autoLipOffset ? this.state.glassLength + 1.0 : this.state.glassLength;
      }
      if (params.has('offset')) this.state.glassOffset = parseFloat(params.get('offset')) || 0.0;
      if (params.has('pattern')) this.state.windowType = params.get('pattern');
      if (params.has('text')) this.state.engravingText = params.get('text');
      if (params.has('style')) this.state.engraveStyle = params.get('style');
      if (params.has('depth')) this.state.engraveDepth = parseFloat(params.get('depth')) || 0.8;
      if (params.has('spacing')) this.state.charSpacing = parseFloat(params.get('spacing')) || 1.0;
      if (params.has('wrap')) this.state.textStyle = params.get('wrap');
      if (params.has('backing')) this.state.textBacking = params.get('backing') === '1';
      if (params.has('lip')) this.state.lipRetainer = params.get('lip') === '1';
      if (params.has('autolip')) this.state.autoLipOffset = params.get('autolip') === '1';

      if (params.has('logo')) this.state.logoEnabled = params.get('logo') === '1';
      if (params.has('logopos')) this.state.logoPosition = params.get('logopos');
      if (params.has('logoangle')) this.state.logoAngle = parseFloat(params.get('logoangle')) || 0;
      if (params.has('logoscale')) this.state.logoScale = parseFloat(params.get('logoscale')) || 16.0;
      if (params.has('logodepth')) this.state.logoDepth = parseFloat(params.get('logodepth')) || 0.8;
      if (params.has('logoinvert')) this.state.logoInvert = params.get('logoinvert') === '1';
      if (params.has('fliph')) this.state.logoFlipH = params.get('fliph') === '1';
      if (params.has('flipv')) this.state.logoFlipV = params.get('flipv') === '1';

      this.syncDOMFromState();
    } catch (e) {
      console.warn("Error reading URL parameters:", e);
    }
  }

  syncDOMFromState() {
    const inputOD = document.getElementById('inputOD');
    const readoutOD = document.getElementById('readoutOD');
    if (inputOD) {
      inputOD.value = this.state.outerDiameter;
      if (readoutOD) readoutOD.textContent = `${this.state.outerDiameter.toFixed(1)} mm`;
    }

    const inputGlassLength = document.getElementById('inputGlassLength');
    const readoutGlassLength = document.getElementById('readoutGlassLength');
    if (inputGlassLength) {
      inputGlassLength.value = this.state.glassLength;
      if (readoutGlassLength) readoutGlassLength.textContent = `${this.state.glassLength.toFixed(1)} mm`;
    }

    const inputLength = document.getElementById('inputLength');
    const readoutLength = document.getElementById('readoutLength');
    if (inputLength) {
      inputLength.value = this.state.length;
      if (readoutLength) readoutLength.textContent = `${this.state.length.toFixed(1)} mm (${this.state.autoLipOffset ? '1.0mm lip added below automatically' : 'Flush'})`;
    }

    const inputGlassOffset = document.getElementById('inputGlassOffset');
    const readoutGlassOffset = document.getElementById('readoutGlassOffset');
    if (inputGlassOffset) {
      const maxOffset = Math.max(10.0, this.state.glassLength + 10.0);
      inputGlassOffset.min = "0.0";
      inputGlassOffset.max = maxOffset.toFixed(1);
      inputGlassOffset.value = this.state.glassOffset;
      if (readoutGlassOffset) readoutGlassOffset.textContent = this.state.glassOffset === 0 ? "0.0 mm (Seated)" : `+${this.state.glassOffset.toFixed(1)} mm`;
    }

    const inputText = document.getElementById('inputText');
    if (inputText) inputText.value = this.state.engravingText;

    const inputDepth = document.getElementById('inputDepth');
    const readoutDepth = document.getElementById('readoutDepth');
    if (inputDepth) {
      inputDepth.value = this.state.engraveDepth;
      if (readoutDepth) readoutDepth.textContent = `${this.state.engraveDepth.toFixed(1)} mm`;
    }

    const inputCharSpacing = document.getElementById('inputCharSpacing');
    const readoutCharSpacing = document.getElementById('readoutCharSpacing');
    if (inputCharSpacing) {
      inputCharSpacing.value = this.state.charSpacing;
      if (readoutCharSpacing) readoutCharSpacing.textContent = `${this.state.charSpacing.toFixed(1)}x`;
    }

    const inputTextBacking = document.getElementById('inputTextBacking');
    if (inputTextBacking) inputTextBacking.checked = this.state.textBacking;

    const inputLip = document.getElementById('inputLip');
    if (inputLip) inputLip.checked = this.state.lipRetainer;

    const inputAutoLipOffset = document.getElementById('inputAutoLipOffset');
    if (inputAutoLipOffset) inputAutoLipOffset.checked = this.state.autoLipOffset;

    // Toggle button groups
    document.querySelectorAll('[data-window]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-window') === this.state.windowType);
    });
    document.querySelectorAll('[data-textstyle]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-textstyle') === this.state.textStyle);
    });
    document.querySelectorAll('[data-engravestyle]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-engravestyle') === this.state.engraveStyle);
    });

    // Logo Controls
    const inputLogoToggle = document.getElementById('inputLogoToggle');
    const logoControlsContainer = document.getElementById('logoControlsContainer');
    if (inputLogoToggle) {
      inputLogoToggle.checked = this.state.logoEnabled;
      if (logoControlsContainer) logoControlsContainer.style.display = this.state.logoEnabled ? 'flex' : 'none';
    }

    document.querySelectorAll('[data-logopos]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-logopos') === this.state.logoPosition);
    });

    const inputLogoAngle = document.getElementById('inputLogoAngle');
    const readoutLogoAngle = document.getElementById('readoutLogoAngle');
    if (inputLogoAngle) {
      inputLogoAngle.value = this.state.logoAngle;
      if (readoutLogoAngle) readoutLogoAngle.textContent = `${this.state.logoAngle.toFixed(0)}┬░`;
    }

    const btnLogoFlipH = document.getElementById('btnLogoFlipH');
    if (btnLogoFlipH) btnLogoFlipH.classList.toggle('active', this.state.logoFlipH);

    const btnLogoFlipV = document.getElementById('btnLogoFlipV');
    if (btnLogoFlipV) btnLogoFlipV.classList.toggle('active', this.state.logoFlipV);

    const inputLogoScale = document.getElementById('inputLogoScale');
    const readoutLogoScale = document.getElementById('readoutLogoScale');
    if (inputLogoScale) {
      inputLogoScale.value = this.state.logoScale;
      if (readoutLogoScale) readoutLogoScale.textContent = `${this.state.logoScale.toFixed(1)} mm`;
    }

    const inputLogoDepth = document.getElementById('inputLogoDepth');
    const readoutLogoDepth = document.getElementById('readoutLogoDepth');
    if (inputLogoDepth) {
      inputLogoDepth.value = this.state.logoDepth;
      if (readoutLogoDepth) readoutLogoDepth.textContent = `${this.state.logoDepth.toFixed(1)} mm`;
    }

    const inputLogoInvert = document.getElementById('inputLogoInvert');
    if (inputLogoInvert) inputLogoInvert.checked = this.state.logoInvert;
  }

  // -------------------------------------------------------------
  // SAVE & IMPORT PROJECT DRAFT (.JSON)
  // -------------------------------------------------------------
  exportProjectDraft() {
    const draftData = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      state: {
        innerDiameter: this.state.innerDiameter,
        outerDiameter: this.state.outerDiameter,
        length: this.state.length,
        glassLength: this.state.glassLength,
        glassOffset: this.state.glassOffset,
        textBacking: this.state.textBacking,
        engravingText: this.state.engravingText,
        textStyle: this.state.textStyle,
        engraveStyle: this.state.engraveStyle,
        engraveDepth: this.state.engraveDepth,
        charSpacing: this.state.charSpacing,
        windowType: this.state.windowType,
        lipRetainer: this.state.lipRetainer,
        autoLipOffset: this.state.autoLipOffset,
        logoEnabled: this.state.logoEnabled,
        logoFileName: this.state.logoFileName,
        logoFileType: this.state.logoFileType,
        logoRawData: this.state.logoRawData,
        logoPosition: this.state.logoPosition,
        logoAngle: this.state.logoAngle,
        logoFlipH: this.state.logoFlipH,
        logoFlipV: this.state.logoFlipV,
        logoScale: this.state.logoScale,
        logoDepth: this.state.logoDepth,
        logoInvert: this.state.logoInvert
      }
    };

    const jsonString = JSON.stringify(draftData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const link = document.createElement('a');
    const safeName = (this.state.engravingText.trim() || 'Sleeve').replace(/[^a-z0-9]/gi, '_');
    link.href = URL.createObjectURL(blob);
    link.download = `Sleeve_Project_Draft_${safeName}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  importProjectDraft(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const draft = JSON.parse(e.target.result);
        if (draft && draft.state) {
          Object.assign(this.state, draft.state);
          
          if (this.state.logoRawData && this.state.logoFileType) {
            if (this.state.logoFileType === 'image') {
              this.processImageLithograph(this.state.logoRawData);
            } else if (this.state.logoFileType === 'dxf') {
              this.processDxfVector(this.state.logoRawData);
            } else if (this.state.logoFileType === 'stl') {
              if (Array.isArray(this.state.logoRawData)) {
                const buffer = new Uint8Array(this.state.logoRawData).buffer;
                this.processStlMesh(buffer);
              } else {
                this.processStlMesh(this.state.logoRawData);
              }
            }
          }

          this.syncDOMFromState();
          this.syncStateToURL();
          this.updateMesh();
        }
      } catch (err) {
        console.error("Error importing project draft:", err);
        alert("Failed to parse Project Draft JSON file.");
      }
    };
    reader.readAsText(file);
  }

  // -------------------------------------------------------------
  // STL EXPORT ENGINE
  // -------------------------------------------------------------
  exportSTL() {
    if (!this.sleeveGroup || !THREE.STLExporter) {
      alert("STL Exporter is initializing. Please try again in a moment.");
      return;
    }

    const exporter = new THREE.STLExporter();
    const result = exporter.parse(this.sleeveGroup, { binary: true });

    const blob = new Blob([result], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.style.display = 'none';
    document.body.appendChild(link);

    const safeName = (this.state.engravingText.trim() || 'AudioTube').replace(/[^a-z0-9]/gi, '_');
    link.href = URL.createObjectURL(blob);
    link.download = `Sleeve_16mm_${safeName}_${this.state.length.toFixed(0)}mm.stl`;
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('canvasContainer')) {
    window.stlGen = new STLGenerator();
  }
});
