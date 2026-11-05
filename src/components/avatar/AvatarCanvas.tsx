"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import FriendModel, { type MorphMeshInfo } from "./FriendModel";
import { AvatarCustomization } from "../../types/avatar";

export default function AvatarCanvas({
  speakingLevel,
  customization,
}: {
  speakingLevel: number;
  customization?: AvatarCustomization;
}) {
  const [meshes, setMeshes] = useState<MorphMeshInfo[]>([]);
  const [mesh, setMesh] = useState("");
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState(1);

  const receiveMeshes = useCallback((items: MorphMeshInfo[]) => {
    setMeshes(items);
    setMesh((current) =>
      items.some((item) => item.name === current)
        ? current
        : items[0]?.name ?? ""
    );
  }, []);

  useEffect(() => {
    const selected = meshes.find((item) => item.name === mesh);
    const maxIndex = Math.max(0, (selected?.morphCount ?? 1) - 1);

    if (index > maxIndex) setIndex(0);
  }, [meshes, mesh, index]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100dvh",
        zIndex: 0,
        background: "#101116",
      }}
    >
      <Canvas camera={{ position: [0, 1.35, 2.4], fov: 35 }}>
        <color attach="background" args={["#101116"]} />
        <ambientLight intensity={0.12} />
        <directionalLight position={[2, 4, 3]} intensity={0.55} />
        <directionalLight
          position={[-3, 2, 1]}
          intensity={0.38}
          color="#c9d5ff"
        />

        <Suspense fallback={null}>
          <FriendModel
            speakingLevel={speakingLevel}
            testMeshName={mesh}
            testIndex={index}
            testValue={value}
            onMorphMeshes={receiveMeshes}
            customization={customization}
          />
          <Environment preset="apartment" />
        </Suspense>

        <OrbitControls
          enablePan={false}
          enableZoom={false}
          enableRotate={false}
          target={[0, 1.25, 0]}
        />
      </Canvas>
    </div>
  );
}
