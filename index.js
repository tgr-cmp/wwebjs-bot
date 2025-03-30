const express = require('express');
const ytdl = require('@distube/ytdl-core');
const fetch = require('node-fetch');
const app = express();

// Gunakan environment variable atau GitHub RAW URL
let agent;
async function initializeAgent() {
    try {
        let cookies;
        
        if (process.env.COOKIES_JSON) {
            // Prioritas pertama: environment variable
            cookies = JSON.parse(process.env.COOKIES_JSON);
        } else {
            // Gunakan GitHub RAW URL sebagai fallback
            const githubRawUrl = process.env.COOKIES_GITHUB_URL || 
                'https://raw.githubusercontent.com/tgr-cmp/db/refs/heads/main/yt_cookies.json';
            const response = await fetch(githubRawUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch cookies from GitHub');
            }
            
            cookies = await response.json();
        }
        
        agent = ytdl.createAgent(cookies);
    } catch (error) {
        console.error('Error creating agent:', error);
        // Fallback ke agent tanpa cookies
        agent = ytdl.createAgent([]);
    }
}

// Inisialisasi agent saat startup
initializeAgent();

app.use(express.json());

// Download endpoint
app.get('/download', async (req, res) => {
    try {
        const videoUrl = req.query.url;
        
        if (!videoUrl || !ytdl.validateURL(videoUrl)) {
            return res.status(400).json({
                status: 'error',
                message: 'Please provide a valid YouTube URL'
            });
        }

        const info = await ytdl.getInfo(videoUrl, { agent });
        const videoTitle = info.videoDetails.title.replace(/[^\w\s]/gi, '');

        res.setHeader('Content-Disposition', `attachment; filename="${videoTitle}.mp4"`);
        
        ytdl(videoUrl, {
            quality: 'highest',
            filter: 'audioandvideo',
            agent: agent
        }).pipe(res);

    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Error downloading video: ' + error.message
        });
    }
});

// Info endpoint
app.get('/info', async (req, res) => {
    try {
        const videoUrl = req.query.url;
        
        if (!videoUrl || !ytdl.validateURL(videoUrl)) {
            return res.status(400).json({
                status: 'error',
                message: 'Please provide a valid YouTube URL'
            });
        }

        const info = await ytdl.getInfo(videoUrl, { agent });
        
        const videoInfo = {
            title: info.videoDetails.title,
            author: info.videoDetails.author.name,
            duration: info.videoDetails.lengthSeconds,
            views: info.videoDetails.viewCount,
            thumbnail: info.videoDetails.thumbnails[0].url
        };

        res.json({
            status: 'success',
            data: videoInfo
        });

    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Error getting video info: ' + error.message
        });
    }
});

// Jalankan server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
