import {Client, GatewayIntentBits} from "discord.js";
import * as pgPromise from "pg-promise";

export const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildIntegrations,
    ],
});

const pgp = pgPromise();

export const pgClient = pgp({
    host: "spr.ocket.cloud",
    port: 30000,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: "sprocket_main",
});
