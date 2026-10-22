// IDs confirmados por inventario de solo lectura en la LG LM6350PSB. Los íconos de cada app los copia
// scripts/tv-install.sh desde la propia TV a assets/logos/tv/ de la app instalada (no están en el repo ni en el paquete).
window.LAUNCHER_CONFIG = [
  { key: 'netflix', title: 'Netflix', appId: 'netflix', logo: 'assets/logos/tv/netflix.png', color: '#e50914', tagline: 'Series y películas', kind: 'app' },
  { key: 'max', title: 'HBO Max', appId: 'com.wbd.stream', logo: 'assets/logos/tv/max.png', color: '#6f54ff', tagline: 'HBO, series y películas', kind: 'app' },
  { key: 'prime', title: 'Prime Video', appId: 'amazon', logo: 'assets/logos/tv/prime.png', color: '#18a8e1', tagline: 'Series y películas', kind: 'app' },
  { key: 'movistar', title: 'Movistar TV', appId: 'telefonica.argentina', logo: 'assets/logos/tv/movistar.png', color: '#00a9e0', tagline: 'Televisión y streaming', kind: 'app' },
  { key: 'youtube', title: 'YouTube', appId: 'youtube.leanback.v4', logo: 'assets/logos/tv/youtube.png', color: '#ff1f3d', tagline: 'Videos y música', kind: 'app' },
  { key: 'disney', title: 'Disney+', appId: 'com.disney.disneyplus-prod', logo: 'assets/logos/tv/disney.png', color: '#1f8cff', tagline: 'Disney, Pixar, Marvel y Star Wars', kind: 'app' },
  { key: 'apple-tv', title: 'Apple TV', appId: 'com.apple.appletv.web', logo: 'assets/logos/tv/apple-tv.png', color: '#f4f4f4', tagline: 'Apple Originals y películas', kind: 'app' },
  { key: 'spotify', title: 'Spotify', appId: 'spotify-beehive', logo: 'assets/logos/tv/spotify.png', color: '#1ed760', tagline: 'Música y podcasts', kind: 'app' },
  { key: 'personalize', title: 'Personalizar', action: 'personalize', logo: 'assets/logos/settings.svg', color: '#a9b4c8', tagline: 'Ordenar y ocultar accesos', kind: 'app' },
  { key: 'lghome', title: 'Inicio LG', appId: 'com.webos.app.fullhome', logo: 'assets/logos/lg-home.svg', color: '#a50034', tagline: 'Pantalla de inicio original de LG', kind: 'app' }
];
