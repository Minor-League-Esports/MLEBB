import {config} from "dotenv";

config();

import {compareAsc, format, parseISO} from "date-fns";
import {utcToZonedTime, zonedTimeToUtc} from "date-fns-tz";
import {AttachmentBuilder, ButtonStyle, ComponentType, Events} from "discord.js";

import {discordClient, pgClient} from "./clients";
import type {EpicProfile} from "./epic";
import {bcToXboxId, EpicService, xboxIdToBC} from "./epic";
import {sheets} from "./google";
import {exclude, include} from "./roles";
import {RetentionOption, retentionOptions} from "./types";

const ADMIN_IDS = [
    "105408136285818880",
    "458513869384450070",
    "256991987163463680",
    "765878889150283776",
    "165656556568838144",
];

discordClient
    .login(process.env.TOKEN)
    .then(() => console.log("Client logged in"))
    .catch(err => console.error(err));

discordClient.on(Events.Error, e => console.error(e));

discordClient.on(Events.ClientReady, () => {
    console.log(`Connected to ${discordClient.user?.username}`);
});

discordClient.on(Events.InteractionCreate, async i => {
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
            await i.reply({
                content: `Your latest recorded response was submitted on ${format(
                    utcToZonedTime(parseISO(lastResponse[0]), "America/New_York"),
                    "MMMM do, u 'at' h:mmaaa 'ET",
                )} as \`${retentionOptions[lastResponse[4]]}\`.`,
                ephemeral: true,
            });
        } else {
            await i.reply({
                content: "Received no response.",
                ephemeral: true,
            });
        }
        return;
    }

    if (!([RetentionOption.FA, RetentionOption.FP, RetentionOption.RETAINABLE] as string[]).includes(i.customId))
        return;

    if (compareAsc(new Date(), zonedTimeToUtc("2023-08-14T00:00:00.000", "America/New_York")) > 0) {
        await i.reply({
            content: "The intent form is closed and responses can no longer be submitted.",
            ephemeral: true,
        });
        return;
    }

    const player = await pgClient.oneOrNone<{
        id: number;
        mleid: number;
        name: string;
        discord_id: string;
        team_name: string;
    }>(`SELECT p.id, p.mleid, p.name, p.discord_id, p.team_name FROM mledb.player p WHERE p.discord_id=$1`, [
        i.user.id,
    ]);

    if (!player) {
        await i.reply({
            content: "You are not a player in MLE.",
            ephemeral: true,
        });
        return;
    }

    if (player.team_name === "FP") {
        await i.reply({
            content: "Former players cannot submit an intent form.",
            ephemeral: true,
        });
        return;
    }

    await sheets.spreadsheets.values.append({
        spreadsheetId: "1IqdwyiCy5YdAqkZpe_jf_P5MxGDl-DR-NaqHJZjjhtM",
        range: "RESPONSES",
        valueInputOption: "RAW",
        requestBody: {
            values: [[new Date().toISOString(), player.mleid, player.discord_id, player.name, i.customId]],
        },
    });

    await i.reply({
        content: `Successfully recorded your response of \`${retentionOptions[i.customId]}\` on ${format(
            utcToZonedTime(new Date(), "America/New_York"),
            "MMMM do, u 'at' h:mmaaa 'ET",
        )}`,
        ephemeral: true,
    });

    console.log(
        `${player.name} submitted response ${retentionOptions[i.customId]} on ${format(
            utcToZonedTime(new Date(), "America/New_York"),
            "MMMM do, u 'at' h:mmaaa 'ET",
        )}`,
    );

    try {
        const mle = await discordClient.guilds.fetch("172404472637685760");
        const member = await mle.members.fetch(i.user.id);

        if (member.roles.cache.has("1134276194678878228")) {
            await member.roles.remove("1134276194678878228");
        }
    } catch (e) {
        console.error(e);
    }
});

discordClient.on(Events.MessageCreate, async m => {
    if (m.author.bot || m.channel.isDMBased()) return;

    // Ungated health check - no DB/permission gate, confirms the bot is receiving and responding to messages.
    if (m.content === "bb.ping") {
        await m.reply("pong");
        return;
    }

    // Ungated command list - no DB/permission gate, so any user can see what's available.
    if (m.content === "bb.help") {
        await m.reply({
            embeds: [
                {
                    color: 0xeec707,
                    title: "MLEBB Commands",
                    description: [
                        "`bb.ping` - health check, replies \"pong\". No permissions required.",
                        "`bb.help` - shows this list. No permissions required.",
                        "`bb.list` - reports role/nickname changes that would be made, without applying them. Admin/leadership role required.",
                        "`bb.fix` - same as `bb.list`, but actually applies the role/nickname changes. Admin/leadership role required.",
                        "`bb.lookup <tracker or ballchasing URL>` - resolves a player's linked platform accounts. Admin/leadership role required.",
                        "`bb.if` - DMs the season intent form to every active player in the database. Bot owner only.",
                        "`bb.nif` - posts the season intent form to the configured channel. Bot owner only.",
                    ].join("\n"),
                },
            ],
        });
        return;
    }

    if (m.guild?.id !== "729343895720165377" && !ADMIN_IDS.includes(m.author.id)) return;

    if (
        (m.guild?.id === "729343895720165377" &&
            !ADMIN_IDS.includes(m.author.id) &&
            m.member?.roles.cache.has("880757580622884864")) ||
        ADMIN_IDS.includes(m.author.id)
    ) {
        if (m.content === "bb.fix" || m.content === "bb.list") {
            const server = await discordClient.guilds.fetch("172404472637685760");
            await server.members.fetch();

            await m.react("<a:loading:827379552392577024>");

            const doFix = m.content === "bb.fix";
            console.log(`Fixing: ${doFix}`);

            let totalAdds = 0;
            let totalRemoves = 0;

            const outputLines: string[] = [];
            const record = (msg: string) => {
                console.log(msg);
                outputLines.push(msg);
            };

            const players = await pgClient.manyOrNone<{
                id: number;
                name: string;
                team_name: string;
                discord_id: string;
                league: string;
                callsign: string;
                isFM: boolean;
                isGM: boolean;
                isAGM: boolean;
                isPR: boolean;
                isCaptain: boolean;
            }>(`
            SELECT p.id,
                p.name,
                p.team_name,
                p.discord_id,
                p.league,
                t.callsign,
                EXISTS(SELECT * FROM mledb.team t WHERE t.franchise_manager_id = p.id)     AS "isFM",
                EXISTS(SELECT * FROM mledb.team t WHERE t.general_manager_id = p.id)       AS "isGM",
                EXISTS(SELECT *
                    FROM mledb.team t
                    WHERE t.doubles_assistant_general_manager_id = p.id
                        OR t.standard_assistant_general_manager_id = p.id)               AS "isAGM",
                EXISTS(SELECT * FROM mledb.team t WHERE t.pr_support_id = p.id)            AS "isPR",
                EXISTS(SELECT * FROM mledb.team_to_captain ttc WHERE ttc.player_id = p.id) AS "isCaptain"
            FROM mledb.player p
                INNER JOIN mledb.team t ON p.team_name = t.name
        `);

            for (const member of server.members.cache.values()) {
                try {
                    if (member.user.bot || ["718781325883998209", "660842332844982283"].includes(member.id)) continue;

                    const db = players.find(r => r.discord_id === member.id);
                    const roles = Array.from(member.roles.cache.values()).map(r => r.name);
                    const shouldHave: string[] = [];

                    if (db) {
                        shouldHave.push("RL");

                        if (db.team_name === "FP") shouldHave.push("FP");
                        else {
                            shouldHave.push(db.team_name, db.league);
                            if (db.isFM) shouldHave.push("FM");
                            if (db.isGM) shouldHave.push("GM");
                            if (db.isAGM) shouldHave.push("AGM");
                            if (db.isPR) shouldHave.push("PR");
                            if (db.isCaptain) shouldHave.push("CAPTAIN");
                        }

                        if (db.team_name !== "FP") {
                            if (
                                !roles.includes("Leadership") &&
                                !roles.includes("Board") &&
                                !roles.includes("Director")
                            ) {
                                const match = member.displayName.match(
                                    // eslint-disable-next-line no-misleading-character-class
                                    /(^\w+\s\|\s[\w\s.\-_!+'?^:/\][;()<>,|óñ†™]+)(\s[❤️🖤💙🤎💚🧡💜🤍💛]*)?$/u,
                                );
                                if (!member.nickname) {
                                    record(`\`${member.displayName}\` should be \`${db.callsign} | ${db.name}`);
                                    if (doFix)
                                        await member
                                            .setNickname(`${db.callsign} | ${db.name}`)
                                            .catch(() => console.error(`Nickname change failed for ${db.name}`));
                                } else if (match) {
                                    const [, nickname, hearts] = match;

                                    if (nickname !== `${db.callsign} | ${db.name}`) {
                                        record(
                                            `\`${member.nickname}\` should be \`${db.callsign} | ${db.name}${
                                                hearts ? hearts : ""
                                            }\``,
                                        );
                                        if (doFix)
                                            await member
                                                .setNickname(`${db.callsign} | ${db.name}${hearts ? hearts : ""}`)
                                                .catch(() => console.error(`Nickname change failed for ${db.name}`));
                                    }
                                } else {
                                    const sMatch = member.displayName.match(
                                        // eslint-disable-next-line no-misleading-character-class
                                        /^([\w\s.\-_!+'?^:/\][;()<>,|óñ†™]+)(\s[❤️🖤💙🤎💚🧡💜🤍💛]*)?$/u,
                                    );
                                    if (sMatch) {
                                        const [, nickname, hearts] = sMatch;

                                        if (nickname !== `${db.callsign} | ${db.name}`) {
                                            record(
                                                `\`${member.nickname}\` should be \`${db.callsign} | ${db.name}${
                                                    hearts ? hearts : ""
                                                }\``,
                                            );
                                            if (doFix)
                                                await member
                                                    .setNickname(`${db.callsign} | ${db.name}${hearts ? hearts : ""}`)
                                                    .catch(() =>
                                                        console.error(`Nickname change failed for ${db.name}`),
                                                    );
                                        }
                                    } else {
                                        console.error(`Failed to match with ${db.name} (${member.displayName}) 2`);
                                    }
                                }
                            }
                        } else {
                            const match = member.displayName.match(
                                // eslint-disable-next-line no-misleading-character-class
                                /^([\w\s.\-_!+'?^:/\][;()<>,|óñ†™]+)(\s[❤️🖤💙🤎💚🧡💜🤍💛]*)?$/u,
                            );
                            if (match) {
                                const [, nickname, hearts] = match;

                                if (nickname !== db.name) {
                                    record(
                                        `\`${member.displayName}\` (${nickname}) should be \`${db.name}${
                                            hearts ? hearts : ""
                                        }\``,
                                    );
                                    if (doFix)
                                        await member
                                            .setNickname(`${db.name}${hearts ? hearts : ""}`)
                                            .catch(() => console.error(`Nickname change failed for ${db.name}`));
                                }
                            } else {
                                console.error(`Failed to match with ${db.name} (${member.displayName}) 3`);
                            }
                        }
                    } else {
                        // if (member.nickname) console.log(`${member.displayName} should be ${member.user.username}`);
                        shouldHave.push("CM");
                    }

                    const have = include(shouldHave);
                    const nothave = exclude(shouldHave).filter(r => roles.includes(r));

                    const toAdd = have.filter(r => !roles.includes(r));
                    const toRemove = nothave;

                    if (!toAdd.length && !toRemove.length) continue;

                    totalAdds += toAdd.length;
                    totalRemoves += toRemove.length;

                    let line = `${db?.name ?? member.displayName} (${member.id})`;
                    if (toAdd.length) line += `\t||\tADD: ${toAdd.join(", ")}`;
                    if (toRemove.length) line += `\t||\tREMOVE: ${toRemove.join(", ")}`;
                    record(line);

                    if (doFix) {
                        if (toAdd.length) {
                            const toAddRoles = toAdd.map(r => server.roles.cache.find(sr => sr.name === r)!);
                            await member.roles.add(toAddRoles);
                        }

                        if (toRemove.length) {
                            const toRemoveRoles = toRemove.map(r => server.roles.cache.find(sr => sr.name === r)!);
                            await member.roles.remove(toRemoveRoles);
                        }
                    }
                } catch (err) {
                    console.error(err);
                }
            }
            record(`\nTotal roles to add: ${totalAdds}`);
            record(`Total roles to remove: ${totalRemoves}`);

            const attachment = new AttachmentBuilder(
                Buffer.from(outputLines.length ? outputLines.join("\n") : "No changes needed.", "utf-8"),
                {name: `${doFix ? "bb-fix" : "bb-list"}-${Date.now()}.txt`},
            );

            await m.reply({
                content: `${doFix ? "Applied" : "Would apply"} ${totalAdds} role add(s) and ${totalRemoves} role remove(s). Full diff attached.`,
                files: [attachment],
            });

            await m.react("✅");
        } else if (m.content.startsWith("bb.lookup")) {
            const [, trackerOrBCUrl] = m.content.split("bb.lookup ");
            const trackerMatch = trackerOrBCUrl.match(
                /https:\/\/rocketleague\.tracker\.network\/rocket-league\/profile\/(\w+)\/([^/?]+).*/,
            );
            const bcMatch = trackerOrBCUrl.match(/https:\/\/ballchasing\.com\/player\/(.+)\/([^/?]+)/);

            if (!trackerMatch && !bcMatch) {
                await m.reply("Invalid tracker");
                return;
            }

            if (trackerMatch) {
                const [, platform, platformId] = trackerMatch;
                let epicProfile: EpicProfile | null;

                if (platform === "epic") {
                    epicProfile = await EpicService.getProfile({displayName: decodeURI(platformId)});
                } else if (platform === "steam") {
                    epicProfile = await EpicService.getProfile({
                        identityProviderId: "steam",
                        externalAccountId: platformId,
                    });
                } else {
                    await m.reply("Cannot lookup tracker for this platform");
                    return;
                }

                if (!epicProfile) {
                    await m.reply("Could not find epic profile from tracker");
                    return;
                }

                await m.reply(
                    `${epicProfile.displayName} (${epicProfile.accountId})${
                        epicProfile.linkedAccounts.length
                            ? `\n${epicProfile.linkedAccounts
                                  .map(
                                      p =>
                                          `${p.identityProviderId}: ${p.displayName ?? "No Display Name"} (${
                                              p.identityProviderId === "xbl"
                                                  ? `bc: ${xboxIdToBC(p.accountId)} | id: ${p.accountId}`
                                                  : p.accountId
                                          })`,
                                  )
                                  .join("\n")}`
                            : ""
                    }`,
                );
            } else if (bcMatch) {
                const [, platform, platformId] = bcMatch;
                let epicProfile: EpicProfile | null;

                if (platform === "epic") {
                    epicProfile = await EpicService.getProfile({accountId: platformId});
                } else if (platform === "steam") {
                    epicProfile = await EpicService.getProfile({
                        identityProviderId: "steam",
                        externalAccountId: platformId,
                    });
                } else if (platform === "xbox") {
                    epicProfile = await EpicService.getProfile({
                        identityProviderId: "xbl",
                        externalAccountId: bcToXboxId(platformId),
                    });
                } else {
                    await m.reply("Cannot lookup tracker for this platform");
                    return;
                }

                if (!epicProfile) {
                    await m.reply("Could not find epic profile from tracker");
                    return;
                }

                await m.reply(
                    `${epicProfile.displayName} (${epicProfile.accountId})${
                        epicProfile.linkedAccounts.length
                            ? `\n${epicProfile.linkedAccounts
                                  .map(
                                      p =>
                                          `${p.identityProviderId}: ${p.displayName ?? "No Display Name"} (${
                                              p.identityProviderId === "xbl"
                                                  ? `bc: ${xboxIdToBC(p.accountId)} | id: ${p.accountId}`
                                                  : p.accountId
                                          })`,
                                  )
                                  .join("\n")}`
                            : ""
                    }`,
                );
            }
        } else if (m.content.startsWith("bb.if")) {
            if (!ADMIN_IDS.includes(m.author.id)) return;

            // const dbRes = await pg.query<{id: number; mleid: number; name: string; discord_id: string}>(
            //     // Hyper, Hoos, TyTy, Olivia, Lack, DK
            //     //`SELECT p.id, p.mleid, p.name, p.discord_id FROM mledb.player p WHERE p.discord_id IN ('105408136285818880', '423850557334093827', '112746307877117952', '222809044103069696', '256991987163463680', '231963249350934528')`,
            //     `SELECT p.id, p.mleid, p.name, p.discord_id FROM mledb.player p WHERE p.discord_id IN ('105408136285818880')`,
            // );

            const players = await pgClient.manyOrNone<{
                id: number;
                mleid: number;
                name: string;
                discord_id: string;
                team_name: string;
            }>(
                `SELECT p.id, p.mleid, p.name, p.discord_id, p.team_name FROM mledb.player p WHERE p.team_name != 'FP' AND p.league != 'UNKNOWN' AND p.discord_id IS NOT NULL AND p.discord_id != ''`,
            );

            console.log(`Sending Intent Form to ${players.length} players`);

            for (const row of players) {
                try {
                    const user = await discordClient.users.fetch(row.discord_id);

                    if (user.dmChannel?.lastMessage?.author.id === "1108218757853233273") continue;

                    await user
                        .send({
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
                        })
                        .catch(e => console.error(`Error when sending intent form to ${user.username}`, e));
                } catch (e) {
                    console.error(e);
                }
            }
        } else if (m.content === "bb.nif") {
            if (!ADMIN_IDS.includes(m.author.id)) return;

            try {
                const channel = await discordClient.channels.fetch("652687231974375426");
                if (!channel || !channel.isTextBased()) return;

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
            } catch {
                await m.reply("Failed to send intent form");
            }
        }
    }
});
