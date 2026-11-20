/*
 * GeoFS 3.9 GLB Collision Physics 0.6.1 - frame-streamed scenery collision
 * Target: GeoFS 3.9 / CesiumJS 1.96
 *
 * Standalone: does NOT download, evaluate, or call any 0.3.x/0.4.x collision core.
 * Own components: asset capture, glTF/GLB parser, accessor decoder, Draco/Meshopt
 * adapters, node transforms, triangle builder, BVH, sphere/triangle CCD,
 * impulse/friction response, GeoFS rigid-body hook, distance-based collider
 * streaming/eviction, diagnostics and teardown.
 *
 * Visible Cesium models are never removed by streaming; only add-on collision
 * triangles and BVHs are released/rebuilt as the aircraft moves.
 *
 * Codec runtimes are loaded on demand from pinned public distribution URLs:
 * Draco 1.5.7 (Google gstatic) and meshoptimizer 1.3.0 (jsDelivr).
 *
 * Scope: static Cesium.Model and Cesium.ModelExperimental GLB/glTF scene geometry.
 * GeoFS 3.9 buildings/trees use simple3DTileProvider -> geofs.api.Model ->
 * Cesium.ModelExperimental.fromGltf; this path is explicitly tracked here.
 * Generic Cesium3DTileset B3DM/I3DM/PNTS, entities, ModelInstanceCollection,
 * animated/skinned/morphed/instanced content and exact rotational CCD remain unsupported.
 */
(async function GeoFSGLBCollisionPhysics061() {
  "use strict";

  const W = window;
  const C = W.Cesium;
  const G = W.geofs;
  const VERSION = "0.6.1";
  const DRACO_VERSION = "1.5.7";
  const MESHOPT_VERSION = "1.3.0";
  const URL_DRACO = `https://www.gstatic.com/draco/versioned/decoders/${DRACO_VERSION}/`;
  const URL_MESHOPT = `https://cdn.jsdelivr.net/npm/meshoptimizer@${MESHOPT_VERSION}/meshopt_decoder.mjs`;
  const LIMIT = Object.freeze({
    sourceBytes: 256 * 1024 * 1024,
    expandedBytes: 320 * 1024 * 1024,
    buffersBytes: 384 * 1024 * 1024,
    // This limit covers stored vertices + all BVH typed arrays; there is no
    // separate global triangle-count cap.
    geometryBytes: 192 * 1024 * 1024,
    trianglesPerModel: 250000,
    models: 4096,
    urls: 500,
    blobBytes: 64 * 1024 * 1024,
    contactsPerStep: 64,
    candidatesPerPoint: 12000,
    bvhLeaf: 12,
    sweepSegmentLength: 4,
    maxSweepSegments: 48,
    maxCorrection: 2.0,
    maxSolverIterations: 5,
    sweepIterations: 32,
    sweepTolerance: 0.003,
    readyTimeoutMs: 60000,
    transformTimeoutMs: 8000
  });

  if (!G?.api?.viewer || !C || !W.flight || !G.aircraft?.instance) {
    throw new Error("GeoFS 3.9のワールド読み込み後に実行してください。");
  }
  if (W.GeoFSGLBPhysics) {
    if (W.GeoFSGLBPhysics.version === VERSION) {
      console.info("[GeoFS GLB Physics] 0.6.1は既に導入済みです。");
      return;
    }
    throw new Error("別バージョンのGeoFSGLBPhysicsが残っています。GeoFSページを再読み込みしてから0.6.1を実行してください。旧版のAPIやコードは呼び出しません。");
  }

  const state = {
    destroyed: false,
    models: new Set(),
    destroyedModels: new WeakSet(),
    modelURL: new WeakMap(),
    modelKind: new WeakMap(),
    modelKindCounted: new WeakSet(),
    modelTileInfo: new WeakMap(),
    observedGeoWrappers: new WeakSet(),
    modelErrors: new WeakMap(),
    modelAssetInfo: new WeakMap(),
    registered: new WeakMap(),
    pending: new WeakMap(),
    customPoints: new Map(),
    colliders: [],
    deferredModels: new Set(),
    deferredEpoch: new WeakMap(),
    memoryEpoch: 0,
    urls: new Map(),
    captured: new Map(),
    capturedBytes: 0,
    blobs: new Map(),
    blobBytes: 0,
    geometryBytes: 0,
    triangleCount: 0,
    // Distance checks run on every Cesium preUpdate frame. Heavy registrations
    // are serialized and yielded across frames to avoid periodic main-thread stalls.
    streaming: { enabled:true, loadRadius:1000, unloadRadius:1300, registryScanIntervalMs:1200, maxUnloadsPerFrame:2, busy:false, queueSize:0, frameChecks:0, lastRun:0, lastResult:null },
    streamQueue: new Map(),
    frameRemove: null,
    frameFallbackId: null,
    lastRegistryScan: 0,
    fetchOriginal: W.fetch,
    fetchWrapped: null,
    xhrOpenOriginal: null,
    xhrSendOriginal: null,
    xhrOpenWrapped: null,
    xhrSendWrapped: null,
    createObjectURLOriginal: W.URL.createObjectURL,
    createObjectURLWrapped: null,
    revokeObjectURLOriginal: W.URL.revokeObjectURL,
    revokeObjectURLWrapped: null,
    modelFromGltfOriginal: C.Model?.fromGltf,
    modelFromGltfWrapped: null,
    modelExperimentalFromGltfOriginal: C.ModelExperimental?.fromGltf,
    modelExperimentalFromGltfWrapped: null,
    primitiveAddOriginal: C.PrimitiveCollection?.prototype?.add,
    primitiveAddWrapped: null,
    loadModelOriginal: G.api.loadModel,
    loadModelWrapped: null,
    addModelOriginal: G.api.addModelToWorld,
    addModelWrapped: null,
    geoModelDestroyOriginal: G.api.Model?.prototype?.destroy,
    geoModelDestroyWrapped: null,
    tileLoadOriginal: G.simple3DTileProvider?.prototype?.loadTile,
    tileLoadWrapped: null,
    tileUnloadOriginal: G.simple3DTileProvider?.prototype?.unloadTile,
    tileUnloadWrapped: null,
    rb: null,
    aircraft: null,
    timer: null,
    ui: null,
    decoder: { dracoPromise: null, meshoptPromise: null, dracoScriptPromise: null },
    settings: { pointRadius: 0.65, restitution: 0.28, supportRestitution: 0.0, supportNormalZ: 0.60, supportFriction: 0.85, supportDynamicFriction: 0.60, friction: 0.62, dynamicFriction: 0.45, penetrationSlop: 0.006, correctionPercent: 0.84 },
    contactNormals: new Map(),
    lastContact: null,
    counters: {
      requests: 0, captured: 0, modelsSeen: 0, experimentalModelsSeen: 0, geoFSBuildingModelsSeen: 0, geoFSTreeModelsSeen: 0, modelsRegistered: 0, gltf1Migrated: 0,
      geoFSTileLoads:0, geoFSTileUnloads:0, geoFSTileReady:0, geoFSTileLoadFailures:0,
      geoFSTileCollisionAttempts:0, geoFSTileCollisionRegistered:0, geoFSTileCollisionFailures:0,
      rtcAssets:0, rtcGeometryRegistered:0, dracoAssets:0, meshoptAssets:0, featureMetadataAssets:0, requiredExtensionChecks:0, unsupportedExtensionRejections:0,
      registerFailures: 0, capacitySkips: 0, trianglesBuilt: 0, streamedIn:0, streamedOut:0, capacityEvictions:0, physicsSteps: 0,
      streamingFrameChecks:0, streamingQueueAdds:0, streamingSliceYields:0, streamingRegisterFailures:0,
      bvhWorkerBuilds:0, bvhWorkerFailures:0, bvhCooperativeFallbacks:0,
      pointsTested: 0, bvhCandidates: 0, bvhOverflows: 0, sweepHits: 0,
      contacts: 0, impulses: 0, positionCorrections: 0, errors: 0
    },
    lastError: null,
    lastTileAudit: null
  };
  const log = (...a) => console.log(`[GeoFS GLB Physics ${VERSION}]`, ...a);
  const warn = (...a) => console.warn(`[GeoFS GLB Physics ${VERSION}]`, ...a);
  const err = (...a) => { state.counters.errors++; state.lastError = String(a[0]?.message || a[0] || "error"); console.error(`[GeoFS GLB Physics ${VERSION}]`, ...a); };

  // ------------------------- small vector / matrix math -------------------------
  const V = {
    add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],
    sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],
    mul:(a,s)=>[a[0]*s,a[1]*s,a[2]*s],
    dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
    cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    len2:a=>a[0]*a[0]+a[1]*a[1]+a[2]*a[2],
    len:a=>Math.hypot(a[0],a[1],a[2]),
    norm:(a)=>{const n=Math.hypot(a[0],a[1],a[2]); return n>1e-12?[a[0]/n,a[1]/n,a[2]/n]:[0,0,0];}
  };
  const M = {
    identity:()=>[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
    fromCesium:(m)=>{const a=new Array(16);for(let i=0;i<16;i++)a[i]=Number(m[i]);return a;},
    mul:(a,b)=>{const o=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;},
    point:(m,p)=>{const x=p[0],y=p[1],z=p[2],w=m[3]*x+m[7]*y+m[11]*z+m[15];const iw=w&&w!==1?1/w:1;return [(m[0]*x+m[4]*y+m[8]*z+m[12])*iw,(m[1]*x+m[5]*y+m[9]*z+m[13])*iw,(m[2]*x+m[6]*y+m[10]*z+m[14])*iw];},
    vec:(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2],m[1]*p[0]+m[5]*p[1]+m[9]*p[2],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]],
    trs:(t,q,s)=>{
      const qn=Math.hypot(q[0],q[1],q[2],q[3]);
      if(!Number.isFinite(qn)||qn<1e-12)throw Error("glTF node quaternion is invalid");
      const x=q[0]/qn,y=q[1]/qn,z=q[2]/qn,w=q[3]/qn;
      const x2=x+x,y2=y+y,z2=z+z,xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
      return [(1-(yy+zz))*s[0],(xy+wz)*s[0],(xz-wy)*s[0],0,
        (xy-wz)*s[1],(1-(xx+zz))*s[1],(yz+wx)*s[1],0,
        (xz+wy)*s[2],(yz-wx)*s[2],(1-(xx+yy))*s[2],0,
        t[0],t[1],t[2],1];
    },
    node:(n)=>{
      if(n.matrix){if(!Array.isArray(n.matrix)||n.matrix.length!==16||!n.matrix.every(Number.isFinite))throw Error("node.matrix不正");return n.matrix.slice();}
      return M.trs(n.translation||[0,0,0],n.rotation||[0,0,0,1],n.scale||[1,1,1]);
    },
    matEqualLinear:(a,b,eps=1e-8)=>{for(const i of [0,1,2,4,5,6,8,9,10])if(Math.abs(a[i]-b[i])>eps)return false;return true;}
  };
  function matrixTranslation(m) { return [m[12],m[13],m[14]]; }
  function rtcCenterFromDocument(doc){
    const ext=doc?.json?.extensions?.CESIUM_RTC;
    if(!ext)return null;
    const c=ext.center;
    if(!Array.isArray(c)||c.length!==3||!c.every(Number.isFinite))throw Error("CESIUM_RTC.center must be a finite VEC3");
    return c.slice();
  }
  function applyRtcToMatrix(matrix,center){
    if(!center)return matrix.slice();
    const t=M.identity();t[12]=center[0];t[13]=center[1];t[14]=center[2];
    // CESIUM_RTC is a glTF-space translation. Cesium ModelExperimental folds
    // it into ModelSceneGraph.components.transform before axis correction and
    // scale; manual addCollider/testAsset calls need the same matrix order.
    return M.mul(matrix,t);
  }
  // Required-extension policy: only extensions that can affect positions or
  // indices must be decoded here. CESIUM_RTC changes the root transform and is
  // handled by ModelExperimental.sceneGraph.computedModelMatrix. Feature and
  // structural-metadata extensions add IDs/properties, not collision geometry.
  const REQUIRED_GEOMETRY_EXTENSIONS = new Set([
    "KHR_draco_mesh_compression", "KHR_meshopt_compression",
    "EXT_meshopt_compression", "KHR_mesh_quantization"
  ]);
  const SAFE_REQUIRED_EXTENSIONS = new Set([
    "CESIUM_RTC", "EXT_mesh_features", "EXT_structural_metadata", "EXT_feature_metadata",
    "CESIUM_primitive_outline", "KHR_materials_unlit", "KHR_texture_transform",
    "KHR_materials_variants", "KHR_materials_pbrSpecularGlossiness", "KHR_materials_clearcoat",
    "KHR_materials_emissive_strength", "KHR_materials_ior", "KHR_materials_specular",
    "KHR_materials_transmission", "KHR_materials_volume", "KHR_materials_iridescence",
    "KHR_materials_sheen", "KHR_materials_anisotropy", "KHR_texture_basisu",
    "EXT_texture_webp", "EXT_texture_avif", "KHR_lights_punctual"
  ]);
  function validateRequiredExtensions(json){
    const required=Array.isArray(json?.extensionsRequired)?json.extensionsRequired:[];
    const unknown=required.filter(x=>!REQUIRED_GEOMETRY_EXTENSIONS.has(x)&&!SAFE_REQUIRED_EXTENSIONS.has(x));
    state.counters.requiredExtensionChecks++;
    if(unknown.length){state.counters.unsupportedExtensionRejections++;throw Error("Unsupported required glTF extensions (could affect collision geometry): "+unknown.join(", "));}
    return {required:required.slice(),geometry:required.filter(x=>REQUIRED_GEOMETRY_EXTENSIONS.has(x)),safe:required.filter(x=>SAFE_REQUIRED_EXTENSIONS.has(x))};
  }
  function recordModelAssetInfo(model,url,json,format="glTF 2.0"){
    const used=Array.isArray(json?.extensionsUsed)?json.extensionsUsed.slice():[];
    const required=Array.isArray(json?.extensionsRequired)?json.extensionsRequired.slice():[];
    const rtcCenter=rtcCenterFromDocument({json});
    const info={url,format,extensionsUsed:used,extensionsRequired:required,rtcCenter,draco:used.includes("KHR_draco_mesh_compression")||required.includes("KHR_draco_mesh_compression"),meshopt:used.includes("KHR_meshopt_compression")||used.includes("EXT_meshopt_compression")||required.includes("KHR_meshopt_compression")||required.includes("EXT_meshopt_compression"),featureMetadata:used.some(x=>x==="EXT_mesh_features"||x==="EXT_structural_metadata"||x==="EXT_feature_metadata")};
    if(model)state.modelAssetInfo.set(model,info);
    if(info.draco)state.counters.dracoAssets++;
    if(info.meshopt)state.counters.meshoptAssets++;
    if(info.featureMetadata)state.counters.featureMetadataAssets++;
    if(rtcCenter)state.counters.rtcAssets++;
    return info;
  }

  // ------------------------- bounded IO / capture -------------------------
  function absURL(v, base=W.location.href) {
    try {
      if (v instanceof URL) return v.href;
      if (typeof v === "string" && v) return new URL(v, base).href;
      if (v && typeof v.getUrlComponent === "function") return new URL(v.getUrlComponent(true), base).href;
      if (v && typeof v.url === "string") return new URL(v.url, base).href;
    } catch (_) {}
    return null;
  }
  function maybeAsset(url, mime="") {
    // Do not capture every application/json response: only glTF URL suffixes
    // or the dedicated glTF MIME types are eligible for bounded capture.
    const u=String(url||"");
    const m=String(mime||"").split(";")[0].trim().toLowerCase();
    return /\.(?:glb|gltf)(?:\.(?:gz|gzip))?(?:[?#]|$)/i.test(u)
      || /\.bin(?:\.(?:gz|gzip))?(?:[?#]|$)/i.test(u)
      || m==="model/gltf+json" || m==="model/gltf-binary" || m==="application/gltf+json";
  }
  function rememberURL(url, via, mime) {
    if (!url) return;
    if(!state.urls.has(url))state.counters.requests++;
    const row=state.urls.get(url)||{url,via:[],firstSeen:Date.now(),lastSeen:Date.now(),mime:null};
    if(via&&!row.via.includes(via))row.via.push(via);
    row.lastSeen=Date.now();if(mime)row.mime=mime;
    state.urls.delete(url);state.urls.set(url,row);
    while(state.urls.size>LIMIT.urls)state.urls.delete(state.urls.keys().next().value);
  }
  function boundedCapture(url,promise,label) {
    let p;
    p=Promise.resolve(promise).then(v=>{
      let bytes;
      if(v instanceof Uint8Array)bytes=v;
      else if(v instanceof ArrayBuffer)bytes=new Uint8Array(v);
      else if(ArrayBuffer.isView(v))bytes=new Uint8Array(v.buffer,v.byteOffset,v.byteLength);
      else throw Error("capture data is not binary");
      if(bytes.byteLength>LIMIT.blobBytes)throw Error("capture limit exceeded");
      const copy=bytes.slice();
      const old=state.captured.get(url);
      if(old?.bytes)state.capturedBytes-=old.bytes.byteLength;
      state.captured.set(url,{promise:Promise.resolve(copy),bytes:copy,label});
      state.capturedBytes+=copy.byteLength;state.counters.captured++;
      while(state.captured.size>16||state.capturedBytes>LIMIT.blobBytes){const k=state.captured.keys().next().value;if(k===url&&state.captured.size===1)break;const x=state.captured.get(k);if(x?.bytes)state.capturedBytes-=x.bytes.byteLength;state.captured.delete(k);}
      return copy;
    }).catch(e=>{if(state.captured.get(url)?.promise===p)state.captured.delete(url);throw e;});
    state.captured.set(url,{promise:p,bytes:null,label});
    p.catch(()=>{});return p;
  }
  async function readLimited(response,max,label) {
    const cl=Number(response.headers?.get?.("content-length"));
    if(Number.isFinite(cl)&&cl>max){try{await response.body?.cancel?.();}catch(_){}throw Error(`${label} Content-Length exceeds ${max}`);}
    if(response.body?.getReader){const r=response.body.getReader(),chunks=[];let total=0;try{for(;;){const x=await r.read();if(x.done)break;total+=x.value.byteLength;if(total>max){await r.cancel().catch(()=>{});throw Error(`${label} decompressed/received size exceeds ${max}`);}chunks.push(x.value);}}finally{try{r.releaseLock();}catch(_){}}const out=new Uint8Array(total);let o=0;for(const a of chunks){out.set(a,o);o+=a.byteLength;}return out;}
    const a=new Uint8Array(await response.arrayBuffer());if(a.byteLength>max)throw Error(`${label} size exceeds ${max}`);return a;
  }
  async function fetchBytes(url,max=LIMIT.sourceBytes) {
    const cached=state.captured.get(url);if(cached){try{return (await cached.promise).slice();}catch(_){}}
    const res=await state.fetchOriginal(url,{mode:"cors",credentials:"same-origin",cache:"no-store"});
    if(!res.ok)throw Error(`HTTP ${res.status}: ${url}`);
    if(res.status===206||res.headers?.get("content-range"))throw Error("206 Partial Contentは完全なアセットではありません: "+url);
    return readLimited(res,max,"asset");
  }
  function dataURI(uri) {
    const m=/^data:([^,]*?),(.*)$/s.exec(uri);if(!m)throw Error("Invalid data URI");
    if(/;base64/i.test(m[1])){const s=atob(m[2]);const b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i);return b;}
    return new TextEncoder().encode(decodeURIComponent(m[2]));
  }
  async function gunzip(bytes) {
    if(typeof W.DecompressionStream!=="function")throw Error("DecompressionStreamが使えません。gzipローダーを利用できません。");
    const stream=new Blob([bytes]).stream().pipeThrough(new W.DecompressionStream("gzip"));
    return readLimited(new Response(stream),LIMIT.expandedBytes,"gzip output");
  }
  function isGzip(b){return b?.length>2&&b[0]===0x1f&&b[1]===0x8b;}
  function isGLB(b){return b?.length>=4&&b[0]===0x67&&b[1]===0x6c&&b[2]===0x54&&b[3]===0x46;}

  // ------------------------- meshopt / Draco decoder adapters -------------------------
  async function getMeshopt() {
    if(!state.decoder.meshoptPromise)state.decoder.meshoptPromise=(async()=>{
      const m=await import(URL_MESHOPT);const d=m.MeshoptDecoder||m.default?.MeshoptDecoder||m.default;
      if(!d||typeof d.decodeGltfBuffer!=="function")throw Error("MeshoptDecoder APIが見つかりません");
      await d.ready;return d;
    })();
    return state.decoder.meshoptPromise;
  }
  function loadScript(src) {
    if(typeof W.DracoDecoderModule==="function")return Promise.resolve();
    if(!state.decoder.dracoScriptPromise)state.decoder.dracoScriptPromise=new Promise((resolve,reject)=>{
      const existing=[...W.document.scripts].find(s=>s.src===src);
      if(existing){reject(Error("Draco wrapper script tag already exists but DracoDecoderModule is not available; reload GeoFS and run the add-on before another decoder loader"));return;}
      const script=W.document.createElement("script");script.src=src;script.async=true;
      const cleanup=()=>{script.removeEventListener("load",ok);script.removeEventListener("error",fail);};
      const ok=()=>{cleanup();typeof W.DracoDecoderModule==="function"?resolve():reject(Error("Draco wrapper loaded but DracoDecoderModule global is missing"));};
      const fail=()=>{cleanup();reject(Error("Draco wrapper script load failed: "+src));};
      script.addEventListener("load",ok,{once:true});script.addEventListener("error",fail,{once:true});
      W.document.head.appendChild(script);
    });
    return state.decoder.dracoScriptPromise;
  }
  async function getDraco() {
    if(!state.decoder.dracoPromise)state.decoder.dracoPromise=(async()=>{
      await loadScript(URL_DRACO+"draco_wasm_wrapper.js");
      if(typeof W.DracoDecoderModule!=="function")throw Error("DracoDecoderModule globalがありません");
      const mod=await W.DracoDecoderModule({locateFile:(p)=>new URL(p,URL_DRACO).href});
      if(!mod?.Decoder||!mod?.DecoderBuffer)throw Error("Draco decoder runtime APIが不正です");
      return mod;
    })().catch(e=>{state.decoder.dracoPromise=null;state.decoder.dracoScriptPromise=null;throw e;});
    return state.decoder.dracoPromise;
  }
  async function decodeDraco(bytes, extension, primitive) {
    const mod=await getDraco();const decoder=new mod.Decoder(),buffer=new mod.DecoderBuffer();
    const signed=new Int8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    buffer.Init(signed,bytes.byteLength);
    let mesh=null;
    try {
      const typ=decoder.GetEncodedGeometryType(buffer);
      if(typ!==mod.TRIANGULAR_MESH)throw Error("Draco point cloudは衝突用triangle meshではありません");
      mesh=new mod.Mesh();const status=decoder.DecodeBufferToMesh(buffer,mesh);
      if(!status?.ok?.())throw Error("Draco decode failed: "+(status?.error_msg?.()||"unknown"));
      const uid=extension.attributes?.POSITION;
      if(!Number.isInteger(uid))throw Error("Draco POSITION attribute idがありません");
      const attr=decoder.GetAttributeByUniqueId(mesh,uid);
      if(!attr)throw Error("Draco POSITION attributeが見つかりません (id="+uid+")");
      if(typeof attr.num_components==="function"&&attr.num_components()!==3)throw Error("Draco POSITION must have 3 components");
      const count=mesh.num_points();if(!Number.isInteger(count)||count<3||count>LIMIT.trianglesPerModel*3)throw Error("Draco point count invalid or exceeds model limit");
      const tmp=new mod.DracoFloat32Array();
      let positions;
      try { decoder.GetAttributeFloatForAllPoints(mesh,attr,tmp);positions=new Float32Array(count*3);for(let i=0;i<positions.length;i++){const x=tmp.GetValue(i);if(!Number.isFinite(x))throw Error("Draco POSITION contains non-finite values");positions[i]=x;} }
      finally { mod.destroy(tmp); }
      const faceCount=mesh.num_faces();
      if(!Number.isInteger(faceCount)||faceCount<1||faceCount>LIMIT.trianglesPerModel)throw Error("Draco face count is invalid or exceeds triangle limit");
      const face=new mod.DracoInt32Array();let indices;
      try {
        indices=new Uint32Array(faceCount*3);
        for(let i=0;i<faceCount;i++){
          decoder.GetFaceFromMesh(mesh,i,face);
          for(let c=0;c<3;c++){const vi=face.GetValue(c);if(!Number.isInteger(vi)||vi<0||vi>=count)throw Error("Draco face index is out of range");indices[i*3+c]=vi;}
        }
      } finally { mod.destroy(face); }
      return {positions,indices,pointCount:count,faceCount};
    } finally { if(mesh)mod.destroy(mesh);mod.destroy(buffer);mod.destroy(decoder); }
  }

  // ------------------------- glTF / GLB parsing and accessor decoding -------------------------
  function parseGLB1Header(bytes) {
    if(!isGLB(bytes))throw Error("GLB magic(glTF) mismatch");
    if(bytes.byteLength<20)throw Error("GLB 1.0 header truncated");
    const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const version=dv.getUint32(4,true),total=dv.getUint32(8,true);
    if(version!==1)throw Error("GLB 1.0 header expected; got "+version);
    if(total!==bytes.byteLength)throw Error(`GLB 1.0 total length mismatch header=${total} actual=${bytes.byteLength}`);
    const contentLength=dv.getUint32(12,true),contentFormat=dv.getUint32(16,true);
    if(contentFormat!==0)throw Error("GLB 1.0 contentFormat must be JSON (0)");
    if(contentLength<1||20+contentLength>total)throw Error("GLB 1.0 JSON content range is invalid");
    const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes.subarray(20,20+contentLength)).replace(/[ \t\r\n\0]+$/g,"");
    const json=JSON.parse(text);
    const versionString=json.asset?.version||json.version||"1.0";
    if(String(versionString).split(".")[0]!=="1")throw Error("GLB container is version 1 but JSON asset is not glTF 1.x");
    return {json,body:bytes.subarray(20+contentLength),contentLength,contentFormat,totalLength:total};
  }
  function parseGLB(bytes) {
    if(!isGLB(bytes))throw Error("GLB magic(glTF) mismatch");
    if(bytes.byteLength<20)throw Error("GLB truncated");
    const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const version=dv.getUint32(4,true),total=dv.getUint32(8,true);
    if(version!==2)throw Error("GLB 2.0 parser expected; got "+version+" (legacy GLB 1.0 uses the Cesium-migrated geometry path)");
    if(total!==bytes.byteLength)throw Error(`GLB length mismatch header=${total} actual=${bytes.byteLength}`);
    let off=12,json=null,bin=null,chunkNo=0;
    while(off<total){
      if(off+8>total)throw Error("GLB chunk header truncated");
      const len=dv.getUint32(off,true),type=dv.getUint32(off+4,true);off+=8;
      if((len&3)!==0||off+len>total)throw Error("GLB chunk length/alignment invalid");
      if(chunkNo===0&&type!==0x4e4f534a)throw Error("First GLB chunk must be JSON");
      if(type===0x4e4f534a){
        if(json)throw Error("Multiple JSON chunks");
        let text=new TextDecoder("utf-8",{fatal:true}).decode(bytes.subarray(off,off+len));
        text=text.replace(/ +$/g,"");
        json=JSON.parse(text);
      } else if(type===0x004e4942){
        if(bin)throw Error("Multiple BIN chunks");
        if(chunkNo!==1)throw Error("GLB BIN chunk must immediately follow JSON");
        bin=bytes.subarray(off,off+len);
      }
      off+=len;chunkNo++;
    }
    if(!json||json.asset?.version!=="2.0")throw Error("glTF asset.version 2.0 JSON missing");
    return {json,bin};
  }
  function toUint8Source(source,label) {
    if(source instanceof Uint8Array)return new Uint8Array(source.buffer,source.byteOffset,source.byteLength);
    if(source instanceof ArrayBuffer)return new Uint8Array(source);
    if(ArrayBuffer.isView(source))return new Uint8Array(source.buffer,source.byteOffset,source.byteLength);
    throw Error(`${label} is not an ArrayBuffer/TypedArray`);
  }
  function documentFromCesiumModel(model,url,detectedFormat,recordMigration=true) {
    // CesiumJS 1.96's Legacy Model loader has a real glTF 1.0 migration
    // pipeline: binary header v1 / legacy ID maps / KHR_binary_glTF are
    // converted into glTF 2.0 arrays before readyPromise resolves. Reuse that
    // already-loaded representation instead of attempting a lossy hand-parser.
    const candidates=[];
    try{if(model?.gltfInternal)candidates.push(model.gltfInternal);}catch(_){}
    try{if(model?._cachedGltf?.gltf)candidates.push(model._cachedGltf.gltf);}catch(_){}
    try{if(model?.gltf)candidates.push(model.gltf);}catch(_){}
    const json=candidates.find(x=>x&&x.asset?.version==="2.0"&&Array.isArray(x.buffers)&&Array.isArray(x.bufferViews)&&Array.isArray(x.accessors)&&Array.isArray(x.meshes));
    if(!json)throw Error(`${detectedFormat}: Cesiumが読み込み済みのglTF 1.0→2.0変換データを取得できません。対象ModelのreadyPromise後にgltfInternalが保持されている必要があります`);
    // CESIUM_RTC is represented by the root transform in Cesium's loaded model.
    // It is validated against the actual model transform in registerModel().
    if((json.skins||[]).length||(json.animations||[]).length)throw Error("Skin/animation付きglTF 1.0モデルは静的コライダーにできません。静的化したモデルを使用してください");
    const buffers=[];let total=0;
    for(let i=0;i<json.buffers.length;i++){
      const def=json.buffers[i],source=def?.extras?._pipeline?.source;
      if(!def||!Number.isSafeInteger(def.byteLength)||def.byteLength<0)throw Error(`Cesium migrated buffer[${i}] byteLength invalid`);
      if(source===undefined)throw Error(`Cesium migrated buffer[${i}] has no retained binary source; Cesium may have released the glTF JSON`);
      const b=toUint8Source(source,`Cesium migrated buffer[${i}]`);
      if(def.byteLength>b.byteLength)throw Error(`Cesium migrated buffer[${i}] is shorter than byteLength`);
      total+=b.byteLength;if(total>LIMIT.buffersBytes)throw Error("Cesium migrated buffers exceed memory safety limit");
      buffers.push(b);
    }
    if(!buffers.length)throw Error("Cesium migrated glTF contains no retained geometry buffer");
    recordModelAssetInfo(model,url,json,`${detectedFormat} (Cesium migration)`);
    if(recordMigration){
      state.counters.gltf1Migrated++;
      log("glTF 1.0 asset detected; using Cesium 1.96 migrated glTF 2.0 geometry",{url,format:detectedFormat,buffers:buffers.length,bytes:total,sourceVersion:model?._sourceVersion||json.extras?.sourceVersion||json.asset?.version});
    }
    return {json,buffers,baseURL:url,sourceBytes:0,sourceFormat:`${detectedFormat} (Cesium 1.0→2.0 migration)`};
  }
  function loadedModelForURL(url) {
    for(const model of state.models){
      const candidate=state.modelURL.get(model)||absURL(model?._resource?.url)||absURL(model?._url);
      if(candidate===url)return model;
    }
    return null;
  }
  async function loadDocument(url,modelHint=null) {
    let bytes;
    if(url.startsWith("blob:")){
      // Prefer captured bytes (works even after revokeObjectURL), but if the
      // blob is larger than the capture cache, fetch it while the URL is alive.
      const c=state.captured.get(url);
      if(c){try{bytes=(await c.promise).slice();}catch(_){}}
      if(!bytes){
        const r=await state.fetchOriginal(url);
        if(!r.ok)throw Error(`Blob URL fetch failed: HTTP ${r.status}`);
        bytes=await readLimited(r,LIMIT.sourceBytes,"blob asset");
      }
    } else bytes=await fetchBytes(url);
    if(isGzip(bytes))bytes=await gunzip(bytes);
    let json,bin=null,base=url;
    if(isGLB(bytes)){
      if(bytes.byteLength>=8&&new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(4,true)===1){
        parseGLB1Header(bytes); // validate the actual legacy container, not only its magic.
        return documentFromCesiumModel(modelHint||loadedModelForURL(url),url,"GLB 1.0");
      }
      ({json,bin}=parseGLB(bytes));
    } else {
      json=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes).replace(/^\uFEFF/,""));
      const sourceVersion=String(json.asset?.version||json.version||"");
      const loadedModel=modelHint||loadedModelForURL(url);
      // Cesium 1.96's v1 migration defaults a missing legacy asset.version to
      // 1.0. Only use that compatibility path when a loaded Model is available.
      if(sourceVersion.startsWith("1.")||(!sourceVersion&&loadedModel))return documentFromCesiumModel(loadedModel,url,`glTF JSON ${sourceVersion||"1.0 (implicit legacy version)"}`);
      if(json.asset?.version!=="2.0")throw Error(`glTF JSON version unsupported: asset.version=${json.asset?.version??"(missing)"}; expected 2.0 or a loaded Cesium-migrated 1.0 asset`);
    }
    const loadedModel=modelHint||loadedModelForURL(url);
    const assetInfo=recordModelAssetInfo(loadedModel,url,json,"glTF 2.0");
    let extPolicy;
    try{extPolicy=validateRequiredExtensions(json);assetInfo.requiredExtensionPolicy=extPolicy;}
    catch(e){assetInfo.requiredExtensionError=e.message;throw e;}
    const rtcCenter=assetInfo.rtcCenter;
    if((json.skins||[]).length||(json.animations||[]).length)throw Error("Skin/animationは静的collision meshとして扱えません。静的化したGLBを使用してください");
    if((json.meshes||[]).some(m=>(m.primitives||[]).some(p=>(p.targets||[]).length)))throw Error("Morph target付きmeshは現在未対応です");
    if((json.nodes||[]).some(n=>n.extensions?.EXT_mesh_gpu_instancing))throw Error("EXT_mesh_gpu_instancingは現在未対応です");
    const bufs=[];let sum=0;
    for(let i=0;i<(json.buffers||[]).length;i++){
      const def=json.buffers[i];let b;
      if(!def||!Number.isSafeInteger(def.byteLength)||def.byteLength<1)throw Error(`buffer[${i}] byteLength must be a positive safe integer`);
      if(def.uri){
        if(/^data:/i.test(def.uri)) b=dataURI(def.uri);
        else {
          let u;
          try { u=new URL(def.uri,base).href; } catch (_) { throw Error(`buffer[${i}]の相対URIを解決できません: ${def.uri}`); }
          b=await fetchBytes(u,LIMIT.sourceBytes);
          if(isGzip(b)) b=await gunzip(b);
        }
      }
      else if(i===0&&bin)b=bin;
      else throw Error(`buffer[${i}]にuriがなくGLB BINもありません`);
      if(def.byteLength>b.byteLength)throw Error(`buffer[${i}] byteLength exceeds actual data`);
      if(!def.uri&&bin&&i===0&&b.byteLength>def.byteLength+3)throw Error("GLB BIN chunk padding exceeds the permitted 3 bytes");
      sum+=b.byteLength;if(sum>LIMIT.buffersBytes)throw Error("Total glTF buffers exceed memory safety limit");
      bufs.push(b);
    }
    if(!bufs.length&&json.meshes?.length)throw Error("glTF buffers are missing");
    return {json,buffers:bufs,baseURL:base,sourceBytes:bytes.byteLength};
  }
  const COMP={5120:{bytes:1,get:"getInt8",norm:v=>Math.max(v/127,-1)},5121:{bytes:1,get:"getUint8",norm:v=>v/255},5122:{bytes:2,get:"getInt16",norm:v=>Math.max(v/32767,-1)},5123:{bytes:2,get:"getUint16",norm:v=>v/65535},5125:{bytes:4,get:"getUint32",norm:v=>v/4294967295},5126:{bytes:4,get:"getFloat32",norm:v=>v}};
  const TYPE={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
  async function viewResolver(doc) {
    const {json,buffers}=doc;
    const out=new Array((json.bufferViews||[]).length);
    const required=new Set(json.extensionsRequired||[]);let decodedBytes=0;
    for(let i=0;i<out.length;i++){
      const bv=json.bufferViews[i];
      if(!bv||!Number.isSafeInteger(bv.byteLength)||bv.byteLength<0)throw Error(`bufferView[${i}] byteLength invalid`);
      const khr=bv.extensions?.KHR_meshopt_compression;
      const ext=khr||bv.extensions?.EXT_meshopt_compression;
      if(!ext){
        if(!Number.isInteger(bv.buffer)||bv.buffer<0||bv.buffer>=buffers.length)throw Error(`bufferView[${i}] references missing buffer`);
        const src=buffers[bv.buffer],start=bv.byteOffset??0,end=start+bv.byteLength;
        if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(end)||end>src.byteLength)throw Error(`bufferView[${i}] out of range`);
        if(bv.byteStride!==undefined&&(!Number.isInteger(bv.byteStride)||bv.byteStride<4||bv.byteStride>252||bv.byteStride%4!==0))throw Error(`bufferView[${i}] byteStride invalid`);
        out[i]=src.subarray(start,end);continue;
      }
      const stride=ext.byteStride,count=ext.count,mode=ext.mode,filter=ext.filter||"NONE";
      const extName=khr?"KHR_meshopt_compression":"EXT_meshopt_compression";
      const isSafeInt=x=>Number.isSafeInteger(x)&&x>=0;
      if(!Number.isInteger(ext.buffer)||ext.buffer<0||ext.buffer>=buffers.length||!isSafeInt(ext.byteLength)||!isSafeInt(stride)||stride===0||!isSafeInt(count)||count===0||!new Set(["ATTRIBUTES","TRIANGLES","INDICES"]).has(mode))throw Error(`Meshopt ${extName} bufferView[${i}] extension fields invalid`);
      if(!Number.isSafeInteger(stride*count)||bv.byteLength!==stride*count)throw Error(`Meshopt bufferView[${i}] parent byteLength mismatch`);
      if(bv.byteStride!==undefined&&bv.byteStride!==stride)throw Error(`Meshopt bufferView[${i}] byteStride mismatch`);
      if(mode==="ATTRIBUTES"&&(stride%4!==0||stride<4||stride>256))throw Error(`Meshopt ATTRIBUTES stride invalid at view ${i}`);
      if((mode==="TRIANGLES"||mode==="INDICES")&&(![2,4].includes(stride)||filter!=="NONE"))throw Error(`Meshopt index mode stride/filter invalid at view ${i}`);
      if(mode==="TRIANGLES"&&count%3!==0)throw Error(`Meshopt TRIANGLES count must be multiple of 3 at view ${i}`);
      if(filter==="OCTAHEDRAL"&&![4,8].includes(stride))throw Error("Meshopt OCTAHEDRAL stride must be 4 or 8");
      if(filter==="QUATERNION"&&stride!==8)throw Error("Meshopt QUATERNION stride must be 8");
      if(filter==="EXPONENTIAL"&&stride%4!==0)throw Error("Meshopt EXPONENTIAL stride must be divisible by 4");
      if(filter==="COLOR"&&![4,8].includes(stride))throw Error("Meshopt COLOR stride must be 4 or 8");
      if(!new Set(["NONE","OCTAHEDRAL","QUATERNION","EXPONENTIAL","COLOR"]).has(filter))throw Error("Unsupported Meshopt filter: "+filter);
      if(extName==="EXT_meshopt_compression"&&filter==="COLOR")throw Error("COLOR filter is not valid for EXT_meshopt_compression");
      const src=buffers[ext.buffer],start=ext.byteOffset??0,end=start+ext.byteLength;
      if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(end)||end>src.byteLength)throw Error(`Meshopt compressed range outside buffer at view ${i}`);
      decodedBytes+=bv.byteLength;
      if(!Number.isSafeInteger(decodedBytes)||decodedBytes>LIMIT.buffersBytes)throw Error("Total Meshopt decoded bufferViews exceed memory safety limit");
      try {
        const dec=await getMeshopt(),target=new Uint8Array(bv.byteLength);
        dec.decodeGltfBuffer(target,count,stride,src.subarray(start,end),mode,filter);
        out[i]=target;
      } catch(e) {
        // Optional Meshopt extension may carry the ordinary fallback bufferView.
        const fallbackBuffer=bv.buffer, fallbackOffset=bv.byteOffset??0;
        const fallback=buffers[fallbackBuffer];
        if(!required.has(extName)&&Number.isInteger(fallbackBuffer)&&fallback&&fallbackOffset>=0&&fallbackOffset+bv.byteLength<=fallback.byteLength){
          warn(`Meshopt bufferView[${i}] decode failed; using uncompressed fallback`,e);
          out[i]=fallback.subarray(fallbackOffset,fallbackOffset+bv.byteLength);
        } else throw Error(`Meshopt bufferView[${i}] decode failed and no valid optional fallback exists: ${e.message}`);
      }
    }
    return out;
  }
  function readAccessor(doc,views,index) {
    const a=doc.json.accessors?.[index];
    if(!a)throw Error("Accessor index missing: "+index);
    const comp=COMP[a.componentType],components=TYPE[a.type];
    if(!comp||!components||!Number.isSafeInteger(a.count)||a.count<1)throw Error(`Accessor[${index}] unsupported type/count`);
    if(a.normalized&&[5125,5126].includes(a.componentType))throw Error(`Accessor[${index}] invalid normalized componentType`);
    if((a.type==="MAT2"||a.type==="MAT3"||a.type==="MAT4")&&comp.bytes<4)throw Error(`Accessor[${index}] packed matrix element padding is not implemented`);
    const total=a.count*components;
    if(!Number.isSafeInteger(total)||total>LIMIT.trianglesPerModel*9)throw Error(`Accessor[${index}] element allocation exceeds limit`);
    const out=new Float64Array(total);
    if(a.bufferView!==undefined){
      const bvIndex=a.bufferView,bytes=views[bvIndex],bv=doc.json.bufferViews[bvIndex];
      if(!bytes||!bv)throw Error(`Accessor[${index}] bufferView missing`);
      const off=a.byteOffset??0,viewStart=bv.byteOffset??0,element=comp.bytes*components,stride=bv.byteStride??element;
      if(!Number.isSafeInteger(viewStart)||viewStart<0||viewStart%comp.bytes!==0||!Number.isSafeInteger(off)||off<0||stride<element||stride%comp.bytes!==0||off%comp.bytes!==0)throw Error(`Accessor[${index}] stride/offset alignment invalid`);
      if(bv.byteStride!==undefined&&stride%4!==0)throw Error(`Accessor[${index}] byteStride must be multiple of 4`);
      const last=off+(a.count-1)*stride+element;
      if(!Number.isSafeInteger(last)||last>bytes.byteLength)throw Error(`Accessor[${index}] exceeds bufferView`);
      const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      for(let i=0;i<a.count;i++)for(let c=0;c<components;c++){
        const v=dv[comp.get](off+i*stride+c*comp.bytes,true);
        const decoded=a.normalized?comp.norm(v):v;
        if(!Number.isFinite(decoded))throw Error(`Accessor[${index}] contains non-finite value`);
        out[i*components+c]=decoded;
      }
    } else if(a.byteOffset!==undefined) throw Error(`Accessor[${index}] byteOffset is invalid without bufferView`);
    if(a.sparse){
      const sp=a.sparse;
      if(!Number.isInteger(sp.count)||sp.count<1||sp.count>a.count)throw Error(`Accessor[${index}] sparse count invalid`);
      const ixComp=COMP[sp.indices?.componentType];
      if(!ixComp||![5121,5123,5125].includes(sp.indices.componentType))throw Error("Sparse index componentType must be unsigned integer");
      const ib=views[sp.indices.bufferView],vb=views[sp.values.bufferView];
      const ibDef=doc.json.bufferViews[sp.indices.bufferView],vbDef=doc.json.bufferViews[sp.values.bufferView];
      if(!ib||!vb||!ibDef||!vbDef)throw Error("Sparse bufferView missing");
      if(ibDef.byteStride!==undefined||vbDef.byteStride!==undefined)throw Error("Sparse bufferViews must not define byteStride");
      const io=sp.indices.byteOffset??0,vo=sp.values.byteOffset??0,ibStart=ibDef.byteOffset??0,vbStart=vbDef.byteOffset??0;
      if(!Number.isSafeInteger(ibStart)||ibStart<0||ibStart%ixComp.bytes!==0||!Number.isSafeInteger(vbStart)||vbStart<0||vbStart%comp.bytes!==0||!Number.isSafeInteger(io)||io<0||!Number.isSafeInteger(vo)||vo<0||io%ixComp.bytes!==0||vo%comp.bytes!==0)throw Error("Sparse data alignment invalid");
      const iEnd=io+sp.count*ixComp.bytes,vEnd=vo+sp.count*components*comp.bytes;
      if(!Number.isSafeInteger(iEnd)||!Number.isSafeInteger(vEnd)||iEnd>ib.byteLength||vEnd>vb.byteLength)throw Error("Sparse data out of bounds");
      const idv=new DataView(ib.buffer,ib.byteOffset,ib.byteLength),vdv=new DataView(vb.buffer,vb.byteOffset,vb.byteLength);
      let previous=-1;
      for(let i=0;i<sp.count;i++){
        const dst=idv[ixComp.get](io+i*ixComp.bytes,true);
        if(dst>=a.count||dst<=previous)throw Error("Sparse indices must be unique, increasing and in range");
        previous=dst;
        for(let c=0;c<components;c++){
          const v=vdv[comp.get](vo+(i*components+c)*comp.bytes,true);
          const decoded=a.normalized?comp.norm(v):v;
          if(!Number.isFinite(decoded))throw Error(`Accessor[${index}] sparse value is non-finite`);
          out[dst*components+c]=decoded;
        }
      }
    }
    return {data:out,count:a.count,components,componentType:a.componentType,normalized:!!a.normalized,type:a.type};
  }

  function triIndices(indices,mode) {
    const out=[];
    if(mode===4){if(indices.length%3!==0)throw Error("TRIANGLES index count must divide by 3");return indices;}
    else if(mode===5){for(let i=2;i<indices.length;i++){let a=indices[i-2],b=indices[i-1],c=indices[i];if((i&1)!==0){const t=a;a=b;b=t;}if(a!==b&&b!==c&&c!==a)out.push(a,b,c);}}
    else if(mode===6){for(let i=2;i<indices.length;i++){const a=indices[0],b=indices[i-1],c=indices[i];if(a!==b&&b!==c&&c!==a)out.push(a,b,c);}}
    else return [];
    return out;
  }

  // ------------------------- build static world-relative triangles -------------------------
  function sceneRoots(json) {
    const nodes=json.nodes||[];if(!nodes.length)return [];
    if(json.scenes?.length){const si=json.scene??0;if(!Number.isInteger(si)||!json.scenes[si])throw Error("Default glTF scene index invalid");return json.scenes[si].nodes||[];}
    const child=new Set();for(const n of nodes)for(const c of n.children||[])child.add(c);
    return nodes.map((_,i)=>i).filter(i=>!child.has(i));
  }
  function fallbackAccessorMinMax(json,index){
    const a=json.accessors?.[index];
    if(!a||!Array.isArray(a.min)||!Array.isArray(a.max)||a.min.length!==3||a.max.length!==3)return null;
    if(!a.min.every(Number.isFinite)||!a.max.every(Number.isFinite))return null;
    if(a.min.some((v,i)=>v>a.max[i]))return null;
    return [a.min,a.max];
  }
  function validateNodeTransform(node,index){
    if(node.matrix!==undefined){
      if(node.translation!==undefined||node.rotation!==undefined||node.scale!==undefined)throw Error(`node[${index}] cannot define matrix and TRS at the same time`);
      const m=node.matrix;
      if(!Array.isArray(m)||m.length!==16||!m.every(Number.isFinite))throw Error(`node[${index}].matrix invalid`);
      if(Math.abs(m[3])>1e-10||Math.abs(m[7])>1e-10||Math.abs(m[11])>1e-10||Math.abs(m[15]-1)>1e-10)throw Error(`node[${index}].matrix must be affine`);
      return;
    }
    const t=node.translation??[0,0,0],q=node.rotation??[0,0,0,1],sc=node.scale??[1,1,1];
    if(!Array.isArray(t)||t.length!==3||!t.every(Number.isFinite)||!Array.isArray(q)||q.length!==4||!q.every(Number.isFinite)||!Array.isArray(sc)||sc.length!==3||!sc.every(Number.isFinite))throw Error(`node[${index}] TRS invalid`);
    const qn=Math.hypot(...q);if(qn<1e-12||Math.abs(qn-1)>1e-3)throw Error(`node[${index}] quaternion is not normalized`);
  }
  function yieldToNextFrame(){
    return new Promise(resolve=>{
      if(!W.document?.hidden&&typeof W.requestAnimationFrame==="function")W.requestAnimationFrame(()=>resolve());
      else setTimeout(resolve,0);
    });
  }
  const BUILD_SLICE_TRIANGLES=2048;
  async function buildTriangles(doc,modelMatrix,modelScale=1) {
    const json=doc.json,views=await viewResolver(doc),chunks=[];let outBytes=0,dracoPrims=0,meshoptViews=0,triangles=0,sliceTriangles=0;
    for(let i=0;i<(json.bufferViews||[]).length;i++)if(json.bufferViews[i].extensions?.KHR_meshopt_compression||json.bufferViews[i].extensions?.EXT_meshopt_compression)meshoptViews++;
    if(!Number.isFinite(modelScale)||modelScale===0)throw Error("modelScale must be finite and non-zero");
    const sceneRootsList=sceneRoots(json),visited=new Set(),parents=new Uint16Array((json.nodes||[]).length);
    if(new Set(sceneRootsList).size!==sceneRootsList.length)throw Error("Selected glTF scene contains duplicate root nodes");
    for(let i=0;i<(json.nodes||[]).length;i++){
      const node=json.nodes[i];validateNodeTransform(node,i);
      for(const child of node.children||[]){if(!Number.isInteger(child)||child<0||child>=parents.length)throw Error(`node[${i}] child index invalid`);parents[child]++;if(parents[child]>1)throw Error(`node[${child}] has multiple parents`);}
    }
    for(const r of sceneRootsList){if(!Number.isInteger(r)||r<0||r>=parents.length)throw Error("Scene root index invalid");if(parents[r])throw Error(`scene root node ${r} is also a child`);}
    const emitNode=async (nodeIndex,parentMat)=>{
      if(!Number.isInteger(nodeIndex)||nodeIndex<0||nodeIndex>=(json.nodes||[]).length)throw Error("Scene node index invalid: "+nodeIndex);
      if(visited.has(nodeIndex))throw Error("glTF node hierarchy cycle: "+nodeIndex);
      visited.add(nodeIndex);const node=json.nodes[nodeIndex],world=M.mul(parentMat,M.node(node));
      if(node.mesh!==undefined){const mesh=json.meshes?.[node.mesh];if(!mesh)throw Error("Node mesh reference invalid");
        for(const prim of mesh.primitives||[]){const mode=prim.mode??4;if(mode!==4&&mode!==5&&mode!==6)continue;
          let positions,indices,dracoFaces=false,positionCount=0;
          const draco=prim.extensions?.KHR_draco_mesh_compression;
          if(draco){
            if(mode!==4&&mode!==5)throw Error("KHR_draco_mesh_compression permits only TRIANGLES or TRIANGLE_STRIP");
            if(!Number.isInteger(draco.bufferView)||draco.bufferView<0||draco.bufferView>=views.length)throw Error("Draco bufferView index is invalid");
            if(!draco.attributes||!Number.isInteger(draco.attributes.POSITION))throw Error("Draco POSITION unique attribute id is missing");
            const compressed=views[draco.bufferView];if(!compressed)throw Error("Draco compressed bufferView missing");
            try {
              const d=await decodeDraco(compressed,draco,prim);
              const pAccessor=json.accessors?.[prim.attributes.POSITION];
              if(!pAccessor||pAccessor.count!==d.pointCount)throw Error("Draco POSITION accessor count does not match decoded point count");
              if(prim.indices!==undefined){const iAccessor=json.accessors?.[prim.indices];if(!iAccessor||iAccessor.count!==d.indices.length)throw Error("Draco index accessor count does not match decoded faces");}
              positions=d.positions;indices=d.indices;positionCount=d.pointCount;dracoPrims++;dracoFaces=true;
            }
            catch(e){
              const required=(json.extensionsRequired||[]).includes("KHR_draco_mesh_compression"),fallbackIndex=prim.attributes?.POSITION,fallbackAccessor=json.accessors?.[fallbackIndex];
              if(required||!Number.isInteger(fallbackIndex)||(!Number.isInteger(fallbackAccessor?.bufferView)&&!fallbackAccessor?.sparse))throw e;
              warn("Draco decode failed; uncompressed fallback used",e);
            }
          }
          if(!dracoFaces){
            const pi=prim.attributes?.POSITION;if(!Number.isInteger(pi))throw Error("Primitive POSITION accessor missing");
            const p=readAccessor(doc,views,pi);if(p.components!==3)throw Error("POSITION accessor must be VEC3");
            const quantized=(json.extensionsUsed||[]).includes("KHR_mesh_quantization");
            if(p.componentType!==5126&&(!quantized||![5120,5121,5122,5123].includes(p.componentType)))throw Error("POSITION must be FLOAT or valid KHR_mesh_quantization integer VEC3");
            if(!fallbackAccessorMinMax(json,pi))throw Error("POSITION accessor min/max missing or invalid");
            positions=p.data;positionCount=p.count;
            if(prim.indices!==undefined){const ix=readAccessor(doc,views,prim.indices);if(ix.components!==1||![5121,5123,5125].includes(ix.componentType)||ix.normalized)throw Error("indices accessor must be unsigned SCALAR");indices=new Uint32Array(ix.data.length);for(let i=0;i<ix.data.length;i++){const v=ix.data[i];if(!Number.isInteger(v)||v<0||v>=p.count)throw Error("Index is outside POSITION count");indices[i]=v;}}
            else {indices=new Uint32Array(p.count);for(let i=0;i<p.count;i++)indices[i]=i;}
          }
          const tris=dracoFaces?indices:triIndices(indices,mode);
          if(tris.length%3!==0)throw Error("Triangulated index count is not divisible by 3");
          const triCount=tris.length/3;if(!triCount)continue;
          if(triangles+triCount>LIMIT.trianglesPerModel)throw Error("Model triangle limit exceeded: "+LIMIT.trianglesPerModel);
          const chunk=new Float32Array(triCount*9);let cursor=0;
          let written=0;
          for(let i=0;i<tris.length;i+=3){
            const pts=[];
            for(let c=0;c<3;c++){
              const id=tris[i+c];if(!Number.isInteger(id)||id<0||id>=positionCount||id*3+2>=positions.length)throw Error("Triangle POSITION index out of bounds");
              const local=[positions[id*3]*modelScale,positions[id*3+1]*modelScale,positions[id*3+2]*modelScale];
              const nodeP=M.point(world,local),worldP=M.point(modelMatrix,nodeP);
              const point=[worldP[0]-modelMatrix[12],worldP[1]-modelMatrix[13],worldP[2]-modelMatrix[14]];
              if(!point.every(Number.isFinite))throw Error("Transformed POSITION is non-finite");pts.push(point);
            }
            const ab=V.sub(pts[1],pts[0]),ac=V.sub(pts[2],pts[0]);
            if(V.len2(V.cross(ab,ac))>=1e-20){
              for(const point of pts){chunk[written++]=point[0];chunk[written++]=point[1];chunk[written++]=point[2];}
            }
            if(++sliceTriangles>=BUILD_SLICE_TRIANGLES){sliceTriangles=0;state.counters.streamingSliceYields++;await yieldToNextFrame();}
          }
          if(written){const compact=written===chunk.length?chunk:chunk.slice(0,written);chunks.push(compact);const kept=written/9;triangles+=kept;outBytes+=compact.byteLength;}
          if(outBytes>LIMIT.geometryBytes)throw Error("Decoded vertex memory limit exceeded while building triangles");
        }
      }
      for(const child of node.children||[])await emitNode(child,world);
      visited.delete(nodeIndex);
    };
    for(const root of sceneRootsList)await emitNode(root,M.identity());
    if(!triangles)throw Error("Selected glTF scene contains no triangle primitives");
    const vertices=new Float32Array(outBytes/4);let offset=0;for(const part of chunks){vertices.set(part,offset);offset+=part.length;}
    return {vertices,triangleCount:triangles,compression:{dracoPrimitives:dracoPrims,meshoptViews}};
  }

  // ------------------------- BVH construction and collision geometry -------------------------
  function buildBVH(vertices) {
    const n=vertices.length/9;if(!n||!Number.isInteger(n)||vertices.length%9)throw Error("Cannot build BVH for invalid/empty triangle mesh");
    for(let i=0;i<vertices.length;i++)if(!Number.isFinite(vertices[i]))throw Error("BVH input contains non-finite vertex");
    const triBounds=new Float32Array(n*6),centers=new Float32Array(n*3),refs=new Uint32Array(n);
    for(let i=0;i<n;i++){const k=i*9;let minx=Infinity,miny=Infinity,minz=Infinity,maxx=-Infinity,maxy=-Infinity,maxz=-Infinity;for(let j=0;j<9;j+=3){const x=vertices[k+j],y=vertices[k+j+1],z=vertices[k+j+2];minx=Math.min(minx,x);miny=Math.min(miny,y);minz=Math.min(minz,z);maxx=Math.max(maxx,x);maxy=Math.max(maxy,y);maxz=Math.max(maxz,z);}const b=i*6;triBounds[b]=minx;triBounds[b+1]=miny;triBounds[b+2]=minz;triBounds[b+3]=maxx;triBounds[b+4]=maxy;triBounds[b+5]=maxz;const c=i*3;centers[c]=(minx+maxx)*.5;centers[c+1]=(miny+maxy)*.5;centers[c+2]=(minz+maxz)*.5;refs[i]=i;}
    const maxNodes=Math.max(1,n*2);const bounds=new Float32Array(maxNodes*6),left=new Int32Array(maxNodes),right=new Int32Array(maxNodes),start=new Uint32Array(maxNodes),count=new Uint16Array(maxNodes);left.fill(-1);right.fill(-1);let nodeN=0;
    function quickSelect(lo,hi,k,axis){while(hi-lo>1){const pivot=centers[refs[(lo+hi)>>1]*3+axis];let i=lo,j=hi-1;while(i<=j){while(centers[refs[i]*3+axis]<pivot)i++;while(centers[refs[j]*3+axis]>pivot)j--;if(i<=j){const t=refs[i];refs[i]=refs[j];refs[j]=t;i++;j--;}}if(k<=j)hi=j+1;else if(k>=i)lo=i;else return;}}
    function build(lo,hi){const id=nodeN++,bo=id*6;let minx=Infinity,miny=Infinity,minz=Infinity,maxx=-Infinity,maxy=-Infinity,maxz=-Infinity,cmin=[Infinity,Infinity,Infinity],cmax=[-Infinity,-Infinity,-Infinity];for(let p=lo;p<hi;p++){const t=refs[p],b=t*6,c=t*3;minx=Math.min(minx,triBounds[b]);miny=Math.min(miny,triBounds[b+1]);minz=Math.min(minz,triBounds[b+2]);maxx=Math.max(maxx,triBounds[b+3]);maxy=Math.max(maxy,triBounds[b+4]);maxz=Math.max(maxz,triBounds[b+5]);for(let a=0;a<3;a++){cmin[a]=Math.min(cmin[a],centers[c+a]);cmax[a]=Math.max(cmax[a],centers[c+a]);}}bounds.set([minx,miny,minz,maxx,maxy,maxz],bo);const size=hi-lo;if(size<=LIMIT.bvhLeaf){start[id]=lo;count[id]=size;return id;}const ext=[cmax[0]-cmin[0],cmax[1]-cmin[1],cmax[2]-cmin[2]];const axis=ext[0]>=ext[1]&&ext[0]>=ext[2]?0:ext[1]>=ext[2]?1:2;const mid=(lo+hi)>>1;quickSelect(lo,hi,mid,axis);if(mid===lo||mid===hi)return (start[id]=lo,count[id]=size,id);left[id]=build(lo,mid);right[id]=build(mid,hi);return id;}
    const root=build(0,n);let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<vertices.length;i+=3){min[0]=Math.min(min[0],vertices[i]);min[1]=Math.min(min[1],vertices[i+1]);min[2]=Math.min(min[2],vertices[i+2]);max[0]=Math.max(max[0],vertices[i]);max[1]=Math.max(max[1],vertices[i+1]);max[2]=Math.max(max[2],vertices[i+2]);}
    return {root,refs,bounds,left,right,start,count,nodeCount:nodeN,triBounds,centers,min,max};
  }
  // Cooperative BVH builder. The synchronous buildBVH remains for tiny self-tests;
  // production registrations yield to the browser between bounded work slices.
  async function buildBVHCooperative(vertices) {
    const n=vertices.length/9;if(!n||!Number.isInteger(n)||vertices.length%9)throw Error("Cannot build BVH for invalid/empty triangle mesh");
    const triBounds=new Float32Array(n*6),centers=new Float32Array(n*3),refs=new Uint32Array(n);
    let work=0;
    function maybeYield(){if(++work<4096)return null;work=0;state.counters.streamingSliceYields++;return yieldToNextFrame();}
    for(let i=0;i<n;i++){
      const k=i*9;let minx=Infinity,miny=Infinity,minz=Infinity,maxx=-Infinity,maxy=-Infinity,maxz=-Infinity;
      for(let j=0;j<9;j+=3){const x=vertices[k+j],y=vertices[k+j+1],z=vertices[k+j+2];minx=Math.min(minx,x);miny=Math.min(miny,y);minz=Math.min(minz,z);maxx=Math.max(maxx,x);maxy=Math.max(maxy,y);maxz=Math.max(maxz,z);}
      const b=i*6;triBounds[b]=minx;triBounds[b+1]=miny;triBounds[b+2]=minz;triBounds[b+3]=maxx;triBounds[b+4]=maxy;triBounds[b+5]=maxz;
      const c=i*3;centers[c]=(minx+maxx)*.5;centers[c+1]=(miny+maxy)*.5;centers[c+2]=(minz+maxz)*.5;refs[i]=i;
      const pause=maybeYield();if(pause)await pause;
    }
    const maxNodes=Math.max(1,n*2),bounds=new Float32Array(maxNodes*6),left=new Int32Array(maxNodes),right=new Int32Array(maxNodes),start=new Uint32Array(maxNodes),count=new Uint16Array(maxNodes);
    left.fill(-1);right.fill(-1);let nodeN=0;
    async function quickSelect(lo,hi,k,axis){
      while(hi-lo>1){
        const pivot=centers[refs[(lo+hi)>>1]*3+axis];let i=lo,j=hi-1;
        while(i<=j){
          while(i<=j&&centers[refs[i]*3+axis]<pivot){i++;const pause=maybeYield();if(pause)await pause;}
          while(i<=j&&centers[refs[j]*3+axis]>pivot){j--;const pause=maybeYield();if(pause)await pause;}
          if(i<=j){const t=refs[i];refs[i]=refs[j];refs[j]=t;i++;j--;const pause=maybeYield();if(pause)await pause;}
        }
        if(k<=j)hi=j+1;else if(k>=i)lo=i;else return;
      }
    }
    async function build(lo,hi){
      const id=nodeN++,bo=id*6;let minx=Infinity,miny=Infinity,minz=Infinity,maxx=-Infinity,maxy=-Infinity,maxz=-Infinity;
      const cmin=[Infinity,Infinity,Infinity],cmax=[-Infinity,-Infinity,-Infinity];
      for(let p=lo;p<hi;p++){
        const t=refs[p],b=t*6,c=t*3;minx=Math.min(minx,triBounds[b]);miny=Math.min(miny,triBounds[b+1]);minz=Math.min(minz,triBounds[b+2]);maxx=Math.max(maxx,triBounds[b+3]);maxy=Math.max(maxy,triBounds[b+4]);maxz=Math.max(maxz,triBounds[b+5]);
        for(let a=0;a<3;a++){cmin[a]=Math.min(cmin[a],centers[c+a]);cmax[a]=Math.max(cmax[a],centers[c+a]);}
        const pause=maybeYield();if(pause)await pause;
      }
      bounds.set([minx,miny,minz,maxx,maxy,maxz],bo);const size=hi-lo;
      if(size<=LIMIT.bvhLeaf){start[id]=lo;count[id]=size;return id;}
      const ext=[cmax[0]-cmin[0],cmax[1]-cmin[1],cmax[2]-cmin[2]],axis=ext[0]>=ext[1]&&ext[0]>=ext[2]?0:ext[1]>=ext[2]?1:2,mid=(lo+hi)>>1;
      await quickSelect(lo,hi,mid,axis);
      if(mid===lo||mid===hi){start[id]=lo;count[id]=size;return id;}
      left[id]=await build(lo,mid);right[id]=await build(mid,hi);return id;
    }
    const root=await build(0,n);let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<vertices.length;i+=3){min[0]=Math.min(min[0],vertices[i]);min[1]=Math.min(min[1],vertices[i+1]);min[2]=Math.min(min[2],vertices[i+2]);max[0]=Math.max(max[0],vertices[i]);max[1]=Math.max(max[1],vertices[i+1]);max[2]=Math.max(max[2],vertices[i+2]);if((i/3)%BUILD_SLICE_TRIANGLES===0)await yieldToNextFrame();}
    return {root,refs,bounds,left,right,start,count,nodeCount:nodeN,triBounds,centers,min,max};
  }

  async function buildBVHOffThread(vertices){
    if(typeof W.Worker!=="function"||typeof W.Blob!=="function"||typeof W.URL?.createObjectURL!=="function"){
      state.counters.bvhCooperativeFallbacks++;return buildBVHCooperative(vertices);
    }
    let worker=null,workerURL=null;
    try{
      const workerSource=`const LIMIT={bvhLeaf:${LIMIT.bvhLeaf}};\n${buildBVH.toString()}\nself.onmessage=function(e){try{const b=buildBVH(new Float32Array(e.data));const result={root:b.root,nodeCount:b.nodeCount,refs:b.refs,bounds:b.bounds,left:b.left,right:b.right,start:b.start,count:b.count,triBounds:b.triBounds,centers:b.centers,min:b.min,max:b.max};self.postMessage({ok:true,result},[result.refs.buffer,result.bounds.buffer,result.left.buffer,result.right.buffer,result.start.buffer,result.count.buffer,result.triBounds.buffer,result.centers.buffer]);}catch(error){self.postMessage({ok:false,error:String(error&&error.message||error)});}};`;
      workerURL=W.URL.createObjectURL(new W.Blob([workerSource],{type:"text/javascript"}));
      worker=new W.Worker(workerURL);
      const copy=vertices.slice();
      const result=await new Promise((resolve,reject)=>{
        let settled=false;const timeout=setTimeout(()=>finish(new Error("BVH worker timeout")),30000);
        const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timeout);error?reject(error):resolve(value);};
        worker.onmessage=event=>{const data=event.data;if(!data?.ok){finish(new Error(data?.error||"BVH worker failed"));return;}finish(null,data.result);};
        worker.onerror=event=>finish(new Error(event?.message||"BVH worker error"));
        worker.onmessageerror=()=>finish(new Error("BVH worker message could not be decoded"));
        try{worker.postMessage(copy.buffer,[copy.buffer]);}catch(e){finish(e);}
      });
      state.counters.bvhWorkerBuilds++;return result;
    }catch(e){
      state.counters.bvhWorkerFailures++;warn("BVH Workerを使用できないため、分割処理へ切り替えます",e.message||e);
      state.counters.bvhCooperativeFallbacks++;return await buildBVHCooperative(vertices);
    }finally{
      try{worker?.terminate();}catch(_){}
      if(workerURL)try{W.URL.revokeObjectURL(workerURL);}catch(_){}
    }
  }

  function closestPointTriangle(p,a,b,c) {
    const ab=V.sub(b,a),ac=V.sub(c,a),ap=V.sub(p,a),d1=V.dot(ab,ap),d2=V.dot(ac,ap);if(d1<=0&&d2<=0)return a;
    const bp=V.sub(p,b),d3=V.dot(ab,bp),d4=V.dot(ac,bp);if(d3>=0&&d4<=d3)return b;
    const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0){const v=d1/(d1-d3);return V.add(a,V.mul(ab,v));}
    const cp=V.sub(p,c),d5=V.dot(ab,cp),d6=V.dot(ac,cp);if(d6>=0&&d5<=d6)return c;
    const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0){const w=d2/(d2-d6);return V.add(a,V.mul(ac,w));}
    const va=d3*d6-d5*d4;if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0){const w=(d4-d3)/((d4-d3)+(d5-d6));return V.add(b,V.mul(V.sub(c,b),w));}
    const denom=1/(va+vb+vc),v=vb*denom,w=vc*denom;return V.add(a,V.add(V.mul(ab,v),V.mul(ac,w)));
  }
  function triangleAt(v,i){const k=i*9;return [[v[k],v[k+1],v[k+2]],[v[k+3],v[k+4],v[k+5]],[v[k+6],v[k+7],v[k+8]]];}
  function aabbDistance2(p,b,o){let d=0;for(let i=0;i<3;i++){const x=p[i],lo=b[o+i],hi=b[o+3+i];if(x<lo)d+=(lo-x)**2;else if(x>hi)d+=(x-hi)**2;}return d;}
  function queryCandidates(bvh,min,max,maxOut=LIMIT.candidatesPerPoint){
    const out=[],stack=[bvh.root];
    while(stack.length){
      const id=stack.pop(),o=id*6,b=bvh.bounds;
      if(b[o]>max[0]||b[o+1]>max[1]||b[o+2]>max[2]||b[o+3]<min[0]||b[o+4]<min[1]||b[o+5]<min[2])continue;
      if(bvh.left[id]<0){
        const s=bvh.start[id],n=bvh.count[id];
        for(let j=0;j<n;j++){
          const ti=bvh.refs[s+j],k=ti*6;
          if(bvh.triBounds[k]<=max[0]&&bvh.triBounds[k+1]<=max[1]&&bvh.triBounds[k+2]<=max[2]&&bvh.triBounds[k+3]>=min[0]&&bvh.triBounds[k+4]>=min[1]&&bvh.triBounds[k+5]>=min[2]){
            out.push(ti);
            if(out.length>maxOut){out.overflow=true;return out;}
          }
        }
      } else {stack.push(bvh.left[id],bvh.right[id]);if(stack.length>1_000_000){out.overflow=true;return out;}}
    }
    out.overflow=false;return out;
  }
  function closestOnMesh(collider,p,radius){
    const b=collider.bvh,candidates=queryCandidates(b,[p[0]-radius,p[1]-radius,p[2]-radius],[p[0]+radius,p[1]+radius,p[2]+radius]);
    if(candidates.overflow)return {hit:null,candidates:candidates.length,overflow:true};
    let best=null,bestD=radius*radius;
    for(const ti of candidates){
      const [a,bb,cc]=triangleAt(collider.vertices,ti),q=closestPointTriangle(p,a,bb,cc),d=V.sub(p,q),d2=V.len2(d);
      if(d2<bestD){bestD=d2;let n;let fallback=false;if(d2>1e-16)n=V.norm(d);else {n=V.norm(V.cross(V.sub(bb,a),V.sub(cc,a)));fallback=true;}best={triangle:ti,point:q,normal:n,normalFallback:fallback,distance:Math.sqrt(d2),penetration:Math.max(0,radius-Math.sqrt(d2))};}
    }
    return {hit:best,candidates:candidates.length,overflow:false};
  }
  function sweepSphereTriangle(p0,p1,r,a,b,c) {
    const delta=V.sub(p1,p0),speed=V.len(delta);let t=0;
    function makeHit(p,q,dist,iteration){
      let n;
      if(dist>1e-8){
        // For a non-degenerate closest point, d = center - surface is already
        // the outward normal. Never flip it merely to oppose motion: when the
        // probe starts overlapped and is moving away, that would turn a release
        // into a fresh inward collision and permanently trap the aircraft.
        n=V.mul(V.sub(p,q),1/dist);
        if(V.dot(n,delta)>=-1e-7)return null;
      }else{
        // At zero distance the radial direction is undefined. Use the triangle
        // normal only for this degenerate case and orient it against approach.
        n=V.norm(V.cross(V.sub(b,a),V.sub(c,a)));
        if(V.len2(n)<0.5)return null;
        if(V.dot(n,delta)>0)n=V.mul(n,-1);
        if(speed<1e-9)return null;
      }
      return {t,point:q,normal:n,distance:dist,iterations:iteration};
    }
    for(let it=0;it<LIMIT.sweepIterations;it++){
      const p=V.add(p0,V.mul(delta,t)),q=closestPointTriangle(p,a,b,c),d=V.sub(p,q),dist=V.len(d),gap=dist-r;
      if(gap<=LIMIT.sweepTolerance)return makeHit(p,q,dist,it+1);
      if(speed<1e-9)return null;
      const advance=Math.max((gap/speed)*0.8,1e-6);t+=advance;if(t>1)return null;
    }
    const p=V.add(p0,V.mul(delta,Math.min(1,t))),q=closestPointTriangle(p,a,b,c),d=V.sub(p,q),dist=V.len(d);
    if(t<=1&&dist<=r+LIMIT.sweepTolerance)return makeHit(p,q,dist,LIMIT.sweepIterations);
    return null;
  }
  function sweepCollider(collider,p0,p1,radius){
    const delta=V.sub(p1,p0),length=V.len(delta);
    const segments=Math.max(1,Math.ceil(length/LIMIT.sweepSegmentLength));
    if(segments>LIMIT.maxSweepSegments)return {hit:null,candidateCount:0,overflow:true,reason:"sweep segment limit exceeded"};
    let best=null,totalCandidates=0;
    for(let seg=0;seg<segments;seg++){
      const t0=seg/segments,t1=(seg+1)/segments;
      const a=V.add(p0,V.mul(delta,t0)),b=V.add(p0,V.mul(delta,t1));
      const min=[0,1,2].map(i=>Math.min(a[i],b[i])-radius),max=[0,1,2].map(i=>Math.max(a[i],b[i])+radius);
      const candidates=queryCandidates(collider.bvh,min,max);
      if(candidates.overflow)return {hit:null,candidateCount:totalCandidates+candidates.length,overflow:true,reason:"BVH candidate cap exceeded"};
      totalCandidates+=candidates.length;
      for(const ti of candidates){
        const tri=triangleAt(collider.vertices,ti),h=sweepSphereTriangle(a,b,radius,...tri);
        if(h){const globalT=t0+(t1-t0)*h.t;if(!best||globalT<best.t){best={...h,t:globalT,triangle:ti};if(globalT===0)break;}}
      }
      if(best&&best.t<=t1)break;
    }
    return {hit:best,candidateCount:totalCandidates,overflow:false};
  }

  // ------------------------- model transform and registration -------------------------
  function sourceFromModelOptions(o){
    if(!o)return null;
    if(typeof o==="string")return absURL(o);
    return absURL(o)||absURL(o.url)||absURL(o._resource)||absURL(o.resource)||absURL(o.gltf)||absURL(o._gltfResource);
  }
  function isExperimentalModel(m){
    if(!m||!m.modelMatrix||!("readyPromise" in m))return false;
    try{if(C.ModelExperimental&&m instanceof C.ModelExperimental)return true;}catch(_){}
    return !!(m._sceneGraph&&m._loader&&m._sceneGraph.computedModelMatrix);
  }
  function isCollisionModel(m){
    if(!m)return false;
    try{if(C.Model&&m instanceof C.Model)return true;}catch(_){}
    if(m.constructor?.name==="Model"&&m.modelMatrix&&"readyPromise" in m)return true;
    return isExperimentalModel(m);
  }
  function effectiveModelMatrixObject(m){
    if(isExperimentalModel(m))return m.sceneGraph?.computedModelMatrix||m._sceneGraph?.computedModelMatrix||null;
    return m?._computedModelMatrix||null;
  }
  function modelMatrixFor(m){
    // Legacy Cesium.Model uses _computedModelMatrix. GeoFS 3.9's buildings and
    // trees set options.experimental=true, so Cesium 1.96 creates a
    // ModelExperimental. Its scene graph computes:
    // modelMatrix * components.transform * axisCorrectionMatrix * computedScale.
    // Use that exact effective matrix to align collision triangles with render.
    const object=effectiveModelMatrixObject(m);
    if(!object)throw Error(isExperimentalModel(m)?"ModelExperimental.sceneGraph.computedModelMatrixがありません":"Cesium Model computed matrix is unavailable");
    const a=M.fromCesium(object);
    if(a.length!==16||!a.every(Number.isFinite))throw Error("Cesium model computed matrix contains non-finite values");
    if(Math.abs(a[3])>1e-10||Math.abs(a[7])>1e-10||Math.abs(a[11])>1e-10||Math.abs(a[15]-1)>1e-10)throw Error("Cesium model computed matrix is not affine");
    const det=a[0]*(a[5]*a[10]-a[9]*a[6])-a[4]*(a[1]*a[10]-a[9]*a[2])+a[8]*(a[1]*a[6]-a[5]*a[2]);
    if(!Number.isFinite(det)||Math.abs(det)<1e-18)throw Error("Cesium model computed matrix is singular");
    return a;
  }
  function modelEligible(m){
    if(!m.ready)throw Error("Cesium Model / ModelExperimental.ready=false");
    if(m.minimumPixelSize>0)throw Error("minimumPixelSize>0: 表示サイズがカメラ依存のため物理寸法を確定できません");
    if(m.heightReference!==undefined&&C.HeightReference&&m.heightReference!==C.HeightReference.NONE)throw Error("heightReference付きModelはクランプ後の描画行列をこの版で確定できません");
    if(m._rtcCenter3D||m._rtcCenter){
      if(!isExperimentalModel(m))throw Error("CESIUM_RTC付きLegacy Modelはこの版では安全な変換行列を取得できません");
      const sg=m.sceneGraph||m._sceneGraph;
      if(!sg?.computedModelMatrix||!sg?.components?.transform)throw Error("CESIUM_RTC付きModelExperimentalのroot transformがまだ準備されていません");
      const cm=M.fromCesium(sg.computedModelMatrix),rt=M.fromCesium(sg.components.transform);
      if(cm.length!==16||rt.length!==16||!cm.every(Number.isFinite)||!rt.every(Number.isFinite))throw Error("CESIUM_RTCを含むModelExperimental transformが不正です");
    }
    return true;
  }
  function playerWorldPosition(){
    const lla=G.aircraft?.instance?.llaLocation;
    if(!Array.isArray(lla)||lla.length<3||!lla.every(Number.isFinite))return null;
    try{const p=C.Cartesian3.fromDegrees(lla[1],lla[0],lla[2],G.api.viewer.scene.globe.ellipsoid);return [p.x,p.y,p.z].every(Number.isFinite)?[p.x,p.y,p.z]:null;}catch(_){return null;}
  }
  function distance3(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);}
  function modelWorldOrigin(model){
    try{return matrixTranslation(modelMatrixFor(model));}catch(_){return null;}
  }
  function modelSpatialSphere(model){
    const b=model?.boundingSphere||model?._boundingSphere||model?._boundingSphere3D;
    // Cesium ModelExperimental initially exposes an empty radius-0 sphere
    // before its first render update. Do not mistake its zero center for the
    // actual tile location; fall back to the effective model matrix then.
    if(b?.center&&Number.isFinite(b.center.x)&&Number.isFinite(b.center.y)&&Number.isFinite(b.center.z)&&Number.isFinite(b.radius)&&b.radius>1e-4){
      return {center:[b.center.x,b.center.y,b.center.z],radius:b.radius};
    }
    const origin=modelWorldOrigin(model);return origin?{center:origin,radius:0}:null;
  }
  function modelDistanceFromPlayer(model,player=playerWorldPosition()){
    if(!player)return null;const sphere=modelSpatialSphere(model);return sphere?Math.max(0,distance3(player,sphere.center)-sphere.radius):null;
  }
  function colliderDistanceFromPlayer(collider,player){
    return player&&collider?.origin&&Number.isFinite(collider.radius)?Math.max(0,distance3(player,collider.origin)-collider.radius):null;
  }
  function withinLoadRadius(distance){return Number.isFinite(distance)&&distance<=state.streaming.loadRadius;}
  function beyondUnloadRadius(distance){return Number.isFinite(distance)&&distance>state.streaming.unloadRadius;}
  function releaseCollider(collider,reason="manual"){
    const i=state.colliders.indexOf(collider);if(i<0)return false;
    state.colliders.splice(i,1);
    state.geometryBytes=Math.max(0,state.geometryBytes-collider.bytes);
    state.triangleCount=Math.max(0,state.triangleCount-collider.triangleCount);
    state.memoryEpoch++;
    if(collider.model){
      state.registered.delete(collider.model);
      if(reason==="capacity"){
        state.deferredModels.add(collider.model);
        state.modelErrors.set(collider.model,{url:state.modelURL.get(collider.model)||collider.source,skipped:true,reason:"遠方コライダーを解放し、近距離モデルへ容量を再割当てしました"});
      } else if(reason==="stream-distance") {
        state.deferredModels.delete(collider.model);state.modelErrors.delete(collider.model);
      }
    }
    if(reason==="stream-distance")state.counters.streamedOut++;
    if(reason==="capacity")state.counters.capacityEvictions++;
    return true;
  }
  function hasFartherEvictableCollider(targetModel){
    const player=playerWorldPosition(),targetDistance=modelDistanceFromPlayer(targetModel,player);
    if(!player||!Number.isFinite(targetDistance))return false;
    return state.colliders.some(c=>c.model&&c.model!==targetModel&&(colliderDistanceFromPlayer(c,player)??-Infinity)>targetDistance+100);
  }
  function evictFarCollidersForCapacity(requiredBytes,targetModel,targetOrigin){
    if(!targetModel||!targetOrigin)return 0;
    const player=playerWorldPosition();if(!player)return 0;
    const targetDistance=modelDistanceFromPlayer(targetModel,player);let freed=0;
    if(!Number.isFinite(targetDistance))return 0;
    const candidates=state.colliders.filter(c=>c.model&&c.model!==targetModel).map(c=>({collider:c,distance:colliderDistanceFromPlayer(c,player)}))
      .filter(x=>Number.isFinite(x.distance)&&x.distance>targetDistance+100)
      .sort((a,b)=>b.distance-a.distance);
    for(const item of candidates){
      if(state.geometryBytes+requiredBytes<=LIMIT.geometryBytes)break;
      freed+=item.collider.bytes;releaseCollider(item.collider,"capacity");
    }
    return freed;
  }
  async function buildAndStoreCollider(source,doc,matrix,scale,model=null,labelOverride=null,matrixIncludesRTC=false) {
    if(state.colliders.length>=LIMIT.models)return {skipped:true,reason:"安全なコライダー個数上限に達したため保留しました",label:labelOverride||source,triangleCount:0,estimatedBytes:0,availableBytes:Math.max(0,LIMIT.geometryBytes-state.geometryBytes)};
    if(!Array.isArray(matrix)||matrix.length!==16||!matrix.every(Number.isFinite))throw Error("Collider model matrix is invalid");
    const rtcCenter=rtcCenterFromDocument(doc);
    const effectiveMatrix=rtcCenter&&!matrixIncludesRTC?applyRtcToMatrix(matrix,rtcCenter):matrix.slice();
    const built=await buildTriangles(doc,effectiveMatrix,scale);
    const bytes=built.vertices.byteLength;
    // The former global 500,000-triangle cap rejected otherwise valid scenes.
    // Keep the real safety boundary: estimated typed-array memory for the BVH
    // plus vertices. buildBVH allocates 116 bytes/triangle for its typed arrays.
    const estimatedBvhBytes=built.triangleCount*116;
    const estimatedTotalBytes=bytes+estimatedBvhBytes;
    const availableBytes=Math.max(0,LIMIT.geometryBytes-state.geometryBytes);
    let name=labelOverride||(()=>{try{return decodeURIComponent(new URL(source).pathname.split("/").pop()||source);}catch(_){return String(source).slice(-80);}})();
    const targetOrigin=matrixTranslation(effectiveMatrix);
    if(state.geometryBytes+estimatedTotalBytes>LIMIT.geometryBytes&&model){
      evictFarCollidersForCapacity(estimatedTotalBytes,model,targetOrigin);
    }
    const updatedAvailableBytes=Math.max(0,LIMIT.geometryBytes-state.geometryBytes);
    if(state.geometryBytes+estimatedTotalBytes>LIMIT.geometryBytes){
      return {skipped:true,reason:"近距離コライダーを優先した結果、現在のメモリ枠では登録できないため保留しました",label:name,triangleCount:built.triangleCount,estimatedBytes:estimatedTotalBytes,availableBytes:updatedAvailableBytes};
    }
    const bvh=await buildBVHOffThread(built.vertices),origin=targetOrigin;
    const bvhBytes=bvh.refs.byteLength+bvh.bounds.byteLength+bvh.left.byteLength+bvh.right.byteLength+bvh.start.byteLength+bvh.count.byteLength+bvh.triBounds.byteLength+bvh.centers.byteLength;
    const totalBytes=bytes+bvhBytes;
    if(state.geometryBytes+totalBytes>LIMIT.geometryBytes)throw Error(`Total collision geometry + BVH memory limit exceeded (${state.geometryBytes+totalBytes} / ${LIMIT.geometryBytes})`);
    let radius=0;
    for(let mask=0;mask<8;mask++){
      const p=[(mask&1)?bvh.max[0]:bvh.min[0],(mask&2)?bvh.max[1]:bvh.min[1],(mask&4)?bvh.max[2]:bvh.min[2]];
      radius=Math.max(radius,V.len(p));
    }
    if(!Number.isFinite(radius)||radius<=0)throw Error("Collider bounding radius is invalid");
    const collider={id:`glb-${Date.now()}-${state.colliders.length+1}`,model,source,label:name,matrix:effectiveMatrix.slice(),origin,vertices:built.vertices,bvh,radius,triangleCount:built.triangleCount,bytes:totalBytes,vertexBytes:bytes,bvhBytes,compression:built.compression,format:doc.sourceFormat||"glTF 2.0",rtcCenter:rtcCenter||null,enabled:true,static:true,createdAt:Date.now(),lastError:null};
    state.colliders.push(collider);state.geometryBytes+=totalBytes;state.triangleCount+=built.triangleCount;state.counters.trianglesBuilt+=built.triangleCount;
    if(model){state.registered.set(model,collider);state.deferredModels.delete(model);state.modelErrors.delete(model);state.counters.modelsRegistered++;state.counters.streamedIn++;}
    log("Collider registered",{label:collider.label,triangles:collider.triangleCount,bytes,compression:collider.compression,cesiumRtc:!!rtcCenter});
    return collider;
  }
  async function promiseWithTimeout(value,ms,message){
    let timer=null;
    try{return await Promise.race([Promise.resolve(value),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);})]);}
    finally{if(timer!==null)clearTimeout(timer);}
  }
  async function waitForModelTransform(model){
    // ModelExperimental.readyPromise resolves only after its loader has built
    // the SceneGraph. Its computedModelMatrix is already the render transform;
    // requiring two *additional* postRender events can deadlock in GeoFS's
    // requestRenderMode scene when no extra frame is requested.
    if(effectiveModelMatrixObject(model))return;
    const scene=G.api.viewer.scene;
    if(!scene?.postRender?.addEventListener){
      const end=Date.now()+LIMIT.transformTimeoutMs;
      while(Date.now()<end){if(effectiveModelMatrixObject(model))return;await new Promise(r=>setTimeout(r,50));}
      throw Error("Cesium Model transform was not initialized after readyPromise");
    }
    await new Promise((resolve,reject)=>{
      let done=false;const timeout=setTimeout(()=>finish(Error("Cesium Model transform was not initialized within 8 seconds")),LIMIT.transformTimeoutMs);
      const remove=scene.postRender.addEventListener(()=>{if(effectiveModelMatrixObject(model))finish();});
      function finish(error){if(done)return;done=true;clearTimeout(timeout);try{typeof remove==="function"&&remove();}catch(_){};error?reject(error):resolve();}
    });
  }
  async function registerModel(model,urlOverride) {
    if(!isCollisionModel(model))throw Error("対象はCesium 1.96 Model / ModelExperimentalに限ります");
    if(state.registered.has(model))return state.registered.get(model);
    // Avoid decoding the same oversized model every streaming tick. Retry only
    // after some collider has actually released memory (memoryEpoch changes).
    if(state.deferredModels.has(model)&&state.deferredEpoch.get(model)===state.memoryEpoch){
      const prior=state.modelErrors.get(model);return {skipped:true,reason:prior?.reason||"メモリ枠が空くまで保留中",label:model._url||"deferred"};
    }
    state.deferredModels.delete(model);
    if(state.pending.has(model))return state.pending.get(model);
    const task=(async()=>{
      const nativeTile=state.modelTileInfo.get(model);
      if(nativeTile)state.counters.geoFSTileCollisionAttempts++;
      let source=urlOverride||state.modelURL.get(model)||model._resource?.url||model._url||model.url;
      source=absURL(source);
      if(!source)throw Error("元GLB/glTF URLが不明です。通信開始前から監視するか、URLを指定してください");
      rememberURL(source,"model-register");
      if(model.readyPromise)await promiseWithTimeout(model.readyPromise,LIMIT.readyTimeoutMs,"Cesium Model ready timeout");
      await waitForModelTransform(model);
      modelEligible(model);
      const doc=await loadDocument(source,model);
      const rtcCenter=rtcCenterFromDocument(doc);
      let matrix=modelMatrixFor(model);
      // GeoFS 3.9 scenery uses ModelExperimental. Cesium 1.96's
      // ModelSceneGraph.computedModelMatrix folds components.transform
      // (including CESIUM_RTC.center), axis correction and computedScale into
      // this matrix. Do not add RTC a second time or multiply scale again.
      if(rtcCenter){
        if(!isExperimentalModel(model))throw Error("GeoFS CESIUM_RTC scenery must be loaded by ModelExperimental");
        const sg=model.sceneGraph||model._sceneGraph;
        if(!sg?.components?.transform||!sg?.computedModelMatrix)throw Error("CESIUM_RTC ModelSceneGraph transform is unavailable");
      }
      const result=await buildAndStoreCollider(source,doc,matrix,1,model,null,!!rtcCenter);
      if(rtcCenter&&!result?.skipped)state.counters.rtcGeometryRegistered++;
      if(nativeTile&&result&&!result.skipped)state.counters.geoFSTileCollisionRegistered++;
      if(state.destroyedModels.has(model)){
        if(result&&!result.skipped&&state.registered.has(model))releaseCollider(result,"model-destroyed");
        return {skipped:true,reason:"GeoFSが登録処理中に元モデルを破棄しました",label:source};
      }
      if(result?.skipped){
        state.deferredModels.add(model);state.deferredEpoch.set(model,state.memoryEpoch);
        state.modelErrors.set(model,{url:source,skipped:true,reason:result.reason,triangleCount:result.triangleCount,estimatedBytes:result.estimatedBytes,availableBytes:result.availableBytes});
        state.counters.capacitySkips++;
        warn("コライダー登録を保留しました（近距離モデル優先・メモリ保護）",{label:result.label,triangles:result.triangleCount,neededBytes:result.estimatedBytes,availableBytes:result.availableBytes});
      }
      return result;
    })();
    state.pending.set(model,task);
    try{return await task;}catch(e){state.modelErrors.set(model,{url:urlOverride||state.modelURL.get(model),error:e.message});state.counters.registerFailures++;if(state.modelTileInfo.has(model))state.counters.geoFSTileCollisionFailures++;err(e);throw e;}finally{state.pending.delete(model);}
  }

  // ------------------------- GeoFS aircraft contact integration -------------------------
  function getAircraft(){return G.aircraft?.instance||null;}
  function llaFrame(lla){const origin=C.Cartesian3.fromDegrees(lla[1],lla[0],lla[2],G.api.viewer.scene.globe.ellipsoid);return C.Transforms.eastNorthUpToFixedFrame(origin,G.api.viewer.scene.globe.ellipsoid);}
  function enuPointToEcef(frame,p){return C.Matrix4.multiplyByPoint(frame,new C.Cartesian3(p[0],p[1],p[2]),new C.Cartesian3());}
  function ecefToRelative(p,origin){return [p.x-origin[0],p.y-origin[1],p.z-origin[2]];}
  function ecefDirectionToEnu(frame,dir){const inv=C.Matrix4.inverseTransformation(frame,new C.Matrix4());const out=C.Matrix4.multiplyByPointAsVector(inv,new C.Cartesian3(...dir),new C.Cartesian3());return V.norm([out.x,out.y,out.z]);}
  function moveAircraftEnu(aircraft,delta){const d=G.api.xyz2lla(delta,aircraft.llaLocation);aircraft.llaLocation=[aircraft.llaLocation[0]+d[0],aircraft.llaLocation[1]+d[1],aircraft.llaLocation[2]+d[2]];aircraft.object3d.compute(aircraft.llaLocation);}
  function capturePointPositions(aircraft){
    const lla=aircraft.llaLocation.slice(),frame=llaFrame(lla),points=aircraft.collisionPoints||[];
    const standard=points.map((cp,index)=>{
      const p=cp?.worldPosition;
      if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))throw Error(`GeoFS collision point ${index} has an invalid worldPosition`);
      return {cp,index,local:p.slice(),ecef:enuPointToEcef(frame,p)};
    });
    const extra=state.customPoints.get(aircraft)||[];
    const root=aircraft.object3d||{};
    for(let i=0;i<extra.length;i++){
      const cp=extra[i],v=cp.localPosition;
      // Match GeoFS Object3D.setVectorWorldPosition: rotate, add root offset,
      // then apply root world scale. M33 is stored as three row arrays.
      const r=root.worldRotation||[[1,0,0],[0,1,0],[0,0,1]],p=root.worldPosition||[0,0,0],sc=root.worldScale||[1,1,1];
      if(!Array.isArray(r)||r.length!==3||!r.every(row=>Array.isArray(row)&&row.length===3&&row.every(Number.isFinite))||!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)||!Array.isArray(sc)||sc.length!==3||!sc.every(Number.isFinite))throw Error("Aircraft Object3D root transform is invalid for custom collision point");
      const rotated=[r[0][0]*v[0]+r[0][1]*v[1]+r[0][2]*v[2],r[1][0]*v[0]+r[1][1]*v[1]+r[1][2]*v[2],r[2][0]*v[0]+r[2][1]*v[1]+r[2][2]*v[2]];
      const world=V.add(p,rotated);const position=[world[0]*sc[0],world[1]*sc[1],world[2]*sc[2]];
      const proxy={id:cp.id,name:cp.name,worldPosition:position,radius:cp.radius,wrongAltitude:false,addon:true};
      standard.push({cp:proxy,index:points.length+i,local:position.slice(),ecef:enuPointToEcef(frame,position)});
    }
    return {lla,frame,root:enuPointToEcef(frame,[0,0,0]),points:standard};
  }
  function colliderMatrixCheck(col){
    if(!col.model)return true;
    try{const now=modelMatrixFor(col.model);for(let i=0;i<16;i++){const tol=i===12||i===13||i===14?0.002:1e-8;if(Math.abs(now[i]-col.matrix[i])>tol){col.enabled=false;col.lastError="modelMatrix changed after registration; moving colliders are intentionally disabled in 0.6.1";warn(col.label,col.lastError);return false;}}return true;}catch(e){col.enabled=false;col.lastError=e.message;return false;}
  }
  function queryAll(p0Ecef,p1Ecef,radius){
    let earliest=null;
    for(const col of state.colliders){if(!col.enabled||!colliderMatrixCheck(col))continue;
      const p0=ecefToRelative(p0Ecef,col.origin),p1=ecefToRelative(p1Ecef,col.origin);
      const mid=V.mul(V.add(p0,p1),.5),dist=V.len(mid);if(dist>col.radius+V.len(V.sub(p1,p0))*.5+radius+2)continue;
      const hit=sweepCollider(col,p0,p1,radius);state.counters.bvhCandidates+=hit.candidateCount;
      if(hit.overflow){state.counters.bvhOverflows++;col.lastError=hit.reason||"BVH candidate overflow";continue;}
      if(hit.hit&&(!earliest||hit.hit.t<earliest.hit.t))earliest={collider:col,hit:hit.hit};
    }
    return earliest;
  }
  function queryClosestContact(pointEcef,searchRadius){
    let best=null;
    for(const col of state.colliders){
      if(!col.enabled||!colliderMatrixCheck(col))continue;
      const rel=ecefToRelative(pointEcef,col.origin);
      if(V.len(rel)>col.radius+searchRadius+2)continue;
      const result=closestOnMesh(col,rel,searchRadius);
      state.counters.bvhCandidates+=result.candidates||0;
      if(result.overflow){state.counters.bvhOverflows++;col.lastError="BVH candidate cap exceeded during contact query";continue;}
      if(result.hit&&(!best||result.hit.distance<best.hit.distance))best={collider:col,hit:result.hit,relative:rel};
    }
    return best;
  }
  function resolveContactMaterial(cp,normalEnu){
    // GeoFS uses ENU/world-up as +Z for rigid-body contact vectors. A contact
    // normal with a strong +Z component supports the aircraft from below (runway,
    // roof, deck, terrain); vertical faces retain wall restitution.
    const support = normalEnu[2] >= state.settings.supportNormalZ;
    const props = cp?.contactProperties || {};
    const propNumber = (key, fallback, min=0, max=2) => {
      const v=Number(props[key]);
      return Number.isFinite(v)&&v>=min&&v<=max?v:fallback;
    };
    return {
      type: support ? "support" : "wall",
      restitution: support
        ? state.settings.supportRestitution
        : state.settings.restitution,
      friction: propNumber("frictionCoef", support?state.settings.supportFriction:state.settings.friction),
      dynamicFriction: Math.min(
        propNumber("dynamicFriction", support?state.settings.supportDynamicFriction:state.settings.dynamicFriction),
        propNumber("frictionCoef", support?state.settings.supportFriction:state.settings.friction)
      )
    };
  }
  function applyContact(aircraft,cp,collider,pointEcef,normalEcef,penetration,frame){
    const rb=aircraft.rigidBody;
    if(!rb||typeof rb.applyImpulse!=="function"||typeof rb.computeJacobian!=="function")return null;
    const n=ecefDirectionToEnu(frame,normalEcef);if(V.len2(n)<.5)return null;
    const material=resolveContactMaterial(cp,n);
    const arm=(cp.worldPosition||[0,0,0]).slice();
    let vel;
    try{vel=rb.getVelocityInLocalPoint(arm);}catch(_){vel=rb.v_linearVelocity||[0,0,0];}
    const vn=V.dot(vel,n);
    let normalJ=0;
    // Use zero restitution on upward-facing support surfaces, matching GeoFS'
    // native standard-ground response. Keep wall bounce configurable.
    if(vn<-.02){
      const e=material.type==="support"?material.restitution:(Math.abs(vn)>0.35?material.restitution:0);
      const j=rb.computeJacobian(e,vn,arm,n);
      if(Number.isFinite(j)){
        normalJ=Math.max(0,j);
        if(normalJ>0){rb.applyImpulse(V.mul(n,normalJ),arm);state.counters.impulses++;}
      }
    }
    // Coulomb friction: first calculate the impulse needed to cancel the
    // tangential point velocity. Use static friction when it can hold; otherwise
    // cap at the dynamic-friction cone. This avoids treating every landing as
    // a perfectly elastic impact while still allowing runway/deck sliding.
    let tangent=V.sub(vel,V.mul(n,vn));
    const tangentSpeed=V.len(tangent);
    let tangentImpulse=0;
    if(normalJ>0&&tangentSpeed>0.015){
      const dir=V.mul(tangent,1/tangentSpeed);
      const requiredJ=rb.computeJacobian(0,tangentSpeed,arm,dir);
      if(Number.isFinite(requiredJ)){
        const required=Math.abs(requiredJ);
        const staticLimit=normalJ*material.friction;
        const dynamicLimit=normalJ*material.dynamicFriction;
        const applied=required<=staticLimit?required:dynamicLimit;
        if(applied>1e-8){
          const impulse=V.mul(dir,-applied);
          rb.applyImpulse(impulse,arm);
          tangentImpulse=applied;
          state.counters.impulses++;
        }
      }
    }
    const slop=state.settings.penetrationSlop;
    const correction=penetration>slop?Math.min(LIMIT.maxCorrection,Math.max(0,penetration-slop)*state.settings.correctionPercent):0;
    state.counters.contacts++;
    state.lastContact={
      collider:collider?.label||null,
      surface:material.type,
      penetration:Number(penetration.toFixed(4)),
      normalEnu:n.map(v=>Number(v.toFixed(4))),
      pointVelocityNormal:Number(vn.toFixed(4)),
      tangentSpeed:Number(tangentSpeed.toFixed(4)),
      normalImpulse:Number(normalJ.toFixed(4)),
      tangentImpulse:Number(tangentImpulse.toFixed(4)),
      motion:vn<-.02?"approaching":vn>.02?"separating":"stationary",
      restitution:material.type==="support"?material.restitution:(Math.abs(vn)>0.35?material.restitution:0),
      friction:material.friction,
      dynamicFriction:material.dynamicFriction,
      time:Date.now()
    };
    return correction>.002?V.mul(n,correction):[0,0,0];
  }
  function processPhysicsStep(aircraft,rb,dt,start,end){
    if(!state.colliders.length||!start?.points?.length||!end?.points?.length)return;
    state.counters.physicsSteps++;
    // Expire normals after a short gap. While contact persists, this keeps the
    // same face side and prevents a zero-distance closest-point query from
    // randomly selecting the opposite winding/side on the next substep.
    const now=Date.now();
    for(const [key,value] of state.contactNormals){if(now-value.time>350)state.contactNormals.delete(key);}
    let earliest=null;
    for(const p of start.points){
      const q=end.points[p.index];if(!q||p.cp.wrongAltitude)continue;
      state.counters.pointsTested++;
      const pointRadius=Number.isFinite(Number(p.cp.radius))&&Number(p.cp.radius)>0?Number(p.cp.radius):state.settings.pointRadius;
      const h=queryAll(p.ecef,q.ecef,pointRadius);
      if(h&&(!earliest||h.hit.t<earliest.hit.t))earliest={...h,index:p.index,old:p,now:q};
    }
    if(earliest){
      state.counters.sweepHits++;
      const t=Math.max(0,Math.min(1,earliest.hit.t));
      const root0=start.root,root1=end.root;
      const root=[root0.x+(root1.x-root0.x)*t,root0.y+(root1.y-root0.y)*t,root0.z+(root1.z-root0.z)*t];
      // Small outward skin avoids a numerical zero-depth re-contact at the
      // same surface on the next 60 Hz step. The swept normal is ECEF-aligned.
      const skin=0.008, n=earliest.hit.normal;
      root[0]+=n[0]*skin;root[1]+=n[1]*skin;root[2]+=n[2]*skin;
      const cart=C.Cartographic.fromCartesian(new C.Cartesian3(...root));
      if(cart){aircraft.llaLocation=[C.Math.toDegrees(cart.latitude),C.Math.toDegrees(cart.longitude),cart.height];aircraft.object3d.compute(aircraft.llaLocation);}
      state.contactNormals.set(`${earliest.index}|${earliest.collider.id}`,{normal:n.slice(),time:now,colliderId:earliest.collider.id});
    }
    let current=capturePointPositions(aircraft),contacts=0,correctionBudget=LIMIT.maxCorrection;
    for(let iteration=0;iteration<LIMIT.maxSolverIterations;iteration++){
      let corrected=false;
      for(let pointIndex=0;pointIndex<current.points.length;pointIndex++){
        if(contacts>=LIMIT.contactsPerStep||correctionBudget<=0)break;
        const p=current.points[pointIndex];if(!p||p.cp.wrongAltitude)continue;
        const radius=Number.isFinite(Number(p.cp.radius))&&Number(p.cp.radius)>0?Number(p.cp.radius):state.settings.pointRadius;
        const near=queryClosestContact(p.ecef,radius+0.03);if(!near)continue;
        const col=near.collider,closest={hit:near.hit};
        // Keep a small tolerance around the TOI skin, but do not treat every
        // nearby triangle as a contact once the probe has clearly separated.
        if(closest.hit.distance>radius+0.012)continue;
        const q=closest.hit.point,worldPoint=[col.origin[0]+q[0],col.origin[1]+q[1],col.origin[2]+q[2]];
        const realPenetration=Math.max(0,radius-closest.hit.distance);
        const key=`${p.index}|${col.id}`,cached=state.contactNormals.get(key);
        let stableNormal=closest.hit.normal.slice();
        if(earliest&&earliest.index===p.index&&earliest.collider===col){
          // The exact time-of-impact normal is authoritative for the first response.
          stableNormal=earliest.hit.normal.slice();
        }else if(closest.hit.normalFallback){
          // At the exact triangle plane the radial normal is undefined. Prefer
          // the last contact side; only for a first-ever ambiguous contact use
          // the current point velocity to choose the approaching side.
          if(cached&&cached.colliderId===col.id&&now-cached.time<=350){
            stableNormal=cached.normal.slice();
          }else{
            const arm=(p.cp.worldPosition||[0,0,0]).slice();let vel;
            try{vel=rb.getVelocityInLocalPoint(arm);}catch(_){vel=rb.v_linearVelocity||[0,0,0];}
            if(V.dot(vel,stableNormal)>0)stableNormal=V.mul(stableNormal,-1);
          }
        }
        state.contactNormals.set(key,{normal:stableNormal.slice(),time:now,colliderId:col.id});
        const correction=applyContact(aircraft,p.cp,col,worldPoint,stableNormal,realPenetration,current.frame);
        if(!correction)continue;
        contacts++;
        const correctionLength=V.len(correction);
        if(correctionLength>1e-4){
          const applied=Math.min(correctionLength,correctionBudget);
          moveAircraftEnu(aircraft,V.mul(correction,applied/correctionLength));
          correctionBudget-=applied;state.counters.positionCorrections++;corrected=true;
          current=capturePointPositions(aircraft);
        }
      }
      if(!corrected)break;
    }
  }
  function installPhysicsHook(){
    const aircraft=getAircraft(),rb=aircraft?.rigidBody;if(!aircraft||!rb||typeof rb.integrateTransform!=="function")return false;
    if(state.rb===rb&&rb.integrateTransform===state.rbWrapped)return true;
    if(state.rb===rb&&rb.integrateTransform!==state.rbWrapped){warn("integrateTransform hook was replaced by another script; not overwriting it");return false;}
    if(state.rb&&state.rb.integrateTransform===state.rbWrapped)state.rb.integrateTransform=state.rbOriginal;
    const original=rb.integrateTransform;
    const wrapped=function(dt){
      const probeCount=(aircraft.collisionPoints?.length||0)+(state.customPoints.get(aircraft)?.length||0);
      if(state.destroyed||!state.colliders.length||probeCount===0||!G.aircraft?.instance||G.aircraft.instance!==aircraft)return original.apply(this,arguments);
      let start=null;
      try{aircraft.object3d.compute(aircraft.llaLocation);start=capturePointPositions(aircraft);}catch(e){warn("collision start snapshot failed",e);}
      const ret=original.apply(this,arguments);
      if(start){
        try{aircraft.object3d.compute(aircraft.llaLocation);const end=capturePointPositions(aircraft);processPhysicsStep(aircraft,this,Number(dt)||0,start,end);}catch(e){err(e);}
      }
      return ret;
    };
    rb.integrateTransform=wrapped;state.rb=rb;state.rbOriginal=original;state.rbWrapped=wrapped;state.aircraft=aircraft;
    const cpCount=(aircraft.collisionPoints?.length||0)+(state.customPoints.get(aircraft)?.length||0);
    if(!cpCount)warn("この機体に衝突点がありません。addAircraftPoint()で胴体・翼端などの点を追加してください。");
    log("GeoFS rigid-body substep hook attached",{collisionPoints:cpCount});return true;
  }

  // ------------------------- model tracking and scan -------------------------
  function urlUnderBase(url,base){
    if(!url||!base)return false;
    const u=String(url).split(/[?#]/)[0],b=String(base).split(/[?#]/)[0].replace(/\/+$/ ,"");
    return u===b||u.startsWith(b+"/");
  }
  function modelSourceKind(url){
    const building=absURL(G.buildingServer),trees=absURL(G.treeServer);
    if(urlUnderBase(url,building))return "GeoFS building tile";
    if(urlUnderBase(url,trees))return "GeoFS tree tile";
    return "Cesium model";
  }
  function trackModel(model,url,via="model-load",kindHint=null){
    if(!isCollisionModel(model)||state.destroyedModels.has(model))return;
    // GeoFS stores player aircraft models separately; never collide aircraft
    // visuals as static scenery, even when they use ModelExperimental.
    const active=G.aircraft?.instance;
    if(active?.models?.some?.(entry=>entry===model||entry?._model===model))return;
    const source=absURL(url)||absURL(model._resource)||absURL(model._url);
    if(source){state.modelURL.set(model,source);rememberURL(source,via);}
    const kind=kindHint||modelSourceKind(source);
    const previous=state.modelKind.get(model);
    state.modelKind.set(model,kind);
    if(!state.models.has(model)){
      if(state.models.size>=LIMIT.models){warn("model tracking limit reached",{limit:LIMIT.models,url:source});return;}
      state.models.add(model);state.counters.modelsSeen++;
      if(isExperimentalModel(model))state.counters.experimentalModelsSeen++;
      if(kind.startsWith("GeoFS"))log("GeoFS scenery tile detected",{kind,url:source,via,ready:!!model.ready});
      else if(isExperimentalModel(model))log("Cesium ModelExperimental detected",{url:source,via,ready:!!model.ready});
    }
    // Classification can arrive after the Cesium.fromGltf hook (generic model
    // classification). Count it exactly once when the GeoFS provider registry
    // later supplies the authoritative building/tree kind.
    if(!state.modelKindCounted.has(model)){
      if(kind==="GeoFS building tile"){state.counters.geoFSBuildingModelsSeen++;state.modelKindCounted.add(model);}
      else if(kind==="GeoFS tree tile"){state.counters.geoFSTreeModelsSeen++;state.modelKindCounted.add(model);}
    } else if(previous!==kind&&previous?.startsWith("GeoFS")&&kind.startsWith("GeoFS")){
      // Keep the historical counters stable; diagnostics show the current kind.
    }
  }
  function providerKind(provider){
    if(!provider)return null;
    if(provider===G.buildings?.simple3DTileProvider||urlUnderBase(absURL(provider.options?.url),absURL(G.buildingServer)))return "building";
    if(provider===G.trees?.simple3DTileProvider||urlUnderBase(absURL(provider.options?.url),absURL(G.treeServer)))return "tree";
    return null;
  }
  function providerTileURL(provider,tile){
    const base=String(provider?.options?.url||"");
    const ext=provider?.options?.extension||".glb";
    return absURL(base+String(tile?.id||"")+ext);
  }
  function observeGeoTileWrapper(provider,tile,kind,via="GeoFS tile provider"){
    const wrapper=tile?.model||tile?.content?.model;
    if(!wrapper||typeof wrapper!=="object")return false;
    const url=providerTileURL(provider,tile);
    if(state.observedGeoWrappers.has(wrapper)){
      const model=wrapper._model;
      if(isCollisionModel(model)){
        state.modelTileInfo.set(model,{kind,id:tile.id,url,provider});
        trackModel(model,url,via,kind==="building"?"GeoFS building tile":"GeoFS tree tile");
      }
      return true;
    }
    state.observedGeoWrappers.add(wrapper);
    const record={kind,id:tile.id,url,provider,wrapper,startedAt:Date.now()};
    if(wrapper._model&&isCollisionModel(wrapper._model)){
      state.modelTileInfo.set(wrapper._model,record);
      trackModel(wrapper._model,url,via,kind==="building"?"GeoFS building tile":"GeoFS tree tile");
    }
    const ready=wrapper.readyPromise||wrapper.loadedPromise;
    if(ready&&typeof ready.then==="function"){
      Promise.resolve(ready).then(()=>{
        const model=wrapper._model;
        if(!isCollisionModel(model))throw Error("GeoFS tile wrapper promise resolved without a Cesium ModelExperimental");
        state.counters.geoFSTileReady++;
        state.modelTileInfo.set(model,record);
        trackModel(model,url,via,kind==="building"?"GeoFS building tile":"GeoFS tree tile");
        updateSpatialStreaming(false).catch(e=>err(e));
      }).catch(e=>{
        state.counters.geoFSTileLoadFailures++;
        state.lastError=`GeoFS ${kind} tile ${tile?.id||"?"}: ${e.message||e}`;
        warn("GeoFS scenery tile wrapper did not become ready",{kind,id:tile?.id,url,error:e.message||String(e)});
      });
    } else if(!wrapper._model){
      state.counters.geoFSTileLoadFailures++;
      warn("GeoFS tile wrapper has neither _model nor readiness promise",{kind,id:tile?.id,url});
    }
    return true;
  }
  function scanGeoFSTileProvider(provider,kind){
    const tiles=provider?.tiles;if(!tiles||typeof tiles!=="object")return 0;
    let count=0;
    for(const tile of Object.values(tiles)){
      if(observeGeoTileWrapper(provider,tile,kind,`GeoFS ${kind} tile registry`))count++;
    }
    return count;
  }
  function scanGeoFSTileRegistries(){
    return {buildings:scanGeoFSTileProvider(G.buildings?.simple3DTileProvider,"building"),trees:scanGeoFSTileProvider(G.trees?.simple3DTileProvider,"tree")};
  }
  function geoFSTileProviderStats(includeSamples=false){
    const detail=(provider,kind)=>{
      const tiles=provider?.tiles&&typeof provider.tiles==="object"?Object.entries(provider.tiles):[];
      let wrappers=0,models=0,ready=0,tracked=0,registered=0,deferred=0,failed=0;
      const samples=[];
      for(const [id,tile] of tiles){
        const w=tile?.model||tile?.content?.model;if(!w)continue;wrappers++;
        const m=w._model;if(!isCollisionModel(m))continue;models++;
        if(m.ready)ready++;if(state.models.has(m))tracked++;if(state.registered.has(m))registered++;if(state.deferredModels.has(m))deferred++;if(state.modelErrors.has(m))failed++;
        if(includeSamples&&samples.length<24){const url=state.modelURL.get(m)||providerTileURL(provider,tile);samples.push({id,ready:!!m.ready,tracked:state.models.has(m),registered:state.registered.has(m),deferred:state.deferredModels.has(m),distance:modelDistanceFromPlayer(m),error:state.modelErrors.get(m)||null,url});}
      }
      const out={active:!!provider,tiles:tiles.length,wrappers,models,ready,tracked,registered,deferred,failed};if(includeSamples)out.samples=samples;return out;
    };
    return {buildings:detail(G.buildings?.simple3DTileProvider,"building"),trees:detail(G.trees?.simple3DTileProvider,"tree"),providerHooks:{load:!!state.tileLoadWrapped,unload:!!state.tileUnloadWrapped}};
  }
  // Hook GeoFS's own tile lifecycle, not only Cesium's model factory. This
  // captures each tile ID and full URL at creation time, observes its GeoFS
  // wrapper readyPromise, and lets unloadTile destroy the matching collider.
  if(G.simple3DTileProvider?.prototype?.loadTile&&G.simple3DTileProvider?.prototype?.unloadTile){
    const proto=G.simple3DTileProvider.prototype;
    state.tileLoadWrapped=function(tile){
      const kind=providerKind(this);
      const result=state.tileLoadOriginal.apply(this,arguments);
      if(kind){state.counters.geoFSTileLoads++;observeGeoTileWrapper(this,tile,kind,`GeoFS ${kind} loadTile hook`);}
      return result;
    };
    state.tileUnloadWrapped=function(id){
      const kind=providerKind(this),tile=this?.tiles?.[id],wrapper=tile?.model||tile?.content?.model,model=wrapper?._model;
      if(kind){state.counters.geoFSTileUnloads++;if(model&&isCollisionModel(model)){const collider=state.registered.get(model);if(collider)releaseCollider(collider,"model-destroyed");state.destroyedModels.add(model);state.models.delete(model);state.deferredModels.delete(model);state.modelErrors.delete(model);}}
      return state.tileUnloadOriginal.apply(this,arguments);
    };
    try{proto.loadTile=state.tileLoadWrapped;proto.unloadTile=state.tileUnloadWrapped;}catch(e){warn("GeoFS simple3DTileProvider lifecycle hook failed",e);state.tileLoadWrapped=null;state.tileUnloadWrapped=null;}
  } else warn("GeoFS simple3DTileProvider loadTile/unloadTile methods are unavailable; registry polling remains active");
  if(C.Model?.fromGltf){state.modelFromGltfWrapped=function(options){const src=sourceFromModelOptions(options);const m=state.modelFromGltfOriginal.apply(this,arguments);if(m&&typeof m.then==="function")return m.then(x=>{trackModel(x,src,"Cesium.Model.fromGltf");return x;});trackModel(m,src,"Cesium.Model.fromGltf");return m;};try{C.Model.fromGltf=state.modelFromGltfWrapped;}catch(e){warn("Cesium.Model.fromGltf hook failed",e);}}
  if(C.ModelExperimental?.fromGltf){state.modelExperimentalFromGltfWrapped=function(options){const src=sourceFromModelOptions(options);const m=state.modelExperimentalFromGltfOriginal.apply(this,arguments);if(m&&typeof m.then==="function")return m.then(x=>{trackModel(x,src,"Cesium.ModelExperimental.fromGltf");return x;});trackModel(m,src,"Cesium.ModelExperimental.fromGltf");return m;};try{C.ModelExperimental.fromGltf=state.modelExperimentalFromGltfWrapped;}catch(e){warn("Cesium.ModelExperimental.fromGltf hook failed",e);}}
  if(typeof state.fetchOriginal==="function"){
    state.fetchWrapped=async function(input,init){const u=absURL(input instanceof Request?input.url:input);const r=await state.fetchOriginal.apply(this,arguments);const mime=r.headers?.get?.("content-type")||"";if(u&&maybeAsset(u,mime)){rememberURL(u,"fetch",mime);if(r.ok&&r.status!==206){try{const clone=r.clone();boundedCapture(u,readLimited(clone,LIMIT.blobBytes,"fetch capture"),"fetch").catch(()=>{});}catch(_){}}}return r;};W.fetch=state.fetchWrapped;
  }
  if(W.XMLHttpRequest?.prototype){const p=W.XMLHttpRequest.prototype;state.xhrOpenOriginal=p.open;state.xhrSendOriginal=p.send;state.xhrOpenWrapped=function(method,url){this.__gfcpURL=absURL(url);return state.xhrOpenOriginal.apply(this,arguments);};state.xhrSendWrapped=function(){const x=this,u=this.__gfcpURL;if(u)x.addEventListener("load",()=>{try{const mime=x.getResponseHeader("content-type")||"";if(!maybeAsset(u,mime))return;rememberURL(u,"xhr",mime);if(x.status===206||x.status<200||x.status>=300)return;let v=x.response;if(v instanceof Blob)v=v.arrayBuffer();if(typeof v==="string")v=new TextEncoder().encode(v);if(v&&typeof v.then==="function")boundedCapture(u,v,"xhr").catch(()=>{});else if(v instanceof ArrayBuffer||ArrayBuffer.isView(v))boundedCapture(u,Promise.resolve(v),"xhr").catch(()=>{});}catch(e){warn("XHR capture failed",e);}}, {once:true});return state.xhrSendOriginal.apply(this,arguments);};p.open=state.xhrOpenWrapped;p.send=state.xhrSendWrapped;}
  if(state.createObjectURLOriginal){state.createObjectURLWrapped=function(blob){const u=state.createObjectURLOriginal.call(this,blob);if(blob instanceof Blob&&blob.size>0&&blob.size<=LIMIT.blobBytes){const mime=(blob.type||"").split(";")[0].toLowerCase();const p=blob.slice(0,4096).arrayBuffer().then(head=>{const b=new Uint8Array(head);let isJson=false;try{const t=new TextDecoder().decode(b);isJson=/\"asset\"\s*:\s*\{[\s\S]{0,256}?\"version\"\s*:\s*\"2\.0\"/.test(t)&&/\"(buffers|bufferViews|meshes)\"\s*:/.test(t);}catch(_){}const asset=isGLB(b)||isGzip(b)||isJson||mime==="model/gltf+json"||mime==="model/gltf-binary"||mime==="application/gltf+json";if(!asset)throw Error("Not a glTF Blob");return blob.arrayBuffer().then(x=>new Uint8Array(x));});boundedCapture(u,p,"blob").catch(()=>{});rememberURL(u,"blob",mime);}return u;};W.URL.createObjectURL=state.createObjectURLWrapped;}
  if(state.revokeObjectURLOriginal){state.revokeObjectURLWrapped=function(u){return state.revokeObjectURLOriginal.call(this,u);};W.URL.revokeObjectURL=state.revokeObjectURLWrapped;}
  if(G.api.loadModel){state.loadModelWrapped=function(options){const src=sourceFromModelOptions(typeof options==="string"?{url:options}:options);const result=state.loadModelOriginal.apply(this,arguments);if(result&&typeof result.then==="function")return result.then(model=>{if(isCollisionModel(model))trackModel(model,src,"geofs.api.loadModel");return model;});if(isCollisionModel(result))trackModel(result,src,"geofs.api.loadModel");return result;};G.api.loadModel=state.loadModelWrapped;}
  if(G.api.addModelToWorld){state.addModelWrapped=function(model){if(isCollisionModel(model))trackModel(model,state.modelURL.get(model)||model._resource?.url,"geofs.api.addModelToWorld");return state.addModelOriginal.apply(this,arguments);};G.api.addModelToWorld=state.addModelWrapped;}
  if(G.api.Model?.prototype?.destroy){
    state.geoModelDestroyWrapped=function(){
      const model=this?._model;
      if(model&&isCollisionModel(model)){
        state.destroyedModels.add(model);
        const collider=state.registered.get(model);if(collider)releaseCollider(collider,"model-destroyed");
        state.models.delete(model);state.deferredModels.delete(model);state.modelErrors.delete(model);state.modelKind.delete(model);
      }
      return state.geoModelDestroyOriginal.apply(this,arguments);
    };
    try{G.api.Model.prototype.destroy=state.geoModelDestroyWrapped;}catch(e){warn("GeoFS Model.destroy hook failed",e);}
  }
  if(C.PrimitiveCollection?.prototype?.add){const p=C.PrimitiveCollection.prototype;state.primitiveAddWrapped=function(item){const r=state.primitiveAddOriginal.apply(this,arguments);if(isCollisionModel(item))trackModel(item,state.modelURL.get(item),"PrimitiveCollection.add");return r;};p.add=state.primitiveAddWrapped;}

  function walkCollection(collection,depth=0,seen=new Set()) {if(!collection||depth>12||seen.has(collection)||typeof collection.length!=="number"||typeof collection.get!=="function")return;seen.add(collection);for(let i=0;i<collection.length;i++){let x;try{x=collection.get(i);}catch(_){continue;}if(isCollisionModel(x))trackModel(x,state.modelURL.get(x)||x._resource?.url||x._url,"existing primitive scan");else if(isCollisionModel(x?._model))trackModel(x._model,state.modelURL.get(x._model)||x._model._resource?.url||x._model._url,"existing GeoFS wrapper scan");else if(x?.get&&typeof x.length==="number")walkCollection(x,depth+1,seen);}}
  function refreshSpatialTargets(force=false){
    const stream=state.streaming,now=Date.now();
    if(!stream.enabled)return {enabled:false,registeredNow:0,unloadedNow:0,queued:0};
    const player=playerWorldPosition();
    if(!player)return {enabled:true,waitingForAircraftPosition:true,registeredNow:0,unloadedNow:0,queued:state.streamQueue.size};
    if(force||now-state.lastRegistryScan>=stream.registryScanIntervalMs){
      scanGeoFSTileRegistries();state.lastRegistryScan=now;
    }
    let unloadedNow=0;
    // Keep per-frame work bounded: release at most N far colliders this frame.
    for(let i=state.colliders.length-1;i>=0&&unloadedNow<stream.maxUnloadsPerFrame;i--){
      const c=state.colliders[i];if(!c.model)continue;
      const d=colliderDistanceFromPlayer(c,player);
      if(Number.isFinite(d)&&beyondUnloadRadius(d)){if(releaseCollider(c,"stream-distance"))unloadedNow++;}
    }
    for(const model of state.models){
      if(state.destroyedModels.has(model)||state.registered.has(model)||state.pending.has(model)){state.streamQueue.delete(model);continue;}
      if(!model.ready)continue;
      if(state.deferredModels.has(model)&&state.deferredEpoch.get(model)===state.memoryEpoch){state.streamQueue.delete(model);continue;}
      const d=modelDistanceFromPlayer(model,player);
      if(withinLoadRadius(d)){
        const prior=state.streamQueue.get(model);
        if(!prior)state.counters.streamingQueueAdds++;
        state.streamQueue.set(model,{distance:d,url:state.modelURL.get(model)||absURL(model._resource?.url)||absURL(model._url)});
      } else state.streamQueue.delete(model);
    }
    stream.queueSize=state.streamQueue.size;stream.lastRun=now;
    const result={enabled:true,playerPosition:player,loadRadius:stream.loadRadius,unloadRadius:stream.unloadRadius,registeredNow:0,unloadedNow,queued:stream.queueSize,processing:stream.busy,modelsSeen:state.models.size,colliders:state.colliders.length};
    stream.lastResult=result;return result;
  }
  function takeNearestQueuedModel(){
    const player=playerWorldPosition();if(!player)return null;let best=null;
    for(const [model,item] of state.streamQueue){
      if(state.destroyedModels.has(model)||!state.models.has(model)||state.registered.has(model)||state.pending.has(model)){state.streamQueue.delete(model);continue;}
      if(!model.ready)continue;
      const distance=modelDistanceFromPlayer(model,player);
      if(!withinLoadRadius(distance)){state.streamQueue.delete(model);continue;}
      item.distance=distance;
      if(!item.url)item.url=state.modelURL.get(model)||absURL(model._resource?.url)||absURL(model._url);
      if(!item.url)continue;
      if(!best||distance<best.distance)best={model,distance,url:item.url};
    }
    if(best)state.streamQueue.delete(best.model);
    return best;
  }
  function kickStreamingWorker(){
    const stream=state.streaming;if(!stream.enabled||stream.busy||state.destroyed)return;
    const candidate=takeNearestQueuedModel();if(!candidate){stream.queueSize=state.streamQueue.size;return;}
    stream.busy=true;stream.queueSize=state.streamQueue.size;
    (async()=>{
      try{
        const result=await registerModel(candidate.model,candidate.url);
        if(result?.skipped){state.modelErrors.set(candidate.model,{...(state.modelErrors.get(candidate.model)||{}),skipped:true,reason:result.reason});}
        stream.lastResult={...(stream.lastResult||{}),lastProcessed:candidate.url,lastRegistrationSkipped:!!result?.skipped,processing:false,queued:state.streamQueue.size};
      }catch(e){
        state.counters.streamingRegisterFailures++;state.modelErrors.set(candidate.model,{url:candidate.url,error:e.message||String(e)});
        warn("近距離モデルのコライダー登録に失敗しました",{url:candidate.url,error:e.message||String(e)});
      }finally{
        stream.busy=false;stream.queueSize=state.streamQueue.size;
      }
    })();
  }
  function tickSpatialStreamingFrame(){
    if(state.destroyed||!state.streaming.enabled)return;
    state.streaming.frameChecks++;state.counters.streamingFrameChecks++;
    try{refreshSpatialTargets(false);kickStreamingWorker();}
    catch(e){warn("frame streaming check failed",e);}
  }
  async function updateSpatialStreaming(force=false){
    const result=refreshSpatialTargets(force);
    kickStreamingWorker();
    return result;
  }
  async function scanExisting(){
    walkCollection(G.api.models);walkCollection(G.api.viewer.scene.primitives);
    const tileRegistries=scanGeoFSTileRegistries();
    const streaming=await updateSpatialStreaming(true);installPhysicsHook();
    return {...streaming,tileRegistries,modelsSeen:state.models.size,colliders:state.colliders.length,queuedForSlicedRegistration:state.streamQueue.size,processing:state.streaming.busy};
  }
  async function auditGeoFSTiles(options={}){
    const maxTiles=Math.max(1,Math.min(128,Number.isInteger(options.maxTiles)?options.maxTiles:32));
    const radius=Number.isFinite(options.radius)?Math.max(100,Math.min(100000,options.radius)):state.streaming.loadRadius;
    const shouldRegister=options.register!==false;
    scanGeoFSTileRegistries();
    const player=playerWorldPosition();
    const all=[];
    for(const [kind,provider] of [["building",G.buildings?.simple3DTileProvider],["tree",G.trees?.simple3DTileProvider]]){
      for(const [id,tile] of Object.entries(provider?.tiles||{})){
        const wrapper=tile?.model||tile?.content?.model,model=wrapper?._model;
        const url=providerTileURL(provider,tile);
        const row={kind,id,url,wrapper:!!wrapper,model:!!model,ready:!!model?.ready,tracked:!!(model&&state.models.has(model)),registered:!!(model&&state.registered.has(model)),deferred:!!(model&&state.deferredModels.has(model)),distance:player&&model?modelDistanceFromPlayer(model,player):null,status:"unknown",_model:model};
        if(!wrapper)row.status="no GeoFS wrapper";
        else if(!model)row.status="GeoFS wrapper has no Cesium model yet";
        else if(!isCollisionModel(model))row.status="unsupported Cesium object type";
        else if(!model.ready)row.status="model loading";
        else if(!row.tracked){
          trackModel(model,url,`GeoFS ${kind} tile audit`,kind==="building"?"GeoFS building tile":"GeoFS tree tile");
          row.tracked=state.models.has(model);
        }
        all.push(row);
      }
    }
    all.sort((a,b)=>(a.distance??Infinity)-(b.distance??Infinity));
    const selected=all.slice(0,maxTiles);
    for(const row of selected){
      const model=row._model;
      if(!model||!row.ready||!row.tracked)continue;
      if(row.registered){row.status="collision registered";continue;}
      if(!player){row.status="aircraft LLA unavailable; streaming cannot compute distance";continue;}
      if(!Number.isFinite(row.distance)){row.status="model bounds / transform unavailable";continue;}
      if(row.distance>radius){row.status=`outside load radius (${Math.round(row.distance)} m > ${Math.round(radius)} m)`;continue;}
      if(!shouldRegister){row.status="ready and in range; registration not requested";continue;}
      try{
        const result=await registerModel(model,row.url);
        if(result?.skipped)row.status="deferred: "+result.reason;
        else if(result){row.registered=state.registered.has(model);row.status=row.registered?"collision registered":"registration returned no collider";row.triangleCount=result.triangleCount||0;}
      }catch(e){row.status="registration error";row.error=e.message;}
    }
    for(const row of selected){
      const model=row._model;delete row._model;
      const modelError=model?state.modelErrors.get(model):null;
      if(modelError){row.error=row.error||modelError.error||modelError.reason||null;row.deferred=state.deferredModels.has(model);row.registered=state.registered.has(model);}
    }
    const summary={at:new Date().toISOString(),tilesScanned:all.length,returned:selected.length,ready:all.filter(x=>x.ready).length,tracked:all.filter(x=>x.tracked).length,registered:all.filter(x=>x.registered).length,failed:selected.filter(x=>x.status==="registration error").length,outOfRange:selected.filter(x=>x.status.startsWith("outside load radius")).length,playerAvailable:!!player,radius,register:shouldRegister,rows:selected};
    state.lastTileAudit=summary;
    return summary;
  }


  // ------------------------- API / tests / teardown -------------------------
  function stats(){const a=getAircraft(),player=playerWorldPosition();return {version:VERSION,geoFSVersion:G.version||"unknown",cesiumVersion:C.VERSION||"unknown",standalone:true,legacyCoreDependency:false,modelsSeen:state.models.size,colliderCount:state.colliders.length,triangleCount:state.triangleCount,geometryBytes:state.geometryBytes,geometryMemoryLimit:LIMIT.geometryBytes,geometryMemoryRemaining:Math.max(0,LIMIT.geometryBytes-state.geometryBytes),deferredModelCount:state.deferredModels.size,streaming:{...state.streaming,busy:undefined,lastResult:state.streaming.lastResult?{...state.streaming.lastResult,playerPosition:undefined}:null,queuedModels:state.streamQueue.size,frameHooked:!!state.frameRemove||state.frameFallbackId!==null},aircraftCollisionPoints:(a?.collisionPoints?.length||0)+(state.customPoints.get(a)?.length||0),customCollisionPoints:state.customPoints.get(a)?.length||0,hooked:state.rb===a?.rigidBody&&state.rb?.integrateTransform===state.rbWrapped,requests:state.urls.size,capturedAssets:state.captured.size,capturedBytes:state.capturedBytes,dracoLoaded:!!state.decoder.dracoPromise,meshoptLoaded:!!state.decoder.meshoptPromise,counters:{...state.counters},modelTypes:{legacy:[...state.models].filter(m=>!isExperimentalModel(m)).length,experimental:[...state.models].filter(m=>isExperimentalModel(m)).length,geoFSBuildingTiles:state.counters.geoFSBuildingModelsSeen,geoFSTreeTiles:state.counters.geoFSTreeModelsSeen},tileProviders:geoFSTileProviderStats(),nativeTileCollision:{attempts:state.counters.geoFSTileCollisionAttempts,registered:state.counters.geoFSTileCollisionRegistered,failures:state.counters.geoFSTileCollisionFailures},lastTileAudit:state.lastTileAudit?{tilesScanned:state.lastTileAudit.tilesScanned,ready:state.lastTileAudit.ready,tracked:state.lastTileAudit.tracked,registered:state.lastTileAudit.registered,failed:state.lastTileAudit.failed}:null,lastError:state.lastError,lastContact:state.lastContact?{...state.lastContact}:null,colliders:state.colliders.map(c=>({id:c.id,label:c.label,triangles:c.triangleCount,bytes:c.bytes,distanceFromAircraft:player?colliderDistanceFromPlayer(c,player):null,compression:c.compression,format:c.format,enabled:c.enabled,error:c.lastError}))};}
  function diagnostics(){const player=playerWorldPosition();return {stats:stats(),urls:[...state.urls.values()],tileProviders:geoFSTileProviderStats(true),lastTileAudit:state.lastTileAudit,models:[...state.models].map((m,i)=>{const asset=state.modelAssetInfo.get(m)||null;const tile=state.modelTileInfo.get(m)||null;return {index:i,type:isExperimentalModel(m)?"ModelExperimental":"Model",kind:state.modelKind.get(m)||modelSourceKind(state.modelURL.get(m)),url:state.modelURL.get(m)||null,ready:!!m.ready,distanceFromAircraft:modelDistanceFromPlayer(m,player),registered:state.registered.has(m),deferred:state.deferredModels.has(m),error:state.modelErrors.get(m)||null,tile:tile?{kind:tile.kind,id:tile.id}:null,asset:asset?{format:asset.format,rtc:!!asset.rtcCenter,rtcCenter:asset.rtcCenter,extensionsUsed:asset.extensionsUsed,extensionsRequired:asset.extensionsRequired,draco:asset.draco,meshopt:asset.meshopt,featureMetadata:asset.featureMetadata,requiredExtensionPolicy:asset.requiredExtensionPolicy||null,requiredExtensionError:asset.requiredExtensionError||null}:null};}),limitations:["GeoFS 3.9 simple3DTileProvider building/tree GLBs are explicitly tracked and parsed as static collision meshes","CESIUM_RTC is supported for ModelExperimental via SceneGraph.computedModelMatrix; manual addCollider/testAsset applies the center translation","Generic Cesium3DTileset B3DM/I3DM/PNTS content, entities, and ModelInstanceCollection remain unsupported","No skin/animation/morph/instancing","Dynamic collider velocity not implemented","TOI clipping uses translated root path; exact rotational CCD and post-TOI remainder integration are not implemented","Closed-mesh inside/outside classification is not implemented","Draco/Meshopt require pinned external decoder runtime and CORS" ]};}
  async function selfTest(){
    const p=closestPointTriangle([.2,.2,1],[0,0,0],[1,0,0],[0,1,0]);
    const h=sweepSphereTriangle([.2,.2,2],[.2,.2,-2],.5,[0,0,0],[1,0,0],[0,1,0]);
    // Regression: a probe already overlapping the face but moving outward
    // must not be reclassified as an inward impact. Penetration is handled by
    // the separate positional contact solver.
    const overlapSeparating=sweepSphereTriangle([.2,.2,.4],[.2,.2,.6],.5,[0,0,0],[1,0,0],[0,1,0]);
    const overlapApproaching=sweepSphereTriangle([.2,.2,.4],[.2,.2,.2],.5,[0,0,0],[1,0,0],[0,1,0]);
    const overlapStationary=sweepSphereTriangle([.2,.2,.4],[.2,.2,.4],.5,[0,0,0],[1,0,0],[0,1,0]);
    const v=new Float64Array([0,0,0, 1,0,0, 0,1,0, 10,0,0, 11,0,0, 10,1,0]);const b=buildBVH(v);const cand=queryCandidates(b,[.1,.1,-.1],[.3,.3,.1]);
    const cooperativeVerts=new Float32Array(5000*9);
    for(let i=0;i<5000;i++){const x=i%100,y=Math.floor(i/100),k=i*9;cooperativeVerts.set([x,y,0,x+0.8,y,0,x,y+0.8,0],k);}
    const cooperativeBefore=state.counters.streamingSliceYields,cooperativeSync=buildBVH(cooperativeVerts),cooperativeAsync=await buildBVHCooperative(cooperativeVerts);
    const cooperativeBVHMatchesSync=cooperativeAsync.refs.length===cooperativeSync.refs.length&&cooperativeAsync.nodeCount===cooperativeSync.nodeCount&&cooperativeAsync.refs.every((x,i)=>x===cooperativeSync.refs[i])&&cooperativeAsync.bounds.every((x,i)=>x===cooperativeSync.bounds[i]);
    const cooperativeBVHYielded=state.counters.streamingSliceYields>cooperativeBefore;
    const f32=new Float32Array([0,0,0, 1,0,0, 0,1,0]);const u16=new Uint16Array([0,1,2]);const bin=new Uint8Array(42);bin.set(new Uint8Array(f32.buffer),0);bin.set(new Uint8Array(u16.buffer),36);
    const doc={json:{asset:{version:"2.0"},buffers:[{byteLength:42}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:6}],accessors:[{bufferView:0,componentType:5126,count:3,type:"VEC3",min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5123,count:3,type:"SCALAR",min:[0],max:[2]}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1,mode:4}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0},buffers:[bin],baseURL:"selftest:"};
    let geometryCount=0;try{geometryCount=(await buildTriangles(doc,M.identity(),1)).triangleCount;}catch(e){geometryCount=-1;}
    const sparseDoc={json:{accessors:[{componentType:5126,count:3,type:"VEC3",sparse:{count:1,indices:{bufferView:0,componentType:5121},values:{bufferView:1}}}],bufferViews:[{byteLength:1},{byteLength:12}]},buffers:[]};
    const sparseViews=[new Uint8Array([1]),new Uint8Array(new Float32Array([4,5,6]).buffer)];
    const sparse=readAccessor(sparseDoc,sparseViews,0).data;
    const jsonText=JSON.stringify({asset:{version:"2.0"}}),jsonBytes=new TextEncoder().encode(jsonText),jsonLen=(jsonBytes.length+3)&~3,glb=new Uint8Array(12+8+jsonLen),gdv=new DataView(glb.buffer);
    gdv.setUint32(0,0x46546c67,true);gdv.setUint32(4,2,true);gdv.setUint32(8,glb.length,true);gdv.setUint32(12,jsonLen,true);gdv.setUint32(16,0x4e4f534a,true);glb.set(jsonBytes,20);for(let i=20+jsonBytes.length;i<20+jsonLen;i++)glb[i]=0x20;
    let glbParsed=false;try{glbParsed=parseGLB(glb).json.asset.version==="2.0";}catch(_){}
    const legacyJson=JSON.stringify({asset:{version:"1.0"},meshes:{},buffers:{binary_glTF:{byteLength:0}}});
    const legacyJsonBytes=new TextEncoder().encode(legacyJson),legacyLen=(legacyJsonBytes.length+3)&~3;
    const legacyGlb=new Uint8Array(20+legacyLen+4),legacyDV=new DataView(legacyGlb.buffer);
    legacyDV.setUint32(0,0x46546c67,true);legacyDV.setUint32(4,1,true);legacyDV.setUint32(8,legacyGlb.length,true);legacyDV.setUint32(12,legacyLen,true);legacyDV.setUint32(16,0,true);legacyGlb.set(legacyJsonBytes,20);for(let i=20+legacyJsonBytes.length;i<20+legacyLen;i++)legacyGlb[i]=0x20;
    let legacyParsed=false;try{legacyParsed=parseGLB1Header(legacyGlb).json.asset.version==="1.0";}catch(_){}
    const legacyInternalJson={asset:{version:"2.0"},buffers:[{byteLength:42,extras:{_pipeline:{source:bin}}}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:6}],accessors:[{bufferView:0,componentType:5126,count:3,type:"VEC3",min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5123,count:3,type:"SCALAR",min:[0],max:[2]}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1,mode:4}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
    let legacyModelDocTriangles=0;try{const migrated=documentFromCesiumModel({gltfInternal:legacyInternalJson},"selftest:legacy.glb","GLB 1.0",false);legacyModelDocTriangles=(await buildTriangles(migrated,M.identity(),1)).triangleCount;}catch(e){legacyModelDocTriangles=-1;}
    const supportMaterial=resolveContactMaterial(null,[0,0,1]);
    const rampMaterial=resolveContactMaterial(null,[0.3,0,0.953939]);
    const wallMaterial=resolveContactMaterial(null,[1,0,0]);
    let experimentalRecognition=false,experimentalMatrix=false,experimentalSphereFallback=false,buildingSourceRecognition=false;
    if(typeof C.ModelExperimental==="function"){
      try{
        const fake=Object.create(C.ModelExperimental.prototype);
        fake.modelMatrix=new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,321,654,987,1]);
        fake.readyPromise=Promise.resolve(fake);
        fake._sceneGraph={computedModelMatrix:fake.modelMatrix};
        fake._boundingSphere={center:{x:0,y:0,z:0},radius:0};
        experimentalRecognition=isExperimentalModel(fake)&&isCollisionModel(fake);
        const fm=modelMatrixFor(fake),fs=modelSpatialSphere(fake);
        experimentalMatrix=fm.length===16&&fm[12]===321&&fm[13]===654&&fm[14]===987;
        experimentalSphereFallback=!!fs&&fs.radius===0&&fs.center[0]===321&&fs.center[1]===654&&fs.center[2]===987;
      }catch(_){}
    }
    buildingSourceRecognition=modelSourceKind(G.buildingServer?new URL("0/selftest.glb",G.buildingServer).href:"https://invalid.example/selftest.glb")==="GeoFS building tile";
    const requiredExtensionAccept=(()=>{try{validateRequiredExtensions({extensionsRequired:["CESIUM_RTC","KHR_draco_mesh_compression","KHR_mesh_quantization","EXT_mesh_features","EXT_structural_metadata"]});return true;}catch(_){return false;}})();
    const requiredExtensionReject=(()=>{try{validateRequiredExtensions({extensionsRequired:["EXT_mesh_gpu_instancing"]});return false;}catch(e){return /EXT_mesh_gpu_instancing/.test(e.message);}})();
    const rtcDoc={json:{extensions:{CESIUM_RTC:{center:[12.5,-4,7.25]}}}};
    let rtcParsed=false,rtcManualMatrix=false,rtcTranslationOrder=false;
    try{const center=rtcCenterFromDocument(rtcDoc),rm=applyRtcToMatrix(M.identity(),center);rtcParsed=center.join(",")==="12.5,-4,7.25";rtcManualMatrix=rm[12]===12.5&&rm[13]===-4&&rm[14]===7.25;const rotated=M.identity();rotated[0]=0;rotated[1]=1;rotated[4]=-1;rotated[5]=0;const rr=applyRtcToMatrix(rotated,center);rtcTranslationOrder=Math.abs(rr[12]-4)<1e-8&&Math.abs(rr[13]-12.5)<1e-8&&Math.abs(rr[14]-7.25)<1e-8;}catch(_){}
    // Exercise the exact memory-release path without retaining a test collider.
    const oldMemory=state.geometryBytes,oldTriangles=state.triangleCount,oldEpoch=state.memoryEpoch;
    const testModel={},testCollider={id:"selftest-stream-release",model:testModel,bytes:64,triangleCount:2};
    state.colliders.push(testCollider);state.geometryBytes+=64;state.triangleCount+=2;state.registered.set(testModel,testCollider);
    const testRelease=releaseCollider(testCollider,"selftest");
    const releaseFreesCapacity=testRelease&&state.geometryBytes===oldMemory&&state.triangleCount===oldTriangles&&!state.registered.has(testModel);
    state.memoryEpoch=oldEpoch;
    const tests={closestPoint:V.len(V.sub(p,[.2,.2,0]))<1e-8,sweptSphere:!!h&&Math.abs(h.t-.375)<.01,overlapSeparatingIgnored:overlapSeparating===null,overlapApproachDetected:!!overlapApproaching&&V.dot(overlapApproaching.normal,[0,0,-.2])<0,stationaryOverlapDeferred:overlapStationary===null,bvh:cand.length===1&&cand[0]===0&&!cand.overflow,triangulateStrip:triIndices([0,1,2,3],5).length===6,triangulateFan:triIndices([0,1,2,3],6).length===6,ownGLTFGeometryParser:geometryCount===1,finiteAABB:b.min.every(Number.isFinite)&&b.max.every(Number.isFinite),sparseAccessor:sparse[3]===4&&sparse[4]===5&&sparse[5]===6,glbHeaderAndJSON:glbParsed,glb1HeaderAndJSON:legacyParsed,gltf1CesiumMigrationGeometry:legacyModelDocTriangles===1,supportHasZeroBounce:supportMaterial.type==="support"&&supportMaterial.restitution===0,rampClassifiedAsSupport:rampMaterial.type==="support",wallKeepsBounce:wallMaterial.type==="wall"&&wallMaterial.restitution===state.settings.restitution,streamLoadRadius:withinLoadRadius(999)&&!withinLoadRadius(1001),streamUnloadHysteresis:!beyondUnloadRadius(1299)&&beyondUnloadRadius(1301),frameStreamingDefaults:state.streaming.loadRadius===1000&&state.streaming.unloadRadius===1300&&!!G.api.viewer.scene.preUpdate,cooperativeBVHMatchesSync,cooperativeBVHYielded,streamReleaseFreesCapacity:releaseFreesCapacity,modelExperimentalRecognition:experimentalRecognition,modelExperimentalEffectiveMatrix:experimentalMatrix,modelExperimentalEmptySphereFallback:experimentalSphereFallback,geoFSBuildingSourceRecognition:buildingSourceRecognition,cesiumRtcExtension:rtcParsed,cesiumRtcManualMatrix:rtcManualMatrix,cesiumRtcMatrixOrder:rtcTranslationOrder,cesiumRtcRequiredExtensionAccepted:requiredExtensionAccept,metadataRequiredExtensionsAccepted:requiredExtensionAccept,unsupportedInstancingExtensionRejected:requiredExtensionReject,providerLoadHook:!!state.tileLoadWrapped,providerUnloadHook:!!state.tileUnloadWrapped};
    return {ok:Object.values(tests).every(Boolean),tests,details:{sweepT:h?.t,overlapSeparatingDetected:overlapSeparating===null,overlapApproachT:overlapApproaching?.t,candidates:cand.length,geometryCount,legacyGlbHeader:legacyParsed,legacyModelDocTriangles,supportMaterial,rampMaterial,wallMaterial,experimentalRecognition,experimentalMatrix,experimentalSphereFallback,buildingSourceRecognition,rtcParsed,rtcManualMatrix,rtcTranslationOrder,requiredExtensionAccept,requiredExtensionReject,providerHooks:{load:!!state.tileLoadWrapped,unload:!!state.tileUnloadWrapped},cooperativeBVH:{matchesSync:cooperativeBVHMatchesSync,yielded:cooperativeBVHYielded,triangles:cooperativeVerts.length/9},sparseValue:Array.from(sparse.slice(3,6))},note:"Standalone parser/math/BVH/contact, glTF 1.0 adapter, ModelExperimental, CESIUM_RTC required-extension policy, metadata-extension policy, and GeoFS tile lifecycle checks. External Draco/Meshopt codecs and live GeoFS flight behavior are not tested here."};
  }
  function destroy(){if(state.destroyed)return;state.destroyed=true;if(state.timer)clearInterval(state.timer);if(state.frameRemove)try{state.frameRemove();}catch(_){}if(state.frameFallbackId!==null&&typeof W.cancelAnimationFrame==="function")W.cancelAnimationFrame(state.frameFallbackId);if(state.fetchWrapped&&W.fetch===state.fetchWrapped)W.fetch=state.fetchOriginal;if(W.XMLHttpRequest?.prototype){const p=W.XMLHttpRequest.prototype;if(p.open===state.xhrOpenWrapped)p.open=state.xhrOpenOriginal;if(p.send===state.xhrSendWrapped)p.send=state.xhrSendOriginal;}if(state.createObjectURLWrapped&&W.URL.createObjectURL===state.createObjectURLWrapped)W.URL.createObjectURL=state.createObjectURLOriginal;if(state.revokeObjectURLWrapped&&W.URL.revokeObjectURL===state.revokeObjectURLWrapped)W.URL.revokeObjectURL=state.revokeObjectURLOriginal;if(state.modelFromGltfWrapped&&C.Model?.fromGltf===state.modelFromGltfWrapped)C.Model.fromGltf=state.modelFromGltfOriginal;if(state.modelExperimentalFromGltfWrapped&&C.ModelExperimental?.fromGltf===state.modelExperimentalFromGltfWrapped)C.ModelExperimental.fromGltf=state.modelExperimentalFromGltfOriginal;if(state.geoModelDestroyWrapped&&G.api.Model?.prototype?.destroy===state.geoModelDestroyWrapped)G.api.Model.prototype.destroy=state.geoModelDestroyOriginal;if(state.tileLoadWrapped&&G.simple3DTileProvider?.prototype?.loadTile===state.tileLoadWrapped)G.simple3DTileProvider.prototype.loadTile=state.tileLoadOriginal;if(state.tileUnloadWrapped&&G.simple3DTileProvider?.prototype?.unloadTile===state.tileUnloadWrapped)G.simple3DTileProvider.prototype.unloadTile=state.tileUnloadOriginal;if(state.primitiveAddWrapped&&C.PrimitiveCollection?.prototype?.add===state.primitiveAddWrapped)C.PrimitiveCollection.prototype.add=state.primitiveAddOriginal;if(state.loadModelWrapped&&G.api.loadModel===state.loadModelWrapped)G.api.loadModel=state.loadModelOriginal;if(state.addModelWrapped&&G.api.addModelToWorld===state.addModelWrapped)G.api.addModelToWorld=state.addModelOriginal;if(state.rb&&state.rb.integrateTransform===state.rbWrapped)state.rb.integrateTransform=state.rbOriginal;if(state.ui?.parentNode)state.ui.remove();state.models.clear();state.colliders.length=0;state.deferredModels.clear();state.streamQueue.clear();state.urls.clear();state.captured.clear();state.customPoints.clear();state.contactNormals.clear();state.lastContact=null;state.geometryBytes=0;state.triangleCount=0;if(W.GeoFSGLBPhysics?.destroy===destroy)delete W.GeoFSGLBPhysics;log("監視・コライダー・剛体フックを解除しました");}

  const api={version:VERSION,settings:state.settings,streaming:state.streaming,scanExisting,scanGeoFSTileRegistries,auditGeoFSTiles,updateStreaming:()=>updateSpatialStreaming(true),registerModel,getModels:()=>[...state.models],getDetectedURLs:()=>[...state.urls.keys()],stats,diagnostics,selfTest,destroy,
    setStreamingSettings:(patch={})=>{
      const next={...state.streaming};
      for(const [key,value] of Object.entries(patch)){
        if(key==="enabled"){if(typeof value!=="boolean")throw Error("streaming.enabled must be boolean");next.enabled=value;}
        else if(key==="loadRadius"){if(!Number.isFinite(value)||value<250||value>100000)throw Error("loadRadius must be 250..100000 metres");next.loadRadius=value;}
        else if(key==="unloadRadius"){if(!Number.isFinite(value)||value<300||value>120000)throw Error("unloadRadius must be 300..120000 metres");next.unloadRadius=value;}
        else if(key==="registryScanIntervalMs"){if(!Number.isFinite(value)||value<250||value>10000)throw Error("registryScanIntervalMs must be 250..10000 ms");next.registryScanIntervalMs=value;}
        else if(key==="maxUnloadsPerFrame"){if(!Number.isInteger(value)||value<1||value>16)throw Error("maxUnloadsPerFrame must be an integer 1..16");next.maxUnloadsPerFrame=value;}
        else if(key==="intervalMs"){if(!Number.isFinite(value)||value<0||value>10000)throw Error("intervalMs must be 0..10000 ms");next.registryScanIntervalMs=Math.max(250,value);}
        else throw Error("Unknown streaming setting: "+key);
      }
      if(next.unloadRadius<=next.loadRadius)throw Error("unloadRadius must be greater than loadRadius to prevent flicker");
      Object.assign(state.streaming,next);return {...state.streaming};
    },
    setSettings:(patch={})=>{
      const allowed={pointRadius:[0.05,10],restitution:[0,1],supportRestitution:[0,0.2],supportNormalZ:[0.3,0.95],supportFriction:[0,2],supportDynamicFriction:[0,2],friction:[0,2],dynamicFriction:[0,2],penetrationSlop:[0,0.25],correctionPercent:[0.05,1]};
      for(const [key,value] of Object.entries(patch)){
        if(!Object.prototype.hasOwnProperty.call(allowed,key))throw Error("Unknown setting: "+key);
        const [min,max]=allowed[key];if(!Number.isFinite(value)||value<min||value>max)throw Error(`Invalid setting ${key}: must be ${min}..${max}`);state.settings[key]=value;
      }
      return {...state.settings};
    },
    addAircraftPoint:(x,y,z,radius=state.settings.pointRadius,name="custom")=>{const aircraft=getAircraft();if(!aircraft)throw Error("Active aircraft not found");if(![x,y,z,radius].every(Number.isFinite)||radius<=0||radius>50)throw Error("Invalid local collision point or radius");const list=state.customPoints.get(aircraft)||[];const id=`custom-point-${Date.now()}-${list.length+1}`;list.push({id,name,localPosition:[x,y,z],radius,wrongAltitude:false,addon:true});state.customPoints.set(aircraft,list);return {id,count:list.length};},
    removeAircraftPoint:(id)=>{const aircraft=getAircraft(),list=state.customPoints.get(aircraft)||[],i=list.findIndex(x=>x.id===id);if(i<0)return false;list.splice(i,1);return true;},
    listAircraftPoints:()=>({geoFS:getAircraft()?.collisionPoints?.map((p,i)=>({index:i,position:p.worldPosition,radius:p.radius||state.settings.pointRadius,wrongAltitude:!!p.wrongAltitude}))||[],custom:(state.customPoints.get(getAircraft())||[]).map(p=>({...p,localPosition:p.localPosition.slice()}))}),
    addCollider:async(url,matrix,options={})=>{const source=absURL(url);if(!source)throw Error("addCollider requires a valid absolute URL");if(!matrix)throw Error("addCollider requires a Cesium.Matrix4 model-to-world transform");if(state.colliders.some(c=>!c.model&&c.source===source&&c.enabled))throw Error("同じURLの手動コライダーは既に登録されています");rememberURL(source,"manual-addCollider");const doc=await loadDocument(source,loadedModelForURL(source));const scale=options.scale===undefined?1:Number(options.scale);if(!Number.isFinite(scale)||scale===0)throw Error("options.scale must be finite and non-zero");return buildAndStoreCollider(source,doc,M.fromCesium(matrix),scale,null,options.label||null);},
    removeCollider:(id)=>{const c=state.colliders.find(x=>x.id===id);if(!c)return false;const ok=releaseCollider(c,"manual");for(const m of state.deferredModels)state.modelErrors.delete(m);state.deferredModels.clear();return ok;},
    setColliderEnabled:(id,enabled)=>{const c=state.colliders.find(x=>x.id===id);if(!c)return false;c.enabled=!!enabled;return true;},
    testAsset:async(url,matrix=C.Matrix4.IDENTITY,scale=1)=>{const source=absURL(url);if(!source)throw Error("testAsset requires a valid URL");const doc=await loadDocument(source,loadedModelForURL(source));const built=await buildTriangles(doc,M.fromCesium(matrix),scale);return {ok:built.triangleCount>0,source,triangleCount:built.triangleCount,geometryBytes:built.vertices.byteLength,compression:built.compression,format:doc.sourceFormat||"glTF 2.0"};},
    _debug:{closestPointTriangle,sweepSphereTriangle,buildBVH,buildBVHCooperative,buildBVHOffThread,queryCandidates,triIndices,parseGLB,readAccessor,buildTriangles,loadDocument,viewResolver,modelMatrixFor,processPhysicsStep,buildAndStoreCollider,resolveContactMaterial,applyContact,playerWorldPosition,modelWorldOrigin,modelSpatialSphere,modelDistanceFromPlayer,colliderDistanceFromPlayer,modelSourceKind,scanGeoFSTileProvider,scanGeoFSTileRegistries,geoFSTileProviderStats,rtcCenterFromDocument,applyRtcToMatrix,validateRequiredExtensions,recordModelAssetInfo,observeGeoTileWrapper,providerTileURL,auditGeoFSTiles,isExperimentalModel,isCollisionModel,effectiveModelMatrixObject,releaseCollider,tickSpatialStreamingFrame,refreshSpatialTargets,kickStreamingWorker,evictFarCollidersForCapacity,hasFartherEvictableCollider,distance3,withinLoadRadius,beyondUnloadRadius}
  };
  W.GeoFSGLBPhysics=api;
  const button=W.document.createElement("button");button.textContent="GLB衝突 0.6.1";Object.assign(button.style,{position:"fixed",top:"10px",right:"10px",zIndex:"2147483647",padding:"8px 11px",borderRadius:"7px",border:"1px solid #777",background:"#20252b",color:"#fff",fontSize:"13px",fontWeight:"600"});button.addEventListener("click",async()=>{const result=await scanExisting().catch(e=>({error:e.message}));const d=diagnostics();console.table(d.models);console.table(d.tileProviders.buildings.samples||[]);console.log("GeoFSGLBPhysics diagnostics",d);W.prompt("0.6.1 状態・建物タイル・GLB URL",JSON.stringify({scan:result,stats:d.stats,tileProviders:d.tileProviders,urls:d.urls.map(x=>x.url),models:d.models,lastTileAudit:d.lastTileAudit},null,2));});W.document.body.appendChild(button);state.ui=button;
  const scene=G.api.viewer.scene;
  if(scene?.preUpdate?.addEventListener){
    scene.preUpdate.addEventListener(tickSpatialStreamingFrame);
    state.frameRemove=()=>scene.preUpdate.removeEventListener(tickSpatialStreamingFrame);
  } else if(typeof W.requestAnimationFrame==="function"){
    const loop=()=>{if(state.destroyed)return;tickSpatialStreamingFrame();state.frameFallbackId=W.requestAnimationFrame(loop);};
    state.frameFallbackId=W.requestAnimationFrame(loop);
  } else {warn("Cesium preUpdate / requestAnimationFrame unavailable; frame-based collision streaming is disabled");}
  // Slow housekeeping only maintains the physics hook and rescans GeoFS tile
  // registries. Distance checks never wait for this timer.
  state.timer=setInterval(()=>{
    if(state.destroyed)return;installPhysicsHook();
    if(Date.now()-state.lastRegistryScan>=state.streaming.registryScanIntervalMs){
      try{scanGeoFSTileRegistries();state.lastRegistryScan=Date.now();}catch(e){warn("GeoFS tile registry refresh failed",e);}
    }
  },1000);
  const initial=await scanExisting().catch(e=>{err(e);return null;});
  log("Standalone engine initialized (GeoFS ModelExperimental + frame-based 1 km streaming + cooperative BVH)",{version:VERSION,legacyCoreDependency:false,initial,stats:stats()});
  log("Commands: await GeoFSGLBPhysics.scanExisting(); GeoFSGLBPhysics.updateStreaming(); GeoFSGLBPhysics.setStreamingSettings({loadRadius:1000,unloadRadius:1300}); GeoFSGLBPhysics.stats(); GeoFSGLBPhysics.diagnostics(); GeoFSGLBPhysics.scanGeoFSTileRegistries(); await GeoFSGLBPhysics.auditGeoFSTiles({maxTiles:24,register:true}); await GeoFSGLBPhysics.selfTest(); GeoFSGLBPhysics.setSettings({pointRadius:0.8}); await GeoFSGLBPhysics.testAsset(url); await GeoFSGLBPhysics.addCollider(url, Cesium.Matrix4); GeoFSGLBPhysics.destroy();");
})();
