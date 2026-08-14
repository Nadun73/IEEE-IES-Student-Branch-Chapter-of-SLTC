import arduinoChallenge2025Cover from '../assets/albums/arduino-challenge-2025.jpg';
import challengeSphere2024Cover from '../assets/albums/challenge-sphere-2024.jpg';
import electrsphere2023Cover from '../assets/albums/electrsphere-2023.jpg';
import ieeeEducationWeekDay012024Cover from '../assets/albums/ieee-education-week-day-01-2024.jpg';
import ieeeEducationWeekDay022024Cover from '../assets/albums/ieee-education-week-day-02-2024.jpg';
import ieeeSparkVI2024Cover from '../assets/albums/ieee-spark-vi-2024.jpg';
import ieeeWhispersCover from '../assets/albums/ieee-whispers.jpg';
import iesDay2024Cover from '../assets/albums/ies-day-2024.jpg';
import sriLankaArduinoChallenge2024Cover from '../assets/albums/sri-lanka-arduino-challenge-2024.jpg';

export const photoAlbums = [
  {
    id: 'arduino-challenge-2025',
    title: 'Arduino Challenge 2025',
    detail: '128 photos',
    cover: arduinoChallenge2025Cover,
    facebookUrl:
      'https://www.facebook.com/media/set/?set=a.1212222534257763&type=3',
  },
  {
    id: 'ieee-whispers',
    title: 'IEEE Whispers',
    detail: '69 photos',
    cover: ieeeWhispersCover,
    facebookUrl:
      'https://www.facebook.com/media/set/?set=a.1377114571101891&type=3',
  },
  {
    id: 'ies-day-2024',
    title: "IES DAY 24'",
    detail: '108 photos',
    cover: iesDay2024Cover,
    facebookUrl:
      'https://www.facebook.com/media/set/?set=a.997206695759349&type=3',
  },
  {
    id: 'sri-lanka-arduino-challenge-2024',
    title: 'Sri Lanka Arduino Challenge',
    detail: '127 photos',
    cover: sriLankaArduinoChallenge2024Cover,
    facebookUrl:
      'https://www.facebook.com/media/set/?set=a.921151433364876&type=3',
  },
  {
    id: 'challenge-sphere-2024',
    title: 'Challenge Sphere 2024',
    detail: '120 photos',
    cover: challengeSphere2024Cover,
    facebookUrl:
      'https://www.facebook.com/media/set/?set=a.876705321142821&type=3',
  },
  {
    id: 'ieee-spark-vi',
    title: 'IEEE SPARK VI',
    detail: '109 photos',
    cover: ieeeSparkVI2024Cover,
    facebookUrl:
      'https://www.facebook.com/media/set/?set=a.856040706542616&type=3',
  },
  {
    id: 'ieee-education-week-day-02',
    title: 'IEEE Education Week Day 02',
    detail: '147 photos',
    cover: ieeeEducationWeekDay022024Cover,
    facebookUrl:
      'https://www.facebook.com/media/set/?set=a.844807354332618&type=3',
  },
  {
    id: 'ieee-education-week-day-01',
    title: 'IEEE Education Week 2024',
    detail: '140 photos',
    cover: ieeeEducationWeekDay012024Cover,
    facebookUrl:
      'https://www.facebook.com/media/set/?set=a.844721457674541&type=3',
  },
  {
    id: 'electrsphere',
    title: 'ELECTRSPHERE',
    detail: '44 photos',
    cover: electrsphere2023Cover,
    facebookUrl:
      'https://www.facebook.com/media/set/?set=a.754247180055303&type=3',
  },
].map((album, index) => ({
  ...album,
  number: String(index + 1).padStart(2, '0'),
  eyebrow: 'Completed event',
  description: `${album.detail} in the original Facebook collection.`,
  accent: ['blue', 'orange', 'cyan', 'navy'][index % 4],
}));
