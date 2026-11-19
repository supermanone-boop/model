/*
 * HUMAN SAM — FULL THROTTLE-DRIVEN ANIMATION BUILD
 * Target: GeoFS 3.9 / Cesium 1.96
 *
 * ONE CONSOLE SCRIPT:
 *  - Registers Human Sam as a native local aircraft.
 *  - Adds one row to the official aircraft chooser.
 *  - Loads through GeoFS's native change() -> load() -> parseRecord() -> init() path.
 *  - Uses the root GLB already in the Hugging Face folder.
 *  - Plays the GLB's real embedded skeletal clips with Cesium ModelAnimationCollection.
 *  - Uses throttle continuously for animation phase speed, not just clip switching.
 *  - Controls walking speed and steering using GeoFS's native controls.
 *  - Keeps frame collision points and jump physics; adds JUMP above BRAKES.
 *
 * Important: aircraft.json must be replaced with the matching file in this ZIP first.
 */
(async function HumanSamFullThrottleBuild() {
  "use strict";

  const CFG = {
    id: "human_sam",
    name: "Human Sam",
    baseURL: "https://huggingface.co/supermanone-boop/ITAMI/resolve/main/human-aircraft/",
    glb: "locomotion-collection-sam-3d-person-animated.glb",

    maxSpeed: 4.5,             // throttle 100% = 4.5 m/s (16.2 km/h)
    acceleration: 2.8,         // m/s²
    braking: 5.0,               // m/s²
    turnRate: 82,               // degrees/second at full stick and speed
    turnAtStandstill: 0.2,

    jumpVelocity: 3.6,          // m/s
    jumpCooldownMs: 850,

    // The visible mesh correction is kept separate from aircraft heading/collision axes.
    // Set to +/-90 only if the user's GLB is visibly sideways after the first load.
    modelYawOffset: 0,

    cameraDistance: 2.65,
    cameraLookAtHeight: 0.95,

    controlIntervalMs: 30,
    animationRenderIntervalMs: 30,

    // Reference travel speeds associated with the Sam locomotion clips.
    clipReferenceSpeed: {
      idle: 0,
      walk: 1.3,
      brisk: 1.7,
      jog: 2.8,
      run: 4.5
    },

    // Actions documented by the source GLB. Names are matched against the actual GLB names first.
    clipOrderFallback: ["idle", "walk", "brisk", "jog", "run", "carry", "sitStand"]
  };

  const W = window;
  const D = document;
  const C = W.Cesium;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const finite = (x, fallback = 0) => Number.isFinite(Number(x)) ? Number(x) : fallback;
  const wrap360 = x => ((x % 360) + 360) % 360;
  const deg = x => x * Math.PI / 180;

  // Remove previous Human Sam experimental scripts before starting this full build.
  for (const name of [
    "HumanSamFull",
    "HumanSamAutoRegisterAndAnimate",
    "HumanSamAnimationYawFix",
    "__HUMAN_SAM_COMPLETE_FIX__",
    "__HUMAN_SAM_ANIM__",
    "__humanSamController"
  ]) {
    try { W[name]?.stop?.(); } catch (_) {}
  }

  // Restore the previous experimental Aircraft.init hook, if it was installed.
  const gBefore = W.geofs;
  const protoBefore = gBefore?.aircraft?.Aircraft?.prototype;
  if (protoBefore?.__humanSamInitHookInstalled && protoBefore.__humanSamOriginalInit) {
    protoBefore.init = protoBefore.__humanSamOriginalInit;
    try { delete protoBefore.__humanSamInitHookInstalled; delete protoBefore.__humanSamOriginalInit; } catch (_) {}
  }

  async function waitForGeoFS() {
    for (let i = 0; i < 160; i++) {
      const g = W.geofs;
      if (g?.aircraft?.instance && g?.aircraft?.Aircraft?.prototype && g?.aircraftList && g?.api?.viewer && C && W.controls) return g;
      await sleep(250);
    }
    throw new Error("GeoFSの飛行画面が初期化されていません。飛行画面で実行してください。");
  }

  const g = await waitForGeoFS();
  const scene = g.api.viewer.scene;
  const ac = g.aircraft.instance;

  // 1) Register first. GeoFS Aircraft.load() then fetches path + 'aircraft.json'.
  g.aircraftList[CFG.id] = {
    name: CFG.name,
    path: CFG.baseURL,
    local: true
  };
  console.info("[Human Sam] Registered local aircraft:", CFG.id, CFG.baseURL);

  // 2) Add the chooser row. GeoFS's existing delegated [data-aircraft] listener handles clicks.
  function addOfficialRow() {
    const list = D.querySelector(".geofs-aircraft-list");
    if (!list) return false;
    if (list.querySelector(`[data-aircraft="${CFG.id}"]`)) return true;
    const template = list.querySelector("[data-aircraft]");
    if (!template?.parentElement) return false;
    const row = template.cloneNode(false);
    row.removeAttribute("id");
    row.removeAttribute("data-livery");
    row.setAttribute("data-aircraft", CFG.id);
    row.textContent = CFG.name;
    row.title = CFG.name;
    row.style.cursor = "pointer";
    template.parentElement.appendChild(row);
    return true;
  }
  let rowAdded = addOfficialRow();
  for (let i = 0; !rowAdded && i < 40; i++) {
    await sleep(200);
    rowAdded = addOfficialRow();
  }
  console.info("[Human Sam] Official chooser row:", rowAdded ? "added" : "not available (native registration still active)");

  // 3) Load through GeoFS's own aircraft loader; the user does NOT need to select it first.
  console.info("[Human Sam] Calling native Aircraft.change()...");
  await ac.change(CFG.id, null, true);
  const loadedId = ac.aircraftRecord?.id || ac.id;
  if (g.aircraft.instance !== ac || loadedId !== CFG.id) {
    throw new Error("GeoFS標準ローダーがHuman Samを読み込めませんでした。aircraft.jsonの上書き・Commit・GLB名を確認してください。current=" + loadedId);
  }
  console.info("[Human Sam] Native aircraft.json parsed and initialized.");

  // 4) Wait for the actual Cesium GLB model to be ready and in the scene.
  const root = ac.parts?.root;
  const wrapper = root?.["3dmodel"];
  if (!root || !wrapper || typeof wrapper.getReadyPromise !== "function") {
    throw new Error("root.3dmodelがありません。今回のaircraft.jsonでHugging Face上を置き換えてください。");
  }
  if (wrapper.loadedPromise) await Promise.race([
    wrapper.loadedPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("GeoFS Modelのロードが45秒でタイムアウトしました。")), 45000))
  ]);
  await Promise.race([
    wrapper.getReadyPromise(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("GLBのready待ちが45秒でタイムアウトしました。GLB URL/CORS/ファイル名を確認してください。")), 45000))
  ]);

  if (g.aircraft.instance !== ac) throw new Error("GLB読み込み中に機体が切り替わりました。");
  const model = wrapper._model;
  const collection = model?.activeAnimations;
  if (!model || !model.ready || !collection || typeof collection.addAll !== "function" || typeof collection.add !== "function") {
    throw new Error("Cesium Model / activeAnimationsがありません。モデルready=" + !!model?.ready);
  }
  model.show = true;
  console.info("[Human Sam] GLB ready; model.activeAnimations available.");

  // 5) Correct only the rendered GLB's yaw if configured. No collision/body heading is rotated.
  const originalModelTransform = wrapper.setPositionOrientationAndScale;
  if (CFG.modelYawOffset !== 0 && typeof originalModelTransform === "function") {
    wrapper.setPositionOrientationAndScale = function (lla, htr, scale, object3d) {
      const corrected = Array.isArray(htr) ? htr.slice() : [0, 0, 0];
      corrected[0] = finite(corrected[0]) + CFG.modelYawOffset;
      return originalModelTransform.call(this, lla, corrected, scale, object3d);
    };
    ac.object3d.compute(ac.llaLocation);
    ac.object3d.render(ac.llaLocation);
    scene.requestRender();
  }

  // 6) Keep foot contacts from aircraft.json; verify GeoFS actually registered them.
  const footPoints = (ac.collisionPoints || []).filter(point => point && point.part === root);
  if (footPoints.length < 4) {
    throw new Error("GeoFSに足元collisionPointsが登録されていません。今回のaircraft.jsonを上書きしてから再ロードしてください。registered=" + footPoints.length);
  }
  console.info("[Human Sam] Contact points registered:", footPoints.length, "boundingSphereRadius:", ac.boundingSphereRadius);

  // 7) Discover the exact GLB animation names via Cesium 1.96 ModelAnimationCollection.addAll().
  //    This is skeletal glTF animation; GeoFS part.animations only rotates/translates parts
  //    and does NOT drive a skinned character's bones.
  collection.removeAll();
  const discovered = collection.addAll({ loop: C.ModelAnimationLoop.REPEAT });
  const clips = (Array.isArray(discovered) ? discovered : []).map((animation, index) => ({
    index,
    name: String(animation?.name || ""),
    startTime: finite(animation?._runtimeAnimation?.startTime, 0),
    stopTime: finite(animation?._runtimeAnimation?.stopTime, 0)
  }));
  collection.removeAll();
  if (clips.length < 5) {
    throw new Error("このGLBからアニメーションを5個以上検出できませんでした。detected=" + clips.length + ". JSONだけでなくGLB本体も正しいか確認してください。");
  }
  console.table(clips);

  const norm = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const matchRules = {
    idle: [/\bidle\b/, /standing/, /standstill/],
    walk: [/relaxed.*walk/, /walk.*relaxed/],
    brisk: [/brisk.*walk/, /walk.*brisk/],
    jog: [/\bjog\b/, /jogging/],
    run: [/\brun\b/, /running/],
    carry: [/carry/, /carrying/],
    sitStand: [/sit.*stand/, /stand.*sit/]
  };
  const clipsByAction = {};
  for (const [action, patterns] of Object.entries(matchRules)) {
    clipsByAction[action] = clips.find(clip => patterns.some(pattern => pattern.test(norm(clip.name)))) || null;
  }
  // Fallback order is used only when exporters strip or rename clip labels.
  CFG.clipOrderFallback.forEach((action, index) => {
    if (!clipsByAction[action] && clips[index]) clipsByAction[action] = clips[index];
  });
  for (const action of ["idle", "walk", "brisk", "jog", "run"]) {
    if (!clipsByAction[action]) throw new Error("必須モーションを特定できません: " + action);
  }

  // 8) Throttle -> movement speed AND animation cycle rate, continuously.
  const rb = ac.rigidBody;
  if (!rb || typeof rb.integrateVelocities !== "function") throw new Error("GeoFS rigidBody.integrateVelocitiesがありません。");
  const originalIntegrateVelocities = rb.integrateVelocities;
  const originalAnimateWhilePaused = collection.animateWhilePaused;

  const state = {
    active: true,
    speed: 0,
    heading: wrap360(finite(ac.htr?.[0], 0)),
    action: null,
    activeAnimation: null,
    animationElapsed: 0,
    animationRate: 1,
    lastAnimationTick: performance.now(),
    firstAdvanceLogged: false,
    lastThrottle: 0,
    lastAnimationEvent: 0,
    lastYawLog: 0,
    shiftedUI: [],
    jumpLastAt: 0,
    jumpActive: false
  };

  function readThrottle() {
    return clamp(finite(W.controls?.throttle, 0), 0, 1);
  }

  function desiredMovementSpeed() {
    return readThrottle() * CFG.maxSpeed;
  }

  function chooseAction(speed) {
    if (speed < 0.025) return "idle";
    if (speed < 1.50) return "walk";
    if (speed < 2.25) return "brisk";
    if (speed < 3.60) return "jog";
    return "run";
  }

  function playAction(action, force = false) {
    const clip = clipsByAction[action];
    if (!clip || !state.active) return false;

    const speed = state.speed;
    const reference = CFG.clipReferenceSpeed[action] || CFG.maxSpeed;
    // The clip playback rate is a continuous function of throttle-derived speed.
    // It is NOT assigned through animation.multiplier (getter-only in Cesium 1.96).
    state.animationRate = action === "idle" ? 0.75 : clamp(speed / reference, 0.035, 1.45);

    if (!force && state.action === action && state.activeAnimation) return true;

    collection.removeAll();
    state.action = action;
    state.animationElapsed = 0;
    state.lastAnimationTick = performance.now();
    state.firstAdvanceLogged = false;

    const animationDuration = Math.max(clip.stopTime - clip.startTime, 0.001);
    state.activeAnimation = collection.add({
      index: clip.index,
      loop: C.ModelAnimationLoop.REPEAT,
      multiplier: 1,
      // Cesium 1.96 calls animationTime(duration, elapsedSceneTime). Return a
      // normalized phase derived from accumulated real-time x throttle rate.
      // Since multiplier=1, Cesium converts this back into local clip seconds.
      animationTime: function (duration, elapsedSceneTime) {
        return state.animationElapsed / Math.max(finite(duration, animationDuration), 0.001);
      }
    });

    if (state.activeAnimation?.start?.addEventListener) {
      state.activeAnimation.start.addEventListener(() => {
        console.info("[Human Sam] ANIMATION START:", action, "clip:", clip.name || clip.index);
      });
    }
    if (state.activeAnimation?.update?.addEventListener) {
      state.activeAnimation.update.addEventListener((modelArg, animationArg, localTime) => {
        if (!state.firstAdvanceLogged && finite(localTime) > 0.03) {
          state.firstAdvanceLogged = true;
          console.info("[Human Sam] ANIMATION ADVANCING:", action, "localTime:", finite(localTime).toFixed(3));
        }
      });
    }

    scene.requestRender();
    console.info("[Human Sam] ACTION:", action, "clip:", clip.name || clip.index, "throttle:", Math.round(readThrottle() * 100) + "%", "cycle rate:", state.animationRate.toFixed(3));
    return true;
  }

  // Start with IDLE immediately. If this doesn't raise ANIMATION ADVANCING,
  // the console will show a GLB/model/render problem instead of silently doing nothing.
  state.speed = desiredMovementSpeed();
  collection.animateWhilePaused = true;
  playAction("idle", true);

  // Physics hook: preserve GeoFS's normal force/collision calculation, then impose
  // horizontal ground speed and heading. Vertical velocity/gravity/jump are kept.
  function humanIntegrateVelocities(dt) {
    originalIntegrateVelocities.call(this, dt);
    if (!state.active || g.aircraft.instance !== ac || (ac.aircraftRecord?.id || ac.id) !== CFG.id) return;

    const step = clamp(finite(dt, 0), 0, 0.08);
    const throttle = readThrottle();
    state.lastThrottle = throttle;
    const brake = !!ac.brakesOn || finite(W.controls?.brakes, 0) > 0.5;
    const targetSpeed = brake ? 0 : throttle * CFG.maxSpeed;
    const accel = targetSpeed >= state.speed ? CFG.acceleration : CFG.braking;
    state.speed += clamp(targetSpeed - state.speed, -accel * step, accel * step);
    state.speed = clamp(state.speed, 0, CFG.maxSpeed);

    const controls = W.controls || {};
    const steering = clamp(finite(controls.steering, finite(controls.yaw, 0)), -1, 1);
    const speedFactor = CFG.turnAtStandstill + (1 - CFG.turnAtStandstill) * (state.speed / CFG.maxSpeed);
    state.heading = wrap360(state.heading + steering * CFG.turnRate * speedFactor * step);

    // GeoFS htr convention is [heading, pitch, roll]; Object3D's rotation order is [pitch, roll, heading].
    ac.htr = [state.heading, 0, 0];
    ac.object3d.setInitialRotation([0, 0, deg(state.heading)]);
    ac.object3d.compute(ac.llaLocation);

    // 0° = north (+Y), 90° = east (+X). Visual mesh correction does not enter this vector.
    const vx = Math.sin(deg(state.heading)) * state.speed;
    const vy = Math.cos(deg(state.heading)) * state.speed;
    const vz = finite(rb.v_linearVelocity?.[2], 0);
    rb.v_linearVelocity = [vx, vy, vz];
    rb.v_angularVelocity = [0, 0, 0];

    const desired = chooseAction(state.speed);
    if (desired !== state.action) playAction(desired, true);
  }
  rb.integrateVelocities = humanIntegrateVelocities;

  // Continuous animation phase update. The raw throttle value is used to set the
  // target cycle rate every 30ms; no multiplier setter or abrupt speed bands.
  const animationTimer = setInterval(() => {
    if (!state.active) return;
    if (g.aircraft.instance !== ac || (ac.aircraftRecord?.id || ac.id) !== CFG.id) {
      cleanup();
      return;
    }

    const now = performance.now();
    const dt = clamp((now - state.lastAnimationTick) / 1000, 0, 0.12);
    state.lastAnimationTick = now;

    // Keep state.speed in sync with throttle even while the flight physics is paused.
    const throttleSpeed = desiredMovementSpeed();
    state.lastThrottle = readThrottle();
    state.animationRate = state.action === "idle"
      ? 0.75
      : clamp(throttleSpeed / (CFG.clipReferenceSpeed[state.action] || CFG.maxSpeed), 0.035, 1.45);

    // This is the critical continuous mapping: 20% throttle => slower cycle than 60%,
    // 100% => source Run cycle at its authored 4.5 m/s speed.
    state.animationElapsed += dt * state.animationRate;

    const desired = chooseAction(state.speed > 0.04 ? state.speed : throttleSpeed);
    if (desired !== state.action) playAction(desired, true);
    scene.requestRender();
  }, CFG.animationRenderIntervalMs);

  // Jump: use GeoFS RigidBody's real applyCentralImpulse method.
  function jump() {
    if (!state.active || g.aircraft.instance !== ac || !ac.groundContact || state.jumpActive) return false;
    const now = performance.now();
    if (now - state.jumpLastAt < CFG.jumpCooldownMs) return false;
    state.jumpLastAt = now;
    state.jumpActive = true;
    ac.groundContact = false;
    rb.applyCentralImpulse([0, 0, rb.mass * CFG.jumpVelocity]);
    setTimeout(() => {
      if (state.active && ac.groundContact) state.jumpActive = false;
    }, 350);
    console.info("[Human Sam] JUMP");
    return true;
  }

  W.controls.setters = W.controls.setters || {};
  const previousJumpSetter = W.controls.setters.humanSamJump;
  W.controls.setters.humanSamJump = {
    label: "Jump (Human Sam)",
    set: jump,
    unset: function () {}
  };

  // Add the jump option directly above the actual brake element when found.
  function findBrakeNode() {
    const candidates = Array.from(D.querySelectorAll("button,a,[role=button],div,span"));
    return candidates.find(el => {
      const cls = String(el.className || "").toLowerCase();
      const text = (el.textContent || "").trim().toLowerCase();
      const title = ((el.getAttribute("title") || "") + " " + (el.getAttribute("aria-label") || "")).toLowerCase();
      return /brake|ブレーキ/.test(cls + " " + text + " " + title) && (el.matches("button,[role=button],a") || /overlay|pad/.test(cls));
    }) || null;
  }

  let jumpButton = null;
  let jumpResize = null;
  function installJumpButton() {
    D.getElementById("humanSamJumpOption")?.remove();
    const brake = findBrakeNode();
    const button = D.createElement("button");
    button.id = "humanSamJumpOption";
    button.type = "button";
    button.textContent = "JUMP";
    button.title = "Jump (Human Sam)";
    button.setAttribute("aria-label", "Jump (Human Sam)");
    Object.assign(button.style, {
      position: "fixed", zIndex: "2147483000", width: "52px", height: "42px",
      border: "1px solid rgba(255,255,255,.85)", borderRadius: "7px",
      background: "#d58a28", color: "white", font: "bold 12px Arial,sans-serif",
      padding: "0", margin: "0", touchAction: "manipulation", pointerEvents: "auto"
    });
    button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); jump(); });

    if (brake) {
      D.body.appendChild(button);
      const position = () => {
        const r = brake.getBoundingClientRect();
        button.style.left = Math.round(r.left + (r.width - 52) / 2) + "px";
        button.style.top = Math.round(r.top - 46) + "px";
      };
      position();
      jumpResize = position;
      W.addEventListener("resize", jumpResize, { passive: true });
      console.info("[Human Sam] JUMP placed directly above BRAKES.");
    } else {
      Object.assign(button.style, { right: "12px", bottom: "calc(env(safe-area-inset-bottom, 0px) + 116px)" });
      D.body.appendChild(button);
      console.warn("[Human Sam] Brake element not identified; JUMP placed at lower-right fallback.");
    }
    jumpButton = button;
  }
  installJumpButton();

  // Close camera; movement/heading are untouched.
  try {
    g.camera.definitions.follow.distance = CFG.cameraDistance;
    g.camera.definitions.follow.lookAtHeight = CFG.cameraLookAtHeight;
    g.camera.set(null, "follow");
    if (g.camera.currentDefinition) {
      g.camera.currentDefinition.distance = CFG.cameraDistance;
      g.camera.currentDefinition.lookAtHeight = CFG.cameraLookAtHeight;
    }
    g.camera.update(1);
  } catch (error) {
    console.warn("[Human Sam] camera warning:", error);
  }

  function cleanup() {
    if (!state.active) return;
    state.active = false;
    clearInterval(animationTimer);
    if (rb.integrateVelocities === humanIntegrateVelocities) rb.integrateVelocities = originalIntegrateVelocities;
    try { collection.removeAll(); } catch (_) {}
    collection.animateWhilePaused = originalAnimateWhilePaused;
    if (originalModelTransform && wrapper.setPositionOrientationAndScale !== originalModelTransform) {
      wrapper.setPositionOrientationAndScale = originalModelTransform;
    }
    if (W.controls?.setters) {
      if (previousJumpSetter) W.controls.setters.humanSamJump = previousJumpSetter;
      else delete W.controls.setters.humanSamJump;
    }
    if (jumpResize) W.removeEventListener("resize", jumpResize);
    D.getElementById("humanSamJumpOption")?.remove();
    if (W.HumanSamFullThrottle === api) delete W.HumanSamFullThrottle;
    scene.requestRender();
    console.info("[Human Sam] Full controller stopped.");
  }

  const api = {
    config: CFG,
    clips,
    clipsByAction,
    state,
    jump,
    play(action) {
      if (!clipsByAction[action]) throw new Error("Unknown animation: " + action);
      return playAction(action, true);
    },
    diagnostics() {
      console.table(clips);
      console.log({
        aircraftId: ac.aircraftRecord?.id || ac.id,
        modelReady: !!model.ready,
        modelShow: model.show,
        animationCount: collection.length,
        animationsOnPause: collection.animateWhilePaused,
        currentAction: state.action,
        throttlePercent: Math.round(readThrottle() * 100),
        targetSpeedMps: Number(desiredMovementSpeed().toFixed(2)),
        animationRate: Number(state.animationRate.toFixed(3)),
        animationElapsed: Number(state.animationElapsed.toFixed(3)),
        lastAdvanceLogged: state.firstAdvanceLogged,
        collisionPoints: ac.collisionPoints?.filter(point => point.part === root).length,
        yaw: ac.htr?.[0]
      });
    },
    stop: cleanup
  };
  W.HumanSamFullThrottle = api;

  console.info("====================================================");
  console.info("[Human Sam] FULL THROTTLE-ANIMATION CONTROLLER READY");
  console.info("GLB clips:", clips.map(c => c.name || c.index));
  console.info("Throttle continuously controls speed AND animation cycle rate.");
  console.info("Test: HumanSamFullThrottle.play('run'); HumanSamFullThrottle.diagnostics()");
  console.info("====================================================");

})().catch(error => {
  console.error("[Human Sam FULL] ERROR:", error);
  alert("Human Samの完全版起動に失敗しました。\n" + (error?.message || error));
});
