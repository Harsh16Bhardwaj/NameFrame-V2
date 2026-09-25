"use client";

import Image from "next/image";
import { useRef, useState } from "react";

import { AppIcon } from "@/components/app-icon";

type Bounds = { nameLeft: number; nameTop: number; nameRight: number; nameBottom: number };
type Style = { fontSize: number; fontColor: string; fontWeight: string; textAlign: string };
type DragMode = "move" | "left" | "right" | "top" | "bottom";

export type TemplateEditorValue = Bounds & Style & { backgroundUrl: string; assetId?: string };

const DEFAULT_VALUE: TemplateEditorValue = {
  backgroundUrl: "",
  nameLeft: 0.25,
  nameTop: 0.42,
  nameRight: 0.75,
  nameBottom: 0.56,
  fontSize: 48,
  fontColor: "#251913",
  fontWeight: "600",
  textAlign: "center",
};

const colors = ["#251913", "#000000", "#6e5b4d", "#8c6a3b", "#1f4f46", "#244a72", "#7b2f36", "#ffffff"];
const starters = [
  { title: "Classic award", image: "/1.png", href: "https://www.canva.com/templates/?query=certificate" },
  { title: "Academic landscape", image: "/2.png", href: "https://www.canva.com/templates/?query=academic-certificate" },
  { title: "Editorial credential", image: "/3.png", href: "https://www.canva.com/templates/?query=professional-certificate" },
  { title: "Minimal recognition", image: "/4.png", href: "https://www.canva.com/templates/?query=minimal-certificate" },
];

export function CertificateTemplateEditor({ eventId, initialValue, onSaved, compact = false }: { eventId: string; initialValue?: TemplateEditorValue | null; onSaved?: (value: TemplateEditorValue) => void; compact?: boolean }) {
  const [value, setValue] = useState<TemplateEditorValue>(initialValue ?? DEFAULT_VALUE);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggingFile, setDraggingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(Boolean(initialValue));
  const [isExisting, setIsExisting] = useState(Boolean(initialValue));
  const canvasRef = useRef<HTMLDivElement>(null);

  function beginDrag(mode: DragMode, event: React.PointerEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, value };
    const rect = canvas.getBoundingClientRect();

    function move(pointer: PointerEvent) {
      const dx = (pointer.clientX - start.x) / rect.width;
      const dy = (pointer.clientY - start.y) / rect.height;
      const minimum = 0.05;
      const next = { ...start.value };
      if (mode === "move") {
        const width = start.value.nameRight - start.value.nameLeft;
        const height = start.value.nameBottom - start.value.nameTop;
        next.nameLeft = Math.max(0, Math.min(1 - width, start.value.nameLeft + dx));
        next.nameRight = next.nameLeft + width;
        next.nameTop = Math.max(0, Math.min(1 - height, start.value.nameTop + dy));
        next.nameBottom = next.nameTop + height;
      } else if (mode === "left") next.nameLeft = Math.max(0, Math.min(start.value.nameRight - minimum, start.value.nameLeft + dx));
      else if (mode === "right") next.nameRight = Math.min(1, Math.max(start.value.nameLeft + minimum, start.value.nameRight + dx));
      else if (mode === "top") next.nameTop = Math.max(0, Math.min(start.value.nameBottom - minimum, start.value.nameTop + dy));
      else next.nameBottom = Math.min(1, Math.max(start.value.nameTop + minimum, start.value.nameBottom + dy));
      setValue(next);
      setSaved(false);
    }

    function end() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) return setError("Only PNG and JPEG images are supported.");
    if (file.size > 10 * 1024 * 1024) return setError("The image must be no larger than 10 MB.");
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch(`/api/events/${eventId}/upload`, { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Upload failed.");
      setValue((current) => ({ ...current, assetId: payload.data.id, backgroundUrl: payload.data.secureUrl }));
      setSaved(false);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setUploading(false);
      setDraggingFile(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/template`, {
        method: isExisting ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isExisting ? { ...value, assetId: undefined, backgroundUrl: undefined } : value),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Template could not be saved.");
      const savedValue = { ...value, backgroundUrl: payload.data.backgroundUrl, assetId: payload.data.assetId };
      setValue(savedValue);
      setSaved(true);
      setIsExisting(true);
      onSaved?.(savedValue);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Template could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function changeStyle(next: Partial<Style>) {
    setValue((current) => ({ ...current, ...next }));
    setSaved(false);
  }

  return (
    <section className={`template-editor panel ${compact ? "is-compact" : ""}`} id="template-management">
      <div className="section-heading">
        <div><p className="eyebrow">Template management</p><h2>{compact ? "Certificate template" : initialValue ? "Refine the participant name" : "Bring in your certificate design"}</h2>{compact ? null : <p className="section-copy">Upload a background, position the participant name, and tune its typography.</p>}</div>
        <span className={`status-pill ${saved ? "status-active" : "status-draft"}`}>{saved ? "Template saved" : "Not configured"}</span>
      </div>

      {!isExisting ? (
        <label
          className={`upload-box premium-upload-box ${draggingFile ? "is-dragging" : ""} ${uploading ? "is-uploading" : ""}`}
          onDragEnter={(event) => { event.preventDefault(); setDraggingFile(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDraggingFile(false); }}
          onDrop={(event) => { event.preventDefault(); void upload(event.dataTransfer.files[0]); }}
        >
          {uploading ? <><div className="upload-loader"><i/><i/><i/><i/><i/></div><strong>Preparing your design</strong><span>Uploading and checking the certificate image…</span></> : <><span className="upload-icon"><AppIcon name="templates" size={25}/></span><strong>{value.backgroundUrl ? "Certificate image ready" : draggingFile ? "Drop it here" : "Drop your certificate here"}</strong><span>or choose a PNG/JPEG file · up to 10 MB</span><b>{value.backgroundUrl ? "Choose a different image" : "Browse files"}</b></>}
          <input type="file" accept="image/png,image/jpeg" disabled={uploading} onChange={(event) => void upload(event.target.files?.[0])}/>
        </label>
      ) : null}

      {!value.backgroundUrl ? (
        <div className="template-starters">
          <div className="template-starters-heading"><div><strong>Need a starting point?</strong><span>Choose a Canva direction, edit it there, then upload your finished image.</span></div><small>Scroll to explore</small></div>
          <div className="template-marquee" aria-label="Certificate starter templates">{[...starters, ...starters].map((template, index) => <a href={template.href} target="_blank" rel="noreferrer" key={`${template.title}-${index}`}><span><Image src={template.image} alt={template.title} fill sizes="220px"/></span><strong>{template.title}</strong><small>Open in Canva ↗</small></a>)}</div>
        </div>
      ) : null}

      {value.backgroundUrl ? (
        <div className="editor-layout">
          <div className="certificate-stage">
            <div ref={canvasRef} className="certificate-canvas" style={{ backgroundImage: `url(${value.backgroundUrl})` }}>
              <div className="name-bounds" onPointerDown={(event) => beginDrag("move", event)} style={{ left: `${value.nameLeft * 100}%`, top: `${value.nameTop * 100}%`, width: `${(value.nameRight - value.nameLeft) * 100}%`, height: `${(value.nameBottom - value.nameTop) * 100}%`, color: value.fontColor, fontSize: `${Math.max(12, value.fontSize / 2)}px`, fontWeight: value.fontWeight, justifyContent: value.textAlign === "left" ? "flex-start" : value.textAlign === "right" ? "flex-end" : "center" }}>
                Participant Name
                {(["left", "right", "top", "bottom"] as const).map((edge) => <button key={edge} type="button" aria-label={`Resize ${edge} edge`} className={`resize-handle resize-${edge}`} onPointerDown={(event) => { event.stopPropagation(); beginDrag(edge, event); }}/>) }
              </div>
            </div>
            <p><span>Tip</span> Drag the name box and its four edge handles. Placement is stored relative to the original image.</p>
          </div>

          <div className="editor-controls premium-editor-controls">
            <div className="control-group"><div className="control-label"><span>Text size</span><output>{value.fontSize}px</output></div><input className="styled-range" type="range" min="16" max="120" value={value.fontSize} onChange={(event) => changeStyle({ fontSize: Number(event.target.value) })}/><div className="range-ends"><span>Small</span><span>Large</span></div></div>
            <div className="control-group"><div className="control-label"><span>Text color</span><output>{value.fontColor.toUpperCase()}</output></div><div className="color-palette">{colors.map((color) => <button key={color} type="button" aria-label={`Use color ${color}`} className={value.fontColor === color ? "active" : ""} style={{ background: color }} onClick={() => changeStyle({ fontColor: color })}/>) }<label className="custom-color" title="Choose a custom color"><input type="color" value={value.fontColor} onChange={(event) => changeStyle({ fontColor: event.target.value })}/><span>+</span></label></div></div>
            <div className="control-group"><span className="control-title">Font weight</span><div className="segmented-control">{[["400", "Regular"], ["500", "Medium"], ["600", "Semibold"], ["700", "Bold"]].map(([weight, label]) => <button key={weight} type="button" className={value.fontWeight === weight ? "active" : ""} onClick={() => changeStyle({ fontWeight: weight })}>{label}</button>)}</div></div>
            <div className="control-group"><span className="control-title">Alignment</span><div className="segmented-control three">{["left", "center", "right"].map((align) => <button key={align} type="button" className={value.textAlign === align ? "active" : ""} onClick={() => changeStyle({ textAlign: align })}>{align}</button>)}</div></div>
            <button className="button button-primary template-save-button" type="button" disabled={saving || (!isExisting && !value.assetId)} onClick={save}>{saving ? "Saving template…" : isExisting ? "Save template changes" : "Save template"}</button>
          </div>
        </div>
      ) : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}
