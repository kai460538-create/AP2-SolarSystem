// geometry.js — 几何数据生成：球体、轨道线、土星环、小行星带、Billboard 光晕
// 说明：所有网格只生成一次并上传 VBO，每帧仅更新矩阵（性能优化）。

"use strict";

const AP2Geo = (function () {

    // 经纬网格球体。
    // UV 约定：u 沿经度 0→1（绕 Y 轴一周），v 沿纬度 0→1（南极→北极）。
    // 该约定与加载纹理时 gl.UNPACK_FLIP_Y_WEBGL = true 配合，可得到正确朝向
    // （详见 README“地球纹理颠倒问题”一节）。
    function createSphere(radius, slices, stacks) {
        slices = slices || 64;
        stacks = stacks || 32;
        const pos = [], uv = [], nor = [], idx = [];
        for (let i = 0; i <= stacks; i++) {
            const phi = i * Math.PI / stacks;          // 0(北极) → π(南极)
            const v = 1 - i / stacks;                  // 北极 v=1，南极 v=0
            const y = radius * Math.cos(phi);
            const r = radius * Math.sin(phi);
            for (let j = 0; j <= slices; j++) {
                const theta = j * 2 * Math.PI / slices; // 经度
                const u = j / slices;
                pos.push(r * Math.sin(theta), y, r * Math.cos(theta));
                uv.push(u, v);
                nor.push(Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta));
            }
        }
        const cols = slices + 1;
        for (let i = 0; i < stacks; i++) {
            for (let j = 0; j < slices; j++) {
                const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
                idx.push(a, c, b, b, c, d);
            }
        }
        return {
            pos: new Float32Array(pos),
            uv: new Float32Array(uv),
            nor: new Float32Array(nor),
            idx: new Uint16Array(idx),
            vertexCount: pos.length / 3,
            indexCount: idx.length
        };
    }

    // 圆形轨道线（XZ 平面），返回顶点数组
    function createCircleLine(radius, segments) {
        segments = segments || 256;
        const pts = [];
        for (let j = 0; j <= segments; j++) {
            const t = j * 2 * Math.PI / segments;
            pts.push(radius * Math.sin(t), 0, radius * Math.cos(t));
        }
        return new Float32Array(pts);
    }

    // 土星环：环形三角带。
    // UV 约定：u = 径向（内环 0 → 外环 1），v = 周向（0→1 沿环一周）。
    // 与 2k_saturn_ring_alpha.png（横向=径向展开）的 uv 排布一致。
    function createRing(inner, outer, segments) {
        segments = segments || 128;
        const pos = [], uv = [], idx = [];
        for (let j = 0; j <= segments; j++) {
            const t = j * 2 * Math.PI / segments;
            const v = j / segments;
            pos.push(inner * Math.sin(t), 0, inner * Math.cos(t)); uv.push(0, v);
            pos.push(outer * Math.sin(t), 0, outer * Math.cos(t)); uv.push(1, v);
        }
        for (let j = 0; j < segments; j++) {
            const a = j * 2, b = j * 2 + 1, c = j * 2 + 2, d = j * 2 + 3;
            idx.push(a, b, c, b, d, c);
        }
        return {
            pos: new Float32Array(pos),
            uv: new Float32Array(uv),
            idx: new Uint16Array(idx),
            indexCount: idx.length
        };
    }

    // 小行星带：随机分布在 [inner, outer] 环带内的点（圆形点精灵渲染）
    function createAsteroidBelt(inner, outer, count) {
        const pos = [], size = [], color = [];
        for (let i = 0; i < count; i++) {
            const r = inner + (outer - inner) * Math.pow(Math.random(), 0.7);
            const t = Math.random() * 2 * Math.PI;
            const y = (Math.random() - 0.5) * 0.8;          // 厚度
            pos.push(r * Math.sin(t), y, r * Math.cos(t));
            size.push(0.15 + Math.random() * 0.18);   // 世界单位大小（点精灵按投影缩放）
            const g = 0.5 + Math.random() * 0.25;
            color.push(g * 0.9, g * 0.85, g * 0.7);
        }
        return { pos: new Float32Array(pos), size: new Float32Array(size), color: new Float32Array(color), count };
    }

    // 面向相机的方片（光晕 billboard 用）。UV：0 为左上，1 为右下。
    function createBillboardQuad() {
        const pos = new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]);
        const uv = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
        const idx = new Uint16Array([0, 1, 2, 2, 1, 3]);
        return { pos, uv, idx, indexCount: 6 };
    }

    return { createSphere, createCircleLine, createRing, createAsteroidBelt, createBillboardQuad };
})();
