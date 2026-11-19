(() => {
  'use strict';

  const KEY = '__geofsGLBCaptureExport';
  if (window[KEY]?.stop) window[KEY].stop();

  const found = new Map();
  const seenModels = new WeakSet();
  const nativeFetch = window.fetch;
  const nativeXHROpen = XMLHttpRequest.prototype.open;
  const hooks = [];
  let viewer = null;
  let stopped = false;

  const normalize = value => {
    try {
      const u = new URL(String(value), location.href);
      u.hash = '';
      return u.href;
    } catch { return null; }
  };

  const urlFrom = value => {
    if (!value) return null;
    if (typeof value === 'string') return normalize(value);
    if (value instanceof Request) return normalize(value.url);
    if (value.url) return normalize(typeof value.url === 'string' ? value.url : value.url.url);
    if (value._resource?.url) return normalize(value._resource.url);
    if (value.resource?.url) return normalize(value.resource.url);
    return null;
  };

  const isGLB = url => !!url && /\.glb(?:$|[?])/i.test(url);

  function getRecord(url) {
    const full = normalize(url);
    if (!isGLB(full)) return null;
    let rec = found.get(full);
    if (!rec) {
      rec = { url: full, models: [], firstSeen: Date.now() };
      found.set(full, rec);
      console.log('[GLB]', full);
      updateStatus();
    }
    return rec;
  }

  function registerModel(model, url) {
    const rec = getRecord(url);
    if (!rec || !model || (typeof model !== 'object' && typeof model !== 'function')) return;
    if (seenModels.has(model)) return;
    seenModels.add(model);
    rec.models.push(model);
    updateStatus();
  }

  function modelUrl(model) {
    return urlFrom(model?._resource) || urlFrom(model?._url) || urlFrom(model?.url) ||
      urlFrom(model?._gltfResource) || urlFrom(model?._options?.url);
  }

  // Network request detection.
  window.fetch = function (...args) {
    const input = args[0];
    const url = urlFrom(input);
    getRecord(url);
    return nativeFetch.apply(this, args);
  };

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    const full = normalize(url);
    const rec = getRecord(full);
    if (rec) {
      this.addEventListener('load', () => {
        try {
          const response = this.response;
          if (response instanceof ArrayBuffer) rec.lastXHRBytes = response.byteLength;
          else if (response instanceof Blob) rec.lastXHRBytes = response.size;
        } catch {}
      }, { once: true });
    }
    return nativeXHROpen.call(this, method, url, ...rest);
  };

  function attachCesium() {
    const C = window.Cesium;
    viewer = window.geofs?.api?.viewer || viewer;
    if (!C || !viewer) return;

    const M = C.Model;
    if (M) {
      for (const name of ['fromGltf', 'fromGltfAsync']) {
        const original = M[name];
        if (typeof original !== 'function' || original.__glbCaptureWrapped) continue;
        const wrapped = function (...args) {
          const url = urlFrom(args[0]?.url ?? args[0]);
          const result = original.apply(this, args);
          const add = model => registerModel(model, url || modelUrl(model));
          if (result && typeof result.then === 'function') result.then(add).catch(() => {});
          else add(result);
          return result;
        };
        wrapped.__glbCaptureWrapped = true;
        try { M[name] = wrapped; } catch (e) { console.warn('[GLB] Model.' + name + 'を監視できません', e); continue; }
        hooks.push(() => { if (M[name] === wrapped) M[name] = original; });
      }
    }

    const collection = viewer.scene?.primitives;
    if (collection && !collection.__glbCaptureWrapped) {
      const originalAdd = collection.add;
      const wrappedAdd = function (primitive, ...args) {
        const result = originalAdd.call(this, primitive, ...args);
        registerModel(result || primitive, modelUrl(result || primitive));
        return result;
      };
      collection.add = wrappedAdd;
      collection.__glbCaptureWrapped = true;
      hooks.push(() => {
        if (collection.add === wrappedAdd) collection.add = originalAdd;
        try { delete collection.__glbCaptureWrapped; } catch {}
      });
    }

    // Also inspect models that were already added before this script ran.
    try {
      const list = collection;
      for (let i = 0; i < (list?.length || 0); i++) {
        const item = list.get(i);
        registerModel(item, modelUrl(item));
      }
    } catch {}
  }

  function getPlacement(model, C) {
    const ellipsoid = viewer?.scene?.globe?.ellipsoid || C.Ellipsoid.WGS84;
    let matrix = null;
    for (const candidate of [model?._sceneGraph?._computedModelMatrix, model?._computedModelMatrix, model?.modelMatrix, model?._modelMatrix]) {
      if (!candidate || candidate.length !== 16) continue;
      const p = C.Matrix4.getTranslation(candidate, new C.Cartesian3());
      const magnitude = C.Cartesian3.magnitude(p);
      if (magnitude > 6000000 && magnitude < 7000000) {
        matrix = C.Matrix4.clone(candidate, new C.Matrix4());
        break;
      }
    }

    let center = null;
    if (matrix) center = C.Matrix4.getTranslation(matrix, new C.Cartesian3());
    if (!center) {
      const sphere = model?.boundingSphere || model?._boundingSphere || model?._sceneGraph?._boundingSphere;
      const p = sphere?.center;
      if (p && C.Cartesian3.magnitude(p) > 6000000 && C.Cartesian3.magnitude(p) < 7000000) {
        center = C.Cartesian3.clone(p, new C.Cartesian3());
        // Fallback orientation: local model axes are treated as ENU.
        matrix = C.Transforms.eastNorthUpToFixedFrame(center, ellipsoid, new C.Matrix4());
      }
    }
    if (!matrix || !center) return null;

    const scale = Number(model?.scale);
    if (Number.isFinite(scale) && scale > 0 && scale !== 1) {
      C.Matrix4.multiplyByUniformScale(matrix, scale, matrix);
    }
    const carto = ellipsoid.cartesianToCartographic(center);
    if (!carto) return null;
    return {
      model,
      matrix,
      cartesian: center,
      longitude: C.Math.toDegrees(carto.longitude),
      latitude: C.Math.toDegrees(carto.latitude),
      height: carto.height
    };
  }

  function snapshot() {
    const C = window.Cesium;
    if (!C || !viewer) throw new Error('GeoFS / Cesiumのviewerが見つかりません。');
    const assets = [];
    for (const rec of found.values()) {
      const instances = [];
      for (const model of rec.models) {
        const p = getPlacement(model, C);
        if (p) instances.push(p);
      }
      assets.push({ url: rec.url, instances, modelCount: rec.models.length });
    }
    return assets;
  }

  function fileName(url, index) {
    try {
      const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'model.glb');
      return `${String(index + 1).padStart(3, '0')}_${name.replace(/[^\w.\-()ぁ-んァ-ヶ一-龠]/g, '_')}`;
    } catch { return `${String(index + 1).padStart(3, '0')}_model.glb`; }
  }

  function download(blob, name) {
    const a = document.createElement('a');
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60000);
  }

  function setStatus(message) {
    if (statusNode) statusNode.textContent = message;
    console.log('[GLB Export]', message);
  }

  let statusNode;
  function updateStatus() {
    if (!statusNode) return;
    let models = 0;
    for (const r of found.values()) models += r.models.length;
    statusNode.textContent = `検出 ${found.size}件 / 配置取得 ${models}件`;
  }

  async function loadJSZip() {
    if (window.JSZip) return window.JSZip;
    if (!window.__glbJSZipLoading) {
      window.__glbJSZipLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        s.onload = () => resolve(window.JSZip);
        s.onerror = () => reject(new Error('ZIPライブラリを読み込めません。通信/CSPを確認してください。'));
        document.head.appendChild(s);
      });
    }
    return window.__glbJSZipLoading;
  }

  async function fetchGLB(url) {
    const response = await nativeFetch.call(window, url, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async function exportZip() {
    if (!found.size) return setStatus('GLBがまだ検出されていません。');
    try {
      const JSZip = await loadJSZip();
      if (!JSZip) throw new Error('JSZipを初期化できません。');
      const assets = snapshot();
      const zip = new JSZip();
      const manifest = {
        createdAt: new Date().toISOString(),
        coordinateSystem: 'WGS84 longitude/latitude/height; model matrices are also recorded in merged export',
        assets: assets.map((a, i) => ({
          file: fileName(a.url, i), url: a.url, modelCount: a.modelCount,
          instances: a.instances.map((p, n) => ({ instance: n + 1, longitude: p.longitude, latitude: p.latitude, height: p.height }))
        }))
      };
      zip.file('coordinates.json', JSON.stringify(manifest, null, 2));
      let done = 0;
      for (let i = 0; i < assets.length; i++) {
        const a = assets[i];
        try {
          const bytes = await fetchGLB(a.url);
          zip.file(`glb/${fileName(a.url, i)}`, bytes, { binary: true, compression: 'DEFLATE', compressionOptions: { level: 1 } });
        } catch (e) {
          manifest.assets[i].downloadError = String(e.message || e);
          console.warn('[GLB download failed]', a.url, e);
        }
        done++;
        setStatus(`ZIP準備中 ${done}/${assets.length}`);
      }
      zip.file('coordinates.json', JSON.stringify(manifest, null, 2));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 } }, meta => {
        setStatus(`ZIP圧縮中 ${Math.round(meta.percent)}%`);
      });
      download(blob, 'GeoFS_GLB_all_with_coordinates.zip');
      setStatus(`ZIP保存完了：${assets.length}件（元GLB＋coordinates.json）`);
    } catch (e) {
      console.error(e);
      setStatus(`ZIP失敗：${e.message || e}`);
    }
  }

  const utf8 = new TextDecoder();
  function parseGLB(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) throw new Error('GLBヘッダーが不正です。');
    if (view.getUint32(4, true) !== 2) throw new Error('GLB 2.0以外は統合対象外です。');
    const total = view.getUint32(8, true);
    if (total > bytes.byteLength) throw new Error('GLBデータが途中で切れています。');
    let offset = 12, json = null, bin = new Uint8Array(0);
    while (offset + 8 <= total) {
      const length = view.getUint32(offset, true);
      const type = view.getUint32(offset + 4, true);
      offset += 8;
      if (offset + length > total) throw new Error('GLBチャンク長が不正です。');
      const chunk = bytes.subarray(offset, offset + length);
      if (type === 0x4e4f534a) json = JSON.parse(utf8.decode(chunk).replace(/[\u0000\u0020]+$/g, ''));
      else if (type === 0x004e4942) bin = chunk.slice();
      offset += length;
    }
    if (!json) throw new Error('GLB JSONチャンクがありません。');
    if ((json.buffers || []).some(b => b.uri)) throw new Error('外部.bin参照を含むGLBは統合できません。');
    return { json, bin };
  }

  const arr = (obj, key) => Array.isArray(obj?.[key]) ? obj[key] : [];
  const addIndex = (obj, key, offset) => {
    if (Number.isInteger(obj?.[key])) obj[key] += offset;
  };
  function walkTextureInfo(value, textureOffset, key = '') {
    if (!value || typeof value !== 'object') return;
    if (/texture/i.test(key) && Number.isInteger(value.index)) value.index += textureOffset;
    for (const [k, v] of Object.entries(value)) if (v && typeof v === 'object') walkTextureInfo(v, textureOffset, k);
  }

  function buildMergedGLB(loaded, placements, C) {
    const out = {
      asset: { version: '2.0', generator: 'GeoFS GLB Capture / Coordinate Merge' },
      scene: 0, scenes: [{ name: 'GeoFS merged scene', nodes: [] }], nodes: [], meshes: [],
      accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }],
      materials: [], textures: [], images: [], samplers: [], animations: [], skins: [], cameras: [],
      extensionsUsed: [], extensionsRequired: [], extensions: {}
    };
    const binParts = [];
    let binLength = 0;
    const lightExtension = { lights: [] };
    const variantExtension = { variants: [] };
    const rootNodesByUrl = new Map();

    for (const item of loaded) {
      const j = item.json;
      const bin = item.bin;
      const nodeOff = out.nodes.length, meshOff = out.meshes.length, accOff = out.accessors.length;
      const bvOff = out.bufferViews.length, matOff = out.materials.length, texOff = out.textures.length;
      const imgOff = out.images.length, samplerOff = out.samplers.length, skinOff = out.skins.length;
      const cameraOff = out.cameras.length, animOff = out.animations.length;
      const lightOff = lightExtension.lights.length;
      const variantOff = variantExtension.variants.length;
      const binOff = (binLength + 3) & ~3;
      if (binOff > binLength) { binParts.push(new Uint8Array(binOff - binLength)); binLength = binOff; }

      const buffers = arr(j, 'buffers');
      if (buffers.length > 1) throw new Error('複数bufferを持つGLBは統合できません。');
      if (bin.length) { binParts.push(bin); binLength += bin.length; }
      const binPad = (binLength + 3) & ~3;
      if (binPad > binLength) { binParts.push(new Uint8Array(binPad - binLength)); binLength = binPad; }

      const lights = j.extensions?.KHR_lights_punctual?.lights || [];
      lightExtension.lights.push(...lights);
      const variants = j.extensions?.KHR_materials_variants?.variants || [];
      variantExtension.variants.push(...variants);

      const nodes = arr(j, 'nodes').map(n => {
        const x = structuredClone(n);
        if (Array.isArray(x.children)) x.children = x.children.map(v => v + nodeOff);
        addIndex(x, 'mesh', meshOff); addIndex(x, 'skin', skinOff); addIndex(x, 'camera', cameraOff);
        if (Number.isInteger(x.extensions?.KHR_lights_punctual?.light)) x.extensions.KHR_lights_punctual.light += lightOff;
        const instancing = x.extensions?.EXT_mesh_gpu_instancing?.attributes;
        if (instancing) for (const key of Object.keys(instancing)) instancing[key] += accOff;
        if (Array.isArray(x.extensions?.MSFT_lod?.ids)) x.extensions.MSFT_lod.ids = x.extensions.MSFT_lod.ids.map(v => v + nodeOff);
        return x;
      });
      const meshes = arr(j, 'meshes').map(m => {
        const x = structuredClone(m);
        for (const p of arr(x, 'primitives')) {
          if (p.attributes) for (const k of Object.keys(p.attributes)) p.attributes[k] += accOff;
          addIndex(p, 'indices', accOff); addIndex(p, 'material', matOff);
          for (const target of arr(p, 'targets')) for (const k of Object.keys(target)) target[k] += accOff;
          addIndex(p.extensions?.KHR_draco_mesh_compression, 'bufferView', bvOff);
          const mappings = p.extensions?.KHR_materials_variants?.mappings || [];
          for (const map of mappings) {
            addIndex(map, 'material', matOff);
            if (Array.isArray(map.variants)) map.variants = map.variants.map(v => v + variantOff);
          }
          const meshopt = p.extensions?.EXT_meshopt_compression;
          if (meshopt) { meshopt.buffer = 0; meshopt.byteOffset = (meshopt.byteOffset || 0) + binOff; }
        }
        return x;
      });
      const accessors = arr(j, 'accessors').map(a => {
        const x = structuredClone(a);
        addIndex(x, 'bufferView', bvOff);
        if (x.sparse) { addIndex(x.sparse.indices, 'bufferView', bvOff); addIndex(x.sparse.values, 'bufferView', bvOff); }
        return x;
      });
      const bufferViews = arr(j, 'bufferViews').map(b => {
        const x = structuredClone(b);
        x.buffer = 0; x.byteOffset = (x.byteOffset || 0) + binOff;
        const meshopt = x.extensions?.EXT_meshopt_compression;
        if (meshopt) { meshopt.buffer = 0; meshopt.byteOffset = (meshopt.byteOffset || 0) + binOff; }
        return x;
      });
      const materials = arr(j, 'materials').map(m => {
        const x = structuredClone(m); walkTextureInfo(x, texOff); return x;
      });
      const textures = arr(j, 'textures').map(t => {
        const x = structuredClone(t); addIndex(x, 'sampler', samplerOff); addIndex(x, 'source', imgOff);
        for (const key of ['KHR_texture_basisu', 'EXT_texture_webp', 'KHR_texture_avif']) addIndex(x.extensions?.[key], 'source', imgOff);
        return x;
      });
      const images = arr(j, 'images').map(im => { const x = structuredClone(im); addIndex(x, 'bufferView', bvOff); return x; });
      const animations = arr(j, 'animations').map(a => {
        const x = structuredClone(a);
        for (const s of arr(x, 'samplers')) { addIndex(s, 'input', accOff); addIndex(s, 'output', accOff); }
        for (const c of arr(x, 'channels')) { addIndex(c, 'sampler', 0); addIndex(c.target, 'node', nodeOff); }
        return x;
      });
      const skins = arr(j, 'skins').map(s => {
        const x = structuredClone(s); addIndex(x, 'inverseBindMatrices', accOff); addIndex(x, 'skeleton', nodeOff);
        if (Array.isArray(x.joints)) x.joints = x.joints.map(v => v + nodeOff);
        return x;
      });

      out.nodes.push(...nodes); out.meshes.push(...meshes); out.accessors.push(...accessors);
      out.bufferViews.push(...bufferViews); out.materials.push(...materials); out.textures.push(...textures);
      out.images.push(...images); out.samplers.push(...arr(j, 'samplers').map(x => structuredClone(x)));
      out.animations.push(...animations); out.skins.push(...skins); out.cameras.push(...arr(j, 'cameras').map(x => structuredClone(x)));

      const defaultScene = arr(j, 'scenes')[Number.isInteger(j.scene) ? j.scene : 0];
      let roots = arr(defaultScene, 'nodes').map(n => n + nodeOff);
      if (!roots.length && nodes.length) {
        const children = new Set();
        for (const n of nodes) for (const c of arr(n, 'children')) children.add(c);
        roots = nodes.map((_, i) => i + nodeOff).filter(n => !children.has(n));
      }
      rootNodesByUrl.set(item.url, { roots, nodeOff, variantOff });

      for (const name of arr(j, 'extensionsUsed')) if (!out.extensionsUsed.includes(name)) out.extensionsUsed.push(name);
      for (const name of arr(j, 'extensionsRequired')) if (!out.extensionsRequired.includes(name)) out.extensionsRequired.push(name);
    }

    if (lightExtension.lights.length) out.extensions.KHR_lights_punctual = lightExtension;
    if (variantExtension.variants.length) out.extensions.KHR_materials_variants = variantExtension;

    const firstPlacement = placements[0];
    const origin = firstPlacement.cartesian;
    const enuToEcef = C.Transforms.eastNorthUpToFixedFrame(origin, viewer.scene.globe.ellipsoid, new C.Matrix4());
    const ecefToEnu = C.Matrix4.inverse(enuToEcef, new C.Matrix4());
    for (const p of placements) {
      const roots = rootNodesByUrl.get(p.url)?.roots || [];
      const local = C.Matrix4.multiply(ecefToEnu, p.matrix, new C.Matrix4());
      out.nodes.push({ name: p.name, matrix: Array.from(local), children: roots });
      out.scenes[0].nodes.push(out.nodes.length - 1);
    }

    out.buffers[0].byteLength = binLength;
    out.asset.extras = { origin: { longitude: firstPlacement.longitude, latitude: firstPlacement.latitude, height: firstPlacement.height }, coordinateFrame: 'local ENU (east, north, up), meters' };
    const bin = new Uint8Array(binLength);
    let cursor = 0;
    for (const part of binParts) { bin.set(part, cursor); cursor += part.length; }
    return writeGLB(out, bin);
  }

  function writeGLB(json, bin) {
    const enc = new TextEncoder();
    const jsonRaw = enc.encode(JSON.stringify(json));
    const jsonLen = (jsonRaw.length + 3) & ~3;
    const binLen = bin.length ? ((bin.length + 3) & ~3) : 0;
    const total = 12 + 8 + jsonLen + (binLen ? 8 + binLen : 0);
    if (total > 0xffffffff) throw new Error('統合GLBが4GBを超えています。');
    const out = new Uint8Array(total);
    const v = new DataView(out.buffer);
    v.setUint32(0, 0x46546c67, true); v.setUint32(4, 2, true); v.setUint32(8, total, true);
    v.setUint32(12, jsonLen, true); v.setUint32(16, 0x4e4f534a, true);
    out.fill(0x20, 20, 20 + jsonLen); out.set(jsonRaw, 20);
    if (binLen) {
      const start = 20 + jsonLen;
      v.setUint32(start, binLen, true); v.setUint32(start + 4, 0x004e4942, true);
      out.set(bin, start + 8);
    }
    return out;
  }

  async function exportMerged() {
    if (!found.size) return setStatus('GLBがまだ検出されていません。');
    try {
      const C = window.Cesium;
      const assets = snapshot();
      const placements = [];
      for (const a of assets) for (let i = 0; i < a.instances.length; i++) {
        placements.push({ ...a.instances[i], url: a.url, name: `${fileName(a.url, 0)}_${i + 1}` });
      }
      if (!placements.length) throw new Error('配置座標を取得できるモデルがありません。モデルを読み込んだ後に実行してください。');

      const used = new Map();
      for (const p of placements) used.set(p.url, true);
      const loaded = [];
      let i = 0;
      for (const url of used.keys()) {
        const bytes = await fetchGLB(url);
        const parsed = parseGLB(bytes);
        loaded.push({ url, ...parsed });
        setStatus(`統合準備中 ${++i}/${used.size}`);
      }
      const merged = buildMergedGLB(loaded, placements, C);
      download(new Blob([merged], { type: 'model/gltf-binary' }), 'GeoFS_all_models_merged.glb');
      const omitted = assets.filter(a => !a.instances.length).length;
      setStatus(`統合GLB保存完了：配置 ${placements.length}個 / 元GLB ${loaded.length}件${omitted ? ` / 座標なし ${omitted}件は除外` : ''}`);
    } catch (e) {
      console.error(e);
      setStatus(`統合失敗：${e.message || e}`);
    }
  }

  // Compact control panel.
  const panel = document.createElement('div');
  panel.id = 'geofsGLBCapturePanel';
  panel.style.cssText = 'position:fixed;top:48px;right:10px;z-index:2147483647;width:230px;padding:9px;background:rgba(20,24,30,.94);color:#fff;border:1px solid #78818c;border-radius:8px;font:12px sans-serif;box-shadow:0 2px 10px #0008';
  const title = document.createElement('div');
  title.textContent = 'GLB取得・統合';
  title.style.cssText = 'font-weight:bold;margin-bottom:7px';
  statusNode = document.createElement('div');
  statusNode.style.cssText = 'margin-bottom:8px;color:#cdd6df;line-height:1.4';
  const makeButton = (label, action) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'width:100%;margin:3px 0;padding:7px 5px;border:0;border-radius:5px;background:#e6e9ed;color:#17202a;font-weight:600';
    b.onclick = action;
    return b;
  };
  panel.append(title, statusNode,
    makeButton('URL一覧を表示', () => {
      if (!found.size) return alert('まだGLBは検出されていません。');
      const lines = [...found.values()].map((r, i) => `${i + 1}. ${r.url}\n   配置モデル: ${r.models.length}件`).join('\n\n');
      prompt('検出したGLB URL一覧', lines);
    }),
    makeButton('元GLB＋座標をZIP保存', exportZip),
    makeButton('全モデルを1つのGLBに統合', exportMerged),
    makeButton('閉じる', () => { panel.remove(); toggle.style.display = 'block'; })
  );
  const toggle = document.createElement('button');
  toggle.textContent = 'GLBツール';
  toggle.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;padding:8px 10px;border:1px solid #78818c;border-radius:6px;background:#202832;color:white;font:12px sans-serif';
  toggle.onclick = () => { panel.style.display = 'block'; toggle.style.display = 'none'; };
  document.body.append(toggle, panel);

  attachCesium();
  const hookTimer = setInterval(() => { if (stopped) return; attachCesium(); updateStatus(); }, 1500);
  updateStatus();
  console.log('[GLB] 監視開始。モデルの読み込み後にZIP/統合GLBを実行してください。');

  window[KEY] = {
    found,
    exportZip,
    exportMerged,
    stop() {
      stopped = true;
      clearInterval(hookTimer);
      window.fetch = nativeFetch;
      XMLHttpRequest.prototype.open = nativeXHROpen;
      for (const restore of hooks.reverse()) { try { restore(); } catch {} }
      panel.remove(); toggle.remove();
      delete window[KEY];
      console.log('[GLB] 監視停止');
    }
  };
})();
