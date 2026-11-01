// main.js — 应用入口与渲染循环
// 职责：
//   1) 初始化 WebGL2、编译着色器、构建几何 VBO（一次生成，每帧只更新矩阵）；
//   2) 计算场景层级矩阵 —— 太阳→地球（先倾角、后公转）→月球（手造白道面倾角矩阵），
//      以及完整太阳系（选做 E1）；
//   3) 每帧绘制：星空背景、太阳+光晕、行星与土星环、月球、轨道线、小行星带；
//   4) E2 日月食几何判定与 HUD 说明。

"use strict";

(function () {
    const C = AP2_CONFIG;
    let gl, canvas;
    const programs = {};
    const geos = {};
    let tex = null;
    let aspect = 1;
    let viewCache = null, projCache = null;

    // ---------- 初始化 ----------
    function initGL() {
        canvas = document.getElementById("glcanvas");
        gl = canvas.getContext("webgl2", { antialias: true });
        if (!gl) { alert("当前环境不支持 WebGL2"); return; }
        gl.enable(gl.DEPTH_TEST);
        resize();
        window.addEventListener("resize", resize);
    }

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(canvas.clientWidth * dpr);
        canvas.height = Math.floor(canvas.clientHeight * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);
        aspect = canvas.width / canvas.height;
    }

    function compilePrograms() {
        programs.planet = initShaders(gl, "vs-planet", "fs-planet");
        programs.line = initShaders(gl, "vs-line", "fs-line");
        programs.points = initShaders(gl, "vs-points", "fs-points");
        programs.glow = initShaders(gl, "vs-glow", "fs-glow");

        const uni = (p, names) => { const o = {}; names.forEach(n => o[n] = gl.getUniformLocation(p, n)); return o; };
        programs.u = {
            planet: uni(programs.planet, ["uProj", "uView", "uModel", "uTex", "uBright"]),
            line: uni(programs.line, ["uProj", "uView", "uModel", "uColor"]),
            points: uni(programs.points, ["uProj", "uView", "uModel", "uPointScale"]),
            glow: uni(programs.glow, ["uProj", "uView", "uModel", "uColor"])
        };
    }

    // 构造 VAO：按程序实际存在的 attribute 绑定
    function makeVAO(prog, data) {
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const bind = (arr, attrName, size) => {
            if (!arr) return;
            const loc = gl.getAttribLocation(prog, attrName);
            if (loc < 0) return;
            const b = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, b);
            gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        };
        bind(data.pos, "aPos", 3);
        bind(data.uv, "aUV", 2);
        bind(data.size, "aSize", 1);
        bind(data.color, "aColor", 3);
        if (data.idx) {
            const eb = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, eb);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.idx, gl.STATIC_DRAW);
        }
        gl.bindVertexArray(null);
        return {
            vao,
            indexed: !!data.idx,
            indexCount: data.idx ? data.idx.length : (data.count || data.pos.length / 3)
        };
    }

    function buildGeometry() {
        const sph = AP2Geo.createSphere(1, 72, 36);
        geos.sphere = makeVAO(programs.planet, sph);          // 单位球：所有天体共用，缩放交给模型矩阵
        geos.bg = makeVAO(programs.planet, AP2Geo.createSphere(1, 48, 24));
        geos.ring = makeVAO(programs.planet, AP2Geo.createRing(1, 1.5, 160)); // 单位环：随模型矩阵缩放
        geos.glow = makeVAO(programs.glow, AP2Geo.createBillboardQuad());
        geos.orbit = makeVAO(programs.line, { pos: AP2Geo.createCircleLine(1, 256) });
        geos.asteroids = makeVAO(programs.points, AP2Geo.createAsteroidBelt(C.asteroidBelt.inner, C.asteroidBelt.outer, C.asteroidBelt.count));
    }

    // ---------- 纹理 ----------
    function loadTextures() {
        const urls = {
            sun: C.sun.texture,
            earth: C.earth.texture,
            moon: C.moon.texture,
            mercury: "textures/2k_mercury.jpg",
            venus: "textures/2k_venus_surface.jpg",
            mars: "textures/2k_mars.jpg",
            jupiter: "textures/2k_jupiter.jpg",
            saturn: "textures/2k_saturn.jpg",
            ring: "textures/2k_saturn_ring_alpha.png",
            uranus: "textures/2k_uranus.jpg",
            neptune: "textures/2k_neptune.jpg"
        };
        return AP2Tex.loadAllTextures(gl, urls).then(res => {
            tex = res;
            tex.stars = AP2Tex.createStarFieldTexture(gl);
        });
    }

    // ---------- 场景矩阵（核心：层级与变换顺序）----------
    // 说明：所有矩阵均为列主序，列向量 v' = M * v，故最右侧的变换最先作用于顶点。
    function computeScene(t) {
        const s = AP2State;
        const rev = p => t * 360 / p * s.orbitSpeed;   // 公转角度
        const spin = p => t * 360 / p * s.spinSpeed;   // 自转角度
        const out = {};

        // —— 太阳（缓慢自转）——
        out.sunModel = mult(rotate(spin(C.sun.spinPeriod), 0, 1, 0),
                            scale(C.sun.radius, C.sun.radius, C.sun.radius));

        // —— 地球：先施加自转轴倾角，再叠加公转轨道变换（先转后挂）——
        // 地球轨道矩阵 = 公转旋转 · 公转平移（把地球放到轨道上）
        const earthOrbitM = mult(rotate(rev(C.earth.orbitPeriod), 0, 1, 0),
                                 translate(0, 0, -C.earth.orbitDist));
        // 地球模型 = 轨道 · 倾角旋转 · 自转 · 缩放
        // 执行顺序（从右到左）：缩放 → 自转 → 轴倾角(先转) → 公转旋转 → 公转平移
        out.earthOrbitM = earthOrbitM;
        out.earthModel = mult(earthOrbitM,
            mult(rotate(s.earthTilt, 1, 0, 0),
                 mult(rotate(spin(C.earth.spinPeriod), 0, 1, 0),
                      scale(C.earth.radius, C.earth.radius, C.earth.radius))));

        // —— 月球：手动矩阵构造（白道面倾角，选做/必做手造矩阵点）——
        // 不用任何封装好的复合函数，用 rotate/translate 基本变换 + mult 手工组合：
        //   M_moonOrbit = RotX(5.145°) · RotY(公转角) · T(0,0,-月距)
        //   逻辑：① 先把轨道平面绕 X 轴倾斜 5.145°（白道面相对黄道面倾角）；
        //         ② 在倾斜后的平面内绕 Y 轴公转；
        //         ③ 沿 -Z 平移到月球轨道距离。
        //   相乘顺序的物理解释：列向量右乘时 RotX 在最左，先执行的是 T 平移，
        //   再执行 RotY 公转（在倾斜平面内），最后施加 RotX 使整个轨道面倾斜——
        //   “先平移后旋转”等价于“轨道先绕 Y 公转、再把轨道面整体掰斜”。（README Ch4 推导）
        const moonOrbitM = mult(rotate(C.moon.orbitTilt, 1, 0, 0),
                          mult(rotate(rev(C.moon.orbitPeriod), 0, 1, 0),
                               translate(0, 0, -C.moon.orbitDist)));
        out.moonOrbitM = mult(earthOrbitM, moonOrbitM);   // 白道轨道线（随地球移动）
        out.moonModel = mult(earthOrbitM,                  // 挂在地球轨道坐标系（不受地球自转影响）
            mult(moonOrbitM,
                 mult(rotate(spin(C.moon.spinPeriod), 0, 1, 0),
                      scale(C.moon.radius, C.moon.radius, C.moon.radius))));

        // —— 其余行星（E1 完整太阳系）——
        out.planets = C.planets.map(p => {
            const orbitM = mult(rotate(rev(p.period), 0, 1, 0), translate(0, 0, -p.orbit));
            return {
                name: p.name,
                model: mult(orbitM,
                            mult(rotate(p.tilt, 1, 0, 0),
                                 mult(rotate(spin(p.spin), 0, 1, 0),
                                      scale(p.radius, p.radius, p.radius)))),
                ringModel: p.ring ? mult(orbitM, rotate(p.tilt, 1, 0, 0)) : null,
                ring: p.ring || null,
                orbitM
            };
        });

        // —— 小行星带（整体缓慢公转）——
        out.asteroidModel = rotate((t % 360) * 0.05 * s.orbitSpeed, 0, 1, 0);

        // 位置提取（供 E2 视点与日月食判定）
        out.earthPos = [earthOrbitM[12], earthOrbitM[13], earthOrbitM[14]];
        out.moonPos = [out.moonModel[12], out.moonModel[13], out.moonModel[14]];
        return out;
    }

    // ---------- 绘制工具 ----------
    function draw(progKey, vao, model, extra) {
        const p = programs[progKey], u = programs.u[progKey];
        gl.useProgram(p);
        gl.uniformMatrix4fv(u.uProj, false, projCache);
        gl.uniformMatrix4fv(u.uView, false, viewCache);
        gl.uniformMatrix4fv(u.uModel, false, model);
        if (extra) extra(u);
        gl.bindVertexArray(vao.vao);
        if (vao.indexed) gl.drawElements(gl.TRIANGLES, vao.indexCount, gl.UNSIGNED_SHORT, 0);
        else gl.drawArrays(gl.LINE_LOOP, 0, vao.indexCount);
        gl.bindVertexArray(null);
    }

    function bindTex(u, texObj) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texObj);
        gl.uniform1i(u.uTex, 0);
    }

    // billboard 模型矩阵：取 view 旋转部分转置（面向相机）
    function billboardModel(scaleVal) {
        const v = viewCache;
        const b = mat4();
        b[0] = v[0]; b[1] = v[1]; b[2] = v[2];
        b[4] = v[4]; b[5] = v[5]; b[6] = v[6];
        b[8] = v[8]; b[9] = v[9]; b[10] = v[10];
        return mult(b, scale(scaleVal, scaleVal, scaleVal));
    }

    // ---------- 各对象绘制 ----------
    function drawBackground() {
        gl.disable(gl.CULL_FACE);
        draw("planet", geos.bg, scale(620, 620, 620), u => bindTex(u, tex.stars));
    }

    function drawSun(scene) {
        draw("planet", geos.sphere, scene.sunModel, u => { bindTex(u, tex.sun); gl.uniform1f(u.uBright, 1.4); });
    }

    function drawGlow() {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.depthMask(false);
        draw("glow", geos.glow, billboardModel(C.sun.radius * C.sun.glowScale),
            u => gl.uniform3f(u.uColor, 1.0, 0.72, 0.35));
        gl.depthMask(true);
        gl.disable(gl.BLEND);
    }

    function drawPlanets(scene) {
        const ringTex = tex.ring;
        scene.planets.forEach(pl => {
            draw("planet", geos.sphere, pl.model, u => { bindTex(u, tex[pl.name === "地球" ? "earth" : pl.name === "土星" ? "saturn" : keyOf(pl.name)]); gl.uniform1f(u.uBright, 1.0); });
            if (pl.ring && AP2State.showRings && ringTex) {
                // 土星环：挂在土星位置与赤道面（倾角）上，不随自转旋转；
                // 环几何为“单位环”(inner=1, outer=1.5)，scale(inner) 后即实际内外径
                const ringScaleModel = mult(pl.orbitM, mult(rotate(pl.tilt, 1, 0, 0),
                    scale(pl.ring.inner, pl.ring.inner, pl.ring.inner)));
                gl.enable(gl.BLEND);
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                gl.depthMask(false);
                draw("planet", geos.ring, ringScaleModel, u => { bindTex(u, ringTex); gl.uniform1f(u.uBright, 1.0); });
                gl.depthMask(true);
                gl.disable(gl.BLEND);
            }
        });
    }

    function keyOf(name) {
        const map = { 水星: "mercury", 金星: "venus", 地球: "earth", 火星: "mars", 木星: "jupiter", 土星: "saturn", 天王星: "uranus", 海王星: "neptune" };
        return map[name];
    }

    function drawMoon(scene) {
        draw("planet", geos.sphere, scene.moonModel, u => { bindTex(u, tex.moon); gl.uniform1f(u.uBright, 1.0); });
    }

    function drawOrbits(scene) {
        const col = C.colors.orbitLine;
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.lineWidth(1);
        // 各行星轨道
        scene.planets.forEach(pl => {
            draw("line", geos.orbit, scale(pl.orbit, pl.orbit, pl.orbit),
                u => gl.uniform4f(u.uColor, col[0], col[1], col[2], col[3]));
        });
        // 地球轨道（与行星列表中地球重复，此处用地球配置再画一次以确保主系统轨道可见）
        draw("line", geos.orbit, scale(C.earth.orbitDist, C.earth.orbitDist, C.earth.orbitDist),
            u => gl.uniform4f(u.uColor, 0.45, 0.75, 1.0, 0.6));
        // 月球白道（倾斜轨道，跟随地球）
        draw("line", geos.orbit, scene.moonOrbitM,
            u => gl.uniform4f(u.uColor, 1.0, 0.8, 0.45, 0.55));
        gl.disable(gl.BLEND);
    }

    function drawAsteroids(scene) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        draw("points", geos.asteroids, scene.asteroidModel,
            u => gl.uniform1f(u.uPointScale, canvas.height / 2 * projCache[5]));
        gl.disable(gl.BLEND);
    }

    // ---------- E2 日月食判定 ----------
    function eclipseInfo(sc) {
        const sun = [0, 0, 0], e = sc.earthPos, m = sc.moonPos;
        const dES = Math.hypot(e[0], e[1], e[2]);
        const dEM = Math.hypot(m[0] - e[0], m[1] - e[1], m[2] - e[2]);
        const dirSunE = normalize(vec3(-e[0], -e[1], -e[2]));           // 地球→太阳
        const dirMoonE = normalize(vec3(m[0] - e[0], m[1] - e[1], m[2] - e[2])); // 地球→月球
        const angEM = Math.acos(Math.max(-1, Math.min(1, dot(dirSunE, dirMoonE)))) * 180 / Math.PI;
        const dirESunS = normalize(vec3(e[0], e[1], e[2]));             // 太阳→地球
        const dirMoonS = normalize(vec3(m[0], m[1], m[2]));             // 太阳→月球
        const angSM = Math.acos(Math.max(-1, Math.min(1, dot(dirESunS, dirMoonS)))) * 180 / Math.PI;
        if (angEM < 2.5 && dEM < dES) return `日食进行中 · 月球遮住太阳（夹角 ${angEM.toFixed(1)}°）`;
        if (angSM < 2.5 && dEM > dES) return `月食进行中 · 地球挡住阳光（日地月夹角 ${angSM.toFixed(1)}°）`;
        if (angEM < 9) return `接近日食条件 · 月地日夹角 ${angEM.toFixed(1)}°`;
        if (angSM < 9) return `接近月食条件 · 日地月夹角 ${angSM.toFixed(1)}°`;
        return `无食 · 月地日 ${angEM.toFixed(1)}° / 日地月 ${angSM.toFixed(1)}°`;
    }

    // ---------- 主循环 ----------
    function render(t, dt) {
        const s = AP2State;
        const scene = computeScene(t);

        // E2 视点驱动
        const vm = AP2Cam.getViewMode();
        if (vm === "heliocentric") {
            const epos = scene.earthPos;
            const dir = normalize(vec3(epos[0], epos[1], epos[2]));
            AP2Cam.setLookAt(add(scalarmult(C.sun.radius + 1.5, dir), vec3(0, 3, 0)), vec3(epos[0], epos[1], epos[2]));
        } else if (vm === "geocentric") {
            const epos = scene.earthPos, mpos = scene.moonPos;
            const dir = normalize(vec3(mpos[0] - epos[0], mpos[1] - epos[1], mpos[2] - epos[2]));
            AP2Cam.setLookAt(add(vec3(epos[0], epos[1], epos[2]), scalarmult(C.earth.radius + 0.5, dir)),
                             vec3(mpos[0], mpos[1], mpos[2]));
        }
        AP2Cam.update(dt);

        viewCache = AP2Cam.view();
        projCache = AP2Cam.projectionMatrix(aspect);

        gl.clearColor(0.020, 0.025, 0.055, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        drawBackground();
        drawSun(scene);
        if (s.showGlow) drawGlow();
        drawPlanets(scene);
        drawMoon(scene);
        if (s.showOrbits) drawOrbits(scene);
        if (s.showAsteroids) drawAsteroids(scene);

        AP2UI.updateHud({
            projection: AP2Cam.getProjection(),
            mode: AP2Cam.isOrbiting() ? "orbit" : "manual",
            viewMode: AP2Cam.getViewMode(),
            eclipse: eclipseInfo(scene)
        });
    }

    let last = 0;
    function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        render(now / 1000, dt);
        requestAnimationFrame(frame);
    }

    // ---------- 启动 ----------
    function main() {
        initGL();
        if (!gl) return;
        compilePrograms();
        buildGeometry();
        AP2UI.init();
        // 纹理全部就绪后再启动渲染循环，避免首帧黑屏
        loadTextures().then(() => {
            last = performance.now();
            requestAnimationFrame(frame);
        }).catch(err => {
            console.error(err);
            alert("纹理加载失败，请确认 textures/ 目录完整并通过本地服务器访问。");
        });
    }

    window.addEventListener("DOMContentLoaded", main);
})();
