import {compareAsc, format, parseISO} from "date-fns";
import {utcToZonedTime, zonedTimeToUtc} from "date-fns-tz";
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
    keepAlive: true,
});

enum RetentionOption {
    RETAINABLE = "RETAINABLE",
    FA = "FREE_AGENT",
    FP = "FORMER_PLAYER",
    LASTRESPONSE = "LASTRESPONSE",
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

    if (i.customId === RetentionOption.LASTRESPONSE) {
        const allResponses = await sheets.spreadsheets.values.get({
            spreadsheetId: "1IqdwyiCy5YdAqkZpe_jf_P5MxGDl-DR-NaqHJZjjhtM",
            range: "RESPONSES!$A$2:$E",
        });

        const userResponses = allResponses.data.values
            ?.filter(d => d[2] === i.user.id)
            .sort((a, b) => compareAsc(parseISO(a[0]), parseISO(b[0])));

        const lastResponse = userResponses ? userResponses[userResponses.length - 1] : undefined;

        if (lastResponse) {
            await i.reply(
                `Your latest recorded response was submitted on ${format(
                    utcToZonedTime(parseISO(lastResponse[0]), "America/New_York"),
                    "MMMM do, u 'at' h:mmaaa 'ET",
                )} as \`${options[lastResponse[4]]}\`.`,
            );
        } else {
            await i.reply("Received no response.");
        }
        return;
    }

    if (compareAsc(new Date(), zonedTimeToUtc("2023-08-14T00:00:00.000", "America/New_York")) > 0) {
        await i.reply("The intent form is closed and responses can no longer be submitted.");
        return;
    }

    const dbRes = await pg.query<{id: number; mleid: number; name: string; discord_id: string}>(
        `SELECT p.id, p.mleid, p.name, p.discord_id FROM mledb.player p WHERE p.discord_id=$1`,
        [i.user.id],
    );

    if (dbRes.rowCount !== 1) {
        await i.reply("You are not a player in MLE.");
        return;
    }

    const [player] = dbRes.rows;

    await sheets.spreadsheets.values.append({
        spreadsheetId: "1IqdwyiCy5YdAqkZpe_jf_P5MxGDl-DR-NaqHJZjjhtM",
        range: "RESPONSES",
        valueInputOption: "RAW",
        requestBody: {
            values: [[new Date().toISOString(), player.mleid, player.discord_id, player.name, i.customId]],
        },
    });

    await i.reply(
        `Successfully recorded your response of \`${options[i.customId]}\` on ${format(
            utcToZonedTime(new Date(), "America/New_York"),
            "MMMM do, u 'at' h:mmaaa 'ET",
        )}`,
    );

    console.log(
        `${player.name} submitted response ${options[i.customId]} on ${format(
            utcToZonedTime(new Date(), "America/New_York"),
            "MMMM do, u 'at' h:mmaaa 'ET",
        )}`,
    );
});

client.on(Events.MessageCreate, async m => {
    if (m.author.bot || m.author.id !== "105408136285818880") return;

    if (m.content === "bb.a") {
        const dbRes = await pg.query<{id: number; mleid: number; name: string; discord_id: string; team_name: string}>(
            `SELECT p.id, p.mleid, p.name, p.discord_id, p.team_name FROM mledb.player p WHERE p.team_name != 'FP'`,
        );

        const mle = await client.guilds.fetch("1108555487160569918");
        await mle.members.fetch();

        const join = dbRes.rows.filter(r => mle.members.cache.has(r.discord_id));

        const allResponses = await sheets.spreadsheets.values.get({
            spreadsheetId: "1IqdwyiCy5YdAqkZpe_jf_P5MxGDl-DR-NaqHJZjjhtM",
            range: "RESPONSES!$A$2:$E",
        });

        const unsubmitted = join.filter(j => !allResponses.data.values?.find(v => v[2] === j.discord_id));

        console.log(unsubmitted);
    } else if (m.content.startsWith("bb.if")) {
        // const dbRes = await pg.query<{id: number; mleid: number; name: string; discord_id: string}>(
        //     // Hyper, Hoos, TyTy, Olivia, Lack, DK
        //     //`SELECT p.id, p.mleid, p.name, p.discord_id FROM mledb.player p WHERE p.discord_id IN ('105408136285818880', '423850557334093827', '112746307877117952', '222809044103069696', '256991987163463680', '231963249350934528')`,
        //     `SELECT p.id, p.mleid, p.name, p.discord_id FROM mledb.player p WHERE p.discord_id IN ('105408136285818880')`,
        // );

        const dbRes = await pg.query<{id: number; mleid: number; name: string; discord_id: string; team_name: string}>(
            `SELECT p.id, p.mleid, p.name, p.discord_id, p.team_name FROM mledb.player p WHERE p.team_name != 'FP'`,
        );

        console.log(`Sending Intent Form to ${dbRes.rows.length} players`);

        for (const row of dbRes.rows) {
            const user = await client.users.fetch(row.discord_id);
            console.log(`Sending Intent Form to ${user.username}`);

            await user.send({
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
                            "This will allow your franchise to retain you for Season 16. This does not guarantee that you are retained. If you select this option and you are not retained, you will become a Free Agent and you will be eligible for the draft. If you are franchise staff and want to continue to be franchise staff, you must be retention eligible even if you intend to be non-playing staff.",
                            "",
                            "**Release to FA** - I would like to enter Free Agency for Season 16.",
                            "Whether you are currently on a roster, or currently a Free Agent, you will become a Free Agent for Season 16. You will be eligible for the draft.",
                            "",
                            "**Former Player** - I would not like to play in Season 16.",
                            "You will become a Former Player, exiting the Free Agent pool, but remaining in the community. You may later apply for Free Agency if you change your mind, but you may receive Restricted Free Agent status.",
                            "",
                            "You have until **08/14/23** to submit your intent.",
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
                            {
                                type: ComponentType.Button,
                                customId: RetentionOption.LASTRESPONSE,
                                style: ButtonStyle.Secondary,
                                label: "Get Last Response",
                            },
                        ],
                    },
                ],
            });
        }
    } else if (m.content === "bb.resp") {
        const allResponses = await sheets.spreadsheets.values.get({
            spreadsheetId: "1IqdwyiCy5YdAqkZpe_jf_P5MxGDl-DR-NaqHJZjjhtM",
            range: "RESPONSES!$A$2:$E",
        });

        const userResponses = allResponses.data.values
            ?.filter(d => d[2] === "105408136285818880")
            .sort((a, b) => compareAsc(parseISO(a[0]), parseISO(b[0])));

        const lastResponse = userResponses ? userResponses[userResponses.length - 1] : undefined;

        console.log(userResponses, lastResponse);

        if (lastResponse) {
            await m.reply(`Last response: ${options[lastResponse[4]]}`);
        } else {
            await m.reply("No response");
        }
    }
});
