import {ButtonStyle, Client, ComponentType, Events, GatewayIntentBits} from "discord.js";
import {config} from "dotenv";

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

client.login(process.env.TOKEN);

client.on(Events.ClientReady, () => {
    console.log(`Connected to ${client.user?.username}`);
});

client.on(Events.MessageCreate, async m => {
    if (m.author.bot || m.author.id !== "105408136285818880") return;

    if (m.content.startsWith("bb.intent")) {
        await m.channel.send({
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
                            customId: "OPTION1",
                            style: ButtonStyle.Success,
                            label: "Retention Eligible",
                        },
                        {
                            type: ComponentType.Button,
                            customId: "OPTION2",
                            style: ButtonStyle.Primary,
                            label: "Release to FA",
                        },
                        {
                            type: ComponentType.Button,
                            customId: "OPTION3",
                            style: ButtonStyle.Danger,
                            label: "Former Player",
                        },
                    ],
                },
            ],
        });
    } else if (m.content.startsWith("bb.st")) {
        const res = await sheets.spreadsheets.values.append({
            spreadsheetId: "1IqdwyiCy5YdAqkZpe_jf_P5MxGDl-DR-NaqHJZjjhtM",
            range: "Raw!$A$1",
        });
    }
});
