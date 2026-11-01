// config.js — 天体参数集中配置（评分标准：天体参数便于调整）
// 坐标约定：Y 轴向上，XZ 平面为公转轨道面（黄道面）；太阳位于原点。
// 说明：轨道距离 / 半径 / 周期为“演示尺度”（为便于观察做了适度压缩与放大，
//       轴倾角与自转方向尽量贴近真实值；金星真实倾角 177.4° 逆行，演示中简化为 3°）。

"use strict";

const AP2_CONFIG = {

    // —— 太阳 ——
    sun: {
        radius: 8,
        texture: "textures/2k_sun.jpg",
        glowScale: 2.6,          // 光晕 billboard 相对半径
        spinPeriod: 12           // 自转周期（秒，1x 速度）
    },

    // —— 地球 —月球系统 ——
    earth: {
        radius: 2.2,
        orbitDist: 32,
        orbitPeriod: 12,         // 公转周期（秒，1x 速度；12s 绕一周便于观察）
        spinPeriod: 3,           // 自转周期（秒）
        tilt: 23.5,              // 自转轴倾角（度），面板可调 0~45
        texture: "textures/2k_earth_daymap.jpg"
    },
    moon: {
        radius: 0.6,
        orbitDist: 3.4,          // 距地球距离
        orbitPeriod: 5,          // 绕地周期（秒）
        spinPeriod: 10,
        orbitTilt: 5.145,        // 白道面相对黄道面倾角（度）—— 手动矩阵演示对象
        texture: "textures/2k_moon.jpg"
    },

    // —— 其余行星（水星…海王星），E1 选做 ——
    planets: [
        { name: "水星", radius: 1.1,  orbit: 18,  period: 5,    spin: 20, tilt: 0.03,  texture: "textures/2k_mercury.jpg" },
        { name: "金星", radius: 2.0,  orbit: 24,  period: 8,    spin: -6,  tilt: 3.0,   texture: "textures/2k_venus_surface.jpg" },  // spin 为负 → 逆行自转（真实金星自转方向与公转相反）；演示中公转 8s/圈=45°/s，故自转取 -6s/圈=60°/s 逆行，净效果才表现为逆行，否则会被公转淹没而看似顺行
        { name: "地球", radius: 2.2,  orbit: 32,  period: 12,   spin: 3,   tilt: 23.5,  texture: "textures/2k_earth_daymap.jpg" },
        { name: "火星", radius: 1.5,  orbit: 42,  period: 18,   spin: 4,   tilt: 25.19, texture: "textures/2k_mars.jpg" },
        { name: "木星", radius: 4.8,  orbit: 66,  period: 45,   spin: 2,   tilt: 3.13,  texture: "textures/2k_jupiter.jpg" },
        { name: "土星", radius: 4.2,  orbit: 82,  period: 72,   spin: 2.5, tilt: 26.73, texture: "textures/2k_saturn.jpg", ring: { inner: 6.0, outer: 9.5, texture: "textures/2k_saturn_ring_alpha.png" } },
        { name: "天王星", radius: 3.0, orbit: 100, period: 110,  spin: 5,  tilt: 97.77, texture: "textures/2k_uranus.jpg" },
        { name: "海王星", radius: 2.9, orbit: 118, period: 160,  spin: 4,  tilt: 28.32, texture: "textures/2k_neptune.jpg" }
    ],

    // —— 小行星带（火星 42 与木星 66 之间）——
    asteroidBelt: { inner: 47, outer: 60, count: 3000 },

    // —— 相机 ——
    camera: {
        startEye: [0, 46, 88],      // 默认眼点
        startAt: [0, 0, 0],         // 注视点（太阳）
        fov: 50,                    // 透视垂直视角（度）
        near: 0.1,
        far: 2000,
        autoOrbit: true,            // 是否默认开启环绕漫游
        orbitHeight: 18,            // 漫游轨道高度起伏幅度
        orbitRadius: 95,
        minDist: 10,
        maxDist: 400
    },

    // —— 全局动画 ——
    speedBase: { orbit: 1.0, spin: 1.0 },   // 面板初始倍数

    // —— 外观 ——
    colors: {
        bgTop: [6, 8, 26], bgBottom: [12, 14, 40],
        orbitLine: [0.55, 0.6, 0.75, 0.5],  // 轨道线颜色（带透明度）
        asteroid: [0.62, 0.58, 0.52]
    }
};
