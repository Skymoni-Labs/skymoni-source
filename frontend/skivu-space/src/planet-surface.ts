import * as T from 'three';

let textures: Promise<[T.Texture, T.Texture]> | undefined;
export function planetTextures() {
  if (!textures) {
    const loader = new T.TextureLoader();
    textures = Promise.all([
      loader.loadAsync(new URL('assets/earth-blue-marble-surface.webp', document.baseURI).href),
      loader.loadAsync(new URL('assets/earth-blue-marble-clouds.webp', document.baseURI).href),
    ]).then(([land, cloud]) => {
      land.colorSpace = T.SRGBColorSpace;
      land.wrapS = cloud.wrapS = T.RepeatWrapping;
      land.anisotropy = cloud.anisotropy = 2;
      return [land, cloud];
    });
  }
  return textures;
}

// A complete longitude/latitude map has a continuous back hemisphere. The
// original illustrated plate supplies the stationary atmospheric edge only.
export const planetSurfaceGLSL = `
  uniform sampler2D landMap;
  uniform sampler2D cloudMap;
  vec3 planetarySurface(vec3 n, float angle){
    float c=cos(angle),s=sin(angle);
    vec3 p=vec3(c*n.x+s*n.z,n.y,-s*n.x+c*n.z);
    vec2 uv=vec2(atan(p.x,p.z)/6.2831853+.5,asin(clamp(p.y,-1.,1.))/3.14159265+.5);
    // Longitude wraps at atan's branch. Unwrapped derivatives prevent a row
    // of coarse mip samples from appearing as a dashed dark seam on rotation.
    vec2 dx=dFdx(uv),dy=dFdy(uv);
    dx.x-=floor(dx.x+.5);dy.x-=floor(dy.x+.5);
    vec3 land=textureGrad(landMap,vec2(uv.x+.32,uv.y),dx,dy).rgb;
    float lum=dot(land,vec3(.2126,.7152,.0722));
    land=mix(land,vec3(lum*.53,lum*.78,lum*1.20),.62);
    float cloud=textureGrad(cloudMap,vec2(uv.x+.32+angle*.025,uv.y),dx,dy).r;
    cloud=smoothstep(.12,.86,cloud);
    return mix(land*1.1+vec3(.008,.016,.036),vec3(.69,.79,.97),cloud*.93);
  }
`;
