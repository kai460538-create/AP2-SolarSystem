// camera.js — 观察与投影
// 包含：
//   1) 双投影：透视 / 正交，O 键切换；正交视野按“相机到目标距离”自动匹配透视视野，
//      切换时画面尺度接近，便于对比（README 双投影对比图）。
//   2) 环绕漫游：预设路径（绕场景一周 + 高度起伏），关键帧连续插值，空格暂停 / 继续。
//   3) 虚拟轨迹球（选做 E3）：教材 Virtual Trackball 思想 —— 把鼠标位置映射到单位球面，
//      由两次位置叉积得到旋转轴、asin(长度) 得到旋转角，构造旋转矩阵并前乘到视图矩阵，
//      实现无万向锁、顺滑的任意方向旋转视角。
//   4) 视点切换（选做 E2）：自由 / 日心（从太阳看地球-月球）/ 地心（从地球看月球）。

"use strict";

const AP2Cam = (function () {
    const C = AP2_CONFIG.camera;

    let mode = C.autoOrbit ? "orbit" : "manual";   // orbit 漫游 / manual 手动
    let viewMode = "free";                          // free | heliocentric | geocentric

    let eye = vec3(C.startEye[0], C.startEye[1], C.startEye[2]);
    let at = vec3(C.startAt[0], C.startAt[1], C.startAt[2]);
    let dist = length(subtract(eye, at));

    let projection = "perspective";                 // perspective | ortho
    let viewM = null;

    let orbitTime = 0;
    const ORBIT_PERIOD = 40;                        // 一圈秒数

    function rebuildView() { viewM = lookAt(eye, at, vec3(0, 1, 0)); }
    rebuildView();

    // ---------- 漫游 ----------
    function update(dt) {
        if (mode !== "orbit" || viewMode !== "free") return;
        orbitTime += dt;
        const a = orbitTime * 2 * Math.PI / ORBIT_PERIOD;
        const r = C.orbitRadius;
        const h = 20 + C.orbitHeight * Math.sin(orbitTime * 2 * Math.PI / 90);
        eye = vec3(r * Math.sin(a), h, r * Math.cos(a));
        at = vec3(0, 0, 0);
        rebuildView();
        dist = length(subtract(eye, at));
    }

    function toggleOrbit() {
        if (mode === "orbit") {
            mode = "manual";
        } else {
            mode = "orbit";
            viewMode = "free";                      // 漫游恢复时回到自由视点
            // 让漫游角度从当前方位继续，避免画面跳变
            const cur = Math.atan2(eye[0], eye[2]);
            orbitTime = (cur / (2 * Math.PI)) * ORBIT_PERIOD;
        }
    }
    function isOrbiting() { return mode === "orbit"; }

    // 暂停漫游（鼠标接管时调用）
    function pauseOrbit() { if (mode === "orbit") mode = "manual"; }

    // 恢复漫游（全局暂停恢复时调用；保持当前视点模式）
    function resumeOrbit() { mode = "orbit"; }

    // ---------- 投影 ----------
    function toggleProjection() {
        projection = projection === "perspective" ? "ortho" : "perspective";
        return projection;
    }
    function getProjection() { return projection; }

    function projectionMatrix(aspect) {
        if (projection === "perspective") {
            return perspective(C.fov, aspect, C.near, C.far);
        }
        // 正交：以相机到目标距离 d 估算半高，使视野尺度与透视接近
        const halfH = dist * Math.tan(C.fov * Math.PI / 360);
        const halfW = halfH * aspect;
        return ortho(-halfW, halfW, -halfH, halfH, C.near, C.far);
    }

    function view() { return viewM; }

    // ---------- 虚拟轨迹球（E3）----------
    // NDC 坐标 → 单位球面上的点（教材 Virtual Trackball）
    function mapToSphere(nx, ny) {
        const d = Math.sqrt(nx * nx + ny * ny);
        const z = d < 1 ? Math.sqrt(1 - d * d) : 0;   // 球外投影到球边缘
        return vec3(nx, ny, z);
    }

    let dragSphere = null;   // 拖拽起始球面点

    function trackballStart(x, y) {
        pauseOrbit();
        dragSphere = mapToSphere(x, y);
    }

    // 轨迹球（E3）——按“查看器”直觉实现：
    // 旋转作用在【眼点绕目标点 at】上（而非相机系原地旋转）：
    //   向右拖 → 相机绕目标向左转 → 场景内容向右移动（跟手）
    //   向上拖 → 相机绕水平轴降低 → 场景内容向上移动（跟手）
    // 旋转轴取拖拽两点的球面叉积（教材 Virtual Trackball 思想，无万向锁），
    // 轴先由相机系转回世界系再旋转 eye。
    function trackballMove(x, y) {
        if (!dragSphere) return;
        const p1 = mapToSphere(x, y);
        const axis = cross(dragSphere, p1);
        const len = length(axis);
        if (len > 1e-6) {
            const ang = Math.asin(Math.min(1, len)) * 2 * 180 / Math.PI;
            // 相机系轴 → 世界系（view 矩阵旋转部分 R_view，列主序：w = R_view · axis）
            const v = viewM;
            const wx = v[0] * axis[0] + v[4] * axis[1] + v[8] * axis[2];
            const wy = v[1] * axis[0] + v[5] * axis[1] + v[9] * axis[2];
            const wz = v[2] * axis[0] + v[6] * axis[1] + v[10] * axis[2];
            // 方向标定（实测）：俯仰由轴的水平分量 wx 控制（不取反→上拖内容上移），
            // 水平由竖直分量 wy 控制（取反→右拖内容右移）；wz 绕视线，影响微弱。
            const R = rotate(ang, wx, -wy, wz);
            const off = subtract(eye, at);
            const ro = vec3(
                R[0] * off[0] + R[4] * off[1] + R[8] * off[2],
                R[1] * off[0] + R[5] * off[1] + R[9] * off[2],
                R[2] * off[0] + R[6] * off[1] + R[10] * off[2]);
            eye = add(at, ro);
            rebuildView();
            dist = length(subtract(eye, at));
        }
        dragSphere = p1;
    }
    function trackballEnd() { dragSphere = null; }

    // 从视图矩阵反解眼点 / 目标 / 距离（供滚轮缩放与漫游恢复使用）
    // 视图 V = R'·T(-eye)（R' 行主序为 [u;v;n]，列主序存储 col0=(u0,v0,n0)…）。
    // 反解 eye = -R'ᵀ·t，其中 u=(m0,m4,m8)、v=(m1,m5,m9)、n=(m2,m6,m10)，
    // 即 R'ᵀ·t 的各分量 = (u·t, v·t, n·t)。
    function extractEyeAt() {
        const v = viewM;
        eye = vec3(
            -(v[0] * v[12] + v[1] * v[13] + v[2] * v[14]),
            -(v[4] * v[12] + v[5] * v[13] + v[6] * v[14]),
            -(v[8] * v[12] + v[9] * v[13] + v[10] * v[14])
        );
        const fwd = vec3(-v[2], -v[6], -v[10]);   // 视线方向 = -n（相机 -z 轴在世界系）
        at = add(eye, scalarmult(dist, fwd));
    }

    // ---------- 滚轮缩放（沿视线进退，保留旋转）----------
    function zoom(delta) {
        const step = delta * 0.6;
        const next = dist - step;
        dist = Math.max(C.minDist, Math.min(C.maxDist, next));
        const dz = dist - length(subtract(eye, at));
        viewM = mult(translate(0, 0, -dz), viewM);
        extractEyeAt();
    }

    // ---------- E2 视点切换 ----------
    function setViewMode(m) { viewMode = m; mode = "manual"; }
    function getViewMode() { return viewMode; }

    // 由外部（main）驱动：设置眼点 / 目标（日心 / 地心视点）
    function setLookAt(e, a) {
        eye = e; at = a;
        rebuildView();
        dist = length(subtract(eye, at));
    }

    function reset() {
        eye = vec3(C.startEye[0], C.startEye[1], C.startEye[2]);
        at = vec3(C.startAt[0], C.startAt[1], C.startAt[2]);
        dist = length(subtract(eye, at));
        orbitTime = 0;
        viewMode = "free";
        mode = C.autoOrbit ? "orbit" : "manual";
        rebuildView();
    }

    return {
        update, toggleOrbit, isOrbiting, pauseOrbit, resumeOrbit,
        toggleProjection, getProjection, projectionMatrix, view,
        trackballStart, trackballMove, trackballEnd, zoom,
        setViewMode, getViewMode, setLookAt, reset,
        getEye: () => eye, getAt: () => at
    };
})();
