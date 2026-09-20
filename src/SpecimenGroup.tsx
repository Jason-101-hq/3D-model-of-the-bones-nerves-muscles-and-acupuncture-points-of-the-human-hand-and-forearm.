/**
 * 真值标本层 —— DiceCT 手部标本（Steer et al. 2026）的独立渲染分支。
 *
 * ## 它为什么是「另一个手」而不是「一个图层」
 *
 * 标本来自一具真实离体手（碘染 microCT，48.8 μm），本模型是体表解剖图谱的
 * 示意几何。两者不是同一个人，尺寸、走行、肌腹边界都对不上；强行配准会得到
 * 一个「看起来对齐、实际处处是误差」的假象，比不对齐更糟。
 *
 * 所以这里的选择是**并置**：把标本摆在本模型手旁边（间距 20 mm），
 * 让「示意 vs 实测」的差异直接可见。代价是打开后画面会变宽、相机不居中，
 * 用户需要自己拉远——这是刻意的，因为「它不在这只手上」本身就是信息。
 *
 * ## 几何的坐标系
 *
 * specimen.glb 里的顶点已经是**本项目的模型坐标**（mm、Z 轴向上、+X 桡侧、
 * +Y 背侧），并且已完成「右手 → 左手」的手性翻转（y 取反）。所以它和
 * BoneGroup / MuscleGroup 共用同一套父级变换，不需要额外校准。
 *
 * ## 拾取
 *
 * 网格名带上 `specimen:` 前缀再挂到 mesh.name 上，于是 Viewer 那套
 * 「按 mesh.name 查 STRUCTURE_INDEX」的悬停与点击机制无需任何改动即可生效。
 */
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { useAtlas } from './store'

/** 与 Viewer 保持一致的选中色。此处不 import，避免 Viewer ↔ SpecimenGroup 循环依赖 */
const SELECT_COLOR = '#22D3EE'

/** 双击判定窗口（ms），与 Viewer 的 DOUBLE_CLICK_MS 同值 */
const DOUBLE_CLICK_MS = 260

/**
 * 各结构的配色与对外 id。
 *
 * `raw` 是 glb 里的节点原始名；但 GLTFLoader 会用 `sanitizeNodeName` 清洗节点名——
 * 它会**删掉** `. : [ ] /` 并把握空白换成下划线，于是 `nerve.median` 到手里已经变成
 * `nervemedian`。直接按原名查表必然全部落空（症状是整只标本都变成兜底色）。
 * 所以两边都先规范化再比对：只留字母数字并转小写。
 *
 * 神经仍是琥珀、肌肉仍是砖红 —— 与模型自身的图层色一致。这是有意的：
 * 对照的目的是看**形态**差异，如果连颜色都换一套，眼睛就没有可锚定的对应关系。
 * 只有体表点云用标本层的紫罗兰，因为「轮廓点」不属于任何解剖系统。
 */
const TABLE: { raw: string; id: string; color: string }[] = [
  { raw: 'nerve.median', id: 'specimen:nerve.median', color: '#E0B13A' },
  { raw: 'nerve.ulnar', id: 'specimen:nerve.ulnar', color: '#E0B13A' },
  { raw: 'nerve.other', id: 'specimen:nerve.other', color: '#C9A24A' },
  { raw: 'muscle.dorsal-io-1', id: 'specimen:muscle.dorsal-io-1', color: '#B4553C' },
  { raw: 'muscle.adductor-pollicis', id: 'specimen:muscle.adductor-pollicis', color: '#B4553C' },
  { raw: 'muscle.palmar-aponeurosis', id: 'specimen:muscle.palmar-aponeurosis', color: '#A85F4A' },
  { raw: 'specimen.hand-outline', id: 'specimen:hand-outline', color: '#8B5CF6' },
]

/** 规范化：只留字母数字、转小写。两侧用同一把尺子，就不用猜加载器删了什么 */
const canon = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const BY_CANON = new Map(TABLE.map((t) => [canon(t.raw), t]))

interface Piece {
  id: string
  geometry: THREE.BufferGeometry
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  scale: THREE.Vector3
  /** mode=0 写出的顶点集 —— 手部轮廓点云 */
  isPoints: boolean
  color: string
}

/**
 * 把 glb 场景摊平成可渲染的片段表。
 *
 * 不能直接 `<primitive object={gltf.scene} />`：那样网格名就是 glb 里的原名字，
 * 拾取时会和模型自身的 `nerve.*` 撞车。这里显式重建一份带前缀的节点。
 */
function flatten(gltf: { scene: THREE.Object3D }): Piece[] {
  const out: Piece[] = []
  const pos = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const scl = new THREE.Vector3()
  gltf.scene.updateMatrixWorld(true)
  gltf.scene.traverse((o) => {
    const any = o as unknown as { isMesh?: boolean; isPoints?: boolean }
    if (!any.isMesh && !any.isPoints) return
    const raw = o.name
    if (!raw) return
    const hit = BY_CANON.get(canon(raw))
    // 认不出来的节点就跳过：宁可少画一个，也不要一个没名字的东西混进拾取
    if (!hit) {
      console.warn('[arm-atlas] 标本层出现未登记的节点:', raw)
      return
    }
    const g = (o as unknown as { geometry: THREE.BufferGeometry }).geometry
    if (!g) return
    o.matrixWorld.decompose(pos, quat, scl)
    out.push({
      id: hit.id,
      geometry: g,
      position: pos.clone(),
      quaternion: quat.clone(),
      scale: scl.clone(),
      isPoints: !!any.isPoints,
      color: hit.color,
    })
  })
  return out
}

/** 单个标本结构的材质渲染 */
function SpecimenPiece({ piece, opacity }: { piece: Piece; opacity: number }) {
  const selected = useAtlas((s) => s.selected)
  const hovered = useAtlas((s) => s.hovered)
  const isSel = selected === piece.id
  const isHover = hovered === piece.id

  const lastClick = useRef(0)
  const onClick = (e: {
    stopPropagation: () => void
    point: THREE.Vector3
  }) => {
    e.stopPropagation()
    const st = useAtlas.getState()
    const now = performance.now()
    if (now - lastClick.current < DOUBLE_CLICK_MS) {
      lastClick.current = 0
      st.select(piece.id)
      st.request({ kind: 'focus', point: [e.point.x, e.point.y, e.point.z] })
      return
    }
    lastClick.current = now
    st.select(st.selected === piece.id ? null : piece.id)
  }

  if (piece.isPoints) {
    return (
      <points
        name={piece.id}
        geometry={piece.geometry}
        position={piece.position}
        quaternion={piece.quaternion}
        scale={piece.scale}
      >
        <pointsMaterial
          size={1.6}
          sizeAttenuation={false}
          color={piece.color}
          transparent
          opacity={0.5 * opacity}
          depthWrite={false}
        />
      </points>
    )
  }

  const base = isSel ? SELECT_COLOR : isHover ? '#F59E0B' : piece.color
  return (
    <mesh
      name={piece.id}
      geometry={piece.geometry}
      position={piece.position}
      quaternion={piece.quaternion}
      scale={piece.scale}
      onClick={onClick}
    >
      <meshStandardMaterial
        color={base}
        roughness={0.62}
        metalness={0.04}
        /* 标本是重建网格，面片感本身就是「这是原始数据」的提示，不做平滑伪装 */
        flatShading
        side={THREE.DoubleSide}
        transparent
        opacity={opacity}
        emissive={isSel || isHover ? base : '#000000'}
        emissiveIntensity={isSel || isHover ? 0.55 : 0}
        depthWrite={opacity > 0.92}
      />
    </mesh>
  )
}

export default function SpecimenGroup() {
  const gltf = useGLTF(`${import.meta.env.BASE_URL}models/specimen.glb`)
  const st = useAtlas((s) => s.layers.specimen)
  const pieces = useMemo(() => flatten(gltf), [gltf])

  if (!st.visible) return null

  return (
    <group name="specimen-layer">
      {pieces.map((p) => (
        <SpecimenPiece key={p.id} piece={p} opacity={st.opacity} />
      ))}
    </group>
  )
}

/** 供图层开关在打开前预取，避免第一次点开时卡一下 */
export const SPECIMEN_URL = `${import.meta.env.BASE_URL}models/specimen.glb`
