"use client";

import { useRef, useState } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import {
  isIrreversibleTask,
  DESKTOP_TOOLS,
  getGeminiDesktopToolDeclarations,
} from "../lib/tasks/safety";
import { PendingTaskApproval } from "../components/tasks/TaskConfirmationModal";

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);

  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(
      i * 2,
      sample < 0 ? sample * 32768 : sample * 32767,
      true
    );
  }

  return buffer;
}

function downsample(
  input: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array {
  if (fromRate === toRate) return input;

  const ratio = fromRate / toRate;
  const output = new Float32Array(Math.floor(input.length / ratio));

  for (let i = 0; i < output.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);

    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];

    output[i] = sum / Math.max(1, end - start);
  }

  return output;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

const MAX_CAPTION_WORDS = 8;
const MIN_CAPTION_MS = 1800;
const MAX_CAPTION_MS = 3600;
const MS_PER_WORD = 320;

function takeCaptionChunks(
  buffer: string,
  force = false
): { chunks: string[]; remainder: string } {
  const chunks: string[] = [];
  let remaining = buffer;

  while (remaining.trim()) {
    remaining = remaining.replace(/^\s+/, "");

    const punctuation = /[.!?,;:](?:["')\]]*)\s+/.exec(remaining);
    if (punctuation && punctuation.index !== undefined) {
      const end = punctuation.index + punctuation[0].trimEnd().length;
      const chunk = remaining.slice(0, end).trim();
      if (chunk) chunks.push(chunk);
      remaining = remaining.slice(punctuation.index + punctuation[0].length);
      continue;
    }

    const wordMatches = [...remaining.matchAll(/\S+/g)];
    if (wordMatches.length >= MAX_CAPTION_WORDS) {
      const eighth = wordMatches[MAX_CAPTION_WORDS - 1];
      const end = (eighth.index ?? 0) + eighth[0].length;
      chunks.push(remaining.slice(0, end).trim());
      remaining = remaining.slice(end);
      continue;
    }

    if (force) {
      const tail = remaining.trim();
      if (tail) chunks.push(tail);
      remaining = "";
    }

    break;
  }

  return { chunks, remainder: remaining };
}

function captionDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(MIN_CAPTION_MS, Math.min(MAX_CAPTION_MS, words * MS_PER_WORD));
}

export function useGeminiLive() {
  const [status, setStatus] = useState("Disconnected");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [volume, setVolumeState] = useState(80);
  const [speakingLevel, setSpeakingLevel] = useState(0);

  // Irreversible task safety state
  const [pendingTask, setPendingTask] = useState<PendingTaskApproval | null>(null);

  // Continuous conversation turn memory tracking
  const conversationTurnsRef = useRef<Array<{ role: "user" | "mira"; text: string }>>([]);
  const currentUserSpeechRef = useRef("");
  const currentMiraSpeechRef = useRef("");

  const sessionRef = useRef<any>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const playbackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextPlayTimeRef = useRef(0);
  const startingRef = useRef(false);

  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const responseFinishedRef = useRef(false);
  const responseGenerationRef = useRef(0);

  const captionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captionBufferRef = useRef("");
  const captionQueueRef = useRef<string[]>([]);
  const transcriptRef = useRef("");

  function setCaption(text: string) {
    transcriptRef.current = text;
    setTranscript(text);
  }

  function cancelCaptionTimer() {
    if (captionTimerRef.current !== null) {
      clearTimeout(captionTimerRef.current);
      captionTimerRef.current = null;
    }
  }

  function clearCaption() {
    cancelCaptionTimer();
    captionBufferRef.current = "";
    captionQueueRef.current = [];
    setCaption("");
  }

  function finishCaptionsIfDone() {
    if (
      responseFinishedRef.current &&
      playbackSourcesRef.current.size === 0 &&
      captionQueueRef.current.length === 0 &&
      !captionBufferRef.current.trim() &&
      captionTimerRef.current === null
    ) {
      setCaption("");
      setSpeakingLevel(0);
    }
  }

  function showNextCaption() {
    if (captionTimerRef.current !== null) return;

    const next = captionQueueRef.current.shift();
    if (!next) {
      finishCaptionsIfDone();
      return;
    }

    setCaption(next);
    captionTimerRef.current = setTimeout(() => {
      captionTimerRef.current = null;
      setCaption("");
      showNextCaption();
    }, captionDuration(next));
  }

  function queueCaptionFragment(fragment: string, flush = false) {
    captionBufferRef.current += fragment;

    const { chunks, remainder } = takeCaptionChunks(
      captionBufferRef.current,
      flush
    );
    captionBufferRef.current = remainder;
    captionQueueRef.current.push(...chunks);
    showNextCaption();
  }

  function setVolume(value: number) {
    const safeValue = Math.max(0, Math.min(100, value));
    setVolumeState(safeValue);

    const context = audioContextRef.current;
    const gain = gainNodeRef.current;

    if (context && gain && context.state !== "closed") {
      gain.gain.setTargetAtTime(
        safeValue / 100,
        context.currentTime,
        0.03
      );
    }
  }

  function stopPlayback() {
    for (const source of playbackSourcesRef.current) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Source may already have ended.
      }
      try {
        source.disconnect();
      } catch {
        // Source may already be disconnected.
      }
    }

    playbackSourcesRef.current.clear();
    nextPlayTimeRef.current = audioContextRef.current?.currentTime ?? 0;
  }

  function sendToolResponse(callId: string, name: string, output: any) {
    const session = sessionRef.current;
    if (!session) return;
    try {
      session.sendToolResponse?.({
        functionResponses: [
          {
            id: callId,
            name,
            response: { output },
          },
        ],
      });
    } catch (err) {
      console.error("[Mira Tool] Failed to send tool response:", err);
    }
  }

  async function approveTask(task: PendingTaskApproval) {
    try {
      const res = await fetch("/api/tasks/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName: task.toolName,
          args: task.args,
          userConfirmed: true,
        }),
      });
      const data = await res.json();
      sendToolResponse(task.id, task.toolName, data);
    } catch (err: any) {
      sendToolResponse(task.id, task.toolName, { error: err.message });
    } finally {
      setPendingTask(null);
    }
  }

  function rejectTask(task: PendingTaskApproval) {
    sendToolResponse(task.id, task.toolName, {
      cancelled: true,
      message: "The user rejected and cancelled this irreversible action.",
    });
    setPendingTask(null);
  }

  async function start() {
    if (startingRef.current || sessionRef.current) return;

    startingRef.current = true;
    setError("");
    clearCaption();
    setStatus("Connecting...");

    // Reset conversation transcript accumulator for new session
    conversationTurnsRef.current = [];
    currentUserSpeechRef.current = "";
    currentMiraSpeechRef.current = "";

    try {
      const response = await fetch("/api/live-token", {
        method: "POST",
      });

      const tokenData = await response.json();

      if (!response.ok || !tokenData.token) {
        throw new Error(
          tokenData.error || "Could not obtain a Gemini Live token."
        );
      }

      const context = new AudioContext();
      audioContextRef.current = context;

      const gain = context.createGain();
      gain.gain.value = volume / 100;

      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;

      gain.connect(analyser);
      analyser.connect(context.destination);

      gainNodeRef.current = gain;
      analyserRef.current = analyser;

      const audioData = new Float32Array(analyser.fftSize);

      const updateSpeakingLevel = () => {
        if (
          !analyserRef.current ||
          !audioContextRef.current ||
          audioContextRef.current.state === "closed"
        ) {
          setSpeakingLevel(0);
          return;
        }

        analyserRef.current.getFloatTimeDomainData(audioData);

        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
          sum += audioData[i] * audioData[i];
        }

        const rms = Math.sqrt(sum / audioData.length);
        setSpeakingLevel(Math.min(1, Math.max(0, (rms - 0.015) * 12)));

        animationFrameRef.current =
          requestAnimationFrame(updateSpeakingLevel);
      };

      animationFrameRef.current =
        requestAnimationFrame(updateSpeakingLevel);

      await context.resume();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      micRef.current = stream;

      // Load persistent memories from Supabase
      let memoryContext = "";
      try {
        const memoryResponse = await fetch("/api/memories?userId=default_user", {
          method: "GET",
          cache: "no-store",
        });

        if (memoryResponse.ok) {
          const memoryData = await memoryResponse.json();
          const memories = Array.isArray(memoryData.memories)
            ? memoryData.memories
            : [];

          if (memories.length > 0) {
            memoryContext = memories
              .filter((memory: { fact?: unknown }) => typeof memory.fact === "string")
              .slice(0, 40)
              .map((memory: { category?: string; fact: string }) =>
                `- [${(memory.category ?? "GENERAL").toUpperCase()}] ${memory.fact}`
              )
              .join("\n");
          }
        }
      } catch (memoryError) {
        console.warn("[Mira memory] Memory retrieval error:", memoryError);
      }

      const miraPersonality =
        "You're Mira. You do have a name. You're my friend and companion, not an assistant. Talk to me like we've known each other for ages. Be casual, have your own personality, joke around, tease me, gossip with me, be silly, get excited over random things, sing with me, and match my energy. Keep replies short and natural, like we're talking on a voice call.";

      const safetyInstructions = `
CRITICAL SAFETY RULE FOR DESKTOP ACTIONS:
You have tools to perform desktop actions (e.g. open_url, launch_application, create_desktop_note, get_system_time_info, delete_file, run_terminal_command, overwrite_file).
Whenever an action is IRREVERSIBLE or destructive (like delete_file or run_terminal_command), call the tool; the user's interface will present a confirmation modal. Inform the user warmly: "I've queued this task, please confirm it on your screen to proceed."`;

      const systemInstruction = memoryContext
        ? `${miraPersonality}\n\nWHAT YOU REMEMBER ABOUT THE USER:\n${memoryContext}\n\n${safetyInstructions}`
        : `${miraPersonality}\n\n${safetyInstructions}`;

      const desktopTools = getGeminiDesktopToolDeclarations();
      const ai = new GoogleGenAI({ apiKey: tokenData.token });

      const session = await ai.live.connect({
        model: "gemini-3.8-live",
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction,
          tools: [{ functionDeclarations: desktopTools }],
        },
        callbacks: {
          onopen: () => {
            setStatus("Connected. Listening...");
          },

          onmessage: (message: any) => {
            // Check for tool calls from Gemini
            const toolCalls: any[] = [];
            if (message.toolCall?.functionCalls) {
              toolCalls.push(...message.toolCall.functionCalls);
            }
            const parts = message.serverContent?.modelTurn?.parts ?? [];
            for (const part of parts) {
              if (part.functionCall) {
                toolCalls.push(part.functionCall);
              }
            }

            for (const call of toolCalls) {
              const callId = call.id || `call_${Date.now()}`;
              const toolName = call.name;
              const args = call.args || {};

              if (isIrreversibleTask(toolName)) {
                setPendingTask({
                  id: callId,
                  toolName,
                  args,
                  riskWarning: DESKTOP_TOOLS[toolName]?.riskWarning,
                });
              } else {
                fetch("/api/tasks/execute", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ toolName, args, userConfirmed: false }),
                })
                  .then((res) => res.json())
                  .then((resData) => {
                    sendToolResponse(callId, toolName, resData);
                  })
                  .catch((err) => {
                    sendToolResponse(callId, toolName, { error: err.message });
                  });
              }
            }

            const content = message.serverContent;
            if (!content) return;

            // Interruptions
            if (content.interrupted) {
              responseGenerationRef.current++;
              responseFinishedRef.current = false;
              stopPlayback();
              clearCaption();
              setSpeakingLevel(0);
              setStatus("Connected. Listening...");
              return;
            }

            // User speech transcription
            const userSpeech = content.inputTranscription?.text;
            if (userSpeech) {
              currentUserSpeechRef.current += userSpeech;
            }

            // Mira speech transcription
            const spokenText = content.outputTranscription?.text;
            if (spokenText) {
              responseFinishedRef.current = false;
              currentMiraSpeechRef.current += spokenText;
              queueCaptionFragment(spokenText);
            }

            const modelParts = content.modelTurn?.parts ?? [];
            for (const part of modelParts) {
              const audio = part.inlineData;
              if (
                !audio?.data ||
                !audio.mimeType?.startsWith("audio/pcm")
              ) {
                continue;
              }

              const audioContext = audioContextRef.current;
              if (!audioContext || audioContext.state === "closed") {
                continue;
              }

              responseFinishedRef.current = false;

              const binary = atob(audio.data);
              const pcm = new Int16Array(binary.length / 2);

              for (let i = 0; i < pcm.length; i++) {
                let sample =
                  (binary.charCodeAt(i * 2) & 0xff) |
                  (binary.charCodeAt(i * 2 + 1) << 8);

                if (sample > 32767) sample -= 65536;
                pcm[i] = sample;
              }

              const samples = new Float32Array(pcm.length);
              for (let i = 0; i < pcm.length; i++) {
                samples[i] = pcm[i] / 32768;
              }

              const audioBuffer = audioContext.createBuffer(
                1,
                samples.length,
                24000
              );

              audioBuffer.copyToChannel(samples, 0);

              const source = audioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(
                gainNodeRef.current ?? audioContext.destination
              );

              const generation = responseGenerationRef.current;
              playbackSourcesRef.current.add(source);

              source.onended = () => {
                playbackSourcesRef.current.delete(source);
                source.disconnect();

                if (generation !== responseGenerationRef.current) return;
                const ctx = audioContextRef.current;
                if (
                  responseFinishedRef.current &&
                  playbackSourcesRef.current.size === 0 &&
                  ctx &&
                  ctx.currentTime >= nextPlayTimeRef.current
                ) {
                  finishCaptionsIfDone();
                }
              };

              const startAt = Math.max(
                audioContext.currentTime,
                nextPlayTimeRef.current
              );

              source.start(startAt);
              nextPlayTimeRef.current = startAt + audioBuffer.duration;
            }

            if (content.turnComplete) {
              responseFinishedRef.current = true;
              setStatus("Connected. Listening...");
              queueCaptionFragment("", true);

              // Record turns for conversation memory
              if (currentUserSpeechRef.current.trim()) {
                conversationTurnsRef.current.push({
                  role: "user",
                  text: currentUserSpeechRef.current.trim(),
                });
                currentUserSpeechRef.current = "";
              }
              if (currentMiraSpeechRef.current.trim()) {
                conversationTurnsRef.current.push({
                  role: "mira",
                  text: currentMiraSpeechRef.current.trim(),
                });
                currentMiraSpeechRef.current = "";
              }

              if (playbackSourcesRef.current.size === 0) {
                finishCaptionsIfDone();
              }
            }
          },

          onerror: (event) => {
            console.error("Gemini Live error:", event);
            setError(
              "Gemini Live encountered an error. Check the browser console."
            );
            setStatus("Error");
          },

          onclose: () => {
            responseGenerationRef.current++;
            responseFinishedRef.current = false;
            stopPlayback();
            clearCaption();
            setSpeakingLevel(0);
            setStatus("Disconnected");
          },
        },
      });

      sessionRef.current = session;

      const micSource = context.createMediaStreamSource(stream);
      micSourceRef.current = micSource;

      const processor = context.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        const activeSession = sessionRef.current;
        if (!activeSession) return;

        const input = event.inputBuffer.getChannelData(0);
        const resampled = downsample(input, context.sampleRate, 16000);
        const pcmBuffer = floatTo16BitPCM(resampled);

        activeSession.sendRealtimeInput({
          audio: {
            data: toBase64(pcmBuffer),
            mimeType: "audio/pcm;rate=16000",
          },
        });
      };

      micSource.connect(processor);

      const silentGain = context.createGain();
      silentGain.gain.value = 0;
      processor.connect(silentGain);
      silentGain.connect(context.destination);
    } catch (err) {
      console.error("Could not start Mira:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not start the voice conversation."
      );
      await stop();
      setStatus("Error");
    } finally {
      startingRef.current = false;
    }
  }

  async function stop() {
    responseGenerationRef.current++;
    responseFinishedRef.current = false;
    clearCaption();

    // Flush any pending spoken turn
    if (currentUserSpeechRef.current.trim()) {
      conversationTurnsRef.current.push({
        role: "user",
        text: currentUserSpeechRef.current.trim(),
      });
      currentUserSpeechRef.current = "";
    }
    if (currentMiraSpeechRef.current.trim()) {
      conversationTurnsRef.current.push({
        role: "mira",
        text: currentMiraSpeechRef.current.trim(),
      });
      currentMiraSpeechRef.current = "";
    }

    // AUTOMATIC MEMORY EXTRACTION INTO SUPABASE
    if (conversationTurnsRef.current.some((t) => t.role === "user")) {
      const dialogue = conversationTurnsRef.current
        .map((t) => `${t.role === "user" ? "User" : "Mira"}: ${t.text}`)
        .join("\n");

      fetch("/api/memories/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: dialogue }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.ok && data.count > 0) {
            console.log(
              `[Mira memory] Extracted and saved ${data.count} new memories to Supabase!`,
              data.saved
            );
          }
        })
        .catch((err) => console.warn("[Mira memory] Auto-extraction error:", err));
    }

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    micSourceRef.current?.disconnect();
    micSourceRef.current = null;

    micRef.current?.getTracks().forEach((track) => track.stop());
    micRef.current = null;

    stopPlayback();

    const session = sessionRef.current;
    sessionRef.current = null;

    if (session) {
      try {
        session.close();
      } catch (err) {
        console.warn("Error closing Live session:", err);
      }
    }

    const context = audioContextRef.current;
    audioContextRef.current = null;

    if (context && context.state !== "closed") {
      await context.close();
    }

    nextPlayTimeRef.current = 0;
    setSpeakingLevel(0);
    setStatus("Disconnected");

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    analyserRef.current = null;
    gainNodeRef.current?.disconnect();
    gainNodeRef.current = null;
  }

  return {
    start,
    stop,
    status,
    transcript,
    error,
    volume,
    setVolume,
    speakingLevel,
    pendingTask,
    approveTask,
    rejectTask,
  };
}
