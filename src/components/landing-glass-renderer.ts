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
  setActivity(active: boolean, reducedMotion: boolean): void
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
  renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  // The gentle waves do not need a new shadow map on every frame.
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
  scene.environmentIntensity = .65
  room.dispose()
  pmrem.dispose()

  const key = new THREE.DirectionalLight(0xfff0d4, 2.6)
  key.position.set(-4, 7, 8)
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
  const rim = new THREE.DirectionalLight(0xffda86, 2.4)
  rim.position.set(6, 3, -2)
  scene.add(rim, new THREE.HemisphereLight(0xfff4de, 0x1b1a16, 1.8))

  const gold = material(new THREE.MeshStandardMaterial({ color: 0xd7ad4c, metalness: .65, roughness: .25 }))
  const goldSide = material(new THREE.MeshStandardMaterial({ color: 0x987021, metalness: .6, roughness: .3 }))
  const charcoal = material(new THREE.MeshStandardMaterial({ color: 0x363631, metalness: .3, roughness: .32 }))
  const whiteText = material(new THREE.MeshStandardMaterial({ color: 0xf0ede4, roughness: .8, emissive: 0x534f43, emissiveIntensity: .25 }))
  const mutedText = material(new THREE.MeshStandardMaterial({ color: 0xaaa79e, roughness: 1, emissive: 0x666359, emissiveIntensity: .2 }))
  const edge = material(new THREE.MeshStandardMaterial({ color: 0xd9cba9, metalness: .35, roughness: .2, transparent: true, opacity: .65 }))
  const glass = material(new THREE.MeshPhysicalMaterial({
    color: 0xc1c2b9, metalness: .03, roughness: .12,
    transmission: .9, thickness: .18, ior: 1.46,
    transparent: true, opacity: .58, depthWrite: false,
    clearcoat: 1, clearcoatRoughness: .1,
  }))
  const backMaterial = material(new THREE.MeshPhysicalMaterial({
    color: 0x070809, metalness: .04, roughness: .4, envMapIntensity: .45,
    transparent: true, opacity: .91, clearcoat: .25, clearcoatRoughness: .3,
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
  back.position.z = -.57
  back.receiveShadow = true
  box.add(back)

  // Fine rounded rims make the shallow glass walls visible against the dark page.
  for (const z of [-.53, .53]) {
    const points = roundedRectangle(6.98, 6.63, .47).getPoints(16).map(point => new THREE.Vector3(point.x, point.y, z))
    const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal')
    box.add(new THREE.Mesh(geometry(new THREE.TubeGeometry(curve, 120, .016, 5, true)), edge))
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

  const kicker = label('Exemplo de visualização', .3, -2.95, 2.59, -.13, mutedText)
  const brand = label('ComInfla', .255, 1.99, 2.59, -.13, gold)
  const dot = new THREE.Mesh(geometry(new THREE.SphereGeometry(.045, 12, 8)), gold)
  dot.position.set(1.79, 2.68, -.1)
  box.add(dot)
  const period = label('Inflação pessoal · últimos 12 meses', .29, -2.95, 1.02, -.08, mutedText)

  const numbers = inflationValues.map(value => {
    const mesh = text(value, 1.27, .13, gold, goldSide)
    mesh.position.set(-2.98, 1.46, .02)
    mesh.castShadow = true
    mesh.visible = false
    box.add(mesh)
    return mesh
  })
  numbers[0].visible = true

  const plotBase = new THREE.Mesh(geometry(new RoundedBoxGeometry(5.98, .09, .94, 2, .035)), material(new THREE.MeshStandardMaterial({
    color: 0x74623a, metalness: .65, roughness: .3,
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
    color: 0x24231c, metalness: .2, roughness: .32, clearcoat: .8, clearcoatRoughness: .2,
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
  const insightTitle = label('INSIGHT', .22, -2.75, -2.14, .3, gold)

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
  let insightGroups: THREE.Group[] = []
  let compact = false
  let numberIndex = 0
  let insightIndex = 0
  const buildInsights = (size: number) => {
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
        const mesh = text(line, size, .02, whiteText)
        mesh.position.set(-2.75, -2.48 - index * size * 1.15, .31)
        group.add(mesh)
      })
      group.visible = false
      insights.add(group)
      return group
    })
    insightGroups[insightIndex].visible = true
  }
  buildInsights(.28)

  const floor = new THREE.Mesh(geometry(new THREE.PlaneGeometry(12, 7)), material(new THREE.ShadowMaterial({ opacity: .3 })))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -3.42
  floor.receiveShadow = true
  scene.add(floor)

  let active = false
  let reducedMotion = false
  let disposed = false
  let frame = 0
  let lastFrame = 0
  let elapsed = 0
  let numberPulse = 0
  let insightPulse = 0
  const render = () => { if (!disposed) renderer.render(scene, camera) }
  const animate = (timestamp: number) => {
    if (disposed || !active || reducedMotion) { frame = 0; return }
    frame = window.requestAnimationFrame(animate)
    const delta = timestamp - lastFrame
    if (delta < 1000 / 30) return
    lastFrame = timestamp - delta % (1000 / 30)
    elapsed += Math.min(delta, 100) / 1000
    bars.forEach((bar, index) => {
      const wave = 1 + Math.sin(elapsed * Math.PI * 2 / 4.2 - index * .42) * .025
      bar.scale.y = wave
      bar.position.y = -1.5 + glassBars[index] * wave / 2
    })
    if (numberPulse > 0) {
      numberPulse = Math.max(0, numberPulse - delta / 450)
      numbers[numberIndex].position.y = 1.46 + Math.sin(numberPulse * Math.PI) * .08
    }
    if (insightPulse > 0) {
      insightPulse = Math.max(0, insightPulse - delta / 550)
      insights.position.z = Math.sin(insightPulse * Math.PI) * .035
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
      buildInsights(compact ? .33 : .28)
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
      numbers[numberIndex].visible = false
      numbers[numberIndex].position.y = 1.46
      numberIndex = index
      numbers[index].visible = true
      numberPulse = reducedMotion ? 0 : 1
      renderer.shadowMap.needsUpdate = true
      if (active) render()
    },
    setInsight(index) {
      insightGroups[insightIndex].visible = false
      insightIndex = index
      insightGroups[index].visible = true
      insightPulse = reducedMotion ? 0 : 1
      if (active) render()
    },
    setActivity(nextActive, nextReducedMotion) {
      if (disposed) return
      active = nextActive
      reducedMotion = nextReducedMotion
      window.cancelAnimationFrame(frame)
      frame = 0
      if (reducedMotion) {
        bars.forEach((bar, index) => {
          bar.scale.y = 1
          bar.position.y = -1.5 + glassBars[index] / 2
        })
        numbers[numberIndex].position.y = 1.46
        insights.position.z = 0
        numberPulse = insightPulse = 0
      }
      if (active) {
        render()
        lastFrame = performance.now()
        if (!reducedMotion) frame = window.requestAnimationFrame(animate)
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
