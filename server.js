const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cheerio = require('cheerio');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 3000; // Different port from your proxy server

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Video server configurations
const videoServers = [
  { name: 'MoviesClub', baseUrl: 'https://moviesapi.club' },
  { name: 'VidSrc', baseUrl: 'https://vidsrc.icu/embed' },
  { name: 'VidSrc2', baseUrl: 'https://vidsrc.vip/embed' },
  { name: 'Turbovid', baseUrl: 'https://turbovid.eu/api/req' },
  { name: 'Embed', baseUrl: 'https://embed.su/embed' },
  { name: 'NontonGo', baseUrl: 'https://www.NontonGo.win/embed' },
  { name: 'Autoembed', baseUrl: 'https://player.autoembed.cc' },
  { name: 'VidFast', baseUrl: 'https://vidfast.pro' },
  { name: '2Embed', baseUrl: 'https://www.2embed.stream/embed' },
  { name: 'VidLink', baseUrl: 'https://vidlink.pro' },
  { name: 'VidSrcIn', baseUrl: 'https://vidsrc.in/embed' },
];

// Helper function to generate URLs
const generateMovieUrl = (serverName, movieId) => {
  const server = videoServers.find(s => s.name === serverName);
  if (!server) return null;
  
  switch (serverName) {
    case 'MoviesClub':
      return `${server.baseUrl}/movie/${movieId}`;
    case 'VidSrc':
    case 'VidSrc2':
    case 'Embed':
    case 'NontonGo':
    case '2Embed':
    case 'VidSrcIn':
      return `${server.baseUrl}/movie/${movieId}`;
    case 'Turbovid':
      return `${server.baseUrl}/movie/${movieId}`;
    case 'Autoembed':
      return `${server.baseUrl}/embed/movie/${movieId}`;
    case 'VidFast':
    case 'VidLink':
      return `${server.baseUrl}/movie/${movieId}`;
    default:
      return null;
  }
};

const generateTvUrl = (serverName, tvId, season, episode) => {
  const server = videoServers.find(s => s.name === serverName);
  if (!server) return null;
  
  switch (serverName) {
    case 'MoviesClub':
      return `${server.baseUrl}/tv/${tvId}-${season}-${episode}`;
    case 'VidSrc':
    case 'VidSrc2':
    case 'Embed':
    case 'NontonGo':
    case '2Embed':
    case 'VidSrcIn':
      return `${server.baseUrl}/tv/${tvId}/${season}/${episode}`;
    case 'Turbovid':
      return `${server.baseUrl}/tv/${tvId}/${season}/${episode}`;
    case 'Autoembed':
      return `${server.baseUrl}/embed/tv/${tvId}/${season}/${episode}`;
    case 'VidFast':
    case 'VidLink':
      return `${server.baseUrl}/tv/${tvId}/${season}/${episode}`;
    default:
      return null;
  }
};

// Helper function to modify HTML content
const modifyHtml = (html) => {
  try {
    const $ = cheerio.load(html);
    
    // Remove elements that typically contain ads or trigger popups
    $('script[src*="ads"], script[src*="pop"], script[src*="click"]').remove();
    $('iframe[src*="ads"], iframe[src*="pop"]').remove();
    $('a[target="_blank"]').attr('target', '_self');
    
    // Inject script to override window.open
    $('head').append(`
      <script>
        // Override window.open to prevent popups
        window.open = function() { 
          console.log('Popup blocked by proxy');
          return null; 
        };
        
        // Override onclick attributes that might open new windows
        document.addEventListener('DOMContentLoaded', function() {
          const allElements = document.getElementsByTagName('*');
          for (let i = 0; i < allElements.length; i++) {
            allElements[i].onclick = function(e) {
              if (this.getAttribute('target') === '_blank') {
                e.preventDefault();
                return false;
              }
            };
          }
        });
      </script>
    `);
    
    // Add CSS to hide common ad containers
    $('head').append(`
      <style>
        [class*="ad-container"], [class*="ads-container"], [id*="ad-container"], [id*="ads-container"],
        [class*="popup"], [id*="popup"], [class*="overlay"], [id*="overlay"] {
          display: none !important;
        }
      </style>
    `);
    
    return $.html();
  } catch (error) {
    console.error('Error modifying HTML:', error);
    return html; // Return original HTML if modification fails
  }
};

// API endpoint to get video URL
app.get('/api/video-url', (req, res) => {
  const { server, type, id, season, episode } = req.query;
  
  if (!server || !type || !id) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  
  let videoUrl;
  if (type === 'movie') {
    videoUrl = generateMovieUrl(server, id);
  } else if (type === 'tv' && season && episode) {
    videoUrl = generateTvUrl(server, id, season, episode);
  } else {
    return res.status(400).json({ error: 'Invalid parameters' });
  }
  
  if (!videoUrl) {
    return res.status(404).json({ error: 'Could not generate URL' });
  }
  
  // Return the proxied URL that will be handled by the proxy middleware
  const proxyUrl = `http://localhost:${PORT}/proxy/${server.toLowerCase()}/${type}/${id}${
    type === 'tv' ? `/${season}/${episode}` : ''
  }`;
  
  res.json({ url: proxyUrl });
});

// Setup proxy middleware for each server
videoServers.forEach(server => {
  const serverNameLower = server.name.toLowerCase();
  
  app.use(`/proxy/${serverNameLower}`, createProxyMiddleware({
    target: server.baseUrl,
    changeOrigin: true,
    pathRewrite: (path, req) => {
      return path.replace(new RegExp(`^/proxy/${serverNameLower}`), '');
    },
    onProxyRes: (proxyRes, req, res) => {
      const contentType = proxyRes.headers['content-type'];
      if (contentType && contentType.includes('text/html')) {
        let body = [];
        proxyRes.on('data', (chunk) => {
          body.push(chunk);
        });
        
        proxyRes.on('end', () => {
          body = Buffer.concat(body).toString();
          const modifiedBody = modifyHtml(body);
          
          res.setHeader('content-length', Buffer.byteLength(modifiedBody));
          res.end(modifiedBody);
        });
      }
    }
  }));
});

// Start the server
app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
});