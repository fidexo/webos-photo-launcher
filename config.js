// IDs confirmados por inventario SSAP en la LG de prueba; pueden variar en otros modelos o regiones.
// logo: marca gráfica local (SVG). color: tinte de marca para el vidrio y el halo de foco.
window.LAUNCHER_CONFIG = [
  { key: 'youtube', title: 'YouTube', appId: 'youtube.leanback.v4', logo: 'assets/logos/youtube.svg', color: '#ff1f3d', tagline: 'Videos y música', kind: 'app' },
  { key: 'spotify', title: 'Spotify', appId: 'spotify-beehive', logo: 'assets/logos/spotify.svg', color: '#1ed760', tagline: 'Música y podcasts', kind: 'app' },
  { key: 'nuvio', title: 'Nuvio', appId: 'space.nuvio.webos', logo: 'assets/logos/nuvio.svg', color: '#8f74ff', tagline: 'Películas y series', kind: 'app' },
  { key: 'netflix', title: 'Netflix', appId: 'netflix', logo: 'assets/logos/netflix.svg', color: '#e50914', tagline: 'Series y películas', kind: 'app' },
  { key: 'disney', title: 'Disney+', appId: 'com.disney.disneyplus-prod', logo: 'assets/logos/disney.svg', color: '#1f8cff', tagline: 'Disney, Pixar, Marvel y Star Wars', kind: 'app' },
  // Transitions no es una app: abre un episodio al azar en YouTube; su disponibilidad es la de YouTube.
  { key: 'transitions', title: 'Transitions · John Digweed', appId: 'youtube.leanback.v4', action: 'transitions', logo: 'assets/logos/transitions.svg', color: '#ff9a3c', tagline: 'Un episodio al azar en YouTube', kind: 'app' },
  { key: 'homebrew', title: 'Homebrew Channel', appId: 'org.webosbrew.hbchannel', logo: 'assets/logos/homebrew.svg', color: '#53d9df', tagline: 'Tienda de apps de la comunidad', kind: 'app' },
  { key: 'hdmi1', title: 'HDMI 1', appId: 'com.webos.app.hdmi1', logo: 'assets/logos/hdmi.svg', color: '#9fb4d6', tagline: 'Entrada externa', kind: 'input' }
];
