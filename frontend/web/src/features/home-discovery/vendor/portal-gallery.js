/* Renderer and curved-card shaders extracted from the user-owned skyjjgw.com portfolio.
 * OGL rendering primitives: Nathan Gordon (oframe), Unlicense.
 * Integration adapter is below; site navigation and data remain outside this module.
 */
function on(e) {
  let a = e[0],
    t = e[1],
    o = e[2]
  return Math.sqrt(a * a + t * t + o * o)
}
function Ku(e, a) {
  return ((e[0] = a[0]), (e[1] = a[1]), (e[2] = a[2]), e)
}
function db(e, a, t, o) {
  return ((e[0] = a), (e[1] = t), (e[2] = o), e)
}
function Rm(e, a, t) {
  return ((e[0] = a[0] + t[0]), (e[1] = a[1] + t[1]), (e[2] = a[2] + t[2]), e)
}
function Em(e, a, t) {
  return ((e[0] = a[0] - t[0]), (e[1] = a[1] - t[1]), (e[2] = a[2] - t[2]), e)
}
function pb(e, a, t) {
  return ((e[0] = a[0] * t[0]), (e[1] = a[1] * t[1]), (e[2] = a[2] * t[2]), e)
}
function Ib(e, a, t) {
  return ((e[0] = a[0] / t[0]), (e[1] = a[1] / t[1]), (e[2] = a[2] / t[2]), e)
}
function $u(e, a, t) {
  return ((e[0] = a[0] * t), (e[1] = a[1] * t), (e[2] = a[2] * t), e)
}
function mb(e, a) {
  let t = a[0] - e[0],
    o = a[1] - e[1],
    r = a[2] - e[2]
  return Math.sqrt(t * t + o * o + r * r)
}
function Ab(e, a) {
  let t = a[0] - e[0],
    o = a[1] - e[1],
    r = a[2] - e[2]
  return t * t + o * o + r * r
}
function Om(e) {
  let a = e[0],
    t = e[1],
    o = e[2]
  return a * a + t * t + o * o
}
function gb(e, a) {
  return ((e[0] = -a[0]), (e[1] = -a[1]), (e[2] = -a[2]), e)
}
function xb(e, a) {
  return ((e[0] = 1 / a[0]), (e[1] = 1 / a[1]), (e[2] = 1 / a[2]), e)
}
function _u(e, a) {
  let t = a[0],
    o = a[1],
    r = a[2],
    n = t * t + o * o + r * r
  return (
    n > 0 && (n = 1 / Math.sqrt(n)),
    (e[0] = a[0] * n),
    (e[1] = a[1] * n),
    (e[2] = a[2] * n),
    e
  )
}
function Pm(e, a) {
  return e[0] * a[0] + e[1] * a[1] + e[2] * a[2]
}
function Lm(e, a, t) {
  let o = a[0],
    r = a[1],
    n = a[2],
    s = t[0],
    l = t[1],
    f = t[2]
  return (
    (e[0] = r * f - n * l), (e[1] = n * s - o * f), (e[2] = o * l - r * s), e
  )
}
function hb(e, a, t, o) {
  let r = a[0],
    n = a[1],
    s = a[2]
  return (
    (e[0] = r + o * (t[0] - r)),
    (e[1] = n + o * (t[1] - n)),
    (e[2] = s + o * (t[2] - s)),
    e
  )
}
function Fb(e, a, t, o, r) {
  let n = Math.exp(-o * r),
    s = a[0],
    l = a[1],
    f = a[2]
  return (
    (e[0] = t[0] + (s - t[0]) * n),
    (e[1] = t[1] + (l - t[1]) * n),
    (e[2] = t[2] + (f - t[2]) * n),
    e
  )
}
function Sb(e, a, t) {
  let o = a[0],
    r = a[1],
    n = a[2],
    s = t[3] * o + t[7] * r + t[11] * n + t[15]
  return (
    (s = s || 1),
    (e[0] = (t[0] * o + t[4] * r + t[8] * n + t[12]) / s),
    (e[1] = (t[1] * o + t[5] * r + t[9] * n + t[13]) / s),
    (e[2] = (t[2] * o + t[6] * r + t[10] * n + t[14]) / s),
    e
  )
}
function Cb(e, a, t) {
  let o = a[0],
    r = a[1],
    n = a[2],
    s = t[3] * o + t[7] * r + t[11] * n + t[15]
  return (
    (s = s || 1),
    (e[0] = (t[0] * o + t[4] * r + t[8] * n) / s),
    (e[1] = (t[1] * o + t[5] * r + t[9] * n) / s),
    (e[2] = (t[2] * o + t[6] * r + t[10] * n) / s),
    e
  )
}
function bb(e, a, t) {
  let o = a[0],
    r = a[1],
    n = a[2]
  return (
    (e[0] = o * t[0] + r * t[3] + n * t[6]),
    (e[1] = o * t[1] + r * t[4] + n * t[7]),
    (e[2] = o * t[2] + r * t[5] + n * t[8]),
    e
  )
}
function yb(e, a, t) {
  let o = a[0],
    r = a[1],
    n = a[2],
    s = t[0],
    l = t[1],
    f = t[2],
    c = t[3],
    u = l * n - f * r,
    d = f * o - s * n,
    i = s * r - l * o,
    p = l * i - f * d,
    g = f * u - s * i,
    F = s * d - l * u,
    S = c * 2
  return (
    (u *= S),
    (d *= S),
    (i *= S),
    (p *= 2),
    (g *= 2),
    (F *= 2),
    (e[0] = o + u + p),
    (e[1] = r + d + g),
    (e[2] = n + i + F),
    e
  )
}
var vb = (function () {
  let e = [0, 0, 0],
    a = [0, 0, 0]
  return function (t, o) {
    ;(Ku(e, t), Ku(a, o), _u(e, e), _u(a, a))
    let r = Pm(e, a)
    return r > 1 ? 0 : r < -1 ? Math.PI : Math.acos(r)
  }
})()
function wb(e, a) {
  return e[0] === a[0] && e[1] === a[1] && e[2] === a[2]
}
var He = class e extends Array {
  constructor(a = 0, t = a, o = a) {
    return (super(a, t, o), this)
  }
  get x() {
    return this[0]
  }
  get y() {
    return this[1]
  }
  get z() {
    return this[2]
  }
  set x(a) {
    this[0] = a
  }
  set y(a) {
    this[1] = a
  }
  set z(a) {
    this[2] = a
  }
  set(a, t = a, o = a) {
    return a.length ? this.copy(a) : (db(this, a, t, o), this)
  }
  copy(a) {
    return (Ku(this, a), this)
  }
  add(a, t) {
    return (t ? Rm(this, a, t) : Rm(this, this, a), this)
  }
  sub(a, t) {
    return (t ? Em(this, a, t) : Em(this, this, a), this)
  }
  multiply(a) {
    return (a.length ? pb(this, this, a) : $u(this, this, a), this)
  }
  divide(a) {
    return (a.length ? Ib(this, this, a) : $u(this, this, 1 / a), this)
  }
  inverse(a = this) {
    return (xb(this, a), this)
  }
  len() {
    return on(this)
  }
  distance(a) {
    return a ? mb(this, a) : on(this)
  }
  squaredLen() {
    return Om(this)
  }
  squaredDistance(a) {
    return a ? Ab(this, a) : Om(this)
  }
  negate(a = this) {
    return (gb(this, a), this)
  }
  cross(a, t) {
    return (t ? Lm(this, a, t) : Lm(this, this, a), this)
  }
  scale(a) {
    return ($u(this, this, a), this)
  }
  normalize() {
    return (_u(this, this), this)
  }
  dot(a) {
    return Pm(this, a)
  }
  equals(a) {
    return wb(this, a)
  }
  applyMatrix3(a) {
    return (bb(this, this, a), this)
  }
  applyMatrix4(a) {
    return (Sb(this, this, a), this)
  }
  scaleRotateMatrix4(a) {
    return (Cb(this, this, a), this)
  }
  applyQuaternion(a) {
    return (yb(this, this, a), this)
  }
  angle(a) {
    return vb(this, a)
  }
  lerp(a, t) {
    return (hb(this, this, a, t), this)
  }
  smoothLerp(a, t, o) {
    return (Fb(this, this, a, t, o), this)
  }
  clone() {
    return new e(this[0], this[1], this[2])
  }
  fromArray(a, t = 0) {
    return ((this[0] = a[t]), (this[1] = a[t + 1]), (this[2] = a[t + 2]), this)
  }
  toArray(a = [], t = 0) {
    return ((a[t] = this[0]), (a[t + 1] = this[1]), (a[t + 2] = this[2]), a)
  }
  transformDirection(a) {
    let t = this[0],
      o = this[1],
      r = this[2]
    return (
      (this[0] = a[0] * t + a[4] * o + a[8] * r),
      (this[1] = a[1] * t + a[5] * o + a[9] * r),
      (this[2] = a[2] * t + a[6] * o + a[10] * r),
      this.normalize()
    )
  }
}
var Tb = new He()
var TB = 1
var MB = 1
var Mb = !1
var ei = class {
  constructor(a, t = {}) {
    ;(a.canvas || console.error('gl not passed as first argument to Geometry'),
      (this.gl = a),
      (this.attributes = t),
      (this.id = TB++),
      (this.VAOs = {}),
      (this.drawRange = {
        start: 0,
        count: 0,
      }),
      (this.instancedCount = 0),
      this.gl.renderer.bindVertexArray(null),
      (this.gl.renderer.currentGeometry = null),
      (this.glState = this.gl.renderer.state))
    for (let o in t) this.addAttribute(o, t[o])
  }
  addAttribute(a, t) {
    if (
      ((this.attributes[a] = t),
      (t.id = MB++),
      (t.size = t.size || 1),
      (t.type =
        t.type ||
        (t.data.constructor === Float32Array
          ? this.gl.FLOAT
          : t.data.constructor === Uint16Array
            ? this.gl.UNSIGNED_SHORT
            : this.gl.UNSIGNED_INT)),
      (t.target =
        a === 'index' ? this.gl.ELEMENT_ARRAY_BUFFER : this.gl.ARRAY_BUFFER),
      (t.normalized = t.normalized || !1),
      (t.stride = t.stride || 0),
      (t.offset = t.offset || 0),
      (t.count =
        t.count ||
        (t.stride ? t.data.byteLength / t.stride : t.data.length / t.size)),
      (t.divisor = t.instanced || 0),
      (t.needsUpdate = !1),
      (t.usage = t.usage || this.gl.STATIC_DRAW),
      t.buffer || this.updateAttribute(t),
      t.divisor)
    ) {
      if (
        ((this.isInstanced = !0),
        this.instancedCount && this.instancedCount !== t.count * t.divisor)
      )
        return (
          console.warn(
            'geometry has multiple instanced buffers of different length'
          ),
          (this.instancedCount = Math.min(
            this.instancedCount,
            t.count * t.divisor
          ))
        )
      this.instancedCount = t.count * t.divisor
    } else
      a === 'index'
        ? (this.drawRange.count = t.count)
        : this.attributes.index ||
          (this.drawRange.count = Math.max(this.drawRange.count, t.count))
  }
  updateAttribute(a) {
    let t = !a.buffer
    ;(t && (a.buffer = this.gl.createBuffer()),
      this.glState.boundBuffer !== a.buffer &&
        (this.gl.bindBuffer(a.target, a.buffer),
        (this.glState.boundBuffer = a.buffer)),
      t
        ? this.gl.bufferData(a.target, a.data, a.usage)
        : this.gl.bufferSubData(a.target, 0, a.data),
      (a.needsUpdate = !1))
  }
  setIndex(a) {
    this.addAttribute('index', a)
  }
  setDrawRange(a, t) {
    ;((this.drawRange.start = a), (this.drawRange.count = t))
  }
  setInstancedCount(a) {
    this.instancedCount = a
  }
  createVAO(a) {
    ;((this.VAOs[a.attributeOrder] = this.gl.renderer.createVertexArray()),
      this.gl.renderer.bindVertexArray(this.VAOs[a.attributeOrder]),
      this.bindAttributes(a))
  }
  bindAttributes(a) {
    ;(a.attributeLocations.forEach((t, { name: o, type: r }) => {
      if (!this.attributes[o]) {
        console.warn(`active attribute ${o} not being supplied`)
        return
      }
      let n = this.attributes[o]
      ;(this.gl.bindBuffer(n.target, n.buffer),
        (this.glState.boundBuffer = n.buffer))
      let s = 1
      ;(r === 35674 && (s = 2), r === 35675 && (s = 3), r === 35676 && (s = 4))
      let l = n.size / s,
        f = s === 1 ? 0 : s * s * 4,
        c = s === 1 ? 0 : s * 4
      for (let u = 0; u < s; u++)
        (this.gl.vertexAttribPointer(
          t + u,
          l,
          n.type,
          n.normalized,
          n.stride + f,
          n.offset + u * c
        ),
          this.gl.enableVertexAttribArray(t + u),
          this.gl.renderer.vertexAttribDivisor(t + u, n.divisor))
    }),
      this.attributes.index &&
        this.gl.bindBuffer(
          this.gl.ELEMENT_ARRAY_BUFFER,
          this.attributes.index.buffer
        ))
  }
  draw({ program: a, mode: t = this.gl.TRIANGLES }) {
    ;(this.gl.renderer.currentGeometry !== `${this.id}_${a.attributeOrder}` &&
      (this.VAOs[a.attributeOrder] || this.createVAO(a),
      this.gl.renderer.bindVertexArray(this.VAOs[a.attributeOrder]),
      (this.gl.renderer.currentGeometry = `${this.id}_${a.attributeOrder}`)),
      a.attributeLocations.forEach((r, { name: n }) => {
        let s = this.attributes[n]
        s.needsUpdate && this.updateAttribute(s)
      }))
    let o = 2
    ;(this.attributes.index?.type === this.gl.UNSIGNED_INT && (o = 4),
      this.isInstanced
        ? this.attributes.index
          ? this.gl.renderer.drawElementsInstanced(
              t,
              this.drawRange.count,
              this.attributes.index.type,
              this.attributes.index.offset + this.drawRange.start * o,
              this.instancedCount
            )
          : this.gl.renderer.drawArraysInstanced(
              t,
              this.drawRange.start,
              this.drawRange.count,
              this.instancedCount
            )
        : this.attributes.index
          ? this.gl.drawElements(
              t,
              this.drawRange.count,
              this.attributes.index.type,
              this.attributes.index.offset + this.drawRange.start * o
            )
          : this.gl.drawArrays(t, this.drawRange.start, this.drawRange.count))
  }
  getPosition() {
    let a = this.attributes.position
    if (a.data) return a
    if (!Mb)
      return (
        console.warn('No position buffer data found to compute bounds'),
        (Mb = !0)
      )
  }
  computeBoundingBox(a) {
    a || (a = this.getPosition())
    let t = a.data,
      o = a.size
    this.bounds ||
      (this.bounds = {
        min: new He(),
        max: new He(),
        center: new He(),
        scale: new He(),
        radius: 1 / 0,
      })
    let r = this.bounds.min,
      n = this.bounds.max,
      s = this.bounds.center,
      l = this.bounds.scale
    ;(r.set(1 / 0), n.set(-1 / 0))
    for (let f = 0, c = t.length; f < c; f += o) {
      let u = t[f],
        d = t[f + 1],
        i = t[f + 2]
      ;((r.x = Math.min(u, r.x)),
        (r.y = Math.min(d, r.y)),
        (r.z = Math.min(i, r.z)),
        (n.x = Math.max(u, n.x)),
        (n.y = Math.max(d, n.y)),
        (n.z = Math.max(i, n.z)))
    }
    ;(l.sub(n, r), s.add(r, n).divide(2))
  }
  computeBoundingSphere(a) {
    a || (a = this.getPosition())
    let t = a.data,
      o = a.size
    this.bounds || this.computeBoundingBox(a)
    let r = 0
    for (let n = 0, s = t.length; n < s; n += o)
      (Tb.fromArray(t, n),
        (r = Math.max(r, this.bounds.center.squaredDistance(Tb))))
    this.bounds.radius = Math.sqrt(r)
  }
  remove() {
    for (let a in this.VAOs)
      (this.gl.renderer.deleteVertexArray(this.VAOs[a]), delete this.VAOs[a])
    for (let a in this.attributes)
      (this.gl.deleteBuffer(this.attributes[a].buffer),
        delete this.attributes[a])
  }
}
var DB = 1
var Db = {}
var Fs = class {
  constructor(
    a,
    {
      vertex: t,
      fragment: o,
      uniforms: r = {},
      transparent: n = !1,
      cullFace: s = a.BACK,
      frontFace: l = a.CCW,
      depthTest: f = !0,
      depthWrite: c = !0,
      depthFunc: u = a.LEQUAL,
    } = {}
  ) {
    ;(a.canvas || console.error('gl not passed as first argument to Program'),
      (this.gl = a),
      (this.uniforms = r),
      (this.id = DB++),
      t || console.warn('vertex shader not supplied'),
      o || console.warn('fragment shader not supplied'),
      (this.transparent = n),
      (this.cullFace = s),
      (this.frontFace = l),
      (this.depthTest = f),
      (this.depthWrite = c),
      (this.depthFunc = u),
      (this.blendFunc = {}),
      (this.blendEquation = {}),
      (this.stencilFunc = {}),
      (this.stencilOp = {}),
      this.transparent &&
        !this.blendFunc.src &&
        (this.gl.renderer.premultipliedAlpha
          ? this.setBlendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA)
          : this.setBlendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA)),
      (this.vertexShader = a.createShader(a.VERTEX_SHADER)),
      (this.fragmentShader = a.createShader(a.FRAGMENT_SHADER)),
      (this.program = a.createProgram()),
      a.attachShader(this.program, this.vertexShader),
      a.attachShader(this.program, this.fragmentShader),
      this.setShaders({
        vertex: t,
        fragment: o,
      }))
  }
  setShaders({ vertex: a, fragment: t }) {
    if (
      (a &&
        (this.gl.shaderSource(this.vertexShader, a),
        this.gl.compileShader(this.vertexShader),
        this.gl.getShaderInfoLog(this.vertexShader) !== '' &&
          console.warn(`${this.gl.getShaderInfoLog(this.vertexShader)}
Vertex Shader
${Bb(a)}`)),
      t &&
        (this.gl.shaderSource(this.fragmentShader, t),
        this.gl.compileShader(this.fragmentShader),
        this.gl.getShaderInfoLog(this.fragmentShader) !== '' &&
          console.warn(`${this.gl.getShaderInfoLog(this.fragmentShader)}
Fragment Shader
${Bb(t)}`)),
      this.gl.linkProgram(this.program),
      !this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS))
    )
      return console.warn(this.gl.getProgramInfoLog(this.program))
    this.uniformLocations = new Map()
    let o = this.gl.getProgramParameter(this.program, this.gl.ACTIVE_UNIFORMS)
    for (let s = 0; s < o; s++) {
      let l = this.gl.getActiveUniform(this.program, s)
      this.uniformLocations.set(
        l,
        this.gl.getUniformLocation(this.program, l.name)
      )
      let f = l.name.match(/(\w+)/g)
      ;((l.uniformName = f[0]), (l.nameComponents = f.slice(1)))
    }
    this.attributeLocations = new Map()
    let r = [],
      n = this.gl.getProgramParameter(this.program, this.gl.ACTIVE_ATTRIBUTES)
    for (let s = 0; s < n; s++) {
      let l = this.gl.getActiveAttrib(this.program, s),
        f = this.gl.getAttribLocation(this.program, l.name)
      f !== -1 && ((r[f] = l.name), this.attributeLocations.set(l, f))
    }
    this.attributeOrder = r.join('')
  }
  setBlendFunc(a, t, o, r) {
    ;((this.blendFunc.src = a),
      (this.blendFunc.dst = t),
      (this.blendFunc.srcAlpha = o),
      (this.blendFunc.dstAlpha = r),
      a && (this.transparent = !0))
  }
  setBlendEquation(a, t) {
    ;((this.blendEquation.modeRGB = a), (this.blendEquation.modeAlpha = t))
  }
  setStencilFunc(a, t, o) {
    ;((this.stencilRef = t),
      (this.stencilFunc.func = a),
      (this.stencilFunc.ref = t),
      (this.stencilFunc.mask = o))
  }
  setStencilOp(a, t, o) {
    ;((this.stencilOp.stencilFail = a),
      (this.stencilOp.depthFail = t),
      (this.stencilOp.depthPass = o))
  }
  applyState() {
    ;(this.depthTest
      ? this.gl.renderer.enable(this.gl.DEPTH_TEST)
      : this.gl.renderer.disable(this.gl.DEPTH_TEST),
      this.cullFace
        ? this.gl.renderer.enable(this.gl.CULL_FACE)
        : this.gl.renderer.disable(this.gl.CULL_FACE),
      this.blendFunc.src
        ? this.gl.renderer.enable(this.gl.BLEND)
        : this.gl.renderer.disable(this.gl.BLEND),
      this.cullFace && this.gl.renderer.setCullFace(this.cullFace),
      this.gl.renderer.setFrontFace(this.frontFace),
      this.gl.renderer.setDepthMask(this.depthWrite),
      this.gl.renderer.setDepthFunc(this.depthFunc),
      this.blendFunc.src &&
        this.gl.renderer.setBlendFunc(
          this.blendFunc.src,
          this.blendFunc.dst,
          this.blendFunc.srcAlpha,
          this.blendFunc.dstAlpha
        ),
      this.gl.renderer.setBlendEquation(
        this.blendEquation.modeRGB,
        this.blendEquation.modeAlpha
      ),
      this.stencilFunc.func || this.stencilOp.stencilFail
        ? this.gl.renderer.enable(this.gl.STENCIL_TEST)
        : this.gl.renderer.disable(this.gl.STENCIL_TEST),
      this.gl.renderer.setStencilFunc(
        this.stencilFunc.func,
        this.stencilFunc.ref,
        this.stencilFunc.mask
      ),
      this.gl.renderer.setStencilOp(
        this.stencilOp.stencilFail,
        this.stencilOp.depthFail,
        this.stencilOp.depthPass
      ))
  }
  use({ flipFaces: a = !1 } = {}) {
    let t = -1
    ;(this.gl.renderer.state.currentProgram === this.id ||
      (this.gl.useProgram(this.program),
      (this.gl.renderer.state.currentProgram = this.id)),
      this.uniformLocations.forEach((r, n) => {
        let s = this.uniforms[n.uniformName]
        for (let l of n.nameComponents) {
          if (!s) break
          if (l in s) s = s[l]
          else {
            if (Array.isArray(s.value)) break
            s = void 0
            break
          }
        }
        if (!s) return Rb(`Active uniform ${n.name} has not been supplied`)
        if (s && s.value === void 0)
          return Rb(`${n.name} uniform is missing a value parameter`)
        if (s.value.texture)
          return ((t = t + 1), s.value.update(t), Nm(this.gl, n.type, r, t))
        if (s.value.length && s.value[0].texture) {
          let l = []
          return (
            s.value.forEach((f) => {
              ;((t = t + 1), f.update(t), l.push(t))
            }),
            Nm(this.gl, n.type, r, l)
          )
        }
        Nm(this.gl, n.type, r, s.value)
      }),
      this.applyState(),
      a &&
        this.gl.renderer.setFrontFace(
          this.frontFace === this.gl.CCW ? this.gl.CW : this.gl.CCW
        ))
  }
  remove() {
    this.gl.deleteProgram(this.program)
  }
}
function Nm(e, a, t, o) {
  o = o.length ? BB(o) : o
  let r = e.renderer.state.uniformLocations.get(t)
  if (o.length) {
    if (r === void 0 || r.length !== o.length)
      e.renderer.state.uniformLocations.set(t, o.slice(0))
    else {
      if (RB(r, o)) return
      ;(r.set ? r.set(o) : EB(r, o),
        e.renderer.state.uniformLocations.set(t, r))
    }
  } else {
    if (r === o) return
    e.renderer.state.uniformLocations.set(t, o)
  }
  switch (a) {
    case 5126:
      return o.length ? e.uniform1fv(t, o) : e.uniform1f(t, o)
    case 35664:
      return e.uniform2fv(t, o)
    case 35665:
      return e.uniform3fv(t, o)
    case 35666:
      return e.uniform4fv(t, o)
    case 35670:
    case 5124:
    case 35678:
    case 36306:
    case 35680:
    case 36289:
      return o.length ? e.uniform1iv(t, o) : e.uniform1i(t, o)
    case 35671:
    case 35667:
      return e.uniform2iv(t, o)
    case 35672:
    case 35668:
      return e.uniform3iv(t, o)
    case 35673:
    case 35669:
      return e.uniform4iv(t, o)
    case 35674:
      return e.uniformMatrix2fv(t, !1, o)
    case 35675:
      return e.uniformMatrix3fv(t, !1, o)
    case 35676:
      return e.uniformMatrix4fv(t, !1, o)
  }
}
function Bb(e) {
  let a = e.split(`
`)
  for (let t = 0; t < a.length; t++) a[t] = t + 1 + ': ' + a[t]
  return a.join(`
`)
}
function BB(e) {
  let a = e.length,
    t = e[0].length
  if (t === void 0) return e
  let o = a * t,
    r = Db[o]
  r || (Db[o] = r = new Float32Array(o))
  for (let n = 0; n < a; n++) r.set(e[n], n * t)
  return r
}
function RB(e, a) {
  if (e.length !== a.length) return !1
  for (let t = 0, o = e.length; t < o; t++) if (e[t] !== a[t]) return !1
  return !0
}
function EB(e, a) {
  for (let t = 0, o = e.length; t < o; t++) e[t] = a[t]
}
var Hm = 0
function Rb(e) {
  Hm > 100 ||
    (console.warn(e),
    Hm++,
    Hm > 100 && console.warn('More than 100 program warnings - stopping logs.'))
}
var Um = new He()
var OB = 1
var rf = class {
  constructor({
    canvas: a = document.createElement('canvas'),
    width: t = 300,
    height: o = 150,
    dpr: r = 1,
    alpha: n = !1,
    depth: s = !0,
    stencil: l = !1,
    antialias: f = !1,
    premultipliedAlpha: c = !1,
    preserveDrawingBuffer: u = !1,
    powerPreference: d = 'default',
    autoClear: i = !0,
    webgl: p = 2,
  } = {}) {
    let g = {
      alpha: n,
      depth: s,
      stencil: l,
      antialias: f,
      premultipliedAlpha: c,
      preserveDrawingBuffer: u,
      powerPreference: d,
    }
    ;((this.dpr = r),
      (this.alpha = n),
      (this.color = !0),
      (this.depth = s),
      (this.stencil = l),
      (this.premultipliedAlpha = c),
      (this.autoClear = i),
      (this.id = OB++),
      p === 2 && (this.gl = a.getContext('webgl2', g)),
      (this.isWebgl2 = !!this.gl),
      this.gl || (this.gl = a.getContext('webgl', g)),
      this.gl || console.error('unable to create webgl context'),
      (this.gl.renderer = this),
      this.setSize(t, o),
      (this.state = {}),
      (this.state.blendFunc = {
        src: this.gl.ONE,
        dst: this.gl.ZERO,
      }),
      (this.state.blendEquation = {
        modeRGB: this.gl.FUNC_ADD,
      }),
      (this.state.cullFace = !1),
      (this.state.frontFace = this.gl.CCW),
      (this.state.depthMask = !0),
      (this.state.depthFunc = this.gl.LEQUAL),
      (this.state.premultiplyAlpha = !1),
      (this.state.flipY = !1),
      (this.state.unpackAlignment = 4),
      (this.state.framebuffer = null),
      (this.state.viewport = {
        x: 0,
        y: 0,
        width: null,
        height: null,
      }),
      (this.state.textureUnits = []),
      (this.state.activeTextureUnit = 0),
      (this.state.boundBuffer = null),
      (this.state.uniformLocations = new Map()),
      (this.state.currentProgram = null),
      (this.extensions = {}),
      this.isWebgl2
        ? (this.getExtension('EXT_color_buffer_float'),
          this.getExtension('OES_texture_float_linear'))
        : (this.getExtension('OES_texture_float'),
          this.getExtension('OES_texture_float_linear'),
          this.getExtension('OES_texture_half_float'),
          this.getExtension('OES_texture_half_float_linear'),
          this.getExtension('OES_element_index_uint'),
          this.getExtension('OES_standard_derivatives'),
          this.getExtension('EXT_sRGB'),
          this.getExtension('WEBGL_depth_texture'),
          this.getExtension('WEBGL_draw_buffers')),
      this.getExtension('WEBGL_compressed_texture_astc'),
      this.getExtension('EXT_texture_compression_bptc'),
      this.getExtension('WEBGL_compressed_texture_s3tc'),
      this.getExtension('WEBGL_compressed_texture_etc1'),
      this.getExtension('WEBGL_compressed_texture_pvrtc'),
      this.getExtension('WEBKIT_WEBGL_compressed_texture_pvrtc'),
      (this.vertexAttribDivisor = this.getExtension(
        'ANGLE_instanced_arrays',
        'vertexAttribDivisor',
        'vertexAttribDivisorANGLE'
      )),
      (this.drawArraysInstanced = this.getExtension(
        'ANGLE_instanced_arrays',
        'drawArraysInstanced',
        'drawArraysInstancedANGLE'
      )),
      (this.drawElementsInstanced = this.getExtension(
        'ANGLE_instanced_arrays',
        'drawElementsInstanced',
        'drawElementsInstancedANGLE'
      )),
      (this.createVertexArray = this.getExtension(
        'OES_vertex_array_object',
        'createVertexArray',
        'createVertexArrayOES'
      )),
      (this.bindVertexArray = this.getExtension(
        'OES_vertex_array_object',
        'bindVertexArray',
        'bindVertexArrayOES'
      )),
      (this.deleteVertexArray = this.getExtension(
        'OES_vertex_array_object',
        'deleteVertexArray',
        'deleteVertexArrayOES'
      )),
      (this.drawBuffers = this.getExtension(
        'WEBGL_draw_buffers',
        'drawBuffers',
        'drawBuffersWEBGL'
      )),
      (this.parameters = {}),
      (this.parameters.maxTextureUnits = this.gl.getParameter(
        this.gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS
      )),
      (this.parameters.maxAnisotropy = this.getExtension(
        'EXT_texture_filter_anisotropic'
      )
        ? this.gl.getParameter(
            this.getExtension('EXT_texture_filter_anisotropic')
              .MAX_TEXTURE_MAX_ANISOTROPY_EXT
          )
        : 0))
  }
  setSize(a, t) {
    ;((this.width = a),
      (this.height = t),
      (this.gl.canvas.width = a * this.dpr),
      (this.gl.canvas.height = t * this.dpr),
      this.gl.canvas.style &&
        Object.assign(this.gl.canvas.style, {
          width: a + 'px',
          height: t + 'px',
        }))
  }
  setViewport(a, t, o = 0, r = 0) {
    ;(this.state.viewport.width === a && this.state.viewport.height === t) ||
      ((this.state.viewport.width = a),
      (this.state.viewport.height = t),
      (this.state.viewport.x = o),
      (this.state.viewport.y = r),
      this.gl.viewport(o, r, a, t))
  }
  setScissor(a, t, o = 0, r = 0) {
    this.gl.scissor(o, r, a, t)
  }
  enable(a) {
    this.state[a] !== !0 && (this.gl.enable(a), (this.state[a] = !0))
  }
  disable(a) {
    this.state[a] !== !1 && (this.gl.disable(a), (this.state[a] = !1))
  }
  setBlendFunc(a, t, o, r) {
    ;(this.state.blendFunc.src === a &&
      this.state.blendFunc.dst === t &&
      this.state.blendFunc.srcAlpha === o &&
      this.state.blendFunc.dstAlpha === r) ||
      ((this.state.blendFunc.src = a),
      (this.state.blendFunc.dst = t),
      (this.state.blendFunc.srcAlpha = o),
      (this.state.blendFunc.dstAlpha = r),
      o !== void 0
        ? this.gl.blendFuncSeparate(a, t, o, r)
        : this.gl.blendFunc(a, t))
  }
  setBlendEquation(a, t) {
    ;((a = a || this.gl.FUNC_ADD),
      !(
        this.state.blendEquation.modeRGB === a &&
        this.state.blendEquation.modeAlpha === t
      ) &&
        ((this.state.blendEquation.modeRGB = a),
        (this.state.blendEquation.modeAlpha = t),
        t !== void 0
          ? this.gl.blendEquationSeparate(a, t)
          : this.gl.blendEquation(a)))
  }
  setCullFace(a) {
    this.state.cullFace !== a &&
      ((this.state.cullFace = a), this.gl.cullFace(a))
  }
  setFrontFace(a) {
    this.state.frontFace !== a &&
      ((this.state.frontFace = a), this.gl.frontFace(a))
  }
  setDepthMask(a) {
    this.state.depthMask !== a &&
      ((this.state.depthMask = a), this.gl.depthMask(a))
  }
  setDepthFunc(a) {
    this.state.depthFunc !== a &&
      ((this.state.depthFunc = a), this.gl.depthFunc(a))
  }
  setStencilMask(a) {
    this.state.stencilMask !== a &&
      ((this.state.stencilMask = a), this.gl.stencilMask(a))
  }
  setStencilFunc(a, t, o) {
    ;(this.state.stencilFunc === a &&
      this.state.stencilRef === t &&
      this.state.stencilFuncMask === o) ||
      ((this.state.stencilFunc = a || this.gl.ALWAYS),
      (this.state.stencilRef = t || 0),
      (this.state.stencilFuncMask = o || 0),
      this.gl.stencilFunc(a || this.gl.ALWAYS, t || 0, o || 0))
  }
  setStencilOp(a, t, o) {
    ;(this.state.stencilFail === a &&
      this.state.stencilDepthFail === t &&
      this.state.stencilDepthPass === o) ||
      ((this.state.stencilFail = a),
      (this.state.stencilDepthFail = t),
      (this.state.stencilDepthPass = o),
      this.gl.stencilOp(a, t, o))
  }
  activeTexture(a) {
    this.state.activeTextureUnit !== a &&
      ((this.state.activeTextureUnit = a),
      this.gl.activeTexture(this.gl.TEXTURE0 + a))
  }
  bindFramebuffer({ target: a = this.gl.FRAMEBUFFER, buffer: t = null } = {}) {
    this.state.framebuffer !== t &&
      ((this.state.framebuffer = t), this.gl.bindFramebuffer(a, t))
  }
  getExtension(a, t, o) {
    return t && this.gl[t]
      ? this.gl[t].bind(this.gl)
      : (this.extensions[a] || (this.extensions[a] = this.gl.getExtension(a)),
        t
          ? this.extensions[a]
            ? this.extensions[a][o].bind(this.extensions[a])
            : null
          : this.extensions[a])
  }
  sortOpaque(a, t) {
    return a.renderOrder !== t.renderOrder
      ? a.renderOrder - t.renderOrder
      : a.program.id !== t.program.id
        ? a.program.id - t.program.id
        : a.zDepth !== t.zDepth
          ? a.zDepth - t.zDepth
          : t.id - a.id
  }
  sortTransparent(a, t) {
    return a.renderOrder !== t.renderOrder
      ? a.renderOrder - t.renderOrder
      : a.zDepth !== t.zDepth
        ? t.zDepth - a.zDepth
        : t.id - a.id
  }
  sortUI(a, t) {
    return a.renderOrder !== t.renderOrder
      ? a.renderOrder - t.renderOrder
      : a.program.id !== t.program.id
        ? a.program.id - t.program.id
        : t.id - a.id
  }
  getRenderList({ scene: a, camera: t, frustumCull: o, sort: r }) {
    let n = []
    if (
      (t && o && t.updateFrustum(),
      a.traverse((s) => {
        if (!s.visible) return !0
        s.draw &&
          ((o && s.frustumCulled && t && !t.frustumIntersectsMesh(s)) ||
            n.push(s))
      }),
      r)
    ) {
      let s = [],
        l = [],
        f = []
      ;(n.forEach((c) => {
        ;(c.program.transparent
          ? c.program.depthTest
            ? l.push(c)
            : f.push(c)
          : s.push(c),
          (c.zDepth = 0),
          !(c.renderOrder !== 0 || !c.program.depthTest || !t) &&
            (c.worldMatrix.getTranslation(Um),
            Um.applyMatrix4(t.projectionViewMatrix),
            (c.zDepth = Um.z)))
      }),
        s.sort(this.sortOpaque),
        l.sort(this.sortTransparent),
        f.sort(this.sortUI),
        (n = s.concat(l, f)))
    }
    return n
  }
  render({
    scene: a,
    camera: t,
    target: o = null,
    update: r = !0,
    sort: n = !0,
    frustumCull: s = !0,
    clear: l,
  }) {
    ;(o === null
      ? (this.bindFramebuffer(),
        this.setViewport(this.width * this.dpr, this.height * this.dpr))
      : (this.bindFramebuffer(o), this.setViewport(o.width, o.height)),
      (l || (this.autoClear && l !== !1)) &&
        (this.depth &&
          (!o || o.depth) &&
          (this.enable(this.gl.DEPTH_TEST), this.setDepthMask(!0)),
        (this.stencil || !o || o.stencil) &&
          (this.enable(this.gl.STENCIL_TEST), this.setStencilMask(255)),
        this.gl.clear(
          (this.color ? this.gl.COLOR_BUFFER_BIT : 0) |
            (this.depth ? this.gl.DEPTH_BUFFER_BIT : 0) |
            (this.stencil ? this.gl.STENCIL_BUFFER_BIT : 0)
        )),
      r && a.updateMatrixWorld(),
      t && t.updateMatrixWorld(),
      this.getRenderList({
        scene: a,
        camera: t,
        frustumCull: s,
        sort: n,
      }).forEach((c) => {
        c.draw({
          camera: t,
        })
      }))
  }
}
function Eb(e, a) {
  return ((e[0] = a[0]), (e[1] = a[1]), (e[2] = a[2]), (e[3] = a[3]), e)
}
function Ob(e, a, t, o, r) {
  return ((e[0] = a), (e[1] = t), (e[2] = o), (e[3] = r), e)
}
function Pb(e, a) {
  let t = a[0],
    o = a[1],
    r = a[2],
    n = a[3],
    s = t * t + o * o + r * r + n * n
  return (
    s > 0 && (s = 1 / Math.sqrt(s)),
    (e[0] = t * s),
    (e[1] = o * s),
    (e[2] = r * s),
    (e[3] = n * s),
    e
  )
}
function Lb(e, a) {
  return e[0] * a[0] + e[1] * a[1] + e[2] * a[2] + e[3] * a[3]
}
function Nb(e) {
  return ((e[0] = 0), (e[1] = 0), (e[2] = 0), (e[3] = 1), e)
}
function Hb(e, a, t) {
  t = t * 0.5
  let o = Math.sin(t)
  return (
    (e[0] = o * a[0]),
    (e[1] = o * a[1]),
    (e[2] = o * a[2]),
    (e[3] = Math.cos(t)),
    e
  )
}
function zm(e, a, t) {
  let o = a[0],
    r = a[1],
    n = a[2],
    s = a[3],
    l = t[0],
    f = t[1],
    c = t[2],
    u = t[3]
  return (
    (e[0] = o * u + s * l + r * c - n * f),
    (e[1] = r * u + s * f + n * l - o * c),
    (e[2] = n * u + s * c + o * f - r * l),
    (e[3] = s * u - o * l - r * f - n * c),
    e
  )
}
function Ub(e, a, t) {
  t *= 0.5
  let o = a[0],
    r = a[1],
    n = a[2],
    s = a[3],
    l = Math.sin(t),
    f = Math.cos(t)
  return (
    (e[0] = o * f + s * l),
    (e[1] = r * f + n * l),
    (e[2] = n * f - r * l),
    (e[3] = s * f - o * l),
    e
  )
}
function zb(e, a, t) {
  t *= 0.5
  let o = a[0],
    r = a[1],
    n = a[2],
    s = a[3],
    l = Math.sin(t),
    f = Math.cos(t)
  return (
    (e[0] = o * f - n * l),
    (e[1] = r * f + s * l),
    (e[2] = n * f + o * l),
    (e[3] = s * f - r * l),
    e
  )
}
function qb(e, a, t) {
  t *= 0.5
  let o = a[0],
    r = a[1],
    n = a[2],
    s = a[3],
    l = Math.sin(t),
    f = Math.cos(t)
  return (
    (e[0] = o * f + r * l),
    (e[1] = r * f - o * l),
    (e[2] = n * f + s * l),
    (e[3] = s * f - n * l),
    e
  )
}
function jb(e, a, t, o) {
  let r = a[0],
    n = a[1],
    s = a[2],
    l = a[3],
    f = t[0],
    c = t[1],
    u = t[2],
    d = t[3],
    i,
    p,
    g,
    F,
    S
  return (
    (p = r * f + n * c + s * u + l * d),
    p < 0 && ((p = -p), (f = -f), (c = -c), (u = -u), (d = -d)),
    1 - p > 1e-6
      ? ((i = Math.acos(p)),
        (g = Math.sin(i)),
        (F = Math.sin((1 - o) * i) / g),
        (S = Math.sin(o * i) / g))
      : ((F = 1 - o), (S = o)),
    (e[0] = F * r + S * f),
    (e[1] = F * n + S * c),
    (e[2] = F * s + S * u),
    (e[3] = F * l + S * d),
    e
  )
}
function Wb(e, a) {
  let t = a[0],
    o = a[1],
    r = a[2],
    n = a[3],
    s = t * t + o * o + r * r + n * n,
    l = s ? 1 / s : 0
  return ((e[0] = -t * l), (e[1] = -o * l), (e[2] = -r * l), (e[3] = n * l), e)
}
function Qb(e, a) {
  return ((e[0] = -a[0]), (e[1] = -a[1]), (e[2] = -a[2]), (e[3] = a[3]), e)
}
function Vb(e, a) {
  let t = a[0] + a[4] + a[8],
    o
  if (t > 0)
    ((o = Math.sqrt(t + 1)),
      (e[3] = 0.5 * o),
      (o = 0.5 / o),
      (e[0] = (a[5] - a[7]) * o),
      (e[1] = (a[6] - a[2]) * o),
      (e[2] = (a[1] - a[3]) * o))
  else {
    let r = 0
    ;(a[4] > a[0] && (r = 1), a[8] > a[r * 3 + r] && (r = 2))
    let n = (r + 1) % 3,
      s = (r + 2) % 3
    ;((o = Math.sqrt(a[r * 3 + r] - a[n * 3 + n] - a[s * 3 + s] + 1)),
      (e[r] = 0.5 * o),
      (o = 0.5 / o),
      (e[3] = (a[n * 3 + s] - a[s * 3 + n]) * o),
      (e[n] = (a[n * 3 + r] + a[r * 3 + n]) * o),
      (e[s] = (a[s * 3 + r] + a[r * 3 + s]) * o))
  }
  return e
}
function Jb(e, a, t = 'YXZ') {
  let o = Math.sin(a[0] * 0.5),
    r = Math.cos(a[0] * 0.5),
    n = Math.sin(a[1] * 0.5),
    s = Math.cos(a[1] * 0.5),
    l = Math.sin(a[2] * 0.5),
    f = Math.cos(a[2] * 0.5)
  return (
    t === 'XYZ'
      ? ((e[0] = o * s * f + r * n * l),
        (e[1] = r * n * f - o * s * l),
        (e[2] = r * s * l + o * n * f),
        (e[3] = r * s * f - o * n * l))
      : t === 'YXZ'
        ? ((e[0] = o * s * f + r * n * l),
          (e[1] = r * n * f - o * s * l),
          (e[2] = r * s * l - o * n * f),
          (e[3] = r * s * f + o * n * l))
        : t === 'ZXY'
          ? ((e[0] = o * s * f - r * n * l),
            (e[1] = r * n * f + o * s * l),
            (e[2] = r * s * l + o * n * f),
            (e[3] = r * s * f - o * n * l))
          : t === 'ZYX'
            ? ((e[0] = o * s * f - r * n * l),
              (e[1] = r * n * f + o * s * l),
              (e[2] = r * s * l - o * n * f),
              (e[3] = r * s * f + o * n * l))
            : t === 'YZX'
              ? ((e[0] = o * s * f + r * n * l),
                (e[1] = r * n * f + o * s * l),
                (e[2] = r * s * l - o * n * f),
                (e[3] = r * s * f - o * n * l))
              : t === 'XZY' &&
                ((e[0] = o * s * f - r * n * l),
                (e[1] = r * n * f - o * s * l),
                (e[2] = r * s * l + o * n * f),
                (e[3] = r * s * f + o * n * l)),
    e
  )
}
var Gb = Eb
var Yb = Ob
var Zb = Lb
var Xb = Pb
var ai = class extends Array {
  constructor(a = 0, t = 0, o = 0, r = 1) {
    ;(super(a, t, o, r), (this.onChange = () => {}), (this._target = this))
    let n = ['0', '1', '2', '3']
    return new Proxy(this, {
      set(s, l) {
        let f = Reflect.set(...arguments)
        return (f && n.includes(l) && s.onChange(), f)
      },
    })
  }
  get x() {
    return this[0]
  }
  get y() {
    return this[1]
  }
  get z() {
    return this[2]
  }
  get w() {
    return this[3]
  }
  set x(a) {
    ;((this._target[0] = a), this.onChange())
  }
  set y(a) {
    ;((this._target[1] = a), this.onChange())
  }
  set z(a) {
    ;((this._target[2] = a), this.onChange())
  }
  set w(a) {
    ;((this._target[3] = a), this.onChange())
  }
  identity() {
    return (Nb(this._target), this.onChange(), this)
  }
  set(a, t, o, r) {
    return a.length
      ? this.copy(a)
      : (Yb(this._target, a, t, o, r), this.onChange(), this)
  }
  rotateX(a) {
    return (Ub(this._target, this._target, a), this.onChange(), this)
  }
  rotateY(a) {
    return (zb(this._target, this._target, a), this.onChange(), this)
  }
  rotateZ(a) {
    return (qb(this._target, this._target, a), this.onChange(), this)
  }
  inverse(a = this._target) {
    return (Wb(this._target, a), this.onChange(), this)
  }
  conjugate(a = this._target) {
    return (Qb(this._target, a), this.onChange(), this)
  }
  copy(a) {
    return (Gb(this._target, a), this.onChange(), this)
  }
  normalize(a = this._target) {
    return (Xb(this._target, a), this.onChange(), this)
  }
  multiply(a, t) {
    return (
      t ? zm(this._target, a, t) : zm(this._target, this._target, a),
      this.onChange(),
      this
    )
  }
  dot(a) {
    return Zb(this._target, a)
  }
  fromMatrix3(a) {
    return (Vb(this._target, a), this.onChange(), this)
  }
  fromEuler(a, t) {
    return (Jb(this._target, a, a.order), t || this.onChange(), this)
  }
  fromAxisAngle(a, t) {
    return (Hb(this._target, a, t), this.onChange(), this)
  }
  slerp(a, t) {
    return (jb(this._target, this._target, a, t), this.onChange(), this)
  }
  fromArray(a, t = 0) {
    return (
      (this._target[0] = a[t]),
      (this._target[1] = a[t + 1]),
      (this._target[2] = a[t + 2]),
      (this._target[3] = a[t + 3]),
      this.onChange(),
      this
    )
  }
  toArray(a = [], t = 0) {
    return (
      (a[t] = this[0]),
      (a[t + 1] = this[1]),
      (a[t + 2] = this[2]),
      (a[t + 3] = this[3]),
      a
    )
  }
}
var NB = 1e-6
function Kb(e, a) {
  return (
    (e[0] = a[0]),
    (e[1] = a[1]),
    (e[2] = a[2]),
    (e[3] = a[3]),
    (e[4] = a[4]),
    (e[5] = a[5]),
    (e[6] = a[6]),
    (e[7] = a[7]),
    (e[8] = a[8]),
    (e[9] = a[9]),
    (e[10] = a[10]),
    (e[11] = a[11]),
    (e[12] = a[12]),
    (e[13] = a[13]),
    (e[14] = a[14]),
    (e[15] = a[15]),
    e
  )
}
function _b(e, a, t, o, r, n, s, l, f, c, u, d, i, p, g, F, S) {
  return (
    (e[0] = a),
    (e[1] = t),
    (e[2] = o),
    (e[3] = r),
    (e[4] = n),
    (e[5] = s),
    (e[6] = l),
    (e[7] = f),
    (e[8] = c),
    (e[9] = u),
    (e[10] = d),
    (e[11] = i),
    (e[12] = p),
    (e[13] = g),
    (e[14] = F),
    (e[15] = S),
    e
  )
}
function $b(e) {
  return (
    (e[0] = 1),
    (e[1] = 0),
    (e[2] = 0),
    (e[3] = 0),
    (e[4] = 0),
    (e[5] = 1),
    (e[6] = 0),
    (e[7] = 0),
    (e[8] = 0),
    (e[9] = 0),
    (e[10] = 1),
    (e[11] = 0),
    (e[12] = 0),
    (e[13] = 0),
    (e[14] = 0),
    (e[15] = 1),
    e
  )
}
function ey(e, a) {
  let t = a[0],
    o = a[1],
    r = a[2],
    n = a[3],
    s = a[4],
    l = a[5],
    f = a[6],
    c = a[7],
    u = a[8],
    d = a[9],
    i = a[10],
    p = a[11],
    g = a[12],
    F = a[13],
    S = a[14],
    m = a[15],
    A = t * l - o * s,
    x = t * f - r * s,
    h = t * c - n * s,
    C = o * f - r * l,
    v = o * c - n * l,
    w = r * c - n * f,
    y = u * F - d * g,
    O = u * S - i * g,
    M = u * m - p * g,
    P = d * S - i * F,
    k = d * m - p * F,
    B = i * m - p * S,
    R = A * B - x * k + h * P + C * M - v * O + w * y
  return R
    ? ((R = 1 / R),
      (e[0] = (l * B - f * k + c * P) * R),
      (e[1] = (r * k - o * B - n * P) * R),
      (e[2] = (F * w - S * v + m * C) * R),
      (e[3] = (i * v - d * w - p * C) * R),
      (e[4] = (f * M - s * B - c * O) * R),
      (e[5] = (t * B - r * M + n * O) * R),
      (e[6] = (S * h - g * w - m * x) * R),
      (e[7] = (u * w - i * h + p * x) * R),
      (e[8] = (s * k - l * M + c * y) * R),
      (e[9] = (o * M - t * k - n * y) * R),
      (e[10] = (g * v - F * h + m * A) * R),
      (e[11] = (d * h - u * v - p * A) * R),
      (e[12] = (l * O - s * P - f * y) * R),
      (e[13] = (t * P - o * O + r * y) * R),
      (e[14] = (F * x - g * C - S * A) * R),
      (e[15] = (u * C - d * x + i * A) * R),
      e)
    : null
}
function qm(e) {
  let a = e[0],
    t = e[1],
    o = e[2],
    r = e[3],
    n = e[4],
    s = e[5],
    l = e[6],
    f = e[7],
    c = e[8],
    u = e[9],
    d = e[10],
    i = e[11],
    p = e[12],
    g = e[13],
    F = e[14],
    S = e[15],
    m = a * s - t * n,
    A = a * l - o * n,
    x = a * f - r * n,
    h = t * l - o * s,
    C = t * f - r * s,
    v = o * f - r * l,
    w = c * g - u * p,
    y = c * F - d * p,
    O = c * S - i * p,
    M = u * F - d * g,
    P = u * S - i * g,
    k = d * S - i * F
  return m * k - A * P + x * M + h * O - C * y + v * w
}
function jm(e, a, t) {
  let o = a[0],
    r = a[1],
    n = a[2],
    s = a[3],
    l = a[4],
    f = a[5],
    c = a[6],
    u = a[7],
    d = a[8],
    i = a[9],
    p = a[10],
    g = a[11],
    F = a[12],
    S = a[13],
    m = a[14],
    A = a[15],
    x = t[0],
    h = t[1],
    C = t[2],
    v = t[3]
  return (
    (e[0] = x * o + h * l + C * d + v * F),
    (e[1] = x * r + h * f + C * i + v * S),
    (e[2] = x * n + h * c + C * p + v * m),
    (e[3] = x * s + h * u + C * g + v * A),
    (x = t[4]),
    (h = t[5]),
    (C = t[6]),
    (v = t[7]),
    (e[4] = x * o + h * l + C * d + v * F),
    (e[5] = x * r + h * f + C * i + v * S),
    (e[6] = x * n + h * c + C * p + v * m),
    (e[7] = x * s + h * u + C * g + v * A),
    (x = t[8]),
    (h = t[9]),
    (C = t[10]),
    (v = t[11]),
    (e[8] = x * o + h * l + C * d + v * F),
    (e[9] = x * r + h * f + C * i + v * S),
    (e[10] = x * n + h * c + C * p + v * m),
    (e[11] = x * s + h * u + C * g + v * A),
    (x = t[12]),
    (h = t[13]),
    (C = t[14]),
    (v = t[15]),
    (e[12] = x * o + h * l + C * d + v * F),
    (e[13] = x * r + h * f + C * i + v * S),
    (e[14] = x * n + h * c + C * p + v * m),
    (e[15] = x * s + h * u + C * g + v * A),
    e
  )
}
function ay(e, a, t) {
  let o = t[0],
    r = t[1],
    n = t[2],
    s,
    l,
    f,
    c,
    u,
    d,
    i,
    p,
    g,
    F,
    S,
    m
  return (
    a === e
      ? ((e[12] = a[0] * o + a[4] * r + a[8] * n + a[12]),
        (e[13] = a[1] * o + a[5] * r + a[9] * n + a[13]),
        (e[14] = a[2] * o + a[6] * r + a[10] * n + a[14]),
        (e[15] = a[3] * o + a[7] * r + a[11] * n + a[15]))
      : ((s = a[0]),
        (l = a[1]),
        (f = a[2]),
        (c = a[3]),
        (u = a[4]),
        (d = a[5]),
        (i = a[6]),
        (p = a[7]),
        (g = a[8]),
        (F = a[9]),
        (S = a[10]),
        (m = a[11]),
        (e[0] = s),
        (e[1] = l),
        (e[2] = f),
        (e[3] = c),
        (e[4] = u),
        (e[5] = d),
        (e[6] = i),
        (e[7] = p),
        (e[8] = g),
        (e[9] = F),
        (e[10] = S),
        (e[11] = m),
        (e[12] = s * o + u * r + g * n + a[12]),
        (e[13] = l * o + d * r + F * n + a[13]),
        (e[14] = f * o + i * r + S * n + a[14]),
        (e[15] = c * o + p * r + m * n + a[15])),
    e
  )
}
function ty(e, a, t) {
  let o = t[0],
    r = t[1],
    n = t[2]
  return (
    (e[0] = a[0] * o),
    (e[1] = a[1] * o),
    (e[2] = a[2] * o),
    (e[3] = a[3] * o),
    (e[4] = a[4] * r),
    (e[5] = a[5] * r),
    (e[6] = a[6] * r),
    (e[7] = a[7] * r),
    (e[8] = a[8] * n),
    (e[9] = a[9] * n),
    (e[10] = a[10] * n),
    (e[11] = a[11] * n),
    (e[12] = a[12]),
    (e[13] = a[13]),
    (e[14] = a[14]),
    (e[15] = a[15]),
    e
  )
}
function oy(e, a, t, o) {
  let r = o[0],
    n = o[1],
    s = o[2],
    l = Math.hypot(r, n, s),
    f,
    c,
    u,
    d,
    i,
    p,
    g,
    F,
    S,
    m,
    A,
    x,
    h,
    C,
    v,
    w,
    y,
    O,
    M,
    P,
    k,
    B,
    R,
    fe
  return Math.abs(l) < NB
    ? null
    : ((l = 1 / l),
      (r *= l),
      (n *= l),
      (s *= l),
      (f = Math.sin(t)),
      (c = Math.cos(t)),
      (u = 1 - c),
      (d = a[0]),
      (i = a[1]),
      (p = a[2]),
      (g = a[3]),
      (F = a[4]),
      (S = a[5]),
      (m = a[6]),
      (A = a[7]),
      (x = a[8]),
      (h = a[9]),
      (C = a[10]),
      (v = a[11]),
      (w = r * r * u + c),
      (y = n * r * u + s * f),
      (O = s * r * u - n * f),
      (M = r * n * u - s * f),
      (P = n * n * u + c),
      (k = s * n * u + r * f),
      (B = r * s * u + n * f),
      (R = n * s * u - r * f),
      (fe = s * s * u + c),
      (e[0] = d * w + F * y + x * O),
      (e[1] = i * w + S * y + h * O),
      (e[2] = p * w + m * y + C * O),
      (e[3] = g * w + A * y + v * O),
      (e[4] = d * M + F * P + x * k),
      (e[5] = i * M + S * P + h * k),
      (e[6] = p * M + m * P + C * k),
      (e[7] = g * M + A * P + v * k),
      (e[8] = d * B + F * R + x * fe),
      (e[9] = i * B + S * R + h * fe),
      (e[10] = p * B + m * R + C * fe),
      (e[11] = g * B + A * R + v * fe),
      a !== e &&
        ((e[12] = a[12]), (e[13] = a[13]), (e[14] = a[14]), (e[15] = a[15])),
      e)
}
function ry(e, a) {
  return ((e[0] = a[12]), (e[1] = a[13]), (e[2] = a[14]), e)
}
function Wm(e, a) {
  let t = a[0],
    o = a[1],
    r = a[2],
    n = a[4],
    s = a[5],
    l = a[6],
    f = a[8],
    c = a[9],
    u = a[10]
  return (
    (e[0] = Math.hypot(t, o, r)),
    (e[1] = Math.hypot(n, s, l)),
    (e[2] = Math.hypot(f, c, u)),
    e
  )
}
function ny(e) {
  let a = e[0],
    t = e[1],
    o = e[2],
    r = e[4],
    n = e[5],
    s = e[6],
    l = e[8],
    f = e[9],
    c = e[10],
    u = a * a + t * t + o * o,
    d = r * r + n * n + s * s,
    i = l * l + f * f + c * c
  return Math.sqrt(Math.max(u, d, i))
}
var Qm = (function () {
  let e = [1, 1, 1]
  return function (a, t) {
    let o = e
    Wm(o, t)
    let r = 1 / o[0],
      n = 1 / o[1],
      s = 1 / o[2],
      l = t[0] * r,
      f = t[1] * n,
      c = t[2] * s,
      u = t[4] * r,
      d = t[5] * n,
      i = t[6] * s,
      p = t[8] * r,
      g = t[9] * n,
      F = t[10] * s,
      S = l + d + F,
      m = 0
    return (
      S > 0
        ? ((m = Math.sqrt(S + 1) * 2),
          (a[3] = 0.25 * m),
          (a[0] = (i - g) / m),
          (a[1] = (p - c) / m),
          (a[2] = (f - u) / m))
        : l > d && l > F
          ? ((m = Math.sqrt(1 + l - d - F) * 2),
            (a[3] = (i - g) / m),
            (a[0] = 0.25 * m),
            (a[1] = (f + u) / m),
            (a[2] = (p + c) / m))
          : d > F
            ? ((m = Math.sqrt(1 + d - l - F) * 2),
              (a[3] = (p - c) / m),
              (a[0] = (f + u) / m),
              (a[1] = 0.25 * m),
              (a[2] = (i + g) / m))
            : ((m = Math.sqrt(1 + F - l - d) * 2),
              (a[3] = (f - u) / m),
              (a[0] = (p + c) / m),
              (a[1] = (i + g) / m),
              (a[2] = 0.25 * m)),
      a
    )
  }
})()
function sy(e, a, t, o) {
  let r = on([e[0], e[1], e[2]]),
    n = on([e[4], e[5], e[6]]),
    s = on([e[8], e[9], e[10]])
  ;(qm(e) < 0 && (r = -r), (t[0] = e[12]), (t[1] = e[13]), (t[2] = e[14]))
  let f = e.slice(),
    c = 1 / r,
    u = 1 / n,
    d = 1 / s
  ;((f[0] *= c),
    (f[1] *= c),
    (f[2] *= c),
    (f[4] *= u),
    (f[5] *= u),
    (f[6] *= u),
    (f[8] *= d),
    (f[9] *= d),
    (f[10] *= d),
    Qm(a, f),
    (o[0] = r),
    (o[1] = n),
    (o[2] = s))
}
function ly(e, a, t, o) {
  let r = e,
    n = a[0],
    s = a[1],
    l = a[2],
    f = a[3],
    c = n + n,
    u = s + s,
    d = l + l,
    i = n * c,
    p = n * u,
    g = n * d,
    F = s * u,
    S = s * d,
    m = l * d,
    A = f * c,
    x = f * u,
    h = f * d,
    C = o[0],
    v = o[1],
    w = o[2]
  return (
    (r[0] = (1 - (F + m)) * C),
    (r[1] = (p + h) * C),
    (r[2] = (g - x) * C),
    (r[3] = 0),
    (r[4] = (p - h) * v),
    (r[5] = (1 - (i + m)) * v),
    (r[6] = (S + A) * v),
    (r[7] = 0),
    (r[8] = (g + x) * w),
    (r[9] = (S - A) * w),
    (r[10] = (1 - (i + F)) * w),
    (r[11] = 0),
    (r[12] = t[0]),
    (r[13] = t[1]),
    (r[14] = t[2]),
    (r[15] = 1),
    r
  )
}
function fy(e, a) {
  let t = a[0],
    o = a[1],
    r = a[2],
    n = a[3],
    s = t + t,
    l = o + o,
    f = r + r,
    c = t * s,
    u = o * s,
    d = o * l,
    i = r * s,
    p = r * l,
    g = r * f,
    F = n * s,
    S = n * l,
    m = n * f
  return (
    (e[0] = 1 - d - g),
    (e[1] = u + m),
    (e[2] = i - S),
    (e[3] = 0),
    (e[4] = u - m),
    (e[5] = 1 - c - g),
    (e[6] = p + F),
    (e[7] = 0),
    (e[8] = i + S),
    (e[9] = p - F),
    (e[10] = 1 - c - d),
    (e[11] = 0),
    (e[12] = 0),
    (e[13] = 0),
    (e[14] = 0),
    (e[15] = 1),
    e
  )
}
function cy(e, a, t, o, r) {
  let n = 1 / Math.tan(a / 2),
    s = 1 / (o - r)
  return (
    (e[0] = n / t),
    (e[1] = 0),
    (e[2] = 0),
    (e[3] = 0),
    (e[4] = 0),
    (e[5] = n),
    (e[6] = 0),
    (e[7] = 0),
    (e[8] = 0),
    (e[9] = 0),
    (e[10] = (r + o) * s),
    (e[11] = -1),
    (e[12] = 0),
    (e[13] = 0),
    (e[14] = 2 * r * o * s),
    (e[15] = 0),
    e
  )
}
function uy(e, a, t, o, r, n, s) {
  let l = 1 / (a - t),
    f = 1 / (o - r),
    c = 1 / (n - s)
  return (
    (e[0] = -2 * l),
    (e[1] = 0),
    (e[2] = 0),
    (e[3] = 0),
    (e[4] = 0),
    (e[5] = -2 * f),
    (e[6] = 0),
    (e[7] = 0),
    (e[8] = 0),
    (e[9] = 0),
    (e[10] = 2 * c),
    (e[11] = 0),
    (e[12] = (a + t) * l),
    (e[13] = (r + o) * f),
    (e[14] = (s + n) * c),
    (e[15] = 1),
    e
  )
}
function iy(e, a, t, o) {
  let r = a[0],
    n = a[1],
    s = a[2],
    l = o[0],
    f = o[1],
    c = o[2],
    u = r - t[0],
    d = n - t[1],
    i = s - t[2],
    p = u * u + d * d + i * i
  p === 0 ? (i = 1) : ((p = 1 / Math.sqrt(p)), (u *= p), (d *= p), (i *= p))
  let g = f * i - c * d,
    F = c * u - l * i,
    S = l * d - f * u
  return (
    (p = g * g + F * F + S * S),
    p === 0 &&
      (c ? (l += 1e-6) : f ? (c += 1e-6) : (f += 1e-6),
      (g = f * i - c * d),
      (F = c * u - l * i),
      (S = l * d - f * u),
      (p = g * g + F * F + S * S)),
    (p = 1 / Math.sqrt(p)),
    (g *= p),
    (F *= p),
    (S *= p),
    (e[0] = g),
    (e[1] = F),
    (e[2] = S),
    (e[3] = 0),
    (e[4] = d * S - i * F),
    (e[5] = i * g - u * S),
    (e[6] = u * F - d * g),
    (e[7] = 0),
    (e[8] = u),
    (e[9] = d),
    (e[10] = i),
    (e[11] = 0),
    (e[12] = r),
    (e[13] = n),
    (e[14] = s),
    (e[15] = 1),
    e
  )
}
function Vm(e, a, t) {
  return (
    (e[0] = a[0] + t[0]),
    (e[1] = a[1] + t[1]),
    (e[2] = a[2] + t[2]),
    (e[3] = a[3] + t[3]),
    (e[4] = a[4] + t[4]),
    (e[5] = a[5] + t[5]),
    (e[6] = a[6] + t[6]),
    (e[7] = a[7] + t[7]),
    (e[8] = a[8] + t[8]),
    (e[9] = a[9] + t[9]),
    (e[10] = a[10] + t[10]),
    (e[11] = a[11] + t[11]),
    (e[12] = a[12] + t[12]),
    (e[13] = a[13] + t[13]),
    (e[14] = a[14] + t[14]),
    (e[15] = a[15] + t[15]),
    e
  )
}
function Jm(e, a, t) {
  return (
    (e[0] = a[0] - t[0]),
    (e[1] = a[1] - t[1]),
    (e[2] = a[2] - t[2]),
    (e[3] = a[3] - t[3]),
    (e[4] = a[4] - t[4]),
    (e[5] = a[5] - t[5]),
    (e[6] = a[6] - t[6]),
    (e[7] = a[7] - t[7]),
    (e[8] = a[8] - t[8]),
    (e[9] = a[9] - t[9]),
    (e[10] = a[10] - t[10]),
    (e[11] = a[11] - t[11]),
    (e[12] = a[12] - t[12]),
    (e[13] = a[13] - t[13]),
    (e[14] = a[14] - t[14]),
    (e[15] = a[15] - t[15]),
    e
  )
}
function dy(e, a, t) {
  return (
    (e[0] = a[0] * t),
    (e[1] = a[1] * t),
    (e[2] = a[2] * t),
    (e[3] = a[3] * t),
    (e[4] = a[4] * t),
    (e[5] = a[5] * t),
    (e[6] = a[6] * t),
    (e[7] = a[7] * t),
    (e[8] = a[8] * t),
    (e[9] = a[9] * t),
    (e[10] = a[10] * t),
    (e[11] = a[11] * t),
    (e[12] = a[12] * t),
    (e[13] = a[13] * t),
    (e[14] = a[14] * t),
    (e[15] = a[15] * t),
    e
  )
}
var _a = class extends Array {
  constructor(
    a = 1,
    t = 0,
    o = 0,
    r = 0,
    n = 0,
    s = 1,
    l = 0,
    f = 0,
    c = 0,
    u = 0,
    d = 1,
    i = 0,
    p = 0,
    g = 0,
    F = 0,
    S = 1
  ) {
    return (super(a, t, o, r, n, s, l, f, c, u, d, i, p, g, F, S), this)
  }
  get x() {
    return this[12]
  }
  get y() {
    return this[13]
  }
  get z() {
    return this[14]
  }
  get w() {
    return this[15]
  }
  set x(a) {
    this[12] = a
  }
  set y(a) {
    this[13] = a
  }
  set z(a) {
    this[14] = a
  }
  set w(a) {
    this[15] = a
  }
  set(a, t, o, r, n, s, l, f, c, u, d, i, p, g, F, S) {
    return a.length
      ? this.copy(a)
      : (_b(this, a, t, o, r, n, s, l, f, c, u, d, i, p, g, F, S), this)
  }
  translate(a, t = this) {
    return (ay(this, t, a), this)
  }
  rotate(a, t, o = this) {
    return (oy(this, o, a, t), this)
  }
  scale(a, t = this) {
    return (ty(this, t, typeof a == 'number' ? [a, a, a] : a), this)
  }
  add(a, t) {
    return (t ? Vm(this, a, t) : Vm(this, this, a), this)
  }
  sub(a, t) {
    return (t ? Jm(this, a, t) : Jm(this, this, a), this)
  }
  multiply(a, t) {
    return (
      a.length ? (t ? jm(this, a, t) : jm(this, this, a)) : dy(this, this, a),
      this
    )
  }
  identity() {
    return ($b(this), this)
  }
  copy(a) {
    return (Kb(this, a), this)
  }
  fromPerspective({ fov: a, aspect: t, near: o, far: r } = {}) {
    return (cy(this, a, t, o, r), this)
  }
  fromOrthogonal({ left: a, right: t, bottom: o, top: r, near: n, far: s }) {
    return (uy(this, a, t, o, r, n, s), this)
  }
  fromQuaternion(a) {
    return (fy(this, a), this)
  }
  setPosition(a) {
    return ((this.x = a[0]), (this.y = a[1]), (this.z = a[2]), this)
  }
  inverse(a = this) {
    return (ey(this, a), this)
  }
  compose(a, t, o) {
    return (ly(this, a, t, o), this)
  }
  decompose(a, t, o) {
    return (sy(this, a, t, o), this)
  }
  getRotation(a) {
    return (Qm(a, this), this)
  }
  getTranslation(a) {
    return (ry(a, this), this)
  }
  getScaling(a) {
    return (Wm(a, this), this)
  }
  getMaxScaleOnAxis() {
    return ny(this)
  }
  lookAt(a, t, o) {
    return (iy(this, a, t, o), this)
  }
  determinant() {
    return qm(this)
  }
  fromArray(a, t = 0) {
    return (
      (this[0] = a[t]),
      (this[1] = a[t + 1]),
      (this[2] = a[t + 2]),
      (this[3] = a[t + 3]),
      (this[4] = a[t + 4]),
      (this[5] = a[t + 5]),
      (this[6] = a[t + 6]),
      (this[7] = a[t + 7]),
      (this[8] = a[t + 8]),
      (this[9] = a[t + 9]),
      (this[10] = a[t + 10]),
      (this[11] = a[t + 11]),
      (this[12] = a[t + 12]),
      (this[13] = a[t + 13]),
      (this[14] = a[t + 14]),
      (this[15] = a[t + 15]),
      this
    )
  }
  toArray(a = [], t = 0) {
    return (
      (a[t] = this[0]),
      (a[t + 1] = this[1]),
      (a[t + 2] = this[2]),
      (a[t + 3] = this[3]),
      (a[t + 4] = this[4]),
      (a[t + 5] = this[5]),
      (a[t + 6] = this[6]),
      (a[t + 7] = this[7]),
      (a[t + 8] = this[8]),
      (a[t + 9] = this[9]),
      (a[t + 10] = this[10]),
      (a[t + 11] = this[11]),
      (a[t + 12] = this[12]),
      (a[t + 13] = this[13]),
      (a[t + 14] = this[14]),
      (a[t + 15] = this[15]),
      a
    )
  }
}
function py(e, a, t = 'YXZ') {
  return (
    t === 'XYZ'
      ? ((e[1] = Math.asin(Math.min(Math.max(a[8], -1), 1))),
        Math.abs(a[8]) < 0.99999
          ? ((e[0] = Math.atan2(-a[9], a[10])),
            (e[2] = Math.atan2(-a[4], a[0])))
          : ((e[0] = Math.atan2(a[6], a[5])), (e[2] = 0)))
      : t === 'YXZ'
        ? ((e[0] = Math.asin(-Math.min(Math.max(a[9], -1), 1))),
          Math.abs(a[9]) < 0.99999
            ? ((e[1] = Math.atan2(a[8], a[10])),
              (e[2] = Math.atan2(a[1], a[5])))
            : ((e[1] = Math.atan2(-a[2], a[0])), (e[2] = 0)))
        : t === 'ZXY'
          ? ((e[0] = Math.asin(Math.min(Math.max(a[6], -1), 1))),
            Math.abs(a[6]) < 0.99999
              ? ((e[1] = Math.atan2(-a[2], a[10])),
                (e[2] = Math.atan2(-a[4], a[5])))
              : ((e[1] = 0), (e[2] = Math.atan2(a[1], a[0]))))
          : t === 'ZYX'
            ? ((e[1] = Math.asin(-Math.min(Math.max(a[2], -1), 1))),
              Math.abs(a[2]) < 0.99999
                ? ((e[0] = Math.atan2(a[6], a[10])),
                  (e[2] = Math.atan2(a[1], a[0])))
                : ((e[0] = 0), (e[2] = Math.atan2(-a[4], a[5]))))
            : t === 'YZX'
              ? ((e[2] = Math.asin(Math.min(Math.max(a[1], -1), 1))),
                Math.abs(a[1]) < 0.99999
                  ? ((e[0] = Math.atan2(-a[9], a[5])),
                    (e[1] = Math.atan2(-a[2], a[0])))
                  : ((e[0] = 0), (e[1] = Math.atan2(a[8], a[10]))))
              : t === 'XZY' &&
                ((e[2] = Math.asin(-Math.min(Math.max(a[4], -1), 1))),
                Math.abs(a[4]) < 0.99999
                  ? ((e[0] = Math.atan2(a[6], a[5])),
                    (e[1] = Math.atan2(a[8], a[0])))
                  : ((e[0] = Math.atan2(-a[9], a[10])), (e[1] = 0))),
    e
  )
}
var Iy = new _a()
var ti = class extends Array {
  constructor(a = 0, t = a, o = a, r = 'YXZ') {
    ;(super(a, t, o),
      (this.order = r),
      (this.onChange = () => {}),
      (this._target = this))
    let n = ['0', '1', '2']
    return new Proxy(this, {
      set(s, l) {
        let f = Reflect.set(...arguments)
        return (f && n.includes(l) && s.onChange(), f)
      },
    })
  }
  get x() {
    return this[0]
  }
  get y() {
    return this[1]
  }
  get z() {
    return this[2]
  }
  set x(a) {
    ;((this._target[0] = a), this.onChange())
  }
  set y(a) {
    ;((this._target[1] = a), this.onChange())
  }
  set z(a) {
    ;((this._target[2] = a), this.onChange())
  }
  set(a, t = a, o = a) {
    return a.length
      ? this.copy(a)
      : ((this._target[0] = a),
        (this._target[1] = t),
        (this._target[2] = o),
        this.onChange(),
        this)
  }
  copy(a) {
    return (
      (this._target[0] = a[0]),
      (this._target[1] = a[1]),
      (this._target[2] = a[2]),
      this.onChange(),
      this
    )
  }
  reorder(a) {
    return ((this._target.order = a), this.onChange(), this)
  }
  fromRotationMatrix(a, t = this.order) {
    return (py(this._target, a, t), this.onChange(), this)
  }
  fromQuaternion(a, t = this.order, o) {
    return (
      Iy.fromQuaternion(a),
      this._target.fromRotationMatrix(Iy, t),
      o || this.onChange(),
      this
    )
  }
  fromArray(a, t = 0) {
    return (
      (this._target[0] = a[t]),
      (this._target[1] = a[t + 1]),
      (this._target[2] = a[t + 2]),
      this
    )
  }
  toArray(a = [], t = 0) {
    return ((a[t] = this[0]), (a[t + 1] = this[1]), (a[t + 2] = this[2]), a)
  }
}
var Do = class {
  constructor() {
    ;((this.parent = null),
      (this.children = []),
      (this.visible = !0),
      (this.matrix = new _a()),
      (this.worldMatrix = new _a()),
      (this.matrixAutoUpdate = !0),
      (this.worldMatrixNeedsUpdate = !1),
      (this.position = new He()),
      (this.quaternion = new ai()),
      (this.scale = new He(1)),
      (this.rotation = new ti()),
      (this.up = new He(0, 1, 0)),
      (this.rotation._target.onChange = () =>
        this.quaternion.fromEuler(this.rotation, !0)),
      (this.quaternion._target.onChange = () =>
        this.rotation.fromQuaternion(this.quaternion, void 0, !0)))
  }
  setParent(a, t = !0) {
    ;(this.parent && a !== this.parent && this.parent.removeChild(this, !1),
      (this.parent = a),
      t && a && a.addChild(this, !1))
  }
  addChild(a, t = !0) {
    ;(~this.children.indexOf(a) || this.children.push(a),
      t && a.setParent(this, !1))
  }
  removeChild(a, t = !0) {
    ;(~this.children.indexOf(a) &&
      this.children.splice(this.children.indexOf(a), 1),
      t && a.setParent(null, !1))
  }
  updateMatrixWorld(a) {
    ;(this.matrixAutoUpdate && this.updateMatrix(),
      (this.worldMatrixNeedsUpdate || a) &&
        (this.parent === null
          ? this.worldMatrix.copy(this.matrix)
          : this.worldMatrix.multiply(this.parent.worldMatrix, this.matrix),
        (this.worldMatrixNeedsUpdate = !1),
        (a = !0)))
    for (let t = 0, o = this.children.length; t < o; t++)
      this.children[t].updateMatrixWorld(a)
  }
  updateMatrix() {
    ;(this.matrix.compose(this.quaternion, this.position, this.scale),
      (this.worldMatrixNeedsUpdate = !0))
  }
  traverse(a) {
    if (!a(this))
      for (let t = 0, o = this.children.length; t < o; t++)
        this.children[t].traverse(a)
  }
  decompose() {
    ;(this.matrix.decompose(this.quaternion._target, this.position, this.scale),
      this.rotation.fromQuaternion(this.quaternion))
  }
  lookAt(a, t = !1) {
    ;(t
      ? this.matrix.lookAt(this.position, a, this.up)
      : this.matrix.lookAt(a, this.position, this.up),
      this.matrix.getRotation(this.quaternion._target),
      this.rotation.fromQuaternion(this.quaternion))
  }
}
var zB = new _a()
var qB = new He()
var jB = new He()
var nf = class extends Do {
  constructor(
    a,
    {
      near: t = 0.1,
      far: o = 100,
      fov: r = 45,
      aspect: n = 1,
      left: s,
      right: l,
      bottom: f,
      top: c,
      zoom: u = 1,
    } = {}
  ) {
    ;(super(),
      Object.assign(this, {
        near: t,
        far: o,
        fov: r,
        aspect: n,
        left: s,
        right: l,
        bottom: f,
        top: c,
        zoom: u,
      }),
      (this.projectionMatrix = new _a()),
      (this.viewMatrix = new _a()),
      (this.projectionViewMatrix = new _a()),
      (this.worldPosition = new He()),
      (this.type = s || l ? 'orthographic' : 'perspective'),
      this.type === 'orthographic' ? this.orthographic() : this.perspective())
  }
  perspective({
    near: a = this.near,
    far: t = this.far,
    fov: o = this.fov,
    aspect: r = this.aspect,
  } = {}) {
    return (
      Object.assign(this, {
        near: a,
        far: t,
        fov: o,
        aspect: r,
      }),
      this.projectionMatrix.fromPerspective({
        fov: o * (Math.PI / 180),
        aspect: r,
        near: a,
        far: t,
      }),
      (this.type = 'perspective'),
      this
    )
  }
  orthographic({
    near: a = this.near,
    far: t = this.far,
    left: o = this.left || -1,
    right: r = this.right || 1,
    bottom: n = this.bottom || -1,
    top: s = this.top || 1,
    zoom: l = this.zoom,
  } = {}) {
    return (
      Object.assign(this, {
        near: a,
        far: t,
        left: o,
        right: r,
        bottom: n,
        top: s,
        zoom: l,
      }),
      (o /= l),
      (r /= l),
      (n /= l),
      (s /= l),
      this.projectionMatrix.fromOrthogonal({
        left: o,
        right: r,
        bottom: n,
        top: s,
        near: a,
        far: t,
      }),
      (this.type = 'orthographic'),
      this
    )
  }
  updateMatrixWorld() {
    return (
      super.updateMatrixWorld(),
      this.viewMatrix.inverse(this.worldMatrix),
      this.worldMatrix.getTranslation(this.worldPosition),
      this.projectionViewMatrix.multiply(
        this.projectionMatrix,
        this.viewMatrix
      ),
      this
    )
  }
  updateProjectionMatrix() {
    return this.type === 'perspective'
      ? this.perspective()
      : this.orthographic()
  }
  lookAt(a) {
    return (super.lookAt(a, !0), this)
  }
  project(a) {
    return (
      a.applyMatrix4(this.viewMatrix),
      a.applyMatrix4(this.projectionMatrix),
      this
    )
  }
  unproject(a) {
    return (
      a.applyMatrix4(zB.inverse(this.projectionMatrix)),
      a.applyMatrix4(this.worldMatrix),
      this
    )
  }
  updateFrustum() {
    this.frustum ||
      (this.frustum = [
        new He(),
        new He(),
        new He(),
        new He(),
        new He(),
        new He(),
      ])
    let a = this.projectionViewMatrix
    ;((this.frustum[0].set(a[3] - a[0], a[7] - a[4], a[11] - a[8]).constant =
      a[15] - a[12]),
      (this.frustum[1].set(a[3] + a[0], a[7] + a[4], a[11] + a[8]).constant =
        a[15] + a[12]),
      (this.frustum[2].set(a[3] + a[1], a[7] + a[5], a[11] + a[9]).constant =
        a[15] + a[13]),
      (this.frustum[3].set(a[3] - a[1], a[7] - a[5], a[11] - a[9]).constant =
        a[15] - a[13]),
      (this.frustum[4].set(a[3] - a[2], a[7] - a[6], a[11] - a[10]).constant =
        a[15] - a[14]),
      (this.frustum[5].set(a[3] + a[2], a[7] + a[6], a[11] + a[10]).constant =
        a[15] + a[14]))
    for (let t = 0; t < 6; t++) {
      let o = 1 / this.frustum[t].distance()
      ;(this.frustum[t].multiply(o), (this.frustum[t].constant *= o))
    }
  }
  frustumIntersectsMesh(a, t = a.worldMatrix) {
    if (
      !a.geometry.attributes.position ||
      ((!a.geometry.bounds || a.geometry.bounds.radius === 1 / 0) &&
        a.geometry.computeBoundingSphere(),
      !a.geometry.bounds)
    )
      return !0
    let o = qB
    ;(o.copy(a.geometry.bounds.center), o.applyMatrix4(t))
    let r = a.geometry.bounds.radius * t.getMaxScaleOnAxis()
    return this.frustumIntersectsSphere(o, r)
  }
  frustumIntersectsSphere(a, t) {
    let o = jB
    for (let r = 0; r < 6; r++) {
      let n = this.frustum[r]
      if (o.copy(n).dot(a) + n.constant < -t) return !1
    }
    return !0
  }
}
function my(e, a) {
  return (
    (e[0] = a[0]),
    (e[1] = a[1]),
    (e[2] = a[2]),
    (e[3] = a[4]),
    (e[4] = a[5]),
    (e[5] = a[6]),
    (e[6] = a[8]),
    (e[7] = a[9]),
    (e[8] = a[10]),
    e
  )
}
function Ay(e, a) {
  let t = a[0],
    o = a[1],
    r = a[2],
    n = a[3],
    s = t + t,
    l = o + o,
    f = r + r,
    c = t * s,
    u = o * s,
    d = o * l,
    i = r * s,
    p = r * l,
    g = r * f,
    F = n * s,
    S = n * l,
    m = n * f
  return (
    (e[0] = 1 - d - g),
    (e[3] = u - m),
    (e[6] = i + S),
    (e[1] = u + m),
    (e[4] = 1 - c - g),
    (e[7] = p - F),
    (e[2] = i - S),
    (e[5] = p + F),
    (e[8] = 1 - c - d),
    e
  )
}
function gy(e, a) {
  return (
    (e[0] = a[0]),
    (e[1] = a[1]),
    (e[2] = a[2]),
    (e[3] = a[3]),
    (e[4] = a[4]),
    (e[5] = a[5]),
    (e[6] = a[6]),
    (e[7] = a[7]),
    (e[8] = a[8]),
    e
  )
}
function xy(e, a, t, o, r, n, s, l, f, c) {
  return (
    (e[0] = a),
    (e[1] = t),
    (e[2] = o),
    (e[3] = r),
    (e[4] = n),
    (e[5] = s),
    (e[6] = l),
    (e[7] = f),
    (e[8] = c),
    e
  )
}
function hy(e) {
  return (
    (e[0] = 1),
    (e[1] = 0),
    (e[2] = 0),
    (e[3] = 0),
    (e[4] = 1),
    (e[5] = 0),
    (e[6] = 0),
    (e[7] = 0),
    (e[8] = 1),
    e
  )
}
function Fy(e, a) {
  let t = a[0],
    o = a[1],
    r = a[2],
    n = a[3],
    s = a[4],
    l = a[5],
    f = a[6],
    c = a[7],
    u = a[8],
    d = u * s - l * c,
    i = -u * n + l * f,
    p = c * n - s * f,
    g = t * d + o * i + r * p
  return g
    ? ((g = 1 / g),
      (e[0] = d * g),
      (e[1] = (-u * o + r * c) * g),
      (e[2] = (l * o - r * s) * g),
      (e[3] = i * g),
      (e[4] = (u * t - r * f) * g),
      (e[5] = (-l * t + r * n) * g),
      (e[6] = p * g),
      (e[7] = (-c * t + o * f) * g),
      (e[8] = (s * t - o * n) * g),
      e)
    : null
}
function Gm(e, a, t) {
  let o = a[0],
    r = a[1],
    n = a[2],
    s = a[3],
    l = a[4],
    f = a[5],
    c = a[6],
    u = a[7],
    d = a[8],
    i = t[0],
    p = t[1],
    g = t[2],
    F = t[3],
    S = t[4],
    m = t[5],
    A = t[6],
    x = t[7],
    h = t[8]
  return (
    (e[0] = i * o + p * s + g * c),
    (e[1] = i * r + p * l + g * u),
    (e[2] = i * n + p * f + g * d),
    (e[3] = F * o + S * s + m * c),
    (e[4] = F * r + S * l + m * u),
    (e[5] = F * n + S * f + m * d),
    (e[6] = A * o + x * s + h * c),
    (e[7] = A * r + x * l + h * u),
    (e[8] = A * n + x * f + h * d),
    e
  )
}
function Sy(e, a, t) {
  let o = a[0],
    r = a[1],
    n = a[2],
    s = a[3],
    l = a[4],
    f = a[5],
    c = a[6],
    u = a[7],
    d = a[8],
    i = t[0],
    p = t[1]
  return (
    (e[0] = o),
    (e[1] = r),
    (e[2] = n),
    (e[3] = s),
    (e[4] = l),
    (e[5] = f),
    (e[6] = i * o + p * s + c),
    (e[7] = i * r + p * l + u),
    (e[8] = i * n + p * f + d),
    e
  )
}
function Cy(e, a, t) {
  let o = a[0],
    r = a[1],
    n = a[2],
    s = a[3],
    l = a[4],
    f = a[5],
    c = a[6],
    u = a[7],
    d = a[8],
    i = Math.sin(t),
    p = Math.cos(t)
  return (
    (e[0] = p * o + i * s),
    (e[1] = p * r + i * l),
    (e[2] = p * n + i * f),
    (e[3] = p * s - i * o),
    (e[4] = p * l - i * r),
    (e[5] = p * f - i * n),
    (e[6] = c),
    (e[7] = u),
    (e[8] = d),
    e
  )
}
function by(e, a, t) {
  let o = t[0],
    r = t[1]
  return (
    (e[0] = o * a[0]),
    (e[1] = o * a[1]),
    (e[2] = o * a[2]),
    (e[3] = r * a[3]),
    (e[4] = r * a[4]),
    (e[5] = r * a[5]),
    (e[6] = a[6]),
    (e[7] = a[7]),
    (e[8] = a[8]),
    e
  )
}
function yy(e, a) {
  let t = a[0],
    o = a[1],
    r = a[2],
    n = a[3],
    s = a[4],
    l = a[5],
    f = a[6],
    c = a[7],
    u = a[8],
    d = a[9],
    i = a[10],
    p = a[11],
    g = a[12],
    F = a[13],
    S = a[14],
    m = a[15],
    A = t * l - o * s,
    x = t * f - r * s,
    h = t * c - n * s,
    C = o * f - r * l,
    v = o * c - n * l,
    w = r * c - n * f,
    y = u * F - d * g,
    O = u * S - i * g,
    M = u * m - p * g,
    P = d * S - i * F,
    k = d * m - p * F,
    B = i * m - p * S,
    R = A * B - x * k + h * P + C * M - v * O + w * y
  return R
    ? ((R = 1 / R),
      (e[0] = (l * B - f * k + c * P) * R),
      (e[1] = (f * M - s * B - c * O) * R),
      (e[2] = (s * k - l * M + c * y) * R),
      (e[3] = (r * k - o * B - n * P) * R),
      (e[4] = (t * B - r * M + n * O) * R),
      (e[5] = (o * M - t * k - n * y) * R),
      (e[6] = (F * w - S * v + m * C) * R),
      (e[7] = (S * h - g * w - m * x) * R),
      (e[8] = (g * v - F * h + m * A) * R),
      e)
    : null
}
var oi = class extends Array {
  constructor(a = 1, t = 0, o = 0, r = 0, n = 1, s = 0, l = 0, f = 0, c = 1) {
    return (super(a, t, o, r, n, s, l, f, c), this)
  }
  set(a, t, o, r, n, s, l, f, c) {
    return a.length ? this.copy(a) : (xy(this, a, t, o, r, n, s, l, f, c), this)
  }
  translate(a, t = this) {
    return (Sy(this, t, a), this)
  }
  rotate(a, t = this) {
    return (Cy(this, t, a), this)
  }
  scale(a, t = this) {
    return (by(this, t, a), this)
  }
  multiply(a, t) {
    return (t ? Gm(this, a, t) : Gm(this, this, a), this)
  }
  identity() {
    return (hy(this), this)
  }
  copy(a) {
    return (gy(this, a), this)
  }
  fromMatrix4(a) {
    return (my(this, a), this)
  }
  fromQuaternion(a) {
    return (Ay(this, a), this)
  }
  fromBasis(a, t, o) {
    return (
      this.set(a[0], a[1], a[2], t[0], t[1], t[2], o[0], o[1], o[2]), this
    )
  }
  inverse(a = this) {
    return (Fy(this, a), this)
  }
  getNormalMatrix(a) {
    return (yy(this, a), this)
  }
}
var QB = 0
var Ss = class extends Do {
  constructor(
    a,
    {
      geometry: t,
      program: o,
      mode: r = a.TRIANGLES,
      frustumCulled: n = !0,
      renderOrder: s = 0,
    } = {}
  ) {
    ;(super(),
      a.canvas || console.error('gl not passed as first argument to Mesh'),
      (this.gl = a),
      (this.id = QB++),
      (this.geometry = t),
      (this.program = o),
      (this.mode = r),
      (this.frustumCulled = n),
      (this.renderOrder = s),
      (this.modelViewMatrix = new _a()),
      (this.normalMatrix = new oi()),
      (this.beforeRenderCallbacks = []),
      (this.afterRenderCallbacks = []))
  }
  onBeforeRender(a) {
    return (this.beforeRenderCallbacks.push(a), this)
  }
  onAfterRender(a) {
    return (this.afterRenderCallbacks.push(a), this)
  }
  draw({ camera: a } = {}) {
    ;(a &&
      (this.program.uniforms.modelMatrix ||
        Object.assign(this.program.uniforms, {
          modelMatrix: {
            value: null,
          },
          viewMatrix: {
            value: null,
          },
          modelViewMatrix: {
            value: null,
          },
          normalMatrix: {
            value: null,
          },
          projectionMatrix: {
            value: null,
          },
          cameraPosition: {
            value: null,
          },
        }),
      (this.program.uniforms.projectionMatrix.value = a.projectionMatrix),
      (this.program.uniforms.cameraPosition.value = a.worldPosition),
      (this.program.uniforms.viewMatrix.value = a.viewMatrix),
      this.modelViewMatrix.multiply(a.viewMatrix, this.worldMatrix),
      this.normalMatrix.getNormalMatrix(this.modelViewMatrix),
      (this.program.uniforms.modelMatrix.value = this.worldMatrix),
      (this.program.uniforms.modelViewMatrix.value = this.modelViewMatrix),
      (this.program.uniforms.normalMatrix.value = this.normalMatrix)),
      this.beforeRenderCallbacks.forEach(
        (o) =>
          o &&
          o({
            mesh: this,
            camera: a,
          })
      ))
    let t = this.program.cullFace && this.worldMatrix.determinant() < 0
    ;(this.program.use({
      flipFaces: t,
    }),
      this.geometry.draw({
        mode: this.mode,
        program: this.program,
      }),
      this.afterRenderCallbacks.forEach(
        (o) =>
          o &&
          o({
            mesh: this,
            camera: a,
          })
      ))
  }
}
var vy = new Uint8Array(4)
function wy(e) {
  return (e & (e - 1)) === 0
}
var VB = 1
var Cs = class {
  constructor(
    a,
    {
      image: t,
      target: o = a.TEXTURE_2D,
      type: r = a.UNSIGNED_BYTE,
      format: n = a.RGBA,
      internalFormat: s = n,
      wrapS: l = a.CLAMP_TO_EDGE,
      wrapT: f = a.CLAMP_TO_EDGE,
      wrapR: c = a.CLAMP_TO_EDGE,
      generateMipmaps: u = o === (a.TEXTURE_2D || a.TEXTURE_CUBE_MAP),
      minFilter: d = u ? a.NEAREST_MIPMAP_LINEAR : a.LINEAR,
      magFilter: i = a.LINEAR,
      premultiplyAlpha: p = !1,
      unpackAlignment: g = 4,
      flipY: F = o == (a.TEXTURE_2D || a.TEXTURE_3D),
      anisotropy: S = 0,
      level: m = 0,
      width: A,
      height: x = A,
      length: h = 1,
    } = {}
  ) {
    ;((this.gl = a),
      (this.id = VB++),
      (this.image = t),
      (this.target = o),
      (this.type = r),
      (this.format = n),
      (this.internalFormat = s),
      (this.minFilter = d),
      (this.magFilter = i),
      (this.wrapS = l),
      (this.wrapT = f),
      (this.wrapR = c),
      (this.generateMipmaps = u),
      (this.premultiplyAlpha = p),
      (this.unpackAlignment = g),
      (this.flipY = F),
      (this.anisotropy = Math.min(
        S,
        this.gl.renderer.parameters.maxAnisotropy
      )),
      (this.level = m),
      (this.width = A),
      (this.height = x),
      (this.length = h),
      (this.texture = this.gl.createTexture()),
      (this.store = {
        image: null,
      }),
      (this.glState = this.gl.renderer.state),
      (this.state = {}),
      (this.state.minFilter = this.gl.NEAREST_MIPMAP_LINEAR),
      (this.state.magFilter = this.gl.LINEAR),
      (this.state.wrapS = this.gl.REPEAT),
      (this.state.wrapT = this.gl.REPEAT),
      (this.state.anisotropy = 0))
  }
  bind() {
    this.glState.textureUnits[this.glState.activeTextureUnit] !== this.id &&
      (this.gl.bindTexture(this.target, this.texture),
      (this.glState.textureUnits[this.glState.activeTextureUnit] = this.id))
  }
  update(a = 0) {
    let t = !(this.image === this.store.image && !this.needsUpdate)
    if (
      ((t || this.glState.textureUnits[a] !== this.id) &&
        (this.gl.renderer.activeTexture(a), this.bind()),
      !!t)
    ) {
      if (
        ((this.needsUpdate = !1),
        this.flipY !== this.glState.flipY &&
          (this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, this.flipY),
          (this.glState.flipY = this.flipY)),
        this.premultiplyAlpha !== this.glState.premultiplyAlpha &&
          (this.gl.pixelStorei(
            this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
            this.premultiplyAlpha
          ),
          (this.glState.premultiplyAlpha = this.premultiplyAlpha)),
        this.unpackAlignment !== this.glState.unpackAlignment &&
          (this.gl.pixelStorei(this.gl.UNPACK_ALIGNMENT, this.unpackAlignment),
          (this.glState.unpackAlignment = this.unpackAlignment)),
        this.minFilter !== this.state.minFilter &&
          (this.gl.texParameteri(
            this.target,
            this.gl.TEXTURE_MIN_FILTER,
            this.minFilter
          ),
          (this.state.minFilter = this.minFilter)),
        this.magFilter !== this.state.magFilter &&
          (this.gl.texParameteri(
            this.target,
            this.gl.TEXTURE_MAG_FILTER,
            this.magFilter
          ),
          (this.state.magFilter = this.magFilter)),
        this.wrapS !== this.state.wrapS &&
          (this.gl.texParameteri(
            this.target,
            this.gl.TEXTURE_WRAP_S,
            this.wrapS
          ),
          (this.state.wrapS = this.wrapS)),
        this.wrapT !== this.state.wrapT &&
          (this.gl.texParameteri(
            this.target,
            this.gl.TEXTURE_WRAP_T,
            this.wrapT
          ),
          (this.state.wrapT = this.wrapT)),
        this.wrapR !== this.state.wrapR &&
          (this.gl.texParameteri(
            this.target,
            this.gl.TEXTURE_WRAP_R,
            this.wrapR
          ),
          (this.state.wrapR = this.wrapR)),
        this.anisotropy &&
          this.anisotropy !== this.state.anisotropy &&
          (this.gl.texParameterf(
            this.target,
            this.gl.renderer.getExtension('EXT_texture_filter_anisotropic')
              .TEXTURE_MAX_ANISOTROPY_EXT,
            this.anisotropy
          ),
          (this.state.anisotropy = this.anisotropy)),
        this.image)
      ) {
        if (
          (this.image.width &&
            ((this.width = this.image.width),
            (this.height = this.image.height)),
          this.target === this.gl.TEXTURE_CUBE_MAP)
        )
          for (let o = 0; o < 6; o++)
            this.gl.texImage2D(
              this.gl.TEXTURE_CUBE_MAP_POSITIVE_X + o,
              this.level,
              this.internalFormat,
              this.format,
              this.type,
              this.image[o]
            )
        else if (ArrayBuffer.isView(this.image))
          this.target === this.gl.TEXTURE_2D
            ? this.gl.texImage2D(
                this.target,
                this.level,
                this.internalFormat,
                this.width,
                this.height,
                0,
                this.format,
                this.type,
                this.image
              )
            : (this.target === this.gl.TEXTURE_2D_ARRAY ||
                this.target === this.gl.TEXTURE_3D) &&
              this.gl.texImage3D(
                this.target,
                this.level,
                this.internalFormat,
                this.width,
                this.height,
                this.length,
                0,
                this.format,
                this.type,
                this.image
              )
        else if (this.image.isCompressedTexture)
          for (let o = 0; o < this.image.length; o++)
            this.gl.compressedTexImage2D(
              this.target,
              o,
              this.internalFormat,
              this.image[o].width,
              this.image[o].height,
              0,
              this.image[o].data
            )
        else
          this.target === this.gl.TEXTURE_2D
            ? this.gl.texImage2D(
                this.target,
                this.level,
                this.internalFormat,
                this.format,
                this.type,
                this.image
              )
            : this.gl.texImage3D(
                this.target,
                this.level,
                this.internalFormat,
                this.width,
                this.height,
                this.length,
                0,
                this.format,
                this.type,
                this.image
              )
        ;(this.generateMipmaps &&
          (!this.gl.renderer.isWebgl2 &&
          (!wy(this.image.width) || !wy(this.image.height))
            ? ((this.generateMipmaps = !1),
              (this.wrapS = this.wrapT = this.gl.CLAMP_TO_EDGE),
              (this.minFilter = this.gl.LINEAR))
            : this.gl.generateMipmap(this.target)),
          this.onUpdate && this.onUpdate())
      } else if (this.target === this.gl.TEXTURE_CUBE_MAP)
        for (let o = 0; o < 6; o++)
          this.gl.texImage2D(
            this.gl.TEXTURE_CUBE_MAP_POSITIVE_X + o,
            0,
            this.gl.RGBA,
            1,
            1,
            0,
            this.gl.RGBA,
            this.gl.UNSIGNED_BYTE,
            vy
          )
      else
        this.width
          ? this.target === this.gl.TEXTURE_2D
            ? this.gl.texImage2D(
                this.target,
                this.level,
                this.internalFormat,
                this.width,
                this.height,
                0,
                this.format,
                this.type,
                null
              )
            : this.gl.texImage3D(
                this.target,
                this.level,
                this.internalFormat,
                this.width,
                this.height,
                this.length,
                0,
                this.format,
                this.type,
                null
              )
          : this.gl.texImage2D(
              this.target,
              0,
              this.gl.RGBA,
              1,
              1,
              0,
              this.gl.RGBA,
              this.gl.UNSIGNED_BYTE,
              vy
            )
      this.store.image = this.image
    }
  }
}
var bs = class e extends ei {
  constructor(
    a,
    {
      width: t = 1,
      height: o = 1,
      widthSegments: r = 1,
      heightSegments: n = 1,
      attributes: s = {},
    } = {}
  ) {
    let l = r,
      f = n,
      c = (l + 1) * (f + 1),
      u = l * f * 6,
      d = new Float32Array(c * 3),
      i = new Float32Array(c * 3),
      p = new Float32Array(c * 2),
      g = u > 65536 ? new Uint32Array(u) : new Uint16Array(u)
    ;(e.buildPlane(d, i, p, g, t, o, 0, l, f),
      Object.assign(s, {
        position: {
          size: 3,
          data: d,
        },
        normal: {
          size: 3,
          data: i,
        },
        uv: {
          size: 2,
          data: p,
        },
        index: {
          data: g,
        },
      }),
      super(a, s))
  }
  static buildPlane(
    a,
    t,
    o,
    r,
    n,
    s,
    l,
    f,
    c,
    u = 0,
    d = 1,
    i = 2,
    p = 1,
    g = -1,
    F = 0,
    S = 0
  ) {
    let m = F,
      A = n / f,
      x = s / c
    for (let h = 0; h <= c; h++) {
      let C = h * x - s / 2
      for (let v = 0; v <= f; v++, F++) {
        let w = v * A - n / 2
        if (
          ((a[F * 3 + u] = w * p),
          (a[F * 3 + d] = C * g),
          (a[F * 3 + i] = l / 2),
          (t[F * 3 + u] = 0),
          (t[F * 3 + d] = 0),
          (t[F * 3 + i] = l >= 0 ? 1 : -1),
          (o[F * 2] = v / f),
          (o[F * 2 + 1] = 1 - h / c),
          h === c || v === f)
        )
          continue
        let y = m + v + h * (f + 1),
          O = m + v + (h + 1) * (f + 1),
          M = m + v + (h + 1) * (f + 1) + 1,
          P = m + v + h * (f + 1) + 1
        ;((r[S * 6] = y),
          (r[S * 6 + 1] = O),
          (r[S * 6 + 2] = P),
          (r[S * 6 + 3] = O),
          (r[S * 6 + 4] = M),
          (r[S * 6 + 5] = P),
          S++)
      }
    }
  }
}
function YB(e) {
  let a = Object.getPrototypeOf(e)
  Object.getOwnPropertyNames(a).forEach((t) => {
    t !== 'constructor' && typeof e[t] == 'function' && (e[t] = e[t].bind(e))
  })
}
function tR(e) {
  let a = e.match(/(\d+)px/)
  return a ? parseInt(a[1], 10) : 30
}
function oR(e, a, t = 'bold 30px monospace', o = 'black') {
  let r = document.createElement('canvas'),
    n = r.getContext('2d')
  n.font = t
  let s = n.measureText(a),
    l = Math.ceil(s.width),
    f = Math.ceil(tR(t) * 1.2)
  const width = l + 20
  const height = f + 20
  const scale = Math.min(
    2,
    Math.min(4096, e.getParameter(e.MAX_TEXTURE_SIZE)) / Math.max(width, height)
  )
  ;((r.width = Math.ceil(width * scale)),
    (r.height = Math.ceil(height * scale)),
    n.scale(scale, scale),
    (n.font = t),
    (n.fillStyle = o),
    (n.textBaseline = 'middle'),
    (n.textAlign = 'center'),
    n.clearRect(0, 0, r.width, r.height),
    n.fillText(a, width / 2, height / 2))
  let c = new Cs(e, {
    generateMipmaps: true,
    minFilter: e.LINEAR_MIPMAP_LINEAR,
    magFilter: e.LINEAR,
    anisotropy: 4,
    premultiplyAlpha: true,
  })
  return (
    (c.image = r),
    {
      texture: c,
      width,
      height,
    }
  )
}
var Ym = class {
  constructor({
    gl: a,
    plane: t,
    renderer: o,
    text: r,
    textColor: n = '#545050',
    font: s = '30px sans-serif',
  }) {
    ;(YB(this),
      (this.gl = a),
      (this.plane = t),
      (this.renderer = o),
      (this.text = r),
      (this.textColor = n),
      (this.font = s),
      this.createMesh())
  }
  createMesh() {
    let {
        texture: a,
        width: t,
        height: o,
      } = oR(this.gl, this.text, this.font, this.textColor),
      r = new bs(this.gl),
      n = new Fs(this.gl, {
        vertex: `
        attribute vec3 position;
        attribute vec2 uv;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
        fragment: `
        precision highp float;
        uniform sampler2D tMap;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(tMap, vUv);
          gl_FragColor = color;
        }
      `,
        uniforms: {
          tMap: {
            value: a,
          },
        },
        transparent: !0,
      })
    this.mesh = new Ss(this.gl, {
      geometry: r,
      program: n,
    })
    let s = t / o,
      l = this.plane.scale.y * 0.15,
      f = l * s
    ;(this.mesh.scale.set(f, l, 1),
      (this.mesh.position.y = -this.plane.scale.y * 0.5 - l * 0.5 - 0.05),
      this.mesh.setParent(this.plane))
  }
}
var Zm = class {
  constructor({
    geometry: a,
    gl: t,
    image: o,
    index: r,
    length: n,
    renderer: s,
    scene: l,
    screen: f,
    text: c,
    viewport: u,
    bend: d,
    depth: i = 0,
    cardScale: p = 1,
    textColor: g,
    borderRadius: F = 0,
    font: S,
  }) {
    ;((this.extra = 0),
      (this.geometry = a),
      (this.gl = t),
      (this.image = o),
      (this.index = r),
      (this.length = n),
      (this.renderer = s),
      (this.scene = l),
      (this.screen = f),
      (this.text = c),
      (this.viewport = u),
      (this.bend = d),
      (this.depth = i),
      (this.cardScale = p),
      (this.textColor = g),
      (this.borderRadius = F),
      (this.font = S),
      this.createShader(),
      this.createMesh(),
      this.createTitle(),
      this.onResize())
  }
  createShader() {
    const modern = this.gl.renderer.isWebgl2
    const derivatives =
      modern ||
      Boolean(this.gl.renderer.getExtension('OES_standard_derivatives'))
    let fragmentHeader = ''
    if (modern) {
      fragmentHeader = '#version 300 es'
    } else if (derivatives) {
      fragmentHeader = '#extension GL_OES_standard_derivatives : enable'
    }
    let a = new Cs(this.gl, {
      generateMipmaps: !0,
      minFilter: this.gl.LINEAR_MIPMAP_LINEAR,
      magFilter: this.gl.LINEAR,
      anisotropy: 8,
      premultiplyAlpha: true,
    })
    this.program = new Fs(this.gl, {
      depthTest: !1,
      depthWrite: !1,
      vertex: `${modern ? '#version 300 es' : ''}
        precision highp float;
        ${modern ? 'in' : 'attribute'} vec3 position;
        ${modern ? 'in' : 'attribute'} vec2 uv;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        uniform float uTime;
        uniform float uSpeed;
        uniform float uAmplitude;
        ${modern ? 'out' : 'varying'} vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          p.z = (sin(p.x * 4.0 + uTime) * 1.5 + cos(p.y * 2.0 + uTime) * 1.5) * (uAmplitude + min(abs(uSpeed), 0.16) * 0.08);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragment: `${fragmentHeader}
        precision highp float;
        uniform vec2 uImageSizes;
        uniform vec2 uPlaneSizes;
        uniform sampler2D tMap;
        uniform float uBorderRadius;
        ${modern ? 'in' : 'varying'} vec2 vUv;
        ${modern ? 'out vec4 galleryColor;' : ''}
        
        float roundedBoxSDF(vec2 p, vec2 b, float r) {
          vec2 d = abs(p) - b;
          return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0) - r;
        }
        
        void main() {
          vec2 ratio = vec2(
            min((uPlaneSizes.x / uPlaneSizes.y) / (uImageSizes.x / uImageSizes.y), 1.0),
            min((uPlaneSizes.y / uPlaneSizes.x) / (uImageSizes.y / uImageSizes.x), 1.0)
          );
          vec2 uv = vec2(
            vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
            vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
          );
          vec4 color = ${modern ? 'texture' : 'texture2D'}(tMap, uv);
          
          float d = roundedBoxSDF(vUv - 0.5, vec2(0.5 - uBorderRadius), uBorderRadius);
          
          // One render-pixel coverage stays stable as the curved card moves.
          float edgeSmooth = ${derivatives ? 'max(fwidth(d), 0.00001)' : '0.002'};
          float alpha = 1.0 - smoothstep(-edgeSmooth, edgeSmooth, d);
          
          ${modern ? 'galleryColor' : 'gl_FragColor'} = vec4(color.rgb * alpha, color.a * alpha);
        }
      `,
      uniforms: {
        tMap: {
          value: a,
        },
        uPlaneSizes: {
          value: [0, 0],
        },
        uImageSizes: {
          value: [0, 0],
        },
        uSpeed: {
          value: 0,
        },
        uAmplitude: {
          value: 0.13,
        },
        uTime: {
          value: 100 * Math.random(),
        },
        uBorderRadius: {
          value: this.borderRadius,
        },
      },
      transparent: !0,
    })
    let t = new Image()
    ;((t.crossOrigin = 'anonymous'),
      (t.src = this.image),
      (t.onload = () => {
        ;((a.image = t),
          (this.program.uniforms.uImageSizes.value = [
            t.naturalWidth,
            t.naturalHeight,
          ]))
      }))
  }
  createMesh() {
    ;((this.plane = new Ss(this.gl, {
      geometry: this.geometry,
      program: this.program,
    })),
      this.plane.setParent(this.scene))
  }
  createTitle() {
    this.text &&
      (this.title = new Ym({
        gl: this.gl,
        plane: this.plane,
        renderer: this.renderer,
        text: this.text,
        textColor: this.textColor,
        font: this.font,
      }))
  }
  update(a, t) {
    this.plane.position.x = this.x - a.current - this.extra
    let o = this.plane.position.x,
      r = this.viewport.width / 2,
      n = Math.min(Math.abs(o) / r, 1)
    if (
      ((this.plane.position.z = -n * this.depth),
      (this.plane.rotation.y = -Math.sign(o) * n * this.depth * 0.28),
      this.bend === 0)
    )
      ((this.plane.position.y = 0), (this.plane.rotation.z = 0))
    else {
      let f = Math.abs(this.bend),
        c = (r * r + f * f) / (2 * f),
        u = Math.min(Math.abs(o), r),
        d = c - Math.sqrt(c * c - u * u)
      this.bend > 0
        ? ((this.plane.position.y = -d),
          (this.plane.rotation.z = -Math.sign(o) * Math.asin(u / c)))
        : ((this.plane.position.y = d),
          (this.plane.rotation.z = Math.sign(o) * Math.asin(u / c)))
    }
    ;((this.speed = a.current - a.last),
      (this.program.uniforms.uTime.value += 0.04),
      (this.program.uniforms.uSpeed.value = this.speed))
    let s = this.plane.scale.x / 2,
      l = this.viewport.width / 2
    ;((this.isBefore = this.plane.position.x + s < -l),
      (this.isAfter = this.plane.position.x - s > l),
      t === 'right' &&
        this.isBefore &&
        ((this.extra -= this.widthTotal), (this.isBefore = this.isAfter = !1)),
      t === 'left' &&
        this.isAfter &&
        ((this.extra += this.widthTotal), (this.isBefore = this.isAfter = !1)))
  }
  onResize({ screen: a, viewport: t } = {}) {
    ;(a && (this.screen = a),
      t &&
        ((this.viewport = t),
        this.plane.program.uniforms.uViewportSizes &&
          (this.plane.program.uniforms.uViewportSizes.value = [
            this.viewport.width,
            this.viewport.height,
          ])),
      (this.scale = this.screen.height / 1500),
      (this.plane.scale.y =
        ((this.viewport.height * (900 * this.scale)) / this.screen.height) *
        this.cardScale),
      (this.plane.scale.x =
        ((this.viewport.width * (700 * this.scale)) / this.screen.width) *
        this.cardScale),
      (this.plane.program.uniforms.uPlaneSizes.value = [
        this.plane.scale.x,
        this.plane.scale.y,
      ]),
      (this.padding = 2),
      (this.width = this.plane.scale.x + this.padding),
      (this.widthTotal = this.width * this.length),
      (this.x = this.width * this.index))
  }
}

// Keep the original skyjjgw renderer, geometry, projection, arc and wave shader.
// The host owns input, autoplay, links and data; this adapter only renders frames.
export class PortalGalleryRenderer {
  constructor(container, items, onReady, onError) {
    this.container = container
    this.items = items
    this.motionSpeed = 1.65
    this.renderer = new rf({
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      dpr: 2,
    })
    this.gl = this.renderer.gl
    if (!this.gl) throw new Error('WebGL unavailable')
    this.gl.clearColor(0, 0, 0, 0)
    container.prepend(this.gl.canvas)
    this.gl.canvas.setAttribute('aria-hidden', 'true')
    this.gl.canvas.className = 'hn-gallery-webgl'
    this.camera = new nf(this.gl)
    this.camera.fov = 45
    this.camera.position.z = 20
    this.scene = new Do()
    this.geometry = new bs(this.gl, { heightSegments: 50, widthSegments: 100 })
    this.resize()
    this.medias = items.map(
      (item, index) =>
        new Zm({
          geometry: this.geometry,
          gl: this.gl,
          image: item.image,
          index,
          length: items.length,
          renderer: this.renderer,
          scene: this.scene,
          screen: this.screen,
          text: '',
          viewport: this.viewport,
          bend: 2.35,
          depth: 1.1,
          cardScale: 1.07,
          borderRadius: 0.04,
        })
    )
    let loaded = 0
    this.medias.forEach((media, index) => {
      // Use the original shader, supplying the existing 3:4 uploaded poster.
      const texture = media.program.uniforms.tMap.value
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => {
        if (this.destroyed) return
        texture.image = image
        media.program.uniforms.uImageSizes.value = [
          image.naturalWidth,
          image.naturalHeight,
        ]
        if (++loaded === items.length) onReady()
      }
      image.onerror = () => {
        if (!this.destroyed) onError()
      }
      image.src = items[index].image
      media.loadedImage = image
    })
    this.gl.canvas.addEventListener(
      'webglcontextlost',
      (this.lost = (event) => {
        event.preventDefault()
        onError()
      })
    )
    this.resize()
    this.setTheme()
  }
  setMotion({ amplitude, speed }) {
    if (this.destroyed) return
    if (Number.isFinite(speed)) {
      this.motionSpeed = Math.max(0.1, Math.min(3, speed))
    }
    if (Number.isFinite(amplitude)) {
      this.medias?.forEach((media) => {
        media.program.uniforms.uAmplitude.value = Math.max(
          0,
          Math.min(0.2, amplitude)
        )
      })
    }
  }
  setTheme() {
    if (this.destroyed || !this.medias) return
    const dark = document.documentElement.classList.contains('dark')
    if (this.theme === dark) return
    this.theme = dark
    this.medias.forEach((media, index) => {
      const size = [...media.plane.scale]
      media.plane.scale.set(1, 1, 1)
      if (media.title) media.title.mesh.setParent(null)
      if (media.author) media.author.mesh.setParent(null)
      media.title = new Ym({
        gl: this.gl,
        plane: media.plane,
        renderer: this.renderer,
        text: this.items[index].title,
        textColor: dark ? '#c7d7e9' : '#294768',
        font: '24px sans-serif',
      })
      media.title.mesh.scale.multiply(0.75)
      media.title.mesh.position.y = -0.59
      media.title.mesh.scale.x = Math.min(media.title.mesh.scale.x, 1.15)
      media.author = new Ym({
        gl: this.gl,
        plane: media.plane,
        renderer: this.renderer,
        text: this.items[index].author,
        textColor: dark ? '#94acc7' : '#7f95af',
        font: '20px sans-serif',
      })
      media.author.mesh.scale.multiply(0.42)
      media.author.mesh.position.y = -0.68
      media.plane.scale.set(...size)
    })
  }
  resize() {
    if (this.destroyed) return
    this.screen = {
      width: this.container.clientWidth,
      height: this.container.clientHeight,
    }
    if (!this.screen.width || !this.screen.height) return
    // Supersample even on standard-density screens, bounded for wide displays.
    this.renderer.dpr = Math.max(
      1,
      Math.min(
        2,
        Math.sqrt(4_500_000 / (this.screen.width * this.screen.height))
      )
    )
    this.renderer.setSize(this.screen.width, this.screen.height)
    this.camera.perspective({ aspect: this.screen.width / this.screen.height })
    const height =
      2 * Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.position.z
    this.viewport = { width: height * this.camera.aspect, height }
    this.medias?.forEach((media) => {
      media.onResize({ screen: this.screen, viewport: this.viewport })
      // Original reference is 700:900; keep creator uploads at their native 3:4.
      media.plane.scale.x = media.plane.scale.y * 0.75
      media.program.uniforms.uPlaneSizes.value = [
        media.plane.scale.x,
        media.plane.scale.y,
      ]
      media.width = media.plane.scale.x + media.padding
    })
  }
  frame(position, moving, motion) {
    if (this.destroyed || !this.medias?.length || !this.screen.width) return
    const now = performance.now()
    const elapsed = this.frameTime
      ? Math.min((now - this.frameTime) / 1000, 0.05)
      : 0
    this.frameTime = now
    const width = this.medias[0].width
    const current = position * width
    const scroll = { current, last: this.last ?? current }
    const links = this.container.querySelectorAll('.hn-gallery-item')
    this.medias.forEach((media, index) => {
      let offset =
        (((index - position) % this.medias.length) + this.medias.length) %
        this.medias.length
      if (offset > this.medias.length / 2) offset -= this.medias.length
      media.x = current + offset * width
      media.extra = 0
      const time = media.program.uniforms.uTime.value
      media.update(scroll, 'none')
      // Keep the original curve shader, with a small, slow, frame-rate-independent breath.
      media.program.uniforms.uTime.value =
        time + (motion ? elapsed * this.motionSpeed : 0)
      if (!moving) media.program.uniforms.uSpeed.value = 0
      media.plane.visible = Math.abs(offset) < 4
    })
    this.renderer.render({ scene: this.scene, camera: this.camera })
    this.medias.forEach((media, index) => {
      const link = links[index]
      if (!link) return
      const points = [
        [-0.5, 0.5],
        [0.5, 0.5],
        [0.5, -0.5],
        [-0.5, -0.5],
      ].map(([x, y]) => {
        const point = new He(x, y, 0)
          .applyMatrix4(media.plane.worldMatrix)
          .applyMatrix4(this.camera.viewMatrix)
          .applyMatrix4(this.camera.projectionMatrix)
        return [
          ((point.x + 1) * this.screen.width) / 2,
          ((1 - point.y) * this.screen.height) / 2,
        ]
      })
      const left = Math.min(...points.map((p) => p[0])),
        top = Math.min(...points.map((p) => p[1]))
      const w = Math.max(...points.map((p) => p[0])) - left,
        h = Math.max(...points.map((p) => p[1])) - top
      link.style.setProperty('--hn-webgl-left', left + 'px')
      link.style.setProperty('--hn-webgl-top', top + 'px')
      link.style.setProperty('--hn-webgl-width', w + 'px')
      link.style.setProperty('--hn-webgl-height', h + 'px')
      link.style.setProperty(
        '--hn-webgl-clip',
        'polygon(' +
          points
            .map(
              (p) =>
                ((p[0] - left) / w) * 100 +
                '% ' +
                ((p[1] - top) / h) * 100 +
                '%'
            )
            .join(',') +
          ')'
      )
    })
    this.last = current
  }
  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.medias?.forEach((media) => {
      media.loadedImage.onload = media.loadedImage.onerror = null
    })
    this.gl.canvas.removeEventListener('webglcontextlost', this.lost)
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
    this.gl.canvas.remove()
  }
}
