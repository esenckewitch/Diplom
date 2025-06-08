import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.154/build/three.module.js';
import {GLTFLoader} from 'https://cdn.jsdelivr.net/npm/three@0.154/examples/jsm/loaders/GLTFLoader.js';
import {GUI} from 'https://cdn.jsdelivr.net/npm/lil-gui@0.18/+esm';

let scene, camera, renderer;
let model;
let svoRoot;
const gui = new GUI();
const params = { lod: 3 };

init();
loadModel('model.glb');

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202020);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(3, 3, 3);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 5, 5);
    scene.add(light);

    window.addEventListener('resize', onWindowResize);

    gui.add(params, 'lod', 1, 6, 1).name('Depth').onChange(() => {
        if (model) visualizeSVO();
    });

    animate();
}

function loadModel(url) {
    const loader = new GLTFLoader();
    loader.load(url, (gltf) => {
        model = gltf.scene.children[0];
        model.traverse(o => { if (o.isMesh) o.material.wireframe = false; });
        scene.add(model);
        buildSVO(model);
        visualizeSVO();
    }, undefined, (err) => {
        console.error('Failed to load model', err);
    });
}

function buildSVO(mesh) {
    const depth = params.lod;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();

    const positions = geometry.attributes.position.array;
    const triangles = [];
    for (let i = 0; i < positions.length; i += 9) {
        const a = new THREE.Vector3(positions[i], positions[i+1], positions[i+2]);
        const b = new THREE.Vector3(positions[i+3], positions[i+4], positions[i+5]);
        const c = new THREE.Vector3(positions[i+6], positions[i+7], positions[i+8]);
        triangles.push(new THREE.Triangle(a, b, c));
    }

    const box = geometry.boundingBox.clone();
    svoRoot = { box, children: [], leaf: false };
    buildNode(svoRoot, triangles, depth);
}

function buildNode(node, triangles, depth) {
    if (depth === 0) {
        node.leaf = true;
        return;
    }
    const boxes = subdivide(node.box);
    for (const b of boxes) {
        const tris = triangles.filter(t => triangleBoxIntersect(t, b));
        if (tris.length > 0) {
            const child = { box: b, children: [], leaf: false };
            buildNode(child, tris, depth - 1);
            node.children.push(child);
        }
    }
    if (node.children.length === 0) node.leaf = true;
}

function triangleBoxIntersect(tri, box) {
    return box.intersectsTriangle(tri);
}

function subdivide(box) {
    const { min, max } = box;
    const size = new THREE.Vector3();
    box.getSize(size).multiplyScalar(0.5);
    const boxes = [];
    for (let x = 0; x < 2; x++) {
        for (let y = 0; y < 2; y++) {
            for (let z = 0; z < 2; z++) {
                const offset = new THREE.Vector3(x, y, z).multiply(size);
                const bMin = min.clone().add(offset);
                const bMax = bMin.clone().add(size);
                boxes.push(new THREE.Box3(bMin, bMax));
            }
        }
    }
    return boxes;
}

function visualizeSVO() {
    // remove previous voxels
    scene.traverse(o => {
        if (o.userData.svo) scene.remove(o);
    });
    if (!svoRoot) return;
    const leaves = [];
    gatherLeaves(svoRoot, leaves);
    for (const leaf of leaves) {
        const size = new THREE.Vector3();
        leaf.box.getSize(size);
        const center = new THREE.Vector3();
        leaf.box.getCenter(center);
        const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        const cube = new THREE.Mesh(geometry, material);
        cube.position.copy(center);
        cube.userData.svo = true;
        scene.add(cube);
    }
}

function gatherLeaves(node, out) {
    if (node.leaf || node.children.length === 0) {
        out.push(node);
    } else {
        for (const child of node.children) gatherLeaves(child, out);
    }
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
