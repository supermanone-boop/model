/*
 * GeoFS 3.9 GLB Collision Physics 0.3.1
 * Browser-console add-on for GeoFS 3.9 + Cesium 1.96.
 *
 * Design:
 * - Does NOT patch geofs.getCollisionResult or terrainElevationManagement.
 * - Keeps native terrain, water, buoyancy, suspension, hook and catapult paths intact.
 * - Hooks only the active aircraft rigidBody.integrateTransform(dt), once per physics substep.
 * - Loads static GLB geometry into packed Float64 triangle storage + a local BVH.
 * - Supports GLB 2.0, node TRS/matrices, triangle lists/strips/fans, sparse accessors,
 *   Draco geometry, EXT/KHR meshopt bufferView compression, embedded and external buffers.
 * - Uses swept-sphere conservative advancement for translating collision points against
 *   static triangle meshes; then resolves a bounded contact set using GeoFS rigid-body impulses.
 *
 * Explicitly unsupported in 0.3.1:
 * - Cesium.ModelExperimental, ModelInstanceCollection, Entity ModelGraphics and 3D Tiles.
 * - CESIUM_RTC and WEB3D_quantized_attributes assets (rejected rather than mis-positioned).
 * - Animated/skinned/morphed meshes, EXT_mesh_gpu_instancing, dynamic/moving colliders.
 * - A mathematically exact rotational CCD sweep. Rotation is guarded by conservative
 *   angular inflation; very large angular steps should still be tested in GeoFS.
 *
 * This is a best-effort add-on based on static source inspection. Runtime behavior must
 * be tested in the user's actual GeoFS 3.9 session before relying on it.
 */
(() => {
  "use strict";

  const W = window;
  const G = W.geofs;
  const C = W.Cesium;
  const F = W.flight;
  const VERSION = "0.3.1";

  if (!G || !G.api || !G.api.viewer || !C || !F || typeof F.tick !== "function") {
    throw new Error("GeoFS GLB Collision Physics: GeoFS 3.9 / Cesium / flight.tick が見つかりません。ワールド読み込み後に実行してください。");
  }
  if (Number(G.version) && Number(G.version) !== 3.9) {
    console.warn("GeoFS GLB Collision Physics: 想定対象はGeoFS 3.9です。現在のgeofs.version:", G.version);
  }
  if (W.GeoFSGLBPhysics && W.GeoFSGLBPhysics.version === VERSION) {
    console.warn("GeoFS GLB Collision Physics 0.3.1 は既に導入済みです。解除: GeoFSGLBPhysics.destroy()");
    return;
  }
  // Remove an older copy of this add-on before installing the new hook.
  if (W.GeoFSGLBPhysics && typeof W.GeoFSGLBPhysics.destroy === "function") {
    try { W.GeoFSGLBPhysics.destroy(); } catch (e) { console.warn("旧GeoFSGLBPhysicsの解除に失敗:", e); }
  }
  if (W.GeoFSPhysics && W.GeoFSPhysics !== W.GeoFSGLBPhysics && /^0\./.test(String(W.GeoFSPhysics.version || "")) && typeof W.GeoFSPhysics.destroy === "function") {
    try { W.GeoFSPhysics.destroy(); } catch (e) { console.warn("旧GeoFSPhysicsの解除に失敗:", e); }
  }

  const cfg = {
    pointRadius: 0.65,          // GeoFS collision pointを包む球の半径 [m]
    restitution: 0.04,          // 反発係数
    friction: 0.65,             // contactPropertiesがない場合の摩擦係数
    dynamicFriction: 0.45,
    correctionPercent: 0.82,
    penetrationSlop: 0.015,     // 押し戻し許容誤差 [m]
    maxPositionCorrection: 3.0, // 1サブステップの押し戻し上限 [m]
    solverIterations: 4,
    maxContactsPerPoint: 4,
    maxCandidateTriangles: 12000,
    bvhLeafSize: 10,
    maxTriangles: 250000,
    maxGeometryBytes: 300 * 1024 * 1024,
    maxTotalCacheBytes: 400 * 1024 * 1024,
    maxBufferBytes: 512 * 1024 * 1024,
    maxInternalStepTravel: 2.0, // 物理サブステップを分割する最大移動/回転距離 [m]
    maxInternalSubsteps: 16,
    maxTOIEventsPerStep: 4,
    maxSweepIterations: 40,
    sweepTolerance: 0.002,
    rotationalInflation: true,
    debug: true,
    autoScanOnStart: false,
    dracoBaseURL: "https://www.gstatic.com/draco/versioned/decoders/1.5.7/",
    meshoptModuleURL: "https://cdn.jsdelivr.net/npm/meshoptimizer@1.3.0/meshopt_decoder.mjs"
  };

  const state = {
    originalFlightTick: F.tick,
    patchedFlightTick: null,
    activeBody: null,
    originalIntegrateTransform: null,
    patchedIntegrateTransform: null,
    inPhysicsStep: false,
    destroyed: false,
    colliders: [],
    byModel: new WeakMap(),
    geometryCache: new Map(),
    geometryPending: new Map(),
    objectURLs: new Set(),
    decoderPromises: { draco: null, meshopt: null },
    decoderOverrides: {},
    nextId: 1,
    stats: {
      physicsSteps: 0, queries: 0, candidateTriangles: 0,
      contacts: 0, sweptContacts: 0, impulses: 0,
      correctionMeters: 0, skippedSteps: 0, errors: 0
    },
    lastError: null
  };

  const log = (...args) => { if (cfg.debug) console.log("[GeoFS GLB Collision 0.3.1]", ...args); };
  const warn = (...args) => console.warn("[GeoFS GLB Collision 0.3.1]", ...args);
  const finite = Number.isFinite;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = (a,b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
  const sub = (a,b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const mul = (a,s) => [a[0]*s, a[1]*s, a[2]*s];
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const len2 = a => dot(a,a);
  const len = a => Math.sqrt(len2(a));
  const norm = (a, fallback=[0,0,1]) => { const l=len(a); return l>1e-12 ? mul(a,1/l) : fallback.slice(); };
  const isVec3 = a => Array.isArray(a) && a.length >= 3 && finite(a[0]) && finite(a[1]) && finite(a[2]);

  // glTF matrices are column-major, matching Cesium.Matrix4 storage.
  function matIdentity() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
  function matMul(a,b) {
    const o=new Array(16);
    for(let c=0;c<4;c++) for(let r=0;r<4;r++)
      o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
    return o;
  }
  function matTRS(t,q,s) {
    const x=q[0], y=q[1], z=q[2], w=q[3];
    const x2=x+x, y2=y+y, z2=z+z;
    const xx=x*x2, xy=x*y2, xz=x*z2, yy=y*y2, yz=y*z2, zz=z*z2;
    const wx=w*x2, wy=w*y2, wz=w*z2;
    return [
      (1-(yy+zz))*s[0], (xy+wz)*s[0], (xz-wy)*s[0], 0,
      (xy-wz)*s[1], (1-(xx+zz))*s[1], (yz+wx)*s[1], 0,
      (xz+wy)*s[2], (yz-wx)*s[2], (1-(xx+yy))*s[2], 0,
      t[0],t[1],t[2],1
    ];
  }
  function matPoint(m,p) {
    const x=p[0],y=p[1],z=p[2];
    const w=m[3]*x+m[7]*y+m[11]*z+m[15];
    const iw=(w && w!==1) ? 1/w : 1;
    return [(m[0]*x+m[4]*y+m[8]*z+m[12])*iw,
            (m[1]*x+m[5]*y+m[9]*z+m[13])*iw,
            (m[2]*x+m[6]*y+m[10]*z+m[14])*iw];
  }
  function matVector(m,p) {
    return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2],
            m[1]*p[0]+m[5]*p[1]+m[9]*p[2],
            m[2]*p[0]+m[6]*p[1]+m[10]*p[2]];
  }
  function matrixArray(m) { const a=new Array(16); for(let i=0;i<16;i++) a[i]=Number(m[i]); return a; }
  function matrixInverse(m) {
    const a=m.slice(), inv=matIdentity();
    for(let col=0;col<4;col++) {
      let pivot=col, best=Math.abs(a[col*4+col]);
      for(let r=col+1;r<4;r++) { const v=Math.abs(a[col*4+r]); if(v>best){best=v;pivot=r;} }
      if(best<1e-15 || !finite(best)) throw new Error("モデル変換行列が特異です");
      if(pivot!==col) for(let c=0;c<4;c++){let t=a[c*4+col];a[c*4+col]=a[c*4+pivot];a[c*4+pivot]=t;t=inv[c*4+col];inv[c*4+col]=inv[c*4+pivot];inv[c*4+pivot]=t;}
      const d=a[col*4+col]; for(let c=0;c<4;c++){a[c*4+col]/=d;inv[c*4+col]/=d;}
      for(let r=0;r<4;r++) if(r!==col){const f=a[col*4+r];for(let c=0;c<4;c++){a[c*4+r]-=f*a[c*4+col];inv[c*4+r]-=f*inv[c*4+col];}}
    }
    return inv;
  }
  function inverseLinearFrobenius(m) {
    const ids=[0,1,2,4,5,6,8,9,10]; let s=0;
    for(const i of ids) s+=m[i]*m[i];
    return Math.sqrt(s);
  }
  function matrixNearlyEqual(a,b,eps=1e-8) {
    for(let i=0;i<16;i++) if(Math.abs(a[i]-b[i])>eps) return false;
    return true;
  }
  function array3(a) { return [Number(a[0]),Number(a[1]),Number(a[2])]; }

  // GeoFS 3.9 creates the modelMatrix from ENU * HPR * non-uniform scale.
  // Cesium 1.96 Legacy Model then applies its Y_UP_TO_Z_UP correction.
  function getModelToWorld(model) {
    if (!model || !model.modelMatrix) throw new Error("model.modelMatrixがありません");
    if (C.ModelExperimental && model instanceof C.ModelExperimental) {
      throw new Error("ModelExperimentalは0.3.1では未対応です。GeoFS 3.9標準のCesium.Modelを登録してください。");
    }
    if (model.constructor && /ModelInstanceCollection/.test(model.constructor.name)) {
      throw new Error("ModelInstanceCollectionは0.3.1では未対応です。");
    }
    if (finite(model.minimumPixelSize) && model.minimumPixelSize > 0) {
      throw new Error("minimumPixelSizeによるカメラ依存拡大モデルは未対応です");
    }
    const m=matrixArray(model.modelMatrix);
    const up=model._upAxis !== undefined ? model._upAxis : (model.upAxis !== undefined ? model.upAxis : 1);
    let axis=matIdentity();
    if (up===1 || up==="Y") axis=[1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,0,0,1];
    else if (up===0 || up==="X") axis=[0,0,1,0, 0,1,0,0, -1,0,0,0, 0,0,0,1];
    else if (up!==2 && up!=="Z" && up!==undefined) throw new Error("不明なCesium upAxis: "+up);
    const s=finite(model.scale) ? model.scale : 1;
    const sm=matIdentity(); sm[0]=sm[5]=sm[10]=s;
    return matMul(matMul(m,sm),axis);
  }

  // Convert between aircraft-root ENU and WGS84 ECEF.
  function cartesianFromLLA(lla) {
    return C.Cartesian3.fromDegrees(lla[1],lla[0],lla[2],C.Ellipsoid.WGS84,new C.Cartesian3());
  }
  function enuFrame(lla) {
    const origin=cartesianFromLLA(lla);
    return C.Transforms.eastNorthUpToFixedFrame(origin,C.Ellipsoid.WGS84,new C.Matrix4());
  }
  function pointENUToECEF(local,lla) {
    const p=C.Matrix4.multiplyByPoint(enuFrame(lla),new C.Cartesian3(local[0],local[1],local[2]),new C.Cartesian3());
    return [p.x,p.y,p.z];
  }
  function vectorECEFToENU(v,lla) {
    const inv=C.Matrix4.inverseTransformation(enuFrame(lla),new C.Matrix4());
    const p=C.Matrix4.multiplyByPointAsVector(inv,new C.Cartesian3(v[0],v[1],v[2]),new C.Cartesian3());
    return [p.x,p.y,p.z];
  }
  function translateAircraftECEF(aircraft,delta) {
    if (!isVec3(delta) || len2(delta)<1e-14) return;
    const root=cartesianFromLLA(aircraft.llaLocation);
    const moved=new C.Cartesian3(root.x+delta[0],root.y+delta[1],root.z+delta[2]);
    const c=C.Cartographic.fromCartesian(moved,C.Ellipsoid.WGS84,new C.Cartographic());
    if (!c || !finite(c.height)) return;
    aircraft.llaLocation=[C.Math.toDegrees(c.latitude),C.Math.toDegrees(c.longitude),c.height];
    aircraft.object3d.compute(aircraft.llaLocation);
  }

  // ----- GLB / glTF loading and validation -----
  function parseGLB(buffer) {
    if (!(buffer instanceof ArrayBuffer)) throw new Error("GLB入力がArrayBufferではありません");
    if (buffer.byteLength<20) throw new Error("GLBファイルが短すぎます");
    const dv=new DataView(buffer);
    if (dv.getUint32(0,true)!==0x46546c67) throw new Error("GLB magicが不正です");
    if (dv.getUint32(4,true)!==2) throw new Error("GLBバージョン2以外は未対応です");
    const total=dv.getUint32(8,true);
    if (total!==buffer.byteLength) throw new Error("GLB header.lengthと実ファイル長が一致しません");
    let offset=12, json=null, bin=null, chunkIndex=0;
    while(offset<total) {
      if(offset+8>total) throw new Error("GLB chunk headerが途中で切れています");
      const n=dv.getUint32(offset,true), type=dv.getUint32(offset+4,true); offset+=8;
      if ((n&3)!==0) throw new Error("GLB chunk長が4 byte境界ではありません");
      if(offset+n>total) throw new Error("GLB chunkがファイル範囲外です");
      if(chunkIndex===0 && type!==0x4e4f534a) throw new Error("GLB第1チャンクがJSONではありません");
      if(type===0x4e4f534a) {
        if(json) throw new Error("JSON chunkが複数あります");
        const text=new TextDecoder("utf-8",{fatal:true}).decode(new Uint8Array(buffer,offset,n)).replace(/[\u0000\u0020]+$/g,"");
        json=JSON.parse(text);
      } else if(type===0x004e4942) {
        if(bin) throw new Error("BIN chunkが複数あります");
        bin=new Uint8Array(buffer,offset,n);
      }
      offset+=n; chunkIndex++;
    }
    if(!json || json.asset?.version!=="2.0") throw new Error("glTF asset.version 2.0 JSONがありません");
    if(json.asset.minVersion && compareVersion(json.asset.minVersion,"2.0")>0) throw new Error("glTF asset.minVersionが2.0を超えているため未対応です: "+json.asset.minVersion);
    const buffers=json.buffers||[];
    if(!Array.isArray(buffers)) throw new Error("glTF buffersが配列ではありません");
    if(buffers.length && !buffers.some((b,i)=>i===0 && !b.uri) && !buffers.some(b=>typeof b.uri==="string")) {
      throw new Error("glTF buffer定義が不正です");
    }
    if(buffers.length && !bin && buffers.some((b,i)=>!b.uri && i===0 && b.byteLength>0)) throw new Error("第0 buffer用BIN chunkが必要ですが存在しません");
    return {json,bin,sourceBuffer:buffer};
  }
  function compareVersion(a,b) {
    const pa=String(a).split(".").map(x=>Number.parseInt(x,10)||0), pb=String(b).split(".").map(x=>Number.parseInt(x,10)||0);
    for(let i=0;i<Math.max(pa.length,pb.length);i++){const d=(pa[i]||0)-(pb[i]||0);if(d)return d;}return 0;
  }
  function decodeDataURI(uri) {
    const m=/^data:([^,]*?),(.*)$/s.exec(uri);
    if(!m) throw new Error("data URIが不正です");
    const meta=m[1], body=m[2];
    if(/;base64/i.test(meta)) {
      const raw=atob(body), out=new Uint8Array(raw.length);
      for(let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i);
      return out;
    }
    return new TextEncoder().encode(decodeURIComponent(body));
  }
  function findMeshoptPlaceholderBuffers(gltf) {
    const defs=gltf.buffers||[], views=gltf.bufferViews||[], required=gltf.extensionsRequired||[];
    const placeholders=new Set();
    for(let i=1;i<defs.length;i++) {
      const b=defs[i];
      if(!b || b.uri!==undefined) continue;
      if(!required.includes("KHR_meshopt_compression")) continue;
      let parentRefs=0, compressedRefs=0, invalidParent=false;
      for(const bv of views) {
        if(bv.buffer===i) {
          if(bv.extensions?.KHR_meshopt_compression) parentRefs++;
          else invalidParent=true;
        }
        for(const name of ["KHR_meshopt_compression","EXT_meshopt_compression"]) {
          if(bv.extensions?.[name]?.buffer===i) compressedRefs++;
        }
      }
      const explicitlyFallback=b.extensions?.KHR_meshopt_compression?.fallback;
      if(explicitlyFallback===false || invalidParent || parentRefs===0 || compressedRefs>0) continue;
      placeholders.add(i);
    }
    return placeholders;
  }
  async function loadBuffers(parsed,url) {
    const defs=parsed.json.buffers||[];
    const placeholderBuffers=findMeshoptPlaceholderBuffers(parsed.json);
    const out=[]; let total=0;
    for(let i=0;i<defs.length;i++) {
      const b=defs[i]; let bytes;
      if(i===0 && !b.uri) {
        if(!parsed.bin) bytes=new Uint8Array(0);
        else bytes=parsed.bin;
      } else if(typeof b.uri==="string") {
        if(b.uri.startsWith("data:")) bytes=decodeDataURI(b.uri);
        else {
          const absolute=new URL(b.uri,url).href;
          const response=await W.fetch(absolute,{mode:"cors",credentials:"omit"});
          if(!response.ok) throw new Error("外部buffer取得失敗 HTTP "+response.status+": "+absolute);
          const cl=Number(response.headers?.get?.("content-length"));
          if(finite(cl) && cl>cfg.maxBufferBytes) throw new Error("外部buffer Content-Lengthが上限を超えています: "+absolute);
          const externalBytes=await response.arrayBuffer();
          if(externalBytes.byteLength>cfg.maxBufferBytes) throw new Error("外部buffer実データが上限を超えています: "+absolute);
          bytes=new Uint8Array(externalBytes);
        }
      } else if(placeholderBuffers.has(i)) {
        // KHR_meshopt permits an unbacked fallback buffer when the extension is required.
        // Its compressed bufferViews are decoded into replacement byte arrays before access.
        if(!Number.isSafeInteger(b.byteLength)||b.byteLength<0) throw new Error("Meshopt fallback buffer byteLengthが不正です: "+i);
        bytes=new Uint8Array(0);
      } else throw new Error("buffer "+i+" にURIがなく、KHR_meshoptの安全なplaceholderとも判定できません");
      if(!Number.isSafeInteger(b.byteLength) || b.byteLength<0 || (placeholderBuffers.has(i)?false:bytes.byteLength<b.byteLength)) throw new Error("buffer "+i+" のbyteLengthが不正です");
      if(!placeholderBuffers.has(i) && bytes.byteLength>b.byteLength) bytes=bytes.subarray(0,b.byteLength);
      total+=bytes.byteLength;
      if(total>cfg.maxBufferBytes) throw new Error("GLB buffer合計が上限を超えました");
      out.push(bytes);
    }
    return out;
  }
  function getRawBufferView(gltf,buffers,index,decodedViews) {
    const bv=gltf.bufferViews?.[index];
    if(!bv) throw new Error("bufferView "+index+" がありません");
    if(decodedViews.has(index)) return decodedViews.get(index);
    const bi=bv.buffer, buffer=Number.isInteger(bi)?buffers[bi]:null;
    if(!Number.isInteger(bi)||!buffer) throw new Error("bufferView "+index+" のbuffer参照が不正です");
    const off=bv.byteOffset||0, size=bv.byteLength;
    if(!Number.isSafeInteger(off)||!Number.isSafeInteger(size)||off<0||size<0||off+size>buffer.byteLength) throw new Error("bufferView "+index+" がbuffer範囲外です");
    return buffer.subarray(off,off+size);
  }
  async function loadMeshoptDecoder() {
    if(state.decoderOverrides.meshopt) return state.decoderOverrides.meshopt;
    if(state.decoderPromises.meshopt) return state.decoderPromises.meshopt;
    state.decoderPromises.meshopt=(async()=>{
      let d=W.MeshoptDecoder;
      if(!d) {
        const m=await import(cfg.meshoptModuleURL);
        d=m.MeshoptDecoder||m.default?.MeshoptDecoder||m.default;
      }
      if(!d || typeof d.decodeGltfBuffer!=="function") throw new Error("MeshoptDecoder.decodeGltfBufferがありません");
      await d.ready;
      return d;
    })();
    try{return await state.decoderPromises.meshopt;}catch(e){state.decoderPromises.meshopt=null;throw e;}
  }
  async function decodeMeshoptViews(gltf,buffers) {
    const views=gltf.bufferViews||[], jobs=[]; let decodedBytes=0;
    for(let i=0;i<views.length;i++) {
      const bv=views[i], exA=bv.extensions?.EXT_meshopt_compression, exB=bv.extensions?.KHR_meshopt_compression;
      if(!exA&&!exB) continue;
      if(exA&&exB) throw new Error("bufferView "+i+" にEXT/KHR Meshoptが重複しています");
      const ex=exA||exB;
      const count=ex.count, stride=ex.byteStride, off=ex.byteOffset||0, size=ex.byteLength, bi=ex.buffer;
      if(!Number.isInteger(count)||count<0||!Number.isInteger(stride)||stride<=0||!Number.isSafeInteger(off)||off<0||!Number.isSafeInteger(size)||size<=0||!Number.isInteger(bi)||!buffers[bi]||!Number.isSafeInteger(off+size)) throw new Error("Meshopt extensionの数値またはbuffer参照が不正です: "+i);
      if(!Number.isInteger(bv.buffer)||!buffers[bv.buffer]) throw new Error("Meshopt parent bufferViewのfallback buffer参照が不正です: "+i);
      // KHR_meshopt_compression stores the v0/v1 marker in the compressed bitstream,
      // not in extension JSON. MeshoptDecoder inspects that header itself.
      if(!["ATTRIBUTES","TRIANGLES","INDICES"].includes(ex.mode)) throw new Error("Meshopt modeが不正です: "+ex.mode);
      const filter=ex.filter||"NONE";
      if(!["NONE","OCTAHEDRAL","QUATERNION","EXPONENTIAL","COLOR"].includes(filter)) throw new Error("Meshopt filterが不正です: "+filter);
      if(off+size>buffers[bi].byteLength) throw new Error("Meshopt圧縮データがbuffer範囲外です: "+i);
      if(bv.byteLength!==count*stride) throw new Error("Meshopt parent bufferView.byteLength != count * byteStride: "+i);
      if(bv.byteStride!==undefined && bv.byteStride!==stride) throw new Error("Meshopt parent byteStrideとextension byteStrideが不一致です: "+i);
      if(ex.mode==="ATTRIBUTES" && (stride<4||stride>256||stride%4!==0)) throw new Error("Meshopt ATTRIBUTES byteStrideが仕様範囲外です: "+i);
      if(ex.mode==="TRIANGLES" && count%3!==0) throw new Error("Meshopt TRIANGLES countが3の倍数ではありません: "+i);
      if((ex.mode==="TRIANGLES"||ex.mode==="INDICES") && (![2,4].includes(stride)||filter!=="NONE")) throw new Error("Meshopt index modeのstride/filterが不正です: "+i);
      if(filter==="OCTAHEDRAL" && ![4,8].includes(stride)) throw new Error("OCTAHEDRAL strideが不正です");
      if(filter==="QUATERNION" && stride!==8) throw new Error("QUATERNION strideが不正です");
      if(filter==="EXPONENTIAL" && stride%4!==0) throw new Error("EXPONENTIAL strideが不正です");
      if(filter==="COLOR" && ![4,8].includes(stride)) throw new Error("COLOR strideが不正です");
      const length=count*stride;
      decodedBytes+=length;
      if(!Number.isSafeInteger(length)||decodedBytes>cfg.maxGeometryBytes) throw new Error("Meshopt展開サイズが上限を超えました");
      jobs.push({index:i,ex,count,stride,off,size,bi,length,filter});
    }
    const map=new Map();
    if(!jobs.length) return {map,views:0,bytes:0};
    const decoder=await loadMeshoptDecoder();
    for(const j of jobs) {
      const source=buffers[j.bi].subarray(j.off,j.off+j.size);
      const target=new Uint8Array(j.length);
      await decoder.decodeGltfBuffer(target,j.count,j.stride,source,j.ex.mode,j.filter==="NONE"?undefined:j.filter);
      map.set(j.index,target);
    }
    return {map,views:jobs.length,bytes:decodedBytes};
  }
  function loadScript(src,globalTest) {
    if(globalTest()) return Promise.resolve();
    if(!W.document) return Promise.reject(new Error("Draco decoderを読み込むdocumentがありません"));
    const existing=[...W.document.scripts].find(s=>s.src===src);
    if(existing) return new Promise((resolve,reject)=>{existing.addEventListener("load",()=>globalTest()?resolve():reject(new Error("Draco globalがありません")),{once:true});existing.addEventListener("error",()=>reject(new Error("Draco script読み込み失敗")),{once:true});});
    return new Promise((resolve,reject)=>{
      const s=W.document.createElement("script"); s.src=src; s.async=true; s.crossOrigin="anonymous";
      s.onload=()=>globalTest()?resolve():reject(new Error("DracoDecoderModuleが定義されません"));
      s.onerror=()=>reject(new Error("Draco decoder script取得失敗: "+src));
      W.document.head.appendChild(s);
    });
  }
  async function loadDracoDecoder() {
    if(state.decoderOverrides.draco) return state.decoderOverrides.draco;
    if(state.decoderPromises.draco) return state.decoderPromises.draco;
    state.decoderPromises.draco=(async()=>{
      const base=cfg.dracoBaseURL.endsWith("/")?cfg.dracoBaseURL:cfg.dracoBaseURL+"/";
      if(typeof W.DracoDecoderModule!=="function") await loadScript(base+"draco_wasm_wrapper.js",()=>typeof W.DracoDecoderModule==="function");
      const res=await W.fetch(base+"draco_decoder.wasm",{mode:"cors",credentials:"omit"});
      if(!res.ok) throw new Error("Draco WASM取得失敗 HTTP "+res.status);
      const wasmBinary=await res.arrayBuffer();
      return await W.DracoDecoderModule({wasmBinary});
    })();
    try{return await state.decoderPromises.draco;}catch(e){state.decoderPromises.draco=null;throw e;}
  }
  async function decodeDracoPrimitive(gltf,buffers,decodedViews,prim) {
    const ex=prim.extensions?.KHR_draco_mesh_compression;
    if(!ex || !Number.isInteger(ex.bufferView) || !Number.isInteger(ex.attributes?.POSITION)) throw new Error("Draco extensionにbufferView/POSITION attribute IDがありません");
    const bytes=getRawBufferView(gltf,buffers,ex.bufferView,decodedViews);
    const mod=await loadDracoDecoder(), decoder=new mod.Decoder(), dbuf=new mod.DecoderBuffer(), mesh=new mod.Mesh();
    const faces=new mod.DracoInt32Array(), floats=new mod.DracoFloat32Array();
    try {
      dbuf.Init(new Int8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength),bytes.byteLength);
      const type=decoder.GetEncodedGeometryType(dbuf);
      if(type!==mod.TRIANGULAR_MESH) throw new Error("Dracoデータがtriangle meshではありません");
      const status=decoder.DecodeBufferToMesh(dbuf,mesh);
      if(!status || (typeof status.ok==="function"&&!status.ok()) || !mesh.ptr) throw new Error("Draco decode failed: "+(status?.error_msg?.()||"unknown"));
      const attr=decoder.GetAttributeByUniqueId(mesh,ex.attributes.POSITION);
      if(!attr || !attr.ptr || attr.num_components()!==3) throw new Error("Draco POSITION attributeが不正です");
      decoder.GetAttributeFloatForAllPoints(mesh,attr,floats);
      const pc=mesh.num_points(), positions=new Float64Array(pc*3);
      for(let i=0;i<pc*3;i++) positions[i]=floats.GetValue(i);
      const fc=mesh.num_faces(), indices=new Uint32Array(fc*3);
      for(let i=0;i<fc;i++) {
        if(!decoder.GetFaceFromMesh(mesh,i,faces)) throw new Error("Draco face取得失敗: "+i);
        indices[i*3]=faces.GetValue(0);indices[i*3+1]=faces.GetValue(1);indices[i*3+2]=faces.GetValue(2);
      }
      return {positions,indices,draco:true};
    } finally {
      for(const x of [floats,faces,mesh,dbuf,decoder]) try{mod.destroy(x);}catch(_){}
    }
  }

  const COMPONENTS={
    5120:{size:1,read:(d,o)=>d.getInt8(o),signed:true,max:127},
    5121:{size:1,read:(d,o)=>d.getUint8(o),signed:false,max:255},
    5122:{size:2,read:(d,o)=>d.getInt16(o,true),signed:true,max:32767},
    5123:{size:2,read:(d,o)=>d.getUint16(o,true),signed:false,max:65535},
    5125:{size:4,read:(d,o)=>d.getUint32(o,true),signed:false,max:4294967295},
    5126:{size:4,read:(d,o)=>d.getFloat32(o,true),signed:true,max:1}
  };
  const TYPECOMP={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
  function readAccessor(gltf,buffers,decodedViews,index,expectedType) {
    const a=gltf.accessors?.[index]; if(!a) throw new Error("accessor "+index+" がありません");
    const ci=COMPONENTS[a.componentType], comps=TYPECOMP[a.type];
    if(!ci||!comps||!Number.isInteger(a.count)||a.count<0) throw new Error("accessor "+index+" のcomponentType/type/countが不正です");
    if(expectedType && a.type!==expectedType) throw new Error("accessor "+index+" は"+expectedType+"でなければなりません");
    const valueCount=a.count*comps;
    if(!Number.isSafeInteger(valueCount) || valueCount<0 || valueCount>cfg.maxGeometryBytes/8) throw new Error("accessor要素数が上限を超えています");
    if(a.normalized && ![5120,5121,5122,5123].includes(a.componentType)) throw new Error("normalized=trueはBYTE/UNSIGNED_BYTE/SHORT/UNSIGNED_SHORTに限られます");
    const out=new Float64Array(valueCount);
    if(a.bufferView!==undefined) {
      const bv=gltf.bufferViews?.[a.bufferView]; if(!bv) throw new Error("accessor bufferViewがありません");
      const raw=getRawBufferView(gltf,buffers,a.bufferView,decodedViews);
      const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
      const byteOffset=a.byteOffset||0, packed=ci.size*comps;
      const stride=bv.byteStride||packed;
      const absoluteOffset=(bv.byteOffset||0)+byteOffset;
      if(!Number.isSafeInteger(byteOffset)||byteOffset<0||!Number.isSafeInteger(stride)||stride<packed||stride%ci.size!==0) throw new Error("accessor byteOffset/strideが不正です");
      if(bv.byteStride!==undefined && (bv.byteStride<4 || bv.byteStride>252 || bv.byteStride%4!==0)) throw new Error("bufferView.byteStrideがglTFの4-byte alignment/範囲に違反しています");
      const end=a.count===0?byteOffset:byteOffset+(a.count-1)*stride+packed;
      if(!Number.isSafeInteger(end)||end>raw.byteLength) throw new Error("accessorが自身のbufferViewを越えています");
      if(absoluteOffset%ci.size!==0) throw new Error("accessor絶対byteOffsetがcomponent alignmentに違反しています");
      for(let i=0;i<a.count;i++) for(let k=0;k<comps;k++) {
        const rawValue=ci.read(view,byteOffset+i*stride+k*ci.size);
        let v=rawValue;
        if(a.normalized) v=ci.signed?Math.max(rawValue/ci.max,-1):rawValue/ci.max;
        if(!finite(v)) throw new Error("accessorにNaN/Infinityがあります");
        out[i*comps+k]=v;
      }
    } else if(a.byteOffset!==undefined) throw new Error("bufferViewなしaccessorにbyteOffsetがあります");
    if(a.sparse) {
      const sp=a.sparse, count=sp.count;
      if(!Number.isInteger(count)||count<0||count>a.count) throw new Error("sparse accessor countが不正です");
      const ic=COMPONENTS[sp.indices?.componentType];
      if(!ic || ![5121,5123,5125].includes(sp.indices.componentType)) throw new Error("sparse indices componentTypeが不正です");
      const ibv=gltf.bufferViews?.[sp.indices.bufferView];
      if(!ibv || ibv.byteStride!==undefined) throw new Error("sparse indices bufferViewが不正です");
      const idxBytes=getRawBufferView(gltf,buffers,sp.indices.bufferView,decodedViews);
      const idxOff=sp.indices.byteOffset||0;
      if(!Number.isSafeInteger(idxOff)||idxOff<0||!Number.isSafeInteger(idxOff+count*ic.size)||idxOff+count*ic.size>idxBytes.byteLength||((ibv.byteOffset||0)+idxOff)%ic.size!==0) throw new Error("sparse indicesがbufferView範囲外/非整列です");
      const idv=new DataView(idxBytes.buffer,idxBytes.byteOffset,idxBytes.byteLength);
      const vbv=gltf.bufferViews?.[sp.values.bufferView];
      if(!vbv || vbv.byteStride!==undefined) throw new Error("sparse values bufferViewが不正です");
      const valBytes=getRawBufferView(gltf,buffers,sp.values.bufferView,decodedViews);
      const valOff=sp.values.byteOffset||0, valSize=ci.size*comps;
      if(!Number.isSafeInteger(valOff)||valOff<0||!Number.isSafeInteger(valOff+count*valSize)||valOff+count*valSize>valBytes.byteLength||((vbv.byteOffset||0)+valOff)%ci.size!==0) throw new Error("sparse valuesがbufferView範囲外/非整列です");
      const vdv=new DataView(valBytes.buffer,valBytes.byteOffset,valBytes.byteLength);
      let previous=-1;
      for(let i=0;i<count;i++) {
        const destination=ic.read(idv,idxOff+i*ic.size);
        if(destination<=previous||destination>=a.count) throw new Error("sparse indicesは厳密昇順かつaccessor内である必要があります");
        previous=destination;
        for(let k=0;k<comps;k++) {
          const rv=ci.read(vdv,valOff+(i*comps+k)*ci.size);
          out[destination*comps+k]=a.normalized?(ci.signed?Math.max(rv/ci.max,-1):rv/ci.max):rv;
        }
      }
    }
    return {data:out,count:a.count,components:comps,componentType:a.componentType};
  }

  function hasExtensionObject(root,name) {
    if (!root || typeof root !== "object") return false;
    if (Array.isArray(root)) return root.some(x => hasExtensionObject(x,name));
    if (Object.prototype.hasOwnProperty.call(root,name)) return true;
    for (const value of Object.values(root)) if (hasExtensionObject(value,name)) return true;
    return false;
  }
  async function buildGeometryTriangles(gltf,buffers,decodedViews) {
    const used = gltf.extensionsUsed || [];
    const required = gltf.extensionsRequired || [];
    const supportedStructural=new Set(["KHR_draco_mesh_compression","KHR_meshopt_compression","EXT_meshopt_compression","KHR_mesh_quantization"]);
    const safeNonGeometry=ext=>/^KHR_materials_/.test(ext)||/^KHR_texture_/.test(ext)||/^EXT_texture_/.test(ext)||ext==="KHR_lights_punctual"||ext==="KHR_materials_variants"||ext==="EXT_mesh_features"||ext==="EXT_structural_metadata";
    for(const ext of required) if(!supportedStructural.has(ext) && !safeNonGeometry(ext)) throw new Error("未対応の必須拡張が形状/座標へ影響する可能性があるため拒否しました: "+ext);
    if(used.includes("CESIUM_RTC") || required.includes("CESIUM_RTC") || hasExtensionObject(gltf.extensions,"CESIUM_RTC")) throw new Error("CESIUM_RTC付きGLBは0.3.1では変換位置を保証できないため拒否しました");
    if(used.includes("WEB3D_quantized_attributes") || required.includes("WEB3D_quantized_attributes") || hasExtensionObject(gltf,"WEB3D_quantized_attributes")) throw new Error("WEB3D_quantized_attributesは0.3.1では未対応です");
    if(gltf.animations?.length) throw new Error("アニメーション付きGLBは静的衝突メッシュとして未対応です");
    if(required.includes("KHR_mesh_primitive_restart") || used.includes("KHR_mesh_primitive_restart")) throw new Error("KHR_mesh_primitive_restartは0.3.1では未対応です");
    const nodes=gltf.nodes||[], meshes=gltf.meshes||[];
    const parentCount=new Uint32Array(nodes.length);
    for(let i=0;i<nodes.length;i++) {
      const n=nodes[i];
      if(n.skin!==undefined) throw new Error("skin付きnodeは未対応です: node "+i);
      if(n.extensions?.EXT_mesh_gpu_instancing) throw new Error("EXT_mesh_gpu_instancingは未対応です: node "+i);
      const children=n.children||[];
      if(!Array.isArray(children)||new Set(children).size!==children.length) throw new Error("node childrenが不正/重複しています: node "+i);
      for(const child of children) {
        if(!Number.isInteger(child)||child<0||child>=nodes.length) throw new Error("node child indexが不正です: node "+i);
        if(++parentCount[child]>1) throw new Error("複数の親を持つnodeは未対応です: node "+child);
      }
    }
    function validatePositionAccessor(index) {
      const a=gltf.accessors?.[index];
      if(!a || a.type!=="VEC3") throw new Error("POSITION accessorはVEC3でなければなりません");
      if(!Array.isArray(a.min)||!Array.isArray(a.max)||a.min.length!==3||a.max.length!==3||a.min.some(v=>!finite(v))||a.max.some(v=>!finite(v))||a.min.some((v,i)=>v>a.max[i])) throw new Error("POSITION accessorには有限かつmin<=maxのmin/maxが必要です");
      if(a.componentType!==5126) {
        if(!required.includes("KHR_mesh_quantization") || ![5120,5121,5122,5123].includes(a.componentType)) throw new Error("整数POSITIONはKHR_mesh_quantizationをextensionsRequiredに含むBYTE/UBYTE/SHORT/USHORTに限られます");
      }
    }
    const sceneIndex=gltf.scene===undefined?0:gltf.scene;
    const scene=gltf.scenes?.[sceneIndex];
    let roots=scene?.nodes;
    if(!roots) {
      const children=new Set(); for(const n of nodes) for(const c of n.children||[]) children.add(c);
      roots=nodes.map((_,i)=>i).filter(i=>!children.has(i));
    }
    if(!Array.isArray(roots)||!roots.length) throw new Error("default scene root nodeがありません");
    if(new Set(roots).size!==roots.length) throw new Error("default sceneに重複root nodeがあります");
    for(const root of roots) if(!Number.isInteger(root)||root<0||root>=nodes.length||parentCount[root]!==0) throw new Error("default scene root node index/parentが不正です: "+root);
    const flat=[]; let primitiveCount=0, dracoCount=0;
    const activePath=new Set();
    function addTriangle(v0,v1,v2) {
      if(!isVec3(v0)||!isVec3(v1)||!isVec3(v2)) throw new Error("変換後の頂点にNaN/Infinityがあります");
      const ab=sub(v1,v0), ac=sub(v2,v0);
      if(len2(cross(ab,ac))<1e-18) return;
      flat.push(v0[0],v0[1],v0[2],v1[0],v1[1],v1[2],v2[0],v2[1],v2[2]);
      if(flat.length/9>cfg.maxTriangles) throw new Error("三角形数が上限 "+cfg.maxTriangles+" を超えました");
      if(flat.length*8>cfg.maxGeometryBytes) throw new Error("衝突メッシュの一時メモリが上限を超えました");
    }
    async function walk(nodeIndex,parent) {
      const n=nodes[nodeIndex]; if(!n) throw new Error("node index不正: "+nodeIndex);
      if(activePath.has(nodeIndex)) throw new Error("node hierarchyに循環があります");
      activePath.add(nodeIndex);
      let local;
      if(n.matrix!==undefined) {
        if(n.translation!==undefined||n.rotation!==undefined||n.scale!==undefined) throw new Error("nodeにmatrixとTRSが同時指定されています: "+nodeIndex);
        if(!Array.isArray(n.matrix)||n.matrix.length!==16||n.matrix.some(v=>!finite(v))||Math.abs(n.matrix[3])>1e-10||Math.abs(n.matrix[7])>1e-10||Math.abs(n.matrix[11])>1e-10||Math.abs(n.matrix[15]-1)>1e-10) throw new Error("node.matrixが不正です: "+nodeIndex);
        local=Array.from(n.matrix);
      } else {
        const t=n.translation||[0,0,0], q=n.rotation||[0,0,0,1], scale=n.scale||[1,1,1];
        if(!Array.isArray(t)||t.length!==3||t.some(v=>!finite(v))||!Array.isArray(q)||q.length!==4||q.some(v=>!finite(v))||!Array.isArray(scale)||scale.length!==3||scale.some(v=>!finite(v))) throw new Error("node TRS値が不正です: "+nodeIndex);
        const ql=Math.hypot(q[0],q[1],q[2],q[3]);
        if(ql<1e-12||Math.abs(ql-1)>0.02) throw new Error("node.rotation quaternionが単位長ではありません: "+nodeIndex);
        const nq=q.map(v=>v/ql);
        local=matTRS(t,nq,scale);
      }
      const world=matMul(parent,local);
      if(n.mesh!==undefined) {
        const mesh=meshes[n.mesh]; if(!mesh) throw new Error("node mesh index不正: "+n.mesh);
        for(const prim of mesh.primitives||[]) {
          if(prim.targets?.length) throw new Error("morph target付きprimitiveは未対応です");
          const mode=prim.mode===undefined?4:prim.mode;
          if(!Number.isInteger(mode)||mode<0||mode>6) throw new Error("primitive.modeが不正です: "+mode);
          if(mode<4) continue; // points/lines do not form collision surfaces
          if(prim.extensions?.KHR_draco_mesh_compression) {
            if(mode!==4&&mode!==5) throw new Error("Draco primitive modeはTRIANGLES/TRIANGLE_STRIPのみ対応です");
            const posIndex=prim.attributes?.POSITION;
            if(posIndex===undefined) throw new Error("Draco primitiveにPOSITION accessor参照がありません");
            validatePositionAccessor(posIndex);
            const decoded=await decodeDracoPrimitive(gltf,buffers,decodedViews,prim);
            dracoCount++;
            const positions=decoded.positions, idx=decoded.indices;
            if(mode===4) {
              for(let i=0;i+2<idx.length;i+=3) addTriangle(matPoint(world,[positions[idx[i]*3],positions[idx[i]*3+1],positions[idx[i]*3+2]]),matPoint(world,[positions[idx[i+1]*3],positions[idx[i+1]*3+1],positions[idx[i+1]*3+2]]),matPoint(world,[positions[idx[i+2]*3],positions[idx[i+2]*3+1],positions[idx[i+2]*3+2]]));
            } else {
              // Draco's decoded mesh faces are already triangles; do not strip-expand them again.
              for(let i=0;i<idx.length;i+=3) addTriangle(matPoint(world,[positions[idx[i]*3],positions[idx[i]*3+1],positions[idx[i]*3+2]]),matPoint(world,[positions[idx[i+1]*3],positions[idx[i+1]*3+1],positions[idx[i+1]*3+2]]),matPoint(world,[positions[idx[i+2]*3],positions[idx[i+2]*3+1],positions[idx[i+2]*3+2]]));
            }
          } else {
            const positionIndex=prim.attributes?.POSITION;
            if(positionIndex===undefined) throw new Error("POSITION attributeがありません");
            validatePositionAccessor(positionIndex);
            const pos=readAccessor(gltf,buffers,decodedViews,positionIndex,"VEC3");
            const idx=prim.indices===undefined?null:readAccessor(gltf,buffers,decodedViews,prim.indices,"SCALAR");
            if(idx) {
              const ia=gltf.accessors[prim.indices], ibv=ia?.bufferView===undefined?null:gltf.bufferViews?.[ia.bufferView];
              if(!([5121,5123,5125].includes(idx.componentType)) || ia?.normalized || ibv?.byteStride!==undefined) throw new Error("indicesはnormalizedでないUNSIGNED_BYTE/SHORT/INT、かつ非stridedでなければなりません");
            }
            const count=idx?idx.count:pos.count;
            const getIndex=i=>idx?idx.data[i]:i;
            if(mode===4 && count%3!==0) throw new Error("TRIANGLESのindex countが3の倍数ではありません");
            if(mode===5 && count<3) continue;
            if(mode===6 && count<3) continue;
            const transformed=new Array(pos.count);
            for(let i=0;i<pos.count;i++) transformed[i]=matPoint(world,[pos.data[i*3],pos.data[i*3+1],pos.data[i*3+2]]);
            if(mode===4) {
              for(let i=0;i<count;i+=3) {
                const a=getIndex(i),b=getIndex(i+1),c=getIndex(i+2);
                if(a>=pos.count||b>=pos.count||c>=pos.count) throw new Error("triangle indexがPOSITION accessor範囲外です");
                addTriangle(transformed[a],transformed[b],transformed[c]);
              }
            } else if(mode===5) {
              for(let i=0;i+2<count;i++) {
                const a=getIndex(i),b=getIndex(i+1),c=getIndex(i+2);
                if(a>=pos.count||b>=pos.count||c>=pos.count) throw new Error("strip indexがPOSITION accessor範囲外です");
                if(i&1) addTriangle(transformed[b],transformed[a],transformed[c]);
                else addTriangle(transformed[a],transformed[b],transformed[c]);
              }
            } else {
              const a=getIndex(0); if(a>=pos.count) throw new Error("fan indexがPOSITION accessor範囲外です");
              for(let i=1;i+1<count;i++) {
                const b=getIndex(i),c=getIndex(i+1);
                if(b>=pos.count||c>=pos.count) throw new Error("fan indexがPOSITION accessor範囲外です");
                addTriangle(transformed[a],transformed[b],transformed[c]);
              }
            }
          }
          primitiveCount++;
        }
      }
      for(const child of n.children||[]) await walk(child,world);
      activePath.delete(nodeIndex);
    }
    for(const root of roots) await walk(root,matIdentity());
    if(!flat.length) throw new Error("衝突対象となる三角形メッシュがありません");
    const verts=new Float64Array(flat), triCount=verts.length/9;
    return {verts,triCount,primitiveCount,dracoCount,decodedBytes:verts.byteLength};
  }

  // Packed binary BVH. No per-triangle JS objects are retained after construction.
  function buildBVH(g) {
    const n=g.triCount, verts=g.verts;
    const triMin=new Float64Array(n*3), triMax=new Float64Array(n*3), cent=new Float64Array(n*3);
    for(let i=0;i<n;i++) {
      const o=i*9, b=i*3;
      for(let k=0;k<3;k++) {
        const a=verts[o+k], c=verts[o+3+k], d=verts[o+6+k];
        triMin[b+k]=Math.min(a,c,d); triMax[b+k]=Math.max(a,c,d);
        cent[b+k]=(a+c+d)/3;
      }
    }
    const order=new Uint32Array(n); for(let i=0;i<n;i++) order[i]=i;
    const nodes=[];
    function cmpTri(a,b,axis) { const d=cent[a*3+axis]-cent[b*3+axis]; return d===0?(a-b):d; }
    function nth(start,end,nthIndex,axis) {
      let lo=start,hi=end-1;
      while(lo<hi) {
        const mid=(lo+hi)>>1;
        const a=order[lo],b=order[mid],c=order[hi];
        let pivot=b;
        if(cmpTri(a,b,axis)>0) { if(cmpTri(b,c,axis)>0) pivot=b; else pivot=cmpTri(a,c,axis)>0?a:c; }
        else pivot=cmpTri(a,c,axis)>0?a:(cmpTri(b,c,axis)>0?c:b);
        let i=lo,j=hi;
        while(i<=j) {
          while(cmpTri(order[i],pivot,axis)<0) i++;
          while(cmpTri(order[j],pivot,axis)>0) j--;
          if(i<=j) { const t=order[i];order[i]=order[j];order[j]=t;i++;j--; }
        }
        if(nthIndex<=j) hi=j; else if(nthIndex>=i) lo=i; else return;
      }
    }
    function build(start,end) {
      const id=nodes.length, node={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity],left:-1,right:-1,start,count:0};
      nodes.push(node);
      const cmin=[Infinity,Infinity,Infinity],cmax=[-Infinity,-Infinity,-Infinity];
      for(let p=start;p<end;p++) {
        const t=order[p], b=t*3;
        for(let k=0;k<3;k++) {
          node.min[k]=Math.min(node.min[k],triMin[b+k]);node.max[k]=Math.max(node.max[k],triMax[b+k]);
          cmin[k]=Math.min(cmin[k],cent[b+k]);cmax[k]=Math.max(cmax[k],cent[b+k]);
        }
      }
      const count=end-start;
      if(count<=cfg.bvhLeafSize) { node.start=start;node.count=count;return id; }
      let axis=0;if(cmax[1]-cmin[1]>cmax[axis]-cmin[axis])axis=1;if(cmax[2]-cmin[2]>cmax[axis]-cmin[axis])axis=2;
      if(cmax[axis]-cmin[axis]<1e-12) { node.start=start;node.count=count;return id; }
      const mid=(start+end)>>1; nth(start,end,mid,axis);
      node.left=build(start,mid);node.right=build(mid,end);
      return id;
    }
    const root=build(0,n);
    g.triMin=triMin;g.triMax=triMax;g.centroids=cent;g.order=order;g.nodes=nodes;g.root=root;
    g.bounds={min:nodes[root].min.slice(),max:nodes[root].max.slice()};
    g.center=[(g.bounds.min[0]+g.bounds.max[0])/2,(g.bounds.min[1]+g.bounds.max[1])/2,(g.bounds.min[2]+g.bounds.max[2])/2];
    g.radius=Math.hypot((g.bounds.max[0]-g.bounds.min[0])/2,(g.bounds.max[1]-g.bounds.min[1])/2,(g.bounds.max[2]-g.bounds.min[2])/2);
    return g;
  }
  function aabbIntersects(aMin,aMax,bMin,bMax) {
    return aMin[0]<=bMax[0]&&aMax[0]>=bMin[0]&&aMin[1]<=bMax[1]&&aMax[1]>=bMin[1]&&aMin[2]<=bMax[2]&&aMax[2]>=bMin[2];
  }
  function queryBVH(g,qMin,qMax,limit) {
    const found=[], stack=[g.root], nodes=g.nodes, order=g.order;
    while(stack.length) {
      const ni=stack.pop(), n=nodes[ni];
      if(!aabbIntersects(qMin,qMax,n.min,n.max)) continue;
      if(n.count) {
        for(let i=n.start;i<n.start+n.count;i++) {
          found.push(order[i]);
          if(found.length>limit) throw new Error("BVH候補三角形が上限を超えました。コライダーを分割するか軽量化してください。");
        }
      } else { stack.push(n.left,n.right); }
    }
    return found;
  }
  function triWorld(g,id,m) {
    const o=id*9,v=g.verts;
    return [matPoint(m,[v[o],v[o+1],v[o+2]]),matPoint(m,[v[o+3],v[o+4],v[o+5]]),matPoint(m,[v[o+6],v[o+7],v[o+8]])];
  }
  function closestPointTriangle(p,a,b,c) {
    const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);
    if(d1<=0&&d2<=0)return a;
    const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);
    if(d3>=0&&d4<=d3)return b;
    const vc=d1*d4-d3*d2;
    if(vc<=0&&d1>=0&&d3<=0)return add(a,mul(ab,d1/(d1-d3)));
    const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);
    if(d6>=0&&d5<=d6)return c;
    const vb=d5*d2-d1*d6;
    if(vb<=0&&d2>=0&&d6<=0)return add(a,mul(ac,d2/(d2-d6)));
    const va=d3*d6-d5*d4;
    if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0)return add(b,mul(sub(c,b),(d4-d3)/((d4-d3)+(d5-d6))));
    const denom=1/(va+vb+vc),v=vb*denom,w=vc*denom;
    return add(add(a,mul(ab,v)),mul(ac,w));
  }
  function triangleNormal(t) { return norm(cross(sub(t[1],t[0]),sub(t[2],t[0]))); }

  // Conservative advancement for a sphere center moving linearly from start to end.
  // Distance-to-triangle is 1-Lipschitz, so gap/speed is a conservative time advance.
  function sweepSphereTriangle(start,end,tri,radius) {
    const delta=sub(end,start), speed=len(delta);
    if(speed<1e-8) return null;
    let t=0, lastT=0;
    for(let it=0;it<cfg.maxSweepIterations;it++) {
      const p=add(start,mul(delta,t)), q=closestPointTriangle(p,tri[0],tri[1],tri[2]);
      const sep=sub(p,q), dist=len(sep), gap=dist-radius;
      if(gap<=cfg.sweepTolerance) {
        if(t<=1e-7) return null; // initial overlap is handled by discrete penetration resolution
        const n=dist>1e-8?mul(sep,1/dist):null;
        return {t,center:p,point:q,distance:dist,normal:n};
      }
      const step=gap/speed;
      if(!finite(step)||step<=1e-8) break;
      lastT=t; t+=Math.max(step*0.9,1e-7);
      if(t>1) break;
      if(t<=lastT) break;
    }
    const p=end,q=closestPointTriangle(p,tri[0],tri[1],tri[2]),dist=len(sub(p,q));
    if(dist<=radius+cfg.sweepTolerance && dist>radius*0.8) return {t:1,center:p,point:q,distance:dist,normal:dist>1e-8?norm(sub(p,q)):null};
    return null;
  }

  function safeDecodeURIComponent(value) { try { return decodeURIComponent(value); } catch (_) { return String(value); } }
  function getModelURL(model) {
    const candidates=[model?._resource?.url,model?._resource?._url,model?._gltfResource?.url,model?._url,model?.url,model?._resource?.getUrlComponent?.(true)];
    for(const x of candidates) {
      const s=typeof x==="string"?x:(x&&typeof x.url==="string"?x.url:null);
      if(s && /\.glb(?:[?#]|$)/i.test(s)) return s;
    }
    return null;
  }
  function modelReady(model) {
    try { return !!model && !(model.isDestroyed&&model.isDestroyed()) && model.show!==false && !!model.modelMatrix && (model.ready===undefined||model.ready===true); }
    catch(_) { return false; }
  }
  function aircraftModelSet() {
    const set=new Set();
    const models=G.aircraft?.instance?.models||[];
    for(const m of models) set.add(m?._model||m);
    return set;
  }
  function loadGeometry(url) {
    if(state.geometryCache.has(url)) return Promise.resolve(state.geometryCache.get(url));
    if(state.geometryPending.has(url)) return state.geometryPending.get(url);
    const pending=(async()=>{
      const response=await W.fetch(url,{mode:"cors",credentials:"omit"});
      if(!response.ok) throw new Error("GLB取得失敗 HTTP "+response.status+": "+url);
      const contentLength=Number(response.headers?.get?.("content-length"));
      if(finite(contentLength) && contentLength>cfg.maxBufferBytes) throw new Error("GLB Content-LengthがmaxBufferBytes上限を超えています: "+contentLength);
      const glbBytes=await response.arrayBuffer();
      if(glbBytes.byteLength>cfg.maxBufferBytes) throw new Error("GLB実データがmaxBufferBytes上限を超えています: "+glbBytes.byteLength);
      const parsed=parseGLB(glbBytes);
      const buffers=await loadBuffers(parsed,url);
      const meshopt=await decodeMeshoptViews(parsed.json,buffers);
      const geometry=await buildGeometryTriangles(parsed.json,buffers,meshopt.map);
      const built=buildBVH(geometry);
      // JS BVH nodes contain objects and small arrays; 192 bytes/node is a conservative estimate.
      const bytes=built.verts.byteLength+built.triMin.byteLength+built.triMax.byteLength+built.centroids.byteLength+built.order.byteLength+built.nodes.length*192;
      if(bytes>cfg.maxGeometryBytes) throw new Error("BVHを含む推定メモリが1モデル上限を超えました");
      const cached=[...state.geometryCache.values()].reduce((sum,g)=>sum+g.memoryBytes,0);
      if(cached+bytes>cfg.maxTotalCacheBytes) throw new Error("GLB衝突形状キャッシュ合計が上限を超えました。GeoFSGLBPhysics.clearGeometryCache()を使用してください");
      built.memoryBytes=bytes;
      built.compression={dracoPrimitives:geometry.dracoCount,meshoptViews:meshopt.views,meshoptBytes:meshopt.bytes};
      state.geometryCache.set(url,built);
      log("GLB形状の準備完了",{url,triangles:built.triCount,bytes,memoryMiB:(bytes/1048576).toFixed(1),compression:built.compression});
      return built;
    })();
    state.geometryPending.set(url,pending);
    pending.finally(()=>{if(state.geometryPending.get(url)===pending)state.geometryPending.delete(url);}).catch(()=>{});
    return pending;
  }

  // ----- Collider registry -----
  async function registerGLB(url,model,options={}) {
    if(model?._model) model=model._model;
    if(!model) throw new Error("registerGLB(url, model): Cesium.Modelが必要です");
    if(options.moving) throw new Error("移動するGLBコライダーは0.3.1では未対応です。静的モデルのみ登録できます。");
    if(!url) url=getModelURL(model);
    if(!url) throw new Error("GLB URLを取得できません。registerGLB(url, model)でURLを明示してください");
    if(state.byModel.has(model)) return state.byModel.get(model);
    if(model.readyPromise) await model.readyPromise;
    if(!modelReady(model)) throw new Error("Cesium.Modelが未準備、非表示、または破棄済みです");
    const geometry=await loadGeometry(url);
    const matrix=getModelToWorld(model), inv=matrixInverse(matrix);
    const collider={
      id:state.nextId++,url,model,geometry,label:options.label||safeDecodeURIComponent(url.split("/").pop().split(/[?#]/)[0]),
      enabled:true,friction:finite(options.friction)?Math.max(0,options.friction):cfg.friction,
      dynamicFriction:finite(options.dynamicFriction)?clamp(options.dynamicFriction,0,1):cfg.dynamicFriction,
      restitution:finite(options.restitution)?clamp(options.restitution,0,1):cfg.restitution,
      radius:finite(options.radius)?Math.max(0.02,options.radius):null,
      localMatrix:options.localMatrix?matrixArray(options.localMatrix):matIdentity(),
      registeredTransform:null,
      transform:matrix,inverse:inv,worldBounds:null
    };
    // localMatrix is applied after glTF node transforms, before the Cesium model transform.
    if(options.localMatrix) {
      collider.transform=matMul(matrix,collider.localMatrix);
      collider.inverse=matrixInverse(collider.transform);
    }
    collider.registeredTransform=collider.transform.slice();
    updateColliderBounds(collider);
    state.colliders.push(collider);state.byModel.set(model,collider);
    log("コライダー登録完了",{id:collider.id,label:collider.label,triangles:geometry.triCount,memoryMiB:(geometry.memoryBytes/1048576).toFixed(1)});
    return collider;
  }
  function updateColliderBounds(collider) {
    const m=collider.transform,g=collider.geometry,b=g.bounds;
    const mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
    for(let mask=0;mask<8;mask++) {
      const p=matPoint(m,[mask&1?b.max[0]:b.min[0],mask&2?b.max[1]:b.min[1],mask&4?b.max[2]:b.min[2]]);
      for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],p[k]);mx[k]=Math.max(mx[k],p[k]);}
    }
    collider.worldBounds={min:mn,max:mx};
  }
  function updateColliderTransforms() {
    for(const collider of state.colliders) {
      if(!collider.enabled || !modelReady(collider.model)) continue;
      let base;
      try { base=getModelToWorld(collider.model); }
      catch(e){collider.enabled=false;warn("変換取得に失敗したためコライダーを停止しました",collider.label,e);continue;}
      const combined=matMul(base,collider.localMatrix);
      if(!matrixNearlyEqual(combined,collider.registeredTransform,1e-7)) {
        collider.enabled=false;
        warn("登録後にモデル行列が変化したため静的コライダーを停止しました。移動物体の相対速度は0.3.1では未対応です。再登録してください。",collider.label);
      }
    }
  }

  function unregister(target) {
    const model=target?._model||target;
    const col=state.byModel.get(model); if(!col)return false;
    col.enabled=false;state.byModel.delete(model);
    const i=state.colliders.indexOf(col);if(i>=0)state.colliders.splice(i,1);
    return true;
  }

  // ----- Aircraft point capture / collision -----
  function capturePoints(aircraft) {
    if(!aircraft?.object3d||!Array.isArray(aircraft.collisionPoints)) return null;
    aircraft.object3d.compute(aircraft.llaLocation);
    const lla=aircraft.llaLocation.slice(), points=[];
    for(let i=0;i<aircraft.collisionPoints.length;i++) {
      const cp=aircraft.collisionPoints[i];
      if(!cp || !isVec3(cp.worldPosition) || cp.wrongAltitude) continue;
      const local=array3(cp.worldPosition), ecef=pointENUToECEF(local,lla);
      points.push({id:i,cp,local,ecef});
    }
    return {lla,points};
  }
  function pointBroadphase(start,end,bounds,radius) {
    const mn=[Math.min(start[0],end[0])-radius,Math.min(start[1],end[1])-radius,Math.min(start[2],end[2])-radius];
    const mx=[Math.max(start[0],end[0])+radius,Math.max(start[1],end[1])+radius,Math.max(start[2],end[2])+radius];
    return aabbIntersects(mn,mx,bounds.min,bounds.max);
  }
  function candidateSet(collider,startWorld,endWorld,radius) {
    const inv=collider.inverse;
    const s=matPoint(inv,startWorld),e=matPoint(inv,endWorld);
    const invNorm=inverseLinearFrobenius(inv);
    const localRadius=radius*invNorm+1e-4;
    const qMin=[Math.min(s[0],e[0])-localRadius,Math.min(s[1],e[1])-localRadius,Math.min(s[2],e[2])-localRadius];
    const qMax=[Math.max(s[0],e[0])+localRadius,Math.max(s[1],e[1])+localRadius,Math.max(s[2],e[2])+localRadius];
    return queryBVH(collider.geometry,qMin,qMax,cfg.maxCandidateTriangles);
  }
  function contactNormal(center,closest,tri,movement) {
    const radial=sub(center,closest),d=len(radial);
    if(d>1e-7) return mul(radial,1/d);
    let n=triangleNormal(tri);
    if(movement && dot(n,movement)>0)n=mul(n,-1);
    return n;
  }
  function findPointContacts(startWorld,endWorld,radius,collider,pointId,angularExtra,includeSweep=true) {
    const g=collider.geometry,m=collider.transform;
    const effectiveRadius=radius+angularExtra;
    if(!pointBroadphase(startWorld,endWorld,collider.worldBounds,effectiveRadius)) return [];
    const candidates=candidateSet(collider,startWorld,endWorld,effectiveRadius);
    state.stats.candidateTriangles+=candidates.length;
    const overlaps=[],sweeps=[],move=sub(endWorld,startWorld);
    for(const id of candidates) {
      const tri=triWorld(g,id,m);
      const qEnd=closestPointTriangle(endWorld,tri[0],tri[1],tri[2]);
      const dEnd=len(sub(endWorld,qEnd));
      if(dEnd<=effectiveRadius+cfg.sweepTolerance) {
        const n=contactNormal(endWorld,qEnd,tri,move);
        overlaps.push({collider,triangle:id,pointId,point:qEnd,normal:n,radius,queryRadius:effectiveRadius,penetration:Math.max(0,radius-dEnd),swept:false,t:1});
      }
      if(includeSweep && dEnd>effectiveRadius+cfg.sweepTolerance && len2(move)>1e-8) {
        const hit=sweepSphereTriangle(startWorld,endWorld,tri,effectiveRadius);
        if(hit) {
          const n=hit.normal||contactNormal(hit.center,hit.point,tri,move);
          sweeps.push({collider,triangle:id,pointId,point:hit.point,normal:n,radius,queryRadius:effectiveRadius,penetration:0,swept:true,t:hit.t,centerAtImpact:hit.center});
        }
      }
    }
    // Keep earliest swept hit, then a small contact manifold of endpoint overlaps.
    sweeps.sort((a,b)=>a.t-b.t);
    overlaps.sort((a,b)=>b.penetration-a.penetration);
    const out=[],pool=[...sweeps.slice(0,1),...overlaps];
    for(const c of pool) {
      if(out.some(r=>dot(r.normal,c.normal)>0.94 && len2(sub(r.point,c.point))<Math.max(0.04,effectiveRadius*effectiveRadius*0.25))) continue;
      out.push(c);
      if(out.length>=cfg.maxContactsPerPoint)break;
    }
    return out;
  }

  function dedupeContacts(contacts) {
    contacts.sort((a,b)=> (a.swept===b.swept ? (a.swept ? (a.t||1)-(b.t||1) : (b.penetration||0)-(a.penetration||0)) : (a.swept?-1:1)));
    const result=[];
    for(const c of contacts) {
      const duplicate=result.some(r=>r.pointId===c.pointId && r.collider===c.collider && dot(r.normal,c.normal)>0.985 && len2(sub(r.point,c.point))<0.04);
      if(!duplicate) result.push(c);
    }
    const byPoint=new Map();
    for(const c of result) {
      let list=byPoint.get(c.pointId);if(!list)byPoint.set(c.pointId,list=[]);
      if(list.length<cfg.maxContactsPerPoint)list.push(c);
    }
    return [...byPoint.values()].flat();
  }
  function rotationalExpansion(aircraft,dt,cpLocal) {
    if(!cfg.rotationalInflation) return 0;
    const w=aircraft.rigidBody?.v_angularVelocity;
    if(!isVec3(w)) return 0;
    const angle=len(w)*Math.max(0,dt);
    if(angle<1e-5) return 0;
    const radius=len(cpLocal);
    // Sagitta bound for an arc of radius |r|, capped conservatively for large turns.
    const extra=angle<=Math.PI?radius*(1-Math.cos(angle/2)):2*radius;
    return Math.min(extra,Math.max(10,2*radius));
  }
  function earliestTOI(contacts) {
    const swept=contacts.filter(c=>c.swept && finite(c.t)).sort((a,b)=>a.t-b.t);
    return swept.length ? clamp(swept[0].t,0,1) : null;
  }
  function moveRootToEarliestTOI(aircraft,contacts,pointMap) {
    const t=earliestTOI(contacts);
    if(t===null) return null;
    const c=contacts.filter(x=>x.swept && Math.abs(x.t-t)<1e-7)[0], startEnd=pointMap.get(c.pointId);
    if(!startEnd)return null;
    const at=add(startEnd.start,mul(sub(startEnd.end,startEnd.start),t));
    const delta=sub(at,startEnd.end);
    translateAircraftECEF(aircraft,delta);
    state.stats.correctionMeters+=len(delta);
    return t;
  }
  function cloneNested(value) {
    if(Array.isArray(value)) return value.map(cloneNested);
    if(value && typeof value==="object") { const o={}; for(const [k,v] of Object.entries(value))o[k]=cloneNested(v); return o; }
    return value;
  }
  function snapshotAircraftPose(aircraft) {
    const o=aircraft.object3d;
    return {lla:aircraft.llaLocation.slice(),initialRotation:cloneNested(o._initialRotation),rotation:cloneNested(o._rotation)};
  }
  function restoreAircraftPose(aircraft,snapshot) {
    if(!snapshot) return false;
    aircraft.llaLocation=snapshot.lla.slice();
    if(snapshot.initialRotation) aircraft.object3d._initialRotation=cloneNested(snapshot.initialRotation);
    if(snapshot.rotation) aircraft.object3d._rotation=cloneNested(snapshot.rotation);
    aircraft.object3d.compute(aircraft.llaLocation);
    return true;
  }
  function currentPointForId(aircraft,id) {
    const cp=aircraft.collisionPoints?.[id];
    if(!cp || !isVec3(cp.worldPosition))return null;
    return {cp,local:array3(cp.worldPosition),ecef:pointENUToECEF(cp.worldPosition,aircraft.llaLocation)};
  }
  function resolveContacts(aircraft,contacts,dt) {
    if(!contacts.length)return;
    const rb=aircraft.rigidBody;
    const impulseApplied=new Set();
    let correctionBudget=cfg.maxPositionCorrection;
    for(let iteration=0;iteration<cfg.solverIterations;iteration++) {
      let moved=false;
      for(const c of contacts) {
        const point=currentPointForId(aircraft,c.pointId);if(!point)continue;
        const tri=triWorld(c.collider.geometry,c.triangle,c.collider.transform);
        const q=closestPointTriangle(point.ecef,tri[0],tri[1],tri[2]);
        const distance=len(sub(point.ecef,q));
        const radius=c.radius||cfg.pointRadius;
        if(distance>radius+0.02 && !c.forceTOI) continue;
        const n=distance>1e-7?mul(sub(point.ecef,q),1/distance):(c.normal||triangleNormal(tri));
        const penetration=Math.max(0,radius-distance-cfg.penetrationSlop);
        if(penetration>0.001 && correctionBudget>1e-4) {
          const amount=Math.min(correctionBudget,penetration*cfg.correctionPercent);
          translateAircraftECEF(aircraft,mul(n,amount));
          correctionBudget-=amount;
          state.stats.correctionMeters+=amount;moved=true;
        }
        const key=c.pointId+":"+c.collider.id+":"+c.triangle;
        if(!impulseApplied.has(key)) {
          impulseApplied.add(key);
          const current=currentPointForId(aircraft,c.pointId);if(!current)continue;
          const normalENU=norm(vectorECEFToENU(n,aircraft.llaLocation));
          const r=current.local;
          const v=rb.getVelocityInLocalPoint(r);
          const vn=dot(normalENU,v);
          if(vn< -0.015) {
            const contactProps=current.cp.contactProperties||{};
            const restitution=finite(c.collider.restitution)?c.collider.restitution:cfg.restitution;
            let jn;
            try { jn=rb.computeJacobian(restitution,vn,r,normalENU); }
            catch(_) { jn=-(1+restitution)*vn/(rb.s_inverseMass||1); }
            if(finite(jn)&&jn>0) {
              rb.applyImpulse(mul(normalENU,jn),r);state.stats.impulses++;
              const after=rb.getVelocityInLocalPoint(r);
              const tangent= sub(after,mul(normalENU,dot(normalENU,after)));
              const ts=len(tangent);
              if(ts>1e-5) {
                const dir=mul(tangent,1/ts);
                let jt;
                try { jt=rb.computeJacobian(0,ts,r,dir); }
                catch(_) { jt=-ts/(rb.s_inverseMass||1); }
                const mu=finite(contactProps.frictionCoef)?Math.max(0,contactProps.frictionCoef):c.collider.friction;
                const dynamicScale=finite(contactProps.dynamicFriction)?clamp(contactProps.dynamicFriction,0,1):c.collider.dynamicFriction;
                // Static friction cancels tangential speed when within the static
                // Coulomb limit; otherwise kinetic friction is capped by mu_k * Jn.
                const maxKineticFriction=mu*dynamicScale*jn;
                if(Math.abs(jt)>mu*jn && Math.abs(jt)>1e-12) jt=-Math.min(Math.abs(jt),maxKineticFriction);
                if(finite(jt) && Math.abs(jt)>1e-7) { rb.applyImpulse(mul(dir,jt),r);state.stats.impulses++; }
              }
            }
          }
        }
      }
      if(moved) aircraft.object3d.compute(aircraft.llaLocation);
    }
  }
  function collectContactsForStep(aircraft,before,after,dt,includeSweep) {
    if(!before||!after)return {contacts:[],pointMap:new Map()};
    const beforeById=new Map(before.points.map(p=>[p.id,p]));
    const pointMap=new Map();let all=[];
    for(const end of after.points) {
      const start=beforeById.get(end.id);if(!start)continue;
      pointMap.set(end.id,{start:start.ecef,end:end.ecef});
      const extra=rotationalExpansion(aircraft,dt,start.local);
      for(const collider of state.colliders) {
        if(!collider.enabled||!modelReady(collider.model))continue;
        if(aircraftModelSet().has(collider.model))continue;
        state.stats.queries++;
        const radius=end.cp.physicsCollisionRadius&&finite(end.cp.physicsCollisionRadius)?end.cp.physicsCollisionRadius:(collider.radius||cfg.pointRadius);
        try { all.push(...findPointContacts(start.ecef,end.ecef,radius,collider,end.id,extra,includeSweep)); }
        catch(e) { state.stats.errors++;state.lastError=String(e?.message||e);if(cfg.debug)warn("衝突候補探索エラー",collider.label,e); }
      }
    }
    return {contacts:dedupeContacts(all),pointMap};
  }
  function runCollisionStep(aircraft,before,dt,deferTOI=false) {
    if(!before||!aircraft||!aircraft.rigidBody||!state.colliders.length)return null;
    updateColliderTransforms();
    const after=capturePoints(aircraft);if(!after)return null;
    const scan=collectContactsForStep(aircraft,before,after,dt,true);
    let contacts=scan.contacts;
    if(!contacts.length)return null;
    state.stats.contacts+=contacts.length;
    state.stats.sweptContacts+=contacts.filter(c=>c.swept).length;
    const impactT=earliestTOI(contacts);
    if(impactT!==null && impactT>1e-6 && impactT<1-1e-5 && deferTOI) {
      // Native mode will restore the pre-segment aircraft pose and re-integrate
      // exactly to this fraction before resolving contact. No end-pose translation hack.
      return {toi:impactT,contacts,pointMap:scan.pointMap};
    }
    if(impactT!==null && impactT>1e-6 && impactT<1-1e-5 && !deferTOI) {
      // Compatibility fallback only for a third-party-wrapped integrator whose
      // semantics cannot safely be split. This is less accurate for rotation.
      moveRootToEarliestTOI(aircraft,contacts,scan.pointMap);
      const impact=capturePoints(aircraft);
      const refreshed=collectContactsForStep(aircraft,impact,impact,dt,false).contacts;
      contacts=refreshed.length?refreshed:contacts.filter(c=>c.swept).slice(0,1).map(c=>Object.assign({},c,{forceTOI:true}));
    }
    resolveContacts(aircraft,contacts,dt);
    aircraft.object3d.compute(aircraft.llaLocation);
    return impactT;
  }

  // ----- GeoFS 3.9 integration hook -----
  function restoreBodyHook() {
    if(state.activeBody && state.patchedIntegrateTransform && state.activeBody.integrateTransform===state.patchedIntegrateTransform) {
      state.activeBody.integrateTransform=state.originalIntegrateTransform;
    }
    state.activeBody=null;state.originalIntegrateTransform=null;state.patchedIntegrateTransform=null;
  }
  function attachActiveAircraft() {
    const aircraft=G.aircraft?.instance, body=aircraft?.rigidBody;
    if(!body || typeof body.integrateTransform!=="function") return false;
    if(state.activeBody===body && body.integrateTransform===state.patchedIntegrateTransform) return true;
    restoreBodyHook();
    const original=body.integrateTransform;
    const source=Function.prototype.toString.call(original);
    // The GeoFS 3.9 native function integrates the already-updated velocities and clears
    // forces. It is safe to split that pose integration into smaller pieces. If another
    // add-on wrapped the function, retain its one-call semantics instead.
    const canMicroStep=/clearForces/.test(source)&&/llaLocation/.test(source)&&/rotateInitialRotation/.test(source);
    const patched=function(dt) {
      if(state.destroyed || state.inPhysicsStep || G.aircraft?.instance!==aircraft || !finite(dt) || dt<=0 || !state.colliders.length) return original.apply(this,arguments);
      state.inPhysicsStep=true;state.stats.physicsSteps++;
      try {
        let before=null;
        try { before=capturePoints(aircraft); }
        catch(e) { state.stats.errors++;state.lastError=String(e?.message||e);warn("衝突点の取得に失敗。標準積分のみ実行します",e); }
        if(!canMicroStep) {
          const result=original.apply(this,arguments);
          if(before) try { runCollisionStep(aircraft,before,dt); }
          catch(e) { state.stats.errors++;state.lastError=String(e?.message||e);warn("物理サブステップ後のGLB衝突処理で例外:",e); }
          if(!state._warnedWrappedIntegrator) {
            state._warnedWrappedIntegrator=true;
            log("integrateTransformがGeoFS標準関数と確認できないため、外部ラッパーを壊さない単一積分モードで動作します");
          }
          return result;
        }
        const linear= isVec3(body.v_linearVelocity)?len(body.v_linearVelocity):0;
        const angular= isVec3(body.v_angularVelocity)?len(body.v_angularVelocity):0;
        const lever=finite(aircraft.boundingSphereRadius)?Math.max(0,aircraft.boundingSphereRadius):10;
        const estimatedTravel=(linear+angular*lever)*dt;
        const count=clamp(Math.ceil(estimatedTravel/Math.max(0.05,cfg.maxInternalStepTravel)),1,Math.max(1,Math.floor(cfg.maxInternalSubsteps)));
        const plannedPart=dt/count;
        let timeLeft=dt,totalEvents=0;
        while(timeLeft>1e-7) {
          let segment=Math.min(plannedPart,timeLeft), segmentEvents=0;
          while(segment>1e-7) {
            let start=null,poseBefore=null;
            const used=segment;
            try {
              start=capturePoints(aircraft);
              // Resolve any pre-existing overlap at the beginning of this interval.
              // This covers spawned/reset aircraft that start inside a static mesh;
              // the CCD sweep itself intentionally ignores t=0 initial overlap.
              if(start) {
                const initialContacts=collectContactsForStep(aircraft,start,start,0,false).contacts;
                if(initialContacts.length) {
                  resolveContacts(aircraft,initialContacts,used);
                  aircraft.object3d.compute(aircraft.llaLocation);
                  start=capturePoints(aircraft);
                }
              }
              poseBefore=snapshotAircraftPose(aircraft);
            }
            catch(e) { state.stats.errors++;state.lastError=String(e?.message||e);warn("衝突点/姿勢の取得に失敗。残り時間は標準積分します",e); }
            original.call(this,used); // integrateTransform uses the already integrated rigid-body velocities.
            if(!start || !state.colliders.length) {
              timeLeft-=used;segment=0;continue;
            }
            let result=null;
            try { result=runCollisionStep(aircraft,start,used,true); }
            catch(e) { state.stats.errors++;state.lastError=String(e?.message||e);warn("GLB衝突処理で例外。該当区間は標準積分結果を維持します",e); }
            if(result && typeof result==="object" && finite(result.toi) && result.toi>1e-6 && result.toi<1-1e-5 && poseBefore) {
              const advanced=Math.max(used*result.toi,Math.min(used*0.02,1e-4));
              // Restore both translation and the exact GeoFS root rotation, then
              // call the native integrator for only the elapsed time to first contact.
              restoreAircraftPose(aircraft,poseBefore);
              original.call(this,advanced);
              aircraft.object3d.compute(aircraft.llaLocation);
              const impact=capturePoints(aircraft);
              const impactContacts=impact?collectContactsForStep(aircraft,impact,impact,0,false).contacts:[];
              if(impactContacts.length) {
                resolveContacts(aircraft,impactContacts,advanced);
                aircraft.object3d.compute(aircraft.llaLocation);
              }
              // If angular inflation produced an early conservative candidate but
              // the actual rotated pose is not touching yet, do not invent an impulse.
              timeLeft-=advanced;
              segment=used-advanced;
              totalEvents++;segmentEvents++;
              if(totalEvents>=cfg.maxTOIEventsPerStep || segmentEvents>=cfg.maxTOIEventsPerStep) {
                original.call(this,segment);
                timeLeft-=segment;segment=0;
              }
            } else {
              timeLeft-=used;segment=0;
            }
          }
        }
      } finally { state.inPhysicsStep=false; }
    };
    body.integrateTransform=patched;
    state.activeBody=body;state.originalIntegrateTransform=original;state.patchedIntegrateTransform=patched;
    log("機体rigidBodyへサブステップhookを接続しました",{nativeMicroStepping:canMicroStep});
    return true;
  }

  state.patchedFlightTick=function() {
    if(state.destroyed) return state.originalFlightTick.apply(this,arguments);
    attachActiveAircraft();
    return state.originalFlightTick.apply(this,arguments);
  };
  F.tick=state.patchedFlightTick;

  // ----- Registration helpers / public API -----
  function scanSceneCollection(collection,models,visited,depth) {
    if(!collection || depth>20 || visited.has(collection))return;
    if(typeof collection.length!=="number" || typeof collection.get!=="function")return;
    visited.add(collection);
    for(let i=0;i<collection.length;i++) {
      let item;try{item=collection.get(i);}catch(_){continue;}
      if(!item)continue;
      if(C.Model && item instanceof C.Model) models.add(item);
      else if(item.constructor?.name==="Model" && item.modelMatrix && typeof item.readyPromise!=="undefined") models.add(item);
      else if(typeof item.get==="function" && typeof item.length==="number") scanSceneCollection(item,models,visited,depth+1);
    }
  }
  async function scanExisting() {
    const models=new Set(),visited=new Set();
    scanSceneCollection(G.api.viewer.scene.primitives,models,visited,0);
    const aircraft=aircraftModelSet();
    const jobs=[];
    for(const model of models) {
      if(aircraft.has(model)||state.byModel.has(model))continue;
      const url=getModelURL(model);if(!url)continue;
      jobs.push(registerGLB(url,model).catch(e=>{warn("自動登録失敗",url,e);return null;}));
    }
    await Promise.all(jobs);
    log("シーン走査完了",{models:models.size,registered:state.colliders.length});
    return state.colliders.length;
  }
  async function addGLB(url,options={}) {
    if(typeof G.api.Model!=="function") throw new Error("geofs.api.Modelがありません");
    // Pre-parse first so malformed/unsupported assets fail before being added to the scene.
    await loadGeometry(url);
    const modelOptions=Object.assign({},options.modelOptions||{});
    if(options.location)modelOptions.location=options.location;
    if(options.rotation)modelOptions.rotation=options.rotation;
    const wrapper=new G.api.Model(url,modelOptions);
    await wrapper.loadedPromise;await wrapper.readyPromise;
    if(options.scale!==undefined)wrapper.setScale(options.scale);
    const collider=await registerGLB(url,wrapper._model,options);
    return {model:wrapper._model,wrapper,collider};
  }
  function stats() {
    return {
      version:VERSION,
      geoFSVersion:G.version,
      cesiumVersion:C.VERSION,
      colliderCount:state.colliders.length,
      triangleCount:state.colliders.reduce((n,c)=>n+c.geometry.triCount,0),
      geometryCount:state.geometryCache.size,
      geometryMemoryBytes:[...state.geometryCache.values()].reduce((n,g)=>n+g.memoryBytes,0),
      hooked:!!state.activeBody,
      colliders:state.colliders.map(c=>({id:c.id,label:c.label,triangles:c.geometry.triCount,enabled:c.enabled,compression:c.geometry.compression})),
      counters:Object.assign({},state.stats),
      lastError:state.lastError,
      settings:Object.assign({},cfg)
    };
  }
  function setOptions(options={}) {
    const numeric={
      pointRadius:[0.02,10],restitution:[0,1],friction:[0,10],dynamicFriction:[0,1],
      correctionPercent:[0,1],penetrationSlop:[0,1],maxPositionCorrection:[0.01,100],
      solverIterations:[1,16],maxContactsPerPoint:[1,12],maxCandidateTriangles:[100,100000],
      bvhLeafSize:[2,64],maxTriangles:[1000,1000000],maxGeometryBytes:[1048576,1073741824],
      maxTotalCacheBytes:[1048576,2147483648],maxBufferBytes:[1048576,2147483648],
      maxInternalStepTravel:[0.05,100],maxInternalSubsteps:[1,64],maxTOIEventsPerStep:[1,16],
      maxSweepIterations:[1,200],sweepTolerance:[0.0001,0.05]
    };
    const integer=new Set(["solverIterations","maxContactsPerPoint","maxCandidateTriangles","bvhLeafSize","maxTriangles","maxGeometryBytes","maxTotalCacheBytes","maxBufferBytes","maxInternalSubsteps","maxTOIEventsPerStep","maxSweepIterations"]);
    const booleans=new Set(["rotationalInflation","debug","autoScanOnStart"]);
    const strings=new Set(["dracoBaseURL","meshoptModuleURL"]);
    for(const [k,v] of Object.entries(options)) {
      if(numeric[k]) {
        const [min,max]=numeric[k];
        if(!finite(v) || (integer.has(k)&&!Number.isInteger(v))) throw new Error("設定値 "+k+" の型が不正です");
        cfg[k]=clamp(v,min,max);
      } else if(booleans.has(k)) {
        if(typeof v!=="boolean") throw new Error("設定値 "+k+" はbooleanで指定してください");
        cfg[k]=v;
      } else if(strings.has(k)) {
        if(typeof v!=="string" || !v.trim()) throw new Error("設定値 "+k+" はURL文字列で指定してください");
        cfg[k]=v;
      }
    }
    return Object.assign({},cfg);
  }
  function destroy() {
    if(state.destroyed)return;
    state.destroyed=true;
    restoreBodyHook();
    if(F.tick===state.patchedFlightTick)F.tick=state.originalFlightTick;
    state.colliders.length=0;state.byModel=new WeakMap();state.geometryCache.clear();state.geometryPending.clear();
    for(const u of state.objectURLs)try{URL.revokeObjectURL(u);}catch(_){}
    state.objectURLs.clear();
    if(W.GeoFSGLBPhysics===api)try{delete W.GeoFSGLBPhysics;}catch(_){W.GeoFSGLBPhysics=null;}
    if(W.GeoFSPhysics===api)try{delete W.GeoFSPhysics;}catch(_){W.GeoFSPhysics=null;}
    log("解除しました。GeoFS標準の地面・水面判定は変更していません。");
  }
  const api={
    version:VERSION,settings:cfg,
    registerGLB,unregister,scanExisting,addGLB,stats,setOptions,destroy,
    parseGLB,loadGeometry,buildBVH,
    setDecoderOverrides(overrides={}){state.decoderOverrides=Object.assign({},overrides);state.decoderPromises={draco:null,meshopt:null};return true;},
    rebind(){return attachActiveAircraft();},
    async selfTest(){
      const tri=[[0,0,0],[1,0,0],[0,1,0]];
      const cp=closestPointTriangle([0.2,0.2,1],tri[0],tri[1],tri[2]);
      const hit=sweepSphereTriangle([0.2,0.2,2],[0.2,0.2,-2],tri,0.5);
      const yAxis=matPoint([1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1],[0,1,0]);
      const xAxis=matPoint([0,0,1,0,0,1,0,0,-1,0,0,0,0,0,0,1],[1,0,0]);
      const json={asset:{version:"2.0"},buffers:[{byteLength:42}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:6}],accessors:[{bufferView:0,componentType:5126,count:3,type:"VEC3",min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5123,count:3,type:"SCALAR"}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1,mode:4}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
      const bin=new Uint8Array(44),dv=new DataView(bin.buffer);
      [[0,0,0],[1,0,0],[0,1,0]].flat().forEach((v,i)=>dv.setFloat32(i*4,v,true));
      [0,1,2].forEach((v,i)=>dv.setUint16(36+i*2,v,true));
      const jsonBytes=new TextEncoder().encode(JSON.stringify(json));
      const jsonLen=(jsonBytes.length+3)&~3,binLen=44,total=12+8+jsonLen+8+binLen;
      const glb=new ArrayBuffer(total),gd=new DataView(glb),u8=new Uint8Array(glb);
      gd.setUint32(0,0x46546c67,true);gd.setUint32(4,2,true);gd.setUint32(8,total,true);
      gd.setUint32(12,jsonLen,true);gd.setUint32(16,0x4e4f534a,true);u8.fill(0x20,20,20+jsonLen);u8.set(jsonBytes,20);
      const bo=20+jsonLen;gd.setUint32(bo,binLen,true);gd.setUint32(bo+4,0x004e4942,true);u8.set(bin,bo+8);
      const parsed=parseGLB(glb), buffers=[parsed.bin.subarray(0,42)];
      const geom=await buildGeometryTriangles(parsed.json,buffers,new Map());buildBVH(geom);
      const candidates=queryBVH(geom,[0.1,0.1,-0.1],[0.3,0.3,0.1],10);
      const edgeHit=sweepSphereTriangle([-1,0.5,0.4],[0.5,0.5,0.4],tri,0.5);
      const tm=[2,0,0,0,0,3,0,0,0,0,4,0,10,20,30,1],tp=[1,2,3],roundTrip=matPoint(matrixInverse(tm),matPoint(tm,tp));
      const badJson=JSON.parse(JSON.stringify(parsed.json));badJson.accessors[0].count=4;
      let rejectsBufferViewOverflow=false;try{await buildGeometryTriangles(badJson,buffers,new Map());}catch(_){rejectsBufferViewOverflow=true;}
      const noTOI=earliestTOI([{swept:false,t:1}]);
      const placeholderJSON={extensionsRequired:["KHR_meshopt_compression"],buffers:[{byteLength:12,uri:"compressed.bin"},{byteLength:24}],bufferViews:[{buffer:1,byteLength:12,extensions:{KHR_meshopt_compression:{buffer:0,byteOffset:0,byteLength:8,byteStride:4,count:3,mode:"ATTRIBUTES"}}}]};
      const placeholder=findMeshoptPlaceholderBuffers(placeholderJSON);
      const invalidPlaceholderJSON=JSON.parse(JSON.stringify(placeholderJSON));invalidPlaceholderJSON.bufferViews[0].buffer=1;invalidPlaceholderJSON.bufferViews[0].extensions.KHR_meshopt_compression.buffer=1;
      const invalidPlaceholder=findMeshoptPlaceholderBuffers(invalidPlaceholderJSON);
      const checks={closestPoint:len(sub(cp,[0.2,0.2,0]))<1e-7,sweptSphere:!!hit&&Math.abs(hit.t-0.375)<0.01,sweptSphereEdge:!!edgeHit,yUpCorrection:Math.abs(yAxis[2]-1)<1e-7,xUpCorrection:Math.abs(xAxis[2]-1)<1e-7,affineInverse:len(sub(roundTrip,tp))<1e-7,glbTriangle:geom.triCount===1,bvhQuery:candidates.length===1,bufferViewBounds:rejectsBufferViewOverflow,noHitIsNull:noTOI===null,meshoptPlaceholderAccepted:placeholder.has(1),meshoptCompressedBufferNotPlaceholder:!invalidPlaceholder.has(1)};
      const failed=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
      return {ok:failed.length===0,checks,failed,triangleCount:geom.triCount,toi:hit?.t};
    },
    clearGeometryCache(){state.geometryCache.clear();return true;}
  };
  W.GeoFSGLBPhysics=api;
  if(!W.GeoFSPhysics || /^0\.2\./.test(String(W.GeoFSPhysics.version||"")))W.GeoFSPhysics=api;

  log("導入完了。地面・水面APIは変更せず、機体の物理サブステップ後にGLB三角形衝突を処理します。");
  log("既存モデルを登録: await GeoFSGLBPhysics.scanExisting()");
  log("手動登録: await GeoFSGLBPhysics.registerGLB(url, cesiumModel)");
  log("状態確認: GeoFSGLBPhysics.stats() / 解除: GeoFSGLBPhysics.destroy()");
  if(cfg.autoScanOnStart) scanExisting().catch(warn);
})();
