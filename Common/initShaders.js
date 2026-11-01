// initShaders.js — 教材 Common/initShaders.js 的自实现精简版
// 功能：从 <script type="x-shader/x-vertex"> / x-shader/x-fragment 标签中读取着色器源码，
//       编译、链接为可用的着色器程序。支持 WebGL2（GLSL 300 es）。

"use strict";

function getShader(gl, scriptId, type) {
    const src = document.getElementById(scriptId).textContent.trim();
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        console.error("着色器编译失败 [" + scriptId + "]:\n" + log);
        throw new Error("Shader compile error: " + scriptId);
    }
    return shader;
}

function initShaders(gl, vShaderId, fShaderId) {
    const vs = getShader(gl, vShaderId, gl.VERTEX_SHADER);
    const fs = getShader(gl, fShaderId, gl.FRAGMENT_SHADER);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(prog);
        console.error("着色器链接失败:\n" + log);
        throw new Error("Program link error");
    }
    return prog;
}

// 兼容教材旧版用法：initShaders(gl, vShaderId, fShaderId)
