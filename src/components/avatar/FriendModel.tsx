"use client";

import { useGLTF } from "@react-three/drei";
import { useCallback, useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type MorphMeshInfo = {
  name: string;
  morphCount: number;
};

export type AvatarCustomizationProps = {
  skinTone?: string;
  eyeColor?: string;
  outfitColor?: string;
  showOuterSuit?: boolean;
};

type FriendModelProps = {
  speakingLevel?: number;
  testMeshName?: string;
  testIndex?: number;
  testValue?: number;
  onMorphMeshes?: (meshes: MorphMeshInfo[]) => void;
  customization?: AvatarCustomizationProps;
};

type ArmPose = {
  leftUpper: THREE.Bone;
  rightUpper: THREE.Bone;
  leftLower?: THREE.Bone;
  rightLower?: THREE.Bone;
  leftHand?: THREE.Bone;
  rightHand?: THREE.Bone;
  leftUpperRest: THREE.Quaternion;
  rightUpperRest: THREE.Quaternion;
  leftLowerRest?: THREE.Quaternion;
  rightLowerRest?: THREE.Quaternion;
  leftHandRest?: THREE.Quaternion;
  rightHandRest?: THREE.Quaternion;
};

type HeadPose = {
  head?: THREE.Bone;
  neck?: THREE.Bone;
  spine?: THREE.Bone;
  headRest?: THREE.Quaternion;
  neckRest?: THREE.Quaternion;
  spineRest?: THREE.Quaternion;
};

type Beat = { t: number; dur: number; amp: number };

const _qOffset = new THREE.Quaternion();
const _qTarget = new THREE.Quaternion();

const sstep = (x: number) => x * x * (3 - 2 * x);
// quick rise, slow fall
const beatEnvelope = (p: number) =>
  p < 0.3 ? sstep(p / 0.3) : 1 - sstep((p - 0.3) / 0.7);

const DEBUG_HOLD_POSE = false;

// Local rotation axes per motion.
const GA = {
  upperLift: new THREE.Vector3(1, 0, 0), // arm swings forward
  upperOut: new THREE.Vector3(0, 0, 1),  // arm swings outward
  elbow: new THREE.Vector3(1, 0, 0),     // forearm bends up
  twist: new THREE.Vector3(0, 1, 0),     // forearm rotates
  wrist: new THREE.Vector3(0, 0, 1),     // wrist flicks
};

const SIDE_SIGN = {
  left: { lift: 1, out: 1, elbow: 1, wrist: 1, twist: 1 },
  right: { lift: 1, out: -1, elbow: 1, wrist: -1, twist: -1 },
};

function applyOffsets(
  bone: THREE.Bone,
  rest: THREE.Quaternion,
  offsets: Array<[THREE.Vector3, number]>,
  k: number
) {
  _qTarget.copy(rest);
  for (const [axis, angle] of offsets) {
    _qOffset.setFromAxisAngle(axis, angle);
    _qTarget.multiply(_qOffset);
  }
  bone.quaternion.slerp(_qTarget, k);
}

function aimBone(
  bone: THREE.Bone,
  child: THREE.Object3D,
  dirWorld: THREE.Vector3
) {
  bone.updateWorldMatrix(true, true);

  const bonePos = new THREE.Vector3();
  const childPos = new THREE.Vector3();
  bone.getWorldPosition(bonePos);
  child.getWorldPosition(childPos);

  const current = childPos.sub(bonePos).normalize();
  const worldDelta = new THREE.Quaternion().setFromUnitVectors(
    current,
    dirWorld.clone().normalize()
  );

  const parentQ = new THREE.Quaternion();
  bone.parent!.getWorldQuaternion(parentQ);
  const localDelta = parentQ
    .clone()
    .invert()
    .multiply(worldDelta)
    .multiply(parentQ);

  bone.quaternion.premultiply(localDelta);
  bone.updateWorldMatrix(false, true);
}

function findBone(
  bones: THREE.Bone[],
  patterns: RegExp[]
): THREE.Bone | undefined {
  return bones.find((bone) =>
    patterns.some((pattern) => pattern.test(bone.name))
  );
}

// Meshes that share the 148 blendshape targets (face, eyelashes, tearlines, occlusions)
const FACIAL_MESH_NAMES = [
  "Object_9",
  "Object_10",
  "Object_11",
  "Object_12",
  "Object_13",
  "Object_14",
];

export default function FriendModel({
  speakingLevel = 0,
  testMeshName,
  testIndex,
  testValue,
  onMorphMeshes,
  customization,
}: FriendModelProps) {
  const { scene } = useGLTF("/models/mira.glb");

  const armPose = useRef<ArmPose | null>(null);
  const headPose = useRef<HeadPose | null>(null);
  const gestureTime = useRef(0);

  // Gesture state
  const beats = useRef<{ left: Beat | null; right: Beat | null }>({
    left: null,
    right: null,
  });
  const nextBeat = useRef(0.4);
  const speakHold = useRef(0);
  const speakBlend = useRef(0);
  const levelAvg = useRef(0);

  // Expression & Blinking state
  const browRaise = useRef(0);
  const smileAmount = useRef(0.18);
  const blinkState = useRef({
    timer: 2.5,
    isBlinking: false,
    progress: 0,
    duration: 0.16,
    isDouble: false,
  });

  // Cached materials for customization
  const clonedMaterials = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map());

  const reportMeshes = useCallback(() => {
    const result: MorphMeshInfo[] = [];

    scene.traverse((object) => {
      if (
        object instanceof THREE.Mesh &&
        object.morphTargetInfluences &&
        object.morphTargetInfluences.length > 0
      ) {
        result.push({
          name: object.name,
          morphCount: object.morphTargetInfluences.length,
        });
      }
    });

    onMorphMeshes?.(result);
  }, [scene, onMorphMeshes]);

  // Rig initialization (Armature + Head/Neck/Spine)
  useEffect(() => {
    reportMeshes();

    const bones: THREE.Bone[] = [];

    scene.traverse((object) => {
      if (object instanceof THREE.Bone) {
        bones.push(object);
      }
    });

    const leftUpper = findBone(bones, [
      /^mixamorig:?leftarm(?:_armature)?$/i,
      /^leftupperarm(?:_armature)?$/i,
      /^leftarm(?:_armature)?$/i,
      /^CC_Base_L_Upperarm_/i,
    ]);

    const rightUpper = findBone(bones, [
      /^mixamorig:?rightarm(?:_armature)?$/i,
      /^rightupperarm(?:_armature)?$/i,
      /^rightarm(?:_armature)?$/i,
      /^CC_Base_R_Upperarm_/i,
    ]);

    const leftLower = findBone(bones, [
      /^mixamorig:?leftforearm(?:_armature)?$/i,
      /^leftlowerarm(?:_armature)?$/i,
      /^leftforearm(?:_armature)?$/i,
      /^CC_Base_L_Forearm_/i,
    ]);

    const rightLower = findBone(bones, [
      /^mixamorig:?rightforearm(?:_armature)?$/i,
      /^rightlowerarm(?:_armature)?$/i,
      /^rightforearm(?:_armature)?$/i,
      /^CC_Base_R_Forearm_/i,
    ]);

    const leftHand = findBone(bones, [
      /^mixamorig:?lefthand(?:_armature)?$/i,
      /^lefthand(?:_armature)?$/i,
      /^CC_Base_L_Hand_/i,
    ]);

    const rightHand = findBone(bones, [
      /^mixamorig:?righthand(?:_armature)?$/i,
      /^righthand(?:_armature)?$/i,
      /^CC_Base_R_Hand_/i,
    ]);

    const headBone = findBone(bones, [
      /^CC_Base_Head/i,
      /^mixamorig:?head/i,
      /^head/i,
    ]);

    const neckBone = findBone(bones, [
      /^CC_Base_Neck/i,
      /^mixamorig:?neck/i,
      /^neck/i,
    ]);

    const spineBone = findBone(bones, [
      /^CC_Base_Spine02/i,
      /^CC_Base_Spine01/i,
      /^mixamorig:?spine/i,
    ]);

    if (leftUpper && rightUpper) {
      scene.updateMatrixWorld(true);

      const leftElbow = leftLower ?? leftHand;
      const rightElbow = rightLower ?? rightHand;

      if (leftElbow)
        aimBone(leftUpper, leftElbow, new THREE.Vector3(0.12, -1, 0.06));
      if (rightElbow)
        aimBone(rightUpper, rightElbow, new THREE.Vector3(-0.12, -1, 0.06));

      if (leftLower && leftHand)
        aimBone(leftLower, leftHand, new THREE.Vector3(0.08, -0.85, 0.5));
      if (rightLower && rightHand)
        aimBone(rightLower, rightHand, new THREE.Vector3(-0.08, -0.85, 0.5));

      armPose.current = {
        leftUpper,
        rightUpper,
        leftLower,
        rightLower,
        leftHand,
        rightHand,
        leftUpperRest: leftUpper.quaternion.clone(),
        rightUpperRest: rightUpper.quaternion.clone(),
        leftLowerRest: leftLower?.quaternion.clone(),
        rightLowerRest: rightLower?.quaternion.clone(),
        leftHandRest: leftHand?.quaternion.clone(),
        rightHandRest: rightHand?.quaternion.clone(),
      };
    }

    if (headBone || neckBone || spineBone) {
      headPose.current = {
        head: headBone,
        neck: neckBone,
        spine: spineBone,
        headRest: headBone?.quaternion.clone(),
        neckRest: neckBone?.quaternion.clone(),
        spineRest: spineBone?.quaternion.clone(),
      };
    }

    return () => {
      armPose.current = null;
      headPose.current = null;
    };
  }, [scene, reportMeshes]);

  // Apply Appearance Customizations (Dressing up, skin, eyes, outfit)
  useEffect(() => {
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;

      // Outer suit visibility toggle
      if (
        object.name === "Clothing_Tee" ||
        object.name.includes("sci_fi_girl")
      ) {
        if (customization?.showOuterSuit !== undefined) {
          object.visible = customization.showOuterSuit;
        }
      }

      // Material cloning & color customization
      const mat = object.material as THREE.MeshStandardMaterial;
      if (!mat || !mat.name) return;

      if (!clonedMaterials.current.has(mat.name)) {
        const cloned = mat.clone();
        clonedMaterials.current.set(mat.name, cloned);
        object.material = cloned;
      }

      const activeMat = object.material as THREE.MeshStandardMaterial;

      // Skin tint
      if (
        customization?.skinTone &&
        (activeMat.name.includes("Skin_Head") ||
          activeMat.name.includes("Skin_Body") ||
          activeMat.name.includes("Skin_Arm") ||
          activeMat.name.includes("Skin_Leg"))
      ) {
        activeMat.color.set(customization.skinTone);
      }

      // Eye iris tint
      if (
        customization?.eyeColor &&
        (activeMat.name.includes("Eye_R") || activeMat.name.includes("Eye_L"))
      ) {
        activeMat.color.set(customization.eyeColor);
      }

      // Outfit color tint
      if (
        customization?.outfitColor &&
        (
          activeMat.name.includes("material") ||
          activeMat.name.includes("Clothing_Tee"))
      ) {
        activeMat.color.set(customization.outfitColor);
      }
    });
  }, [scene, customization]);

  // Manual Tester support
  useEffect(() => {
    if (!testMeshName) return;

    const morphMeshes: THREE.Mesh[] = [];
    scene.traverse((object) => {
      if (
        object instanceof THREE.Mesh &&
        object.morphTargetInfluences &&
        object.morphTargetInfluences.length > 0
      ) {
        morphMeshes.push(object);
      }
    });

    const target = morphMeshes.find((item) => item.name === testMeshName);
    if (!target?.morphTargetInfluences) return;

    const influences = target.morphTargetInfluences;
    if (testIndex === undefined || testIndex < 0 || testIndex >= influences.length) return;

    influences[testIndex] = THREE.MathUtils.clamp(testValue ?? 1, 0, 1);
  }, [scene, testMeshName, testIndex, testValue]);

  // Main Animation Loop: Lip sync, Blinks, Emotional Expressions, Gestures & Micro-Motion
  useFrame((state, delta) => {
    const level = THREE.MathUtils.clamp(speakingLevel, 0, 1);

    // Track speech hold time so gestures & expressions don't jitter between words
    if (level > 0.035) speakHold.current = 0.35;
    else speakHold.current = Math.max(0, speakHold.current - delta);
    const isSpeaking = speakHold.current > 0;

    speakBlend.current = THREE.MathUtils.damp(
      speakBlend.current,
      isSpeaking ? 1 : 0,
      3,
      delta
    );
    if (isSpeaking) gestureTime.current += delta;
    const t = gestureTime.current;
    const blend = speakBlend.current;

    // Emphasis detection (volume spikes trigger brow raises & gestures)
    const emphasis = level - levelAvg.current > 0.16;
    levelAvg.current = THREE.MathUtils.damp(levelAvg.current, level, 4, delta);

    // ==========================================
    // 1. DYNAMIC EYE BLINK CONTROLLER
    // ==========================================
    const b = blinkState.current;
    if (!b.isBlinking) {
      b.timer -= delta;
      if (b.timer <= 0) {
        b.isBlinking = true;
        b.progress = 0;
        b.duration = 0.14 + Math.random() * 0.05;
        b.isDouble = Math.random() < 0.22;
      }
    } else {
      b.progress += delta / b.duration;
      if (b.progress >= 1) {
        b.isBlinking = false;
        b.progress = 0;
        if (b.isDouble) {
          b.isDouble = false;
          b.timer = 0.16 + Math.random() * 0.1; // rapid follow-up blink
        } else {
          b.timer = 2.8 + Math.random() * 3.2; // next regular blink in 2.8-6s
        }
      }
    }
    const blinkWeight = b.isBlinking
      ? Math.sin(Math.min(1, b.progress) * Math.PI)
      : 0;

    // ==========================================
    // 2. EMOTION & MICRO-EXPRESSION CONTROLLER
    // ==========================================
    // Brow raise on emphasis, relaxes slowly
    if (emphasis) {
      browRaise.current = THREE.MathUtils.clamp(browRaise.current + 0.35, 0, 0.65);
    } else {
      browRaise.current = THREE.MathUtils.damp(
        browRaise.current,
        isSpeaking ? 0.12 : 0,
        3.5,
        delta
      );
    }

    // Warm resting smile when companion is active
    smileAmount.current = THREE.MathUtils.damp(
      smileAmount.current,
      isSpeaking ? 0.28 : 0.18,
      2,
      delta
    );

    // ==========================================
    // 3. SYNCHRONIZED FACIAL MORPH INFLUENCES
    // ==========================================
    // Collect all facial meshes (Face + Eyelashes + Tearlines + Occlusions)
    const faceMeshes: THREE.Mesh[] = [];
    scene.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh &&
        FACIAL_MESH_NAMES.includes(obj.name) &&
        obj.morphTargetInfluences &&
        obj.morphTargetInfluences.length > 140
      ) {
        faceMeshes.push(obj);
      }
    });

    if (faceMeshes.length > 0) {
      // Procedural viseme oscillator for phonetic variation
      const phonemeSway = Math.sin(t * 13) * 0.2 * level;
      const jawDropTarget = level > 0.04 ? level * 0.8 + phonemeSway : 0;
      const mouthWidthTarget = level > 0.04 ? level * 0.5 + Math.cos(t * 11) * 0.15 * level : 0;
      const mouthParting = level > 0.04 ? 0 : 0.75;
      const roundedLipsTarget = Math.max(0, Math.sin(t * 7)) * 0.22 * level;

      for (const mesh of faceMeshes) {
        const morphs = mesh.morphTargetInfluences!;

        const dampMorph = (idx: number, target: number, speed = 14) => {
          if (idx < morphs.length) {
            morphs[idx] = THREE.MathUtils.damp(morphs[idx], target, speed, delta);
          }
        };

        // --- Eye Blinks ---
        dampMorph(16, blinkWeight, 28); // Eye Blink Right
        dampMorph(17, blinkWeight, 28); // Eye Blink Left
        dampMorph(18, blinkWeight * 0.25, 24); // Eye Squint Right
        dampMorph(19, blinkWeight * 0.25, 24); // Eye Squint Left

        // --- Eyebrows (Emphasis & Attention) ---
        dampMorph(8, browRaise.current, 10); // Brow Inner Up Right
        dampMorph(9, browRaise.current, 10); // Brow Inner Up Left
        dampMorph(10, browRaise.current * 0.7, 10); // Brow Outer Up Right
        dampMorph(11, browRaise.current * 0.7, 10); // Brow Outer Up Left

        // --- Smiling / Warmth ---
        dampMorph(66, smileAmount.current, 6); // Mouth Smile Right
        dampMorph(67, smileAmount.current, 6); // Mouth Smile Left

        // --- Speaking Visemes (Phonetic Articulation) ---
        dampMorph(117, jawDropTarget, 16);     // Primary Open Viseme
        dampMorph(139, jawDropTarget * 0.6, 16); // Jaw Down
        dampMorph(114, mouthWidthTarget, 14);  // Vowel Width
        dampMorph(115, mouthParting, 8);       // Neutral Rest Parting
        dampMorph(3, roundedLipsTarget, 12);    // Pucker / Round O Shape
      }
    }

    // ==========================================
    // 4. HEAD, NECK & BREATHING MICRO-MOTION
    // ==========================================
    const hp = headPose.current;
    if (hp) {
      const now = state.clock.elapsedTime;
      const kPose = 1 - Math.exp(-6 * delta);

      // Spine gentle breathing cycle
      if (hp.spine && hp.spineRest) {
        const breathPitch = Math.sin(now * 1.6) * 0.012;
        applyOffsets(
          hp.spine,
          hp.spineRest,
          [[new THREE.Vector3(1, 0, 0), breathPitch]],
          kPose
        );
      }

      // Neck and Head micro-tilts & nodding
      // Head nodding and gentle tilts
if (hp.head && hp.headRest) {
  const nod = isSpeaking
    ? Math.sin(t * 3.5) * 0.12 * blend
    : Math.sin(now * 0.8) * 0.025;

  const tilt = isSpeaking
    ? Math.sin(t * 1.2) * 0.04 * blend
    : Math.sin(now * 0.4) * 0.015;

  applyOffsets(
    hp.head,
    hp.headRest,
    [
      [new THREE.Vector3(1, 0, 0), nod],
      [new THREE.Vector3(0, 0, 1), tilt],
    ],
    kPose
  );
}
    }

    // ==========================================
    // 5. PROCEDURAL ARM GESTURES
    // ==========================================
    const pose = armPose.current;
    if (!pose) return;

    nextBeat.current -= delta;
    if (
      isSpeaking &&
      (nextBeat.current <= 0 || (emphasis && nextBeat.current < 0.8))
    ) {
      nextBeat.current = 0.9 + Math.random() * 1.4;

      const make = (): Beat => ({
        t: 0,
        dur: 0.9 + Math.random() * 0.5,
        amp: Math.min(1, 0.55 + Math.random() * 0.35 + level * 0.3),
      });

      const r = Math.random();
      if (r < 0.4) {
        if (!beats.current.right) beats.current.right = make();
      } else if (r < 0.8) {
        if (!beats.current.left) beats.current.left = make();
      } else {
        if (!beats.current.right) beats.current.right = make();
        if (!beats.current.left) beats.current.left = make();
      }
    }

    const stepBeat = (side: "left" | "right") => {
      const b = beats.current[side];
      if (!b) return 0;
      b.t += delta;
      const p = b.t / b.dur;
      if (p >= 1) {
        beats.current[side] = null;
        return 0;
      }
      return beatEnvelope(p) * b.amp;
    };

    const k = 1 - Math.exp(-8 * delta);

    const hands = [
      {
        side: "left" as const,
        phase: 0,
        upper: pose.leftUpper,
        lower: pose.leftLower,
        hand: pose.leftHand,
        upperRest: pose.leftUpperRest,
        lowerRest: pose.leftLowerRest,
        handRest: pose.leftHandRest,
      },
      {
        side: "right" as const,
        phase: 2.1,
        upper: pose.rightUpper,
        lower: pose.rightLower,
        hand: pose.rightHand,
        upperRest: pose.rightUpperRest,
        lowerRest: pose.rightLowerRest,
        handRest: pose.rightHandRest,
      },
    ];

    for (const h of hands) {
      const s = SIDE_SIGN[h.side];
      const env = DEBUG_HOLD_POSE ? 1 : stepBeat(h.side);
      const sway = Math.sin(t * 1.3 + h.phase) * 0.03 * blend;

      applyOffsets(
        h.upper,
        h.upperRest,
        [
          [GA.upperLift, s.lift * (env * 0.3 + sway)],
          [GA.upperOut, s.out * env * 0.1],
        ],
        k
      );

      if (h.lower && h.lowerRest) {
        applyOffsets(
          h.lower,
          h.lowerRest,
          [
            [GA.elbow, s.elbow * (env * 0.7 + blend * 0.12)],
            [GA.twist, s.twist * env * 0.3 * Math.sin(t * 1.7 + h.phase)],
          ],
          k
        );
      }

      if (h.hand && h.handRest) {
        applyOffsets(
          h.hand,
          h.handRest,
          [
            [
              GA.wrist,
              s.wrist *
                (env * 0.25 + Math.sin(t * 3.1 + h.phase) * 0.07 * blend),
            ],
          ],
          k
        );
      }
    }
  });

  return <primitive object={scene} scale={1} position={[0, -1.6, 0]} />;
}

useGLTF.preload("/models/mira.glb");
