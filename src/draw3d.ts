import * as B from '@babylonjs/core';
import * as h from '@mediapipe/holistic';
import { log } from './util';
import { Scene } from './scene';
import { UV468, TRI468 } from './constants';
import { hideLoader, showLoader } from './loader';
import { initEvents } from './events';
import type { Options } from './options';

let options: Options;
let t: Scene;
let meshes: Record<string, B.Mesh | B.AbstractMesh> = {};
let faceVertexData: B.VertexData | undefined;
let previousSmooth = false;
let radius = 0.01;

const radiusFunction = (index, distance) => (options.fixedRadius ? (index * radius) : (2 * distance * radius) + 0.01);

class Data {
  pos: Record<string, B.Vector3> = {};
  newPos: Record<string, B.Vector3> = {};
  path: Record<string, B.Vector3[]> = {};
  newPath: Record<string, B.Vector3[]> = {};
  radius: Record<string, number> = {};
  updateTime = 0;
  drawTime = 0;

  interpolate() {
    if (options.lerpAmount === 0) return;
    for (const key of Object.keys(this.newPos)) {
      if (!this.pos[key]) this.pos[key] = this.newPos[key].clone();
      this.pos[key] = B.Vector3.Lerp(this.pos[key], this.newPos[key], options.lerpAmount);
    }
    for (const key of Object.keys(this.newPath)) {
      if (!this.path[key]) this.path[key] = this.newPath[key].map((pos) => pos.clone());
      for (let i = 0; i < this.newPath[key].length; i++) {
        this.path[key][i] = B.Vector3.Lerp(this.path[key][i], this.newPath[key][i], options.lerpAmount);
      }
    }
  }

  draw() {
    if (this.updateTime - this.drawTime < -1000) return; // no draw needed if results are older than 1sec
    for (const key of Object.keys(this.newPath)) {
      if (!meshes[key] || meshes[key].isDisposed()) continue;
      radius = this.radius[key];
      const path = options.lerpAmount > 0 ? this.path[key] : this.newPath[key];
      B.MeshBuilder.CreateTube(key, { path, radiusFunction, updatable: true, instance: meshes[key] as B.Mesh }, t.scene);
      meshes[key].showBoundingBox = options.boundingBoxes;
    }
    for (const key of Object.keys(this.newPos)) {
      if (!meshes[key] || meshes[key].isDisposed()) continue;
      meshes[key].position = options.lerpAmount > 0 ? this.pos[key] : this.newPos[key];
      meshes[key].showBoundingBox = options.boundingBoxes;
      const scale = options.baseRadius / this.radius[key];
      if (key !== 'face') meshes[key].scaling.multiplyInPlace(new B.Vector3(scale, scale, scale));
    }
    if (meshes['pose']) meshes['pose'].showBoundingBox = options.boundingBoxes;
    this.drawTime = new Date().getTime();
  }
}
const data = new Data();

const vec = (landmark: h.NormalizedLandmark) => new B.Vector3( // convert holistic landmark to scaled babylonjs vector
  options.scaleX * (landmark?.x || 0),
  options.scaleY * (1 - (landmark?.y || 0)),
  options.scaleZ * (landmark?.z || 0),
);

const drawPath = (parent: string, desc: string, path: B.Vector3[], visibility: number, diameter: number) => {
  if (!meshes[parent] || meshes[parent].isDisposed()) meshes[parent] = new B.AbstractMesh(parent, t.scene);
  const createBone = (name: string) => {
    meshes[name] = B.MeshBuilder.CreateTube(name, { path, radius: data.radius[name], updatable: true, cap: 1, sideOrientation: B.Mesh.DEFAULTSIDE }, t.scene); // create new tube
    meshes[name].material = t.material;
    meshes[name].parent = meshes[parent];
    t.shadows.addShadowCaster(meshes[name], false);
  };
  const createJoint = (name: string) => {
    meshes[name] = B.MeshBuilder.CreateSphere(name, { diameter }, t.scene); // diameter is fixed and we change scale later
    meshes[name].material = t.material;
    meshes[name].parent = meshes[parent];
    meshes[name].renderingGroupId = 0;
    meshes[name].renderOverlay = true;
    meshes[name].overlayColor = B.Color3.FromHexString('#000');
  };
  const boneName = desc;
  const jointName = desc + '-joint';
  if (!meshes[boneName] || meshes[boneName].isDisposed()) { // pose part seen for the first time
    createBone(boneName);
    createJoint(jointName);
  }
  meshes[boneName].visibility = visibility;
  meshes[boneName].setEnabled(options.renderBones ? (visibility > 0) : false);
  meshes[jointName].visibility = visibility;
  meshes[jointName].setEnabled(options.renderJoints ? (visibility > 0) : false);
  data.radius[boneName] = diameter / 2;
  data.newPath[boneName] = path;
  data.radius[jointName] = diameter;
  data.newPos[jointName] = data.newPath[boneName][0];
};

async function drawRibbon(parent: string, desc: string, path: B.Vector3[][], visibility: number) {
  if (!meshes[parent] || meshes[parent].isDisposed()) meshes[parent] = new B.AbstractMesh(parent, t.scene);
  const pathArray = path.map((vertical) => {
    const double = vertical.slice();
    for (let i = 0; i < vertical.length; i++) double.push(vertical[i].clone());
    for (let i = 0; i < double.length; i++) double[i].addInPlaceFromFloats(0, 0, (i < vertical.length ? 1 : -1) * options.baseRadius / 2);
    return double;
  });
  const name = parent + '-' + desc;
  if (!meshes[name] || meshes[name].isDisposed()) {
    meshes[name] = B.MeshBuilder.CreateRibbon(name, { pathArray, closeArray: false, closePath: false, updatable: true, sideOrientation: B.Mesh.FRONTSIDE }, t.scene);
    meshes[name].parent = meshes[parent];
    meshes[name].material = t.material;
    meshes[name].receiveShadows = false;
    t.shadows.addShadowCaster(meshes[name], false);
    faceVertexData = undefined;
  }
  meshes[name] = B.MeshBuilder.CreateRibbon(name, { pathArray, updatable: true, instance: meshes[name] as B.Mesh }, t.scene);
  meshes[name].visibility = visibility;
  meshes[name].setEnabled(options.renderSurface ? (visibility > 0) : false);
}

async function drawTorso(result: h.NormalizedLandmarkList) {
  const visibility = options.renderBones ? 0.8 : 0;
  const verticals = [ // torso
    [vec(result?.[h.POSE_LANDMARKS.LEFT_SHOULDER]), vec(result?.[h.POSE_LANDMARKS.LEFT_HIP])],
    [vec(result?.[h.POSE_LANDMARKS.RIGHT_SHOULDER]), vec(result?.[h.POSE_LANDMARKS.RIGHT_HIP])],
  ];
  // drawRibbon('pose', 'torso', verticals, visibility);
}

const poseName: string[] = [];
function buildPoseNames() {
  const landmarks = Object.keys(h.POSE_LANDMARKS);
  for (let i = 0; i < h.POSE_CONNECTIONS.length; i++) {
    poseName.push(landmarks[h.POSE_CONNECTIONS[i]?.[0]].toLowerCase() + '-' + landmarks[h.POSE_CONNECTIONS[i]?.[1]].toLowerCase());
  }
}

async function createPose(result: h.NormalizedLandmarkList) {
  for (let i = 0; i < h.POSE_CONNECTIONS.length; i++) {
    if (!result?.[h.POSE_CONNECTIONS[i]?.[0]] || !result?.[h.POSE_CONNECTIONS[i]?.[1]]) continue;
    const v0 = result?.[h.POSE_CONNECTIONS[i]?.[0]];
    const v1 = result?.[h.POSE_CONNECTIONS[i]?.[1]];
    const pathL = [vec(v0), vec(v1)];
    const pathR = [vec(v1), vec(v0)];
    const visibility = Math.min(v0?.visibility || 0, v1?.visibility || 0);
    drawPath('pose', `${poseName[i]}-l`, pathL, visibility, options.baseRadius);
    drawPath('pose', `${poseName[i]}-r`, pathR, visibility, options.baseRadius);
  }
  const parent = meshes['pose'];
  const childMeshes = parent.getChildMeshes();
  let min = childMeshes[0].getBoundingInfo().boundingBox.minimumWorld;
  let max = childMeshes[0].getBoundingInfo().boundingBox.maximumWorld;
  for (let i = 0; i < childMeshes.length; i++) {
    const meshMin = childMeshes[i].getBoundingInfo().boundingBox.minimumWorld;
    const meshMax = childMeshes[i].getBoundingInfo().boundingBox.maximumWorld;
    min = B.Vector3.Minimize(min, meshMin);
    max = B.Vector3.Maximize(max, meshMax);
  }
  parent.setBoundingInfo(new B.BoundingInfo(min, max));
  // parent.showBoundingBox = true;
}

async function drawPalm(result: h.NormalizedLandmarkList, which: 'left' | 'right') {
  const visibility = (options.renderHands && result?.[0] && result?.[5] && result?.[17]) ? 0.4 : 0;
  const verticals = [ // palm triangle
    [vec(result?.[0]), vec(result?.[5])],
    [vec(result?.[0]), vec(result?.[17])],
  ];
  drawRibbon(`hand-${which}`, 'palm', verticals, visibility);
}

async function createHand(result: h.NormalizedLandmarkList, which: 'left' | 'right') {
  for (let i = 0; i < h.HAND_CONNECTIONS.length; i++) {
    const v0 = result?.[h.HAND_CONNECTIONS[i]?.[0]];
    const v1 = result?.[h.HAND_CONNECTIONS[i]?.[1]];
    const pathL = [vec(v0), vec(v1)];
    const pathR = [vec(v1), vec(v0)];
    const visibility = (v0 && v1 && options.renderHands) ? 1 : 0;
    drawPath(`hand-${which}`, `hand-${i}-l`, pathL, visibility, options.baseRadius / 4);
    drawPath(`hand-${which}`, `hand-${i}-r`, pathR, visibility, options.baseRadius / 4);
  }
}

async function drawFace(result: h.NormalizedLandmarkList) {
  if (!result || (result.length < 468) || !options.renderFace) {
    if (meshes.face && !meshes.face.isDisposed()) meshes.face.visibility = 0;
    return;
  }
  if (previousSmooth !== options.smoothFace) {
    if (meshes.face && !meshes.face.isDisposed()) meshes.face.dispose();
    previousSmooth = options.smoothFace;
  }
  if (!meshes.face || meshes.face.isDisposed()) { // create new face
    meshes.face = new B.Mesh('face', t.scene);
    meshes.face.renderingGroupId = 2;
    meshes.face.material = t.material;
    meshes.face.alwaysSelectAsActiveMesh = true;
    t.shadows.addShadowCaster(meshes.face, false);
  }
  meshes.face.visibility = 1;

  const positions = new Float32Array(3 * 468);
  for (let i = 0; i < 468; i++) { // flatten and invert-y
    positions[3 * i + 0] = options.scaleX * result[i].x; // x
    positions[3 * i + 1] = options.scaleY * (1 - result[i].y); // y
    positions[3 * i + 2] = options.scaleZ * 2 * result[i].z; // z
  }

  // create vertex buffer if on first access
  if (!faceVertexData) {
    faceVertexData = new B.VertexData();
    faceVertexData.positions = positions;
    faceVertexData.indices = TRI468;
    faceVertexData.uvs = UV468.flat();
    if (options.smoothFace) {
      const normals: number[] = [];
      B.VertexData.ComputeNormals(positions, TRI468, normals);
      faceVertexData.normals = normals;
    } else {
      faceVertexData.normals = null;
    }
    faceVertexData.applyToMesh(meshes.face as B.Mesh, true);
  }
  meshes.face.updateVerticesData(B.VertexBuffer.PositionKind, positions, true);
}

async function repositionHands(result: h.NormalizedLandmarkList) {
  if (meshes['hand-right']) {
    const wrist = vec(result?.[h.POSE_LANDMARKS.RIGHT_WRIST]);
    data.newPos['hand-right'] = options.connectHands ? new B.Vector3(0, 0, wrist.z) : new B.Vector3(0, 0, 0);
  }
  if (meshes['hand-left']) {
    const wrist = vec(result?.[h.POSE_LANDMARKS.LEFT_WRIST]);
    data.newPos['hand-left'] = options.connectHands ? new B.Vector3(0, 0, wrist.z) : new B.Vector3(0, 0, 0);
  }
}

async function repositionFace(result: h.NormalizedLandmarkList) {
  const nose = result?.[h.POSE_LANDMARKS.NOSE];
  if (!meshes['face'] || !meshes['left_shoulder-right_shoulder-l'] || !nose) return;
  const noseVec = vec(nose);
  const centerShouldersVec = meshes['left_shoulder-right_shoulder-l'].getBoundingInfo().boundingBox.center;
  noseVec.addInPlace(centerShouldersVec);
  noseVec.divideInPlace(new B.Vector3(2, 2, 4));
  data.newPos['face'] = new B.Vector3(0, 0, options.connectFace ? noseVec.z : 0); // reposition face
  if (!meshes['neckline0'] || options.continousFocus) {
    t.camera.setTarget(noseVec); // set camera initial focus on nose
    if (meshes['pose']) {
      t.camera.useFramingBehavior = true;
      const bounds = meshes['pose'].getBoundingInfo();
      t.camera.framingBehavior?.zoomOnBoundingInfo(bounds.boundingBox.minimumWorld, bounds.boundingBox.maximumWorld);
    }
  }
  drawPath('neck', 'line-l', [noseVec, centerShouldersVec], 1, options.baseRadius); // draw neck
  drawPath('neck', 'line-r', [centerShouldersVec, noseVec], 1, options.baseRadius); // draw neck
}

function performRender() {
  data.interpolate();
  data.draw();
}

export function setDraw3dOptions(newOptions) {
  if (options && (newOptions.baseRadius !== options.baseRadius)) Object.values(meshes).forEach((mesh) => mesh.dispose());
  options = newOptions;
  if (!t?.scene) return;
  t.inspector(newOptions.showInspector);
}

export function initDraw3D(canvasOutput: HTMLCanvasElement, newOptions) {
  if (!t) t = new Scene(canvasOutput);
  for (const mesh of Object.values(meshes)) mesh.dispose();
  meshes = {};
  setDraw3dOptions(newOptions);
  t.scene.registerBeforeRender(() => performRender());
  log('initScene', t);
  showLoader(t);
  initEvents(t);
  if (poseName.length === 0) buildPoseNames();
  // setInterval(() => t.scene.render(), 200);
}

export async function draw3D(results: h.Results) {
  hideLoader();
  createPose(results.poseLandmarks);
  drawTorso(results.poseLandmarks);
  createHand(results.leftHandLandmarks, 'left');
  createHand(results.rightHandLandmarks, 'right');
  drawPalm(results.leftHandLandmarks, 'left');
  drawPalm(results.rightHandLandmarks, 'right');
  repositionHands(results.poseLandmarks);
  drawFace(results.faceLandmarks);
  repositionFace(results.poseLandmarks);
  data.updateTime = new Date().getTime();
}
