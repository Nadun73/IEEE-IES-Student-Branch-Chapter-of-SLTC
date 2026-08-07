import { useRef } from 'react';
import { CircuitBoard, Cpu, RadioTower, Zap } from 'lucide-react';

const systemNodes = [
  {
    id: 'sensors',
    number: '01',
    kicker: 'Input',
    label: 'Sensors',
    Icon: RadioTower,
  },
  {
    id: 'logic',
    number: '02',
    kicker: 'Process',
    label: 'Embedded',
    Icon: Cpu,
  },
  {
    id: 'power',
    number: '03',
    kicker: 'Convert',
    label: 'Power stage',
    Icon: Zap,
  },
  {
    id: 'io',
    number: '04',
    kicker: 'Output',
    label: 'Control I/O',
    Icon: CircuitBoard,
  },
];

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
      role="img"
      aria-label="A white printed circuit board linking sensors, embedded logic, power conversion, and control outputs."
    >
      <div className="hero-visual__glow" aria-hidden="true" />
      <div className="hero-system-halo hero-system-halo--outer" aria-hidden="true">
        <i />
      </div>
      <div className="hero-system-halo hero-system-halo--inner" aria-hidden="true">
        <i />
      </div>

      <div className="hero-system-map" aria-hidden="true">
        <div className="hero-system-map__topline">
          <span>
            <i />
            Electronic systems board
          </span>
          <span>PCB // REV 01</span>
        </div>

        <svg
          className="hero-system-map__links"
          viewBox="0 0 520 520"
          preserveAspectRatio="none"
          focusable="false"
        >
          <defs>
            <linearGradient id="hero-system-link" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#006495" stopOpacity="0.32" />
              <stop offset="52%" stopColor="#0584bc" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#e47726" stopOpacity="0.72" />
            </linearGradient>
          </defs>
          <path
            className="hero-system-map__trace"
            d="M72 160 H181 Q205 160 205 184 V220"
          />
          <path
            className="hero-system-map__trace"
            d="M448 160 H339 Q315 160 315 184 V220"
          />
          <path
            className="hero-system-map__trace"
            d="M72 360 H181 Q205 360 205 336 V300"
          />
          <path
            className="hero-system-map__trace"
            d="M448 360 H339 Q315 360 315 336 V300"
          />
          <path className="hero-system-map__branch" d="M108 78 V116 H154" />
          <path className="hero-system-map__branch" d="M412 78 V116 H366" />
          <path className="hero-system-map__branch" d="M108 442 V404 H154" />
          <path className="hero-system-map__branch" d="M412 442 V404 H366" />
          <path className="hero-system-map__branch" d="M38 260 H153" />
          <path className="hero-system-map__branch" d="M482 260 H367" />
          <circle className="hero-system-map__packet" cx="205" cy="202" r="3" />
          <circle className="hero-system-map__packet" cx="315" cy="202" r="3" />
          <circle className="hero-system-map__packet" cx="205" cy="318" r="3" />
          <circle className="hero-system-map__packet" cx="315" cy="318" r="3" />
          <circle className="hero-system-map__pad" cx="108" cy="78" r="4" />
          <circle className="hero-system-map__pad" cx="412" cy="78" r="4" />
          <circle className="hero-system-map__pad" cx="108" cy="442" r="4" />
          <circle className="hero-system-map__pad" cx="412" cy="442" r="4" />
        </svg>

        <div className="hero-system-core">
          <span className="hero-system-core__ring hero-system-core__ring--outer">
            <i />
          </span>
          <span className="hero-system-core__ring hero-system-core__ring--inner" />
          <span className="hero-system-core__sweep" />
          <div className="hero-system-core__copy">
            <span>Embedded core</span>
            <Cpu size={31} strokeWidth={1.45} />
            <strong>ACTIVE</strong>
            <small>signals online</small>
          </div>
        </div>

        {systemNodes.map(({ id, number, kicker, label, Icon }) => (
          <div className={`hero-system-node hero-system-node--${id}`} key={id}>
            <span className="hero-system-node__index">{number}</span>
            <span className="hero-system-node__icon">
              <Icon size={18} strokeWidth={1.7} />
            </span>
            <span className="hero-system-node__copy">
              <small>{kicker}</small>
              <strong>{label}</strong>
            </span>
            <i className="hero-system-node__signal" />
          </div>
        ))}

        <div className="hero-system-map__footer">
          <span>Input</span>
          <i />
          <span>Process</span>
          <i />
          <span>Switch</span>
          <i />
          <span>Output</span>
          <span className="hero-system-map__signal">
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>

      <div className="hero-visual__readout hero-visual__readout--one" aria-hidden="true">
        <span>Signal bus</span>
        <strong>Stable</strong>
      </div>
      <div className="hero-visual__readout hero-visual__readout--two" aria-hidden="true">
        <span>Board status</span>
        <strong>Online</strong>
      </div>
    </div>
  );
}
