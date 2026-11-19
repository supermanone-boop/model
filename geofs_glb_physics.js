/*
 * GeoFS GLB Physics Bridge 0.1.0
 * Console add-on for GeoFS + CesiumJS 1.96.
 *
 * - Reads static glTF 2.0 binary GLB geometry (POSITION + indices).
 * - Builds a local-space BVH for triangle queries.
 * - Adds sphere/triangle proximity and swept-segment contacts.
 * - Feeds contacts into GeoFS' existing rigidBody collision/impulse solver.
 * - Keeps GLB meshes separate from the terrain heightfield API.
 *
 * Limitations in this version: no Draco/Meshopt-compressed geometry, skins,
 * morph targets, or animated-node deformation. Geometry must be a static GLB.
 */
(() => {
  "use strict";

  const W = window;
  const G = W.geofs;
  const C = W.Cesium;
  const F = W.flight;

  if (!G || !G.api || !G.aircraft || !C || !F || typeof F.tick !== "function") {
    throw new Error("GeoFS GLB Physics: GeoFS / Cesium / flight.tick が見つかりません。ワールド読み込み後に実行してください。");
  }
  if (W.GeoFSPhysics && W.GeoFSPhysics.version) {
    console.warn("GeoFS GLB Physics は既に導入済みです。解除する場合: GeoFSPhysics.destroy()");
    return;
  }

  const cfg = {
    contactRadius: 0.85,       // 機体 collisionPoint を包む半径 [m]
    maxSweepDistance: 18,      // 1 tick間の連続衝突チェック上限 [m]
    maxCorrection: 2.5,        // 1 tickでの位置補正上限 [m]
    bvhLeafSize: 10,
    maxTriangles: 600000,
    enableSweep: true,
    enablePositionCorrection: true,
    debug: true
  };

  const state = {
    colliders: [],
    byModel: new WeakMap(),
    parseCache: new Map(),
    geometryCache: new Map(),
    geometryPending: new Map(),
    previousPoints: new Map(),
    lastAircraft: null,
    inTick: false,
    bestCorrection: null,
    pendingNormalRestore: null,
    originalGetCollisionResult: G.getCollisionResult,
    originalFlightTick: F.tick,
    originalTerrainElevationManagement: F.terrainElevationManagement,
    patchedGetCollisionResult: null,
    patchedFlightTick: null,
    patchedTerrainElevationManagement: null,
    nextId: 1,
    hits: 0,
    sweepHits: 0,
    queryCount: 0,
    destroyed: false
  };

  const log = (...a) => cfg.debug && console.log("[GeoFS GLB Physics]", ...a);
  const warn = (...a) => console.warn("[GeoFS GLB Physics]", ...a);
  const finite3 = v => v && Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const sub = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
  const add = (a,b) => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
  const mul = (a,s) => [a[0]*s,a[1]*s,a[2]*s];
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const len2 = a => dot(a,a);
  const length = a => Math.sqrt(len2(a));
  const norm = a => { const l=length(a); return l>1e-12?mul(a,1/l):[0,0,1]; };

  function matrixIdentity() {
    return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  }
  function matrixMultiply(a,b) {
    const o=new Array(16);
    for(let c=0;c<4;c++) for(let r=0;r<4;r++) {
      o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
    }
    return o;
  }
  function matrixFromTRS(t,q,s) {
    const x=q[0],y=q[1],z=q[2],w=q[3];
    const x2=x+x,y2=y+y,z2=z+z;
    const xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2;
    const wx=w*x2,wy=w*y2,wz=w*z2;
    return [
      (1-(yy+zz))*s[0],(xy+wz)*s[0],(xz-wy)*s[0],0,
      (xy-wz)*s[1],(1-(xx+zz))*s[1],(yz+wx)*s[1],0,
      (xz+wy)*s[2],(yz-wx)*s[2],(1-(xx+yy))*s[2],0,
      t[0],t[1],t[2],1
    ];
  }
  function transformPoint(m,p) {
    const x=p[0],y=p[1],z=p[2];
    const w=m[3]*x+m[7]*y+m[11]*z+m[15];
    const iw=w && w!==1 ? 1/w : 1;
    return [(m[0]*x+m[4]*y+m[8]*z+m[12])*iw,
            (m[1]*x+m[5]*y+m[9]*z+m[13])*iw,
            (m[2]*x+m[6]*y+m[10]*z+m[14])*iw];
  }

  function parseGLB(buffer) {
    const dv=new DataView(buffer);
    if(dv.byteLength<20 || dv.getUint32(0,true)!==0x46546c67) throw new Error("GLBヘッダーが不正です");
    const version=dv.getUint32(4,true), total=dv.getUint32(8,true);
    if(version!==2) throw new Error("このアドオンはglTF 2.0 GLB専用です (version="+version+")");
    if(total>dv.byteLength) throw new Error("GLBの宣言サイズが実データを超えています");
    let json=null, bin=null, off=12;
    while(off+8<=total) {
      const n=dv.getUint32(off,true), type=dv.getUint32(off+4,true); off+=8;
      if(off+n>total) throw new Error("GLBチャンクがファイル範囲外です");
      if(type===0x4e4f534a) {
        const bytes=new Uint8Array(buffer,off,n);
        const txt=new TextDecoder("utf-8").decode(bytes).replace(/[\u0000\u0020]+$/g,"");
        json=JSON.parse(txt);
      } else if(type===0x004e4942) {
        bin=new Uint8Array(buffer,off,n);
      }
      off+=n;
    }
    if(!json || !bin) throw new Error("GLB JSON/BINチャンクがありません");
    return {json,bin};
  }

  const COMPONENT = {
    5120:{bytes:1,read:(v,o)=>v.getInt8(o),signed:true,max:127},
    5121:{bytes:1,read:(v,o)=>v.getUint8(o),signed:false,max:255},
    5122:{bytes:2,read:(v,o)=>v.getInt16(o,true),signed:true,max:32767},
    5123:{bytes:2,read:(v,o)=>v.getUint16(o,true),signed:false,max:65535},
    5125:{bytes:4,read:(v,o)=>v.getUint32(o,true),signed:false,max:4294967295},
    5126:{bytes:4,read:(v,o)=>v.getFloat32(o,true),signed:true,max:1}
  };
  const TYPE_SIZE={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};

  function accessorReader(gltf,bin,index) {
    const a=gltf.accessors?.[index];
    if(!a) throw new Error("accessor " + index + " が見つかりません");
    if(a.sparse) throw new Error("sparse accessor はこの版では未対応です");
    const bv=gltf.bufferViews?.[a.bufferView];
    if(!bv || bv.buffer!==0) throw new Error("GLB内bufferViewが不正です");
    const ci=COMPONENT[a.componentType], comps=TYPE_SIZE[a.type];
    if(!ci || !comps) throw new Error("未対応のaccessor型です");
    const stride=bv.byteStride || ci.bytes*comps;
    const base=(bv.byteOffset||0)+(a.byteOffset||0);
    const dv=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
    return {
      count:a.count, comps, componentType:a.componentType,
      get(i,k) {
        const raw=ci.read(dv,base+i*stride+k*ci.bytes);
        if(!a.normalized) return raw;
        if(ci.signed) return Math.max(raw/ci.max,-1);
        return raw/ci.max;
      }
    };
  }

  function readPositions(gltf,bin,accessorIndex) {
    const r=accessorReader(gltf,bin,accessorIndex);
    if(r.comps!==3) throw new Error("POSITION accessor がVEC3ではありません");
    if(r.componentType!==5126) throw new Error("POSITIONはFLOAT(5126)のみ対応です。KHR_mesh_quantization等で量子化されたGLBは先に通常形式へ変換してください");
    const out=new Array(r.count);
    for(let i=0;i<r.count;i++) out[i]=[r.get(i,0),r.get(i,1),r.get(i,2)];
    return out;
  }
  function readIndices(gltf,bin,accessorIndex,count) {
    if(accessorIndex===undefined || accessorIndex===null) return Array.from({length:count},(_,i)=>i);
    const r=accessorReader(gltf,bin,accessorIndex);
    if(r.comps!==1) throw new Error("indices accessor がSCALARではありません");
    if(![5121,5123,5125].includes(r.componentType)) throw new Error("indices componentTypeはUNSIGNED_BYTE/SHORT/INTのみ対応です");
    const out=new Array(r.count);
    for(let i=0;i<r.count;i++) out[i]=r.get(i,0);
    return out;
  }

  function buildTriangles(gltf,bin) {
    const badExt=(gltf.extensionsUsed||[]).filter(x=>x.includes("draco")||x.includes("meshopt"));
    if(badExt.length) throw new Error("圧縮ジオメトリ未対応: "+badExt.join(", "));
    if(gltf.animations?.length) throw new Error("GLBアニメーション付きメッシュは未対応です。静的コライダー用GLBを使用してください");
    const triangles=[];
    const scene=gltf.scenes?.[gltf.scene||0];
    const roots=scene?.nodes || gltf.nodes?.map((n,i)=>i).filter(i=>!(gltf.nodes||[]).some(x=>(x.children||[]).includes(i))) || [];
    const nodes=gltf.nodes||[];
    const meshes=gltf.meshes||[];

    function emitNode(nodeIndex,parent) {
      const n=nodes[nodeIndex];
      if(!n) return;
      // A node referenced by multiple parents may legitimately appear multiple times.
      const local=n.matrix ? Array.from(n.matrix) : matrixFromTRS(n.translation||[0,0,0],n.rotation||[0,0,0,1],n.scale||[1,1,1]);
      const world=matrixMultiply(parent,local);
      if(n.skin!==undefined) throw new Error("スキニングされたGLBは未対応です");
      if(n.mesh!==undefined) {
        const mesh=meshes[n.mesh];
        if(!mesh) throw new Error("node mesh参照が不正です");
        for(const prim of mesh.primitives||[]) {
          if(prim.extensions?.KHR_draco_mesh_compression || prim.extensions?.EXT_meshopt_compression) throw new Error("primitive圧縮ジオメトリは未対応です");
          if(prim.targets?.length) throw new Error("morph target付きGLBは未対応です");
          const mode=prim.mode===undefined?4:prim.mode;
          if(mode!==4 && mode!==5 && mode!==6) continue;
          const posIndex=prim.attributes?.POSITION;
          if(posIndex===undefined) continue;
          const verts=readPositions(gltf,bin,posIndex).map(p=>transformPoint(world,p));
          const idx=readIndices(gltf,bin,prim.indices,verts.length);
          if(mode===4) {
            for(let i=0;i+2<idx.length;i+=3) addTriangle(verts,idx[i],idx[i+1],idx[i+2]);
          } else if(mode===5) {
            for(let i=0;i+2<idx.length;i++) {
              if(i&1) addTriangle(verts,idx[i+1],idx[i],idx[i+2]);
              else addTriangle(verts,idx[i],idx[i+1],idx[i+2]);
            }
          } else {
            for(let i=1;i+1<idx.length;i++) addTriangle(verts,idx[0],idx[i],idx[i+1]);
          }
        }
      }
      for(const child of n.children||[]) emitNode(child,world);
    }
    function addTriangle(v,ia,ib,ic) {
      if(ia>=v.length||ib>=v.length||ic>=v.length||ia<0||ib<0||ic<0) return;
      const a=v[ia],b=v[ib],c=v[ic];
      const ab=sub(b,a),ac=sub(c,a);
      if(len2(cross(ab,ac))<1e-16) return;
      const min=[Math.min(a[0],b[0],c[0]),Math.min(a[1],b[1],c[1]),Math.min(a[2],b[2],c[2])];
      const max=[Math.max(a[0],b[0],c[0]),Math.max(a[1],b[1],c[1]),Math.max(a[2],b[2],c[2])];
      triangles.push({a,b,c,min,max,centroid:mul(add(add(a,b),c),1/3)});
      if(triangles.length>cfg.maxTriangles) throw new Error("三角形数が上限 "+cfg.maxTriangles+" を超えました。GLBを分割/軽量化してください");
    }
    for(const root of roots) emitNode(root,matrixIdentity());
    if(!triangles.length) throw new Error("衝突対象のTRIANGLESメッシュがありません");
    return triangles;
  }

  function makeBounds(items) {
    const mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
    for(const t of items) for(let k=0;k<3;k++) { mn[k]=Math.min(mn[k],t.min[k]); mx[k]=Math.max(mx[k],t.max[k]); }
    return {min:mn,max:mx};
  }
  function buildBVH(triangles) {
    const order=triangles.map((_,i)=>i);
    function rec(ids) {
      const box=makeBounds(ids.map(i=>triangles[i]));
      if(ids.length<=cfg.bvhLeafSize) return {min:box.min,max:box.max,ids};
      const cmin=[Infinity,Infinity,Infinity],cmax=[-Infinity,-Infinity,-Infinity];
      for(const id of ids) for(let k=0;k<3;k++) { const v=triangles[id].centroid[k]; cmin[k]=Math.min(cmin[k],v); cmax[k]=Math.max(cmax[k],v); }
      let axis=0;
      if(cmax[1]-cmin[1]>cmax[axis]-cmin[axis]) axis=1;
      if(cmax[2]-cmin[2]>cmax[axis]-cmin[axis]) axis=2;
      ids.sort((i,j)=>triangles[i].centroid[axis]-triangles[j].centroid[axis]);
      const mid=ids.length>>1;
      return {min:box.min,max:box.max,left:rec(ids.slice(0,mid)),right:rec(ids.slice(mid))};
    }
    return rec(order);
  }
  function pointAABBDistance2(p,n) {
    let d=0;
    for(let k=0;k<3;k++) { const v=p[k]<n.min[k]?n.min[k]-p[k]:p[k]>n.max[k]?p[k]-n.max[k]:0; d+=v*v; }
    return d;
  }
  function closestPointTriangle(p,a,b,c) {
    const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);
    if(d1<=0&&d2<=0) return a;
    const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);
    if(d3>=0&&d4<=d3) return b;
    const vc=d1*d4-d3*d2;
    if(vc<=0&&d1>=0&&d3<=0) return add(a,mul(ab,d1/(d1-d3)));
    const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);
    if(d6>=0&&d5<=d6) return c;
    const vb=d5*d2-d1*d6;
    if(vb<=0&&d2>=0&&d6<=0) return add(a,mul(ac,d2/(d2-d6)));
    const va=d3*d6-d5*d4;
    if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0) return add(b,mul(sub(c,b),(d4-d3)/((d4-d3)+(d5-d6))));
    const denom=1/(va+vb+vc),v=vb*denom,w=vc*denom;
    return add(add(a,mul(ab,v)),mul(ac,w));
  }
  function rayAABB(o,d,node) {
    let lo=0,hi=1;
    for(let k=0;k<3;k++) {
      if(Math.abs(d[k])<1e-12) { if(o[k]<node.min[k]||o[k]>node.max[k]) return false; }
      else {
        const inv=1/d[k]; let t1=(node.min[k]-o[k])*inv,t2=(node.max[k]-o[k])*inv;
        if(t1>t2) { const t=t1;t1=t2;t2=t; }
        lo=Math.max(lo,t1);hi=Math.min(hi,t2);if(lo>hi)return false;
      }
    }
    return true;
  }
  function segmentTriangle(o,d,a,b,c) {
    const e1=sub(b,a),e2=sub(c,a),h=cross(d,e2),det=dot(e1,h);
    if(Math.abs(det)<1e-10) return null;
    const inv=1/det,s=sub(o,a),u=inv*dot(s,h);
    if(u<0||u>1) return null;
    const q=cross(s,e1),v=inv*dot(d,q);
    if(v<0||u+v>1) return null;
    const t=inv*dot(e2,q);
    return t>=0&&t<=1?t:null;
  }

  function getURL(model) {
    const candidates=[model?._resource?.url,model?._resource?._url,model?._gltfResource?.url,model?._url,model?.url];
    for(const v of candidates) if(typeof v==="string" && /\.glb(?:[?#]|$)/i.test(v)) return v;
    return null;
  }
  function modelAlive(m) {
    try { return !!m && !(m.isDestroyed && m.isDestroyed()) && m.show!==false && !!m.modelMatrix; }
    catch(_) { return false; }
  }
  function getScaleMin(matrix) {
    const m=matrix;
    const sx=Math.hypot(m[0],m[1],m[2]);
    const sy=Math.hypot(m[4],m[5],m[6]);
    const sz=Math.hypot(m[8],m[9],m[10]);
    return Math.max(1e-6,Math.min(sx,sy,sz));
  }
  function getScaleMax(matrix) {
    const m=matrix;
    return Math.max(Math.hypot(m[0],m[1],m[2]),Math.hypot(m[4],m[5],m[6]),Math.hypot(m[8],m[9],m[10]));
  }
  function getAxisCorrection(model) {
    // CesiumJS 1.96 Model uses Y_UP by default and applies this correction
    // after modelMatrix when drawing. Mirror that transform for physics.
    const exposed=model?.axisCorrectionMatrix||model?._axisCorrectionMatrix;
    if(exposed) return matrixToArray(exposed);
    let correction=matrixIdentity();
    const up=model?._upAxis ?? model?.upAxis ?? 1; // Cesium 1.96 default: Axis.Y
    const forward=model?._forwardAxis ?? model?.forwardAxis;
    if(forward===2 || forward==="Z") {
      const zUpToXUp=matrixIdentity();
      zUpToXUp[0]=0; zUpToXUp[2]=-1; zUpToXUp[8]=1; zUpToXUp[10]=0;
      correction=matrixMultiply(zUpToXUp,correction);
    }
    if(up===1 || up==="Y") {
      const yUpToZUp=matrixIdentity();
      yUpToZUp[5]=0; yUpToZUp[6]=1; yUpToZUp[9]=-1; yUpToZUp[10]=0;
      correction=matrixMultiply(yUpToZUp,correction);
    } else if(up===0 || up==="X") {
      const xUpToZUp=matrixIdentity();
      xUpToZUp[0]=0; xUpToZUp[2]=1; xUpToZUp[8]=-1; xUpToZUp[10]=0;
      correction=matrixMultiply(xUpToZUp,correction);
    }
    return correction;
  }
  function toCartesian(lla) {
    return C.Cartesian3.fromDegrees(lla[1],lla[0],lla[2],C.Ellipsoid.WGS84,new C.Cartesian3());
  }
  function enuFrameAt(lla) {
    const origin=toCartesian([lla[0],lla[1],0]);
    return C.Transforms.eastNorthUpToFixedFrame(origin);
  }
  function ecefVectorToENU(v,lla) {
    const frame=enuFrameAt(lla),inv=C.Matrix4.inverseTransformation(frame,new C.Matrix4());
    const out=C.Matrix4.multiplyByPointAsVector(inv,new C.Cartesian3(v[0],v[1],v[2]),new C.Cartesian3());
    return [out.x,out.y,out.z];
  }
  function enuVectorToECEF(v,lla) {
    const frame=enuFrameAt(lla);
    const out=C.Matrix4.multiplyByPointAsVector(frame,new C.Cartesian3(v[0],v[1],v[2]),new C.Cartesian3());
    return [out.x,out.y,out.z];
  }
  function matrixToArray(m) {
    const out=new Array(16);
    for(let i=0;i<16;i++) out[i]=m[i];
    return out;
  }
  function transformCesium(m,p) {
    const q=C.Matrix4.multiplyByPoint(m,new C.Cartesian3(p[0],p[1],p[2]),new C.Cartesian3());
    return [q.x,q.y,q.z];
  }
  function currentAircraftModels() {
    const a=G.aircraft?.instance;
    const set=new Set();
    for(const m of (a?.models||[])) set.add(m);
    return set;
  }
  function effectiveModelMatrix(collider) {
    const modelMatrix=matrixToArray(collider.model.modelMatrix);
    // Cesium Model.scale is separate from modelMatrix; GeoFS placement scale is already in modelMatrix.
    const cesiumScale=Number.isFinite(collider.model.scale)?collider.model.scale:1;
    const scaleMatrix=matrixIdentity();
    scaleMatrix[0]=scaleMatrix[5]=scaleMatrix[10]=cesiumScale;
    const axisCorrection=getAxisCorrection(collider.model);
    return matrixMultiply(matrixMultiply(matrixMultiply(modelMatrix,axisCorrection),scaleMatrix),collider.localMatrix);
  }

  async function registerGLB(url, model, options={}) {
    if(model?._model) model=model._model;
    if(!model) throw new Error("registerGLB: Cesium.Model が必要です");
    if(!url) url=getURL(model);
    if(!url) throw new Error("GLB URLを取得できません。registerGLB(url, model) でURLを明示してください");
    if(state.byModel.has(model)) return state.byModel.get(model);
    if(model.readyPromise) await model.readyPromise;
    if(!modelAlive(model)) throw new Error("モデルが未準備、非表示、または破棄済みです");
    let geometry=state.geometryCache.get(url);
    if(!geometry) {
      let pending=state.geometryPending.get(url);
      if(!pending) {
        pending=(async()=>{
          let parsed=state.parseCache.get(url);
          if(!parsed) {
            parsed=(async()=>{
              const response=await fetch(url,{mode:"cors",credentials:"omit"});
              if(!response.ok) throw new Error("GLB取得失敗 HTTP "+response.status+" : "+url);
              return parseGLB(await response.arrayBuffer());
            })();
            state.parseCache.set(url,parsed);
          }
          const data=await parsed;
          try {
            const triangles=buildTriangles(data.json,data.bin);
            const bvh=buildBVH(triangles);
            const root=bvh;
            const center=[(root.min[0]+root.max[0])/2,(root.min[1]+root.max[1])/2,(root.min[2]+root.max[2])/2];
            const radiusLocal=Math.hypot((root.max[0]-root.min[0])/2,(root.max[1]-root.min[1])/2,(root.max[2]-root.min[2])/2);
            const g={triangles,bvh,center,radiusLocal};
            state.geometryCache.set(url,g);
            return g;
          } finally {
            // Keep the compact BVH/triangle representation, not the full GLB binary.
            state.parseCache.delete(url);
          }
        })();
        state.geometryPending.set(url,pending);
      }
      try { geometry=await pending; }
      finally { if(state.geometryPending.get(url)===pending) state.geometryPending.delete(url); }
    }
    const localMatrix=options.localMatrix ? matrixToArray(options.localMatrix) : matrixIdentity();
    const collider={
      id:state.nextId++,url,model,triangles:geometry.triangles,bvh:geometry.bvh,
      centerLocal:geometry.center,radiusLocal:geometry.radiusLocal,
      radius:Number.isFinite(options.radius)?Math.max(0.05,options.radius):cfg.contactRadius,
      localMatrix,
      label:options.label||url.split("/").pop(),
      enabled:true,
      exclude:typeof options.exclude==="function"?options.exclude:null
    };
    state.colliders.push(collider);
    state.byModel.set(model,collider);
    log("三角形コライダー登録完了",{id:collider.id,label:collider.label,triangles:collider.triangles.length});
    return collider;
  }

  function unregister(target) {
    const model=target?._model||target;
    const collider=state.byModel.get(model);
    if(!collider) return false;
    collider.enabled=false;
    state.byModel.delete(model);
    const i=state.colliders.indexOf(collider);
    if(i>=0) state.colliders.splice(i,1);
    return true;
  }

  // Nearest-triangle search. modelToWorld maps GLB-local -> ECEF; worldToModel is its inverse.
  function nearestSurface(collider,pLocal,worldPoint,modelToWorld,localRadius) {
    const limit2=localRadius*localRadius;
    let best=null,bestD2=Infinity;
    const stack=[collider.bvh];
    while(stack.length) {
      const n=stack.pop();
      if(pointAABBDistance2(pLocal,n)>limit2) continue;
      if(n.ids) {
        for(const id of n.ids) {
          const tri=collider.triangles[id];
          const q=closestPointTriangle(pLocal,tri.a,tri.b,tri.c);
          const qw=transformCesium(modelToWorld,q);
          const d2=len2(sub(worldPoint,qw));
          if(d2<bestD2) bestD2=d2,best={tri,pointLocal:q,pointWorld:qw,distance:Math.sqrt(d2)};
        }
      } else { stack.push(n.left,n.right); }
    }
    return best;
  }
  function sweepSurface(collider,startLocal,endLocal,modelToWorld) {
    const d=sub(endLocal,startLocal);
    let bestT=Infinity,best=null;
    const stack=[collider.bvh];
    while(stack.length) {
      const n=stack.pop();
      if(!rayAABB(startLocal,d,n)) continue;
      if(n.ids) {
        for(const id of n.ids) {
          const tri=collider.triangles[id];
          const t=segmentTriangle(startLocal,d,tri.a,tri.b,tri.c);
          if(t!==null && t<bestT) {
            bestT=t;
            const p=add(startLocal,mul(d,t));
            best={tri,t,pointLocal:p,pointWorld:transformCesium(modelToWorld,p)};
          }
        }
      } else { stack.push(n.left,n.right); }
    }
    return best;
  }
  function triangleNormalECEF(tri,modelToWorld) {
    const a=transformCesium(modelToWorld,tri.a),b=transformCesium(modelToWorld,tri.b),c=transformCesium(modelToWorld,tri.c);
    return norm(cross(sub(b,a),sub(c,a)));
  }
  function orientNormal(n,lla,movementECEF,forceAgainstMotion,sideVectorECEF) {
    let enu=norm(ecefVectorToENU(n,lla));
    let motion=movementECEF;
    if(!motion) {
      const a=G.aircraft?.instance;
      const v=a?.rigidBody?.v_linearVelocity;
      if(v && finite3(v)) motion=enuVectorToECEF(v,lla);
    }
    // For a proximity contact, face the normal toward the aircraft point. This
    // makes two-sided wall/roof contact independent of GLB triangle winding.
    const flip = forceAgainstMotion
      ? (motion && dot(n,motion)>0)
      : (sideVectorECEF && len2(sideVectorECEF)>1e-8 && dot(n,sideVectorECEF)<0);
    if(flip) { n=mul(n,-1); enu=mul(enu,-1); }
    return {ecef:n,enu};
  }

  function nearAnyCollider(aircraft) {
    if(!aircraft?.llaLocation || !finite3(aircraft.llaLocation)) return false;
    const p=toCartesian(aircraft.llaLocation), world=[p.x,p.y,p.z];
    const aircraftRadius=Math.max(5,Number(aircraft.boundingSphereRadius)||8);
    const velocityMargin=Math.min(120,Math.max(0,Number(aircraft.velocityScalar)||0));
    const margin=aircraftRadius+velocityMargin+cfg.maxSweepDistance;
    const self=currentAircraftModels();
    for(const collider of state.colliders) {
      if(!collider.enabled || self.has(collider.model) || !modelAlive(collider.model)) continue;
      try {
        const m=effectiveModelMatrix(collider);
        const c=transformCesium(new C.Matrix4(...m),collider.centerLocal);
        const r=collider.radiusLocal*getScaleMax(m)+collider.radius+margin;
        if(len2(sub(world,c))<=r*r) return true;
      } catch(e) {
        if(cfg.debug) warn("GLB broadphase error",collider.label,e);
      }
    }
    return false;
  }

  function detectHit(lla, collisionPoint, collResult) {
    state.queryCount++;
    if(!finite3(lla) || !collisionPoint || collisionPoint.wrongAltitude) return null;
    const aircraft=G.aircraft?.instance;
    if(!aircraft || !aircraft.rigidBody) return null;
    const selfModels=currentAircraftModels();
    const currentWorld=toCartesian(lla);
    const pWorld=[currentWorld.x,currentWorld.y,currentWorld.z];
    const previous=state.previousPoints.get(collisionPoint.id);
    state.previousPoints.set(collisionPoint.id,pWorld);
    const movement=previous?sub(pWorld,previous):null;
    const movementLength=movement?length(movement):0;
    let best=null;

    for(const collider of state.colliders) {
      if(!collider.enabled || selfModels.has(collider.model) || !modelAlive(collider.model)) continue;
      if(collider.exclude && collider.exclude({lla,collisionPoint,aircraft,model:collider.model})) continue;
      try {
        // Compose GeoFS/Cesium model placement with optional local correction.
        const effective=effectiveModelMatrix(collider);
        const effectiveCesium=new C.Matrix4(...effective);
        const centerWorld=transformCesium(effectiveCesium,collider.centerLocal);
        const broadRadius=collider.radiusLocal*getScaleMax(effective)+collider.radius+(movementLength||0);
        if(len2(sub(pWorld,centerWorld))>broadRadius*broadRadius) continue;
        const inv=C.Matrix4.inverse(effectiveCesium,new C.Matrix4());
        const scaleMin=getScaleMin(effective);
        const localRadius=collider.radius/scaleMin+0.02;
        const curLocal=transformCesium(inv,pWorld);

        let sweep=null;
        if(cfg.enableSweep && previous && movementLength>0.15 && movementLength<=cfg.maxSweepDistance) {
          const prevLocal=transformCesium(inv,previous);
          sweep=sweepSurface(collider,prevLocal,curLocal,effectiveCesium);
        }
        let hit=null;
        if(sweep) {
          hit={kind:"sweep",tri:sweep.tri,pointLocal:sweep.pointLocal,pointWorld:sweep.pointWorld,distance:0};
        } else {
          const near=nearestSurface(collider,curLocal,pWorld,effectiveCesium,localRadius);
          if(near && near.distance<=collider.radius) hit={kind:"near",...near};
        }
        if(!hit) continue;

        const nECEF=triangleNormalECEF(hit.tri,effectiveCesium);
        const oriented=orientNormal(nECEF,lla,movement,hit.kind==="sweep",sub(pWorld,hit.pointWorld));
        const depth=hit.kind==="sweep"?collider.radius:Math.max(0,collider.radius-hit.distance);
        let corrENU;
        if(hit.kind==="sweep") {
          const correctionECEF=add(sub(hit.pointWorld,pWorld),mul(oriented.ecef,collider.radius));
          corrENU=ecefVectorToENU(correctionECEF,lla);
        } else {
          corrENU=mul(oriented.enu,depth);
        }
        const vertical=Math.max(0,corrENU[2]);
        // GeoFS already lifts penetrations above upward-facing surfaces. We supply
        // horizontal correction and the negative vertical part for underside hits.
        const correction=[corrENU[0],corrENU[1],Math.min(0,corrENU[2])];
        const score=depth + (hit.kind==="sweep"?0.5:0);
        if(!best || score>best.score) {
          best={collider,normal:oriented.enu,vertical,correction,depth,score,kind:hit.kind};
        }
      } catch(e) {
        if(cfg.debug) warn("コライダー照合エラー",collider.label,e);
      }
    }
    if(!best) return null;

    state.hits++;
    if(best.kind==="sweep") state.sweepHits++;
    if(cfg.enablePositionCorrection && state.inTick) {
      const correctionLength=length(best.correction);
      if(correctionLength>0.005 && (!state.bestCorrection || correctionLength>state.bestCorrection.length)) {
        const scale=Math.min(1,cfg.maxCorrection/correctionLength);
        state.bestCorrection={enu:mul(best.correction,scale),length:Math.min(correctionLength,cfg.maxCorrection)};
      }
    }
    if(collResult) collResult.normal=best.normal.slice();
    const result={
      location:[lla[0],lla[1],lla[2]+best.vertical],
      normal:best.normal.slice(),
      object:{glbPhysics:true,collider:best.collider,model:best.collider.model,label:best.collider.label}
    };
    return result;
  }

  function restoreCollisionNormal() {
    const p=state.pendingNormalRestore;
    if(!p) return;
    try {
      if(p.had) p.target.normal=p.value;
      else delete p.target.normal;
    } catch(_) {}
    state.pendingNormalRestore=null;
  }

  function applyPositionCorrection() {
    const correction=state.bestCorrection;
    state.bestCorrection=null;
    if(!correction || !G.aircraft?.instance || !C.Transforms) return;
    const a=G.aircraft.instance;
    if(!a.llaLocation || !finite3(a.llaLocation)) return;
    const v=correction.enu;
    const ecef=enuVectorToECEF(v,a.llaLocation);
    const p=toCartesian(a.llaLocation);
    const moved=C.Cartesian3.add(p,new C.Cartesian3(ecef[0],ecef[1],ecef[2]),new C.Cartesian3());
    const carto=C.Cartographic.fromCartesian(moved,C.Ellipsoid.WGS84,new C.Cartographic());
    if(!carto || !Number.isFinite(carto.height)) return;
    a.llaLocation=[C.Math.toDegrees(carto.latitude),C.Math.toDegrees(carto.longitude),carto.height];
    try {
      a.object3d?.compute?.(a.llaLocation);
      a.placeParts?.();
    } catch(e) { warn("押し戻し後の機体再配置に失敗",e); }
  }

  state.patchedGetCollisionResult=function(lla,localPoint,collResult,contactPoint) {
    // A single GeoFS collResult object is reused across all aircraft contact points.
    // Restore the native normal before evaluating the next point so a GLB hit cannot leak.
    restoreCollisionNormal();
    let snapshot=null;
    if(collResult) snapshot={target:collResult,had:Object.prototype.hasOwnProperty.call(collResult,"normal"),value:collResult.normal?[collResult.normal[0],collResult.normal[1],collResult.normal[2]]:undefined};
    if(state.inTick) {
      const hit=detectHit(lla,contactPoint,collResult);
      if(hit) {
        if(snapshot) state.pendingNormalRestore=snapshot;
        return hit;
      }
    }
    return state.originalGetCollisionResult.apply(this,arguments);
  };
  state.patchedFlightTick=function() {
    const aircraft=G.aircraft?.instance;
    if(state.lastAircraft!==aircraft) { state.previousPoints.clear(); state.lastAircraft=aircraft; }
    state.inTick=true;
    state.bestCorrection=null;
    let result;
    try { result=state.originalFlightTick.apply(this,arguments); }
    finally { restoreCollisionNormal(); state.inTick=false; }
    if(!F.recorder?.playing && !F.sharing?.on) applyPositionCorrection();
    return result;
  };
  // GeoFS normally skips all aircraft collisionPoints when the aircraft is far
  // above terrain. Extend that gate to include nearby registered GLB volumes,
  // otherwise a bridge deck or tall building would never reach flight.tick.
  if(typeof state.originalTerrainElevationManagement==="function") {
    state.patchedTerrainElevationManagement=function() {
      const result=state.originalTerrainElevationManagement.apply(this,arguments);
      const aircraft=G.aircraft?.instance;
      if(!F.recorder?.playing && !F.sharing?.on && nearAnyCollider(aircraft)) G.withinCollisionRange=true;
      return result;
    };
  }

  G.getCollisionResult=state.patchedGetCollisionResult;
  F.tick=state.patchedFlightTick;
  if(state.patchedTerrainElevationManagement) F.terrainElevationManagement=state.patchedTerrainElevationManagement;

  async function addGLB(url,options={}) {
    if(typeof G.api.Model!=="function") throw new Error("geofs.api.Model が利用できません");
    const modelOptions=Object.assign({},options.modelOptions||{});
    if(options.location) modelOptions.location=options.location;
    if(options.rotation) modelOptions.rotation=options.rotation;
    const wrapper=new G.api.Model(url,modelOptions);
    await wrapper.loadedPromise;
    await wrapper.readyPromise;
    if(options.scale!==undefined) wrapper.setScale(options.scale);
    await registerGLB(url,wrapper._model,options);
    return wrapper;
  }

  function scanExisting() {
    const models=G.api.models;
    if(!models) return [];
    const self=currentAircraftModels();
    const pending=[];
    let count=0;
    try {
      const len=typeof models.length==="number"?models.length:0;
      for(let i=0;i<len;i++) {
        const m=typeof models.get==="function"?models.get(i):models._primitives?.[i];
        if(!m || self.has(m) || state.byModel.has(m)) continue;
        const url=getURL(m);
        if(url) { count++; pending.push(registerGLB(url,m).catch(e=>warn("自動登録失敗",url,e))); }
      }
    } catch(e) { warn("既存モデル走査エラー",e); }
    log("既存Cesiumモデル検出",count);
    return Promise.all(pending);
  }
  function stats() {
    return {
      version:"0.1.0",colliders:state.colliders.length,
      triangles:state.colliders.reduce((n,c)=>n+c.triangles.length,0),
      uniqueGeometry:state.geometryCache.size,
      uniqueTriangles:[...state.geometryCache.values()].reduce((n,g)=>n+g.triangles.length,0),
      hits:state.hits,sweepHits:state.sweepHits,
      queryCount:state.queryCount,settings:Object.assign({},cfg),
      labels:state.colliders.map(c=>({id:c.id,label:c.label,triangles:c.triangles.length,radius:c.radius}))
    };
  }
  function setOptions(options={}) {
    for(const k of Object.keys(options)) if(k in cfg) cfg[k]=options[k];
    return Object.assign({},cfg);
  }
  function destroy() {
    if(state.destroyed) return;
    state.destroyed=true;
    if(G.getCollisionResult===state.patchedGetCollisionResult) G.getCollisionResult=state.originalGetCollisionResult;
    if(F.tick===state.patchedFlightTick) F.tick=state.originalFlightTick;
    if(state.patchedTerrainElevationManagement && F.terrainElevationManagement===state.patchedTerrainElevationManagement) F.terrainElevationManagement=state.originalTerrainElevationManagement;
    state.colliders.length=0;
    state.previousPoints.clear();
    log("アドオンを解除しました");
    try { delete W.GeoFSPhysics; } catch(_) { W.GeoFSPhysics=null; }
  }

  W.GeoFSPhysics={
    version:"0.1.0",
    settings:cfg,
    registerGLB,
    addGLB,
    unregister,
    scanExisting,
    stats,
    setOptions,
    parseGLB,
    buildTriangles,
    buildBVH,
    destroy
  };

  log("初期化完了。GeoFS既存剛体エンジンへのGLB三角形接触フックを有効化しました。");
  log("使い方: GeoFSPhysics.addGLB(url,{location:[lat,lon,alt],rotation:[heading,pitch,roll],scale:1})");
  log("既存モデル: GeoFSPhysics.registerGLB(url, cesiumModel)。確認: GeoFSPhysics.stats()");
})();
