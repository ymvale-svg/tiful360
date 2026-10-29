import { useEffect, useRef } from "react";

/**
 * Interactive line-field backdrop (adapted from 21st.dev ravikatiyar162 "Mouse Following Line").
 * Short strokes on a grid point toward a focus that eases after the pointer or finger; when idle
 * the focus circles the centre (a slow "360"). Strokes near the focus are longer and brighter.
 * Decorative only: pointer-events none, aria-hidden, paused in hidden tabs, static under
 * prefers-reduced-motion. Colour comes from the --primary token so both themes follow.
 */
export function LineFieldBackground({ spacing = 28, strokeLength = 9 }: { spacing?: number; strokeLength?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastPointerAt = -Infinity;
    const pointer = { x: 0, y: 0 };
    const focus = { x: 0, y: 0 };
    let colour = "";

    const readColour = () => {
      colour = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "215 90% 42%";
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!focus.x && !focus.y) Object.assign(focus, { x: width / 2, y: height / 2 });
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const reach = Math.max(width, height) * 0.45;
      ctx.lineWidth = 1.25;
      ctx.lineCap = "round";
      for (let x = spacing / 2; x < width; x += spacing) {
        for (let y = spacing / 2; y < height; y += spacing) {
          const dx = focus.x - x;
          const dy = focus.y - y;
          const dist = Math.hypot(dx, dy);
          if (dist < 12) continue;
          const near = Math.max(0, 1 - dist / reach);
          const len = strokeLength * (0.55 + near);
          const ux = dx / dist;
          const uy = dy / dist;
          ctx.strokeStyle = `hsl(${colour} / ${0.16 + near * 0.45})`;
          ctx.beginPath();
          ctx.moveTo(x - ux * len * 0.5, y - uy * len * 0.5);
          ctx.lineTo(x + ux * len * 0.5, y + uy * len * 0.5);
          ctx.stroke();
        }
      }
    };

    const tick = (t: number) => {
      const idle = t - lastPointerAt > 2500;
      const target = idle
        ? {
            x: width / 2 + Math.cos(t / 4000) * Math.min(width, height) * 0.3,
            y: height / 2 + Math.sin(t / 4000) * Math.min(width, height) * 0.3,
          }
        : pointer;
      focus.x += (target.x - focus.x) * (idle ? 0.03 : 0.12);
      focus.y += (target.y - focus.y) * (idle ? 0.03 : 0.12);
      draw();
      frame = requestAnimationFrame(tick);
    };

    const onPointer = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      lastPointerAt = performance.now();
    };
    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && !reduceMotion) frame = requestAnimationFrame(tick);
    };
    const onResize = () => { resize(); if (reduceMotion) draw(); };

    // Theme switches toggle the "dark" class on <html>; re-read the token then.
    const themeObserver = new MutationObserver(() => { readColour(); if (reduceMotion) draw(); });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    readColour();
    resize();
    if (reduceMotion) {
      draw();
    } else {
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("pointerdown", onPointer, { passive: true });
      document.addEventListener("visibilitychange", onVisibility);
      frame = requestAnimationFrame(tick);
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frame);
      themeObserver.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [spacing, strokeLength]);

  // Fade the field out behind the centred content so text stays clean.
  const calmCentre = "radial-gradient(ellipse 300px 360px at 50% 50%, transparent 45%, #000 100%)";
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0"
      style={{ maskImage: calmCentre, WebkitMaskImage: calmCentre }}
    />
  );
}
