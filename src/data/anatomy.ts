/**
 * 左前臂 + 左手 解剖结构元数据
 *
 * 坐标约定（沿用 BodyParts3D 原始模型坐标系，单位 mm）:
 *   +X 桡侧（外侧） / -X 尺侧（内侧）
 *   +Z 近端（向肩） / -Z 远端（向指尖）
 *   -Y 掌侧（前）   / +Y 背侧（后）
 *
 * 命名来源: BodyParts3D (FMA) / Z-Anatomy (Terminologia Anatomica 2)
 * 许可: CC BY-SA 2.1 JP (BodyParts3D), CC BY-SA 4.0 (Z-Anatomy)
 */

import { ACUPOINTS } from './acupoints'
import { NERVES, type NerveDef } from './nerves'
import { dist3, nerveMid, nerveNearest, nerveTip } from './nervePoints'

export type LayerId = 'skin' | 'bone' | 'muscle' | 'nerve' | 'acupoint' | 'specimen'

export interface Structure {
  /** 模型中的 mesh 名称（唯一键） */
  mesh: string
  /** 中文正名 */
  zh: string
  /** 英文名 */
  en: string
  /** 拉丁名 */
  la: string
  /** 临床 / 康复沟通要点 */
  note?: string
}

export const LAYERS: Record<LayerId, { zh: string; color: string }> = {
  /*
   * 体表用暖米色，但比骨骼的象牙白更偏红一档 —— 这两层在画面上经常同框
   * （半透体表罩在骨头上），必须一眼分得开，否则「哪儿是皮、哪儿是骨」会读错。
   * 它刻意避开肌肉的砖红：体表是罩在最外面的壳，不该被误当成一块软组织。
   */
  skin: { zh: '体表', color: '#D9A87C' },
  bone: { zh: '骨骼', color: '#E8E2D4' },
  muscle: { zh: '肌肉', color: '#B4553C' },
  nerve: { zh: '神经', color: '#E0B13A' },
  /*
   * 穴位用青绿：它必须与三样东西都分得开 —— 骨骼的米白、肌肉（功能群／神经支配两套
   * 配色里的红蓝紫）、神经的琥珀。青绿在这套色板里是空着的，而且默认关闭：
   * 穴位是叠加层，不该一进来就把解剖结构盖住。
   */
  acupoint: { zh: '穴位', color: '#0F9B8E' },
  /*
   * 真值标本用紫罗兰：它不是「本模型的一部分」，而是旁边摆着的一个实物对照。
   * 与骨骼米白、肌肉红、神经琥珀、穴位青绿都能一眼分开。默认关闭。
   */
  specimen: { zh: '真值标本', color: '#8B5CF6' },
}

/* ------------------------------------------------------------ 体表（重建） */

/**
 * 体表壳 —— **本模型里唯一一个「算出来的」结构**，必须照实说明。
 *
 * ## 为什么不是取来的
 *
 * 全库没有任何皮肤几何。骨与肌来自 BodyParts3D / Z-Anatomy，而 Z-Anatomy 的分层
 * 里根本没有皮肤系统（是骨／肌／关节／血管／神经／内脏／感官那几套）；源文件
 * hpfrei.glb 的 1872 个节点里搜不到 skin / integument / derm 任何一条。
 * 标本那边（DiceCT）确实有真实体表点云，但它只覆盖到腕、而且是平摊的另一只手，
 * 与本模型屈曲的手不是同一个姿态，套不上（详见 SpecimenGroup 的并置说明）。
 *
 * ## 怎么算的
 *
 * 取本模型 29 块骨 + 35 块肌的表面，在「离结构表面 3.5 mm」处取等值面，
 * 得到一个闭合壳。做法与参数见 `_recon/skin/build_skin.py`。
 * 换句话说：**它表达的是「包住骨与肌的最小外扩」，不是任何人的真实外形。**
 *
 * ## 它哪里可以用、哪里不能用
 *
 * 可以用：判断某根神经／某块肌是不是「跑到身体外面去了」（这是它在本项目里的
 * 主要价值 —— 以前只能逐点查穿骨，现在多了一道「在不在体表之内」的硬边界）；
 * 以及在半透明显示时给出肢体轮廓，让「结构长在什么位置」有个参照。
 *
 * 不能用：量围度、量皮下脂肪、判断胖瘦。它是等厚外扩，而真实体表不是 ——
 * 手背皮薄（骨面几乎直接顶在皮下），手掌与手指掌侧有厚得多的皮下脂肪；
 * 上臂这一段本模型根本没有肌肉，壳在那里只是「肱骨 + 3.5 mm」的一根细管，
 * 与真实上臂轮廓差得远。
 */
const SKIN_STRUCTURE: Structure = {
  mesh: 'skin',
  zh: '体表（重建）',
  en: 'body surface — reconstructed',
  la: 'cutis',
  note:
    '由本模型的骨与肌轮廓向外等距外扩 3.5 mm 生成的闭合壳，用来表达肢体的体表范围，' +
    '不是任何人的实测外形 —— 全库没有皮肤几何，Z-Anatomy 分层里不含皮肤系统，' +
    '标本的体表只到腕且是平摊的另一只手。手背处接近真实（皮肤本就贴着掌骨与骨间肌），' +
    '手掌与指腹应更厚、上臂这一段本模型无肌肉故偏细。可用来判断结构是否在身体之内，' +
    '不可用来量围度或皮下厚度。',
}

export const SKIN_IDS = new Set([SKIN_STRUCTURE.mesh])

/* ------------------------------------------------------- 真值标本（DiceCT） */

/**
 * DiceCT 手部标本的结构登记表。
 *
 * 数据来源：Steer et al. 2026（密苏里大学），碘染 microCT（48.8 μm）重建的
 * 离体手部神经／肌腹网格，经 MorphoSource（Media 000868571）开放下载，
 * 许可：允许下载、允许复用、**不允许商业用途**。
 *
 * 它与本模型的角色完全不同：本模型是体表解剖图谱的示意几何（骨与肌肉来自
 * BodyParts3D / Z-Anatomy，神经是按走行手绘的管道）；标本是真人断层重建，
 * 形态即事实，但也因此更粗糙、更个体化。两者不是同一只手，**不做配准**，
 * 而是并排摆放供对照——这正是它存在的意义：让「示意」与「实测」的差别可见。
 *
 * id 前缀 `specimen:` 是为了与模型自身结构彻底分开，避免与 `nerve.*` 撞名。
 */
export const SPECIMEN_STRUCTURES: Structure[] = [
  {
    mesh: 'specimen:nerve.median',
    zh: '正中神经（标本）',
    en: 'median nerve — DiceCT specimen',
    la: 'nervus medianus',
    note: '标本重建的实际走行，含腕管段压扁的真实截面。模型层那根正中神经的腕以下段已改用同一份标本几何，因此两侧的差别只剩「标本手平摊、模型手前屈」以及个体差异——不再是示意与实测之差。',
  },
  {
    mesh: 'specimen:nerve.ulnar',
    zh: '尺神经（标本）',
    en: 'ulnar nerve — DiceCT specimen',
    la: 'nervus ulnaris',
    note: '含尺神经深支。标本中深支末端在合谷区缺如（扫描范围内未重建），跨过第 1 背侧骨间肌的那一段无法从本数据取得——模型层这根尺神经的深支因此仍是示意走行。',
  },
  {
    mesh: 'specimen:nerve.other',
    zh: '其余神经分支（标本）',
    en: 'other nerve branches — DiceCT specimen',
    la: 'rami nervorum',
    note: '标本中不属于正中／尺神经主干、但已被分割出来的其余分支（桡神经浅支的分支、指固有神经，以及指端若干小段）。这一段完全按原始数据保留，未做人工取舍。',
  },
  {
    mesh: 'specimen:muscle.dorsal-io-1',
    zh: '第 1 背侧骨间肌（标本）',
    en: 'first dorsal interosseous — DiceCT specimen',
    la: 'musculus interosseus dorsalis primus',
    note: '实测厚度 3.2–11.3 mm，常见区间 4–7 mm；本模型的示意几何为 4.6 mm，落在实测区间内。',
  },
  {
    mesh: 'specimen:muscle.adductor-pollicis',
    zh: '拇收肌（标本）',
    en: 'adductor pollicis — DiceCT specimen',
    la: 'musculus adductor pollicis',
    note: '第 1 背侧骨间肌深面与拇收肌浅面之间实测间隙 0.2–2.5 mm，两者基本相贴——这是合谷进针「过深即入虎口深处」的解剖依据。',
  },
  {
    mesh: 'specimen:muscle.palmar-aponeurosis',
    zh: '掌腱膜（标本）',
    en: 'palmar aponeurosis — DiceCT specimen',
    la: 'aponeurosis palmaris',
    note: '掌心浅层的致密腱膜。它是「掌心为什么比手背厚」的直接原因，也是掌侧进针要穿过的第一道阻力。',
  },
  {
    mesh: 'specimen:hand-outline',
    zh: '手部轮廓（标本点云）',
    en: 'hand surface — DiceCT specimen',
    la: 'superficies manus',
    note: '标本体表采样点（3 mm 体素），仅作外形参照，帮助判断标本与本模型在体表轮廓上的差异。',
  },
]

/* ------------------------------------------------------------------ 骨骼 */

export const BONES: Structure[] = [
  { mesh: 'left humerus', zh: '肱骨', en: 'humerus', la: 'humerus', note: '内上髁为尺神经沟所在，外上髁为伸肌总腱起点' },
  { mesh: 'left radius', zh: '桡骨', en: 'radius', la: 'radius', note: '桡骨茎突位于腕外侧，Colles 骨折常见部位' },
  { mesh: 'left ulna', zh: '尺骨', en: 'ulna', la: 'ulna', note: '鹰嘴与冠突构成滑车切迹，肘关节屈伸的主要稳定结构' },
  { mesh: 'left scaphoid', zh: '手舟骨', en: 'scaphoid', la: 'os scaphoideum', note: '腕骨最易骨折者，近端血供差，骨折后易发生缺血性坏死' },
  { mesh: 'left lunate', zh: '月骨', en: 'lunate', la: 'os lunatum', note: '腕管底后壁组成部分，月骨脱位可压迫正中神经' },
  { mesh: 'left pisiform', zh: '豌豆骨', en: 'pisiform', la: 'os pisiforme', note: 'Guyon 管内侧界，尺神经在此易受压，也是尺侧腕屈肌的籽骨' },
  { mesh: 'left trapezium', zh: '大多角骨', en: 'trapezium', la: 'os trapezium', note: '腕管外侧界，与第一掌骨构成拇指腕掌关节' },
  { mesh: 'left trapezoid', zh: '小多角骨', en: 'trapezoid', la: 'os trapezoideum', note: '腕骨中最稳定的一块，活动度极小' },
  { mesh: 'left capitate', zh: '头状骨', en: 'capitate', la: 'os capitatum', note: '腕骨中最大者，位于腕中关节旋转轴心' },
  { mesh: 'left hamate', zh: '钩骨', en: 'hamate', la: 'os hamatum', note: '钩骨钩构成 Guyon 管外侧界，钩骨钩骨折可损伤尺神经深支' },
  { mesh: 'left first metacarpal bone', zh: '第1掌骨', en: 'first metacarpal', la: 'os metacarpale I', note: '拇指腕掌关节为鞍状关节，拇指对掌功能的解剖基础' },
  { mesh: 'left second metacarpal bone', zh: '第2掌骨', en: 'second metacarpal', la: 'os metacarpale II', note: '手掌最稳定的纵轴，握持时的力学支点' },
  { mesh: 'left third metacarpal bone', zh: '第3掌骨', en: 'third metacarpal', la: 'os metacarpale III', note: '掌指关节屈曲时形成掌弓顶点' },
  { mesh: 'left fourth metacarpal bone', zh: '第4掌骨', en: 'fourth metacarpal', la: 'os metacarpale IV', note: '活动度较大，参与手掌横弓的可塑性' },
  { mesh: 'left fifth metacarpal bone', zh: '第5掌骨', en: 'fifth metacarpal', la: 'os metacarpale V', note: '拳击者骨折（boxer fracture）好发于掌骨颈' },
  { mesh: 'proximal phalanx of left thumb', zh: '拇指近节指骨', en: 'proximal phalanx of thumb', la: 'phalanx proximalis pollicis' },
  { mesh: 'distal phalanx of left thumb', zh: '拇指远节指骨', en: 'distal phalanx of thumb', la: 'phalanx distalis pollicis' },
  { mesh: 'proximal phalanx of left index finger', zh: '食指近节指骨', en: 'proximal phalanx of index finger', la: 'phalanx proximalis digiti II' },
  { mesh: 'middle phalanx of left index finger', zh: '食指中节指骨', en: 'middle phalanx of index finger', la: 'phalanx media digiti II' },
  { mesh: 'distal phalanx of left index finger', zh: '食指远节指骨', en: 'distal phalanx of index finger', la: 'phalanx distalis digiti II' },
  { mesh: 'proximal phalanx of left middle finger', zh: '中指近节指骨', en: 'proximal phalanx of middle finger', la: 'phalanx proximalis digiti III' },
  { mesh: 'middle phalanx of left middle finger', zh: '中指中节指骨', en: 'middle phalanx of middle finger', la: 'phalanx media digiti III' },
  { mesh: 'distal phalanx of left middle finger', zh: '中指远节指骨', en: 'distal phalanx of middle finger', la: 'phalanx distalis digiti III' },
  { mesh: 'proximal phalanx of left ring finger', zh: '环指近节指骨', en: 'proximal phalanx of ring finger', la: 'phalanx proximalis digiti IV' },
  { mesh: 'middle phalanx of left ring finger', zh: '环指中节指骨', en: 'middle phalanx of ring finger', la: 'phalanx media digiti IV' },
  { mesh: 'distal phalanx of left ring finger', zh: '环指远节指骨', en: 'distal phalanx of ring finger', la: 'phalanx distalis digiti IV' },
  { mesh: 'proximal phalanx of left little finger', zh: '小指近节指骨', en: 'proximal phalanx of little finger', la: 'phalanx proximalis digiti V' },
  { mesh: 'middle phalanx of left little finger', zh: '小指中节指骨', en: 'middle phalanx of little finger', la: 'phalanx media digiti V' },
  { mesh: 'distal phalanx of left little finger', zh: '小指远节指骨', en: 'distal phalanx of little finger', la: 'phalanx distalis digiti V' },
]

/* ------------------------------------------------------------------ 肌肉 */

export const MUSCLES: Structure[] = [
  { mesh: 'humeral head of left pronator teres', zh: '旋前圆肌 肱头', en: 'pronator teres, humeral head', la: 'caput humerale m. pronatoris teretis', note: '正中神经由此头与尺头之间穿过，是旋前圆肌综合征的卡压部位' },
  { mesh: 'ulnar head of left pronator teres', zh: '旋前圆肌 尺头', en: 'pronator teres, ulnar head', la: 'caput ulnare m. pronatoris teretis', note: '与肱头之间的腱性间隙为正中神经入前臂的通道' },
  { mesh: 'left flexor carpi radialis', zh: '桡侧腕屈肌', en: 'flexor carpi radialis', la: 'm. flexor carpi radialis', note: '正中神经支配；其腱是腕管内最桡侧的结构，也是腕管穿刺的定位标志' },
  { mesh: 'left palmaris longus', zh: '掌长肌', en: 'palmaris longus', la: 'm. palmaris longus', note: '约 15% 人群先天缺如；其腱位于腕管浅层正中，为正中神经的浅层标志' },
  { mesh: 'humeral head of left flexor carpi ulnaris', zh: '尺侧腕屈肌 肱头', en: 'flexor carpi ulnaris, humeral head', la: 'caput humerale m. flexoris carpi ulnaris', note: '尺神经在此两头之间的腱膜下进入前臂' },
  { mesh: 'ulnar head of left flexor carpi ulnaris', zh: '尺侧腕屈肌 尺头', en: 'flexor carpi ulnaris, ulnar head', la: 'caput ulnare m. flexoris carpi ulnaris', note: '尺神经主干沿其深面下行至腕部' },
  { mesh: 'left flexor digitorum superficialis', zh: '指浅屈肌', en: 'flexor digitorum superficialis', la: 'm. flexor digitorum superficialis', note: '正中神经支配；止于中节指骨，负责近侧指间关节屈曲' },
  { mesh: 'left flexor digitorum superficialis (2)', zh: '指浅屈肌腱', en: 'flexor digitorum superficialis tendon', la: 'tendo m. flexoris digitorum superficialis' },
  { mesh: 'left flexor digitorum profundus', zh: '指深屈肌', en: 'flexor digitorum profundus', la: 'm. flexor digitorum profundus', note: '尺侧半由尺神经支配、桡侧半由骨间前神经支配，即「正中尺神共支配」' },
  { mesh: 'left flexor pollicis longus', zh: '拇长屈肌', en: 'flexor pollicis longus', la: 'm. flexor pollicis longus', note: '骨间前神经支配；拇指指间关节唯一屈肌' },
  { mesh: 'left pronator quadratus', zh: '旋前方肌', en: 'pronator quadratus', la: 'm. pronator quadratus', note: '骨间前神经支配，前臂旋前的主要动力；骨间前神经卡压时此肌最早出现无力' },
  { mesh: 'left brachioradialis', zh: '肱桡肌', en: 'brachioradialis', la: 'm. brachioradialis', note: '桡神经支配；其深面是桡神经浅支走行的通道，Wartenberg 综合征的卡压层' },
  { mesh: 'left extensor carpi radialis longus', zh: '桡侧腕长伸肌', en: 'extensor carpi radialis longus', la: 'm. extensor carpi radialis longus', note: '与桡侧腕短伸肌共同起点为「网球肘」常见受累部位' },
  { mesh: 'left extensor carpi radialis brevis', zh: '桡侧腕短伸肌', en: 'extensor carpi radialis brevis', la: 'm. extensor carpi radialis brevis', note: '网球肘（外上髁炎）最常见的病变肌腱' },
  { mesh: 'left extensor digitorum', zh: '指伸肌', en: 'extensor digitorum', la: 'm. extensor digitorum', note: '骨间后神经支配' },
  { mesh: 'left extensor digiti minimi', zh: '小指伸肌', en: 'extensor digiti minimi', la: 'm. extensor digiti minimi', note: '骨间后神经支配' },
  { mesh: 'left extensor carpi ulnaris', zh: '尺侧腕伸肌', en: 'extensor carpi ulnaris', la: 'm. extensor carpi ulnaris', note: '骨间后神经支配；与尺侧腕屈肌共同维持腕的尺偏' },
  { mesh: 'left extensor carpi ulnaris (2)', zh: '尺侧腕伸肌腱', en: 'extensor carpi ulnaris tendon', la: 'tendo m. extensoris carpi ulnaris' },
  { mesh: 'left supinator', zh: '旋后肌', en: 'supinator', la: 'm. supinator', note: '其近侧缘腱性增厚形成 Frohse 腱弓，是骨间后神经最常见的卡压点' },
  { mesh: 'left anconeus', zh: '肘肌', en: 'anconeus', la: 'm. anconeus', note: '桡神经支配，协助伸肘并稳定肘关节后外侧' },
  { mesh: 'left abductor pollicis longus', zh: '拇长展肌', en: 'abductor pollicis longus', la: 'm. abductor pollicis longus', note: '骨间后神经支配；与拇短伸肌共同构成鼻烟窝桡侧界，de Quervain 腱鞘炎受累肌' },
  { mesh: 'left extensor pollicis longus', zh: '拇长伸肌', en: 'extensor pollicis longus', la: 'm. extensor pollicis longus', note: '骨间后神经支配；构成鼻烟窝尺侧界' },
  { mesh: 'left extensor pollicis brevis', zh: '拇短伸肌', en: 'extensor pollicis brevis', la: 'm. extensor pollicis brevis', note: '骨间后神经支配；de Quervain 腱鞘炎主要受累肌之一' },
  { mesh: 'left extensor indicis', zh: '示指伸肌', en: 'extensor indicis', la: 'm. extensor indicis', note: '骨间后神经支配；独立伸示指' },
  { mesh: 'left abductor pollicis brevis', zh: '拇短展肌', en: 'abductor pollicis brevis', la: 'm. abductor pollicis brevis', note: '正中神经（返支）支配；腕管综合征时最早出现萎缩的大鱼际肌' },
  { mesh: 'superficial head of left flexor pollicis brevis', zh: '拇短屈肌 浅头', en: 'flexor pollicis brevis, superficial head', la: 'caput superficiale m. flexoris pollicis brevis', note: '正中神经支配；深头由尺神经支配，是正中-尺神经交通的典型例证' },
  { mesh: 'left opponens pollicis', zh: '拇对掌肌', en: 'opponens pollicis', la: 'm. opponens pollicis', note: '正中神经支配；拇指对掌功能的核心肌' },
  { mesh: 'oblique head of left adductor pollicis', zh: '拇收肌 斜头', en: 'adductor pollicis, oblique head', la: 'caput obliquum m. adductoris pollicis', note: '尺神经深支支配；Froment 征的检查靶肌' },
  { mesh: 'transverse head of left adductor pollicis', zh: '拇收肌 横头', en: 'adductor pollicis, transverse head', la: 'caput transversum m. adductoris pollicis', note: '横跨掌深部，是拇指内收（捏力）的主要动力；它位于合谷穴的深层——体表只能摸到，看不到' },
  { mesh: 'abductor digiti minimi of left hand', zh: '小指展肌', en: 'abductor digiti minimi', la: 'm. abductor digiti minimi', note: '尺神经支配；小鱼际萎缩是肘管综合征的体征之一' },
  { mesh: 'flexor digiti minimi brevis of left hand', zh: '小指短屈肌', en: 'flexor digiti minimi brevis', la: 'm. flexor digiti minimi brevis', note: '尺神经支配' },
  { mesh: 'opponens digiti minimi of left hand', zh: '小指对掌肌', en: 'opponens digiti minimi', la: 'm. opponens digiti minimi', note: '尺神经支配' },
  { mesh: 'set of lumbricals of left hand', zh: '蚓状肌', en: 'lumbricals', la: 'mm. lumbricales', note: '桡侧两条由正中神经、尺侧两条由尺神经支配；屈掌指关节、伸指间关节' },
  { mesh: 'set of palmar interossei of left hand', zh: '骨间掌侧肌', en: 'palmar interossei', la: 'mm. interossei palmares', note: '尺神经深支支配；使手指内收（并指）' },
  { mesh: 'set of dorsal interossei of left hand', zh: '骨间背侧肌', en: 'dorsal interossei', la: 'mm. interossei dorsales', note: '尺神经深支支配；使手指外展（分指），第一背侧骨间肌最易检见萎缩' },
  { mesh: 'flexor retinaculum of left wrist', zh: '屈肌支持带（腕横韧带）', en: 'flexor retinaculum', la: 'retinaculum flexorum', note: '腕管的顶，与腕骨沟共同围成腕管。腕管内压增高即腕管综合征，切开此韧带是标准减压术式' },
  { mesh: 'interosseous membrane of left forearm', zh: '前臂骨间膜', en: 'interosseous membrane', la: 'membrana interossea antebrachii', note: '连接桡尺骨并传递负荷；骨间前神经与骨间前动脉贴其掌侧面下行' },
]

/* ------------------------------------------------------------------ 神经
 *
 * 神经清单已迁到 `nerves.ts`。2026-09-18 起几何来源整体换代：原先由
 * 「手部标本实测 + 前臂示意 + 手背补画」三种来源拼接，现在换成
 * **Z-Anatomy 图谱几何**一整套 29 条（与骨、肌同源），只有正中神经返支
 * 因图谱数据里确实没有它而保留示意走行。
 *
 * 这里只做转出，让既有的 `from './anatomy'` 导入路径继续可用；
 * 清单本身、来源映射与临床要点都在 `nerves.ts`。
 */

export { NERVES }
export type { NerveDef }

/* ------------------------------------------------------- 临床情景预设 */

export interface Preset {
  id: string
  zh: string
  desc: string
  /** 需要高亮的结构（mesh 名或神经 id） */
  focus: string[]
  /** 相机目标点（模型坐标） */
  target: [number, number, number]
  /**
   * 观察方向偏移（模型坐标，毫米）。
   *
   * ⚠️ 这里最容易搞错的是**第 2 个分量**：模型是 Z 轴向上的（BodyExplorer），
   * 它的 +Y 经 `dirToScene` 映射到场景的 **−Z**，也就是**背侧**。
   * 所以：
   *   第 1 个分量 → 桡侧(+)/尺侧(−)
   *   第 2 个分量 → 背侧(+)/掌侧(−)   ← 掌侧的病变必须给负值
   *   第 3 个分量 → 肘端(+)/手端(−)
   *
   * 这一条踩过坑：正中神经、骨间前神经都走在**掌侧**，若按「正值=前面」的直觉
   * 写，相机会落到背侧，正中神经整个被腕骨挡在后面——预设点过去只能看到伸肌腱，
   * 完全看不见它要讲的那根神经。
   */
  offset: [number, number, number]
  /**
   * 该情景推荐的图层配比（不透明度）。
   *
   * 神经都走在肌肉深面，而肌肉默认是 85%：这种配比下正中神经、尺神经、骨间前／后神经
   * 会被整片肌肉盖死——实测在这种默认配比下，七个情景里没有一个能"看到"它要讲的那根神经，
   * 用户点了预设却只觉得画面毫无变化。所以凡是以神经为主角的情景，都要顺手把肌肉压薄。
   */
  blend?: Partial<Record<LayerId, number>>
}

/**
 * 情景预设的相机目标点。
 *
 * 数据表里手写的 target 只是「大致方位」，实测偏差可达一厘米以上；直接拿它去定相机中心，
 * 会让相机对着目标旁边的骨面 —— 例如肘管综合征原先把镜头对准肱骨，尺神经整个在画面外。
 * 因此以 target 为提示，回到神经几何上取离它最近的点，目标点永远落在要讲的那根神经上。
 *
 * 2026-09-18 起这里只问 `nervePoints`：整层神经已经换成一套几何（图谱），
 * 原先「比较模型 path 与标本几何、挑离提示点更近的那个」那个分支随标本几何一起退役 ——
 * 它当年存在的理由是两套几何在腕以下能差 7~10mm。
 *
 * ## 为什么 `focus` 里的**每一条**神经都要参与取点，而不只取第一条
 *
 * 因为图谱数据是**按命名切段**的：一个连续的东西被切成若干对象，切点就在分叉处。
 * 尺神经主干（`ulnar`）止于 Z 832 —— 那是**尺神经手背支发出的高度**（腕上 3~4cm），
 * 之后到 Guyon 管那一段，图谱里已经记在「尺神经浅支／深支」两个对象名下。
 * 于是 Guyon 管那个预设（提示点 Z 796）去主干上找最近点，只能得到 Z 831.6，
 * 镜头被抬到前臂中下段 —— 实测偏了 **37.8mm**，而它要讲的豌豆骨／钩骨钩在画面外。
 * 改成在 `focus` 列出的全部神经上找最近点后，落在尺神经深支的 Z 793.8（离提示点 6.1mm），
 * 正是 Guyon 管本身。
 *
 * 这不是「随便挑一条近的」：`focus` 本来就是这张表的作者声明过的「这个情景要看的东西」，
 * 让相机落在这批结构里离提示点最近的那一个上，才是对那句话的字面执行。
 * 非神经 id（骨、肌、支持带）不参与 —— 它们没有 `nervePoints`。
 */
export function presetTarget(p: Preset): [number, number, number] {
  let best: [number, number, number] | null = null
  let bestD = Infinity
  for (const id of p.focus) {
    const q = nerveNearest(id, p.target)
    if (!q) continue
    const d = dist3(q, p.target)
    if (d < bestD) {
      bestD = d
      best = q
    }
  }
  return best ?? p.target
}

/**
 * 某条神经的「代表点」—— 信息卡里点一条神经、要把镜头带过去时用它。
 *
 * 取代表点而不是「离某块肌肉最近的末端」，是因为点击的语义是「我要看这条神经」，
 * 而不是「我要看它支配的某一块肌肉」——后者由用户接着双击聚焦去做。
 */
export function nerveFocusPoint(id: string): [number, number, number] | null {
  return nerveMid(id)
}

/**
 * 某条神经的远端末点 —— 也就是「它最后抵达哪里」。
 *
 * 用来替肌肉定镜头：肌肉自身没有代表点（它的网格中心只有渲染层算得出），
 * 但支配它的神经末点就落在它身上 —— 镜头对准的是「神经与肌肉碰头处」，
 * 而不是肌肉的几何中心，后者常常被覆在表面的浅层结构挡住。
 */
export function nerveTipPoint(id: string): [number, number, number] | null {
  return nerveTip(id)
}

export const PRESETS: Preset[] = [
  {
    id: 'overview',
    zh: '整体视图',
    desc: '左前臂与手，三系统同时显示',
    focus: [],
    /*
     * 瞄准模型中心，而不是前臂中段。
     *
     * 原先是 target [240,−115,900] + offset [0,60,320]，距离只有 3.26 场景单位，
     * 而「装下整个模型」需要约 10.9（模型包围球半径 3.62，fov 38° 竖直）——
     * 差了 3 倍。实测结果：屏幕框 1607×1332 落在 1268×1000 的可用画布里，
     * 18% 出框，加上瞄准点偏在手端一侧，手臂两端都被切掉。
     * 名字叫「整体视图」、讲稿说「先看整体」，画面却是半条前臂，说不过去。
     *
     * 现在的 offset 是「home 机位方向 × 10.9 单位」：方向与复位后的默认机位一致
     * （掌侧偏桡的 3/4 视角），长度换成刚好装下。target 取 geom.center，
     * 也就是场景原点的逆映射——默认机位正是以它为圆心。
     */
    target: [232, -120, 995],
    offset: [520, -945, 170],
    blend: { bone: 1, muscle: 0.85, nerve: 1 },
  },
  {
    id: 'carpal-tunnel',
    zh: '腕管综合征',
    desc: '正中神经在屈肌支持带下方受压',
    focus: ['median', 'flexor retinaculum of left wrist'],
    target: [250, -122, 795],
    // 正面掌侧入路。原先 110 的近端分量让镜头变成「沿前臂俯视」，
    // 腕管那一小段就被压缩在余光里；改成以掌侧为主（−Y 大）才正对腕管。
    offset: [-15, -130, 35],
    blend: { bone: 1, muscle: 0.22, nerve: 1 },
  },
  {
    id: 'cubital-tunnel',
    zh: '肘管综合征',
    desc: '尺神经在内上髁后方尺神经沟内受压',
    focus: ['ulnar', 'left humerus'],
    target: [183, -50, 1031],
    // 尺侧偏背：肘管在内上髁后方的尺侧沟里。近端分量不能大，否则镜头被抬到肱骨
    // 体上方，画面全被肱骨占满（该角度实测被肱骨挡死）。
    offset: [-120, 45, 30],
    blend: { bone: 1, muscle: 0.22, nerve: 1 },
  },
  {
    id: 'guyon',
    zh: 'Guyon 管卡压',
    desc: '尺神经在豌豆骨与钩骨钩之间受压',
    focus: ['ulnar', 'ulnar-deep', 'left pisiform', 'left hamate'],
    target: [240, -127, 796],
    // 掌侧偏尺：豌豆骨与钩骨钩构成 Guyon 管的内外侧界，从掌侧才看得见。
    // 原目标点 (238,−130,794) 实测算在豌豆骨体内，从任何角度都被它挡住。
    offset: [-40, -70, 90],
    blend: { bone: 1, muscle: 0.22, nerve: 1 },
  },
  {
    id: 'ain',
    zh: '骨间前神经卡压',
    desc: '捏指畸形，无感觉障碍',
    focus: ['anterior-interosseous', 'left pronator quadratus'],
    target: [234, -118, 880],
    // 掌侧入路：骨间前神经贴骨间膜掌侧面下行
    offset: [40, -70, 150],
    blend: { bone: 1, muscle: 0.22, nerve: 1 },
  },
  {
    id: 'pin',
    zh: '骨间后神经卡压',
    desc: 'Frohse 腱弓处受压，伸指无力',
    focus: ['posterior-interosseous', 'left supinator'],
    target: [248, -100, 980],
    offset: [60, 70, 120],
    blend: { bone: 1, muscle: 0.22, nerve: 1 },
  },
  {
    id: 'wartenberg',
    zh: '桡神经浅支卡压',
    desc: '前臂远端桡侧，手背麻木',
    focus: ['radial-superficial'],
    target: [275, -112, 830],
    offset: [90, 40, 120],
    blend: { bone: 1, muscle: 0.22, nerve: 1 },
  },
]

/* ------------------------------------------------------------ 索引构建 */

export interface IndexedStructure extends Structure {
  id: string
  layer: LayerId
}

export const STRUCTURE_INDEX: Map<string, IndexedStructure> = new Map()
for (const s of BONES) STRUCTURE_INDEX.set(s.mesh, { ...s, id: s.mesh, layer: 'bone' })
for (const s of MUSCLES) STRUCTURE_INDEX.set(s.mesh, { ...s, id: s.mesh, layer: 'muscle' })
for (const n of NERVES) {
  STRUCTURE_INDEX.set(n.id, {
    mesh: n.id,
    zh: n.zh,
    en: n.en,
    la: n.la,
    note: n.note,
    id: n.id,
    layer: 'nerve',
  })
}
/*
 * 穴位也登记进同一张索引：这样「结构」搜索、悬停名称浮标、信息卡三处都不用为它
 * 单开一套通道。en 里带上经穴代码（如 "LI4 · Hegu"），于是搜 "LI4" 或 "合谷"
 * 都能找到；la 位放所属经络，与其它条目「拉丁名」的位置对齐。
 */
for (const a of ACUPOINTS) {
  STRUCTURE_INDEX.set(a.id, {
    mesh: a.id,
    zh: a.zh,
    en: `${a.id} · ${a.pinyin}`,
    la: a.meridian,
    note: a.loc,
    id: a.id,
    layer: 'acupoint',
  })
}

export const BONE_NAMES = new Set(BONES.map((s) => s.mesh))
export const MUSCLE_NAMES = new Set(MUSCLES.map((s) => s.mesh))

/*
 * 标本结构同样登记进索引：悬停名称浮标、点击信息卡、结构列表三处都因此免费可用。
 * 它们的 id 已带 `specimen:` 前缀，不会与模型自身结构混同。
 */
for (const sp of SPECIMEN_STRUCTURES) {
  STRUCTURE_INDEX.set(sp.mesh, { ...sp, id: sp.mesh, layer: 'specimen' })
}
/** 判定某个 id 是否属于真值标本层 */
export const SPECIMEN_IDS = new Set(SPECIMEN_STRUCTURES.map((s) => s.mesh))

/* 体表壳也登记进索引：它能被悬停、能选中出卡片 —— 卡片正是讲清「它是算出来的」的地方 */
STRUCTURE_INDEX.set(SKIN_STRUCTURE.mesh, { ...SKIN_STRUCTURE, id: SKIN_STRUCTURE.mesh, layer: 'skin' })
