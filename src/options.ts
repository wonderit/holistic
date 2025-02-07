export const options = {
  // model options
  useCpuInference: false,
  cameraFar: 0,
  cameraNear: 0,
  cameraVerticalFovDegrees: 0,
  modelComplexity: 0,
  smoothLandmarks: false,
  refineFaceLandmarks: true,
  enableFaceGeometry: false,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
  // render options
  showInspector: false,
  boundingBoxes: false,
  renderFace: true,
  connectFace: true,
  smoothFace: true,
  showSkeleton: false,
  renderBones: true,
  renderJoints: true,
  renderHands: true,
  renderSurface: true,
  connectHands: true,
  deleteDuplicates: true,
  fixedRadius: true,
  baseRadius: 0.02,
  lerpAmount: 0,
  extendPath: 0,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 0.35,
  continousFocus: true,
  // sources
  activeSource: 'none',
  sources: [
    { name: 'none', value: 'none' },
    { name: 'webcam', value: 'webcam' },
    { name: 'face', value: '../assets/samples/face.webm' },
    { name: 'streching', value: '../assets/samples/streching.webm' },
    { name: 'yoga', value: '../assets/samples/yoga.webm' },
    { name: 'swimwear', value: '../assets/samples/swimwear.webm' },
  ],
  activeExampleSource: 'stretching',
  exampleSources: [
    { name: 'streching', value: '../assets/samples/streching.webm' },
    { name: 'face', value: '../assets/samples/face.webm' },
    { name: 'yoga', value: '../assets/samples/yoga.webm' },
    { name: 'swimwear', value: '../assets/samples/swimwear.webm' },
  ],
};

export type Options = typeof options;
