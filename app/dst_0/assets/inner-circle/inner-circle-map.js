import * as THREE from "./vendor/three.module.min.js";

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const minZoom = 0.68;
const initialZoom = 1.12;
const maxZoom = 2.25;

const points = [
  {
    id: "home",
    type: "дом",
    title: "Ближний круг",
    text: "Приватный дом в Янино-2: точка сбора, тишина, ночевка, стол, сауна и сценарий дня.",
    position: [0, 0.68, 0],
    color: 0xd75554
  },
  {
    id: "yanino",
    type: "район",
    title: "Янино-2",
    text: "Ближняя зона к дому: ориентир для маршрута, такси и встречи гостей перед заездом.",
    position: [-0.9, 0.26, -0.85],
    color: 0xffe1d8
  },
  {
    id: "koltushi",
    type: "рельеф",
    title: "Колтушские высоты",
    text: "Зелёная сторона маршрута: прогулки, воздух, видовые точки и будущие игровые отметки.",
    position: [2.05, 0.38, 0.95],
    color: 0xd8d8d8
  },
  {
    id: "fields",
    type: "прогулки",
    title: "Поля и тропы",
    text: "Тихие маршруты вокруг дома: выйти после работы, пройтись между блоками дня, проветрить голову.",
    position: [1.15, 0.2, -1.95],
    color: 0xffe1d8
  },
  {
    id: "active",
    type: "активный день",
    title: "Вело / мото / кони",
    text: "Заглушка для соседних точек: конный клуб, вело-маршруты, мототрек и прокат техники.",
    position: [3.25, 0.18, -1.15],
    color: 0xd8d8d8
  },
  {
    id: "spb",
    type: "город",
    title: "Санкт-Петербург",
    text: "Город остаётся рядом, но на карте он превращается в вход в другой ритм дня.",
    position: [-3.5, 0.14, 1.25],
    color: 0xd8d8d8
  }
];

document.querySelectorAll("[data-inner-circle-map]").forEach(initInnerCircleMap);

function initInnerCircleMap(section) {
  const shell = section.querySelector("[data-map-shell]");
  const mount = section.querySelector("[data-map-canvas]");
  const labelsLayer = section.querySelector("[data-map-labels]");
  const copy = section.querySelector(".inner-circle-map-copy");

  if (!shell || !mount || !labelsLayer) {
    return;
  }

  shell.tabIndex = 0;
  shell.setAttribute("aria-label", "Интерактивная карта окрестностей");

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x1f3f3e, 8, 17);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);

  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 80);
  const cameraAnchor = new THREE.Vector3(0.2, 0.1, 0.05);

  const root = new THREE.Group();
  root.rotation.y = -0.62;
  scene.add(root);

  addLights(scene);
  addMapBase(root);
  addRouteLines(root);
  addTrees(root);
  addParticles(root);

  const markerObjects = [];
  const markerGroups = new Map();
  const labelElements = new Map();
  const selected = { id: "home" };

  points.forEach((point) => {
    const group = makeMarker(point);
    group.position.set(point.position[0], point.position[1], point.position[2]);
    root.add(group);
    markerGroups.set(point.id, group);
    markerObjects.push(...group.children);

    const label = document.createElement("button");
    label.type = "button";
    label.className = "inner-circle-map-label";
    label.dataset.point = point.id;
    label.innerHTML = `<span class="inner-circle-map-label__content"><small>${point.type}</small><strong>${point.title}</strong><span class="inner-circle-map-label__text">${point.text}</span></span>`;
    label.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      setMapActive(true);
    });
    label.addEventListener("pointerup", (event) => {
      event.stopPropagation();
    });
    label.addEventListener("click", (event) => {
      event.stopPropagation();
      setMapActive(true);
      selectPoint(point.id);
    });
    labelsLayer.appendChild(label);
    labelElements.set(point.id, label);
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const drag = {
    active: false,
    moved: false,
    x: 0,
    y: 0,
    rotation: root.rotation.y,
    pointers: new Map(),
    pinchDistance: 0,
    pinchZoom: 1
  };
  let isHovering = false;
  let mapActive = false;
  let activeTimer = 0;
  const target = {
    rotation: root.rotation.y,
    zoom: initialZoom,
    cameraLift: 1
  };

  const ro = new ResizeObserver(resize);
  ro.observe(shell);
  resize();
  selectPoint("home");

  section.querySelectorAll("[data-map-action]").forEach((button) => {
    button.addEventListener("click", () => {
      setMapActive(true);
      const action = button.dataset.mapAction;
      if (action === "zoom-in") target.zoom = clamp(target.zoom + 0.12, minZoom, maxZoom);
      if (action === "zoom-out") target.zoom = clamp(target.zoom - 0.12, minZoom, maxZoom);
      if (action === "reset") {
        target.zoom = initialZoom;
        target.rotation = -0.62;
        selectPoint("home");
      }
    });
  });

  shell.addEventListener("pointerdown", onPointerDown);
  shell.addEventListener("pointerenter", () => {
    isHovering = true;
  });
  shell.addEventListener("pointerleave", () => {
    isHovering = false;
  });
  shell.addEventListener("focusin", () => {
    isHovering = true;
  });
  shell.addEventListener("focusout", () => {
    isHovering = false;
  });
  shell.addEventListener("pointermove", onPointerMove);
  shell.addEventListener("pointerup", onPointerUp);
  shell.addEventListener("pointercancel", onPointerUp);
  shell.addEventListener("wheel", onWheel, { passive: false });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const elapsed = clock.getElapsedTime();
    if (!drag.active && !isHovering && !mapActive && !prefersReducedMotion) {
      target.rotation += 0.00045;
    }

    root.rotation.y = lerp(root.rotation.y, target.rotation, 0.055);
    root.position.y = Math.sin(elapsed * 0.82) * 0.055;
    camera.zoom = lerp(camera.zoom, target.zoom, 0.08);
    camera.updateProjectionMatrix();

    markerGroups.forEach((group, id) => {
      const active = id === selected.id;
      group.scale.setScalar(lerp(group.scale.x, active ? 1.18 : 1, 0.08));
      group.children.forEach((child) => {
        if (child.material?.emissiveIntensity !== undefined) {
          child.material.emissiveIntensity = active ? 0.62 : 0.28;
        }
      });
      const halo = group.userData.halo;
      if (halo) {
        halo.scale.setScalar(1 + Math.sin(elapsed * 2.6 + group.position.x) * 0.08);
      }
    });

    updateLabels();
    renderer.render(scene, camera);
  });

  requestAnimationFrame(() => {
    section.classList.add("is-ready");
  });

  function resize() {
    const width = Math.max(1, mount.clientWidth || shell.clientWidth);
    const height = Math.max(1, mount.clientHeight || shell.clientHeight);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const frustum = width < 640 ? 4.45 : 4.9;
    camera.left = -frustum * aspect;
    camera.right = frustum * aspect;
    camera.top = frustum;
    camera.bottom = -frustum;
    camera.position.set(5.35, 5.65 * target.cameraLift, 5.85);
    camera.lookAt(cameraAnchor);
    camera.updateProjectionMatrix();
    updateLabels();
  }

  function onPointerDown(event) {
    setMapActive(true);
    drag.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    shell.setPointerCapture?.(event.pointerId);
    drag.active = true;
    drag.moved = false;

    if (drag.pointers.size === 1) {
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.rotation = target.rotation;
    }

    if (drag.pointers.size === 2) {
      const [a, b] = [...drag.pointers.values()];
      drag.pinchDistance = distance(a, b);
      drag.pinchZoom = target.zoom;
    }
  }

  function onPointerMove(event) {
    if (!drag.pointers.has(event.pointerId)) return;
    drag.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (drag.pointers.size === 2) {
      const [a, b] = [...drag.pointers.values()];
      const nextDistance = distance(a, b);
      if (drag.pinchDistance > 0) {
        target.zoom = clamp(drag.pinchZoom * (nextDistance / drag.pinchDistance), minZoom, maxZoom);
      }
      setMapActive(true);
      drag.moved = true;
      return;
    }

    if (!drag.active) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    setMapActive(true);
    target.rotation = drag.rotation + dx * 0.0065;
    target.cameraLift = clamp(1 - dy * 0.001, 0.86, 1.16);
    resize();
  }

  function onPointerUp(event) {
    const isInterfaceClick = event.target.closest?.(".inner-circle-map-label, .inner-circle-map-control");
    drag.pointers.delete(event.pointerId);
    if (drag.pointers.size === 0) {
      drag.active = false;
      target.cameraLift = 1;
      resize();
      if (!drag.moved && !isInterfaceClick) {
        selectByCanvas(event);
      }
    }
  }

  function onWheel(event) {
    if (!mapActive) return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      target.zoom = clamp(target.zoom - event.deltaY * 0.0011, minZoom, maxZoom);
      setMapActive(true);
    }
  }

  function selectByCanvas(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(markerObjects, false);
    const pointId = hits.find((hit) => hit.object.userData.pointId)?.object.userData.pointId;
    if (pointId) selectPoint(pointId);
  }

  function selectPoint(id) {
    const point = points.find((item) => item.id === id) || points[0];
    selected.id = point.id;

    labelElements.forEach((label, labelId) => {
      label.classList.toggle("is-active", labelId === point.id);
    });

    const marker = markerGroups.get(point.id);
    if (marker) {
      const angle = Math.atan2(marker.position.x, marker.position.z);
      target.rotation = lerpAngle(target.rotation, -angle * 0.22 - 0.58, 0.58);
    }
  }

  function updateLabels() {
    const width = labelsLayer.clientWidth || shell.clientWidth;
    const height = labelsLayer.clientHeight || shell.clientHeight;
    const protectedArea = getProtectedArea();

    markerGroups.forEach((group, id) => {
      const label = labelElements.get(id);
      if (!label) return;
      const world = new THREE.Vector3();
      group.getWorldPosition(world);
      world.y += 0.68;
      const projected = world.clone().project(camera);
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      const edgeX = width < 640 ? 96 : 140;
      const edgeTop = width < 640 ? 70 : 84;
      const edgeBottom = width < 640 ? 150 : 170;
      const active = id === selected.id;
      const activeEdgeX = width < 640 ? 154 : 180;
      const activeEdgeTop = width < 640 ? 132 : 96;
      const activeEdgeBottom = width < 640 ? 128 : 104;
      let labelX = active ? clamp(x, activeEdgeX, width - activeEdgeX) : x;
      let labelY = active ? clamp(y, activeEdgeTop, height - activeEdgeBottom) : y;
      const isUnderCopy = protectedArea && labelX > protectedArea.left && labelX < protectedArea.right && labelY > protectedArea.top && labelY < protectedArea.bottom;
      if (active && isUnderCopy) {
        const shiftedX = protectedArea.right + (width < 640 ? 56 : 92);
        labelX = clamp(shiftedX, activeEdgeX, width - activeEdgeX);
      }
      const hidden = projected.z < -1 || projected.z > 1 || (!active && (x < edgeX || x > width - edgeX || y < edgeTop || y > height - edgeBottom || isUnderCopy));
      label.style.setProperty("--map-label-x", `${labelX}px`);
      label.style.setProperty("--map-label-y", `${labelY}px`);
      label.classList.toggle("is-hidden", hidden);
    });
  }

  function setMapActive(active) {
    mapActive = active;
    section.classList.toggle("is-map-active", active);
    clearTimeout(activeTimer);

    if (active) {
      activeTimer = window.setTimeout(() => {
        mapActive = false;
        section.classList.remove("is-map-active");
      }, 5200);
    }
  }

  function getProtectedArea() {
    if (!copy) return null;
    const copyRect = copy.getBoundingClientRect();
    const layerRect = labelsLayer.getBoundingClientRect();
    const padX = labelsLayer.clientWidth < 640 ? 14 : 28;
    const padY = labelsLayer.clientWidth < 640 ? 10 : 18;

    return {
      left: copyRect.left - layerRect.left - padX,
      right: copyRect.right - layerRect.left + padX,
      top: copyRect.top - layerRect.top - padY,
      bottom: copyRect.bottom - layerRect.top + padY
    };
  }
}

function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xffe1d8, 0x193232, 2.1));

  const sun = new THREE.DirectionalLight(0xffe1d8, 3.2);
  sun.position.set(4.5, 8, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  scene.add(sun);

  const cold = new THREE.DirectionalLight(0xd8d8d8, 1.3);
  cold.position.set(-4, 4, -6);
  scene.add(cold);
}

function addMapBase(root) {
  const materials = {
    city: new THREE.MeshStandardMaterial({ color: 0x9fa7a4, roughness: 0.9, metalness: 0.02 }),
    land: new THREE.MeshStandardMaterial({ color: 0x44645a, roughness: 0.86 }),
    field: new THREE.MeshStandardMaterial({ color: 0x6f7f54, roughness: 0.9 }),
    hill: new THREE.MeshStandardMaterial({ color: 0x9aaf7a, roughness: 0.82 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x193232, roughness: 0.9 }),
    water: new THREE.MeshStandardMaterial({ color: 0x6f9392, roughness: 0.6, transparent: true, opacity: 0.9 })
  };

  const slab = makeBox(10.4, 0.16, 6.4, 0x193232);
  slab.position.y = -0.18;
  slab.receiveShadow = true;
  root.add(slab);

  root.add(makeShape([
    [-5.1, -2.75], [-3.6, -2.8], [-2.7, -1.4], [-3.05, 1.7], [-5.1, 2.45]
  ], materials.city, 0.02));

  root.add(makeShape([
    [-2.85, -2.65], [0.6, -2.95], [2.9, -2.05], [3.25, -0.3], [1.65, 1.05], [-0.8, 1.25], [-2.55, 0.35]
  ], materials.land, 0.07));

  root.add(makeShape([
    [-0.2, -2.75], [2.7, -2.5], [4.65, -1.15], [3.4, 0.35], [1.05, -0.15]
  ], materials.field, 0.12));

  root.add(makeShape([
    [0.9, 0.15], [2.95, 0.25], [4.7, 1.65], [3.1, 2.75], [1.45, 2.05]
  ], materials.hill, 0.22));

  root.add(makeShape([
    [-1.35, -1.25], [0.35, -1.5], [0.9, -0.4], [0.2, 0.55], [-1.25, 0.25]
  ], materials.dark, 0.18));

  root.add(makeShape([
    [-1.05, -0.72], [-0.32, -1.02], [0.64, -0.76], [0.92, -0.06], [0.42, 0.7], [-0.5, 0.82], [-1.12, 0.18]
  ], materials.hill, 0.42));

  const water = makeRibbon([
    [-4.95, -0.55], [-3.7, -0.2], [-2.1, -0.05], [-0.75, 0.35], [0.4, 0.25], [1.45, 0.65]
  ], 0.08, materials.water);
  water.position.y = 0.2;
  root.add(water);
}

function addRouteLines(root) {
  const routeMaterial = new THREE.MeshStandardMaterial({
    color: 0xffe1d8,
    emissive: 0xffe1d8,
    emissiveIntensity: 0.16,
    roughness: 0.55
  });
  const secondaryMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8d8d8,
    emissive: 0xd8d8d8,
    emissiveIntensity: 0.1,
    roughness: 0.65
  });

  const main = makeTube([
    [-4.2, 0.18, 1.35],
    [-2.6, 0.24, 0.55],
    [-1.05, 0.36, -0.55],
    [0, 0.72, 0]
  ], 0.035, routeMaterial);
  root.add(main);

  root.add(makeTube([
    [0, 0.72, 0],
    [0.8, 0.36, -1.2],
    [1.2, 0.24, -2]
  ], 0.025, secondaryMaterial));

  root.add(makeTube([
    [0, 0.72, 0],
    [1.2, 0.52, 0.55],
    [2.05, 0.44, 0.95],
    [3.15, 0.36, 1.85]
  ], 0.025, secondaryMaterial));

  root.add(makeTube([
    [0, 0.7, 0],
    [1.25, 0.34, -0.45],
    [2.45, 0.22, -0.85],
    [3.25, 0.22, -1.15]
  ], 0.022, secondaryMaterial));
}

function addTrees(root) {
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x3c2b23, roughness: 0.9 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x879c68, roughness: 0.9 });
  const positions = [
    [2.5, 1.55], [3.15, 1.9], [3.65, 1.25], [2.1, 2.15], [1.6, 1.45],
    [1.8, -2.25], [2.55, -1.85], [3.45, -1.2], [-1.35, 0.8], [-0.7, 0.75],
    [-2.15, -1.55], [-2.55, -0.85], [0.85, -1.65], [3.85, -0.25]
  ];

  positions.forEach(([x, z], index) => {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.24, 6), trunkMaterial);
    trunk.position.y = 0.26;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.16 + (index % 3) * 0.018, 0.46, 7), leafMaterial);
    crown.position.y = 0.62;
    crown.castShadow = true;
    tree.add(trunk, crown);
    tree.position.set(x, 0.05 + (index % 2) * 0.06, z);
    root.add(tree);
  });
}

function addParticles(root) {
  const count = 72;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 8.6;
    positions[i * 3 + 1] = 0.55 + Math.random() * 1.55;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 5.1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xffe1d8,
    size: 0.028,
    transparent: true,
    opacity: 0.55,
    depthWrite: false
  });
  root.add(new THREE.Points(geometry, material));
}

function makeMarker(point) {
  const group = new THREE.Group();
  const color = point.color;

  const base = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.015, 8, 46),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.85
    })
  );
  base.rotation.x = Math.PI / 2;
  base.userData.pointId = point.id;

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.06, 0.42, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.62 })
  );
  stem.position.y = 0.26;
  stem.castShadow = true;
  stem.userData.pointId = point.id;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 18, 14),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.35,
      roughness: 0.38
    })
  );
  head.position.y = 0.52;
  head.castShadow = true;
  head.userData.pointId = point.id;

  group.add(base, stem, head);
  group.userData.halo = base;
  return group;
}

function makeShape(points2d, material, y) {
  const shape = new THREE.Shape();
  shape.moveTo(points2d[0][0], points2d[0][1]);
  points2d.slice(1).forEach(([x, z]) => shape.lineTo(x, z));
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

function makeTube(points3d, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points3d.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const geometry = new THREE.TubeGeometry(curve, 80, radius, 8, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

function makeRibbon(points2d, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points2d.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 90, radius, 12, false), material);
}

function makeBox(width, height, depth, color) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function lerpAngle(a, b, amount) {
  const delta = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + delta * amount;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
