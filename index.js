// File: server.js
const express = require('express');
const ytdl = require('@distube/ytdl-core');
const fetch = require('node-fetch'); // Tambahan untuk mengambil data dari URL
const app = express();
const port = 3000;

// URL ke cookies.json di GitHub raw (ganti dengan URL Anda)
const COOKIES_URL = 'https://raw.githubusercontent.com/tgr-cmp/db/refs/heads/main/yt_cookies.json';

// Membuat agent dengan cookies dari GitHub
let agent;
async function initializeAgent() {
    try {
        const response = await fetch(COOKIES_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const cookies = await response.json();
        agent = ytdl.createAgent(cookies);
        console.log('Cookies loaded successfully from GitHub');
    } catch (error) {
        console.error('Failed to load cookies:', error.message);
        agent = null; // Fallback ke tanpa agent jika cookies gagal dimuat
    }
}

// Inisialisasi agent saat server mulai
initializeAgent();

// Middleware untuk parsing JSON
app.use(express.json());

// Endpoint untuk mendapatkan info video
app.get('/api/video/info', async (req, res) => {
    try {
        const { url } = req.query;
        
        if (!url || !ytdl.validateURL(url)) {
            return res.status(400).json({
                error: 'Invalid YouTube URL'
            });
        }

        const options = agent ? { agent } : {};
        const info = await ytdl.getInfo(url, options);
        const formats = info.formats.map(format => ({
            itag: format.itag,
            quality: format.qualityLabel,
            container: format.container,
            codecs: format.codecs,
            hasVideo: format.hasVideo,
            hasAudio: format.hasAudio
        }));

        res.json({
            title: info.videoDetails.title,
            author: info.videoDetails.author.name,
            duration: info.videoDetails.lengthSeconds,
            thumbnail: info.videoDetails.thumbnails[0].url,
            formats: formats
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get video info',
            message: error.message
        });
    }
});

// Endpoint untuk download video
// Pastikan semua variabel sudah didefinisikan sebelumnya
app.get('/api/video/download', async (req, res) => {
    try {
        const { url } = req.query; // Ambil URL dari query parameter
        
        // Validasi URL
        if (!url || !ytdl.validateURL(url)) {
            return res.status(400).json({
                error: 'Invalid YouTube URL'
            });
        }

        // Dapatkan info video untuk judul
        const info = await ytdl.getInfo(url, agent ? { agent } : {});
        const videoTitle = info.videoDetails.title
            .replace(/[^a-zA-Z0-9]/g, '_') // Bersihkan karakter khusus
            .substring(0, 100); // Batasi panjang nama file

        // Set header untuk download
        res.setHeader('Content-Disposition', `attachment; filename="${videoTitle}.mp4"`);
        res.setHeader('Content-Type', 'video/mp4');

        // Streaming video
        ytdl(url, {
            quality: 'highest',           // Kualitas tertinggi
            filter: 'audioandvideo',      // Pastikan ada audio dan video
            agent: agent                  // Gunakan agent dengan cookies
        })
        .on('error', (error) => {
            console.error('Download error:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    error: 'Download failed',
                    message: error.message
                });
            }
        })
        .pipe(res);

    } catch (error) {
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Failed to process video',
                message: error.message
            });
        }
    }
});
// Endpoint untuk download audio saja
app.get('/api/audio/download', async (req, res) => {
    try {
        const { url } = req.query;

        if (!url || !ytdl.validateURL(url)) {
            return res.status(400).json({
                error: 'Invalid YouTube URL'
            });
        }

        const info = await ytdl.getInfo(url, agent ? { agent } : {});
        const videoTitle = info.videoDetails.title.replace(/[^a-zA-Z0-9]/g, '_');
        
        res.header('Content-Disposition', `attachment; filename="${videoTitle}.mp3"`);
        
        const downloadOptions = {
            quality: 'highestaudio',
            filter: 'audioonly'
        };
        if (agent) downloadOptions.agent = agent;

        ytdl(url, downloadOptions).pipe(res);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to download audio',
            message: error.message
        });
    }
});

// Menjalankan server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
