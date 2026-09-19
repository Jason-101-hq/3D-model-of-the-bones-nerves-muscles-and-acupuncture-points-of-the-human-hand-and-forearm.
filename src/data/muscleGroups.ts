/**
 * 肌肉着色分组 —— 用颜色编码解剖学信息，而不是让所有肌肉共用一种红
 *
 * 两层编码，各回答一个问题：
 *   · 描边色 → 群（我是哪一群）
 *   · 填充色 → 个体（我是群里具体哪一块）
 *
 * 只用一个色相编码一个群是不够的：同群相邻两块肌肉会完全同色，
 * 放大后连成一片分不出边界。因此每组配一条 4 级色阶（ramp），
 * 组内按解剖顺序轮流取值，保证相邻肌肉必然落在不同级别上。
 *
 * 两种编码模式，各自回答一个不同的问题：
 *   func  功能群   ——「我在前臂上是干什么的」：屈肌／伸肌、浅层／深层、鱼际／小鱼际／掌中
 *   nerve 神经支配 ——「谁支配我」：正中／尺／桡／双重支配
 *
 * 两套色板刻意保持内在一致：正中神经支配的多是屈肌，故与屈肌群共用暖红；
 * 桡神经支配全部伸肌，故与伸肌群共用冷蓝。切换模式时不必重建色觉映射。
 *
 * 分组依据：Terminologia Anatomica 2 / 标准解剖学教材，
 * **神经支配一侧不再自己维护一张表**：它由 `innervation.ts` 的结构化支配关系派生
 * （见本文件末尾的 NERVE_OF）。理由是「颜色」「信息卡」「高亮关联」必须同源——
 * 否则改了一处，另两处还会照着旧说法讲。派生结果与原表逐条比对过，完全一致。
 */

import { INNERVATION_OF, deriveNerveGroup } from './innervation'
import type { NerveGroup } from './innervation'

export type ColorMode = 'func' | 'nerve'

export type { NerveGroup }

export type FuncGroup =
  | 'flexor-superficial'
  | 'flexor-deep'
  | 'extensor-superficial'
  | 'extensor-deep'
  | 'thenar'
  | 'hypothenar'
  | 'midpalmar'
  | 'fascia'

/** 组内色阶级数。取得太大相邻色差变小，太小则循环过快、隔一块就撞色 */
const SLOTS = 4

export interface GroupStyle {
  /** 中文群名 */
  zh: string
  /** 英文群名 */
  en: string
  /** 组内色阶（由浅到深，实际是按色相+明度排布） */
  ramp: string[]
  /** 图例与标签用的代表色 */
  fill: string
  /** 描边色：同群一致，因此描边本身也在编码「群」 */
  stroke: string
}

/** 逐 mesh 解析后的具体配色 */
export interface ResolvedStyle {
  fill: string
  stroke: string
  zh: string
  en: string
}

export const FUNC_GROUPS: Record<FuncGroup, GroupStyle> = {
  'flexor-superficial': {
    zh: '屈肌 · 浅层',
    en: 'flexors, superficial',
    ramp: ['#EF6B5C', '#C63A33', '#F59A57', '#9B2622'],
    fill: '#EF6B5C',
    stroke: '#5E1512',
  },
  'flexor-deep': {
    zh: '屈肌 · 深层',
    en: 'flexors, deep',
    ramp: ['#C9526B', '#8E2C40', '#DE7C90', '#67182A'],
    fill: '#C9526B',
    stroke: '#4A1120',
  },
  'extensor-superficial': {
    zh: '伸肌 · 浅层',
    en: 'extensors, superficial',
    ramp: ['#4FA3E8', '#2A6CBA', '#63C3D9', '#1B4E8E'],
    fill: '#4FA3E8',
    stroke: '#0E3358',
  },
  'extensor-deep': {
    zh: '伸肌 · 深层',
    en: 'extensors, deep',
    ramp: ['#6577D6', '#3A46A0', '#8B9AE4', '#252C6E'],
    fill: '#6577D6',
    stroke: '#161A4A',
  },
  thenar: {
    zh: '鱼际肌',
    en: 'thenar muscles',
    ramp: ['#E85C93', '#BC3A6C', '#F594B8', '#8F274C'],
    fill: '#E85C93',
    stroke: '#5C1631',
  },
  hypothenar: {
    zh: '小鱼际肌',
    en: 'hypothenar muscles',
    ramp: ['#A868D8', '#7C3FAE', '#C795EC', '#582881'],
    fill: '#A868D8',
    stroke: '#381653',
  },
  midpalmar: {
    zh: '掌中间群',
    en: 'midpalmar (interossei / lumbricals)',
    ramp: ['#34BFA4', '#1F8C77', '#63DCC4', '#146354'],
    fill: '#34BFA4',
    stroke: '#0C3E35',
  },
  fascia: {
    zh: '支持结构',
    en: 'retinacula / membranes',
    ramp: ['#A79E92', '#857C70', '#C2BAAD', '#655D53'],
    fill: '#A79E92',
    stroke: '#3E3931',
  },
}

export const NERVE_GROUPS: Record<NerveGroup, GroupStyle> = {
  median: {
    zh: '正中神经支配',
    en: 'median nerve',
    ramp: ['#EF6B5C', '#C63A33', '#F59A57', '#9B2622'],
    fill: '#EF6B5C',
    stroke: '#5E1512',
  },
  ulnar: {
    zh: '尺神经支配',
    en: 'ulnar nerve',
    ramp: ['#8F86E8', '#635BC2', '#ADA6F0', '#4A4499'],
    fill: '#8F86E8',
    stroke: '#2E2A66',
  },
  radial: {
    zh: '桡神经支配',
    en: 'radial nerve',
    ramp: ['#4FA3E8', '#2A6CBA', '#63C3D9', '#1B4E8E'],
    fill: '#4FA3E8',
    stroke: '#0E3358',
  },
  dual: {
    zh: '双重支配',
    en: 'dual innervation',
    ramp: ['#D98A2B', '#A8650F', '#EDB05C', '#7E4A06'],
    fill: '#D98A2B',
    stroke: '#4E2E04',
  },
}

/** mesh id（与 muscleMeshes.ts 的规范名一致）-> 功能群 */
const FUNC_OF: Record<string, FuncGroup> = {
  // ——— 屈肌 · 浅层（起点多在肱骨内上髁，共同屈腕屈指） ———
  'humeral head of left pronator teres': 'flexor-superficial',
  'ulnar head of left pronator teres': 'flexor-superficial',
  'left flexor carpi radialis': 'flexor-superficial',
  'left palmaris longus': 'flexor-superficial',
  'left flexor digitorum superficialis': 'flexor-superficial',
  'left flexor digitorum superficialis (2)': 'flexor-superficial',
  'humeral head of left flexor carpi ulnaris': 'flexor-superficial',
  'ulnar head of left flexor carpi ulnaris': 'flexor-superficial',

  // ——— 屈肌 · 深层（贴骨面，屈指深部与旋前） ———
  'left flexor digitorum profundus': 'flexor-deep',
  'left flexor pollicis longus': 'flexor-deep',
  'left pronator quadratus': 'flexor-deep',

  // ——— 伸肌 · 浅层（起点多在肱骨外上髁） ———
  'left brachioradialis': 'extensor-superficial',
  'left extensor carpi radialis longus': 'extensor-superficial',
  'left extensor carpi radialis brevis': 'extensor-superficial',
  'left extensor digitorum': 'extensor-superficial',
  'left extensor digiti minimi': 'extensor-superficial',
  'left extensor carpi ulnaris': 'extensor-superficial',
  'left extensor carpi ulnaris (2)': 'extensor-superficial',
  'left anconeus': 'extensor-superficial',

  // ——— 伸肌 · 深层（旋后与拇指／示指伸展） ———
  'left supinator': 'extensor-deep',
  'left abductor pollicis longus': 'extensor-deep',
  'left extensor pollicis longus': 'extensor-deep',
  'left extensor pollicis brevis': 'extensor-deep',
  'left extensor indicis': 'extensor-deep',

  // ——— 鱼际肌（正中神经为主，尺神经参与内收肌） ———
  'left abductor pollicis brevis': 'thenar',
  'superficial head of left flexor pollicis brevis': 'thenar',
  'left opponens pollicis': 'thenar',
  'oblique head of left adductor pollicis': 'thenar',
  'transverse head of left adductor pollicis': 'thenar',

  // ——— 小鱼际肌（尺神经单一支配，肘管综合征的观察窗） ———
  'abductor digiti minimi of left hand': 'hypothenar',
  'flexor digiti minimi brevis of left hand': 'hypothenar',
  'opponens digiti minimi of left hand': 'hypothenar',

  // ——— 掌中间群（骨间肌与蚓状肌，爪形手／猿手的分水岭） ———
  'set of lumbricals of left hand': 'midpalmar',
  'set of palmar interossei of left hand': 'midpalmar',
  'set of dorsal interossei of left hand': 'midpalmar',

  // ——— 支持结构（非肌组织，用中性灰区分） ———
  'flexor retinaculum of left wrist': 'fascia',
  'interosseous membrane of left forearm': 'fascia',
}

/**
 * mesh id -> 神经支配群。**由 `innervation.ts` 派生，不在这里手写。**
 *
 * 派生规则：典型运动支配里出现两条以上主干即「双重支配」（指深屈肌、蚓状肌）；
 * 只有一条就用那条主干；没有典型关系时退回看变异关系，免得整块肌肉失去颜色。
 *
 * 键的插入顺序決定色阶分配（buildSlots 按表内顺序轮流取级），因此这里沿用
 * `INNERVATION_OF` 的顺序 —— 它与原先手写表的组内相对顺序一致，
 * 换过来之后配色和以前逐格相同（已逐条比对）。
 */
const NERVE_OF: Record<string, NerveGroup> = (() => {
  const out: Record<string, NerveGroup> = {}
  for (const id of Object.keys(INNERVATION_OF)) {
    const g = deriveNerveGroup(id)
    if (g) out[id] = g
  }
  return out
})()

/**
 * 同一块肌肉被拆成多个 mesh 时必须共用色阶，
 * 否则肌肉表面会出现「一半深一半浅」的拼色，比同色更难读。
 */
const SAME_SHADE_CLUSTER: string[][] = [
  ['humeral head of left pronator teres', 'ulnar head of left pronator teres'],
  ['humeral head of left flexor carpi ulnaris', 'ulnar head of left flexor carpi ulnaris'],
  ['left flexor digitorum superficialis', 'left flexor digitorum superficialis (2)'],
  ['left extensor carpi ulnaris', 'left extensor carpi ulnaris (2)'],
  ['oblique head of left adductor pollicis', 'transverse head of left adductor pollicis'],
]

/**
 * 组内色阶下标。按各组在表内的出现顺序轮流取 0..SLOTS-1，
 * 表本身是按解剖顺序（桡→尺 / 浅→深）写的，因此相邻结构自然落在不同级别上。
 */
function buildSlots<T extends string>(table: Record<string, T>) {
  const clusterOf = new Map<string, string[]>()
  for (const cl of SAME_SHADE_CLUSTER) for (const id of cl) clusterOf.set(id, cl)
  const slots = new Map<string, number>()
  const counter = new Map<string, number>()
  for (const [id, grp] of Object.entries(table)) {
    if (slots.has(id)) continue
    const cluster = clusterOf.get(id) ?? [id]
    const n = counter.get(grp) ?? 0
    for (const m of cluster) {
      // 只给确实属于同一群的成员套用簇色阶
      if (table[m] === grp) slots.set(m, n % SLOTS)
    }
    counter.set(grp, n + 1)
  }
  return slots
}

const FUNC_SLOT = buildSlots(FUNC_OF)
const NERVE_SLOT = buildSlots(NERVE_OF)

export function funcGroupOf(meshId: string): FuncGroup | null {
  return FUNC_OF[meshId] ?? null
}

export function nerveGroupOf(meshId: string): NerveGroup | null {
  return NERVE_OF[meshId] ?? null
}

function resolve(style: GroupStyle, slot: number): ResolvedStyle {
  return {
    fill: style.ramp[slot % style.ramp.length],
    stroke: style.stroke,
    zh: style.zh,
    en: style.en,
  }
}

/**
 * 返回该 mesh 在当前着色模式下的具体配色。
 * 填充色随组内色阶变化（区分相邻肌肉），描边色同群一致（补充群语义）。
 * 返回 null 表示该结构不参与分组编码，沿用图层默认色。
 */
export function styleOf(meshId: string, mode: ColorMode): ResolvedStyle | null {
  const f = FUNC_OF[meshId]
  if (f === 'fascia') return resolve(FUNC_GROUPS.fascia, FUNC_SLOT.get(meshId) ?? 0)
  if (mode === 'func') {
    return f ? resolve(FUNC_GROUPS[f], FUNC_SLOT.get(meshId) ?? 0) : null
  }
  const n = NERVE_OF[meshId]
  return n ? resolve(NERVE_GROUPS[n], NERVE_SLOT.get(meshId) ?? 0) : null
}

/** 信息卡用：当前模式下的分组名称 */
export function groupLabelOf(meshId: string, mode: ColorMode): string | null {
  const f = FUNC_OF[meshId]
  if (f === 'fascia') return mode === 'func' ? FUNC_GROUPS.fascia.zh : '支持结构'
  if (mode === 'func') return f ? FUNC_GROUPS[f].zh : null
  const n = NERVE_OF[meshId]
  return n ? NERVE_GROUPS[n].zh : null
}

const FUNC_ORDER: FuncGroup[] = [
  'flexor-superficial',
  'flexor-deep',
  'extensor-superficial',
  'extensor-deep',
  'thenar',
  'hypothenar',
  'midpalmar',
  'fascia',
]
const NERVE_ORDER: NerveGroup[] = ['median', 'ulnar', 'radial', 'dual']

/** 图例：只列出当前模型里实际存在的群，避免出现空图例项 */
export function legendOf(mode: ColorMode, presentIds: Iterable<string>) {
  const out: { key: string; style: GroupStyle; count: number }[] = []
  for (const id of presentIds) {
    const key = mode === 'func' ? funcGroupOf(id) : nerveGroupOf(id)
    if (!key) continue
    const style =
      mode === 'func' ? FUNC_GROUPS[key as FuncGroup] : NERVE_GROUPS[key as NerveGroup]
    if (!style) continue
    const hit = out.find((o) => o.key === key)
    if (hit) hit.count++
    else out.push({ key, style, count: 1 })
  }
  const order: string[] = mode === 'func' ? FUNC_ORDER : NERVE_ORDER
  return out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
}
