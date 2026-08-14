import { ArrowRight } from 'lucide-react';
import { photoAlbums } from '../../data/photoAlbums.js';
import PhotoAlbumGrid from '../ui/PhotoAlbumGrid.jsx';
import SectionLabel from '../ui/SectionLabel.jsx';

export default function PhotoAlbumsPreview() {
  const featuredAlbums = photoAlbums.slice(0, 4);

  return (
    <section className="section section--light photo-albums" id="albums">
      <div className="shell">
        <div className="section-intro section-intro--split" data-reveal>
          <div>
            <SectionLabel>Completed event highlights</SectionLabel>
            <h2>
              Photo Albums.
              <span> Moments that remain.</span>
            </h2>
          </div>
          <div className="section-intro__copy">
            <p>
              Revisit the people, energy, and shared moments behind our
              completed events. Each collection opens on Facebook.
            </p>
            <a href="/albums/">
              View all photo albums
              <ArrowRight size={17} aria-hidden="true" />
            </a>
          </div>
        </div>

        <PhotoAlbumGrid albums={featuredAlbums} />

        <a className="photo-albums__rail" href="/albums/" data-reveal>
          <span>Full event archive</span>
          <strong>Browse all {String(photoAlbums.length).padStart(2, '0')} albums</strong>
          <ArrowRight size={21} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

