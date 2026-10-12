import * as THREE from 'three'
import { FontLoader, type Font } from 'three/addons/loaders/FontLoader.js'
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { mergeGroups } from 'three/addons/utils/BufferGeometryUtils.js'
import { glassBars, inflationValues, insightMessages } from './landing-glass-data'

export interface GlassScene {
  setNumber(index: number): void
  setInsight(index: number): void
  setActivity(active: boolean): void
  dispose(): void
}

function roundedRectangle(width: number, height: number, radius: number) {
  const shape = new THREE.Shape()
  const x = -width / 2
  const y = -height / 2
  shape.moveTo(x + radius, y)
  shape.lineTo(x + width - radius, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + radius)
  shape.lineTo(x + width, y + height - radius)
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  shape.lineTo(x + radius, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)
  return shape
}

export async function createGlassScene(canvas: HTMLCanvasElement, signal: AbortSignal, onContextLost: () => void): Promise<GlassScene> {
  const responses = await Promise.all([
    fetch('/fonts/cominfla-display.json', { signal }),
    fetch('/fonts/cominfla-display-regular.json', { signal }),
  ])
  if (responses.some(response => !response.ok)) throw new Error('Unable to load the 3D display fonts')
  const [font, regularFont] = await Promise.all(responses.map(async response => new FontLoader().parse(await response.json())))
  signal.throwIfAborted()
  const context = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' })
  if (!context) throw new Error('WebGL2 is unavailable')
  const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true })
  try {
    return modelScene(renderer, canvas, font, regularFont, onContextLost)
  } catch (error) {
    renderer.dispose()
    renderer.forceContextLoss()
    throw error
  }
}

function modelScene(renderer: THREE.WebGLRenderer, canvas: HTMLCanvasElement, font: Font, regularFont: Font, onContextLost: () => void): GlassScene {
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.localClippingEnabled = true
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  // Refresh moving shadows at a lower rate than the scene, except while rolling text.
  renderer.shadowMap.autoUpdate = false
  renderer.shadowMap.needsUpdate = true

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-4.2, 4.2, 4.2, -4.2, .1, 60)
  // Show the right wall: the opposite orientation to the reference's left wall.
  camera.position.set(7.5, 3.8, 18)
  camera.lookAt(0, -.1, 0)

  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const geometry = <T extends THREE.BufferGeometry>(value: T): T => { geometries.add(value); return value }
  const material = <T extends THREE.Material>(value: T): T => { materials.add(value); return value }

  const room = new RoomEnvironment()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environment = pmrem.fromScene(room, .04, .1, 100)
  scene.environment = environment.texture
  scene.environmentIntensity = .5
  room.dispose()
  pmrem.dispose()

  const key = new THREE.DirectionalLight(0xfff8ea, 2.8)
  key.position.set(-3, 5.5, 15)
  key.castShadow = true
  key.shadow.mapSize.set(512, 512)
  key.shadow.camera.left = -5
  key.shadow.camera.right = 5
  key.shadow.camera.top = 5
  key.shadow.camera.bottom = -5
  key.shadow.camera.near = .1
  key.shadow.camera.far = 25
  key.shadow.bias = -.001
  key.shadow.normalBias = .035
  scene.add(key)
  const rim = new THREE.DirectionalLight(0xffd075, 1.2)
  rim.position.set(6, 3, -2)
  scene.add(rim, new THREE.HemisphereLight(0xffffff, 0x101216, 1.2))

  const gold = material(new THREE.MeshStandardMaterial({
    color: 0xe7ae32, metalness: .4, roughness: .24,
    emissive: 0x8f5300, emissiveIntensity: .2, envMapIntensity: .8,
  }))
  const goldSide = material(new THREE.MeshStandardMaterial({ color: 0xb57812, metalness: .4, roughness: .28 }))
  const charcoal = material(new THREE.MeshStandardMaterial({ color: 0x343538, metalness: .25, roughness: .28, envMapIntensity: .6 }))
  const whiteText = material(new THREE.MeshStandardMaterial({ color: 0xf0ede4, roughness: .8, emissive: 0x534f43, emissiveIntensity: .25 }))
  const mutedText = material(new THREE.MeshStandardMaterial({ color: 0xaaa79e, roughness: 1, emissive: 0x666359, emissiveIntensity: .2 }))
  const edge = material(new THREE.MeshStandardMaterial({ color: 0xb9a778, metalness: .15, roughness: .2, transparent: true, opacity: .4 }))
  const glass = material(new THREE.MeshPhysicalMaterial({
    color: 0xa7a28f, metalness: .02, roughness: .12,
    transmission: .94, thickness: .12, ior: 1.45,
    transparent: true, opacity: .3, depthWrite: false,
    clearcoat: .7, clearcoatRoughness: .1, envMapIntensity: .45,
  }))
  const backMaterial = material(new THREE.MeshPhysicalMaterial({
    color: 0x080a0c, metalness: .02, roughness: .28, envMapIntensity: .25,
    transparent: true, opacity: .72, clearcoat: .16, clearcoatRoughness: .3,
  }))

  const box = new THREE.Group()
  scene.add(box)
  // A hollow rounded enclosure, only 1.05 units deep against a 7-unit face.
  const shellShape = roundedRectangle(7, 6.65, .48)
  shellShape.holes.push(new THREE.Path(roundedRectangle(6.76, 6.41, .37).getPoints(12)))
  const shell = new THREE.Mesh(geometry(new THREE.ExtrudeGeometry(shellShape, {
    depth: 1.05, bevelEnabled: true, bevelSegments: 3, steps: 1,
    bevelSize: .035, bevelThickness: .035, curveSegments: 12,
  })), glass)
  shell.position.z = -.525
  box.add(shell)

  const back = new THREE.Mesh(geometry(new THREE.ExtrudeGeometry(roundedRectangle(6.88, 6.53, .43), {
    depth: .06, bevelEnabled: false, curveSegments: 12,
  })), backMaterial)
  back.position.z = -.4
  back.receiveShadow = true
  box.add(back)

  // Fine rounded rims make the shallow glass walls visible against the dark page.
  for (const z of [-.53, .53]) {
    const points = roundedRectangle(6.98, 6.63, .47).getPoints(16).slice(0, -1).map(point => new THREE.Vector3(point.x, point.y, z))
    const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal')
    box.add(new THREE.Mesh(geometry(new THREE.TubeGeometry(curve, 120, .012, 5, true)), edge))
  }

  const text = (value: string, size: number, depth: number, face: THREE.Material, sides: THREE.Material = face, typeface = font) => {
    const textGeometry = geometry(new TextGeometry(value, {
      font: typeface, size, depth, curveSegments: 4, bevelEnabled: depth > .03,
      bevelThickness: .009, bevelSize: .006, bevelSegments: 1,
    }))
    // ExtrudeGeometry creates material groups for every letter. Draw the entire
    // label once, and the gold percentage in just two batches (face and sides).
    if (face === sides) textGeometry.clearGroups()
    else mergeGroups(textGeometry)
    return new THREE.Mesh(textGeometry, face === sides ? face : [face, sides])
  }
  const label = (value: string, size: number, x: number, y: number, z: number, face: THREE.Material) => {
    const mesh = text(value, size, .012, face, face, face === mutedText ? regularFont : font)
    mesh.position.set(x, y, z)
    box.add(mesh)
    return mesh
  }

  const kicker = label('Exemplo de visualização', .24, -2.95, 2.59, -.13, mutedText)
  const brand = label('ComInfla', .255, 1.69, 2.59, -.13, gold)
  const dot = new THREE.Mesh(geometry(new THREE.SphereGeometry(.045, 12, 8)), gold)
  dot.position.set(1.49, 2.68, -.1)
  box.add(dot)
  const period = label('Inflação pessoal · últimos 12 meses', .232, -2.95, .96, -.08, mutedText)

  const numberBaseline = 1.52
  // Keep both moving values inside the percentage line, clear of its labels.
  const numberWindow = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.3), new THREE.Plane(new THREE.Vector3(0, -1, 0), 2.43)]
  const numberFace = material(gold.clone())
  const numberSide = material(goldSide.clone())
  for (const surface of [numberFace, numberSide]) {
    surface.clippingPlanes = numberWindow
    surface.clipShadows = true
  }
  const numbers = inflationValues.map(value => {
    const mesh = text(value, 1.23, .13, numberFace, numberSide)
    mesh.position.set(-2.98, numberBaseline, .02)
    mesh.castShadow = true
    mesh.visible = false
    box.add(mesh)
    return mesh
  })
  numbers[0].visible = true

  const plotBase = new THREE.Mesh(geometry(new RoundedBoxGeometry(5.98, .09, .94, 2, .035)), material(new THREE.MeshStandardMaterial({
    color: 0x987327, metalness: .4, roughness: .28,
  })))
  plotBase.position.set(0, -1.56, .04)
  plotBase.receiveShadow = true
  box.add(plotBase)
  const bars = glassBars.map((height, index) => {
    const bar = new THREE.Mesh(geometry(new RoundedBoxGeometry(.5, height, .68, 2, .045)), index === 7 ? gold : charcoal)
    bar.position.set(-2.59 + index * .74, -1.5 + height / 2, .04)
    bar.castShadow = true
    bar.receiveShadow = true
    box.add(bar)
    return bar
  })

  const plaqueMaterial = material(new THREE.MeshPhysicalMaterial({
    color: 0x17191c, metalness: .15, roughness: .28, clearcoat: .55, clearcoatRoughness: .2,
  }))
  const plaque = new THREE.Mesh(geometry(new RoundedBoxGeometry(6.05, 1.12, .22, 3, .09)), plaqueMaterial)
  plaque.position.set(0, -2.42, .16)
  plaque.castShadow = true
  plaque.receiveShadow = true
  box.add(plaque)
  // A narrow gold edge around the raised insight block.
  const plaqueOutline = new THREE.LineLoop(geometry(new THREE.BufferGeometry().setFromPoints(
    roundedRectangle(5.99, 1.06, .08).getPoints(10).map(point => new THREE.Vector3(point.x, point.y, 0)),
  )), material(new THREE.LineBasicMaterial({ color: 0x8c753d, transparent: true, opacity: .7 })))
  plaqueOutline.position.set(0, -2.42, .278)
  box.add(plaqueOutline)
  const insightTitle = label('INSIGHT', .198, -2.75, -2.14, .3, gold)

  const wrap = (value: string, size: number, maxWidth: number) => {
    const width = (word: string) => Array.from(word).reduce((sum, char) => sum + (font.data.glyphs[char]?.ha ?? 500), 0) * size / font.data.resolution
    const lines: string[] = []
    let line = ''
    for (const word of value.split(' ')) {
      const candidate = line ? `${line} ${word}` : word
      if (line && width(candidate) > maxWidth) { lines.push(line); line = word }
      else line = candidate
    }
    if (line) lines.push(line)
    return lines
  }
  const insights = new THREE.Group()
  box.add(insights)
  const insightText = material(whiteText.clone())
  insightText.clippingPlanes = [
    new THREE.Plane(new THREE.Vector3(0, 1, 0), 2.925),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), -2.24),
  ]
  let insightGroups: THREE.Group[] = []
  let insightRoll: { from: number; to: number; startedAt: number } | null = null
  let compact = false
  let numberIndex = 0
  let insightIndex = 0
  const buildInsights = (size: number) => {
    insightRoll = null
    for (const group of insightGroups) {
      group.traverse(object => {
        if (object instanceof THREE.Mesh) {
          geometries.delete(object.geometry)
          object.geometry.dispose()
        }
      })
      insights.remove(group)
    }
    insightGroups = insightMessages.map(message => {
      const group = new THREE.Group()
      wrap(message, size, 5.5).forEach((line, index) => {
        const mesh = text(line, size, .02, insightText)
        mesh.position.set(-2.75, -2.48 - index * size * 1.15, .31)
        group.add(mesh)
      })
      group.visible = false
      insights.add(group)
      return group
    })
    insightGroups[insightIndex].visible = true
  }
  buildInsights(.234)

  let active = false
  let disposed = false
  let frame = 0
  let lastFrame = 0
  let lastRender = 0
  let elapsed = 0
  let numberRoll: { from: number; to: number; startedAt: number } | null = null
  let lastShadowUpdate = 0
  const settleNumber = () => {
    numbers.forEach((number, index) => {
      number.visible = index === numberIndex
      number.position.y = numberBaseline
    })
    numberRoll = null
    renderer.shadowMap.needsUpdate = true
  }
  const settleInsight = () => {
    insightGroups.forEach((group, index) => {
      group.visible = index === insightIndex
      group.position.y = 0
    })
    insightRoll = null
  }
  const render = () => { if (!disposed) renderer.render(scene, camera) }
  const animate = (timestamp: number) => {
    if (disposed || !active) { frame = 0; return }
    frame = window.requestAnimationFrame(animate)
    const delta = timestamp - lastFrame
    if (delta < 1000 / 30) return
    lastFrame = timestamp - delta % (1000 / 30)
    // Animation time follows visible wall time, even when the GPU skips frames.
    const step = Math.max(0, timestamp - lastRender)
    lastRender = timestamp
    elapsed += step / 1000
    bars.forEach((bar, index) => {
      const wave = 1 + Math.sin(elapsed * Math.PI * 2 / 4.2 - index * .5) * .085
      bar.scale.y = wave
      bar.position.y = -1.5 + glassBars[index] * wave / 2
    })
    if (numberRoll) {
      const progress = Math.max(0, Math.min(1, (timestamp - numberRoll.startedAt) / 600))
      const eased = progress * progress * (3 - 2 * progress)
      numbers[numberRoll.from].position.y = numberBaseline + eased * 1.3
      numbers[numberRoll.to].position.y = numberBaseline - (1 - eased) * 1.3
      renderer.shadowMap.needsUpdate = true
      if (progress === 1) settleNumber()
    }
    if (insightRoll) {
      const progress = Math.max(0, Math.min(1, (timestamp - insightRoll.startedAt) / 650))
      const eased = progress * progress * (3 - 2 * progress)
      insightGroups[insightRoll.from].position.y = eased * .85
      insightGroups[insightRoll.to].position.y = -(1 - eased) * .85
      if (progress === 1) settleInsight()
    }
    if (elapsed - lastShadowUpdate >= .16) {
      renderer.shadowMap.needsUpdate = true
      lastShadowUpdate = elapsed
    }
    render()
  }

  const resize = () => {
    if (disposed) return
    const { width, height } = canvas.getBoundingClientRect()
    if (!width || !height) return
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 420 ? 1.25 : 1.5))
    renderer.setSize(width, height, false)
    const aspect = width / height
    const viewHeight = Math.max(7.7, 7.9 / aspect)
    camera.left = -viewHeight * aspect / 2
    camera.right = viewHeight * aspect / 2
    camera.top = viewHeight / 2
    camera.bottom = -viewHeight / 2
    const nextCompact = width < 420
    if (compact !== nextCompact) {
      compact = nextCompact
      kicker.scale.setScalar(compact ? 1.17 : 1)
      brand.scale.setScalar(compact ? 1.18 : 1)
      period.scale.setScalar(compact ? 1.17 : 1)
      insightTitle.scale.setScalar(compact ? 1.2 : 1)
      buildInsights(compact ? .2745 : .234)
    }
    camera.position.set(compact ? 5.1 : 7.5, compact ? 2.8 : 3.8, 18)
    camera.lookAt(0, -.1, 0)
    camera.updateProjectionMatrix()
    renderer.shadowMap.needsUpdate = true
    render()
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas)
  const contextLost = (event: Event) => {
    event.preventDefault()
    if (!disposed) onContextLost()
  }
  canvas.addEventListener('webglcontextlost', contextLost)
  resize()

  return {
    setNumber(index) {
      if (index === numberIndex) return
      settleNumber()
      const previous = numberIndex
      numberIndex = index
      if (!active) settleNumber()
      else {
        numberRoll = { from: previous, to: index, startedAt: performance.now() }
        numbers[index].position.y = numberBaseline - 1.3
        numbers[index].visible = true
      }
      renderer.shadowMap.needsUpdate = true
      if (active) render()
    },
    setInsight(index) {
      if (index === insightIndex) return
      settleInsight()
      const previous = insightIndex
      insightIndex = index
      if (!active) settleInsight()
      else {
        insightRoll = { from: previous, to: index, startedAt: performance.now() }
        insightGroups[index].position.y = -.85
        insightGroups[index].visible = true
      }
      if (active) render()
    },
    setActivity(nextActive) {
      if (disposed) return
      active = nextActive
      window.cancelAnimationFrame(frame)
      frame = 0
      if (!active) {
        settleNumber()
        settleInsight()
      }
      if (active) {
        render()
        lastFrame = lastRender = performance.now()
        frame = window.requestAnimationFrame(animate)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      canvas.removeEventListener('webglcontextlost', contextLost)
      geometries.forEach(value => value.dispose())
      materials.forEach(value => value.dispose())
      environment.dispose()
      key.shadow.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
