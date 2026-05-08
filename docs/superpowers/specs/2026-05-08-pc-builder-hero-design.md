# PC-Builder Hero Section — Design Spec
**Date:** 2026-05-08  
**Project:** `Logo_Demo` (2AHIF / WMC)  
**Output:** Single `index.html` file

---

## Overview

A fully responsive hero section for a custom PC builder website. A live Three.js 3D scene acts as the full-viewport background. UI content sits on top inside a glassmorphism panel. Brand name: **PC-Builder**.

---

## 1. 3D Scene

### Geometry Composition
| Object | Type | Role |
|---|---|---|
| Core node | `IcosahedronGeometry` (r=1.2, detail=1) | Central focus point |
| Floating slabs | 4–5 `BoxGeometry` thin rectangles | Orbiting panels |
| Ring | `TorusGeometry` (r=2.5, tube=0.06, tilted 30°) | Accent / orbital element |

### Materials
- **All objects:** `MeshPhysicalMaterial` — `color: #e0e0e0`, `metalness: 1.0`, `roughness: 0.05`, `envMap` from CubeCamera → polished chrome/mirror finish
- **Torus ring only:** additionally `emissive: #FFD700`, `emissiveIntensity: 0.3` → faint yellow glow matching UI accent

### CubeCamera (real-time reflections — Approach A)
- `WebGLCubeRenderTarget` at 256px resolution
- Updated every frame **before** the main scene render
- Assigned as `envMap` to all materials
- Scene background: `#0a0a0a` (near-black charcoal)

### Lighting (3-point)
| Light | Type | Color | Intensity | Position |
|---|---|---|---|---|
| Fill | `AmbientLight` | `#ffffff` | 0.4 | — |
| Key | `DirectionalLight` | `#ffffff` | 2.0 | top-right-front |
| Rim | `DirectionalLight` | `#e8f0ff` (cool white) | 1.5 | back-left |

### Animation
- **Group:** constant slow Y-rotation (~0.003 rad/frame)
- **Icosahedron:** gentle wobble — `Math.sin(clock.getElapsedTime() * 0.4)` on X + Y
- **Slabs:** each rotates on a unique axis offset by index, speed ~0.001–0.002
- **Torus:** faster self-rotation on its local axis (~0.008 rad/frame)

### Renderer Config
```
antialias: true
outputEncoding: THREE.sRGBEncoding
toneMapping: THREE.ACESFilmicToneMapping
toneMappingExposure: 1.2
pixelRatio: Math.min(window.devicePixelRatio, 2)
alpha: false
```

---

## 2. UI Layout

### Navigation (fixed top)
- Background: `rgba(0,0,0,0.7)` + `backdrop-filter: blur(10px)`
- Left: **PC-Builder** wordmark in white, bold
- Right: nav links in white (`Products`, `Build`, `About`), plus one yellow CTA link (`Get Started`)

### Hero Content (glassmorphism panel)
- Positioned left side on desktop (~45% width), full-width on mobile
- Panel styles: `background: rgba(0,0,0,0.45)`, `backdrop-filter: blur(20px)`, `border: 1px solid rgba(255,255,255,0.08)`, `border-radius: 16px`, padding `2.5rem`
- **Eyebrow tag:** small uppercase yellow label, e.g. `// CUSTOM BUILDS`
- **Headline:** massive bold Inter — `"Engineering\nMasterpieces"`, white
- **Descriptor:** 1 line, gray-white subdued text
- **Buttons:**
  - Primary: solid white bg, black text; hover → yellow bg + black text + `box-shadow: 0 0 20px rgba(255,215,0,0.5)`
  - Secondary: transparent + white border + white text; hover → white bg + black text

### Typography
- Font: **Inter** (Google Fonts CDN, weights 400/700/900)
- Headline: `clamp(3rem, 7vw, 6rem)`, `font-weight: 900`, `line-height: 1.05`

### Responsive Behavior
- **Desktop (≥768px):** 3D scene fills full viewport, glass panel left ~45%
- **Mobile (<768px):** glass panel full-width, 3D object scaled down 0.6×, camera pulled back slightly so geometry stays visible but doesn't obstruct text

---

## 3. Technical Constraints

- **Single file:** `index.html` — all HTML, CSS, JS inline
- **Three.js:** CDN r128 (`three.min.js`)
- **Tailwind CSS:** CDN script tag (for utility classes)
- **Inter font:** Google Fonts CDN
- **No build step, no module bundler**
- **Window resize handler:** updates camera aspect + renderer size + repositions canvas

---

## 4. Color Palette

| Token | Value | Usage |
|---|---|---|
| Background | `#0a0a0a` | Scene bg, page bg |
| Surface | `rgba(0,0,0,0.45)` | Glass panel |
| Text primary | `#ffffff` | Headlines, nav |
| Text muted | `#9ca3af` | Descriptor copy |
| Accent | `#FFD700` | Eyebrow, CTA hover, ring glow |
| Geometry | `#e0e0e0` | All 3D material color |

---

## 5. File Output

Single file: `index.html` in `c:/Users/daveg/Desktop/Schule/2AHIF/WMC/Logo_Demo/`
