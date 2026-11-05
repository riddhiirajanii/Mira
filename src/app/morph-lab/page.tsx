
"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

type MorphMeshInfo = {
  name: string;
  count: number;
};

type MorphTarget = {
  mesh: string;
  index: number;
  strength: number;
  description: string;
  status: string;
  neutralScreenshot?: string;
  screenshot?: string;
};

function MiraScanner({
  selectedMesh,
  selectedIndex,
  strength,
  onMeshesFound,
  onSceneReady,
}: {
  selectedMesh: string;
  selectedIndex: number;
  strength: number;
  onMeshesFound: (meshes: MorphMeshInfo[]) => void;
  onSceneReady: (scene: THREE.Group) => void;
}) {
  const { scene } = useGLTF("/models/mira.glb");

  useEffect(() => {
    const found: MorphMeshInfo[] = [];

    scene.traverse((object) => {
      if (
        object instanceof THREE.Mesh &&
        object.morphTargetInfluences &&
        object.morphTargetInfluences.length > 0
      ) {
        found.push({
          name: object.name,
          count: object.morphTargetInfluences.length,
        });
      }
    });

    onMeshesFound(found);
    onSceneReady(scene);
  }, [scene, onMeshesFound, onSceneReady]);

  useEffect(() => {
    scene.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        !object.morphTargetInfluences
      ) {
        return;
      }

      object.morphTargetInfluences.fill(0);

      if (object.name === selectedMesh) {
        if (
          selectedIndex >= 0 &&
          selectedIndex < object.morphTargetInfluences.length
        ) {
          object.morphTargetInfluences[selectedIndex] = strength;
        }
      }
    });
  }, [scene, selectedMesh, selectedIndex, strength]);

  return (
    <primitive
      object={scene}
      scale={1}
      position={[0, -1.6, 0]}
    />
  );
}

function SceneCapture({
  onCanvasReady,
}: {
  onCanvasReady: (canvas: HTMLCanvasElement) => void;
}) {
  const { gl } = useThree();

  useEffect(() => {
    onCanvasReady(gl.domElement);
  }, [gl, onCanvasReady]);

  return null;
}

function waitForRender() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export default function MorphLabPage() {
  const [meshes, setMeshes] = useState<MorphMeshInfo[]>([]);
  const [mesh, setMesh] = useState("Object_9");
  const [index, setIndex] = useState(0);
  const [strength, setStrength] = useState(0);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<MorphTarget[]>([]);
  const [message, setMessage] = useState("Loading Mira's morph targets...");

  const sceneRef = useRef<THREE.Group | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runningRef = useRef(false);

  const onMeshesFound = useCallback((found: MorphMeshInfo[]) => {
    setMeshes(found);

    if (found.length > 0) {
      setMesh((current) =>
        found.some((item) => item.name === current)
          ? current
          : found[0].name
      );
      setMessage(`Found ${found.length} meshes with morph targets.`);
    } else {
      setMessage("No morph targets were found.");
    }
  }, []);

  const onSceneReady = useCallback((scene: THREE.Group) => {
    sceneRef.current = scene;
  }, []);

  const onCanvasReady = useCallback((canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
  }, []);

  const selectedMeshInfo = meshes.find((item) => item.name === mesh);
  const maxIndex = Math.max(0, (selectedMeshInfo?.count ?? 1) - 1);

  function changeMesh(nextMesh: string) {
    setMesh(nextMesh);
    setIndex(0);
    setStrength(0);
  }

  function downloadFile(
    filename: string,
    contents: string,
    type: string
  ) {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadInventory() {
    const inventory = meshes.map((item) => ({
      mesh: item.name,
      morphCount: item.count,
      targets: Array.from({ length: item.count }, (_, i) => ({
        index: i,
        description: "",
        status: "unlabelled",
      })),
    }));

    downloadFile(
      "mira-morph-inventory.json",
      JSON.stringify(inventory, null, 2),
      "application/json"
    );
  }

  async function startSweep() {
    const canvas = canvasRef.current;

    if (!sceneRef.current || !canvas || runningRef.current) {
      setMessage("Mira is not ready yet. Try again in a moment.");
      return;
    }

    const targetMesh = meshes.find((item) => item.name === mesh);

    if (!targetMesh) {
      setMessage("Please select a valid mesh.");
      return;
    }

    runningRef.current = true;
    setRunning(true);
    setProgress(0);
    setResults([]);
    setMessage("Capturing neutral reference...");

    const discovered: MorphTarget[] = [];

    try {
      // Step 1: Reset all morphs and capture the neutral face.
      setIndex(0);
      setStrength(0);

      await waitForRender();
      await new Promise((resolve) => setTimeout(resolve, 150));

      const neutralCanvas = canvasRef.current;

      if (!neutralCanvas) {
        throw new Error("The WebGL canvas is unavailable.");
      }

      const neutralScreenshot = neutralCanvas.toDataURL("image/png");

      // Step 2: Capture each individual morph at full strength.
      for (let i = 0; i < targetMesh.count; i++) {
        if (!runningRef.current) break;

        setIndex(i);
        setStrength(1);

        await waitForRender();
        await new Promise((resolve) => setTimeout(resolve, 100));

        const currentCanvas = canvasRef.current;

        if (!currentCanvas) {
          throw new Error("The WebGL canvas is unavailable.");
        }

        const screenshot = currentCanvas.toDataURL("image/png");

        const result: MorphTarget = {
          mesh,
          index: i,
          strength: 1,
          description: "",
          status: "needs_review",
          neutralScreenshot,
          screenshot,
        };

        discovered.push(result);
        setResults([...discovered]);
        setProgress(
          Math.round(((i + 1) / targetMesh.count) * 100)
        );
        setMessage(
          `Comparing morph ${i + 1} of ${targetMesh.count} against neutral...`
        );
      }

      if (discovered.length > 0) {
        downloadFile(
          `mira-${mesh}-morph-comparisons.json`,
          JSON.stringify(
            {
              mesh,
              totalTargets: discovered.length,
              comparisonMethod: "neutral_vs_individual_morph",
              neutralReference: neutralScreenshot,
              camera: {
                position: [0, 1.35, 2.4],
                fov: 35,
                note: "Keep the camera and lighting fixed when comparing images.",
              },
              generatedAt: new Date().toISOString(),
              targets: discovered,
            },
            null,
            2
          ),
          "application/json"
        );

        setMessage(
          `Finished! Captured ${discovered.length} morph comparisons.`
        );
      } else {
        setMessage(
          "Sweep stopped before any morph comparisons were captured."
        );
      }
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error ? error.message : "The sweep failed."
      );
    } finally {
      runningRef.current = false;
      setRunning(false);
      setStrength(0);
    }
  }

  function stopSweep() {
    runningRef.current = false;
    setMessage("Stopping the sweep...");
  }

  function downloadSelectedScreenshot() {
    const target = results.find(
      (item) => item.index === index && item.mesh === mesh
    );

    if (!target?.screenshot) {
      setMessage("Capture this morph first by running the sweep.");
      return;
    }

    downloadFile(
      `${mesh}-morph-${index}.png`,
      target.screenshot,
      "image/png"
    );
  }

  function downloadSelectedComparison() {
    const target = results.find(
      (item) => item.index === index && item.mesh === mesh
    );

    if (!target?.neutralScreenshot || !target.screenshot) {
      setMessage("Capture this morph first to download its comparison.");
      return;
    }

    downloadFile(
      `${mesh}-morph-${index}-comparison.json`,
      JSON.stringify(
        {
          mesh: target.mesh,
          index: target.index,
          strength: target.strength,
          neutralScreenshot: target.neutralScreenshot,
          morphScreenshot: target.screenshot,
          description: target.description,
          status: target.status,
        },
        null,
        2
      ),
      "application/json"
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#101116",
        color: "#f5f5f5",
        padding: 24,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>Mira Morph Lab</h1>
        <p style={{ color: "#b6b8c3", lineHeight: 1.6 }}>
          Capture facial morphs with a neutral reference for more reliable
          AI-assisted labeling.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 340px)",
          gap: 20,
        }}
      >
        <section
          style={{
            minHeight: 560,
            overflow: "hidden",
            borderRadius: 16,
            border: "1px solid #333641",
            background: "#181a22",
          }}
        >
          <Canvas
            gl={{ preserveDrawingBuffer: true }}
            camera={{ position: [0, 1.35, 2.4], fov: 35 }}
          >
            <color attach="background" args={["#181a22"]} />
            <ambientLight intensity={0.6} />
            <directionalLight position={[2, 4, 3]} intensity={1.5} />
            <directionalLight
              position={[-3, 2, 1]}
              intensity={0.7}
              color="#c9d5ff"
            />

            <Suspense fallback={null}>
              <MiraScanner
                selectedMesh={mesh}
                selectedIndex={index}
                strength={strength}
                onMeshesFound={onMeshesFound}
                onSceneReady={onSceneReady}
              />
              <SceneCapture onCanvasReady={onCanvasReady} />
              <Environment preset="apartment" />
            </Suspense>

            <OrbitControls
              enablePan={false}
              enableZoom
              enableRotate
              target={[0, 1.25, 0]}
            />
          </Canvas>
        </section>

        <aside
          style={{
            borderRadius: 16,
            border: "1px solid #333641",
            background: "#181a22",
            padding: 18,
            alignSelf: "start",
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: 19 }}>Controls</h2>

          <label style={{ display: "block", marginBottom: 6 }}>
            Mesh
          </label>
          <select
            value={mesh}
            onChange={(event) => changeMesh(event.target.value)}
            disabled={running}
            style={inputStyle}
          >
            {meshes.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name} ({item.count})
              </option>
            ))}
          </select>

          <label style={{ display: "block", margin: "16px 0 6px" }}>
            Morph index: {index} / {maxIndex}
          </label>
          <input
            type="range"
            min={0}
            max={maxIndex}
            value={Math.min(index, maxIndex)}
            onChange={(event) => setIndex(Number(event.target.value))}
            disabled={running}
            style={{ width: "100%" }}
          />

          <label style={{ display: "block", margin: "16px 0 6px" }}>
            Strength: {strength.toFixed(2)}
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={strength}
            onChange={(event) => setStrength(Number(event.target.value))}
            disabled={running}
            style={{ width: "100%" }}
          />

          <button
            onClick={() => {
              setIndex((current) => (current + 1) % (maxIndex + 1));
              setStrength(1);
            }}
            disabled={running || meshes.length === 0}
            style={buttonStyle}
          >
            Next morph
          </button>

          <button
            onClick={downloadInventory}
            disabled={meshes.length === 0 || running}
            style={buttonStyle}
          >
            Export inventory JSON
          </button>

          {!running ? (
            <button
              onClick={startSweep}
              disabled={meshes.length === 0}
              style={{ ...buttonStyle, background: "#8b5cf6" }}
            >
              Sweep selected mesh
            </button>
          ) : (
            <button
              onClick={stopSweep}
              style={{ ...buttonStyle, background: "#b93838" }}
            >
              Stop sweep
            </button>
          )}

          <button
            onClick={downloadSelectedScreenshot}
            style={buttonStyle}
          >
            Download morph screenshot
          </button>

          <button
            onClick={downloadSelectedComparison}
            style={buttonStyle}
          >
            Export selected comparison
          </button>

          <div style={{ marginTop: 18 }}>
            <div
              style={{
                height: 7,
                background: "#30323e",
                borderRadius: 99,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  background: "#8b5cf6",
                  transition: "width 100ms",
                }}
              />
            </div>

            <p
              style={{
                fontSize: 13,
                color: "#c4c5d0",
                lineHeight: 1.6,
                overflowWrap: "anywhere",
              }}
            >
              {message}
            </p>
          </div>
        </aside>
      </div>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20 }}>
          Captured morphs ({results.length})
        </h2>
        <p style={{ color: "#b6b8c3", fontSize: 13, lineHeight: 1.6 }}>
          Each captured target includes both a neutral reference and its
          morphed screenshot. The exported JSON can be used by the labeling
          script.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
            gap: 12,
          }}
        >
          {results.map((item) => (
            <button
              key={`${item.mesh}-${item.index}`}
              onClick={() => {
                setMesh(item.mesh);
                setIndex(item.index);
                setStrength(item.strength);
              }}
              style={{
                padding: 8,
                color: "white",
                textAlign: "left",
                background: "#20222c",
                border: "1px solid #373947",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                }}
              >
                <div>
                  <div style={smallLabelStyle}>NEUTRAL</div>
                  <img
                    src={item.neutralScreenshot}
                    alt={`Neutral reference for morph ${item.index}`}
                    style={previewStyle}
                  />
                </div>
                <div>
                  <div style={smallLabelStyle}>MORPH {item.index}</div>
                  <img
                    src={item.screenshot}
                    alt={`Morph ${item.index}`}
                    style={previewStyle}
                  />
                </div>
              </div>
              <div style={{ paddingTop: 8, fontSize: 13 }}>
                {item.mesh} / {item.index}
              </div>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  padding: 10,
  borderRadius: 8,
  color: "#111",
  background: "#fff",
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 10,
  padding: 11,
  border: 0,
  borderRadius: 8,
  color: "#fff",
  background: "#353747",
  cursor: "pointer",
};

const smallLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#b6b8c3",
  marginBottom: 4,
  letterSpacing: 0.5,
};

const previewStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  aspectRatio: "4 / 3",
  objectFit: "contain",
  background: "#181a22",
  borderRadius: 6,
};
