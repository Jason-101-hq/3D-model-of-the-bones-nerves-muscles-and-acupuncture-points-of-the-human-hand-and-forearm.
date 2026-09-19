/**
 * 关联层 —— 把「选中了什么」翻译成「3D 里该亮什么」。
 *
 * ## 为什么单独一个模块
 *
 * 神经与肌肉的关系在两份数据里：`anatomy.ts` 有几何（画出来的管子），
 * `innervation.ts` 有支配关系（谁管谁）。UI 与渲染层都要问同一个问题——
 * 「现在选中了拇收肌横头，画面里哪几根管子该亮？哪些肌肉该淡？」
 * 如果各处自己拼，很容易出现「信息卡说归尺神经深支、3D 里亮的却是尺神经主干」，
 * 而这种不一致恰恰是用户最初抱怨的那类问题。
 *
 * 所以这里做成唯一入口，UI 与 Viewer 都只调它。
 */
import { NERVES, type NerveDef } from './anatomy'
import { acupointOf } from './acupoints'
import { INNERVATION_OF, CUTANEOUS_ZONES, type NerveTrunk } from './innervation'

const NERVE_BY_ID = new Map<string, NerveDef>(NERVES.map((n) => [n.id, n]))

/** 这个 id 是不是画出来的某根神经（而不是某块肌肉/骨） */
export function isNerveId(id: string): boolean {
  return NERVE_BY_ID.has(id)
}

/** 这个 id 是不是一个穴位 */
export function isAcupointId(id: string): boolean {
  return !!acupointOf(id)
}

export function nerveDef(id: string): NerveDef | undefined {
  return NERVE_BY_ID.get(id)
}

/**
 * 选中项的相关结构。
 *
 * 语义分两种，刻意不对称：
 *
 * - **选中神经** → `nerves = [它自己]`，`muscles = 它支配的全部肌肉`，并且
 *   `muteMuscles = true`。此时「相关/不相关」是明确的：它管的肌肉亮起，其余压暗，
 *   一眼就能看出这条神经的作用范围（合谷那道题问的就是这个）。
 * - **选中肌肉** → `nerves = 支配它的神经`（含变异），`muscles = []`，
 *   `muteMuscles = false`。这里**不**压暗别的肌肉：肌肉之间没有「相关」可言，
 *   贸然压暗会让人以为别的肌肉不存在，反而看不出「这块肌肉跟哪条神经相关」。
 * - **选中穴位** → `nerves` 与 `muscles` 取自该穴自己的关系表，并且
 *   `muteMuscles = true`。穴位的意义就是「这一点底下有什么」，所以其余肌肉要压暗，
 *   只留下这一点穿过的结构——合谷那道题问的正是这个。
 */
export interface Related {
  nerves: string[]
  muscles: string[]
  /** 是否把不相关的肌肉压暗（选中神经或穴位时为真） */
  muteMuscles: boolean
}

const EMPTY: Related = { nerves: [], muscles: [], muteMuscles: false }

export function relatedOf(selected: string | null): Related {
  if (!selected) return EMPTY

  if (isNerveId(selected)) {
    const muscles = Object.keys(INNERVATION_OF).filter((m) =>
      INNERVATION_OF[m].some((r) => r.nerve === selected)
    )
    return { nerves: [selected], muscles, muteMuscles: true }
  }

  const acu = acupointOf(selected)
  if (acu) {
    const muscles = acu.muscles ?? []
    return {
      // 过滤掉几何里不存在的神经 id：数据表写错时应当「少亮一条」，而不是让整幅图崩掉
      nerves: (acu.nerves ?? []).filter((n) => NERVE_BY_ID.has(n)),
      muscles,
      muteMuscles: muscles.length > 0,
    }
  }

  const refs = INNERVATION_OF[selected]
  if (!refs || !refs.length) return EMPTY
  // 去重但保序：典型在前，变异在后，与信息卡里的排列一致
  const nerves: string[] = []
  for (const want of ['typical', 'variant'] as const) {
    for (const r of refs) {
      if (r.certainty !== want) continue
      if (!NERVE_BY_ID.has(r.nerve)) continue
      if (!nerves.includes(r.nerve)) nerves.push(r.nerve)
    }
  }
  return { nerves, muscles: [], muteMuscles: false }
}

/**
 * 一条神经归属的主干（正中/尺/桡）。用于着色与「哪条神经断了」的归纳
 *
 * 先查运动支配表，查不到再查皮神经感觉区表。**这一步不能省**：手背那几条皮神经
 * 是纯感觉神经，在 `INNERVATION_OF` 里一条记录都没有 —— 只查前者的话，选中
 * 尺神经手背支时信息卡上「主干」一行会空着，而它明明是尺神经的分支。
 */
export function trunkOfNerve(nerveId: string): NerveTrunk | null {
  for (const refs of Object.values(INNERVATION_OF)) {
    for (const r of refs) if (r.nerve === nerveId) return r.trunk
  }
  const zone = CUTANEOUS_ZONES.find((z) => z.nerve === nerveId)
  return zone ? zone.trunk : null
}
