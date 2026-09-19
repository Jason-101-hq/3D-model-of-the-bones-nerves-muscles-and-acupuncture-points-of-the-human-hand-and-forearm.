import fs from 'fs'
import { createRequire } from 'module'
const require_ = createRequire(import.meta.url)
globalThis.self = globalThis
if (!globalThis.ProgressEvent) {
  globalThis.ProgressEvent = class ProgressEvent { constructor(t, i = {}) { this.type = t; Object.assign(this, i) } }
}
let BLOB_PARTS = null
globalThis.Blob = class Blob { constructor(parts) { BLOB_PARTS = parts } }
globalThis.URL = globalThis.URL || {}
globalThis.URL.createObjectURL = () => 'blob:fake'
globalThis.URL.revokeObjectURL = () => {}

globalThis.Worker = class FakeWorker {
  constructor() {
    const body = BLOB_PARTS.join('\n')
    const OUT = '/tmp/_draco_worker_gen.cjs'
    fs.writeFileSync(OUT, 'globalThis.onmessage = null;\n' + body + '\n')
    require_(OUT)                     // 在真实全局作用域里执行 worker 代码
    this._sb = globalThis
  }
  postMessage(m) { setImmediate(() => globalThis.onmessage && globalThis.onmessage({ data: m })) }
  terminate() {}
}

const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js')
const draco = new DRACOLoader()
draco.setDecoderPath('http://127.0.0.1:8765/node_modules/three/examples/jsm/libs/draco/')
const loader = new GLTFLoader()
loader.setDRACOLoader(draco)
const buf = fs.readFileSync('public/models/muscles.glb')
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
loader.parse(ab, '', (gltf) => {
  let n = 0, tri = 0
  const names = []
  gltf.scene.traverse(o => {
    if (o.isMesh) { n++; const g = o.geometry; tri += (g.index ? g.index.count : g.attributes.position.count) / 3; names.push(o.name) }
  })
  console.log('OK meshes=%d tris=%s', n, Math.round(tri))
  console.log('手部相关:', names.filter(x => /pollicis|interosse|lumbrical|digiti minimi/i.test(x)))
  process.exit(0)
}, (e) => { console.error('PARSE ERR', e); process.exit(1) })
