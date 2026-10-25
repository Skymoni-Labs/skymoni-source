import { readFile, writeFile } from "node:fs/promises";
const license = await readFile(new URL("../node_modules/three/LICENSE", import.meta.url), "utf8");
await writeFile(
  new URL("../../web/public/skivu/interactive/THIRD_PARTY_NOTICES.txt", import.meta.url),
  "Three.js 0.186.1 / OrbitControls / RoomEnvironment / BufferGeometryUtils\nhttps://threejs.org/\n\n" +
    license,
  "utf8",
);
