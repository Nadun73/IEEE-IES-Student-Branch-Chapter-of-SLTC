import { ExternalLink, Images } from 'lucide-react';

export default function PhotoAlbumGrid({ albums, variant = 'preview' }) {
  return (
    <ul className={`photo-album-grid photo-album-grid--${variant}`}>
      {albums.map((album, index) => (
        <li
          className={`photo-album-card photo-album-card--${album.accent}`}
          data-album-id={album.id}
          data-reveal
          style={{ '--reveal-delay': `${index * 55}ms` }}
          key={album.id}
        >
          <a
            className="photo-album-card__link"
            href={album.facebookUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`${album.title}: open on Facebook in a new tab`}
          >
            <div className="photo-album-card__visual" aria-hidden="true">
              {album.cover && (
                <img
                  src={album.cover}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              )}
              <span className="photo-album-card__number">{album.number}</span>
              <span className="photo-album-card__platform">Facebook album</span>
              <span className="photo-album-card__stack">
                <i />
                <i />
                <i>
                  <Images size={34} strokeWidth={1.45} />
                </i>
              </span>
            </div>

            <div className="photo-album-card__body">
              <span className="photo-album-card__eyebrow">
                {album.eyebrow}
              </span>
              <h3>{album.title}</h3>
              <p>{album.description}</p>
            </div>

            <span className="photo-album-card__action">
              View on Facebook
              <ExternalLink size={16} strokeWidth={1.8} aria-hidden="true" />
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
