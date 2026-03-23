/**
 * Injects an editor script into booth HTML that adds:
 * - TransformControls for move/scale
 * - GLTFLoader for uploading objects
 * - Click-to-select via raycasting
 * - postMessage API for parent ↔ iframe communication
 *
 * Requirements for the HTML:
 * - Must expose `scene`, `camera`, `renderer` as global variables
 * - Must use Three.js (global `THREE` object)
 * - Optionally expose `controls` (OrbitControls) to disable during gizmo drag
 */
export function injectEditorIntoHtml(html: string): string {
  const editorScript = '<script>' + getEditorScript() + '<\/script>'

  // Early patches that run BEFORE Three.js loads:
  // 1. preserveDrawingBuffer — needed for screenshots
  // 2. Constructor capture — patches THREE.Scene/Camera/Renderer to auto-save
  //    instances to window globals, so the editor works even when user code
  //    wraps everything in a function or uses let/const
  const earlyPatch = `<script>(function(){
    var _gc=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(t,a){
      if(t==="webgl"||t==="webgl2"||t==="experimental-webgl"){a=Object.assign({},a,{preserveDrawingBuffer:true});}
      return _gc.call(this,t,a);
    };
    var _corePatched=false;
    var _controlsPatched=false;
    function patchCore(){
      if(_corePatched)return;
      if(typeof THREE==="undefined"||!THREE.Scene)return;
      _corePatched=true;
      var OS=THREE.Scene;
      THREE.Scene=function(){var i=new OS();window.scene=window.scene||i;return i;};
      THREE.Scene.prototype=OS.prototype;
      var OPC=THREE.PerspectiveCamera;
      THREE.PerspectiveCamera=function(f,a,n,fa){var i=new OPC(f,a,n,fa);window.camera=window.camera||i;return i;};
      THREE.PerspectiveCamera.prototype=OPC.prototype;
      var OOC=THREE.OrthographicCamera;
      if(OOC){THREE.OrthographicCamera=function(l,r,t,b,n,f){var i=new OOC(l,r,t,b,n,f);window.camera=window.camera||i;return i;};THREE.OrthographicCamera.prototype=OOC.prototype;}
      var OR=THREE.WebGLRenderer;
      THREE.WebGLRenderer=function(p){var i=new OR(p);window.renderer=window.renderer||i;return i;};
      THREE.WebGLRenderer.prototype=OR.prototype;
    }
    function patchControls(){
      if(_controlsPatched)return;
      if(typeof THREE==="undefined"||!THREE.OrbitControls)return;
      _controlsPatched=true;
      var OOC2=THREE.OrbitControls;
      THREE.OrbitControls=function(c,d){var i=new OOC2(c,d);window.controls=window.controls||i;return i;};
      THREE.OrbitControls.prototype=OOC2.prototype;
    }
    function patchAll(){patchCore();patchControls();}
    // Strategy 1: Watch for script tags loading
    new MutationObserver(function(muts){
      muts.forEach(function(m){
        m.addedNodes.forEach(function(n){
          if(n.tagName==="SCRIPT"&&n.src){
            n.addEventListener("load",function(){patchAll();});
          }
        });
      });
    }).observe(document.documentElement,{childList:true,subtree:true});
    // Strategy 2: Polling fallback every 10ms
    var pi=setInterval(function(){patchAll();if(_corePatched&&_controlsPatched)clearInterval(pi);},10);
    // Strategy 3: Also patch on DOMContentLoaded
    document.addEventListener("DOMContentLoaded",function(){patchAll();});
  })();<\/script>`

  // Inject the buffer patch as early as possible (right after <head>)
  let result = html
  if (result.includes('<head>')) {
    result = result.replace('<head>', '<head>\n' + earlyPatch)
  } else if (result.includes('<HEAD>')) {
    result = result.replace('<HEAD>', '<HEAD>\n' + earlyPatch)
  } else {
    // No head tag — prepend it
    result = earlyPatch + '\n' + result
  }

  // Inject the editor script at the end of body
  if (result.includes('</body>')) {
    return result.replace('</body>', editorScript + '\n</body>')
  }
  return result + '\n' + editorScript
}

function getEditorScript(): string {
  return `
(function() {
  var MAX_WAIT = 600;
  var WAIT_MS = 200;

  // Auto-detect Three.js objects on window by type, regardless of variable name
  function autoDetectGlobals() {
    if (typeof THREE === "undefined") return;
    try {
      for (var key in window) {
        try {
          var val = window[key];
          if (!val || typeof val !== "object") continue;
          if (val instanceof THREE.Scene && (typeof scene === "undefined" || scene === null)) {
            window.scene = val;
          } else if ((val instanceof THREE.PerspectiveCamera || val instanceof THREE.OrthographicCamera) && (typeof camera === "undefined" || camera === null)) {
            window.camera = val;
          } else if (val instanceof THREE.WebGLRenderer && (typeof renderer === "undefined" || renderer === null)) {
            window.renderer = val;
          } else if (typeof controls === "undefined" && val && val.domElement && typeof val.enabled !== "undefined") {
            window.controls = val;
          }
        } catch(e) {}
      }
    } catch(e) {}
  }

  function waitForGlobals(callback) {
    var attempts = 0;
    var lastNotify = 0;
    var check = function() {
      var hasThree = typeof THREE !== "undefined";
      // Try auto-detect every check
      if (hasThree) autoDetectGlobals();

      var hasScene = typeof scene !== "undefined" && scene !== null;

      // Only THREE + scene are required; camera/renderer are optional (for gizmos)
      if (hasThree && hasScene) {
        callback();
      } else if (attempts < MAX_WAIT) {
        attempts++;
        if (attempts - lastNotify >= 10) {
          lastNotify = attempts;
          var missing = [];
          if (!hasThree) missing.push("THREE");
          if (!hasScene) missing.push("scene");
          window.parent.postMessage({ type: "EDITOR_WAITING", missing: missing, elapsed: Math.round(attempts * WAIT_MS / 1000) }, "*");
        }
        setTimeout(check, WAIT_MS);
      } else {
        var missing2 = [];
        if (typeof THREE === "undefined") missing2.push("THREE");
        if (typeof scene === "undefined" || scene === null) missing2.push("scene");
        console.error("Booth Editor: Required globals not found after " + (MAX_WAIT * WAIT_MS / 1000) + "s. Missing: " + missing2.join(", "));
        window.parent.postMessage({ type: "EDITOR_ERROR", message: "Required globals not found: " + missing2.join(", ") }, "*");
      }
    };
    check();
  }

  function loadScript(url) {
    return new Promise(function(resolve, reject) {
      var s = document.createElement("script");
      s.src = url;
      s.onload = resolve;
      s.onerror = function() { reject(new Error("Failed to load: " + url)); };
      document.head.appendChild(s);
    });
  }

  function isESMVersion() {
    var rev = parseInt(THREE.REVISION, 10);
    return rev >= 150;
  }

  window.__editorModules = {};

  function loadESM(modulePaths) {
    // For ES module Three.js (r150+), we create a <script type="module"> that
    // imports the needed addons and stores them on window.__editorModules
    // (THREE is a frozen ES module object, can't assign to it directly).
    return new Promise(function(resolve, reject) {
      var ver = THREE.REVISION || "160";
      var base = "https://cdn.jsdelivr.net/npm/three@0." + ver + ".0/examples/jsm/";
      var imports = [];
      var assigns = [];
      modulePaths.forEach(function(item) {
        imports.push("import { " + item.name + " } from '" + base + item.path + "';");
        assigns.push("window.__editorModules." + item.name + " = " + item.name + ";");
      });
      var code = imports.join("\\n") + "\\n" + assigns.join("\\n") + "\\nwindow.dispatchEvent(new Event('__editorModulesLoaded'));";
      var s = document.createElement("script");
      s.type = "module";
      s.textContent = code;
      window.addEventListener("__editorModulesLoaded", function handler() {
        window.removeEventListener("__editorModulesLoaded", handler);
        resolve();
      });
      s.onerror = function() { reject(new Error("Failed to load ES modules")); };
      document.head.appendChild(s);
    });
  }

  waitForGlobals(function() {
    var version = THREE.REVISION || "128";
    var hasCamera = typeof camera !== "undefined" && camera !== null;
    var hasRenderer = typeof renderer !== "undefined" && renderer !== null;
    var canUseGizmos = hasCamera && hasRenderer;

    if (isESMVersion()) {
      // r150+ only has ES modules — load all needed addons in one module script
      var modules = [];
      if (canUseGizmos && !THREE.TransformControls) {
        modules.push({ name: "TransformControls", path: "controls/TransformControls.js" });
      }
      if (!THREE.GLTFLoader) {
        modules.push({ name: "GLTFLoader", path: "loaders/GLTFLoader.js" });
      }
      if (modules.length > 0) {
        loadESM(modules).then(function() { initEditor(canUseGizmos); }).catch(function(err) {
          console.error("Booth Editor: Failed to load ES modules:", err);
          window.parent.postMessage({ type: "EDITOR_ERROR", message: String(err) }, "*");
        });
      } else {
        initEditor(canUseGizmos);
      }
    } else {
      // r149 and below have classic script builds
      var loaders = [];
      if (canUseGizmos && !THREE.TransformControls) {
        loaders.push(loadScript("https://cdn.jsdelivr.net/npm/three@0." + version + ".0/examples/js/controls/TransformControls.js"));
      }
      if (!THREE.GLTFLoader) {
        loaders.push(loadScript("https://cdn.jsdelivr.net/npm/three@0." + version + ".0/examples/js/loaders/GLTFLoader.js"));
      }
      Promise.all(loaders).then(function() { initEditor(canUseGizmos); }).catch(function(err) {
        console.error("Booth Editor: Failed to load required modules:", err);
        window.parent.postMessage({ type: "EDITOR_ERROR", message: String(err) }, "*");
      });
    }
  });

  function initEditor(canUseGizmos) {
    var em = window.__editorModules || {};
    var TransformControlsCtor = em.TransformControls || THREE.TransformControls;
    var GLTFLoaderCtor = em.GLTFLoader || THREE.GLTFLoader;
    var GLTFExporterCtor = em.GLTFExporter || THREE.GLTFExporter;

    var editorObjects = {};
    var selectedId = null;
    var currentTransformMode = "translate";
    var currentEditorMode = "edit";
    var tc = null;

    // --- TransformControls (only if camera + renderer available) ---
    if (canUseGizmos && TransformControlsCtor) {
      var _justDragged = false;
      tc = new TransformControlsCtor(camera, renderer.domElement);
      tc.addEventListener("dragging-changed", function(event) {
        if (typeof controls !== "undefined") controls.enabled = !event.value;
        if (!event.value && tc.object) {
          _justDragged = true;
          setTimeout(function() { _justDragged = false; }, 300);
          var obj = tc.object;
          window.parent.postMessage({
            type: "TRANSFORM_CHANGED", id: selectedId,
            position: [obj.position.x, obj.position.y, obj.position.z],
            scale: [obj.scale.x, obj.scale.y, obj.scale.z]
          }, "*");
        }
      });
      tc.addEventListener("objectChange", function() {
        if (selectedId && tc.object) {
          var obj = tc.object;
          window.parent.postMessage({
            type: "TRANSFORM_CHANGED", id: selectedId,
            position: [obj.position.x, obj.position.y, obj.position.z],
            scale: [obj.scale.x, obj.scale.y, obj.scale.z]
          }, "*");
        }
      });
      scene.add(tc);

      // --- Raycaster for click-to-select ---
      var raycaster = new THREE.Raycaster();
      var mouse = new THREE.Vector2();
      renderer.domElement.addEventListener("click", function(event) {
        if (currentEditorMode !== "edit") return;
        if (_justDragged) return;
        var rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        if (tc && tc.object) {
          var gizmoMeshes = [];
          tc.traverse(function(child) { if (child.isMesh) gizmoMeshes.push(child); });
          if (raycaster.intersectObjects(gizmoMeshes, true).length > 0) return;
        }
        var meshes = [];
        var ids = Object.keys(editorObjects);
        for (var k = 0; k < ids.length; k++) {
          (function(eid) {
            editorObjects[eid].group.traverse(function(child) {
              if (child.isMesh) { child.userData.__editorId = eid; meshes.push(child); }
            });
          })(ids[k]);
        }
        var intersects = raycaster.intersectObjects(meshes, false);
        if (intersects.length > 0) {
          var hitId = intersects[0].object.userData.__editorId;
          if (hitId) { doSelect(hitId); window.parent.postMessage({ type: "OBJECT_SELECTED", id: hitId }, "*"); return; }
        }
        doSelect(null);
        window.parent.postMessage({ type: "OBJECT_SELECTED", id: null }, "*");
      });
    }

    // --- GLTFLoader ---
    var gltfLoader = new GLTFLoaderCtor();

    function doSelect(id) {
      selectedId = id;
      if (tc) {
        if (id && editorObjects[id]) { tc.attach(editorObjects[id].group); tc.setMode(currentTransformMode); }
        else { tc.detach(); selectedId = null; }
      }
    }

    // --- Listen for messages from parent ---
    window.addEventListener("message", function(event) {
      var data = event.data;
      if (!data || !data.type) return;

      switch (data.type) {
        case "ADD_OBJECT": {
          var blob = new Blob([data.buffer], { type: "application/octet-stream" });
          var url = URL.createObjectURL(blob);
          gltfLoader.load(url, function(gltf) {
            var group = gltf.scene;
            group.position.set(0, 0, 0);
            group.traverse(function(node) {
              if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
            });
            scene.add(group);
            editorObjects[data.id] = { group: group, name: data.name, blobUrl: url };
            window.parent.postMessage({ type: "OBJECT_ADDED", id: data.id, name: data.name }, "*");
          }, undefined, function(error) {
            console.error("Booth Editor: Failed to load model:", error);
            URL.revokeObjectURL(url);
            window.parent.postMessage({ type: "OBJECT_ERROR", id: data.id, message: "Failed to load model" }, "*");
          });
          break;
        }

        case "REMOVE_OBJECT": {
          var obj = editorObjects[data.id];
          if (obj) {
            if (selectedId === data.id) { if (tc) tc.detach(); selectedId = null; }
            scene.remove(obj.group);
            obj.group.traverse(function(child) { if (child.isMesh && child.geometry) child.geometry.dispose(); });
            URL.revokeObjectURL(obj.blobUrl);
            delete editorObjects[data.id];
          }
          break;
        }

        case "SELECT_OBJECT":
          doSelect(data.id);
          break;

        case "SET_TRANSFORM_MODE":
          currentTransformMode = data.mode;
          if (tc && tc.object) tc.setMode(data.mode);
          break;

        case "SET_EDITOR_MODE":
          currentEditorMode = data.mode;
          if (data.mode === "preview") {
            if (tc) { tc.detach(); tc.visible = false; }
            selectedId = null;
            window.parent.postMessage({ type: "OBJECT_SELECTED", id: null }, "*");
          } else {
            if (tc) tc.visible = true;
          }
          break;

        case "CAPTURE_SCREENSHOT": {
          if (typeof renderer === "undefined" || typeof camera === "undefined") {
            window.parent.postMessage({ type: "EDITOR_ERROR", message: "Screenshot requires camera and renderer" }, "*");
            break;
          }
          var captureW = data.width || 1920;
          var captureH = data.height || 1080;
          if (tc) tc.visible = false;
          var origW = renderer.domElement.clientWidth || window.innerWidth;
          var origH = renderer.domElement.clientHeight || window.innerHeight;
          var origAspect = camera.aspect;
          renderer.setSize(captureW, captureH);
          camera.aspect = captureW / captureH;
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);
          var dataUrl = renderer.domElement.toDataURL("image/png");
          renderer.setSize(origW, origH);
          camera.aspect = origAspect;
          camera.updateProjectionMatrix();
          if (tc) tc.visible = true;
          renderer.render(scene, camera);
          window.parent.postMessage({ type: "SCREENSHOT_RESULT", dataUrl: dataUrl }, "*");
          break;
        }

        case "EXPORT_GLB": {
          var ver = THREE.REVISION || "128";

          function doGltfExport() {
            try {
              var ExporterCtor = (window.__editorModules && window.__editorModules.GLTFExporter) || THREE.GLTFExporter;
              if (tc) tc.visible = false;
              var exporter = new ExporterCtor();
              exporter.parse(scene, function(result) {
                if (tc) tc.visible = true;
                var json = JSON.stringify(result);
                window.parent.postMessage({ type: "EXPORT_GLTF_RESULT", gltf: json }, "*");
              }, { binary: false, embedImages: true });
            } catch (err) {
              console.error("Booth Editor: GLTF export failed:", err);
              window.parent.postMessage({ type: "EXPORT_GLB_ERROR", message: "GLTF export failed: " + String(err) }, "*");
            }
          }

          var hasExporter = (window.__editorModules && window.__editorModules.GLTFExporter) || THREE.GLTFExporter;
          if (hasExporter) {
            doGltfExport();
          } else {
            window.parent.postMessage({ type: "EXPORT_GLB_LOADING" }, "*");
            var loadExporter;
            if (isESMVersion()) {
              loadExporter = loadESM([{ name: "GLTFExporter", path: "exporters/GLTFExporter.js" }]);
            } else {
              loadExporter = loadScript("https://cdn.jsdelivr.net/npm/three@0." + ver + ".0/examples/js/exporters/GLTFExporter.js");
            }
            loadExporter
              .then(function() {
                var loaded = (window.__editorModules && window.__editorModules.GLTFExporter) || THREE.GLTFExporter;
                if (loaded) {
                  doGltfExport();
                } else {
                  window.parent.postMessage({ type: "EXPORT_GLB_ERROR", message: "GLTFExporter not found after loading script" }, "*");
                }
              })
              .catch(function(err) {
                window.parent.postMessage({ type: "EXPORT_GLB_ERROR", message: "Failed to load GLTFExporter: " + String(err) }, "*");
              });
          }
          break;
        }
      }
    });

    // Notify parent
    window.parent.postMessage({ type: "EDITOR_READY" }, "*");
    console.log("Booth Editor: Initialized (Three.js r" + THREE.REVISION + ")");
  }
})();
`
}
