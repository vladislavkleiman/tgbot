import { Configuration, OpenAIApi } from "openai";
import TelegramBot from "node-telegram-bot-api";

const TOKEN = "YOUR_TELEGRAM_BOT_TOKEN";
const bot = new TelegramBot(TOKEN, { polling: true });

const configuration = new Configuration({
  apiKey: "YOUR_OPENAI_API_KEY",
});
const openai = new OpenAIApi(configuration);

const sessions = {};

async function createChat() {
  const chat = await openai.createChatCompletion({
    model: "gpt-4o",
    messages: [],
  });
  return chat.data.id;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retrieveResponse(chatObjId, messageId, telegramChatId) {
  const initialMessage = await bot.sendMessage(
    telegramChatId,
    "Я ищу ответ на ваш вопрос..."
  );
  const initialMessageId = initialMessage.message_id;

  while (true) {
    const response = await openai.retrieveChatCompletion({
      model: "gpt-4o",
      id: chatObjId,
      message_id: messageId,
    });

    if (response.data.choices[0].finish_reason === "stop") {
      const messages = response.data.choices[0].message;
      const cleanText = cleanResponse(messages.content);

      await bot.deleteMessage(telegramChatId, initialMessageId);
      bot.sendMessage(telegramChatId, cleanText);
      break;
    } else if (
      response.data.choices[0].finish_reason === "length" ||
      response.data.choices[0].finish_reason === "content_filter"
    ) {
      await sleep(5000);
    } else {
      break;
    }
  }
}

function cleanResponse(text) {
  console.log("Before cleaning:", text);
  let cleanedText = text.replace(/\【.*?\】/g, "").trim();
  console.log("After cleaning:", cleanedText);
  return cleanedText;
}

async function ensureNoActiveChat(chatObjId) {
  const responses = await openai.listChatCompletions({
    model: "gpt-4o",
    chat_id: chatObjId,
  });
  for (const response of responses.data) {
    if (
      response.finish_reason === "length" ||
      response.finish_reason === "content_filter"
    ) {
      await sleep(5000); // Wait for the active response to complete
      await ensureNoActiveChat(chatObjId); // Check again after waiting
    }
  }
}

async function main() {
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;

    if (msg.text) {
      const userInput = msg.text.toLowerCase();

      if (userInput === "quit") {
        bot.sendMessage(chatId, "Assistant: Have a nice day!");
        delete sessions[chatId];
        return;
      }

      if (!sessions[chatId]) {
        sessions[chatId] = {
          chatObjId: await createChat(),
        };
      }

      const chatObjId = sessions[chatId].chatObjId;

      await ensureNoActiveChat(chatObjId);

      const myMessage = await openai.createChatCompletion({
        model: "gpt-4o",
        chat_id: chatObjId,
        messages: [
          {
            role: "user",
            content: userInput,
          },
        ],
      });

      const myResponse = await openai.createChatCompletion({
        model: "gpt-4o",
        chat_id: chatObjId,
        messages: [
          {
            role: "assistant",
            content: myMessage.data.choices[0].message.content,
          },
        ],
      });

      await sleep(3000);
      await retrieveResponse(chatObjId, myResponse.data.choices[0].id, chatId);
    } else {
      bot.sendMessage(chatId, "Sorry, this bot only accepts text messages.");
    }
  });
}

main();
