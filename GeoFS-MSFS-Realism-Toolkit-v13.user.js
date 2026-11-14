// ==UserScript==
// @name         GeoFS MSFS Realism Toolkit v13
// @namespace    geofs.msfs.realism
// @version      13.2.0
// @description  GeoFS Graphics integration, conservative GPU-safe rendering, and baked weathering on orthophoto roof textures.
// @match        https://www.geo-fs.com/geofs.php*
// @match        https://geo-fs.com/geofs.php*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '13.2.0';
  const KEY = '__GEOFS_MSFS_REALISM_V13__';
  const CACHE_PREFIX = 'geofs_msfs_v13_osm_';
  const CACHE_TTL = 4 * 60 * 60 * 1000;
  const EARTH_RADIUS = 6378137;
  const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (!!window.matchMedia && matchMedia('(pointer: coarse)').matches && innerWidth < 1100);

  if (window[KEY]) {
    if (window[KEY].version === VERSION) {
      window[KEY].togglePanel();
      return;
    }
    try { if (typeof window[KEY].cleanup === 'function') window[KEY].cleanup(); } catch (_) {}
    try { delete window[KEY]; } catch (_) { window[KEY] = null; }
  }

  // Remove previous add-on generations to avoid stacked overlays and panels.
  ['__GEOFS_MSFS_REALISM_V13__', '__GEOFS_MSFS_REALISM_V12__', '__GEOFS_MSFS_REALISM_V11__', '__GEOFS_MSFS_REALISM_V10__', '__GEOFS_MSFS_REALISM_V9__', '__GEOFS_MSFS_REALISM_V8__', '__GEOFS_MSFS_REALISM_V7__', '__GEOFS_MSFS_REALISM_V6__', '__GEOFS_ROOF_ROAD_REALISM_V5__', '__GEOFS_ROOF_ROAD_REALISM_V4__', '__GEOFS_MSFS_REALISM_CORE_V3__'].forEach(name => {
    try {
      const old = window[name];
      if (old && typeof old.cleanup === 'function') old.cleanup();
    } catch (_) {}
  });

  const state = {
    road: false,
    crossings: false,
    rail: false,
    roadSurface: false,
    airportSurface: false,
    buildingOutlines: false,
    facadeWindows: false,
    urbanSurfaces: false,
    trafficFurniture: false,
    greenInfrastructure: false,
    barriers: false,
    powerNetwork: false,
    hydrography: false,
    streetObjects: false,
    bridgeStructures: false,
    adaptivePerformance: false,
    autoNearbyData: false,
    parkingMarkings: false,
    roofEquipment: false,
    roofs: false,
    gsiImagery: false,
    ionBuildings: false,
    buildingTexture: false,
    buildingLOD: false,
    treeLOD: false,
    volumetricClouds: false,
    water: false,
    shadows: false,
    reflections: false,
    ao: false,
    bloom: false,
    sharpen: false,
    qualityProfile: 'native',
    brightness: 1,
    contrast: 1,
    saturation: 1,
    sharpness: 0.14
  };

  let panel = null;
  let nativeUiObserver = null;
  let nativeUiMountedHost = null;
  let nativeUiRetryTimer = null;
  let nativeUiRetryUntil = 0;
  let statusNode = null;
  let diagNode = null;
  let osmElements = [];
  let lastRequestAt = 0;
  let roadPrimitive = null;
  let roadFallbackSource = null;
  let roadMarkSource = null;
  let parkingMarkSource = null;
  let roadSurfacePrimitive = null;
  let airportSurfacePrimitive = null;
  let airportMarkSource = null;
  let buildingOutlineSource = null;
  let facadeDetailPrimitive = null;
  let facadeDetailCount = 0;
  let urbanSurfacePrimitive = null;
  let trafficSource = null;
  let greenSource = null;
  let barrierSource = null;
  let barrierPrimitive = null;
  let powerSource = null;
  let hydroPrimitive = null;
  let streetObjectSource = null;
  let bridgeSource = null;
  let adaptiveLastAt = 0;
  let adaptiveLowSamples = 0;
  let adaptiveHighSamples = 0;
  let adaptiveBase = null;
  let lastOsmCell = '';
  let lastAutoCellAttempt = '';
  let lastDetailBand = '';
  let lastLodRedrawAt = 0;
  let lodRefreshRunning = false;
  let roofEquipmentSource = null;
  let solarPanelPrimitive = null;
  let ionBuildingsTileset = null;
  let ionNativeBuildingsWasEnabled = false;
  let ionGoogleWasActive = false;
  let roofPrimitive = [];
  let gsiImageryLayer = null;
  let roofPhotoTileCache = new Map();
  let roofPhotoTilesUsed = 0;
  let roofPhotoBuildingsUsed = 0;
  let roofPhotoBuildingsSkipped = 0;
  let roofPhotoLastError = '';
  let roofPhotoInferredBuildings = 0;
  let roofPhotoExplicitBuildings = 0;
  let weatheredRoofTileCount = 0;
  const weatheredRoofTileCache = new Map();
  let renderErrorRemove = null;
  let samplerRecoveryDone = false;
  let allOnApplied = false;
  const tileLightingBackups = new Map();
  let allOnPromise = null;
  let nativeUiSyncApplied = false;
  let roofDetailSource = null;
  let sharpenStage = null;
  let frameRate = 0;
  let frameCount = 0;
  let frameStart = performance.now();
  let renderEventRemove = null;
  let busy = false;
  let lastMessage = 'GeoFSを検出しています…';
  let original = null;
  let originalTextureMap = null;
  let originalBuildingLevels = null;
  let originalTreeLevels = null;
  let originalImagery = null;
  let buildingTextureBackupActive = false;
  let buildingLodBackupActive = false;
  let treeLodBackupActive = false;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const safe = fn => { try { return fn(); } catch (_) { return undefined; } };
  const clone = value => {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const getGeoFS = () => window.geofs && geofs.api && geofs.api.viewer && geofs.api.viewer.scene ? geofs : null;
  const getCesium = () => window.Cesium || null;
  const getScene = () => { const g = getGeoFS(); return g && g.api.viewer.scene; };

  function captureOriginal() {
    if (original) return;
    const g = getGeoFS();
    const C = getCesium();
    const viewer = g.api.viewer;
    const scene = viewer.scene;
    const globe = scene.globe;
    const graphics = g.preferences && g.preferences.graphics || {};
    const adv = graphics.advanced || {};
    const layer = viewer.imageryLayers && viewer.imageryLayers.length ? viewer.imageryLayers.get(0) : null;
    const stages = scene.postProcessStages || {};
    const ao = stages.ambientOcclusion;
    const bloom = stages.bloom;
    const fog = scene.fog || {};
    const sky = scene.skyAtmosphere || {};
    const shadow = viewer.shadowMap || {};
    original = {
      graphics: clone(graphics),
      renderingSettings: clone(g.api.renderingSettings || {}),
      resolutionScale: viewer.resolutionScale,
      globe: {
        enableLighting: globe && globe.enableLighting,
        showGroundAtmosphere: globe && globe.showGroundAtmosphere,
        showWaterEffect: globe && globe.showWaterEffect,
        maximumScreenSpaceError: globe && globe.maximumScreenSpaceError,
        tileCacheSize: globe && globe.tileCacheSize,
        shadows: globe && globe.shadows
      },
      sky: { show: sky.show, brightnessShift: sky.brightnessShift, saturationShift: sky.saturationShift, hueShift: sky.hueShift },
      fog: { enabled: fog.enabled, renderable: fog.renderable, density: fog.density, minimumBrightness: fog.minimumBrightness, screenSpaceErrorFactor: fog.screenSpaceErrorFactor },
      shadow: { enabled: shadow.enabled, size: shadow.size, softShadows: shadow.softShadows, darkness: shadow.darkness, maximumDistance: shadow.maximumDistance },
      scene: { msaaSamples: scene.msaaSamples, highDynamicRange: scene.highDynamicRange, fxaa: stages.fxaa && stages.fxaa.enabled },
      ao: ao && ao.enabled,
      aoIntensity: ao && ao.uniforms && ao.uniforms.intensity,
      bloom: bloom && bloom.enabled,
      layer: layer && { brightness: layer.brightness, contrast: layer.contrast, saturation: layer.saturation, gamma: layer.gamma, hue: layer.hue },
      waterEffect: !!graphics.waterEffect,
      googleTilesActive: !!g.api.googleTileset,
      buildingTextureMap: g.configuration && g.configuration.current && clone(g.configuration.current.qualityToBuildingTexture),
      buildingLevels: g.buildings && clone(g.buildings.qualityLevels),
      treeLevels: g.trees && clone(g.trees.qualityLevels),
      nativeShadows: viewer.shadows,
      adaptiveMaxScreenSpaceError: g.api.adaptativeMaxMaximumScreenSpaceError,
      nativeBuildingsEnabled: !!(g.preferences && g.preferences.graphics && g.preferences.graphics.buildings),
      nativeControls: {
        advancedAtmosphere: readNativeCheckbox(/^advanced atmosphere$/i),
        volumetricClouds: readNativeCheckbox(/^volumetric clouds$/i),
        buildings: readNativeCheckbox(/^buildings$|^enable buildings$/i),
        vegetation: readNativeCheckbox(/^vegetation$|^enable vegetation$/i),
        waterEffect: readNativeCheckbox(/^water effect$/i),
        contrails: readNativeCheckbox(/^contrails$/i),
        fxaa: readNativeCheckbox(/^fast approximate anti-aliasing \(fxaa\)$|^fxaa$/i),
        dropShadows: readNativeCheckbox(/^drop shadows$/i),
        softShadows: readNativeCheckbox(/^soft shadows$/i),
        globeLighting: readNativeCheckbox(/^globe lighting$/i)
      }
    };
    originalTextureMap = original.buildingTextureMap;
    originalBuildingLevels = original.buildingLevels;
    originalTreeLevels = original.treeLevels;
    originalImagery = original.layer;
  }

  function refreshNativeControlSnapshot() {
    if (!original) return;
    original.nativeControls = original.nativeControls || {};
    const map = {
      advancedAtmosphere: /^advanced atmosphere$/i,
      volumetricClouds: /^volumetric clouds$/i,
      buildings: /^buildings$|^enable buildings$/i,
      vegetation: /^vegetation$|^enable vegetation$/i,
      waterEffect: /^water effect$/i,
      contrails: /^contrails$/i,
      fxaa: /^fast approximate anti-aliasing \(fxaa\)$|^fxaa$/i,
      dropShadows: /^drop shadows$/i,
      softShadows: /^soft shadows$/i,
      globeLighting: /^globe lighting$/i
    };
    Object.entries(map).forEach(([key, pattern]) => {
      const value = readNativeCheckbox(pattern);
      if (value !== null && original.nativeControls[key] === null) original.nativeControls[key] = value;
    });
  }

  function currentCamera() {
    const g = getGeoFS();
    const C = getCesium();
    if (!g || !C) throw new Error('GeoFS/Cesiumがまだ準備できていません');
    const carto = g.api.viewer.camera && g.api.viewer.camera.positionCartographic;
    if (!carto) throw new Error('カメラ位置を取得できません');
    return {
      lat: C.Math.toDegrees(carto.latitude),
      lon: C.Math.toDegrees(carto.longitude),
      altitude: Number(carto.height) || 0
    };
  }

  function requestRender() {
    const scene = getScene();
    if (scene && typeof scene.requestRender === 'function') safe(() => scene.requestRender());
  }

  function gpuCapabilities() {
    const scene = getScene();
    const context = scene && scene.context;
    const gl = context && context._gl;
    if (!gl) return { textureUnits: 8, combinedTextureUnits: 8, maxSamples: 1, maxTextureSize: 2048, webgl2: false };
    const read = (key, fallback) => safe(() => gl.getParameter(gl[key])) || fallback;
    return {
      textureUnits: read('MAX_TEXTURE_IMAGE_UNITS', 8),
      combinedTextureUnits: read('MAX_COMBINED_TEXTURE_IMAGE_UNITS', 8),
      maxSamples: read('MAX_SAMPLES', 1),
      maxTextureSize: read('MAX_TEXTURE_SIZE', 2048),
      webgl2: !!(context.webgl2 || (window.WebGL2RenderingContext && gl instanceof window.WebGL2RenderingContext))
    };
  }

  function maxMsaaSamples() {
    return gpuCapabilities().maxSamples || 1;
  }

  function installSamplerRecovery() {
    const scene = getScene();
    if (!scene || !scene.renderError || typeof scene.renderError.addEventListener !== 'function' || renderErrorRemove) return;
    const remove = scene.renderError.addEventListener((renderScene, error) => {
      const message = String(error && (error.message || error.stack) || error || '');
      if (!/sampler|program failed to link|linking failed/i.test(message) || samplerRecoveryDone) return;
      samplerRecoveryDone = true;
      const stages = renderScene && renderScene.postProcessStages;
      safe(() => { if (sharpenStage) sharpenStage.enabled = false; });
      safe(() => { if (stages && stages.ambientOcclusion) stages.ambientOcclusion.enabled = false; });
      safe(() => { if (stages && stages.bloom) stages.bloom.enabled = false; });
      safe(() => { if (stages && stages.fxaa) stages.fxaa.enabled = true; });
      safe(() => { if (renderScene && 'msaaSamples' in renderScene) renderScene.msaaSamples = 1; });
      safe(() => { if (renderScene && 'highDynamicRange' in renderScene) renderScene.highDynamicRange = false; });
      const g = getGeoFS();
      safe(() => { if (g && g.api && typeof g.api.setWaterEffect === 'function') g.api.setWaterEffect(false); });
      safe(() => { if (g && g.preferences && g.preferences.graphics) g.preferences.graphics.waterEffect = false; });
      safe(() => { if (g && g.preferences && g.preferences.graphics && g.preferences.graphics.advanced) g.preferences.graphics.advanced.volumetricClouds = false; });
      safe(() => { if (g && g.api && typeof g.api.useNativeShadows === 'function') g.api.useNativeShadows(false); });
      removeGsiGroundImagery();
      state.water = false; state.volumetricClouds = false; state.shadows = false;
      state.sharpen = false; state.ao = false; state.bloom = false;
      lastMessage = 'GPUサンプラー上限を検知したため、追加エフェクト・GSI重ね表示・MSAA・水面・雲・影を停止して復旧を試みました';
      setTimeout(() => { requestRender(); updatePanel(); }, 0);
    });
    renderErrorRemove = typeof remove === 'function' ? remove : null;
  }

  function applyQualityProfile(profile) {
    const g = getGeoFS();
    if (!g || !g.api || typeof g.api.renderingQuality !== 'function' || !g.preferences || !g.preferences.graphics) {
      throw new Error('GeoFS標準の描画品質APIが見つかりません');
    }
    captureOriginal();
    const graphics = g.preferences.graphics;
    const ultra = profile === 'ultra';
    graphics.quality = 0; // documented numeric Advanced mode
    graphics.advanced = graphics.advanced || {};
    ['buildings','vegetation','advancedAtmosphere','volumetricClouds','waterEffect','contrails','dropShadows','softShadows','globeLighting','fxaa'].forEach(key => { graphics[key] = true; });
    const adv = graphics.advanced;
    adv.viewingDistance = mobile ? (ultra ? 5 : 4) : (ultra ? 7 : 6);
    adv.resolutionScale = mobile ? 1 : (ultra ? 1.10 : 1.02);
    adv.tileCacheSize = mobile ? (ultra ? 900 : 600) : (ultra ? 2800 : 1600);
    adv.shadowQuality = mobile ? 0.78 : (ultra ? 1.25 : 1.05);
    adv.cloudDensity = ultra ? 1.08 : 1.02;
    adv.waterResolution = mobile ? (ultra ? 768 : 512) : (ultra ? 2048 : 1536);
    adv.fxaa = true;
    adv.dropShadow = true;
    adv.globeLighting = true;
    graphics.cloudShadows = true;
    graphics.contrails = true;
    graphics.waterEffect = true;
    g.api.renderingQuality(0, true);
    if (typeof g.api.setWaterEffect === 'function') safe(() => g.api.setWaterEffect(true));
    if (typeof g.api.setGlobeLighting === 'function') safe(() => g.api.setGlobeLighting(true));
    setNativeCheckbox(/^advanced atmosphere$/i, true);
    setNativeCheckbox(/^volumetric clouds$/i, true);
    setNativeCheckbox(/^buildings$|^enable buildings$/i, true);
    setNativeCheckbox(/^vegetation$|^enable vegetation$/i, true);
    setNativeCheckbox(/^water effect$/i, true);
    setNativeCheckbox(/^contrails$/i, true);
    setNativeCheckbox(/^fast approximate anti-aliasing \(fxaa\)$|^fxaa$/i, true);
    setNativeCheckbox(/^drop shadows$/i, true);
    setNativeCheckbox(/^soft shadows$/i, !mobile);
    setNativeCheckbox(/^globe lighting$/i, true);
    state.qualityProfile = profile;
    state.volumetricClouds = readNativeCheckbox(/^volumetric clouds$/i) === true;
    state.water = readNativeCheckbox(/^water effect$/i) === true;
    const applied = [readNativeCheckbox(/^advanced atmosphere$/i), readNativeCheckbox(/^volumetric clouds$/i), readNativeCheckbox(/^buildings$|^enable buildings$/i), readNativeCheckbox(/^vegetation$|^enable vegetation$/i), readNativeCheckbox(/^water effect$/i), readNativeCheckbox(/^contrails$/i), readNativeCheckbox(/^fast approximate anti-aliasing \(fxaa\)$|^fxaa$/i), readNativeCheckbox(/^drop shadows$/i), readNativeCheckbox(/^soft shadows$/i), readNativeCheckbox(/^globe lighting$/i)].filter(value => value === true).length;
    lastMessage = `${ultra ? 'ULTRA' : 'BALANCED'}：GeoFS公式Graphics項目 ${applied}/10 個がON。視距離 ${adv.viewingDistance}/7`;
    requestRender();
  }

  function toggleBuildingTextures(enable) {
    const g = getGeoFS();
    const map = g && g.configuration && g.configuration.current && g.configuration.current.qualityToBuildingTexture;
    if (!map) throw new Error('建物テクスチャ品質マップが見つかりません');
    captureOriginal();
    if (enable && !buildingTextureBackupActive) {
      originalTextureMap = clone(map);
      buildingTextureBackupActive = true;
      Object.keys(map).forEach(k => { map[k] = 'high'; });
    } else if (!enable && buildingTextureBackupActive) {
      Object.keys(map).forEach(k => { delete map[k]; });
      Object.assign(map, clone(originalTextureMap || original.buildingTextureMap || {}));
      buildingTextureBackupActive = false;
    }
    state.buildingTexture = enable;
    safe(() => g.buildings && g.buildings.updateTextures && g.buildings.updateTextures());
    lastMessage = enable ? '全品質段階の建物テクスチャをGeoFS最高品質(high)に設定しました' : '建物テクスチャ品質を元に戻しました';
    rebuildBuildingsIfActive();
  }

  function rebuildBuildingsIfActive() {
    const g = getGeoFS();
    if (!g || !g.api) return;
    const wasActive = !!(g.buildings && g.buildings.simple3DTileProvider);
    const shouldBeActive = !!(g.preferences && g.preferences.graphics && g.preferences.graphics.buildings);
    if (wasActive) {
      if (typeof g.api.setBuildings === 'function') { g.api.setBuildings(false); if (shouldBeActive) g.api.setBuildings(true); }
    }
  }

  function changeLod(kind, enable) {
    const g = getGeoFS();
    if (!g) throw new Error('GeoFSが見つかりません');
    const target = kind === 'building' ? g.buildings : g.trees;
    const levels = target && target.qualityLevels;
    if (!levels) throw new Error(`${kind} LOD設定が見つかりません`);
    captureOriginal();
    const backupKey = kind === 'building' ? 'building' : 'tree';
    const isBacked = kind === 'building' ? buildingLodBackupActive : treeLodBackupActive;
    if (enable && !isBacked) {
      if (kind === 'building') originalBuildingLevels = clone(levels);
      else originalTreeLevels = clone(levels);
      Object.keys(levels).forEach(q => {
        const tier = levels[q];
        Object.keys(tier || {}).forEach(z => {
          const entry = tier[z];
          if (!entry) return;
          entry.range = Math.min(mobile ? 3 : 7, Math.max(Number(entry.range) || 1, (Number(entry.range) || 1) + (mobile ? 0 : 1)));
          if (entry.altitude) entry.altitude = Math.round(entry.altitude * (mobile ? 1.04 : 1.08));
        });
      });
      if (kind === 'building') buildingLodBackupActive = true;
      else treeLodBackupActive = true;
    } else if (!enable && isBacked) {
      const source = kind === 'building' ? originalBuildingLevels : originalTreeLevels;
      Object.keys(levels).forEach(k => { delete levels[k]; });
      Object.assign(levels, clone(source || {}));
      if (kind === 'building') buildingLodBackupActive = false;
      else treeLodBackupActive = false;
    }
    if (kind === 'building') {
      state.buildingLOD = enable;
      rebuildBuildingsIfActive();
      lastMessage = enable ? '建物タイルの既存ズーム帯(10〜13)で読み込み周辺範囲を拡張しました' : '建物LODを標準へ戻しました';
    } else {
      state.treeLOD = enable;
      const active = !!(g.trees && g.trees.simple3DTileProvider);
      const pref = !!(g.preferences && g.preferences.graphics && g.preferences.graphics.vegetation);
      if (active) {
        if (typeof g.api.setVegetation === 'function') { g.api.setVegetation(false); if (pref) g.api.setVegetation(true); }
      }
      lastMessage = enable ? '植生タイルの既存ズーム帯で読み込み周辺範囲を拡張しました' : '植生LODを標準へ戻しました';
    }
  }

  function nativeCheckboxForLabel(pattern) {
    if (!document.body) return null;
    const inputs = $$('input[type="checkbox"]').filter(input => !(panel && panel.contains(input)) && !input.disabled);
    const scored = [];
    for (const input of inputs) {
      let labelText = '';
      if (input.labels && input.labels.length) {
        labelText = Array.from(input.labels).map(label => normalizeUiText(label.innerText || label.textContent)).join(' ');
      }
      if (!labelText && input.id) {
        const label = $(`label[for="${CSS.escape(input.id)}"]`);
        if (label) labelText = normalizeUiText(label.innerText || label.textContent);
      }
      if (labelText && pattern.test(labelText)) {
        scored.push({ input, score: labelText.length });
        continue;
      }
      // GeoFS versions that render a checkbox and its caption as siblings are handled
      // only when the nearest wrapper contains exactly this one checkbox.
      let parent = input.parentElement;
      for (let depth = 0; depth < 4 && parent; depth++, parent = parent.parentElement) {
        if (panel && panel.contains(parent)) break;
        const contained = parent.querySelectorAll ? Array.from(parent.querySelectorAll('input[type="checkbox"]')).filter(el => !(panel && panel.contains(el))) : [];
        if (contained.length !== 1 || contained[0] !== input) continue;
        const text = normalizeUiText(parent.innerText || parent.textContent);
        if (text.length > 0 && text.length <= 120 && pattern.test(text)) {
          scored.push({ input, score: text.length + depth * 100 });
          break;
        }
      }
    }
    scored.sort((a,b) => a.score - b.score);
    return scored.length ? scored[0].input : null;
  }

  function readNativeCheckbox(pattern) {
    const input = nativeCheckboxForLabel(pattern);
    return input ? !!input.checked : null;
  }

  function setNativeCheckbox(pattern, enabled) {
    const input = nativeCheckboxForLabel(pattern);
    if (!input) return false;
    if (!!input.checked !== !!enabled) input.click();
    return !!input.checked === !!enabled;
  }

  function restoreNativeGraphicsCheckboxes() {
    if (!original || !original.nativeControls) return;
    const map = [
      [/^advanced atmosphere$/i, 'advancedAtmosphere'],
      [/^volumetric clouds$/i, 'volumetricClouds'],
      [/^buildings$|^enable buildings$/i, 'buildings'],
      [/^vegetation$|^enable vegetation$/i, 'vegetation'],
      [/^water effect$/i, 'waterEffect'],
      [/^contrails$/i, 'contrails'],
      [/^fast approximate anti-aliasing \(fxaa\)$|^fxaa$/i, 'fxaa'],
      [/^drop shadows$/i, 'dropShadows'],
      [/^soft shadows$/i, 'softShadows'],
      [/^globe lighting$/i, 'globeLighting']
    ];
    map.forEach(([pattern,key]) => {
      const value = original.nativeControls[key];
      if (typeof value === 'boolean') setNativeCheckbox(pattern, value);
    });
  }

  function applyNativeWorldMax() {
    const g = getGeoFS();
    if (!g || !g.api || !g.preferences || !g.preferences.graphics || typeof g.api.renderingQuality !== 'function') {
      throw new Error('GeoFS純正 Graphics API が見つかりません');
    }
    captureOriginal();
    const p = g.preferences.graphics;
    p.quality = 0; // GeoFS 3.9 Advanced mode
    p.advanced = p.advanced || {};
    const adv = p.advanced;
    const rs = g.api.renderingSettings || {};
    const caps = gpuCapabilities();
    // Avoid the aggressive 4x/8x MSAA + post-process combination that can exhaust
    // texture/sampler resources on mobile browsers. MSAA is reserved for capable desktops.
    const sampleCount = !mobile && caps.webgl2 && caps.textureUnits >= 16 && caps.maxSamples >= 2 ? 2 : 1;
    const values = {
      viewingDistance: mobile ? 4 : 6,
      resolutionScale: mobile ? 0.88 : 1.0,
      tileCacheSize: mobile ? 520 : 1600,
      shadowQuality: mobile ? 0.62 : 0.95,
      cloudDensity: 1.04,
      waterResolution: mobile ? 512 : 1024,
      fxaa: true,
      dropShadow: true,
      globeLighting: true
    };
    Object.assign(adv, values);
    Object.assign(rs, {
      viewingDistance: values.viewingDistance,
      resolutionScale: values.resolutionScale,
      tileCacheSize: values.tileCacheSize,
      shadowMapSize: mobile ? 1024 : 2048,
      waterResolution: values.waterResolution,
      fxaa: true,
      dropShadow: true,
      globeLighting: true,
      maximumScreenSpaceError: mobile ? 2.8 : 2.0
    });
    // Keep the preference object coherent even when the Options panel is not open yet.
    ['buildings','vegetation','advancedAtmosphere','volumetricClouds','waterEffect','contrails','dropShadows','softShadows','globeLighting','fxaa'].forEach(key => { p[key] = true; });
    p.cloudShadows = true;
    p.contrails = true;
    p.waterEffect = true;
    if (typeof g.api.renderingQuality === 'function') g.api.renderingQuality(0, true);
    if (typeof g.api.setWaterEffect === 'function') safe(() => g.api.setWaterEffect(true));
    if (typeof g.api.setGlobeLighting === 'function') safe(() => g.api.setGlobeLighting(true));
    if (typeof g.api.useNativeShadows === 'function') safe(() => g.api.useNativeShadows(true));

    const nativeControls = [
      [/^advanced atmosphere$/i, true],
      [/^volumetric clouds$/i, true],
      [/^buildings$|^enable buildings$/i, true],
      [/^vegetation$|^enable vegetation$/i, true],
      [/^water effect$/i, true],
      [/^contrails$/i, true],
      [/^fast approximate anti-aliasing \(fxaa\)$|^fxaa$/i, true],
      [/^drop shadows$/i, true],
      [/^soft shadows$/i, true],
      [/^globe lighting$/i, true]
    ];
    const activated = nativeControls.reduce((count,[pattern,value]) => count + (setNativeCheckbox(pattern,value) ? 1 : 0), 0);
    const scene = g.api.viewer.scene;
    if (scene) {
      if ('highDynamicRange' in scene) safe(() => { scene.highDynamicRange = !mobile && caps.textureUnits >= 16; });
      if ('msaaSamples' in scene) safe(() => { scene.msaaSamples = sampleCount; });
      if (scene.globe) {
        safe(() => { scene.globe.enableLighting = true; });
        safe(() => { scene.globe.showGroundAtmosphere = true; });
        safe(() => { scene.globe.showWaterEffect = true; });
        safe(() => { scene.globe.maximumScreenSpaceError = mobile ? 2.8 : 2.0; });
        safe(() => { scene.globe.tileCacheSize = mobile ? 520 : 1600; });
      }
      if (scene.postProcessStages && scene.postProcessStages.fxaa) safe(() => { scene.postProcessStages.fxaa.enabled = true; });
    }
    state.volumetricClouds = true;
    state.water = true;
    state.shadows = true;
    state.qualityProfile = 'ultra';
    tunePhotorealisticTilesets();
    lastMessage = `GeoFS Advanced品質・HDR・MSAA ${sampleCount}x・影・大気・雲・建物・植生・水面を有効化。Graphics内で検出した純正チェック項目 ${activated}/${nativeControls.length} 個もON`;
    requestRender();
  }

  function photorealisticTilesets() {
    const g = getGeoFS();
    if (!g) return [];
    return [
      g.api && g.api.googleTileset,
      g.buildings && g.buildings.simple3DTileProvider,
      g.trees && g.trees.simple3DTileProvider
    ].filter(Boolean);
  }

  function tunePhotorealisticTilesets() {
    const g = getGeoFS();
    const C = getCesium();
    if (!g || !C) return;
    let iblCount = 0;
    photorealisticTilesets().forEach(tileset => {
      safe(() => {
        if ('shadows' in tileset && C.ShadowMode) tileset.shadows = C.ShadowMode.ENABLED;
        if ('maximumScreenSpaceError' in tileset) tileset.maximumScreenSpaceError = mobile ? 6.0 : 2.5;
        if ('dynamicScreenSpaceError' in tileset) tileset.dynamicScreenSpaceError = true;
        if ('cullRequestsWhileMoving' in tileset) tileset.cullRequestsWhileMoving = true;
        const ibl = tileset.imageBasedLighting;
        if (ibl && 'imageBasedLightingFactor' in ibl && C.Cartesian2) {
          if (!tileLightingBackups.has(tileset)) {
            const f = ibl.imageBasedLightingFactor;
            tileLightingBackups.set(tileset, f && Number.isFinite(f.x) && Number.isFinite(f.y)
              ? { x: f.x, y: f.y } : null);
          }
          // Keep diffuse IBL and specular/environment reflection at full supported strength.
          ibl.imageBasedLightingFactor = new C.Cartesian2(1.0, 1.0);
          iblCount++;
        }
      });
    });
    state.reflections = iblCount > 0;
    const viewer = g.api.viewer;
    if (viewer && viewer.shadowMap) {
      const gl = viewer.scene && viewer.scene.context && viewer.scene.context._gl;
      const maxTex = gl ? safe(() => gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 2048 : 2048;
      viewer.shadowMap.enabled = true;
      viewer.shadowMap.softShadows = true;
      viewer.shadowMap.size = Math.min(mobile ? 1024 : 2048, maxTex);
      viewer.shadowMap.darkness = 0.36;
    }
  }

  function toggleTileReflections(enable) {
    const C = getCesium();
    if (!C || !C.Cartesian2) throw new Error('Cesiumの3D Tiles IBL APIがありません');
    const tilesets = photorealisticTilesets();
    let changed = 0;
    tilesets.forEach(tileset => {
      const ibl = tileset.imageBasedLighting;
      if (!ibl || !('imageBasedLightingFactor' in ibl)) return;
      if (!tileLightingBackups.has(tileset)) {
        const f = ibl.imageBasedLightingFactor;
        tileLightingBackups.set(tileset, f && Number.isFinite(f.x) && Number.isFinite(f.y)
          ? { x: f.x, y: f.y } : null);
      }
      if (enable) ibl.imageBasedLightingFactor = new C.Cartesian2(1.0, 1.0);
      else {
        const backup = tileLightingBackups.get(tileset);
        if (backup) ibl.imageBasedLightingFactor = new C.Cartesian2(backup.x, backup.y);
      }
      changed++;
    });
    if (!changed) throw new Error('環境反射に対応した3D Tilesが現在読み込まれていません。Google実写3D等の対応モデルで利用できます');
    state.reflections = !!enable;
    lastMessage = enable ? `対応3D Tiles ${changed}件のPBR環境光・反射係数を最大化しました` : `対応3D Tiles ${changed}件の環境反射係数を元に戻しました`;
    requestRender();
  }

  function restoreTileLighting() {
    const C = getCesium();
    for (const [tileset, backup] of tileLightingBackups.entries()) {
      safe(() => {
        const ibl = tileset && tileset.imageBasedLighting;
        if (!ibl || !('imageBasedLightingFactor' in ibl)) return;
        if (backup && C && C.Cartesian2) ibl.imageBasedLightingFactor = new C.Cartesian2(backup.x, backup.y);
      });
    }
    tileLightingBackups.clear();
    state.reflections = false;
  }

  async function applyEverythingOn() {
    if (allOnPromise) return allOnPromise;
    allOnPromise = (async () => {
      const g = getGeoFS();
      if (!g) throw new Error('GeoFS Viewer が起動するまで待ってください');
      applyNativeWorldMax();
      const allFlags = [
        'road','crossings','rail','roadSurface','airportSurface','buildingOutlines','urbanSurfaces',
        'trafficFurniture','greenInfrastructure','barriers','powerNetwork','hydrography','streetObjects',
        'bridgeStructures','adaptivePerformance','autoNearbyData','parkingMarkings','roofEquipment',
        'roofs','buildingTexture','buildingLOD','treeLOD','volumetricClouds','water','shadows'
      ];
      allFlags.forEach(key => { state[key] = true; });
      state.qualityProfile = 'ultra';
      try { toggleBuildingTextures(true); } catch (e) { state.buildingTexture = false; lastMessage = `建物テクスチャ品質マップ未対応: ${e.message}`; }
      try { changeLod('building', true); } catch (_) { state.buildingLOD = false; }
      try { changeLod('tree', true); } catch (_) { state.treeLOD = false; }
      try { toggleShadows(true); } catch (_) { state.shadows = false; }
      const stages = g.api.viewer.scene.postProcessStages;
      // AO, Bloom and the custom sharpen stage are opt-in. Enabling them all at startup
      // can exceed the shader sampler budget on phone GPUs and older Cesium builds.
      if (stages && stages.ambientOcclusion) stages.ambientOcclusion.enabled = false;
      if (stages && stages.bloom) stages.bloom.enabled = false;
      state.ao = false; state.bloom = false; state.sharpen = false;
      try { setAtmosphereColorProfile(); } catch (_) {}
      try { applyNaturalImagery(); } catch (_) {}
      try { toggleAdaptivePerformance(true); } catch (_) { state.adaptivePerformance = true; }
      const cam = currentCamera();
      const inJapan = cam.lon >= GSI_ROOF_COVERAGE.minLon && cam.lon <= GSI_ROOF_COVERAGE.maxLon && cam.lat >= GSI_ROOF_COVERAGE.minLat && cam.lat <= GSI_ROOF_COVERAGE.maxLat;
      state.gsiImagery = inJapan;
      if (inJapan && !g.api.googleTileset && !mobile && gpuCapabilities().textureUnits >= 12) {
        try { toggleGsiGroundImagery(true); } catch (error) { lastMessage = `国土地理院地表写真は安全条件により保留: ${error.message}`; }
      } else {
        state.gsiImagery = false;
      }
      tunePhotorealisticTilesets();
      allOnApplied = true;
      if (cam.altitude <= 12000) {
        try {
          const counts = await loadOsmArea(false);
          lastMessage = `全部ON適用完了。現在地のOSM ${counts.roads}道路 / ${counts.roofs}屋根タグ / ${counts.trees}樹木を読み込み。実写屋根は写真ピクセルをそのまま投影`;
        } catch (error) {
          lastMessage = `全部ON適用済み。周辺地図データは未取得: ${error.message}`;
        }
      } else {
        lastMessage = '全部ON適用済み。周辺データは高度12,000m以下で自動取得します';
      }
      requestRender();
      return true;
    })();
    try { return await allOnPromise; }
    finally { allOnPromise = null; updatePanel(); }
  }

  function applyAtmosphere(enable) {
    const g = getGeoFS();
    if (!g || !g.api || !g.preferences || !g.preferences.graphics) throw new Error('GeoFS Graphics が見つかりません');
    captureOriginal();
    const a = setNativeCheckbox(/^advanced atmosphere$/i, !!enable);
    const v = setNativeCheckbox(/^volumetric clouds$/i, !!enable);
    if (!a && !v) throw new Error('公式GraphicsのAdvanced Atmosphere / Volumetric cloudsコントロールを検出できません。Options → Graphicsを開いてください');
    if (typeof g.api.renderingQuality === 'function') g.api.renderingQuality(g.preferences.graphics.quality, true);
    state.volumetricClouds = readNativeCheckbox(/^volumetric clouds$/i) === true;
    lastMessage = `GeoFS公式設定：Advanced Atmosphere ${a ? (enable?'ON':'OFF'):'未検出'} / Volumetric clouds ${v ? (enable?'ON':'OFF'):'未検出'}`;
    requestRender();
  }

  function toggleWater(enable) {
    const g = getGeoFS();
    if (!g || !g.api || typeof g.api.setWaterEffect !== 'function') throw new Error('GeoFS水面エフェクトAPIが見つかりません');
    captureOriginal();
    const current = !!(g.preferences.graphics && g.preferences.graphics.waterEffect);
    if (current !== enable) g.api.setWaterEffect(enable);
    g.preferences.graphics.waterEffect = !!enable;
    state.water = !!enable;
    lastMessage = enable ? 'GeoFS純正の水面波・航跡エフェクトを有効化しました' : '水面エフェクトを停止しました';
  }

  function toggleShadows(enable) {
    const g = getGeoFS();
    if (!g) throw new Error('GeoFSが見つかりません');
    captureOriginal();
    const viewer = g.api.viewer;
    if (typeof g.api.useNativeShadows === 'function') g.api.useNativeShadows(!!enable);
    else viewer.shadows = !!enable;
    if (viewer.shadowMap) {
      viewer.shadowMap.enabled = !!enable;
      viewer.shadowMap.softShadows = !!enable;
      const gl = viewer.scene && viewer.scene.context && viewer.scene.context._gl;
      const maxTex = gl ? safe(() => gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 2048 : 2048;
      viewer.shadowMap.size = enable ? Math.min(mobile ? 2048 : 4096, maxTex) : 1024;
      viewer.shadowMap.darkness = 0.36;
    }
    if (viewer.scene.globe && enable && g.api.setGlobeLighting) g.api.setGlobeLighting(true);
    if (viewer.scene.globe && 'shadows' in viewer.scene.globe) safe(() => { viewer.scene.globe.shadows = enable && getCesium().ShadowMode ? getCesium().ShadowMode.RECEIVE_ONLY : false; });
    if (enable) tunePhotorealisticTilesets();
    state.shadows = !!enable;
    lastMessage = enable ? 'ネイティブシャドウを有効化（解像度・柔らかさを調整）' : 'ネイティブシャドウを停止しました';
  }

  function setImageryProperty(name, value) {
    const g = getGeoFS();
    if (!g || !g.api.viewer.imageryLayers || !g.api.viewer.imageryLayers.length) return;
    const layer = g.api.viewer.imageryLayers.get(0);
    if (!layer) return;
    layer[name] = value;
    state[name] = value;
    requestRender();
  }

  function applyNaturalImagery() {
    setImageryProperty('brightness', 1.015);
    setImageryProperty('contrast', 1.035);
    setImageryProperty('saturation', 1.02);
    setImageryProperty('gamma', 1.005);
    state.brightness = 1.015;
    state.contrast = 1.035;
    state.saturation = 1.02;
    lastMessage = 'GeoFS航空写真を自然な明瞭度・コントラストに調整しました';
  }

  function setAtmosphereColorProfile() {
    const g = getGeoFS();
    if (!g || !g.api) return;
    if (typeof g.api.setAtmosphereColorModifier === 'function') {
      g.api.setAtmosphereColorModifier('geofs-msfs-v13', {
        brightnessShift: 0.015,
        saturationShift: 0.035,
        hueShift: 0,
        groundBrightnessShift: 0.01,
        groundSaturationShift: 0.025,
        groundHueShift: 0,
        fogBrightness: 1.02,
        cloudsBrightness: 1.025
      });
    }
    lastMessage = '空・地平線・雲の色調をGeoFS純正Atmosphere Modifierで微調整しました';
  }

  function togglePostProcess(name, enable) {
    const scene = getScene();
    if (!scene || !scene.postProcessStages) throw new Error('Cesium PostProcessStagesが見つかりません');
    const stage = name === 'ao' ? scene.postProcessStages.ambientOcclusion : scene.postProcessStages.bloom;
    if (!stage) throw new Error(`${name}ステージはこの端末・ビルドでは利用できません`);
    if (enable && gpuCapabilities().textureUnits < 8) throw new Error('GPUのテクスチャユニットが少ないため、この追加エフェクトは有効化できません');
    stage.enabled = !!enable;
    if (name === 'ao') state.ao = !!enable;
    else state.bloom = !!enable;
    if (name === 'ao' && stage.uniforms) {
      if (enable && 'intensity' in stage.uniforms) stage.uniforms.intensity = mobile ? 1.4 : 1.8;
    }
    lastMessage = `${name === 'ao' ? 'HBAO' : 'Bloom'}を${enable ? '有効' : '無効'}にしました`;
    requestRender();
  }

  function ensureSharpenStage() {
    const C = getCesium();
    const scene = getScene();
    if (sharpenStage || !C || !scene || !C.PostProcessStage || !scene.postProcessStages) return sharpenStage;
    const shader = `
      uniform sampler2D colorTexture;
      varying vec2 v_textureCoordinates;
      uniform vec2 u_pixel;
      uniform float u_strength;
      void main() {
        vec2 uv = v_textureCoordinates;
        vec4 center = texture2D(colorTexture, uv);
        vec3 north = texture2D(colorTexture, uv + vec2(0.0, u_pixel.y)).rgb;
        vec3 south = texture2D(colorTexture, uv - vec2(0.0, u_pixel.y)).rgb;
        vec3 east  = texture2D(colorTexture, uv + vec2(u_pixel.x, 0.0)).rgb;
        vec3 west  = texture2D(colorTexture, uv - vec2(u_pixel.x, 0.0)).rgb;
        vec3 lowFrequency = (north + south + east + west) * 0.25;
        vec3 detail = center.rgb - lowFrequency;
        vec3 result = clamp(center.rgb + detail * u_strength, 0.0, 1.0);
        gl_FragColor = vec4(result, center.a);
      }
    `;
    sharpenStage = scene.postProcessStages.add(new C.PostProcessStage({
      name: 'geofs-msfs-v13-detail-sharpen',
      fragmentShader: shader,
      uniforms: {
        u_pixel: () => new C.Cartesian2(1 / Math.max(1, scene.canvas.width), 1 / Math.max(1, scene.canvas.height)),
        u_strength: () => state.sharpness
      }
    }));
    sharpenStage.enabled = false;
    return sharpenStage;
  }

  function toggleSharpen(enable) {
    if (enable && mobile && gpuCapabilities().textureUnits < 12) throw new Error('この端末ではサンプラー上限対策のためシャープ処理を停止しています');
    const stage = ensureSharpenStage();
    if (!stage) throw new Error('ディテール強調用PostProcessStageが作成できません');
    stage.enabled = !!enable;
    state.sharpen = !!enable;
    lastMessage = enable ? `微細ディテール強調を有効化（強度 ${state.sharpness.toFixed(2)}）` : '微細ディテール強調を停止しました';
    requestRender();
  }

  function toggleHD() {
    const g = getGeoFS();
    if (!g || !g.api || typeof g.api.setHD !== 'function') throw new Error('GeoFS HD切替APIが見つかりません');
    if (g.api.googleTileset) throw new Error('Google実写3D中はGeoFS HD航空写真を切り替えられません');
    const current = g.api.hdOn === true || g.api.dataProvider === 'hd';
    g.api.setHD(!current);
    lastMessage = !current ? 'GeoFS HD航空写真への切替要求を送信しました（利用権限が必要な場合があります）' : 'GeoFS標準航空写真へ戻す要求を送信しました';
  }

  async function toggleGoogle3D() {
    const g = getGeoFS();
    const C = getCesium();
    if (!g || !g.api || typeof g.api.setGoogleTiles !== 'function' || !C || typeof C.createGooglePhotorealistic3DTileset !== 'function') {
      throw new Error('GeoFS純正Google Photorealistic 3D APIが見つかりません');
    }
    const enable = !g.api.googleTileset;
    if (enable && ionBuildingsTileset) {
      safe(() => g.api.viewer.scene.primitives.remove(ionBuildingsTileset));
      ionBuildingsTileset = null;
      if (ionNativeBuildingsWasEnabled && typeof g.api.setBuildings === 'function') g.api.setBuildings(true);
      ionNativeBuildingsWasEnabled = false;
      state.ionBuildings = false;
    }
    if (enable) {
      lastMessage = 'GeoFS純正Google実写3Dを読み込んでいます…';
      updatePanel();
      await g.api.setGoogleTiles(true);
      for (let i = 0; i < 80 && !g.api.googleTileset; i++) await delay(250);
      if (!g.api.googleTileset) throw new Error('Google実写3Dが作成されません。地域・APIキー・通信条件を確認してください');
      const tiles = g.api.googleTileset;
      safe(() => { tiles.maximumScreenSpaceError = mobile ? 5 : 2.2; });
      safe(() => { tiles.cacheBytes = mobile ? 192 * 1024 * 1024 : 768 * 1024 * 1024; });
      safe(() => { tiles.maximumCacheOverflowBytes = mobile ? 96 * 1024 * 1024 : 384 * 1024 * 1024; });
      safe(() => { tiles.foveatedScreenSpaceError = false; });
      safe(() => { tiles.cullRequestsWhileMoving = false; });
      removeRoadLayers(); removeRoofOverlay(); removeBuildingOutlines(); removeRoofEquipment(); removeFacadeDetails();
      removeGreenInfrastructure(); removeBarriers(); removePowerNetwork(); removeHydrography(); removeStreetObjects(); removeBridgeStructures();
      lastMessage = 'Google実写3Dを有効化。建物・屋根・道路の細部はGoogleの地域データに依存します';
    } else {
      await g.api.setGoogleTiles(false);
      lastMessage = 'Google実写3Dを解除してGeoFS標準地形へ戻しました';
      if (osmElements.length) await redrawOsmLayers();
    }
    requestRender();
  }

  async function toggleIonOsmBuildings() {
    const g = getGeoFS();
    const C = getCesium();
    if (!g || !C) throw new Error('GeoFS/Cesiumが見つかりません');
    const scene = g.api.viewer.scene;
    if (ionBuildingsTileset) {
      safe(() => scene.primitives.remove(ionBuildingsTileset));
      ionBuildingsTileset = null;
      if (ionNativeBuildingsWasEnabled && typeof g.api.setBuildings === 'function') g.api.setBuildings(true);
      if (ionGoogleWasActive && typeof g.api.setGoogleTiles === 'function') await g.api.setGoogleTiles(true);
      ionNativeBuildingsWasEnabled = false;
      ionGoogleWasActive = false;
      state.ionBuildings = false;
      lastMessage = 'Cesium OSM Buildingsを解除し、GeoFS標準建物へ戻しました';
      requestRender();
      return;
    }
    if (!C.IonResource || typeof C.IonResource.fromAssetId !== 'function' || !C.Cesium3DTileset) {
      throw new Error('このCesiumビルドではIon 3D Tiles APIを利用できません');
    }
    const token = window.prompt('Cesium ionのアクセストークンを入力してください。読み取り権限が必要です。トークンは保存せず、このページのメモリ内だけで使用します。');
    if (!token || !token.trim()) return;
    ionGoogleWasActive = !!g.api.googleTileset;
    if (ionGoogleWasActive) await g.api.setGoogleTiles(false);
    removeFacadeDetails(); removeRoofOverlay(); removeBuildingOutlines(); removeRoofEquipment();
    ionNativeBuildingsWasEnabled = !!(g.preferences && g.preferences.graphics && g.preferences.graphics.buildings);
    if (ionNativeBuildingsWasEnabled && typeof g.api.setBuildings === 'function') g.api.setBuildings(false);
    lastMessage = 'Cesium OSM Buildings（全球3D建物データ）を読み込んでいます…';
    updatePanel();
    try {
      // Asset 96188 is Cesium OSM Buildings. It is OSM-derived open data, not an MSFS/RFS asset dump.
      const resource = await C.IonResource.fromAssetId(96188, { accessToken: token.trim() });
      const tileset = new C.Cesium3DTileset({
        url: resource,
        maximumScreenSpaceError: mobile ? 7 : 2.8,
        maximumMemoryUsage: mobile ? 128 : 384,
        dynamicScreenSpaceError: true,
        cullRequestsWhileMoving: true,
        skipLevelOfDetail: false
      });
      ionBuildingsTileset = scene.primitives.add(tileset);
      if ('shadows' in ionBuildingsTileset && C.ShadowMode) ionBuildingsTileset.shadows = C.ShadowMode.RECEIVE_ONLY;
      state.ionBuildings = true;
      lastMessage = 'Cesium OSM Buildingsを追加しました。建物データはOSM属性・地域カバレッジに依存します';
    } catch (error) {
      ionBuildingsTileset = null;
      if (ionNativeBuildingsWasEnabled && typeof g.api.setBuildings === 'function') g.api.setBuildings(true);
      if (ionGoogleWasActive && typeof g.api.setGoogleTiles === 'function') await g.api.setGoogleTiles(true);
      ionNativeBuildingsWasEnabled = false;
      ionGoogleWasActive = false;
      throw new Error(`Cesium ion 3D建物を読み込めませんでした: ${error && error.message ? error.message : error}`);
    }
    requestRender();
  }

  // ---------- OpenStreetMap-driven ground detail ----------

  function parsePositive(value) {
    if (value === undefined || value === null) return null;
    const raw = String(value).trim().replace(',', '.');
    const m = raw.match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    let n = Number(m[0]);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (/\b(ft|feet|foot)\b|'/i.test(raw)) n *= 0.3048;
    return n;
  }

  function parseNumber(value) {
    if (value === undefined || value === null) return null;
    const m = String(value).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
  }

  function cameraCell(lat, lon) {
    const grid = 0.015;
    return `${(Math.round(lat / grid) * grid).toFixed(3)}_${(Math.round(lon / grid) * grid).toFixed(3)}`;
  }

  function readOsmCache(key) {
    try {
      const value = JSON.parse(localStorage.getItem(CACHE_PREFIX + key) || 'null');
      if (!value || Date.now() - value.time > CACHE_TTL || !Array.isArray(value.elements)) return null;
      return value.elements;
    } catch (_) { return null; }
  }

  function writeOsmCache(key, elements) {
    try {
      const payload = JSON.stringify({ time: Date.now(), elements });
      if (payload.length < 3_000_000) localStorage.setItem(CACHE_PREFIX + key, payload);
    } catch (_) {}
  }

  async function requestOsm(query) {
    let lastError = null;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 28000) : null;
        let response;
        try {
          response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: 'data=' + encodeURIComponent(query),
            signal: controller ? controller.signal : undefined,
            cache: 'no-store'
          });
        } finally { if (timer) clearTimeout(timer); }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data || !Array.isArray(data.elements)) throw new Error('OSM応答形式が不正です');
        return data.elements;
      } catch (error) { lastError = error; }
    }
    throw new Error(`OpenStreetMap取得失敗: ${lastError ? lastError.message : 'network error'}。時間を置いて再試行してください`);
  }

  async function loadOsmArea(force = false) {
    const point = currentCamera();
    if (point.altitude > 12000) throw new Error('高度12,000m以上では周辺データを取得しません');
    const radius = mobile ? 850 : 1450;
    const buildingRadius = mobile ? 500 : 760;
    const key = cameraCell(point.lat, point.lon);
    let elements = !force ? readOsmCache(key) : null;
    const fromCache = !!elements;
    if (!elements) {
      if (Date.now() - lastRequestAt < 45000) throw new Error('Overpassの利用負荷を抑えるため、次の取得まで45秒空けてください');
      lastRequestAt = Date.now();
      const q = `[out:json][timeout:30];(
        way(around:${radius},${point.lat},${point.lon})["highway"];
        way(around:${radius},${point.lat},${point.lon})["railway"~"^(rail|tram|light_rail|narrow_gauge)$"];
        way(around:${radius},${point.lat},${point.lon})["aeroway"~"^(runway|taxiway|helipad|apron|holding_position)$"];
        way(around:${radius},${point.lat},${point.lon})["amenity"="parking"];
        way(around:${radius},${point.lat},${point.lon})["leisure"~"^(park|pitch|playground|garden|golf_course|stadium)$"];
        way(around:${radius},${point.lat},${point.lon})["landuse"~"^(grass|meadow|forest|orchard|vineyard|farmland|cemetery|residential|commercial|industrial|retail)$"];
        way(around:${radius},${point.lat},${point.lon})["natural"~"^(water|wood|scrub|tree_row|wetland|beach|sand|bare_rock)$"];
        way(around:${radius},${point.lat},${point.lon})["waterway"~"^(river|canal|stream|drain|ditch)$"];
        way(around:${radius},${point.lat},${point.lon})["barrier"~"^(fence|wall|hedge|retaining_wall|guard_rail|city_wall|handrail|chain|ditch|hedge_bank|bollard|gate|lift_gate|swing_gate|cycle_barrier)$"];
        way(around:${radius},${point.lat},${point.lon})["power"~"^(line|minor_line|cable)$"]; 
        way(around:${radius},${point.lat},${point.lon})["man_made"~"^(pier|breakwater|embankment|dyke)$"];
        way(around:${buildingRadius},${point.lat},${point.lon})["building"];
        way(around:${buildingRadius},${point.lat},${point.lon})["building:part"];
        relation(around:${buildingRadius},${point.lat},${point.lon})["building"];
        node(around:${radius},${point.lat},${point.lon})["highway"~"^(crossing|traffic_signals|street_lamp|stop|give_way|bus_stop)$"];
        node(around:${radius},${point.lat},${point.lon})["natural"="tree"];
        node(around:${radius},${point.lat},${point.lon})["power"~"^(pole|tower)$"];
        node(around:${radius},${point.lat},${point.lon})["amenity"~"^(bench|bicycle_parking|waste_basket|waste_disposal|drinking_water|post_box|telephone|recycling|vending_machine|toilets|parking_entrance|bus_station)$"];
        node(around:${radius},${point.lat},${point.lon})["emergency"="fire_hydrant"];
        node(around:${radius},${point.lat},${point.lon})["barrier"~"^(bollard|gate|lift_gate|swing_gate|cycle_barrier)$"];
        node(around:${buildingRadius},${point.lat},${point.lon})["man_made"~"^(antenna|mast|chimney|water_tower|tower|flagpole|street_lamp|windmill)$"];
        node(around:${buildingRadius},${point.lat},${point.lon})["generator:source"~"^(solar|wind)$"];
        node(around:${radius},${point.lat},${point.lon})["traffic_calming"~"^(bump|hump|table|cushion|chicane)$"];
        node(around:${radius},${point.lat},${point.lon})["tourism"="information"];
        node(around:${radius},${point.lat},${point.lon})["entrance"];
        node(around:${radius},${point.lat},${point.lon})["aeroway"~"^(holding_position|windsock|light|beacon|runway_end|approach_light|taxiway_light|papi)$"];

      );out tags geom;`;
      elements = await requestOsm(q);
      writeOsmCache(key, elements);
    }
    osmElements = elements;
    lastOsmCell = key;
    lastAutoCellAttempt = key;
    lastDetailBand = detailLodBand(point.altitude);
    const counts = countOsm(elements);
    await redrawOsmLayers();
    lastMessage = `${fromCache ? 'キャッシュ' : 'OSM取得'}：道路${counts.roads}・空港${counts.airports}・都市区域${counts.urbanAreas}・信号/街灯${counts.traffic}・屋根タグ${counts.roofs}・樹木${counts.trees}・塀${counts.barriers}・水路${counts.waterways}`;
    return counts;
  }

  function countOsm(elements) {
    const counts = { bridges: 0, roads: 0, crossings: 0, railways: 0, roofs: 0, buildings: 0, airports: 0, urbanAreas: 0, traffic: 0, trees: 0, barriers: 0, powerWays: 0, waterways: 0, streetObjects: 0, entrances: 0, manmadeWays: 0, trafficCalming: 0 };
    elements.forEach(el => {
      const t = el.tags || {};
      if (el.type === 'node' && t.highway === 'crossing') counts.crossings++;
      if (el.type === 'way' && t.highway) counts.roads++;
      if (el.type === 'way' && t.highway && t.bridge && !/^(no|false|0)$/.test(String(t.bridge))) counts.bridges++;
      if (el.type === 'way' && t.railway) counts.railways++;
      if ((el.type === 'way' || el.type === 'relation') && (t.building || t['building:part'])) counts.buildings++;
      if ((el.type === 'way' || el.type === 'relation') && (t.building || t['building:part']) && t['roof:shape']) counts.roofs++;
      if (el.type === 'way' && t.aeroway) counts.airports++;
      if (el.type === 'way' && (t.amenity === 'parking' || t.leisure || t.natural || ['grass','meadow','farmland','forest','orchard','vineyard','cemetery'].includes(t.landuse))) counts.urbanAreas = (counts.urbanAreas || 0) + 1;
      if (el.type === 'node' && (t.highway === 'traffic_signals' || t.highway === 'street_lamp' || t.man_made === 'street_lamp')) counts.traffic++;
      if (el.type === 'node' && t.natural === 'tree') counts.trees++;
      if (el.type === 'way' && t.natural === 'tree_row') counts.trees++;
      if (el.type === 'way' && t.barrier) counts.barriers++;
      if (el.type === 'way' && t.power) counts.powerWays++;
      if (el.type === 'way' && t.man_made) counts.manmadeWays++;
      if (el.type === 'way' && t.waterway) counts.waterways++;
      if (el.type === 'node' && (t.amenity || t.emergency || t.highway === 'bus_stop' || t.tourism === 'information')) counts.streetObjects++;
      if (el.type === 'node' && t.entrance) counts.entrances++;
      if (el.type === 'node' && t.traffic_calming) counts.trafficCalming++;
    });
    return counts;
  }

  const EARTH = 6378137;
  function bearing(a, b) {
    const p1 = a.lat * Math.PI / 180;
    const p2 = b.lat * Math.PI / 180;
    const dl = (b.lon - a.lon) * Math.PI / 180;
    return Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
  }

  function destination(point, bearingRad, distance) {
    const d = distance / EARTH;
    const p1 = point.lat * Math.PI / 180;
    const l1 = point.lon * Math.PI / 180;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(bearingRad));
    const l2 = l1 + Math.atan2(Math.sin(bearingRad) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return { lat: p2 * 180 / Math.PI, lon: ((l2 * 180 / Math.PI + 540) % 360) - 180 };
  }

  function offsetPath(path, distance, side) {
    return path.map((p, i) => {
      const before = path[Math.max(0, i - 1)];
      const after = path[Math.min(path.length - 1, i + 1)];
      return destination(p, bearing(before, after) + side * Math.PI / 2, distance);
    });
  }

  function pxPerMeter() {
    const g = getGeoFS();
    if (!g) return 0.1;
    const camera = g.api.viewer.camera;
    const h = Math.max(120, camera.positionCartographic ? camera.positionCartographic.height : 1200);
    const ch = Math.max(240, g.api.viewer.scene.canvas.clientHeight || 700);
    const fovy = camera.frustum && camera.frustum.fovy ? camera.frustum.fovy : Math.PI / 3;
    return ch / (2 * Math.tan(fovy / 2) * h);
  }

  function roadStyle(tags) {
    const h = String(tags.highway || '').toLowerCase();
    const dict = {
      motorway: [15, '#353a40', true], motorway_link: [10, '#3b4045', true],
      trunk: [13, '#383d42', true], trunk_link: [9, '#40454a', true],
      primary: [11, '#44474a', true], primary_link: [8, '#484b4e', true],
      secondary: [9, '#4c4e50', true], secondary_link: [7, '#505254', false],
      tertiary: [7.5, '#525456', true], tertiary_link: [6.5, '#555759', false],
      unclassified: [5.5, '#55575a', false], residential: [5.5, '#56585a', false],
      living_street: [4.5, '#64625b', false], service: [4.0, '#62615c', false],
      pedestrian: [3.0, '#8a8579', false], cycleway: [2.0, '#8b8a80', false],
      footway: [1.7, '#969083', false], path: [1.5, '#969083', false], track: [2.5, '#8a806e', false],
      steps: [1.4, '#989184', false], bridleway: [1.4, '#938a78', false], busway: [3.3, '#686b6d', false], bus_guideway: [3.2, '#62676a', false]
    };
    const base = dict[h];
    if (!base) return null;
    let width = base[0];
    const explicitWidth = parsePositive(tags.width);
    const lanes = parseNumber(tags.lanes);
    if (explicitWidth) width = clamp(explicitWidth, 1.2, 36);
    else if (lanes && h.match(/motorway|trunk|primary|secondary|tertiary/)) width = clamp(lanes * 3.25 + 1.2, width, 36);
    const surface = String(tags.surface || '').toLowerCase();
    let color = base[1];
    if (/gravel|unpaved|ground|dirt|earth|fine_gravel|compacted/.test(surface)) color = '#777064';
    else if (/concrete|paving_stones|sett|cobblestone/.test(surface)) color = '#777873';
    else if (/asphalt|paved/.test(surface)) color = '#42464a';
    return { highway: h, width, color, marked: base[2], lanes: lanes || (base[2] ? 2 : 1), surface, sidewalk: String(tags.sidewalk || ''), cycleway: String(tags.cycleway || tags['cycleway:left'] || tags['cycleway:right'] || '') };
  }

  function positionsFromPath(C, path) {
    const flat = [];
    path.forEach(p => flat.push(p.lon, p.lat));
    return C.Cartesian3.fromDegreesArray(flat);
  }

  function removeRoadLayers() {
    const g = getGeoFS();
    if (roadPrimitive && g) safe(() => g.api.viewer.scene.groundPrimitives.remove(roadPrimitive));
    if (roadFallbackSource && g) safe(() => g.api.viewer.dataSources.remove(roadFallbackSource, true));
    if (roadMarkSource && g) safe(() => g.api.viewer.dataSources.remove(roadMarkSource, true));
    if (parkingMarkSource && g) safe(() => g.api.viewer.dataSources.remove(parkingMarkSource, true));
    if (roadSurfacePrimitive && g) safe(() => g.api.viewer.scene.groundPrimitives.remove(roadSurfacePrimitive));
    if (airportSurfacePrimitive && g) safe(() => g.api.viewer.scene.groundPrimitives.remove(airportSurfacePrimitive));
    if (airportMarkSource && g) safe(() => g.api.viewer.dataSources.remove(airportMarkSource, true));
    if (urbanSurfacePrimitive && g) safe(() => g.api.viewer.scene.groundPrimitives.remove(urbanSurfacePrimitive));
    removeTrafficFurniture();
    removeFacadeDetails();
    urbanSurfacePrimitive = null;
    roadPrimitive = null;
    roadFallbackSource = null;
    roadMarkSource = null;
    parkingMarkSource = null;
    roadSurfacePrimitive = null;
    airportSurfacePrimitive = null;
    airportMarkSource = null;
  }

  function createGroundPrimitive(C, scene, instances) {
    if (!instances.length) return null;
    if (!C.GroundPolylinePrimitive || !C.GroundPolylineGeometry || !C.PolylineColorAppearance) return null;
    try {
      const primitive = new C.GroundPolylinePrimitive({
        geometryInstances: instances,
        appearance: new C.PolylineColorAppearance({ translucent: true }),
        classificationType: C.ClassificationType.BOTH,
        asynchronous: true,
        allowPicking: false
      });
      scene.groundPrimitives.add(primitive);
      return primitive;
    } catch (error) {
      console.warn('[GeoFS v13] GroundPolylinePrimitive failed; using entity fallback', error);
      return null;
    }
  }

  function addGroundInstance(C, instances, path, width, color) {
    if (!path || path.length < 2) return;
    const clean = path.filter((p, i) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && (!i || Math.abs(p.lat - path[i - 1].lat) + Math.abs(p.lon - path[i - 1].lon) > 1e-10));
    if (clean.length < 2) return;
    try {
      const geometry = new C.GroundPolylineGeometry({ positions: positionsFromPath(C, clean), width, granularity: 250 });
      instances.push(new C.GeometryInstance({ geometry, attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(color) } }));
    } catch (_) {}
  }

  function drawFallbackRoadEntities(C, roads) {
    const g = getGeoFS();
    if (!g) return;
    roadFallbackSource = new C.CustomDataSource('GeoFS v13 OSM roads fallback');
    roads.forEach((item, i) => {
      const p = positionsFromPath(C, item.path);
      roadFallbackSource.entities.add({ id: `rr10-road-${i}`, polyline: {
        positions: p, clampToGround: true, width: item.width,
        material: item.color, classificationType: C.ClassificationType.BOTH
      }});
    });
    g.api.viewer.dataSources.add(roadFallbackSource);
  }

  function nearestRoadForNode(node, roads) {
    let best = null;
    const latScale = Math.cos(node.lat * Math.PI / 180) * 111320;
    const toXY = p => ({ x: (p.lon - node.lon) * latScale, y: (p.lat - node.lat) * 111320 });
    roads.forEach(road => {
      for (let i = 0; i < road.path.length - 1; i++) {
        const a = toXY(road.path[i]);
        const b = toXY(road.path[i + 1]);
        const dx = b.x - a.x, dy = b.y - a.y;
        const denom = dx * dx + dy * dy || 1;
        const t = clamp(-(a.x * dx + a.y * dy) / denom, 0, 1);
        const x = a.x + t * dx, y = a.y + t * dy;
        const d = Math.hypot(x, y);
        if (!best || d < best.distance) {
          best = { distance: d, heading: Math.atan2(dx, dy), width: road.style.width };
        }
      }
    });
    return best;
  }


  // ---------- OSM roof-shape overlays ----------

  function haversine(a, b) {
    const toRad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toRad;
    const dLon = (b.lon - a.lon) * toRad;
    const lat1 = a.lat * toRad;
    const lat2 = b.lat * toRad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function localXY(point, origin) {
    const lat0 = origin.lat * Math.PI / 180;
    return {
      x: EARTH_RADIUS * Math.cos(lat0) * (point.lon - origin.lon) * Math.PI / 180,
      y: EARTH_RADIUS * (point.lat - origin.lat) * Math.PI / 180
    };
  }

  function fitRectangle(path) {
    let best = null;
    for (let i = 0; i < path.length; i++) {
      const a = path[i], b = path[(i + 1) % path.length];
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const c = Math.cos(angle), s = Math.sin(angle);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      path.forEach(p => {
        const x = p.x * c + p.y * s;
        const y = -p.x * s + p.y * c;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      });
      const area = (maxX - minX) * (maxY - minY);
      if (!best || area < best.area) best = { area, angle, minX, maxX, minY, maxY };
    }
    if (!best) return null;
    let u = { x: Math.cos(best.angle), y: Math.sin(best.angle) };
    let v = { x: -Math.sin(best.angle), y: Math.cos(best.angle) };
    let length = best.maxX - best.minX;
    let width = best.maxY - best.minY;
    let cx = (best.minX + best.maxX) / 2;
    let cy = (best.minY + best.maxY) / 2;
    let center = { x: cx * u.x + cy * v.x, y: cx * u.y + cy * v.y };
    if (width > length) {
      const oldU = u; u = v; v = { x: -oldU.x, y: -oldU.y };
      const tmp = length; length = width; width = tmp;
    }
    return { center, u, v, length, width };
  }

  function polygonArea2D(points) {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum) * 0.5;
  }

  function polygonIsConvex(points) {
    let sign = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length], c = points[(i + 2) % points.length];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cross) < 1e-5) continue;
      const next = Math.sign(cross);
      if (sign && sign !== next) return false;
      sign = next;
    }
    return !!sign;
  }

  function inferRoofFromFootprint(tags, rect, convex, pointCount) {
    const explicit = String(tags['roof:shape'] || '').toLowerCase();
    if (['flat','gabled','hipped','pyramidal'].includes(explicit)) return { shape: explicit, confidence: 'OSM roof:shape', inferred: false };
    const building = String(tags.building || tags['building:part'] || '').toLowerCase();
    if (/^(industrial|warehouse|commercial|retail|office|school|university|hospital|hangar|supermarket|service)$/.test(building)) {
      return { shape: 'flat', confidence: 'building type', inferred: true };
    }
    if (!rect || !convex || pointCount < 4 || pointCount > 18) return { shape: 'flat', confidence: 'footprint fallback', inferred: true };
    const ratio = rect.length / Math.max(0.1, rect.width);
    if (/^(house|detached|semidetached_house|terrace|residential|bungalow|cabin|farm)$/.test(building)) {
      return { shape: ratio >= 1.35 ? 'gabled' : 'hipped', confidence: 'residential footprint', inferred: true };
    }
    if (ratio >= 1.8 && rect.length <= 55 && rect.width <= 22) return { shape: 'gabled', confidence: 'elongated footprint', inferred: true };
    if (ratio < 1.35 && rect.length <= 28 && rect.width <= 24) return { shape: 'hipped', confidence: 'compact footprint', inferred: true };
    return { shape: 'flat', confidence: 'conservative footprint fallback', inferred: true };
  }

  function roofCandidate(el) {
    if (!el || !el.tags || !(el.tags.building || el.tags['building:part']) || !Array.isArray(el.geometry) || el.geometry.length < 4) return null;
    if (el.type !== 'way' && el.type !== 'relation') return null;
    const ring = el.geometry.map(p => ({ lat: Number(p.lat), lon: Number(p.lon) })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (ring.length > 3 && Math.abs(ring[0].lat-ring[ring.length-1].lat)<1e-7 && Math.abs(ring[0].lon-ring[ring.length-1].lon)<1e-7) ring.pop();
    if (ring.length < 4 || ring.length > 48) return null;
    const origin = { lat: ring.reduce((a,p)=>a+p.lat,0)/ring.length, lon:ring.reduce((a,p)=>a+p.lon,0)/ring.length };
    const local = ring.map(p=>localXY(p,origin));
    const area = polygonArea2D(local);
    if (area < 12 || area > 50000) return null;
    const rect = fitRectangle(local);
    const convex = polygonIsConvex(local);
    const inference = inferRoofFromFootprint(el.tags, rect, convex, ring.length);
    const shape = inference.shape;
    if (!['flat','gabled','hipped','pyramidal'].includes(shape)) return null;
    if (shape !== 'flat' && (!rect || rect.length < 4 || rect.width < 2.2 || rect.length > 180 || rect.width > 110 || !convex)) return null;
    const tags = el.tags;
    const building = String(tags.building || tags['building:part'] || '').toLowerCase();
    const levels = parsePositive(tags['building:levels'] || tags.levels);
    let totalHeight = parsePositive(tags.height || tags['building:height']);
    let roofHeight = parsePositive(tags['roof:height']);
    if (!totalHeight && levels) totalHeight = levels * 3.05 + (roofHeight || 1.5);
    if (!totalHeight) {
      const defaults = { house:7.2, detached:7.2, semidetached_house:7.5, terrace:8.0, residential:9.0, bungalow:4.8, cabin:5.5, farm:7.0, apartments:14.0, industrial:9.0, warehouse:8.0, commercial:10.0, retail:8.5, office:14.0, school:10.0, hospital:16.0, hangar:11.0 };
      totalHeight = defaults[building] || (area > 1200 ? 9.0 : 7.0);
    }
    if (shape === 'flat') roofHeight = roofHeight || 0.22;
    else roofHeight = roofHeight || clamp((rect ? rect.width : 7) * (shape === 'gabled' ? 0.22 : 0.18), 1.0, 4.8);
    totalHeight = clamp(totalHeight, 3.2, 180);
    roofHeight = clamp(roofHeight, 0.18, 35);
    if (totalHeight <= roofHeight + 2.0) totalHeight = roofHeight + Math.max(3.0, levels ? levels*2.7 : 3.0);
    const material = String(tags['roof:material'] || '').toLowerCase();
    const colour = String(tags['roof:colour'] || tags['roof:color'] || '').trim();
    const orientation = String(tags['roof:orientation'] || 'along').toLowerCase();
    return {
      id: el.id, origin, ring, local, rect, shape, roofHeight,
      eaveHeight: totalHeight - roofHeight, totalHeight, tags,
      confidence: inference.confidence, inferred: inference.inferred,
      building, levels, material, colour,
      orientation: ['across','along'].includes(orientation) ? orientation : 'along'
    };
  }

  function removeRoofOverlay() {
    const g = getGeoFS();
    if (Array.isArray(roofPrimitive) && g) roofPrimitive.forEach(primitive => safe(() => g.api.viewer.scene.primitives.remove(primitive)));
    else if (roofPrimitive && g) safe(() => g.api.viewer.scene.primitives.remove(roofPrimitive));
    if (roofDetailSource && g) safe(() => g.api.viewer.dataSources.remove(roofDetailSource, true));
    roofPrimitive = [];
    roofDetailSource = null;
    roofPhotoTilesUsed = 0;
    roofPhotoBuildingsUsed = 0;
    roofPhotoBuildingsSkipped = 0;
  }

  // GSI's nationwide seamless orthophoto tiles are used as the actual roof surface texture.
  // Do not scrape Bing/Google/Esri tiles: their terms do not permit creating derived roof meshes.
  const GSI_ROOF_ZOOM = 18;
  const GSI_ROOF_TILE_SIZE = 256;
  const GSI_GROUND_TILE_URL = 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg';
  const GSI_ROOF_TILE_URL = 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/18/{x}/{y}.jpg';
  const GSI_ROOF_COVERAGE = { minLon: 122, maxLon: 154, minLat: 20, maxLat: 46 };

  function lonLatToGsiTile(lon, lat, zoom = GSI_ROOF_ZOOM) {
    const n = Math.pow(2, zoom);
    const clampedLat = clamp(lat, -85.05112878, 85.05112878);
    const rad = clampedLat * Math.PI / 180;
    const x = (lon + 180) / 360 * n;
    const y = (1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2 * n;
    const tileX = Math.floor(x), tileY = Math.floor(y);
    return {
      x: tileX, y: tileY, key: `${zoom}/${tileX}/${tileY}`,
      px: (x - tileX) * GSI_ROOF_TILE_SIZE,
      py: (y - tileY) * GSI_ROOF_TILE_SIZE
    };
  }

  function toggleGsiGroundImagery(enable) {
    const g = getGeoFS();
    const C = getCesium();
    if (!g || !C || !g.api.viewer.imageryLayers) throw new Error('Cesium ImageryLayers が見つかりません');
    if (enable) {
      if (gsiImageryLayer) { state.gsiImagery = true; return; }
      if (g.api.googleTileset) throw new Error('Google Photorealistic 3D使用中は地表写真レイヤーを重ねられません');
      const caps = gpuCapabilities();
      if (caps.textureUnits < 12) throw new Error(`GPUのテクスチャユニットが${caps.textureUnits}個のため、地表写真の追加レイヤーは安全のため停止しました`);
      if (g.api.viewer.imageryLayers.length > 1) throw new Error('既に複数の航空写真レイヤーがあるため、サンプラー上限対策としてGSI追加レイヤーを停止しました');
      if (!C.UrlTemplateImageryProvider || !C.Rectangle || typeof C.Rectangle.fromDegrees !== 'function') {
        throw new Error(`Cesium ${C.VERSION || ''}でURLテンプレート航空写真レイヤーが利用できません`);
      }
      const credit = C.Credit ? new C.Credit('出典：国土地理院「全国最新写真（シームレス）」') : '出典：国土地理院「全国最新写真（シームレス）」';
      const provider = new C.UrlTemplateImageryProvider({
        url: GSI_GROUND_TILE_URL,
        minimumLevel: 14,
        maximumLevel: GSI_ROOF_ZOOM,
        rectangle: C.Rectangle.fromDegrees(GSI_ROOF_COVERAGE.minLon, GSI_ROOF_COVERAGE.minLat, GSI_ROOF_COVERAGE.maxLon, GSI_ROOF_COVERAGE.maxLat),
        credit
      });
      gsiImageryLayer = g.api.viewer.imageryLayers.addImageryProvider(provider);
      gsiImageryLayer.alpha = 1;
      gsiImageryLayer.brightness = 1;
      gsiImageryLayer.contrast = 1;
      gsiImageryLayer.saturation = 1;
      state.gsiImagery = true;
      lastMessage = '日本国内の地表を国土地理院の実写オルソ写真で上書き表示しました（最大ズーム18）';
    } else {
      if (gsiImageryLayer) safe(() => g.api.viewer.imageryLayers.remove(gsiImageryLayer, true));
      gsiImageryLayer = null;
      state.gsiImagery = false;
      lastMessage = '国土地理院の地表写真レイヤーを解除しました';
    }
    requestRender();
  }

  function removeGsiGroundImagery() {
    const g = getGeoFS();
    if (gsiImageryLayer && g) safe(() => g.api.viewer.imageryLayers.remove(gsiImageryLayer, true));
    gsiImageryLayer = null;
    state.gsiImagery = false;
  }

  function loadGsiRoofTile(tile) {
    const key = tile.key;
    if (roofPhotoTileCache.has(key)) {
      const cached = roofPhotoTileCache.get(key);
      // LRU refresh
      roofPhotoTileCache.delete(key);
      roofPhotoTileCache.set(key, cached);
      return cached;
    }
    const promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        if (image.naturalWidth < 128 || image.naturalHeight < 128) reject(new Error('国土地理院の写真タイルが空、またはサイズ不正です'));
        else resolve(image);
      };
      image.onerror = () => reject(new Error('国土地理院写真タイルを取得できません（通信/CORS/提供範囲を確認）'));
      image.src = GSI_ROOF_TILE_URL.replace('{x}', String(tile.x)).replace('{y}', String(tile.y));
    });
    roofPhotoTileCache.set(key, promise);
    promise.catch(() => { if (roofPhotoTileCache.get(key) === promise) roofPhotoTileCache.delete(key); });
    while (roofPhotoTileCache.size > (mobile ? 20 : 52)) {
      const oldest = roofPhotoTileCache.keys().next().value;
      roofPhotoTileCache.delete(oldest);
    }
    return promise;
  }

  function gsiFloatPosition(lon, lat, zoom = GSI_ROOF_ZOOM) {
    const n = Math.pow(2, zoom);
    const clampedLat = clamp(lat, -85.05112878, 85.05112878);
    const rad = clampedLat * Math.PI / 180;
    return { x:(lon+180)/360*n, y:(1-Math.asinh(Math.tan(rad))/Math.PI)/2*n };
  }

  function gsiFloatToGeo(x, y, zoom = GSI_ROOF_ZOOM) {
    const n = Math.pow(2, zoom);
    const lon = x/n*360-180;
    const lat = Math.atan(Math.sinh(Math.PI*(1-2*y/n))) * 180/Math.PI;
    return { lon, lat };
  }

  function clipPolygonToTile(vertices, minX, minY, maxX, maxY) {
    const clip = (input, inside, intersect) => {
      const out = [];
      if (!input.length) return out;
      for (let i=0; i<input.length; i++) {
        const a = input[i], b = input[(i+1)%input.length];
        const ia = inside(a), ib = inside(b);
        if (ia && ib) out.push(b);
        else if (ia && !ib) out.push(intersect(a,b));
        else if (!ia && ib) { out.push(intersect(a,b)); out.push(b); }
      }
      return out;
    };
    let out = vertices;
    const makeX = x => (a,b) => { const t=(x-a.x)/(b.x-a.x || 1e-12); return {x,y:a.y+(b.y-a.y)*t,h:a.h+(b.h-a.h)*t}; };
    const makeY = y => (a,b) => { const t=(y-a.y)/(b.y-a.y || 1e-12); return {x:a.x+(b.x-a.x)*t,y,h:a.h+(b.h-a.h)*t}; };
    out = clip(out, p=>p.x>=minX-1e-10, makeX(minX));
    out = clip(out, p=>p.x<=maxX+1e-10, makeX(maxX));
    out = clip(out, p=>p.y>=minY-1e-10, makeY(minY));
    out = clip(out, p=>p.y<=maxY+1e-10, makeY(maxY));
    // Remove duplicate adjacent vertices introduced at tile edges.
    const clean = [];
    out.forEach(p => { const q=clean[clean.length-1]; if (!q || Math.hypot(p.x-q.x,p.y-q.y)>1e-8) clean.push(p); });
    if (clean.length>2 && Math.hypot(clean[0].x-clean[clean.length-1].x,clean[0].y-clean[clean.length-1].y)<1e-8) clean.pop();
    return clean;
  }

  function appendPhotographicPolygon(C, groups, id, faceVertices, maxTiles) {
    if (!Array.isArray(faceVertices) || faceVertices.length < 3) return 0;
    const vertices = faceVertices.map(v => {
      const p = gsiFloatPosition(v.geo.lon, v.geo.lat);
      const h = C.Cartographic.fromCartesian(v.position).height;
      return { x:p.x, y:p.y, h };
    });
    const minX=Math.floor(Math.min(...vertices.map(v=>v.x))), maxX=Math.floor(Math.max(...vertices.map(v=>v.x))-1e-9);
    const minY=Math.floor(Math.min(...vertices.map(v=>v.y))), maxY=Math.floor(Math.max(...vertices.map(v=>v.y))-1e-9);
    let added=0;
    for (let tx=minX; tx<=maxX; tx++) {
      for (let ty=minY; ty<=maxY; ty++) {
        if (!groups.has(`${GSI_ROOF_ZOOM}/${tx}/${ty}`) && groups.size>=maxTiles) continue;
        const clipped=clipPolygonToTile(vertices,tx,ty,tx+1,ty+1);
        if (clipped.length<3) continue;
        const geo=clipped.map(p=>gsiFloatToGeo(p.x,p.y));
        const positions=clipped.map((p,i)=>C.Cartesian3.fromDegrees(geo[i].lon,geo[i].lat,p.h+0.03));
        const area=polygonArea2D(clipped.map(p=>({x:p.x-tx,y:p.y-ty})));
        if (area<1e-11) continue;
        const tileKey=`${GSI_ROOF_ZOOM}/${tx}/${ty}`;
        if (!groups.has(tileKey)) groups.set(tileKey,{x:tx,y:ty,key:tileKey,instances:[],buildingIds:new Set()});
        const uv=clipped.map(p=>new C.Cartesian2(clamp(p.x-tx,0,1),clamp(1-(p.y-ty),0,1)));
        const hierarchy=new C.PolygonHierarchy(positions);
        const textureHierarchy=new C.PolygonHierarchy(uv);
        const geometry=new C.PolygonGeometry({
          polygonHierarchy:hierarchy,
          textureCoordinates:textureHierarchy,
          perPositionHeight:true,
          vertexFormat:C.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
          granularity:C.Math.RADIANS_PER_DEGREE/300
        });
        groups.get(tileKey).instances.push(new C.GeometryInstance({id:`${id}-${tx}-${ty}`,geometry}));
        added++;
      }
    }
    return added;
  }

  function weatherSeed(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function weatheredRoofPhoto(image, tile) {
    const key = `${tile.key}:weather-v1`;
    if (weatheredRoofTileCache.has(key)) return weatheredRoofTileCache.get(key);
    const width = Math.min(512, image.naturalWidth || image.width || 256);
    const height = Math.min(512, image.naturalHeight || image.height || 256);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return image;
    try {
      ctx.drawImage(image, 0, 0, width, height);
      const frame = ctx.getImageData(0, 0, width, height);
      const px = frame.data;
      let seed = weatherSeed(key);
      const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const spots = Array.from({ length: Math.max(8, Math.round(width * height / 10000)) }, () => ({
        x: rand() * width, y: rand() * height,
        rx: width * (0.018 + rand() * 0.075), ry: height * (0.018 + rand() * 0.075),
        power: 0.035 + rand() * 0.105, warm: rand() < 0.34
      }));
      const grain = new Float32Array(32 * 32);
      for (let i = 0; i < grain.length; i++) grain[i] = rand() - 0.5;
      const streaks = Array.from({ length: 7 }, () => ({
        x: rand() * width, y: rand() * height, length: height * (0.06 + rand() * 0.22),
        width: 0.45 + rand() * 1.4, angle: (rand() - 0.5) * 0.45, power: 0.025 + rand() * 0.055
      }));
      for (let y = 0; y < height; y++) {
        const gy = Math.min(31, (y / height * 32) | 0);
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          let stain = 0, warm = 0;
          for (let j = 0; j < spots.length; j++) {
            const sp = spots[j], dx = (x - sp.x) / sp.rx, dy = (y - sp.y) / sp.ry;
            const d = dx * dx + dy * dy;
            if (d < 1) { const v = (1 - d) * sp.power; stain += v; if (sp.warm) warm += v; }
          }
          for (let j = 0; j < streaks.length; j++) {
            const st = streaks[j], dx = x - st.x, dy = y - st.y;
            const along = dx * Math.sin(st.angle) + dy * Math.cos(st.angle);
            const across = Math.abs(dx * Math.cos(st.angle) - dy * Math.sin(st.angle));
            if (along >= 0 && along <= st.length && across < st.width) stain += st.power * (1 - across / st.width) * (0.35 + 0.65 * (1 - along / st.length));
          }
          const gx = Math.min(31, (x / width * 32) | 0);
          const micro = grain[gy * 32 + gx] * 3.2 + (rand() - 0.5) * 2.1;
          const darken = Math.min(0.20, stain);
          const delta = micro - darken * 74;
          px[i] = Math.max(0, Math.min(255, px[i] + delta + warm * 5));
          px[i + 1] = Math.max(0, Math.min(255, px[i + 1] + delta - warm * 1.5));
          px[i + 2] = Math.max(0, Math.min(255, px[i + 2] + delta - warm * 6));
        }
      }
      ctx.putImageData(frame, 0, 0);
      weatheredRoofTileCount++;
    } catch (error) {
      roofPhotoLastError = `屋根の汚れ加工をスキップ: ${error && error.message ? error.message : error}`;
      return image;
    }
    weatheredRoofTileCache.set(key, canvas);
    while (weatheredRoofTileCache.size > (mobile ? 8 : 24)) weatheredRoofTileCache.delete(weatheredRoofTileCache.keys().next().value);
    return canvas;
  }

  async function commitPhotographicGroups(C, groups, targetArray) {
    const entries = Array.from(groups.values());
    const loaded = await Promise.all(entries.map(async group => {
      try { return { group, image: await loadGsiRoofTile(group) }; }
      catch (error) { roofPhotoLastError = error && error.message ? error.message : String(error); return null; }
    }));
    let rendered = 0;
    let renderedBuildings = 0;
    let renderedTiles = 0;
    const renderedBuildingIds = new Set();
    for (const result of loaded) {
      if (!result || !result.group.instances.length) continue;
      const group = result.group;
      try {
        const bakedPhoto = weatheredRoofPhoto(result.image, group);
        const material = C.Material.fromType('Image', { image: bakedPhoto });
        const primitive = new C.Primitive({
          geometryInstances: group.instances,
          appearance: new C.MaterialAppearance({ material, flat: false, faceForward: false, translucent: false, closed: false, materialSupport: C.MaterialAppearance.MaterialSupport.TEXTURED }),
          asynchronous: true,
          compressVertices: true,
          allowPicking: false,
          releaseGeometryInstances: true
        });
        const scene = getScene();
        if (!scene || !scene.primitives) throw new Error('Cesium scene.primitives が見つかりません');
        if (C.ShadowMode && 'shadows' in primitive) primitive.shadows = C.ShadowMode.ENABLED;
        targetArray.push(scene.primitives.add(primitive));
        rendered += group.instances.length;
        if (group.buildingIds) group.buildingIds.forEach(id => renderedBuildingIds.add(id));
        renderedBuildings = renderedBuildingIds.size;
        renderedTiles++;
      } catch (error) {
        roofPhotoLastError = error && error.message ? error.message : String(error);
      }
    }
    return { instances: rendered, buildings: renderedBuildings, tiles: renderedTiles };
  }

  function clipFootprintByRidge(candidate, ground, sideSign) {
    const rect=candidate.rect;
    const local=candidate.local;
    const signed=local.map(p=>(p.x-rect.center.x)*rect.v.x+(p.y-rect.center.y)*rect.v.y);
    const input=candidate.ring.map((p,i)=>({p,ground:ground[i],s:signed[i]}));
    const output=[];
    const inside=v=>sideSign>0?v.s>=-1e-8:v.s<=1e-8;
    for(let i=0;i<input.length;i++){
      const a=input[i], b=input[(i+1)%input.length];
      const ia=inside(a), ib=inside(b);
      if(ia&&ib) output.push(b);
      else if(ia&&!ib) {
        const t=a.s/(a.s-b.s || 1e-12);
        output.push({p:{lat:a.p.lat+(b.p.lat-a.p.lat)*t,lon:a.p.lon+(b.p.lon-a.p.lon)*t},ground:a.ground+(b.ground-a.ground)*t,s:0});
      } else if(!ia&&ib) {
        const t=a.s/(a.s-b.s || 1e-12);
        output.push({p:{lat:a.p.lat+(b.p.lat-a.p.lat)*t,lon:a.p.lon+(b.p.lon-a.p.lon)*t},ground:a.ground+(b.ground-a.ground)*t,s:0});
        output.push(b);
      }
    }
    const cleaned=[];
    output.forEach(v=>{const q=cleaned[cleaned.length-1];if(!q||haversine(q.p,v.p)>0.015)cleaned.push(v);});
    if(cleaned.length>2&&haversine(cleaned[0].p,cleaned[cleaned.length-1].p)<0.015)cleaned.pop();
    return cleaned;
  }

  function buildInferredRoofFaces(C, candidate, ground) {
    const c=candidate;
    const toVertex=(p,height)=>({geo:{lon:p.lon,lat:p.lat},position:C.Cartesian3.fromDegrees(p.lon,p.lat,height)});
    if(c.shape==='flat') {
      return [c.ring.map((p,i)=>toVertex(p,ground[i]+c.totalHeight+0.18))];
    }
    const halfWidth=Math.max(0.8,c.rect.width/2);
    if(c.shape==='gabled') {
      const negative=clipFootprintByRidge(c,ground,-1);
      const positive=clipFootprintByRidge(c,ground,1);
      const toSlopeVertex=v=>{
        const rise=c.roofHeight*clamp(1-Math.abs(v.s)/halfWidth,0,1);
        return toVertex(v.p,v.ground+c.eaveHeight+rise+0.18);
      };
      const faces=[negative,positive].filter(face=>face.length>=3).map(face=>face.map(toSlopeVertex));
      return faces.length===2?faces:[];
    }
    // Hipped / pyramidal roofs use a central ridge/apex; every edge retains its original footprint.
    const centerLocal=c.rect.center;
    const lat=c.origin.lat+centerLocal.y/EARTH_RADIUS*180/Math.PI;
    const lon=c.origin.lon+centerLocal.x/(EARTH_RADIUS*Math.cos(c.origin.lat*Math.PI/180))*180/Math.PI;
    const avgGround=ground.reduce((a,b)=>a+b,0)/ground.length;
    const apex=toVertex({lat,lon},avgGround+c.totalHeight+0.18);
    const eaves=c.ring.map((p,i)=>toVertex(p,ground[i]+c.eaveHeight+0.18));
    const faces=[];
    for(let i=0;i<eaves.length;i++) faces.push([eaves[i],eaves[(i+1)%eaves.length],apex]);
    return faces;
  }

  async function drawRoofOverlay() {
    const g=getGeoFS(), C=getCesium();
    if(!g||!C) throw new Error('GeoFS/Cesiumが見つかりません');
    removeRoofOverlay(); roofPhotoLastError=''; roofPhotoInferredBuildings=0; roofPhotoExplicitBuildings=0;
    if(!state.roofs||g.api.googleTileset) return 0;
    if(!C.PolygonGeometry||!C.MaterialAppearance||!C.MaterialAppearance.MaterialSupport||!C.MaterialAppearance.MaterialSupport.TEXTURED||!C.Material||typeof C.Material.fromType!=='function'||!C.sampleTerrain) throw new Error(`Cesium ${C.VERSION||''}に必要な屋根メッシュAPIがありません`);
    const camera=currentCamera();
    if(camera.lon<GSI_ROOF_COVERAGE.minLon||camera.lon>GSI_ROOF_COVERAGE.maxLon||camera.lat<GSI_ROOF_COVERAGE.minLat||camera.lat>GSI_ROOF_COVERAGE.maxLat) throw new Error('実写屋根写真の提供範囲は日本です。範囲外ではGeoFS標準の実写航空写真・3D建物を優先します');
    if(camera.altitude>2400) throw new Error('実写屋根の表示LODは高度2,400m以下です');
    const maxBuildings=mobile?48:160, maxTiles=mobile?14:42;
    const candidates=osmElements.map(roofCandidate).filter(Boolean)
      .filter(c=>Math.hypot((c.origin.lat-camera.lat)*111320,(c.origin.lon-camera.lon)*111320*Math.cos(camera.lat*Math.PI/180))<(mobile?720:1350))
      .sort((a,b)=>{
        const da=Math.hypot((a.origin.lat-camera.lat)*111320,(a.origin.lon-camera.lon)*111320*Math.cos(camera.lat*Math.PI/180));
        const db=Math.hypot((b.origin.lat-camera.lat)*111320,(b.origin.lon-camera.lon)*111320*Math.cos(camera.lat*Math.PI/180));
        return da-db;
      }).slice(0,maxBuildings);
    if(!candidates.length) throw new Error('周辺の建物フットプリントがありません。OSM周辺データを先に取得してください');
    const sampleRefs=[];
    candidates.forEach((candidate,ci)=>candidate.ring.forEach((p,pi)=>sampleRefs.push({candidateIndex:ci,pointIndex:pi,carto:C.Cartographic.fromDegrees(p.lon,p.lat)})));
    let terrainSamples=[];
    try { terrainSamples=await C.sampleTerrain(g.api.viewer.terrainProvider,13,sampleRefs.map(ref=>ref.carto)); } catch(_) { terrainSamples=[]; }
    const samplesByCandidate=candidates.map(()=>[]);
    sampleRefs.forEach((ref,i)=>{
      let h=terrainSamples[i]&&Number(terrainSamples[i].height);
      if(!Number.isFinite(h)) h=safe(()=>g.api.viewer.scene.globe.getHeight(ref.carto));
      samplesByCandidate[ref.candidateIndex][ref.pointIndex]=Number.isFinite(h)?h:null;
    });
    const groups=new Map(); let createdBuildings=0, skipped=0;
    for(let i=0;i<candidates.length;i++){
      const c=candidates[i], ground=samplesByCandidate[i];
      if(ground.length!==c.ring.length||ground.some(h=>!Number.isFinite(h))){skipped++;continue;}
      const faces=buildInferredRoofFaces(C,c,ground);
      if(!faces.length){skipped++;continue;}
      const before=new Map(Array.from(groups.entries()).map(([key,value])=>[key,value.instances.length]));
      let pieces=0;
      for(let fi=0;fi<faces.length;fi++) pieces+=appendPhotographicPolygon(C,groups,`geofs-v13-photo-roof-${c.id}-${fi}`,faces[fi],maxTiles);
      if(pieces>0){
        for(const group of groups.values()) if(group.instances.length>(before.get(group.key)||0)) group.buildingIds.add(String(c.id));
        createdBuildings++;
        if(c.inferred) roofPhotoInferredBuildings++; else roofPhotoExplicitBuildings++;
      } else skipped++;
    }
    if(!groups.size) throw new Error('周辺建物の屋根が写真タイル／地形データに適合しませんでした');
    const summary=await commitPhotographicGroups(C,groups,roofPrimitive);
    roofPhotoTilesUsed=summary.tiles; roofPhotoBuildingsUsed=summary.buildings;
    roofPhotoBuildingsSkipped=skipped+Math.max(0,candidates.length-createdBuildings);
    if(!summary.instances){removeRoofOverlay();throw new Error(roofPhotoLastError||'実写屋根テクスチャをGPUへ登録できませんでした');}
    requestRender();
    return roofPhotoBuildingsUsed;
  }

  async function redrawOsmLayers() {
    await redrawRoadsAndTransportImpl();
    await drawRoadSurfaceAndAirport();
    if (state.roofs) { try { await drawRoofOverlay(); } catch (error) { roofPhotoLastError = error && error.message ? error.message : String(error); } }
    else removeRoofOverlay();
    await drawBuildingOutlines();
    await drawRoofEquipment();
    await drawUrbanSurfacePatches();
    await drawParkingBayMarkings();
    await drawTrafficFurniture();
    await drawGreenInfrastructure();
    await drawBarriers();
    await drawPowerNetwork();
    await drawHydrography();
    await drawStreetObjects();
    await drawBridgeStructures();
    if (state.facadeWindows) await drawFacadeDetails();
    else removeFacadeDetails();
  }

  async function redrawRoadsAndTransport() {
    await redrawRoadsAndTransportImpl();
  }

  // ---------- Panel actions and lifecycle ----------

  function removeBuildingOutlines() {
    const g = getGeoFS();
    if (buildingOutlineSource && g) safe(() => g.api.viewer.dataSources.remove(buildingOutlineSource, true));
    buildingOutlineSource = null;
  }

  function removeRoofEquipment() {
    const g = getGeoFS();
    if (roofEquipmentSource && g) safe(() => g.api.viewer.dataSources.remove(roofEquipmentSource, true));
    if (solarPanelPrimitive && g) safe(() => g.api.viewer.scene.primitives.remove(solarPanelPrimitive));
    roofEquipmentSource = null;
    solarPanelPrimitive = null;
  }

  function addCorridorInstance(C, instances, path, width, color, id) {
    if (!C.CorridorGeometry || !C.GroundPrimitive || !C.PerInstanceColorAppearance) return false;
    if (!Array.isArray(path) || path.length < 2 || !Number.isFinite(width) || width < 1) return false;
    const clean = path.filter((p, i) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && (!i || Math.abs(p.lat - path[i - 1].lat) + Math.abs(p.lon - path[i - 1].lon) > 1e-9));
    if (clean.length < 2) return false;
    try {
      const geometry = new C.CorridorGeometry({
        positions: positionsFromPath(C, clean),
        width: clamp(width, 1, 80),
        cornerType: C.CornerType ? C.CornerType.BEVELED : undefined,
        granularity: 0.00004,
        vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT
      });
      instances.push(new C.GeometryInstance({
        id: id || `geofs-v13-corridor-${instances.length}`,
        geometry,
        attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(color) }
      }));
      return true;
    } catch (_) { return false; }
  }

  function addGroundFillPrimitive(C, scene, instances) {
    if (!instances.length || !C.GroundPrimitive || !C.PerInstanceColorAppearance) return null;
    try {
      if (typeof C.GroundPrimitive.isSupported === 'function' && !C.GroundPrimitive.isSupported(scene)) return null;
      const p = new C.GroundPrimitive({
        geometryInstances: instances,
        appearance: new C.PerInstanceColorAppearance({ flat: true, translucent: true }),
        classificationType: C.ClassificationType.BOTH,
        asynchronous: true,
        compressVertices: true,
        allowPicking: false,
        releaseGeometryInstances: true
      });
      scene.groundPrimitives.add(p);
      return p;
    } catch (error) {
      console.warn('[GeoFS MSFS Realism v13] Ground fill creation failed', error);
      return null;
    }
  }

  function pathLengthMeters(path) {
    let sum = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const y = (a.lat + b.lat) * 0.5 * Math.PI / 180;
      const dx = (b.lon - a.lon) * Math.PI / 180 * EARTH_RADIUS * Math.cos(y);
      const dy = (b.lat - a.lat) * Math.PI / 180 * EARTH_RADIUS;
      sum += Math.hypot(dx, dy);
    }
    return sum;
  }

  function isClosedOsmRing(path) {
    return Array.isArray(path) && path.length >= 4 && Math.abs(path[0].lat - path[path.length - 1].lat) < 1e-7 && Math.abs(path[0].lon - path[path.length - 1].lon) < 1e-7;
  }

  function addGroundPolygonInstance(C, instances, path, color, id) {
    if (!C.PolygonGeometry || !C.PolygonHierarchy || !Array.isArray(path)) return false;
    const ring = path.slice();
    if (isClosedOsmRing(ring)) ring.pop();
    if (ring.length < 3 || ring.length > 80) return false;
    try {
      const positions = positionsFromPath(C, ring);
      const geometry = new C.PolygonGeometry({
        polygonHierarchy: new C.PolygonHierarchy(positions),
        perPositionHeight: false,
        vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT
      });
      instances.push(new C.GeometryInstance({
        id: id || `geofs-v13-area-${instances.length}`,
        geometry,
        attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(color) }
      }));
      return true;
    } catch (_) { return false; }
  }

  async function drawUrbanSurfacePatches() {
    const g = getGeoFS(); const C = getCesium();
    if (!g || !C) return 0;
    if (urbanSurfacePrimitive) safe(() => g.api.viewer.scene.groundPrimitives.remove(urbanSurfacePrimitive));
    urbanSurfacePrimitive = null;
    if (!state.urbanSurfaces || g.api.googleTileset || currentCamera().altitude > 7000) return 0;
    const instances = [];
    const max = mobile ? 28 : 95;
    let count = 0;
    for (const el of osmElements) {
      if (count >= max || el.type !== 'way' || !el.tags || !Array.isArray(el.geometry)) continue;
      const path = el.geometry.map(p => ({ lat: Number(p.lat), lon: Number(p.lon) })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      if (!isClosedOsmRing(path)) continue;
      const tags = el.tags;
      let color = null;
      if (tags.amenity === 'parking') color = C.Color.fromCssColorString('#555a5e').withAlpha(0.105);
      else if (tags.leisure === 'park' || tags.leisure === 'playground' || tags.landuse === 'grass' || tags.landuse === 'meadow') color = C.Color.fromCssColorString('#65845d').withAlpha(0.085);
      else if (tags.leisure === 'pitch') color = C.Color.fromCssColorString('#4d7854').withAlpha(0.11);
      else if (tags.landuse === 'forest' || tags.natural === 'wood') color = C.Color.fromCssColorString('#426b49').withAlpha(0.13);
      else if (tags.landuse === 'orchard' || tags.landuse === 'vineyard') color = C.Color.fromCssColorString('#69804b').withAlpha(0.12);
      else if (tags.natural === 'scrub' || tags.landuse === 'farmland') color = C.Color.fromCssColorString('#6c7851').withAlpha(0.075);
      else if (tags.natural === 'wetland') color = C.Color.fromCssColorString('#647f6f').withAlpha(0.11);
      else if (tags.natural === 'beach' || tags.natural === 'sand') color = C.Color.fromCssColorString('#b7a47a').withAlpha(0.12);
      else if (tags.natural === 'bare_rock') color = C.Color.fromCssColorString('#817d75').withAlpha(0.10);
      else if (tags.natural === 'water' || tags.water) color = C.Color.fromCssColorString('#5d8eaa').withAlpha(0.10);
      if (!color) continue;
      const origin = { lat: path.reduce((a,p) => a + p.lat, 0) / path.length, lon: path.reduce((a,p) => a + p.lon, 0) / path.length };
      const local = path.map(p => localXY(p, origin));
      let area = 0;
      for (let i = 0; i < local.length; i++) area += local[i].x * local[(i+1)%local.length].y - local[(i+1)%local.length].x * local[i].y;
      area = Math.abs(area) * 0.5;
      if (area < 35 || area > 240000) continue;
      if (addGroundPolygonInstance(C, instances, path, color, `geofs-v13-urban-${el.id}`)) count++;
    }
    if (instances.length) urbanSurfacePrimitive = addGroundFillPrimitive(C, g.api.viewer.scene, instances);
    requestRender();
    return count;
  }

  function localToGeo(point, origin) {
    const cosLat = Math.max(0.15, Math.cos(origin.lat * Math.PI / 180));
    return {
      lat: origin.lat + point.y / EARTH_RADIUS * 180 / Math.PI,
      lon: origin.lon + point.x / (EARTH_RADIUS * cosLat) * 180 / Math.PI
    };
  }

  async function drawParkingBayMarkings() {
    const g = getGeoFS(); const C = getCesium();
    if (!g || !C) return 0;
    if (parkingMarkSource) safe(() => g.api.viewer.dataSources.remove(parkingMarkSource, true));
    parkingMarkSource = null;
    if (!state.parkingMarkings || g.api.googleTileset || currentCamera().altitude > 2200 || !C.CustomDataSource) return 0;
    parkingMarkSource = new C.CustomDataSource('GeoFS v13 parking bay markings');
    const maxLots = mobile ? 5 : 16;
    const maxLines = mobile ? 70 : 230;
    let lots = 0, lines = 0;
    for (const el of osmElements) {
      if (lots >= maxLots || lines >= maxLines || el.type !== 'way' || !el.tags || el.tags.amenity !== 'parking' || !Array.isArray(el.geometry)) continue;
      const path = el.geometry.map(p => ({ lat: Number(p.lat), lon: Number(p.lon) })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      if (!isClosedOsmRing(path)) continue;
      const ring = path.slice(0, -1);
      if (ring.length < 4 || ring.length > 60) continue;
      const origin = { lat: ring.reduce((a,p)=>a+p.lat,0)/ring.length, lon: ring.reduce((a,p)=>a+p.lon,0)/ring.length };
      const local = ring.map(p => localXY(p, origin));
      const rect = fitRectangle(local);
      if (!rect || rect.length < 15 || rect.length > 180 || rect.width < 7 || rect.width > 45 || rect.length / rect.width > 9) continue;
      let polygonArea = 0;
      for (let j=0;j<local.length;j++) polygonArea += local[j].x*local[(j+1)%local.length].y-local[(j+1)%local.length].x*local[j].y;
      polygonArea = Math.abs(polygonArea)*0.5;
      if (polygonArea < 90 || (rect.length*rect.width)/polygonArea > 1.35) continue;
      const surface = String(el.tags.surface || '').toLowerCase();
      const color = C.Color.fromCssColorString(/gravel|ground|dirt/.test(surface) ? '#e6e0ce' : '#f6f4e8').withAlpha(0.70);
      const toWorld = (x, y) => localToGeo({ x: rect.center.x + rect.u.x*x + rect.v.x*y, y: rect.center.y + rect.u.y*x + rect.v.y*y }, origin);
      const addLine = (a, b, id) => {
        if (lines >= maxLines) return;
        const pa = toWorld(a.x, a.y), pb = toWorld(b.x, b.y);
        parkingMarkSource.entities.add({ id, polyline: {
          positions: C.Cartesian3.fromDegreesArray([pa.lon,pa.lat,pb.lon,pb.lat]),
          clampToGround: true, classificationType: C.ClassificationType.BOTH,
          width: 1.05, material: color
        }});
        lines++;
      };
      // Generic two-sided 90-degree parking bay layout. It is drawn only inside mapped parking polygons.
      const halfL = rect.length * 0.5 - 1.2;
      const halfW = rect.width * 0.5 - 0.6;
      const aisleHalf = Math.min(3.1, Math.max(2.4, rect.width * 0.22));
      if (halfL <= 4 || halfW <= aisleHalf + 2.2) continue;
      addLine({x:-halfL,y:0},{x:halfL,y:0},`geofs-v13-parking-aisle-${el.id}`);
      const slotPitch = 2.55;
      for (let x = -halfL + slotPitch; x < halfL && lines < maxLines; x += slotPitch) {
        addLine({x,y:aisleHalf},{x,y:halfW},`geofs-v13-parking-n-${el.id}-${Math.round((x+halfL)/slotPitch)}`);
        addLine({x,y:-aisleHalf},{x,y:-halfW},`geofs-v13-parking-s-${el.id}-${Math.round((x+halfL)/slotPitch)}`);
      }
      lots++;
    }
    if (lines) g.api.viewer.dataSources.add(parkingMarkSource);
    else parkingMarkSource = null;
    requestRender();
    return lines;
  }

  function airportCenterline(path) {
    if (!isClosedOsmRing(path)) return path;
    const ring = path.slice(0, -1);
    if (ring.length < 4) return path;
    const origin = { lat: ring.reduce((s,p)=>s+p.lat,0)/ring.length, lon: ring.reduce((s,p)=>s+p.lon,0)/ring.length };
    const rect = fitRectangle(ring.map(p => localXY(p, origin)));
    if (!rect || rect.length < 35 || rect.width < 8) return path;
    const make = sign => {
      const x = rect.center.x + rect.u.x * rect.length * 0.5 * sign;
      const y = rect.center.y + rect.u.y * rect.length * 0.5 * sign;
      return { lat: origin.lat + y / EARTH_RADIUS * 180 / Math.PI, lon: origin.lon + x / (EARTH_RADIUS * Math.max(0.15, Math.cos(origin.lat * Math.PI / 180))) * 180 / Math.PI };
    };
    return [make(-1), make(1)];
  }

  function drawAirportMarkings(C, source, way, path, width) {
    if (!C.PolylineDashMaterialProperty || path.length < 2) return;
    const tags = way.tags || {};
    const kind = String(tags.aeroway || '');
    const center = airportCenterline(path);
    const positions = positionsFromPath(C, center);
    if (kind === 'helipad') {
      const ring = isClosedOsmRing(path) ? path.slice(0, -1) : path;
      const centroid = ring.reduce((a,p)=>({lat:a.lat+p.lat/ring.length,lon:a.lon+p.lon/ring.length}),{lat:0,lon:0});
      source.entities.add({ id:`geofs-v13-helipad-${way.id}`, position:C.Cartesian3.fromDegrees(centroid.lon,centroid.lat,1.2), label:{text:String(tags.ref || 'H'),font:'bold 22px sans-serif',fillColor:C.Color.WHITE,outlineColor:C.Color.BLACK,outlineWidth:3,style:C.LabelStyle.FILL_AND_OUTLINE,horizontalOrigin:C.HorizontalOrigin.CENTER,verticalOrigin:C.VerticalOrigin.CENTER} });
      return;
    }
    if (kind === 'taxiway') {
      source.entities.add({ id: `geofs-v13-taxi-${way.id}`, polyline: {
        positions, clampToGround: true, classificationType: C.ClassificationType.BOTH, width: 2.3,
        material: C.Color.fromCssColorString('#f2c742').withAlpha(0.9)
      }});
      return;
    }
    if (kind !== 'runway') return;
    const length = pathLengthMeters(center);
    source.entities.add({ id: `geofs-v13-runway-center-${way.id}`, polyline: {
      positions, clampToGround: true, classificationType: C.ClassificationType.BOTH, width: 2.2,
      material: new C.PolylineDashMaterialProperty({ color: C.Color.WHITE.withAlpha(0.74), gapColor: C.Color.TRANSPARENT, dashLength: 35 })
    }});
    const barCount = width >= 45 ? 12 : 8;
    const barSpan = Math.min(width * 0.72, 32);
    [0, 1].forEach(endIndex => {
      const p = center[endIndex === 0 ? 0 : center.length - 1];
      const next = center[endIndex === 0 ? 1 : center.length - 2];
      const h = bearing(p, next);
      const inward = destination(p, h, 16);
      for (let i = 0; i < barCount; i++) {
        const lateral = (i - (barCount - 1) / 2) * barSpan / Math.max(1, barCount - 1);
        const a = destination(inward, h + Math.PI / 2, lateral - 1.7);
        const b = destination(inward, h + Math.PI / 2, lateral + 1.7);
        source.entities.add({ id: `geofs-v13-threshold-${way.id}-${endIndex}-${i}`, polyline: {
          positions: positionsFromPath(C, [a, b]), clampToGround: true, classificationType: C.ClassificationType.BOTH,
          width: 3.1, material: C.Color.WHITE.withAlpha(0.86)
        }});
      }
      if (length > 1500) {
        const aim = destination(p, h, Math.min(300, length * 0.24));
        [-1, 1].forEach(side => {
          const a = destination(aim, h + Math.PI / 2, side * 8 - 22);
          const b = destination(aim, h + Math.PI / 2, side * 8 + 22);
          source.entities.add({ id: `geofs-v13-aim-${way.id}-${endIndex}-${side}`, polyline: {
            positions: positionsFromPath(C, [a, b]), clampToGround: true, classificationType: C.ClassificationType.BOTH,
            width: 5.0, material: C.Color.WHITE.withAlpha(0.80)
          }});
        });
      }
      const refs = String(tags.ref || '').split(/[\/;]/).map(x => x.trim()).filter(Boolean);
      const labelText = refs.length >= 2 ? refs[endIndex === 0 ? 0 : 1] : (refs[0] || '');
      if (labelText) {
        const labelPos = destination(p, h, 95);
        source.entities.add({ id: `geofs-v13-runway-label-${way.id}-${endIndex}`, position: C.Cartesian3.fromDegrees(labelPos.lon, labelPos.lat, 1.5), label: {
          text: labelText.slice(0, 4), font: 'bold 15px sans-serif', fillColor: C.Color.WHITE,
          outlineColor: C.Color.BLACK, outlineWidth: 3, style: C.LabelStyle.FILL_AND_OUTLINE,
          horizontalOrigin: C.HorizontalOrigin.CENTER, verticalOrigin: C.VerticalOrigin.CENTER,
          disableDepthTestDistance: 0
        }});
      }
    });
  }

  async function drawRoadSurfaceAndAirport() {
    const g = getGeoFS(); const C = getCesium();
    if (!g || !C) return;
    const scene = g.api.viewer.scene;
    if (roadSurfacePrimitive) safe(() => scene.groundPrimitives.remove(roadSurfacePrimitive));
    if (airportSurfacePrimitive) safe(() => scene.groundPrimitives.remove(airportSurfacePrimitive));
    if (airportMarkSource) safe(() => g.api.viewer.dataSources.remove(airportMarkSource, true));
    roadSurfacePrimitive = null; airportSurfacePrimitive = null; airportMarkSource = null;
    if (g.api.googleTileset || (!state.roadSurface && !state.airportSurface)) return;
    const altitude = currentCamera().altitude;
    if (altitude > 8500) return;
    const roadInstances = [], airportInstances = [];
    let roadCount = 0, airportCount = 0;
    const maxRoads = mobile ? 90 : 240;
    const maxAir = mobile ? 22 : 60;
    const ways = osmElements.filter(el => el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2);
    ways.forEach(el => {
      const tags = el.tags || {};
      const path = el.geometry.map(p => ({ lat: Number(p.lat), lon: Number(p.lon) })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      if (path.length < 2) return;
      if (state.roadSurface && tags.highway && roadCount < maxRoads) {
        const style = roadStyle(tags);
        if (style && tags.bridge !== 'yes' && tags.tunnel !== 'yes' && tags.access !== 'no' && !['construction', 'proposed', 'raceway'].includes(style.highway) && !(altitude > 2600 && !/motorway|trunk|primary|secondary/.test(style.highway))) {
          const detail = altitude < 1300;
          const outerAlpha = detail ? 0.18 : 0.11;
          const innerAlpha = detail ? 0.16 : 0.09;
          const rough = /gravel|unpaved|ground|dirt|earth|fine_gravel|compacted/.test(style.surface) || style.highway === 'track';
          const pavementColor = C.Color.fromCssColorString(rough ? '#817664' : style.color).withAlpha(innerAlpha);
          const shoulderColor = C.Color.fromCssColorString(rough ? '#635b4d' : '#252b31').withAlpha(outerAlpha);
          if (isClosedOsmRing(path)) addGroundPolygonInstance(C, roadInstances, path, pavementColor, `geofs-v13-road-area-${el.id}`);
          else {
            addCorridorInstance(C, roadInstances, path, style.width + (detail ? 2.0 : 1.0), shoulderColor, `geofs-v13-road-shoulder-${el.id}`);
            addCorridorInstance(C, roadInstances, path, style.width, pavementColor, `geofs-v13-road-surface-${el.id}`);
          }
          roadCount++;
        }
      }
      if (state.airportSurface && tags.aeroway && airportCount < maxAir) {
        const kind = String(tags.aeroway);
        if (!['runway', 'taxiway', 'helipad'].includes(kind)) return;
        const length = pathLengthMeters(path);
        if (kind !== 'helipad' && length < (kind === 'runway' ? 250 : 60)) return;
        const mappedWidth = parsePositive(tags.width);
        let inferredWidth = null;
        if (!mappedWidth && isClosedOsmRing(path)) {
          const ring = path.slice(0,-1);
          const origin = { lat:ring.reduce((a,p)=>a+p.lat,0)/ring.length, lon:ring.reduce((a,p)=>a+p.lon,0)/ring.length };
          const rect = fitRectangle(ring.map(p=>localXY(p,origin)));
          if (rect) inferredWidth = rect.width;
        }
        const width = mappedWidth || inferredWidth || (kind === 'runway' ? 42 : kind === 'taxiway' ? 18 : 24);
        const surface = String(tags.surface || '').toLowerCase();
        const isConcrete = /concrete|cement|paving_stones/.test(surface);
        const color = C.Color.fromCssColorString(kind === 'taxiway' ? (isConcrete ? '#777a79' : '#484b4d') : (isConcrete ? '#92918b' : '#45494c')).withAlpha(kind === 'runway' ? 0.17 : 0.20);
        const shoulder = C.Color.fromCssColorString('#25292c').withAlpha(0.13);
        if (isClosedOsmRing(path)) {
          addGroundPolygonInstance(C, airportInstances, path, color, `geofs-v13-airport-area-${el.id}`);
        } else if (kind !== 'helipad') {
          addCorridorInstance(C, airportInstances, path, width + 3.5, shoulder, `geofs-v13-airport-edge-${el.id}`);
          addCorridorInstance(C, airportInstances, path, width, color, `geofs-v13-airport-surface-${el.id}`);
        }
        airportCount++;
      }
    });
    roadSurfacePrimitive = addGroundFillPrimitive(C, scene, roadInstances);
    airportSurfacePrimitive = addGroundFillPrimitive(C, scene, airportInstances);
    if (state.airportSurface && C.CustomDataSource) {
      airportMarkSource = new C.CustomDataSource('GeoFS v13 airport markings');
      let markings = 0;
      ways.forEach(el => {
        if (markings >= (mobile ? 14 : 40)) return;
        const tags = el.tags || {};
        if (!['runway', 'taxiway', 'helipad'].includes(String(tags.aeroway || ''))) return;
        const path = el.geometry.map(p => ({ lat: Number(p.lat), lon: Number(p.lon) })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
        if (path.length < 2) return;
        let markWidth = parsePositive(tags.width);
        if (!markWidth && isClosedOsmRing(path)) {
          const ring = path.slice(0,-1);
          const origin = {lat:ring.reduce((a,p)=>a+p.lat,0)/ring.length,lon:ring.reduce((a,p)=>a+p.lon,0)/ring.length};
          const rect = fitRectangle(ring.map(p=>localXY(p,origin)));
          if (rect) markWidth = rect.width;
        }
        drawAirportMarkings(C, airportMarkSource, el, path, markWidth || (tags.aeroway === 'runway' ? 42 : 18));
        markings++;
      });
      // Holding-position nodes are real OSM airport data; draw the double hold-short marking across the nearby taxiway.
      const holdingNodes = osmElements.filter(el => el.type === 'node' && el.tags && el.tags.aeroway === 'holding_position' && Number.isFinite(Number(el.lat)) && Number.isFinite(Number(el.lon)));
      const taxiWays = ways.filter(el => el.tags && el.tags.aeroway === 'taxiway').map(el => ({ path: el.geometry.map(p=>({lat:Number(p.lat),lon:Number(p.lon)})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)), style: { width: parsePositive(el.tags.width) || 18 } })).filter(x=>x.path.length>=2);
      holdingNodes.slice(0, mobile ? 4 : 12).forEach((node, i) => {
        const point = {lat:Number(node.lat),lon:Number(node.lon)};
        const nearest = nearestRoadForNode(point, taxiWays);
        if (!nearest || nearest.distance > 28) return;
        const width = clamp(nearest.width * 0.78, 7, 27);
        const yellow = C.Color.fromCssColorString('#f2d34d').withAlpha(0.92);
        [-1.3, 1.3].forEach((along, j) => {
          const center = destination(point, nearest.heading, along);
          const a = destination(center, nearest.heading + Math.PI/2, -width/2);
          const b = destination(center, nearest.heading + Math.PI/2, width/2);
          airportMarkSource.entities.add({ id:`geofs-v13-hold-short-${node.id||i}-${j}`, polyline:{positions:positionsFromPath(C,[a,b]),clampToGround:true,classificationType:C.ClassificationType.BOTH,width:2.8,material:j===0?yellow:new C.PolylineDashMaterialProperty({color:yellow,gapColor:C.Color.TRANSPARENT,dashLength:4})} });
        });
      });
      // Only map-authored aeroway lighting is displayed; no invented runway-light layout.
      const airLights = osmElements.filter(el => el.type === 'node' && el.tags && /^(light|beacon|runway_end|approach_light|taxiway_light|papi)$/.test(String(el.tags.aeroway || '')) && Number.isFinite(Number(el.lat)) && Number.isFinite(Number(el.lon)));
      airLights.slice(0, mobile ? 16 : 54).forEach((node, i) => {
        const col = String(node.tags['light:colour'] || node.tags.colour || '').toLowerCase();
        const color = node.tags.aeroway === 'beacon' ? '#d9574f' : node.tags.aeroway === 'papi' ? (i % 2 ? '#d9574f' : '#f1e8c7') : node.tags.aeroway === 'taxiway_light' ? '#48a878' : (/blue/.test(col) ? '#4c8bdb' : /green/.test(col) ? '#48a878' : /red/.test(col) ? '#d9574f' : '#f1e8c7');
        airportMarkSource.entities.add({ id:`geofs-v13-aeroway-light-${node.id||i}`, position:C.Cartesian3.fromDegrees(Number(node.lon),Number(node.lat),groundAt(C,g,Number(node.lat),Number(node.lon))+0.35), ellipsoid:{radii:new C.Cartesian3(0.42,0.42,0.22),material:C.Color.fromCssColorString(color).withAlpha(0.92),outline:false} });
      });
      if (airportMarkSource.entities.values.length) g.api.viewer.dataSources.add(airportMarkSource);
      else airportMarkSource = null;
    }
    requestRender();
    return { roadCount, airportCount };
  }

  async function drawBuildingOutlines() {
    const g = getGeoFS(); const C = getCesium();
    removeBuildingOutlines();
    if (!state.buildingOutlines || !g || !C || g.api.googleTileset) return 0;
    if (currentCamera().altitude > 2400) return 0;
    buildingOutlineSource = new C.CustomDataSource('GeoFS v13 building footprints');
    const max = mobile ? 80 : 240;
    let count = 0;
    osmElements.forEach(el => {
      if (count >= max || el.type !== 'way' || !el.tags || !(el.tags.building || el.tags['building:part']) || !Array.isArray(el.geometry)) return;
      const path = el.geometry.map(p => ({ lat: Number(p.lat), lon: Number(p.lon) })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      if (path.length < 4) return;
      const points = path.map(p => C.Cartesian3.fromDegrees(p.lon, p.lat));
      buildingOutlineSource.entities.add({ id: `geofs-v13-footprint-${el.id}`, polyline: {
        positions: points, clampToGround: true, width: 1.0,
        material: C.Color.fromCssColorString('#272c31').withAlpha(0.55),
        classificationType: C.ClassificationType.BOTH
      }});
      count++;
    });
    if (count) g.api.viewer.dataSources.add(buildingOutlineSource);
    else buildingOutlineSource = null;
    return count;
  }

  async function drawRoofEquipment() {
    const g = getGeoFS(); const C = getCesium();
    removeRoofEquipment();
    if (!state.roofEquipment || !g || !C || g.api.googleTileset) return 0;
    if (currentCamera().altitude > 1700) return 0;
    roofEquipmentSource = new C.CustomDataSource('GeoFS v13 rooftop equipment');
    const max = mobile ? 24 : 80;
    let count = 0;
    const elements = osmElements.filter(el => el.type === 'node' && el.tags && (el.tags.man_made || el.tags.power === 'tower') && Number.isFinite(Number(el.lat)) && Number.isFinite(Number(el.lon)));
    elements.slice(0, max).forEach((el, i) => {
      const tags = el.tags || {};
      const kind = String(tags.man_made || (tags.power === 'tower' ? 'tower' : ''));
      const h = parsePositive(tags.height || tags['tower:height'] || tags['mast:height']);
      if (!h || h > 180) return;
      const lat = Number(el.lat), lon = Number(el.lon);
      const carto = C.Cartographic.fromDegrees(lon, lat);
      let ground = safe(() => g.api.viewer.scene.globe.getHeight(carto));
      if (!Number.isFinite(ground)) ground = 0;
      const isChimney = kind === 'chimney';
      const isWater = kind === 'water_tower';
      const radius = isChimney ? 0.8 : isWater ? 1.6 : 0.22;
      const color = C.Color.fromCssColorString(isChimney ? '#77736d' : isWater ? '#8b9395' : '#727c83');
      roofEquipmentSource.entities.add({
        id: `geofs-v13-roof-fixture-${el.id || i}`,
        position: C.Cartesian3.fromDegrees(lon, lat, ground + h / 2),
        cylinder: {
          length: h, topRadius: isChimney ? radius * 0.78 : radius,
          bottomRadius: radius, material: color.withAlpha(0.96),
          outline: true, outlineColor: C.Color.BLACK.withAlpha(0.35), outlineWidth: 1,
          heightReference: C.HeightReference.NONE
        }
      });
      count++;
    });
    if (count) g.api.viewer.dataSources.add(roofEquipmentSource);
    else roofEquipmentSource = null;
    // Tagged flat roofs with solar arrays get a restrained panel overlay.
    if (C.Primitive && C.PolygonGeometry && C.PolygonHierarchy) {
      const candidates = osmElements.filter(el => el.type === 'way' && el.tags && /^(yes|photovoltaic|solar)$/.test(String(el.tags['roof:solar'] || el.tags['solar:panel'] || el.tags['generator:source'] || '')))
        .map(roofCandidate).filter(c => c && c.shape === 'flat').slice(0, mobile ? 8 : 28);
      const centers = candidates.map(c => C.Cartographic.fromDegrees(c.origin.lon, c.origin.lat));
      let samples = [];
      try { if (C.sampleTerrain && g.api.viewer.terrainProvider && centers.length) samples = await C.sampleTerrain(g.api.viewer.terrainProvider, 12, centers); } catch (_) {}
      const instances = [];
      candidates.forEach((c, i) => {
        const ground = samples[i] && Number.isFinite(samples[i].height) ? samples[i].height : safe(() => g.api.viewer.scene.globe.getHeight(centers[i]));
        if (!Number.isFinite(ground)) return;
        const L = c.rect.length * 0.34, W = c.rect.width * 0.34;
        const panelZ = ground + c.eaveHeight + c.roofHeight + 0.65;
        for (let row = 0; row < 2; row++) {
          for (let col = 0; col < 3; col++) {
            const cx = (col - 1) * (L * 0.57), cy = (row - 0.5) * (W * 0.75);
            const corners = [[cx-L*0.23,cy-W*0.28],[cx+L*0.23,cy-W*0.28],[cx+L*0.23,cy+W*0.28],[cx-L*0.23,cy+W*0.28]];
            const pos = corners.map(([x,y]) => {
              const east = c.rect.center.x + c.rect.u.x*x + c.rect.v.x*y;
              const north = c.rect.center.y + c.rect.u.y*x + c.rect.v.y*y;
              const lat = c.origin.lat + north / EARTH_RADIUS * 180 / Math.PI;
              const lon = c.origin.lon + east / (EARTH_RADIUS * Math.max(0.15, Math.cos(c.origin.lat * Math.PI / 180))) * 180 / Math.PI;
              return C.Cartesian3.fromDegrees(lon, lat, panelZ);
            });
            try {
              const geometry = new C.PolygonGeometry({ polygonHierarchy: new C.PolygonHierarchy(pos), perPositionHeight: true, vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT });
              instances.push(new C.GeometryInstance({ id: `geofs-v13-solar-${c.id}-${row}-${col}`, geometry, attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString('#26394d').withAlpha(0.96)) } }));
            } catch (_) {}
          }
        }
      });
      if (instances.length) solarPanelPrimitive = g.api.viewer.scene.primitives.add(new C.Primitive({ geometryInstances: instances, appearance: new C.PerInstanceColorAppearance({ flat: true, translucent: false, closed: false }), asynchronous: true, compressVertices: true, allowPicking: false, releaseGeometryInstances: true }));
    }
    requestRender();
    return count;
  }

  function removeFacadeDetails() {
    const g = getGeoFS();
    if (facadeDetailPrimitive && g) safe(() => g.api.viewer.scene.primitives.remove(facadeDetailPrimitive));
    facadeDetailPrimitive = null;
    facadeDetailCount = 0;
  }

  function geoFromLocal(origin, x, y) {
    return {
      lat: origin.lat + y / EARTH_RADIUS * 180 / Math.PI,
      lon: origin.lon + x / (EARTH_RADIUS * Math.max(0.15, Math.cos(origin.lat * Math.PI / 180))) * 180 / Math.PI
    };
  }

  async function drawFacadeDetails() {
    const g = getGeoFS(); const C = getCesium();
    removeFacadeDetails();
    if (!state.facadeWindows || !g || !C || g.api.googleTileset || ionBuildingsTileset) return 0;
    if (currentCamera().altitude > 1900 || !C.PolygonGeometry || !C.PolygonHierarchy || !C.PerInstanceColorAppearance) return 0;
    const candidates = osmElements.filter(el => el.type === 'way' && el.tags && (el.tags.building || el.tags['building:part']) && Array.isArray(el.geometry) && (parsePositive(el.tags.height || el.tags['building:height']) || parseNumber(el.tags['building:levels']))).slice(0, mobile ? 18 : 52);
    if (!candidates.length) return 0;
    const centers = candidates.map(el => {
      const pts = el.geometry;
      return C.Cartographic.fromDegrees(pts.reduce((s,p)=>s+Number(p.lon),0)/pts.length,pts.reduce((s,p)=>s+Number(p.lat),0)/pts.length);
    });
    let samples = [];
    try { if (C.sampleTerrain && g.api.viewer.terrainProvider) samples = await C.sampleTerrain(g.api.viewer.terrainProvider, 12, centers); } catch (_) {}
    const instances = [];
    const globalLimit = mobile ? 210 : 720;
    let total = 0;
    candidates.forEach((el, i) => {
      if (total >= globalLimit) return;
      const tags = el.tags || {};
      let ring = el.geometry.map(p=>({lat:Number(p.lat),lon:Number(p.lon)})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));
      if (isClosedOsmRing(ring)) ring.pop();
      if (ring.length < 4 || ring.length > 20) return;
      const origin = {lat:ring.reduce((s,p)=>s+p.lat,0)/ring.length,lon:ring.reduce((s,p)=>s+p.lon,0)/ring.length};
      const local = ring.map(p=>localXY(p,origin));
      const signed = local.reduce((a,p,j)=>a + p.x*local[(j+1)%local.length].y - local[(j+1)%local.length].x*p.y,0);
      const ccw = signed > 0;
      let area = Math.abs(signed)*0.5;
      if (area < 40 || area > 18000) return;
      let height = parsePositive(tags.height || tags['building:height']);
      const levels = parseNumber(tags['building:levels'] || tags['building:part:levels']);
      if (!height && levels) height = levels*3.15 + (parsePositive(tags['roof:height']) || 1.5);
      if (!height || height < 7.5 || height > 90) return;
      const roofH = Math.min(parsePositive(tags['roof:height']) || 1.4, height*0.28);
      const facadeH = Math.max(5.5,height-roofH);
      let floors = Math.floor(levels || facadeH/3.15);
      floors = clamp(floors,2,14);
      let ground = samples[i] && Number.isFinite(samples[i].height) ? samples[i].height : safe(()=>g.api.viewer.scene.globe.getHeight(centers[i]));
      if (!Number.isFinite(ground)) return;
      const minH = parsePositive(tags.min_height) || 0;
      const floorStep = facadeH/floors;
      const edges = [];
      for (let j=0;j<local.length;j++) {
        const a=local[j], b=local[(j+1)%local.length];
        const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
        if (len>=9 && len<=100) edges.push({a,b,dx,dy,len});
      }
      edges.sort((a,b)=>b.len-a.len);
      edges.slice(0,6).forEach((edge,ei)=>{
        if (total>=globalLimit) return;
        const n=clamp(Math.floor(edge.len/5.2),1,5);
        const tx=edge.dx/edge.len, ty=edge.dy/edge.len;
        const nx=(ccw?1:-1)*ty, ny=(ccw?-1:1)*tx;
        const ww=Math.min(1.35,edge.len/(n+1)*0.48), wh=Math.min(1.25,floorStep*0.45);
        for(let f=0;f<floors && total<globalLimit;f++){
          const z=minH+f*floorStep+floorStep*0.54;
          if(z+wh/2>facadeH) continue;
          for(let k=0;k<n && total<globalLimit;k++){
            const t=(k+1)/(n+1), cx=edge.a.x+edge.dx*t+nx*0.12, cy=edge.a.y+edge.dy*t+ny*0.12;
            const c0=geoFromLocal(origin,cx-tx*ww/2,cy-ty*ww/2);
            const c1=geoFromLocal(origin,cx+tx*ww/2,cy+ty*ww/2);
            const v0=C.Cartesian3.fromDegrees(c0.lon,c0.lat,ground+z-wh/2);
            const v1=C.Cartesian3.fromDegrees(c1.lon,c1.lat,ground+z-wh/2);
            const v2=C.Cartesian3.fromDegrees(c1.lon,c1.lat,ground+z+wh/2);
            const v3=C.Cartesian3.fromDegrees(c0.lon,c0.lat,ground+z+wh/2);
            try{
              const geometry=new C.PolygonGeometry({polygonHierarchy:new C.PolygonHierarchy([v0,v1,v2,v3]),perPositionHeight:true,vertexFormat:C.PerInstanceColorAppearance.VERTEX_FORMAT});
              const hue=(Number(el.id||0)+f*7+k*3+ei)%5;
              const glass=C.Color.fromCssColorString(['#263d50','#314b5a','#1f3447','#3a5360','#283744'][hue]).withAlpha(0.72);
              instances.push(new C.GeometryInstance({id:`geofs-v13-window-${el.id}-${ei}-${f}-${k}`,geometry,attributes:{color:C.ColorGeometryInstanceAttribute.fromColor(glass)}}));
              total++;
            }catch(_){}
          }
        }
      });
    });
    if (instances.length) facadeDetailPrimitive=g.api.viewer.scene.primitives.add(new C.Primitive({geometryInstances:instances,appearance:new C.PerInstanceColorAppearance({flat:true,translucent:true,closed:false}),asynchronous:true,compressVertices:true,allowPicking:false,releaseGeometryInstances:true}));
    facadeDetailCount=instances.length;
    requestRender();
    return facadeDetailCount;
  }

  function removeTrafficFurniture() {
    const g=getGeoFS();
    if(trafficSource&&g) safe(()=>g.api.viewer.dataSources.remove(trafficSource,true));
    trafficSource=null;
  }

  async function drawTrafficFurniture() {
    const g=getGeoFS(); const C=getCesium();
    removeTrafficFurniture();
    if(!state.trafficFurniture||!g||!C||g.api.googleTileset||currentCamera().altitude>1200) return 0;
    trafficSource=new C.CustomDataSource('GeoFS v13 traffic furniture');
    const nodes=osmElements.filter(el=>el.type==='node'&&el.tags&&Number.isFinite(Number(el.lat))&&Number.isFinite(Number(el.lon))&&(el.tags.highway==='traffic_signals'||el.tags.highway==='street_lamp'||el.tags.man_made==='street_lamp'||el.tags.highway==='stop'||el.tags.highway==='give_way'));
    let count=0;
    nodes.slice(0,mobile?22:72).forEach((el,i)=>{
      const tags=el.tags||{}; const kind=tags.highway||tags.man_made||'';
      const lat=Number(el.lat),lon=Number(el.lon); const carto=C.Cartographic.fromDegrees(lon,lat);
      let ground=safe(()=>g.api.viewer.scene.globe.getHeight(carto)); if(!Number.isFinite(ground))ground=0;
      if(kind==='traffic_signals'){
        const h=parsePositive(tags.height)||4.6;
        trafficSource.entities.add({id:`geofs-v13-signal-pole-${el.id||i}`,position:C.Cartesian3.fromDegrees(lon,lat,ground+h/2),cylinder:{length:h,topRadius:0.07,bottomRadius:0.09,material:C.Color.fromCssColorString('#45484b')}});
        ['#df514b','#e5b94f','#4f9b68'].forEach((col,j)=>trafficSource.entities.add({id:`geofs-v13-signal-${el.id||i}-${j}`,position:C.Cartesian3.fromDegrees(lon,lat,ground+h-0.55-j*0.29),ellipsoid:{radii:new C.Cartesian3(0.105,0.105,0.105),material:C.Color.fromCssColorString(col),outline:true,outlineColor:C.Color.BLACK.withAlpha(0.5)}}));
      } else if(kind==='street_lamp'||kind==='stop'||kind==='give_way'){
        const h=parsePositive(tags.height)||(kind==='street_lamp'?6.2:2.2);
        trafficSource.entities.add({id:`geofs-v13-road-fixture-${el.id||i}`,position:C.Cartesian3.fromDegrees(lon,lat,ground+h/2),cylinder:{length:h,topRadius:kind==='street_lamp'?0.055:0.045,bottomRadius:0.08,material:C.Color.fromCssColorString('#5d6265')}});
        if(kind==='street_lamp') trafficSource.entities.add({id:`geofs-v13-lamp-head-${el.id||i}`,position:C.Cartesian3.fromDegrees(lon,lat,ground+h),ellipsoid:{radii:new C.Cartesian3(0.28,0.16,0.12),material:C.Color.fromCssColorString('#d4d1b5').withAlpha(0.86)}});
        else trafficSource.entities.add({id:`geofs-v13-sign-${el.id||i}`,position:C.Cartesian3.fromDegrees(lon,lat,ground+h+0.18),box:{dimensions:new C.Cartesian3(0.65,0.08,0.65),material:C.Color.fromCssColorString(kind==='stop'?'#c43d36':'#e4e1d8')}});
      }
      count++;
    });
    if(count)g.api.viewer.dataSources.add(trafficSource); else trafficSource=null;
    requestRender();
    return count;
  }

  // ---------- World-detail expansion v13 ----------

  function removeGreenInfrastructure() {
    const g = getGeoFS();
    if (greenSource && g) safe(() => g.api.viewer.dataSources.remove(greenSource, true));
    greenSource = null;
  }

  function removeBarriers() {
    const g = getGeoFS();
    if (barrierSource && g) safe(() => g.api.viewer.dataSources.remove(barrierSource, true));
    if (barrierPrimitive && g) safe(() => g.api.viewer.scene.primitives.remove(barrierPrimitive));
    barrierSource = null;
    barrierPrimitive = null;
  }

  function removePowerNetwork() {
    const g = getGeoFS();
    if (powerSource && g) safe(() => g.api.viewer.dataSources.remove(powerSource, true));
    powerSource = null;
  }

  function removeHydrography() {
    const g = getGeoFS();
    if (hydroPrimitive && g) safe(() => g.api.viewer.scene.groundPrimitives.remove(hydroPrimitive));
    hydroPrimitive = null;
  }

  function removeStreetObjects() {
    const g = getGeoFS();
    if (streetObjectSource && g) safe(() => g.api.viewer.dataSources.remove(streetObjectSource, true));
    streetObjectSource = null;
  }

  function groundAt(C, g, lat, lon) {
    const carto = C.Cartographic.fromDegrees(lon, lat);
    const h = safe(() => g.api.viewer.scene.globe.getHeight(carto));
    if (Number.isFinite(h)) return h;
    const apiH = safe(() => g.api.getGroundAltitude([lat, lon]));
    return Number.isFinite(apiH) ? apiH : 0;
  }

  function stableHash(value) {
    const s = String(value || '0');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function addTreeEntity(C, source, lat, lon, height, tags, key) {
    const ground = groundAt(C, getGeoFS(), lat, lon);
    const h = clamp(Number(height) || 6.5, 2.5, 24);
    const evergreen = String(tags && (tags.leaf_cycle || tags.leaf_type) || '').match(/evergreen|needleleaved/i);
    const seed = stableHash(key);
    const palette = evergreen ? ['#315b43','#3d684b','#456e50'] : ['#47744a','#527d4d','#628451','#3f6e49'];
    const color = C.Color.fromCssColorString(palette[seed % palette.length]);
    const trunkH = h * 0.42;
    const canopyH = h * 0.58;
    const crownR = clamp(h * (0.19 + ((seed >>> 4) % 9) / 100), 0.9, 4.2);
    const base = C.Cartesian3.fromDegrees(lon, lat, ground);
    source.entities.add({
      id: `geofs-v13-tree-trunk-${key}`,
      position: C.Cartesian3.fromDegrees(lon, lat, ground + trunkH / 2),
      cylinder: { length: trunkH, topRadius: Math.max(0.08, crownR * 0.12), bottomRadius: Math.max(0.10, crownR * 0.16), material: C.Color.fromCssColorString('#65513d'), outline: false }
    });
    if (evergreen) {
      source.entities.add({
        id: `geofs-v13-tree-crown-${key}`,
        position: C.Cartesian3.fromDegrees(lon, lat, ground + trunkH + canopyH * 0.48),
        cylinder: { length: canopyH, topRadius: 0.05, bottomRadius: crownR, material: color, outline: false }
      });
    } else {
      source.entities.add({
        id: `geofs-v13-tree-crown-${key}`,
        position: C.Cartesian3.fromDegrees(lon, lat, ground + trunkH + canopyH * 0.53),
        ellipsoid: { radii: new C.Cartesian3(crownR, crownR * 0.86, canopyH * 0.55), material: color, outline: false }
      });
    }
    return base;
  }

  async function drawGreenInfrastructure() {
    const g = getGeoFS(), C = getCesium();
    removeGreenInfrastructure();
    if (!state.greenInfrastructure || !g || !C || g.api.googleTileset || currentCamera().altitude > 3200) return 0;
    greenSource = new C.CustomDataSource('GeoFS v13 vegetation detail');
    const altitude = currentCamera().altitude;
    const limit = mobile ? (altitude < 700 ? 40 : 24) : (altitude < 900 ? 160 : 95);
    let count = 0;
    const treeNodes = osmElements.filter(el => el.type === 'node' && el.tags && el.tags.natural === 'tree' && Number.isFinite(Number(el.lat)) && Number.isFinite(Number(el.lon)));
    for (const node of treeNodes) {
      if (count >= limit) break;
      const tags = node.tags || {};
      addTreeEntity(C, greenSource, Number(node.lat), Number(node.lon), parsePositive(tags.height || tags['tree:height']) || 6.5, tags, `node-${node.id || count}`);
      count++;
    }
    const rows = osmElements.filter(el => el.type === 'way' && el.tags && (el.tags.natural === 'tree_row' || el.tags.barrier === 'hedge') && Array.isArray(el.geometry) && el.geometry.length >= 2);
    const spacing = altitude < 700 ? 8.5 : 13;
    for (const row of rows) {
      if (count >= limit) break;
      const path = row.geometry.map(p => ({ lat: Number(p.lat), lon: Number(p.lon) })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      for (let i = 1; i < path.length && count < limit; i++) {
        const a = path[i - 1], b = path[i];
        const length = pathLengthMeters([a, b]);
        if (length < 2) continue;
        const steps = Math.max(1, Math.floor(length / spacing));
        const brg = bearing(a, b);
        for (let j = 0; j <= steps && count < limit; j++) {
          const p = destination(a, brg, Math.min(length, j * spacing));
          const isHedge = row.tags.barrier === 'hedge';
          if (isHedge) {
            const ground = groundAt(C, g, p.lat, p.lon);
            greenSource.entities.add({ id: `geofs-v13-hedge-${row.id}-${i}-${j}`, position: C.Cartesian3.fromDegrees(p.lon, p.lat, ground + 0.85), ellipsoid: { radii: new C.Cartesian3(1.65, 1.15, 0.95), material: C.Color.fromCssColorString('#55764b'), outline: false } });
          } else {
            addTreeEntity(C, greenSource, p.lat, p.lon, parsePositive(row.tags.height) || 7.2, row.tags, `row-${row.id}-${i}-${j}`);
          }
          count++;
        }
      }
    }
    if (greenSource.entities.values.length) g.api.viewer.dataSources.add(greenSource);
    else greenSource = null;
    requestRender();
    return count;
  }

  async function drawBarriers() {
    const g = getGeoFS(), C = getCesium();
    removeBarriers();
    if (!state.barriers || !g || !C || g.api.googleTileset || currentCamera().altitude > 1800) return 0;
    barrierSource = new C.CustomDataSource('GeoFS v13 walls and fences');
    const maxWays = mobile ? 28 : 85;
    let count = 0;
    const ways = osmElements.filter(el => el.type === 'way' && el.tags && el.tags.barrier && Array.isArray(el.geometry) && el.geometry.length >= 2);
    for (const way of ways) {
      if (count >= maxWays) break;
      const tags = way.tags || {};
      const kind = String(tags.barrier || '').toLowerCase();
      if (!/^(fence|wall|retaining_wall|guard_rail|city_wall|handrail|chain|ditch|hedge_bank|bollard|gate|lift_gate|swing_gate|cycle_barrier)$/.test(kind)) continue;
      const path = way.geometry.map(p => ({ lat: Number(p.lat), lon: Number(p.lon) })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      if (path.length < 2 || pathLengthMeters(path) > 1800) continue;
      const height = clamp(parsePositive(tags.height) || (kind === 'wall' || kind === 'city_wall' ? 2.1 : kind === 'handrail' ? 1.0 : kind === 'bollard' ? 0.9 : 1.6), 0.55, 5.5);
      const material = String(tags.material || '').toLowerCase();
      const color = C.Color.fromCssColorString(/stone|brick|concrete|masonry/.test(material) ? '#858078' : /wood/.test(material) ? '#80684c' : '#6e7779');
      if (['bollard','gate','lift_gate','swing_gate','cycle_barrier'].includes(kind)) {
        const stride = Math.max(1, Math.ceil(path.length / (mobile ? 6 : 16)));
        path.filter((_,i) => i % stride === 0).forEach((p,i) => {
          const ground = groundAt(C,g,p.lat,p.lon);
          const isBollard = kind === 'bollard' || kind === 'cycle_barrier';
          barrierSource.entities.add({ id:`geofs-v13-barrier-post-${way.id}-${i}`, position:C.Cartesian3.fromDegrees(p.lon,p.lat,ground+height/2), cylinder:{ length:height, topRadius:isBollard?0.08:0.055, bottomRadius:isBollard?0.11:0.07, material:C.Color.fromCssColorString(isBollard?'#737c80':'#d2b957') } });
        });
        if (kind === 'gate' || kind === 'lift_gate' || kind === 'swing_gate') {
          const top = path.filter((_,i) => i % Math.max(1,Math.ceil(path.length/20))===0).map(p => C.Cartesian3.fromDegrees(p.lon,p.lat,groundAt(C,g,p.lat,p.lon)+height));
          if (top.length > 1) barrierSource.entities.add({ id:`geofs-v13-barrier-gate-${way.id}`, polyline:{ positions:top,width:2.0,material:C.Color.fromCssColorString('#d0b65a').withAlpha(0.8),arcType:C.ArcType.NONE } });
        }
        count++;
        continue;
      }
      const groundPositions = positionsFromPath(C, path);
      barrierSource.entities.add({
        id: `geofs-v13-barrier-base-${way.id}`,
        polyline: { positions: groundPositions, clampToGround: true, width: kind === 'guard_rail' ? 2.0 : 1.25, material: color.withAlpha(0.64), classificationType: C.ClassificationType.BOTH }
      });
      if (kind !== 'guard_rail' && kind !== 'handrail') {
        const maxPts = path.length > 35 ? path.filter((_,i) => i % Math.ceil(path.length / 35) === 0) : path;
        const heights = maxPts.map(p => groundAt(C, g, p.lat, p.lon));
        barrierSource.entities.add({
          id: `geofs-v13-barrier-wall-${way.id}`,
          wall: {
            positions: C.Cartesian3.fromDegreesArray(maxPts.flatMap(p => [p.lon, p.lat])),
            minimumHeights: heights,
            maximumHeights: heights.map(h => h + height),
            material: color.withAlpha(kind === 'fence' || kind === 'chain' ? 0.30 : 0.78),
            outline: false
          }
        });
      } else {
        const top = path.filter((_,i) => i % Math.max(1, Math.ceil(path.length / 35)) === 0);
        const topPositions = top.map(p => C.Cartesian3.fromDegrees(p.lon, p.lat, groundAt(C, g, p.lat, p.lon) + height));
        barrierSource.entities.add({ id: `geofs-v13-barrier-top-${way.id}`, polyline: { positions: topPositions, width: kind === 'guard_rail' ? 2.0 : 1.1, material: color.withAlpha(0.9), arcType: C.ArcType.NONE } });
      }
      count++;
    }
    if (barrierSource.entities.values.length) g.api.viewer.dataSources.add(barrierSource);
    else barrierSource = null;
    requestRender();
    return count;
  }

  async function drawPowerNetwork() {
    const g = getGeoFS(), C = getCesium();
    removePowerNetwork();
    if (!state.powerNetwork || !g || !C || g.api.googleTileset || currentCamera().altitude > 2600) return 0;
    powerSource = new C.CustomDataSource('GeoFS v13 electric network');
    const poleNodes = osmElements.filter(el => el.type === 'node' && el.tags && /^((pole)|(tower))$/.test(String(el.tags.power || '')) && Number.isFinite(Number(el.lat)) && Number.isFinite(Number(el.lon)));
    let count = 0;
    poleNodes.slice(0, mobile ? 18 : 56).forEach((node, i) => {
      const lat = Number(node.lat), lon = Number(node.lon), tags = node.tags || {};
      const ground = groundAt(C, g, lat, lon);
      const tower = tags.power === 'tower';
      const h = clamp(parsePositive(tags.height) || (tower ? 24 : 9), tower ? 10 : 5, tower ? 55 : 18);
      const radius = tower ? 0.34 : 0.14;
      const steel = C.Color.fromCssColorString(tower ? '#777d80' : '#6b6559');
      powerSource.entities.add({ id: `geofs-v13-power-pole-${node.id || i}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + h / 2), cylinder: { length: h, topRadius: radius * 0.70, bottomRadius: radius, material: steel, outline: false } });
      if (tower) {
        [0.70, 0.82].forEach((z, j) => powerSource.entities.add({ id: `geofs-v13-power-arm-${node.id || i}-${j}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + h * z), box: { dimensions: new C.Cartesian3(8.0 - j * 1.6, 0.25, 0.25), material: steel } }));
      }
      count++;
    });
    const ways = osmElements.filter(el => el.type === 'way' && el.tags && /^(line|minor_line|cable)$/.test(String(el.tags.power || '')) && Array.isArray(el.geometry) && el.geometry.length >= 2);
    let wireSegments = 0;
    const maxSegments = mobile ? 24 : 72;
    for (const way of ways) {
      if (wireSegments >= maxSegments) break;
      const path = way.geometry.map(p => ({ lat: Number(p.lat), lon: Number(p.lon) })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      if (path.length < 2) continue;
      const voltage = parseNumber(way.tags.voltage) || 0;
      const clearance = clamp(parsePositive(way.tags.height) || (voltage >= 110000 ? 26 : voltage >= 33000 ? 18 : 10), 8, 34);
      const wires = voltage >= 33000 ? [-3.2, 0, 3.2] : [-1.1, 1.1];
      for (let i = 1; i < path.length && wireSegments < maxSegments; i++) {
        const a = path[i - 1], b = path[i], length = pathLengthMeters([a, b]);
        if (length < 5 || length > 1200) continue;
        const head = bearing(a, b);
        wires.forEach((side, wi) => {
          const coords = [];
          for (let k = 0; k <= 4; k++) {
            const t = k / 4;
            const center = destination(a, head, length * t);
            const shifted = Math.abs(side) > 0.01 ? destination(center, head + (side < 0 ? -Math.PI / 2 : Math.PI / 2), Math.abs(side)) : center;
            const sag = Math.min(3.6, length * 0.018) * 4 * t * (1 - t);
            const ground = groundAt(C, g, shifted.lat, shifted.lon);
            coords.push(C.Cartesian3.fromDegrees(shifted.lon, shifted.lat, ground + clearance - sag));
          }
          powerSource.entities.add({ id: `geofs-v13-wire-${way.id}-${i}-${wi}`, polyline: { positions: coords, width: 1.15, material: C.Color.fromCssColorString('#3e4447').withAlpha(0.72), arcType: C.ArcType.NONE } });
        });
        wireSegments++;
      }
    }
    if (powerSource.entities.values.length) g.api.viewer.dataSources.add(powerSource);
    else powerSource = null;
    requestRender();
    return count + wireSegments;
  }

  async function drawHydrography() {
    const g = getGeoFS(), C = getCesium();
    removeHydrography();
    if (!state.hydrography || !g || !C || g.api.googleTileset || currentCamera().altitude > 8500) return 0;
    const instances = [];
    const ways = osmElements.filter(el => el.type === 'way' && el.tags && (el.tags.waterway || /^(pier|breakwater|embankment|dyke)$/.test(String(el.tags.man_made || ''))) && Array.isArray(el.geometry) && el.geometry.length >= 2);
    const limit = mobile ? 32 : 100;
    let count = 0;
    for (const way of ways) {
      if (count >= limit) break;
      const kind = String(way.tags.waterway || '');
      const engineered = String(way.tags.man_made || '');
      if (!/^(river|canal|stream|drain|ditch)$/.test(kind) && !/^(pier|breakwater|embankment|dyke)$/.test(engineered)) continue;
      const path = way.geometry.map(p => ({ lat: Number(p.lat), lon: Number(p.lon) })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      if (path.length < 2 || pathLengthMeters(path) < (kind === 'stream' || kind === 'ditch' ? 20 : 35)) continue;
      const explicit = parsePositive(way.tags.width);
      const width = clamp(explicit || (kind ? ({ river: 18, canal: 10, stream: 3.2, drain: 1.7, ditch: 1.3 }[kind]) : ({ pier: 6, breakwater: 5, embankment: 4, dyke: 4 }[engineered])), 1, 46);
      const fillColor = engineered ? '#88847b' : (kind === 'river' || kind === 'canal' ? '#4b91b8' : '#6ba0b3');
      const tint = C.Color.fromCssColorString(fillColor).withAlpha(currentCamera().altitude < 1300 ? 0.19 : 0.11);
      addCorridorInstance(C, instances, path, width, tint, `geofs-v13-waterway-${way.id}`);
      count++;
    }
    if (instances.length) hydroPrimitive = addGroundFillPrimitive(C, g.api.viewer.scene, instances);
    requestRender();
    return count;
  }

  async function drawStreetObjects() {
    const g = getGeoFS(), C = getCesium();
    removeStreetObjects();
    if (!state.streetObjects || !g || !C || g.api.googleTileset || currentCamera().altitude > 850) return 0;
    streetObjectSource = new C.CustomDataSource('GeoFS v13 street-level objects');
    const nodes = osmElements.filter(el => el.type === 'node' && el.tags && Number.isFinite(Number(el.lat)) && Number.isFinite(Number(el.lon)) && (
      el.tags.highway === 'bus_stop' || ['bench','bicycle_parking','waste_basket','waste_disposal','drinking_water','post_box','telephone','recycling','vending_machine','toilets','parking_entrance','bus_station'].includes(el.tags.amenity) || el.tags.emergency === 'fire_hydrant' || /^(bollard|gate|lift_gate|swing_gate|cycle_barrier)$/.test(String(el.tags.barrier || '')) || el.tags.tourism === 'information' || el.tags.entrance || el.tags.traffic_calming
    ));
    let count = 0;
    const limit = mobile ? 34 : 120;
    nodes.slice(0, limit).forEach((node, i) => {
      const tags = node.tags || {};
      const lat = Number(node.lat), lon = Number(node.lon), ground = groundAt(C, g, lat, lon);
      const p = C.Cartesian3.fromDegrees(lon, lat, ground);
      const id = node.id || i;
      if (tags.emergency === 'fire_hydrant') {
        streetObjectSource.entities.add({ id: `geofs-v13-hydrant-${id}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + 0.42), cylinder: { length: 0.84, topRadius: 0.13, bottomRadius: 0.19, material: C.Color.fromCssColorString('#c44235') } });
        streetObjectSource.entities.add({ id: `geofs-v13-hydrant-cap-${id}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + 0.78), ellipsoid: { radii: new C.Cartesian3(0.18,0.18,0.12), material: C.Color.fromCssColorString('#d34b3d') } });
      } else if (tags.amenity === 'bench') {
        streetObjectSource.entities.add({ id: `geofs-v13-bench-${id}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + 0.34), box: { dimensions: new C.Cartesian3(1.55,0.42,0.12), material: C.Color.fromCssColorString('#87694e') } });
        streetObjectSource.entities.add({ id: `geofs-v13-bench-back-${id}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + 0.68), box: { dimensions: new C.Cartesian3(1.55,0.10,0.62), material: C.Color.fromCssColorString('#755b45') } });
      } else if (tags.amenity === 'bicycle_parking') {
        streetObjectSource.entities.add({ id: `geofs-v13-bike-rack-${id}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + 0.45), cylinder: { length: 0.9, topRadius: 0.035, bottomRadius: 0.035, material: C.Color.fromCssColorString('#737c82') } });
      } else if (tags.amenity === 'waste_basket' || tags.amenity === 'waste_disposal') {
        streetObjectSource.entities.add({ id: `geofs-v13-bin-${id}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + 0.48), cylinder: { length: 0.96, topRadius: 0.25, bottomRadius: 0.30, material: C.Color.fromCssColorString('#66716c') } });
      } else if (tags.amenity === 'drinking_water') {
        streetObjectSource.entities.add({ id: `geofs-v13-drink-${id}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + 0.45), cylinder: { length: 0.9, topRadius: 0.10, bottomRadius: 0.13, material: C.Color.fromCssColorString('#8b999f') } });
      } else if (tags.amenity === 'post_box') {
        streetObjectSource.entities.add({ id:`geofs-v13-postbox-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+0.62), box:{ dimensions:new C.Cartesian3(0.48,0.42,1.24), material:C.Color.fromCssColorString('#bd3e36') } });
      } else if (tags.amenity === 'telephone') {
        streetObjectSource.entities.add({ id:`geofs-v13-phone-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+1.05), box:{ dimensions:new C.Cartesian3(0.62,0.52,2.1), material:C.Color.fromCssColorString('#5a7372') } });
      } else if (tags.amenity === 'recycling' || tags.amenity === 'waste_basket' || tags.amenity === 'waste_disposal') {
        streetObjectSource.entities.add({ id:`geofs-v13-recycle-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+0.50), cylinder:{ length:1.0,topRadius:0.24,bottomRadius:0.30,material:C.Color.fromCssColorString('#5b8270') } });
      } else if (tags.amenity === 'vending_machine') {
        streetObjectSource.entities.add({ id:`geofs-v13-vending-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+0.92), box:{ dimensions:new C.Cartesian3(0.78,0.66,1.84), material:C.Color.fromCssColorString('#b9c2c2') } });
      } else if (tags.amenity === 'toilets') {
        streetObjectSource.entities.add({ id:`geofs-v13-toilet-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+1.25), box:{ dimensions:new C.Cartesian3(1.3,1.1,2.5), material:C.Color.fromCssColorString('#d8d3c9') } });
      } else if (tags.amenity === 'parking_entrance' || tags.amenity === 'bus_station') {
        streetObjectSource.entities.add({ id:`geofs-v13-station-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+1.3), box:{ dimensions:new C.Cartesian3(1.2,0.55,2.6), material:C.Color.fromCssColorString('#4c718b') } });
      } else if (tags.tourism === 'information') {
        streetObjectSource.entities.add({ id:`geofs-v13-info-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+1.0), box:{ dimensions:new C.Cartesian3(0.72,0.10,1.45), material:C.Color.fromCssColorString('#3f7197') } });
      } else if (tags.traffic_calming) {
        streetObjectSource.entities.add({ id:`geofs-v13-calming-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+0.07), ellipsoid:{ radii:new C.Cartesian3(2.4,1.2,0.10), material:C.Color.fromCssColorString('#b9a98c').withAlpha(0.75) } });
      } else if (/^(bollard|gate|lift_gate|swing_gate|cycle_barrier)$/.test(String(tags.barrier || ''))) {
        const gate = /gate/.test(String(tags.barrier));
        streetObjectSource.entities.add({ id:`geofs-v13-barrier-node-post-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+(gate?0.68:0.46)), cylinder:{ length:gate?1.36:0.92,topRadius:gate?0.055:0.08,bottomRadius:0.10,material:C.Color.fromCssColorString(gate?'#d1b45a':'#7b8588') } });
        if (gate) streetObjectSource.entities.add({ id:`geofs-v13-barrier-node-arm-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+1.25), box:{ dimensions:new C.Cartesian3(2.6,0.11,0.12),material:C.Color.fromCssColorString('#d8bf70') } });
      } else if (tags.entrance) {
        streetObjectSource.entities.add({ id:`geofs-v13-entrance-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+0.35), box:{ dimensions:new C.Cartesian3(0.8,0.20,0.7), material:C.Color.fromCssColorString('#a18b69').withAlpha(0.8) } });
      } else if (tags.highway === 'bus_stop') {
        streetObjectSource.entities.add({ id: `geofs-v13-bus-pole-${id}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + 1.35), cylinder: { length: 2.7, topRadius: 0.045, bottomRadius: 0.055, material: C.Color.fromCssColorString('#5b646b') } });
        streetObjectSource.entities.add({ id: `geofs-v13-bus-sign-${id}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + 2.35), box: { dimensions: new C.Cartesian3(0.42,0.08,0.52), material: C.Color.fromCssColorString('#3974a4') } });
      } else if (tags.barrier === 'bollard') {
        streetObjectSource.entities.add({ id: `geofs-v13-bollard-${id}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + 0.48), cylinder: { length: 0.96, topRadius: 0.075, bottomRadius: 0.10, material: C.Color.fromCssColorString('#d3b74f') } });
      }
      count++;
    });
    if (streetObjectSource.entities.values.length) g.api.viewer.dataSources.add(streetObjectSource);
    else streetObjectSource = null;
    requestRender();
    return count;
  }

  function removeBridgeStructures() {
    const g = getGeoFS();
    if (bridgeSource && g) safe(() => g.api.viewer.dataSources.remove(bridgeSource, true));
    bridgeSource = null;
  }

  async function drawBridgeStructures() {
    const g = getGeoFS(), C = getCesium();
    removeBridgeStructures();
    if (!state.bridgeStructures || !g || !C || g.api.googleTileset || currentCamera().altitude > 2800) return 0;
    bridgeSource = new C.CustomDataSource('GeoFS v13 bridge decks and supports');
    const ways = osmElements.filter(el => el.type === 'way' && el.tags && el.tags.highway && el.tags.bridge && !/^(no|false|0)$/.test(String(el.tags.bridge)) && Array.isArray(el.geometry) && el.geometry.length >= 2);
    const maxWays = mobile ? 6 : 20;
    let count = 0;
    for (const way of ways) {
      if (count >= maxWays) break;
      const tags = way.tags || {};
      const path = way.geometry.map(p => ({lat:Number(p.lat),lon:Number(p.lon)})).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      const length = pathLengthMeters(path);
      if (path.length < 2 || length < 12 || length > 900) continue;
      const deckHeight = clamp(parsePositive(tags['bridge:height'] || tags.height) || (tags.bridge === 'viaduct' ? 8.5 : 4.2), 2.0, 18);
      const road = roadStyle(tags);
      const roadWidth = clamp(parsePositive(tags.width) || (road && road.width) || 7.0, 3.0, 22);
      const stride = Math.max(1, Math.ceil(path.length / (mobile ? 5 : 10)));
      const supportIndices = [];
      for (let i = 0; i < path.length; i += stride) supportIndices.push(i);
      if (supportIndices[supportIndices.length-1] !== path.length - 1) supportIndices.push(path.length-1);
      supportIndices.forEach((idx, j) => {
        if (j === 0 || j === supportIndices.length - 1) return;
        const pt = path[idx], ground = groundAt(C,g,pt.lat,pt.lon);
        bridgeSource.entities.add({ id:`geofs-v13-bridge-pier-${way.id}-${j}`, position:C.Cartesian3.fromDegrees(pt.lon,pt.lat,ground+deckHeight/2), cylinder:{ length:deckHeight, topRadius:0.46, bottomRadius:0.62, material:C.Color.fromCssColorString('#858680').withAlpha(0.88), outline:false } });
        bridgeSource.entities.add({ id:`geofs-v13-bridge-cap-${way.id}-${j}`, position:C.Cartesian3.fromDegrees(pt.lon,pt.lat,ground+deckHeight-0.16), box:{ dimensions:new C.Cartesian3(roadWidth+1.6,1.05,0.32), material:C.Color.fromCssColorString('#777a77') } });
      });
      const deck = path.map(pt => C.Cartesian3.fromDegrees(pt.lon,pt.lat,groundAt(C,g,pt.lat,pt.lon)+deckHeight));
      bridgeSource.entities.add({ id:`geofs-v13-bridge-deck-${way.id}`, polyline:{ positions:deck, width:clamp(roadWidth*0.55,4,12), material:C.Color.fromCssColorString('#3d4245').withAlpha(0.78), arcType:C.ArcType.NONE } });
      [-1,1].forEach((side) => {
        const railPath = offsetPath(path, roadWidth/2+0.45, side);
        const rail = railPath.map(pt => C.Cartesian3.fromDegrees(pt.lon,pt.lat,groundAt(C,g,pt.lat,pt.lon)+deckHeight+0.82));
        bridgeSource.entities.add({ id:`geofs-v13-bridge-rail-${way.id}-${side}`, polyline:{ positions:rail, width:1.25, material:C.Color.fromCssColorString('#777f82').withAlpha(0.88), arcType:C.ArcType.NONE } });
      });
      count++;
    }
    if (bridgeSource.entities.values.length) g.api.viewer.dataSources.add(bridgeSource);
    else bridgeSource = null;
    requestRender();
    return count;
  }

  function detailLodBand(altitude) {
    if (altitude < 350) return 'street';
    if (altitude < 900) return 'block';
    if (altitude < 2200) return 'district';
    if (altitude < 5200) return 'city';
    if (altitude < 12000) return 'regional';
    return 'cruise';
  }

  function updateWorldDetailLod(now) {
    if (!osmElements.length || lodRefreshRunning || now - lastLodRedrawAt < 4200) return;
    let camera;
    try { camera = currentCamera(); } catch (_) { return; }
    const band = detailLodBand(camera.altitude);
    const cell = cameraCell(camera.lat, camera.lon);
    if (band !== lastDetailBand) {
      lastDetailBand = band;
      lastLodRedrawAt = now;
      lodRefreshRunning = true;
      redrawOsmLayers().catch(error => console.warn('[GeoFS v13] LOD redraw failed', error)).finally(() => { lodRefreshRunning = false; });
      return;
    }
    if (state.autoNearbyData && cell !== lastOsmCell && cell !== lastAutoCellAttempt && camera.altitude < 12000 && Date.now() - lastRequestAt >= 45000) {
      lastAutoCellAttempt = cell;
      // Reuse the explicit loader's cache and rate limiter when crossing into a new map cell.
      loadOsmArea(false).catch(error => { lastMessage = `自動エリア更新: ${error.message || error}`; updatePanel(); });
    }
  }

  function toggleAdaptivePerformance(enable) {
    const g = getGeoFS();
    if (!g) throw new Error('GeoFSが見つかりません');
    const viewer = g.api.viewer, globe = viewer.scene.globe;
    if (enable && !adaptiveBase) adaptiveBase = { resolutionScale: viewer.resolutionScale || 1, sse: globe.maximumScreenSpaceError || 2 };
    if (!enable && adaptiveBase) {
      safe(() => { viewer.resolutionScale = adaptiveBase.resolutionScale; });
      safe(() => { globe.maximumScreenSpaceError = adaptiveBase.sse; });
      adaptiveBase = null;
      adaptiveLowSamples = 0; adaptiveHighSamples = 0;
    }
    state.adaptivePerformance = !!enable;
    lastMessage = enable ? 'FPS監視を開始。低FPS時は解像度を少し下げ、余裕が戻れば段階的に復元します' : 'FPS自動最適化を停止しました';
    requestRender();
  }

  function updateAdaptivePerformance(now) {
    if (!state.adaptivePerformance || !adaptiveBase || now - adaptiveLastAt < 2600) return;
    adaptiveLastAt = now;
    const g = getGeoFS();
    if (!g) return;
    const viewer = g.api.viewer, globe = viewer.scene.globe;
    if (frameRate && frameRate < (mobile ? 22 : 27)) { adaptiveLowSamples++; adaptiveHighSamples = 0; }
    else if (frameRate > (mobile ? 38 : 46)) { adaptiveHighSamples++; adaptiveLowSamples = 0; }
    else { adaptiveLowSamples = Math.max(0, adaptiveLowSamples - 1); adaptiveHighSamples = Math.max(0, adaptiveHighSamples - 1); }
    if (adaptiveLowSamples >= 2) {
      viewer.resolutionScale = clamp((viewer.resolutionScale || adaptiveBase.resolutionScale) - 0.06, mobile ? 0.72 : 0.68, adaptiveBase.resolutionScale);
      globe.maximumScreenSpaceError = clamp((globe.maximumScreenSpaceError || adaptiveBase.sse) * 1.16, adaptiveBase.sse, adaptiveBase.sse * 2.8);
      adaptiveLowSamples = 0;
      lastMessage = `FPS保護：描画解像度 ${Number(viewer.resolutionScale).toFixed(2)} / Terrain SSE ${Number(globe.maximumScreenSpaceError).toFixed(1)}`;
    } else if (adaptiveHighSamples >= 3) {
      viewer.resolutionScale = Math.min(adaptiveBase.resolutionScale, (viewer.resolutionScale || adaptiveBase.resolutionScale) + 0.025);
      globe.maximumScreenSpaceError = Math.max(adaptiveBase.sse, (globe.maximumScreenSpaceError || adaptiveBase.sse) / 1.08);
      adaptiveHighSamples = 0;
      lastMessage = `画質復元：描画解像度 ${Number(viewer.resolutionScale).toFixed(2)} / Terrain SSE ${Number(globe.maximumScreenSpaceError).toFixed(1)}`;
    }
  }

  function diagnosticsText() {
    const g = getGeoFS();
    if (!g) return 'GeoFS Viewer: 未検出';
    const C = getCesium() || {};
    let camera = { lat: 0, lon: 0, altitude: 0 };
    try { camera = currentCamera(); } catch (_) {}
    const scene = g.api.viewer.scene;
    const counts = countOsm(osmElements);
    const primitives = scene.groundPrimitives;
    const stats = [
      `GeoFS: ${g.version || 'unknown'}`,
      `Cesium: ${C.VERSION || 'unknown'}`,
      `Device: ${mobile ? 'mobile' : 'desktop'} / DPR ${window.devicePixelRatio || 1}`,
      `Camera: ${camera.lat.toFixed(5)}, ${camera.lon.toFixed(5)} / ${Math.round(camera.altitude)}m`,
      `FPS: ${frameRate || 'measuring'}`,
      `Quality: ${g.preferences.graphics.quality} / viewingDistance ${g.api.renderingSettings && g.api.renderingSettings.viewingDistance}`,
      `resolutionScale: ${g.api.viewer.resolutionScale} / MSAA: ${scene.msaaSamples}`,
      `Terrain SSE: ${scene.globe && scene.globe.maximumScreenSpaceError} / tileCache ${scene.globe && scene.globe.tileCacheSize}`,
      `Native buildings: ${!!(g.buildings && g.buildings.simple3DTileProvider)}`,
      `Native vegetation: ${!!(g.trees && g.trees.simple3DTileProvider)}`,
      `Google 3D: ${!!g.api.googleTileset}`,
      `OSM: roads ${counts.roads}, bridges ${counts.bridges}, crossings ${counts.crossings}, railways ${counts.railways}, tagged roofs ${counts.roofs}, airport ways ${counts.airports}, urban areas ${counts.urbanAreas}, traffic nodes ${counts.traffic}`,
      `OSM extended: trees ${counts.trees}, barriers ${counts.barriers}, power ways ${counts.powerWays}, waterways ${counts.waterways}, street objects ${counts.streetObjects}, entrances ${counts.entrances}, traffic calming ${counts.trafficCalming}, man-made ways ${counts.manmadeWays}`,
      `Extra layers: trees ${greenSource ? greenSource.entities.values.length : 0}, barriers ${barrierSource ? barrierSource.entities.values.length : 0}, power ${powerSource ? powerSource.entities.values.length : 0}, hydro ${!!hydroPrimitive}, street objects ${streetObjectSource ? streetObjectSource.entities.values.length : 0}`,
      `World LOD: ${lastDetailBand || 'not loaded'} / auto area update ${state.autoNearbyData ? 'ON' : 'OFF'}`,
      `Bridge structure layer: ${bridgeSource ? bridgeSource.entities.values.length : 0} entities`,
      `Adaptive performance: ${state.adaptivePerformance ? 'ON' : 'OFF'}`, 
      `Road layer: ${!!roadPrimitive || !!roadFallbackSource} / road surface ${!!roadSurfacePrimitive}`,
      `Airport surface: ${!!airportSurfacePrimitive} / markings ${!!airportMarkSource}`,
      `Building outlines: ${!!buildingOutlineSource} / facade windows: ${facadeDetailCount} / roof fixtures: ${!!roofEquipmentSource} / solar: ${!!solarPanelPrimitive}`,
      `Parking markings: ${parkingMarkSource ? parkingMarkSource.entities.values.length : 0}`,
      `Airport markings/entities: ${airportMarkSource ? airportMarkSource.entities.values.length : 0}`,
      `Urban surfaces: ${!!urbanSurfacePrimitive} / traffic fixtures: ${trafficSource ? trafficSource.entities.values.length : 0}`,
      `OSM facade-window geometry instances: ${facadeDetailCount}`,
      `Photographic roof mesh: ${Array.isArray(roofPrimitive) ? roofPrimitive.length : !!roofPrimitive} tile primitives / ${roofPhotoBuildingsUsed} buildings / ${roofPhotoTilesUsed} GSI tiles`,
      `Weathered roof photo tiles: ${weatheredRoofTileCount} / cache ${weatheredRoofTileCache.size}`,
      `GPU caps: ${JSON.stringify(gpuCapabilities())}`,
      `Roof inference: explicit ${roofPhotoExplicitBuildings} / inferred ${roofPhotoInferredBuildings} / skipped ${roofPhotoBuildingsSkipped}`,
      `All-on startup: ${allOnApplied} / GSI in-region ${camera.lon >= GSI_ROOF_COVERAGE.minLon && camera.lon <= GSI_ROOF_COVERAGE.maxLon && camera.lat >= GSI_ROOF_COVERAGE.minLat && camera.lat <= GSI_ROOF_COVERAGE.maxLat}`,
      `Roof photo coverage: Japan ${GSI_ROOF_COVERAGE.minLon}-${GSI_ROOF_COVERAGE.maxLon}E, ${GSI_ROOF_COVERAGE.minLat}-${GSI_ROOF_COVERAGE.maxLat}N / zoom ${GSI_ROOF_ZOOM}`,
      `Roof texture API: ${!!(C.PolygonGeometry && C.MaterialAppearance && C.MaterialAppearance.MaterialSupport && C.MaterialAppearance.MaterialSupport.TEXTURED)} / Last tile error: ${roofPhotoLastError || 'none'}`,
      `Native Graphics UI: ${panel && panel.isConnected && nativeUiMountedHost ? 'inserted in GeoFS Graphics container' : 'waiting for Options → Graphics'}`,
      `Native toggles: atmosphere ${readNativeCheckbox(/^advanced atmosphere$/i)}, clouds ${readNativeCheckbox(/^volumetric clouds$/i)}, buildings ${readNativeCheckbox(/^buildings$|^enable buildings$/i)}, vegetation ${readNativeCheckbox(/^vegetation$|^enable vegetation$/i)}, water ${readNativeCheckbox(/^water effect$/i)}, contrails ${readNativeCheckbox(/^contrails$/i)}`,
      `GSI ground imagery: ${!!gsiImageryLayer}`,
      `Building textures: ${state.buildingTexture}`,
      `Building LOD: ${state.buildingLOD} / tree LOD: ${state.treeLOD}`,
      `Shadows: ${scene.shadowMap ? scene.shadowMap.enabled : 'n/a'} / PBR IBL reflections ${state.reflections} / AO ${state.ao} / bloom ${state.bloom} / sharpen ${state.sharpen}`
    ];
    return stats.join('\n');
  }

  function updatePanel() {
    if(!panel) return;
    const g=getGeoFS();
    const googleActive=!!(g&&g.api.googleTileset);
    const values={
      adaptivePerformance:state.adaptivePerformance,autoNearbyData:state.autoNearbyData,
      buildingTexture:state.buildingTexture,buildingLOD:state.buildingLOD,treeLOD:state.treeLOD,roofs:state.roofs,
      roads:state.road,crossings:state.crossings,rail:state.rail,roadSurface:state.roadSurface,
      parkingMarkings:state.parkingMarkings,airportSurface:state.airportSurface,buildingOutlines:state.buildingOutlines,
      urbanSurfaces:state.urbanSurfaces,trafficFurniture:state.trafficFurniture,greenInfrastructure:state.greenInfrastructure,
      barriers:state.barriers,powerNetwork:state.powerNetwork,hydrography:state.hydrography,streetObjects:state.streetObjects,
      bridgeStructures:state.bridgeStructures,roofEquipment:state.roofEquipment,clouds:state.volumetricClouds,
      water:state.water,shadows:state.shadows,reflections:state.reflections,ao:state.ao,bloom:state.bloom,sharpen:state.sharpen,gsiImagery:state.gsiImagery
    };
    Object.entries(values).forEach(([key,on])=>{
      const input=$(`input[data-toggle="${key}"]`,panel);
      if(input){
        input.checked=!!on;
        const stages=g&&g.api&&g.api.viewer&&g.api.viewer.scene&&g.api.viewer.scene.postProcessStages;
        const unsupported=(key==='ao'&&!(stages&&stages.ambientOcclusion))||(key==='bloom'&&!(stages&&stages.bloom));
        input.disabled=busy||unsupported;
      }
    });
    const google=$('[data-action="google"]',panel);
    if(google){const supported=!!(g&&g.api&&typeof g.api.setGoogleTiles==='function');google.textContent=!supported?'Google実写3D：このGeoFSビルドでは未対応':(googleActive?'Google実写3D：ON（解除）':'Google実写3D：切替');google.disabled=busy||!supported;}
    const hd=$('[data-action="hd"]',panel); if(hd) hd.disabled=busy||googleActive||!g||!g.api||typeof g.api.setHD!=='function';
    $$('button[data-action]',panel).forEach(b=>{if(b.dataset.action!=='diagnostics')b.disabled=busy||(b.dataset.action==='google'&&(!g||typeof g.api.setGoogleTiles!=='function'));});
    if(statusNode) statusNode.textContent=lastMessage;
  }

  function setBusy(value) {
    busy = value;
    updatePanel();
  }

  async function runAction(fn) {
    if (busy) return;
    setBusy(true);
    try { await fn(); }
    catch (error) {
      lastMessage = `エラー：${error && error.message ? error.message : String(error)}`;
      console.error('[GeoFS MSFS Realism v13]', error);
    } finally {
      setBusy(false);
      updatePanel();
      if (diagNode && diagNode.style.display !== 'none') diagNode.textContent = diagnosticsText();
    }
  }

  function normalizeUiText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function findNativeGraphicsHost() {
    if (!document.body) return null;
    const required = [
      /performance vs\.?\s*quality|quality level/i,
      /imagery data source|sentinel-2|super-resolution/i,
      /enable buildings|\bbuildings\b/i,
      /viewing distance/i,
      /shadow quality/i,
      /volumetric clouds/i
    ];
    const headingNodes=$$('h1,h2,h3,h4,h5,legend,button,a,span,div').filter(el=>{
      if (panel && (panel===el || panel.contains(el))) return false;
      return normalizeUiText(el.childElementCount===0?(el.textContent||''):'')==='graphics';
    });
    const candidates=[];
    const addCandidate=el=>{
      if(!el||el===document.body||el===panel||panel&&panel.contains(el)) return;
      const text=normalizeUiText(el.innerText||el.textContent);
      if(text.length<180||text.length>18000) return;
      const hits=required.filter(rx=>rx.test(text)).length;
      if(hits<5) return;
      if(!/imagery data source|sentinel-2|super-resolution/i.test(text)||!/performance vs\.?\s*quality|quality level/i.test(text)||!/enable buildings|\bbuildings\b/i.test(text)) return;
      const rect=el.getBoundingClientRect&&el.getBoundingClientRect();
      if(!rect||rect.width<220||rect.height<130) return;
      for(let a=el;a&&a!==document.body;a=a.parentElement){
        const st=window.getComputedStyle?getComputedStyle(a):null;
        if(st&&(st.display==='none'||st.visibility==='hidden'||Number(st.opacity)===0)) return;
      }
      candidates.push({el,textLength:text.length,hits});
    };
    headingNodes.forEach(head=>{
      let node=head;
      for(let depth=0;depth<8&&node&&node!==document.body;depth++,node=node.parentElement) addCandidate(node);
    });
    // Fallback: still require the distinctive Graphics controls, not merely any visible options panel.
    if(!candidates.length) $$('div,section,article,form,fieldset,main').forEach(addCandidate);
    candidates.sort((a,b)=>a.textLength-b.textLength || b.hits-a.hits);
    return candidates.length?candidates[0].el:null;
  }

  function adoptNativeGraphicsStyles(host) {
    if (!panel || !host) return;
    const nativeButton = $$('button,input[type="button"],input[type="submit"]', host).find(el => !panel.contains(el));
    const nativeLabel = $$('label', host).find(el => !panel.contains(el));
    const inherited = window.getComputedStyle ? getComputedStyle(host) : null;
    panel.style.cssText = 'display:block;position:static;z-index:auto;top:auto;right:auto;width:100%;max-width:none;max-height:none;overflow:visible;margin:14px 0 4px;padding:12px 0 2px;border:0;border-top:1px solid rgba(128,128,128,.42);border-radius:0;background:transparent;box-shadow:none;backdrop-filter:none;color:inherit;font:inherit;box-sizing:border-box;';
    const btnStyle = nativeButton && getComputedStyle ? getComputedStyle(nativeButton) : null;
    const labelStyle = nativeLabel && getComputedStyle ? getComputedStyle(nativeLabel) : null;
    panel.querySelectorAll('.rr13-btn').forEach(button => {
      button.style.cssText = 'display:inline-flex;align-items:center;justify-content:flex-start;min-height:34px;width:100%;margin:3px 0;padding:6px 10px;white-space:normal;text-align:left;cursor:pointer;box-sizing:border-box;font:inherit;color:inherit;background:transparent;border:1px solid rgba(128,128,128,.46);border-radius:4px;';
      if (btnStyle) {
        button.style.fontFamily = btnStyle.fontFamily;
        button.style.fontSize = btnStyle.fontSize;
        button.style.fontWeight = btnStyle.fontWeight;
        button.style.lineHeight = btnStyle.lineHeight;
        button.style.borderRadius = btnStyle.borderRadius;
      }
      if (button.classList.contains('rr13-primary')) button.style.borderWidth = '2px';
      if (button.classList.contains('rr13-muted')) button.style.opacity = '0.82';
    });
    panel.querySelectorAll('.rr13-heading').forEach(heading => {
      heading.style.cssText = 'font:inherit;font-weight:700;letter-spacing:.02em;opacity:.9;margin:10px 0 5px;';
      if (labelStyle) heading.style.fontSize = labelStyle.fontSize;
    });
    panel.querySelectorAll('.rr13-note').forEach(note => { note.style.cssText = 'font:inherit;font-size:0.88em;opacity:.75;line-height:1.4;margin:5px 0 8px;'; });
    panel.querySelectorAll('.rr13-section').forEach(section => { section.style.cssText = 'display:block;margin:10px 0;padding:8px 0 2px;border-top:1px solid rgba(128,128,128,.25);'; });
    panel.querySelectorAll('.rr13-grid').forEach(grid => { grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;'; });
    panel.querySelectorAll('.rr13-slider').forEach(slider => { slider.style.cssText = 'display:grid;grid-template-columns:88px minmax(80px,1fr) 40px;gap:8px;align-items:center;margin:7px 0;font:inherit;'; });
    panel.querySelectorAll('input[type=range]').forEach(input => { input.style.width = '100%'; });
    panel.querySelectorAll('[data-status]').forEach(node => { node.style.cssText = 'margin-top:8px;padding:7px 0;border-top:1px solid rgba(128,128,128,.25);color:inherit;white-space:normal;font:inherit;font-size:.9em;'; });
    panel.querySelectorAll('[data-diagnostics]').forEach(node => { node.style.cssText = 'display:none;white-space:pre-wrap;word-break:break-word;font:11px/1.45 monospace;color:inherit;background:rgba(128,128,128,.08);padding:8px;border-radius:4px;margin:8px 0 0;'; });
    panel.querySelectorAll('.rr13-toggle').forEach(row => { row.style.cssText = 'display:flex;align-items:center;gap:9px;min-height:32px;padding:4px 1px;margin:1px 0;font:inherit;color:inherit;cursor:pointer;'; });
    panel.querySelectorAll('.rr13-toggle input').forEach(input => { input.style.cssText = 'width:17px;height:17px;flex:0 0 17px;margin:0;accent-color:#5d9bd3;'; });
  }

  function mountNativeGraphicsPanel() {
    if(!panel) return false;
    if(panel.isConnected&&nativeUiMountedHost&&nativeUiMountedHost.isConnected) return true;
    const host=findNativeGraphicsHost();
    if(!host) return false;
    refreshNativeControlSnapshot();
    host.appendChild(panel);
    nativeUiMountedHost=host;
    adoptNativeGraphicsStyles(host);
    if(nativeUiRetryTimer){clearInterval(nativeUiRetryTimer);nativeUiRetryTimer=null;}
    lastMessage='GeoFS公式 Options → Graphics の実際の設定領域内に拡張項目を統合しました';
    updatePanel();
    if(allOnApplied&&!nativeUiSyncApplied){
      nativeUiSyncApplied=true;
      safe(()=>applyNativeWorldMax());
      updatePanel();
    }
    return true;
  }

  function watchForNativeGraphicsPanel() {
    if (!nativeUiObserver && window.MutationObserver && document.body) {
      nativeUiObserver = new MutationObserver(() => {
        if (!panel || panel.isConnected) return;
        mountNativeGraphicsPanel();
      });
      nativeUiObserver.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['class','style','aria-hidden'] });
    }
    if (mountNativeGraphicsPanel()) return;
    if (nativeUiRetryTimer) return;
    nativeUiRetryUntil = Date.now() + 180000;
    nativeUiRetryTimer = setInterval(() => {
      if (mountNativeGraphicsPanel() || Date.now() > nativeUiRetryUntil) {
        if (nativeUiRetryTimer) clearInterval(nativeUiRetryTimer);
        nativeUiRetryTimer = null;
        if (!panel || !panel.isConnected) {
          lastMessage = '公式Graphics設定を検出できません。Options → Graphicsを開いたまま再実行してください（フローティングUIは作成しません）';
          console.warn('[GeoFS Realism v13] Native Graphics container not found; floating UI fallback is disabled.');
        }
        updatePanel();
      }
    }, 650);
  }

  function buttonMarkup(action,label,variant='') {
    return `<button type="button" data-action="${action}" class="rr13-btn ${variant}">${label}</button>`;
  }

  function toggleMarkup(action,label) {
    return `<label class="rr13-toggle"><input type="checkbox" data-toggle="${action}"><span>${label}</span></label>`;
  }

  function createPanel() {
    if(panel&&panel.isConnected) return;
    panel=document.createElement('section');
    panel.id='geofs-msfs-realism-v13-panel';
    panel.style.cssText='display:block;position:static;width:100%;max-width:none;margin:12px 0 4px;padding:10px 0 2px;border-top:1px solid rgba(128,128,128,.35);background:transparent;color:inherit;font:inherit;box-shadow:none;box-sizing:border-box;';
    panel.innerHTML=`
      <style>
        #geofs-msfs-realism-v13-panel *{box-sizing:border-box}
        #geofs-msfs-realism-v13-panel .rr13-btn{display:inline-flex;align-items:center;justify-content:center;width:100%;min-height:34px;margin:3px 0;padding:6px 10px;font:inherit;color:inherit;background:transparent;border:1px solid rgba(128,128,128,.46);border-radius:4px;cursor:pointer;text-align:left}
        #geofs-msfs-realism-v13-panel .rr13-btn:disabled{opacity:.45;cursor:default}
        #geofs-msfs-realism-v13-panel .rr13-primary{border-width:2px;font-weight:700}
        #geofs-msfs-realism-v13-panel .rr13-muted{opacity:.82}
        #geofs-msfs-realism-v13-panel .rr13-section{display:block;margin:10px 0;padding:8px 0 2px;border-top:1px solid rgba(128,128,128,.25)}
        #geofs-msfs-realism-v13-panel .rr13-heading{font:inherit;font-weight:700;letter-spacing:.02em;margin:8px 0 5px;opacity:.9}
        #geofs-msfs-realism-v13-panel .rr13-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}
        #geofs-msfs-realism-v13-panel .rr13-toggle{display:flex;align-items:center;gap:9px;min-height:32px;padding:4px 1px;margin:1px 0;font:inherit;color:inherit;cursor:pointer}
        #geofs-msfs-realism-v13-panel .rr13-toggle input{width:17px;height:17px;flex:0 0 17px;margin:0;accent-color:#5d9bd3}
        #geofs-msfs-realism-v13-panel .rr13-toggle span{line-height:1.35}
        #geofs-msfs-realism-v13-panel .rr13-note{font:inherit;font-size:.88em;opacity:.75;line-height:1.4;margin:5px 0 8px}
        #geofs-msfs-realism-v13-panel .rr13-slider{display:grid;grid-template-columns:88px minmax(80px,1fr) 40px;gap:8px;align-items:center;margin:7px 0;font:inherit}
        #geofs-msfs-realism-v13-panel input[type=range]{width:100%}
      </style>
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <strong style="font:inherit;font-weight:800">GeoFS Graphics · Realism Extension v${VERSION}</strong>
        <small style="opacity:.72">公式Graphics設定内</small>
      </div>
      <div class="rr13-note">追加項目も公式Graphics欄のチェックボックス形式。初回起動時は、対応する品質・描画機能をすべてONにします。競合する航空写真ソースは同時適用せず、地域とGeoFSの対応状況に応じて最適な1つを使います。</div>
      <div class="rr13-section">
        <div class="rr13-heading">01 · 全機能・描画品質</div>
        ${buttonMarkup('allOn','全機能をON・ULTRA品質を適用','rr13-primary')}
        <div class="rr13-grid">${buttonMarkup('ultra','ULTRA品質')}${buttonMarkup('balanced','BALANCED品質')}</div>
        ${toggleMarkup('adaptivePerformance','FPS連動の自動画質調整')}
        ${toggleMarkup('autoNearbyData','飛行移動に合わせて周辺データを自動更新')}
        <div class="rr13-note">GraphicsのAdvanced品質、HDR、対応時のMSAA、FXAA、視距離、タイルキャッシュ、影解像度をまとめて最適化します。</div>
      </div>
      <div class="rr13-section">
        <div class="rr13-heading">02 · 建物・屋根の実写再構成</div>
        ${toggleMarkup('buildingTexture','GeoFS建物テクスチャを最高品質に')}
        ${toggleMarkup('buildingLOD','建物LOD・近景表示範囲を拡張')}
        ${toggleMarkup('treeLOD','植生LOD・近景表示範囲を拡張')}
        ${toggleMarkup('roofs','航空写真の実ピクセルを屋根メッシュへ直接投影')}
        <div class="rr13-note">屋根の形はOSMの明示タグを優先し、タグがない場合は建物用途・外周形状・縦横比・階数から切妻／寄棟／陸屋根を推定。屋根色・汚れ・退色・補修跡は国土地理院の実写オルソ写真のピクセルをそのまま使用し、人工的な模様や色塗りはしません。推定形状は実測屋根ではなく、診断に推定/明示の棟数を表示します。</div>
        <div class="rr13-note">実写屋根は日本国内の国土地理院「全国最新写真（シームレス）」を使用。写真はズーム18のタイルに分割し、タイル境界をまたぐ屋根も分割投影します。地上写真の撮影年・解像度により実物と差が出る場合があります。<a href="https://maps.gsi.go.jp/help/use.html" target="_blank" rel="noopener">出典・利用条件</a></div>
      </div>
      <div class="rr13-section">
        <div class="rr13-heading">03 · 地面・道路・空港・都市</div>
        ${buttonMarkup('loadOsm','現在地周辺の地理データを取得','rr13-primary')}
        ${toggleMarkup('roads','道路面・路肩・車線・進行方向')}
        ${toggleMarkup('crossings','横断歩道・歩行者横断')}
        ${toggleMarkup('rail','鉄道レール・枕木')}
        ${toggleMarkup('roadSurface','道路実幅サーフェス・歩道')}
        ${toggleMarkup('parkingMarkings','駐車区画・駐車場ライン')}
        ${toggleMarkup('airportSurface','滑走路・誘導路・エプロン・ヘリパッド')}
        ${toggleMarkup('urbanSurfaces','公園・芝地・水面・都市地表')}
        ${toggleMarkup('buildingOutlines','建物フットプリントの位置合わせ表示')}
        ${toggleMarkup('trafficFurniture','信号機・街灯・道路標識')}
        ${toggleMarkup('greenInfrastructure','街路樹・森林・植生')}
        ${toggleMarkup('barriers','塀・フェンス・生垣・車止め')}
        ${toggleMarkup('powerNetwork','電柱・送電鉄塔・電線')}
        ${toggleMarkup('hydrography','河川・運河・水路・堤防')}
        ${toggleMarkup('streetObjects','バス停・ベンチ・消火栓等')}
        ${toggleMarkup('bridgeStructures','橋面・橋脚・ガードレール')}
        ${toggleMarkup('roofEquipment','地図に登録された屋上設備')}
        <div class="rr13-note">OSM補助レイヤーは実写テクスチャではなく地理属性の表示です。航空写真・フォトグラメトリが既に道路や建物を表現している場合は、重複を避けて自動的に抑制します。<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a></div>
      </div>
      <div class="rr13-section">
        <div class="rr13-heading">04 · 光・影・水面・大気</div>
        ${toggleMarkup('clouds','GeoFSボリューム雲・高度な大気')}
        ${toggleMarkup('water','水面の波・水マスク反射表現')}
        ${toggleMarkup('shadows','高解像度・ソフトシャドウ')}
        ${toggleMarkup('reflections','対応3D TilesのPBR環境反射・環境光')}
        ${toggleMarkup('ao','アンビエントオクルージョン')}
        ${toggleMarkup('bloom','HDR Bloom')}
        ${toggleMarkup('sharpen','微細ディテールのシャープ化')}
        ${buttonMarkup('atmosphereColor','自然な大気・地平線プロファイル')}
        <div class="rr13-note">建物・屋根の影はGeoFS/Cesiumの実際の太陽光とシャドウマップを使用。水面反射はGeoFSの水マスク・水面機能に依存します。AO/Bloomは端末のCesiumビルドに搭載されている場合だけ有効になります。</div>
      </div>
      <div class="rr13-section">
        <div class="rr13-heading">05 · 航空写真・フォトグラメトリ</div>
        ${toggleMarkup('gsiImagery','日本国内：国土地理院の実写オルソ写真')}
        ${buttonMarkup('google','GeoFS対応時：Google Photorealistic 3D切替')}
        ${buttonMarkup('hd','GeoFS HD航空写真（利用権限がある場合）')}
        ${buttonMarkup('naturalImagery','航空写真の自然色プロファイル')}
        <div class="rr13-note">実写3D・HD・GSIは競合するデータソースなので同時に混ぜません。Google実写3Dが有効な間は、屋根・道路の追加描画を抑制して二重表示を防ぎます。</div>
        <label class="rr13-slider">明るさ <input data-slider="brightness" type="range" min="80" max="120" step="1" value="100"><output data-value="brightness">1.00</output></label>
        <label class="rr13-slider">コントラスト <input data-slider="contrast" type="range" min="80" max="125" step="1" value="100"><output data-value="contrast">1.00</output></label>
        <label class="rr13-slider">彩度 <input data-slider="saturation" type="range" min="75" max="125" step="1" value="100"><output data-value="saturation">1.00</output></label>
        <label class="rr13-slider">シャープ量 <input data-slider="sharpness" type="range" min="0" max="35" step="1" value="14"><output data-value="sharpness">0.14</output></label>
      </div>
      <div class="rr13-section"><div class="rr13-grid">${buttonMarkup('diagnostics','Diagnostics','rr13-muted')}${buttonMarkup('reset','すべて元に戻す','rr13-muted')}</div></div>
      <div data-status style="margin-top:9px;padding:8px 0;border-top:1px solid rgba(128,128,128,.25);color:inherit;white-space:normal;font-size:.9em"></div>
      <pre data-diagnostics style="display:none;white-space:pre-wrap;word-break:break-word;font:10px/1.5 ui-monospace,monospace;color:inherit;background:rgba(128,128,128,.08);padding:9px;border-radius:4px;margin:8px 0 0"></pre>
    `;
    statusNode=$('[data-status]',panel);
    diagNode=$('[data-diagnostics]',panel);
    const actions={
      allOn:()=>applyEverythingOn(),
      ultra:()=>applyQualityProfile('ultra'),
      balanced:()=>applyQualityProfile('balanced'),
      nativeQuality:()=>restoreQualityOnly(),
      buildingTexture:()=>toggleBuildingTextures(!state.buildingTexture),
      buildingLOD:()=>changeLod('building',!state.buildingLOD),
      treeLOD:()=>changeLod('tree',!state.treeLOD),
      roofs:async()=>{const en=!state.roofs;state.roofs=en;if(!en){removeRoofOverlay();lastMessage='実写屋根写真を解除しました';return;}const n=await drawRoofOverlay();lastMessage=`実写写真の屋根面を${n}棟へ投影（推定${roofPhotoInferredBuildings}・OSM明示${roofPhotoExplicitBuildings}・タイル${roofPhotoTilesUsed}）`;},
      loadOsm:async()=>{lastMessage='周辺の地理データを取得しています…';updatePanel();const c=await loadOsmArea(false);lastMessage+=` / 道路${c.roads}・建物${c.buildings||0}`;},
      roads:async()=>{state.road=!state.road;await redrawOsmLayers();},
      crossings:async()=>{state.crossings=!state.crossings;await redrawOsmLayers();},
      rail:async()=>{state.rail=!state.rail;await redrawOsmLayers();},
      roadSurface:async()=>{state.roadSurface=!state.roadSurface;await redrawOsmLayers();},
      parkingMarkings:async()=>{state.parkingMarkings=!state.parkingMarkings;await drawParkingBayMarkings();},
      airportSurface:async()=>{state.airportSurface=!state.airportSurface;await redrawOsmLayers();},
      buildingOutlines:async()=>{state.buildingOutlines=!state.buildingOutlines;await drawBuildingOutlines();},
      urbanSurfaces:async()=>{state.urbanSurfaces=!state.urbanSurfaces;await drawUrbanSurfacePatches();},
      trafficFurniture:async()=>{state.trafficFurniture=!state.trafficFurniture;await drawTrafficFurniture();},
      greenInfrastructure:async()=>{state.greenInfrastructure=!state.greenInfrastructure;await drawGreenInfrastructure();},
      barriers:async()=>{state.barriers=!state.barriers;await drawBarriers();},
      powerNetwork:async()=>{state.powerNetwork=!state.powerNetwork;await drawPowerNetwork();},
      hydrography:async()=>{state.hydrography=!state.hydrography;await drawHydrography();},
      streetObjects:async()=>{state.streetObjects=!state.streetObjects;await drawStreetObjects();},
      bridgeStructures:async()=>{state.bridgeStructures=!state.bridgeStructures;await drawBridgeStructures();},
      roofEquipment:async()=>{state.roofEquipment=!state.roofEquipment;await drawRoofEquipment();},
      adaptivePerformance:()=>toggleAdaptivePerformance(!state.adaptivePerformance),
      autoNearbyData:()=>{state.autoNearbyData=!state.autoNearbyData;lastMessage=`周辺データ自動更新：${state.autoNearbyData?'ON':'OFF'}`;},
      clouds:()=>applyAtmosphere(!state.volumetricClouds),
      water:()=>toggleWater(!state.water),
      shadows:()=>toggleShadows(!state.shadows),
      reflections:()=>toggleTileReflections(!state.reflections),
      ao:()=>togglePostProcess('ao',!state.ao),
      bloom:()=>togglePostProcess('bloom',!state.bloom),
      sharpen:()=>toggleSharpen(!state.sharpen),
      atmosphereColor:()=>setAtmosphereColorProfile(),
      gsiImagery:()=>toggleGsiGroundImagery(!state.gsiImagery),
      naturalImagery:()=>applyNaturalImagery(),
      google:()=>toggleGoogle3D(),
      hd:()=>toggleHD(),
      diagnostics:()=>{diagNode.style.display=diagNode.style.display==='none'?'block':'none';diagNode.textContent=diagnosticsText();},
      reset:()=>resetAll()
    };
    panel.addEventListener('click',event=>{
      const button=event.target.closest('button[data-action]');
      if(!button) return;
      const action=actions[button.dataset.action];
      if(!action||button.disabled) return;
      if(button.dataset.action==='diagnostics') action(); else runAction(action);
    });
    panel.addEventListener('change',event=>{
      const input=event.target.closest('input[data-toggle]');
      if(!input) return;
      const action=actions[input.dataset.toggle];
      if(action&&!input.disabled) runAction(action);
    });
    panel.addEventListener('input',event=>{
      const slider=event.target.closest('[data-slider]');
      if(!slider) return;
      const key=slider.dataset.slider, value=Number(slider.value), output=$(`[data-value="${key}"]`,panel);
      if(key==='sharpness') { state.sharpness=value/100; if(sharpenStage) sharpenStage.uniforms.u_strength=()=>state.sharpness; }
      else setImageryProperty(key,value/100);
      if(output) output.textContent=(key==='sharpness'?state.sharpness:value/100).toFixed(2);
      requestRender();
    });
    updatePanel();
    watchForNativeGraphicsPanel();
  }

  function restoreQualityOnly() {
    const g = getGeoFS();
    if (!g || !original || !original.graphics) return;
    g.preferences.graphics = clone(original.graphics);
    g.api.renderingQuality(g.preferences.graphics.quality, true);
    restoreNativeGraphicsCheckboxes();
    state.qualityProfile = 'native';
    state.volumetricClouds = !!(original.nativeControls && original.nativeControls.volumetricClouds);
    lastMessage = 'GeoFSの元の描画品質へ戻しました';
  }

  async function resetAll() {
    const g = getGeoFS();
    if (!g || !original) return;
    restoreTileLighting();
    removeRoadLayers();
    removeRoofOverlay();
    removeGsiGroundImagery();
    removeBuildingOutlines();
    removeFacadeDetails();
    removeTrafficFurniture();
    removeGreenInfrastructure();
    removeBarriers();
    removePowerNetwork();
    removeHydrography();
    removeStreetObjects();
    removeBridgeStructures();
    if (urbanSurfacePrimitive) safe(() => g.api.viewer.scene.groundPrimitives.remove(urbanSurfacePrimitive));
    urbanSurfacePrimitive = null;
    removeRoofEquipment();
    if (ionBuildingsTileset) {
      safe(() => g.api.viewer.scene.primitives.remove(ionBuildingsTileset));
      ionBuildingsTileset = null;
      if (ionNativeBuildingsWasEnabled && typeof g.api.setBuildings === 'function') safe(() => g.api.setBuildings(true));
      ionNativeBuildingsWasEnabled = false;
    }
    if (g.api.googleTileset && !original.googleTilesActive) await g.api.setGoogleTiles(false);
    if (!g.api.googleTileset && original.googleTilesActive) await g.api.setGoogleTiles(true);
    if (sharpenStage) {
      safe(() => g.api.viewer.scene.postProcessStages.remove(sharpenStage));
      sharpenStage = null;
    }
    if (buildingTextureBackupActive && g.configuration && g.configuration.current) {
      const map = g.configuration.current.qualityToBuildingTexture;
      Object.keys(map).forEach(k => delete map[k]);
      Object.assign(map, clone(originalTextureMap || original.buildingTextureMap || {}));
      buildingTextureBackupActive = false;
      state.buildingTexture = false;
    }
    if (buildingLodBackupActive && g.buildings && g.buildings.qualityLevels) {
      const obj = g.buildings.qualityLevels;
      Object.keys(obj).forEach(k => delete obj[k]);
      Object.assign(obj, clone(originalBuildingLevels || {}));
      buildingLodBackupActive = false;
      state.buildingLOD = false;
    }
    if (treeLodBackupActive && g.trees && g.trees.qualityLevels) {
      const obj = g.trees.qualityLevels;
      Object.keys(obj).forEach(k => delete obj[k]);
      Object.assign(obj, clone(originalTreeLevels || {}));
      treeLodBackupActive = false;
      state.treeLOD = false;
    }
    if (g.api.googleTileset && original.googleTilesActive) {
      // If Google 3D was active before the add-on, leave it active.
    }
    g.preferences.graphics = clone(original.graphics);
    g.api.renderingQuality(g.preferences.graphics.quality, true);
    restoreNativeGraphicsCheckboxes();
    if (typeof g.api.setWaterEffect === 'function' && !!g.preferences.graphics.waterEffect !== !!original.waterEffect) safe(() => g.api.setWaterEffect(!!original.waterEffect));
    if (g.api.setGlobeLighting && original.globe.enableLighting !== undefined) safe(() => g.api.setGlobeLighting(original.globe.enableLighting));
    if (g.api.useNativeShadows) safe(() => g.api.useNativeShadows(original.nativeShadows));
    if (typeof original.adaptiveMaxScreenSpaceError === 'number') g.api.adaptativeMaxMaximumScreenSpaceError = original.adaptiveMaxScreenSpaceError;
    const viewer = g.api.viewer;
    if (viewer.scene.globe) Object.keys(original.globe).forEach(k => { if (original.globe[k] !== undefined) safe(() => { viewer.scene.globe[k] = original.globe[k]; }); });
    if (viewer.scene.skyAtmosphere) Object.keys(original.sky).forEach(k => { if (original.sky[k] !== undefined) safe(() => { viewer.scene.skyAtmosphere[k] = original.sky[k]; }); });
    if (viewer.scene.fog) Object.keys(original.fog).forEach(k => { if (original.fog[k] !== undefined) safe(() => { viewer.scene.fog[k] = original.fog[k]; }); });
    if (viewer.shadowMap) Object.keys(original.shadow).forEach(k => { if (original.shadow[k] !== undefined) safe(() => { viewer.shadowMap[k] = original.shadow[k]; }); });
    if (viewer.imageryLayers && viewer.imageryLayers.length && original.layer) {
      const layer = viewer.imageryLayers.get(0);
      Object.keys(original.layer).forEach(k => safe(() => { layer[k] = original.layer[k]; }));
    }
    if (viewer.scene.postProcessStages) {
      if (viewer.scene.postProcessStages.ambientOcclusion && original.ao !== undefined) viewer.scene.postProcessStages.ambientOcclusion.enabled = original.ao;
      if (viewer.scene.postProcessStages.bloom && original.bloom !== undefined) viewer.scene.postProcessStages.bloom.enabled = original.bloom;
      if (viewer.scene.postProcessStages.fxaa && original.scene.fxaa !== undefined) viewer.scene.postProcessStages.fxaa.enabled = original.scene.fxaa;
    }
    if (viewer.scene.msaaSamples !== undefined && original.scene.msaaSamples !== undefined) viewer.scene.msaaSamples = original.scene.msaaSamples;
    if (viewer.scene.highDynamicRange !== undefined && original.scene.highDynamicRange !== undefined) viewer.scene.highDynamicRange = original.scene.highDynamicRange;
    if (typeof g.api.setAtmosphereColorModifier === 'function') safe(() => g.api.setAtmosphereColorModifier('geofs-msfs-v13', { brightnessShift: 0, saturationShift: 0, hueShift: 0, groundBrightnessShift: 0, groundSaturationShift: 0, groundHueShift: 0, fogBrightness: 1, cloudsBrightness: 1 }));
    rebuildBuildingsIfActive();
    state.road = false; state.crossings = false; state.rail = false; state.roadSurface = false; state.airportSurface = false;
    state.buildingOutlines = false; state.facadeWindows = false; state.urbanSurfaces = false; state.trafficFurniture = false; state.parkingMarkings = false; state.roofEquipment = false; state.roofs = false; state.ionBuildings = false;
    state.buildingTexture = false; state.buildingLOD = false; state.treeLOD = false;
    if (state.adaptivePerformance) toggleAdaptivePerformance(false);
    state.greenInfrastructure = false; state.barriers = false; state.powerNetwork = false; state.hydrography = false; state.streetObjects = false; state.bridgeStructures = false; state.autoNearbyData = false;
    state.volumetricClouds = !!(original.nativeControls && original.nativeControls.volumetricClouds); state.water = !!original.waterEffect; state.shadows = !!original.nativeShadows;
    state.ao = !!original.ao; state.bloom = !!original.bloom; state.sharpen = false; state.qualityProfile = 'native';
    state.brightness = 1; state.contrast = 1; state.saturation = 1; state.sharpness = 0.14;
    osmElements = [];
    weatheredRoofTileCache.clear(); weatheredRoofTileCount = 0;
    samplerRecoveryDone = false;
    lastOsmCell = ''; lastAutoCellAttempt = ''; lastDetailBand = '';
    lastMessage = 'GeoFS起動時の設定へ復元しました';
    requestRender();
  }

  function togglePanel() {
    createPanel();
    if (panel && panel.isConnected) {
      safe(() => panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      updatePanel();
      return true;
    }
    watchForNativeGraphicsPanel();
    lastMessage = 'GeoFSのOptions → Graphicsを開くと、公式設定画面内に拡張項目が挿入されます';
    updatePanel();
    return false;
  }

  function cleanup() {
    // cleanup is intentionally non-destructive: use the panel's reset action for full restoration.
    const g = getGeoFS();
    removeRoadLayers();
    removeRoofOverlay();
    removeGsiGroundImagery();
    removeBuildingOutlines();
    removeFacadeDetails();
    removeTrafficFurniture();
    removeGreenInfrastructure();
    removeBarriers();
    removePowerNetwork();
    removeHydrography();
    removeStreetObjects();
    removeBridgeStructures();
    if (urbanSurfacePrimitive && g) safe(() => g.api.viewer.scene.groundPrimitives.remove(urbanSurfacePrimitive));
    urbanSurfacePrimitive = null;
    removeRoofEquipment();
    if (ionBuildingsTileset && g) safe(() => g.api.viewer.scene.primitives.remove(ionBuildingsTileset));
    ionBuildingsTileset = null;
    if (panel) panel.remove();
    if (nativeUiObserver) safe(() => nativeUiObserver.disconnect());
    if (nativeUiRetryTimer) clearInterval(nativeUiRetryTimer);
    nativeUiObserver = null; nativeUiRetryTimer = null; nativeUiMountedHost = null;
    if (renderEventRemove) safe(() => renderEventRemove());
    if (renderErrorRemove) safe(() => renderErrorRemove());
    if (state.adaptivePerformance) safe(() => toggleAdaptivePerformance(false));
    delete window[KEY];
  }

  function startFpsMeter() {
    const scene = getScene();
    if (!scene || !scene.postRender || !scene.postRender.addEventListener) return;
    const remove = scene.postRender.addEventListener(() => {
      frameCount++;
      const now = performance.now();
      const elapsed = now - frameStart;
      if (elapsed >= 1000) {
        frameRate = Math.round(frameCount * 1000 / elapsed);
        frameCount = 0;
        frameStart = now;
        updateAdaptivePerformance(now);
        updateWorldDetailLod(now);
      }
    });
    renderEventRemove = typeof remove === 'function' ? remove : null;
  }

  function init() {
    const g=getGeoFS(), C=getCesium();
    if(!g||!C||!g.api.viewer.scene) return false;
    captureOriginal(); createPanel(); startFpsMeter();
    const graphics=g.preferences.graphics||{};
    state.volumetricClouds=!!readNativeCheckbox(/^volumetric clouds$/i);
    state.water=!!graphics.waterEffect;
    state.shadows=!!g.api.viewer.shadows;
    const stages=g.api.viewer.scene.postProcessStages;
    state.ao=!!(stages&&stages.ambientOcclusion&&stages.ambientOcclusion.enabled);
    state.bloom=!!(stages&&stages.bloom&&stages.bloom.enabled);
    lastMessage=`GeoFS ${g.version||''} / Cesium ${C.VERSION||'unknown'}。公式Graphics欄を検出してGPU安全設定を適用します。`;
    window[KEY]={version:VERSION,togglePanel,cleanup,diagnostics:diagnosticsText,loadArea:()=>loadOsmArea(false),reset:resetAll,enableAll:applyEverythingOn};
    window.addEventListener('pagehide',cleanup,{once:true});
    installSamplerRecovery(); updatePanel();
    if(!allOnApplied&&!allOnPromise) {
      setTimeout(()=>{if(!allOnApplied&&!allOnPromise)runAction(applyEverythingOn);},900);
    }
    return true;
  }

  async function redrawRoadsAndTransportImpl() {
    const g = getGeoFS();
    const C = getCesium();
    if (!g || !C) return;
    removeRoadLayers();
    if (g.api.googleTileset || (!state.road && !state.crossings && !state.rail)) return;
    const altitude = currentCamera().altitude;
    if (altitude > 9000) return;
    const px = pxPerMeter();
    const cap = mobile ? 150 : 340;
    const roads = [];
    const instances = [];
    const ways = osmElements.filter(el => el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2);
    let processed = 0;
    ways.forEach(el => {
      const tags = el.tags || {};
      const path = el.geometry.map(p => ({ lat: Number(p.lat), lon: Number(p.lon) })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      if (path.length < 2) return;
      if (tags.highway) {
        const style = roadStyle(tags);
        if (style && !['construction', 'proposed'].includes(style.highway) && tags.tunnel !== 'yes' && tags.access !== 'no') {
          roads.push({ path, style, tags });
          if (state.road && processed < cap) {
            const width = clamp(style.width * px * 0.72, style.highway === 'footway' ? 1 : 1.15, 16);
            const rough = /gravel|unpaved|ground|dirt|earth|track/.test(style.surface) || style.highway === 'track';
            addGroundInstance(C, instances, path, width + 2, C.Color.fromCssColorString(rough ? '#746b59' : '#292d31').withAlpha(rough ? 0.24 : 0.28));
            addGroundInstance(C, instances, path, width, C.Color.fromCssColorString(style.color).withAlpha(rough ? 0.34 : 0.32));
            if (style.width >= 8 && px > 0.08 && !rough) {
              const offset = style.width * 0.43;
              const edge = C.Color.fromCssColorString('#e4e0d3').withAlpha(0.48);
              addGroundInstance(C, instances, offsetPath(path, offset, -1), clamp(width * 0.14, 0.8, 1.3), edge);
              addGroundInstance(C, instances, offsetPath(path, offset, 1), clamp(width * 0.14, 0.8, 1.3), edge);
            }
            if (['both', 'left', 'right'].includes(style.sidewalk) && altitude < 4200) {
              const sideOffset = style.width / 2 + 1.3;
              const sideColor = C.Color.fromCssColorString('#b3aa98').withAlpha(0.36);
              if (style.sidewalk !== 'right') addGroundInstance(C, instances, offsetPath(path, sideOffset, -1), 1.0, sideColor);
              if (style.sidewalk !== 'left') addGroundInstance(C, instances, offsetPath(path, sideOffset, 1), 1.0, sideColor);
            }
            if (style.cycleway && !/^(no|none)$/.test(style.cycleway) && altitude < 2600) {
              const side = /left/.test(style.cycleway) ? -1 : /right/.test(style.cycleway) ? 1 : 1;
              const cycleOffset = style.width / 2 - 0.6;
              addGroundInstance(C, instances, offsetPath(path, Math.max(0.8, cycleOffset), side), clamp(px * 1.9, 1.2, 2.5), C.Color.fromCssColorString('#6f9b83').withAlpha(0.55));
            }
            processed++;
          }
        }
      }
      if (state.rail && tags.railway && /^(rail|tram|light_rail)$/.test(tags.railway)) {
        const color = C.Color.fromCssColorString('#4b4d4d').withAlpha(0.68);
        addGroundInstance(C, instances, offsetPath(path, 0.72, -1), clamp(px * 1.2, 1, 3), color);
        addGroundInstance(C, instances, offsetPath(path, 0.72, 1), clamp(px * 1.2, 1, 3), color);
        // Cross sleepers are only rendered at low altitude and under a hard budget.
        if (altitude < 3600 && instances.length < (mobile ? 220 : 520)) {
          const sleeper = C.Color.fromCssColorString('#55483a').withAlpha(0.74);
          for (let si = 1; si < path.length && instances.length < (mobile ? 220 : 520); si++) {
            const a = path[si - 1], b = path[si], segLen = pathLengthMeters([a, b]);
            if (segLen < 5 || segLen > 900) continue;
            const head = bearing(a, b);
            for (let d = 3.5; d < segLen && instances.length < (mobile ? 220 : 520); d += (altitude < 900 ? 4.2 : 8.5)) {
              const center = destination(a, head, d);
              const left = destination(center, head - Math.PI / 2, 1.28);
              const right = destination(center, head + Math.PI / 2, 1.28);
              addGroundInstance(C, instances, [left, right], clamp(px * 1.75, 1.1, 2.6), sleeper);
            }
          }
        }
      }
    });
    if (state.road && C.PolylineDashMaterialProperty && altitude < 5000) {
      roadMarkSource = new C.CustomDataSource('GeoFS v13 road markings');
      let n = 0;
      roads.forEach((road, i) => {
        if (n >= (mobile ? 16 : 64) || !road.style.marked || road.style.lanes < 2 || road.style.width < 7) return;
        roadMarkSource.entities.add({
          id: `geofs-v13-center-${i}`,
          polyline: {
            positions: positionsFromPath(C, road.path), clampToGround: true,
            classificationType: C.ClassificationType.BOTH,
            width: clamp(road.style.width * px * 0.1, 0.8, 1.35),
            material: new C.PolylineDashMaterialProperty({ color: C.Color.fromCssColorString('#f3eedb').withAlpha(0.76), gapColor: C.Color.TRANSPARENT, dashLength: 18 })
          }
        });
        n++;
      });
      // Dashed lane separators for explicitly tagged multi-lane roads.
      roads.forEach((road, i) => {
        const lanes = clamp(Math.round(road.style.lanes || 1), 1, 6);
        if (lanes < 3 || road.style.width < 8 || n >= (mobile ? 30 : 120)) return;
        for (let lane = 1; lane < lanes; lane++) {
          if (Math.abs(lane / lanes - 0.5) < 0.04) continue; // The center line above already covers this position.
          const offset = road.style.width * (lane / lanes - 0.5);
          const divider = offsetPath(road.path, Math.abs(offset), offset < 0 ? -1 : 1);
          roadMarkSource.entities.add({
            id: `geofs-v13-lane-${i}-${lane}`,
            polyline: {
              positions: positionsFromPath(C, divider), clampToGround: true,
              classificationType: C.ClassificationType.BOTH, width: 0.85,
              material: new C.PolylineDashMaterialProperty({ color: C.Color.WHITE.withAlpha(0.53), gapColor: C.Color.TRANSPARENT, dashLength: 11 })
            }
          });
          n++;
          if (n >= (mobile ? 30 : 120)) break;
        }
      });
      // Paint lane arrows only where OpenStreetMap explicitly has turn:lanes metadata.
      let arrowCount = 0;
      const arrowGlyph = value => {
        const v = String(value || '').toLowerCase();
        if (/^(left|slight_left|sharp_left|merge_to_left)$/.test(v)) return '←';
        if (/^(right|slight_right|sharp_right|merge_to_right)$/.test(v)) return '→';
        if (/^(reverse|uturn)$/.test(v)) return '↶';
        if (/^(through|none)$/.test(v)) return '↑';
        if (/^(left;through|through;left)$/.test(v)) return '↖↑';
        if (/^(through;right|right;through)$/.test(v)) return '↑↗';
        return '';
      };
      roads.forEach((road, i) => {
        if (arrowCount >= (mobile ? 10 : 32) || !road.tags) return;
        const turnData = road.tags['turn:lanes:forward'] || road.tags['turn:lanes'];
        if (!turnData || road.path.length < 2 || road.style.width < 5) return;
        const lanes = String(turnData).split('|').slice(0, 6);
        const middle = road.path[Math.floor(road.path.length / 2)];
        lanes.forEach((lane, j) => {
          if (arrowCount >= (mobile ? 10 : 32)) return;
          const glyph = arrowGlyph(lane.split(';').slice(0,2).join(';'));
          if (!glyph) return;
          const offset = road.style.width * ((j + 0.5) / lanes.length - 0.5);
          const pos = destination(middle, bearing(road.path[0], road.path[road.path.length-1]) + (offset < 0 ? -Math.PI/2 : Math.PI/2), Math.abs(offset));
          roadMarkSource.entities.add({
            id: `geofs-v13-turn-arrow-${i}-${j}`,
            position: C.Cartesian3.fromDegrees(pos.lon, pos.lat, 1.0),
            label: { text: glyph, font: 'bold 13px sans-serif', fillColor: C.Color.WHITE.withAlpha(0.85), outlineColor: C.Color.BLACK.withAlpha(0.72), outlineWidth: 2, style: C.LabelStyle.FILL_AND_OUTLINE, horizontalOrigin: C.HorizontalOrigin.CENTER, verticalOrigin: C.VerticalOrigin.CENTER, scale: 0.86, disableDepthTestDistance: 0 }
          });
          arrowCount++;
        });
      });
      g.api.viewer.dataSources.add(roadMarkSource);
    }
    if (state.crossings && altitude < 4200) {
      const nodes = osmElements.filter(el => el.type === 'node' && el.tags && el.tags.highway === 'crossing' && Number.isFinite(Number(el.lat)) && Number.isFinite(Number(el.lon)));
      let n = 0;
      nodes.forEach(node => {
        if (n >= (mobile ? 8 : 24)) return;
        const p = { lat: Number(node.lat), lon: Number(node.lon) };
        const nearest = nearestRoadForNode(p, roads);
        if (!nearest || nearest.distance > 22) return;
        const width = clamp(nearest.width * 0.72, 4, 11);
        for (let j = -2; j <= 2; j++) {
          const center = destination(p, nearest.heading, j * 0.82);
          const a = destination(center, nearest.heading + Math.PI / 2, -width / 2);
          const b = destination(center, nearest.heading + Math.PI / 2, width / 2);
          addGroundInstance(C, instances, [a, b], clamp(px * 2.2, 1.4, 3.2), C.Color.fromCssColorString('#f5f0e2').withAlpha(0.82));
        }
        n++;
      });
    }
    roadPrimitive = createGroundPrimitive(C, g.api.viewer.scene, instances);
    if (!roadPrimitive && instances.length) drawFallbackRoadEntities(C, roads.slice(0, mobile ? 65 : 130).map(r => ({ path: r.path, width: clamp(r.style.width * px * 0.7, 1.2, 12), color: C.Color.fromCssColorString(r.style.color).withAlpha(0.30) })));
    requestRender();
  }

  let attempts = 0;
  const waiter = setInterval(() => {
    attempts++;
    if (init() || attempts > 360) {
      clearInterval(waiter);
      if (attempts > 360 && !getGeoFS()) console.warn('[GeoFS MSFS Realism v13] GeoFS Viewer was not detected.');
    }
  }, 500);
})();
