// CSG Web Worker for Manifold3D Engine
// Handles heavy boolean operations asynchronously to keep the main thread snappy.

importScripts('https://cdn.jsdelivr.net/npm/manifold-3d@2.5.1/manifold.js');

let manifoldKernel = null;

// Initialize Manifold WASM kernel
Module().then(function (wasm) {
  wasm.setup();
  manifoldKernel = wasm;
  postMessage({ type: 'INIT', status: 'ready' });
}).catch(function(err) {
  postMessage({ type: 'ERROR', message: 'Failed to load Manifold3D' });
});

self.onmessage = function (e) {
  if (e.data.type === 'PERFORM_CSG') {
    if (!manifoldKernel) {
      postMessage({ type: 'ERROR', message: 'Manifold not initialized yet' });
      return;
    }

    const { baseGeo, textGeo, operation, jobId } = e.data;

    try {
      // Create Manifold objects from geometry buffers
      const baseMesh = new manifoldKernel.Mesh({
        numProp: 3,
        vertProperties: baseGeo.positions,
        triVerts: baseGeo.indices
      });
      const baseManifold = new manifoldKernel.Manifold(baseMesh);

      const textMesh = new manifoldKernel.Mesh({
        numProp: 3,
        vertProperties: textGeo.positions,
        triVerts: textGeo.indices
      });
      const textManifold = new manifoldKernel.Manifold(textMesh);

      // Perform Boolean Operation
      let resultManifold;
      if (operation === 'difference') {
        resultManifold = manifoldKernel.difference(baseManifold, textManifold);
      } else if (operation === 'union') {
        resultManifold = manifoldKernel.union(baseManifold, textManifold);
      } else {
        throw new Error("Unknown CSG operation: " + operation);
      }

      // Extract resulting mesh
      const outMesh = resultManifold.getMesh();
      
      // Cleanup WASM memory
      baseManifold.delete();
      textManifold.delete();
      resultManifold.delete();

      // Send result back to main thread
      postMessage({
        type: 'CSG_RESULT',
        jobId: jobId,
        positions: outMesh.vertProperties,
        indices: outMesh.triVerts
      });

    } catch (err) {
      console.error("CSG Worker Error:", err);
      postMessage({ type: 'ERROR', jobId: jobId, message: err.message });
    }
  }
};
