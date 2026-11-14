// ==UserScript==
// @name         GeoFS MSFS Visual Overhaul - Advanced
// @namespace    geofs-msfs-visual-overhaul
// @version      2.0.0
// @description  63 advanced visual controls for GeoFS/Cesium 1.96: lighting, atmosphere, water shader, photogrammetry, terrain LOD and post-processing.
// @author       OpenAI
// @match        https://www.geo-fs.com/geofs.php*
// @match        https://geo-fs.com/geofs.php*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const GLOBAL_KEY = '__GEOFS_MSFS_VISUAL_OVERHAUL_V2__';
  const OLD_KEY = '__GEOFS_MSFS_VISUAL_OVERHAUL__';
  if (window[GLOBAL_KEY]?.active) {
    window[GLOBAL_KEY].togglePanel?.();
    return;
  }
  try { window[OLD_KEY]?.cleanup?.(); } catch (_) {}

  const VERSION = '2.0.0';
  const waitStarted = Date.now();
  let bootTimer = null;

  const clone = (value) => {
    try { return JSON.parse(JSON.stringify(value)); }
    catch (_) { return value; }
  };

  function waitForGeoFS() {
    const game = window.geofs;
    const Cesium = window.Cesium;
    if (game?.api?.viewer?.scene?.globe && Cesium && game?.preferences?.graphics && typeof game.api.renderingQuality === 'function') {
      clearInterval(bootTimer);
      start(game, Cesium);
      return;
    }
    if (Date.now() - waitStarted > 180000) {
      clearInterval(bootTimer);
      console.warn('[GVO2] GeoFS/Cesium was not ready within 3 minutes. Reload GeoFS and try again.');
    }
  }

  function start(geofs, Cesium) {
    const api = geofs.api;
    const viewer = api.viewer;
    const scene = viewer.scene;
    const globe = scene.globe;
    const graphics = geofs.preferences.graphics;
    const fog = scene.fog;
    const post = scene.postProcessStages;
    const shadowMap = viewer.shadowMap || scene.shadowMap;
    const imageryLayer = viewer.imageryLayers?.length ? viewer.imageryLayers.get(0) : null;
    const nativeSetGoogleTiles = api.setGoogleTiles;

    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);
    const gl = scene.context?._gl || scene._context?._gl;
    const glCaps = (() => {
      try {
        return {
          maxTextureSize: gl?.getParameter(gl.MAX_TEXTURE_SIZE) || 4096,
          maxSamples: gl?.MAX_SAMPLES ? (gl.getParameter(gl.MAX_SAMPLES) || 1) : 1
        };
      } catch (_) { return { maxTextureSize: 4096, maxSamples: 1 }; }
    })();

    const original = {
      graphics: clone(graphics),
      highDynamicRange: scene.highDynamicRange,
      gamma: scene.gamma,
      fog: fog ? {
        enabled: fog.enabled, density: fog.density, visualDensityScalar: fog.visualDensityScalar,
        minimumBrightness: fog.minimumBrightness, screenSpaceErrorFactor: fog.screenSpaceErrorFactor,
        renderable: fog.renderable
      } : null,
      globe: {
        maximumScreenSpaceError: globe.maximumScreenSpaceError,
        tileCacheSize: globe.tileCacheSize,
        loadingDescendantLimit: globe.loadingDescendantLimit,
        depthTestAgainstTerrain: globe.depthTestAgainstTerrain,
        enableLighting: globe.enableLighting,
        lambertDiffuseMultiplier: globe.lambertDiffuseMultiplier,
        showGroundAtmosphere: globe.showGroundAtmosphere,
        atmosphereBrightnessShift: globe.atmosphereBrightnessShift,
        atmosphereSaturationShift: globe.atmosphereSaturationShift,
        atmosphereHueShift: globe.atmosphereHueShift,
        shadows: globe.shadows,
        maximumUpsamplingLevel: globe.maximumUpsamplingLevel,
        showWaterEffect: globe.showWaterEffect,
        oceanNormalMapUrl: globe.oceanNormalMapUrl
      },
      sky: scene.skyAtmosphere ? {
        show: scene.skyAtmosphere.show,
        brightnessShift: scene.skyAtmosphere.brightnessShift,
        saturationShift: scene.skyAtmosphere.saturationShift,
        hueShift: scene.skyAtmosphere.hueShift
      } : null,
      atmosphereDynamicLighting: scene.atmosphere?.dynamicLighting,
      sunShow: scene.sun?.show,
      viewerShadows: viewer.shadows,
      shadowMap: shadowMap ? {
        enabled: shadowMap.enabled, size: shadowMap.size, softShadows: shadowMap.softShadows,
        maximumDistance: shadowMap.maximumDistance, darkness: shadowMap.darkness
      } : null,
      msaaSamples: scene.msaaSamples,
      fxaa: post?.fxaa?.enabled,
      exposure: post?.exposure,
      bloom: post?.bloom?.enabled,
      ambientOcclusion: post?.ambientOcclusion?.enabled,
      imagery: imageryLayer ? {
        brightness: imageryLayer.brightness, contrast: imageryLayer.contrast,
        saturation: imageryLayer.saturation, gamma: imageryLayer.gamma, hue: imageryLayer.hue
      } : null,
      imageryModifiers: clone(api.imageryColorModifiers || {}),
      atmosphereModifiers: clone(api.atmosphereColorModifiers || {}),
      googleTiles: !!api.googleTileset,
      waterEffect: !!graphics.waterEffect,
      vegetation: !!graphics.vegetation,
      buildings: !!graphics.buildings
    };

    const state = {
      resolutionScale: isMobile ? 0.95 : 1.15,
      terrainSSE: 1.0,
      terrainCache: isMobile ? 900 : 1800,
      loadingDescendants: 40,
      depthTest: true,
      globeLighting: true,
      lambert: 1.0,
      groundAtmosphere: true,
      groundBrightness: 0,
      groundSaturation: 0,
      groundHue: 0,
      skyBrightness: 0,
      skySaturation: 0,
      skyHue: 0,
      fogEnabled: true,
      fogDensity: Math.max(0.00001, Number(fog?.density) || 0.0002),
      fogVisualDensity: Number.isFinite(fog?.visualDensityScalar) ? fog.visualDensityScalar : 0.15,
      fogMinBrightness: Number.isFinite(fog?.minimumBrightness) ? fog.minimumBrightness : 0.08,
      fogSSE: Number.isFinite(fog?.screenSpaceErrorFactor) ? fog.screenSpaceErrorFactor : 0.5,
      dynamicLighting: true,
      sunVisible: scene.sun?.show !== false,
      globeShadows: true,
      shadowEnabled: shadowMap?.enabled !== false,
      shadowResolution: isMobile ? 1024 : 2048,
      softShadows: true,
      shadowDistance: isMobile ? 1300 : 2600,
      shadowDarkness: 0.45,
      fxaa: true,
      msaaSamples: isMobile ? 1 : Math.min(2, glCaps.maxSamples),
      maxUpsampling: Math.max(12, Number(globe.maximumUpsamplingLevel) || 22),
      waterEffects: true,
      nativeWaterWaves: false,
      oceanNormalMap: false,
      vegetation: true,
      buildings: true,
      google3D: !!api.googleTileset,
      googleSSE: 6,
      googleCacheMB: 512,
      googleOverflowMB: 512,
      googleDynamicSSE: false,
      googleDynamicDensity: 1,
      googleDynamicFactor: 24,
      googleCullMoving: false,
      googleFoveated: false,
      googleShadows: true,
      googleCredits: true,
      waterHighlight: 1.2,
      waterWind: Number(geofs.weather?.currentWindSpeedMs || window.weather?.currentWindSpeedMs || 0),
      imageryBrightness: 1.0,
      imageryContrast: 1.02,
      imagerySaturation: 1.02,
      imageryGamma: 1.0,
      imageryHue: 0,
      exposure: 1.0,
      toneMap: false,
      sharpen: 0.12,
      clarity: 0.04,
      bloom: false,
      ambientOcclusion: false,
      vignette: 0.025,
      filmGrain: 0,
      chromaticAberration: 0,
      colorTemperature: 0
    };

    const FEATURE_GROUPS = [
      { id: 'quality', title: '01 · 地形・描画品質' },
      { id: 'atmosphere', title: '02 · 光・空・大気' },
      { id: 'shadow', title: '03 · 影・アンチエイリアス' },
      { id: 'surface', title: '04 · 水面・3D都市・地表' },
      { id: 'imagery', title: '05 · 衛星画像・色' },
      { id: 'post', title: '06 · ポストプロセス' }
    ];

    // Exactly 63 controls. Unsupported or unavailable Cesium members are skipped safely.
    const FEATURES = [
      { key: 'resolutionScale', group: 'quality', label: '描画解像度スケール', type: 'range', min: 0.65, max: 1.6, step: 0.05, unit: 'x', hint: '高いほど細かく表示。GPU負荷も増加。' },
      { key: 'terrainSSE', group: 'quality', label: '地形LOD精度 (最大スクリーン誤差)', type: 'range', min: 0.5, max: 4, step: 0.1, unit: '', hint: '小さいほど高精細。タイル読み込みが増える。' },
      { key: 'terrainCache', group: 'quality', label: '地形タイルキャッシュ', type: 'range', min: 128, max: 4000, step: 64, unit: ' tiles', hint: 'メモリ使用量と再読み込み回数のトレードオフ。' },
      { key: 'loadingDescendants', group: 'quality', label: '子タイル読み込み許容量', type: 'range', min: 5, max: 100, step: 1, unit: '', hint: '大きいほど詳細タイルを待ってから描画しやすい。' },
      { key: 'depthTest', group: 'quality', label: '地形に対する深度テスト', type: 'toggle', hint: '地表に隠れるオブジェクトの描画を抑える。' },
      { key: 'globeLighting', group: 'quality', label: '地球・地形ライティング', type: 'toggle' },
      { key: 'lambert', group: 'quality', label: '地形Lambert反射係数', type: 'range', min: 0.4, max: 2.5, step: 0.05, unit: 'x', hint: '極端な値は地形の明暗を不自然にする。' },

      { key: 'groundAtmosphere', group: 'atmosphere', label: '地表大気散乱', type: 'toggle' },
      { key: 'groundBrightness', group: 'atmosphere', label: '地表大気の明るさ', type: 'range', min: -0.5, max: 0.5, step: 0.01 },
      { key: 'groundSaturation', group: 'atmosphere', label: '地表大気の彩度', type: 'range', min: -0.5, max: 0.5, step: 0.01 },
      { key: 'groundHue', group: 'atmosphere', label: '地表大気の色相', type: 'range', min: -0.1, max: 0.1, step: 0.005 },
      { key: 'skyBrightness', group: 'atmosphere', label: '空の明るさ', type: 'range', min: -0.5, max: 0.5, step: 0.01 },
      { key: 'skySaturation', group: 'atmosphere', label: '空の彩度', type: 'range', min: -0.5, max: 0.5, step: 0.01 },
      { key: 'skyHue', group: 'atmosphere', label: '空の色相', type: 'range', min: -0.1, max: 0.1, step: 0.005 },
      { key: 'fogEnabled', group: 'atmosphere', label: '大気遠近・フォグ', type: 'toggle' },
      { key: 'fogDensity', group: 'atmosphere', label: 'フォグ密度', type: 'range', min: 0.00001, max: 0.001, step: 0.00001, unit: '', hint: '高すぎると遠景の地形タイルまで隠れる。' },
      { key: 'fogVisualDensity', group: 'atmosphere', label: 'フォグの視覚密度', type: 'range', min: 0.01, max: 0.6, step: 0.01 },
      { key: 'fogMinBrightness', group: 'atmosphere', label: 'フォグ最小明度', type: 'range', min: 0.01, max: 0.5, step: 0.01 },
      { key: 'fogSSE', group: 'atmosphere', label: 'フォグ内タイル簡略化係数', type: 'range', min: 0, max: 3, step: 0.1, hint: '0にするとフォグによるLOD簡略化を無効化。' },
      { key: 'dynamicLighting', group: 'atmosphere', label: '太陽連動の動的大気照明', type: 'toggle' },
      { key: 'sunVisible', group: 'atmosphere', label: '太陽ディスク表示', type: 'toggle' },

      { key: 'globeShadows', group: 'shadow', label: '地形の影受け取り', type: 'toggle' },
      { key: 'shadowEnabled', group: 'shadow', label: 'シャドウマップ有効化', type: 'toggle' },
      { key: 'shadowResolution', group: 'shadow', label: 'シャドウマップ解像度', type: 'range', min: 512, max: 4096, step: 512, unit: ' px' },
      { key: 'softShadows', group: 'shadow', label: 'ソフトシャドウ', type: 'toggle' },
      { key: 'shadowDistance', group: 'shadow', label: '影の描画距離', type: 'range', min: 300, max: 6000, step: 100, unit: ' m' },
      { key: 'shadowDarkness', group: 'shadow', label: '影の濃さ', type: 'range', min: 0.15, max: 0.85, step: 0.01 },
      { key: 'fxaa', group: 'shadow', label: 'FXAA', type: 'toggle' },
      { key: 'msaaSamples', group: 'shadow', label: 'MSAAサンプル数', type: 'range', min: 1, max: 4, step: 1, unit: 'x' },

      { key: 'maxUpsampling', group: 'surface', label: '地形アップサンプリング上限', type: 'range', min: 8, max: 28, step: 1, hint: '元標高データの実解像度は増えない。' },
      { key: 'waterEffects', group: 'surface', label: 'GeoFS水面・航跡エフェクト', type: 'toggle', hint: 'GeoFSの水面エフェクトと航跡を使用。' },
      { key: 'nativeWaterWaves', group: 'surface', label: 'Cesium標準水面波', type: 'toggle', hint: '水面マスク付きTerrainProviderでのみ有効。GeoFS標準SRTMはwater maskを要求しない設定。' },
      { key: 'oceanNormalMap', group: 'surface', label: 'Cesium標準海面法線マップ', type: 'toggle', hint: 'TerrainProviderにwater maskがない場合は見た目に反映されない。' },
      { key: 'vegetation', group: 'surface', label: 'GeoFS植生', type: 'toggle' },
      { key: 'buildings', group: 'surface', label: 'GeoFS建物', type: 'toggle' },
      { key: 'google3D', group: 'surface', label: 'Google Photorealistic 3D Tiles', type: 'toggle', hint: 'GeoFS側キー・Google利用条件・通信環境に依存。' },
      { key: 'googleSSE', group: 'surface', label: 'Google 3D Tiles LOD精度', type: 'range', min: 2, max: 24, step: 1 },
      { key: 'googleCacheMB', group: 'surface', label: 'Google 3D Tilesキャッシュ', type: 'range', min: 128, max: 1536, step: 64, unit: ' MB' },
      { key: 'googleOverflowMB', group: 'surface', label: 'Googleキャッシュ超過許容量', type: 'range', min: 0, max: 1024, step: 64, unit: ' MB' },
      { key: 'googleDynamicSSE', group: 'surface', label: 'Google動的スクリーン誤差', type: 'toggle' },
      { key: 'googleDynamicDensity', group: 'surface', label: 'Google動的誤差密度', type: 'range', min: 0.0001, max: 2, step: 0.0001 },
      { key: 'googleDynamicFactor', group: 'surface', label: 'Google動的誤差係数', type: 'range', min: 1, max: 48, step: 1 },
      { key: 'googleCullMoving', group: 'surface', label: '移動中のタイル要求カリング', type: 'toggle', hint: 'OFFは詳細優先、ONは通信量・負荷低減。' },
      { key: 'googleFoveated', group: 'surface', label: '視野中心優先LOD', type: 'toggle' },
      { key: 'googleShadows', group: 'surface', label: 'Google 3D Tiles影受け取り', type: 'toggle' },
      { key: 'googleCredits', group: 'surface', label: 'Googleデータ帰属表示', type: 'toggle', hint: '利用条件に従い通常はONのままにすること。' },
      { key: 'waterHighlight', group: 'surface', label: '水面の鏡面ハイライト/光量（既存シェーダー）', type: 'range', min: 0, max: 2.5, step: 0.05, unit: 'x', hint: '既存u_lightIntensity uniform。鏡面反射そのものを新設する機能ではない。' },
      { key: 'waterWind', group: 'surface', label: '水面シェーダー風速入力', type: 'range', min: 0, max: 40, step: 0.5, unit: ' m/s', hint: '既存u_windSpeed uniform。波・泡の動きに使われる場合のみ反映。' },

      { key: 'imageryBrightness', group: 'imagery', label: '衛星画像の明るさ', type: 'range', min: 0.5, max: 1.5, step: 0.01 },
      { key: 'imageryContrast', group: 'imagery', label: '衛星画像のコントラスト', type: 'range', min: 0.5, max: 1.5, step: 0.01 },
      { key: 'imagerySaturation', group: 'imagery', label: '衛星画像の彩度', type: 'range', min: 0.5, max: 1.5, step: 0.01 },
      { key: 'imageryGamma', group: 'imagery', label: '衛星画像のガンマ', type: 'range', min: 0.5, max: 1.5, step: 0.01 },
      { key: 'imageryHue', group: 'imagery', label: '衛星画像の色相', type: 'range', min: -0.15, max: 0.15, step: 0.005 },

      { key: 'exposure', group: 'post', label: '露出', type: 'range', min: 0.5, max: 1.8, step: 0.01, unit: 'x' },
      { key: 'toneMap', group: 'post', label: 'ACES風トーンマッピング', type: 'toggle' },
      { key: 'sharpen', group: 'post', label: 'シャープネス', type: 'range', min: 0, max: 0.8, step: 0.01 },
      { key: 'clarity', group: 'post', label: 'ローカルコントラスト', type: 'range', min: 0, max: 0.5, step: 0.01 },
      { key: 'bloom', group: 'post', label: 'Bloom・ハイライトのにじみ', type: 'toggle' },
      { key: 'ambientOcclusion', group: 'post', label: 'HBAO・接地感の補強', type: 'toggle', hint: '対応Cesium built-in stageがある場合のみ。高負荷。' },
      { key: 'vignette', group: 'post', label: '周辺減光', type: 'range', min: 0, max: 0.25, step: 0.005 },
      { key: 'filmGrain', group: 'post', label: 'フィルム粒子', type: 'range', min: 0, max: 0.08, step: 0.002 },
      { key: 'chromaticAberration', group: 'post', label: '色収差', type: 'range', min: 0, max: 0.01, step: 0.0005, hint: '実写レンズの微量表現。強くすると不自然。' },
      { key: 'colorTemperature', group: 'post', label: '色温度・暖色/寒色', type: 'range', min: -1, max: 1, step: 0.02 }
    ];

    if (FEATURES.length !== 63) {
      console.error('[GVO2] Feature list count mismatch:', FEATURES.length);
      return;
    }

    let panelHost, root, statusNode, fpsNode, profileSelect;
    let destroyed = false;
    let applyQueued = false;
    let fpsFrames = 0;
    let fpsStart = performance.now();
    let customStage = null;
    let postRenderRemove = null;
    let qualityChangeHandler = null;
    let googleToggleBusy = false;
    let lastWater = !!graphics.waterEffect;
    let lastVegetation = !!graphics.vegetation;
    let lastBuildings = !!graphics.buildings;
    let lastGoogle = state.google3D;
    let lastNormalMapUrl = globe.oceanNormalMapUrl;

    const groups = new Map(FEATURE_GROUPS.map((g) => [g.id, g]));

    function setStatus(message) {
      if (statusNode) statusNode.textContent = message;
    }

    function safeSet(object, key, value) {
      if (!object || !(key in object)) return false;
      try { object[key] = value; return true; }
      catch (error) { console.warn(`[GVO2] Could not set ${key}`, error); return false; }
    }

    function safeCall(fn, receiver, ...args) {
      if (typeof fn !== 'function') return undefined;
      try { return fn.apply(receiver, args); }
      catch (error) { console.warn('[GVO2] Optional GeoFS call failed:', error); return undefined; }
    }

    function getTileSet() { return api.googleTileset || null; }

    function syncGeoFsFeatures() {
      // Keep the saved GeoFS preferences in sync even while Google tiles hide
      // native trees/buildings; GeoFS reads these values when Google tiles are removed.
      graphics.waterEffect = state.waterEffects;
      graphics.vegetation = state.vegetation;
      graphics.buildings = state.buildings;
      if (api.googleTileset) return;
      if (state.waterEffects !== lastWater) {
        safeCall(api.setWaterEffect, api, state.waterEffects);
        lastWater = state.waterEffects;
      }
      if (state.vegetation !== lastVegetation) {
        safeCall(api.setVegetation, api, state.vegetation);
        lastVegetation = state.vegetation;
      }
      if (state.buildings !== lastBuildings) {
        safeCall(api.setBuildings, api, state.buildings);
        lastBuildings = state.buildings;
      }
    }

    function applyGoogleTiles() {
      const tileset = getTileSet();
      if (!tileset) return;
      safeSet(tileset, 'maximumScreenSpaceError', state.googleSSE);
      safeSet(tileset, 'cacheBytes', Math.round(state.googleCacheMB * 1024 * 1024));
      safeSet(tileset, 'maximumCacheOverflowBytes', Math.round(state.googleOverflowMB * 1024 * 1024));
      safeSet(tileset, 'dynamicScreenSpaceError', state.googleDynamicSSE);
      safeSet(tileset, 'dynamicScreenSpaceErrorDensity', state.googleDynamicDensity);
      safeSet(tileset, 'dynamicScreenSpaceErrorFactor', state.googleDynamicFactor);
      safeSet(tileset, 'cullRequestsWhileMoving', state.googleCullMoving);
      safeSet(tileset, 'foveatedScreenSpaceError', state.googleFoveated);
      safeSet(tileset, 'showCreditsOnScreen', state.googleCredits);
      if (Cesium.ShadowMode) safeSet(tileset, 'shadows', state.googleShadows ? Cesium.ShadowMode.RECEIVE_ONLY : Cesium.ShadowMode.DISABLED);
      const shader = tileset.customShader;
      if (shader && typeof shader.setUniform === 'function') {
        try { shader.setUniform('u_lightIntensity', state.waterHighlight); } catch (_) {}
        try { shader.setUniform('u_windSpeed', state.waterWind); } catch (_) {}
      }
    }

    function applyAtmosphere() {
      safeSet(globe, 'enableLighting', state.globeLighting);
      safeSet(globe, 'lambertDiffuseMultiplier', state.lambert);
      safeSet(globe, 'showGroundAtmosphere', state.groundAtmosphere);
      safeSet(globe, 'atmosphereBrightnessShift', state.groundBrightness);
      safeSet(globe, 'atmosphereSaturationShift', state.groundSaturation);
      safeSet(globe, 'atmosphereHueShift', state.groundHue);
      if (scene.skyAtmosphere) {
        safeSet(scene.skyAtmosphere, 'show', true);
        safeSet(scene.skyAtmosphere, 'brightnessShift', state.skyBrightness);
        safeSet(scene.skyAtmosphere, 'saturationShift', state.skySaturation);
        safeSet(scene.skyAtmosphere, 'hueShift', state.skyHue);
      }
      if (scene.atmosphere && Cesium.DynamicAtmosphereLightingType) {
        safeSet(scene.atmosphere, 'dynamicLighting', state.dynamicLighting
          ? Cesium.DynamicAtmosphereLightingType.SUNLIGHT
          : Cesium.DynamicAtmosphereLightingType.NONE);
      }
      if (scene.sun) safeSet(scene.sun, 'show', state.sunVisible);
      if (fog) {
        safeSet(fog, 'enabled', state.fogEnabled);
        safeSet(fog, 'density', state.fogDensity);
        safeSet(fog, 'visualDensityScalar', state.fogVisualDensity);
        safeSet(fog, 'minimumBrightness', state.fogMinBrightness);
        safeSet(fog, 'screenSpaceErrorFactor', state.fogSSE);
        safeSet(fog, 'renderable', true);
      }
    }

    function applyQualityAndShadows() {
      const textureCap = glCaps.maxTextureSize;
      safeSet(globe, 'maximumScreenSpaceError', state.terrainSSE);
      safeSet(globe, 'tileCacheSize', Math.round(state.terrainCache));
      safeSet(globe, 'loadingDescendantLimit', Math.round(state.loadingDescendants));
      safeSet(globe, 'depthTestAgainstTerrain', state.depthTest);
      safeSet(globe, 'maximumUpsamplingLevel', Math.round(state.maxUpsampling));
      safeSet(viewer, 'resolutionScale', state.resolutionScale);
      if (post?.fxaa) safeSet(post.fxaa, 'enabled', state.fxaa);
      if ('msaaSamples' in scene) safeSet(scene, 'msaaSamples', Math.max(1, Math.min(state.msaaSamples, glCaps.maxSamples || 1)));

      if (state.globeShadows && Cesium.ShadowMode) safeSet(globe, 'shadows', Cesium.ShadowMode.RECEIVE_ONLY);
      else if (Cesium.ShadowMode) safeSet(globe, 'shadows', Cesium.ShadowMode.DISABLED);
      if (shadowMap) {
        safeSet(shadowMap, 'enabled', state.shadowEnabled);
        safeSet(shadowMap, 'size', Math.min(Math.round(state.shadowResolution), textureCap));
        safeSet(shadowMap, 'softShadows', state.softShadows);
        safeSet(shadowMap, 'maximumDistance', state.shadowDistance);
        safeSet(shadowMap, 'darkness', state.shadowDarkness);
      }
      if ('shadows' in viewer) safeSet(viewer, 'shadows', state.shadowEnabled);
    }

    function applyImagery() {
      if (typeof api.setImageryColorModifier === 'function') {
        safeCall(api.setImageryColorModifier, api, 'gvo2', {
          brightness: state.imageryBrightness,
          contrast: state.imageryContrast,
          saturation: state.imagerySaturation,
          gamma: state.imageryGamma,
          hue: state.imageryHue
        });
      } else if (imageryLayer) {
        safeSet(imageryLayer, 'brightness', state.imageryBrightness);
        safeSet(imageryLayer, 'contrast', state.imageryContrast);
        safeSet(imageryLayer, 'saturation', state.imagerySaturation);
        safeSet(imageryLayer, 'gamma', state.imageryGamma);
        safeSet(imageryLayer, 'hue', state.imageryHue);
      }
    }

    function applyWater() {
      safeSet(globe, 'showWaterEffect', state.nativeWaterWaves);
      if (state.oceanNormalMap && typeof Cesium.buildModuleUrl === 'function') {
        try {
          const url = Cesium.buildModuleUrl('Assets/Textures/waterNormalsSmall.jpg');
          safeSet(globe, 'oceanNormalMapUrl', url);
        } catch (_) {}
      } else if (lastNormalMapUrl !== undefined) {
        safeSet(globe, 'oceanNormalMapUrl', lastNormalMapUrl);
      }
      syncGeoFsFeatures();
    }

    const POST_SHADER = `
      uniform sampler2D colorTexture;
      varying vec2 v_textureCoordinates;
      uniform float uExposure;
      uniform float uToneMap;
      uniform float uSharpen;
      uniform float uClarity;
      uniform float uVignette;
      uniform float uGrain;
      uniform float uChromatic;
      uniform float uTemperature;
      uniform vec2 uTexel;
      vec3 acesFit(vec3 x) {
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }
      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      void main() {
        vec2 uv = v_textureCoordinates;
        vec2 radial = uv - vec2(0.5);
        vec2 chromaOffset = radial * (uChromatic * 0.0025);
        vec4 base = texture2D(colorTexture, uv);
        vec3 col;
        col.r = texture2D(colorTexture, uv + chromaOffset).r;
        col.g = base.g;
        col.b = texture2D(colorTexture, uv - chromaOffset).b;
        vec2 px = uTexel;
        vec3 n0 = texture2D(colorTexture, uv + vec2(px.x, 0.0)).rgb;
        vec3 n1 = texture2D(colorTexture, uv - vec2(px.x, 0.0)).rgb;
        vec3 n2 = texture2D(colorTexture, uv + vec2(0.0, px.y)).rgb;
        vec3 n3 = texture2D(colorTexture, uv - vec2(0.0, px.y)).rgb;
        vec3 localAverage = (n0 + n1 + n2 + n3) * 0.25;
        col += (col - localAverage) * uSharpen;
        col += (col - localAverage) * uClarity;
        col = max(col, vec3(0.0)) * uExposure;
        col = mix(col, acesFit(col), uToneMap);
        col *= vec3(1.0 + 0.055 * uTemperature, 1.0, 1.0 - 0.055 * uTemperature);
        float vignette = 1.0 - smoothstep(0.20, 0.95, dot(radial, radial) * 1.9);
        col *= (1.0 - uVignette) + uVignette * vignette;
        float noise = hash12(gl_FragCoord.xy) - 0.5;
        col += noise * uGrain;
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), base.a);
      }
    `;

    function ensurePostStage() {
      if (customStage || !Cesium.PostProcessStage || !post?.add) return;
      try {
        customStage = new Cesium.PostProcessStage({
          name: 'geofs-msfs-visual-overhaul-v2',
          fragmentShader: POST_SHADER,
          uniforms: {
            uExposure: () => Number(state.exposure),
            uToneMap: () => state.toneMap ? 1.0 : 0.0,
            uSharpen: () => Number(state.sharpen),
            uClarity: () => Number(state.clarity),
            uVignette: () => Number(state.vignette),
            uGrain: () => Number(state.filmGrain),
            uChromatic: () => Number(state.chromaticAberration),
            uTemperature: () => Number(state.colorTemperature),
            uTexel: () => new Cesium.Cartesian2(1 / Math.max(scene.canvas.width, 1), 1 / Math.max(scene.canvas.height, 1))
          }
        });
        post.add(customStage);
      } catch (error) {
        customStage = null;
        console.warn('[GVO2] Custom post-process stage could not be created:', error);
      }
    }

    let aoNoiseCanvas = null;
    function makeAONoiseCanvas() {
      if (aoNoiseCanvas) return aoNoiseCanvas;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const image = ctx.createImageData(64, 64);
        // Deterministic 64x64 blue-noise-like dither texture for Cesium's HBAO sampler.
        let seed = 0x2f6e2b1;
        for (let i = 0; i < image.data.length; i += 4) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          const v = (seed >>> 24) & 255;
          image.data[i] = v; image.data[i + 1] = v; image.data[i + 2] = v; image.data[i + 3] = 255;
        }
        ctx.putImageData(image, 0, 0);
        aoNoiseCanvas = canvas;
        return aoNoiseCanvas;
      } catch (_) { return null; }
    }

    function applyPostProcessing() {
      ensurePostStage();
      if (customStage) safeSet(customStage, 'enabled', true);
      if (post) {
        safeSet(post, 'exposure', state.exposure);
        if (post.bloom) {
          safeSet(post.bloom, 'enabled', state.bloom);
          try {
            post.bloom.contrast = 112;
            post.bloom.brightness = -0.28;
            post.bloom.delta = 1.0;
            post.bloom.sigma = 2.0;
            post.bloom.stepSize = 1.0;
          } catch (_) {}
        }
        if (post.ambientOcclusion) {
          const ao = post.ambientOcclusion;
          const aoSupported = !Cesium.PostProcessStageLibrary?.isAmbientOcclusionSupported ||
            Cesium.PostProcessStageLibrary.isAmbientOcclusionSupported(scene.context);
          const noise = makeAONoiseCanvas();
          if (state.ambientOcclusion && aoSupported && noise) {
            try { ao.randomTexture = noise; } catch (_) {}
            try { ao.intensity = 1.4; ao.bias = 0.06; ao.lengthCap = 0.34; ao.stepSize = 1.5; } catch (_) {}
          }
          safeSet(ao, 'enabled', state.ambientOcclusion && aoSupported && !!noise);
        }
      }
    }

    function applyAll() {
      if (destroyed || !viewer || viewer.isDestroyed?.()) return;
      try {
        applyQualityAndShadows();
        applyAtmosphere();
        applyWater();
        applyImagery();
        applyGoogleTiles();
        applyPostProcessing();
        try { scene.requestRender(); } catch (_) {}
        try { viewer.resize(); } catch (_) {}
        updateStatus();
      } catch (error) {
        console.error('[GVO2] Apply failed:', error);
        setStatus('一部の設定を適用できません。対応外の項目は自動的にスキップします。');
      }
    }

    function queueApply() {
      if (applyQueued) return;
      applyQueued = true;
      requestAnimationFrame(() => {
        applyQueued = false;
        applyAll();
      });
    }

    async function setGoogleTiles(enabled) {
      if (googleToggleBusy) return;
      if (typeof nativeSetGoogleTiles !== 'function') {
        state.google3D = false;
        refreshControl('google3D');
        setStatus('このGeoFSビルドにはGoogle 3D Tiles APIがありません。');
        return;
      }
      if (enabled && !geofs.googleAPIKey) {
        state.google3D = false;
        refreshControl('google3D');
        setStatus('GeoFS側のGoogle 3D Tilesキーが見つかりません。');
        return;
      }
      googleToggleBusy = true;
      setStatus(enabled ? 'Google Photorealistic 3D Tilesを読み込み中…' : 'GeoFS標準地形に戻しています…');
      try {
        await nativeSetGoogleTiles.call(api, enabled);
        state.google3D = !!api.googleTileset;
        lastGoogle = state.google3D;
        if (state.google3D) {
          // Keep Google data credits visible. Apply compatible tileset LOD/cache controls.
          setTimeout(() => { applyGoogleTiles(); queueApply(); }, 300);
          setTimeout(() => { applyGoogleTiles(); queueApply(); }, 1200);
        } else {
          // Native GeoFS vegetation/buildings are restored by GeoFS itself.
          lastVegetation = !!graphics.vegetation;
          lastBuildings = !!graphics.buildings;
        }
        refreshControl('google3D');
        updateStatus(state.google3D ? 'Google Photorealistic 3D Tiles 有効' : 'GeoFS標準地形に戻しました');
      } catch (error) {
        console.error('[GVO2] Google Tiles toggle failed:', error);
        state.google3D = !!api.googleTileset;
        refreshControl('google3D');
        setStatus('Google 3D Tilesを開始できませんでした。GeoFS標準地形に戻してください。');
      } finally {
        googleToggleBusy = false;
      }
    }

    function updateStatus() {
      if (!statusNode) return;
      const terrain = api.terrainProviderName || 'GeoFS';
      const city = api.googleTileset ? 'Google 3D ON' : 'Google 3D OFF';
      const distance = api.renderingSettings?.viewingDistance ?? graphics.advanced?.viewingDistance ?? '?';
      statusNode.textContent = `${terrain} · LOD ${distance} · ${city} · ${FEATURES.length} controls`;
    }

    function formatValue(feature, value) {
      if (feature.key === 'fogDensity') return Number(value).toFixed(5);
      if (feature.key === 'googleDynamicDensity') return Number(value).toFixed(4);
      if (feature.step < 0.01) return Number(value).toFixed(3) + (feature.unit || '');
      if (feature.step < 1) return Number(value).toFixed(2) + (feature.unit || '');
      return String(value) + (feature.unit || '');
    }

    function refreshControl(key) {
      if (!root) return;
      const feature = FEATURES.find((item) => item.key === key);
      if (!feature) return;
      const control = root.querySelector(`[data-feature="${key}"]`);
      if (!control) return;
      if (feature.type === 'toggle') control.checked = !!state[key];
      else {
        control.value = String(state[key]);
        const out = root.querySelector(`[data-value="${key}"]`);
        if (out) out.textContent = formatValue(feature, state[key]);
      }
    }

    function applyProfile(name) {
      const profiles = {
        realistic: {
          resolutionScale: isMobile ? 0.95 : 1.15, terrainSSE: 1.0, terrainCache: isMobile ? 900 : 1800,
          loadingDescendants: 40, shadowResolution: isMobile ? 1024 : 2048, shadowDistance: isMobile ? 1300 : 2600,
          shadowDarkness: 0.45, msaaSamples: isMobile ? 1 : Math.min(2, glCaps.maxSamples),
          sharpen: 0.12, clarity: 0.04, bloom: false, ambientOcclusion: false, vignette: 0.025,
          filmGrain: 0, chromaticAberration: 0, toneMap: false
        },
        ultra: {
          resolutionScale: isMobile ? 1.0 : 1.4, terrainSSE: 0.65, terrainCache: isMobile ? 1200 : 3200,
          loadingDescendants: 70, shadowResolution: Math.min(4096, glCaps.maxTextureSize), shadowDistance: 4200,
          shadowDarkness: 0.42, msaaSamples: Math.min(4, glCaps.maxSamples), sharpen: 0.16, clarity: 0.06,
          bloom: true, ambientOcclusion: false, vignette: 0.02, filmGrain: 0, chromaticAberration: 0, toneMap: true
        },
        mobile: {
          resolutionScale: 0.8, terrainSSE: 1.8, terrainCache: 600, loadingDescendants: 20,
          shadowResolution: 1024, shadowDistance: 1000, shadowDarkness: 0.5,
          msaaSamples: 1, sharpen: 0.08, clarity: 0.02, bloom: false, ambientOcclusion: false,
          vignette: 0.015, filmGrain: 0, chromaticAberration: 0, toneMap: false
        }
      };
      const p = profiles[name] || profiles.realistic;
      Object.assign(state, p);
      if (profileSelect) profileSelect.value = name;
      for (const f of FEATURES) refreshControl(f.key);
      queueApply();
      setStatus(`${name.toUpperCase()} profile applied`);
    }

    function buildPanel() {
      panelHost = document.createElement('div');
      panelHost.id = 'geofs-msfs-visual-overhaul-v2-host';
      panelHost.style.cssText = 'position:fixed;right:12px;bottom:82px;z-index:2147483646;';
      root = panelHost.attachShadow({ mode: 'open' });
      const styles = `
        :host{all:initial}*{box-sizing:border-box}.fab{border:1px solid #7890a8;color:#fff;background:rgba(10,18,28,.95);border-radius:999px;padding:10px 14px;font:800 12px/1.1 system-ui,sans-serif;letter-spacing:.04em;box-shadow:0 8px 30px #0009;cursor:pointer}
        .panel{width:min(370px,calc(100vw - 24px));max-height:min(78vh,760px);overflow:auto;color:#edf5fc;background:rgba(8,15,24,.97);border:1px solid #3a5066;border-radius:15px;padding:13px;box-shadow:0 18px 54px #000b;font:12px/1.45 system-ui,sans-serif;backdrop-filter:blur(14px)}
        .head{display:flex;align-items:center;justify-content:space-between;gap:8px;position:sticky;top:-13px;background:rgba(8,15,24,.97);padding:2px 0 10px;z-index:2}.title{font-size:13px;font-weight:900;letter-spacing:.04em}.sub{color:#9fb2c4;font-size:10px}.close{background:transparent;border:0;color:#d9e5ef;font-size:23px;cursor:pointer}
        .profile{display:flex;gap:7px;align-items:center;margin:6px 0 10px}.profile select{flex:1}.profile button{background:#1a3852;color:#fff;border:1px solid #4b6e8c;border-radius:7px;padding:8px 9px;font-weight:700}
        select{width:100%;background:#142536;color:#f4f8fc;border:1px solid #3c566d;border-radius:8px;padding:8px;font:inherit}
        details{border-top:1px solid #28394a;padding:7px 0}summary{cursor:pointer;font-weight:800;color:#c7ddf0;padding:4px 1px;list-style:none}summary::-webkit-details-marker{display:none}summary:after{content:'＋';float:right;color:#8ca6bc}details[open] summary:after{content:'−'}
        .item{padding:8px 1px 9px;border-top:1px solid rgba(126,153,176,.13)}.row{display:flex;justify-content:space-between;gap:9px;align-items:center}.name{font-weight:650;color:#e3edf5}.val{color:#91c9ff;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:10px}.hint{display:block;color:#8198ab;font-size:9px;line-height:1.35;margin-top:3px}
        input[type=range]{width:100%;margin:9px 0 1px;accent-color:#83c3ff}input[type=checkbox]{width:17px;height:17px;accent-color:#7fc0ff;flex:0 0 auto}
        .toggleline{display:flex;align-items:center;justify-content:space-between;gap:12px}.status{border-top:1px solid #2a4053;margin-top:9px;padding-top:8px;min-height:30px;color:#aac1d5;font-size:10px;overflow-wrap:anywhere}.fps{color:#93e0bc;font-variant-numeric:tabular-nums}
        .buttons{display:flex;gap:7px;margin:9px 0}.buttons button{flex:1;border:1px solid #496b88;border-radius:8px;padding:9px 6px;background:#1c405f;color:#f6fbff;font:700 11px system-ui;cursor:pointer}.buttons .alt{background:#172635;border-color:#3a4b5b}.note{font-size:9px;color:#8397a9;line-height:1.4;margin-top:8px}
        [hidden]{display:none!important}
      `;
      const header = `
        <div class="head"><div><div class="title">GEOFS · ADVANCED VISUAL OVERHAUL</div><div class="sub">v${VERSION} · Cesium 1.96 compatible · 63 controls</div></div><button class="close" id="close" aria-label="close">×</button></div>
        <div class="profile"><select id="profile"><option value="realistic">REALISTIC · 自然な高画質</option><option value="ultra">ULTRA · GPU優先・高負荷</option><option value="mobile">MOBILE · 軽量</option></select><button id="applyProfile">適用</button></div>
      `;
      root.innerHTML = `<style>${styles}</style><button class="fab" id="fab">GVO 2 · 63 VISUALS</button><section class="panel" id="panel" hidden>${header}<div id="controls"></div><div class="status" id="status">GeoFSの描画設定を読み込み中…</div><div class="fps">FPS: <span id="fps">--</span></div><div class="buttons"><button id="apply">全設定を再適用</button><button class="alt" id="restore">起動時設定に戻す</button></div><div class="note">反射について：既存GeoFSの水面シェーダーuniformを調整します。真のSSR/レイトレース反射や航空機塗装のPBR反射を新設するものではありません。Google 3D Tilesの実写データ・ネットワーク・GPU性能に依存します。<br>※MAX相当は端末の発熱・クラッシュに注意。Googleの帰属表示は常に有効にしてください。</div></section>`;
      document.body.appendChild(panelHost);
      statusNode = root.getElementById('status');
      fpsNode = root.getElementById('fps');
      profileSelect = root.getElementById('profile');
      const controls = root.getElementById('controls');

      for (const group of FEATURE_GROUPS) {
        const details = document.createElement('details');
        details.open = group.id === 'quality' || group.id === 'surface' || group.id === 'post';
        const summary = document.createElement('summary');
        summary.textContent = group.title;
        details.appendChild(summary);
        for (const feature of FEATURES.filter((f) => f.group === group.id)) {
          const item = document.createElement('div');
          item.className = 'item';
          const row = document.createElement('div');
          row.className = feature.type === 'toggle' ? 'toggleline' : 'row';
          const name = document.createElement('span');
          name.className = 'name';
          name.textContent = feature.label;
          row.appendChild(name);
          if (feature.type === 'toggle') {
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = !!state[feature.key];
            input.dataset.feature = feature.key;
            input.addEventListener('change', () => onFeatureChange(feature, input.checked));
            row.appendChild(input);
          } else {
            const out = document.createElement('output');
            out.className = 'val';
            out.dataset.value = feature.key;
            out.textContent = formatValue(feature, state[feature.key]);
            row.appendChild(out);
            const input = document.createElement('input');
            input.type = 'range';
            input.min = String(feature.min);
            input.max = String(feature.max);
            input.step = String(feature.step);
            input.value = String(state[feature.key]);
            input.dataset.feature = feature.key;
            input.addEventListener('input', () => {
              state[feature.key] = Number(input.value);
              out.textContent = formatValue(feature, state[feature.key]);
              queueApply();
            });
            item.appendChild(row);
            item.appendChild(input);
          }
          if (feature.hint) {
            const hint = document.createElement('small');
            hint.className = 'hint';
            hint.textContent = feature.hint;
            item.appendChild(hint);
          }
          if (feature.type === 'toggle') item.appendChild(row);
          details.appendChild(item);
        }
        controls.appendChild(details);
      }

      root.getElementById('fab').addEventListener('click', () => { root.getElementById('panel').hidden = false; root.getElementById('fab').hidden = true; });
      root.getElementById('close').addEventListener('click', () => { root.getElementById('panel').hidden = true; root.getElementById('fab').hidden = false; });
      root.getElementById('apply').addEventListener('click', () => { applyAll(); setStatus('全63項目を再適用しました。'); });
      root.getElementById('applyProfile').addEventListener('click', () => applyProfile(profileSelect.value));
      root.getElementById('restore').addEventListener('click', restoreNative);
    }

    function onFeatureChange(feature, value) {
      state[feature.key] = value;
      if (feature.key === 'google3D') {
        setGoogleTiles(value);
        return;
      }
      if (feature.key === 'vegetation' || feature.key === 'buildings' || feature.key === 'waterEffects') {
        syncGeoFsFeatures();
      }
      queueApply();
    }

    function restoreNative() {
      if (destroyed) return;
      try {
        if (!!api.googleTileset !== original.googleTiles && typeof nativeSetGoogleTiles === 'function') {
          Promise.resolve(nativeSetGoogleTiles.call(api, original.googleTiles)).catch((error) => console.warn('[GVO2] Google Tiles restore:', error));
        }
        Object.keys(graphics).forEach((key) => { delete graphics[key]; });
        Object.assign(graphics, clone(original.graphics));
        safeCall(api.renderingQuality, api, Number(original.graphics?.quality ?? 3), true);
        if (typeof api.removeImageryColorModifier === 'function') safeCall(api.removeImageryColorModifier, api, 'gvo2');
        if (typeof api.removeAtmosphereColorModifier === 'function') safeCall(api.removeAtmosphereColorModifier, api, 'gvo2');
        safeCall(api.setWaterEffect, api, original.waterEffect);
        safeCall(api.setVegetation, api, original.vegetation);
        safeCall(api.setBuildings, api, original.buildings);
        lastWater = original.waterEffect;
        lastVegetation = original.vegetation;
        lastBuildings = original.buildings;
        setTimeout(() => {
          safeSet(scene, 'highDynamicRange', original.highDynamicRange);
          safeSet(scene, 'gamma', original.gamma);
          if (original.fog && fog) Object.entries(original.fog).forEach(([k, v]) => safeSet(fog, k, v));
          Object.entries(original.globe).forEach(([k, v]) => safeSet(globe, k, v));
          if (original.sky && scene.skyAtmosphere) Object.entries(original.sky).forEach(([k, v]) => safeSet(scene.skyAtmosphere, k, v));
          if (scene.atmosphere) safeSet(scene.atmosphere, 'dynamicLighting', original.atmosphereDynamicLighting);
          if (scene.sun) safeSet(scene.sun, 'show', original.sunShow);
          if (shadowMap && original.shadowMap) Object.entries(original.shadowMap).forEach(([k, v]) => safeSet(shadowMap, k, v));
          if ('shadows' in viewer) safeSet(viewer, 'shadows', original.viewerShadows);
          safeSet(scene, 'msaaSamples', original.msaaSamples);
          if (post?.fxaa) safeSet(post.fxaa, 'enabled', original.fxaa);
          if (post && original.exposure !== undefined) safeSet(post, 'exposure', original.exposure);
          if (post?.bloom) safeSet(post.bloom, 'enabled', original.bloom);
          if (post?.ambientOcclusion) safeSet(post.ambientOcclusion, 'enabled', original.ambientOcclusion);
          if (imageryLayer && original.imagery) Object.entries(original.imagery).forEach(([k, v]) => safeSet(imageryLayer, k, v));
          if (customStage && post?.remove) { try { post.remove(customStage); } catch (_) {} customStage = null; }
          if (original.oceanNormalMapUrl !== undefined) safeSet(globe, 'oceanNormalMapUrl', original.oceanNormalMapUrl);
          try { scene.requestRender(); } catch (_) {}
          setStatus('GeoFS起動時の描画設定に復元しました。');
        }, 650);
      } catch (error) {
        console.error('[GVO2] Restore failed:', error);
        setStatus('復元できない項目があります。GeoFSを再読み込みしてください。');
      }
    }

    function cleanup() {
      destroyed = true;
      try { if (typeof postRenderRemove === 'function') postRenderRemove(); } catch (_) {}
      try { if (window.jQuery && qualityChangeHandler) window.jQuery(document.body).off('qualityChange.gvo2', qualityChangeHandler); } catch (_) {}
      try { panelHost?.remove(); } catch (_) {}
      try { if (window[GLOBAL_KEY]) window[GLOBAL_KEY].active = false; } catch (_) {}
    }

    function installHooks() {
      if (window.jQuery) {
        qualityChangeHandler = () => setTimeout(() => { if (!destroyed) applyAll(); }, 80);
        window.jQuery(document.body).on('qualityChange.gvo2', qualityChangeHandler);
      }
      if (scene.postRender?.addEventListener) {
        postRenderRemove = scene.postRender.addEventListener(() => {
          fpsFrames++;
          const now = performance.now();
          if (now - fpsStart >= 1000) {
            const fps = Math.round(fpsFrames * 1000 / (now - fpsStart));
            fpsFrames = 0;
            fpsStart = now;
            if (fpsNode) fpsNode.textContent = String(fps);
          }
        });
      }
    }

    buildPanel();
    installHooks();
    window[GLOBAL_KEY] = {
      active: true,
      state,
      features: FEATURES.map((f) => ({ key: f.key, label: f.label, group: f.group, type: f.type })),
      togglePanel: () => {
        if (!root) return;
        const panel = root.getElementById('panel');
        const fab = root.getElementById('fab');
        const open = panel.hidden;
        panel.hidden = !open;
        fab.hidden = open;
      },
      apply: applyAll,
      setProfile: applyProfile,
      restore: restoreNative,
      cleanup
    };

    // GeoFS quality=0 switches on its advanced rendering controls. We set the
    // verified in-game values once, then manage live Cesium values separately.
    try {
      graphics.quality = 0;
      graphics.advancedAtmosphere = true;
      graphics.volumetricClouds = true;
      graphics.advanced = graphics.advanced || {};
      Object.assign(graphics.advanced, {
        resolutionScale: state.resolutionScale,
        viewingDistance: 7,
        tileCacheSize: state.terrainCache,
        fxaa: true,
        msaaSamples: state.msaaSamples,
        globeLighting: true,
        dropShadow: true,
        softShadows: true,
        scatteringQuality: 5,
        cloudDensity: 0.9
      });
      safeCall(api.renderingQuality, api, 0, true);
    } catch (error) {
      console.warn('[GVO2] Could not set GeoFS advanced quality mode:', error);
    }

    applyAll();
    console.info(`[GVO2] GeoFS Advanced Visual Overhaul ${VERSION} loaded`, {
      cesiumVersion: Cesium.VERSION || 'unknown',
      isMobile,
      controls: FEATURES.length,
      googleTilesAvailable: typeof nativeSetGoogleTiles === 'function' && !!geofs.googleAPIKey,
      postProcessStage: !!customStage
    });
    window.addEventListener('pagehide', cleanup, { once: true });
  }

  bootTimer = setInterval(waitForGeoFS, 500);
  waitForGeoFS();
})();
