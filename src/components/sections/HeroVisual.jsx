import { useRef } from 'react';
import { Factory, RadioTower, Zap } from 'lucide-react';
import iesLogoColor from '../../assets/ies-logo-color-web.png';

export default function HeroVisual() {
  const visualRef = useRef(null);

  const handlePointerMove = (event) => {
    const visual = visualRef.current;
    if (!visual || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const bounds = visual.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    visual.style.setProperty('--pointer-x', `${x * 12}px`);
    visual.style.setProperty('--pointer-y', `${y * 12}px`);
  };

  const resetPointer = () => {
    visualRef.current?.style.setProperty('--pointer-x', '0px');
    visualRef.current?.style.setProperty('--pointer-y', '0px');
  };

  return (
    <div
      className="hero-visual"
      ref={visualRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      aria-label="IEEE Industrial Electronics Society chapter identity"
    >
      <div className="hero-visual__glow" aria-hidden="true" />
      <div className="orbit orbit--outer" aria-hidden="true">
        <i />
      </div>
      <div className="orbit orbit--inner" aria-hidden="true">
        <i />
      </div>

      <div className="logo-console">
        <div className="console-bar">
          <span>
            <i />
            SLTC / IES
          </span>
          <span>01—26</span>
        </div>
        <img
          className="hero-lockup"
          src={iesLogoColor}
          alt="IEEE Industrial Electronics Society Student Branch Chapter of SLTC"
        />
        <div className="console-footer" aria-hidden="true">
          <span>INTELLIGENT INDUSTRY</span>
          <span className="console-signal">
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>

      <div className="system-tag system-tag--one" aria-hidden="true">
        <Factory size={15} />
        Automation
      </div>
      <div className="system-tag system-tag--two" aria-hidden="true">
        <RadioTower size={15} />
        Connected
      </div>
      <div className="system-tag system-tag--three" aria-hidden="true">
        <Zap size={15} />
        Energy
      </div>
    </div>
  );
}
