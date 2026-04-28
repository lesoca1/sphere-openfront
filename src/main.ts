import * as THREE from "three";
import "./styles.css";

type Triangle = [number, number, number];

type BoardCell = {
  center: THREE.Vector3;
  corners: THREE.Vector3[];
  kind: "pentagon" | "hexagon";
};

const SUBDIVISIONS = 3;
const SPHERE_RADIUS = 2.15;
const CELL_INSET = 0.08;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root was not found.");
}

app.innerHTML = `
  <main class="game-shell">
    <div class="topbar">
      <div>
        <p class="eyebrow">Sphere OpenFront</p>
        <h1>Hexworld prototype</h1>
      </div>
      <div class="stats" aria-label="board statistics">
        <span><strong id="hex-count">0</strong> hexes</span>
        <span><strong id="pent-count">0</strong> pentagons</span>
      </div>
    </div>
    <canvas id="board" aria-label="rotating geodesic board"></canvas>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#board");

if (!canvas) {
  throw new Error("Board canvas was not found.");
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x07131c, 8, 14);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(0, 0.15, 7.4);

const board = new THREE.Group();
board.rotation.set(-0.34, -0.5, 0.12);
scene.add(board);

const ambientLight = new THREE.AmbientLight(0x8aa0ad, 1.9);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xfff5df, 4.2);
keyLight.position.set(3, 4, 5);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x5bd6ff, 2.8);
rimLight.position.set(-5, -1, -3);
scene.add(rimLight);

const { cells, pentagonCount, hexagonCount } = createGoldbergBoard(SUBDIVISIONS);
document.querySelector("#hex-count")!.textContent = hexagonCount.toLocaleString();
document.querySelector("#pent-count")!.textContent = pentagonCount.toLocaleString();

const cellPalette = {
  pentagon: new THREE.MeshStandardMaterial({
    color: 0xf5bf4f,
    roughness: 0.55,
    metalness: 0.04,
    emissive: 0x3a2400,
    emissiveIntensity: 0.16,
    side: THREE.DoubleSide,
  }),
  hexagonA: new THREE.MeshStandardMaterial({
    color: 0x4fb7a4,
    roughness: 0.72,
    metalness: 0.02,
    emissive: 0x06221f,
    emissiveIntensity: 0.11,
    side: THREE.DoubleSide,
  }),
  hexagonB: new THREE.MeshStandardMaterial({
    color: 0x6c90d9,
    roughness: 0.7,
    metalness: 0.02,
    emissive: 0x09142b,
    emissiveIntensity: 0.1,
    side: THREE.DoubleSide,
  }),
};

const edgeMaterial = new THREE.LineBasicMaterial({
  color: 0xdff8ff,
  transparent: true,
  opacity: 0.22,
});

cells.forEach((cell, index) => {
  const mesh = new THREE.Mesh(
    createCellGeometry(cell),
    cell.kind === "pentagon"
      ? cellPalette.pentagon
      : index % 3 === 0
        ? cellPalette.hexagonB
        : cellPalette.hexagonA,
  );
  board.add(mesh);

  const outline = new THREE.LineLoop(createOutlineGeometry(cell), edgeMaterial);
  board.add(outline);
});

const halo = new THREE.Mesh(
  new THREE.SphereGeometry(SPHERE_RADIUS * 1.01, 64, 32),
  new THREE.MeshBasicMaterial({
    color: 0x9be7ff,
    transparent: true,
    opacity: 0.035,
    side: THREE.BackSide,
  }),
);
board.add(halo);

let isDragging = false;
let lastPointerX = 0;
let lastPointerY = 0;
let velocityX = 0.0016;
let velocityY = 0.0031;

canvas.addEventListener("pointerdown", (event) => {
  isDragging = true;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!isDragging) return;

  const deltaX = event.clientX - lastPointerX;
  const deltaY = event.clientY - lastPointerY;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;

  velocityY = deltaX * 0.006;
  velocityX = deltaY * 0.006;
  board.rotation.y += velocityY;
  board.rotation.x += velocityX;
});

canvas.addEventListener("pointerup", (event) => {
  isDragging = false;
  canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener("pointercancel", () => {
  isDragging = false;
});

function animate() {
  requestAnimationFrame(animate);

  if (!isDragging) {
    board.rotation.y += velocityY;
    board.rotation.x += velocityX;
    velocityX *= 0.965;
    velocityY *= 0.965;

    if (Math.abs(velocityY) < 0.0012) {
      velocityY = 0.0012;
    }
  }

  board.position.y = Math.sin(performance.now() * 0.0012) * 0.08;
  renderer.render(scene, camera);
}

function resize() {
  const { clientWidth, clientHeight } = canvas;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);
resize();
animate();

function createGoldbergBoard(subdivisions: number) {
  const mesh = createSubdividedIcosahedron(subdivisions);
  const faceCenters = mesh.triangles.map((triangle) =>
    new THREE.Vector3()
      .add(mesh.vertices[triangle[0]])
      .add(mesh.vertices[triangle[1]])
      .add(mesh.vertices[triangle[2]])
      .multiplyScalar(1 / 3)
      .normalize(),
  );

  const incidentFaces: number[][] = mesh.vertices.map(() => []);
  mesh.triangles.forEach((triangle, faceIndex) => {
    triangle.forEach((vertexIndex) => incidentFaces[vertexIndex].push(faceIndex));
  });

  const cells = mesh.vertices.map<BoardCell>((vertex, vertexIndex) => {
    const orderedCorners = sortCornersAroundVertex(
      vertex,
      incidentFaces[vertexIndex].map((faceIndex) => faceCenters[faceIndex]),
    );

    return {
      center: vertex.clone().multiplyScalar(SPHERE_RADIUS),
      corners: orderedCorners.map((corner) => corner.clone().multiplyScalar(SPHERE_RADIUS)),
      kind: orderedCorners.length === 5 ? "pentagon" : "hexagon",
    };
  });

  return {
    cells,
    pentagonCount: cells.filter((cell) => cell.kind === "pentagon").length,
    hexagonCount: cells.filter((cell) => cell.kind === "hexagon").length,
  };
}

function createSubdividedIcosahedron(subdivisions: number) {
  const phi = (1 + Math.sqrt(5)) / 2;
  let vertices = [
    new THREE.Vector3(-1, phi, 0),
    new THREE.Vector3(1, phi, 0),
    new THREE.Vector3(-1, -phi, 0),
    new THREE.Vector3(1, -phi, 0),
    new THREE.Vector3(0, -1, phi),
    new THREE.Vector3(0, 1, phi),
    new THREE.Vector3(0, -1, -phi),
    new THREE.Vector3(0, 1, -phi),
    new THREE.Vector3(phi, 0, -1),
    new THREE.Vector3(phi, 0, 1),
    new THREE.Vector3(-phi, 0, -1),
    new THREE.Vector3(-phi, 0, 1),
  ].map((vertex) => vertex.normalize());

  let triangles: Triangle[] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];

  for (let i = 0; i < subdivisions; i += 1) {
    const midpointCache = new Map<string, number>();
    const nextTriangles: Triangle[] = [];

    const midpoint = (a: number, b: number) => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const cached = midpointCache.get(key);

      if (cached !== undefined) {
        return cached;
      }

      const nextVertex = new THREE.Vector3()
        .addVectors(vertices[a], vertices[b])
        .multiplyScalar(0.5)
        .normalize();
      const nextIndex = vertices.length;
      vertices.push(nextVertex);
      midpointCache.set(key, nextIndex);
      return nextIndex;
    };

    triangles.forEach(([a, b, c]) => {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);

      nextTriangles.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    });

    triangles = nextTriangles;
  }

  return { vertices, triangles };
}

function sortCornersAroundVertex(vertex: THREE.Vector3, corners: THREE.Vector3[]) {
  const normal = vertex.clone().normalize();
  const reference = corners[0].clone().sub(normal.clone().multiplyScalar(corners[0].dot(normal))).normalize();
  const tangent = new THREE.Vector3().crossVectors(normal, reference).normalize();

  return [...corners].sort((a, b) => {
    const projectedA = a.clone().sub(normal.clone().multiplyScalar(a.dot(normal))).normalize();
    const projectedB = b.clone().sub(normal.clone().multiplyScalar(b.dot(normal))).normalize();
    const angleA = Math.atan2(projectedA.dot(tangent), projectedA.dot(reference));
    const angleB = Math.atan2(projectedB.dot(tangent), projectedB.dot(reference));
    return angleA - angleB;
  });
}

function createCellGeometry(cell: BoardCell) {
  const positions: number[] = [];
  const normals: number[] = [];
  const center = cell.center.clone().normalize().multiplyScalar(SPHERE_RADIUS * 1.006);
  const corners = cell.corners.map((corner) =>
    corner.clone().lerp(cell.center, CELL_INSET).normalize().multiplyScalar(SPHERE_RADIUS * 1.012),
  );

  for (let i = 0; i < corners.length; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    [center, a, b].forEach((point) => {
      positions.push(point.x, point.y, point.z);
      const normal = point.clone().normalize();
      normals.push(normal.x, normal.y, normal.z);
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

function createOutlineGeometry(cell: BoardCell) {
  const corners = cell.corners.map((corner) =>
    corner.clone().lerp(cell.center, CELL_INSET).normalize().multiplyScalar(SPHERE_RADIUS * 1.018),
  );
  const geometry = new THREE.BufferGeometry();
  geometry.setFromPoints(corners);
  return geometry;
}
