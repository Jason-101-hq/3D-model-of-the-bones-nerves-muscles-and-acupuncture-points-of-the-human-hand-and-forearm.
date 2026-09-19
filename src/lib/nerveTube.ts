import * as THREE from 'three'

/**
 * 变半径管 —— 神经的渲染几何。
 *
 * 原先用的是 `new THREE.TubeGeometry(curve, 80, n.radius, 10, false)`：
 * 全段一个半径、80 段圆环、10 边截面、两端敞着口。神经看起来像一段**塑料管**，
 * 用户的原话是「太粗糙了」。
 *
 * 三处不一样：
 *
 * 1. **半径逐点给**。标本那几根神经的半径是从表面量出来的（表面顶点到截面形心的
 *    平均距离），本来就沿程变化，主干粗、末梢细。等直径把这条信息整个丢掉了。
 * 2. **端点收口**。敞口管在渲染里是「开口的洞」——从侧面看穿进管腔里，一眼假。
 *    现在两端按用途收：自由端（指尖、标本切面）拉长收细，接头端收成半球。
 * 3. **截面边数与圆环数按长度给**，长段多给几环，短段不必浪费。
 *
 * 采样用一个**平行移动标架**（parallel transport）而不是 Frenet：Frenet 标架在
 * 直线段与拐点处会翻法线，管壁出现螺旋状拧纹；平行移动把上一环的法线投影到
 * 当前切面上，只在管轴真的转了方向时才转。
 */

/** 端部处理方式 */
export type CapStyle =
  /**
   * 自由端：把管口拉长收细（指尖、标本切面）。收束长度约 1.5 倍半径，
   * 看起来是「神经在末梢渐渐变细」，而不是被齐口切断。
   */
  | 'free'
  /**
   * 接头端：把管口封成一个**半球**。半径沿四分之一椭圆从 1 收到 0.06，
   * 在端点处与管壁**相切**（切向连续），所以它既把管腔封死，又不会在管子上
   * 掐出一道腰。
   *
   * 这个"相切"是关键。早先的写法是短促收口：半径在 0.7 倍半径的长度里降到 0.3，
   * 末端变成一圈钝口；分叉处两根管都这么收，再补一个球去盖住钝口 —— 球比被掐细的
   * 管口粗、比管子本身细，于是每个分叉点上都鼓出一颗珠子，整条神经像一串念珠。
   * 换成半球，管口自己就封闭了，球完全不需要。
   */
  | 'dome'

export interface TubeStrand {
  pts: [number, number, number][]
  /** 与 pts 一一对应的半径 mm */
  r: number[]
  cap0?: CapStyle
  cap1?: CapStyle
  /**
   * spline：控制点稀疏（模型手写的示意走行），中间靠样条补出来
   * linear：已经密采样的中心线（标本），直接按弧长线性重采样
   */
  fit?: 'spline' | 'linear'
  /** 表面做几道轻微平滑（只动中间点，两端钉死）。标本中心线有亚毫米级抖动，抹掉更像神经 */
  relax?: number
}

export interface NerveGeometryOptions {
  /** 截面边数 */
  radialSegments?: number
  /** 沿程采样步长 mm */
  step?: number
}

/** 半径在两端收口时的形状：四分之一椭圆。x=0 收到 minScale，x=1 复原 */
function endProfile(x: number) {
  const t = Math.max(0, Math.min(1, x))
  return Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)))
}

/** 圆环顶点数。末位是首点的复制，用来消除截面接缝处的法线断裂 */
const RING_EXTRA = 1

/**
 * 弧长轴上的采样位置：先按 step 均匀铺一遍，再在各收口段里补几环。
 *
 * 为什么必须补：一个半径 2.7mm 的主干末端要收成圆头，收口长度就是 2.7mm；
 * 1.8mm 的均匀步长落在这段里只剩一两环，圆头被抽成一个棱台 —— 特写下就是
 * "管子被平口切了一刀"。收口段按二次分布补 5 环（越靠端点越密），轮廓才是圆的。
 */
function sampleAxis(L: number, step: number, extra: number[]) {
  const n = Math.max(2, Math.min(600, Math.ceil(L / step) + 1))
  const ts: number[] = []
  for (let i = 0; i < n; i++) ts.push((i / (n - 1)) * L)
  for (const t of extra) if (t > 1e-6 && t < L - 1e-6) ts.push(t)
  ts.sort((a, b) => a - b)
  return ts
}

/**
 * 按弧长重采样一条折线。
 *
 * `spline` 会先把控制点插成 CatmullRom（centripetal 参数化，抑制过冲），
 * 半径也走一条一维样条 —— 否则锥度会在控制点处折出可见的棱。
 */
function resample(s: TubeStrand, step: number, extra: number[]) {
  const V = s.pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
  const R = s.r.slice()
  if (V.length < 2) return null

  let P: THREE.Vector3[]
  let rad: number[]

  const coarse = s.fit === 'spline'
  if (coarse) {
    const curve = new THREE.CatmullRomCurve3(V, false, 'centripetal', 0.5)
    const L = curve.getLength()
    const spread = Math.max(...R) - Math.min(...R)
    const rc =
      spread < 1e-6
        ? null
        : new THREE.CatmullRomCurve3(
            R.map((v) => new THREE.Vector3(v, 0, 0)),
            false,
            'centripetal',
            0.5
          )
    const ts = sampleAxis(L, step, extra)
    P = ts.map((t) => curve.getPointAt(Math.min(1, t / L)))
    rad = rc ? ts.map((t) => rc.getPointAt(Math.min(1, t / L)).x) : ts.map(() => R[0])
  } else {
    const cum = [0]
    for (let i = 1; i < V.length; i++) cum.push(cum[i - 1] + V[i].distanceTo(V[i - 1]))
    const L = cum[cum.length - 1]
    if (!(L > 1e-6)) return null
    const ts = sampleAxis(L, step, extra)
    P = []
    rad = []
    let j = 0
    for (const t of ts) {
      while (j < cum.length - 2 && cum[j + 1] < t) j++
      const f = (t - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j])
      P.push(V[j].clone().lerp(V[j + 1], f))
      rad.push(R[j] + (R[j + 1] - R[j]) * f)
    }
  }

  // 轻度松弛：标本中心线是逐层质心串出来的，有 0.3~0.5mm 的锯齿，
  // 直接成管会在表面留下波纹。端点钉死 —— 它们要跟相邻段的分叉点严格重合。
  const passes = s.relax ?? (coarse ? 0 : 2)
  for (let it = 0; it < passes; it++) {
    const Q = P.map((v) => v.clone())
    for (let i = 1; i < P.length - 1; i++) {
      Q[i].copy(P[i - 1]).add(P[i]).add(P[i + 1]).multiplyScalar(1 / 3)
    }
    for (let i = 1; i < P.length - 1; i++) P[i].copy(Q[i])
  }

  return { P, R: rad }
}

interface RawMesh {
  pos: Float32Array
  nor: Float32Array
  idx: Uint32Array
}

/** 收束长度（mm）：自由端拉长些，接头端按半球取一倍半径 */
function capLenOf(cap: CapStyle | undefined, r: number) {
  return cap === 'free' ? 1.5 * r : cap === 'dome' ? r : 0
}

/**
 * 收口段的加密采样位置（弧长）。
 *
 * 补齐的位置按二次分布落在收口段内（越靠端点越密），因为收口是一段圆弧：
 * 越接近端点，半径变化越快，要采样点也越密才能把圆弧画圆。
 */
function capExtras(s: TubeStrand) {
  const last = s.pts.length - 1
  const L = polylineLength(s.pts)
  const out: number[] = []
  const push = (cap: CapStyle | undefined, r: number, atStart: boolean) => {
    const cl = Math.min(capLenOf(cap, r), 0.4 * L)
    if (!(cl > 1e-6)) return
    for (let k = 1; k <= 5; k++) {
      const u = (k / 6) * (k / 6)
      out.push(atStart ? cl * u : L - cl * u)
    }
  }
  push(s.cap0, s.r[0], true)
  push(s.cap1, s.r[last], false)
  return out
}

/**
 * 一条管。返回顶点/法线/索引，尚未合并。
 *
 * 法线不靠 computeVertexNormals，而是解析给出：管壁上任一点的外法线就是
 * 「该点相对管轴的径向」，但半径沿程变化时，法线要朝收细的方向偏 —— 所以
 * 先按径向给，再减去切向分量。这样收口段不会出现一圈发黑。
 */
function tubeOf(s: TubeStrand, radial: number, step: number): RawMesh | null {
  const rs = resample(s, step, capExtras(s))
  if (!rs) return null
  const { P, R } = rs
  const n = P.length
  if (n < 2) return null

  // ---- 切向（中心差分）----
  const T: THREE.Vector3[] = []
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)]
    const b = P[Math.min(n - 1, i + 1)]
    const t = b.clone().sub(a)
    if (t.lengthSq() < 1e-12) t.set(0, 0, 1)
    T.push(t.normalize())
  }

  // ---- 平行移动标架 ----
  const N: THREE.Vector3[] = []
  const B: THREE.Vector3[] = []
  const seed = Math.abs(T[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const n0 = new THREE.Vector3().crossVectors(T[0], seed)
  if (n0.lengthSq() < 1e-12) n0.set(1, 0, 0)
  n0.normalize()
  N.push(n0)
  B.push(new THREE.Vector3().crossVectors(T[0], n0).normalize())
  for (let i = 1; i < n; i++) {
    const prev = N[i - 1]
    const proj = prev.clone().addScaledVector(T[i], -prev.dot(T[i]))
    if (proj.lengthSq() < 1e-10) {
      const alt = Math.abs(T[i].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
      proj.crossVectors(T[i], alt)
    }
    proj.normalize()
    N.push(proj)
    B.push(new THREE.Vector3().crossVectors(T[i], proj).normalize())
  }

  // ---- 收口包络 ----
  //
  // 收口长度按**半径**给而不是按长度比例：半径 0.4mm 的指尖支收口不该有 5mm 长，
  // 半径 2mm 的主干也不该在 1mm 内被掐断。取 min 是为了长短两头的退化情况。
  const L = lengthOf(P)
  const frac0 = Math.max(0, Math.min(0.4, capLenOf(s.cap0, R[0]) / L))
  const frac1 = Math.max(0, Math.min(0.4, capLenOf(s.cap1, R[n - 1]) / L))
  // 自由端收到 5%：留一丝残径，免得末端那一圈顶点全部退化到同一点、法线乱掉。
  // 接头端收到 6%：它是半球，本来就该收到接近 0。
  const minScale0 = s.cap0 === 'free' ? 0.05 : 0.06
  const minScale1 = s.cap1 === 'free' ? 0.05 : 0.06

  /*
   * 收口包络。
   *
   * 关键：**按弧长比例**判收口，不能按采样序号比例。
   *
   * frac0/frac1 算出来是"收口段占全长的比例"，是长度量；而采样点是不均匀的 ——
   * 收口段里刚加密补过 5 环。拿 i/(n-1) 去比，等于把"第几个点"当成"走了多远"：
   * 一根 121mm 的主干补完密是 74 个点，收口段占 2.2%，于是只有最后 1 个点落在
   * 收口区间里 —— 圆头从来没被画出来过，管子看上去就是被齐口切了一刀。
   * 换成累计弧长占全长的比例，收口才真的落在收口段那 7 个环上。
   */
  const cum = [0]
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]))

  const vpr = radial + RING_EXTRA
  const pos = new Float32Array(vpr * n * 3)
  const nor = new Float32Array(vpr * n * 3)
  for (let i = 0; i < n; i++) {
    const u = cum[i] / (L || 1)
    let f = 1
    if (frac0 > 0 && u < frac0) f = Math.min(f, minScale0 + (1 - minScale0) * endProfile(u / frac0))
    if (frac1 > 0 && u > 1 - frac1)
      f = Math.min(f, minScale1 + (1 - minScale1) * endProfile((1 - u) / frac1))
    const rr = R[i] * f
    const nv = N[i]
    const bv = B[i]
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const ox = nv.x * ca + bv.x * sa
      const oy = nv.y * ca + bv.y * sa
      const oz = nv.z * ca + bv.z * sa
      const k = (i * vpr + j) * 3
      pos[k] = P[i].x + ox * rr
      pos[k + 1] = P[i].y + oy * rr
      pos[k + 2] = P[i].z + oz * rr
      nor[k] = ox
      nor[k + 1] = oy
      nor[k + 2] = oz
    }
  }

  const idx = new Uint32Array((n - 1) * radial * 6)
  let w = 0
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * vpr + j
      const b = a + vpr
      idx[w++] = a
      idx[w++] = b
      idx[w++] = a + 1
      idx[w++] = a + 1
      idx[w++] = b
      idx[w++] = b + 1
    }
  }
  return { pos, nor, idx }
}

function lengthOf(P: THREE.Vector3[]) {
  let s = 0
  for (let i = 1; i < P.length; i++) s += P[i].distanceTo(P[i - 1])
  return s
}

function polylineLength(pts: [number, number, number][]) {
  let s = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    s += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  }
  return s
}

/**
 * 把若干条管合成一个 BufferGeometry（一条神经一个 mesh，描边/拾取/剥离都不用改）。
 *
 * 不做任何布尔运算：分叉靠"每根管各自半球收口 + 端点严格重合"自然接上。
 * 相交处会留一道折痕（分叉的"裤裆"），那正是解剖上本来就有的形态。
 */
export function buildNerveGeometry(
  strands: TubeStrand[],
  opt: NerveGeometryOptions = {}
): THREE.BufferGeometry {
  const radial = opt.radialSegments ?? 12
  const step = opt.step ?? 1.6
  const raws = strands.map((s) => tubeOf(s, radial, step)).filter((x): x is RawMesh => !!x)

  let nv = 0
  let ni = 0
  for (const r of raws) {
    nv += r.pos.length
    ni += r.idx.length
  }
  const pos = new Float32Array(nv)
  const nor = new Float32Array(nv)
  const idx = new Uint32Array(ni)
  let vo = 0
  let io = 0
  for (const r of raws) {
    pos.set(r.pos, vo)
    nor.set(r.nor, vo)
    const base = vo / 3
    for (let i = 0; i < r.idx.length; i++) idx[io + i] = r.idx[i] + base
    vo += r.pos.length
    io += r.idx.length
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setIndex(new THREE.BufferAttribute(idx, 1))
  g.computeBoundingSphere()
  return g
}
