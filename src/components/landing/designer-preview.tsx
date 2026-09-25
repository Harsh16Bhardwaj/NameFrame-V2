"use client";

import Image from "next/image";
import { useState } from "react";

const templates = ["/1.png", "/2.png", "/3.png", "/4.png"];

export function DesignerPreview() {
  const [template, setTemplate] = useState(0);
  const [name, setName] = useState("Dr. Eleanor Vance");
  const [fontSize, setFontSize] = useState(38);
  const [position, setPosition] = useState(55);
  const [color, setColor] = useState("#34241d");

  return <section className="reference-section reference-designer" id="designer"><div className="reference-section-heading"><p>Live experiment · no signup</p><h2>See what it looks like.</h2><span>Type any name, adjust its position, and inspect the result on real certificate artwork.</span></div><div className="reference-designer-shell"><aside><header><div><small>Attributes &amp; typography</small><span>Live type</span></div></header><label>Participant / awardee name<input value={name} maxLength={60} onChange={(event)=>setName(event.target.value)}/></label><label>Vertical anchor / Y-axis <output>{position}%</output><input type="range" min="35" max="72" value={position} onChange={(event)=>setPosition(Number(event.target.value))}/></label><label>Text size / point preview <output>{fontSize}px</output><input type="range" min="24" max="64" value={fontSize} onChange={(event)=>setFontSize(Number(event.target.value))}/></label><label>Text colour<div className="reference-color"><input type="color" value={color} onChange={(event)=>setColor(event.target.value)}/><span>{color.toUpperCase()}</span></div></label><div><small className="reference-field-title">Select artwork</small><div className="reference-template-picker">{templates.map((src,index)=><button type="button" className={template===index?"active":""} key={src} onClick={()=>setTemplate(index)} aria-label={`Use certificate template ${index+1}`}><Image src={src} alt="" fill sizes="80px"/></button>)}</div></div><ul><li>Normalized name placement <b>●</b></li><li>Original artwork preserved <b>●</b></li><li>Preview before generation <b>●</b></li></ul></aside><div className="reference-preview-area"><div className="reference-preview-paper"><Image src={templates[template]} alt="Certificate preview" fill sizes="(max-width: 900px) 92vw, 680px" priority/><span style={{top:`${position}%`,fontSize:`clamp(17px, ${fontSize/14}vw, ${fontSize}px)`,color}}>{name||"Your Name"}</span></div><footer><i/>Live preview <b>1200 × 850 canvas</b></footer></div></div></section>;
}
