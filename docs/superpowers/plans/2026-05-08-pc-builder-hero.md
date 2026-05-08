# PC-Builder Hero Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single `index.html` file containing a full-viewport Three.js 3D mirror-geometry background with a glassmorphism hero UI for the PC-Builder brand.

**Architecture:** One self-contained HTML file. Three.js r128 loaded via CDN. A `CubeCamera` renders the scene into a `WebGLCubeRenderTarget` each frame to produce real-time mirror reflections on all geometry. UI is layered on top via `position: fixed / z-index` with Tailwind CSS and custom CSS for glassmorphism and hover effects.

**Tech Stack:** Three.js r128 (CDN), Tailwind CSS (CDN), Inter font (Google Fonts CDN), plain HTML/CSS/JS — no build step.

> **Note on testing:** This is a single static HTML file with no test runner. All verification steps are manual browser checks. Open `index.html` directly in Chrome/Edge/Firefox and confirm described visual output.

---

## File Structure

```
index.html   — entire project: HTML shell, CSS, Three.js scene, UI markup
```

---

### Task 1: HTML Shell + CDN Imports

**Files:**
- Create: `index.html`

- [ ] **Step 1: Create the base HTML file**

Write the following to `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PC-Builder</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; background: #0a0a0a; overflow-x: hidden; }
  </style>
</head>
<body>
  <p style="color:white;padding:2rem;">Shell loaded</p>
  <script>
    console.log('THREE version:', THREE.REVISION);
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify in browser**

Open `index.html` in a browser.
Expected: white text "Shell loaded" on black background. Browser console shows `THREE version: 128`.

---

### Task 2: Canvas Container + Renderer

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace `<body>` content with canvas container + renderer bootstrap**

Replace everything between the `<body>` tags (keep `<style>` block inside `<head>`) with:

```html
<body>
  <div id="canvas-container"></div>

  <script>
    // ── Renderer ──────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // ── Scene + Camera ────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 6);

    // ── Temp render ───────────────────────────────────────────
    renderer.render(scene, camera);
    console.log('Renderer OK');
  </script>
</body>
```

Add to the `<style>` block inside `<head>`:

```css
#canvas-container {
  position: fixed;
  top: 0; left: 0;
  width: 100%; height: 100%;
  z-index: 0;
}
#canvas-container canvas { display: block; }
```

- [ ] **Step 2: Verify in browser**

Reload `index.html`.
Expected: completely black viewport, no scroll bars, browser console shows `Renderer OK`.

---

### Task 3: CubeCamera + Mirror Material

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add CubeCamera and shared mirror material after the camera setup**

Inside the `<script>` block, replace the `// ── Temp render` comment and everything after it with:

```javascript
    // ── CubeCamera (real-time reflections) ───────────────────
    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
      format: THREE.RGBFormat,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter
    });
    const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRenderTarget);
    scene.add(cubeCamera);

    // ── Shared mirror material ────────────────────────────────
    const mirrorMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0e0e0,
      metalness: 1.0,
      roughness: 0.05,
      envMap: cubeRenderTarget.texture
    });

    // ── Torus material (adds yellow emissive glow) ────────────
    const torusMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0e0e0,
      metalness: 1.0,
      roughness: 0.05,
      envMap: cubeRenderTarget.texture,
      emissive: new THREE.Color(0xFFD700),
      emissiveIntensity: 0.3
    });

    console.log('CubeCamera + materials OK');
    renderer.render(scene, camera);
```

- [ ] **Step 2: Verify in browser**

Reload. Expected: black viewport, console shows `CubeCamera + materials OK`, no errors.

---

### Task 4: Geometry — Core Node + Slabs + Torus Ring

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add all geometry after the material declarations**

Replace the `console.log('CubeCamera + materials OK'); renderer.render(scene, camera);` lines with:

```javascript
    // ── Geometry: Core icosahedron ────────────────────────────
    const icosaMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.2, 1),
      mirrorMat
    );

    // ── Geometry: Floating slabs ──────────────────────────────
    const slabConfigs = [
      { size: [0.8, 0.07, 0.38], pos: [ 1.8,  0.3,  0.2], rot: [ 0.3,  0.5,  0.1] },
      { size: [0.6, 0.06, 0.48], pos: [-1.9, -0.4,  0.3], rot: [-0.2,  0.8,  0.3] },
      { size: [1.0, 0.07, 0.28], pos: [ 0.5,  1.6, -0.2], rot: [ 0.1,  0.3,  0.6] },
      { size: [0.7, 0.06, 0.44], pos: [-0.8, -1.5,  0.1], rot: [ 0.4, -0.3,  0.2] },
      { size: [0.5, 0.08, 0.34], pos: [ 1.4, -1.2,  0.4], rot: [-0.1,  0.6, -0.3] },
    ];
    const slabs = slabConfigs.map(({ size, pos, rot }) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mirrorMat);
      mesh.position.set(...pos);
      mesh.rotation.set(...rot);
      return mesh;
    });

    // ── Geometry: Torus ring ──────────────────────────────────
    const torusMesh = new THREE.Mesh(
      new THREE.TorusGeometry(2.5, 0.06, 16, 100),
      torusMat
    );
    torusMesh.rotation.x = Math.PI / 6;

    // ── Group ─────────────────────────────────────────────────
    const group = new THREE.Group();
    group.add(icosaMesh, ...slabs, torusMesh);
    scene.add(group);

    console.log('Geometry OK — meshes:', group.children.length);
    renderer.render(scene, camera);
```

- [ ] **Step 2: Verify in browser**

Reload. Expected: black viewport with a faint grey geometric composition visible in the centre (no lighting yet, so it will look dark/flat). Console: `Geometry OK — meshes: 7`.

---

### Task 5: Lighting

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add 3-point lighting after the group setup**

Replace `console.log('Geometry OK — meshes:', group.children.length); renderer.render(scene, camera);` with:

```javascript
    // ── Lighting (3-point) ────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(3, 4, 3);

    const rimLight = new THREE.DirectionalLight(0xe8f0ff, 1.5);
    rimLight.position.set(-3, 1, -4);

    scene.add(ambientLight, keyLight, rimLight);

    console.log('Lighting OK');
    renderer.render(scene, camera);
```

- [ ] **Step 2: Verify in browser**

Reload. Expected: the geometric shapes are now clearly visible — grey/metallic-looking objects with highlights from the key light and cool rim highlights on back edges. Console: `Lighting OK`.

---

### Task 6: Animation Loop

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace the static render call with an animation loop**

Replace `console.log('Lighting OK'); renderer.render(scene, camera);` with:

```javascript
    // ── Animation loop ────────────────────────────────────────
    const clock = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Update mirror reflections — hide group so it doesn't reflect itself as black
      group.visible = false;
      cubeCamera.update(renderer, scene);
      group.visible = true;

      // Whole group slow Y rotation
      group.rotation.y += 0.003;

      // Core wobble
      icosaMesh.rotation.x = Math.sin(t * 0.4) * 0.2;
      icosaMesh.rotation.y += 0.002;

      // Individual slab rotations
      slabs.forEach((slab, i) => {
        const dir = i % 2 === 0 ? 1 : -1;
        slab.rotation.x += 0.001 * dir;
        slab.rotation.y += 0.0015 * (i % 3 === 0 ? 1 : -1);
      });

      // Torus spin
      torusMesh.rotation.z += 0.008;

      renderer.render(scene, camera);
    }

    animate();

    // ── Resize handler ────────────────────────────────────────
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
```

- [ ] **Step 2: Verify in browser**

Reload. Expected: geometry animates smoothly — group rotates slowly, torus spins faster, slabs have subtle independent movement. Surfaces show live mirror reflections of the lights and each other. No console errors.

---

### Task 7: Navigation Bar

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add nav markup and styles**

Add to the `<style>` block:

```css
.nav-bar {
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.nav-link {
  color: rgba(255, 255, 255, 0.75);
  text-decoration: none;
  font-size: 0.875rem;
  transition: color 0.2s;
}
.nav-link:hover { color: #ffffff; }
.nav-cta {
  color: #FFD700;
  font-weight: 700;
  font-size: 0.875rem;
  text-decoration: none;
  transition: opacity 0.2s;
}
.nav-cta:hover { opacity: 0.75; }
```

After `<div id="canvas-container"></div>`, add:

```html
<div class="relative z-10">
  <!-- Navigation -->
  <nav class="nav-bar fixed top-0 left-0 right-0 z-50 px-8 py-4 flex items-center justify-between">
    <span class="text-white font-bold text-xl tracking-tight">PC-Builder</span>
    <div class="hidden md:flex items-center gap-8">
      <a href="#" class="nav-link">Products</a>
      <a href="#" class="nav-link">Build</a>
      <a href="#" class="nav-link">About</a>
      <a href="#" class="nav-cta">Get Started</a>
    </div>
    <button class="md:hidden text-white" aria-label="Menu">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>
  </nav>
</div>
```

- [ ] **Step 2: Verify in browser**

Reload. Expected: frosted-glass nav bar fixed to top — "PC-Builder" left, nav links right on desktop. Nav links and "Get Started" (yellow) visible. 3D scene animates in the background behind it.

---

### Task 8: Hero Glass Panel + CTA Buttons

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add hero styles**

Add to the `<style>` block:

```css
.glass-panel {
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
}
.eyebrow {
  color: #FFD700;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.headline {
  font-size: clamp(2.5rem, 6vw, 5.5rem);
  font-weight: 900;
  line-height: 1.05;
  color: #ffffff;
}
.btn-primary {
  background: #ffffff;
  color: #000000;
  border: none;
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
  transition: background 0.2s, box-shadow 0.2s;
}
.btn-primary:hover {
  background: #FFD700;
  box-shadow: 0 0 24px rgba(255, 215, 0, 0.45);
}
.btn-secondary {
  background: transparent;
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.45);
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
  transition: background 0.2s, color 0.2s;
}
.btn-secondary:hover {
  background: #ffffff;
  color: #000000;
}
```

- [ ] **Step 2: Add hero section markup inside the `<div class="relative z-10">` block, after the `</nav>`**

```html
  <!-- Hero -->
  <section class="min-h-screen flex items-center px-6 md:px-16 pt-24 pb-12">
    <div class="glass-panel p-8 md:p-12 w-full md:w-5/12 max-w-xl">
      <p class="eyebrow mb-4">// Custom Builds</p>
      <h1 class="headline mb-6">Engineering<br>Masterpieces</h1>
      <p class="mb-10 leading-relaxed" style="color:#9ca3af;font-size:1rem;">
        Precision-built custom PCs, designed around your workflow.<br>
        Every component hand-selected. Every build benchmarked.
      </p>
      <div class="flex flex-wrap gap-4">
        <a href="#" class="btn-primary px-7 py-3 rounded-lg font-semibold text-sm">
          Configure Your Build
        </a>
        <a href="#" class="btn-secondary px-7 py-3 rounded-lg font-semibold text-sm">
          View Gallery
        </a>
      </div>
    </div>
  </section>
```

- [ ] **Step 3: Verify in browser**

Reload. Expected:
- Glass panel visible over 3D scene on the left — translucent dark blur, white text
- Yellow eyebrow `// Custom Builds`
- Massive bold headline "Engineering Masterpieces"
- Muted grey descriptor text
- White "Configure Your Build" button — hover turns it yellow with glow
- Transparent "View Gallery" button — hover fills white
- 3D mirror scene animates behind everything

---

### Task 9: Responsive Mobile Adjustments

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add mobile CSS overrides**

Add to the `<style>` block:

```css
@media (max-width: 767px) {
  #canvas-container canvas {
    transform: scale(0.65) translateY(-8%);
    transform-origin: center top;
  }
  .glass-panel {
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }
}
```

- [ ] **Step 2: Update resize handler in the script to adjust mobile camera**

Find the `window.addEventListener('resize', ...)` block and replace it with:

```javascript
    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      // Pull camera back slightly on narrow screens so geometry stays visible
      camera.position.z = window.innerWidth < 768 ? 8 : 6;
    }
    window.addEventListener('resize', onResize);
    onResize(); // run once on init to set correct z for current viewport
```

- [ ] **Step 3: Verify on mobile viewport**

In Chrome DevTools, switch to a mobile viewport (e.g. iPhone 12 — 390×844).
Expected:
- Glass panel fills full width
- 3D composition is visible above / around the panel, scaled down
- No overflow or horizontal scroll
- Buttons stack or wrap cleanly
- Text is readable at all sizes

---

### Task 10: Final Polish + Full Verification

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Remove all `console.log` debug statements**

Delete every line that starts with `console.log(` from the `<script>` block.

- [ ] **Step 2: Full desktop verification checklist**

Open `index.html` in Chrome on a desktop viewport (1440×900+):
- [ ] Scene background is near-black `#0a0a0a`
- [ ] Geometry rotates smoothly, no jank
- [ ] Mirror reflections update live (shapes reflect lights + each other)
- [ ] Torus ring has faint yellow glow
- [ ] Nav bar has frosted glass effect
- [ ] "PC-Builder" wordmark visible top-left
- [ ] "Get Started" nav link is yellow
- [ ] Glass panel is semi-transparent — scene visible through it
- [ ] Headline "Engineering Masterpieces" is full-width bold white
- [ ] Eyebrow `// Custom Builds` is yellow
- [ ] Hover on "Configure Your Build" → yellow background + gold glow
- [ ] Hover on "View Gallery" → white fill
- [ ] No console errors

- [ ] **Step 3: Full mobile verification checklist**

Switch Chrome DevTools to iPhone 12 (390×844):
- [ ] Glass panel fills viewport width
- [ ] 3D scene visible (not completely hidden)
- [ ] Headline readable, no overflow
- [ ] Buttons accessible
- [ ] No horizontal scroll

- [ ] **Step 4: Resize stress test**

Drag the browser window between narrow and wide. Confirm:
- Canvas resizes fluidly
- Camera aspect ratio updates correctly
- No black bars or letterboxing

---

## Complete File State

At the end of all tasks, `index.html` should match this structure:

```
<head>
  CDN: Tailwind, Inter, Three.js r128
  <style>
    reset + body
    #canvas-container
    .nav-bar
    .nav-link / .nav-cta
    .glass-panel
    .eyebrow / .headline
    .btn-primary / .btn-secondary
    @media (max-width: 767px)
  </style>
</head>
<body>
  #canvas-container (Three.js canvas injected here)
  <div.relative.z-10>
    <nav.nav-bar>  PC-Builder | Products Build About Get Started
    <section.min-h-screen>
      <div.glass-panel>
        eyebrow + headline + descriptor + buttons
  <script>
    renderer + scene + camera
    cubeRenderTarget + cubeCamera
    mirrorMat + torusMat
    icosaMesh + slabs[] + torusMesh + group
    ambientLight + keyLight + rimLight
    animate() { cubeCamera.update → group animations → renderer.render }
    onResize()
  </script>
</body>
```
