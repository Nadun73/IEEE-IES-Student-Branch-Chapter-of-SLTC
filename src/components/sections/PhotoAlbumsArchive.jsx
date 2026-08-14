import { ArrowLeft, Images } from 'lucide-react';
import { photoAlbums } from '../../data/photoAlbums.js';
import PhotoAlbumGrid from '../ui/PhotoAlbumGrid.jsx';
import SectionLabel from '../ui/SectionLabel.jsx';

export default function PhotoAlbumsArchive() {
  return (
    <>
      <section className="photo-albums-hero" id="albums-home">
        <div className="photo-albums-hero__grid" aria-hidden="true" />
        <div className="photo-albums-hero__orbit" aria-hidden="true" />
        <div className="shell photo-albums-hero__inner">
          <a className="photo-albums-hero__back" href="/#albums">
            <ArrowLeft size={17} aria-hidden="true" />
            Back to featured albums
          </a>

          <div className="photo-albums-hero__content" data-reveal>
            <div className="photo-albums-hero__icon" aria-hidden="true">
              <Images size={30} strokeWidth={1.45} />
            </div>
            <div>
              <SectionLabel light>Completed events / photo archive</SectionLabel>
              <h1>
                Photo <span>Albums.</span>
              </h1>
              <p>
                Nine collections preserving the people and moments behind our
                completed events. Every album opens on Facebook.
              </p>
            </div>
          </div>

          <div className="photo-albums-hero__stat" data-reveal>
            <strong>{String(photoAlbums.length).padStart(2, '0')}</strong>
            <span>Event collections</span>
          </div>
        </div>
      </section>

      <section
        className="section section--light photo-albums-archive"
        id="albums"
        aria-labelledby="photo-albums-archive-heading"
      >
        <div className="shell">
          <div className="photo-albums-archive__heading" data-reveal>
            <SectionLabel>Chapter memories</SectionLabel>
            <h2 id="photo-albums-archive-heading">
              All photo albums.
            </h2>
            <p>
              Select a completed-event collection to continue to its original
              Facebook album.
            </p>
          </div>

          <PhotoAlbumGrid albums={photoAlbums} variant="archive" />
        </div>
      </section>
    </>
  );
}

