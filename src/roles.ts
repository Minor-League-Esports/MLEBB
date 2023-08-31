export const roles = {
    Aviators: "Aviators",
    Bears: "Bears",
    Blizzard: "Blizzard",
    Bulls: "Bulls",
    Comets: "Comets",
    Demolition: "Demolition",
    Dodgers: "Dodgers",
    Ducks: "Ducks",
    Eclipse: "Eclipse",
    Elite: "Elite",
    Express: "Express",
    Flames: "Flames",
    Foxes: "Foxes",
    Hawks: "Hawks",
    Hive: "Hive",
    Hurricanes: "Hurricanes",
    Jets: "Jets",
    Knights: "Knights",
    Lightning: "Lightning",
    Outlaws: "Outlaws",
    Pandas: "Pandas",
    Pirates: "Pirates",
    Puffins: "Puffins",
    Rhinos: "Rhinos",
    Sabres: "Sabres",
    Shadow: "Shadow",
    Sharks: "Sharks",
    Spartans: "Spartans",
    Spectre: "Spectre",
    Tyrants: "Tyrants",
    Waivers: "Waivers",
    Wizards: "Wizards",
    Wolves: "Wolves",
    FA: "Free Agent",
    FP: "Former Player",
    Pend: "Pending FA",
    FOUNDATION: "Foundation League",
    ACADEMY: "Academy League",
    CHAMPION: "Champion League",
    MASTER: "Master League",
    PREMIER: "Premier League",
    FM: "Franchise Manager",
    GM: "General Manager",
    AGM: "Assistant General Manager",
    PR: "PR Support",
    CAPTAIN: "Captain",
    RL: "Rocket League",
    // CM: "Community Members",
};

export function exclude(withoutRoles: string[]): string[] {
    return Object.keys(roles).filter(r => !withoutRoles.includes(r))
        .map(r => roles[r] as string);
}

export function include(withRoles: string[]): string[] {
    return Object.keys(roles).filter(r => withRoles.includes(r))
        .map(r => roles[r] as string);
}
