// MV.js — 教材 Angel & Shreiner《Interactive Computer Graphics 8th ed.》配套工具库的精简实现
// 说明：本文件为自实现的教材兼容版本，API 与教材 Common/MV.js 保持一致：
//   矩阵为列主序 Float32Array(16)，rotate 的角度采用“角度制”（与教材一致，勿再转弧度）。
// 提供：vec3 / vec4 / mat4 构造，translate / rotate / scale / mult 基本变换，
//       perspective / ortho 投影，lookAt 观察矩阵，normalize / cross / dot 等向量运算。
// 本项目中“手动矩阵构造”（月球轨道面倾角）一节正是基于本文件的基本变换手工组合而成。

"use strict";

// ---------- 向量 ----------
function vec3(x, y, z) { return new Float32Array([x, y, z]); }
function vec4(x, y, z, w) { return new Float32Array([x, y, z, w]); }
function dot(u, v) { return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]; }
function cross(u, v) {
    return new Float32Array([
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0]
    ]);
}
function subtract(u, v) { return new Float32Array([u[0] - v[0], u[1] - v[1], u[2] - v[2]]); }
function add(u, v) { return new Float32Array([u[0] + v[0], u[1] + v[1], u[2] + v[2]]); }
function scalarmult(s, v) { return new Float32Array([s * v[0], s * v[1], s * v[2]]); }
function normalize(v) {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (len < 1e-12) return new Float32Array([0, 0, 0]);
    return new Float32Array([v[0] / len, v[1] / len, v[2] / len]);
}
function length(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }

// ---------- 矩阵（列主序，Float32Array(16)）----------
function mat4() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }

// 乘法：result = A * B（A、B 均为列主序）
function mult(A, B) {
    const r = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
        for (let rw = 0; rw < 4; rw++) {
            let s = 0;
            for (let k = 0; k < 4; k++) s += A[k * 4 + rw] * B[c * 4 + k];
            r[c * 4 + rw] = s;
        }
    }
    return r;
}

// 平移矩阵
function translate(x, y, z) {
    if (ArrayBuffer.isView(x)) { y = x[1]; z = x[2]; x = x[0]; }
    const m = mat4();
    m[12] = x; m[13] = y; m[14] = z;
    return m;
}

// 缩放矩阵
function scale(x, y, z) {
    if (ArrayBuffer.isView(x)) { y = x[1]; z = x[2]; x = x[0]; }
    const m = mat4();
    m[0] = x; m[5] = y; m[10] = z;
    return m;
}

// 绕任意过原点轴旋转的矩阵；angle 为“角度制”（教材约定，勿传弧度）
function rotate(angle, x, y, z) {
    if (ArrayBuffer.isView(x)) { y = x[1]; z = x[2]; x = x[0]; }
    const a = angle * Math.PI / 180.0;
    const c = Math.cos(a), s = Math.sin(a);
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len < 1e-12) return mat4();
    x /= len; y /= len; z /= len;
    const m = mat4();
    m[0] = x * x * (1 - c) + c;       m[1] = x * y * (1 - c) + z * s;   m[2] = x * z * (1 - c) - y * s;
    m[4] = x * y * (1 - c) - z * s;   m[5] = y * y * (1 - c) + c;       m[6] = y * z * (1 - c) + x * s;
    m[8] = x * z * (1 - c) + y * s;   m[9] = y * z * (1 - c) - x * s;   m[10] = z * z * (1 - c) + c;
    return m;
}

// 观察矩阵：眼点 eye，注视目标 at，上方向 up
// 列主序存储：col0=(u0,v0,n0) col1=(u1,v1,n1) col2=(u2,v2,n2)，
// 即第 c 列是基向量 (u,v,n) 的第 c 个分量，平移列 = (-u·eye, -v·eye, -n·eye)。
function lookAt(eye, at, up) {
    const n = normalize(subtract(eye, at));   // 向后（backward）
    const u = normalize(cross(up, n));        // 向右（right）
    const v = cross(n, u);                    // 向上（up）
    const m = mat4();
    m[0] = u[0]; m[1] = v[0]; m[2] = n[0]; m[3] = 0;
    m[4] = u[1]; m[5] = v[1]; m[6] = n[1]; m[7] = 0;
    m[8] = u[2]; m[9] = v[2]; m[10] = n[2]; m[11] = 0;
    m[12] = -dot(u, eye); m[13] = -dot(v, eye); m[14] = -dot(n, eye); m[15] = 1;
    return m;
}

// 透视投影：fovy 为垂直视角（角度制），aspect 宽高比，near / far 近远截面
function perspective(fovy, aspect, near, far) {
    const f = 1.0 / Math.tan(fovy * Math.PI / 360.0);
    const nf = 1.0 / (near - far);
    const m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f; m[10] = (far + near) * nf; m[11] = -1;
    m[14] = 2 * far * near * nf;
    return m;
}

// 正交投影
function ortho(left, right, bottom, top, near, far) {
    const m = mat4();
    m[0] = 2 / (right - left); m[5] = 2 / (top - bottom); m[10] = -2 / (far - near);
    m[12] = -(right + left) / (right - left);
    m[13] = -(top + bottom) / (top - bottom);
    m[14] = -(far + near) / (far - near);
    return m;
}
