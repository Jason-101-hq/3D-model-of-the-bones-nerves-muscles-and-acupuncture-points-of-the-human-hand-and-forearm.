import { create } from 'zustand'
import type { LayerId } from './data/anatomy'
import { PRESETS } from './data/anatomy'
import type { ColorMode } from './data/muscleGroups'
import { planPeel, remapDepth } from './data/peel'
import { relatedOf, type Related } from './data/links'

export interface LayerState {
  visible: boolean
  opacity: number
}

/**
 * 标准观察视角。
 *
 * 场景坐标系（由模型坐标变换而来）：+X 桡侧（拇指侧）／+Y 肘端／+Z 掌侧。
 * dir 是相机相对观察目标的方向单位向量；切换视角时保留 target 与距离，只换方向，
 * 这样「已经凑近看的部位」不会因为换视角又被推远。
 */
export type ViewKey = 'palmar' | 'dorsal' | 'radial' | 'ulnar' | 'proximal' | 'distal'

export interface ViewDef {
  key: ViewKey
  zh: string
  en: string
  dir: [number, number, number]
}

export const VIEWS: ViewDef[] = [
  { key: 'palmar', zh: '掌侧', en: 'palmar / anterior', dir: [0, 0, 1] },
  { key: 'dorsal', zh: '背侧', en: 'dorsal / posterior', dir: [0, 0, -1] },
  { key: 'radial', zh: '桡侧', en: 'radial / thumb side', dir: [1, 0, 0] },
  { key: 'ulnar', zh: '尺侧', en: 'ulnar / little finger side', dir: [-1, 0, 0] },
  { key: 'proximal', zh: '肘端', en: 'proximal / elbow', dir: [0, 1, 0] },
  { key: 'distal', zh: '手端', en: 'distal / hand', dir: [0, -1, 0] },
]

/** 相机一次性指令。seq 递增，保证重复点同一个按钮也能再次触发 */
export type CamRequest =
  | { kind: 'view'; key: ViewKey }
  /**
   * 按**场景坐标**聚焦。双击结构走这条 —— R3F 事件给的交点就是世界坐标。
   */
  | { kind: 'focus'; point: [number, number, number]; factor?: number }
  /**
   * 按**模型坐标**聚焦。
   *
   * 信息卡里的神经路径、支配关系全是用模型坐标写的（mm、Z 轴向上），
   * 而相机活在场景坐标里（缩放 1/100、Y 轴向上）。两者差一个 toScene 变换。
   * 与其让 UI 自己算这个变换（它拿不到几何中心），不如把这个换算留给渲染层，
   * 于是多出这一个指令——坐标挂着「模型」二字，用错了一眼能看出来。
   */
  | { kind: 'focusModel'; point: [number, number, number]; factor?: number }
  /**
   * 按**场景坐标**取景，并且距离是**绝对值**。
   *
   * 为什么不能复用上面的 focus：focus 取的距离是 `min(当前距离 × 0.72, …)`，
   * 结构上只能往前凑、不能往后退。而「打开真值标本层，把模型手和旁边的标本手
   * 一起装进画面」需要的是**后退**，focus 做不到。这里把距离摊开来给调用方，
   * 由它按要装下的包围球半径自己算。
   */
  | { kind: 'frame'; target: [number, number, number]; distance: number }
  /**
   * 临床情景预设机位。
   *
   * 必须走这条带序号的通道，不能只靠 activePreset 驱动：预设按钮的 onClick 里
   * select() 会把 activePreset 清空、紧接着 setPreset() 又设回同一个值，React 18
   * 把这两次更新批成一次渲染，于是「前后都是同一个预设」→ 依赖 activePreset 的
   * 副作用不会重跑 → 第二次点同一个按钮相机纹丝不动。
   */
  | { kind: 'preset'; id: string }
  /** 绕视线轴滚转画面。这是 OrbitControls 结构上做不到的自由度：
   *  前臂长轴本来是竖直的，只有滚转才能把它「放平」来观察。 */
  | { kind: 'roll'; deg: number }
  | { kind: 'reset' }

type SeqRequest = CamRequest & { seq: number }

interface AtlasState {
  layers: Record<LayerId, LayerState>
  selected: string | null
  isolate: boolean
  clip: { enabled: boolean; value: number; flip: boolean }
  activePreset: string | null
  /** 肌肉着色编码：功能群 / 神经支配 */
  colorMode: ColorMode
  /** 图例点选后高亮的群（null = 不高亮）；点第二次取消 */
  highlightGroup: string | null
  /** 鼠标悬停的结构。用于高亮 + 跟随名称提示，是「分辨相邻肌肉」最直接的手段 */
  hovered: string | null
  /**
   * 与当前选中项相关的结构（选中肌肉 → 支配它的神经；选中神经 → 它支配的肌肉）。
   *
   * 放在 store 里算一次，而不是让每个 mesh 自己查表：3D 里有 60 多块肌肉、9 条神经，
   * 每帧都要问「我是不是相关」，在这里算好、组件里 O(1) 查询。
   * 详见 data/links.ts 的 relatedOf（两种选中语义刻意不对称，那有解释）。
   */
  related: Related
  /** 当前处于哪个标准视角；手动转动过视角后置空 */
  viewKey: ViewKey | null

  /**
   * 逐层剥离进度：已剥掉的层数（0 = 完整）。
   * 它和「图层开关」是两件事——图层是永久显隐，剥离是沿解剖深度临时揭开。
   */
  peelDepth: number
  /** 展开了哪些大层。展开后可按子群逐层剥（如只剥背侧浅肌） */
  peelExpanded: string[]

  camReq: SeqRequest | null

  toggleLayer: (id: LayerId) => void
  setOpacity: (id: LayerId, v: number) => void
  select: (id: string | null) => void
  setIsolate: (v: boolean) => void
  setClip: (patch: Partial<AtlasState['clip']>) => void
  setPreset: (id: string | null) => void
  setColorMode: (m: ColorMode) => void
  toggleHighlightGroup: (key: string) => void
  setHovered: (id: string | null) => void
  request: (r: CamRequest) => void
  setViewKey: (k: ViewKey | null) => void
  setPeelDepth: (n: number) => void
  togglePeelExpand: (id: string) => void
}

export const useAtlas = create<AtlasState>((set) => ({
  layers: {
    /*
     * 体表默认**开启**，但压到三成以下 —— 两个理由：
     * ① 它是「由外到里」的第一层，剥离序列的第一步剥的就是它，默认关掉会让
     *    第一步成为空操作（推一下滑块，画面什么都不变）；
     * ② 压到 0.5 以下还顺带决定了拾取行为：`SOLID_OPACITY = 0.5` 以上的结构会
     *    挡住它背后的东西，压到以下则自动让位 —— 于是「体表开着的时候，
     *    依然可以直接点到里面的肌肉和神经」，不需要新增任何穿透机制。
     *    把滑块推过半就是这个开关：想要不透明外壳就推上去，代价是里面的结构点不到。
     */
    skin: { visible: true, opacity: 0.3 },
    bone: { visible: true, opacity: 1 },
    muscle: { visible: true, opacity: 0.85 },
    nerve: { visible: true, opacity: 1 },
    // 穴位默认关闭：它是叠加在解剖之上的标注层，一进来就全亮会盖住结构本身
    acupoint: { visible: false, opacity: 1 },
    /*
     * 真值标本同样默认关闭。它被放在模型手旁边（不是叠在上面），一开就是第二个手，
     * 画面会双向变宽、相机要重构图；用户是「想对照时才打开」，不是「默认就在那儿」。
     */
    specimen: { visible: false, opacity: 1 },
  },
  selected: null,
  isolate: false,
  clip: { enabled: false, value: 0, flip: false },
  activePreset: null,
  colorMode: 'func',
  highlightGroup: null,
  hovered: null,
  related: { nerves: [], muscles: [], muteMuscles: false },
  viewKey: null,
  peelDepth: 0,
  peelExpanded: [],
  camReq: null,

  toggleLayer: (id) =>
    set((s) => ({
      layers: { ...s.layers, [id]: { ...s.layers[id], visible: !s.layers[id].visible } },
    })),
  setOpacity: (id, v) =>
    set((s) => ({ layers: { ...s.layers, [id]: { ...s.layers[id], opacity: v } } })),
  select: (id) => set({ selected: id, activePreset: null, related: relatedOf(id) }),
  setIsolate: (v) => set({ isolate: v }),
  setClip: (patch) => set((s) => ({ clip: { ...s.clip, ...patch } })),
  setPreset: (id) =>
    set((s) => {
      if (!id) return { activePreset: null }
      const p = PRESETS.find((x) => x.id === id)
      if (!p) return { activePreset: id }
      // 预设是一个「确定的起点」：除了高亮与机位，还要把图层配比一起落定。
      // 否则从别的情景切过来时，肌肉还停留在上一幕被压薄的状态，
      // 或者反过来——肌肉 85% 把这次要讲的神经盖得严严实实。
      const layers = { ...s.layers }
      for (const [k, v] of Object.entries(p.blend ?? {})) {
        const lid = k as LayerId
        if (layers[lid]) layers[lid] = { ...layers[lid], opacity: v as number }
      }
      // 剥离进度、群高亮、手动视角都是「上一幕的残留」，一并归零
      return {
        activePreset: id,
        layers,
        peelDepth: 0,
        peelExpanded: [] as string[],
        highlightGroup: null,
        viewKey: null,
      }
    }),
  setColorMode: (m) => set({ colorMode: m, highlightGroup: null }),
  toggleHighlightGroup: (key) =>
    set((s) => ({ highlightGroup: s.highlightGroup === key ? null : key })),
  setHovered: (id) => set((s) => (s.hovered === id ? s : { hovered: id })),
  request: (r) => set((s) => ({ camReq: { ...r, seq: (s.camReq?.seq ?? 0) + 1 } as SeqRequest })),
  setViewKey: (k) => set((s) => (s.viewKey === k ? s : { viewKey: k })),
  setPeelDepth: (n) =>
    set((s) => {
      const plan = planPeel(new Set(s.peelExpanded))
      const max = plan.steps.length
      const clamped = Math.max(0, Math.min(max, Math.round(n)))
      if (s.peelDepth === clamped) return s
      // 选中的结构若已被剥掉，信息卡就成了悬空引用，关联高亮也会指向看不见的东西，一并收掉
      const selStep = s.selected ? plan.stepOf.get(s.selected) : undefined
      const dropped = selStep !== undefined && selStep <= clamped
      return {
        peelDepth: clamped,
        selected: dropped ? null : s.selected,
        related: dropped ? relatedOf(null) : s.related,
      }
    }),
  togglePeelExpand: (id) =>
    set((s) => {
      const expanded = s.peelExpanded.includes(id)
        ? s.peelExpanded.filter((x) => x !== id)
        : [...s.peelExpanded, id]
      // 重算进度，保证展开前后「哪些大层已剥掉」一致，画面不会跳
      const prev = planPeel(new Set(s.peelExpanded))
      const next = planPeel(new Set(expanded))
      return { peelExpanded: expanded, peelDepth: remapDepth(prev, next, s.peelDepth) }
    }),
}))
