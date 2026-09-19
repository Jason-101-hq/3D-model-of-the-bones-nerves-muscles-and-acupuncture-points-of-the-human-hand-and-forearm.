/**
 * 肌肉网格名称映射
 * 解剖元数据里的规范名 -> hpfrei (Z-Anatomy 导出) 中的实际 mesh 名
 *
 * 左侧判定：hpfrei 模型为米制、Y 轴向上、+X 为患者左侧
 * （由胸骨 z=+0.091 在前、跟骨 z=-0.053 在后推得 left = up × anterior = +X）
 */
export const MUSCLE_MESH_NAME: Record<string, string[]> = {
  'humeral head of left pronator teres': ['Superficial head of pronator teres'],
  'ulnar head of left pronator teres': ['Deep head of pronator teres'],
  'left flexor carpi radialis': ['Flexor carpi radialis'],
  'left palmaris longus': ['Palmaris longus muscle'],
  'humeral head of left flexor carpi ulnaris': ['Humeral head of flexor carpi ulnaris'],
  'ulnar head of left flexor carpi ulnaris': ['Ulnar head of flexor carpi ulnaris'],
  'left flexor digitorum superficialis': [
    'Humero-ulnar head of flexor digitorum superficialis',
    'Radial head of flexor digitorum superficialis',
  ],
  'left flexor digitorum profundus': ['Flexor digitorum profundus008'],
  'left flexor pollicis longus': ['Flexor pollicis longus002'],
  'left pronator quadratus': ['Pronator quadratus'],
  'left brachioradialis': ['Brachioradialis muscle002'],
  'left extensor carpi radialis longus': ['Extensor carpi radialis longus002'],
  'left extensor carpi radialis brevis': ['Extensor carpi radialis brevis002'],
  'left extensor digitorum': ['Extensor digitorum016'],
  'left extensor digiti minimi': ['Extensor digiti minimi'],
  'left extensor carpi ulnaris': [
    'Humeral head of extensor carpi ulnaris',
    'Ulnar head of extensor carpi ulnaris',
  ],
  'left supinator': ['Supinator002'],
  'left anconeus': ['Anconeus muscle002'],
  'left abductor pollicis longus': ['Abductor pollicis longus002'],
  'left extensor pollicis longus': ['Extensor pollicis longus002'],
  'left extensor pollicis brevis': ['Extensor pollicis brevis002'],
  'left extensor indicis': ['Extensor indicis002'],
  'left abductor pollicis brevis': ['Abductor pollicis brevis'],
  'superficial head of left flexor pollicis brevis': [
    'Superficial head of flexor pollicis brevis',
  ],
  'left opponens pollicis': ['Opponens pollicis muscle'],
  'oblique head of left adductor pollicis': ['Oblique head of adductor pollicis'],
  'transverse head of left adductor pollicis': ['Transverse head of adductor pollicis'],
  'abductor digiti minimi of left hand': ['Abductor digiti minimi of hand002'],
  'flexor digiti minimi brevis of left hand': ['Flexor digiti minimi of hand002'],
  'opponens digiti minimi of left hand': ['Opponens digiti minimi muscle of hand'],
  'set of lumbricals of left hand': ['Lumbrical muscles of hand'],
  'set of palmar interossei of left hand': ['Palmar interossei muscles'],
  'set of dorsal interossei of left hand': ['Dorsal interossei muscles of hand'],
}

/** 本文件尚未覆盖、需要另找数据源的结构（仅存在于 BodyExplorer 的 anatomy.glb） */
export const MUSCLE_PENDING = [
  'flexor retinaculum of left wrist',
  'interosseous membrane of left forearm',
]

/** BodyExplorer(mm, Z-up) <- hpfrei(m, Y-up) 的相似变换，由 fit2.py 拟合得到（残差中位 0.29 mm） */
export const MUSCLE_TRANSFORM = {
  scale: 970.6756,
  perm: [0, 2, 1] as [number, number, number],
  sign: [1, -1, 1] as [number, number, number],
  translation: [-0.7366, -101.5576, -25.3935] as [number, number, number],
}
