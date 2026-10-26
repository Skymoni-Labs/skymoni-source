import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { labelTexture, metalTexture, solarTexture } from "./procedural";
import type { ModuleId } from "./modules";

export function createISS() {
  const root = new T.Group();
  root.name = "International Space Station";
  const modules = new Map<ModuleId, T.Group>();
  const hinges: T.Group[] = [];
  const metal = new T.MeshStandardMaterial({
    color: 0xcbd0d7,
    metalness: 0.65,
    roughness: 0.46,
    map: metalTexture(),
  });
  const ivory = new T.MeshStandardMaterial({ color: 0xe1dfd3, metalness: 0.32, roughness: 0.65 });
  const dark = new T.MeshStandardMaterial({ color: 0x243344, metalness: 0.75, roughness: 0.35 });
  const gold = new T.MeshStandardMaterial({ color: 0xa58c5c, metalness: 0.7, roughness: 0.48 });
  const glass = new T.MeshPhysicalMaterial({
    color: 0x123855,
    metalness: 0.25,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  const solar = new T.MeshStandardMaterial({
    map: solarTexture(),
    metalness: 0.5,
    roughness: 0.4,
    side: T.DoubleSide,
  });
  const rosa = new T.MeshStandardMaterial({
    map: solarTexture(true),
    metalness: 0.45,
    roughness: 0.36,
    side: T.DoubleSide,
  });
  const radiatorMap = labelTexture(
    "||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||",
    "#a1abb0",
  );
  const radiatorMat = new T.MeshStandardMaterial({
    color: 0xd8dce0,
    map: radiatorMap,
    metalness: 0.25,
    roughness: 0.75,
    side: T.DoubleSide,
  });
  function group(id: ModuleId) {
    const g = new T.Group();
    g.name = id;
    g.userData.moduleId = id;
    modules.set(id, g);
    root.add(g);
    return g;
  }
  function mesh(
    parent: T.Object3D,
    geometry: T.BufferGeometry,
    material: T.Material,
    x = 0,
    y = 0,
    z = 0,
  ) {
    const m = new T.Mesh(geometry, material);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  function box(
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    mat = metal,
  ) {
    return mesh(parent, new T.BoxGeometry(sx, sy, sz), mat, x, y, z);
  }
  function rod(parent: T.Object3D, a: T.Vector3, b: T.Vector3, r = 0.1, mat = metal) {
    const d = b.clone().sub(a);
    const m = mesh(parent, new T.CylinderGeometry(r, r, d.length(), 8), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    return m;
  }
  function ring(parent: T.Object3D, radius: number, tube: number, z: number, mat = dark) {
    return mesh(parent, new T.TorusGeometry(radius, tube, 8, 40), mat, 0, 0, z);
  }
  function label(parent: T.Object3D, text: string, x: number, y: number, z: number, width = 2) {
    const m = mesh(
      parent,
      new T.PlaneGeometry(width, width / 4),
      new T.MeshBasicMaterial({ map: labelTexture(text), side: T.DoubleSide }),
      x,
      y,
      z,
    );
    return m;
  }
  function hatch(parent: T.Object3D, z: number, radius: number) {
    const h = mesh(
      parent,
      new T.CylinderGeometry(radius * 0.78, radius * 0.78, 0.13, 24),
      ivory,
      0,
      0,
      z,
    );
    h.rotation.x = Math.PI / 2;
    ring(parent, radius * 0.84, 0.12, z, dark);
    box(parent, 0, 0, z + 0.12, radius * 0.7, 0.06, 0.06, dark);
    box(parent, 0, 0, z + 0.14, 0.06, radius * 0.7, 0.06, dark);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      mesh(
        parent,
        new T.SphereGeometry(0.055, 6, 4),
        dark,
        Math.cos(a) * radius * 0.9,
        Math.sin(a) * radius * 0.9,
        z + 0.15,
      );
    }
  }
  function laboratory(
    parent: T.Object3D,
    name: string,
    length: number,
    radius: number,
    agency: string,
    mat = metal,
  ) {
    const g = new T.Group();
    g.name = name;
    parent.add(g);
    const body = mesh(g, new T.CylinderGeometry(radius, radius, length - 0.8, 40), mat);
    body.rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) {
      const cone = mesh(
        g,
        new T.CylinderGeometry(radius * 0.63, radius, 0.65, 40),
        ivory,
        0,
        0,
        s * (length / 2 - 0.3),
      );
      cone.rotation.x = (s * Math.PI) / 2;
      ring(g, radius * 0.98, 0.075, s * (length / 2 - 0.75), dark);
      hatch(g, (s * length) / 2, radius * 0.63);
    }
    for (let z = -length * 0.35; z <= length * 0.4; z += 1.2)
      ring(g, radius + 0.015, 0.028, z, ivory);
    for (const angle of [-0.7, 0.7, 2.44, 3.84]) {
      const x = Math.sin(angle) * (radius + 0.12),
        y = Math.cos(angle) * (radius + 0.12);
      rod(g, new T.Vector3(x, y, -length * 0.38), new T.Vector3(x, y, length * 0.38), 0.035, gold);
    }
    for (let z = -length * 0.25; z < length * 0.3; z += 1.4) {
      const window = mesh(g, new T.CircleGeometry(0.26, 20), glass, 0, radius + 0.025, z);
      window.rotation.x = -Math.PI / 2;
      const rim = mesh(g, new T.TorusGeometry(0.29, 0.04, 6, 20), dark, 0, radius + 0.04, z);
      rim.rotation.x = -Math.PI / 2;
    }
    const badge = label(g, agency, 0, radius + 0.08, 0.4, Math.min(2.6, length * 0.5));
    badge.rotation.x = -Math.PI / 2;
    const serial = label(g, name.toUpperCase(), radius + 0.06, 0.2, 0, Math.min(2.4, length * 0.5));
    serial.rotation.y = Math.PI / 2;
    serial.rotation.z = Math.PI / 2;
    return g;
  }
  // Z runs along the pressurised-module chain. X is the transverse truss axis;
  // Y points away from Earth. Dimensions below are metres, not display pixels.
  const truss = group("truss");
  const bars: T.BufferGeometry[] = [];
  function beam(a: T.Vector3, b: T.Vector3, r = 0.11) {
    const direction = b.clone().sub(a);
    const geo = new T.CylinderGeometry(r, r, direction.length(), 6);
    geo.applyQuaternion(
      new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize()),
    );
    geo.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    bars.push(geo);
  }
  const y = 3;
  for (let x = -47; x < 47; x += 3.13) {
    const end = Math.min(x + 3.13, 47);
    for (const dy of [-1.35, 1.35])
      for (const z of [-1.35, 1.35])
        beam(new T.Vector3(x, y + dy, z), new T.Vector3(end, y + dy, z));
    for (const sign of [-1, 1]) {
      beam(new T.Vector3(x, y - 1.35, sign * 1.35), new T.Vector3(end, y + 1.35, sign * 1.35));
      beam(new T.Vector3(x, y + sign * 1.35, -1.35), new T.Vector3(end, y + sign * 1.35, 1.35));
      beam(new T.Vector3(x, y - 1.35, sign * 1.35), new T.Vector3(x, y + 1.35, sign * 1.35));
    }
  }
  mesh(truss, mergeGeometries(bars), metal);
  bars.forEach((g) => g.dispose());
  for (const x of [-39, -24, -9, 9, 24, 39]) {
    box(truss, x, 4.5, 0, 3, 0.8, 2, ivory);
    box(truss, x, 2.4, 1.8, 2, 0.5, 1.3, gold);
  }
  rod(truss, new T.Vector3(-1, 1.6, 1), new T.Vector3(-1, -0.8, 4), 0.2);
  rod(truss, new T.Vector3(1, 1.6, 1), new T.Vector3(1, -0.8, 4), 0.2);
  for (const x of [-17, -10, 10, 17]) {
    const radiator = mesh(truss, new T.BoxGeometry(2.2, 0.12, 10), radiatorMat, x, 3, -7.5);
    radiator.rotation.x = 0.3;
    rod(truss, new T.Vector3(x, 3, -1.5), new T.Vector3(x, 3, -12), 0.12);
  }
  const solarGroup = group("solar");
  for (const x of [-48, -30, 30, 48])
    for (const sign of [-1, 1]) {
      const hinge = new T.Group();
      hinge.position.set(x, 3, sign * 3.3);
      solarGroup.add(hinge);
      hinges.push(hinge);
      hinge.userData.side = sign;
      rod(hinge, new T.Vector3(0, 0, 0), new T.Vector3(0, 0, sign * 32.7), 0.12, ivory);
      const blanket = mesh(hinge, new T.BoxGeometry(10.8, 0.07, 31.8), solar, 0, 0, sign * 16.8);
      for (const s of [-1, 1])
        rod(
          hinge,
          new T.Vector3(s * 5.4, 0.07, sign * 0.9),
          new T.Vector3(s * 5.4, 0.07, sign * 32.7),
          0.055,
          ivory,
        );
      for (let z = 1; z <= 32; z += 4) {
        rod(
          hinge,
          new T.Vector3(-5.4, 0.06, sign * z),
          new T.Vector3(5.4, 0.06, sign * z),
          0.035,
          ivory,
        );
      }
      blanket.name = "Photovoltaic blanket";
      mesh(hinge, new T.CylinderGeometry(0.6, 0.6, 1.8, 16), metal, 0, 0, 0).rotation.z =
        Math.PI / 2;
      if (Math.abs(x) === 48 || (x === 30 && sign === 1) || (x === -30 && sign === -1)) {
        const deploy = new T.Group();
        deploy.position.set(0, 0.6, sign * 1.5);
        deploy.rotation.x = -sign * 0.18;
        hinge.add(deploy);
        mesh(deploy, new T.BoxGeometry(6, 0.08, 18), rosa, 0, 0, sign * 10);
        for (const edge of [-3, 3])
          rod(deploy, new T.Vector3(edge, 0, sign), new T.Vector3(edge, 0, sign * 19), 0.06, ivory);
      }
    }
  // Main chain and radial laboratories. Context modules remain simplified.
  const destiny = group("destiny");
  laboratory(destiny, "Destiny", 8.5, 2.15, "NASA").position.set(0, -3, 3.3);
  const unity = laboratory(root, "Unity", 5.5, 2.28, "NASA");
  unity.position.set(0, -3, -4.3);
  const harmony = laboratory(root, "Harmony", 7.2, 2.2, "NASA");
  harmony.position.set(0, -3, 11.8);
  const zarya = laboratory(root, "Zarya", 12.5, 2.05, "RUSSIA", ivory);
  zarya.position.set(0, -3, -13.9);
  const zvezda = laboratory(root, "Zvezda", 13.1, 1.95, "RUSSIA", metal);
  zvezda.position.set(0, -3, -27.4);
  for (const x of [-1, 1]) {
    const russianPanel = mesh(root, new T.BoxGeometry(8, 0.05, 3), rosa, x * 6.2, -2, -27);
    russianPanel.rotation.z = x * 0.07;
    rod(root, new T.Vector3(x * 2, -2, -27), new T.Vector3(x * 10, -2, -27), 0.065);
  }
  const pma = mesh(root, new T.CylinderGeometry(0.85, 1.5, 2.4, 24), dark, 0, -3, 16.5);
  pma.rotation.x = Math.PI / 2;
  const kibo = group("kibo");
  const kibolab = laboratory(kibo, "Kibo", 11.2, 2.2, "JAXA");
  kibolab.position.set(-6.6, -3, 14.4);
  rod(kibo, new T.Vector3(-2, -3, 11.8), new T.Vector3(-6.6, -3, 11.8), 0.95, ivory);
  const logistics = laboratory(kibo, "ELM PS", 4.2, 2.2, "JAXA");
  logistics.position.set(-6.6, 0.4, 12);
  logistics.rotation.x = Math.PI / 2;
  box(kibo, -6.6, -3, 23, 5.6, 1, 4.5, ivory);
  for (const x of [-8.4, -6.5, -4.8]) {
    box(kibo, x, -2.1, 23, 1.2, 0.8, 1.5, dark);
    mesh(kibo, new T.CylinderGeometry(0.4, 0.4, 0.6, 12), gold, x, -1.4, 23);
  }
  rod(kibo, new T.Vector3(-8, -0.7, 19), new T.Vector3(-11, 2, 22), 0.12);
  rod(kibo, new T.Vector3(-11, 2, 22), new T.Vector3(-8, 3, 24), 0.12);
  const columbus = laboratory(root, "Columbus", 6.9, 2.2, "ESA");
  columbus.position.set(6.7, -3, 12.2);
  rod(root, new T.Vector3(2, -3, 11.8), new T.Vector3(6.7, -3, 11.8), 0.95, ivory);
  const tranquility = laboratory(root, "Tranquility", 6.7, 2.2, "ESA");
  tranquility.position.set(-6, -3, -4.3);
  tranquility.rotation.y = Math.PI / 2;
  const quest = laboratory(root, "Quest", 5.5, 1.6, "NASA");
  quest.position.set(5.1, -3, -4.3);
  quest.rotation.y = Math.PI / 2;
  const cupola = group("cupola");
  cupola.position.set(-7.5, -6.1, -4.3);
  const dome = new T.Group();
  dome.rotation.x = Math.PI / 2;
  cupola.add(dome);
  const cupBody = mesh(dome, new T.CylinderGeometry(1.48, 1.48, 0.5, 24), ivory);
  cupBody.rotation.x = Math.PI / 2;
  const conical = mesh(
    dome,
    new T.CylinderGeometry(0.65, 1.48, 0.95, 6, 1, true),
    metal,
    0,
    0,
    0.65,
  );
  conical.rotation.x = Math.PI / 2;
  mesh(dome, new T.CircleGeometry(0.61, 24), glass, 0, 0, 1.15);
  ring(dome, 0.65, 0.08, 1.16, ivory);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = mesh(
      dome,
      new T.PlaneGeometry(0.75, 0.65),
      glass,
      Math.cos(a) * 1.03,
      Math.sin(a) * 1.03,
      0.62,
    );
    p.lookAt(new T.Vector3(Math.cos(a) * 2, Math.sin(a) * 2, 1.2));
    rod(
      dome,
      new T.Vector3(Math.cos(a) * 1.48, Math.sin(a) * 1.48, 0.2),
      new T.Vector3(Math.cos(a) * 0.65, Math.sin(a) * 0.65, 1.15),
      0.06,
      ivory,
    );
  }
  // Seven articulated joints / two main booms. A representative static pose.
  const arm = group("arm");
  const joints = [
    new T.Vector3(1.5, 4, 5),
    new T.Vector3(1.5, 4.8, 5),
    new T.Vector3(2, 5.4, 5),
    new T.Vector3(6.5, 10, 7),
    new T.Vector3(3.4, 13.2, 11.5),
    new T.Vector3(2.7, 13.5, 12),
    new T.Vector3(2, 13.5, 12),
  ];
  joints.forEach((p, i) => {
    mesh(arm, new T.SphereGeometry(i === 3 ? 0.48 : 0.38, 12, 8), ivory, ...p.toArray());
    if (i) rod(arm, joints[i - 1], p, i === 3 || i === 4 ? 0.26 : 0.18, ivory);
  });
  label(arm, "CANADA", 4.2, 8.1, 7.5, 2.4);
  const end = mesh(arm, new T.CylinderGeometry(0.35, 0.35, 0.6, 12), dark, 2, 13.5, 12.3);
  end.rotation.x = Math.PI / 2;
  // Equipment, antennae and docking context, all generated primitives.
  for (const pos of [
    [2, 6, -2],
    [-4, 5, -1],
  ]) {
    const antenna = new T.Group();
    antenna.position.set(...(pos as [number, number, number]));
    root.add(antenna);
    const dish = mesh(
      antenna,
      new T.SphereGeometry(1.1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.32),
      ivory,
    );
    dish.rotation.x = Math.PI * 0.8;
    rod(antenna, new T.Vector3(0, -2, 0), new T.Vector3(0, 0, 0), 0.08);
  }
  const nauka = laboratory(root, "Nauka", 9, 2, "RUSSIA", ivory);
  nauka.position.set(4.8, -6.2, -21);
  nauka.rotation.x = Math.PI / 2;
  modules.forEach((g, id) => {
    const copies = new Map<T.Material, T.Material>();
    g.traverse((o) => {
      if (o instanceof T.Mesh) {
        const clone = (m: T.Material) => {
          if (!copies.has(m)) copies.set(m, m.clone());
          return copies.get(m)!;
        };
        o.material = Array.isArray(o.material) ? o.material.map(clone) : clone(o.material);
        o.userData.moduleId = id;
      }
    });
  });
  return { root, modules, hinges };
}
