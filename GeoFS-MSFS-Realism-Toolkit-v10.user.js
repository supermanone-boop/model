// ==UserScript==
// @name         GeoFS MSFS Realism Toolkit v10
// @namespace    geofs.msfs.realism
// @version      10.0.0
// @description  Expanded GeoFS realism: roads, roofs, airport surfaces, trees, barriers, power lines, waterways, street furniture, open building footprints and adaptive performance.
// @match        https://www.geo-fs.com/geofs.php*
// @match        https://geo-fs.com/geofs.php*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '10.0.0';
  const KEY = '__GEOFS_MSFS_REALISM_V10__';
  const CACHE_PREFIX = 'geofs_msfs_v10_osm_';
  const CACHE_TTL = 4 * 60 * 60 * 1000;
  const EARTH_RADIUS = 6378137;
  const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (!!window.matchMedia && matchMedia('(pointer: coarse)').matches && innerWidth < 1100);

  if (window[KEY]) {
    window[KEY].togglePanel();
    return;
  }

  // Remove previous add-on generations to avoid stacked overlays and panels.
  ['__GEOFS_MSFS_REALISM_V9__', '__GEOFS_MSFS_REALISM_V8__', '__GEOFS_MSFS_REALISM_V7__', '__GEOFS_MSFS_REALISM_V6__', '__GEOFS_ROOF_ROAD_REALISM_V5__', '__GEOFS_ROOF_ROAD_REALISM_V4__', '__GEOFS_MSFS_REALISM_CORE_V3__'].forEach(name => {
    try {
      const old = window[name];
      if (old && typeof old.cleanup === 'function') old.cleanup();
    } catch (_) {}
  });

  const state = {
    road: false,
    crossings: true,
    rail: true,
    roadSurface: true,
    airportSurface: true,
    buildingOutlines: false,
    facadeWindows: false,
    urbanSurfaces: true,
    trafficFurniture: true,
    greenInfrastructure: true,
    barriers: true,
    powerNetwork: true,
    hydrography: true,
    streetObjects: true,
    bridgeStructures: true,
    adaptivePerformance: false,
    autoNearbyData: true,
    parkingMarkings: true,
    roofEquipment: true,
    roofs: false,
    ionBuildings: false,
    buildingShader: false,
    buildingTexture: false,
    buildingLOD: false,
    treeLOD: false,
    volumetricClouds: false,
    water: false,
    shadows: false,
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
  let roofPrimitive = null;
  let roofDetailSource = null;
  let importedBuildingFeatures = [];
  let importedBuildingPrimitive = null;
  let importedRoofPrimitive = null;
  let importedBuildingCount = 0;
  let sharpenStage = null;
  let frameRate = 0;
  let frameCount = 0;
  let frameStart = performance.now();
  let renderEventRemove = null;
  let busy = false;
  let lastMessage = 'GeoFSを検出しています…';
  let original = null;
  let originalBuildingShader = null;
  let originalTextureMap = null;
  let originalBuildingLevels = null;
  let originalTreeLevels = null;
  let originalImagery = null;
  let roofShaderBackupActive = false;
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
      buildingShader: window.geofsShaders && geofsShaders['buildingsFS.glsl'],
      buildingTextureMap: g.configuration && g.configuration.current && clone(g.configuration.current.qualityToBuildingTexture),
      buildingLevels: g.buildings && clone(g.buildings.qualityLevels),
      treeLevels: g.trees && clone(g.trees.qualityLevels),
      nativeShadows: viewer.shadows,
      adaptiveMaxScreenSpaceError: g.api.adaptativeMaxMaximumScreenSpaceError,
      nativeBuildingsEnabled: !!(g.preferences && g.preferences.graphics && g.preferences.graphics.buildings)
    };
    originalBuildingShader = original.buildingShader;
    originalTextureMap = original.buildingTextureMap;
    originalBuildingLevels = original.buildingLevels;
    originalTreeLevels = original.treeLevels;
    originalImagery = original.layer;
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

  function maxMsaaSamples() {
    const scene = getScene();
    const gl = scene && scene.context && scene.context._gl;
    if (!gl) return 1;
    return safe(() => gl.getParameter(gl.MAX_SAMPLES)) || 1;
  }

  function applyQualityProfile(profile) {
    const g = getGeoFS();
    if (!g || !g.api || typeof g.api.renderingQuality !== 'function') throw new Error('GeoFS標準の描画品質APIが見つかりません');
    captureOriginal();
    const graphics = g.preferences.graphics;
    graphics.quality = 0; // GeoFS advanced-quality mode
    graphics.advanced = graphics.advanced || {};
    const adv = graphics.advanced;
    const ultra = profile === 'ultra';
    const maxDistance = mobile ? (ultra ? 5 : 4) : (ultra ? 7 : 6);
    const msaa = mobile ? 1 : clamp(maxMsaaSamples(), 1, ultra ? 4 : 2);
    adv.viewingDistance = maxDistance;
    adv.resolutionScale = mobile ? 1 : (ultra ? 1.14 : 1.02);
    adv.tileCacheSize = mobile ? (ultra ? 900 : 550) : (ultra ? 2800 : 1500);
    adv.fxaa = true;
    adv.msaaSamples = msaa;
    adv.globeLighting = true;
    adv.dropShadow = true;
    adv.softShadows = !mobile;
    adv.shadowQuality = mobile ? 0.85 : (ultra ? 1.45 : 1.1);
    adv.scatteringQuality = mobile ? 3 : 5;
    adv.cloudDensity = ultra ? 1.10 : 1.02;
    // Keep GeoFS adaptive terrain refinement from relaxing the mesh too aggressively.
    if (typeof g.api.adaptativeMaxMaximumScreenSpaceError === 'number') {
      g.api.adaptativeMaxMaximumScreenSpaceError = mobile ? (ultra ? 4.2 : 4.8) : (ultra ? 2.8 : 3.6);
    }
    graphics.advancedAtmosphere = true;
    graphics.volumetricClouds = true;
    g.api.renderingQuality(null, true);
    state.qualityProfile = profile;
    state.volumetricClouds = true;
    lastMessage = `${ultra ? 'ULTRA' : 'BALANCED'}品質をGeoFS標準APIで適用。視距離 ${maxDistance}/7、MSAA ${msaa}x、雲・大気散乱を有効化`;
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
      g.api.setBuildings(false);
      if (shouldBeActive) g.api.setBuildings(true);
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
        g.api.setVegetation(false);
        if (pref) g.api.setVegetation(true);
      }
      lastMessage = enable ? '植生タイルの既存ズーム帯で読み込み周辺範囲を拡張しました' : '植生LODを標準へ戻しました';
    }
  }

  function enhancedBuildingShader(source) {
    const marker = 'vec4 buildingColor = fsInput.attributes.color_0;';
    if (typeof source !== 'string' || !source.includes(marker)) throw new Error('GeoFS建物シェーダーの構造が想定と異なります');
    if (source.includes('GEOFS_MSFS_V6_ROOF_RESPONSE')) return source;
    const injected = `${marker}
// GEOFS_MSFS_V6_ROOF_RESPONSE: restrained roof/facade material response.
vec3 rrWorldPosition = (czm_inverseView * vec4(fsInput.attributes.positionEC, 1.0)).xyz;
vec3 rrWorldUp = normalize(rrWorldPosition);
vec3 rrWorldNormal = normalize(czm_inverseViewRotation * fsInput.attributes.normalEC);
float rrRoofMask = smoothstep(0.58, 0.91, dot(rrWorldNormal, rrWorldUp));
float rrWallMask = 1.0 - rrRoofMask;
vec2 rrUv = fsInput.attributes.texCoord_0;
float rrGrain = sin(rrUv.x * 311.0 + sin(rrUv.y * 97.0)) * cos(rrUv.y * 227.0);
vec2 rrCell = fract(rrUv * vec2(58.0, 34.0));
float rrSeam = max(1.0 - smoothstep(0.018, 0.055, rrCell.x), 1.0 - smoothstep(0.018, 0.055, rrCell.y));
float rrRoofMicro = 0.986 + 0.010 * rrGrain - 0.012 * rrSeam;
baseColor.rgb *= mix(1.0, rrRoofMicro, rrRoofMask * 0.78);
// Slightly soften the default mirror-like reflection on broad roof areas.
`;
    let out = source.replace(marker, injected);
    out = out.replace('float ambientCoefficient = 0.1;', 'float ambientCoefficient = 0.135;');
    out = out.replace('float specularLevel = 200.0 * specularTexLevel;', 'float specularLevel = 200.0 * specularTexLevel * mix(1.0, 0.62, rrRoofMask);');
    out = out.replace('float specularCoefficient = pow(max(dot(reflected, surfaceToCamera), 0.0), 50.0);', 'float specularCoefficient = pow(max(dot(reflected, surfaceToCamera), 0.0), mix(50.0, 34.0, rrRoofMask));');
    out = out.replace('float reflectionLevel = 0.2 * specularTexLevel;', 'float reflectionLevel = 0.2 * specularTexLevel * mix(1.0, 0.74, rrRoofMask);');
    return out;
  }

  function toggleBuildingShader(enable) {
    const g = getGeoFS();
    if (!g || !window.geofsShaders || typeof geofsShaders['buildingsFS.glsl'] !== 'string') throw new Error('GeoFSの建物GLSLが見つかりません');
    if (g.api.googleTileset) throw new Error('Google実写3Dでは標準建物シェーダーが使われません');
    captureOriginal();
    if (enable && !roofShaderBackupActive) {
      originalBuildingShader = geofsShaders['buildingsFS.glsl'];
      geofsShaders['buildingsFS.glsl'] = enhancedBuildingShader(originalBuildingShader);
      roofShaderBackupActive = true;
      state.buildingShader = true;
      rebuildBuildingsIfActive();
      lastMessage = 'GeoFS標準建物シェーダーに屋根面検出・微細な屋根目地・控えめな反射調整を追加しました';
    } else if (!enable && roofShaderBackupActive) {
      geofsShaders['buildingsFS.glsl'] = originalBuildingShader || original.buildingShader;
      roofShaderBackupActive = false;
      state.buildingShader = false;
      rebuildBuildingsIfActive();
      lastMessage = '建物シェーダーをGeoFS標準に戻しました';
    }
  }

  function applyAtmosphere(enable) {
    const g = getGeoFS();
    if (!g) throw new Error('GeoFSが見つかりません');
    captureOriginal();
    const prefs = g.preferences.graphics;
    prefs.advancedAtmosphere = !!enable;
    prefs.volumetricClouds = !!enable;
    g.api.renderingQuality(null, true);
    state.volumetricClouds = !!enable;
    if (typeof g.api.useNativeAtmosphere === 'function') g.api.useNativeAtmosphere(true);
    lastMessage = enable ? 'GeoFSの大気散乱・ボリューム雲設定を有効化しました' : 'ボリューム雲を停止しました（大気描画はGeoFS標準を維持）';
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
      viewer.shadowMap.softShadows = !!enable && !mobile;
      viewer.shadowMap.size = mobile ? 1024 : 3072;
      viewer.shadowMap.darkness = 0.34;
    }
    if (viewer.scene.globe && enable && g.api.setGlobeLighting) g.api.setGlobeLighting(true);
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
    setImageryProperty('brightness', 1.035);
    setImageryProperty('contrast', 1.055);
    setImageryProperty('saturation', 1.045);
    setImageryProperty('gamma', 1.015);
    state.brightness = 1.035;
    state.contrast = 1.055;
    state.saturation = 1.045;
    lastMessage = 'GeoFS航空写真を自然な明瞭度・コントラストに調整しました';
  }

  function setAtmosphereColorProfile() {
    const g = getGeoFS();
    if (!g || !g.api) return;
    if (typeof g.api.setAtmosphereColorModifier === 'function') {
      g.api.setAtmosphereColorModifier('geofs-msfs-v10', {
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
      name: 'geofs-msfs-v10-detail-sharpen',
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
      if (ionNativeBuildingsWasEnabled) g.api.setBuildings(true);
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
      removeRoadLayers(); removeRoofOverlay(); removeBuildingOutlines(); removeRoofEquipment(); removeFacadeDetails(); removeImportedFootprints(false);
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
    const counts = { bridges: 0, roads: 0, crossings: 0, railways: 0, roofs: 0, airports: 0, urbanAreas: 0, traffic: 0, trees: 0, barriers: 0, powerWays: 0, waterways: 0, streetObjects: 0, entrances: 0, manmadeWays: 0, trafficCalming: 0 };
    elements.forEach(el => {
      const t = el.tags || {};
      if (el.type === 'node' && t.highway === 'crossing') counts.crossings++;
      if (el.type === 'way' && t.highway) counts.roads++;
      if (el.type === 'way' && t.highway && t.bridge && !/^(no|false|0)$/.test(String(t.bridge))) counts.bridges++;
      if (el.type === 'way' && t.railway) counts.railways++;
      if (el.type === 'way' && (t.building || t['building:part']) && t['roof:shape']) counts.roofs++;
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
      console.warn('[GeoFS v10] GroundPolylinePrimitive failed; using entity fallback', error);
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
    roadFallbackSource = new C.CustomDataSource('GeoFS v10 OSM roads fallback');
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

  function roofColor(tags, C) {
    const raw = tags['roof:colour'] || tags['roof:color'] || tags['building:colour'] || tags['building:color'];
    if (raw) {
      const color = C.Color.fromCssColorString(String(raw));
      if (color) return color.withAlpha(1);
    }
    const mat = String(tags['roof:material'] || '').toLowerCase();
    const colors = {
      tile: '#a35e48', tiles: '#a35e48', clay: '#aa6349', terracotta: '#a75c42',
      metal: '#737b80', steel: '#778087', aluminium: '#93999c', aluminum: '#93999c',
      slate: '#555c63', shingles: '#665d55', asphalt: '#4c4e50',
      concrete: '#a5a39c', zinc: '#8c999c', copper: '#718a79',
      thatch: '#98814e', glass: '#748f91', wood: '#8a6b4e', solar_panels: '#283b50'
    };
    return C.Color.fromCssColorString(colors[mat] || '#8c8176');
  }

  function roofCandidate(el) {
    if (el.type !== 'way' || !el.tags || !(el.tags.building || el.tags['building:part']) || !el.tags['roof:shape'] || !Array.isArray(el.geometry) || el.geometry.length < 4) return null;
    const shape = String(el.tags['roof:shape']).toLowerCase();
    if (!['flat', 'gabled', 'hipped', 'pyramidal', 'skillion', 'saltbox', 'half-hipped', 'gambrel', 'mansard'].includes(shape)) return null;
    const ring = el.geometry.map(p => ({ lat: Number(p.lat), lon: Number(p.lon) })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (ring.length > 3 && Math.abs(ring[0].lat - ring[ring.length - 1].lat) < 1e-7 && Math.abs(ring[0].lon - ring[ring.length - 1].lon) < 1e-7) ring.pop();
    if (ring.length < 4 || ring.length > 32) return null;
    const origin = { lat: ring.reduce((s, p) => s + p.lat, 0) / ring.length, lon: ring.reduce((s, p) => s + p.lon, 0) / ring.length };
    const local = ring.map(p => localXY(p, origin));
    const rect = fitRectangle(local);
    if (!rect || rect.length < 4 || rect.width < 2.5 || rect.length > 180 || rect.width > 110) return null;
    let area = 0;
    for (let i = 0; i < local.length; i++) area += local[i].x * local[(i + 1) % local.length].y - local[(i + 1) % local.length].x * local[i].y;
    area = Math.abs(area) * 0.5;
    if (area < 8 || (rect.length * rect.width) / area > 1.30) return null; // Skip irregular footprints rather than inventing a roof.
    const levels = parseNumber(el.tags['building:levels'] || el.tags['building:part:levels']);
    const roofLevels = parseNumber(el.tags['roof:levels']);
    const taggedHeight = parsePositive(el.tags.height || el.tags['building:height']);
    if (!taggedHeight && !levels) return null; // No guessed building height.
    let roofHeight = parsePositive(el.tags['roof:height']);
    if (!roofHeight && roofLevels) roofHeight = roofLevels * 2.5;
    if (!roofHeight && el.tags['roof:angle']) {
      const angle = clamp(parseNumber(el.tags['roof:angle']) || 25, 5, 65) * Math.PI / 180;
      roofHeight = Math.tan(angle) * rect.width / 2;
    }
    if (!roofHeight) roofHeight = Math.max(0.8, Math.min(3.0, rect.width * 0.18));
    const totalHeight = taggedHeight || ((levels || 1) * 3.0 + roofHeight);
    const eaveHeight = Math.max(2.4, totalHeight - roofHeight);
    if (eaveHeight > 180 || roofHeight > 35) return null;
    if (String(el.tags['roof:orientation'] || '').toLowerCase() === 'across') {
      const u = rect.u; rect.u = rect.v; rect.v = { x: -u.x, y: -u.y };
      const tmp = rect.length; rect.length = rect.width; rect.width = tmp;
    }
    return { id: el.id, origin, rect, shape, roofHeight, eaveHeight, color: null, tags: el.tags };
  }

  function removeRoofOverlay() {
    const g = getGeoFS();
    if (roofPrimitive && g) safe(() => g.api.viewer.scene.primitives.remove(roofPrimitive));
    if (roofDetailSource && g) safe(() => g.api.viewer.dataSources.remove(roofDetailSource, true));
    roofPrimitive = null;
    roofDetailSource = null;
  }

  function removeImportedFootprints(clearData = false) {
    const g = getGeoFS();
    if (importedBuildingPrimitive && g) safe(() => g.api.viewer.scene.primitives.remove(importedBuildingPrimitive));
    if (importedRoofPrimitive && g) safe(() => g.api.viewer.scene.primitives.remove(importedRoofPrimitive));
    importedBuildingPrimitive = null;
    importedRoofPrimitive = null;
    importedBuildingCount = 0;
    if (clearData) importedBuildingFeatures = [];
  }

  function featureCenterAndRing(feature) {
    const geom = feature && feature.geometry;
    if (!geom || !['Polygon','MultiPolygon'].includes(geom.type) || !Array.isArray(geom.coordinates)) return null;
    const rings = geom.type === 'Polygon' ? [geom.coordinates[0]] : (geom.coordinates[0] ? [geom.coordinates[0][0]] : []);
    const raw = rings[0];
    if (!Array.isArray(raw) || raw.length < 4) return null;
    const ring = raw.map(p => ({lon:Number(p[0]),lat:Number(p[1])})).filter(p=>Number.isFinite(p.lon)&&Number.isFinite(p.lat));
    if (ring.length < 4) return null;
    const center = {lon:ring.reduce((a,p)=>a+p.lon,0)/ring.length,lat:ring.reduce((a,p)=>a+p.lat,0)/ring.length};
    return {ring,center};
  }

  async function loadBuildingFootprintPack(file) {
    if (!file) return 0;
    if (file.size > 60 * 1024 * 1024) throw new Error('GeoJSONパックは60MB以下にしてください。先に地域を小さく切り出してください');
    const text = await file.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch (_) { throw new Error('GeoJSONが読めません。Microsoft用変換ツールでFeatureCollectionへ変換してください'); }
    const features = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.features) ? parsed.features : null;
    if (!features) throw new Error('GeoJSON FeatureCollectionではありません');
    const valid = features.filter(feature => {
      const data = featureCenterAndRing(feature);
      const props = feature.properties || {};
      const h = Number(props.height ?? props.render_height ?? props.building_height ?? feature.height);
      const confidence = Number(props.confidence);
      return data && Number.isFinite(h) && h >= 2.5 && h <= 250 && (!Number.isFinite(confidence) || confidence < 0 || confidence >= 0.45);
    }).slice(0, 30000);
    if (!valid.length) throw new Error('有効な高さ付き建物がありません（heightが2.5〜250mのFeatureが必要）');
    importedBuildingFeatures = valid;
    await drawImportedFootprints();
    return importedBuildingCount;
  }

  async function drawImportedFootprints() {
    const g = getGeoFS(); const C = getCesium();
    if (!g || !C) return 0;
    removeImportedFootprints(false);
    if (!importedBuildingFeatures.length || g.api.googleTileset || !C.PolygonGeometry || !C.Primitive || !C.PerInstanceColorAppearance) return 0;
    const camera = currentCamera();
    const radius = camera.altitude < 700 ? 1500 : camera.altitude < 2200 ? 2600 : 4600;
    const existingOsmCenters = osmElements.filter(el=>el.type==='way'&&el.tags&&(el.tags.building||el.tags['building:part'])&&Array.isArray(el.geometry)&&el.geometry.length>=4).map(el=>({lat:el.geometry.reduce((a,p)=>a+Number(p.lat||0),0)/el.geometry.length,lon:el.geometry.reduce((a,p)=>a+Number(p.lon||0),0)/el.geometry.length}));
    const selected = [];
    for (const feature of importedBuildingFeatures) {
      const data = featureCenterAndRing(feature);
      if (!data) continue;
      const dLat = (data.center.lat-camera.lat)*111320;
      const dLon = (data.center.lon-camera.lon)*111320*Math.cos(camera.lat*Math.PI/180);
      const duplicate = existingOsmCenters.some(center => { const dy=(center.lat-data.center.lat)*111320; const dx=(center.lon-data.center.lon)*111320*Math.cos(data.center.lat*Math.PI/180); return Math.hypot(dx,dy)<8; });
      if (!duplicate && Math.hypot(dLat,dLon) <= radius) selected.push({feature,...data});
      if (selected.length >= (mobile ? 320 : 1150)) break;
    }
    if (!selected.length) return 0;
    const cartos = selected.map(item => C.Cartographic.fromDegrees(item.center.lon,item.center.lat));
    let samples = [];
    try { if (C.sampleTerrain && g.api.viewer.terrainProvider) samples = await C.sampleTerrain(g.api.viewer.terrainProvider, 12, cartos); } catch (_) {}
    const walls = [], roofs = [];
    selected.forEach((item,i) => {
      const props = item.feature.properties || {};
      const height = Number(props.height ?? props.render_height ?? props.building_height ?? item.feature.height);
      if (!Number.isFinite(height) || height < 2.5 || height > 250) return;
      let ring = item.ring;
      if (ring.length > 52) ring = ring.filter((_,j)=>j%Math.ceil(ring.length/52)===0);
      if (ring.length < 4) return;
      const areaOrigin = item.center;
      const local = ring.map(p=>localXY(p,areaOrigin));
      let area=0; for(let j=0;j<local.length;j++) area += local[j].x*local[(j+1)%local.length].y-local[(j+1)%local.length].x*local[j].y;
      area=Math.abs(area)*0.5;
      if (area<10 || area>12000) return;
      const hierarchy = new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(ring.flatMap(p=>[p.lon,p.lat])));
      let ground = samples[i] && Number.isFinite(samples[i].height) ? samples[i].height : safe(()=>g.api.viewer.scene.globe.getHeight(cartos[i]));
      if (!Number.isFinite(ground)) return;
      const minHeight = Math.max(0,Number(props.min_height)||0);
      const topHeight = ground + minHeight + height;
      const alpha = 1.0;
      const shade = clamp(0.76 + Math.log1p(area)*0.018,0.76,0.96);
      const wallColor = new C.Color(shade*0.88,shade*0.86,shade*0.82,alpha);
      const roofColorValue = new C.Color(shade*0.96,shade*0.93,shade*0.88,1);
      try {
        const wallGeometry = new C.PolygonGeometry({polygonHierarchy:hierarchy,height:ground+minHeight,extrudedHeight:topHeight,vertexFormat:C.PerInstanceColorAppearance.VERTEX_FORMAT,granularity:C.Math.RADIANS_PER_DEGREE/500});
        walls.push(new C.GeometryInstance({id:`geofs-v10-ml-footprint-${i}`,geometry:wallGeometry,attributes:{color:C.ColorGeometryInstanceAttribute.fromColor(wallColor)}}));
        const roofGeometry = new C.PolygonGeometry({polygonHierarchy:hierarchy,height:topHeight+0.12,vertexFormat:C.PerInstanceColorAppearance.VERTEX_FORMAT,granularity:C.Math.RADIANS_PER_DEGREE/500});
        roofs.push(new C.GeometryInstance({id:`geofs-v10-ml-roof-${i}`,geometry:roofGeometry,attributes:{color:C.ColorGeometryInstanceAttribute.fromColor(roofColorValue)}}));
      } catch (_) {}
    });
    if (walls.length) importedBuildingPrimitive = g.api.viewer.scene.primitives.add(new C.Primitive({geometryInstances:walls,appearance:new C.PerInstanceColorAppearance({flat:false,translucent:false,closed:true}),asynchronous:true,compressVertices:true,allowPicking:false,releaseGeometryInstances:true}));
    if (roofs.length) importedRoofPrimitive = g.api.viewer.scene.primitives.add(new C.Primitive({geometryInstances:roofs,appearance:new C.PerInstanceColorAppearance({flat:true,translucent:false,closed:false}),asynchronous:true,compressVertices:true,allowPicking:false,releaseGeometryInstances:true}));
    importedBuildingCount = walls.length;
    requestRender();
    return importedBuildingCount;
  }

  async function drawRoofOverlay() {
    const g = getGeoFS();
    const C = getCesium();
    if (!g || !C) throw new Error('GeoFS/Cesiumが見つかりません');
    removeRoofOverlay();
    if (!state.roofs || g.api.googleTileset) return 0;
    const max = mobile ? 28 : 92;
    const candidates = osmElements.map(roofCandidate).filter(Boolean).slice(0, max);
    if (!candidates.length) return 0;
    const centers = candidates.map(c => C.Cartographic.fromDegrees(c.origin.lon, c.origin.lat));
    let samples = [];
    try {
      if (C.sampleTerrain && g.api.viewer.terrainProvider) samples = await C.sampleTerrain(g.api.viewer.terrainProvider, 12, centers);
    } catch (_) { samples = []; }
    const instances = [];
    roofDetailSource = new C.CustomDataSource('GeoFS v10 roof material seams');
    let roofLineCount = 0;
    const maxRoofLines = mobile ? 150 : 420;
    let renderedRoofs = 0;
    const makePosition = (c, x, y, z, ground) => {
      const east = c.rect.center.x + c.rect.u.x * x + c.rect.v.x * y;
      const north = c.rect.center.y + c.rect.u.y * x + c.rect.v.y * y;
      const lat = c.origin.lat + north / EARTH_RADIUS * 180 / Math.PI;
      const lon = c.origin.lon + east / (EARTH_RADIUS * Math.max(0.15, Math.cos(c.origin.lat * Math.PI / 180))) * 180 / Math.PI;
      return C.Cartesian3.fromDegrees(lon, lat, ground + z);
    };
    const addRoofLine = (c, ground, a, b, id, color, width = 0.85) => {
      if (roofLineCount >= maxRoofLines) return;
      try {
        roofDetailSource.entities.add({ id, polyline: {
          positions: [makePosition(c, a.x, a.y, a.z + 0.06, ground), makePosition(c, b.x, b.y, b.z + 0.06, ground)],
          width, material: color, arcType: C.ArcType.NONE
        }});
        roofLineCount++;
      } catch (_) {}
    };
    candidates.forEach((c, i) => {
      let ground = samples[i] && samples[i].height;
      if (!Number.isFinite(ground)) ground = safe(() => g.api.viewer.scene.globe.getHeight(centers[i]));
      if (!Number.isFinite(ground)) return;
      c.color = roofColor(c.tags, C);
      const L = c.rect.length / 2, W = c.rect.width / 2;
      const e = c.eaveHeight + 0.28;
      const r = c.eaveHeight + c.roofHeight + 0.40;
      const A = { x: -L, y: -W, z: e };
      const B = { x: L, y: -W, z: e };
      const D = { x: -L, y: W, z: e };
      const E = { x: L, y: W, z: e };
      let faces = [];
      const ridge1 = { x: -L, y: 0, z: r };
      const ridge2 = { x: L, y: 0, z: r };
      if (c.shape === 'flat') {
        faces = [[A, B, E, D]];
      } else if (c.shape === 'gabled') {
        faces = [[A, B, ridge2, ridge1], [ridge1, ridge2, E, D]];
      } else if (c.shape === 'saltbox') {
        ridge1.y = -W * 0.18; ridge2.y = -W * 0.18;
        faces = [[A, B, ridge2, ridge1], [ridge1, ridge2, E, D]];
      } else if (c.shape === 'skillion') {
        faces = [[A, B, E, D].map((p, k) => ({ ...p, z: (k < 2 ? e : r) }))];
      } else if (c.shape === 'pyramidal') {
        const top = { x: 0, y: 0, z: r };
        faces = [[A, B, top], [B, E, top], [E, D, top], [D, A, top]];
      } else if (c.shape === 'hipped' || c.shape === 'half-hipped') {
        const inset = Math.min(L * (c.shape === 'hipped' ? 0.72 : 0.48), W * 0.95);
        const r1 = { x: -L + inset, y: 0, z: r };
        const r2 = { x: L - inset, y: 0, z: r };
        faces = [[A, B, r2, r1], [r1, r2, E, D], [A, D, r1], [B, E, r2]];
      } else if (c.shape === 'mansard') {
        const ix = L * 0.48, iy = W * 0.45, zMid = e + c.roofHeight * 0.58;
        const a = { x: -L + ix, y: -W + iy, z: zMid };
        const b = { x: L - ix, y: -W + iy, z: zMid };
        const d = { x: -L + ix, y: W - iy, z: zMid };
        const f = { x: L - ix, y: W - iy, z: zMid };
        const g = { x: -L + ix, y: 0, z: r };
        const h = { x: L - ix, y: 0, z: r };
        faces = [[A, B, b, a], [a, b, h, g], [g, h, f, d], [d, f, E, D], [A, D, d, a], [B, E, f, b]];
      } else if (c.shape === 'gambrel') {
        const y1 = -W * 0.48, y2 = W * 0.48;
        const zMid = e + c.roofHeight * 0.55;
        const a1 = { x: -L, y: y1, z: zMid }, b1 = { x: L, y: y1, z: zMid };
        const a2 = { x: -L, y: y2, z: zMid }, b2 = { x: L, y: y2, z: zMid };
        const g1 = { x: -L, y: 0, z: r }, g2 = { x: L, y: 0, z: r };
        faces = [[A, B, b1, a1], [a1, b1, g2, g1], [g1, g2, b2, a2], [a2, b2, E, D]];
      }
      const beforeFaces = instances.length;
      faces.forEach((face, fi) => {
        const positions = face.map(p => makePosition(c, p.x, p.y, p.z, ground));
        try {
          const geometry = new C.PolygonGeometry({
            polygonHierarchy: new C.PolygonHierarchy(positions),
            perPositionHeight: true,
            vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT
          });
          const shade = 0.92 + (fi % 3) * 0.035;
          const color = new C.Color(c.color.red * shade, c.color.green * shade, c.color.blue * shade, 1);
          instances.push(new C.GeometryInstance({
            id: `geofs-v10-roof-${c.id}-${fi}`,
            geometry,
            attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(color) }
          }));
        } catch (_) {}
      });
      if (instances.length > beforeFaces) renderedRoofs++;
      // Material-specific micro detail, only when OSM provides an explicit roof material.
      const material = String(c.tags['roof:material'] || '').toLowerCase();
      const tileLike = /tile|tiles|clay|terracotta|shingle|slate|thatch/.test(material);
      const metalLike = /metal|steel|aluminium|aluminum|zinc|copper/.test(material);
      if ((tileLike || metalLike) && ['gabled','skillion'].includes(c.shape) && roofLineCount < maxRoofLines) {
        const seamColor = C.Color.fromCssColorString(tileLike ? '#4c3a32' : '#d2d8da').withAlpha(tileLike ? 0.32 : 0.42);
        if (metalLike && c.shape === 'gabled') {
          // Standing seams run from eaves to ridge.
          const step = Math.max(0.9, Math.min(1.45, c.rect.length / 14));
          for (let x = -L + 0.75; x < L - 0.5 && roofLineCount < maxRoofLines; x += step) {
            addRoofLine(c, ground, {x,y:-W,z:e}, {x,y:0,z:r}, `geofs-v10-metal-seam-${c.id}-${Math.round((x+L)*10)}`, seamColor, 0.72);
            if (c.shape !== 'skillion') addRoofLine(c, ground, {x,y:0,z:r}, {x,y:W,z:e}, `geofs-v10-metal-seam-r-${c.id}-${Math.round((x+L)*10)}`, seamColor, 0.72);
          }
        } else {
          // Subtle horizontal courses suggest roof tile/shingle rows without inventing a texture map.
          const step = tileLike ? 0.42 : 0.7;
          for (let y = -W + step; y < W - 0.2 && roofLineCount < maxRoofLines; y += step) {
            const ratio = c.shape === 'skillion' ? clamp((y + W) / (2 * W), 0, 1) : Math.max(0, 1 - Math.abs(y) / W);
            const z = e + c.roofHeight * ratio;
            addRoofLine(c, ground, {x:-L+0.25,y,z}, {x:L-0.25,y,z}, `geofs-v10-roof-course-${c.id}-${Math.round((y+W)*100)}`, seamColor, tileLike ? 0.62 : 0.55);
          }
        }
      }
    });
    if (!instances.length) { roofDetailSource = null; return 0; }
    roofPrimitive = g.api.viewer.scene.primitives.add(new C.Primitive({
      geometryInstances: instances,
      appearance: new C.PerInstanceColorAppearance({ flat: false, translucent: false, closed: false }),
      asynchronous: true,
      compressVertices: true,
      allowPicking: false,
      releaseGeometryInstances: true
    }));
    if (roofDetailSource && roofDetailSource.entities.values.length) g.api.viewer.dataSources.add(roofDetailSource);
    else roofDetailSource = null;
    requestRender();
    return renderedRoofs;
  }

  async function redrawOsmLayers() {
    await redrawRoadsAndTransportImpl();
    await drawRoadSurfaceAndAirport();
    if (state.roofs) await drawRoofOverlay();
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
    await drawImportedFootprints();
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
        id: id || `geofs-v10-corridor-${instances.length}`,
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
      console.warn('[GeoFS MSFS Realism v10] Ground fill creation failed', error);
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
        id: id || `geofs-v10-area-${instances.length}`,
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
      if (addGroundPolygonInstance(C, instances, path, color, `geofs-v10-urban-${el.id}`)) count++;
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
    parkingMarkSource = new C.CustomDataSource('GeoFS v10 parking bay markings');
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
      addLine({x:-halfL,y:0},{x:halfL,y:0},`geofs-v10-parking-aisle-${el.id}`);
      const slotPitch = 2.55;
      for (let x = -halfL + slotPitch; x < halfL && lines < maxLines; x += slotPitch) {
        addLine({x,y:aisleHalf},{x,y:halfW},`geofs-v10-parking-n-${el.id}-${Math.round((x+halfL)/slotPitch)}`);
        addLine({x,y:-aisleHalf},{x,y:-halfW},`geofs-v10-parking-s-${el.id}-${Math.round((x+halfL)/slotPitch)}`);
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
      source.entities.add({ id:`geofs-v10-helipad-${way.id}`, position:C.Cartesian3.fromDegrees(centroid.lon,centroid.lat,1.2), label:{text:String(tags.ref || 'H'),font:'bold 22px sans-serif',fillColor:C.Color.WHITE,outlineColor:C.Color.BLACK,outlineWidth:3,style:C.LabelStyle.FILL_AND_OUTLINE,horizontalOrigin:C.HorizontalOrigin.CENTER,verticalOrigin:C.VerticalOrigin.CENTER} });
      return;
    }
    if (kind === 'taxiway') {
      source.entities.add({ id: `geofs-v10-taxi-${way.id}`, polyline: {
        positions, clampToGround: true, classificationType: C.ClassificationType.BOTH, width: 2.3,
        material: C.Color.fromCssColorString('#f2c742').withAlpha(0.9)
      }});
      return;
    }
    if (kind !== 'runway') return;
    const length = pathLengthMeters(center);
    source.entities.add({ id: `geofs-v10-runway-center-${way.id}`, polyline: {
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
        source.entities.add({ id: `geofs-v10-threshold-${way.id}-${endIndex}-${i}`, polyline: {
          positions: positionsFromPath(C, [a, b]), clampToGround: true, classificationType: C.ClassificationType.BOTH,
          width: 3.1, material: C.Color.WHITE.withAlpha(0.86)
        }});
      }
      if (length > 1500) {
        const aim = destination(p, h, Math.min(300, length * 0.24));
        [-1, 1].forEach(side => {
          const a = destination(aim, h + Math.PI / 2, side * 8 - 22);
          const b = destination(aim, h + Math.PI / 2, side * 8 + 22);
          source.entities.add({ id: `geofs-v10-aim-${way.id}-${endIndex}-${side}`, polyline: {
            positions: positionsFromPath(C, [a, b]), clampToGround: true, classificationType: C.ClassificationType.BOTH,
            width: 5.0, material: C.Color.WHITE.withAlpha(0.80)
          }});
        });
      }
      const refs = String(tags.ref || '').split(/[\/;]/).map(x => x.trim()).filter(Boolean);
      const labelText = refs.length >= 2 ? refs[endIndex === 0 ? 0 : 1] : (refs[0] || '');
      if (labelText) {
        const labelPos = destination(p, h, 95);
        source.entities.add({ id: `geofs-v10-runway-label-${way.id}-${endIndex}`, position: C.Cartesian3.fromDegrees(labelPos.lon, labelPos.lat, 1.5), label: {
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
          if (isClosedOsmRing(path)) addGroundPolygonInstance(C, roadInstances, path, pavementColor, `geofs-v10-road-area-${el.id}`);
          else {
            addCorridorInstance(C, roadInstances, path, style.width + (detail ? 2.0 : 1.0), shoulderColor, `geofs-v10-road-shoulder-${el.id}`);
            addCorridorInstance(C, roadInstances, path, style.width, pavementColor, `geofs-v10-road-surface-${el.id}`);
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
          addGroundPolygonInstance(C, airportInstances, path, color, `geofs-v10-airport-area-${el.id}`);
        } else if (kind !== 'helipad') {
          addCorridorInstance(C, airportInstances, path, width + 3.5, shoulder, `geofs-v10-airport-edge-${el.id}`);
          addCorridorInstance(C, airportInstances, path, width, color, `geofs-v10-airport-surface-${el.id}`);
        }
        airportCount++;
      }
    });
    roadSurfacePrimitive = addGroundFillPrimitive(C, scene, roadInstances);
    airportSurfacePrimitive = addGroundFillPrimitive(C, scene, airportInstances);
    if (state.airportSurface && C.CustomDataSource) {
      airportMarkSource = new C.CustomDataSource('GeoFS v10 airport markings');
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
          airportMarkSource.entities.add({ id:`geofs-v10-hold-short-${node.id||i}-${j}`, polyline:{positions:positionsFromPath(C,[a,b]),clampToGround:true,classificationType:C.ClassificationType.BOTH,width:2.8,material:j===0?yellow:new C.PolylineDashMaterialProperty({color:yellow,gapColor:C.Color.TRANSPARENT,dashLength:4})} });
        });
      });
      // Only map-authored aeroway lighting is displayed; no invented runway-light layout.
      const airLights = osmElements.filter(el => el.type === 'node' && el.tags && /^(light|beacon|runway_end|approach_light|taxiway_light|papi)$/.test(String(el.tags.aeroway || '')) && Number.isFinite(Number(el.lat)) && Number.isFinite(Number(el.lon)));
      airLights.slice(0, mobile ? 16 : 54).forEach((node, i) => {
        const col = String(node.tags['light:colour'] || node.tags.colour || '').toLowerCase();
        const color = node.tags.aeroway === 'beacon' ? '#d9574f' : node.tags.aeroway === 'papi' ? (i % 2 ? '#d9574f' : '#f1e8c7') : node.tags.aeroway === 'taxiway_light' ? '#48a878' : (/blue/.test(col) ? '#4c8bdb' : /green/.test(col) ? '#48a878' : /red/.test(col) ? '#d9574f' : '#f1e8c7');
        airportMarkSource.entities.add({ id:`geofs-v10-aeroway-light-${node.id||i}`, position:C.Cartesian3.fromDegrees(Number(node.lon),Number(node.lat),groundAt(C,g,Number(node.lat),Number(node.lon))+0.35), ellipsoid:{radii:new C.Cartesian3(0.42,0.42,0.22),material:C.Color.fromCssColorString(color).withAlpha(0.92),outline:false} });
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
    buildingOutlineSource = new C.CustomDataSource('GeoFS v10 building footprints');
    const max = mobile ? 80 : 240;
    let count = 0;
    osmElements.forEach(el => {
      if (count >= max || el.type !== 'way' || !el.tags || !(el.tags.building || el.tags['building:part']) || !Array.isArray(el.geometry)) return;
      const path = el.geometry.map(p => ({ lat: Number(p.lat), lon: Number(p.lon) })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      if (path.length < 4) return;
      const points = path.map(p => C.Cartesian3.fromDegrees(p.lon, p.lat));
      buildingOutlineSource.entities.add({ id: `geofs-v10-footprint-${el.id}`, polyline: {
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
    roofEquipmentSource = new C.CustomDataSource('GeoFS v10 rooftop equipment');
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
        id: `geofs-v10-roof-fixture-${el.id || i}`,
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
              instances.push(new C.GeometryInstance({ id: `geofs-v10-solar-${c.id}-${row}-${col}`, geometry, attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString('#26394d').withAlpha(0.96)) } }));
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
              instances.push(new C.GeometryInstance({id:`geofs-v10-window-${el.id}-${ei}-${f}-${k}`,geometry,attributes:{color:C.ColorGeometryInstanceAttribute.fromColor(glass)}}));
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
    trafficSource=new C.CustomDataSource('GeoFS v10 traffic furniture');
    const nodes=osmElements.filter(el=>el.type==='node'&&el.tags&&Number.isFinite(Number(el.lat))&&Number.isFinite(Number(el.lon))&&(el.tags.highway==='traffic_signals'||el.tags.highway==='street_lamp'||el.tags.man_made==='street_lamp'||el.tags.highway==='stop'||el.tags.highway==='give_way'));
    let count=0;
    nodes.slice(0,mobile?22:72).forEach((el,i)=>{
      const tags=el.tags||{}; const kind=tags.highway||tags.man_made||'';
      const lat=Number(el.lat),lon=Number(el.lon); const carto=C.Cartographic.fromDegrees(lon,lat);
      let ground=safe(()=>g.api.viewer.scene.globe.getHeight(carto)); if(!Number.isFinite(ground))ground=0;
      if(kind==='traffic_signals'){
        const h=parsePositive(tags.height)||4.6;
        trafficSource.entities.add({id:`geofs-v10-signal-pole-${el.id||i}`,position:C.Cartesian3.fromDegrees(lon,lat,ground+h/2),cylinder:{length:h,topRadius:0.07,bottomRadius:0.09,material:C.Color.fromCssColorString('#45484b')}});
        ['#df514b','#e5b94f','#4f9b68'].forEach((col,j)=>trafficSource.entities.add({id:`geofs-v10-signal-${el.id||i}-${j}`,position:C.Cartesian3.fromDegrees(lon,lat,ground+h-0.55-j*0.29),ellipsoid:{radii:new C.Cartesian3(0.105,0.105,0.105),material:C.Color.fromCssColorString(col),outline:true,outlineColor:C.Color.BLACK.withAlpha(0.5)}}));
      } else if(kind==='street_lamp'||kind==='stop'||kind==='give_way'){
        const h=parsePositive(tags.height)||(kind==='street_lamp'?6.2:2.2);
        trafficSource.entities.add({id:`geofs-v10-road-fixture-${el.id||i}`,position:C.Cartesian3.fromDegrees(lon,lat,ground+h/2),cylinder:{length:h,topRadius:kind==='street_lamp'?0.055:0.045,bottomRadius:0.08,material:C.Color.fromCssColorString('#5d6265')}});
        if(kind==='street_lamp') trafficSource.entities.add({id:`geofs-v10-lamp-head-${el.id||i}`,position:C.Cartesian3.fromDegrees(lon,lat,ground+h),ellipsoid:{radii:new C.Cartesian3(0.28,0.16,0.12),material:C.Color.fromCssColorString('#d4d1b5').withAlpha(0.86)}});
        else trafficSource.entities.add({id:`geofs-v10-sign-${el.id||i}`,position:C.Cartesian3.fromDegrees(lon,lat,ground+h+0.18),box:{dimensions:new C.Cartesian3(0.65,0.08,0.65),material:C.Color.fromCssColorString(kind==='stop'?'#c43d36':'#e4e1d8')}});
      }
      count++;
    });
    if(count)g.api.viewer.dataSources.add(trafficSource); else trafficSource=null;
    requestRender();
    return count;
  }

  // ---------- World-detail expansion v10 ----------

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
      id: `geofs-v10-tree-trunk-${key}`,
      position: C.Cartesian3.fromDegrees(lon, lat, ground + trunkH / 2),
      cylinder: { length: trunkH, topRadius: Math.max(0.08, crownR * 0.12), bottomRadius: Math.max(0.10, crownR * 0.16), material: C.Color.fromCssColorString('#65513d'), outline: false }
    });
    if (evergreen) {
      source.entities.add({
        id: `geofs-v10-tree-crown-${key}`,
        position: C.Cartesian3.fromDegrees(lon, lat, ground + trunkH + canopyH * 0.48),
        cylinder: { length: canopyH, topRadius: 0.05, bottomRadius: crownR, material: color, outline: false }
      });
    } else {
      source.entities.add({
        id: `geofs-v10-tree-crown-${key}`,
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
    greenSource = new C.CustomDataSource('GeoFS v10 vegetation detail');
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
            greenSource.entities.add({ id: `geofs-v10-hedge-${row.id}-${i}-${j}`, position: C.Cartesian3.fromDegrees(p.lon, p.lat, ground + 0.85), ellipsoid: { radii: new C.Cartesian3(1.65, 1.15, 0.95), material: C.Color.fromCssColorString('#55764b'), outline: false } });
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
    barrierSource = new C.CustomDataSource('GeoFS v10 walls and fences');
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
          barrierSource.entities.add({ id:`geofs-v10-barrier-post-${way.id}-${i}`, position:C.Cartesian3.fromDegrees(p.lon,p.lat,ground+height/2), cylinder:{ length:height, topRadius:isBollard?0.08:0.055, bottomRadius:isBollard?0.11:0.07, material:C.Color.fromCssColorString(isBollard?'#737c80':'#d2b957') } });
        });
        if (kind === 'gate' || kind === 'lift_gate' || kind === 'swing_gate') {
          const top = path.filter((_,i) => i % Math.max(1,Math.ceil(path.length/20))===0).map(p => C.Cartesian3.fromDegrees(p.lon,p.lat,groundAt(C,g,p.lat,p.lon)+height));
          if (top.length > 1) barrierSource.entities.add({ id:`geofs-v10-barrier-gate-${way.id}`, polyline:{ positions:top,width:2.0,material:C.Color.fromCssColorString('#d0b65a').withAlpha(0.8),arcType:C.ArcType.NONE } });
        }
        count++;
        continue;
      }
      const groundPositions = positionsFromPath(C, path);
      barrierSource.entities.add({
        id: `geofs-v10-barrier-base-${way.id}`,
        polyline: { positions: groundPositions, clampToGround: true, width: kind === 'guard_rail' ? 2.0 : 1.25, material: color.withAlpha(0.64), classificationType: C.ClassificationType.BOTH }
      });
      if (kind !== 'guard_rail' && kind !== 'handrail') {
        const maxPts = path.length > 35 ? path.filter((_,i) => i % Math.ceil(path.length / 35) === 0) : path;
        const heights = maxPts.map(p => groundAt(C, g, p.lat, p.lon));
        barrierSource.entities.add({
          id: `geofs-v10-barrier-wall-${way.id}`,
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
        barrierSource.entities.add({ id: `geofs-v10-barrier-top-${way.id}`, polyline: { positions: topPositions, width: kind === 'guard_rail' ? 2.0 : 1.1, material: color.withAlpha(0.9), arcType: C.ArcType.NONE } });
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
    powerSource = new C.CustomDataSource('GeoFS v10 electric network');
    const poleNodes = osmElements.filter(el => el.type === 'node' && el.tags && /^((pole)|(tower))$/.test(String(el.tags.power || '')) && Number.isFinite(Number(el.lat)) && Number.isFinite(Number(el.lon)));
    let count = 0;
    poleNodes.slice(0, mobile ? 18 : 56).forEach((node, i) => {
      const lat = Number(node.lat), lon = Number(node.lon), tags = node.tags || {};
      const ground = groundAt(C, g, lat, lon);
      const tower = tags.power === 'tower';
      const h = clamp(parsePositive(tags.height) || (tower ? 24 : 9), tower ? 10 : 5, tower ? 55 : 18);
      const radius = tower ? 0.34 : 0.14;
      const steel = C.Color.fromCssColorString(tower ? '#777d80' : '#6b6559');
      powerSource.entities.add({ id: `geofs-v10-power-pole-${node.id || i}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + h / 2), cylinder: { length: h, topRadius: radius * 0.70, bottomRadius: radius, material: steel, outline: false } });
      if (tower) {
        [0.70, 0.82].forEach((z, j) => powerSource.entities.add({ id: `geofs-v10-power-arm-${node.id || i}-${j}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + h * z), box: { dimensions: new C.Cartesian3(8.0 - j * 1.6, 0.25, 0.25), material: steel } }));
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
          powerSource.entities.add({ id: `geofs-v10-wire-${way.id}-${i}-${wi}`, polyline: { positions: coords, width: 1.15, material: C.Color.fromCssColorString('#3e4447').withAlpha(0.72), arcType: C.ArcType.NONE } });
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
      addCorridorInstance(C, instances, path, width, tint, `geofs-v10-waterway-${way.id}`);
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
    streetObjectSource = new C.CustomDataSource('GeoFS v10 street-level objects');
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
        streetObjectSource.entities.add({ id: `geofs-v10-hydrant-${id}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + 0.42), cylinder: { length: 0.84, topRadius: 0.13, bottomRadius: 0.19, material: C.Color.fromCssColorString('#c44235') } });
        streetObjectSource.entities.add({ id: `geofs-v10-hydrant-cap-${id}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + 0.78), ellipsoid: { radii: new C.Cartesian3(0.18,0.18,0.12), material: C.Color.fromCssColorString('#d34b3d') } });
      } else if (tags.amenity === 'bench') {
        streetObjectSource.entities.add({ id: `geofs-v10-bench-${id}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + 0.34), box: { dimensions: new C.Cartesian3(1.55,0.42,0.12), material: C.Color.fromCssColorString('#87694e') } });
        streetObjectSource.entities.add({ id: `geofs-v10-bench-back-${id}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + 0.68), box: { dimensions: new C.Cartesian3(1.55,0.10,0.62), material: C.Color.fromCssColorString('#755b45') } });
      } else if (tags.amenity === 'bicycle_parking') {
        streetObjectSource.entities.add({ id: `geofs-v10-bike-rack-${id}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + 0.45), cylinder: { length: 0.9, topRadius: 0.035, bottomRadius: 0.035, material: C.Color.fromCssColorString('#737c82') } });
      } else if (tags.amenity === 'waste_basket' || tags.amenity === 'waste_disposal') {
        streetObjectSource.entities.add({ id: `geofs-v10-bin-${id}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + 0.48), cylinder: { length: 0.96, topRadius: 0.25, bottomRadius: 0.30, material: C.Color.fromCssColorString('#66716c') } });
      } else if (tags.amenity === 'drinking_water') {
        streetObjectSource.entities.add({ id: `geofs-v10-drink-${id}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + 0.45), cylinder: { length: 0.9, topRadius: 0.10, bottomRadius: 0.13, material: C.Color.fromCssColorString('#8b999f') } });
      } else if (tags.amenity === 'post_box') {
        streetObjectSource.entities.add({ id:`geofs-v10-postbox-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+0.62), box:{ dimensions:new C.Cartesian3(0.48,0.42,1.24), material:C.Color.fromCssColorString('#bd3e36') } });
      } else if (tags.amenity === 'telephone') {
        streetObjectSource.entities.add({ id:`geofs-v10-phone-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+1.05), box:{ dimensions:new C.Cartesian3(0.62,0.52,2.1), material:C.Color.fromCssColorString('#5a7372') } });
      } else if (tags.amenity === 'recycling' || tags.amenity === 'waste_basket' || tags.amenity === 'waste_disposal') {
        streetObjectSource.entities.add({ id:`geofs-v10-recycle-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+0.50), cylinder:{ length:1.0,topRadius:0.24,bottomRadius:0.30,material:C.Color.fromCssColorString('#5b8270') } });
      } else if (tags.amenity === 'vending_machine') {
        streetObjectSource.entities.add({ id:`geofs-v10-vending-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+0.92), box:{ dimensions:new C.Cartesian3(0.78,0.66,1.84), material:C.Color.fromCssColorString('#b9c2c2') } });
      } else if (tags.amenity === 'toilets') {
        streetObjectSource.entities.add({ id:`geofs-v10-toilet-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+1.25), box:{ dimensions:new C.Cartesian3(1.3,1.1,2.5), material:C.Color.fromCssColorString('#d8d3c9') } });
      } else if (tags.amenity === 'parking_entrance' || tags.amenity === 'bus_station') {
        streetObjectSource.entities.add({ id:`geofs-v10-station-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+1.3), box:{ dimensions:new C.Cartesian3(1.2,0.55,2.6), material:C.Color.fromCssColorString('#4c718b') } });
      } else if (tags.tourism === 'information') {
        streetObjectSource.entities.add({ id:`geofs-v10-info-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+1.0), box:{ dimensions:new C.Cartesian3(0.72,0.10,1.45), material:C.Color.fromCssColorString('#3f7197') } });
      } else if (tags.traffic_calming) {
        streetObjectSource.entities.add({ id:`geofs-v10-calming-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+0.07), ellipsoid:{ radii:new C.Cartesian3(2.4,1.2,0.10), material:C.Color.fromCssColorString('#b9a98c').withAlpha(0.75) } });
      } else if (/^(bollard|gate|lift_gate|swing_gate|cycle_barrier)$/.test(String(tags.barrier || ''))) {
        const gate = /gate/.test(String(tags.barrier));
        streetObjectSource.entities.add({ id:`geofs-v10-barrier-node-post-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+(gate?0.68:0.46)), cylinder:{ length:gate?1.36:0.92,topRadius:gate?0.055:0.08,bottomRadius:0.10,material:C.Color.fromCssColorString(gate?'#d1b45a':'#7b8588') } });
        if (gate) streetObjectSource.entities.add({ id:`geofs-v10-barrier-node-arm-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+1.25), box:{ dimensions:new C.Cartesian3(2.6,0.11,0.12),material:C.Color.fromCssColorString('#d8bf70') } });
      } else if (tags.entrance) {
        streetObjectSource.entities.add({ id:`geofs-v10-entrance-${id}`, position:C.Cartesian3.fromDegrees(lon,lat,ground+0.35), box:{ dimensions:new C.Cartesian3(0.8,0.20,0.7), material:C.Color.fromCssColorString('#a18b69').withAlpha(0.8) } });
      } else if (tags.highway === 'bus_stop') {
        streetObjectSource.entities.add({ id: `geofs-v10-bus-pole-${id}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + 1.35), cylinder: { length: 2.7, topRadius: 0.045, bottomRadius: 0.055, material: C.Color.fromCssColorString('#5b646b') } });
        streetObjectSource.entities.add({ id: `geofs-v10-bus-sign-${id}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + 2.35), box: { dimensions: new C.Cartesian3(0.42,0.08,0.52), material: C.Color.fromCssColorString('#3974a4') } });
      } else if (tags.barrier === 'bollard') {
        streetObjectSource.entities.add({ id: `geofs-v10-bollard-${id}`, position: C.Cartesian3.fromDegrees(lon, lat, ground + 0.48), cylinder: { length: 0.96, topRadius: 0.075, bottomRadius: 0.10, material: C.Color.fromCssColorString('#d3b74f') } });
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
    bridgeSource = new C.CustomDataSource('GeoFS v10 bridge decks and supports');
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
        bridgeSource.entities.add({ id:`geofs-v10-bridge-pier-${way.id}-${j}`, position:C.Cartesian3.fromDegrees(pt.lon,pt.lat,ground+deckHeight/2), cylinder:{ length:deckHeight, topRadius:0.46, bottomRadius:0.62, material:C.Color.fromCssColorString('#858680').withAlpha(0.88), outline:false } });
        bridgeSource.entities.add({ id:`geofs-v10-bridge-cap-${way.id}-${j}`, position:C.Cartesian3.fromDegrees(pt.lon,pt.lat,ground+deckHeight-0.16), box:{ dimensions:new C.Cartesian3(roadWidth+1.6,1.05,0.32), material:C.Color.fromCssColorString('#777a77') } });
      });
      const deck = path.map(pt => C.Cartesian3.fromDegrees(pt.lon,pt.lat,groundAt(C,g,pt.lat,pt.lon)+deckHeight));
      bridgeSource.entities.add({ id:`geofs-v10-bridge-deck-${way.id}`, polyline:{ positions:deck, width:clamp(roadWidth*0.55,4,12), material:C.Color.fromCssColorString('#3d4245').withAlpha(0.78), arcType:C.ArcType.NONE } });
      [-1,1].forEach((side) => {
        const railPath = offsetPath(path, roadWidth/2+0.45, side);
        const rail = railPath.map(pt => C.Cartesian3.fromDegrees(pt.lon,pt.lat,groundAt(C,g,pt.lat,pt.lon)+deckHeight+0.82));
        bridgeSource.entities.add({ id:`geofs-v10-bridge-rail-${way.id}-${side}`, polyline:{ positions:rail, width:1.25, material:C.Color.fromCssColorString('#777f82').withAlpha(0.88), arcType:C.ArcType.NONE } });
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
      redrawOsmLayers().catch(error => console.warn('[GeoFS v10] LOD redraw failed', error)).finally(() => { lodRefreshRunning = false; });
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
      `Imported ML buildings: ${importedBuildingCount} rendered / ${importedBuildingFeatures.length} loaded`,
      `Airport markings/entities: ${airportMarkSource ? airportMarkSource.entities.values.length : 0}`,
      `Urban surfaces: ${!!urbanSurfacePrimitive} / traffic fixtures: ${trafficSource ? trafficSource.entities.values.length : 0}`,
      `OSM facade-window geometry instances: ${facadeDetailCount}`,
      `Cesium OSM Buildings: ${!!ionBuildingsTileset}`,
      `Roof geometry: ${!!roofPrimitive}`,
      `Building shader: ${state.buildingShader} / textures: ${state.buildingTexture}`,
      `Building LOD: ${state.buildingLOD} / tree LOD: ${state.treeLOD}`,
      `Shadows: ${scene.shadowMap ? scene.shadowMap.enabled : 'n/a'} / AO ${state.ao} / bloom ${state.bloom} / sharpen ${state.sharpen}`
    ];
    return stats.join('\n');
  }

  function updatePanel() {
    if (!panel) return;
    const g = getGeoFS();
    const googleActive = !!(g && g.api.googleTileset);
    const set = (action, on, labelOn, labelOff) => {
      const b = $(`[data-action="${action}"]`, panel);
      if (b) b.textContent = `${on ? '✓ ' : '○ '}${on ? labelOn : labelOff}`;
    };
    set('roads', state.road, '道路・路肩・車線：ON', '道路・路肩・車線：OFF');
    set('crossings', state.crossings, '横断歩道：ON', '横断歩道：OFF');
    set('rail', state.rail, '線路：ON', '線路：OFF');
    set('roadSurface', state.roadSurface, '道路実幅サーフェス：ON', '道路実幅サーフェス：OFF');
    set('parkingMarkings', state.parkingMarkings, '駐車区画線：ON', '駐車区画線：OFF');
    set('airportSurface', state.airportSurface, '空港面ディテール：ON', '空港面ディテール：OFF');
    set('buildingOutlines', state.buildingOutlines, '建物輪郭：ON', '建物輪郭：OFF');
    set('facadeWindows', state.facadeWindows, '外壁窓ディテール：ON', '外壁窓ディテール：OFF');
    set('urbanSurfaces', state.urbanSurfaces, '都市地表面：ON', '都市地表面：OFF');
    set('trafficFurniture', state.trafficFurniture, '道路設備：ON', '道路設備：OFF');
    set('greenInfrastructure', state.greenInfrastructure, '樹木・街路樹・森林：ON', '樹木・街路樹・森林：OFF');
    set('barriers', state.barriers, '塀・フェンス・生垣：ON', '塀・フェンス・生垣：OFF');
    set('powerNetwork', state.powerNetwork, '送電鉄塔・電柱・電線：ON', '送電鉄塔・電柱・電線：OFF');
    set('hydrography', state.hydrography, '河川・運河・水路：ON', '河川・運河・水路：OFF');
    set('streetObjects', state.streetObjects, '街路小物：ON', '街路小物：OFF');
    set('bridgeStructures', state.bridgeStructures, '橋梁構造：ON', '橋梁構造：OFF');
    set('adaptivePerformance', state.adaptivePerformance, 'FPS連動自動画質：ON', 'FPS連動自動画質：OFF');
    set('autoNearbyData', state.autoNearbyData, '周辺データ自動更新：ON', '周辺データ自動更新：OFF');
    set('roofEquipment', state.roofEquipment, '屋上設備：ON', '屋上設備：OFF');
    set('roofs', state.roofs, 'OSM屋根形状：ON', 'OSM屋根形状：OFF');
    set('ionBuildings', !!ionBuildingsTileset, 'Cesium OSM Buildings：ON', 'Cesium OSM Buildings：OFF');
    set('buildingShader', state.buildingShader, '屋根・外壁シェーダー：ON', '屋根・外壁シェーダー：OFF');
    set('buildingTexture', state.buildingTexture, '建物高解像度テクスチャ：ON', '建物高解像度テクスチャ：OFF');
    set('buildingLOD', state.buildingLOD, '建物LOD拡張：ON', '建物LOD拡張：OFF');
    set('treeLOD', state.treeLOD, '植生LOD拡張：ON', '植生LOD拡張：OFF');
    set('clouds', state.volumetricClouds, 'ボリューム雲・大気散乱：ON', 'ボリューム雲・大気散乱：OFF');
    set('water', state.water, '水面・航跡：ON', '水面・航跡：OFF');
    set('shadows', state.shadows, '高品質シャドウ：ON', '高品質シャドウ：OFF');
    set('ao', state.ao, 'HBAO：ON', 'HBAO：OFF');
    set('bloom', state.bloom, 'Bloom：ON', 'Bloom：OFF');
    set('sharpen', state.sharpen, 'ディテール強調：ON', 'ディテール強調：OFF');
    const google = $('[data-action="google"]', panel);
    if (google) { google.textContent = googleActive ? 'Google実写3D：ON（標準へ戻す）' : 'Google実写3D：OFF（切替）'; google.disabled = busy; }
    const hd = $('[data-action="hd"]', panel);
    if (hd) hd.disabled = busy || googleActive;
    $$('[data-action]', panel).forEach(b => { if (!['diag', 'close'].includes(b.dataset.action)) b.disabled = busy || (b.dataset.action === 'google' && googleActive); });
    if (google) google.disabled = busy;
    if (statusNode) statusNode.textContent = lastMessage;
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
      console.error('[GeoFS MSFS Realism v10]', error);
    } finally {
      setBusy(false);
      updatePanel();
      if (diagNode && diagNode.style.display !== 'none') diagNode.textContent = diagnosticsText();
    }
  }

  function buttonMarkup(action, label, variant = '') {
    return `<button type="button" data-action="${action}" class="rr10-btn ${variant}">${label}</button>`;
  }

  function createPanel() {
    if (panel && panel.isConnected) return;
    panel = document.createElement('section');
    panel.id = 'geofs-msfs-realism-v10-panel';
    panel.style.cssText = [
      'position:fixed','z-index:2147483000','top:64px','right:9px','width:min(380px,calc(100vw - 18px))',
      'max-height:calc(100vh - 76px)','overflow:auto','padding:13px','border:1px solid rgba(255,255,255,.22)',
      'border-radius:14px','background:rgba(9,15,23,.96)','color:#f2f6fa','font:13px/1.45 system-ui,sans-serif',
      'box-shadow:0 10px 34px rgba(0,0,0,.48)','backdrop-filter:blur(12px)'
    ].join(';');
    panel.innerHTML = `
      <style>
        #geofs-msfs-realism-v10-panel *{box-sizing:border-box}
        #geofs-msfs-realism-v10-panel .rr10-btn{display:block;width:100%;padding:9px 10px;margin:5px 0;border:1px solid #485a6b;border-radius:8px;background:#202f3e;color:#f4f7fa;text-align:left;font:600 12px system-ui;cursor:pointer}
        #geofs-msfs-realism-v10-panel .rr10-btn:disabled{opacity:.48}
        #geofs-msfs-realism-v10-panel .rr10-primary{background:#185c80;border-color:#2c87b3}
        #geofs-msfs-realism-v10-panel .rr10-muted{background:#15212d}
        #geofs-msfs-realism-v10-panel .rr10-section{margin-top:11px;padding-top:8px;border-top:1px solid rgba(255,255,255,.13)}
        #geofs-msfs-realism-v10-panel .rr10-heading{font-weight:800;font-size:12px;letter-spacing:.04em;color:#8dd2f3;margin-bottom:5px}
        #geofs-msfs-realism-v10-panel .rr10-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
        #geofs-msfs-realism-v10-panel .rr10-grid .rr10-btn{margin:0}
        #geofs-msfs-realism-v10-panel .rr10-slider{display:grid;grid-template-columns:94px 1fr 40px;gap:7px;align-items:center;margin:7px 0;font-size:11px;color:#d4dfeb}
        #geofs-msfs-realism-v10-panel input[type=range]{width:100%;accent-color:#61b6e5}
        #geofs-msfs-realism-v10-panel .rr10-note{font-size:10px;color:#91a6b8;line-height:1.4;margin:6px 1px}
      </style>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div><div style="font-size:15px;font-weight:850">GeoFS MSFS Realism</div><div style="font-size:10px;color:#8ba6bb">Toolkit v${VERSION} · expanded world detail + open geodata</div></div>
        <button data-action="close" style="background:transparent;color:#fff;border:0;font-size:22px;padding:0 5px">×</button>
      </div>
      <div class="rr10-section">
        <div class="rr10-heading">01 · RENDER QUALITY</div>
        <div class="rr10-grid">
          ${buttonMarkup('ultra','ULTRA品質を適用')}
          ${buttonMarkup('balanced','BALANCED品質を適用')}
        </div>
        ${buttonMarkup('adaptivePerformance','FPS連動・自動画質調整')}
        ${buttonMarkup('nativeQuality','GeoFS標準品質のままにする')}
        <div class="rr10-note">ULTRAは端末性能に負荷がかかります。Androidでは解像度・キャッシュ・視距離を抑えた値を使用します。</div>
      </div>
      <div class="rr10-section">
        <div class="rr10-heading">02 · BUILDINGS & VEGETATION</div>
        ${buttonMarkup('buildingTexture','建物高解像度テクスチャ')}
        ${buttonMarkup('buildingLOD','建物LOD範囲')}
        ${buttonMarkup('treeLOD','植生LOD範囲')}
        ${buttonMarkup('buildingShader','屋根・外壁マテリアル応答')}
        ${buttonMarkup('roofs','OSMタグ付き屋根形状補完')}
        ${buttonMarkup('facadeWindows','建物ファサード窓（高さ情報がある建物）')}
        ${buttonMarkup('importBuildingPack','Microsoft建物データパックを読み込む')}
        ${buttonMarkup('clearBuildingPack','読み込んだ建物パックを解除')}
        <div class="rr10-note">Microsoftの高さ推定付き建物フットプリントを地域パックとして読み込みます。屋根写真や実測ファサードではなく、建物密度・高さの補完用です。</div>
        <div class="rr10-note">屋根形状の追加はOSMに屋根タイプと高さ情報がある建物だけ。タグのない建物の形状を推測して作りません。</div>
      </div>
      <div class="rr10-section">
        <div class="rr10-heading">03 · ROADS, AIRPORTS & ROOFTOPS</div>
        ${buttonMarkup('loadOsm','現在地周辺の詳細データを取得', 'rr10-primary')}
        ${buttonMarkup('roads','道路・路肩・車線')}
        <div class="rr10-grid">
          ${buttonMarkup('crossings','横断歩道')}
          ${buttonMarkup('rail','線路・枕木表現')}
        </div>
        <div class="rr10-grid">
          ${buttonMarkup('roadSurface','道路面の実幅補完')}
          ${buttonMarkup('parkingMarkings','駐車区画・駐車場ライン')}
          ${buttonMarkup('airportSurface','滑走路・誘導路・ヘリパッド')}
        </div>
        <div class="rr10-grid">
          ${buttonMarkup('buildingOutlines','建物フットプリント線')}
          ${buttonMarkup('roofEquipment','屋上設備・太陽光パネル')}
        </div>
        <div class="rr10-grid">
          ${buttonMarkup('urbanSurfaces','駐車場・公園・水面') }
          ${buttonMarkup('trafficFurniture','信号機・街灯・標識') }
        </div>
        <div class="rr10-heading" style="margin-top:9px">04 · WORLD DETAIL EXPANSION</div>
        <div class="rr10-grid">
          ${buttonMarkup('greenInfrastructure','樹木・街路樹・森林') }
          ${buttonMarkup('barriers','塀・フェンス・生垣') }
        </div>
        <div class="rr10-grid">
          ${buttonMarkup('powerNetwork','送電鉄塔・電柱・電線') }
          ${buttonMarkup('hydrography','河川・運河・水路') }
        </div>
        ${buttonMarkup('streetObjects','バス停・ベンチ・消火栓・駐輪場など') }
        ${buttonMarkup('bridgeStructures','橋脚・橋面・橋梁ガードレール')}
        ${buttonMarkup('autoNearbyData','飛行移動に合わせて周辺データを自動更新')}
        ${buttonMarkup('clearOsm','OSM追加レイヤーをクリア','rr10-muted')}
        <div class="rr10-note">車線・幅・表面材・歩道、空港の滑走路と誘導路をOSM属性から表示。タグがある設備のみ追加します。<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" style="color:#9fc7e8">© OpenStreetMap contributors · ODbL</a></div>
      </div>
      <div class="rr10-section">
        <div class="rr10-heading">05 · ATMOSPHERE, WATER & SHADOWS</div>
        ${buttonMarkup('clouds','ボリューム雲・大気散乱')}
        ${buttonMarkup('water','水面波・航跡')}
        ${buttonMarkup('shadows','高品質シャドウ')}
        ${buttonMarkup('atmosphereColor','自然な空・地平線の色調')}
      </div>
      <div class="rr10-section">
        <div class="rr10-heading">06 · IMAGE QUALITY</div>
        <div class="rr10-grid">
          ${buttonMarkup('ao','HBAO')}
          ${buttonMarkup('bloom','Bloom')}
        </div>
        ${buttonMarkup('sharpen','ディテール強調（軽いシャープ化）')}
        ${buttonMarkup('naturalImagery','航空写真・自然色プロファイル')}
        <label class="rr10-slider">明るさ <input data-slider="brightness" type="range" min="80" max="120" step="1" value="100"><output data-value="brightness">1.00</output></label>
        <label class="rr10-slider">コントラスト <input data-slider="contrast" type="range" min="80" max="125" step="1" value="100"><output data-value="contrast">1.00</output></label>
        <label class="rr10-slider">彩度 <input data-slider="saturation" type="range" min="75" max="125" step="1" value="100"><output data-value="saturation">1.00</output></label>
        <label class="rr10-slider">シャープ量 <input data-slider="sharpness" type="range" min="0" max="35" step="1" value="14"><output data-value="sharpness">0.14</output></label>
      </div>
      <div class="rr10-section">
        <div class="rr10-heading">07 · PHOTOGRAMMETRY & OPEN 3D DATA</div>
        ${buttonMarkup('google','Google実写3D（GeoFS標準・最優先）')}
        ${buttonMarkup('ionBuildings','Cesium OSM Buildings 3D（ionトークン）')}
        ${buttonMarkup('hd','GeoFS HD航空写真')}
        <div class="rr10-note">Google実写3DはGeoFS標準API・提供地域に依存。Cesium OSM Buildingsは無料Cesium ionアカウントと読み取りトークンが必要です。MSFS/RFSなどの独自素材は流用せず、公開データと描画方式を使用します。</div>
      </div>
      <div class="rr10-section">
        <div class="rr10-grid">
          ${buttonMarkup('diagnostics','Diagnostics','rr10-muted')}
          ${buttonMarkup('reset','すべて元に戻す','rr10-muted')}
        </div>
      </div>
      <div data-status style="margin-top:9px;padding:9px;border-radius:8px;background:rgba(255,255,255,.07);color:#dce8f2;white-space:normal;font-size:11px"></div>
      <pre data-diagnostics style="display:none;white-space:pre-wrap;word-break:break-word;font:10px/1.5 ui-monospace,monospace;color:#bcd0e4;background:rgba(0,0,0,.28);padding:9px;border-radius:8px;margin:8px 0 0"></pre>
      <input data-building-pack type="file" accept=".geojson,.json,application/geo+json" style="display:none">
    `;
    document.body.appendChild(panel);
    statusNode = $('[data-status]', panel);
    diagNode = $('[data-diagnostics]', panel);

    const actions = {
      close: () => { panel.style.display = 'none'; },
      ultra: () => applyQualityProfile('ultra'),
      balanced: () => applyQualityProfile('balanced'),
      nativeQuality: () => restoreQualityOnly(),
      buildingTexture: () => toggleBuildingTextures(!state.buildingTexture),
      buildingLOD: () => changeLod('building', !state.buildingLOD),
      treeLOD: () => changeLod('tree', !state.treeLOD),
      buildingShader: () => toggleBuildingShader(!state.buildingShader),
      roofs: async () => {
        state.roofs = !state.roofs;
        const count = await drawRoofOverlay();
        lastMessage = state.roofs ? `OSM屋根形状を${count}棟に補完しました（実データのタグがある建物のみ）` : '屋根形状補完を停止しました';
      },
      loadOsm: async () => { lastMessage = '現在地周辺のOpenStreetMapデータを取得しています…'; updatePanel(); const c = await loadOsmArea(false); lastMessage += ` / 描画道路 ${state.road ? c.roads : 0}件`; },
      roads: async () => { state.road = !state.road; await redrawOsmLayers(); lastMessage = state.road ? '道路レイヤーを有効化しました' : '道路レイヤーを非表示にしました'; },
      crossings: async () => { state.crossings = !state.crossings; await redrawOsmLayers(); lastMessage = `横断歩道レイヤー：${state.crossings ? 'ON' : 'OFF'}`; },
      rail: async () => { state.rail = !state.rail; await redrawOsmLayers(); lastMessage = `線路レイヤー：${state.rail ? 'ON' : 'OFF'}`; },
      roadSurface: async () => { state.roadSurface = !state.roadSurface; await redrawOsmLayers(); lastMessage = `道路実幅サーフェス：${state.roadSurface ? 'ON' : 'OFF'}`; },
      parkingMarkings: async () => { state.parkingMarkings = !state.parkingMarkings; const n = await drawParkingBayMarkings(); lastMessage = `駐車区画線：${state.parkingMarkings ? `${n}本` : 'OFF'}`; },
      airportSurface: async () => { state.airportSurface = !state.airportSurface; await redrawOsmLayers(); lastMessage = `空港面ディテール：${state.airportSurface ? 'ON' : 'OFF'}`; },
      buildingOutlines: async () => { state.buildingOutlines = !state.buildingOutlines; await redrawOsmLayers(); lastMessage = `建物輪郭：${state.buildingOutlines ? 'ON' : 'OFF'}`; },
      facadeWindows: async () => { state.facadeWindows = !state.facadeWindows; const n = await drawFacadeDetails(); lastMessage = `外壁窓ディテール：${state.facadeWindows ? `${n}枚` : 'OFF'}`; },
      importBuildingPack: () => { $('[data-building-pack]', panel).click(); },
      clearBuildingPack: () => { removeImportedFootprints(true); lastMessage = '外部建物データパックを解除しました'; },
      urbanSurfaces: async () => { state.urbanSurfaces = !state.urbanSurfaces; const n = await drawUrbanSurfacePatches(); lastMessage = `都市地表面：${state.urbanSurfaces ? `${n}区域` : 'OFF'}`; },
      trafficFurniture: async () => { state.trafficFurniture = !state.trafficFurniture; const n = await drawTrafficFurniture(); lastMessage = `道路設備：${state.trafficFurniture ? `${n}地点` : 'OFF'}`; },
      greenInfrastructure: async () => { state.greenInfrastructure = !state.greenInfrastructure; const n = await drawGreenInfrastructure(); lastMessage = `樹木・緑地：${state.greenInfrastructure ? `${n}本/本相当` : 'OFF'}`; },
      barriers: async () => { state.barriers = !state.barriers; const n = await drawBarriers(); lastMessage = `塀・フェンス・生垣：${state.barriers ? `${n}区間` : 'OFF'}`; },
      powerNetwork: async () => { state.powerNetwork = !state.powerNetwork; const n = await drawPowerNetwork(); lastMessage = `送電設備：${state.powerNetwork ? `${n}要素` : 'OFF'}`; },
      hydrography: async () => { state.hydrography = !state.hydrography; const n = await drawHydrography(); lastMessage = `河川・水路：${state.hydrography ? `${n}区間` : 'OFF'}`; },
      streetObjects: async () => { state.streetObjects = !state.streetObjects; const n = await drawStreetObjects(); lastMessage = `街路オブジェクト：${state.streetObjects ? `${n}地点` : 'OFF'}`; },
      bridgeStructures: async () => { state.bridgeStructures = !state.bridgeStructures; const n = await drawBridgeStructures(); lastMessage = `橋梁構造：${state.bridgeStructures ? `${n}橋` : 'OFF'}`; },
      adaptivePerformance: () => { toggleAdaptivePerformance(!state.adaptivePerformance); },
      autoNearbyData: () => { state.autoNearbyData = !state.autoNearbyData; lastMessage = `周辺データ自動更新：${state.autoNearbyData ? 'ON' : 'OFF'}`; },
      roofEquipment: async () => { state.roofEquipment = !state.roofEquipment; await redrawOsmLayers(); lastMessage = `屋上設備：${state.roofEquipment ? 'ON' : 'OFF'}`; },
      clearOsm: async () => { removeRoadLayers(); removeRoofOverlay(); removeRoofEquipment(); removeBuildingOutlines(); removeFacadeDetails(); removeTrafficFurniture(); removeGreenInfrastructure(); removeBarriers(); removePowerNetwork(); removeHydrography(); removeStreetObjects(); removeBridgeStructures(); if(urbanSurfacePrimitive){const gg=getGeoFS(); if(gg)safe(()=>gg.api.viewer.scene.groundPrimitives.remove(urbanSurfacePrimitive)); urbanSurfacePrimitive=null;} osmElements = []; lastOsmCell = ''; lastAutoCellAttempt = ''; lastDetailBand = ''; lastMessage = 'OSM追加レイヤーを削除しました'; },
      clouds: async () => applyAtmosphere(!state.volumetricClouds),
      water: async () => toggleWater(!state.water),
      shadows: async () => toggleShadows(!state.shadows),
      atmosphereColor: async () => setAtmosphereColorProfile(),
      ao: async () => togglePostProcess('ao', !state.ao),
      bloom: async () => togglePostProcess('bloom', !state.bloom),
      sharpen: async () => toggleSharpen(!state.sharpen),
      naturalImagery: async () => applyNaturalImagery(),
      google: () => runAction(toggleGoogle3D),
      ionBuildings: () => runAction(toggleIonOsmBuildings),
      hd: () => runAction(async () => toggleHD()),
      diagnostics: () => { diagNode.style.display = diagNode.style.display === 'none' ? 'block' : 'none'; diagNode.textContent = diagnosticsText(); },
      reset: async () => resetAll()
    };
    panel.addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = actions[button.dataset.action];
      if (!action || button.disabled) return;
      if (button.dataset.action === 'close' || button.dataset.action === 'diagnostics') action();
      else runAction(action);
    });
    const buildingPackInput = $('[data-building-pack]', panel);
    buildingPackInput.addEventListener('change', () => {
      const file = buildingPackInput.files && buildingPackInput.files[0];
      if (!file) return;
      runAction(async () => {
        const count = await loadBuildingFootprintPack(file);
        lastMessage = `建物データパックを読み込みました：対象地域で${count}棟を描画（高さ推定値あり）`;
        buildingPackInput.value = '';
      });
    });
    panel.addEventListener('input', event => {
      const slider = event.target.closest('[data-slider]');
      if (!slider) return;
      const key = slider.dataset.slider;
      const value = Number(slider.value);
      const output = $(`[data-value="${key}"]`, panel);
      if (key === 'sharpness') {
        state.sharpness = value / 100;
        if (sharpenStage) sharpenStage.uniforms.u_strength = () => state.sharpness;
      } else {
        const numeric = value / 100;
        setImageryProperty(key, numeric);
      }
      if (output) output.textContent = (key === 'sharpness' ? state.sharpness : value / 100).toFixed(2);
      requestRender();
    });
    updatePanel();
  }

  function restoreQualityOnly() {
    const g = getGeoFS();
    if (!g || !original || !original.graphics) return;
    g.preferences.graphics = clone(original.graphics);
    g.api.renderingQuality(g.preferences.graphics.quality, true);
    state.qualityProfile = 'native';
    state.volumetricClouds = !!g.preferences.graphics.volumetricClouds;
    lastMessage = 'GeoFSの元の描画品質へ戻しました';
  }

  async function resetAll() {
    const g = getGeoFS();
    if (!g || !original) return;
    removeRoadLayers();
    removeRoofOverlay();
    removeImportedFootprints(true);
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
    if (roofShaderBackupActive && window.geofsShaders) {
      geofsShaders['buildingsFS.glsl'] = originalBuildingShader;
      roofShaderBackupActive = false;
      state.buildingShader = false;
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
    if (typeof g.api.setAtmosphereColorModifier === 'function') safe(() => g.api.setAtmosphereColorModifier('geofs-msfs-v10', { brightnessShift: 0, saturationShift: 0, hueShift: 0, groundBrightnessShift: 0, groundSaturationShift: 0, groundHueShift: 0, fogBrightness: 1, cloudsBrightness: 1 }));
    rebuildBuildingsIfActive();
    state.road = false; state.crossings = true; state.rail = true; state.roadSurface = true; state.airportSurface = true;
    state.buildingOutlines = false; state.facadeWindows = false; state.urbanSurfaces = true; state.trafficFurniture = true; state.parkingMarkings = true; state.roofEquipment = true; state.roofs = false; state.ionBuildings = false;
    state.buildingShader = false; state.buildingTexture = false; state.buildingLOD = false; state.treeLOD = false;
    if (state.adaptivePerformance) toggleAdaptivePerformance(false);
    state.greenInfrastructure = true; state.barriers = true; state.powerNetwork = true; state.hydrography = true; state.streetObjects = true; state.bridgeStructures = true;
    state.volumetricClouds = !!original.graphics.volumetricClouds; state.water = !!original.waterEffect; state.shadows = !!original.nativeShadows;
    state.ao = !!original.ao; state.bloom = !!original.bloom; state.sharpen = false; state.qualityProfile = 'native';
    state.brightness = 1; state.contrast = 1; state.saturation = 1; state.sharpness = 0.14;
    osmElements = [];
    lastOsmCell = ''; lastAutoCellAttempt = ''; lastDetailBand = '';
    lastMessage = 'GeoFS起動時の設定へ復元しました';
    requestRender();
  }

  function togglePanel() {
    createPanel();
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    updatePanel();
  }

  function cleanup() {
    // cleanup is intentionally non-destructive: use the panel's reset action for full restoration.
    const g = getGeoFS();
    removeRoadLayers();
    removeRoofOverlay();
    removeImportedFootprints(true);
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
    if (renderEventRemove) safe(() => renderEventRemove());
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
    const g = getGeoFS();
    const C = getCesium();
    if (!g || !C || !g.api.viewer.scene) return false;
    captureOriginal();
    createPanel();
    startFpsMeter();
    const graphics = g.preferences.graphics || {};
    state.volumetricClouds = !!graphics.volumetricClouds;
    state.water = !!graphics.waterEffect;
    state.shadows = !!g.api.viewer.shadows;
    const stages = g.api.viewer.scene.postProcessStages;
    state.ao = !!(stages && stages.ambientOcclusion && stages.ambientOcclusion.enabled);
    state.bloom = !!(stages && stages.bloom && stages.bloom.enabled);
    lastMessage = `準備完了。GeoFS ${g.version || ''} / Cesium ${C.VERSION || 'unknown'}。実機APIを検出しました。`;
    window[KEY] = { togglePanel, cleanup, diagnostics: diagnosticsText, loadArea: () => loadOsmArea(false), reset: resetAll };
    window.addEventListener('pagehide', cleanup, { once: true });
    ensureSharpenStage();
    updatePanel();
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
      roadMarkSource = new C.CustomDataSource('GeoFS v10 road markings');
      let n = 0;
      roads.forEach((road, i) => {
        if (n >= (mobile ? 16 : 64) || !road.style.marked || road.style.lanes < 2 || road.style.width < 7) return;
        roadMarkSource.entities.add({
          id: `geofs-v10-center-${i}`,
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
            id: `geofs-v10-lane-${i}-${lane}`,
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
            id: `geofs-v10-turn-arrow-${i}-${j}`,
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
      if (attempts > 360 && !getGeoFS()) console.warn('[GeoFS MSFS Realism v10] GeoFS Viewer was not detected.');
    }
  }, 500);
})();
