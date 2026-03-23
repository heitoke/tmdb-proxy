import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';


const app = express();

app.use(cors());

const {
    TMDB_API_KEY,
    TMDB_API_URL = 'https://api.themoviedb.org/3',
    TMDB_IMAGES_URL = 'https://image.tmdb.org',
    TMDB_PROXY_URLS = 'images,api',
    TMDB_DEFAULT_LANG = 'ru-RU'
} = process.env;

const proxyUrls = TMDB_PROXY_URLS.split(/,\s|,|\s/g);

app.get('/', (req, res) => {
    res.json({
        service: 'TMDB Proxy',
        status: 'online',
        description: 'Proxy server for The Movie Database (TMDB) API',
        usage: 'Use any TMDB API endpoint after the domain',
        examples: [
            `${req.protocol}://${req.get('host')}/api/search/multi?query=avatar`,
            `${req.protocol}://${req.get('host')}/api/movie/550`,
            `${req.protocol}://${req.get('host')}/api/tv/1399`
        ],
        note: `All requests are proxied to https://api.themoviedb.org/3/`,
        documentation: `https://developer.themoviedb.org/reference/intro/getting-started`,
        github: "https://github.com/heitoke/tmdb-proxy",
        timestamp: new Date().toISOString()
    });
});

app.get('/ping', (req, res) => {
    res.json({
        status: 'pong',
        environment: process.env.NODE_ENV || 'development',
        apiKeyConfigured: !!TMDB_API_KEY,
        proxyUrl: TMDB_API_URL,
        proxyImagesUrl: TMDB_IMAGES_URL,
        tmdbProxyUrls: proxyUrls
    });
});

app.get('/images/*slug', async (req, res) => {
    if (TMDB_IMAGES_URL && !proxyUrls.includes('images') && !proxyUrls.includes('image')) {
        res.status(404).json({
            message: 'This function was not found.'
        });

        return;
    }

    try {
        const response = await fetch(`${TMDB_IMAGES_URL}/${req.params.slug.join('/')}`);

        if (!response.ok) {
            return res.status(response.status).send(response.statusText);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const contentType = response.headers.get('content-type') || 'image/jpeg';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000000');

        res.send(buffer);
    } catch (error) {
        console.error('Proxy image error:', error);

        res.status(500).send('Failed to fetch the image');
    }
});

app.all('/api/*path', async (req, res) => {
    if (TMDB_API_URL && !proxyUrls.includes('api')) {
        res.status(404).json({
            message: 'This function was not found.'
        });

        return;
    }

    try {
        const path = req.path;
        
        let tmdbPath = path.startsWith('/') ? path.slice(1) : path;
        
        const queryParams = new URLSearchParams();
        
        if (TMDB_API_KEY) queryParams.append('api_key', TMDB_API_KEY);
        
        Object.keys(req.query).forEach(key => {
            const value = req.query[key];

            if (Array.isArray(value)) {
                value.forEach(v => queryParams.append(key, v));
            } else {
                queryParams.append(key, value);
            }
        });
        
        if (TMDB_DEFAULT_LANG && !queryParams.has('language')) {
            queryParams.append('language', TMDB_DEFAULT_LANG);
        }
        
        const tmdbUrl = `${TMDB_API_URL}/${tmdbPath}?${queryParams.toString()}`;
        
        console.log(`📡 Proxying: ${req.method} ${path} → ${tmdbUrl.replace(TMDB_API_KEY, '***')}`);
        
        const fetchOptions = {
            method: req.method,
            headers: {
                'Authorization': req.headers['authorization'],
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...req.headers
            }
        };
        
        if (req.method.toUpperCase() !== 'GET' && req.body) {
            fetchOptions.body = JSON.stringify(req.body);
        }
        
        const response = await fetch(tmdbUrl, fetchOptions);
        
        const data = await response.json().catch(() => ({
            error: 'Failed to parse JSON response',
            status: response.status
        }));
        
        console.log(`✅ Response status: ${response.status}`);
        
        res.status(response.status).json(data);
        
    } catch (error) {
        console.error('💥 Proxy error:', error.message);

        res.status(500).json({
            error: 'Proxy error',
            message: error.message,
            path: req.path,
            timestamp: new Date().toISOString()
        });
    }
});

app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: `Route ${req.method} ${req.path} not found`,
        available_routes: {
            root: 'GET /',
            ping: 'GET /ping',
            proxy: 'ANY /api/* (proxies to TMDB API)'
        }
    });
});


// export default app;
app.listen(4321)