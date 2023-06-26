import {format} from "date-fns";
import {utcToZonedTime} from "date-fns-tz";
import {ButtonStyle, Client, ComponentType, Events, GatewayIntentBits} from "discord.js";
import {config} from "dotenv";
import {Client as PGClient} from "pg";

import {sheets} from "./google";

config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildIntegrations,
    ],
});

const pg = new PGClient({
    host: "spr.ocket.cloud",
    port: 30000,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: "sprocket_main",
});

enum RetentionOption {
    RETAINABLE = "RETAINABLE",
    FA = "FREE_AGENT",
    FP = "FORMER_PLAYER",
}

const options = {
    [RetentionOption.RETAINABLE]: "Retention Eligible",
    [RetentionOption.FA]: "Release to FA",
    [RetentionOption.FP]: "Former Player",
};

pg.connect();

client.login(process.env.TOKEN);

client.on(Events.ClientReady, () => {
    console.log(`Connected to ${client.user?.username}`);
});

client.on(Events.InteractionCreate, async i => {
    if (!i.isButton()) return;

    const dbRes = await pg.query<{id: number; mleid: number; name: string; discord_id: string}>(
        `SELECT p.id, p.mleid, p.name, p.discord_id FROM mledb.player p WHERE p.discord_id=$1`,
        ["105408136285818880"],
    );

    if (dbRes.rowCount !== 1) {
        await i.reply("Failed to locate you in the database.");
        return;
    }

    const [player] = dbRes.rows;

    await sheets.spreadsheets.values.append({
        spreadsheetId: "1IqdwyiCy5YdAqkZpe_jf_P5MxGDl-DR-NaqHJZjjhtM",
        range: "RESPONSES",
        valueInputOption: "RAW",
        requestBody: {
            values: [
                [
                    format(utcToZonedTime(new Date(), "America/New_York"), "MM/dd/yyyy HH:mm:ss 'ET"),
                    player.mleid,
                    player.discord_id,
                    player.name,
                    i.customId,
                ],
            ],
        },
    });

    await i.reply(
        `Successfully recorded your response of \`${options[i.customId]}\` on ${format(
            utcToZonedTime(new Date(), "America/New_York"),
            "MMMM do, u 'at' h:mmaaa 'ET",
        )}`,
    );
});

client.on(Events.MessageCreate, async m => {
    if (m.author.bot || m.author.id !== "105408136285818880") return;

    if (m.content.startsWith("bb.st")) {
        const dbRes = await pg.query<{id: number; mleid: number; name: string; discord_id: string}>(
            `SELECT p.id, p.mleid, p.name, p.discord_id FROM mledb.player p WHERE p.discord_id='105408136285818880'`,
        );

        for (const row of dbRes.rows) {
            const channel = await client.users.fetch(row.discord_id);

            await channel.send({
                embeds: [
                    {
                        color: 0xeec707,
                        title: "MLE Season 16 Intent Form",
                        description: [
                            "By responding to this message, you will declare your official intent for Season 16.",
                            "You may change your intent by clicking an option below until the deadline.",
                            "",
                            "Not submitting an intent form is equivalent to selecting **Former Player**. You will be moved to Former Player if you do not respond.",
                            "",
                            "**Retention Eligible** - I would like to be retained by my franchise.",
                            "This will allow your Franchise to retain you for Season 16. This does not guarantee that you are retained. If you select this option and you are not retained, you will become a Free Agent and you will be eligible for the draft.",
                            "",
                            "**Release to FA** - I would like to enter Free Agency for Season 16.",
                            "Whether you are currently on a roster, or currently a Free Agent, you will become a Free Agent for Season 16. You will be eligible for the draft.",
                            "",
                            "**Former Player** - I would not like to play in Season 16.",
                            "You will become a Former Player, exiting the Free Agent pool, but remaining in the community. You may later apply for Free Agency if you change your mind, but you may receive Restricted Free Agent status.",
                            "",
                            "You have until **01/01/23** to submit your intent.",
                        ].join("\n"),
                    },
                ],
                components: [
                    {
                        type: ComponentType.ActionRow,
                        components: [
                            {
                                type: ComponentType.Button,
                                customId: RetentionOption.RETAINABLE,
                                style: ButtonStyle.Success,
                                label: "Retention Eligible",
                            },
                            {
                                type: ComponentType.Button,
                                customId: RetentionOption.FA,
                                style: ButtonStyle.Primary,
                                label: "Release to FA",
                            },
                            {
                                type: ComponentType.Button,
                                customId: RetentionOption.FP,
                                style: ButtonStyle.Danger,
                                label: "Former Player",
                            },
                        ],
                    },
                ],
            });
        }
    }
});
