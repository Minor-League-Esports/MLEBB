import {existsSync, readFileSync} from "fs";

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

// Digital Ocean managed Postgres requires SSL; ca-certificate.crt is the
// DigiCert Global Root CA that DO's cluster cert chains up to (same cert MLEDB uses).
const certPath = "ca-certificate.crt";
const ca = existsSync(certPath) ? readFileSync(certPath).toString() : undefined;

// `sslmode` in the connection string makes `pg` derive its own SSL settings from the
// string and ignore the `ssl` object below (silently dropping our custom `ca`), which
// causes DO's self-signed project CA to fail against the default trust store instead.
const connectionString = process.env.connstring?.replace(/[?&]sslmode=[^&]*/, "");

export const pgClient = pgp({
    connectionString,
    ssl: {
        rejectUnauthorized: true,
        ...(ca ? {ca} : {}),
        // pg-promise's SSL typings don't declare `servername`, but node-postgres/tls support it.
        ...(process.env.DB_SERVERNAME ? {servername: process.env.DB_SERVERNAME} : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
});
