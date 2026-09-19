/**
 * 逐层剥离 —— 由外到里的解剖层次
 *
 * 「剥离」不是「把东西藏起来」，而是按解剖深度一层层揭开：
 * 每剥掉一层，才露出下一样。这条序列本身就是解剖学内容。
 *
 * 层次（由外到内）：
 *   0  体表        包在最外面的壳，剥掉它才看得到肌肉
 *   1  浅层肌群     起点多在内外上髁，包在肢体最外侧
 *   2  神经血管层   走在肌间隙里，剥掉浅层肌即显露
 *   3  深层肌群     贴骨面，含骨间前／后神经
 *   4  骨骼         （不参与剥离，是终点）
 *
 * ── 体表为什么进剥离序列，而不是只做一个图层开关 ──
 * 「剥离」这条序列本身就是解剖学内容（由外到里）。体表是最外面那一层，
 * 若它有开关却不在这条序列里，用户开着体表推剥离滑块时会看到「肌肉一层层消失、
 * 体表却纹丝不动」——层次关系当场自相矛盾。所以它占第一步。
 * 代价是：体表默认必须是开启的，否则第一步成了空操作（推一下什么都没变）。
 *
 * ── 为什么神经夹在浅深肌之间，而不是排在最里面 ──
 * 神经不在肌肉内部，而是走在肌间隙（疏松结缔组织）里。以正中神经为例：
 * 肘部穿旋前圆肌两头之间 → 前臂中段走在「指浅屈肌深面、指深屈肌浅面」
 * → 腕部经腕管入手掌。它恰好夹在浅层肌与深层肌之间。
 * 因此剥掉浅层肌，第一眼该看到的是神经，而不是深层肌——否则层次就错了。
 *
 * 只有骨间前／后神经贴着骨间膜、走在深层肌之间，故归入第 3 层。
 * （唯一的真正「穿肌」是桡神经深支穿过旋后肌的 Frohse 腱弓，
 *   而那里也恰好是最著名的卡压点之一。）
 */

import { NERVES, SKIN_IDS } from './anatomy'
import { funcGroupOf } from './muscleGroups'
import { MUSCLE_MESH_NAME } from './muscleMeshes'

/** 浅层肌群的子层（顺序 = 剥离顺序：由背侧到掌侧、由前臂到手） */
const SHALLOW_SUBS = [
  { id: 'extensor-superficial', zh: '伸肌 · 浅层', en: 'extensors, superficial' },
  { id: 'flexor-superficial', zh: '屈肌 · 浅层', en: 'flexors, superficial' },
  { id: 'thenar', zh: '鱼际肌', en: 'thenar muscles' },
  { id: 'hypothenar', zh: '小鱼际肌', en: 'hypothenar muscles' },
]

/** 深层肌群的子层 */
const DEEP_SUBS = [
  { id: 'extensor-deep', zh: '伸肌 · 深层', en: 'extensors, deep' },
  { id: 'flexor-deep', zh: '屈肌 · 深层', en: 'flexors, deep' },
  { id: 'midpalmar', zh: '掌中间群', en: 'interossei / lumbricals' },
]

/**
 * 走在**深层肌之间**、或绕向掌深部的神经 → 跟随深层肌群，同一步剥掉（第 4 层）。
 *
 * 判据是「剥掉浅层肌群之后，它还被谁盖着」：盖着它的若是**深层肌**，就归这一层。
 * 不是按「这根神经粗不粗、重要不重要」分的 —— 那会分错。
 *
 *   - 骨间前／后神经：贴骨间膜下行，前臂段全程在指深屈肌、拇长屈肌、旋后肌这些
 *     深层肌的深面 → 浅层肌剥掉后仍看不见。
 *   - 尺神经深支：绕钩骨钩转入掌深部，走在骨间肌与拇收肌之间 → 同上。
 *   - **桡神经深支**（2026-09-18 补）：它穿旋后肌的 Frohse 腱弓，而旋后肌本身
 *     属深层伸肌；穿出后仍夹在深浅两层伸肌之间。旧表里漏了它，于是它会跟着
 *     第 3 步「神经血管层」一起被剥掉，比它真实所在的层次浅了一整层 ——
 *     推滑块时会看到它**先于**它的解剖邻居（骨间后神经）消失，两个本该同层的
 *     结构在画面上分了家。这是「表里少一行」的典型表现：不报错、不崩，
 *     只有把滑块推过去才看得出来。
 */
const DEEP_NERVES = new Set([
  'anterior-interosseous',
  'posterior-interosseous',
  'radial-deep',
  'ulnar-deep',
])

/** 骨间膜夹在两骨之间属深层；屈肌支持带在腕部浅表属浅层 */
const DEEP_FASCIA = new Set(['interosseous membrane of left forearm'])

interface Sub {
  id: string
  zh: string
  en: string
  ids: string[]
}

interface Spec {
  id: string
  zh: string
  en: string
  ids: string[]
  subs: Sub[]
}

function buildSpecs(): Spec[] {
  const bucket: Record<string, string[]> = {}
  const fasciaShallow: string[] = []
  const fasciaDeep: string[] = []
  const orphan: string[] = []

  for (const id of Object.keys(MUSCLE_MESH_NAME)) {
    const g = funcGroupOf(id)
    if (!g) {
      orphan.push(id)
      continue
    }
    if (g === 'fascia') {
      ;(DEEP_FASCIA.has(id) ? fasciaDeep : fasciaShallow).push(id)
      continue
    }
    if (!bucket[g]) bucket[g] = []
    bucket[g].push(id)
  }

  if (orphan.length) {
    // 未登记在分组表里的结构（模型里多出来的腱鞘之类）默认归入浅层，
    // 否则「剥到裸骨」时会残留一批永远剥不掉的肌肉
    console.warn('[arm-atlas] 未登记分组的肌肉结构，已归入浅层：', orphan)
  }

  const pick = (k: string) => bucket[k] ?? []
  const shallowNerves = NERVES.filter((n) => !DEEP_NERVES.has(n.id)).map((n) => n.id)
  const deepNerves = NERVES.filter((n) => DEEP_NERVES.has(n.id)).map((n) => n.id)

  const shallowIds = [
    ...pick('extensor-superficial'),
    ...pick('flexor-superficial'),
    ...pick('thenar'),
    ...pick('hypothenar'),
    ...fasciaShallow,
    ...orphan,
  ]
  const deepIds = [
    ...pick('extensor-deep'),
    ...pick('flexor-deep'),
    ...pick('midpalmar'),
    ...deepNerves,
    ...fasciaDeep,
  ]

  const shallowSubs: Sub[] = SHALLOW_SUBS.map((s) => ({ ...s, ids: pick(s.id) })).filter(
    (s) => s.ids.length > 0
  )
  // 支持带等散件在展开态下也要有归属，否则会永远剥不掉
  if (fasciaShallow.length || orphan.length) {
    shallowSubs.push({
      id: 'retinacula',
      zh: '支持结构',
      en: 'retinacula',
      ids: [...fasciaShallow, ...orphan],
    })
  }

  const deepSubs: Sub[] = DEEP_SUBS.map((s) => ({ ...s, ids: pick(s.id) })).filter(
    (s) => s.ids.length > 0
  )
  if (deepNerves.length) {
    deepSubs.push({ id: 'deep-nerves', zh: '深层神经', en: 'deep nerves', ids: deepNerves })
  }
  if (fasciaDeep.length) {
    deepSubs.push({
      id: 'interosseous-membrane',
      zh: '骨间膜',
      en: 'interosseous membrane',
      ids: fasciaDeep,
    })
  }

  return [
    { id: 'skin', zh: '体表', en: 'skin', ids: [...SKIN_IDS], subs: [] },
    { id: 'shallow', zh: '浅层肌群', en: 'superficial muscles', ids: shallowIds, subs: shallowSubs },
    { id: 'nerve', zh: '神经血管层', en: 'nerves and vessels', ids: shallowNerves, subs: [] },
    { id: 'deep', zh: '深层肌群', en: 'deep muscles', ids: deepIds, subs: deepSubs },
  ]
}

const SPECS = buildSpecs()

/** 剥离步骤表里的一步 */
export interface PeelStep {
  key: string
  /**
   * 所属大层 id。
   * 注意：展开后大层自己**不会**再作为一步出现在表里，只有它的子层在，
   * 所以「子步骤紧跟父层之后」这个假设是不成立的——渲染时必须靠这个字段分组。
   */
  parent: string | null
  zh: string
  en: string
  count: number
  /** 所属大层的中文名（大层自己就等于 zh），用于展开态下的分组标题 */
  groupZh: string
}

export interface PeelPlan {
  steps: PeelStep[]
  /** 结构 id -> 它在第几步（1-based）被剥掉。未列出的结构永不剥离（如骨骼） */
  stepOf: Map<string, number>
}

/** 当前计划里，能被展开的大层（子层数 > 1 才值得展开） */
export function expandableLayers(): string[] {
  return SPECS.filter((s) => s.subs.length > 1).map((s) => s.id)
}

/**
 * 按展开状态生成剥离步骤表。
 * 未展开时一个大层算一步；展开后改为逐个子层算一步。
 */
export function planPeel(expanded: ReadonlySet<string>): PeelPlan {
  const steps: PeelStep[] = []
  const stepOf = new Map<string, number>()

  const emit = (
    key: string,
    parent: string | null,
    zh: string,
    en: string,
    ids: string[],
    groupZh: string
  ) => {
    if (ids.length === 0) return
    steps.push({ key, parent, zh, en, count: ids.length, groupZh })
    const idx = steps.length
    for (const id of ids) stepOf.set(id, idx)
  }

  for (const spec of SPECS) {
    if (expanded.has(spec.id) && spec.subs.length > 1) {
      for (const sub of spec.subs) {
        emit(`${spec.id}/${sub.id}`, spec.id, sub.zh, sub.en, sub.ids, spec.zh)
      }
    } else {
      emit(spec.id, null, spec.zh, spec.en, spec.ids, spec.zh)
    }
  }

  return { steps, stepOf }
}

/** 前 k 步已经剥到的大层集合 */
function layersAt(plan: PeelPlan, k: number): Set<string> {
  const s = new Set<string>()
  const end = Math.min(k, plan.steps.length)
  for (let i = 0; i < end; i++) s.add(plan.steps[i].parent ?? plan.steps[i].key)
  return s
}

/**
 * 展开／折叠后重新定位剥离进度，让「哪些大层已经剥掉」保持一致。
 * 不做这步的话，展开瞬间画面会跳回另一种状态。
 */
export function remapDepth(prev: PeelPlan, next: PeelPlan, depth: number): number {
  if (depth <= 0) return 0
  const need = layersAt(prev, depth)
  if (need.size === 0) return 0
  for (let k = 1; k <= next.steps.length; k++) {
    const have = layersAt(next, k)
    let ok = true
    for (const id of need) {
      if (!have.has(id)) {
        ok = false
        break
      }
    }
    if (ok) return k
  }
  return next.steps.length
}

/** 当前进度下，已剥掉 / 将剥掉 / 已露出 的层名，用于面板文案 */
export function describePeel(plan: PeelPlan, depth: number) {
  const total = plan.steps.length
  const at = (i: number) => (i >= 0 && i < total ? plan.steps[i] : null)
  return {
    total,
    done: depth > 0 ? at(depth - 1) : null,
    next: depth < total ? at(depth) : null,
    exposed: at(depth),
  }
}
