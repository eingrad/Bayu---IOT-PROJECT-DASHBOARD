const ngrok = require("ngrok");
const axios = require("axios");
require("dotenv").config();

(async function () {
  try {
    await ngrok.kill(); // Force reset ngrok state
    const url = await ngrok.connect({
      addr: 5000,
      authtoken: process.env.NGROK_AUTHTOKEN,
    });

    console.log("🌐 Ngrok tunnel established at:", url);

    const setWebhookUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setWebhook?url=${url}/telegram/webhook`;

    const response = await axios.get(setWebhookUrl);
    console.log("✅ Telegram Webhook Set:", response.data);
  } catch (error) {
    console.error("❌ Error starting ngrok or setting webhook:", error.message);
  }
})();
