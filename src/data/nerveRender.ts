import * as THREE from 'three'
import { NERVES, type NerveDef, type NerveGroupId } from './nerves'
import { NERVE_FLOW, NERVE_R } from './nervePath'
import { buildNerveGeometry, type TubeStrand } from '../lib/nerveTube'

/**
 * 神经层怎么画 —— 把「数据」拼成「可渲染的几何」。
 *
 * ## 2026-09-18：几何来源换代
 *
 * 换之前这里要拼三种来源：标本中心线（手部，有半径）、前臂示意走行（模型标定）、
 * 手背补画层，再在两者之间画一圈「接缝环」。整段 `spliceInline` / `fuseTrunks` /
 * `FOREARM_STUB` 都是在给「两套几何硬接在一起」收尾 —— 收口、半径抹匀、
 * 分叉处把主干末端收拢到子支尺度。
 *
 * 现在整层神经是**一套**图谱几何（`public/models/nerves.glb`，与骨、肌同源），
 * 所以那些接缝逻辑全都不需要了：几何本身就是连续的，不存在"两根管子对接"。
 * 唯一剩下的接缝是**尺神经深支的示意补段**（图谱里它只画到掌骨间，缺跨掌那 28mm），
 * 那一段单独处理，见下面的 `tailOf()`。
 *
 * ## 为什么几何必须从 GLB 来，而不是像以前那样在模块里现算
 *
 * 以前每条神经的几何是 `useMemo` 里同步算出来的（控制点 → 变半径管）。
 * 现在几何是**测量出来的网格**，4.2 万顶点，只能进 GLB。
 * 于是这里从「造几何」变成「认几何」：把 GLB 里的网格认到某个 id 上，再补它缺的部分。
 *
 * ## 认几何为什么靠节点名
 *
 * GLB 的节点名被导成 `nerve_<应用 id>`（`nerve_median`、`nerve_ulnar-deep`…）。
 * 不靠 `extras.userData`：GLTFLoader 会不会把 node.extras 落到 `object.userData`
 * 上取决于版本，靠它等于把渲染层挂在一个没写进规范的行为上。
 * 也不靠 FBX 原名：`sanitizeNodeName` 会把空格换成下划线，还会**删掉** `.` `[` `]` `:` `/`，
 * 而 `Median nerve.l` 这类名字里全都有 —— 两侧对不上，而失配是静默的。
 * 下划线与字母数字不在清洗范围内，所以 `nerve_<id>` 两侧逐字相同，只需去掉前缀。
 */

/** 接缝标记：一圈细环，套在神经上，用中性灰蓝，明确不是解剖结构 */
export interface SeamMark {
  pos: THREE.Vector3
  /** 管轴方向（环面法线） */
  dir: THREE.Vector3
  /** 该处神经半径 mm */
  r: number
}

export interface NerveRender {
  id: string
  group: NerveGroupId
  geometry: THREE.BufferGeometry
  /** 流光脉冲走的路径：从近端到最远端的**最长通路**，不是单段 */
  flow: THREE.CatmullRomCurve3
  /** 流光脉冲球半径 mm */
  radius: number
  seams: SeamMark[]
  /**
   * 这套几何的来源。只有两种，界面上必须分开讲：
   *   - `atlas`     图谱网格（29 条里 28 条）
   *   - `schematic` 本模型标定的示意走行（只有正中神经返支，图谱里确实没有它）
   */
  source: 'atlas' | 'schematic'
  /** 除了图谱网格之外，还有没有本模型补的示意尾段（只有尺神经深支） */
  hasTail: boolean
}

const PREFIX = 'nerve_'
const XYZ = (p: [number, number, number]) => new THREE.Vector3(p[0], p[1], p[2])

/** 折线弧长 —— 给示意管定采样密度用 */
function polyLen(pts: [number, number, number][]) {
  let s = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    s += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  }
  return s
}

/**
 * 示意神经的半径：沿程给一道锥度。
 *
 * 给了 `radiusDistal` 就按弧长线性过渡（远端真的细）；没给就用 ±10% 的轻微锥度、
 * 保持平均半径不变 —— 凭空收细等于编数据，轻微锥度只是为了让它不像一段塑料管。
 */
function taperRadii(
  pts: [number, number, number][],
  radius: number,
  distal?: number
): number[] {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]))
  }
  const L = cum[cum.length - 1] || 1
  if (distal !== undefined) {
    return pts.map((_, i) => radius + (distal - radius) * (cum[i] / L))
  }
  return pts.map((_, i) => radius * (1.1 - 0.2 * (cum[i] / L)))
}

/**
 * 把两段几何并成一段（position + normal + index）。
 *
 * 自己写十几行，而不是用 `BufferGeometryUtils.mergeGeometries`：这里只并两份、
 * 属性固定为三种，而 util 对「属性集是否一致、索引类型是否相同」有一堆前提，
 * 版本之间还改过行为。手写没有前提，也不需要为一个函数多拉一个模块。
 */
function mergeGeoms(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const pa = a.getAttribute('position') as THREE.BufferAttribute
  const na = a.getAttribute('normal') as THREE.BufferAttribute
  const pb = b.getAttribute('position') as THREE.BufferAttribute
  const nb = b.getAttribute('normal') as THREE.BufferAttribute
  const ia = a.getIndex()!
  const ib = b.getIndex()!

  const pos = new Float32Array((pa.count + pb.count) * 3)
  const nor = new Float32Array((pa.count + pb.count) * 3)
  pos.set(pa.array as Float32Array, 0)
  pos.set(pb.array as Float32Array, pa.count * 3)
  nor.set(na.array as Float32Array, 0)
  nor.set(nb.array as Float32Array, na.count * 3)

  const idx = new Uint32Array(ia.count + ib.count)
  for (let i = 0; i < ia.count; i++) idx[i] = ia.getX(i)
  for (let i = 0; i < ib.count; i++) idx[ia.count + i] = ib.getX(i) + pa.count

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setIndex(new THREE.BufferAttribute(idx, 1))
  g.computeBoundingSphere()
  return g
}

/**
 * 从 GLB 场景里按节点名收出「id → 网格」。
 *
 * 顺带核对**两边不多不少**：GLB 里有一条 `nerve_` 节点而 `nerves.ts` 里没有它，
 * 说明加了神经忘了接线；反过来则说明 GLB 该重导了。两种都不该静默通过 ——
 * 少了只是画不出来（看得出来），多了则是**看不见的多余几何**，最难发现。
 */
function collectAtlas(root: THREE.Object3D): Map<string, THREE.Mesh> {
  const out = new Map<string, THREE.Mesh>()
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.name.startsWith(PREFIX)) return
    out.set(m.name.slice(PREFIX.length), m)
  })
  const stray = [...out.keys()].filter((id) => !NERVES.some((n) => n.id === id))
  if (stray.length) console.warn('[nerveRender] GLB 里有清单之外的神经节点:', stray)
  const absent = NERVES.filter((n) => n.atlas && !out.has(n.id)).map((n) => n.id)
  if (absent.length) console.warn('[nerveRender] 清单里有但 GLB 里没有:', absent)
  return out
}

/** 示意补段（尺神经深支缺的那 28mm） */
function tailOf(def: NerveDef): TubeStrand | null {
  const pts = def.tailPath
  if (!pts?.length) return null
  const r0 = def.radius ?? 1.1
  // 远端收细：它是一根走向终末的支，不该从头到尾一样粗
  const r1 = r0 * 0.68
  return {
    pts,
    r: taperRadii(pts, r0, r1),
    // 近端封成半球：它要顶进图谱几何的开口端里，半球正好把那个口盖住
    cap0: 'dome',
    // 远端自由端拉长收细 —— 它本来就在肌肉之间渐渐消失，齐口切一刀会显得断得莫名其妙
    cap1: 'free',
    fit: 'spline',
  }
}

function build(def: NerveDef, atlas: Map<string, THREE.Mesh>): NerveRender {
  const seams: SeamMark[] = []
  const mesh = atlas.get(def.id)

  let geometry: THREE.BufferGeometry
  let source: NerveRender['source']

  if (mesh) {
    source = 'atlas'
    /*
     * 直接借 GLB 的几何对象，不 clone。
     *
     * 不 clone 是安全的：这里只把 BufferGeometry 挂到我们自己的 mesh 上，
     * 不动 `gltf.scene` 的节点结构 —— 同一个几何被两个 mesh 引用是 three 支持的常态。
     * clone 一份反而要再复制 4 万个顶点，而 GLB 本来就常驻内存。
     *
     * 但**不能**反过来把这个 mesh 从 gltf.scene 摘下来挂到我们的 group 上：
     * 那样第二次 mount（HMR、切预置）就会找不到它。
     */
    geometry = mesh.geometry
  } else {
    source = 'schematic'
    if (!def.path?.length) throw new Error(`神经 ${def.id} 既无图谱几何也无示意路径`)
    geometry = buildNerveGeometry(
      [
        {
          pts: def.path,
          r: taperRadii(def.path, def.radius ?? 1.1, def.radiusDistal),
          cap0: 'dome',
          cap1: 'free',
          fit: 'spline',
        },
      ],
      { radialSegments: 16, step: 1.4 }
    )
  }

  const tail = tailOf(def)
  let hasTail = false
  if (tail) {
    hasTail = true
    geometry = mergeGeoms(geometry, buildNerveGeometry([tail], { radialSegments: 16, step: 1.4 }))
    seams.push(seamAt(tail))
  }

  /* 流光路径。
     优先用预先算好的最短路径（`NERVE_FLOW`，取自图谱网格上最长那个连通分量的骨干）；
     它是**跨分量不可拼**的 —— 一条神经的分支分量分开存储，把各分量的点直接串起来
     会让曲线在分量之间跨空跳一段，表现成「流光突然从手背蹦到手掌」。
     所以补段单独接在后面（补段是朝远端写的，接着走就对），而不是混进采样点里。 */
  const flowPts = [...(NERVE_FLOW[def.id] ?? []), ...(def.tailPath ?? [])]
  const flow = new THREE.CatmullRomCurve3(flowPts.map(XYZ), false, 'centripetal', 0.5)

  /* 脉冲球半径。
     不取「这条神经最粗处的半径」——那会让细支的脉冲球（0.6mm）在整臂机位下
     连一个像素都点不出来，而脉冲恰恰是「这条神经把信号送到哪儿」的唯一提示。
     取一个下限 1.2mm 兜住细支，上限 2.6mm 免得主干上顶出一个球。 */
  const rMm = NERVE_R[def.id] ?? def.radius ?? 1.2
  const radius = Math.min(2.6, Math.max(1.2, rMm * 0.9))

  return { id: def.id, group: def.group, geometry, flow, radius, seams, source, hasTail }
}

/** 补段接缝：位置取补段起点，朝向给一段近端切线 */
function seamAt(tail: TubeStrand): SeamMark {
  const p = tail.pts[0]
  const q = tail.pts[1]
  return {
    pos: XYZ(p),
    dir: new THREE.Vector3(p[0] - q[0], p[1] - q[1], p[2] - q[2]).normalize(),
    r: tail.r[0],
  }
}

let CACHE: Map<string, NerveRender> | null = null

/**
 * 全部神经的渲染数据。
 *
 * 几何在这里只认一次（GLB 那份网格是常驻的），此后切换/剥离/剖切都复用同一批对象 ——
 * 每帧重新认一遍会让 `traverse` 与字符串前缀判断落进热路径。
 *
 * `root` 传 GLB 的 `scene`。第一次调用之后它就不再被读取，所以即使 React 每次
 * 渲染拿到的是同一个 gltf 对象、`useMemo` 依赖没变，也不会漏掉更新。
 */
export function nerveRenders(root: THREE.Object3D): NerveRender[] {
  if (!CACHE) {
    const atlas = collectAtlas(root)
    CACHE = new Map(NERVES.map((n) => [n.id, build(n, atlas)]))
  }
  return NERVES.map((n) => CACHE!.get(n.id)!)
}

/** 单条神经的渲染数据，口径与 `nerveRenders` 完全一致（同一份缓存） */
export function nerveRenderOf(root: THREE.Object3D, id: string): NerveRender | null {
  return nerveRenders(root).find((r) => r.id === id) ?? null
}

/** 示意管长度占比 —— 界面上「这根有多少是画出来的」那句提示要用 */
export function schematicFraction(id: string): number {
  const def = NERVES.find((n) => n.id === id)
  if (!def) return 0
  if (!def.atlas) return 1
  if (!def.tailPath?.length) return 0
  return polyLen(def.tailPath) / (polyLen(def.tailPath) + (NERVE_FLOW[id]?.length ?? 0) * 10)
}
