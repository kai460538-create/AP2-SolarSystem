// textures.js — 纹理加载管线
// 关键处理：
// 1) UNPACK_FLIP_Y_WEBGL —— WebGL 纹理坐标原点在“左下角”，而图片文件原点在“左上角”，
//    直接上传会导致纹理上下颠倒（地球南北极互换）。故上传前设置 FLIP_Y = true，
//    配合几何 UV 约定（v：南极 0 → 北极 1）得到正确朝向。该状态是全局的，
//    属于像素打包状态，在 texImage2D 之前设置、加载完不改动（本项目所有贴图统一翻转）。
// 2) 线性过滤 + mipmap —— 远处缩小不闪烁、近处放大不生硬。
// 3) 异步加载 —— 全部纹理就绪后才启动渲染循环，避免首帧黑屏。

"use strict";

const AP2Tex = (function () {

    // 加载单张图片（跨域安全加载）
    function loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";   // 本地服务器同源加载；部署 CDN 亦安全
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("图片加载失败: " + url));
            img.src = url;
        });
    }

    // 将 Image 上传为 WebGL 纹理
    // useAlpha=true 时按 RGBA 上传（土星环 PNG 带透明通道；错误地用 RGB 上传会丢弃 alpha，
    // 导致环变成不透明黑色条带）
    function imageToTexture(gl, img, useAlpha) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        // 关键：翻转 Y —— 解决纹理上下颠倒问题（见文件头注释）
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        const fmt = useAlpha ? gl.RGBA : gl.RGB;
        gl.texImage2D(gl.TEXTURE_2D, 0, fmt, fmt, gl.UNSIGNED_BYTE, img);
        // mipmap + 线性过滤
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return tex;
    }

    function loadTexture(gl, url) {
        // PNG 一般带透明通道 → RGBA；JPEG → RGB
        return loadImage(url).then(img => imageToTexture(gl, img, /\.png$/i.test(url)));
    }

    // 批量加载：{ name: url } → Promise<{ name: WebGLTexture }>
    function loadAllTextures(gl, urls) {
        const tasks = Object.keys(urls).map(name =>
            loadTexture(gl, urls[name]).then(tex => ({ name, tex }))
        );
        return Promise.all(tasks).then(list => {
            const out = {};
            list.forEach(o => out[o.name] = o.tex);
            return out;
        });
    }

    // 程序化生成星空背景纹理（canvas 绘制，免跨域、可调密度）
    function createStarFieldTexture(gl, w, h) {
        w = w || 2048; h = h || 1024;
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");

        // 深空渐变底色
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "#04060f");
        g.addColorStop(0.5, "#070b1c");
        g.addColorStop(1, "#030409");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);

        // 银河带（柔和斜向光带）
        ctx.save();
        ctx.translate(w * 0.5, h * 0.45);
        ctx.rotate(-0.35);
        const band = ctx.createLinearGradient(-w * 0.6, 0, w * 0.6, 0);
        band.addColorStop(0, "rgba(120,130,180,0)");
        band.addColorStop(0.5, "rgba(150,160,210,0.10)");
        band.addColorStop(1, "rgba(120,130,180,0)");
        ctx.fillStyle = band;
        ctx.fillRect(-w * 0.6, -h * 0.15, w * 1.2, h * 0.3);
        ctx.restore();

        // 随机星星（大小、亮度分层）
        const rand = (a, b) => a + Math.random() * (b - a);
        for (let i = 0; i < 2600; i++) {
            const x = rand(0, w), y = rand(0, h);
            const r = Math.random() < 0.12 ? rand(1.6, 2.8) : rand(0.5, 1.4);
            const a = rand(0.35, 1.0);
            const tint = Math.random();
            ctx.fillStyle = tint < 0.7 ? `rgba(255,255,255,${a})`
                        : tint < 0.85 ? `rgba(200,215,255,${a})`
                                      : `rgba(255,235,200,${a})`;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        // 少量亮星带十字光芒
        for (let i = 0; i < 40; i++) {
            const x = rand(0, w), y = rand(0, h);
            ctx.strokeStyle = `rgba(255,255,255,${rand(0.5, 0.85)})`;
            ctx.lineWidth = 1;
            const len = rand(4, 8);
            ctx.beginPath();
            ctx.moveTo(x - len, y); ctx.lineTo(x + len, y);
            ctx.moveTo(x, y - len); ctx.lineTo(x, y + len);
            ctx.stroke();
        }

        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, c);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return tex;
    }

    return { loadTexture, loadAllTextures, createStarFieldTexture };
})();
