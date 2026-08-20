"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera, Loader2, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { PROGRESS_BUCKET } from "@/domain/progress/progress.service";
import { addProgressPhotoAction } from "../progress/actions";

type Pose = "front" | "side";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "heic"]);
const GHOST_OPACITY = 0.35;
const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 480;

/** Live front-facing camera capture for the two check-in poses (front,
 * side), with a translucent "ghost" of last time's photo overlaid for pose
 * guidance only — the saved photo is always just the plain camera frame,
 * never composited with the ghost (captured on a separate offscreen
 * canvas). No prior getUserMedia/<video>/<canvas> usage exists anywhere
 * else in this repo, so this is built from scratch; the plain file-input
 * fallback below is what carries the actual requirement — camera access
 * fails often enough (permission denied, non-HTTPS dev, iOS PWA quirks)
 * that check-in submission can never depend on it working. */
export function CameraCapture({
  locale,
  coachId,
  clientId,
  ghostFront,
  ghostSide,
  onUploaded,
}: {
  locale: string;
  coachId: string;
  clientId: string;
  ghostFront?: string;
  ghostSide?: string;
  onUploaded: (pose: Pose) => void;
}) {
  const t = useTranslations("client.checkinWizard.photo");
  const tFields = useTranslations("progress.checkin");
  const tErrors = useTranslations("progress.errors");

  const [support, setSupport] = useState<"checking" | "available" | "unavailable">(() =>
    typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function"
      ? "checking"
      : "unavailable"
  );
  const [stage, setStage] = useState<Pose>("front");
  const [sideVisited, setSideVisited] = useState(false);
  const [finished, setFinished] = useState(false);
  const [status, setStatus] = useState<Record<Pose, "idle" | "added" | "skipped">>({
    front: "idle",
    side: "idle",
  });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const ghostImgRef = useRef<HTMLImageElement | null>(null);

  const ghostUrl = stage === "front" ? ghostFront : ghostSide;

  // Acquire the camera once on mount. Both poses use the same front-facing
  // stream (facingMode is fixed, never switched) so there's no reason to
  // re-request permission between front and side.
  useEffect(() => {
    if (support !== "checking") return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setSupport("available");
      })
      .catch(() => {
        if (!cancelled) setSupport("unavailable");
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [support]);

  // Load the current pose's ghost image (if any) for the preview overlay.
  useEffect(() => {
    ghostImgRef.current = null;
    if (!ghostUrl) return;
    const img = new Image();
    img.onload = () => {
      ghostImgRef.current = img;
    };
    img.src = ghostUrl;
  }, [ghostUrl]);

  // Preview loop: draw the live frame, then the ghost on top at low
  // opacity for alignment only — this canvas is never captured.
  useEffect(() => {
    if (support !== "available") return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function paint() {
      if (video!.readyState >= video!.HAVE_CURRENT_DATA) {
        ctx!.drawImage(video!, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        const ghost = ghostImgRef.current;
        if (ghost) {
          ctx!.globalAlpha = GHOST_OPACITY;
          ctx!.drawImage(ghost, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          ctx!.globalAlpha = 1;
        }
      }
      rafRef.current = requestAnimationFrame(paint);
    }
    rafRef.current = requestAnimationFrame(paint);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [support, stage]);

  async function uploadAndSave(file: File, ext: string, pose: Pose) {
    setUploading(true);
    setError(null);
    const supabase = createClient();
    const path = `${coachId}/${clientId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from(PROGRESS_BUCKET).upload(path, file);
    if (uploadError) {
      setUploading(false);
      setError(tErrors("upload_failed"));
      return;
    }
    const result = await addProgressPhotoAction(locale, path, pose);
    setUploading(false);
    if (result?.error) {
      setError(tErrors(result.error));
      return;
    }
    setStatus((s) => ({ ...s, [pose]: "added" }));
    onUploaded(pose);
    advance(pose);
  }

  function advance(pose: Pose) {
    if (pose === "front" && !sideVisited) {
      setStage("side");
      setSideVisited(true);
      setError(null);
      return;
    }
    setFinished(true);
  }

  function capture() {
    const video = videoRef.current;
    if (!video || uploading) return;
    const offscreen = document.createElement("canvas");
    offscreen.width = video.videoWidth || CANVAS_WIDTH;
    offscreen.height = video.videoHeight || CANVAS_HEIGHT;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
    offscreen.toBlob(
      (blob) => {
        if (!blob) return;
        void uploadAndSave(new File([blob], `${stage}.jpg`, { type: "image/jpeg" }), "jpg", stage);
      },
      "image/jpeg",
      0.85
    );
  }

  function skip(pose: Pose) {
    setStatus((s) => ({ ...s, [pose]: "skipped" }));
    setError(null);
    advance(pose);
  }

  function retake(pose: Pose) {
    setFinished(false);
    setStage(pose);
  }

  async function handleFallbackFile(pose: Pose, file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError(tErrors("invalid_file"));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(tErrors("file_too_large"));
      return;
    }
    const rawExt = file.name.split(".").pop()?.toLowerCase() ?? "";
    const ext = ALLOWED_EXT.has(rawExt) ? rawExt : "jpg";
    await uploadAndSave(file, ext, pose);
  }

  if (support === "checking") {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (finished) {
    return (
      <div className="flex w-full max-w-64 flex-col gap-2">
        {(["front", "side"] as const).map((pose) => (
          <div
            key={pose}
            className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm"
          >
            <span className="font-medium text-foreground">{tFields(pose === "front" ? "photoFront" : "photoSide")}</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {status[pose] === "added" ? t("added") : t("skipped")}
              </span>
              <button type="button" className="text-xs font-semibold text-primary" onClick={() => retake(pose)}>
                {t("retake")}
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (support === "unavailable") {
    return (
      <div className="flex w-full flex-col items-center gap-4">
        <p className="text-center text-xs text-muted-foreground">{t("cameraUnavailable")}</p>
        <div className="grid w-full max-w-72 grid-cols-2 gap-2.5">
          <FallbackTile
            pose="front"
            label={tFields("photoFront")}
            status={status.front}
            uploading={uploading}
            onFile={(file) => handleFallbackFile("front", file)}
            onSkip={() => skip("front")}
            skipLabel={t("skip")}
            uploadingLabel={t("uploading")}
          />
          <FallbackTile
            pose="side"
            label={tFields("photoSide")}
            status={status.side}
            uploading={uploading}
            onFile={(file) => handleFallbackFile("side", file)}
            onSkip={() => skip("side")}
            skipLabel={t("skip")}
            uploadingLabel={t("uploading")}
          />
        </div>
        {error && <p className="text-center text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative aspect-[3/4] w-full max-w-52 overflow-hidden rounded-2xl bg-slate-950">
        <video ref={videoRef} className="hidden" playsInline muted autoPlay />
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <span className="absolute bottom-3 start-1/2 -translate-x-1/2 rounded-md bg-slate-950/80 px-2.5 py-1 font-mono text-[10px] tracking-wider text-slate-300">
          {tFields(stage === "front" ? "photoFront" : "photoSide")}
        </span>
      </div>
      <p className="text-center text-xs text-muted-foreground">{t("hint")}</p>
      {error && <p className="text-center text-xs text-destructive">{error}</p>}
      <div className="flex items-center gap-6">
        <Button type="button" variant="outline" onClick={() => skip(stage)}>
          {t("skip")}
        </Button>
        <button
          type="button"
          disabled={uploading}
          onClick={capture}
          aria-label={t("captureLabel")}
          className="flex size-18 items-center justify-center rounded-full border-4 border-foreground bg-primary text-primary-foreground disabled:opacity-50"
        >
          {uploading ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" />}
        </button>
      </div>
    </div>
  );
}

/** The plain file-input fallback, styled like PhotoUpload's compact tile
 * (`../progress/photo-upload.tsx`) — copied rather than imported since
 * that component owns its own upload+done state and has no way to report
 * per-pose completion back to the wizard's review screen. */
function FallbackTile({
  pose,
  label,
  status,
  uploading,
  onFile,
  onSkip,
  skipLabel,
  uploadingLabel,
}: {
  pose: Pose;
  label: string;
  status: "idle" | "added" | "skipped";
  uploading: boolean;
  onFile: (file: File) => void;
  onSkip: () => void;
  skipLabel: string;
  uploadingLabel: string;
}) {
  const done = status === "added";
  const skipped = status === "skipped";
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className={`flex aspect-[3/4] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed text-xs font-medium ${
          skipped
            ? "pointer-events-none border-border bg-muted/20 text-muted-foreground opacity-60"
            : done
              ? "cursor-pointer border-success bg-success-tint text-success-tint-foreground"
              : "cursor-pointer border-border bg-muted/40 text-muted-foreground hover:bg-muted"
        }`}
      >
        {uploading ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : done ? (
          <Check className="size-5" aria-hidden="true" />
        ) : (
          <Plus className="size-5" aria-hidden="true" />
        )}
        {uploading ? uploadingLabel : label}
        {!skipped && (
          <input
            type="file"
            name={pose}
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={uploading || done}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onFile(file);
            }}
          />
        )}
      </label>
      {!done && !skipped && (
        <button type="button" onClick={onSkip} className="text-center text-xs text-muted-foreground underline-offset-2 hover:underline">
          {skipLabel}
        </button>
      )}
    </div>
  );
}
