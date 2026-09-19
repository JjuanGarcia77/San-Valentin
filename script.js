(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var captionEl = $("caption");
  var puzzleSection = $("puzzle");
  var letterSection = $("letter");
  var rainEl = $("rain");
  var envelope = $("envelope");
  var letterStage = $("letterStage");
  var letterHint = $("letterHint");
  var letterPaper = $("letterPaper");
  var phase = 1;

  /* ======================= ESCENA 3D ======================= */

  var renderer, scene, camera, clock = new THREE.Clock();
  var planes = [];
  var skyStarted = false;

  function makePlane(colors) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.5, 2.55),
      new THREE.MeshPhongMaterial({ color: 0xf7f7fb, shininess: 60 })
    );
    g.add(body);
    var nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 0.55, 4),
      new THREE.MeshPhongMaterial({ color: colors[0], shininess: 40 })
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 1.5;
    g.add(nose);
    var wing = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 0.06, 1.05),
      new THREE.MeshPhongMaterial({ color: colors[0], shininess: 50 })
    );
    wing.position.y = 0.08; wing.position.z = -0.1;
    g.add(wing);
    var tailH = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.06, 0.6),
      new THREE.MeshPhongMaterial({ color: colors[0], shininess: 50 })
    );
    tailH.position.y = 0.05; tailH.position.z = -1.2;
    g.add(tailH);
    var tailV = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.85, 0.7),
      new THREE.MeshPhongMaterial({ color: colors[1], shininess: 50 })
    );
    tailV.position.y = 0.42; tailV.position.z = -1.18;
    g.add(tailV);
    var stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.52, 0.5),
      new THREE.MeshPhongMaterial({ color: colors[1], shininess: 60 })
    );
    stripe.position.z = -0.4;
    g.add(stripe);
    var prop = new THREE.Group();
    var bladeMat = new THREE.MeshPhongMaterial({ color: 0x22262e, shininess: 30 });
    var b1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.0, 0.06), bladeMat);
    var b2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.0, 0.06), bladeMat);
    b2.rotation.z = Math.PI / 2;
    prop.add(b1); prop.add(b2);
    var spinner = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12),
      new THREE.MeshPhongMaterial({ color: colors[1], shininess: 80 }));
    spinner.position.z = 0.12;
    prop.add(spinner);
    prop.position.z = 1.82;
    prop.name = "prop";
    g.add(prop);
    return g;
  }

  function dotTexture(color) {
    var c = document.createElement("canvas");
    c.width = c.height = 64;
    var ctx = c.getContext("2d");
    var grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.35, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(32, 32, 32, 0, Math.PI * 2); ctx.fill();
    return new THREE.CanvasTexture(c);
  }

  var trailTex = dotTexture("#ff2e63");

  function makeTrail(colorList) {
    var N = 2400;
    var pos = new Float32Array(N * 3);
    var base = new Float32Array(N * 3);
    var col = new Float32Array(N * 3);
    var birth = new Float32Array(N);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    var mat = new THREE.PointsMaterial({
      size: 0.42, map: trailTex, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95
    });
    var pts = new THREE.Points(geo, mat);
    var h = 0, count = 0;
    return {
      mesh: pts,
      add: function (x, y, z, t, life) {
        var i = h * 3;
        pos[i] = x; pos[i + 1] = y; pos[i + 2] = z;
        var c = colorList[(Math.random() * colorList.length) | 0];
        base[i] = c.r; base[i + 1] = c.g; base[i + 2] = c.b;
        birth[h] = t;
        col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b;
        h = (h + 1) % N;
        if (count < N) count++;
        geo.attributes.color.needsUpdate = true;
        geo.attributes.position.needsUpdate = true;
        geo.setDrawRange(0, count);
      },
      fade: function (t, life) {
        var oldest = (h - count + N) % N;
        for (var k = 0; k < count; k++) {
          var idx = (oldest + k) % N;
          var age = t - birth[idx];
          var f = 1 - age / life;
          if (f < 0) f = 0; else if (f > 1) f = 1;
          var j = idx * 3;
          col[j] = base[j] * f;
          col[j + 1] = base[j + 1] * f;
          col[j + 2] = base[j + 2] * f;
        }
        geo.attributes.color.needsUpdate = true;
      },
      flush: function () {
        count = 0; h = 0; geo.setDrawRange(0, 0);
      }
    };
  }

  function beginSky() {
    if (skyStarted) return;
    skyStarted = true;
    var canvas = $("scene3d");
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    } catch (e) {
      captionEl.textContent = "Este navegador no soporta WebGL. Abre la página con Chrome o Edge.";
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xa8d8ff, 70, 180);

    var bgC = document.createElement("canvas");
    bgC.width = 8; bgC.height = 512;
    var bgX = bgC.getContext("2d");
    var bgG = bgX.createLinearGradient(0, 0, 0, 512);
    bgG.addColorStop(0, "#4d9fff");
    bgG.addColorStop(0.5, "#a9d9ff");
    bgG.addColorStop(1, "#eef6ff");
    bgX.fillStyle = bgG; bgX.fillRect(0, 0, 8, 512);
    scene.background = new THREE.CanvasTexture(bgC);

    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 500);
    camera.position.set(0, 3.4, 46);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xbfd4ff, 0.85));
    var sun = new THREE.DirectionalLight(0xfff2e0, 1.0);
    sun.position.set(24, 30, 14);
    scene.add(sun);

    var sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dotTexture("#ffe9a8"), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.9
    }));
    sunSprite.scale.set(34, 34, 1);
    sunSprite.position.set(34, 22, -70);
    scene.add(sunSprite);

    for (var ci = 0; ci < 9; ci++) {
      (function () {
        var cloud = new THREE.Group();
        var n = 3 + ((Math.random() * 4) | 0);
        for (var i = 0; i < n; i++) {
          var s = new THREE.Mesh(
            new THREE.SphereGeometry(2.2 + Math.random() * 2.4, 12, 12),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42 })
          );
          s.position.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3);
          s.scale.y = 0.55;
          cloud.add(s);
        }
        cloud.position.set(-38 + Math.random() * 80, 5 + Math.random() * 15, -40 - Math.random() * 34);
        cloud.userData.speed = 0.3 + Math.random() * 0.5;
        scene.add(cloud);
      })();
    }

    function addPlane(path, colors) {
      var mesh = makePlane(colors);
      scene.add(mesh);
      planes.push({ mesh: mesh, path: path });
    }

    var redIdx = [
      { r: 1.0, g: 0.27, b: 0.45 },
      { r: 1.0, g: 0.85, b: 0.9 },
      { r: 1.0, g: 0.48, b: 0.62 },
      { r: 0.95, g: 1.0, b: 1.0 }
    ];
    var blueIdx = [
      { r: 0.35, g: 0.78, b: 1.0 },
      { r: 0.85, g: 0.95, b: 1.0 },
      { r: 0.3, g: 0.55, b: 0.95 },
      { r: 0.7, g: 0.88, b: 1.0 }
    ];
    var goldIdx = [
      { r: 1.0, g: 0.82, b: 0.4 },
      { r: 1.0, g: 0.95, b: 0.75 },
      { r: 0.98, g: 0.63, b: 0.38 },
      { r: 0.9, g: 1.0, b: 0.8 }
    ];
    var violetIdx = [
      { r: 0.78, g: 0.5, b: 1.0 },
      { r: 0.9, g: 0.8, b: 1.0 },
      { r: 0.55, g: 0.32, b: 0.95 },
      { r: 1.0, g: 0.78, b: 0.95 }
    ];
    var tealIdx = [
      { r: 0.2, g: 0.9, b: 0.8 },
      { r: 0.75, g: 1.0, b: 0.95 },
      { r: 0.0, g: 0.65, b: 0.75 },
      { r: 0.5, g: 0.95, b: 0.9 }
    ];

    addPlane(
      { period: 12, kind: "heart", center: new THREE.Vector3(0, 0.6, 0), scale: 0.55, trailLife: 14 },
      [0xffffff, 0xff2e63, 0xffffff]
    );
    addPlane(
      { period: 7, kind: "ring", center: new THREE.Vector3(16.5, 1.2, 0), radius: 5.4, trailLife: 8 },
      [0xffffff, 0x2e86ff, 0xffffff]
    );
    addPlane(
      { period: 9.5, kind: "heart", center: new THREE.Vector3(-12.5, -1.4, -7), scale: 0.42, trailLife: 10.5 },
      [0xffffff, 0xffc23e, 0xffffff]
    );
    addPlane(
      { period: 20, kind: "orbit", center: new THREE.Vector3(0, 2.6, 0), radius: 26, tilt: 0.3, trailLife: 7 },
      [0xffffff, 0x9b5cff, 0xffffff]
    );
    addPlane(
      { period: 14, kind: "orbit", center: new THREE.Vector3(-2, 1.0, 2), radius: 17, tilt: -0.22, trailLife: 7 },
      [0xffffff, 0x00b8a9, 0xffffff]
    );

    var trailColors = [redIdx, blueIdx, goldIdx, violetIdx, tealIdx];

    function pathPoint(p, t) {
      var x = Math.sin(t); x = x * x * x;
      var y;
      if (p.kind === "heart") {
        y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        return new THREE.Vector3(p.center.x + p.scale * 16 * x, p.center.y + p.scale * y, p.center.z || 0);
      }
      if (p.kind === "ring") {
        return new THREE.Vector3(
          p.center.x + p.radius * Math.cos(t),
          p.center.y,
          p.radius * Math.sin(t)
        );
      }
      var tilt = p.tilt || 0;
      var baseY = p.radius * Math.sin(t);
      var baseZ = p.radius * Math.cos(t);
      return new THREE.Vector3(
        p.center.x + p.radius * Math.cos(t),
        p.center.y + baseY * Math.cos(tilt) - baseZ * Math.sin(tilt),
        p.center.z + baseY * Math.sin(tilt) + baseZ * Math.cos(tilt)
      );
    }

    planes.forEach(function (P, i) {
      P.trail = makeTrail(trailColors[i]);
    });

    var dummy = new THREE.Object3D();

    var T = 0;
    var prevAngle = [0, 0, 0, 0, 0];

    function animate() {
      requestAnimationFrame(animate);
      var dt = Math.min(clock.getDelta(), 0.05);
      T += dt;

      scene.children.forEach(function (ch) {
        if (ch.userData && ch.userData.speed && ch.type === "Group") {
          ch.position.x += ch.userData.speed * dt;
          if (ch.position.x > 62) ch.position.x = -62;
        }
      });

      planes.forEach(function (P, i) {
        var u = ((T / P.period) % 1);
        if (u < 0) u += 1;
        var t = u * Math.PI * 2;
        var pt = pathPoint(P.path, t);
        P.mesh.position.copy(pt);

        var a = pathPoint(P.path, t + 0.03);
        dummy.position.copy(pt);
        dummy.lookAt(a);
        var baseQ = dummy.quaternion.clone();

        var ang = Math.atan2(a.y - pt.y, a.x - pt.x);
        var dAng = ang - prevAngle[i];
        while (dAng > Math.PI) dAng -= 2 * Math.PI;
        while (dAng < -Math.PI) dAng += 2 * Math.PI;
        prevAngle[i] = ang;
        var rollF = P.path.kind === "heart" ? 1 : (P.path.kind === "orbit" ? 0.45 : 0.35);
        var roll = Math.max(-0.7, Math.min(0.7, dAng * 10)) * rollF;
        baseQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
        P.mesh.quaternion.copy(baseQ);

        var p = P.mesh.getObjectByName("prop");
        if (p) p.rotation.z += dt * 34;

        P.trail.add(pt.x, pt.y, pt.z, T, P.path.trailLife);
      });

      var orbit = Math.sin(T * 0.09) * 2.2;
      var camZ = 46 - 12 * Math.min(1, T / 26);
      camera.position.set(orbit, 3.4 + Math.sin(T * 0.07) * 1.2, camZ);
      camera.lookAt(2.2, 0.5, 0);

      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener("resize", function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  /* ======================= ARRANQUE DIRECTO ======================= */

  beginSky();
  setTimeout(function () {
    captionEl.classList.add("show");
  }, 300);

  setTimeout(showPuzzle, 1200);

  /* ======================= PUZZLE DE PUNTOS ======================= */

  var puz = $("puzzleCanvas");
  var ctx = puz.getContext("2d");
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var PZ = 460;
  puz.width = PZ * dpr; puz.height = PZ * dpr;
  ctx.scale(dpr, dpr);

  var palette = [345, 25, 48, 160, 210, 285].map(function (h) { return { h: h, s: 88, l: 56 }; });

  var slots = [];
  var dots = [];
  var placed = 0;
  var solved = false;

  function heartXY(t) {
    var x = Math.sin(t); x = x * x * x;
    var y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    var cx = PZ / 2;
    var cy = PZ / 2 - 26;
    var R = PZ / 2 - 56;
    var py = cy - y * (R / 17);
    return { x: cx + x * R, y: py };
  }

  function buildPuzzle() {
    slots = [];
    dots = [];
    placed = 0;
    solved = false;
    for (var i = 0; i < 6; i++) {
      var t = (i / 6) * Math.PI * 2 + Math.PI * 0.5;
      var hp = heartXY(t);
      slots.push({
        x: hp.x, y: hp.y, filled: false,
        color: "hsl(" + palette[i].h + ", 85%, " + 62 + "%)"
      });
    }
    slots.sort(function (a, b) { return a.color.localeCompare(b.color); });

    function validSpot(x, y) {
      for (var k = 0; k < slots.length; k++) {
        var dx = x - slots[k].x, dy = y - slots[k].y;
        if (dx * dx + dy * dy < 70 * 70) return false;
      }
      for (var j = 0; j < dots.length; j++) {
        var ddx = x - dots[j].x, ddy = y - dots[j].y;
        if (ddx * ddx + ddy * ddy < 64 * 64) return false;
      }
      return true;
    }

    function scatter() {
      var attempt = 0;
      while (attempt < 300) {
        attempt++;
        var x = 56 + Math.random() * (PZ - 112);
        var y = 44 + Math.random() * (PZ - 108);
        if (validSpot(x, y)) return { x: x, y: y };
      }
      return null;
    }
    for (var n = 0; n < 6; n++) {
      var sp = scatter();
      if (sp) dots.push({ x: sp.x, y: sp.y, slot: slots[n], placed: false });
    }
    while (dots.length < 6) {
      dots.push({ x: 86 + Math.random() * (PZ - 172), y: 76 + Math.random() * (PZ - 164), slot: slots[dots.length], placed: false });
    }
  }

  var drag = null;

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function drawPuzzle() {
    ctx.clearRect(0, 0, PZ, PZ);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.shadowColor = "rgba(255,46,99,0.9)";
    ctx.shadowBlur = 14;
    for (var t = 0; t < Math.PI * 2; t += 0.02) {
      var p1 = heartXY(t);
      var p2 = heartXY(t + 0.02);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    ctx.shadowBlur = 0;

    for (var s = 0; s < slots.length; s++) {
      var sl = slots[s];
      ctx.beginPath();
      ctx.arc(sl.x, sl.y, 21, 0, Math.PI * 2);
      ctx.strokeStyle = sl.color;
      ctx.globalAlpha = sl.filled ? 1 : 0.55;
      ctx.lineWidth = sl.filled ? 4 : 2.5;
      ctx.setLineDash([7, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    for (var d = 0; d < dots.length; d++) {
      var dot = dots[d];
      if (dot.placed) continue;
      var pulse = 1 + Math.sin(Date.now() / 400 + d) * 0.08;
      var r = 19 * pulse;
      var colr = slotOf(dot).color;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, r, 0, Math.PI * 2);
      ctx.fillStyle = colr;
      ctx.shadowColor = colr;
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, r - 6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fill();
    }
  }

  function slotOf(dot) { return dot.slot; }

  function placeDot(dot) {
    var slot = slotOf(dot);
    dot.x = slot.x; dot.y = slot.y;
    dot.placed = true;
    slot.filled = true;
    placed++;
    $("puzzleProgress").textContent = placed + " / 6";
    drawPuzzle();
    burst(slot.x, slot.y, slot.color);
    if (placed === 6) onSolve();
  }

  function burst(x, y, color) {
    if (window.anime) {
      var parts = [];
      for (var i = 0; i < 16; i++) {
        var a = Math.random() * Math.PI * 2;
        var sp = 40 + Math.random() * 90;
        parts.push({ x: x, y: y, ax: Math.cos(a) * sp, ay: Math.sin(a) * sp * 0.85, c: color, r: 3 + Math.random() * 3 });
      }
      var draw = function () {
        drawPuzzle();
        for (var i = 0; i < parts.length; i++) {
          var p = parts[i];
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = p.c;
          ctx.fill();
        }
      };
      anime({
        targets: parts, x: function (p) { return p.x + p.ax; }, y: function (p) { return p.y + p.ay; }, opacity: 0,
        duration: 900, delay: anime.stagger(20), easing: "easeOutCubic",
        update: function () { draw(); }
      });
      return;
    }
    for (var j = 0; j < 16; j++) {
      (function () {
        var a = Math.random() * Math.PI * 2;
        var sp = 40 + Math.random() * 90;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * sp, y + Math.sin(a) * sp, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.7;
        ctx.fill();
        ctx.globalAlpha = 1;
      })();
    }
  }

  function drawStatic() {
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.shadowColor = "rgba(255,46,99,0.9)";
    ctx.shadowBlur = 14;
    for (var t = 0; t < Math.PI * 2; t += 0.02) {
      var p1 = heartXY(t);
      var p2 = heartXY(t + 0.02);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    for (var s = 0; s < slots.length; s++) {
      var sl = slots[s];
      ctx.beginPath();
      ctx.arc(sl.x, sl.y, 21, 0, Math.PI * 2);
      ctx.strokeStyle = sl.color;
      ctx.globalAlpha = sl.filled ? 1 : 0.55;
      ctx.lineWidth = sl.filled ? 4 : 2.5;
      ctx.setLineDash([7, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  function onSolve() {
    if (solved) return;
    solved = true;
    phase = 3;
    captionEl.textContent = "¡Ya la carta, amor!";
    captionEl.classList.add("show");
    setTimeout(function () {
      fadeToLetter();
    }, 800);
  }

  puz.addEventListener("pointerdown", function (e) {
    if (solved) return;
    var pt = eventPos(e);
    for (var i = dots.length - 1; i >= 0; i--) {
      var d = dots[i];
      if (!d.placed && !d.snapping && dist(d, pt) < 30) {
        drag = { dot: d, ox: d.x, oy: d.y };
        puz.setPointerCapture(e.pointerId);
        puz.style.cursor = "grabbing";
        return;
      }
    }
  });

  puz.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var pt = eventPos(e);
    drag.dot.x = pt.x;
    drag.dot.y = pt.y;
    drawPuzzle();
  });

  puz.addEventListener("pointerup", function (e) {
    if (!drag) return;
    var dot = drag.dot;
    puz.style.cursor = "grab";
    var s = slotOf(dot);
    var snapDist = dist(dot, s);
    if (snapDist < 46 && !s.filled) {
      dot.snapping = true;
      if (window.anime) {
        anime({
          targets: { x: dot.x, y: dot.y },
          x: s.x, y: s.y,
          duration: 320, easing: "easeOutBack",
          update: function (a) {
            a.animations.forEach(function (an) {
              if (an.property === "x") dot.x = an.currentValue;
              if (an.property === "y") dot.y = an.currentValue;
            });
            drawPuzzle();
          },
          complete: function () {
            dot.snapping = false;
            placeDot(dot);
          }
        });
      } else {
        placeDot(dot);
      }
    } else {
      if (window.anime) {
        dot.snapping = true;
        anime({
          targets: { x: dot.x, y: dot.y },
          x: drag.ox, y: drag.oy,
          duration: 240, easing: "easeOutQuad",
          update: function (a) {
            a.animations.forEach(function (an) {
              if (an.property === "x") dot.x = an.currentValue;
              if (an.property === "y") dot.y = an.currentValue;
            });
            drawPuzzle();
          },
          complete: function () {
            dot.snapping = false;
            drawPuzzle();
          }
        });
      } else {
        dot.x = drag.ox; dot.y = drag.oy;
        drawPuzzle();
      }
    }
    drag = null;
  });

  function eventPos(e) {
    var rect = puz.getBoundingClientRect();
    var scaleX = PZ / rect.width, scaleY = PZ / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function showPuzzle() {
    if (phase !== 1) return;
    phase = 2;
    captionEl.textContent = "Amor, resuélvelo";
    captionEl.classList.add("show");
    buildPuzzle();
    drawPuzzle();
    puzzleSection.classList.add("show");
    setInterval(function () { if (!solved && phase === 2) drawPuzzle(); }, 60);
    rain();
  }

  /* ======================= LLUVIA DE PUNTOS ======================= */

  function rain() {
    for (var i = 0; i < 26; i++) {
      (function (i) {
        var span = document.createElement("i");
        var s = 5 + Math.random() * 11;
        span.style.left = (Math.random() * 100) + "vw";
        span.style.width = s + "px";
        span.style.height = s + "px";
        span.style.animationDuration = (3 + Math.random() * 4) + "s";
        span.style.animationDelay = (i * 0.4 + Math.random() * 2) + "s";
        rainEl.appendChild(span);
        setTimeout(function () { span.remove(); }, (3 + Math.random() * 4 + i * 0.4) * 1000 + 4000);
      })(i);
    }
  }

  /* ======================= CARTA ======================= */

  var letterOpened = false;

  function fadeToLetter() {
    puzzleSection.classList.remove("show");
    captionEl.classList.remove("show");
    captionEl.textContent = "";
    buildLetter();
    setTimeout(function () {
      letterSection.classList.add("show");
    }, 300);
    rain();
  }

  function buildLetter() {
    var body = $("letterBody");
    body.innerHTML = "";

    var groups = [
      { cls: "first", text: "Mi amor, mi vida," },
      { cls: "open", text: "Hoy, en San Valentín, quería decirte lo mucho que te amo y que te quiero. Aunque el trabajo hoy nos tenga en caminos aparte, eso no me impide desearte tu feliz día, porque ni la distancia ni nada le gana al corazón que te tengo." },
      { cls: "", text: "Y quiero que sepas que siempre voy a estar para ti, para lo que sea, cuando sea. Cuenta conmigo, mi amor, que yo ya conté contigo para toda la vida." },
      { cls: "", text: "También quiero que no se te olvide que: mi corazón te reconoce antes que mis ojos. Eres tú, amor. Eres tú, y siempre vas a ser tú." },
      { cls: "", text: "Tengo algo para ti, y te lo doy en persona, mi amor. No cabe en una carta, pero cabe en las ganas que tengo de verte, de abrazarte y de quedarme." },
      { cls: "besos", text: "Te amo mucho, mi amor. Feliz Día de San Valentín. Hoy, mañana y siempre, te elijo a ti. Besotes." },
      { cls: "sig", text: "Con todo mi amor," },
      { cls: "sig-name", text: "Tu futuro marido" }
    ];

    groups.forEach(function (g) {
      var p = document.createElement("p");
      if (g.cls) p.className = g.cls;
      p.textContent = g.text;
      body.appendChild(p);
    });
  }

  function revealPaper() {
    var ps = $("letterBody").querySelectorAll("p");
    if (!ps.length) return;
    if (!window.anime) {
      var i = 0;
      var walk = function () {
        if (i < ps.length) {
          ps[i].style.opacity = 1;
          ps[i].style.transform = "translateY(0)";
          i++;
          setTimeout(walk, 180);
        }
      };
      setTimeout(walk, 200);
      return;
    }
    anime({
      targets: ps,
      opacity: [0, 1],
      translateY: [14, 0],
      delay: anime.stagger(240, { start: 400 }),
      duration: 800,
      easing: "easeOutQuad"
    });
  }

  envelope.addEventListener("click", function () {
    if (letterOpened) return;
    letterOpened = true;
    envelope.classList.add("open");
    $("fadeStrip").style.opacity = "1";
    rain();
    setTimeout(function () {
      $("fadeStrip").style.opacity = "0";
      letterHint.style.opacity = "0";
      letterStage.classList.add("away");
      letterPaper.classList.add("show");
      revealPaper();
    }, 700);
  });

  /* ======================= DECORACIÓN FLOTANTE ======================= */

  (function spawnHearts() {
    var host = $("hearts");
    for (var i = 0; i < 26; i++) {
      var d = document.createElement("div");
      d.className = "dot-heart";
      var s = 6 + Math.random() * 14;
      d.style.left = (Math.random() * 100) + "vw";
      d.style.width = s + "px";
      d.style.height = s + "px";
      d.style.setProperty("--sway", ((Math.random() * 200 - 100) | 0) + "px");
      d.style.animationDuration = (9 + Math.random() * 9) + "s";
      d.style.animationDelay = (Math.random() * 12) + "s";
      d.style.opacity = 0;
      host.appendChild(d);
    }
  })();
  rain();

  window.addEventListener("resize", function () {
    puz.width = PZ * dpr;
    puz.height = PZ * dpr;
    ctx.scale(dpr, dpr);
  });
})();