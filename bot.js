// Import library yang dibutuhkan
require('dotenv').config(); // Muat variabel dari .env
const { Telegraf } = require('telegraf');
const ytdl = require('@distube/ytdl-core');
const fetch = require('node-fetch'); // Impor node-fetch

// --- Pengambilan Cookies dari URL ---
let ytdlAgent; // Variabel untuk menyimpan agent ytdl
const cookieUrl = process.env.COOKIE_URL; // Ambil URL dari environment variable

// Fungsi async untuk memuat cookies dan menginisialisasi bot
async function initializeBot() {
    console.log("Menginisialisasi bot...");

    if (cookieUrl) {
        console.log(`Mencoba memuat cookies dari: ${cookieUrl}`);
        try {
            const response = await fetch(cookieUrl);
            if (!response.ok) {
                throw new Error(`Gagal mengambil cookies: Status ${response.status} ${response.statusText}`);
            }
            const cookiesJson = await response.text(); // Ambil sebagai teks dulu
            const cookies = JSON.parse(cookiesJson); // Parse JSON

            // Pastikan cookies adalah array
            if (Array.isArray(cookies)) {
                ytdlAgent = ytdl.createAgent(cookies);
                console.log("Berhasil memuat cookies dari URL dan membuat ytdl agent.");
            } else {
                console.warn("Peringatan: Konten dari URL cookie bukan array JSON. Cookies tidak akan digunakan.");
            }
        } catch (error) {
            console.error("Error saat memuat atau memproses cookies dari URL:", error.message);
            console.warn("Bot akan mencoba mengunduh tanpa cookies.");
        }
    } else {
        console.warn("Peringatan: COOKIE_URL tidak ditemukan di environment variables. Bot akan mencoba mengunduh tanpa cookies.");
    }

    // --- Setup Bot Telegraf (setelah mencoba load cookies) ---

    // Pastikan BOT_TOKEN ada
    if (!process.env.BOT_TOKEN) {
        console.error("Error: BOT_TOKEN tidak ditemukan di environment variables.");
        process.exit(1);
    }

    const bot = new Telegraf(process.env.BOT_TOKEN);

    // Handler /start
    bot.start((ctx) => ctx.reply('Selamat datang! Kirimkan saya link YouTube. Saya akan coba unduh 360p' + (ytdlAgent ? ' menggunakan cookies.' : '.')));

    // Handler /help
    bot.help((ctx) => ctx.reply('Kirim link YouTube valid. Saya coba unduh 360p.'));

    // Handler pesan teks
    bot.on('text', async (ctx) => {
        const text = ctx.message.text;

        if (ytdl.validateURL(text)) {
            const chatId = ctx.chat.id;
            const url = text;
            let processingMessage;

            try {
                processingMessage = await ctx.reply('Memproses video... ⏳');

                // Opsi untuk ytdl, sertakan agent JIKA sudah dibuat
                const ytdlOptions = {};
                if (ytdlAgent) {
                    ytdlOptions.agent = ytdlAgent;
                }

                // 1. Get info
                console.log(`[${chatId}] Memproses URL: ${url}`);
                const info = await ytdl.getInfo(url, ytdlOptions); // Pass options
                const title = info.videoDetails.title;
                console.log(`[${chatId}] Judul: ${title}`);

                // 2. Cari format 360p
                const format360p = info.formats.find(f =>
                    f.qualityLabel === '360p' && f.hasAudio && f.hasVideo && f.container === 'mp4'
                );
                 const fallbackFormat360p = info.formats.find(f =>
                    f.qualityLabel === '360p' && f.hasAudio && f.hasVideo
                );
                const chosenFormat = format360p || fallbackFormat360p;

                if (!chosenFormat) {
                    console.log(`[${chatId}] 360p tidak ditemukan: ${title}`);
                    await ctx.telegram.editMessageText(chatId, processingMessage.message_id, undefined, 'Maaf, kualitas 360p (video+audio) tidak ditemukan.');
                    return;
                }

                console.log(`[${chatId}] Format 360p ditemukan (itag: ${chosenFormat.itag}). Mulai unduh...`);
                await ctx.telegram.editMessageText(chatId, processingMessage.message_id, undefined, `Menyiapkan unduhan: ${title} (360p)...`);

                // 3. Get stream (gunakan options yang sama)
                const downloadOptions = {
                     format: chosenFormat,
                     ...ytdlOptions // Sertakan agent jika ada
                };
                const videoStream = ytdl(url, downloadOptions); // Pass options

                // 4. Kirim video
                console.log(`[${chatId}] Mengirim video: ${title}`);
                await ctx.replyWithVideo(
                    { source: videoStream },
                    { caption: `✅ Selesai!\n\nJudul: ${title}\nKualitas: 360p` }
                );

                await ctx.telegram.deleteMessage(chatId, processingMessage.message_id);
                console.log(`[${chatId}] Video terkirim: ${title}`);

            } catch (error) {
                console.error(`[${chatId}] Error proses ${url}:`, error);
                if (processingMessage && processingMessage.message_id) {
                     try { await ctx.telegram.deleteMessage(chatId, processingMessage.message_id); }
                     catch (delErr) { console.error(`[${chatId}] Gagal hapus pesan processing:`, delErr); }
                }

                let errorMessage = 'Maaf, terjadi kesalahan saat mengunduh.';
                if (error.message.includes('private') || error.message.includes('Login required') || (error.statusCode && error.statusCode === 403)) {
                    errorMessage = 'Maaf, video ini pribadi/perlu login/akses ditolak.' + (cookieUrl ? ' Pastikan URL cookie valid & up-to-date.' : '');
                } else if (error.message.includes('unavailable')) {
                    errorMessage = 'Maaf, video tidak tersedia.';
                } else if (error.message.includes('consent')) {
                     errorMessage = 'Maaf, video ini memerlukan persetujuan usia.' + (cookieUrl ? ' Pastikan cookie dari akun yg terverifikasi.' : '');
                }
                await ctx.reply(errorMessage);
            }
        }
    });

    // Jalankan bot
    bot.launch().then(() => {
        console.log('Bot YouTube Downloader (360p) berhasil dijalankan!');
        if (cookieUrl && !ytdlAgent) {
            console.warn("-> Bot berjalan, namun GAGAL memuat cookies dari URL.");
        } else if (cookieUrl && ytdlAgent) {
             console.log("-> Cookies berhasil dimuat dari URL.");
        } else {
            console.log("-> Berjalan tanpa konfigurasi cookies URL.");
        }
    }).catch((err) => {
        console.error('Gagal menjalankan bot:', err);
    });

    // Graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

// --- Mulai Inisialisasi Bot ---
initializeBot();
