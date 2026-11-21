import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext.tsx';
import { usePrefersReducedMotion } from '../../hooks/useInView.ts';

interface ParticleNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  kind: 'dust' | 'star' | 'orb';
  phase: number;
  twinkleSpeed: number;
}

export function LivingUniverseParticles({
  densityOverride,
}: {
  densityOverride?: 'minimal' | 'balanced' | 'cinematic';
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const location = useLocation();
  const { theme, preferences } = useTheme();
  const systemReducedMotion = usePrefersReducedMotion();

  const isPlayerRoute = location.pathname.startsWith('/watch');
  const isAuthOrAdminRoute =
    location.pathname.startsWith('/login') ||
    location.pathname.startsWith('/register') ||
    location.pathname.startsWith('/admin');
  const isHomeRoute = location.pathname === '/';

  const disabled =
    theme !== 'dark' ||
    isPlayerRoute ||
    systemReducedMotion ||
    preferences.reducedMotion;

  useEffect(() => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animId = 0;
    let width = window.innerWidth;
    let height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const isMobile = width < 768;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const baseDensity =
      densityOverride === 'cinematic'
        ? 36
        : densityOverride === 'minimal'
          ? 14
          : 24;

    const routeMultiplier = isHomeRoute ? 1 : isAuthOrAdminRoute ? 0.45 : 0.68;
    const mobileScale = isMobile ? 0.45 : 1;
    const targetCount = Math.max(8, Math.round(baseDensity * routeMultiplier * mobileScale));

    // Pre-render a single soft ambient orb sprite once to avoid per-frame gradient allocation
    const orbSprite = document.createElement('canvas');
    orbSprite.width = 128;
    orbSprite.height = 128;
    const orbCtx = orbSprite.getContext('2d');
    if (orbCtx) {
      const grad = orbCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(124, 92, 255, 0.08)');
      grad.addColorStop(1, 'rgba(124, 92, 255, 0)');
      orbCtx.fillStyle = grad;
      orbCtx.fillRect(0, 0, 128, 128);
    }

    const nodes: ParticleNode[] = Array.from({ length: targetCount }, (_, i) => {
      const kind: ParticleNode['kind'] =
        i % 8 === 0 ? 'orb' : i % 3 === 0 ? 'star' : 'dust';
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * (kind === 'orb' ? 0.09 : 0.18),
        vy: -0.04 - Math.random() * (kind === 'orb' ? 0.08 : 0.16),
        radius:
          kind === 'orb'
            ? 38 + Math.random() * 42
            : kind === 'star'
              ? 1 + Math.random() * 1.1
              : 0.65 + Math.random() * 0.9,
        alpha:
          kind === 'orb'
            ? 0.55 + Math.random() * 0.35
            : kind === 'star'
              ? 0.18 + Math.random() * 0.3
              : 0.1 + Math.random() * 0.2,
        kind,
        phase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.008 + Math.random() * 0.012,
      };
    });

    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    const onPointerMove = (e: PointerEvent) => {
      if (isMobile) return;
      targetMouseX = (e.clientX / Math.max(1, width) - 0.5) * 8;
      targetMouseY = (e.clientY / Math.max(1, height) - 0.5) * 8;
    };

    const renderFrame = () => {
      if (document.hidden) {
        animId = 0;
        return;
      }

      ctx.clearRect(0, 0, width, height);
      mouseX += (targetMouseX - mouseX) * 0.035;
      mouseY += (targetMouseY - mouseY) * 0.035;

      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        n.phase += n.twinkleSpeed;

        if (n.x < -70) n.x = width + 60;
        if (n.x > width + 70) n.x = -60;
        if (n.y < -70) n.y = height + 60;
        if (n.y > height + 70) n.y = -60;

        const parallaxDepth = n.kind === 'orb' ? 0.25 : n.kind === 'star' ? 0.5 : 0.35;
        const px = n.x + mouseX * parallaxDepth;
        const py = n.y + mouseY * parallaxDepth;

        if (n.kind === 'orb') {
          ctx.globalAlpha = n.alpha;
          ctx.drawImage(orbSprite, px - n.radius, py - n.radius, n.radius * 2, n.radius * 2);
          ctx.globalAlpha = 1;
        } else if (n.kind === 'star') {
          const twinkle = 0.55 + 0.45 * Math.sin(n.phase);
          const a = n.alpha * twinkle;
          ctx.fillStyle = `rgba(155, 135, 255, ${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(px, py, n.radius, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(155, 135, 255, ${n.alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(px, py, n.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animId = requestAnimationFrame(renderFrame);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (animId) {
          cancelAnimationFrame(animId);
          animId = 0;
        }
      } else if (!animId) {
        animId = requestAnimationFrame(renderFrame);
      }
    };

    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (!isMobile) {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
    }

    if (!document.hidden) {
      animId = requestAnimationFrame(renderFrame);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (!isMobile) {
        window.removeEventListener('pointermove', onPointerMove);
      }
    };
  }, [disabled, densityOverride, isHomeRoute, isAuthOrAdminRoute]);

  if (disabled) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[1] opacity-75"
    />
  );
}
