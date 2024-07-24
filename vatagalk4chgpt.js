import { OpenAI } from "openai";
import TelegramBot from "node-telegram-bot-api";

const TOKEN = "7011400143:AAGEaIQyEAhnE92meO1h9B0Q3tfvru5evV8";
const bot = new TelegramBot(TOKEN, { polling: true });
const openai = new OpenAI({
  apiKey: "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",
});

const sessions = {};

async function createThread() {
  const myThread = await openai.beta.threads.create();
  return myThread.id;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retrieveRun(threadId, runId, chatId) {
  const initialMessage = await bot.sendMessage(
    chatId,
    "Я ищу ответ на ваш вопрос..."
  );
  const initialMessageId = initialMessage.message_id;

  while (true) {
    const keepRetrievingRun = await openai.beta.threads.runs.retrieve(
      threadId,
      runId
    );

    if (keepRetrievingRun.status === "completed") {
      const allMessages = await openai.beta.threads.messages.list(threadId);
      const cleanText = cleanResponse(
        allMessages.data[0].content[0].text.value
      );

      await bot.deleteMessage(chatId, initialMessageId);
      bot.sendMessage(chatId, cleanText);
      break;
    } else if (
      keepRetrievingRun.status === "queued" ||
      keepRetrievingRun.status === "in_progress"
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

async function ensureNoActiveRun(threadId) {
  const runs = await openai.beta.threads.runs.list(threadId);
  for (const run of runs.data) {
    if (run.status === "queued" || run.status === "in_progress") {
      await sleep(5000); // Wait for the active run to complete
      await ensureNoActiveRun(threadId); // Check again after waiting
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
          threadId: await createThread(),
        };
      }

      const threadId = sessions[chatId].threadId;

      await ensureNoActiveRun(threadId);

      const myThreadMessage = await openai.beta.threads.messages.create(
        threadId,
        {
          role: "user",
          content: userInput,
        }
      );

      const myRun = await openai.beta.threads.runs.create(threadId, {
        assistant_id: "asst_0sedZamhasa9gsVnIYFek3lB",
      });

      await sleep(3000);
      await retrieveRun(threadId, myRun.id, chatId);
    } else {
      bot.sendMessage(chatId, "Sorry, this bot only accepts text messages.");
    }
  });
}

main();
