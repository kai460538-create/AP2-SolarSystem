const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(process.argv[2], 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const { vec3, mat4, mult, rotate, translate, scale, perspective, ortho, lookAt, normalize, cross, dot, subtract, add, scalarmult, length } = sandbox;
const approx = (a, b, eps) => Math.abs(a - b) < (eps || 1e-4);
const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } else console.log('PASS: ' + msg); };

// 1) lookAt：视图 V = R·T(-eye)，平移列 t = -R·eye，故 eye = -Rᵀ·t（camera.js 反解公式）
const eye = vec3(0, 46, 88), at = vec3(0, 0, 0), up = vec3(0, 1, 0);
const V = lookAt(eye, at, up);
const ex = -(V[0] * V[12] + V[1] * V[13] + V[2] * V[14]);
const ey = -(V[4] * V[12] + V[5] * V[13] + V[6] * V[14]);
const ez = -(V[8] * V[12] + V[9] * V[13] + V[10] * V[14]);
assert(approx(ex, 0, 1e-3) && approx(ey, 46, 1e-3) && approx(ez, 88, 1e-3), 'lookAt 反解 eye=-R^T·t 得到相机位置 (0,46,88)');

// 2) 视线方向 = -n = -(V[2], V[6], V[10])，应指向目标方向（at - eye = -eye）
const fx = -V[2], fy = -V[6], fz = -V[10];
const lenV = Math.hypot(fx, fy, fz);
const eyeLen = Math.hypot(eye[0], eye[1], eye[2]);
assert(approx(fx / lenV, -eye[0] / eyeLen, 1e-2) && approx(fy / lenV, -eye[1] / eyeLen, 1e-2) && approx(fz / lenV, -eye[2] / eyeLen, 1e-2), 'lookAt 视线方向指向目标');

// 3) 轨迹球：view2 = Rm · view1 —— 先 view1 再 Rm（相机系内旋转），
//    等效于相机“原地转头”，故眼点应保持不变，视线方向改变
const axis = vec3(0.2, 0.9, 0.3);
const Rm = rotate(33, axis[0], axis[1], axis[2]);
const V2 = mult(Rm, V);
const ex2 = -(V2[0] * V2[12] + V2[1] * V2[13] + V2[2] * V2[14]);
const ey2 = -(V2[4] * V2[12] + V2[5] * V2[13] + V2[6] * V2[14]);
const ez2 = -(V2[8] * V2[12] + V2[9] * V2[13] + V2[10] * V2[14]);
assert(approx(ex2, eye[0], 1e-3) && approx(ey2, eye[1], 1e-3) && approx(ez2, eye[2], 1e-3), '轨迹球旋转后眼点不变（原地转头）');
const nfwd1 = [V[2], V[6], V[10]], nfwd2 = [V2[2], V2[6], V2[10]];
const changed = Math.abs(nfwd1[0] - nfwd2[0]) + Math.abs(nfwd1[1] - nfwd2[1]) + Math.abs(nfwd1[2] - nfwd2[2]);
assert(changed > 0.01, '轨迹球旋转后视线方向改变（旋转生效）');

// 4) 列向量右乘顺序：M = R_y(90)·T(0,0,-d)，点(0,0,1) 先平移后旋转 → (d,0,0)
const dist = 5;
const M = mult(rotate(90, 0, 1, 0), translate(0, 0, -dist));
const p = [0, 0, 1, 1];
const q = [0, 0, 0, 0];
for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) q[r] += M[c * 4 + r] * p[c];
assert(approx(q[0], -(dist - 1), 1e-3) && approx(q[2], 0, 1e-3), 'mult 顺序：先平移后旋转（公转矩阵正确）');

// 5) perspective 列主序形状
const P = perspective(50, 1.777, 0.1, 2000);
assert(approx(P[0], P[5] / 1.777, 1e-6), 'perspective f/aspect 正确');
assert(approx(P[11], -1, 1e-6), 'perspective 第3行第4列=-1');

// 6) 层级"先倾角后公转"：地球自转轴（局部Y）经倾角旋转后与世界Y夹角≈23.5°
const earthM = mult(mult(translate(0, 0, -dist), rotate(90, 0, 1, 0)), mult(rotate(23.5, 1, 0, 0), rotate(30, 0, 1, 0)));
const localY = [0, 1, 0, 1];
const wy = [0, 0, 0, 0];
for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) wy[r] += earthM[c * 4 + r] * localY[c];
const tiltDeg = Math.acos(Math.min(1, Math.max(-1, wy[1]))) * 180 / Math.PI;
assert(approx(tiltDeg, 23.5, 0.5), '地球自转轴经倾角旋转后与世界Y夹角≈23.5°（先转后挂）');
console.log('ALL MATH TESTS PASSED');
