import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, OrbitControls, Outlines, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import {
  BONE_NAMES,
  LAYERS,
  MUSCLE_NAMES as MUSCLE_STRUCT_NAMES,
  NERVES,
  PRESETS,
  SKIN_IDS,
  nerveFocusPoint,
  nerveTipPoint,
  presetTarget,
  STRUCTURE_INDEX,
  type LayerId,
} from './data/anatomy'
import { ACUPOINTS, ACUPOINT_BY_ID, HAND_MERIDIANS, layersOf, meridianPath, type Acupoint } from './data/acupoints'
import { MUSCLE_MESH_NAME, MUSCLE_TRANSFORM } from './data/muscleMeshes'
import { CUTANEOUS_ZONES } from './data/innervation'
import { funcGroupOf, nerveGroupOf, styleOf } from './data/muscleGroups'
import { NERVE_GROUPS } from './data/nerves'
import { NERVE_R } from './data/nervePath'
import { nerveRenders, type NerveRender } from './data/nerveRender'
import { planPeel, type PeelPlan } from './data/peel'
import { useAtlas, VIEWS } from './store'
import SpecimenGroup from './SpecimenGroup'

const SCALE = 0.01 // mm -> 场景单位
const ROT: [number, number, number] = [-Math.PI / 2, 0, 0] // 模型 Z-up -> 场景 Y-up

/**
 * 体表壳资源。它不像 bones.glb / muscles.glb 那样来自解剖数据集，
 * 而是由本模型自己的骨与肌轮廓算出来的（生成脚本 `_recon/skin/build_skin.py`）——
 * 顶点已是模型坐标，加载后不需要任何变换，与骨骼共用同一个父级。
 */
const SKIN_URL = '/models/skin.glb'

/** 统一的选中语言：亮青色描边。刻意避开所有群色（红／蓝／粉／灰）以免混淆 */
const SELECT_COLOR = '#22D3EE'
/**
 * 「因为选中了别的东西才亮起来」的结构用另一种颜色。
 *
 * 与 SELECT_COLOR 区分开是有必要的：青色始终表示「我点的就是它」，
 * 琥珀色表示「它和被选中的那个有支配关系」。两种情况都亮同一色的话，
 * 点了一块肌肉后分不清哪条是它自己、哪条是被牵连亮的。
 */
const RELATED_COLOR = '#F59E0B'
/**
 * 「数据接缝」标记的颜色。
 *
 * 接缝 = 前臂示意走行与手部标本真几何的接口。必须一眼看出它不是解剖结构，
 * 所以选一个整套配色里没有用过、也不像任何组织的中性灰蓝，且做成正圆的机械环。
 * 若用琥珀或青色，会被读成「这条神经被高亮了」或「这里有个结构」。
 */
const SEAM_COLOR = '#7C8FA3'
const SEAM_OPACITY = 0.9
/** 关联流光的脉冲个数与跑完全程的秒数 */
const FLOW_PULSES = 3
const FLOW_PERIOD = 2.6

/** 被剥掉的层向外散开多远（各自模型单位：肌肉为米，神经为毫米） */
const PEEL_OFFSET_MUSCLE = 0.055
const PEEL_OFFSET_NERVE = 48

/**
 * 神经的「远景保底可见」外扩。
 *
 * ── 为什么需要 ──
 * B 阶段在同一套机位下量过：整臂机位时神经在屏幕上**宽度中位只有 3px**，
 * 23% 的段只有 1–2px（最细的指支 0.6mm 半径 → 0.8px，基本等于看不见）。
 * 那是真实管径如实画出来的结果 —— 问题是它作为**线条**读不出来。
 * 前臂与手部近景是 12–13px，一点问题都没有。所以只需要补远景。
 *
 * ── 怎么补 ──
 * 按相机距离，把顶点沿法线外扩一点，让屏幕上的半径不低于 `NERVE_MIN_R_PX`。
 * 外扩量每帧在 CPU 上按「这一帧、这台相机、这条神经的实际距离」算一次，
 * 写进材质的一个 uniform，**不重建几何**（几何是 4 万顶点的图谱网格，重建不可接受）。
 *
 * ── 两条护栏 ──
 * ① 外扩不超过自身半径的 `NERVE_MAX_GROW_RATIO`：否则细支会被撑到和主干一样粗，
 *    「正中比桡粗」这类相对信息当场丢失，而那正是解剖图上要读的东西。
 * ② 外扩有绝对上限 `NERVE_MAX_GROW_MM`：相机拉到很远时按比例算出来的外扩量会失控，
 *    整条神经会胀成一堆管子。
 *
 * 近景下算出的目标半径本来就小于实际半径，外扩量为 0 —— **近景是忠实的**。
 *
 * ── 三个数是怎么定的（不是拍的）──
 * 先量出「应用自己的机位下，一个模型单位占几个 CSS 像素」：
 * 画布高约 1130px、fov 38°、世界缩放 0.01，于是 pxPerMm = 11.3 / 距离(场景单位)。
 *   整体视图预设 距离 10.9 → **1.04 px/mm**
 *   腕管预设     距离 1.35 → **8.37 px/mm**
 * 再看半径谱：29 条里 15 条落在 0.6mm 的下限（细支），主干 2.29mm（正中），
 * 数字神经束 3.2mm（多条支合并成一个对象，半径估计本身不可用）。
 * 于是：
 *   目标直径 3.2px（`MIN_R_PX = 1.6` 是半径）→ 整体视图下 0.6mm 的那批要
 *   外扩到 1.54mm，即**自身半径的 1.56 倍**，所以比例上限取 1.6 —— 这是让
 *   最细的一条真的达到目标所需的**最小**倍数，再大就纯属加工。
 *   而 2.29mm 的主干在整体视图下本来就是 4.8px，目标半径反而**小于**它 → 外扩为 0，
 *   忠实的部分仍然是忠实的。近景 8.37 px/mm 下 0.6mm 已是 5px，同样为 0。
 * 结论：这两个数一起把「远景补足」与「相对粗细不丢」同时满足了，
 * 而不是拿一个数去折中另一头。
 */
const NERVE_MIN_R_PX = 1.6
const NERVE_MAX_GROW_RATIO = 1.6
const NERVE_MAX_GROW_MM = 2.4

/** 每帧算外扩量时的临时向量（useFrame 顺序执行，不会重入） */
const _nerveCenter = new THREE.Vector3()
const _nerveScale = new THREE.Vector3()

/**
 * 每条神经**当前**的外扩量（mm）。
 *
 * 只给调试通道读，渲染逻辑一律走材质 uniform，不依赖这张表。
 * 它存在的理由是：让「远景外扩到底有没有生效」变成一个**可断言的值**。
 * 靠比两张截图的线宽去判断是不行的 —— 线宽里混着投影尺度、抗锯齿阈值与遮挡，
 * 三个变量一起动，结论永远说不干净（B 阶段就在这上面连栽两次）。
 * 而外扩量的正确性只需要和一个数比：它是不是 0（近景）、有没有超上限。
 */
const NERVE_GROW = new Map<string, { value: number }>()

/**
 * 把「沿法线外扩」注入标准材质。
 *
 * 不能靠改几何，也不能靠 `scale`：前者要重建 4 万顶点，后者会把管子沿轴向一起拉长。
 * 只能在顶点着色器里、`transformed` 定出来之后加一项 —— 而那一刻 `objectNormal`
 * 已经由 `<beginnormal_vertex>` 备好了。
 *
 * ⚠️ 外扩的必须是 `transformed`（位置），**不能顺手改 `objectNormal`**：
 * 法线也跟着外扩的话，管壁的明暗会随外扩量一起变，远景下神经的立体感会糊掉。
 * 剖切也仍然正确 —— `<clipping_planes_vertex>` 在 `project_vertex` 之后取 `mvPosition`，
 * 所以裁的是外扩之后的表面，与看到的形状一致。
 */
function patchNerveGrow(
  shader: { uniforms: Record<string, { value: number }>; vertexShader: string },
  u: { value: number }
) {
  shader.uniforms.uNerveGrow = u
  shader.vertexShader =
    'uniform float uNerveGrow;\n' +
    shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  transformed += objectNormal * uNerveGrow;'
    )
}
/**
 * 体表壳**不外移**，只在原地淡出。
 *
 * 别的层是「一块块结构」，向外飘散才看得出被揭开；体表是一整张包住所有东西的皮，
 * 它没有唯一的「向外」——从一个壳的整体看，唯一合乎直觉的揭开方式就是它自己消散掉。
 * 而且它只有一个网格，`PeelCfg` 给不出逐块的径向（那个方向是按每块网格自身位置算的），
 * 硬给一个方向会让整层皮朝一侧平移出去，像被风吹跑。
 */
const PEEL_OFFSET_SKIN = 0

/** 剥离进度推进的速度（每秒走完的行程比例） */
const PEEL_SPEED = 3.2

/** 剥离时禁止拾取：结构已淡出但不该还挡住鼠标 */
const NO_HIT = () => null

/**
 * 辅助几何的标记：**不是解剖结构**，只是注解/示意（数据接缝环、进针示意圆柱、
 * 穴位深度环、外圈光环）。
 *
 * 为什么要显式标记：验证脚本按「结构名 → 图层」统计画面，而这些辅助几何既没有名字
 * 也不该有图层归属，于是会被算成「查不到归属的网格」——统计里少算一个数，
 * 或者反过来逼着人去给一根装饰环编一个图层。标一下，脚本就能把它们**排除**掉，
 * 而真·忘了登记图层的新结构仍会被报出来。
 */
const HELPER = { helper: true } as const

/**
 * 默认拾取。必须显式指回 Mesh.prototype.raycast。
 *
 * 不要写 `raycast={stripped ? NO_HIT : undefined}`：R3F 会把 `undefined`
 * 当成一个要写入的值覆盖到 mesh 上，于是 `mesh.raycast` 从原型链上的函数
 * 变成自有属性 undefined。之后任何一次射线检测都会抛
 * `object.raycast is not a function`，整个画布的悬停与点击拾取一起失效
 * （且抛在事件里，不报错到界面，只能靠 pageerror 抓）。
 */
function DEFAULT_HIT(
  this: THREE.Mesh,
  raycaster: THREE.Raycaster,
  intersects: THREE.Intersection[]
) {
  return THREE.Mesh.prototype.raycast.call(this, raycaster, intersects)
}

/**
 * GLTFLoader 会用 PropertyBinding.sanitizeNodeName 清洗节点名：
 * 所有空白字符被替换为下划线（"left humerus" -> "left_humerus"）。
 * 数据表里存的是原始名，因此比对前必须先做同样的清洗。
 */
export function sanitizeMeshName(n: string) {
  return n.replace(/\s/g, '_')
}

/** GLTFLoader 已把 mesh 名清洗为下划线风格，因此查找表一侧也要做同样转换 */
const BONE_SET = new Set([...BONE_NAMES].map(sanitizeMeshName))

/**
 * 结构名 → 图层，**键同时收「数据表原名」与「清洗后名」两种写法**。
 *
 * 数据表里骨名带空格（`left humerus`），而场景里的节点名已被 GLTFLoader 清洗成
 * `left_humerus`。验证脚本拿到的是**场景名**，直接查 `STRUCTURE_INDEX` 会全部落空
 * ——表现是「骨 0 块」（看着像骨没加载），或「30 个网格查不到图层归属」。
 * 这类失配不会抛错，只会让统计数悄悄变 0，所以两种写法都收进同一张表。
 */
const STRUCTURE_LAYER_BY_NAME = new Map<string, LayerId>()
for (const [k, v] of STRUCTURE_INDEX) {
  STRUCTURE_LAYER_BY_NAME.set(k, v.layer)
  STRUCTURE_LAYER_BY_NAME.set(sanitizeMeshName(k), v.layer)
}

/** 模型坐标 -> 场景坐标 */
function toScene(p: [number, number, number], c: THREE.Vector3) {
  return new THREE.Vector3(
    (p[0] - c.x) * SCALE,
    (p[2] - c.z) * SCALE,
    -(p[1] - c.y) * SCALE
  )
}
function dirToScene(p: [number, number, number]) {
  return new THREE.Vector3(p[0] * SCALE, p[2] * SCALE, -p[1] * SCALE)
}

interface Item {
  id: string
  geometry: THREE.BufferGeometry
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  scale: THREE.Vector3
}

/** 从 glTF 场景中挑出我们要的结构，并把世界矩阵分解为 position/quaternion/scale */
function collect(gltf: { scene: THREE.Object3D }, resolve: (n: string) => string | null) {
  const out: Item[] = []
  gltf.scene.updateMatrixWorld(true)
  const pos = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const scl = new THREE.Vector3()
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (!(m as unknown as { isMesh?: boolean }).isMesh) return
    const id = resolve(sanitizeMeshName(o.name))
    if (!id) return
    m.matrixWorld.decompose(pos, quat, scl)
    out.push({
      id,
      geometry: m.geometry,
      position: pos.clone(),
      quaternion: quat.clone(),
      scale: scl.clone(),
    })
  })
  return out
}

/** 双击判定窗口（ms）。与浏览器 dblclick 无关，自己计时更可控 */
const DOUBLE_CLICK_MS = 260

/** 透明度低于此值的结构算「半透明／已淡出」，不再遮挡后面的结构 */
const SOLID_OPACITY = 0.5

interface PickEvent {
  stopPropagation: () => void
  point: THREE.Vector3
  /** 真正挂事件的结构 mesh（射线可能先打到它的描边子节点，冒泡一层才到这里） */
  eventObject: THREE.Object3D
  /** 沿射线的全部候选，按距离由近到远 */
  intersections: { eventObject: THREE.Object3D }[]
}

function opacityOf(o: THREE.Object3D) {
  const m = (o as THREE.Mesh).material
  const mat = Array.isArray(m) ? m[0] : m
  return mat ? mat.opacity ?? 1 : 1
}

/** 自身或任一祖先被隐藏（图层开关、剥离淡出都挂在包裹分组上），就不该参与拾取 */
function shownAt(o: THREE.Object3D) {
  let p: THREE.Object3D | null = o
  while (p) {
    if (!p.visible) return false
    p = p.parent
  }
  return true
}

/**
 * 该不该把这次拾取让给它后面的实心结构。
 *
 * 半透明结构——图层透明度被压低的肌肉、孤立模式里被淡出的其余结构——**不该挡住**
 * 它后面的实心结构。否则「把肌肉压到三成再看神经」「孤立模式点深部结构」这两件
 * 最常用的动作都会被浅层吃掉点击：看得见，却怎么都指不中。
 *
 * 但也不能一律不响应：背后没有实心结构时，半透明结构本身仍应能被指到（例如
 * 腕部肌肉压薄后、该处已经没有骨或神经在下面，指着它仍该出名称）。
 * 所以判据是「自己是半透明的，且沿射线更远处存在实心结构」。
 */
function yieldToSolid(e: PickEvent) {
  if (opacityOf(e.eventObject) > SOLID_OPACITY) return false
  const i = e.intersections.findIndex((it) => it.eventObject === e.eventObject)
  if (i < 0) return false
  for (let k = i + 1; k < e.intersections.length; k++) {
    if (opacityOf(e.intersections[k].eventObject) > SOLID_OPACITY) return true
  }
  return false
}

/**
 * 沿射线挑出「指针真正指向的那个结构」。
 *
 * 规则可以压成一句话：**最近的实心结构胜出；一个实心结构都没有时，取最前面那个。**
 * 这与 `yieldToSolid` 是同一件事的另一种说法——半透明结构只有在身后没有实心结构时
 * 才自己接手，否则一路让过去。
 */
function resolveHover(hits: THREE.Intersection[]): string | null {
  let nearest: { id: string; solid: boolean } | null = null
  for (const h of hits) {
    const o = h.object as THREE.Mesh
    if (!o.isMesh || !o.name || !shownAt(o)) continue
    const solid = opacityOf(o) > SOLID_OPACITY
    if (!nearest) nearest = { id: o.name, solid }
    if (solid) return o.name
  }
  return nearest ? nearest.id : null
}

/**
 * 点击交互。
 *
 * 单击与双击都走同一个 click 处理器：先按单击立即选中（保证即时反馈），
 * 若在 DOUBLE_CLICK_MS 内又点了一次，则撤销第二次的 toggle 改为「把旋转中心搬过来」。
 * 这样双击不会出现「选中→取消→选中」的闪烁，也不依赖浏览器的 dblclick 时序。
 *
 * 这里只处理点击：悬停交给 HoverProbe。原因是 R3F 的悬停派发有两处会互相咬住——
 * 它只在对象**首次**进入悬停集合时派发 onPointerOver（同一对象内后续移动不再派发），
 * 且对象一旦调用过 stopPropagation 就被记为 stopped，之后直接短路，连处理器都不进。
 * 于是「先扫过一块肌肉、再移回它后面那根神经」时，事件在肌肉那里就被截住了，
 * 名称卡停在肌肉上不动——指着神经却显示肌肉。点击没有这个问题（走的是另一条分支），
 * 所以保留 R3F 的事件，只把悬停换成自己发射线判定。
 */
function usePickHandlers(id: string) {
  const lastClick = useRef(0)

  const onClick = useCallback(
    (e: PickEvent) => {
      if (yieldToSolid(e)) return
      e.stopPropagation()
      const st = useAtlas.getState()
      const now = performance.now()
      if (now - lastClick.current < DOUBLE_CLICK_MS) {
        lastClick.current = 0
        st.select(id)
        // 把旋转中心搬到被双击的位置，之后环绕、放大都围绕这里，
        // 放大看腕管／肘管这类局部结构时不会再「一拖就飞」
        st.request({ kind: 'focus', point: [e.point.x, e.point.y, e.point.z] })
        return
      }
      lastClick.current = now
      st.select(st.selected === id ? null : id)
    },
    [id]
  )

  return { onClick }
}

/** 剥离配置：让一组结构知道自己在剥离序列里的位置，以及该往哪个方向散开 */
export interface PeelCfg {
  plan: PeelPlan
  /** 肢体长轴：'y' = 模型 Y 轴向上（hpfrei 肌肉）；'z' = 模型 Z 轴向上（BodyExplorer） */
  longAxis: 'y' | 'z'
  /** 完全剥离时的外移距离（各自模型单位） */
  offset: number
  /** longAxis='z' 时，垂直于长轴的平面上的参考中心（模型坐标） */
  axisXZ?: [number, number]
}

function StructureMesh({
  item,
  layer,
  planes,
  peel,
}: {
  item: Item
  layer: LayerId
  planes: THREE.Plane[]
  peel?: PeelCfg
}) {
  const st = useAtlas((s) => s.layers[layer])
  const isSel = useAtlas((s) => s.selected === item.id)
  const hasSel = useAtlas((s) => s.selected !== null)
  const isolate = useAtlas((s) => s.isolate)
  const colorMode = useAtlas((s) => s.colorMode)
  const highlightGroup = useAtlas((s) => s.highlightGroup)
  const isHover = useAtlas((s) => s.hovered === item.id)
  const peelDepth = useAtlas((s) => s.peelDepth)
  const related = useAtlas((s) => s.related)
  const handlers = usePickHandlers(item.id)

  const wrapRef = useRef<THREE.Group>(null)
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  /** 0 = 在原位，1 = 已完全剥开。用 ref 而非 state：每帧都变，不该触发 React 重渲染 */
  const peelT = useRef(0)

  const step = peel?.plan.stepOf.get(item.id)
  const stripped = step !== undefined && step <= peelDepth

  /** 向外散开的方向：垂直于肢体长轴、由中轴指向该结构 */
  const radial = useMemo(() => {
    if (!peel) return new THREE.Vector3(0, 0, 1)
    const p = item.position
    const v =
      peel.longAxis === 'y'
        ? new THREE.Vector3(p.x, 0, p.z)
        : new THREE.Vector3(p.x - (peel.axisXZ?.[0] ?? 0), p.y - (peel.axisXZ?.[1] ?? 0), 0)
    // 正好落在中轴上的结构没有唯一径向，给个固定方向兜底
    return v.lengthSq() < 1e-9 ? new THREE.Vector3(0, 0, 1) : v.normalize()
  }, [item.position, peel])

  // 只有肌肉参与分组编码；骨骼与神经沿用图层色
  const grp = layer === 'muscle' ? styleOf(item.id, colorMode) : null
  const baseColor = grp?.fill ?? LAYERS[layer].color

  // 图例点选的高亮群：非目标群整体压暗
  const gkey =
    layer === 'muscle'
      ? colorMode === 'func'
        ? funcGroupOf(item.id)
        : nerveGroupOf(item.id)
      : null
  const groupMuted = highlightGroup !== null && gkey !== highlightGroup

  /**
   * 关联高亮（选中神经 → 它支配的肌肉）。
   *
   * 只对肌肉生效：骨骼与支持结构不参与神经支配，「相关/不相关」对它们不成立。
   */
  const isRelatedTarget = layer === 'muscle' && related.muscles.includes(item.id)
  /**
   * 选中一条神经时把不相关的肌肉压暗。
   *
   * 压暗幅度刻意比「孤立模式」轻得多（那一档是 12%，这里是 42%）：孤立模式表达的是
   * 「只看这一块」，而这里表达的是「这几块归这条神经管」——同一条神经在全身往往只
   * 支配三五块肌肉，若其余全部压到 12%，整条手臂会淡成一片灰雾，反而看不出
   * 这几块亮着的肌肉长在什么位置上。保持半透明仍能看出肢体轮廓。
   */
  const nerveMuted = layer === 'muscle' && related.muteMuscles && !isRelatedTarget && !isSel

  const dimmedStrong = (isolate && hasSel && !isSel) || groupMuted
  const dimmed = dimmedStrong || nerveMuted
  const baseOpacity = dimmedStrong
    ? Math.min(st.opacity * 0.15, 0.12)
    : nerveMuted
      ? Math.min(st.opacity * 0.42, 0.32)
      : st.opacity

  // 描边：候选顺序为 选中(青) > 掠过(青) > 关联(琥珀) > 同群深色细边
  const outlineOpacity = isSel
    ? 1
    : isHover
      ? 0.95
      : isRelatedTarget
        ? 0.95
        : grp && !groupMuted
          ? 0.85
          : 0
  const outlineThickness = isSel ? 4 : isHover ? 2.6 : isRelatedTarget ? 3 : 1.4
  const outlineColor =
    isSel || isHover ? SELECT_COLOR : isRelatedTarget ? RELATED_COLOR : grp?.stroke ?? '#000000'

  // 掠过的结构提亮，但保留本色（避免被误认为选中）；关联靶肌给琥珀色自发光
  const emissiveIntensity = isSel ? 0.12 : isHover ? 0.26 : isRelatedTarget ? 0.3 : 0

  // 透明度由 useFrame 统一写：React 每帧重设 opacity 会和剥离补间打架
  useFrame((state, dt) => {
    const g = wrapRef.current
    const m = matRef.current
    if (!g || !m) return

    const target = stripped ? 1 : 0
    const cur = peelT.current
    if (cur !== target) {
      const delta = target - cur
      peelT.current = cur + Math.sign(delta) * Math.min(Math.abs(delta), dt * PEEL_SPEED)
    }
    const t = peelT.current

    // 先向外飘、后段才淡出：把「被揭开」和「消失」错开，动作才看得清
    const ease = t * t * (3 - 2 * t)
    g.position.copy(radial).multiplyScalar((peel?.offset ?? 0) * ease)
    const fade = t <= 0.3 ? 0 : (t - 0.3) / 0.7
    m.opacity = baseOpacity * (1 - Math.min(1, fade))
    g.visible = st.visible && t < 0.999

    // 关联靶肌与神经上的流光同频呼吸：动态上也表现为「同一件事」
    if (isRelatedTarget && !isSel && !isHover) {
      m.emissiveIntensity = 0.3 * (0.62 + 0.38 * Math.sin(state.clock.elapsedTime * 3.4))
    }
  })

  return (
    <group ref={wrapRef}>
      <mesh
        name={item.id}
        geometry={item.geometry}
        position={item.position}
        quaternion={item.quaternion}
        scale={item.scale}
        raycast={stripped ? NO_HIT : DEFAULT_HIT}
        {...handlers}
      >
        <meshStandardMaterial
          ref={matRef}
          color={baseColor}
          roughness={layer === 'bone' ? 0.75 : 0.6}
          metalness={0.02}
          transparent={baseOpacity < 1}
          depthWrite={baseOpacity > 0.9}
          emissive={isSel || isHover ? '#ffffff' : isRelatedTarget ? RELATED_COLOR : '#000000'}
          emissiveIntensity={emissiveIntensity}
          clippingPlanes={planes}
          clipShadows
        />
        <Outlines
          visible={outlineOpacity > 0 && !stripped}
          thickness={outlineThickness}
          color={outlineColor}
          transparent
          opacity={outlineOpacity}
          angle={0}
          clippingPlanes={planes}
        />
      </mesh>
    </group>
  )
}

/**
 * 体表壳 —— 由骨与肌轮廓外扩算出来的那一层（来历见 data/anatomy.ts 的 SKIN_STRUCTURE）。
 *
 * 它走的是与骨／肌完全相同的通道：同一个 `StructureMesh`、同一套拾取、同一套裁剪面。
 * 这样它自动继承了三件已经调好的事：
 *
 * - **半透明时不抢拾取**。`SOLID_OPACITY = 0.5`：体表默认压在三成，于是它一律让位给
 *   它身后的实心结构 —— 开着体表照样能直接点到里面的肌肉和神经。把透明度推过半，
 *   它就变成实心并开始遮挡，行为与「一层不透明的皮」相符。
 * - **裁剪面**（剖面模式）对它同样生效，于是剖面下不会出现「皮被切开、里面却空着」
 *   或反过来的穿帮。
 * - **剥离序列**里它排第一步（见 data/peel.ts），剥掉它才看得到肌肉。
 */
function SkinGroup({ planes, peelPlan }: { planes: THREE.Plane[]; peelPlan: PeelPlan }) {
  const gltf = useGLTF(SKIN_URL)
  const items = useMemo(
    () => collect(gltf, (n) => (SKIN_IDS.has(n) ? n : null)),
    [gltf]
  )
  /* 体表壳的顶点已经是模型坐标（mm、Z 轴向上），所以长轴是 'z'、外移量按毫米给 */
  const peel = useMemo<PeelCfg>(
    () => ({ plan: peelPlan, longAxis: 'z', offset: PEEL_OFFSET_SKIN }),
    [peelPlan]
  )
  return (
    <>
      {items.map((it, i) => (
        <StructureMesh key={`k${i}`} item={it} layer="skin" planes={planes} peel={peel} />
      ))}
    </>
  )
}

function BoneGroup({ planes }: { planes: THREE.Plane[] }) {  const gltf = useGLTF('/models/bones.glb')
  const items = useMemo(
    () => collect(gltf, (n) => (BONE_SET.has(n) ? n : null)),
    [gltf]
  )
  return (
    <>
      {items.map((it, i) => (
        <StructureMesh key={`b${i}`} item={it} layer="bone" planes={planes} />
      ))}
    </>
  )
}

function MuscleGroup({
  planes,
  peelPlan,
}: {
  planes: THREE.Plane[]
  peelPlan: PeelPlan
}) {
  const gltf = useGLTF('/models/muscles.glb', '/draco/')
  const lookup = useMemo(() => {
    const m = new Map<string, string>()
    for (const [canonical, names] of Object.entries(MUSCLE_MESH_NAME)) {
      for (const n of names) m.set(sanitizeMeshName(n), canonical)
    }
    return m
  }, [])
  const items = useMemo(
    () => collect(gltf, (n) => lookup.get(n) ?? null),
    [gltf, lookup]
  )

  // hpfrei(m, Y-up) -> BodyExplorer(mm, Z-up)
  // p_be[i] = scale * sign[i] * p_hp[perm[i]] + translation[i]
  // 矩阵为刚性旋转 + 统一缩放 + 平移（det>0），可无损分解为 T/R/S
  const trs = useMemo(() => {
    const { scale: s, perm, sign, translation: t } = MUSCLE_TRANSFORM
    const m = new THREE.Matrix4()
    const e = m.elements
    for (let i = 0; i < 3; i++) {
      e[perm[i] * 4 + i] = s * sign[i] // 列主序：e[col*4 + row]
      e[12 + i] = t[i] // 平移在第 3 列：e[12..14]
    }
    e[15] = 1
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const scl = new THREE.Vector3()
    m.decompose(pos, quat, scl)
    return { pos, quat, scl }
  }, [])

  // 肌肉在 hpfrei 坐标系里建模（米制，Y 轴向上），长轴即模型 Y
  const peel = useMemo<PeelCfg>(
    () => ({ plan: peelPlan, longAxis: 'y', offset: PEEL_OFFSET_MUSCLE }),
    [peelPlan]
  )

  return (
    <group position={trs.pos} quaternion={trs.quat} scale={trs.scl}>
      {items.map((it, i) => (
        <StructureMesh key={`m${i}`} item={it} layer="muscle" planes={planes} peel={peel} />
      ))}
    </group>
  )
}

function NerveGroup({
  planes,
  peelPlan,
}: {
  planes: THREE.Plane[]
  peelPlan: PeelPlan
}) {
  const st = useAtlas((s) => s.layers.nerve)
  const isHoverAny = useAtlas((s) => s.hovered)
  const hasSel = useAtlas((s) => s.selected !== null)
  const isolate = useAtlas((s) => s.isolate)
  const selected = useAtlas((s) => s.selected)
  const peelDepth = useAtlas((s) => s.peelDepth)
  /*
   * 几何不在这里算，而是交给 data/nerveRender。
   * 那边要做的事已经从「造几何」变成「认几何」：29 条图谱网格在 nerves.glb 里，
   * 这里只负责把 gltf.scene 递进去，让它按节点名把网格认到各自的 id 上，
   * 再补上唯一缺的那一段（尺神经深支跨掌的示意尾段）。
   *
   * ⚠️ `useGLTF` 与骨骼、肌肉用的是同一套机制，所以三条加载请求是并行的；
   * 神经这条只有 1.9MB，不会拖慢首屏。
   */
  const gltf = useGLTF('/models/nerves.glb')
  const geoms = useMemo(() => nerveRenders(gltf.scene), [gltf.scene])

  /** 各条神经的公共中心。剥离时以它为原点向外散开，神经之间才会分开而非同向平移 */
  const hub = useMemo(() => {
    const c = new THREE.Vector3()
    let k = 0
    for (const { geometry } of geoms) {
      const s = geometry.boundingSphere
      if (!s) continue
      c.add(s.center)
      k++
    }
    return k ? c.divideScalar(k) : c
  }, [geoms])

  return (
    <>
      {geoms.map((r) => {
        const isSel = selected === r.id
        const isHover = isHoverAny === r.id
        const dimmed = isolate && hasSel && !isSel
        const baseOpacity = dimmed ? 0.12 : st.opacity
        const step = peelPlan.stepOf.get(r.id)
        const stripped = step !== undefined && step <= peelDepth

        const s = r.geometry.boundingSphere?.center ?? new THREE.Vector3()
        const v = new THREE.Vector3(s.x - hub.x, s.y - hub.y, 0)
        const radial =
          v.lengthSq() < 1e-6 ? new THREE.Vector3(0, 1, 0) : v.normalize()

        return (
          <NerveMesh
            key={r.id}
            id={r.id}
            render={r}
            visible={st.visible}
            baseOpacity={baseOpacity}
            isSel={isSel}
            isHover={isHover}
            planes={planes}
            stripped={stripped}
            radial={radial}
          />
        )
      })}
    </>
  )
}

/**
 * 一根神经。除了原有的选中/悬停/剥离表现，还负责三件事：
 *
 * 1. **按解剖群着色**：正中系琥珀、尺系玫红、桡系绿、皮神经灰、近端蓝灰。
 *    颜色在这里编码的是「它属于哪一系」——与肌肉用颜色编码功能群是同一套思路。
 *    全局的选中／悬停色（亮青）刻意避开这五色，所以「被选中」与「属于某一系」
 *    在屏幕上永远分得开。
 * 2. **被牵连时亮起来**：用户选中的若是肌肉，支配它的神经要用琥珀色亮起并加粗描边，
 *    与「自己就是被选中项」的青色区分开。
 * 3. **流光指方向**：亮点沿神经从近端流向远端。曲线取自图谱网格上最长那条通路的骨干，
 *    并且**定向成近端 → 远端**，所以流向天然等于「这条神经把信号送到哪儿去」——
 *    正是「它支配哪块肌肉」的方向。静止的连线只能说明「有关系」，动起来才能说明「谁指向谁」。
 *
 * 几何（图谱网格、群色、流光路径、补段接缝）由 data/nerveRender 提供，这里只管表现。
 */
function NerveMesh({
  id,
  render,
  visible,
  baseOpacity,
  isSel,
  isHover,
  planes,
  stripped,
  radial,
}: {
  id: string
  render: NerveRender
  visible: boolean
  baseOpacity: number
  isSel: boolean
  isHover: boolean
  planes: THREE.Plane[]
  stripped: boolean
  radial: THREE.Vector3
}) {
  const { geometry, flow: curve, radius, seams, group } = render
  const handlers = usePickHandlers(id)
  const related = useAtlas((s) => s.related)
  const isRelated = related.nerves.includes(id)
  const wrapRef = useRef<THREE.Group>(null)
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  const pulseRefs = useRef<(THREE.Mesh | null)[]>([])
  const seamRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const peelT = useRef(0)
  /** 远景外扩量（模型单位 mm），由 useFrame 每帧写、被顶点着色器读 */
  const grow = useRef({ value: 0 })
  /** 这条神经的实测中位半径 —— 外扩量按它算，不从渲染层猜 */
  const rTypical = useMemo(() => (NERVE_R[id] as number | undefined) ?? 1.2, [id])

  const onBeforeCompile = useCallback(
    (shader: THREE.WebGLProgramParametersWithUniforms) => patchNerveGrow(shader, grow.current),
    []
  )

  /** 把这一条的外扩 ref 登记到调试表上（渲染不用它，见 NERVE_GROW 的说明） */
  useEffect(() => {
    NERVE_GROW.set(id, grow.current)
    return () => {
      NERVE_GROW.delete(id)
    }
  }, [id])

  /** 接缝标记的朝向：环面躺在 XY 面、法线朝 +Z，转到与管轴对齐即可 */
  const seamQuats = useMemo(
    () =>
      seams.map((s) =>
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.dir)
      ),
    [seams]
  )

  /** 该亮起来（自己选中、被掠过、或因关联被点亮） */
  const lit = isSel || isHover || isRelated

  useFrame((state, dt) => {
    const g = wrapRef.current
    const m = matRef.current
    if (!g || !m) return
    const target = stripped ? 1 : 0
    const cur = peelT.current
    if (cur !== target) {
      const delta = target - cur
      peelT.current = cur + Math.sign(delta) * Math.min(Math.abs(delta), dt * PEEL_SPEED)
    }
    const t = peelT.current
    const ease = t * t * (3 - 2 * t)
    g.position.copy(radial).multiplyScalar(PEEL_OFFSET_NERVE * ease)
    const fade = t <= 0.3 ? 0 : (t - 0.3) / 0.7
    m.opacity = baseOpacity * (1 - Math.min(1, fade))
    g.visible = visible && t < 0.999

    /*
     * 远景保底外扩。
     *
     * `pxPerMm` 把「屏幕像素」与「模型毫米」换算起来，靠的是 mesh 的世界缩放 ——
     * 图谱网格的顶点就是以毫米为单位的，所以「一个模型单位 = 多少世界单位」正是
     * 它到世界的缩放。**不能拿摄像机与模型的常数比糊弄过去**：模型的缩放是
     * 0.01（mm→场景单位），漏掉它算出来的外扩会差两个数量级。
     *
     * 用 CSS 像素而不是 drawingBuffer 像素：devicePixelRatio 为 2 时两者差一倍，
     * 而「不细于 1.3px」这个判据是在 CSS 像素下量出来的（B 阶段的截图就是 CSS 像素）。
     */
    const mesh = meshRef.current
    if (mesh) {
      const sph = geometry.boundingSphere
      if (sph) {
        _nerveCenter.copy(sph.center).applyMatrix4(mesh.matrixWorld)
        const d = state.camera.position.distanceTo(_nerveCenter)
        const worldPerMm = mesh.getWorldScale(_nerveScale).x
        const halfFov = ((state.camera as THREE.PerspectiveCamera).fov * Math.PI) / 360
        const pxPerMm = ((state.size.height / (2 * d * Math.tan(halfFov))) * worldPerMm) || 0
        let next = 0
        if (pxPerMm > 1e-6) {
          const wantMm = NERVE_MIN_R_PX / pxPerMm - rTypical
          next = Math.min(Math.max(wantMm, 0), NERVE_MAX_GROW_RATIO * rTypical, NERVE_MAX_GROW_MM)
        }
        // 缓动一下：机位切换时目标值会突变，硬切会让神经「弹」一下
        grow.current.value += (next - grow.current.value) * Math.min(1, dt * 6)
      }
    }

    // 接缝标记跟着神经一起淡出，也一起被「孤立模式」压暗 ——
    // 否则神经退场了还留一圈环浮在空中，或者别的神经都暗了只有环还亮着
    const seamFade = SEAM_OPACITY * (1 - Math.min(1, fade)) * Math.min(1, baseOpacity)
    for (const sm of seamRefs.current) {
      if (sm) sm.opacity = seamFade
    }

    // 关联态的呼吸感：静止的琥珀色容易和「本色就是黄」的肌肉混淆，微动一下就分得清
    if (isRelated) {
      const pulse = 0.72 + 0.28 * Math.sin(state.clock.elapsedTime * 3.4)
      m.emissiveIntensity = isSel || isHover ? m.emissiveIntensity : 0.85 * pulse
    }

    /* ---- 流光：沿曲线从近端跑到远端 ---- */
    const on = lit && !stripped && visible
    const t0 = state.clock.elapsedTime
    for (let i = 0; i < FLOW_PULSES; i++) {
      const p = pulseRefs.current[i]
      if (!p) continue
      p.visible = on
      if (!on) continue
      const u = (((t0 / FLOW_PERIOD + i / FLOW_PULSES) % 1) + 1) % 1
      curve.getPointAt(u, p.position)
      // 两端各留 8% 做淡入淡出：脉冲若在管口凭空出现/消失，看起来像穿模
      const env = Math.min(1, Math.min(u, 1 - u) / 0.08)
      const pm = p.material as THREE.MeshBasicMaterial
      pm.opacity = 0.98 * env
    }
  })

  return (
    <group ref={wrapRef}>
      <mesh
        ref={meshRef}
        name={id}
        geometry={geometry}
        raycast={stripped ? NO_HIT : DEFAULT_HIT}
        {...handlers}
      >
        <meshStandardMaterial
          ref={matRef}
          color={NERVE_GROUPS[group].color}
          roughness={0.35}
          transparent={baseOpacity < 1}
          emissive={isSel || isHover ? '#ffd23f' : isRelated ? RELATED_COLOR : '#3a2c00'}
          emissiveIntensity={isSel ? 1.2 : isHover ? 0.9 : isRelated ? 0.85 : 0.35}
          clippingPlanes={planes}
          onBeforeCompile={onBeforeCompile}
        />
        <Outlines
          visible={lit && !stripped}
          thickness={isSel ? 4 : isHover ? 2.6 : 3}
          color={isSel || isHover ? SELECT_COLOR : RELATED_COLOR}
          transparent
          opacity={lit ? 1 : 0}
          angle={0}
          clippingPlanes={planes}
        />
      </mesh>

      {/*
        接缝标记：一圈中性灰蓝的细环，套在「前臂示意走行」与「标本真几何」的接口上。
        刻意用灰蓝而不是任何群色，也刻意是正圆的机械环 —— 它必须一眼看出不是解剖结构。
        不可拾取：它只是注解，不该抢走悬停/点击。
      */}
      {seams.map((s, i) => (
        <mesh
          key={`seam${i}`}
          position={s.pos}
          quaternion={seamQuats[i]}
          userData={HELPER}
          raycast={NO_HIT}
          renderOrder={2}
        >
          <torusGeometry args={[s.r * 1.5, 0.3, 8, 28]} />
          <meshBasicMaterial
            ref={(el) => {
              seamRefs.current[i] = el
            }}
            color={SEAM_COLOR}
            transparent
            opacity={SEAM_OPACITY}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* 脉冲位置每帧由 useFrame 写入，初值给远端以避免出现「全都堆在起点」的一闪 */}
      {Array.from({ length: FLOW_PULSES }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            pulseRefs.current[i] = el
          }}
          visible={false}
          raycast={NO_HIT}
        >
          <sphereGeometry args={[radius * 1.75, 12, 10]} />
          <meshBasicMaterial
            color="#FFF0B8"
            transparent
            opacity={0.98}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}

/**
 * 单个穴位标记。
 *
 * 用球体而不是圆环／十字：穴位贴在体表各处的**朝向都不同**（合谷在背侧、太渊在掌侧、
 * 鱼际在桡侧），圆环之类有朝向的符号要么得逐点算姿态、要么在侧视时缩成一条线。
 * 球体没有朝向问题，而且和这个图谱里其它标记的语言一致（选中一律亮青描边）。
 */
function AcupointMarker({
  point,
  opacity,
  isSel,
  isHover,
}: {
  point: Acupoint
  opacity: number
  isSel: boolean
  isHover: boolean
}) {
  const handlers = usePickHandlers(point.id)
  const lit = isSel || isHover
  return (
    <group position={point.pos}>
      <mesh name={point.id} {...handlers}>
        <sphereGeometry args={[2.1, 16, 12]} />
        <meshStandardMaterial
          color={LAYERS.acupoint.color}
          roughness={0.4}
          transparent={opacity < 1}
          opacity={opacity}
          emissive={lit ? '#ffffff' : LAYERS.acupoint.color}
          emissiveIntensity={lit ? 0.35 : 0.22}
        />
      </mesh>
      {/* 外圈光环恒定显示，让标记在浅色骨面上也认得出来 */}
      <mesh userData={HELPER} raycast={NO_HIT}>
        <sphereGeometry args={[3.5, 16, 12]} />
        <meshBasicMaterial
          color={lit ? SELECT_COLOR : LAYERS.acupoint.color}
          transparent
          opacity={0.22 * opacity}
          depthWrite={false}
        />
      </mesh>
      {lit && (
        <Outlines visible thickness={2.4} color={SELECT_COLOR} transparent opacity={1} angle={0} />
      )}
    </group>
  )
}

/**
 * 选中穴位时的「进针线」—— 把 `layers` 里那些「距体表几毫米」画成有刻度的实体。
 *
 * 这一条是穴位层真正的价值所在：静态的点只说明「在这儿」，而合谷那道题问的是
 * 「扎进去会依次碰到什么」。线从体表点沿进针方向伸到最深层再多 3mm，
 * 每一层在对应深度画一个环：环在哪儿，就说明那层结构在哪儿。
 */
function DepthProbe({ point }: { point: Acupoint }) {
  // 与信息卡同一份顺序（按深度升序），否则「线上的环」和「卡里的条」会对不上
  const layers = layersOf(point)
  const maxD = Math.max(...layers.map((l) => l.depth)) + 3
  const quat = useMemo(() => {
    const d = new THREE.Vector3(...point.inward).normalize()
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d)
  }, [point.inward])
  return (
    <group position={point.pos} quaternion={quat}>
      {/* 圆柱默认轴是 Y，绕 X 转 90° 后指向 Z —— 也就是本组局部坐标下的「进针方向」 */}
      <mesh position={[0, 0, maxD / 2]} rotation={[Math.PI / 2, 0, 0]} userData={HELPER} raycast={NO_HIT}>
        <cylinderGeometry args={[0.5, 0.5, maxD, 8]} />
        <meshBasicMaterial color={LAYERS.acupoint.color} transparent opacity={0.9} />
      </mesh>
      {layers.map((l, i) => (
        <mesh key={i} position={[0, 0, l.depth]} userData={HELPER} raycast={NO_HIT}>
          {/*
           * 环的大小/浓淡跟着「这条深度是怎么来的」走：实测层画满（半径 2.1），
           * 注解层画小一号且更淡（半径 1.3）—— 与卡片里的虚线条同一个意思。
           * 环大小是这条进针线上唯一能区分两者的手段，所以不能省。
           */}
          <torusGeometry args={[i === 0 ? 2.6 : l.src === 'anatomy' ? 1.3 : 2.1, l.src === 'anatomy' ? 0.28 : 0.42, 8, 20]} />
          <meshBasicMaterial
            color={i === 0 ? '#ffffff' : LAYERS.acupoint.color}
            transparent
            opacity={l.src === 'anatomy' ? 0.5 : 0.95}
          />
        </mesh>
      ))}
    </group>
  )
}

/**
 * 穴位层。
 *
 * 默认关闭，且**在剥离状态下整体隐藏**：穴位是体表定位，一旦把浅层剥开，
 * 体表这个参照系就不成立了，标记会浮在被剥走的组织原来占的位置上——
 * 那种「飘着的点」比不显示更容易误导。宁可暂时收起，并在面板里说明原因。
 */
function AcupointGroup() {
  const st = useAtlas((s) => s.layers.acupoint)
  const peelDepth = useAtlas((s) => s.peelDepth)
  const selected = useAtlas((s) => s.selected)
  const hovered = useAtlas((s) => s.hovered)
  if (!st.visible || peelDepth > 0) return null
  const selPoint = selected ? ACUPOINT_BY_ID.get(selected) : null
  return (
    <group>
      {HAND_MERIDIANS.map((m) => {
        const pts = meridianPath(m)
        if (pts.length < 2) return null
        return (
          <Line
            key={m.id}
            points={pts}
            color={LAYERS.acupoint.color}
            lineWidth={1.6}
            dashed
            dashSize={0.035}
            gapSize={0.03}
            transparent
            opacity={0.75 * st.opacity}
          />
        )
      })}
      {ACUPOINTS.map((a) => (
        <AcupointMarker
          key={a.id}
          point={a}
          opacity={st.opacity}
          isSel={selected === a.id}
          isHover={hovered === a.id}
        />
      ))}
      {selPoint && <DepthProbe point={selPoint} />}
    </group>
  )
}

interface ControlsLike {
  target: THREE.Vector3
  enabled: boolean
  update: () => void
  addEventListener: (t: string, fn: () => void) => void
  removeEventListener: (t: string, fn: () => void) => void
}

/** 手腕以下的名字特征。用来把「模型手」从整条手臂里摘出来做取景，不含前臂 */
const HAND_NAME_RE = /metacarpal|phalanx|scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate/

/**
 * 打开真值标本层时，自动退到能同时装下两只手的机位。
 *
 * 标本摆在模型手旁边（−X 侧，间隔 20mm），而默认机位是按整条前臂+手的外接球定的，
 * 只框得住模型本体。不自动取景的话，打开图层后标本会落在画面边缘，用户得自己
 * 一边滚轮一边平移才能把它挪进来——「打开了却看不见」是这类对照层最容易踩的坑。
 *
 * 只在「关 → 开」这一跳动相机。关掉时不动：把图层一关就把镜头拽回去，
 * 会让人分不清是相机在动还是模型在动。
 */
function SpecimenFraming() {
  const visible = useAtlas((s) => s.layers.specimen.visible)
  const { scene } = useThree() as unknown as { scene: THREE.Scene }
  const prev = useRef(false)

  useEffect(() => {
    if (visible === prev.current) return
    prev.current = visible
    if (!visible) return
    // 等一帧：本次渲染刚把 specimen-layer 挂上去，effect 里马上取可能还没进场景图
    const raf = requestAnimationFrame(() => {
      const group = scene.getObjectByName('specimen-layer')
      if (!group) return
      const box = new THREE.Box3().setFromObject(group)
      // 模型这一侧只取手骨：算上整条前臂的话包围球半径会到 3.4 场景单位，
      // 退到那个距离上两只手都缩成一小团，反而看不清
      scene.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh || !o.name || o.name.startsWith('specimen:')) return
        if (HAND_NAME_RE.test(o.name)) box.expandByObject(o)
      })
      const sph = box.getBoundingSphere(new THREE.Sphere())
      useAtlas.getState().request({
        kind: 'frame',
        target: sph.center.toArray() as [number, number, number],
        // 2.7 倍半径：留出约三成余量，两手外缘不会贴着画布边
        distance: sph.radius * 2.7,
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [visible, scene])

  return null
}

interface Geom {
  center: THREE.Vector3
  /** 前臂+手包围盒的外接球半径（场景单位） */
  radius: number
}

function CameraRig({ geom }: { geom: Geom | null }) {
  const { camera, controls, gl } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera
    controls: ControlsLike | null
    gl: THREE.WebGLRenderer
  }
  const camReq = useAtlas((s) => s.camReq)

  const wantPos = useRef<THREE.Vector3 | null>(null)
  const wantTarget = useRef<THREE.Vector3 | null>(null)
  const homePos = useRef<THREE.Vector3 | null>(null)
  const homeUp = useRef(new THREE.Vector3(0, 1, 0))

  /** 相机平滑推进前，先把状态一次性落到目标值 */
  const applyCamera = useCallback(
    (pos: THREE.Vector3, target: THREE.Vector3) => {
      camera.position.copy(pos)
      if (controls) {
        controls.target.copy(target)
        controls.update()
      }
    },
    [camera, controls]
  )

  // 初始机位（模型加载完后一次）
  useEffect(() => {
    if (!geom || homePos.current) return
    const dist = geom.radius * 2.7
    homePos.current = new THREE.Vector3(0.55, 0.18, 1).normalize().multiplyScalar(dist)
    homeUp.current.set(0, 1, 0)
    camera.up.copy(homeUp.current)
    applyCamera(homePos.current, new THREE.Vector3(0, 0, 0))
  }, [geom, camera, applyCamera])

  // 视角 / 聚焦 / 预设 / 复位指令
  useEffect(() => {
    if (!camReq || !geom) return
    const cur = controls?.target.clone() ?? new THREE.Vector3()
    const view = new THREE.Vector3().subVectors(camera.position, cur)
    const dist = view.length() || geom.radius * 2.7
    view.normalize()

    if (camReq.kind === 'view') {
      const def = VIEWS.find((v) => v.key === camReq.key)
      if (!def) return
      const nd = new THREE.Vector3(...def.dir).normalize()
      // 正对肘端／手端时沿用原 up 会退化，换一个不与其平行的参考up
      camera.up.copy(Math.abs(nd.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : homeUp.current)
      wantTarget.current = cur.clone()
      wantPos.current = cur.clone().add(nd.multiplyScalar(dist))
    } else if (camReq.kind === 'preset') {
      const p = PRESETS.find((x) => x.id === camReq.id)
      if (!p) return
      camera.up.copy(homeUp.current)
      const t = toScene(presetTarget(p), geom.center)
      wantTarget.current = t
      wantPos.current = t.clone().add(dirToScene(p.offset))
    } else if (camReq.kind === 'focus' || camReq.kind === 'focusModel') {
      // 'focus' 的点来自 R3F 事件，已是场景坐标；'focusModel' 的点是数据表里的模型坐标，
      // 得先过 toScene（缩放 + 轴换）。两条路的落点语义相同，后面共用。
      const p =
        camReq.kind === 'focus'
          ? new THREE.Vector3(...camReq.point)
          : toScene(camReq.point, geom.center)
      const nd = view.lengthSq() < 1e-6 ? new THREE.Vector3(0.55, 0.18, 1).normalize() : view
      const f = camReq.factor ?? 0.85
      /*
       * 取景距离对两种指令是不同的：
       *
       * - 'focus'（双击结构）是「从我现在的位置再凑近一点」，所以按当前位置打个 0.72 折，
       *   双击一下不会直接冲到结构内部。
       * - 'focusModel'（信息卡跳转）要的是**确定的取景**：无论此前停在哪，
       *   同一根神经每次都框成一样大。若也套 0.72 折，连续点几条跳转就会一次比一次近——
       *   实测点到第三次时相机已经钻进手掌里（2.2 场景单位 ≈ 220mm），
       *   而手掌本身才 100mm 宽，画面只剩几块肌肉的剖面。
       */
      const d = camReq.kind === 'focus' ? Math.min(dist * 0.72, geom.radius * f) : geom.radius * f
      wantTarget.current = p.clone()
      wantPos.current = p.clone().add(nd.clone().multiplyScalar(d))
    } else if (camReq.kind === 'frame') {
      // 只换目标点与距离，方向沿用当前视线 —— 取景是「后退看全」，不是换一个观察面
      const p = new THREE.Vector3(...camReq.target)
      const nd = view.lengthSq() < 1e-6 ? new THREE.Vector3(0.55, 0.18, 1).normalize() : view
      wantTarget.current = p
      wantPos.current = p.clone().add(nd.clone().multiplyScalar(camReq.distance))
    } else if (camReq.kind === 'roll') {
      const axis = new THREE.Vector3()
        .subVectors(cur, camera.position)
        .normalize()
      camera.up
        .applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(camReq.deg)))
        .normalize()
      controls?.update()
    } else {
      camera.up.copy(homeUp.current)
      wantTarget.current = new THREE.Vector3(0, 0, 0)
      wantPos.current = homePos.current?.clone() ?? null
    }
  }, [camReq, geom, camera, controls])

  // Shift + 左键拖动 = 翻滚。这是 OrbitControls 结构上做不到的自由度：
  // 没有它，无论怎么转模型都始终"头朝上"，没法把手臂放平来观察。
  //
  // 必须挂在 window 的捕获阶段：OrbitControls 把「Shift + 左键」硬编码成了平移，
  // 而它的监听器比我们的先注册，等事件冒泡到 canvas 时它已经进入 PAN 状态了。
  // 在更上层拦截并临时关掉控制器，才能保证翻滚时旋转中心不被拖走。
  useEffect(() => {
    const el = gl.domElement
    let active = false
    let lastX = 0
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !e.shiftKey) return
      if (!el.contains(e.target as Node)) return
      active = true
      lastX = e.clientX
      if (controls) controls.enabled = false
      el.setPointerCapture(e.pointerId)
      el.style.cursor = 'grabbing'
      e.preventDefault()
    }
    const onMove = (e: PointerEvent) => {
      if (!active || !controls) return
      const dx = e.clientX - lastX
      lastX = e.clientX
      if (dx === 0) return
      const axis = new THREE.Vector3().subVectors(controls.target, camera.position).normalize()
      camera.up
        .applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, dx * 0.006))
        .normalize()
      // OrbitControls 每次 update 都会用 object.up 重算轨道空间，因此无需手工同步四元数
      controls.update()
    }
    const finish = (e: PointerEvent) => {
      if (!active) return
      active = false
      if (controls) controls.enabled = true
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* 指针已释放 */
      }
      el.style.cursor = ''
    }
    const bail = () => {
      if (!active) return
      active = false
      if (controls) controls.enabled = true
      el.style.cursor = ''
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('pointercancel', finish, true)
    window.addEventListener('blur', bail)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', finish, true)
      window.removeEventListener('pointercancel', finish, true)
      window.removeEventListener('blur', bail)
    }
  }, [gl, camera, controls])

  // 用户手动转动后，取消"当前标准视角"的标记（视角按钮不再高亮）
  useEffect(() => {
    if (!controls) return
    const onStart = () => useAtlas.getState().setViewKey(null)
    controls.addEventListener('start', onStart)
    return () => controls.removeEventListener('start', onStart)
  }, [controls])

  useFrame((_, dt) => {
    if (!wantPos.current || !wantTarget.current) return
    const k = Math.min(1, dt * 4.5)
    camera.position.lerp(wantPos.current, k)
    if (controls) {
      controls.target.lerp(wantTarget.current, k)
      controls.update()
      if (
        camera.position.distanceTo(wantPos.current) < 0.015 &&
        controls.target.distanceTo(wantTarget.current) < 0.015
      ) {
        applyCamera(wantPos.current, wantTarget.current)
        wantPos.current = null
        wantTarget.current = null
      }
    }
  })
  return null
}

function Scene({
  onGeom,
}: {
  onGeom: (c: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3) => void
}) {
  const { gl } = useThree()
  const clip = useAtlas((s) => s.clip)
  const peelExpanded = useAtlas((s) => s.peelExpanded)
  const detected = useRef(false)
  const [center, setCenter] = useState<THREE.Vector3 | null>(null)
  const gltf = useGLTF('/models/bones.glb')

  // 剥离步骤表随「展开了哪些大层」变化；展开时一个大层拆成若干子步
  const peelPlan = useMemo(() => planPeel(new Set(peelExpanded)), [peelExpanded])

  const planes = useMemo(() => [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)], [])

  useEffect(() => {
    gl.localClippingEnabled = true
  }, [gl])

  /**
   * 始终保留 1 个裁剪面并挂载到所有材质上：
   * three 的着色器按 clippingPlanes 数量编译，若在 [] 与 [plane] 之间切换，
   * 必须手动 needsUpdate 才会重编译，否则剖切面不生效。恒定挂载可绕开这个坑。
   * 关闭时把平面推到极远处（保留全部），"反向"则翻转法线。
   */
  useEffect(() => {
    const p = planes[0]
    if (!clip.enabled) {
      p.normal.set(0, 1, 0)
      p.constant = 1e5
      return
    }
    // 保留 half-space: dot(n, x) + constant >= 0
    // 正向：保留 y >= value → n=(0,1,0), c=-value
    // 反向：保留 y <= value → n=(0,-1,0), c=+value
    p.normal.set(0, clip.flip ? -1 : 1, 0)
    p.constant = clip.flip ? clip.value : -clip.value
  }, [clip.enabled, clip.value, clip.flip, planes])

  // 依据骨骼包围盒定中心（一次性）
  useEffect(() => {
    if (detected.current) return
    detected.current = true
    const box = new THREE.Box3()
    gltf.scene.updateMatrixWorld(true)
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!(m as unknown as { isMesh?: boolean }).isMesh) return
      if (!BONE_SET.has(o.name)) return
      box.expandByObject(m)
    })
    if (box.isEmpty()) {
      // 兜底：万一名称匹配失败，至少用整个场景定位，避免相机落在原点内部
      console.warn('[arm-atlas] 未能按名称匹配骨骼，回退为整体包围盒')
      box.setFromObject(gltf.scene)
    }
    const c = box.getCenter(new THREE.Vector3())
    setCenter(c)
    onGeom(c, box.min.clone(), box.max.clone())
  }, [gltf, onGeom])

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 5, 4]} intensity={1.5} />
      <directionalLight position={[-4, 1, -3]} intensity={0.5} />
      <hemisphereLight args={['#dfe8ff', '#3a2f28', 0.5]} />
      <group scale={SCALE}>
        <group
          rotation={ROT}
          position={center ? [-center.x, -center.z, center.y] : [0, 0, 0]}
        >
          {center && (
            <>
              {/* 体表排在最前：它是「由外到里」的第一层，代码顺序也照这个读 */}
              <SkinGroup planes={planes} peelPlan={peelPlan} />
              <BoneGroup planes={planes} />
              <MuscleGroup planes={planes} peelPlan={peelPlan} />
              <NerveGroup planes={planes} peelPlan={peelPlan} />
              <AcupointGroup />
              {/*
                标本挂在同一个父级下（不是场景根）：它已按模型坐标落位，
                借这层 scale/rotation/center 一起变换，才和模型手处在同一个画面尺度里。
              */}
              <SpecimenGroup />
            </>
          )}
        </group>
      </group>
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        zoomToCursor
        zoomSpeed={0.85}
        rotateSpeed={0.9}
        panSpeed={0.9}
        minDistance={0.25}
        maxDistance={40}
      />
      <HoverProbe />
      <SpecimenFraming />
      {import.meta.env.DEV && <DebugBridge />}
    </>
  )
}

/** 调试通道用：模型包围盒中心与半径。每次加载完成后写入，供无头脚本换算坐标 */
const DEBUG_GEOM: { value: { center: THREE.Vector3; radius: number } | null } = { value: null }

/**
 * 悬停判定：自己从相机发一条射线，按「最近的实心结构胜出」定夺指针下是谁。
 *
 * 不用 R3F 的 onPointerOver/onPointerMove 是有原因的（见 usePickHandlers 的注释）：
 * 它的事件派发会被「该对象此前是否停过传播」污染，导致名称卡卡在浅层肌肉上不动。
 * 自己发射线则每次都从头算一遍，逻辑单一、结果可预期，也方便自动化验证。
 *
 * 监听挂在 canvas 上而不是 window：指针移出画布就该清空，移出浏览器窗口时
 * 也要兜底清掉（否则名称卡会一直挂在半空中）。
 */
function HoverProbe() {
  const { gl, camera, scene } = useThree() as unknown as {
    gl: THREE.WebGLRenderer
    camera: THREE.PerspectiveCamera
    scene: THREE.Scene
  }

  useEffect(() => {
    const el = gl.domElement
    const rc = new THREE.Raycaster()
    const ndc = new THREE.Vector2()

    const pick = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect()
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) {
        return null
      }
      ndc.set(
        ((clientX - r.left) / r.width) * 2 - 1,
        -((clientY - r.top) / r.height) * 2 + 1
      )
      rc.setFromCamera(ndc, camera)
      return resolveHover(rc.intersectObjects(scene.children, true))
    }

    const onMove = (e: PointerEvent) => {
      const id = pick(e.clientX, e.clientY)
      const st = useAtlas.getState()
      st.setHovered(id)
      document.body.style.cursor = id ? 'pointer' : 'auto'
    }
    const clear = () => {
      useAtlas.getState().setHovered(null)
      document.body.style.cursor = 'auto'
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', clear)
    window.addEventListener('blur', clear)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', clear)
      window.removeEventListener('blur', clear)
    }
  }, [gl, camera, scene])

  return null
}

/** 开发期调试通道：把相机 / 场景 / 状态暴露到 window，便于自动化验证交互是否真的生效 */
function DebugBridge() {
  const { camera, scene, controls, size } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera
    scene: THREE.Scene
    controls: ControlsLike | null
    size: { width: number; height: number; left: number; top: number }
  }
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__dbg = {
      camera,
      scene,
      controls,
      /**
       * R3F 记录在案的画布尺寸与位置。
       * 事件系统就是用它把 event.offsetX/Y 换算成 NDC 的；一旦它与真实的
       * getBoundingClientRect 不一致（布局变化后没重新测量），射线就会整体偏移——
       * 视觉上指着某个结构，实际选中的却是旁边的。
       */
      r3fSize: () => ({ width: size.width, height: size.height, left: size.left, top: size.top }),
      store: useAtlas,
      /**
       * 结构 id → 所属图层。
       *
       * 验证脚本原先靠**材质颜色**反推「这块是骨还是肌」（等于骨骼色算骨、等于神经色算神经，
       * 其余一律算肌肉）。这个代理在体表壳（09-16）与 30 条真神经（09-18）进来之后失效了：
       * 体表、标本、支持结构既不是骨色也不是神经色，被一并算进「肌肉」——关掉肌肉图层后
       * 仍报「还有 24 块肌肉可见」，看上去像图层开关坏了，其实是尺子坏了。
       * 改按**真值查表**，以后再加多少层都不会漂。
       */
      structureLayer: (id: string) => STRUCTURE_LAYER_BY_NAME.get(id) ?? null,
      /**
       * 结构 id → 它在**当前**剥离表里的第几步（1 起；null = 不参与剥离）。
       *
       * 演示脚本要断言「剥到第 N 步之后，第 N 步的结构全部不可见」。早先它硬编码
       * 「浅层肌群 = 第 1 步」，体表壳插进序列后整条断言集体错位一格——而错位不会报错，
       * 只会让画面比讲稿浅一层。把步号交回给 app 自己算，这类错位才不可能再发生。
       * 名字两种写法都试（场景名带下划线，剥离表里存的是数据表原名）。
       */
      peelStepOf: (id: string) => {
        const stepOf = planPeel(new Set(useAtlas.getState().peelExpanded)).stepOf
        return stepOf.get(id) ?? stepOf.get(sanitizeMeshName(id)) ?? null
      },
      /**
       * 神经层的渲染数据（几何 + 流光路径 + 接缝）。
       *
       * 验证脚本要核对的是「屏幕上的那根管子」而不是数据表里的 path：两者在手腕
       * 以下已经不是同一条线了（手部换成了标本真几何）。把 nerveRenders 放出来，
       * 脚本才能量到真正被渲染的包围盒、三角形数与接缝位置。
       */
      nerveRenders,
      /**
       * 每条神经**当前**的外扩量（mm）与它的实测半径。验收脚本用它断言三件事：
       * 近景必须为 0（忠实管径）、远景必须 > 0（补可见性）、任何机位都不许超过上限
       * （否则细支被撑得和主干一样粗，相对粗细信息当场丢失）。
       */
      nerveGrow: () =>
        Object.fromEntries(
          [...NERVE_GROW].map(([k, v]) => [
            k,
            { grow: +v.value.toFixed(4), r: (NERVE_R as Record<string, number>)[k] ?? null },
          ])
        ),
      /**
       * 把 three 也放出来。无头验证脚本要在页面里量包围盒、投影顶点到屏幕、
       * 判断指针落在哪，这些都得用 three 的类型；让脚本自己 `import` 一份会拿到
       * 与页面不同的模块实例，矩阵与向量算出来对不上。
       */
      THREE,
      geom: DEBUG_GEOM,
      /**
       * 从场景坐标某点向某方向发射射线，返回沿途命中的网格。
       * 用来做「这个点是不是埋在骨头里」这类判断——神经路径是手工标定的，
       * 仅看坐标范围猜不出它与骨面的关系，用射线穿过次数（奇偶）才能定论。
       *
       * all=true 时连同无名对象一起返回（例如描边用的子网格），
       * 便于分辨「没命中」与「命中了一个没名字的东西」。
       */
      raycast: (from: [number, number, number], dir: [number, number, number], all?: boolean) => {
        const rc = new THREE.Raycaster(
          new THREE.Vector3(from[0], from[1], from[2]),
          new THREE.Vector3(dir[0], dir[1], dir[2]).normalize(),
          0,
          500
        )
        /*
         * 必须把相机挂上。场景里现在有 drei 的 `Line`（经脉虚线），它基于
         * `LineSegments2`，其 raycast 会去读 `raycaster.camera.near` —— camera 为 null
         * 时直接抛异常，把整条射线打废。裸 `new Raycaster()` 默认就是 null，所以
         * 「加了一层虚线」会让原本好用的调试射线莫名报错，而报错位置在 three 内部，
         * 很难追溯到这里。`setFromCamera` 会顺手设置它，这也是 HoverProbe 一直没事的原因。
         */
        rc.camera = camera
        return rc
          .intersectObjects(scene.children, true)
          .filter((h) => (h.object as THREE.Mesh).isMesh && (all || !!h.object.name))
          .map((h) => ({
            name: h.object.name || '(无名)',
            dist: +h.distance.toFixed(4),
            point: h.point.toArray().map((v: number) => +v.toFixed(4)),
            /**
             * 祖先链：R3F 收到命中后会沿父链上溯，把事件交给第一个挂着处理器的祖先。
             * 所以「命中了谁」和「最终报出谁」是两回事——描边子网格没有名字，
             * 它会把事件交给父级的那个结构。
             */
            chain: (() => {
              const out: string[] = []
              let o: THREE.Object3D | null = h.object
              let n = 0
              while (o && n++ < 6) {
                const ev = (o as unknown as { __r3f?: { eventCount?: number } }).__r3f?.eventCount
                out.push(`${o.name || '∅'}${ev ? '✋' : ''}`)
                o = o.parent
              }
              return out
            })(),
          }))
      },
      /** 相机自身朝向（由四元数得出），与 (目标点 − 相机) 未必一致 */
      cameraForward: () => {        const v = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
        return [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)]
      },
      /**
       * **模型坐标**下某点是否落在骨骼内部（奇偶射线法）。
       *
       * 为什么要单独一个判定：神经路径是按解剖描述手工标定的，只核对「坐标落在
       * 看起来合理的范围内」没用 —— 上一轮就出现过尺神经肘段整段埋在肱骨体内、
       * Guyon 管目标点正好落在豌豆骨里，都是肉眼与数值范围都看不出来的。
       * 从该点向一个固定斜方向发射线，数穿过骨面几次：奇数次即在骨内。
       * 方向取非轴向的斜向量，避免正好与某个面共面而漏计。
       */
      insideBone: (p: [number, number, number]) => {
        const c = DEBUG_GEOM.value?.center
        if (!c) return null
        const rc = new THREE.Raycaster(
          toScene(p, c),
          new THREE.Vector3(0.3123, 0.5217, 0.7934).normalize(),
          0,
          5000
        )
        const bones: THREE.Object3D[] = []
        scene.traverse((n) => {
          const m = n as THREE.Mesh
          if (!m.isMesh) return
          const nm = m.name || ''
          if (BONE_SET.has(nm) || BONE_SET.has(sanitizeMeshName(nm))) bones.push(m)
        })
        /*
         * 关键：奇偶计数必须数得到**背面**。
         * 骨材质是单面的，three 的射线检测会按 material.side 剔除背面 —— 于是穿出
         * 骨面那一次不计，任何「射线前方有骨」的外部点都会数成 1 次（奇数）被误判为
         * 骨内。实测正是这样：肱骨外侧好几个明明在骨外的控制点被报成「穿骨」。
         * 这里临时改双面、量完还原；只影响本次判定，不动渲染表现。
         */
        const saved: [THREE.Material, THREE.Side][] = []
        for (const b of bones) {
          const m = (b as THREE.Mesh).material
          for (const mm of Array.isArray(m) ? m : [m]) {
            if (!mm) continue
            saved.push([mm, mm.side])
            mm.side = THREE.DoubleSide
          }
        }
        let n = 0
        let first = Infinity
        try {
          for (const b of bones) {
            const r = rc.intersectObject(b, false)
            n += r.length
            for (const h of r) if (h.distance < first) first = h.distance / SCALE
          }
        } finally {
          for (const [mm, s] of saved) mm.side = s
        }
        return {
          inside: n % 2 === 1,
          crossings: n,
          /** 沿该射线方向第一次碰到骨面的距离（mm）—— 只作参考，不是最近距离 */
          firstHitMm: Number.isFinite(first) ? Math.round(first) : null,
        }
      },
      /**
       * **模型坐标**下某点是否落在**指定网格**内部（奇偶射线法）。
       *
       * 与 `insideBone` 同法，但对象由名字指定——用来回答「这根神经是走在两块肌
       * *之间*，还是穿在某块肌*里面*」这类问题。这种话很容易顺口写进注释里，
       * 但只有量过才敢写。`crossings` 一并返回：偶数次穿越是闭合网格的正常外部值，
       * 若得到 0 或奇数以外的怪值，说明该网格不是闭合体，结论不可用。
       */
      insideMesh: (p: [number, number, number], name: string, dir?: [number, number, number]) => {
        const c = DEBUG_GEOM.value?.center
        if (!c) return null
        const targets: THREE.Mesh[] = []
        scene.traverse((n) => {
          const m = n as THREE.Mesh
          if (!m.isMesh) return
          if ((m.name || '') === name || sanitizeMeshName(m.name || '') === name) targets.push(m)
        })
        if (!targets.length) return { missing: true as const, name }
        /*
         * 方向可指定（默认与 insideBone 同一个非轴向斜向量）。
         *
         * 为什么需要换方向：奇偶法唯一的软肋是射线**正好穿过一条棱**——那里两次
         * 穿越被记成一次或三次，判定就翻了。返回里的 `closed`（正反向计数一致）
         * 能挡掉大部分，但不是全部。要确认一个「判定为在外」的点是不是真的在外，
         * 只能换一个方向再量一次；两次都判在外才算数。
         */
        const dv = dir ?? [0.3123, 0.5217, 0.7934]
        const rc = new THREE.Raycaster(
          toScene(p, c),
          new THREE.Vector3(dv[0], dv[1], dv[2]).normalize(),
          0,
          5000
        )
        rc.camera = camera
        const saved: [THREE.Material, THREE.Side][] = []
        let n0 = 0
        let n1 = 0
        try {
          for (const t of targets) {
            const mm = t.material
            for (const one of Array.isArray(mm) ? mm : [mm]) {
              if (!one) continue
              saved.push([one, one.side])
              one.side = THREE.DoubleSide
            }
            n0 += rc.intersectObject(t, false).length
            // 反向再数一遍：开口网格正反两个方向穿越次数不同，差得多就说明不闭合
            rc.ray.direction.negate()
            n1 += rc.intersectObject(t, false).length
            rc.ray.direction.negate()
          }
        } finally {
          for (const [one, s] of saved) one.side = s
        }
        return {
          missing: false as const,
          name,
          meshes: targets.length,
          crossings: n0,
          crossingsReverse: n1,
          /** 只有正向、反向都是奇数且一致时，奇偶判定才可信 */
          closed: n0 > 0 && n0 === n1 && n0 % 2 === 1,
          inside: n0 % 2 === 1 && n0 === n1,
        }
      },
      SCALE,
      toScene,
      dirToScene,
      presetTarget,
      PRESETS,
      NERVES,
      /**
       * 骨骼网格名集合。验证脚本要用它从射线命中里挑出"命中的是不是骨头"
       * —— 神经的射线会同时打到骨、肌、穴位与描边子网格，只靠名字猜不保险。
       */
      BONE_NAMES,
      /**
       * 肌肉网格名集合。取的是 `anatomy.ts` 的 MUSCLES 名（**带空格**，如
       * `left extensor carpi ulnaris`）—— 场景里肌网格就是用这套名字，
       * 与骨骼的下划线命名（`left_ulna`）是两套约定。这里同时并入 hpfrei 的那套
       * 备用名，免得将来换数据源时又静默失配。
       *
       * 为什么非得能认出肌肉：手背那几条新增的皮神经必须同时避开骨与**伸肌群**。
       * 尺侧腕伸肌在腕上比尺骨背面还靠背侧 14mm —— 只按"骨背面 + 净空"放线，
       * 神经会被压在整片伸肌的深面，从背侧看过去根本看不见。
       * 这个坑真踩过：第一版探针拿 hpfrei 名去比场景名，0/1891 命中，
       * 「避开肌肉」这条约束静默失效，算出来的路径全部埋在肌肉里。
       */
      MUSCLE_NAMES: new Set([
        ...MUSCLE_STRUCT_NAMES,
        ...Object.values(MUSCLE_MESH_NAME).flat(),
      ]),
      nerveTipPoint,
      nerveFocusPoint,
      /**
       * 穴位表也一并暴露：验证脚本要拿它逐条核对「这张表里写到的每个神经／肌肉 id
       * 是否真的对应场景里的网格」。写错一个名字不会报错，只会让高亮静默失效——
       * 那正是最难发现的一类缺陷。
       */
      ACUPOINTS,
      /**
       * 皮神经感觉区表也暴露。它和穴位表是**同一类风险**：每条记录里写着一个神经 id，
       * 而那个 id 指的是「画出来的那根管子」。图谱在分叉处把神经切开之后，
       * 「虎口区」原来写着的 `radial-superficial` 就只到腕了 —— 表还是那句解剖上没错的话，
       * 指向的管子却不在虎口。不把这张表放到脚本能读到的地方，这类错没法自动发现。
       */
      CUTANEOUS_ZONES,
      HAND_MERIDIANS,
    }
  }, [camera, scene, controls, size])
  return null
}

export default function Viewer({
  onCenter,
  centerRef,
}: {
  onCenter: (c: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3) => void
  centerRef: React.MutableRefObject<THREE.Vector3 | null>
}) {
  const [geom, setGeom] = useState<Geom | null>(null)
  const handle = useCallback(
    (c: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3) => {
      centerRef.current = c
      const size = new THREE.Vector3().subVectors(max, min)
      const g = { center: c, radius: (size.length() / 2) * SCALE }
      DEBUG_GEOM.value = g
      setGeom(g)
      onCenter(c, min, max)
    },
    [centerRef, onCenter]
  )
  return (
    <Canvas
      camera={{ fov: 38, near: 0.01, far: 200, position: [4, 1, 7] }}
      onPointerMissed={() => {
        useAtlas.getState().select(null)
        useAtlas.getState().setHovered(null)
      }}
    >
      <color attach="background" args={['#f4f2ee']} />
      <Scene onGeom={handle} />
      <CameraRig geom={geom} />
    </Canvas>
  )
}

export { toScene, dirToScene, STRUCTURE_INDEX }
