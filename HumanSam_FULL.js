/*
 * HUMAN SAM — FULL COMPLETE BUILD FOR GEOFS 3.9 / CESIUM 1.96
 *
 * Single-file installer. It:
 *   1) Registers the local aircraft in geofs.aircraftList.
 *   2) Adds one entry to GeoFS's official aircraft list using its delegated
 *      [data-aircraft] click handler (no custom click/loader hooks).
 *   3) Loads it through the native Aircraft.change() -> load() -> parseRecord()
 *      -> init() -> addParts() path.
 *   4) Fits eight frame collision points to the loaded GLB bounds and refreshes
 *      the GeoFS broad-phase boundingSphereRadius.
 *   5) Drives ground movement from the real GeoFS throttle and controls.steering.
 *   6) Corrects only the visible GLB yaw (not aircraft heading/collision frame).
 *   7) Starts the GLB's real animations and advances them using wall-clock time
 *      while GeoFS is paused / requestRenderMode is sleeping.
 *   8) Adds JUMP directly above the native BRAKES pad and exposes a setter.
 *
 * Paste the whole script into the browser console while GeoFS is in the flight view.
 */
(async function HumanSamFullInstaller() {
  "use strict";

  const CFG = {
    id: "human_sam",
    name: "Human Sam",
    baseURL: "https://huggingface.co/supermanone-boop/ITAMI/resolve/main/human-aircraft/",
    glb: "locomotion-collection-sam-3d-person-animated.glb",

    // The previous attempt used the opposite sign. This is a MODEL-ONLY correction:
    // aircraft heading, steering and collision coordinates stay unrotated.
    modelYawDegrees: 90,

    maxSpeed: 4.5,              // 100% throttle = 4.5 m/s = 16.2 km/h
    acceleration: 2.8,          // m/s^2
    braking: 5.0,                // m/s^2
    turnRate: 82,                // deg/s at full steer and full speed
    turnAtStandstill: 0.22,

    jumpVelocity: 3.6,           // m/s upward
    jumpCooldownMs: 850,

    cameraDistance: 2.65,
    cameraLookAtHeight: 0.95,

    renderIntervalMs: 30,
    controlIntervalMs: 60,
    footClearance: 0.025,

    clipBaseSpeed: { idle: 0, walk: 1.3, brisk: 1.7, jog: 2.8, run: 4.5 },
    publishedClipOrder: ["idle", "walk", "brisk", "jog", "run", "carry", "sitStand"]
  };

  const W = window;
  const D = document;
  const C = W.Cesium;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const finite = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
  const wrap360 = v => ((v % 360) + 360) % 360;
  const rad = v => v * Math.PI / 180;
  const STATE_KEY = "__HUMAN_SAM_FULL__";

  // Remove older Human Sam attempts first; do not leave two physics/animation controllers running.
  try { W.HumanSamFull?.stop?.(); } catch (_) {}
  try { W.HumanSamAutoRegisterAndAnimate?.stop?.(); } catch (_) {}
  try { W.HumanSamAnimationYawFix?.stop?.(); } catch (_) {}
  try { W.__HUMAN_SAM_ANIM__?.stop?.(); } catch (_) {}
  try { W.__humanSamController?.stop?.(); } catch (_) {}
  try {
    const old = W.__HUMAN_SAM_COMPLETE_FIX__;
    if (old && typeof old.stop === "function") old.stop();
  } catch (_) {}

  // Restore the previous prototype init wrapper from earlier test versions, if one exists.
  const g0 = W.geofs;
  const oldProto = g0?.aircraft?.Aircraft?.prototype;
  if (oldProto?.__humanSamInitHookInstalled && oldProto.__humanSamOriginalInit) {
    oldProto.init = oldProto.__humanSamOriginalInit;
    try { delete oldProto.__humanSamInitHookInstalled; delete oldProto.__humanSamOriginalInit; } catch (_) {}
  }

  async function waitForGeoFS() {
    for (let i = 0; i < 160; i++) {
      const g = W.geofs;
      if (g?.aircraft?.instance && g?.aircraft?.Aircraft?.prototype && g?.aircraftList && g?.api?.viewer && C && W.controls) return g;
      await sleep(250);
    }
    throw new Error("GeoFSの飛行画面がまだ初期化されていません。飛行画面で実行してください。");
  }

  const g = await waitForGeoFS();
  const scene = g.api.viewer.scene;

  // ─────────────────────────────────────────────────────────────
  // A. Official registration only. GeoFS's own click delegate handles
  //    [data-aircraft] and calls geofs.aircraft.instance.change(id,...).
  // ─────────────────────────────────────────────────────────────
  g.aircraftList[CFG.id] = {
    name: CFG.name,
    path: CFG.baseURL,
    local: true
  };

  function addOfficialAircraftRow() {
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

  let rowAdded = addOfficialAircraftRow();
  if (!rowAdded) {
    for (let i = 0; i < 30 && !rowAdded; i++) {
      await sleep(200);
      rowAdded = addOfficialAircraftRow();
    }
  }
  console.info("[Human Sam] official registration:", CFG.id, "list row:", rowAdded);

  // ─────────────────────────────────────────────────────────────
  // B. Use only GeoFS's native aircraft loader. The aircraft.json is a JSON
  //    ARRAY because GeoFS parseRecord() reads JSON.parse(atob(definition))[0].
  // ─────────────────────────────────────────────────────────────
  const ac = g.aircraft.instance;
  console.info("[Human Sam] native Aircraft.change() starting...");
  await ac.change(CFG.id, null, true);

  const loadedId = ac.aircraftRecord?.id || ac.id;
  if (g.aircraft.instance !== ac || loadedId !== CFG.id) {
    throw new Error("GeoFS標準ローダーがHuman Samを読み込めませんでした。現在の機体ID=" + loadedId + "。Hugging Faceのaircraft.jsonとGLBの配置・名前を確認してください。");
  }
  console.info("[Human Sam] native aircraft.json loaded.");

  const root = ac.parts?.root;
  const wrapper = root?.["3dmodel"];
  if (!root || !root.object3d || !wrapper || typeof wrapper.getReadyPromise !== "function") {
    throw new Error("GeoFSのroot GLBパーツがありません。aircraft.jsonのparts.root.modelを確認してください。");
  }

  console.info("[Human Sam] waiting for GLB:", CFG.glb);
  await Promise.race([
    wrapper.getReadyPromise(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("GLB読み込みが45秒でタイムアウトしました。Hugging FaceのGLB URL / CORS / ファイル名を確認してください。")), 45000))
  ]);

  if (g.aircraft.instance !== ac) throw new Error("GLB読み込み中に機体が変更されました。");
  const model = wrapper._model;
  const collection = model?.activeAnimations;
  if (!model || !collection || typeof collection.addAll !== "function" || typeof collection.add !== "function") {
    throw new Error("GLBは読み込まれましたがCesiumのModelAnimationCollectionがありません。アニメーション付きGLBか確認してください。");
  }
  console.info("[Human Sam] GLB ready.");

  // Wait briefly for GeoFS's asynchronous flyTo()/guaranteed-ground-altitude step.
  for (let i = 0; i < 50; i++) {
    if (!g.pause && ac.startOnGround !== undefined) break;
    await sleep(100);
  }

  // ─────────────────────────────────────────────────────────────
  // C. Model-only yaw correction.
  //    Object3D.setModelOnlyRotation() also leaks into Object3D.htr in GeoFS 3.9.
  //    Instead, wrap only the GLB's GeoFS Model transform method. This corrects
  //    the rendered mesh without rotating aircraft.htr, joystick steering or collisions.
  // ─────────────────────────────────────────────────────────────
  const originalModelTransform = wrapper.setPositionOrientationAndScale;
  if (typeof originalModelTransform !== "function") {
    throw new Error("GeoFS Model.setPositionOrientationAndScale がありません。");
  }
  wrapper.setPositionOrientationAndScale = function (lla, htr, scale, object3d) {
    let corrected = htr;
    if (Array.isArray(htr)) {
      corrected = htr.slice();
      corrected[0] = finite(corrected[0]) + CFG.modelYawDegrees;
    }
    return originalModelTransform.call(this, lla, corrected, scale, object3d);
  };
  ac.object3d.compute(ac.llaLocation);
  ac.object3d.render(ac.llaLocation);
  scene.requestRender();
  console.info("[Human Sam] visual GLB yaw correction:", CFG.modelYawDegrees, "degrees (aircraft heading unchanged).");

  // ─────────────────────────────────────────────────────────────
  // D. Restore + fit the actual foot collision points.
  //    GeoFS addParts() attaches contactProperties[part.type] to each point.
  //    Aircraft.init() derives boundingSphereRadius once from these points.
  //    We fit their Z from the actual GLB world bounds and recalc that radius.
  // ─────────────────────────────────────────────────────────────
  function fitFootCollision() {
    const jsonPoints = root.collisionPoints;
    const registeredPoints = (ac.collisionPoints || []).filter(p => p && p.part === root);
    if (!Array.isArray(jsonPoints) || jsonPoints.length < 4 || registeredPoints.length < 4) {
      throw new Error("GeoFSにrootのcollisionPointsが登録されていません。root.type='frame'とcontactProperties.frameを確認してください。");
    }

    let footZ = -0.90;
    let boundsInfo = "fallback -0.90m";
    const sphere = model.boundingSphere;
    if (sphere?.center && Number.isFinite(sphere.radius) && sphere.radius > 0) {
      try {
        const origin = C.Cartesian3.fromDegrees(ac.llaLocation[1], ac.llaLocation[0], ac.llaLocation[2]);
        const enu = C.Transforms.eastNorthUpToFixedFrame(origin, C.Ellipsoid.WGS84, new C.Matrix4());
        const inverse = C.Matrix4.inverse(enu, new C.Matrix4());
        const localCenter = C.Matrix4.multiplyByPoint(inverse, sphere.center, new C.Cartesian3());
        const fitted = localCenter.z - sphere.radius + CFG.footClearance;
        if (Number.isFinite(fitted) && fitted > -2.5 && fitted < 0.5) {
          footZ = fitted;
          boundsInfo = "GLB boundingSphere";
        }
      } catch (error) {
        console.warn("[Human Sam] bounds-based foot fit failed; using fallback:", error);
      }
    }

    const xy = [
      [-0.12, -0.10], [-0.12, 0.10], [0.12, -0.10], [0.12, 0.10],
      [-0.07, -0.10], [-0.07, 0.10], [0.07, -0.10], [0.07, 0.10]
    ];
    for (let i = 0; i < jsonPoints.length; i++) {
      const point = jsonPoints[i];
      point[0] = xy[i % xy.length][0];
      point[1] = xy[i % xy.length][1];
      point[2] = footZ;
    }

    // Refresh Object3D's cached worldPosition for every point.
    ac.object3d.compute(ac.llaLocation);
    let maxRadius = 0;
    for (const point of ac.collisionPoints) {
      maxRadius = Math.max(maxRadius, Math.hypot(point[0], point[1], point[2]));
    }
    ac.boundingSphereRadius = Math.max(maxRadius * 1.5, 1.2);
    ac.object3d.render(ac.llaLocation);
    scene.requestRender();

    console.info("[Human Sam] FOOT COLLISION READY", {
      source: boundsInfo,
      footZ: Number(footZ.toFixed(3)),
      contactPoints: registeredPoints.length,
      boundingSphereRadius: Number(ac.boundingSphereRadius.toFixed(3)),
      contactType: root.type,
      hasContactProperties: !!ac.definition.contactProperties?.frame
    });
  }
  fitFootCollision();

  // ─────────────────────────────────────────────────────────────
  // E. Discover the real GLB animation names with Cesium 1.96.
  //    addAll() returns ModelAnimation[]; name / multiplier are getters.
  // ─────────────────────────────────────────────────────────────
  collection.removeAll();
  collection.animateWhilePaused = true;
  const allAnimations = collection.addAll({ loop: C.ModelAnimationLoop.REPEAT });
  const clips = (Array.isArray(allAnimations) ? allAnimations : []).map((animation, index) => ({
    index,
    name: String(animation?.name || ""),
    duration: finite(animation?.stopTime, 0)
  }));
  collection.removeAll();
  if (clips.length < 5) {
    throw new Error("GLB内のアニメーションを5個以上検出できませんでした（検出=" + clips.length + "）。アニメーション入りのGLBを確認してください。");
  }
  console.table(clips);

  const normalize = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const patterns = {
    idle: [/\bidle\b/, /standing/, /standstill/],
    walk: [/relaxed.*walk/, /walk.*relaxed/],
    brisk: [/brisk.*walk/, /walk.*brisk/],
    jog: [/\bjog\b/, /jogging/],
    run: [/\brun\b/, /running/],
    carry: [/carry/, /carrying/],
    sitStand: [/sit.*stand/, /stand.*sit/]
  };
  const clipsByAction = {};
  for (const [action, tests] of Object.entries(patterns)) {
    clipsByAction[action] = clips.find(clip => tests.some(test => test.test(normalize(clip.name)))) || null;
  }
  // The Innerscene Sam locomotion set publishes these actions in this order.
  CFG.publishedClipOrder.forEach((action, index) => {
    if (!clipsByAction[action] && clips[index]) clipsByAction[action] = clips[index];
  });
  for (const required of ["idle", "walk", "brisk", "jog", "run"]) {
    if (!clipsByAction[required]) throw new Error("必須アニメーションを割り当てできません: " + required);
  }

  // ─────────────────────────────────────────────────────────────
  // F. Native GeoFS throttle + joystick movement.
  //    flight.tick() calls rigidBody.integrateVelocities(dt) after force/contact
  //    processing. Override only this aircraft instance's method, then preserve
  //    GeoFS integrateTransform(), collision response, terrain, and rendering.
  // ─────────────────────────────────────────────────────────────
  const rb = ac.rigidBody;
  if (!rb || typeof rb.integrateVelocities !== "function") {
    throw new Error("GeoFS rigidBody.integrateVelocities が取得できません。");
  }
  const originalIntegrateVelocities = rb.integrateVelocities;
  const state = {
    active: true,
    speed: 0,
    heading: wrap360(finite(ac.htr?.[0], 0)),
    jumping: false,
    jumpStartedAt: 0,
    lastJumpAt: 0,
    action: null,
    animation: null,
    animationElapsed: 0,
    lastAnimationWallTime: performance.now(),
    animationRate: 1,
    clips,
    clipsByAction,
    originalModelTransform,
    originalAnimateWhilePaused: false,
    originalControlsSetter: W.controls.setters?.humanSamJump,
    shiftedPads: []
  };

  function actionForSpeed(speed) {
    if (speed < 0.10) return "idle";
    if (speed < 1.50) return "walk";
    if (speed < 2.25) return "brisk";
    if (speed < 3.55) return "jog";
    return "run";
  }

  function playAction(action, force = false) {
    const clip = clipsByAction[action];
    if (!clip || !state.active) return false;
    const reference = CFG.clipBaseSpeed[action] || CFG.maxSpeed;
    const currentSpeed = state.speed;
    state.animationRate = action === "idle" ? 1 : clamp(currentSpeed / reference, 0.35, 1.35);

    if (!force && state.action === action && state.animation) return true;

    collection.removeAll();
    state.action = action;
    state.animationElapsed = 0;
    state.lastAnimationWallTime = performance.now();
    state.animationRate = action === "idle" ? 1 : clamp(currentSpeed / reference, 0.35, 1.35);

    // Keep multiplier at 1 (it is getter-only in Cesium 1.96).
    // animationTime() returns a normalized fraction driven by accumulated wall time.
    state.animation = collection.add({
      index: clip.index,
      loop: C.ModelAnimationLoop.REPEAT,
      multiplier: 1,
      animationTime: function (duration) {
        const d = Math.max(finite(duration, 0), 0.001);
        return state.animationElapsed / d;
      }
    });
    scene.requestRender();
    console.info("[Human Sam] ANIMATION PLAY", action, "clip=", clip.name || ("index " + clip.index), "rate=", state.animationRate.toFixed(2));
    return true;
  }

  function setMovement(dt) {
    const controls = W.controls || {};
    const throttle = clamp(finite(controls.throttle, 0), 0, 1);
    const brake = !!ac.brakesOn || finite(controls.brakes, 0) > 0.5;
    const target = brake ? 0 : throttle * CFG.maxSpeed;
    const acceleration = target >= state.speed ? CFG.acceleration : CFG.braking;
    state.speed += clamp(target - state.speed, -acceleration * dt, acceleration * dt);
    state.speed = clamp(state.speed, 0, CFG.maxSpeed);

    // controls.steering is GeoFS's final mixed steering value. It is calculated
    // from touch joystick, desktop yoke/mouse, keyboard and gamepad by controls.update().
    const steering = clamp(finite(controls.steering, finite(controls.yaw, 0)), -1, 1);
    const turnScale = CFG.turnAtStandstill + (1 - CFG.turnAtStandstill) * (state.speed / CFG.maxSpeed);
    state.heading = wrap360(state.heading + steering * CFG.turnRate * turnScale * dt);

    // GeoFS heading convention: 0° north, 90° east. Movement is ENU and is
    // deliberately independent from the GLB's visual +90° yaw correction.
    ac.object3d.setInitialRotation([0, 0, rad(state.heading)]);
    ac.htr = [state.heading, 0, 0];
    const vx = Math.sin(rad(state.heading)) * state.speed;
    const vy = Math.cos(rad(state.heading)) * state.speed;

    const vertical = finite(rb.v_linearVelocity?.[2], 0);
    rb.v_linearVelocity = [vx, vy, vertical];
    rb.v_angularVelocity = [0, 0, 0];
  }

  function humanIntegrateVelocities(dt) {
    originalIntegrateVelocities.call(this, dt);
    if (!state.active) return;
    if (g.aircraft.instance !== ac || (ac.aircraftRecord?.id || ac.id) !== CFG.id) {
      cleanup();
      return;
    }

    const step = clamp(finite(dt, 0), 0, 0.08);
    setMovement(step);

    // On ground, cancel gravity's residual vertical drift. During a jump, let
    // GeoFS gravity and the normal collision solver handle the complete arc.
    if (state.jumping) {
      if (ac.groundContact && rb.v_linearVelocity[2] <= 0.05 && performance.now() - state.jumpStartedAt > 150) {
        state.jumping = false;
        rb.v_linearVelocity[2] = 0;
        ac.groundContact = true;
      }
    } else if (ac.groundContact) {
      rb.v_linearVelocity[2] = 0;
    }
  }
  rb.integrateVelocities = humanIntegrateVelocities;

  // ─────────────────────────────────────────────────────────────
  // G. Jump setter + right-side UI option, immediately ABOVE BRAKES.
  // ─────────────────────────────────────────────────────────────
  function jump() {
    if (!state.active || g.aircraft.instance !== ac || (ac.aircraftRecord?.id || ac.id) !== CFG.id) return false;
    const now = performance.now();
    if (!ac.groundContact || state.jumping || now - state.lastJumpAt < CFG.jumpCooldownMs) return false;
    state.lastJumpAt = now;
    state.jumpStartedAt = now;
    state.jumping = true;
    ac.groundContact = false;
    rb.applyCentralImpulse([0, 0, rb.mass * CFG.jumpVelocity]);
    console.info("[Human Sam] JUMP");
    return true;
  }

  W.controls.setters = W.controls.setters || {};
  W.controls.setters.humanSamJump = {
    label: "Jump (Human Sam)",
    set: jump,
    unset: function () {}
  };

  function addJumpOption() {
    const pads = D.querySelector(".geofs-pads-container");
    const brakes = pads?.querySelector(".brakes-overlay");
    if (!pads || !brakes) {
      console.warn("[Human Sam] BRAKES UI not found yet; JUMP option will retry.");
      return false;
    }
    D.getElementById("humanSamJumpOption")?.remove();
    const button = D.createElement("button");
    button.id = "humanSamJumpOption";
    button.type = "button";
    button.className = "control-pad human-sam-jump-option";
    button.textContent = "JUMP";
    button.title = "Jump (Human Sam)";
    button.setAttribute("aria-label", "Jump (Human Sam)");
    Object.assign(button.style, {
      position: "absolute",
      right: "60px",
      bottom: "60px",
      width: "50px",
      height: "45px",
      boxSizing: "border-box",
      border: "1px solid rgba(255,255,255,.8)",
      borderRadius: "5px",
      background: "#d58a28",
      color: "white",
      font: "bold 12px Arial,sans-serif",
      textAlign: "center",
      padding: "0",
      margin: "0",
      zIndex: "2147483000",
      pointerEvents: "auto",
      touchAction: "manipulation",
      userSelect: "none"
    });
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      jump();
    });
    pads.insertBefore(button, brakes);

    // In the GeoFS right-side pad layout, the gear pad occupies bottom:60px.
    // Move the controls above it upward by one pad so JUMP sits directly over BRAKES.
    const shiftSelectors = [".gear-overlay", ".flaps-overlay", ".spoiler-overlay", ".trim-overlay"];
    for (const selector of shiftSelectors) {
      const element = pads.querySelector(selector);
      if (element) {
        const oldTransform = element.style.transform;
        state.shiftedPads.push({ element, oldTransform });
        element.style.transform = (oldTransform ? oldTransform + " " : "") + "translateY(-50px)";
      }
    }
    state.jumpButton = button;
    console.info("[Human Sam] JUMP option inserted above the official BRAKES pad.");
    return true;
  }

  addJumpOption();
  const jumpRetry = setInterval(() => {
    if (!state.active) { clearInterval(jumpRetry); return; }
    if (!D.getElementById("humanSamJumpOption")) addJumpOption();
  }, 1000);

  function keyJump(event) {
    if (event.repeat || String(event.key).toLowerCase() !== "j") return;
    const tag = event.target?.tagName;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || event.target?.isContentEditable) return;
    jump();
  }
  W.addEventListener("keydown", keyJump);

  // ─────────────────────────────────────────────────────────────
  // H. Animation pulse + explicit render. Cesium 1.96's update() skips a
  //    frozen scene time unless animateWhilePaused=true. animationTime() uses
  //    wall time, and requestRender() wakes requestRenderMode at ~33 FPS.
  // ─────────────────────────────────────────────────────────────
  function updateAnimations() {
    if (!state.active) return;
    if (g.aircraft.instance !== ac || (ac.aircraftRecord?.id || ac.id) !== CFG.id) {
      cleanup();
      return;
    }

    const now = performance.now();
    const elapsed = clamp((now - state.lastAnimationWallTime) / 1000, 0, 0.12);
    state.lastAnimationWallTime = now;
    state.animationElapsed += elapsed * state.animationRate;

    const desired = actionForSpeed(state.speed);
    if (desired !== state.action) playAction(desired, true);
    else if (state.action !== "idle") {
      const reference = CFG.clipBaseSpeed[state.action] || CFG.maxSpeed;
      state.animationRate = clamp(state.speed / reference, 0.35, 1.35);
    }
    scene.requestRender();
  }

  // Expose a small writable API object (no getter-only runtime properties).
  const api = {
    id: CFG.id,
    config: CFG,
    clips,
    clipsByAction,
    state,
    jump,
    play(action) {
      if (!clipsByAction[action]) throw new Error("Unknown Human Sam animation: " + action);
      return playAction(action, true);
    },
    setModelYaw(degrees) {
      CFG.modelYawDegrees = finite(degrees, 0);
      ac.object3d.compute(ac.llaLocation);
      ac.object3d.render(ac.llaLocation);
      scene.requestRender();
      console.info("[Human Sam] model yaw now", CFG.modelYawDegrees, "degrees");
      return CFG.modelYawDegrees;
    },
    diagnostics() {
      console.table(clips);
      console.log({
        aircraftId: ac.aircraftRecord?.id || ac.id,
        modelReady: !!model.ready,
        clipCount: clips.length,
        scheduledAnimations: collection.length,
        animateWhilePaused: collection.animateWhilePaused,
        currentAction: state.action,
        throttle: W.controls.throttle,
        speedMps: state.speed,
        heading: state.heading,
        steering: W.controls.steering,
        collisionPointCount: ac.collisionPoints?.length,
        boundingSphereRadius: ac.boundingSphereRadius,
        modelYawDegrees: CFG.modelYawDegrees
      });
    },
    stop() { cleanup(); }
  };

  function cleanup() {
    if (!state.active) return;
    state.active = false;
    clearInterval(animationTimer);
    clearInterval(jumpRetry);
    if (rb.integrateVelocities === humanIntegrateVelocities) rb.integrateVelocities = originalIntegrateVelocities;
    try { collection.removeAll(); } catch (_) {}
    collection.animateWhilePaused = false;
    if (wrapper.setPositionOrientationAndScale) wrapper.setPositionOrientationAndScale = originalModelTransform;
    if (W.controls?.setters?.humanSamJump) {
      if (state.originalControlsSetter) W.controls.setters.humanSamJump = state.originalControlsSetter;
      else delete W.controls.setters.humanSamJump;
    }
    W.removeEventListener("keydown", keyJump);
    D.getElementById("humanSamJumpOption")?.remove();
    for (const entry of state.shiftedPads) entry.element.style.transform = entry.oldTransform;
    if (W.HumanSamFull === api) delete W.HumanSamFull;
    scene.requestRender();
    console.info("[Human Sam] full controller stopped.");
  }

  W.HumanSamFull = api;
  playAction("idle", true);
  const animationTimer = setInterval(updateAnimations, CFG.renderIntervalMs);

  // ─────────────────────────────────────────────────────────────
  // I. Close follow camera and report success.
  // ─────────────────────────────────────────────────────────────
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
    console.warn("[Human Sam] close-camera setup warning:", error);
  }

  console.info("================================================");
  console.info("[Human Sam] FULL COMPLETE BUILD READY");
  console.info("Throttle: 0–100% = stop to 4.5 m/s (16.2 km/h)");
  console.info("Steering: official GeoFS controls.steering (touch stick / joystick / yoke)");
  console.info("Animation: Idle / Walk / Brisk Walk / Jog / Run");
  console.info("Jump: right-side option directly above BRAKES; J key; controls setter");
  console.info("Model-only yaw correction: " + CFG.modelYawDegrees + " degrees");
  console.info("Collision points: " + ac.collisionPoints.length + ", radius: " + ac.boundingSphereRadius.toFixed(2) + " m");
  console.info("Test: HumanSamFull.play('run'), HumanSamFull.diagnostics()");
  console.info("================================================");
})().catch(error => {
  console.error("[Human Sam FULL] ERROR:", error);
  alert("Human Samの登録・読み込みに失敗しました。\n" + (error?.message || error));
});
