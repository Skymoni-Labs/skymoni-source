import * as THREE from 'three';

export const EARTH_RADIUS = 6_371_000;
export const ISS_ALTITUDE = 408_000;
export const EARTH_CENTER_Y = -(EARTH_RADIUS + ISS_ALTITUDE);

export interface EarthBuild {
  group: THREE.Group;
  update: (elapsed: number) => void;
}

interface EarthTextures {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  cloudMask: THREE.Texture;
}

export function createEarth(textures: EarthTextures, sunDirection: THREE.Vector3): EarthBuild {
  const group = new THREE.Group();
  group.position.set(0, EARTH_CENTER_Y, 0);
  // The station is placed over a mid-latitude ocean. Tilting the planet's
  // spin axis relative to the local vertical avoids looking straight down at
  // a polar ice cap and shows the oceans, continents and cloud systems.
  group.rotation.set(0, 3.2, THREE.MathUtils.degToRad(61));
  group.rotation.order = 'ZYX';

  const earthMaterial = new THREE.MeshStandardMaterial({
    map: textures.albedo,
    roughnessMap: textures.roughness,
    roughness: 0.92,
    metalness: 0.02,
    color: 0xd7dfdf,
  });

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS, 160, 96),
    earthMaterial,
  );
  earth.rotation.y = -0.4;
  earth.receiveShadow = false;
  group.add(earth);

  const cloudMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uMask: { value: textures.cloudMask },
      uSunDirection: { value: sunDirection.clone().normalize() },
      uOpacity: { value: 0.42 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uMask;
      uniform vec3 uSunDirection;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        #include <logdepthbuf_fragment>
        float mask = texture2D(uMask, vUv).g;
        // The albedo already contains a cloud deck. Normal alpha compositing
        // adds drift without summing bright values into an overexposed band.
        float cloud = smoothstep(0.12, 0.74, mask);
        float daylight = 0.36 + 0.64 * smoothstep(-0.2, 0.55, dot(normalize(vWorldNormal), uSunDirection));
        vec3 color = mix(vec3(0.52, 0.64, 0.74), vec3(1.0), daylight);
        gl_FragColor = vec4(color, cloud * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS + 14_000, 160, 96),
    cloudMaterial,
  );
  clouds.rotation.y = 1.1;
  clouds.renderOrder = 1;
  group.add(clouds);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS + 95_000, 128, 80),
    new THREE.ShaderMaterial({
      uniforms: {
        uSunDirection: { value: sunDirection.clone().normalize() },
        uColor: { value: new THREE.Color(0x4ba5e8) },
      },
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;

        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <logdepthbuf_pars_fragment>
        uniform vec3 uSunDirection;
        uniform vec3 uColor;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;

        void main() {
          #include <logdepthbuf_fragment>
          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          float rim = 1.0 - abs(dot(normalize(vWorldNormal), viewDirection));
          float glow = pow(rim, 3.3);
          float daylight = 0.24 + 0.76 * smoothstep(-0.24, 0.55, dot(normalize(vWorldNormal), uSunDirection));
          vec3 color = mix(vec3(0.04, 0.19, 0.5), uColor, rim);
          gl_FragColor = vec4(color * glow * daylight, glow * 0.86);
        }
      `,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  atmosphere.renderOrder = 2;
  group.add(atmosphere);

  const update = (elapsed: number) => {
    // A compressed day/night cycle: the Earth turns beneath the fixed
    // orbital frame while cloud systems drift slightly faster.
    earth.rotation.y = -0.4 + elapsed * 0.00018;
    clouds.rotation.y = 1.1 + elapsed * 0.00027;
  };

  return { group, update };
}
