'use client';

import { prefersReducedMotion } from '@ledgerline/core/theme';
import { gsap } from 'gsap';
import { useEffect, useRef, useState } from 'react';

interface Place {
  city: string;
  lat: number;
  lng: number;
  amount: number;
}

const DOT_VERTEX = /* glsl */ `
  uniform vec3 uLight;
  uniform float uSize;
  varying float vAlpha;
  void main() {
    vec3 worldNormal = normalize(mat3(modelMatrix) * position);
    vec3 viewNormal = normalize(normalMatrix * position);
    // Halftone: the darker the shade, the bigger the ink dot.
    float shade = 1.0 - clamp(dot(worldNormal, uLight), 0.0, 1.0);
    gl_PointSize = (0.6 + shade * shade * 4.6) * uSize;
    vAlpha = smoothstep(-0.02, 0.25, viewNormal.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DOT_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    if (length(gl_PointCoord - 0.5) > 0.5) discard;
    gl_FragColor = vec4(uColor, vAlpha);
  }
`;

const MARKER_VERTEX = /* glsl */ `
  attribute float aSize;
  uniform float uSize;
  varying float vAlpha;
  void main() {
    vec3 viewNormal = normalize(normalMatrix * position);
    vAlpha = smoothstep(0.0, 0.2, viewNormal.z);
    gl_PointSize = aSize * uSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MARKER_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uPaper;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    // An inked ring with a paper centre, like a map pin on newsprint.
    vec3 color = d < 0.22 ? uPaper : uColor;
    gl_FragColor = vec4(color, vAlpha);
  }
`;

/**
 * Dispatches Abroad: a halftone globe drawn with three.js, with an arc from London
 * to every city paid in the last 90 days. Drag to turn it; buttons do the same.
 */
export function WireGlobe({ hq, places }: { hq: { city: string; lat: number; lng: number }; places: Place[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const controls = useRef<{ turn: (radians: number) => void; render: () => void } | null>(null);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const placesKey = places.map((p) => p.city).join('|');

  useEffect(() => {
    controls.current?.render();
  }, [paused]);

  useEffect(() => {
    let disposed = false;
    let teardown = () => {};

    void (async () => {
      const THREE = await import('three');
      const wrap = wrapRef.current;
      if (disposed || !wrap) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      } catch {
        setFailed(true);
        return;
      }
      const reduced = prefersReducedMotion();
      setStill(reduced);

      const readColors = () => {
        const styles = getComputedStyle(document.documentElement);
        const get = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
        return { ink: get('--ink', '#151311'), accent: get('--candle-down', '#151311'), paper: get('--paper-2', '#f6efe0') };
      };
      let colors = readColors();

      renderer.setClearColor(0x000000, 0);
      renderer.domElement.setAttribute('aria-hidden', 'true');
      wrap.prepend(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
      camera.position.set(0, 0, 4.4);

      const tilt = new THREE.Group();
      tilt.rotation.x = ((hq.lat * Math.PI) / 180) * 0.55;
      scene.add(tilt);
      const globe = new THREE.Group();
      globe.rotation.y = -Math.PI / 2 - (hq.lng * Math.PI) / 180;
      tilt.add(globe);

      const toVector = (lat: number, lng: number, radius = 1) => {
        const phi = ((90 - lat) * Math.PI) / 180;
        const theta = ((lng + 180) * Math.PI) / 180;
        return new THREE.Vector3(
          -radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.cos(phi),
          radius * Math.sin(phi) * Math.sin(theta),
        );
      };

      const disposables: { dispose: () => void }[] = [];
      const track = <T extends { dispose: () => void }>(item: T) => {
        disposables.push(item);
        return item;
      };

      // Hides lines & dots on the far side.
      const occluder = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.985, 48, 48)),
        track(new THREE.MeshBasicMaterial({ colorWrite: false })),
      );
      globe.add(occluder);

      // Halftone stipple on a Fibonacci lattice.
      const count = 6500;
      const positions = new Float32Array(count * 3);
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < count; i++) {
        const y = 1 - (i / (count - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        positions.set([Math.cos(golden * i) * r, y, Math.sin(golden * i) * r], i * 3);
      }
      const dotGeometry = track(new THREE.BufferGeometry());
      dotGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const dotMaterial = track(
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          uniforms: {
            uColor: { value: new THREE.Color(colors.ink) },
            uLight: { value: new THREE.Vector3(-0.5, 0.62, 0.8).normalize() },
            uSize: { value: 1 },
          },
          vertexShader: DOT_VERTEX,
          fragmentShader: DOT_FRAGMENT,
        }),
      );
      globe.add(new THREE.Points(dotGeometry, dotMaterial));

      // Engraved graticule.
      const grid: InstanceType<typeof THREE.Vector3>[] = [];
      for (let lat = -60; lat <= 60; lat += 30) {
        for (let lng = -180; lng < 180; lng += 4) grid.push(toVector(lat, lng, 1.003), toVector(lat, lng + 4, 1.003));
      }
      for (let lng = -180; lng < 180; lng += 30) {
        for (let lat = -88; lat < 88; lat += 4) grid.push(toVector(lat, lng, 1.003), toVector(lat + 4, lng, 1.003));
      }
      const gridMaterial = track(new THREE.LineBasicMaterial({ color: colors.ink, transparent: true, opacity: 0.3 }));
      globe.add(new THREE.LineSegments(track(new THREE.BufferGeometry().setFromPoints(grid)), gridMaterial));

      // Outline at the silhouette (accounts for perspective).
      const distance = camera.position.z;
      const outlinePoints = Array.from({ length: 129 }, (_, i) => {
        const a = (i / 128) * Math.PI * 2;
        const r = Math.sqrt(1 - 1 / (distance * distance));
        return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 1 / distance);
      });
      const outlineMaterial = track(new THREE.LineBasicMaterial({ color: colors.ink }));
      scene.add(new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(outlinePoints)), outlineMaterial));

      // Routes from head office.
      const origin = toVector(hq.lat, hq.lng);
      const arcMaterial = track(new THREE.LineBasicMaterial({ color: colors.accent }));
      const arcs = places
        .filter((p) => p.city !== hq.city)
        .slice(0, 24)
        .map((place) => {
          const end = toVector(place.lat, place.lng);
          const omega = Math.max(origin.angleTo(end), 1e-4);
          const lift = 0.05 + 0.34 * (omega / Math.PI);
          const points = Array.from({ length: 65 }, (_, k) => {
            const t = k / 64;
            return origin
              .clone()
              .multiplyScalar(Math.sin((1 - t) * omega) / Math.sin(omega))
              .add(end.clone().multiplyScalar(Math.sin(t * omega) / Math.sin(omega)))
              .multiplyScalar(1 + lift * Math.sin(Math.PI * t));
          });
          const geometry = track(new THREE.BufferGeometry().setFromPoints(points));
          geometry.setDrawRange(0, reduced ? points.length : 0);
          globe.add(new THREE.Line(geometry, arcMaterial));
          return { geometry, length: points.length, state: { p: reduced ? 1 : 0 } };
        });

      // City pins sized by how much was sent there.
      const maxAmount = Math.max(1, ...places.map((p) => p.amount));
      const pinPositions = new Float32Array(places.length * 3 + 3);
      const pinSizes = new Float32Array(places.length + 1);
      places.forEach((p, i) => {
        pinPositions.set(toVector(p.lat, p.lng, 1.004).toArray(), i * 3);
        pinSizes[i] = 6 + 8 * Math.sqrt(p.amount / maxAmount);
      });
      pinPositions.set(origin.clone().multiplyScalar(1.004).toArray(), places.length * 3);
      pinSizes[places.length] = 15;
      const pinGeometry = track(new THREE.BufferGeometry());
      pinGeometry.setAttribute('position', new THREE.BufferAttribute(pinPositions, 3));
      pinGeometry.setAttribute('aSize', new THREE.BufferAttribute(pinSizes, 1));
      const pinMaterial = track(
        new THREE.ShaderMaterial({
          transparent: true,
          uniforms: {
            uColor: { value: new THREE.Color(colors.accent) },
            uPaper: { value: new THREE.Color(colors.paper) },
            uSize: { value: 1 },
          },
          vertexShader: MARKER_VERTEX,
          fragmentShader: MARKER_FRAGMENT,
        }),
      );
      globe.add(new THREE.Points(pinGeometry, pinMaterial));

      /* ---- rendering: continuous only while something moves, otherwise on demand ---- */
      let frame = 0;
      let visible = true;
      let dragging = false;
      let drawing = arcs.length && !reduced ? arcs.length : 0;
      let last = performance.now();

      const animating = () => visible && (dragging || drawing > 0 || (!reduced && !pausedRef.current));
      const tick = (now: number) => {
        frame = 0;
        const dt = Math.min(48, now - last);
        last = now;
        if (!reduced && !pausedRef.current && !dragging) globe.rotation.y += dt * 0.00011;
        renderer.render(scene, camera);
        if (animating()) frame = requestAnimationFrame(tick);
      };
      const render = () => {
        if (!frame && visible) {
          last = performance.now();
          frame = requestAnimationFrame(tick);
        }
      };

      arcs.forEach((arc, i) => {
        if (reduced) return;
        gsap.to(arc.state, {
          p: 1,
          duration: 1.2,
          delay: 0.25 + i * 0.08,
          ease: 'power2.out',
          onUpdate: () => {
            arc.geometry.setDrawRange(0, Math.ceil(arc.state.p * arc.length));
            render();
          },
          onComplete: () => {
            drawing -= 1;
          },
        });
      });

      const resize = () => {
        const size = wrap.clientWidth;
        const ratio = Math.min(window.devicePixelRatio, 2);
        renderer.setPixelRatio(ratio);
        renderer.setSize(size, size, false);
        const scale = (size / 440) * ratio;
        dotMaterial.uniforms.uSize!.value = scale;
        pinMaterial.uniforms.uSize!.value = scale;
        render();
      };
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(wrap);

      const visibility = new IntersectionObserver(([entry]) => {
        visible = Boolean(entry?.isIntersecting) && !document.hidden;
        if (visible) render();
      });
      visibility.observe(wrap);
      const onVisibility = () => {
        visible = !document.hidden;
        if (visible) render();
      };
      document.addEventListener('visibilitychange', onVisibility);

      // Theme switches recolour the ink.
      const onPrefs = () => {
        colors = readColors();
        dotMaterial.uniforms.uColor!.value.set(colors.ink);
        pinMaterial.uniforms.uColor!.value.set(colors.accent);
        pinMaterial.uniforms.uPaper!.value.set(colors.paper);
        gridMaterial.color.set(colors.ink);
        outlineMaterial.color.set(colors.ink);
        arcMaterial.color.set(colors.accent);
        render();
      };
      window.addEventListener('ledgerline:prefs', onPrefs);

      // Drag to turn.
      const canvas = renderer.domElement;
      let lastX = 0;
      let lastY = 0;
      const onDown = (event: PointerEvent) => {
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
        render();
      };
      const onMove = (event: PointerEvent) => {
        if (!dragging) return;
        globe.rotation.y += (event.clientX - lastX) * 0.006;
        tilt.rotation.x = Math.max(-1.2, Math.min(1.2, tilt.rotation.x + (event.clientY - lastY) * 0.004));
        lastX = event.clientX;
        lastY = event.clientY;
      };
      const onUp = () => {
        dragging = false;
        render();
      };
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);

      controls.current = {
        turn: (radians) => {
          if (reduced) globe.rotation.y += radians;
          else gsap.to(globe.rotation, { y: globe.rotation.y + radians, duration: 0.6, ease: 'power2.out', onUpdate: render });
          render();
        },
        render,
      };
      resize();

      teardown = () => {
        cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        visibility.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('ledgerline:prefs', onPrefs);
        gsap.killTweensOf(arcs.map((a) => a.state));
        gsap.killTweensOf(globe.rotation);
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
        canvas.remove();
        controls.current = null;
      };
    })();

    return () => {
      disposed = true;
      teardown();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild only when the set of cities changes
  }, [hq.city, hq.lat, hq.lng, placesKey]);

  if (failed) {
    return <p className="ll-globe__fallback">This browser can’t draw the globe. The destinations are listed alongside.</p>;
  }

  return (
    <div className="ll-globe">
      <div
        ref={wrapRef}
        className="ll-globe__stage"
        role="img"
        aria-label={`Globe showing payout routes from ${hq.city} to ${places.length} cities in the last 90 days.`}
      />
      <div className="ll-globe__controls ll-no-print">
        <button type="button" className="ll-button ll-button--small ll-button--ghost" aria-label="Turn globe west" onClick={() => controls.current?.turn(-0.6)}>
          <span aria-hidden>◀</span>
        </button>
        <button type="button" className="ll-button ll-button--small ll-button--ghost" aria-label="Turn globe east" onClick={() => controls.current?.turn(0.6)}>
          <span aria-hidden>▶</span>
        </button>
        {!still && (
          <button
            type="button"
            className="ll-button ll-button--small ll-button--ghost"
            aria-pressed={paused}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? 'Spin' : 'Pause'}
          </button>
        )}
      </div>
    </div>
  );
}
