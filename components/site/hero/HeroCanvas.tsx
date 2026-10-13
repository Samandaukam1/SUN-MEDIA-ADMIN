'use client';

import dynamic from 'next/dynamic';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';

import { Logo } from '@/components/brand/Logo';
import type { BubblePartner } from '@/lib/site/bubbles';

const HeroScene = dynamic(() => import('./HeroScene'), { ssr: false });

/** If WebGL fails mid-way, the 2D logo simply stays. */
class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * The hero's 3D stage. Until three.js has loaded (and on devices without WebGL) the flat logo floats in its
 * place; the scene stops rendering whenever the hero is off screen.
 */
export function HeroCanvas({ partners }: { partners: BubblePartner[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [supported, setSupported] = useState(false);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSupported(webglAvailable());
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '80px' });
    io.observe(el);
    const onVisibility = () => setVisible(!document.hidden && el.getBoundingClientRect().bottom > 0);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const showScene = supported && !failed;

  return (
    <div ref={ref} className="absolute inset-0">
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 flex items-start justify-center pt-[13svh] transition-opacity duration-1000 lg:items-center lg:justify-end lg:pt-0 lg:pr-[7vw] ${
          ready ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="s-hero-fallback relative w-[min(78vw,520px)] lg:w-[min(40vw,600px)]">
          <div className="absolute inset-[-30%] rounded-full bg-[radial-gradient(circle,rgb(212_252_24/0.22),transparent_60%)] blur-2xl" />
          <Logo width={600} onDark className="relative h-auto w-full drop-shadow-[0_30px_60px_rgb(0_0_0/0.6)]" />
        </div>
      </div>
      {showScene ? (
        <div className={`absolute inset-0 transition-opacity duration-[1400ms] ${ready ? 'opacity-100' : 'opacity-0'}`}>
          <SceneBoundary onError={() => setFailed(true)}>
            <HeroScene active={visible} onReady={() => setReady(true)} partners={partners} />
          </SceneBoundary>
        </div>
      ) : null}
    </div>
  );
}
