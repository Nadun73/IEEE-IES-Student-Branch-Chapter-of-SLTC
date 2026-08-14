import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, Menu, X } from 'lucide-react';
import iesLogoWhite from '../../assets/ies-logo-white-web.png';
import { navItems } from '../../data/siteContent.js';

const DESKTOP_HEADER_BREAKPOINT = 1080;

export default function Header({
  activeSection,
  isScrolled,
  scrollProgress,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [desktopDropdownOpen, setDesktopDropdownOpen] = useState(false);
  const [mobileSubmenuOpen, setMobileSubmenuOpen] = useState(false);
  const desktopDropdownTriggerRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        const shouldRestoreDesktopFocus =
          desktopDropdownOpen &&
          window.innerWidth > DESKTOP_HEADER_BREAKPOINT;
        setMenuOpen(false);
        setDesktopDropdownOpen(false);
        setMobileSubmenuOpen(false);
        if (shouldRestoreDesktopFocus) {
          desktopDropdownTriggerRef.current?.focus();
        }
      }
    };

    const handleResize = () => {
      if (window.innerWidth > DESKTOP_HEADER_BREAKPOINT) {
        setMenuOpen(false);
        setMobileSubmenuOpen(false);
      } else {
        setDesktopDropdownOpen(false);
      }
    };

    document.body.classList.toggle('menu-open', menuOpen);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);

    return () => {
      document.body.classList.remove('menu-open');
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [desktopDropdownOpen, menuOpen]);

  useEffect(() => {
    if (
      menuOpen &&
      [
        'masterminds-preview',
        'masterminds-home',
        'advisory',
        'executive',
        'subcommittee',
      ].includes(activeSection)
    ) {
      setMobileSubmenuOpen(true);
    }
  }, [activeSection, menuOpen]);

  const closeMenu = () => {
    setMenuOpen(false);
    setDesktopDropdownOpen(false);
    setMobileSubmenuOpen(false);
  };
  const isItemActive = (item) => {
    const sectionId = item.sectionId ?? item.href.split('#')[1];
    const activeSections =
      item.activeSections ?? (sectionId ? [sectionId] : []);
    return activeSections.includes(activeSection);
  };

  return (
    <>
      <header className={`site-header ${isScrolled ? 'is-scrolled' : ''}`}>
        <div className="site-header__inner shell">
          <a className="brand-mark" href="/#home" onClick={closeMenu}>
            <img
              src={iesLogoWhite}
              alt="IEEE Industrial Electronics Society Student Branch Chapter of SLTC"
            />
          </a>

          <nav className="desktop-navigation" aria-label="Primary navigation">
            {navItems.map((item) => {
              const isActive = isItemActive(item);
              if (item.children) {
                return (
                  <div
                    className={[
                      'desktop-navigation__dropdown',
                      desktopDropdownOpen ? 'is-open' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    key={item.href}
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) {
                        setDesktopDropdownOpen(false);
                      }
                    }}
                  >
                    <button
                      className={[
                        'desktop-navigation__trigger',
                        isActive ? 'is-active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      type="button"
                      ref={desktopDropdownTriggerRef}
                      aria-expanded={desktopDropdownOpen}
                      aria-controls="masterminds-desktop-menu"
                      onClick={() =>
                        setDesktopDropdownOpen((current) => !current)
                      }
                    >
                      {item.label}
                      <ChevronDown size={14} aria-hidden="true" />
                    </button>

                    <div
                      className="desktop-navigation__submenu"
                      id="masterminds-desktop-menu"
                      aria-hidden={!desktopDropdownOpen}
                    >
                      {item.children.map((child, index) => {
                        const childActive = isItemActive(child);
                        return (
                          <a
                            className={childActive ? 'is-active' : ''}
                            href={child.href}
                            key={child.href}
                            aria-current={
                              childActive ? 'location' : undefined
                            }
                            onClick={() => setDesktopDropdownOpen(false)}
                          >
                            <span>0{index + 1}</span>
                            {child.label}
                            <ArrowRight size={15} aria-hidden="true" />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              return (
                <a
                  className={isActive ? 'is-active' : ''}
                  href={item.href}
                  key={item.href}
                  aria-current={isActive ? 'location' : undefined}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          <a className="header-cta" href="/#connect">
            Contact us
            <ArrowRight size={16} aria-hidden="true" />
          </a>

          <button
            className="menu-toggle"
            type="button"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => {
              if (menuOpen) {
                closeMenu();
              } else {
                setMenuOpen(true);
              }
            }}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>

        <div className="scroll-progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${scrollProgress})` }} />
        </div>
      </header>

      <div
        className={`mobile-navigation ${menuOpen ? 'is-open' : ''}`}
        id="mobile-navigation"
        aria-hidden={!menuOpen}
      >
        <div className="mobile-navigation__inner">
          <span className="mobile-navigation__eyebrow">Navigate the chapter</span>
          <nav aria-label="Mobile navigation">
            {navItems.map((item, index) => {
              const isActive = isItemActive(item);
              if (item.children) {
                return (
                  <div
                    className={[
                      'mobile-navigation__group',
                      mobileSubmenuOpen ? 'is-open' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    key={item.href}
                  >
                    <button
                      className={[
                        'mobile-navigation__group-trigger',
                        isActive ? 'is-active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      type="button"
                      aria-expanded={mobileSubmenuOpen}
                      aria-controls="masterminds-mobile-menu"
                      onClick={() =>
                        setMobileSubmenuOpen((current) => !current)
                      }
                    >
                      <span>0{index + 1}</span>
                      {item.label}
                      <ChevronDown size={20} aria-hidden="true" />
                    </button>

                    {mobileSubmenuOpen && (
                      <div
                        className="mobile-navigation__submenu"
                        id="masterminds-mobile-menu"
                      >
                        {item.children.map((child) => {
                          const childActive = isItemActive(child);
                          return (
                            <a
                              className={childActive ? 'is-active' : ''}
                              href={child.href}
                              onClick={closeMenu}
                              key={child.href}
                              aria-current={
                                childActive ? 'location' : undefined
                              }
                            >
                              {child.label}
                              <ArrowRight size={16} aria-hidden="true" />
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <a
                  className={[
                    'mobile-navigation__link',
                    isActive ? 'is-active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  href={item.href}
                  onClick={closeMenu}
                  key={item.href}
                  aria-current={isActive ? 'location' : undefined}
                >
                  <span>0{index + 1}</span>
                  {item.label}
                  <ArrowRight size={20} aria-hidden="true" />
                </a>
              );
            })}
          </nav>
          <p>IEEE Industrial Electronics Society Student Branch Chapter of SLTC</p>
        </div>
      </div>
    </>
  );
}
