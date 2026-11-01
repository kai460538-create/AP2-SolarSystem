// ui.js — 参数面板、键盘交互、HUD 状态显示
// 面板控件全部实时生效：公转速度 / 自转速度 / 轴倾角 / 轨道线开关 / 投影 / 视点 / 重置。

"use strict";

// 全局交互状态（main.js 每帧读取）
const AP2State = {
    orbitSpeed: 1.0,
    spinSpeed: 1.0,
    earthTilt: AP2_CONFIG.earth.tilt,
    showOrbits: true,
    showAsteroids: true,
    showRings: true,
    showGlow: true
};

const AP2UI = (function () {
    const hud = document.getElementById("hud");
    const helpBox = document.getElementById("helpBox");

    // ---------- 参数面板绑定 ----------
    function bindRange(id, cb) {
        const el = document.getElementById(id);
        const out = document.getElementById(id + "Val");
        const update = () => { const v = parseFloat(el.value); cb(v); if (out) out.textContent = v; };
        el.addEventListener("input", update);
        update();
        return el;
    }
    function bindCheck(id, cb) {
        const el = document.getElementById(id);
        const update = () => cb(el.checked);
        el.addEventListener("change", update);
        update();
    }
    function bindButton(id, cb) {
        document.getElementById(id).addEventListener("click", cb);
    }

    function init() {
        bindRange("slOrbitSpeed", v => AP2State.orbitSpeed = v);
        bindRange("slSpinSpeed", v => AP2State.spinSpeed = v);
        bindRange("slTilt", v => AP2State.earthTilt = v);
        bindCheck("ckOrbits", v => AP2State.showOrbits = v);
        bindCheck("ckAsteroids", v => AP2State.showAsteroids = v);
        bindCheck("ckRings", v => AP2State.showRings = v);
        bindCheck("ckGlow", v => AP2State.showGlow = v);

        bindButton("btnProjection", () => {
            const p = AP2Cam.toggleProjection();
            document.getElementById("btnProjection").textContent =
                p === "perspective" ? "投影：透视" : "投影：正交";
        });
        bindButton("btnOrbit", () => { AP2Cam.toggleOrbit(); });
        bindButton("btnReset", () => { AP2Cam.reset(); });

        // E2 视点切换
        ["btnViewFree", "btnViewHelio", "btnViewGeo"].forEach(id => {
            bindButton(id, () => {
                const m = { btnViewFree: "free", btnViewHelio: "heliocentric", btnViewGeo: "geocentric" }[id];
                AP2Cam.setViewMode(m);
                syncViewButtons(m);
            });
        });

        // ---------- 键盘 ----------
        window.addEventListener("keydown", e => {
            const k = e.key.toLowerCase();
            if (k === " ") { e.preventDefault(); AP2Cam.toggleOrbit(); }
            else if (k === "o") { document.getElementById("btnProjection").click(); }
            else if (k === "r") { AP2Cam.reset(); }
            else if (k === "h") { toggleHelp(); }
            else if (k === "1") { AP2Cam.setViewMode("free"); syncViewButtons("free"); }
            else if (k === "2") { AP2Cam.setViewMode("heliocentric"); syncViewButtons("heliocentric"); }
            else if (k === "3") { AP2Cam.setViewMode("geocentric"); syncViewButtons("geocentric"); }
        });

        // ---------- 鼠标 / 滚轮（轨迹球接管）----------
        const canvas = document.getElementById("glcanvas");
        let down = false;

        canvas.addEventListener("mousedown", e => {
            down = true;
            canvas.classList.add("dragging");
            const r = canvas.getBoundingClientRect();
            AP2Cam.trackballStart(ndc(e.clientX - r.left, r.width), ndc(e.clientY - r.top, r.height));
        });
        window.addEventListener("mousemove", e => {
            if (!down) return;
            const r = canvas.getBoundingClientRect();
            AP2Cam.trackballMove(ndc(e.clientX - r.left, r.width), ndc(e.clientY - r.top, r.height));
        });
        window.addEventListener("mouseup", () => { down = false; canvas.classList.remove("dragging"); AP2Cam.trackballEnd(); });
        window.addEventListener("mouseup", () => { down = false; AP2Cam.trackballEnd(); });

        canvas.addEventListener("wheel", e => {
            e.preventDefault();
            AP2Cam.zoom(e.deltaY > 0 ? 1 : -1);
        }, { passive: false });

        // 触屏基础支持
        canvas.addEventListener("touchstart", e => {
            const t = e.touches[0];
            down = true;
            const r = canvas.getBoundingClientRect();
            AP2Cam.trackballStart(ndc(t.clientX - r.left, r.width), ndc(t.clientY - r.top, r.height));
            e.preventDefault();
        }, { passive: false });
        canvas.addEventListener("touchmove", e => {
            if (!down) return;
            const t = e.touches[0];
            const r = canvas.getBoundingClientRect();
            AP2Cam.trackballMove(ndc(t.clientX - r.left, r.width), ndc(t.clientY - r.top, r.height));
            e.preventDefault();
        }, { passive: false });
        canvas.addEventListener("touchend", () => { down = false; AP2Cam.trackballEnd(); });

        syncViewButtons("free");
    }

    function syncViewButtons(m) {
        ["btnViewFree", "btnViewHelio", "btnViewGeo"].forEach(id => {
            document.getElementById(id).classList.toggle("active", id === {
                free: "btnViewFree", heliocentric: "btnViewHelio", geocentric: "btnViewGeo"
            }[m]);
        });
    }

    // 像素 → NDC
    function ndc(px, sizePx) { return (px / sizePx) * 2 - 1; }

    // ---------- HUD ----------
    // info: { projection, mode, viewMode, eclipse }
    function updateHud(info) {
        if (!hud) return;
        const lines = [
            `投影：${info.projection === "perspective" ? "透视" : "正交"}  [O 切换]`,
            `相机：${info.mode === "orbit" ? "漫游中" : "手动"}  [空格]`,
            `视点：${info.viewMode === "free" ? "自由" : info.viewMode === "heliocentric" ? "日心" : "地心"}  [1/2/3]`
        ];
        if (info.eclipse) lines.push(`日月食：${info.eclipse}`);
        hud.innerHTML = lines.map(l => `<div>${l}</div>`).join("");
    }

    function toggleHelp() {
        helpBox.classList.toggle("hidden");
    }

    return { init, updateHud, toggleHelp };
})();
